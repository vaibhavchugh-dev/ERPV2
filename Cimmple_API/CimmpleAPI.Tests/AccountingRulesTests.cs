using CimmpleAPI.Services;

namespace CimmpleAPI.Tests;

public class AccountingRulesTests
{
    [Theory]
    [InlineData("01-01", 2026, "2026-06-15", "2026-01-01", "2026-12-31")]
    [InlineData("01-01", 2025, "2026-06-15", "2025-01-01", "2025-12-31")]
    public void GetFiscalYearBounds_CalendarYear_UsesJan1(
        string fyStart,
        int hint,
        string asOf,
        string expectedStart,
        string expectedEnd)
    {
        var (start, end) = AccountingRules.GetFiscalYearBounds(
            fyStart, hint, DateTime.Parse(asOf));

        Assert.Equal(DateTime.Parse(expectedStart), start);
        Assert.Equal(DateTime.Parse(expectedEnd), end);
    }

    [Fact]
    public void GetFiscalYearBounds_AprilFy_ThisYear_BeforeApril_UsesPriorApril()
    {
        // As of 15 Feb 2026 with FY starting Apr 1 → current FY is 2025-04-01 .. 2026-03-31
        var (start, end) = AccountingRules.GetFiscalYearBounds(
            "04-01", calendarYearHint: 2026, asOf: new DateTime(2026, 2, 15));

        Assert.Equal(new DateTime(2025, 4, 1), start);
        Assert.Equal(new DateTime(2026, 3, 31), end);
    }

    [Fact]
    public void GetFiscalYearBounds_AprilFy_ThisYear_AfterApril_UsesCurrentApril()
    {
        var (start, end) = AccountingRules.GetFiscalYearBounds(
            "04-01", calendarYearHint: 2026, asOf: new DateTime(2026, 5, 10));

        Assert.Equal(new DateTime(2026, 4, 1), start);
        Assert.Equal(new DateTime(2027, 3, 31), end);
    }

    [Fact]
    public void GetFiscalYearBounds_AprilFy_LastYear_Hint()
    {
        var (start, end) = AccountingRules.GetFiscalYearBounds(
            "04-01", calendarYearHint: 2025, asOf: new DateTime(2026, 5, 10));

        Assert.Equal(new DateTime(2025, 4, 1), start);
        Assert.Equal(new DateTime(2026, 3, 31), end);
    }

    [Fact]
    public void GetFiscalYearBounds_NullOrBlank_DefaultsToJan1()
    {
        var (start, end) = AccountingRules.GetFiscalYearBounds(
            null, 2026, new DateTime(2026, 8, 1));
        Assert.Equal(new DateTime(2026, 1, 1), start);
        Assert.Equal(new DateTime(2026, 12, 31), end);
    }

    [Theory]
    [InlineData(1000, 0, 1000)]
    [InlineData(1000, 250, 750)]
    [InlineData(1000, 1000, 0)]
    [InlineData(1000, 1200, 0)]
    public void OpenBalance_NeverNegative(decimal total, decimal paid, decimal expected)
    {
        Assert.Equal(expected, AccountingRules.OpenBalance(total, paid));
    }

    [Theory]
    [InlineData(1000, 1000, true)]
    [InlineData(1000, 999.995, true)]
    [InlineData(1000, 500, false)]
    public void IsFullyPaid_UsesEpsilon(decimal total, decimal paid, bool expected)
    {
        Assert.Equal(expected, AccountingRules.IsFullyPaid(total, paid));
    }

    [Theory]
    [InlineData(500, 2500, true)]
    [InlineData(2500, 2500, true)]
    [InlineData(2500.01, 2500, false)]
    public void CanApproveInvoice_RespectsLimit(decimal total, decimal limit, bool expected)
    {
        Assert.Equal(expected, AccountingRules.CanApproveInvoice(total, limit));
    }

    [Fact]
    public void CanApproveInvoice_NoLimit_Allows()
    {
        Assert.True(AccountingRules.CanApproveInvoice(999999m, null));
    }

    [Fact]
    public void MapBankTransactionSign_CustomerPayment_IsCredit()
    {
        var (signed, isCredit) = AccountingRules.MapBankTransactionSign(60m, isCustomer: 1, "Payment");
        Assert.True(isCredit);
        Assert.Equal(60m, signed);
    }

    [Fact]
    public void MapBankTransactionSign_VendorPayment_IsDebit()
    {
        var (signed, isCredit) = AccountingRules.MapBankTransactionSign(80m, isCustomer: 0, "Payment");
        Assert.False(isCredit);
        Assert.Equal(-80m, signed);
    }

    [Fact]
    public void MapBankTransactionSign_Deposit_IsCredit_EvenIfNotCustomer()
    {
        var (signed, isCredit) = AccountingRules.MapBankTransactionSign(50m, isCustomer: null, "Deposit");
        Assert.True(isCredit);
        Assert.Equal(50m, signed);
    }

    [Fact]
    public void MapBankTransactionSign_Withdrawal_IsDebit()
    {
        var (signed, isCredit) = AccountingRules.MapBankTransactionSign(25m, isCustomer: null, "Withdrawal");
        Assert.False(isCredit);
        Assert.Equal(-25m, signed);
    }

    [Theory]
    [InlineData("Payment", true)]
    [InlineData("Deposit", true)]
    [InlineData("Withdrawal", true)]
    [InlineData("Journal", false)]
    [InlineData(null, false)]
    public void IsBankCashTransactionType(string? type, bool expected)
    {
        Assert.Equal(expected, AccountingRules.IsBankCashTransactionType(type));
    }

    [Fact]
    public void CalculateAgingBuckets_SplitsByDueDate_UsesOpenBalance()
    {
        var asOf = new DateTime(2026, 9, 9);
        var items = new[]
        {
            new AccountingRules.AgingItem(asOf.AddDays(5), 100m),   // Current
            new AccountingRules.AgingItem(asOf.AddDays(-10), 200m), // 1-30
            new AccountingRules.AgingItem(asOf.AddDays(-45), 300m), // 31-60
            new AccountingRules.AgingItem(asOf.AddDays(-75), 400m), // 61-90
            new AccountingRules.AgingItem(asOf.AddDays(-120), 500m) // Over 90
        };

        var buckets = AccountingRules.CalculateAgingBuckets(items, asOf);
        Assert.Equal(5, buckets.Count);
        Assert.Equal(100m, buckets[0].Amount);
        Assert.Equal(200m, buckets[1].Amount);
        Assert.Equal(300m, buckets[2].Amount);
        Assert.Equal(400m, buckets[3].Amount);
        Assert.Equal(500m, buckets[4].Amount);

        var total = buckets.Sum(b => b.Amount);
        Assert.Equal(1500m, total);
        Assert.Equal(100m / 1500m * 100m, buckets[0].Percentage(total));
    }

    [Fact]
    public void CalculateAgingBuckets_Empty_AllZero()
    {
        var buckets = AccountingRules.CalculateAgingBuckets(
            Array.Empty<AccountingRules.AgingItem>(), new DateTime(2026, 1, 1));
        Assert.All(buckets, b => Assert.Equal(0m, b.Amount));
    }

    [Fact]
    public void DueDateFromTerm_AddsDays()
    {
        var due = AccountingRules.DueDateFromTerm(new DateTime(2026, 1, 1), 45);
        Assert.Equal(new DateTime(2026, 2, 15), due);
    }
}

public class GlWorkflowServiceTests
{
    [Theory]
    [InlineData("202604", true)]
    [InlineData(" 202604 ", true)]
    [InlineData("2026", false)]
    [InlineData("abcdef", false)]
    [InlineData("", false)]
    [InlineData(null, false)]
    public void TryNormalizePeriodKey(string? input, bool expectedOk)
    {
        var ok = GlWorkflowService.TryNormalizePeriodKey(input, out var key, out var error);
        Assert.Equal(expectedOk, ok);
        if (expectedOk)
        {
            Assert.Equal("202604", key);
            Assert.Null(error);
        }
        else
        {
            Assert.False(string.IsNullOrWhiteSpace(error));
        }
    }

    [Fact]
    public void PeriodKeyFromDate_FormatsYyyyMm()
    {
        Assert.Equal("202609", GlWorkflowService.PeriodKeyFromDate(new DateTime(2026, 9, 9)));
        Assert.Equal("202601", GlWorkflowService.PeriodKeyFromDate(new DateTime(2026, 1, 31)));
    }
}
