namespace CimmpleAPI.Services
{
    public static class ReportDateRangeHelper
    {
        public static (DateTime startDate, DateTime endDate) Resolve(
            string? dateRange,
            string? customStartDate = null,
            string? customEndDate = null,
            DateTime? asOfLocal = null)
        {
            var now = asOfLocal ?? DateTime.Now;
            var today = now.Date;

            if (!string.IsNullOrWhiteSpace(dateRange) &&
                dateRange.Equals("Custom", StringComparison.OrdinalIgnoreCase) &&
                DateTime.TryParse(customStartDate, out var custStart) &&
                DateTime.TryParse(customEndDate, out var custEnd))
            {
                if (custEnd.Date < custStart.Date)
                    return (custEnd.Date, custStart.Date);
                return (custStart.Date, custEnd.Date);
            }

            switch ((dateRange ?? "").ToLowerInvariant())
            {
                case "this week":
                    {
                        var start = today.AddDays(-(int)today.DayOfWeek);
                        return (start, today);
                    }
                case "this month":
                    return (new DateTime(today.Year, today.Month, 1), today);
                case "last month":
                    {
                        var start = new DateTime(today.Year, today.Month, 1).AddMonths(-1);
                        var end = new DateTime(today.Year, today.Month, 1).AddDays(-1);
                        return (start, end);
                    }
                case "this quarter":
                    {
                        var q = (today.Month - 1) / 3;
                        var start = new DateTime(today.Year, q * 3 + 1, 1);
                        return (start, today);
                    }
                case "last quarter":
                    {
                        var currentQuarter = (today.Month - 1) / 3;
                        if (currentQuarter == 0)
                            return (new DateTime(today.Year - 1, 10, 1), new DateTime(today.Year - 1, 12, 31));
                        var prevQ = currentQuarter - 1;
                        var start = new DateTime(today.Year, prevQ * 3 + 1, 1);
                        return (start, start.AddMonths(3).AddDays(-1));
                    }
                case "this year":
                    return (new DateTime(today.Year, 1, 1), today);
                case "last year":
                    return (new DateTime(today.Year - 1, 1, 1), new DateTime(today.Year - 1, 12, 31));
                default:
                    return (new DateTime(today.Year, today.Month, 1), today);
            }
        }
    }
}
