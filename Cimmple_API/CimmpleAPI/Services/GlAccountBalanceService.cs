using CimmpleAPI.Data;
using Microsoft.EntityFrameworkCore;

namespace CimmpleAPI.Services;

/// <summary>
/// Shared signed GL balance (debits − credits) as of a date.
/// Prefer <see cref="CalculateAll"/> for reports — per-account <see cref="Calculate"/> is N× round-trips.
/// </summary>
public static class GlAccountBalanceService
{
    /// <summary>
    /// One-shot balances for all accounts with activity (plus zeros omitted).
    /// Typically ~6 queries total instead of ~7 per account.
    /// </summary>
    public static Dictionary<int, decimal> CalculateAll(
        CimmpleDbContext db, int tenantId, DateTime asOfDate, int? locationId = null)
    {
        var balances = new Dictionary<int, decimal>();

        void Add(int accountId, decimal amount)
        {
            if (accountId <= 0 || amount == 0) return;
            balances[accountId] = balances.TryGetValue(accountId, out var cur) ? cur + amount : amount;
        }

        var validTransactionQuery = db.Transactions.AsNoTracking()
            .Where(t => t.TenantId == tenantId &&
                        t.TransactionDate != null &&
                        t.TransactionDate <= asOfDate);
        if (locationId.HasValue)
            validTransactionQuery = validTransactionQuery.Where(t => t.locationId == locationId.Value);

        var validTransactionIds = validTransactionQuery
            .Select(t => t.TransactionID)
            .ToList();

        var validJournalQuery = db.JournalEntries.AsNoTracking()
            .Where(je => je.TenantId == tenantId && je.EntryDate <= asOfDate);
        if (locationId.HasValue)
            validJournalQuery = validJournalQuery.Where(je => je.locationId == locationId.Value);

        var validJournalEntryIds = validJournalQuery
            .Select(je => je.Id)
            .ToList();

        if (validJournalEntryIds.Count > 0)
        {
            var debitSums = db.JournalEntryFrom.AsNoTracking()
                .Where(j => validJournalEntryIds.Contains(j.JournalEntryId))
                .GroupBy(j => j.AccountId)
                .Select(g => new { AccountId = g.Key, Amount = g.Sum(x => x.Amount) })
                .ToList();
            foreach (var row in debitSums)
                Add(row.AccountId, row.Amount);

            var creditSums = db.JournalEntryTo.AsNoTracking()
                .Where(j => validJournalEntryIds.Contains(j.JournalEntryId))
                .GroupBy(j => j.AccountId)
                .Select(g => new { AccountId = g.Key, Amount = g.Sum(x => x.Amount) })
                .ToList();
            foreach (var row in creditSums)
                Add(row.AccountId, -row.Amount);
        }

        if (validTransactionIds.Count > 0)
        {
            var depositSums = db.Deposits.AsNoTracking()
                .Where(d => d.TenantID == tenantId && validTransactionIds.Contains(d.TransactionID))
                .GroupBy(d => d.AccountID)
                .Select(g => new { AccountId = g.Key, Amount = g.Sum(x => x.Amount) })
                .ToList();
            foreach (var row in depositSums)
                Add(row.AccountId, row.Amount);

            var withdrawalSums = db.Withdrawals.AsNoTracking()
                .Where(w => w.TenantID == tenantId && validTransactionIds.Contains(w.TransactionID))
                .GroupBy(w => w.AccountID)
                .Select(g => new { AccountId = g.Key, Amount = g.Sum(x => x.Amount) })
                .ToList();
            foreach (var row in withdrawalSums)
                Add(row.AccountId, -row.Amount);

            // TransCoa: attribute the parent transaction amount to the linked COA account
            var txAmountById = db.Transactions.AsNoTracking()
                .Where(t => validTransactionIds.Contains(t.TransactionID))
                .Select(t => new { t.TransactionID, t.Amount })
                .ToList()
                .ToDictionary(t => t.TransactionID, t => t.Amount ?? 0m);

            var transCoaRows = db.TransCoa.AsNoTracking()
                .Where(tc => tc.Tenantid == tenantId && validTransactionIds.Contains(tc.Transid))
                .Select(tc => new { tc.accountid, tc.Transid })
                .ToList();

            foreach (var tc in transCoaRows)
            {
                if (txAmountById.TryGetValue(tc.Transid, out var amt))
                    Add(tc.accountid, amt);
            }
        }

        return balances;
    }

    public static decimal Calculate(CimmpleDbContext db, int accountId, int tenantId, DateTime asOfDate, int? locationId = null)
    {
        var all = CalculateAll(db, tenantId, asOfDate, locationId);
        return all.TryGetValue(accountId, out var bal) ? bal : 0m;
    }
}
