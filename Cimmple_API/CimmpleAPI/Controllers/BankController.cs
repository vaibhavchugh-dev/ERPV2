using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using CimmpleAPI.Data;
using CimmpleAPI.Data.Models;
using CimmpleAPI.Data.Dtos;
using CimmpleAPI.Services;
using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Extensions.Logging;

namespace CimmpleAPI.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class BankController : ApiBaseController
    {
        private readonly CimmpleDbContext _context;
        private readonly ILogger<BankController> _logger;

        public BankController(CimmpleDbContext context, ILogger<BankController> logger)
        {
            _context = context;
            _logger = logger;
        }

        private bool CanAccessBank(BankMaster bank) => bank.locationId <= 0 || CanAccessLocation(bank.locationId);

        private IActionResult ForbidBank() => StatusCode(403, new { message = "You do not have access to this bank's site" });

        private static string MaskAccountNo(string? accountNo)
        {
            var value = accountNo ?? string.Empty;
            return "XXXX" + (value.Length >= 4 ? value.Substring(value.Length - 4) : value);
        }

        private static object ToBankDetail(BankMaster bank) => new
        {
            id = bank.Id,
            bankName = bank.BankName,
            accountNo = bank.lastAccountNo,
            lastAccountNo = bank.lastAccountNo,
            accountType = bank.AccountType,
            routingNumber = bank.RoutingNumber,
            phone = bank.Phone,
            email = bank.Email,
            street = bank.street,
            apartment = bank.apartment ?? string.Empty,
            city = bank.city,
            state = bank.state,
            zip = bank.zip,
            country = bank.country ?? "US",
            balance = bank.Balance,
            startingcheck = bank.startingcheck,
            checkseries = bank.checkseries,
            coa = bank.coa,
            nickName = bank.NickName,
            status = bank.status ?? "Active",
            isprimary = bank.isprimary ?? false,
            ispayrollDefault = bank.ispayrollDefault ?? false,
            TenantId = bank.TenantId,
            locationId = bank.locationId,
            sharingid = bank.sharingid ?? 0
        };

        /// <summary>Records that would break (or be orphaned) if the bank were deleted.</summary>
        private List<BlockingDependency> GetDeleteBlockers(int bankId, int tenantId)
        {
            AccountingGapSchemaService.EnsureAsync(_context).GetAwaiter().GetResult();
            var blockers = new List<BlockingDependency>();

            var transactions = _context.Transactions
                .Where(t => t.BankId == bankId && t.TenantId == tenantId)
                .Select(t => t.TransactionID)
                .ToList();
            if (transactions.Any())
            {
                blockers.Add(new BlockingDependency
                {
                    EntityType = "Transactions",
                    Description = $"This bank is used in {transactions.Count} transaction(s)",
                    Items = transactions.Take(10).Select(id => new DependencyItem
                    {
                        Id = id,
                        Name = $"Transaction #{id}",
                        DeleteEndpoint = $"/api/Accounting/DeleteTransaction?transactionId={id}"
                    }).ToList()
                });
            }

            var vendorInvoices = _context.VendorInvoiceMaster
                .Where(vim => vim.Bankid == bankId && vim.TenantId == tenantId)
                .Select(vi => new { vi.Id, vi.InvoiceNo })
                .ToList();
            if (vendorInvoices.Any())
            {
                blockers.Add(new BlockingDependency
                {
                    EntityType = "Vendor Invoices",
                    Description = $"This bank is used in {vendorInvoices.Count} vendor invoice(s)",
                    Items = vendorInvoices.Take(10).Select(vi => new DependencyItem
                    {
                        Id = vi.Id,
                        Name = !string.IsNullOrEmpty(vi.InvoiceNo) ? $"Invoice #{vi.InvoiceNo}" : $"Invoice #{vi.Id}",
                        DeleteEndpoint = $"/api/VendorInvoice/DeleteVendorInvoice?vendorInvoiceId={vi.Id}"
                    }).ToList()
                });
            }

            var customerInvoices = _context.InvoiceMaster
                .Where(im => im.Bankid == bankId && im.TenantId == tenantId)
                .Select(ci => new { ci.Id, ci.InvoiceNo })
                .ToList();
            if (customerInvoices.Any())
            {
                blockers.Add(new BlockingDependency
                {
                    EntityType = "Customer Invoices",
                    Description = $"This bank is used in {customerInvoices.Count} customer invoice(s)",
                    Items = customerInvoices.Take(10).Select(ci => new DependencyItem
                    {
                        Id = ci.Id,
                        Name = ci.InvoiceNo > 0 ? $"Invoice #{ci.InvoiceNo}" : $"Invoice #{ci.Id}",
                        DeleteEndpoint = $"/api/Invoice/DeleteInvoice?invoiceId={ci.Id}"
                    }).ToList()
                });
            }

            var reconPeriods = _context.BankReconciliationPeriods
                .Where(p => p.BankId == bankId && p.TenantId == tenantId)
                .Select(p => new { p.Id, p.StatementDate })
                .ToList();
            if (reconPeriods.Any())
            {
                blockers.Add(new BlockingDependency
                {
                    EntityType = "Bank Reconciliations",
                    Description = $"This bank has {reconPeriods.Count} reconciliation period(s)",
                    Items = reconPeriods.Take(10).Select(p => new DependencyItem { Id = p.Id, Name = $"Statement {p.StatementDate:yyyy-MM-dd}" }).ToList()
                });
            }

            var checks = _context.Payment
                .Where(p => p.bankid == bankId && p.tenantid == tenantId)
                .Select(p => new { p.Id, p.series, p.ckno })
                .ToList();
            if (checks.Any())
            {
                blockers.Add(new BlockingDependency
                {
                    EntityType = "Check Payments",
                    Description = $"This bank was used to write {checks.Count} check(s)",
                    Items = checks.Take(10).Select(c => new DependencyItem { Id = c.Id, Name = $"Check {c.series}{c.ckno}" }).ToList()
                });
            }

            if (_context.AccountingDefaults.Any(d => d.TenantId == tenantId && d.DefaultPayrollBankId == bankId))
            {
                blockers.Add(new BlockingDependency
                {
                    EntityType = "Accounting Setup",
                    Description = "This bank is the default payroll bank in Accounting Setup",
                    Items = new List<DependencyItem>()
                });
            }

            return blockers;
        }

        [HttpGet("GetBanklist")]
        public IActionResult GetBanklist([FromQuery] int tenantid, [FromQuery] int? locationId = null)
        {
            try
            {
                if (!TryResolveListLocationFilter(locationId, out var filterLocationId, out var forbid, out var restrictToLocationIds))
                    return forbid!;

                AccountingGapSchemaService.EnsureAsync(_context).GetAwaiter().GetResult();

                // Throttled + batched; skip on most page loads after first run.
                BankPaymentBackfillService.RunIfNeeded(_context, tenantid);

                var query = _context.BankMaster.Where(b => b.TenantId == tenantid);
                if (filterLocationId.HasValue)
                {
                    query = query.Where(b => b.locationId == filterLocationId.Value);
                }
                else if (restrictToLocationIds != null)
                {
                    var allowed = restrictToLocationIds.ToList();
                    query = allowed.Count == 0
                        ? query.Where(b => false)
                        : query.Where(b => allowed.Contains(b.locationId));
                }

                var bankRows = query
                    .Select(b => new
                    {
                        b.Id,
                        b.BankName,
                        b.lastAccountNo,
                        b.AccountType,
                        b.Phone,
                        b.Email,
                        b.status,
                        b.Balance,
                        b.RoutingNumber,
                        b.NickName,
                        b.LastReconciledDate
                    })
                    .ToList();
                var bankIds = bankRows.Select(b => b.Id).ToList();
                var bankTypeSet = new[] { "Payment", "Deposit", "Withdrawal" };

                // Aggregate signed activity in the database (same sign rules as AccountingRules.MapBankTransactionSign).
                var bankTxns = bankIds.Count == 0
                    ? new Dictionary<int, decimal>()
                    : _context.Transactions
                        .Where(t => t.TenantId == tenantid &&
                                    t.BankId != null &&
                                    bankIds.Contains(t.BankId.Value) &&
                                    t.TransactionType != null &&
                                    bankTypeSet.Contains(t.TransactionType))
                        .GroupBy(t => t.BankId!.Value)
                        .Select(g => new
                        {
                            BankId = g.Key,
                            Activity = g.Sum(t =>
                                t.isCustomer == 1 || t.TransactionType == "Deposit"
                                    ? (t.Amount ?? 0m)
                                    : -((t.Amount ?? 0m) < 0 ? -(t.Amount ?? 0m) : (t.Amount ?? 0m)))
                        })
                        .ToDictionary(x => x.BankId, x => x.Activity);

                var banks = bankRows
                    .Select(b =>
                    {
                        var opening = b.Balance;
                        var activity = bankTxns.TryGetValue(b.Id, out var signedSum) ? signedSum : 0m;
                        return new
                        {
                            id = b.Id,
                            bankName = b.BankName,
                            accountNo = b.lastAccountNo ?? "XXXX",
                            lastAccountNo = b.lastAccountNo,
                            accountType = b.AccountType,
                            phone = b.Phone,
                            email = b.Email,
                            status = b.status ?? "Active",
                            balance = opening,
                            openingBalance = opening,
                            currentBalance = opening + activity,
                            routingNumber = b.RoutingNumber,
                            nickName = b.NickName,
                            lastReconciledDate = b.LastReconciledDate
                        };
                    })
                    .ToList();

                return Ok(new { result = banks });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpGet("GetBankById")]
        public IActionResult GetBankById([FromQuery] int bankId, [FromQuery] int tenantId)
        {
            try
            {
                var bank = _context.BankMaster
                    .Where(b => b.Id == bankId && b.TenantId == tenantId)
                    .FirstOrDefault();

                if (bank == null)
                {
                    return NotFound(new { error = "Bank not found" });
                }

                if (!CanAccessBank(bank))
                {
                    return ForbidBank();
                }

                return Ok(new { result = ToBankDetail(bank) });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        /// <summary>Returns the full account number for the Show button; every call is audit-logged.</summary>
        [HttpGet("RevealAccountNo")]
        public IActionResult RevealAccountNo([FromQuery] int bankId)
        {
            try
            {
                var tenantId = GetTenantId();
                var bank = _context.BankMaster.AsNoTracking()
                    .FirstOrDefault(b => b.Id == bankId && b.TenantId == tenantId);

                if (bank == null)
                {
                    return NotFound(new { error = "Bank not found" });
                }

                if (!CanAccessBank(bank))
                {
                    _logger.LogWarning("Bank account number reveal denied: bank {BankId}, tenant {TenantId}, user {UserId}", bankId, tenantId, GetUserId());
                    return ForbidBank();
                }

                // Warning level so the audit entry survives the default "Warning" log filter.
                _logger.LogWarning("Bank account number revealed: bank {BankId}, tenant {TenantId}, user {UserId}", bankId, tenantId, GetUserId());
                return Ok(new { result = new { accountNo = bank.AccountNo } });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpPost("SaveBankData")]
        public IActionResult SaveBankData([FromBody] BankMasterReq request)
        {
            try
            {
                // Validate required fields
                if (string.IsNullOrWhiteSpace(request.BankName))
                {
                    return BadRequest(new { error = "Bank Name is required" });
                }

                if (string.IsNullOrWhiteSpace(request.AccountNo) && request.Id == 0)
                {
                    return BadRequest(new { error = "Account No is required" });
                }

                if (string.IsNullOrWhiteSpace(request.NickName))
                {
                    return BadRequest(new { error = "Short Name is required" });
                }

                if (!request.startingcheck.HasValue)
                {
                    return BadRequest(new { error = "Starting Check No is required" });
                }

                if (string.IsNullOrWhiteSpace(request.checkseries))
                {
                    return BadRequest(new { error = "Check Series is required" });
                }

                // COA is optional - only validate length if provided
                if (!string.IsNullOrWhiteSpace(request.coa) && request.coa.Length != 4)
                {
                    return BadRequest(new { error = "COA must be exactly 4 characters" });
                }

                var existingBank = request.Id > 0
                    ? _context.BankMaster.FirstOrDefault(b => b.Id == request.Id && b.TenantId == request.TenantID)
                    : null;

                if (request.Id > 0 && existingBank == null)
                {
                    return NotFound(new { error = "Bank not found. It may have been deleted." });
                }

                BankMaster bank;
                bool isNew = existingBank == null;

                if (isNew)
                {
                    if (!TryResolveLocationId(request.locationId > 0 ? request.locationId : null, out var resolvedLocationId, out var forbid))
                        return forbid!;
                    if (resolvedLocationId <= 0 && _context.Locations.Any(l => l.TenantId == request.TenantID))
                    {
                        return BadRequest(new { error = "Site is required" });
                    }
                    request.locationId = resolvedLocationId;
                }
                else
                {
                    if (!CanAccessBank(existingBank!))
                    {
                        return ForbidBank();
                    }
                    if (request.locationId > 0 && request.locationId != existingBank!.locationId)
                    {
                        if (!CanAccessLocation(request.locationId))
                        {
                            return StatusCode(403, new { message = "You do not have access to the selected location" });
                        }
                    }
                    else
                    {
                        request.locationId = existingBank!.locationId;
                    }
                }

                var coaChanged = !string.IsNullOrWhiteSpace(request.coa) && (isNew || (existingBank!.coa ?? string.Empty) != request.coa);

                if (isNew)
                {
                    // Check for duplicate Account No / Routing Number (skip blank values)
                    var requestAccountNo = (request.AccountNo ?? "").Trim();
                    var requestRouting = (request.RoutingNumber ?? "").Trim();
                    var duplicate = _context.BankMaster
                        .Any(b => b.TenantId == request.TenantID &&
                                 b.locationId == request.locationId &&
                                 (
                                   (!string.IsNullOrWhiteSpace(requestAccountNo) && b.AccountNo == request.AccountNo) ||
                                   (!string.IsNullOrWhiteSpace(requestRouting) && b.RoutingNumber == request.RoutingNumber)
                                 ));

                    if (duplicate)
                    {
                        return BadRequest(new { error = "Account no. / Routing no already exists", accountNo = "duplicate" });
                    }

                    // Check for duplicate COA (only if COA is provided)
                    if (!string.IsNullOrWhiteSpace(request.coa))
                    {
                        var duplicateCOA = _context.BankMaster
                            .Any(b => b.TenantId == request.TenantID && b.coa == request.coa);

                        if (duplicateCOA)
                        {
                            return BadRequest(new { error = "COA already exists", coa = "duplicate" });
                        }
                    }

                    bank = new BankMaster();
                    // Initialize required fields that may not be in the request (required by database schema)
                    bank.accountname = string.Empty;
                    bank.displayname = string.Empty;
                    bank.Bankcode = string.Empty;
                    bank.BankStreet1 = string.Empty;
                    bank.BankStreet2 = string.Empty;
                }
                else
                {
                    bank = existingBank;

                    // Check for duplicate Account No / Routing Number (excluding current bank; skip blank values)
                    if (bank.AccountNo != request.AccountNo || bank.RoutingNumber != request.RoutingNumber)
                    {
                        var requestAccountNo = (request.AccountNo ?? "").Trim();
                        var requestRouting = (request.RoutingNumber ?? "").Trim();
                        var duplicate = _context.BankMaster
                            .Any(b => b.Id != request.Id &&
                                     b.TenantId == request.TenantID &&
                                     b.locationId == request.locationId &&
                                     (
                                       (!string.IsNullOrWhiteSpace(requestAccountNo) && b.AccountNo == request.AccountNo) ||
                                       (!string.IsNullOrWhiteSpace(requestRouting) && b.RoutingNumber == request.RoutingNumber)
                                     ));

                        if (duplicate)
                        {
                            return BadRequest(new { error = "Account no. / Routing no already exists", accountNo = "duplicate" });
                        }
                    }

                    // Check for duplicate COA (excluding current bank; clearing the link is always allowed)
                    if (coaChanged)
                    {
                        var duplicateCOA = _context.BankMaster
                            .Any(b => b.Id != request.Id && b.TenantId == request.TenantID && b.coa == request.coa);

                        if (duplicateCOA)
                        {
                            return BadRequest(new { error = "COA already exists", coa = "duplicate" });
                        }
                    }
                }

                if (coaChanged && !_context.ChartofAccounts.Any(c => c.Tenantid == request.TenantID && c.AccountCode == request.coa && c.IsActive))
                {
                    return BadRequest(new { error = "Select an active Chart of Accounts code" });
                }

                // Update bank properties
                bank.BankName = request.BankName;
                bank.NickName = request.NickName;
                bank.AccountType = request.AccountType;
                bank.RoutingNumber = request.RoutingNumber;
                bank.Phone = request.Phone;
                bank.Email = request.Email;
                bank.street = request.street;
                bank.apartment = request.apartment ?? string.Empty;
                bank.city = request.city;
                bank.state = request.state;
                bank.zip = request.zip;
                bank.country = request.country ?? "US";
                bank.Balance = request.Balance;
                bank.startingcheck = request.startingcheck;
                bank.checkseries = request.checkseries;
                bank.coa = request.coa ?? string.Empty; // Required in DB, but optional in UI
                bank.status = request.status ?? "Active";
                bank.isprimary = request.isprimary ?? false;
                bank.ispayrollDefault = request.ispayrollDefault ?? false;
                bank.TenantId = request.TenantID;
                bank.locationId = request.locationId;
                
                // Set required fields that may not be in the request (required by database schema)
                bank.accountname = bank.accountname ?? string.Empty;
                bank.displayname = bank.displayname ?? string.Empty;
                bank.Bankcode = bank.Bankcode ?? string.Empty;
                bank.BankStreet1 = bank.BankStreet1 ?? string.Empty;
                bank.BankStreet2 = bank.BankStreet2 ?? string.Empty;

                // A blank account number on update means "unchanged" (the UI only holds it after an audited reveal).
                if (isNew || !string.IsNullOrWhiteSpace(request.AccountNo))
                {
                    bank.AccountNo = request.AccountNo ?? string.Empty;
                    bank.lastAccountNo = MaskAccountNo(request.AccountNo);
                }

                if (bank.ispayrollDefault == true)
                {
                    var otherDefaults = _context.BankMaster
                        .Where(b => b.TenantId == request.TenantID && b.Id != bank.Id && b.ispayrollDefault == true)
                        .ToList();
                    foreach (var other in otherDefaults)
                    {
                        other.ispayrollDefault = false;
                    }
                }

                if (isNew)
                {
                    _context.BankMaster.Add(bank);
                }
                else
                {
                    _context.BankMaster.Update(bank);
                }

                _context.SaveChanges();

                return Ok(new { result = ToBankDetail(bank) });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpGet("CheckBankDeletionImpact")]
        public IActionResult CheckBankDeletionImpact([FromQuery] int bankId, [FromQuery] int tenantId)
        {
            try
            {
                var bank = _context.BankMaster
                    .FirstOrDefault(b => b.Id == bankId && b.TenantId == tenantId);

                if (bank == null)
                {
                    return NotFound(new { error = "Bank not found" });
                }

                if (!CanAccessBank(bank))
                {
                    return ForbidBank();
                }

                var blockers = GetDeleteBlockers(bankId, tenantId);
                var result = new DeletionImpactResult
                {
                    CanDelete = blockers.Count == 0,
                    BlockingReasons = new List<string>(),
                    BlockingDependencies = blockers,
                    WillBeDeleted = new List<ImpactedEntity>(),
                    WillBeAffected = new List<ImpactedEntity>(),
                    Warnings = new List<string>()
                };

                // Check BankCOAMapping
                var bankMappings = _context.BankCOAMapping
                    .Where(b => b.bankid == bankId)
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
                    result.BlockingReasons.Add("This Bank is referenced by transactions, invoices, reconciliations, checks, or Accounting Setup.");
                }

                return Ok(new { result = result });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpDelete("DeleteBank")]
        public IActionResult DeleteBank([FromQuery] int bankId, [FromQuery] int tenantId)
        {
            try
            {
                var bank = _context.BankMaster
                    .FirstOrDefault(b => b.Id == bankId && b.TenantId == tenantId);

                if (bank == null)
                {
                    return NotFound(new { error = "Bank not found" });
                }

                if (!CanAccessBank(bank))
                {
                    return ForbidBank();
                }

                AccountingGapSchemaService.EnsureAsync(_context).GetAwaiter().GetResult();
                using var tx = _context.Database.BeginTransaction(System.Data.IsolationLevel.Serializable);
                var blockers = GetDeleteBlockers(bankId, tenantId);
                if (blockers.Count > 0)
                {
                    return Conflict(new
                    {
                        error = "Bank is in use and cannot be deleted: " + string.Join(", ", blockers.Select(b => b.EntityType)),
                        blockingDependencies = blockers
                    });
                }

                // Delete child records first
                var bankMappings = _context.BankCOAMapping
                    .Where(b => b.bankid == bankId)
                    .ToList();
                _context.BankCOAMapping.RemoveRange(bankMappings);

                // Delete the bank
                _context.BankMaster.Remove(bank);
                _context.SaveChanges();
                tx.Commit();

                return Ok(new { result = new { message = "Bank deleted successfully" } });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }
    }

    // Request DTO
    public class BankMasterReq
    {
        public int Id { get; set; }
        public string BankName { get; set; }
        public string AccountNo { get; set; }
        public string AccountType { get; set; }
        public string RoutingNumber { get; set; }
        public string Phone { get; set; }
        public string Email { get; set; }
        public string street { get; set; }
        public string apartment { get; set; }
        public string city { get; set; }
        public string state { get; set; }
        public string zip { get; set; }
        public string country { get; set; }
        public decimal Balance { get; set; }
        public int? startingcheck { get; set; }
        public string checkseries { get; set; }
        public string coa { get; set; }
        public string NickName { get; set; }
        public string status { get; set; }
        public bool? isprimary { get; set; }
        public bool? ispayrollDefault { get; set; }
        public int TenantID { get; set; }
        public int locationId { get; set; }
    }
}

