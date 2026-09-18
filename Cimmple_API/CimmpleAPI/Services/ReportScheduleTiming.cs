using CimmpleAPI.Data.Models;

namespace CimmpleAPI.Services
{
    public static class ReportScheduleTiming
    {
        public static DateTime ComputeNextRunUtc(ReportSchedule schedule, DateTime? afterUtc = null)
        {
            var tz = ResolveTimeZone(schedule.TimeZoneId);
            var after = afterUtc ?? DateTime.UtcNow;
            var localAfter = TimeZoneInfo.ConvertTimeFromUtc(DateTime.SpecifyKind(after, DateTimeKind.Utc), tz);

            var minutes = Math.Clamp(schedule.TimeOfDayMinutes, 0, 23 * 60 + 59);
            var hour = minutes / 60;
            var minute = minutes % 60;

            var frequency = (schedule.Frequency ?? "Daily").Trim();

            for (var i = 0; i < 800; i++)
            {
                DateTime candidateLocal;
                if (frequency.Equals("Weekly", StringComparison.OrdinalIgnoreCase))
                {
                    var targetDow = schedule.DayOfWeek ?? (int)DayOfWeek.Monday;
                    targetDow = Math.Clamp(targetDow, 0, 6);
                    var day = localAfter.Date.AddDays(i);
                    if ((int)day.DayOfWeek != targetDow)
                        continue;
                    candidateLocal = day.AddHours(hour).AddMinutes(minute);
                }
                else if (frequency.Equals("Monthly", StringComparison.OrdinalIgnoreCase))
                {
                    var targetDom = Math.Clamp(schedule.DayOfMonth ?? 1, 1, 28);
                    var monthStart = new DateTime(localAfter.Year, localAfter.Month, 1).AddMonths(i);
                    var daysInMonth = DateTime.DaysInMonth(monthStart.Year, monthStart.Month);
                    var dayNum = Math.Min(targetDom, daysInMonth);
                    candidateLocal = new DateTime(monthStart.Year, monthStart.Month, dayNum, hour, minute, 0);
                }
                else
                {
                    candidateLocal = localAfter.Date.AddDays(i).AddHours(hour).AddMinutes(minute);
                }

                if (candidateLocal <= localAfter)
                    continue;

                return TimeZoneInfo.ConvertTimeToUtc(DateTime.SpecifyKind(candidateLocal, DateTimeKind.Unspecified), tz);
            }

            return after.AddDays(1);
        }

        public static TimeZoneInfo ResolveTimeZone(string? timeZoneId)
        {
            if (!string.IsNullOrWhiteSpace(timeZoneId))
            {
                try
                {
                    return TimeZoneInfo.FindSystemTimeZoneById(timeZoneId.Trim());
                }
                catch (TimeZoneNotFoundException)
                {
                    // Fall through — IANA ids may need mapping on Windows.
                }
                catch (InvalidTimeZoneException)
                {
                }

                // Common IANA → Windows mappings for tenant SystemSettings values.
                var mapped = timeZoneId.Trim() switch
                {
                    "America/New_York" => "Eastern Standard Time",
                    "America/Chicago" => "Central Standard Time",
                    "America/Denver" => "Mountain Standard Time",
                    "America/Los_Angeles" => "Pacific Standard Time",
                    "America/Phoenix" => "US Mountain Standard Time",
                    "UTC" => "UTC",
                    "Asia/Kolkata" => "India Standard Time",
                    "Asia/Calcutta" => "India Standard Time",
                    _ => null
                };
                if (mapped != null)
                {
                    try { return TimeZoneInfo.FindSystemTimeZoneById(mapped); }
                    catch { /* ignore */ }
                }
            }

            return TimeZoneInfo.Local;
        }

        public static string? ValidateScheduleFields(ReportSchedule schedule)
        {
            if (string.IsNullOrWhiteSpace(schedule.ReportType))
                return "Report type is required.";
            if (string.IsNullOrWhiteSpace(schedule.ToEmails))
                return "At least one recipient email is required.";
            if (EmailService.SplitAddresses(schedule.ToEmails).Count == 0)
                return "Recipient email address is invalid.";

            var freq = (schedule.Frequency ?? "").Trim();
            if (!freq.Equals("Daily", StringComparison.OrdinalIgnoreCase) &&
                !freq.Equals("Weekly", StringComparison.OrdinalIgnoreCase) &&
                !freq.Equals("Monthly", StringComparison.OrdinalIgnoreCase))
                return "Frequency must be Daily, Weekly, or Monthly.";

            if (freq.Equals("Weekly", StringComparison.OrdinalIgnoreCase) &&
                (schedule.DayOfWeek is null or < 0 or > 6))
                return "Weekly schedules require DayOfWeek (0=Sunday … 6=Saturday).";

            if (freq.Equals("Monthly", StringComparison.OrdinalIgnoreCase) &&
                (schedule.DayOfMonth is null or < 1 or > 28))
                return "Monthly schedules require DayOfMonth between 1 and 28.";

            if (schedule.TimeOfDayMinutes < 0 || schedule.TimeOfDayMinutes > 23 * 60 + 59)
                return "TimeOfDayMinutes must be between 0 and 1439.";

            var format = (schedule.Format ?? "").Trim();
            if (!format.Equals("pdf", StringComparison.OrdinalIgnoreCase) &&
                !format.Equals("csv", StringComparison.OrdinalIgnoreCase) &&
                !format.Equals("excel", StringComparison.OrdinalIgnoreCase))
                return "Format must be pdf or csv.";

            if (schedule.DateRange != null &&
                schedule.DateRange.Equals("Custom", StringComparison.OrdinalIgnoreCase) &&
                (string.IsNullOrWhiteSpace(schedule.CustomStartDate) ||
                 string.IsNullOrWhiteSpace(schedule.CustomEndDate) ||
                 !DateTime.TryParse(schedule.CustomStartDate, out _) ||
                 !DateTime.TryParse(schedule.CustomEndDate, out _)))
                return "Custom date range requires valid CustomStartDate and CustomEndDate.";

            return null;
        }
    }
}
