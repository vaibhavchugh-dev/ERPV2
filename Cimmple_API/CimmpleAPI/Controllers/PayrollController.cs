using System;
using System.Collections.Generic;
using System.Linq;
using CimmpleAPI.Data;
using CimmpleAPI.Data.Models;
using CimmpleAPI.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CimmpleAPI.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class PayrollController : ApiBaseController
    {
        private readonly CimmpleDbContext _context;

        public PayrollController(CimmpleDbContext context)
        {
            _context = context;
        }

        /// <summary>List payroll journal links for the tenant (optional date / source filter).</summary>
        [HttpGet("List")]
        public IActionResult List(
            [FromQuery] DateTime? startDate = null,
            [FromQuery] DateTime? endDate = null,
            [FromQuery] string? source = null,
            [FromQuery] int skip = 0,
            [FromQuery] int take = 100,
            [FromQuery] int tenantId = 0,
            [FromQuery] int? locationId = null)
        {
            try
            {
                AccountingGapSchemaService.EnsureAsync(_context).GetAwaiter().GetResult();
                var tid = tenantId > 0 ? tenantId : GetTenantId();
                if (tid <= 0)
                    return BadRequest(new { error = "Tenant id is required." });

                if (!TryResolveListLocationFilter(locationId, out var filterLocationId, out var forbid, out var restrictToLocationIds))
                    return forbid!;

                take = Math.Clamp(take, 1, 500);
                skip = Math.Max(0, skip);

                var query = _context.PayrollJournalLinks.AsNoTracking()
                    .Where(p => p.TenantId == tid);

                if (filterLocationId.HasValue)
                    query = query.Where(p => p.LocationId == filterLocationId.Value);
                else if (restrictToLocationIds != null)
                {
                    var allowed = restrictToLocationIds.ToList();
                    query = allowed.Count == 0
                        ? query.Where(p => false)
                        : query.Where(p => allowed.Contains(p.LocationId));
                }

                if (!string.IsNullOrWhiteSpace(source))
                    query = query.Where(p => p.Source == source.Trim());

                if (startDate.HasValue)
                    query = query.Where(p => (p.PayDate ?? p.PayPeriodEnd ?? p.CreatedUtc) >= startDate.Value.Date);
                if (endDate.HasValue)
                {
                    var end = endDate.Value.Date.AddDays(1).AddTicks(-1);
                    query = query.Where(p => (p.PayDate ?? p.PayPeriodEnd ?? p.CreatedUtc) <= end);
                }

                var total = query.Count();
                var page = query
                    .OrderByDescending(p => p.PayDate ?? p.CreatedUtc)
                    .ThenByDescending(p => p.Id)
                    .Skip(skip)
                    .Take(take)
                    .ToList();

                var defaults = _context.AccountingDefaults.AsNoTracking()
                    .FirstOrDefault(d => d.TenantId == tid);
                var accruedId = defaults?.DefaultNetPayPayableAccountId ?? 0;

                var items = page.Select(p =>
                {
                    var suggested = accruedId > 0
                        ? PayrollCashJournalService.GetAccruedNetPayCredit(_context, p.JournalEntryId, accruedId)
                        : 0m;
                    var paid = Math.Round(p.PaymentAmount ?? 0m, 2, MidpointRounding.AwayFromZero);
                    if (p.PaymentJournalEntryId.HasValue && paid <= 0 && suggested > 0)
                        paid = suggested;
                    var remaining = Math.Round(Math.Max(0m, suggested - paid), 2, MidpointRounding.AwayFromZero);
                    return new
                    {
                        p.Id,
                        p.Source,
                        p.ExternalRunId,
                        p.ProviderName,
                        p.ReferenceNumber,
                        p.PayPeriodStart,
                        p.PayPeriodEnd,
                        p.PayDate,
                        p.JournalEntryId,
                        p.Status,
                        p.Description,
                        p.TotalDebits,
                        p.LocationId,
                        p.CreatedUtc,
                        p.PaymentJournalEntryId,
                        p.PaymentPostedUtc,
                        p.PaymentBankId,
                        PaymentAmount = paid > 0 ? paid : p.PaymentAmount,
                        p.TaxRemittanceJournalEntryId,
                        p.TaxRemittancePostedUtc,
                        p.TaxRemittanceAmount,
                        suggestedNetPay = suggested,
                        remainingNetPay = remaining
                    };
                }).ToList();

                return Ok(new { result = new { total, items } });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        /// <summary>
        /// Preview suggested net-pay amount and tax-payable lines from the accrual JE + AccountingDefaults.
        /// </summary>
        [HttpGet("CashPreview/{linkId:int}")]
        public IActionResult CashPreview(int linkId, [FromQuery] int tenantId = 0)
        {
            try
            {
                AccountingGapSchemaService.EnsureAsync(_context).GetAwaiter().GetResult();
                var tid = tenantId > 0 ? tenantId : GetTenantId();
                if (tid <= 0)
                    return BadRequest(new { error = "Tenant id is required." });

                var link = _context.PayrollJournalLinks.AsNoTracking()
                    .FirstOrDefault(p => p.Id == linkId && p.TenantId == tid);
                if (link == null)
                    return NotFound(new { error = "Payroll journal link not found." });

                var defaults = _context.AccountingDefaults.AsNoTracking()
                    .FirstOrDefault(d => d.TenantId == tid);
                var accruedId = defaults?.DefaultNetPayPayableAccountId ?? 0;
                var suggestedNet = accruedId > 0
                    ? PayrollCashJournalService.GetAccruedNetPayCredit(_context, link.JournalEntryId, accruedId)
                    : 0m;
                var paidAmount = Math.Round(link.PaymentAmount ?? 0m, 2, MidpointRounding.AwayFromZero);
                // Legacy: payment JE exists but amount not stored — treat as fully paid.
                if (link.PaymentJournalEntryId.HasValue && paidAmount <= 0 && suggestedNet > 0)
                    paidAmount = suggestedNet;
                var remainingNet = Math.Round(Math.Max(0m, suggestedNet - paidAmount), 2, MidpointRounding.AwayFromZero);
                var taxLines = PayrollCashJournalService.GetTaxPayableCreditsFromAccrual(
                    _context, link.JournalEntryId, defaults);
                var bankGl = GlAccountResolutionService.ResolvePayrollBank(_context, tid, defaults?.DefaultPayrollBankId);

                return Ok(new
                {
                    result = new
                    {
                        linkId = link.Id,
                        link.ReferenceNumber,
                        link.JournalEntryId,
                        accruedPayrollAccountId = accruedId > 0 ? accruedId : (int?)null,
                        suggestedNetPay = suggestedNet,
                        paidAmount,
                        remainingNetPay = remainingNet,
                        paymentFullyPaid = remainingNet <= 0,
                        paymentAlreadyPosted = remainingNet <= 0,
                        paymentJournalEntryId = link.PaymentJournalEntryId,
                        taxRemittanceAlreadyPosted = link.TaxRemittanceJournalEntryId.HasValue,
                        taxRemittanceJournalEntryId = link.TaxRemittanceJournalEntryId,
                        defaultPayrollBankId = defaults?.DefaultPayrollBankId,
                        payrollBankGlAccountId = bankGl,
                        taxPayableLines = taxLines,
                        linkStatus = link.Status
                    }
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        /// <summary>
        /// Post net-pay disbursement: Dr Accrued Payroll, Cr payroll bank. Idempotent per link.
        /// </summary>
        [HttpPost("PostPayment")]
        public IActionResult PostPayment([FromBody] PayrollCashPaymentRequest request)
        {
            try
            {
                AccountingGapSchemaService.EnsureAsync(_context).GetAwaiter().GetResult();
                int? tenantFromBody = request?.TenantId > 0 ? request.TenantId : null;
                var tenantId = ResolveTenantId(tenantFromBody);
                if (tenantId <= 0)
                    return BadRequest(new { error = "Tenant id is required." });
                if (request == null || (request.LinkId <= 0 && string.IsNullOrWhiteSpace(request.ExternalRunId)))
                    return BadRequest(new { error = "LinkId or ExternalRunId is required." });

                PayrollJournalLink? link = null;
                if (request.LinkId > 0)
                {
                    link = _context.PayrollJournalLinks
                        .FirstOrDefault(p => p.Id == request.LinkId && p.TenantId == tenantId);
                }
                else if (!string.IsNullOrWhiteSpace(request.ExternalRunId))
                {
                    var source = string.IsNullOrWhiteSpace(request.Source)
                        ? PayrollJournalSources.CimmplePay
                        : request.Source.Trim();
                    link = _context.PayrollJournalLinks
                        .FirstOrDefault(p => p.TenantId == tenantId
                                             && p.Source == source
                                             && p.ExternalRunId == request.ExternalRunId.Trim()
                                             && p.Status == PayrollJournalStatuses.Posted);
                }

                if (link == null)
                    return NotFound(new { error = "Payroll journal link not found." });
                if (link.Status != PayrollJournalStatuses.Posted)
                    return BadRequest(new { error = "Only Posted payroll links can receive a payment journal." });

                var defaults = _context.AccountingDefaults.AsNoTracking()
                    .FirstOrDefault(d => d.TenantId == tenantId);
                var accruedId = defaults?.DefaultNetPayPayableAccountId ?? 0;
                if (accruedId <= 0 || !GlAccountResolutionService.IsActiveAccountForTenant(_context, tenantId, accruedId))
                {
                    return BadRequest(new
                    {
                        error = "Set Default Net Pay / Accrued Payroll under Accounting Setup → Payroll GL Accounts."
                    });
                }

                var bankId = request.BankId ?? defaults?.DefaultPayrollBankId;
                var bankGlId = GlAccountResolutionService.ResolvePayrollBank(_context, tenantId, bankId);
                if (!bankGlId.HasValue)
                {
                    return BadRequest(new
                    {
                        error = "Unable to resolve payroll bank GL account. Set Default Payroll Bank in Accounting Setup or flag a Bank Master as payroll default."
                    });
                }

                var suggested = PayrollCashJournalService.GetAccruedNetPayCredit(_context, link.JournalEntryId, accruedId);
                var alreadyPaid = Math.Round(link.PaymentAmount ?? 0m, 2, MidpointRounding.AwayFromZero);
                var remaining = Math.Round(Math.Max(0m, suggested - alreadyPaid), 2, MidpointRounding.AwayFromZero);

                if (remaining <= 0)
                {
                    return Ok(new
                    {
                        result = new
                        {
                            id = link.Id,
                            journalEntryId = link.PaymentJournalEntryId,
                            alreadyExists = true,
                            amount = alreadyPaid,
                            remainingNetPay = 0m,
                            message = "Net pay is already fully paid for this payroll period."
                        }
                    });
                }

                // Legacy single-payment links used PaymentJournalEntryId without PaymentAmount.
                if (link.PaymentJournalEntryId.HasValue && alreadyPaid <= 0 && suggested > 0)
                {
                    return Ok(new
                    {
                        result = new
                        {
                            id = link.Id,
                            journalEntryId = link.PaymentJournalEntryId,
                            alreadyExists = true,
                            message = "Net-pay payment journal already posted."
                        }
                    });
                }

                var amount = Math.Round(request.Amount ?? remaining, 2, MidpointRounding.AwayFromZero);
                if (amount <= 0)
                {
                    return BadRequest(new
                    {
                        error = "Payment amount must be greater than zero. Confirm Accrued Payroll was credited on the accrual journal, or enter an amount."
                    });
                }
                if (amount > remaining)
                    amount = remaining;

                var paymentDate = (request.PaymentDate ?? link.PayDate ?? DateTime.Today).Date;
                var periodKey = GlWorkflowService.PeriodKeyFromDate(paymentDate);
                if (GlWorkflowService.IsPeriodLocked(_context, tenantId, periodKey))
                    return BadRequest(new { error = $"Accounting period {periodKey} is closed. Open the period or pick another payment date." });

                var locId = link.LocationId > 0 ? link.LocationId : 1;
                if (!TryResolveLocationId(locId, out locId, out var forbidLoc, fallback: 1))
                    return forbidLoc!;

                var seq = alreadyPaid > 0 || link.PaymentJournalEntryId.HasValue
                    ? (int)(DateTime.UtcNow.Ticks % 100000)
                    : 1;
                var refNo = $"PAYPMT-{link.Id}-{seq}";
                var existingRef = _context.JournalEntries.AsNoTracking()
                    .FirstOrDefault(j => j.TenantId == tenantId && j.ReferenceNumber == refNo);
                if (existingRef != null)
                {
                    refNo = $"PAYPMT-{link.Id}-{DateTime.UtcNow:yyyyMMddHHmmss}";
                }

                var desc = string.IsNullOrWhiteSpace(request.Description)
                    ? $"Net pay disbursement for {link.ReferenceNumber}" +
                      (remaining - amount > 0.009m ? " (partial)" : "")
                    : request.Description.Trim();

                using var tx = _context.Database.BeginTransaction();
                try
                {
                    var header = new JournalEntry
                    {
                        EntryDate = paymentDate,
                        ReferenceNumber = refNo,
                        Description = desc,
                        AccountingPeriod = periodKey,
                        TenantId = tenantId,
                        locationId = locId,
                        createdby = GetUserId(),
                        createdDate = DateTime.UtcNow
                    };
                    _context.JournalEntries.Add(header);
                    _context.SaveChanges();

                    // Dr Accrued Payroll / Cr bank
                    _context.JournalEntryFrom.Add(new JournalDetailsFrom
                    {
                        JournalEntryId = header.Id,
                        AccountId = accruedId,
                        Amount = amount,
                        Description = desc
                    });
                    _context.JournalEntryTo.Add(new JournalDetailsTo
                    {
                        JournalEntryId = header.Id,
                        AccountId = bankGlId.Value,
                        Amount = amount,
                        Description = desc
                    });
                    _context.SaveChanges();

                    var newPaid = Math.Round(alreadyPaid + amount, 2, MidpointRounding.AwayFromZero);
                    link.PaymentJournalEntryId = header.Id;
                    link.PaymentPostedUtc = DateTime.UtcNow;
                    link.PaymentBankId = bankId;
                    link.PaymentAmount = newPaid;
                    _context.SaveChanges();

                    GlWorkflowService.AddAudit(_context, tenantId, "PayrollNetPayPayment", GetUserId(), header.Id, null,
                        periodKey, refNo);
                    _context.SaveChanges();
                    tx.Commit();

                    var stillRemaining = Math.Round(Math.Max(0m, suggested - newPaid), 2, MidpointRounding.AwayFromZero);
                    return Ok(new
                    {
                        result = new
                        {
                            id = link.Id,
                            journalEntryId = header.Id,
                            amount,
                            paidAmount = newPaid,
                            remainingNetPay = stillRemaining,
                            alreadyExists = false,
                            message = stillRemaining > 0
                                ? $"Partial net-pay payment posted ({amount:N2}). Remaining {stillRemaining:N2}."
                                : "Net-pay payment journal posted."
                        }
                    });
                }
                catch
                {
                    tx.Rollback();
                    throw;
                }
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        /// <summary>
        /// Post tax / deduction remittance: Dr selected payables, Cr payroll bank. Idempotent per link (one remittance JE).
        /// </summary>
        [HttpPost("PostTaxRemittance")]
        public IActionResult PostTaxRemittance([FromBody] PayrollTaxRemittanceRequest request)
        {
            try
            {
                AccountingGapSchemaService.EnsureAsync(_context).GetAwaiter().GetResult();
                int? tenantFromBody = request?.TenantId > 0 ? request.TenantId : null;
                var tenantId = ResolveTenantId(tenantFromBody);
                if (tenantId <= 0)
                    return BadRequest(new { error = "Tenant id is required." });
                if (request == null || request.LinkId <= 0)
                    return BadRequest(new { error = "LinkId is required." });
                if (request.Lines == null || request.Lines.Count == 0)
                    return BadRequest(new { error = "At least one remittance line is required." });

                var link = _context.PayrollJournalLinks
                    .FirstOrDefault(p => p.Id == request.LinkId && p.TenantId == tenantId);
                if (link == null)
                    return NotFound(new { error = "Payroll journal link not found." });
                if (link.Status != PayrollJournalStatuses.Posted)
                    return BadRequest(new { error = "Only Posted payroll links can receive a remittance journal." });

                if (link.TaxRemittanceJournalEntryId.HasValue)
                {
                    return Ok(new
                    {
                        result = new
                        {
                            id = link.Id,
                            journalEntryId = link.TaxRemittanceJournalEntryId,
                            alreadyExists = true,
                            message = "Tax remittance journal already posted."
                        }
                    });
                }

                var defaults = _context.AccountingDefaults.AsNoTracking()
                    .FirstOrDefault(d => d.TenantId == tenantId);
                var bankId = request.BankId ?? defaults?.DefaultPayrollBankId;
                var bankGlId = GlAccountResolutionService.ResolvePayrollBank(_context, tenantId, bankId);
                if (!bankGlId.HasValue)
                {
                    return BadRequest(new
                    {
                        error = "Unable to resolve payroll bank GL account. Set Default Payroll Bank in Accounting Setup."
                    });
                }

                decimal total = 0;
                var cleanLines = new List<(int accountId, decimal amount, string desc)>();
                foreach (var line in request.Lines)
                {
                    var amt = Math.Round(line.Amount, 2, MidpointRounding.AwayFromZero);
                    if (amt <= 0) continue;
                    if (line.AccountId <= 0 || !GlAccountResolutionService.IsActiveAccountForTenant(_context, tenantId, line.AccountId))
                        return BadRequest(new { error = $"Invalid remittance account id {line.AccountId}." });
                    total += amt;
                    cleanLines.Add((line.AccountId, amt, string.IsNullOrWhiteSpace(line.Description) ? "Tax remittance" : line.Description.Trim()));
                }
                if (cleanLines.Count == 0 || total <= 0)
                    return BadRequest(new { error = "Remittance total must be greater than zero." });

                var paymentDate = (request.PaymentDate ?? DateTime.Today).Date;
                var periodKey = GlWorkflowService.PeriodKeyFromDate(paymentDate);
                if (GlWorkflowService.IsPeriodLocked(_context, tenantId, periodKey))
                    return BadRequest(new { error = $"Accounting period {periodKey} is closed." });

                var locId = link.LocationId > 0 ? link.LocationId : 1;
                if (!TryResolveLocationId(locId, out locId, out var forbidLoc, fallback: 1))
                    return forbidLoc!;

                var refNo = $"PAYTAX-{link.ReferenceNumber}";
                var desc = string.IsNullOrWhiteSpace(request.Description)
                    ? $"Tax/deduction remittance for {link.ReferenceNumber}"
                    : request.Description.Trim();

                using var tx = _context.Database.BeginTransaction();
                try
                {
                    var header = new JournalEntry
                    {
                        EntryDate = paymentDate,
                        ReferenceNumber = refNo,
                        Description = desc,
                        AccountingPeriod = periodKey,
                        TenantId = tenantId,
                        locationId = locId,
                        createdby = GetUserId(),
                        createdDate = DateTime.UtcNow
                    };
                    _context.JournalEntries.Add(header);
                    _context.SaveChanges();

                    foreach (var line in cleanLines)
                    {
                        _context.JournalEntryFrom.Add(new JournalDetailsFrom
                        {
                            JournalEntryId = header.Id,
                            AccountId = line.accountId,
                            Amount = line.amount,
                            Description = line.desc
                        });
                    }
                    _context.JournalEntryTo.Add(new JournalDetailsTo
                    {
                        JournalEntryId = header.Id,
                        AccountId = bankGlId.Value,
                        Amount = total,
                        Description = desc
                    });
                    _context.SaveChanges();

                    link.TaxRemittanceJournalEntryId = header.Id;
                    link.TaxRemittancePostedUtc = DateTime.UtcNow;
                    link.TaxRemittanceAmount = total;
                    _context.SaveChanges();

                    GlWorkflowService.AddAudit(_context, tenantId, "PayrollTaxRemittance", GetUserId(), header.Id, null,
                        periodKey, refNo);
                    _context.SaveChanges();
                    tx.Commit();

                    return Ok(new
                    {
                        result = new
                        {
                            id = link.Id,
                            journalEntryId = header.Id,
                            amount = total,
                            alreadyExists = false,
                            message = "Tax remittance journal posted."
                        }
                    });
                }
                catch
                {
                    tx.Rollback();
                    throw;
                }
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        /// <summary>
        /// Preview a manual payroll journal from summary bucket amounts using AccountingDefaults.
        /// Does not post. Returns lines + a ready <c>postPayload</c> for <see cref="PostJournal"/> / <see cref="PostManual"/>.
        /// </summary>
        [HttpPost("PreviewManual")]
        public IActionResult PreviewManual([FromBody] ManualPayrollJournalRequest request)
        {
            try
            {
                AccountingGapSchemaService.EnsureAsync(_context).GetAwaiter().GetResult();
                int? tenantFromBody = request?.TenantId > 0 ? request.TenantId : null;
                var tenantId = ResolveTenantId(tenantFromBody);
                if (tenantId <= 0)
                    return BadRequest(new { error = "Tenant id is required." });

                if (request == null)
                    return BadRequest(new { error = "Request body is required." });

                var locId = request.LocationId > 0 ? request.LocationId : 0;
                if (!TryResolveLocationId(locId > 0 ? locId : null, out locId, out var forbidLoc, fallback: 1))
                    return forbidLoc!;

                var defaults = _context.AccountingDefaults.AsNoTracking()
                    .FirstOrDefault(d => d.TenantId == tenantId);

                var built = ManualPayrollJournalBuilder.Build(
                    defaults,
                    request.ToAmounts(),
                    request.ToMeta(tenantId, locId, PayrollJournalSources.Manual));

                EnrichLineAccountNames(tenantId, built.Lines);

                return Ok(new { result = built });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        /// <summary>
        /// Build and post a manual payroll journal (<c>source=Manual</c>) from summary amounts.
        /// Uses AccountingDefaults for GL accounts; registers a <see cref="PayrollJournalLink"/>.
        /// </summary>
        [HttpPost("PostManual")]
        public IActionResult PostManual([FromBody] ManualPayrollJournalRequest request)
        {
            try
            {
                AccountingGapSchemaService.EnsureAsync(_context).GetAwaiter().GetResult();
                int? tenantFromBody = request?.TenantId > 0 ? request.TenantId : null;
                var tenantId = ResolveTenantId(tenantFromBody);
                if (tenantId <= 0)
                    return BadRequest(new { error = "Tenant id is required." });

                if (request == null)
                    return BadRequest(new { error = "Request body is required." });

                if (!request.PayDate.HasValue)
                    return BadRequest(new { error = "Pay date is required." });

                var locId = request.LocationId > 0 ? request.LocationId : 0;
                if (!TryResolveLocationId(locId > 0 ? locId : null, out locId, out var forbidLoc, fallback: 1))
                    return forbidLoc!;

                var defaults = _context.AccountingDefaults.AsNoTracking()
                    .FirstOrDefault(d => d.TenantId == tenantId);

                var built = ManualPayrollJournalBuilder.Build(
                    defaults,
                    request.ToAmounts(),
                    request.ToMeta(tenantId, locId, PayrollJournalSources.Manual));

                return PostBuiltPayrollJournal(built);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        /// <summary>
        /// Parse a payroll CSV (detail or summary rows). Returns headers, suggested column map,
        /// aggregated amounts, file hash (for idempotency), and any dates found in the file.
        /// </summary>
        [HttpPost("ParseImportCsv")]
        public IActionResult ParseImportCsv([FromBody] PayrollImportParseRequest request)
        {
            try
            {
                if (request == null || string.IsNullOrWhiteSpace(request.CsvText))
                    return BadRequest(new { error = "csvText is required." });

                var parsed = PayrollImportCsvService.Parse(request.CsvText, request.ColumnMapping);
                return Ok(new
                {
                    result = new
                    {
                        parsed.Headers,
                        suggestedMapping = parsed.SuggestedMapping,
                        appliedMapping = parsed.AppliedMapping,
                        parsed.RowCount,
                        parsed.FileHash,
                        amounts = parsed.Amounts,
                        payDate = parsed.PayDate,
                        payPeriodStart = parsed.PayPeriodStart,
                        payPeriodEnd = parsed.PayPeriodEnd,
                        externalRunIdFromCsv = parsed.ExternalRunIdFromCsv,
                        defaultExternalRunId = parsed.DefaultExternalRunId,
                        warnings = parsed.Warnings,
                        bucketKeys = PayrollImportCsvService.BucketKeys
                    }
                });
            }
            catch (Exception ex)
            {
                return BadRequest(new { error = ex.Message });
            }
        }

        /// <summary>Download a sample CSV template with recognized column headers.</summary>
        [HttpGet("ImportTemplate")]
        public IActionResult ImportTemplate()
        {
            var csv = PayrollImportCsvService.BuildTemplateCsv();
            var bytes = System.Text.Encoding.UTF8.GetBytes(csv);
            return File(bytes, "text/csv", "cimmple-payroll-import-template.csv");
        }

        /// <summary>Preview an imported payroll journal (<c>source=Import</c>).</summary>
        [HttpPost("PreviewImport")]
        public IActionResult PreviewImport([FromBody] ManualPayrollJournalRequest request)
        {
            try
            {
                AccountingGapSchemaService.EnsureAsync(_context).GetAwaiter().GetResult();
                int? tenantFromBody = request?.TenantId > 0 ? request.TenantId : null;
                var tenantId = ResolveTenantId(tenantFromBody);
                if (tenantId <= 0)
                    return BadRequest(new { error = "Tenant id is required." });

                if (request == null)
                    return BadRequest(new { error = "Request body is required." });

                var locId = request.LocationId > 0 ? request.LocationId : 0;
                if (!TryResolveLocationId(locId > 0 ? locId : null, out locId, out var forbidLoc, fallback: 1))
                    return forbidLoc!;

                var defaults = _context.AccountingDefaults.AsNoTracking()
                    .FirstOrDefault(d => d.TenantId == tenantId);

                if (string.IsNullOrWhiteSpace(request.ProviderName))
                    request.ProviderName = "Import";

                var built = ManualPayrollJournalBuilder.Build(
                    defaults,
                    request.ToAmounts(),
                    request.ToMeta(tenantId, locId, PayrollJournalSources.Import));

                EnrichLineAccountNames(tenantId, built.Lines);
                return Ok(new { result = built });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        /// <summary>
        /// Build and post an imported payroll journal (<c>source=Import</c>).
        /// Idempotent on externalRunId (use provider run id or file hash).
        /// </summary>
        [HttpPost("PostImport")]
        public IActionResult PostImport([FromBody] ManualPayrollJournalRequest request)
        {
            try
            {
                AccountingGapSchemaService.EnsureAsync(_context).GetAwaiter().GetResult();
                int? tenantFromBody = request?.TenantId > 0 ? request.TenantId : null;
                var tenantId = ResolveTenantId(tenantFromBody);
                if (tenantId <= 0)
                    return BadRequest(new { error = "Tenant id is required." });

                if (request == null)
                    return BadRequest(new { error = "Request body is required." });

                if (!request.PayDate.HasValue)
                    return BadRequest(new { error = "Pay date is required." });

                if (string.IsNullOrWhiteSpace(request.ExternalRunId))
                    return BadRequest(new { error = "ExternalRunId is required for imports (provider run id or file hash)." });

                var locId = request.LocationId > 0 ? request.LocationId : 0;
                if (!TryResolveLocationId(locId > 0 ? locId : null, out locId, out var forbidLoc, fallback: 1))
                    return forbidLoc!;

                var defaults = _context.AccountingDefaults.AsNoTracking()
                    .FirstOrDefault(d => d.TenantId == tenantId);

                if (string.IsNullOrWhiteSpace(request.ProviderName))
                    request.ProviderName = "Import";

                var built = ManualPayrollJournalBuilder.Build(
                    defaults,
                    request.ToAmounts(),
                    request.ToMeta(tenantId, locId, PayrollJournalSources.Import));

                return PostBuiltPayrollJournal(built);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        private IActionResult PostBuiltPayrollJournal(ManualPayrollBuildResult built)
        {
            if (built.MissingAccountKeys.Count > 0)
            {
                return BadRequest(new
                {
                    error = "Missing payroll GL defaults for: " + string.Join(", ", built.MissingAccountKeys)
                        + ". Set them under Accounting Setup → Payroll GL Accounts."
                });
            }

            if (!built.CanPost || built.Lines.Count < 2)
            {
                return BadRequest(new
                {
                    error = $"Journal is not balanced (debits {built.TotalDebits:N2}, credits {built.TotalCredits:N2}). Check amounts or column mapping."
                });
            }

            var payload = built.PostPayload;
            var postRequest = new PostPayrollJournalRequest
            {
                TenantId = payload.TenantId,
                LocationId = payload.LocationId,
                Source = payload.Source,
                ExternalRunId = payload.ExternalRunId,
                ProviderName = payload.ProviderName,
                EntryDate = payload.EntryDate,
                PayPeriodStart = payload.PayPeriodStart,
                PayPeriodEnd = payload.PayPeriodEnd,
                PayDate = payload.PayDate,
                ReferenceNumber = payload.ReferenceNumber,
                Description = payload.Description,
                AccountingPeriod = payload.AccountingPeriod,
                Lines = payload.Lines.Select(l => new PostPayrollJournalLineRequest
                {
                    AccountId = l.AccountId,
                    Debit = l.Debit,
                    Credit = l.Credit,
                    Description = l.Description
                }).ToList()
            };

            return PostJournal(postRequest);
        }

        private void EnrichLineAccountNames(int tenantId, List<ManualPayrollPreviewLine> lines)
        {
            if (lines == null || lines.Count == 0) return;
            var ids = lines.Select(l => l.AccountId).Where(id => id > 0).Distinct().ToList();
            if (ids.Count == 0) return;
            var names = _context.ChartofAccounts.AsNoTracking()
                .Where(a => a.Tenantid == tenantId && ids.Contains(a.AccountID))
                .Select(a => new { a.AccountID, a.AccountName, a.AccountCode })
                .ToList()
                .ToDictionary(a => a.AccountID, a => $"{a.AccountCode} — {a.AccountName}");
            foreach (var line in lines)
            {
                if (names.TryGetValue(line.AccountId, out var name))
                    line.AccountDisplay = name;
            }
        }

        /// <summary>
        /// Post a balanced payroll journal and register a <see cref="PayrollJournalLink"/>.
        /// Idempotent on (tenant, source, externalRunId) when externalRunId is provided,
        /// or on referenceNumber when a Posted link already exists.
        /// </summary>
        [HttpPost("PostJournal")]
        public IActionResult PostJournal([FromBody] PostPayrollJournalRequest request)
        {
            try
            {
                AccountingGapSchemaService.EnsureAsync(_context).GetAwaiter().GetResult();
                int? tenantFromBody = request?.TenantId > 0 ? request.TenantId : null;
                var tenantId = ResolveTenantId(tenantFromBody);
                if (tenantId <= 0)
                    return BadRequest(new { error = "Tenant id is required." });

                if (request == null || request.Lines == null || request.Lines.Count < 2)
                    return BadRequest(new { error = "At least two detail lines are required." });

                var source = string.IsNullOrWhiteSpace(request.Source)
                    ? PayrollJournalSources.Manual
                    : request.Source.Trim();
                if (source is not (PayrollJournalSources.CimmplePay or PayrollJournalSources.Manual or PayrollJournalSources.Import))
                    return BadRequest(new { error = "Source must be CimmplePay, Manual, or Import." });

                var externalRunId = string.IsNullOrWhiteSpace(request.ExternalRunId)
                    ? null
                    : request.ExternalRunId.Trim();

                if (!string.IsNullOrEmpty(externalRunId))
                {
                    var existingByExt = _context.PayrollJournalLinks.AsNoTracking()
                        .FirstOrDefault(p => p.TenantId == tenantId
                                             && p.Source == source
                                             && p.ExternalRunId == externalRunId
                                             && p.Status == PayrollJournalStatuses.Posted);
                    if (existingByExt != null)
                    {
                        return Ok(new
                        {
                            result = new
                            {
                                id = existingByExt.Id,
                                journalEntryId = existingByExt.JournalEntryId,
                                referenceNumber = existingByExt.ReferenceNumber,
                                alreadyExists = true,
                                message = "Payroll journal already posted."
                            }
                        });
                    }
                }

                decimal totalDebit = 0, totalCredit = 0;
                foreach (var line in request.Lines)
                {
                    var d = Math.Round(line.Debit, 2, MidpointRounding.AwayFromZero);
                    var c = Math.Round(line.Credit, 2, MidpointRounding.AwayFromZero);
                    if (d < 0 || c < 0)
                        return BadRequest(new { error = "Amounts cannot be negative." });
                    if (d > 0 && c > 0)
                        return BadRequest(new { error = "Each line must be either a debit or a credit, not both." });
                    if (d == 0 && c == 0)
                        return BadRequest(new { error = "Each line must have a non-zero debit or credit." });
                    totalDebit += d;
                    totalCredit += c;
                }

                if (Math.Abs(totalDebit - totalCredit) > 0.01m)
                    return BadRequest(new { error = $"Debits ({totalDebit:N2}) must equal credits ({totalCredit:N2})." });

                var accountIds = request.Lines.Select(l => l.AccountId).Distinct().ToList();
                var validAccounts = _context.ChartofAccounts
                    .Where(a => a.Tenantid == tenantId && accountIds.Contains(a.AccountID) && a.IsActive)
                    .Select(a => a.AccountID)
                    .ToHashSet();
                if (validAccounts.Count != accountIds.Count)
                    return BadRequest(new { error = "One or more accounts are invalid, inactive, or not in this tenant." });

                var entryDate = request.EntryDate?.Date ?? request.PayDate?.Date ?? DateTime.Today;
                var refNo = string.IsNullOrWhiteSpace(request.ReferenceNumber)
                    ? $"PAYRUN-{entryDate:yyyyMMdd}-{Guid.NewGuid().ToString("N")[..6].ToUpperInvariant()}"
                    : request.ReferenceNumber.Trim();

                var existingByRef = _context.PayrollJournalLinks.AsNoTracking()
                    .FirstOrDefault(p => p.TenantId == tenantId
                                         && p.ReferenceNumber == refNo
                                         && p.Status == PayrollJournalStatuses.Posted);
                if (existingByRef != null)
                {
                    return Ok(new
                    {
                        result = new
                        {
                            id = existingByRef.Id,
                            journalEntryId = existingByRef.JournalEntryId,
                            referenceNumber = existingByRef.ReferenceNumber,
                            alreadyExists = true,
                            message = "Payroll journal already posted for this reference."
                        }
                    });
                }

                var desc = string.IsNullOrWhiteSpace(request.Description) ? "" : request.Description.Trim();
                var period = string.IsNullOrWhiteSpace(request.AccountingPeriod)
                    ? $"{entryDate:yyyy}{entryDate:MM}"
                    : request.AccountingPeriod.Trim();
                var lockPeriodKey = GlWorkflowService.TryNormalizePeriodKey(period, out var pkNorm, out _)
                    ? pkNorm
                    : GlWorkflowService.PeriodKeyFromDate(entryDate);
                if (GlWorkflowService.IsPeriodLocked(_context, tenantId, lockPeriodKey))
                    return BadRequest(new { error = $"Accounting period {lockPeriodKey} is closed. Open the period or pick another date to post." });

                var locId = request.LocationId > 0 ? request.LocationId : 0;
                if (!TryResolveLocationId(locId > 0 ? locId : null, out locId, out var forbidLoc, fallback: 1))
                    return forbidLoc!;

                using var tx = _context.Database.BeginTransaction();
                try
                {
                    var header = new JournalEntry
                    {
                        EntryDate = entryDate,
                        ReferenceNumber = refNo,
                        Description = desc,
                        AccountingPeriod = period,
                        TenantId = tenantId,
                        locationId = locId,
                        createdby = GetUserId(),
                        createdDate = DateTime.UtcNow
                    };
                    _context.JournalEntries.Add(header);
                    _context.SaveChanges();

                    foreach (var line in request.Lines)
                    {
                        var d = Math.Round(line.Debit, 2, MidpointRounding.AwayFromZero);
                        var c = Math.Round(line.Credit, 2, MidpointRounding.AwayFromZero);
                        var lineDesc = string.IsNullOrWhiteSpace(line.Description) ? desc : line.Description.Trim();

                        if (d > 0)
                        {
                            _context.JournalEntryFrom.Add(new JournalDetailsFrom
                            {
                                JournalEntryId = header.Id,
                                AccountId = line.AccountId,
                                Amount = d,
                                Description = lineDesc
                            });
                        }
                        else
                        {
                            _context.JournalEntryTo.Add(new JournalDetailsTo
                            {
                                JournalEntryId = header.Id,
                                AccountId = line.AccountId,
                                Amount = c,
                                Description = lineDesc
                            });
                        }
                    }

                    _context.SaveChanges();

                    var link = new PayrollJournalLink
                    {
                        TenantId = tenantId,
                        LocationId = locId,
                        Source = source,
                        ExternalRunId = externalRunId,
                        ProviderName = string.IsNullOrWhiteSpace(request.ProviderName) ? null : request.ProviderName.Trim(),
                        ReferenceNumber = refNo,
                        PayPeriodStart = request.PayPeriodStart?.Date,
                        PayPeriodEnd = request.PayPeriodEnd?.Date,
                        PayDate = request.PayDate?.Date ?? entryDate,
                        JournalEntryId = header.Id,
                        Status = PayrollJournalStatuses.Posted,
                        Description = desc,
                        TotalDebits = totalDebit,
                        CreatedUtc = DateTime.UtcNow,
                        CreatedByUserId = GetUserId()
                    };
                    _context.PayrollJournalLinks.Add(link);
                    _context.SaveChanges();

                    GlWorkflowService.AddAudit(_context, tenantId, "PayrollJournalPost", GetUserId(), header.Id, null,
                        lockPeriodKey, refNo);
                    _context.SaveChanges();

                    tx.Commit();

                    return Ok(new
                    {
                        result = new
                        {
                            id = link.Id,
                            journalEntryId = header.Id,
                            referenceNumber = refNo,
                            alreadyExists = false,
                            message = "Payroll journal posted."
                        }
                    });
                }
                catch
                {
                    tx.Rollback();
                    throw;
                }
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        /// <summary>
        /// Register an already-posted journal (e.g. after CimmplePay synced via JournalEntry/Create)
        /// as a payroll link without creating a second JE.
        /// </summary>
        [HttpPost("RegisterExisting")]
        public IActionResult RegisterExisting([FromBody] RegisterPayrollJournalRequest request)
        {
            try
            {
                AccountingGapSchemaService.EnsureAsync(_context).GetAwaiter().GetResult();
                int? tenantFromBody = request?.TenantId > 0 ? request.TenantId : null;
                var tenantId = ResolveTenantId(tenantFromBody);
                if (tenantId <= 0)
                    return BadRequest(new { error = "Tenant id is required." });
                if (request == null || request.JournalEntryId <= 0)
                    return BadRequest(new { error = "JournalEntryId is required." });

                var je = _context.JournalEntries.AsNoTracking()
                    .FirstOrDefault(j => j.Id == request.JournalEntryId && j.TenantId == tenantId);
                if (je == null)
                    return BadRequest(new { error = "Journal entry not found for this tenant." });

                var source = string.IsNullOrWhiteSpace(request.Source)
                    ? PayrollJournalSources.CimmplePay
                    : request.Source.Trim();
                var externalRunId = string.IsNullOrWhiteSpace(request.ExternalRunId)
                    ? null
                    : request.ExternalRunId.Trim();

                if (!string.IsNullOrEmpty(externalRunId))
                {
                    var existing = _context.PayrollJournalLinks.AsNoTracking()
                        .FirstOrDefault(p => p.TenantId == tenantId
                                             && p.Source == source
                                             && p.ExternalRunId == externalRunId
                                             && p.Status == PayrollJournalStatuses.Posted);
                    if (existing != null)
                    {
                        return Ok(new
                        {
                            result = new
                            {
                                id = existing.Id,
                                journalEntryId = existing.JournalEntryId,
                                referenceNumber = existing.ReferenceNumber,
                                alreadyExists = true
                            }
                        });
                    }
                }

                var byJe = _context.PayrollJournalLinks.AsNoTracking()
                    .FirstOrDefault(p => p.TenantId == tenantId && p.JournalEntryId == je.Id && p.Status == PayrollJournalStatuses.Posted);
                if (byJe != null)
                {
                    return Ok(new
                    {
                        result = new
                        {
                            id = byJe.Id,
                            journalEntryId = byJe.JournalEntryId,
                            referenceNumber = byJe.ReferenceNumber,
                            alreadyExists = true
                        }
                    });
                }

                var debitTotal = _context.JournalEntryFrom.AsNoTracking()
                    .Where(f => f.JournalEntryId == je.Id)
                    .Sum(f => (decimal?)f.Amount) ?? 0m;

                var link = new PayrollJournalLink
                {
                    TenantId = tenantId,
                    LocationId = je.locationId,
                    Source = source,
                    ExternalRunId = externalRunId,
                    ProviderName = string.IsNullOrWhiteSpace(request.ProviderName) ? null : request.ProviderName.Trim(),
                    ReferenceNumber = je.ReferenceNumber ?? $"JE-{je.Id}",
                    PayPeriodStart = request.PayPeriodStart?.Date,
                    PayPeriodEnd = request.PayPeriodEnd?.Date,
                    PayDate = request.PayDate?.Date ?? je.EntryDate,
                    JournalEntryId = je.Id,
                    Status = PayrollJournalStatuses.Posted,
                    Description = string.IsNullOrWhiteSpace(request.Description) ? je.Description : request.Description.Trim(),
                    TotalDebits = debitTotal,
                    CreatedUtc = DateTime.UtcNow,
                    CreatedByUserId = GetUserId()
                };
                _context.PayrollJournalLinks.Add(link);
                _context.SaveChanges();

                return Ok(new
                {
                    result = new
                    {
                        id = link.Id,
                        journalEntryId = link.JournalEntryId,
                        referenceNumber = link.ReferenceNumber,
                        alreadyExists = false,
                        message = "Payroll journal registered."
                    }
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        private int ResolveTenantId(int? tenantFromBody)
        {
            if (tenantFromBody is > 0) return tenantFromBody.Value;
            return GetTenantId();
        }
    }

    public class PostPayrollJournalRequest
    {
        public int TenantId { get; set; }
        public int LocationId { get; set; }
        public string? Source { get; set; }
        public string? ExternalRunId { get; set; }
        public string? ProviderName { get; set; }
        public DateTime? EntryDate { get; set; }
        public DateTime? PayPeriodStart { get; set; }
        public DateTime? PayPeriodEnd { get; set; }
        public DateTime? PayDate { get; set; }
        public string? ReferenceNumber { get; set; }
        public string? Description { get; set; }
        public string? AccountingPeriod { get; set; }
        public List<PostPayrollJournalLineRequest> Lines { get; set; } = new();
    }

    public class PostPayrollJournalLineRequest
    {
        public int AccountId { get; set; }
        public decimal Debit { get; set; }
        public decimal Credit { get; set; }
        public string? Description { get; set; }
    }

    public class RegisterPayrollJournalRequest
    {
        public int TenantId { get; set; }
        public int JournalEntryId { get; set; }
        public string? Source { get; set; }
        public string? ExternalRunId { get; set; }
        public string? ProviderName { get; set; }
        public DateTime? PayPeriodStart { get; set; }
        public DateTime? PayPeriodEnd { get; set; }
        public DateTime? PayDate { get; set; }
        public string? Description { get; set; }
    }

    /// <summary>Summary amounts for the manual payroll wizard (no debit/credit knowledge required).</summary>
    public class ManualPayrollJournalRequest
    {
        public int TenantId { get; set; }
        public int LocationId { get; set; }
        public DateTime? PayPeriodStart { get; set; }
        public DateTime? PayPeriodEnd { get; set; }
        public DateTime? PayDate { get; set; }
        public DateTime? EntryDate { get; set; }
        public string? ReferenceNumber { get; set; }
        public string? Description { get; set; }
        public string? ExternalRunId { get; set; }
        public string? ProviderName { get; set; }

        public decimal GrossWages { get; set; }
        public decimal FederalTax { get; set; }
        public decimal StateTax { get; set; }
        public decimal LocalTax { get; set; }
        public decimal SocialSecurityTax { get; set; }
        public decimal MedicareTax { get; set; }
        public decimal PreTaxDeductions { get; set; }
        public decimal RetirementDeductions { get; set; }
        public decimal PostTaxDeductions { get; set; }
        public decimal Garnishments { get; set; }
        public decimal NetPay { get; set; }
        public decimal EmployerTaxesBenefits { get; set; }

        public ManualPayrollAmounts ToAmounts() => new()
        {
            GrossWages = GrossWages,
            FederalTax = FederalTax,
            StateTax = StateTax,
            LocalTax = LocalTax,
            SocialSecurityTax = SocialSecurityTax,
            MedicareTax = MedicareTax,
            PreTaxDeductions = PreTaxDeductions,
            RetirementDeductions = RetirementDeductions,
            PostTaxDeductions = PostTaxDeductions,
            Garnishments = Garnishments,
            NetPay = NetPay,
            EmployerTaxesBenefits = EmployerTaxesBenefits
        };

        public ManualPayrollMeta ToMeta(int tenantId, int locationId, string? source = null) => new()
        {
            TenantId = tenantId,
            LocationId = locationId,
            Source = source ?? PayrollJournalSources.Manual,
            PayPeriodStart = PayPeriodStart,
            PayPeriodEnd = PayPeriodEnd,
            PayDate = PayDate,
            EntryDate = EntryDate,
            ReferenceNumber = ReferenceNumber,
            Description = Description,
            ExternalRunId = ExternalRunId,
            ProviderName = ProviderName
        };
    }

    public class PayrollImportParseRequest
    {
        public string CsvText { get; set; } = "";
        /// <summary>Optional override: CSV header → bucket key (or "ignore").</summary>
        public Dictionary<string, string>? ColumnMapping { get; set; }
    }

    public class PayrollCashPaymentRequest
    {
        public int TenantId { get; set; }
        public int LinkId { get; set; }
        /// <summary>Optional when LinkId is set; used with Source for CimmplePay callers.</summary>
        public string? ExternalRunId { get; set; }
        public string? Source { get; set; }
        public decimal? Amount { get; set; }
        public DateTime? PaymentDate { get; set; }
        public int? BankId { get; set; }
        public string? Description { get; set; }
    }

    public class PayrollTaxRemittanceRequest
    {
        public int TenantId { get; set; }
        public int LinkId { get; set; }
        public DateTime? PaymentDate { get; set; }
        public int? BankId { get; set; }
        public string? Description { get; set; }
        public List<PayrollTaxRemittanceLineRequest> Lines { get; set; } = new();
    }

    public class PayrollTaxRemittanceLineRequest
    {
        public int AccountId { get; set; }
        public decimal Amount { get; set; }
        public string? Description { get; set; }
    }
}
