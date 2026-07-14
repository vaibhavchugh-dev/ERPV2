using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using CimmpleAPI.Data;
using CimmpleAPI.Data.Models;
using CimmpleAPI.Data.Dtos;
using System;
using System.Linq;
using System.Collections.Generic;

namespace CimmpleAPI.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [AllowAnonymous]
    public class ChartofAccountsController : ApiBaseController
    {
        private readonly CimmpleDbContext _context;

        public ChartofAccountsController(CimmpleDbContext context)
        {
            _context = context;
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
                return StatusCode(500, new { error = ex.Message });
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
                return StatusCode(500, new { error = ex.Message });
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

                if (request.AccountID > 0)
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
                    // Create new account
                    account = new ChartofAccounts
                    {
                        Tenantid = request.Tenantid
                    };
                    _context.ChartofAccounts.Add(account);
                }

                // Update fields
                account.AccountCode = request.AccountCode ?? "";
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

                _context.SaveChanges();

                return Ok(new { result = new { id = account.AccountID, message = "Chart of Account saved successfully" } });
            }
            catch (Exception ex)
            {
                var errorMessage = ex.Message;
                if (ex.InnerException != null)
                {
                    errorMessage += " | Inner Exception: " + ex.InnerException.Message;
                }
                return StatusCode(500, new { error = errorMessage, stackTrace = ex.StackTrace });
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
                return StatusCode(500, new { error = ex.Message });
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
                return StatusCode(500, new { error = ex.Message });
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
                return StatusCode(500, new { error = ex.Message });
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
                return StatusCode(500, new { error = ex.Message });
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

                return Ok(new { result = new { mainGroupID = mainGroup.MainGroupID, mainGroupName = mainGroup.MainGroupName } });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
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

                return Ok(new { result = new { subGroupID = subGroup.SubGroupID, subGroupName = subGroup.SubGroupName } });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
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

                return Ok(new { result = new { subGroup2ID = subGroup2.SubGroup2ID, subGroup2Name = subGroup2.SubGroup2Name } });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
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
                return StatusCode(500, new { error = ex.Message });
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

                var result = new DeletionImpactResult
                {
                    CanDelete = true,
                    BlockingReasons = new List<string>(),
                    BlockingDependencies = new List<BlockingDependency>(),
                    WillBeDeleted = new List<ImpactedEntity>(),
                    WillBeAffected = new List<ImpactedEntity>(),
                    Warnings = new List<string>()
                };

                // Check Deposits
                var deposits = _context.Deposits
                    .Where(d => d.AccountID == accountId && d.TenantID == tenantId)
                    .ToList();
                if (deposits.Any())
                {
                    result.CanDelete = false;
                    result.BlockingDependencies.Add(new BlockingDependency
                    {
                        EntityType = "Deposits",
                        Description = $"This account is used in {deposits.Count} deposit(s)",
                        Items = deposits.Take(10).Select(d => new DependencyItem
                        {
                            Id = d.DepositID,
                            Name = $"Deposit #{d.DepositID}",
                            DeleteEndpoint = $"/api/Transaction/DeleteDeposit?depositId={d.DepositID}"
                        }).ToList()
                    });
                }

                // Check Withdrawals
                var withdrawals = _context.Withdrawals
                    .Where(w => w.AccountID == accountId && w.TenantID == tenantId)
                    .ToList();
                if (withdrawals.Any())
                {
                    result.CanDelete = false;
                    result.BlockingDependencies.Add(new BlockingDependency
                    {
                        EntityType = "Withdrawals",
                        Description = $"This account is used in {withdrawals.Count} withdrawal(s)",
                        Items = withdrawals.Take(10).Select(w => new DependencyItem
                        {
                            Id = w.WithdrawalID,
                            Name = $"Withdrawal #{w.WithdrawalID}",
                            DeleteEndpoint = $"/api/Transaction/DeleteWithdrawal?withdrawalId={w.WithdrawalID}"
                        }).ToList()
                    });
                }

                // Check JournalEntryFrom
                var journalFrom = _context.JournalEntryFrom
                    .Where(j => j.AccountId == accountId)
                    .Join(_context.JournalEntries.Where(je => je.TenantId == tenantId),
                          jf => jf.JournalEntryId,
                          je => je.Id,
                          (jf, je) => new { jf, je })
                    .ToList();
                if (journalFrom.Any())
                {
                    result.CanDelete = false;
                    var uniqueEntries = journalFrom.Select(j => j.je.Id).Distinct().ToList();
                    result.BlockingDependencies.Add(new BlockingDependency
                    {
                        EntityType = "Journal Entries",
                        Description = $"This account is used in {uniqueEntries.Count} journal entry/entries",
                        Items = uniqueEntries.Take(10).Select(jeId => new DependencyItem
                        {
                            Id = jeId,
                            Name = $"Journal Entry #{jeId}",
                            DeleteEndpoint = $"/api/Accounting/DeleteJournalEntry?journalEntryId={jeId}"
                        }).ToList()
                    });
                }

                // Check JournalEntryTo
                var journalTo = _context.JournalEntryTo
                    .Where(j => j.AccountId == accountId)
                    .Join(_context.JournalEntries.Where(je => je.TenantId == tenantId),
                          jt => jt.JournalEntryId,
                          je => je.Id,
                          (jt, je) => new { jt, je })
                    .ToList();
                if (journalTo.Any())
                {
                    result.CanDelete = false;
                    var uniqueEntries = journalTo.Select(j => j.je.Id).Distinct().ToList();
                    var existingDep = result.BlockingDependencies.FirstOrDefault(d => d.EntityType == "Journal Entries");
                    if (existingDep != null)
                    {
                        // Merge with existing journal entries
                        var existingIds = existingDep.Items.Select(i => i.Id).ToList();
                        var newIds = uniqueEntries.Where(id => !existingIds.Contains(id)).Take(10 - existingDep.Items.Count).ToList();
                        existingDep.Items.AddRange(newIds.Select(jeId => new DependencyItem
                        {
                            Id = jeId,
                            Name = $"Journal Entry #{jeId}",
                            DeleteEndpoint = $"/api/Accounting/DeleteJournalEntry?journalEntryId={jeId}"
                        }));
                        existingDep.Description = $"This account is used in {existingIds.Count + newIds.Count} journal entry/entries";
                    }
                    else
                    {
                        result.BlockingDependencies.Add(new BlockingDependency
                        {
                            EntityType = "Journal Entries",
                            Description = $"This account is used in {uniqueEntries.Count} journal entry/entries",
                            Items = uniqueEntries.Take(10).Select(jeId => new DependencyItem
                            {
                                Id = jeId,
                                Name = $"Journal Entry #{jeId}",
                                DeleteEndpoint = $"/api/Accounting/DeleteJournalEntry?journalEntryId={jeId}"
                            }).ToList()
                        });
                    }
                }

                // Check TransCoa
                var transCoa = _context.TransCoa
                    .Where(tc => tc.accountid == accountId && tc.Tenantid == tenantId)
                    .ToList();
                if (transCoa.Any())
                {
                    result.CanDelete = false;
                    result.BlockingDependencies.Add(new BlockingDependency
                    {
                        EntityType = "Transactions",
                        Description = $"This account is linked to {transCoa.Count} transaction(s)",
                        Items = transCoa.Take(10).Select(tc => new DependencyItem
                        {
                            Id = tc.Transid,
                            Name = $"Transaction #{tc.Transid}",
                            DeleteEndpoint = $"/api/Transaction/DeleteTransaction?transactionId={tc.Transid}"
                        }).ToList()
                    });
                }

                // Check BankMaster (COA mapping)
                var banks = _context.BankMaster
                    .Where(b => !string.IsNullOrEmpty(account.AccountCode) && b.coa == account.AccountCode && b.TenantId == tenantId)
                    .ToList();
                if (banks.Any())
                {
                    result.CanDelete = false;
                    result.BlockingDependencies.Add(new BlockingDependency
                    {
                        EntityType = "Banks",
                        Description = $"This account code is used by {banks.Count} bank(s)",
                        Items = banks.Take(10).Select(b => new DependencyItem
                        {
                            Id = b.Id,
                            Name = b.BankName ?? $"Bank #{b.Id}",
                            DeleteEndpoint = $"/api/Bank/DeleteBank?bankId={b.Id}"
                        }).ToList()
                    });
                }

                // Check CreditCardMaster (COA mapping)
                // Note: Skip this check if COA column doesn't exist in CreditCardMaster table
                // The database table may not have this column yet
                var creditCards = new List<CreditCardMaster>();
                // Commented out because COA column doesn't exist in CreditCardMaster table
                // If this column is added in the future, uncomment and use:
                // creditCards = _context.CreditCardMaster
                //     .Where(c => !string.IsNullOrEmpty(account.AccountCode) && c.TenantId == tenantId)
                //     .ToList()
                //     .Where(c => !string.IsNullOrEmpty(c.COA) && c.COA == account.AccountCode)
                //     .ToList();
                if (creditCards.Any())
                {
                    result.CanDelete = false;
                    result.BlockingDependencies.Add(new BlockingDependency
                    {
                        EntityType = "Credit Cards",
                        Description = $"This account code is used by {creditCards.Count} credit card(s)",
                        Items = creditCards.Take(10).Select(c => new DependencyItem
                        {
                            Id = c.Id,
                            Name = c.NickName ?? $"Credit Card #{c.Id}",
                            DeleteEndpoint = $"/api/CreditCard/DeleteCreditCard?creditCardId={c.Id}"
                        }).ToList()
                    });
                }

                // Check VendorCOAMapping
                var vendorMappings = _context.VendorCOAMapping
                    .Where(v => v.accountid == accountId)
                    .ToList();
                if (vendorMappings.Any())
                {
                    result.WillBeDeleted.Add(new ImpactedEntity
                    {
                        EntityType = "Vendor COA Mappings",
                        Count = vendorMappings.Count,
                        Description = "Vendor COA mappings will be deleted"
                    });
                }

                // Check BankCOAMapping
                var bankMappings = _context.BankCOAMapping
                    .Where(b => b.accountid == accountId)
                    .ToList();
                if (bankMappings.Any())
                {
                    result.WillBeDeleted.Add(new ImpactedEntity
                    {
                        EntityType = "Bank COA Mappings",
                        Count = bankMappings.Count,
                        Description = "Bank COA mappings will be deleted"
                    });
                }

                if (!result.CanDelete)
                {
                    result.BlockingReasons.Add("This Chart of Account is referenced by transactions, deposits, withdrawals, journal entries, or other entities.");
                }

                return Ok(new { result = result });
            }
            catch (Exception ex)
            {
                var errorMessage = ex.Message;
                if (ex.InnerException != null)
                {
                    errorMessage += " | Inner Exception: " + ex.InnerException.Message;
                }
                return StatusCode(500, new { error = errorMessage, stackTrace = ex.StackTrace });
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

                // Delete child records first
                var vendorMappings = _context.VendorCOAMapping
                    .Where(v => v.accountid == accountId)
                    .ToList();
                _context.VendorCOAMapping.RemoveRange(vendorMappings);

                var bankMappings = _context.BankCOAMapping
                    .Where(b => b.accountid == accountId)
                    .ToList();
                _context.BankCOAMapping.RemoveRange(bankMappings);

                // Delete the account
                _context.ChartofAccounts.Remove(account);
                _context.SaveChanges();

                return Ok(new { result = new { message = "Chart of Account deleted successfully" } });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
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






