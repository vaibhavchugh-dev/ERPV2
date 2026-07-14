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
