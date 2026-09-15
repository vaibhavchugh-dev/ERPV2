using CimmpleAPI.Data;
using CimmpleAPI.Data.Models;
using Microsoft.EntityFrameworkCore;

namespace CimmpleAPI.Services;

/// <summary>
/// Direct-method cash flow: operating from customer/vendor payments;
/// investing/financing from deposits/withdrawals classified by COA MainGroup/AccountType.
/// </summary>
public static class CashFlowDirectReportService
{
    private const decimal Epsilon = 0.0001m;

    public sealed class LineDto
    {
        public string Date { get; set; } = "";
        public string Description { get; set; } = "";
        public string Reference { get; set; } = "";
        public string Category { get; set; } = "";
        public decimal Amount { get; set; }
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
        public string ReportType { get; set; } = "Cash Flow Statement";
        public string ReportBasis { get; set; } = "direct-cash";
        public string PeriodStart { get; set; } = "";
        public string PeriodEnd { get; set; } = "";
        public int? LocationId { get; set; }
        public List<SectionDto> Sections { get; set; } = new();
        public decimal OperatingActivities { get; set; }
        public decimal InvestingActivities { get; set; }
        public decimal FinancingActivities { get; set; }
        public decimal NetCashFlow { get; set; }
        public string? SummaryNote { get; set; }
    }

    public static ResultDto Build(CimmpleDbContext db, int tenantId, DateTime startDate, DateTime endDate, int? locationId = null)
    {
        var endInclusive = endDate.Date.AddDays(1).AddTicks(-1);
        var start = startDate.Date;

        var operatingLines = BuildOperatingLines(db, tenantId, start, endInclusive, locationId);
        var investingLines = new List<LineDto>();
        var financingLines = new List<LineDto>();
        BuildInvestingFinancingLines(db, tenantId, start, endInclusive, locationId, investingLines, financingLines);

        var operating = operatingLines.Sum(l => l.Amount);
        var investing = investingLines.Sum(l => l.Amount);
        var financing = financingLines.Sum(l => l.Amount);
        var net = operating + investing + financing;

        var sections = new List<SectionDto>
        {
            new()
            {
                SectionId = "operating",
                Title = "Operating Activities",
                Lines = operatingLines,
                Subtotal = operating
            },
            new()
            {
                SectionId = "investing",
                Title = "Investing Activities",
                Lines = investingLines,
                Subtotal = investing
            },
            new()
            {
                SectionId = "financing",
                Title = "Financing Activities",
                Lines = financingLines,
                Subtotal = financing
            }
        };

        var hasAny = Math.Abs(net) >= Epsilon || sections.Any(s => s.Lines.Count > 0);

        return new ResultDto
        {
            ReportType = "Cash Flow Statement",
            ReportBasis = "direct-cash",
            PeriodStart = start.ToString("yyyy-MM-dd"),
            PeriodEnd = endDate.Date.ToString("yyyy-MM-dd"),
            LocationId = locationId,
            Sections = sections,
            OperatingActivities = operating,
            InvestingActivities = investing,
            FinancingActivities = financing,
            NetCashFlow = net,
            SummaryNote = hasAny
                ? null
                : "No cash payment or classified investing/financing activity in this period. Operating cash uses customer/vendor Payment transactions; investing/financing use deposits/withdrawals linked to fixed-asset, investment, equity, or loan COA accounts."
        };
    }

    private static List<LineDto> BuildOperatingLines(
        CimmpleDbContext db, int tenantId, DateTime start, DateTime endInclusive, int? locationId)
    {
        var lines = new List<LineDto>();

        var cashInQuery = db.Transactions.AsNoTracking()
            .Where(t => t.TenantId == tenantId &&
                        t.isCustomer == 1 &&
                        t.TransactionType != null &&
                        EF.Functions.Like(t.TransactionType, "%Payment%") &&
                        t.TransactionDate != null &&
                        t.TransactionDate >= start &&
                        t.TransactionDate <= endInclusive);
        if (locationId.HasValue)
            cashInQuery = cashInQuery.Where(t => t.locationId == locationId.Value);

        foreach (var t in cashInQuery.OrderBy(t => t.TransactionDate).ThenBy(t => t.TransactionID))
        {
            var amt = t.Amount ?? 0;
            if (Math.Abs(amt) < Epsilon) continue;
            lines.Add(new LineDto
            {
                Date = t.TransactionDate!.Value.ToString("yyyy-MM-dd"),
                Description = t.Description ?? "Customer payment",
                Reference = t.invoiceNo ?? t.CheckNo ?? "",
                Category = "Cash received from customers",
                Amount = amt
            });
        }

        var cashOutQuery = db.Transactions.AsNoTracking()
            .Where(t => t.TenantId == tenantId &&
                        (t.isCustomer == 0 || t.isCustomer == null) &&
                        t.TransactionType != null &&
                        EF.Functions.Like(t.TransactionType, "%Payment%") &&
                        t.TransactionDate != null &&
                        t.TransactionDate >= start &&
                        t.TransactionDate <= endInclusive);
        if (locationId.HasValue)
            cashOutQuery = cashOutQuery.Where(t => t.locationId == locationId.Value);

        foreach (var t in cashOutQuery.OrderBy(t => t.TransactionDate).ThenBy(t => t.TransactionID))
        {
            var amt = t.Amount ?? 0;
            if (Math.Abs(amt) < Epsilon) continue;
            lines.Add(new LineDto
            {
                Date = t.TransactionDate!.Value.ToString("yyyy-MM-dd"),
                Description = t.Description ?? "Vendor payment",
                Reference = t.invoiceNo ?? t.CheckNo ?? "",
                Category = "Cash paid to vendors",
                Amount = -amt
            });
        }

        return lines;
    }

    private static void BuildInvestingFinancingLines(
        CimmpleDbContext db,
        int tenantId,
        DateTime start,
        DateTime endInclusive,
        int? locationId,
        List<LineDto> investing,
        List<LineDto> financing)
    {
        var coa = db.ChartofAccounts.AsNoTracking()
            .Where(c => c.Tenantid == tenantId)
            .ToDictionary(c => c.AccountID);

        var txQuery = db.Transactions.AsNoTracking()
            .Where(t => t.TenantId == tenantId &&
                        t.TransactionDate != null &&
                        t.TransactionDate >= start &&
                        t.TransactionDate <= endInclusive);
        if (locationId.HasValue)
            txQuery = txQuery.Where(t => t.locationId == locationId.Value);

        var txs = txQuery.ToDictionary(t => t.TransactionID);

        var deposits = db.Deposits.AsNoTracking()
            .Where(d => d.TenantID == tenantId && txs.Keys.Contains(d.TransactionID))
            .ToList();
        var withdrawals = db.Withdrawals.AsNoTracking()
            .Where(w => w.TenantID == tenantId && txs.Keys.Contains(w.TransactionID))
            .ToList();

        void AddLine(Transactions? t, ChartofAccounts account, decimal signedAmount, string bucket)
        {
            if (Math.Abs(signedAmount) < Epsilon) return;
            var line = new LineDto
            {
                Date = t?.TransactionDate?.ToString("yyyy-MM-dd") ?? "",
                Description = $"{account.AccountCode} — {account.AccountName}",
                Reference = t?.invoiceNo ?? t?.CheckNo ?? "",
                Category = account.MainGroup ?? account.AccountType ?? "",
                Amount = signedAmount
            };
            if (bucket == "investing") investing.Add(line);
            else financing.Add(line);
        }

        foreach (var d in deposits)
        {
            if (!coa.TryGetValue(d.AccountID, out var account)) continue;
            var bucket = ClassifyCashBucket(account);
            if (bucket == null) continue;
            txs.TryGetValue(d.TransactionID, out var t);
            // Deposit into investing/financing account ≈ cash outflow to acquire (negative) unless it's equity/loan inflow to cash.
            // Convention: deposit to asset = investing outflow (-); deposit to liability/equity = financing inflow (+).
            var amt = IsFinancingCreditNormal(account) ? d.Amount : -d.Amount;
            AddLine(t, account, amt, bucket);
        }

        foreach (var w in withdrawals)
        {
            if (!coa.TryGetValue(w.AccountID, out var account)) continue;
            var bucket = ClassifyCashBucket(account);
            if (bucket == null) continue;
            txs.TryGetValue(w.TransactionID, out var t);
            // Withdrawal from asset = investing inflow (+ sale); withdrawal reducing liability = financing outflow.
            var amt = IsFinancingCreditNormal(account) ? -w.Amount : w.Amount;
            AddLine(t, account, amt, bucket);
        }

        investing.Sort((a, b) => string.Compare(a.Date, b.Date, StringComparison.Ordinal));
        financing.Sort((a, b) => string.Compare(a.Date, b.Date, StringComparison.Ordinal));
    }

    /// <summary>Returns "investing", "financing", or null for operating/cash accounts.</summary>
    public static string? ClassifyCashBucket(ChartofAccounts coa)
    {
        var type = (coa.AccountType ?? "").ToLowerInvariant();
        var mg = (coa.MainGroup ?? "").ToLowerInvariant();
        var name = (coa.AccountName ?? "").ToLowerInvariant();

        // Skip pure cash / bank / AR / AP / current operating accounts
        if (mg.Contains("cash") || mg.Contains("bank") || name.Contains("checking") || name.Contains("petty cash"))
            return null;
        if (mg.Contains("receivable") || mg.Contains("payable") || mg.Contains("inventory"))
            return null;

        if (type.Contains("asset"))
        {
            if (mg.Contains("fixed") || mg.Contains("property") || mg.Contains("equipment") ||
                mg.Contains("plant") || mg.Contains("pp&e") || mg.Contains("investment") ||
                mg.Contains("intangible") || name.Contains("investment"))
                return "investing";
            return null;
        }

        if (type.Contains("liabilit") || type.Contains("equity"))
        {
            if (mg.Contains("long-term") || mg.Contains("long term") || mg.Contains("loan") ||
                mg.Contains("note") || mg.Contains("equity") || mg.Contains("capital") ||
                mg.Contains("financing") || name.Contains("loan") || type.Contains("equity"))
                return "financing";
        }

        return null;
    }

    private static bool IsFinancingCreditNormal(ChartofAccounts coa)
    {
        var type = (coa.AccountType ?? "").ToLowerInvariant();
        return type.Contains("liabilit") || type.Contains("equity");
    }
}
