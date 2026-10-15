using CimmpleAPI.Services;

namespace CimmpleAPI.Tests;

public class FinancialReportPdfServiceTests
{
    private static ProfitLossGlReportService.ResultDto SamplePl()
    {
        ProfitLossGlReportService.SectionDto Section(string id, string title, params (string Code, string Name, decimal Amount)[] lines) => new()
        {
            SectionId = id,
            Title = title,
            Lines = lines.Select((l, i) => new ProfitLossGlReportService.LineDto
            {
                AccountId = i + 1,
                AccountCode = l.Code,
                AccountName = l.Name,
                Amount = l.Amount
            }).ToList(),
            Subtotal = lines.Sum(l => l.Amount)
        };

        return new ProfitLossGlReportService.ResultDto
        {
            PeriodStart = "2026-10-01",
            PeriodEnd = "2026-10-31",
            HasJournalActivity = true,
            Sections = new()
            {
                Section("revenue", "Revenue", ("4000", "Sales", 1000m)),
                Section("costOfGoodsSold", "Cost of goods sold", ("5000", "Direct Materials", 400m)),
                Section("operatingExpenses", "Selling, general & administrative", ("6200", "Salaries", 200m)),
                Section("researchAndDevelopment", "Research & development"),
                Section("otherIncome", "Other income", ("8010", "Interest Income", 50m)),
                Section("otherExpense", "Other expense", ("8000", "Interest Expense", 20m)),
                Section("incomeTax", "Income tax expense"),
            },
            NetRevenue = 1000m,
            TotalCostOfGoodsSold = 400m,
            GrossProfit = 600m,
            TotalOperatingExpenses = 200m,
            TotalOperatingExpensesAll = 200m,
            OperatingIncome = 400m,
            TotalOtherIncome = 50m,
            TotalOtherExpense = 20m,
            NetOtherIncome = 30m,
            IncomeBeforeTax = 430m,
            NetIncome = 430m,
        };
    }

    [Fact]
    public void BuildCsv_ProfitLoss_UsesStandardMultiStepOrder()
    {
        var csv = FinancialReportPdfService.BuildCsv(SamplePl());
        var lines = csv.Split('\n').Select(l => l.TrimEnd('\r')).ToList();

        Assert.DoesNotContain(lines, l => l.StartsWith("Company"));
        Assert.Contains("Account Code,Line,Amount", lines);

        string[] expectedOrder =
        {
            ",Revenue,",
            "4000,  Sales,1000",
            ",Total Revenue,1000",
            ",Cost of Goods Sold,",
            ",Gross Profit,600",
            ",Operating Expenses,",
            ",Total Operating Expenses,200",
            ",Operating Income,400",
            "8000,  Interest Expense,-20",
            ",Net Other Income / (Expense),30",
            ",Income Before Tax,430",
            ",Net Income,430",
        };
        var last = -1;
        foreach (var expected in expectedOrder)
        {
            var idx = lines.IndexOf(expected);
            Assert.True(idx > last, $"Expected '{expected}' after index {last}, found at {idx}.");
            last = idx;
        }

        Assert.DoesNotContain(lines, l => l.Contains("Research & Development"));
        Assert.DoesNotContain(lines, l => l.Contains("Income Tax Expense"));
    }

    [Fact]
    public void BuildPdf_ProfitLoss_Renders()
    {
        var bytes = FinancialReportPdfService.BuildPdf("profit-loss", SamplePl());
        Assert.True(bytes.Length > 1000);
    }
}
