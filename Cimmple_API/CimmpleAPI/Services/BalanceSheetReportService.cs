using CimmpleAPI.Data;
using CimmpleAPI.Data.Models;
using Microsoft.EntityFrameworkCore;

namespace CimmpleAPI.Services;

/// <summary>
/// Balance sheet with account-line detail by section (assets / liabilities / equity).
/// </summary>
public static class BalanceSheetReportService
{
    private const decimal Epsilon = 0.0001m;

    public sealed class LineDto
    {
        public int AccountId { get; set; }
        public string AccountCode { get; set; } = "";
        public string AccountName { get; set; } = "";
        public decimal Balance { get; set; }
    }

    public sealed class SectionDto
    {
        public string SectionId { get; set; } = "";
        public string Title { get; set; } = "";
        public List<LineDto> Lines { get; set; } = new();
        public decimal Subtotal { get; set; }
    }

    public sealed class ResultDto
    {
        public string ReportType { get; set; } = "Balance Sheet";
        public string AsOfDate { get; set; } = "";
        public int? LocationId { get; set; }
        public string? SummaryNote { get; set; }
        public List<SectionDto> Sections { get; set; } = new();

        /// <summary>Legacy flat totals for older clients / CSV.</summary>
        public AssetsDto Assets { get; set; } = new();
        public LiabilitiesAndEquityDto LiabilitiesAndEquity { get; set; } = new();
    }

    public sealed class AssetsDto
    {
        public decimal CurrentAssets { get; set; }
        public decimal FixedAssets { get; set; }
        public decimal TotalAssets { get; set; }
        public List<LineDto> CurrentAssetLines { get; set; } = new();
        public List<LineDto> FixedAssetLines { get; set; } = new();
    }

    public sealed class LiabilitiesAndEquityDto
    {
        public decimal CurrentLiabilities { get; set; }
        public decimal LongTermLiabilities { get; set; }
        public decimal TotalLiabilities { get; set; }
        public decimal Equity { get; set; }
        public decimal TotalLiabilitiesAndEquity { get; set; }
        public List<LineDto> CurrentLiabilityLines { get; set; } = new();
        public List<LineDto> LongTermLiabilityLines { get; set; } = new();
        public List<LineDto> EquityLines { get; set; } = new();
    }

    public static ResultDto Build(CimmpleDbContext db, int tenantId, DateTime asOfDate, int? locationId = null)
    {
        var coa = db.ChartofAccounts.AsNoTracking()
            .Where(c => c.Tenantid == tenantId && c.AccountType != null)
            .ToList();

        // One batched GL pull (~6 queries) instead of ~7 queries × every COA account.
        var balances = GlAccountBalanceService.CalculateAll(db, tenantId, asOfDate, locationId);

        var currentAssetLines = BuildAssetLines(coa, balances, currentAssets: true);
        var fixedAssetLines = BuildAssetLines(coa, balances, currentAssets: false);
        var currentLiabLines = BuildLiabilityLines(coa, balances, currentLiabilities: true);
        var longTermLiabLines = BuildLiabilityLines(coa, balances, currentLiabilities: false);
        var equityLines = BuildEquityLines(coa, balances);

        var currentAssets = currentAssetLines.Sum(l => l.Balance);
        var fixedAssets = fixedAssetLines.Sum(l => l.Balance);
        var currentLiabilities = currentLiabLines.Sum(l => l.Balance);
        var longTermLiabilities = longTermLiabLines.Sum(l => l.Balance);
        var equityFromAccounts = equityLines.Sum(l => l.Balance);

        // Retained earnings plug from P&L so BS balances when income isn't closed.
        var pl = ProfitLossGlReportService.Build(db, tenantId, new DateTime(2000, 1, 1), asOfDate, locationId);
        var retainedEarnings = pl.NetIncome;
        if (Math.Abs(retainedEarnings) >= Epsilon)
        {
            equityLines.Add(new LineDto
            {
                AccountId = 0,
                AccountCode = "RE",
                AccountName = "Retained earnings (period P&L plug)",
                Balance = retainedEarnings
            });
        }

        var equity = equityFromAccounts + retainedEarnings;

        // Fallback when no equity COA rows: Assets − Liabilities
        if (equityLines.Count == 0 || (equityFromAccounts < Epsilon && Math.Abs(retainedEarnings) < Epsilon && !coa.Any(IsEquity)))
        {
            var assetsTotal = currentAssets + fixedAssets;
            var liabTotal = currentLiabilities + longTermLiabilities;
            equity = assetsTotal - liabTotal;
            equityLines = new List<LineDto>
            {
                new()
                {
                    AccountId = 0,
                    AccountCode = "EQ",
                    AccountName = "Equity (assets − liabilities)",
                    Balance = equity
                }
            };
        }

        var totalAssets = currentAssets + fixedAssets;
        var totalLiabilities = currentLiabilities + longTermLiabilities;
        var totalLiabilitiesAndEquity = totalLiabilities + equity;

        var sections = new List<SectionDto>
        {
            new() { SectionId = "currentAssets", Title = "Current Assets", Lines = currentAssetLines, Subtotal = currentAssets },
            new() { SectionId = "fixedAssets", Title = "Fixed Assets", Lines = fixedAssetLines, Subtotal = fixedAssets },
            new() { SectionId = "currentLiabilities", Title = "Current Liabilities", Lines = currentLiabLines, Subtotal = currentLiabilities },
            new() { SectionId = "longTermLiabilities", Title = "Long Term Liabilities", Lines = longTermLiabLines, Subtotal = longTermLiabilities },
            new() { SectionId = "equity", Title = "Equity", Lines = equityLines, Subtotal = equity },
        };

        var hasAny = sections.Any(s => s.Lines.Count > 0);
        return new ResultDto
        {
            ReportType = "Balance Sheet",
            AsOfDate = asOfDate.ToString("yyyy-MM-dd"),
            LocationId = locationId,
            SummaryNote = hasAny
                ? null
                : "No balance sheet account balances as of this date for this tenant/location.",
            Sections = sections,
            Assets = new AssetsDto
            {
                CurrentAssets = currentAssets,
                FixedAssets = fixedAssets,
                TotalAssets = totalAssets,
                CurrentAssetLines = currentAssetLines,
                FixedAssetLines = fixedAssetLines
            },
            LiabilitiesAndEquity = new LiabilitiesAndEquityDto
            {
                CurrentLiabilities = currentLiabilities,
                LongTermLiabilities = longTermLiabilities,
                TotalLiabilities = totalLiabilities,
                Equity = equity,
                TotalLiabilitiesAndEquity = totalLiabilitiesAndEquity,
                CurrentLiabilityLines = currentLiabLines,
                LongTermLiabilityLines = longTermLiabLines,
                EquityLines = equityLines
            }
        };
    }

    private static List<LineDto> BuildAssetLines(
        List<ChartofAccounts> coa, Dictionary<int, decimal> balances, bool currentAssets)
    {
        var lines = new List<LineDto>();
        foreach (var account in coa.Where(c => IsAsset(c, currentAssets)).OrderBy(c => c.AccountCode))
        {
            if (!balances.TryGetValue(account.AccountID, out var balance) || Math.Abs(balance) < Epsilon)
                continue;
            lines.Add(new LineDto
            {
                AccountId = account.AccountID,
                AccountCode = account.AccountCode ?? "",
                AccountName = account.AccountName ?? "",
                Balance = balance
            });
        }
        return lines;
    }

    private static List<LineDto> BuildLiabilityLines(
        List<ChartofAccounts> coa, Dictionary<int, decimal> balances, bool currentLiabilities)
    {
        var lines = new List<LineDto>();
        foreach (var account in coa.Where(c => IsLiability(c, currentLiabilities)).OrderBy(c => c.AccountCode))
        {
            if (!balances.TryGetValue(account.AccountID, out var signed))
                continue;
            var balance = Math.Abs(signed);
            if (balance < Epsilon) continue;
            lines.Add(new LineDto
            {
                AccountId = account.AccountID,
                AccountCode = account.AccountCode ?? "",
                AccountName = account.AccountName ?? "",
                Balance = balance
            });
        }
        return lines;
    }

    private static List<LineDto> BuildEquityLines(
        List<ChartofAccounts> coa, Dictionary<int, decimal> balances)
    {
        var lines = new List<LineDto>();
        foreach (var account in coa.Where(IsEquity).OrderBy(c => c.AccountCode))
        {
            if (!balances.TryGetValue(account.AccountID, out var signed))
                continue;
            var balance = Math.Abs(signed);
            if (balance < Epsilon) continue;
            lines.Add(new LineDto
            {
                AccountId = account.AccountID,
                AccountCode = account.AccountCode ?? "",
                AccountName = account.AccountName ?? "",
                Balance = balance
            });
        }
        return lines;
    }

    private static bool IsAsset(ChartofAccounts coa, bool currentAssets)
    {
        var type = (coa.AccountType ?? "").ToLowerInvariant();
        if (!type.Contains("asset")) return false;
        var mg = (coa.MainGroup ?? "").ToLowerInvariant();
        var isFixed = mg.Contains("fixed") || mg.Contains("property") ||
                      mg.Contains("equipment") || mg.Contains("plant") ||
                      mg.Contains("pp&e") || mg.Contains("depreciation");
        return currentAssets ? !isFixed : isFixed;
    }

    private static bool IsLiability(ChartofAccounts coa, bool currentLiabilities)
    {
        var type = (coa.AccountType ?? "").ToLowerInvariant();
        if (!type.Contains("liabilit")) return false;
        var mg = (coa.MainGroup ?? "").ToLowerInvariant();
        var isLongTerm = mg.Contains("long-term") || mg.Contains("long term") ||
                         mg.Contains("noncurrent") || mg.Contains("non-current");
        return currentLiabilities ? !isLongTerm : isLongTerm;
    }

    private static bool IsEquity(ChartofAccounts coa) =>
        (coa.AccountType ?? "").ToLowerInvariant().Contains("equity");
}
