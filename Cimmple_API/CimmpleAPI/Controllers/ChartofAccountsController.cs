using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using CimmpleAPI.Data;
using CimmpleAPI.Data.Models;
using CimmpleAPI.Data.Dtos;
using System;
using System.Linq;
using System.Collections.Generic;
using System.Reflection;
using System.Text.RegularExpressions;
using CimmpleAPI.Services;
using Microsoft.EntityFrameworkCore;

namespace CimmpleAPI.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class ChartofAccountsController : ApiBaseController
    {
        private readonly CimmpleDbContext _context;
        private readonly ILogger<ChartofAccountsController> _logger;

        private static readonly (PropertyInfo Property, string Label)[] DefaultAccountFields = typeof(AccountingDefaults)
            .GetProperties()
            .Where(p => p.PropertyType == typeof(int?) && p.Name.StartsWith("Default") && p.Name.EndsWith("AccountId"))
            .Select(p => (p, "Default " + Regex.Replace(p.Name["Default".Length..^"AccountId".Length], "(?<!^)([A-Z])", " $1")))
            .ToArray();

        public ChartofAccountsController(CimmpleDbContext context, ILogger<ChartofAccountsController> logger)
        {
            _context = context;
            _logger = logger;
        }

        private IActionResult ServerError(Exception ex, string action)
        {
            _logger.LogError(ex, "Chart of Accounts {Action} failed", action);
            return StatusCode(500, new { error = "An unexpected error occurred. Please try again." });
        }

        /// <summary>Serializes logical group id generation per tenant (ids are max + 1, not identity).</summary>
        private void LockGroupIds(string kind, int tenantId)
        {
            var resource = $"coa-{kind}-{tenantId}";
            _context.Database.ExecuteSqlInterpolated($"DECLARE @r int; EXEC @r = sp_getapplock @Resource = {resource}, @LockMode = 'Exclusive', @LockOwner = 'Transaction', @LockTimeout = 15000; IF @r < 0 THROW 50000, 'Could not lock group id generation', 1;");
        }

        /// <summary>Settings that point at the account: Accounting Setup defaults, banks, credit cards, vendor mappings.</summary>
        private List<BlockingDependency> GetConfiguredUses(ChartofAccounts account, int tenantId)
        {
            var uses = new List<BlockingDependency>();
            var accountId = account.AccountID;
            var code = (account.AccountCode ?? "").Trim();

            var defaultLabels = _context.AccountingDefaults.AsNoTracking()
                .Where(d => d.TenantId == tenantId)
                .ToList()
                .SelectMany(d => DefaultAccountFields.Where(f => (int?)f.Property.GetValue(d) == accountId).Select(f => f.Label))
                .Distinct()
                .ToList();
            if (defaultLabels.Any())
            {
                uses.Add(new BlockingDependency
                {
                    EntityType = "Accounting Setup",
                    Description = $"This account is set as {string.Join(", ", defaultLabels)} in Accounting Setup",
                    Items = defaultLabels.Select((label, i) => new DependencyItem { Id = i + 1, Name = label }).ToList()
                });
            }

            if (code.Length > 0)
            {
                var banks = _context.BankMaster.AsNoTracking()
                    .Where(b => b.TenantId == tenantId && b.coa != null && b.coa.Trim() == code)
                    .Select(b => new { b.Id, b.BankName })
                    .ToList();
                if (banks.Any())
                {
                    uses.Add(new BlockingDependency
                    {
                        EntityType = "Banks",
                        Description = $"This account code is used by {banks.Count} bank(s). Change the account in Bank Master first.",
                        Items = banks.Take(10).Select(b => new DependencyItem { Id = b.Id, Name = b.BankName ?? $"Bank #{b.Id}" }).ToList()
                    });
                }

                var cards = _context.CreditCardMaster.AsNoTracking()
                    .Where(c => c.TenantId == tenantId && c.COA != null && c.COA.Trim() == code)
                    .Select(c => new { c.Id, c.NickName })
                    .ToList();
                if (cards.Any())
                {
                    uses.Add(new BlockingDependency
                    {
                        EntityType = "Credit Cards",
                        Description = $"This account code is used by {cards.Count} credit card(s). Change the account in Credit Card Master first.",
                        Items = cards.Take(10).Select(c => new DependencyItem { Id = c.Id, Name = string.IsNullOrEmpty(c.NickName) ? $"Credit Card #{c.Id}" : c.NickName }).ToList()
                    });
                }
            }

            var vendorMappings = _context.VendorCOAMapping.AsNoTracking()
                .Where(m => m.accountid == accountId || m.expenseAccountId == accountId)
                .Join(_context.VendorMaster.Where(v => v.Tenantid == tenantId), m => m.vendorid, v => v.vendor_id, (m, v) => new { v.vendor_id, v.company_name })
                .Distinct()
                .ToList();
            if (vendorMappings.Any())
            {
                uses.Add(new BlockingDependency
                {
                    EntityType = "Vendor Account Mappings",
                    Description = $"This account is the AP or default expense account of {vendorMappings.Count} vendor(s). Change it in Vendor Master first.",
                    Items = vendorMappings.Take(10).Select(v => new DependencyItem { Id = v.vendor_id, Name = string.IsNullOrEmpty(v.company_name) ? $"Vendor #{v.vendor_id}" : v.company_name }).ToList()
                });
            }

            return uses;
        }

        /// <summary>Posted activity on the account: journal lines, deposits, withdrawals, transactions, transfers, vendor bill lines.</summary>
        private List<BlockingDependency> GetPostings(int accountId, int tenantId)
        {
            var postings = new List<BlockingDependency>();

            var journalIds = _context.JournalEntryFrom.Where(j => j.AccountId == accountId).Select(j => j.JournalEntryId)
                .Union(_context.JournalEntryTo.Where(j => j.AccountId == accountId).Select(j => j.JournalEntryId))
                .Join(_context.JournalEntries.Where(je => je.TenantId == tenantId), id => id, je => je.Id, (id, je) => je.Id)
                .Distinct()
                .ToList();
            if (journalIds.Any())
            {
                postings.Add(new BlockingDependency
                {
                    EntityType = "Journal Entries",
                    Description = $"This account is used in {journalIds.Count} journal entry/entries",
                    Items = journalIds.Take(10).Select(id => new DependencyItem
                    {
                        Id = id,
                        Name = $"Journal Entry #{id}",
                        DeleteEndpoint = $"/api/Accounting/DeleteJournalEntry?journalEntryId={id}"
                    }).ToList()
                });
            }

            // Deposits and withdrawals are lines of a bank transaction; removing them means removing that transaction.
            var deposits = _context.Deposits.AsNoTracking()
                .Where(d => d.AccountID == accountId && d.TenantID == tenantId)
                .Select(d => new { d.DepositID, d.TransactionID })
                .ToList();
            if (deposits.Any())
            {
                postings.Add(new BlockingDependency
                {
                    EntityType = "Deposits",
                    Description = $"This account is used in {deposits.Count} deposit(s)",
                    Items = deposits.Take(10).Select(d => new DependencyItem
                    {
                        Id = d.TransactionID,
                        Name = $"Deposit #{d.DepositID} (Transaction #{d.TransactionID})",
                        DeleteEndpoint = $"/api/Accounting/DeleteTransaction?transactionId={d.TransactionID}"
                    }).ToList()
                });
            }

            var withdrawals = _context.Withdrawals.AsNoTracking()
                .Where(w => w.AccountID == accountId && w.TenantID == tenantId)
                .Select(w => new { w.WithdrawalID, w.TransactionID })
                .ToList();
            if (withdrawals.Any())
            {
                postings.Add(new BlockingDependency
                {
                    EntityType = "Withdrawals",
                    Description = $"This account is used in {withdrawals.Count} withdrawal(s)",
                    Items = withdrawals.Take(10).Select(w => new DependencyItem
                    {
                        Id = w.TransactionID,
                        Name = $"Withdrawal #{w.WithdrawalID} (Transaction #{w.TransactionID})",
                        DeleteEndpoint = $"/api/Accounting/DeleteTransaction?transactionId={w.TransactionID}"
                    }).ToList()
                });
            }

            var transIds = _context.TransCoa.AsNoTracking()
                .Where(tc => tc.accountid == accountId && tc.Tenantid == tenantId)
                .Select(tc => tc.Transid)
                .Distinct()
                .ToList();
            if (transIds.Any())
            {
                postings.Add(new BlockingDependency
                {
                    EntityType = "Transactions",
                    Description = $"This account is linked to {transIds.Count} transaction(s)",
                    Items = transIds.Take(10).Select(id => new DependencyItem
                    {
                        Id = id,
                        Name = $"Transaction #{id}",
                        DeleteEndpoint = $"/api/Accounting/DeleteTransaction?transactionId={id}"
                    }).ToList()
                });
            }

            var transfers = _context.TransferEntries.AsNoTracking()
                .Where(t => t.TenantID == tenantId && (t.SourceAccountID == accountId || t.accountidfrom == accountId || t.accountidto == accountId))
                .Select(t => t.TransferID)
                .ToList();
            if (transfers.Any())
            {
                postings.Add(new BlockingDependency
                {
                    EntityType = "Transfers",
                    Description = $"This account is used in {transfers.Count} transfer(s)",
                    Items = transfers.Take(10).Select(id => new DependencyItem { Id = id, Name = $"Transfer #{id}" }).ToList()
                });
            }

            var vendorInvoices = _context.VendorInvoiceDetail.AsNoTracking()
                .Where(d => d.accountid == accountId)
                .Join(_context.VendorInvoiceMaster.Where(m => m.TenantId == tenantId), d => d.InvoiceId, m => m.Id, (d, m) => new { m.Id, m.InvoiceNo })
                .Distinct()
                .ToList();
            if (vendorInvoices.Any())
            {
                postings.Add(new BlockingDependency
                {
                    EntityType = "Vendor Invoices",
                    Description = $"This account is used on lines of {vendorInvoices.Count} vendor invoice(s)",
                    Items = vendorInvoices.Take(10).Select(v => new DependencyItem
                    {
                        Id = v.Id,
                        Name = string.IsNullOrEmpty(v.InvoiceNo) ? $"Vendor Invoice #{v.Id}" : $"Vendor Invoice {v.InvoiceNo}",
                        DeleteEndpoint = $"/api/VendorInvoice/DeleteVendorInvoice?vendorInvoiceId={v.Id}"
                    }).ToList()
                });
            }

            return postings;
        }

        private List<BlockingDependency> GetDeleteBlockers(ChartofAccounts account, int tenantId)
        {
            AccountingGapSchemaService.EnsureAsync(_context).GetAwaiter().GetResult();
            return GetPostings(account.AccountID, tenantId).Concat(GetConfiguredUses(account, tenantId)).ToList();
        }

        private string? ValidateHierarchy(ChartofAccountReq request)
        {
            var tenantId = request.Tenantid;
            if (request.Groupid.HasValue && !_context.MainGroup.Any(m => m.tenantid == tenantId && m.MainGroupID == request.Groupid.Value))
                return "The selected Main Group was not found";
            if (request.Subgroupid.HasValue &&
                (!request.Groupid.HasValue || !_context.SubGroup.Any(s => s.tenantid == tenantId && s.SubGroupID == request.Subgroupid.Value && s.MainGroupID == request.Groupid.Value)))
                return "Subgroup 1 does not belong to the selected Main Group";
            if (request.Subgroupid2.HasValue &&
                (!request.Subgroupid.HasValue || !_context.SubGroup2.Any(s => s.tenantid == tenantId && s.SubGroup2ID == request.Subgroupid2.Value && s.SubGroupID == request.Subgroupid.Value)))
                return "Subgroup 2 does not belong to the selected Subgroup 1";
            if (request.Subgroupid3.HasValue &&
                (!request.Subgroupid2.HasValue || !_context.SubGroup3.Any(s => s.tenantid == tenantId && s.SubGroup3ID == request.Subgroupid3.Value && s.SubGroup2ID == request.Subgroupid2.Value)))
                return "Subgroup 3 does not belong to the selected Subgroup 2";
            return null;
        }

        [HttpGet("GetChartofAccounts")]
        public IActionResult GetChartofAccounts([FromQuery] int tenantid)
        {
            try
            {
                var accounts = _context.ChartofAccounts
                    .Where(a => a.Tenantid == tenantid)
                    .Select(a => new
                    {
                        accountID = a.AccountID,
                        accountCode = a.AccountCode ?? "",
                        accountName = a.AccountName ?? "",
                        accountType = a.AccountType ?? "",
                        isActive = a.IsActive,
                        status = a.IsActive ? "Active" : "Inactive",
                        mainGroup = a.MainGroup ?? ""
                    })
                    .OrderBy(a => a.accountCode)
                    .ToList();

                return Ok(new { result = accounts });
            }
            catch (Exception ex)
            {
                return ServerError(ex, "chart of accounts request");
            }
        }

        [HttpGet("GetChartofAccountById")]
        public IActionResult GetChartofAccountById([FromQuery] int accountId, [FromQuery] int tenantId)
        {
            try
            {
                var account = _context.ChartofAccounts
                    .Where(a => a.AccountID == accountId && a.Tenantid == tenantId)
                    .FirstOrDefault();

                if (account == null)
                {
                    return NotFound(new { error = "Chart of Account not found" });
                }

                var result = new
                {
                    accountID = account.AccountID,
                    accountCode = account.AccountCode ?? "",
                    accountName = account.AccountName ?? "",
                    accountType = account.AccountType ?? "",
                    isActive = account.IsActive,
                    status = account.IsActive ? "Active" : "Inactive",
                    groupid = account.Groupid,
                    subgroupid = account.Subgroupid,
                    subgroupid2 = account.Subgroupid2,
                    subgroupid3 = account.Subgroupid3,
                    linegroupid = account.Linegroupid,
                    tenantid = account.Tenantid,
                    mainGroup = account.MainGroup ?? ""
                };

                return Ok(new { result = result });
            }
            catch (Exception ex)
            {
                return ServerError(ex, "chart of accounts request");
            }
        }

        [HttpPost("SaveChartofAccount")]
        public IActionResult SaveChartofAccount([FromBody] ChartofAccountReq request)
        {
            try
            {
                if (request == null)
                {
                    return BadRequest(new { error = "Request is null" });
                }

                // Validate required fields
                if (string.IsNullOrWhiteSpace(request.AccountCode))
                {
                    return BadRequest(new { error = "Account Code is required" });
                }

                if (string.IsNullOrWhiteSpace(request.AccountName))
                {
                    return BadRequest(new { error = "Account Name is required" });
                }

                ChartofAccounts account;

                var code = request.AccountCode.Trim();
                AccountingGapSchemaService.EnsureAsync(_context).GetAwaiter().GetResult();
                using var tx = _context.Database.BeginTransaction(System.Data.IsolationLevel.Serializable);

                var isNew = request.AccountID <= 0;
                if (!isNew)
                {
                    // Update existing account
                    account = _context.ChartofAccounts
                        .FirstOrDefault(a => a.AccountID == request.AccountID && a.Tenantid == request.Tenantid);

                    if (account == null)
                    {
                        return NotFound(new { error = "Chart of Account not found" });
                    }
                }
                else
                {
                    account = new ChartofAccounts
                    {
                        Tenantid = request.Tenantid
                    };
                }

                var currentId = account.AccountID;
                if (_context.ChartofAccounts.Any(a => a.Tenantid == request.Tenantid && a.AccountID != currentId && a.AccountCode.Trim() == code))
                {
                    return BadRequest(new { error = $"Account code '{code}' already exists" });
                }

                var hierarchyChanged = isNew || account.Groupid != request.Groupid || account.Subgroupid != request.Subgroupid
                    || account.Subgroupid2 != request.Subgroupid2 || account.Subgroupid3 != request.Subgroupid3;
                if (hierarchyChanged)
                {
                    var hierarchyError = ValidateHierarchy(request);
                    if (hierarchyError != null)
                    {
                        return BadRequest(new { error = hierarchyError });
                    }
                }

                var oldCode = isNew ? "" : (account.AccountCode ?? "").Trim();
                if (!isNew)
                {
                    if (account.IsActive && request.Status != "Active")
                    {
                        var uses = GetConfiguredUses(account, request.Tenantid);
                        if (uses.Any())
                        {
                            return BadRequest(new { error = "This account can't be made inactive while it is used by: " + string.Join("; ", uses.Select(u => u.Description)) });
                        }
                    }

                    var oldType = (account.AccountType ?? "").Trim();
                    var typeChanged = oldType.Length > 0 && !string.Equals(oldType, (request.AccountType ?? "").Trim(), StringComparison.OrdinalIgnoreCase);
                    if (typeChanged && GetPostings(account.AccountID, request.Tenantid).Any())
                    {
                        return BadRequest(new { error = "Account type can't be changed because this account already has postings. Create a new account for the new type instead." });
                    }
                }

                if (isNew)
                {
                    _context.ChartofAccounts.Add(account);
                }

                // Update fields
                account.AccountCode = code;
                account.AccountName = request.AccountName ?? "";
                account.AccountType = request.AccountType ?? "";
                account.IsActive = request.Status == "Active";
                account.Groupid = request.Groupid;
                account.Subgroupid = request.Subgroupid;
                account.Subgroupid2 = request.Subgroupid2;
                account.Subgroupid3 = request.Subgroupid3;
                account.Linegroupid = request.Linegroupid;
                
                // Set MainGroup name from Groupid if provided
                if (request.Groupid.HasValue)
                {
                    var mainGroup = _context.MainGroup
                        .Where(m => m.MainGroupID == request.Groupid.Value && m.tenantid == request.Tenantid)
                        .FirstOrDefault();
                    if (mainGroup != null)
                    {
                        account.MainGroup = mainGroup.MainGroupName ?? "";
                    }
                    else
                    {
                        account.MainGroup = request.MainGroup ?? "";
                    }
                }
                else
                {
                    account.MainGroup = request.MainGroup ?? "";
                }

                // Banks and credit cards store the account code, so a code change must carry them along.
                var linkedBanksUpdated = 0;
                var linkedCardsUpdated = 0;
                if (oldCode.Length > 0 && oldCode != code)
                {
                    foreach (var bank in _context.BankMaster.Where(b => b.TenantId == request.Tenantid && b.coa != null && b.coa.Trim() == oldCode).ToList())
                    {
                        bank.coa = code;
                        linkedBanksUpdated++;
                    }
                    foreach (var card in _context.CreditCardMaster.Where(c => c.TenantId == request.Tenantid && c.COA != null && c.COA.Trim() == oldCode).ToList())
                    {
                        card.COA = code;
                        linkedCardsUpdated++;
                    }
                }

                _context.SaveChanges();
                tx.Commit();

                return Ok(new { result = new { id = account.AccountID, message = "Chart of Account saved successfully", linkedBanksUpdated, linkedCardsUpdated } });
            }
            catch (Exception ex)
            {
                return ServerError(ex, "save");
            }
        }

        [HttpGet("GetMainGroups")]
        public IActionResult GetMainGroups([FromQuery] int tenantid)
        {
            try
            {
                var mainGroups = _context.MainGroup
                    .Where(m => m.tenantid == tenantid)
                    .Select(m => new
                    {
                        mainGroupID = m.MainGroupID,
                        mainGroupName = m.MainGroupName ?? ""
                    })
                    .Distinct()
                    .OrderBy(m => m.mainGroupName)
                    .ToList();

                return Ok(new { result = mainGroups });
            }
            catch (Exception ex)
            {
                return ServerError(ex, "chart of accounts request");
            }
        }

        [HttpGet("GetSubGroups")]
        public IActionResult GetSubGroups([FromQuery] int tenantid, [FromQuery] int? mainGroupId = null)
        {
            try
            {
                var query = _context.SubGroup.Where(s => s.tenantid == tenantid);
                
                if (mainGroupId.HasValue)
                {
                    query = query.Where(s => s.MainGroupID == mainGroupId.Value);
                }

                var subGroups = query
                    .Select(s => new
                    {
                        subGroupID = s.SubGroupID,
                        subGroupName = s.SubGroupName ?? "",
                        mainGroupID = s.MainGroupID
                    })
                    .Distinct()
                    .OrderBy(s => s.subGroupName)
                    .ToList();

                return Ok(new { result = subGroups });
            }
            catch (Exception ex)
            {
                return ServerError(ex, "chart of accounts request");
            }
        }

        [HttpGet("GetSubGroups2")]
        public IActionResult GetSubGroups2([FromQuery] int tenantid, [FromQuery] int? subGroupId = null)
        {
            try
            {
                var query = _context.SubGroup2.Where(s => s.tenantid == tenantid);
                
                if (subGroupId.HasValue)
                {
                    query = query.Where(s => s.SubGroupID == subGroupId.Value);
                }

                var subGroups2 = query
                    .Select(s => new
                    {
                        subGroup2ID = s.SubGroup2ID,
                        subGroup2Name = s.SubGroup2Name ?? "",
                        subGroupID = s.SubGroupID
                    })
                    .Distinct()
                    .OrderBy(s => s.subGroup2Name)
                    .ToList();

                return Ok(new { result = subGroups2 });
            }
            catch (Exception ex)
            {
                return ServerError(ex, "chart of accounts request");
            }
        }

        [HttpGet("GetSubGroups3")]
        public IActionResult GetSubGroups3([FromQuery] int tenantid, [FromQuery] int? subGroup2Id = null)
        {
            try
            {
                var query = _context.SubGroup3.Where(s => s.tenantid == tenantid);
                
                if (subGroup2Id.HasValue)
                {
                    query = query.Where(s => s.SubGroup2ID == subGroup2Id.Value);
                }

                var subGroups3 = query
                    .Select(s => new
                    {
                        subGroup3ID = s.SubGroup3ID,
                        subGroup3Name = s.SubGroup3Name ?? "",
                        subGroup2ID = s.SubGroup2ID
                    })
                    .Distinct()
                    .OrderBy(s => s.subGroup3Name)
                    .ToList();

                return Ok(new { result = subGroups3 });
            }
            catch (Exception ex)
            {
                return ServerError(ex, "chart of accounts request");
            }
        }

        [HttpPost("SaveMainGroup")]
        public IActionResult SaveMainGroup([FromBody] MainGroupReq request)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(request.MainGroupName))
                {
                    return BadRequest(new { error = "Main Group Name is required" });
                }

                using var tx = _context.Database.BeginTransaction();
                LockGroupIds("main", request.Tenantid);

                var existing = _context.MainGroup
                    .Where(m => m.tenantid == request.Tenantid && m.MainGroupName == request.MainGroupName)
                    .FirstOrDefault();

                if (existing != null)
                {
                    return Ok(new { result = new { mainGroupID = existing.MainGroupID, mainGroupName = existing.MainGroupName } });
                }

                var existingGroups = _context.MainGroup
                    .Where(m => m.tenantid == request.Tenantid)
                    .ToList();
                
                var maxId = existingGroups.Any() ? existingGroups.Max(m => m.MainGroupID) : 0;

                var mainGroup = new MainGroup
                {
                    MainGroupID = maxId + 1,
                    MainGroupName = request.MainGroupName,
                    tenantid = request.Tenantid,
                    accountId = 0
                };

                _context.MainGroup.Add(mainGroup);
                _context.SaveChanges();
                tx.Commit();

                return Ok(new { result = new { mainGroupID = mainGroup.MainGroupID, mainGroupName = mainGroup.MainGroupName } });
            }
            catch (Exception ex)
            {
                return ServerError(ex, "chart of accounts request");
            }
        }

        [HttpPost("SaveSubGroup")]
        public IActionResult SaveSubGroup([FromBody] SubGroupReq request)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(request.SubGroupName))
                {
                    return BadRequest(new { error = "Sub Group Name is required" });
                }

                if (!request.MainGroupID.HasValue)
                {
                    return BadRequest(new { error = "Main Group ID is required" });
                }

                using var tx = _context.Database.BeginTransaction();
                LockGroupIds("sub1", request.Tenantid);

                var existing = _context.SubGroup
                    .Where(s => s.tenantid == request.Tenantid && 
                                s.MainGroupID == request.MainGroupID.Value && 
                                s.SubGroupName == request.SubGroupName)
                    .FirstOrDefault();

                if (existing != null)
                {
                    return Ok(new { result = new { subGroupID = existing.SubGroupID, subGroupName = existing.SubGroupName } });
                }

                var existingSubGroups = _context.SubGroup
                    .Where(s => s.tenantid == request.Tenantid)
                    .ToList();
                
                var maxId = existingSubGroups.Any() ? existingSubGroups.Max(s => s.SubGroupID) : 0;

                var subGroup = new SubGroup
                {
                    SubGroupID = maxId + 1,
                    SubGroupName = request.SubGroupName,
                    MainGroupID = request.MainGroupID.Value,
                    tenantid = request.Tenantid
                };

                _context.SubGroup.Add(subGroup);
                _context.SaveChanges();
                tx.Commit();

                return Ok(new { result = new { subGroupID = subGroup.SubGroupID, subGroupName = subGroup.SubGroupName } });
            }
            catch (Exception ex)
            {
                return ServerError(ex, "chart of accounts request");
            }
        }

        [HttpPost("SaveSubGroup2")]
        public IActionResult SaveSubGroup2([FromBody] SubGroup2Req request)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(request.SubGroup2Name))
                {
                    return BadRequest(new { error = "Sub Group 2 Name is required" });
                }

                if (!request.SubGroupID.HasValue)
                {
                    return BadRequest(new { error = "Sub Group ID is required" });
                }

                using var tx = _context.Database.BeginTransaction();
                LockGroupIds("sub2", request.Tenantid);

                var existing = _context.SubGroup2
                    .Where(s => s.tenantid == request.Tenantid && 
                                s.SubGroupID == request.SubGroupID.Value && 
                                s.SubGroup2Name == request.SubGroup2Name)
                    .FirstOrDefault();

                if (existing != null)
                {
                    return Ok(new { result = new { subGroup2ID = existing.SubGroup2ID, subGroup2Name = existing.SubGroup2Name } });
                }

                var existingSubGroups2 = _context.SubGroup2
                    .Where(s => s.tenantid == request.Tenantid)
                    .ToList();
                
                var maxId = existingSubGroups2.Any() ? existingSubGroups2.Max(s => s.SubGroup2ID) : 0;

                var subGroup2 = new SubGroup2
                {
                    SubGroup2ID = maxId + 1,
                    SubGroup2Name = request.SubGroup2Name,
                    SubGroupID = request.SubGroupID.Value,
                    tenantid = request.Tenantid
                };

                _context.SubGroup2.Add(subGroup2);
                _context.SaveChanges();
                tx.Commit();

                return Ok(new { result = new { subGroup2ID = subGroup2.SubGroup2ID, subGroup2Name = subGroup2.SubGroup2Name } });
            }
            catch (Exception ex)
            {
                return ServerError(ex, "chart of accounts request");
            }
        }

        [HttpPost("SaveSubGroup3")]
        public IActionResult SaveSubGroup3([FromBody] SubGroup3Req request)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(request.SubGroup3Name))
                {
                    return BadRequest(new { error = "Sub Group 3 Name is required" });
                }

                if (!request.SubGroup2ID.HasValue)
                {
                    return BadRequest(new { error = "Sub Group 2 ID is required" });
                }

                var existing = _context.SubGroup3
                    .Where(s => s.tenantid == request.Tenantid && 
                                s.SubGroup2ID == request.SubGroup2ID.Value && 
                                s.SubGroup3Name == request.SubGroup3Name)
                    .FirstOrDefault();

                if (existing != null)
                {
                    return Ok(new { result = new { subGroup3ID = existing.SubGroup3ID, subGroup3Name = existing.SubGroup3Name } });
                }

                var subGroup3 = new SubGroup3
                {
                    SubGroup3Name = request.SubGroup3Name,
                    SubGroup2ID = request.SubGroup2ID.Value,
                    tenantid = request.Tenantid
                };

                _context.SubGroup3.Add(subGroup3);
                _context.SaveChanges();

                return Ok(new { result = new { subGroup3ID = subGroup3.SubGroup3ID, subGroup3Name = subGroup3.SubGroup3Name } });
            }
            catch (Exception ex)
            {
                return ServerError(ex, "chart of accounts request");
            }
        }

        [HttpGet("CheckChartofAccountDeletionImpact")]
        public IActionResult CheckChartofAccountDeletionImpact([FromQuery] int accountId, [FromQuery] int tenantId)
        {
            try
            {
                var account = _context.ChartofAccounts
                    .FirstOrDefault(a => a.AccountID == accountId && a.Tenantid == tenantId);

                if (account == null)
                {
                    return NotFound(new { error = "Chart of Account not found" });
                }

                var blockers = GetDeleteBlockers(account, tenantId);
                var result = new DeletionImpactResult
                {
                    CanDelete = blockers.Count == 0,
                    BlockingReasons = new List<string>(),
                    BlockingDependencies = blockers,
                    WillBeDeleted = new List<ImpactedEntity>(),
                    WillBeAffected = new List<ImpactedEntity>(),
                    Warnings = new List<string>()
                };

                var bankMappings = _context.BankCOAMapping.Count(b => b.accountid == accountId);
                if (bankMappings > 0)
                {
                    result.WillBeDeleted.Add(new ImpactedEntity
                    {
                        EntityType = "Bank COA Mappings",
                        Count = bankMappings,
                        Description = "Bank COA mappings will be deleted"
                    });
                }

                if (!result.CanDelete)
                {
                    result.BlockingReasons.Add("This Chart of Account is used by postings or settings. Make it inactive instead, or remove the references listed below first.");
                }

                return Ok(new { result = result });
            }
            catch (Exception ex)
            {
                return ServerError(ex, "deletion impact check");
            }
        }

        [HttpDelete("DeleteChartofAccount")]
        public IActionResult DeleteChartofAccount([FromQuery] int accountId, [FromQuery] int tenantId)
        {
            try
            {
                var account = _context.ChartofAccounts
                    .FirstOrDefault(a => a.AccountID == accountId && a.Tenantid == tenantId);

                if (account == null)
                {
                    return NotFound(new { error = "Chart of Account not found" });
                }

                AccountingGapSchemaService.EnsureAsync(_context).GetAwaiter().GetResult();
                using var tx = _context.Database.BeginTransaction(System.Data.IsolationLevel.Serializable);
                var blockers = GetDeleteBlockers(account, tenantId);
                if (blockers.Count > 0)
                {
                    return Conflict(new
                    {
                        error = "Account is in use and cannot be deleted: " + string.Join(", ", blockers.Select(b => b.EntityType)),
                        blockingDependencies = blockers
                    });
                }

                var bankMappings = _context.BankCOAMapping
                    .Where(b => b.accountid == accountId)
                    .ToList();
                _context.BankCOAMapping.RemoveRange(bankMappings);

                _context.ChartofAccounts.Remove(account);
                _context.SaveChanges();
                tx.Commit();

                return Ok(new { result = new { message = "Chart of Account deleted successfully" } });
            }
            catch (Exception ex)
            {
                return ServerError(ex, "delete");
            }
        }
    }

    public class ChartofAccountReq
    {
        public int AccountID { get; set; }
        public int Tenantid { get; set; }
        public string AccountCode { get; set; } = "";
        public string AccountName { get; set; } = "";
        public string AccountType { get; set; } = "";
        public string Status { get; set; } = "Active";
        public int? Groupid { get; set; }
        public int? Subgroupid { get; set; }
        public int? Subgroupid2 { get; set; }
        public int? Subgroupid3 { get; set; }
        public int? Linegroupid { get; set; }
        public string MainGroup { get; set; } = "";
    }

    public class MainGroupReq
    {
        public int Tenantid { get; set; }
        public string MainGroupName { get; set; } = "";
    }

    public class SubGroupReq
    {
        public int Tenantid { get; set; }
        public int? MainGroupID { get; set; }
        public string SubGroupName { get; set; } = "";
    }

    public class SubGroup2Req
    {
        public int Tenantid { get; set; }
        public int? SubGroupID { get; set; }
        public string SubGroup2Name { get; set; } = "";
    }

    public class SubGroup3Req
    {
        public int Tenantid { get; set; }
        public int? SubGroup2ID { get; set; }
        public string SubGroup3Name { get; set; } = "";
    }
}






