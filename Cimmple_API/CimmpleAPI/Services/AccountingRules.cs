using System;
using System.Collections.Generic;
using System.Linq;

namespace CimmpleAPI.Services
{
    /// <summary>
    /// Pure Accounting calculation / rule helpers (unit-testable, no DbContext).
    /// </summary>
    public static class AccountingRules
    {
        /// <summary>
        /// Fiscal year window for "this year" / "last year" style filters.
        /// <paramref name="fiscalYearStart"/> is MM-DD (e.g. 04-01).
        /// <paramref name="asOf"/> is "today" for non-calendar FY resolution.
        /// <paramref name="calendarYearHint"/> is typically asOf.Year or asOf.Year-1.
        /// </summary>
        public static (DateTime start, DateTime end) GetFiscalYearBounds(
            string? fiscalYearStart,
            int calendarYearHint,
            DateTime asOf)
        {
            var fy = string.IsNullOrWhiteSpace(fiscalYearStart) ? "01-01" : fiscalYearStart.Trim();
            var parts = fy.Split('-', StringSplitOptions.RemoveEmptyEntries);
            var month = 1;
            var day = 1;
            if (parts.Length >= 2 &&
                int.TryParse(parts[0], out var m) && m >= 1 && m <= 12 &&
                int.TryParse(parts[1], out var d) && d >= 1 && d <= 31)
            {
                month = m;
                day = Math.Min(d, DateTime.DaysInMonth(Math.Max(1, calendarYearHint), m));
            }

            asOf = asOf.Date;
            DateTime start;
            if (month == 1 && day == 1)
            {
                start = SafeDate(calendarYearHint, month, day);
            }
            else
            {
                var candidateStart = SafeDate(asOf.Year, month, day);
                if (asOf < candidateStart)
                    candidateStart = SafeDate(asOf.Year - 1, month, day);

                if (calendarYearHint == asOf.Year)
                    start = candidateStart;
                else if (calendarYearHint == asOf.Year - 1)
                    start = candidateStart.AddYears(-1);
                else
                    start = SafeDate(calendarYearHint, month, day);
            }

            var end = start.AddYears(1).AddDays(-1);
            return (start, end);
        }

        public static DateTime SafeDate(int year, int month, int day)
        {
            year = Math.Max(1, year);
            month = Math.Clamp(month, 1, 12);
            day = Math.Min(Math.Max(1, day), DateTime.DaysInMonth(year, month));
            return new DateTime(year, month, day);
        }

        /// <summary>
        /// Open balance for aging / AR-AP: never negative; voids should be filtered before calling.
        /// </summary>
        public static decimal OpenBalance(decimal totalAmount, decimal paidAmount) =>
            Math.Max(0m, totalAmount - paidAmount);

        public static bool IsFullyPaid(decimal totalAmount, decimal paidAmount, decimal epsilon = 0.009m) =>
            paidAmount >= totalAmount - epsilon;

        /// <summary>
        /// AP approval gate: when a limit exists, invoice total must be &lt;= limit.
        /// No limit configured → allowed (caller decides whether missing role means allow).
        /// </summary>
        public static bool CanApproveInvoice(decimal invoiceTotal, decimal? approvalLimitAmount)
        {
            if (!approvalLimitAmount.HasValue)
                return true;
            return invoiceTotal <= approvalLimitAmount.Value;
        }

        /// <summary>
        /// Bank statement sign: customer payments / deposits are credits; others are debits.
        /// </summary>
        public static (decimal signedAmount, bool isCredit) MapBankTransactionSign(
            decimal amount,
            int? isCustomer,
            string? transactionType)
        {
            var isCredit = isCustomer == 1 ||
                           string.Equals(transactionType, "Deposit", StringComparison.OrdinalIgnoreCase);
            var signed = isCredit ? amount : -Math.Abs(amount);
            return (signed, isCredit);
        }

        public static bool IsBankCashTransactionType(string? transactionType)
        {
            if (string.IsNullOrWhiteSpace(transactionType))
                return false;
            return transactionType.Equals("Payment", StringComparison.OrdinalIgnoreCase)
                || transactionType.Equals("Deposit", StringComparison.OrdinalIgnoreCase)
                || transactionType.Equals("Withdrawal", StringComparison.OrdinalIgnoreCase);
        }

        public readonly struct AgingItem
        {
            public AgingItem(DateTime dueDate, decimal balance)
            {
                DueDate = dueDate.Date;
                Balance = balance;
            }

            public DateTime DueDate { get; }
            public decimal Balance { get; }
        }

        public readonly struct AgingBucket
        {
            public AgingBucket(string name, decimal amount)
            {
                Name = name;
                Amount = amount;
            }

            public string Name { get; }
            public decimal Amount { get; }
            public decimal Percentage(decimal total) =>
                total > 0 ? amountPct(total) : 0m;

            private decimal amountPct(decimal total) => Amount / total * 100m;
        }

        /// <summary>
        /// Standard AR/AP aging buckets from open balances (already exclude voids / fully paid).
        /// </summary>
        public static IReadOnlyList<AgingBucket> CalculateAgingBuckets(
            IEnumerable<AgingItem> items,
            DateTime asOf)
        {
            asOf = asOf.Date;
            var list = items?.ToList() ?? new List<AgingItem>();

            decimal SumWhere(Func<AgingItem, bool> pred) =>
                list.Where(pred).Sum(i => i.Balance);

            var current = SumWhere(i => i.DueDate >= asOf);
            var d1 = SumWhere(i => i.DueDate < asOf && i.DueDate >= asOf.AddDays(-30));
            var d2 = SumWhere(i => i.DueDate < asOf.AddDays(-30) && i.DueDate >= asOf.AddDays(-60));
            var d3 = SumWhere(i => i.DueDate < asOf.AddDays(-60) && i.DueDate >= asOf.AddDays(-90));
            var d4 = SumWhere(i => i.DueDate < asOf.AddDays(-90));

            return new[]
            {
                new AgingBucket("Current", current),
                new AgingBucket("1-30 Days", d1),
                new AgingBucket("31-60 Days", d2),
                new AgingBucket("61-90 Days", d3),
                new AgingBucket("Over 90 Days", d4)
            };
        }

        /// <summary>
        /// Due date from invoice date + payment term days (when term is selected).
        /// </summary>
        public static DateTime DueDateFromTerm(DateTime invoiceDate, int termDays) =>
            invoiceDate.Date.AddDays(Math.Max(0, termDays));
    }
}
