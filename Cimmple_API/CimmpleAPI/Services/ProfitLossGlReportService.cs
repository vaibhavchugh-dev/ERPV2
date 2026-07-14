using CimmpleAPI.Data;
using CimmpleAPI.Data.Models;
using Microsoft.EntityFrameworkCore;

namespace CimmpleAPI.Services;

/// <summary>
/// Builds a multi-step P&amp;L from posted journal activity (accrual / GL basis).
/// </summary>
public static class ProfitLossGlReportService
{
    private const decimal Epsilon = 0.0001m;

    public sealed class LineDto
    {
        public string AccountCode { get; set; } = "";
        public string AccountName { get; set; } = "";
        /// <summary>Economic sign: revenue increases profit (credit-normal); expenses as positive costs.</summary>
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
        public string ReportType { get; set; } = "Profit & Loss Statement";
        public string ReportBasis { get; set; } = "accrual-gl";
        public string PeriodStart { get; set; } = "";
        public string PeriodEnd { get; set; } = "";
        public bool HasJournalActivity { get; set; }
        /// <summary>Number of journal headers in the period (for troubleshooting empty reports).</summary>
        public int JournalEntryCount { get; set; }
        /// <summary>Populated when there is no GL activity in range.</summary>
        public string? SummaryNote { get; set; }
        public List<SectionDto> Sections { get; set; } = new();

        public decimal NetRevenue { get; set; }
        public decimal TotalCostOfGoodsSold { get; set; }
        public decimal GrossProfit { get; set; }
        public decimal TotalOperatingExpenses { get; set; }
        public decimal TotalResearchAndDevelopment { get; set; }
        public decimal TotalOtherIncome { get; set; }
        public decimal TotalOtherExpense { get; set; }
        public decimal TotalIncomeTax { get; set; }
        public decimal OperatingIncome { get; set; }
        public decimal IncomeBeforeTax { get; set; }
        public decimal NetIncome { get; set; }

        /// <summary>Legacy flat fields for older clients.</summary>
        public decimal Revenue { get; set; }
        public decimal CostOfGoodsSold { get; set; }
        public decimal OperatingExpenses { get; set; }
    }

    public static ResultDto Build(CimmpleDbContext db, int tenantId, DateTime startDate, DateTime endDate)
    {
        var endInclusive = endDate.Date.AddDays(1).AddTicks(-1);

        var journalIds = db.JournalEntries.AsNoTracking()
            .Where(je => je.TenantId == tenantId
                         && je.EntryDate >= startDate.Date
                         && je.EntryDate <= endInclusive)
            .Select(je => je.Id)
            .ToList();

        var debitsByAccount = db.JournalEntryFrom.AsNoTracking()
            .Where(jf => journalIds.Contains(jf.JournalEntryId))
            .GroupBy(jf => jf.AccountId)
            .Select(g => new { AccountId = g.Key, Amount = g.Sum(x => x.Amount) })
            .ToDictionary(x => x.AccountId, x => x.Amount);

        var creditsByAccount = db.JournalEntryTo.AsNoTracking()
            .Where(jt => journalIds.Contains(jt.JournalEntryId))
            .GroupBy(jt => jt.AccountId)
            .Select(g => new { AccountId = g.Key, Amount = g.Sum(x => x.Amount) })
            .ToDictionary(x => x.AccountId, x => x.Amount);

        var hasActivity = debitsByAccount.Count > 0 || creditsByAccount.Count > 0;
        var journalEntryCount = journalIds.Count;

        var accountIds = debitsByAccount.Keys.Union(creditsByAccount.Keys).ToHashSet();
        var coaRows = db.ChartofAccounts.AsNoTracking()
            .Where(c => c.Tenantid == tenantId && accountIds.Contains(c.AccountID))
            .ToList();

        var coaById = coaRows.ToDictionary(c => c.AccountID);

        var buckets = new Dictionary<string, List<LineDto>>(StringComparer.OrdinalIgnoreCase)
        {
            ["revenue"] = new List<LineDto>(),
            ["costOfGoodsSold"] = new List<LineDto>(),
            ["operatingExpenses"] = new List<LineDto>(),
            ["researchAndDevelopment"] = new List<LineDto>(),
            ["otherIncome"] = new List<LineDto>(),
            ["otherExpense"] = new List<LineDto>(),
            ["incomeTax"] = new List<LineDto>(),
        };

        foreach (var id in accountIds.OrderBy(x => x))
        {
            if (!coaById.TryGetValue(id, out var coa) || !coa.IsActive)
                continue;

            var deb = debitsByAccount.GetValueOrDefault(id);
            var cr = creditsByAccount.GetValueOrDefault(id);
            var section = ClassifySection(coa);
            if (section == null)
                continue;

            var net = NetPlAmount(coa, deb, cr);
            if (Math.Abs(net) < Epsilon)
                continue;

            buckets[section].Add(new LineDto
            {
                AccountCode = coa.AccountCode ?? "",
                AccountName = coa.AccountName ?? "",
                Amount = net
            });
        }

        foreach (var list in buckets.Values)
            list.Sort((a, b) => string.Compare(a.AccountCode, b.AccountCode, StringComparison.OrdinalIgnoreCase));

        string Title(string key) => key switch
        {
            "revenue" => "Revenue",
            "costOfGoodsSold" => "Cost of goods sold",
            "operatingExpenses" => "Selling, general & administrative",
            "researchAndDevelopment" => "Research & development",
            "otherIncome" => "Other income",
            "otherExpense" => "Other expense",
            "incomeTax" => "Income tax expense",
            _ => key
        };

        var sections = new List<SectionDto>();
        foreach (var key in new[] { "revenue", "costOfGoodsSold", "operatingExpenses", "researchAndDevelopment", "otherIncome", "otherExpense", "incomeTax" })
        {
            var lines = buckets[key];
            var sub = lines.Sum(l => l.Amount);
            sections.Add(new SectionDto
            {
                SectionId = key,
                Title = Title(key),
                Lines = lines,
                Subtotal = sub
            });
        }

        var netRevenue = sections.First(s => s.SectionId == "revenue").Subtotal;
        var totalCogs = sections.First(s => s.SectionId == "costOfGoodsSold").Subtotal;
        var totalOpEx = sections.First(s => s.SectionId == "operatingExpenses").Subtotal;
        var totalRd = sections.First(s => s.SectionId == "researchAndDevelopment").Subtotal;
        var totalOtherIncome = sections.First(s => s.SectionId == "otherIncome").Subtotal;
        var totalOtherExpense = sections.First(s => s.SectionId == "otherExpense").Subtotal;
        var totalTax = sections.First(s => s.SectionId == "incomeTax").Subtotal;

        // COGS and operating expenses are stored as positive magnitudes; subtract from profit.
        var grossProfit = netRevenue - totalCogs;
        var operatingIncome = grossProfit - totalOpEx - totalRd;
        var incomeBeforeTax = operatingIncome + totalOtherIncome - totalOtherExpense;
        var netIncome = incomeBeforeTax - totalTax;

        var summaryNote = !hasActivity
            ? "No posted journal lines in this period for this tenant. This report is accrual (general ledger) only—it does not pull revenue or costs from invoices. Add journal entries that debit/credit Revenue and Expense accounts, or choose a date range that includes posted activity."
            : null;

        return new ResultDto
        {
            ReportType = "Profit & Loss Statement",
            PeriodStart = startDate.ToString("yyyy-MM-dd"),
            PeriodEnd = endDate.ToString("yyyy-MM-dd"),
            HasJournalActivity = hasActivity,
            JournalEntryCount = journalEntryCount,
            SummaryNote = summaryNote,
            Sections = sections,
            NetRevenue = netRevenue,
            TotalCostOfGoodsSold = totalCogs,
            GrossProfit = grossProfit,
            TotalOperatingExpenses = totalOpEx,
            TotalResearchAndDevelopment = totalRd,
            TotalOtherIncome = totalOtherIncome,
            TotalOtherExpense = totalOtherExpense,
            TotalIncomeTax = totalTax,
            OperatingIncome = operatingIncome,
            IncomeBeforeTax = incomeBeforeTax,
            NetIncome = netIncome,
            Revenue = netRevenue,
            CostOfGoodsSold = totalCogs,
            OperatingExpenses = totalOpEx + totalRd
        };
    }

    /// <summary>Maps COA to P&amp;L bucket; excludes balance-sheet types.</summary>
    private static string? ClassifySection(ChartofAccounts coa)
    {
        var t = (coa.AccountType ?? "").Trim();
        var m = (coa.MainGroup ?? "").Trim();
        var ml = m.ToLowerInvariant();

        if (t.Equals("Revenue", StringComparison.OrdinalIgnoreCase))
        {
            if (ml.Contains("other income") || ml.Contains("interest income") || m.Contains("Gain/", StringComparison.OrdinalIgnoreCase)
                || m.Contains("Gains/", StringComparison.OrdinalIgnoreCase))
                return "otherIncome";
            return "revenue";
        }

        if (t.Equals("Expense", StringComparison.OrdinalIgnoreCase))
        {
            if (ml.Contains("income tax") || ml.Contains("franchise tax"))
                return "incomeTax";
            if (ml.Contains("interest expense") || ml.Contains("other expense"))
                return "otherExpense";
            if (ml.Contains("research") || ml.Contains("r&d") || ml.Contains("r and d"))
                return "researchAndDevelopment";
            if (ml.Contains("cost of goods") || ml.Contains("cogs") || ml.Contains("manufacturing overhead"))
                return "costOfGoodsSold";
            if (ml.Contains("operating") || ml.Contains("general") || ml.Contains("administrative")
                || ml.Contains("selling") || ml.Contains("operting") || ml.Contains("warehouse")
                || ml.Contains("marketing") || ml.Contains("office"))
                return "operatingExpenses";

            // Default: treat unclassified expenses as SG&A so they still appear on P&L.
            return "operatingExpenses";
        }

        return null;
    }

    /// <summary>Credit-normal (revenue): credits − debits. Debit-normal (expense): debits − credits.</summary>
    private static decimal NetPlAmount(ChartofAccounts coa, decimal debits, decimal credits)
    {
        var t = (coa.AccountType ?? "").Trim();
        if (t.Equals("Revenue", StringComparison.OrdinalIgnoreCase))
            return credits - debits;
        if (t.Equals("Expense", StringComparison.OrdinalIgnoreCase))
            return debits - credits;
        return 0;
    }
}
