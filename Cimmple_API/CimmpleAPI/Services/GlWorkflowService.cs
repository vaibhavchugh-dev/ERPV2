using System;
using CimmpleAPI.Data;
using CimmpleAPI.Data.Models;
using Microsoft.EntityFrameworkCore;

namespace CimmpleAPI.Services;

public static class GlWorkflowService
{
    public static string PeriodKeyFromDate(DateTime d) => $"{d:yyyy}{d:MM}";

    public static bool TryNormalizePeriodKey(string? input, out string periodKey, out string? error)
    {
        periodKey = "";
        error = null;
        if (string.IsNullOrWhiteSpace(input))
        {
            error = "Period key is required (YYYYMM, e.g. 202604).";
            return false;
        }

        var s = input.Trim();
        if (s.Length != 6 || !int.TryParse(s, out _))
        {
            error = "Period key must be exactly six digits (YYYYMM).";
            return false;
        }

        periodKey = s;
        return true;
    }

    public static bool IsPeriodLocked(CimmpleDbContext db, int tenantId, string periodKey) =>
        db.GlAccountingPeriodLocks.AsNoTracking()
            .Any(x => x.TenantId == tenantId && x.PeriodKey == periodKey);

    /// <summary>
    /// Posts a reversing journal for the latest unreversed entry with this reference.
    /// Returns true when there is nothing to reverse or the reversal is posted.
    /// </summary>
    public static bool TryReverseJournalByReference(
        CimmpleDbContext db,
        int tenantId,
        string? referenceNumber,
        int? actorUserId,
        string action,
        out string? error)
    {
        error = null;
        if (string.IsNullOrWhiteSpace(referenceNumber))
            return true;

        var source = db.JournalEntries
            .Where(j => j.TenantId == tenantId
                && j.ReferenceNumber == referenceNumber
                && !j.ReversedByJournalEntryId.HasValue)
            .OrderByDescending(j => j.Id)
            .FirstOrDefault();
        if (source == null)
            return true;

        var reversalDate = DateTime.Today;
        var revPeriodKey = PeriodKeyFromDate(reversalDate);
        if (IsPeriodLocked(db, tenantId, revPeriodKey))
        {
            error = $"Cannot void: accounting period {revPeriodKey} is closed.";
            return false;
        }

        var fromLines = db.JournalEntryFrom.Where(f => f.JournalEntryId == source.Id).ToList();
        var toLines = db.JournalEntryTo.Where(t => t.JournalEntryId == source.Id).ToList();
        if (fromLines.Count + toLines.Count == 0)
            return true;

        var baseRef = source.ReferenceNumber!.Trim();
        var refNo = $"REV-{baseRef}";
        if (refNo.Length > 200)
            refNo = $"REV-{source.Id}";

        var header = new JournalEntry
        {
            EntryDate = reversalDate,
            ReferenceNumber = refNo,
            Description = $"Reversal of {baseRef}",
            AccountingPeriod = revPeriodKey,
            TenantId = tenantId,
            locationId = source.locationId > 0 ? source.locationId : 1,
            createdby = actorUserId,
            createdDate = DateTime.UtcNow,
            ReversesJournalEntryId = source.Id
        };
        db.JournalEntries.Add(header);
        db.SaveChanges();

        foreach (var f in fromLines)
        {
            db.JournalEntryTo.Add(new JournalDetailsTo
            {
                JournalEntryId = header.Id,
                AccountId = f.AccountId,
                Amount = f.Amount,
                Description = f.Description
            });
        }

        foreach (var t in toLines)
        {
            db.JournalEntryFrom.Add(new JournalDetailsFrom
            {
                JournalEntryId = header.Id,
                AccountId = t.AccountId,
                Amount = t.Amount,
                Description = t.Description
            });
        }

        source.ReversedByJournalEntryId = header.Id;
        AddAudit(db, tenantId, action, actorUserId, header.Id, source.Id, revPeriodKey, baseRef);
        db.SaveChanges();
        return true;
    }

    public static void AddAudit(
        CimmpleDbContext db,
        int tenantId,
        string action,
        int? actorUserId,
        int? journalEntryId,
        int? relatedJournalEntryId,
        string? periodKey,
        string? notes)
    {
        db.GlAuditEvents.Add(new GlAuditEvent
        {
            TenantId = tenantId,
            Action = action,
            OccurredUtc = DateTime.UtcNow,
            ActorUserId = actorUserId,
            JournalEntryId = journalEntryId,
            RelatedJournalEntryId = relatedJournalEntryId,
            PeriodKey = periodKey,
            Notes = notes
        });
    }
}
