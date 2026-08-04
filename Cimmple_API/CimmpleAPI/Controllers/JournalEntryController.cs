using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using CimmpleAPI.Data;
using CimmpleAPI.Data.Models;
using CimmpleAPI.Services;
using System;
using System.Collections.Generic;
using System.Linq;

namespace CimmpleAPI.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class JournalEntryController : ApiBaseController
    {
        private readonly CimmpleDbContext _context;

        public JournalEntryController(CimmpleDbContext context)
        {
            _context = context;
        }

        private int ResolveTenantId(int? bodyTenantId)
        {
            if (bodyTenantId.HasValue && bodyTenantId.Value > 0)
                return bodyTenantId.Value;
            var h = GetTenantId();
            return h > 0 ? h : 0;
        }

        [HttpGet("List")]
        public IActionResult List(
            [FromQuery] DateTime? startDate,
            [FromQuery] DateTime? endDate,
            [FromQuery] int skip = 0,
            [FromQuery] int take = 100,
            [FromQuery] int tenantId = 0)
        {
            try
            {
                var tid = tenantId > 0 ? tenantId : GetTenantId();
                if (tid <= 0)
                    return BadRequest(new { error = "Tenant id is required." });

                take = Math.Clamp(take, 1, 500);
                skip = Math.Max(0, skip);

                var query = _context.JournalEntries.AsNoTracking()
                    .Where(j => j.TenantId == tid);

                if (startDate.HasValue)
                    query = query.Where(j => j.EntryDate >= startDate.Value.Date);
                if (endDate.HasValue)
                    query = query.Where(j => j.EntryDate <= endDate.Value.Date.AddDays(1).AddTicks(-1));

                var total = query.Count();
                var page = query
                    .OrderByDescending(j => j.EntryDate)
                    .ThenByDescending(j => j.Id)
                    .Skip(skip)
                    .Take(take)
                    .ToList();

                var ids = page.Select(p => p.Id).ToList();
                var debitTotals = ids.Count == 0
                    ? new Dictionary<int, decimal>()
                    : _context.JournalEntryFrom.AsNoTracking()
                        .Where(f => ids.Contains(f.JournalEntryId))
                        .GroupBy(f => f.JournalEntryId)
                        .ToDictionary(g => g.Key, g => g.Sum(x => x.Amount));

                var result = page.Select(je => new
                {
                    id = je.Id,
                    entryDate = je.EntryDate.ToString("yyyy-MM-dd"),
                    referenceNumber = je.ReferenceNumber ?? "",
                    description = je.Description ?? "",
                    totalAmount = debitTotals.GetValueOrDefault(je.Id),
                    reversesJournalEntryId = je.ReversesJournalEntryId,
                    reversedByJournalEntryId = je.ReversedByJournalEntryId
                }).ToList();

                return Ok(new { result = new { items = result, total, skip, take } });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpGet("Get")]
        public IActionResult Get([FromQuery] int id, [FromQuery] int tenantId = 0)
        {
            try
            {
                var tid = tenantId > 0 ? tenantId : GetTenantId();
                if (tid <= 0)
                    return BadRequest(new { error = "Tenant id is required." });

                var je = _context.JournalEntries.AsNoTracking()
                    .FirstOrDefault(j => j.Id == id && j.TenantId == tid);
                if (je == null)
                    return NotFound(new { error = "Journal entry not found." });

                var fromLines = _context.JournalEntryFrom.AsNoTracking()
                    .Where(f => f.JournalEntryId == id)
                    .ToList();
                var toLines = _context.JournalEntryTo.AsNoTracking()
                    .Where(t => t.JournalEntryId == id)
                    .ToList();

                var accountIds = fromLines.Select(f => f.AccountId)
                    .Concat(toLines.Select(t => t.AccountId))
                    .Distinct()
                    .ToList();

                var names = _context.ChartofAccounts.AsNoTracking()
                    .Where(c => c.Tenantid == tid && accountIds.Contains(c.AccountID))
                    .ToDictionary(c => c.AccountID, c => new { c.AccountCode, c.AccountName, c.AccountType });

                object LineFrom(JournalDetailsFrom f)
                {
                    names.TryGetValue(f.AccountId, out var coa);
                    return new
                    {
                        id = f.Id,
                        accountId = f.AccountId,
                        accountCode = coa?.AccountCode ?? "",
                        accountName = coa?.AccountName ?? "",
                        accountType = coa?.AccountType ?? "",
                        debit = f.Amount,
                        credit = 0m,
                        description = f.Description ?? ""
                    };
                }

                object LineTo(JournalDetailsTo t)
                {
                    names.TryGetValue(t.AccountId, out var coa);
                    return new
                    {
                        id = t.Id,
                        accountId = t.AccountId,
                        accountCode = coa?.AccountCode ?? "",
                        accountName = coa?.AccountName ?? "",
                        accountType = coa?.AccountType ?? "",
                        debit = 0m,
                        credit = t.Amount,
                        description = t.Description ?? ""
                    };
                }

                var lines = fromLines.Select(LineFrom).Cast<object>()
                    .Concat(toLines.Select(LineTo).Cast<object>())
                    .ToList();

                var totalDebit = fromLines.Sum(x => x.Amount);
                var totalCredit = toLines.Sum(x => x.Amount);

                return Ok(new
                {
                    result = new
                    {
                        id = je.Id,
                        entryDate = je.EntryDate.ToString("yyyy-MM-dd"),
                        referenceNumber = je.ReferenceNumber ?? "",
                        description = je.Description ?? "",
                        accountingPeriod = je.AccountingPeriod ?? "",
                        tenantId = je.TenantId,
                        locationId = je.locationId,
                        reversesJournalEntryId = je.ReversesJournalEntryId,
                        reversedByJournalEntryId = je.ReversedByJournalEntryId,
                        lines,
                        totalDebit,
                        totalCredit
                    }
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpPost("Create")]
        public IActionResult Create([FromBody] CreateJournalEntryRequest request)
        {
            try
            {
                int? tenantFromBody = request.TenantId > 0 ? request.TenantId : null;
                var tenantId = ResolveTenantId(tenantFromBody);
                if (tenantId <= 0)
                    return BadRequest(new { error = "Tenant id is required." });

                if (request == null || request.Lines == null || request.Lines.Count < 2)
                    return BadRequest(new { error = "At least two detail lines are required." });

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

                var entryDate = request.EntryDate?.Date ?? DateTime.Today;
                var refNo = string.IsNullOrWhiteSpace(request.ReferenceNumber)
                    ? $"JE-{entryDate:yyyyMMdd}-{Guid.NewGuid().ToString("N")[..8].ToUpperInvariant()}"
                    : request.ReferenceNumber!.Trim();
                var desc = string.IsNullOrWhiteSpace(request.Description) ? "" : request.Description.Trim();
                var period = string.IsNullOrWhiteSpace(request.AccountingPeriod)
                    ? $"{entryDate:yyyy}{entryDate:MM}"
                    : request.AccountingPeriod.Trim();
                var lockPeriodKey = GlWorkflowService.TryNormalizePeriodKey(period, out var pkNorm, out _)
                    ? pkNorm
                    : GlWorkflowService.PeriodKeyFromDate(entryDate);
                if (GlWorkflowService.IsPeriodLocked(_context, tenantId, lockPeriodKey))
                    return BadRequest(new { error = $"Accounting period {lockPeriodKey} is closed. Open the period or pick another date to post." });

                var locId = request.LocationId > 0 ? request.LocationId : 1;

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

                    GlWorkflowService.AddAudit(_context, tenantId, "JournalCreate", GetUserId(), header.Id, null,
                        lockPeriodKey, refNo);
                    _context.SaveChanges();

                    tx.Commit();

                    return Ok(new { result = new { id = header.Id, referenceNumber = refNo, message = "Journal entry posted." } });
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

        [HttpGet("GeneralLedgerDetail")]
        public IActionResult GeneralLedgerDetail(
            [FromQuery] int accountId,
            [FromQuery] DateTime startDate,
            [FromQuery] DateTime endDate,
            [FromQuery] int tenantId = 0)
        {
            try
            {
                var tid = tenantId > 0 ? tenantId : GetTenantId();
                if (tid <= 0)
                    return BadRequest(new { error = "Tenant id is required." });
                if (accountId <= 0)
                    return BadRequest(new { error = "accountId is required." });

                var coa = _context.ChartofAccounts.AsNoTracking()
                    .FirstOrDefault(c => c.Tenantid == tid && c.AccountID == accountId);
                if (coa == null)
                    return BadRequest(new { error = "Account not found for this tenant." });

                var endInclusive = endDate.Date.AddDays(1).AddTicks(-1);

                var fromRows = (
                    from f in _context.JournalEntryFrom.AsNoTracking()
                    join je in _context.JournalEntries.AsNoTracking() on f.JournalEntryId equals je.Id
                    where je.TenantId == tid && f.AccountId == accountId
                          && je.EntryDate >= startDate.Date && je.EntryDate <= endInclusive
                    select new
                    {
                        je.Id,
                        je.EntryDate,
                        Ref = je.ReferenceNumber ?? "",
                        HeaderDesc = je.Description ?? "",
                        LineDesc = f.Description ?? "",
                        Debit = f.Amount,
                        Credit = 0m
                    }).ToList();

                var toRows = (
                    from t in _context.JournalEntryTo.AsNoTracking()
                    join je in _context.JournalEntries.AsNoTracking() on t.JournalEntryId equals je.Id
                    where je.TenantId == tid && t.AccountId == accountId
                          && je.EntryDate >= startDate.Date && je.EntryDate <= endInclusive
                    select new
                    {
                        je.Id,
                        je.EntryDate,
                        Ref = je.ReferenceNumber ?? "",
                        HeaderDesc = je.Description ?? "",
                        LineDesc = t.Description ?? "",
                        Debit = 0m,
                        Credit = t.Amount
                    }).ToList();

                var merged = fromRows.Concat(toRows)
                    .OrderBy(x => x.EntryDate)
                    .ThenBy(x => x.Id)
                    .ToList();

                decimal running = 0;
                var lines = new List<object>();
                foreach (var x in merged)
                {
                    running += x.Debit - x.Credit;
                    var memo = string.IsNullOrWhiteSpace(x.LineDesc) ? x.HeaderDesc : x.LineDesc;
                    lines.Add(new
                    {
                        journalEntryId = x.Id,
                        entryDate = x.EntryDate.ToString("yyyy-MM-dd"),
                        referenceNumber = x.Ref,
                        description = memo,
                        debit = x.Debit,
                        credit = x.Credit,
                        runningBalance = Math.Round(running, 2, MidpointRounding.AwayFromZero)
                    });
                }

                return Ok(new
                {
                    result = new
                    {
                        accountId,
                        accountCode = coa.AccountCode ?? "",
                        accountName = coa.AccountName ?? "",
                        accountType = coa.AccountType ?? "",
                        periodStart = startDate.ToString("yyyy-MM-dd"),
                        periodEnd = endDate.ToString("yyyy-MM-dd"),
                        lineCount = lines.Count,
                        lines
                    }
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpPost("Reverse")]
        public IActionResult Reverse([FromBody] ReverseJournalEntryRequest request)
        {
            try
            {
                if (request == null || request.SourceJournalEntryId <= 0)
                    return BadRequest(new { error = "SourceJournalEntryId is required." });

                int? tenantFromBody = request.TenantId > 0 ? request.TenantId : null;
                var tenantId = ResolveTenantId(tenantFromBody);
                if (tenantId <= 0)
                    return BadRequest(new { error = "Tenant id is required." });

                var source = _context.JournalEntries
                    .FirstOrDefault(j => j.Id == request.SourceJournalEntryId && j.TenantId == tenantId);
                if (source == null)
                    return NotFound(new { error = "Journal entry not found." });
                if (source.ReversedByJournalEntryId.HasValue)
                    return BadRequest(new { error = "This entry has already been reversed." });

                var reversalDate = request.EntryDate?.Date ?? DateTime.Today;
                var revPeriodKey = GlWorkflowService.PeriodKeyFromDate(reversalDate);
                if (GlWorkflowService.IsPeriodLocked(_context, tenantId, revPeriodKey))
                    return BadRequest(new { error = $"Cannot post reversal: period {revPeriodKey} is closed." });

                var fromLines = _context.JournalEntryFrom.Where(f => f.JournalEntryId == source.Id).ToList();
                var toLines = _context.JournalEntryTo.Where(t => t.JournalEntryId == source.Id).ToList();
                if (fromLines.Count + toLines.Count == 0)
                    return BadRequest(new { error = "Source entry has no lines." });

                var baseRef = string.IsNullOrWhiteSpace(source.ReferenceNumber)
                    ? $"JE-{source.Id}"
                    : source.ReferenceNumber.Trim();
                var revDefault = $"REV-{baseRef}";
                if (revDefault.Length > 120)
                    revDefault = $"REV-{source.Id}";
                var refNo = string.IsNullOrWhiteSpace(request.ReferenceNumber)
                    ? revDefault
                    : request.ReferenceNumber.Trim();
                if (refNo.Length > 200)
                    refNo = refNo[..200];

                var desc = string.IsNullOrWhiteSpace(request.Description)
                    ? $"Reversal of journal #{source.Id}"
                    : request.Description!.Trim();
                var period = string.IsNullOrWhiteSpace(request.AccountingPeriod)
                    ? revPeriodKey
                    : request.AccountingPeriod.Trim();
                var lockKey = GlWorkflowService.TryNormalizePeriodKey(period, out var pkNorm, out _)
                    ? pkNorm
                    : revPeriodKey;
                if (GlWorkflowService.IsPeriodLocked(_context, tenantId, lockKey))
                    return BadRequest(new { error = $"Cannot post reversal: period {lockKey} is closed." });

                var locId = request.LocationId > 0 ? request.LocationId : source.locationId;

                using var tx = _context.Database.BeginTransaction();
                try
                {
                    var header = new JournalEntry
                    {
                        EntryDate = reversalDate,
                        ReferenceNumber = refNo,
                        Description = desc,
                        AccountingPeriod = period,
                        TenantId = tenantId,
                        locationId = locId,
                        createdby = GetUserId(),
                        createdDate = DateTime.UtcNow,
                        ReversesJournalEntryId = source.Id
                    };
                    _context.JournalEntries.Add(header);
                    _context.SaveChanges();

                    foreach (var f in fromLines)
                    {
                        _context.JournalEntryTo.Add(new JournalDetailsTo
                        {
                            JournalEntryId = header.Id,
                            AccountId = f.AccountId,
                            Amount = f.Amount,
                            Description = f.Description
                        });
                    }

                    foreach (var t in toLines)
                    {
                        _context.JournalEntryFrom.Add(new JournalDetailsFrom
                        {
                            JournalEntryId = header.Id,
                            AccountId = t.AccountId,
                            Amount = t.Amount,
                            Description = t.Description
                        });
                    }

                    source.ReversedByJournalEntryId = header.Id;
                    _context.SaveChanges();

                    GlWorkflowService.AddAudit(_context, tenantId, "JournalReverse", GetUserId(), header.Id,
                        source.Id, lockKey, baseRef);
                    _context.SaveChanges();

                    tx.Commit();
                    return Ok(new
                    {
                        result = new
                        {
                            id = header.Id,
                            referenceNumber = refNo,
                            reversesJournalEntryId = source.Id,
                            message = "Reversal posted."
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
    }

    public class ReverseJournalEntryRequest
    {
        public int TenantId { get; set; }
        public int SourceJournalEntryId { get; set; }
        public DateTime? EntryDate { get; set; }
        public string? ReferenceNumber { get; set; }
        public string? Description { get; set; }
        public string? AccountingPeriod { get; set; }
        public int LocationId { get; set; }
    }

    public class CreateJournalEntryRequest
    {
        /// <summary>When &gt; 0, overrides tenant header (matches other accounting APIs).</summary>
        public int TenantId { get; set; }
        public DateTime? EntryDate { get; set; }
        public string? ReferenceNumber { get; set; }
        public string? Description { get; set; }
        public string? AccountingPeriod { get; set; }
        public int LocationId { get; set; }
        public List<CreateJournalEntryLineRequest> Lines { get; set; } = new();
    }

    public class CreateJournalEntryLineRequest
    {
        public int AccountId { get; set; }
        public decimal Debit { get; set; }
        public decimal Credit { get; set; }
        public string? Description { get; set; }
    }
}
