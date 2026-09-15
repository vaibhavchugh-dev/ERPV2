using CimmpleAPI.Data;
using Microsoft.EntityFrameworkCore;

namespace CimmpleAPI.Services;

/// <summary>
/// Trial balance with debit/credit columns from signed GL balances.
/// </summary>
public static class TrialBalanceReportService
{
    public sealed class AccountDto
    {
        public int AccountId { get; set; }
        public string AccountCode { get; set; } = "";
        public string AccountName { get; set; } = "";
        public string AccountType { get; set; } = "";
        /// <summary>Signed balance (debits − credits).</summary>
        public decimal Balance { get; set; }
        public decimal Debit { get; set; }
        public decimal Credit { get; set; }
    }

    public sealed class ResultDto
    {
        public string ReportType { get; set; } = "Trial Balance";
        public string AsOfDate { get; set; } = "";
        public int? LocationId { get; set; }
        public List<AccountDto> Accounts { get; set; } = new();
        public decimal TotalDebits { get; set; }
        public decimal TotalCredits { get; set; }
        public bool IsBalanced { get; set; }
        public string? SummaryNote { get; set; }
    }

    public static ResultDto Build(CimmpleDbContext db, int tenantId, DateTime asOfDate, int? locationId = null)
    {
        var accounts = db.ChartofAccounts.AsNoTracking()
            .Where(coa => coa.Tenantid == tenantId)
            .ToList();

        var balances = GlAccountBalanceService.CalculateAll(db, tenantId, asOfDate, locationId);

        var rows = new List<AccountDto>();
        foreach (var coa in accounts.OrderBy(a => a.AccountCode))
        {
            if (!balances.TryGetValue(coa.AccountID, out var balance) || balance == 0)
                continue;

            rows.Add(new AccountDto
            {
                AccountId = coa.AccountID,
                AccountCode = coa.AccountCode ?? "",
                AccountName = coa.AccountName ?? "",
                AccountType = coa.AccountType ?? "",
                Balance = balance,
                Debit = balance > 0 ? balance : 0,
                Credit = balance < 0 ? Math.Abs(balance) : 0
            });
        }

        var totalDebits = rows.Sum(a => a.Debit);
        var totalCredits = rows.Sum(a => a.Credit);

        return new ResultDto
        {
            ReportType = "Trial Balance",
            AsOfDate = asOfDate.ToString("yyyy-MM-dd"),
            LocationId = locationId,
            Accounts = rows,
            TotalDebits = totalDebits,
            TotalCredits = totalCredits,
            IsBalanced = Math.Abs(totalDebits - totalCredits) < 0.01m,
            SummaryNote = rows.Count == 0
                ? "No non-zero account balances as of this date."
                : null
        };
    }
}
