using CimmpleAPI.Data.Models;

namespace CimmpleAPI.Services
{
    public static class ReportScheduleTiming
    {
        /// <summary>IANA ↔ Windows id pairs for tenant SystemSettings values.</summary>
        private static readonly (string Iana, string Windows)[] TimeZonePairs =
        {
            ("America/New_York", "Eastern Standard Time"),
            ("America/Chicago", "Central Standard Time"),
            ("America/Denver", "Mountain Standard Time"),
            ("America/Los_Angeles", "Pacific Standard Time"),
            ("America/Phoenix", "US Mountain Standard Time"),
            ("America/Toronto", "Eastern Standard Time"),
            ("America/Vancouver", "Pacific Standard Time"),
            ("Europe/London", "GMT Standard Time"),
            ("Europe/Paris", "Romance Standard Time"),
            ("Europe/Berlin", "W. Europe Standard Time"),
            ("Asia/Kolkata", "India Standard Time"),
            ("Asia/Calcutta", "India Standard Time"),
            ("Asia/Dubai", "Arabian Standard Time"),
            ("Asia/Singapore", "Singapore Standard Time"),
            ("Asia/Tokyo", "Tokyo Standard Time"),
            ("Australia/Sydney", "AUS Eastern Standard Time"),
            ("Pacific/Auckland", "New Zealand Standard Time"),
            ("UTC", "UTC"),
            ("Etc/UTC", "UTC"),
        };

        public static DateTime ComputeNextRunUtc(ReportSchedule schedule, DateTime? afterUtc = null)
        {
            var tz = ResolveTimeZone(schedule.TimeZoneId);
            var after = afterUtc ?? DateTime.UtcNow;
            if (after.Kind == DateTimeKind.Unspecified)
                after = DateTime.SpecifyKind(after, DateTimeKind.Utc);
            else if (after.Kind == DateTimeKind.Local)
                after = after.ToUniversalTime();

            var localAfter = TimeZoneInfo.ConvertTimeFromUtc(after, tz);

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

                if (TryConvertLocalToUtc(candidateLocal, tz, out var utc))
                    return utc;
            }

            return after.AddDays(1);
        }

        /// <summary>
        /// Tenant-local "now" for relative report periods (This Month, etc.).
        /// </summary>
        public static DateTime GetTenantLocalNow(string? timeZoneId, DateTime? utcNow = null)
        {
            var tz = ResolveTimeZone(timeZoneId);
            var utc = utcNow ?? DateTime.UtcNow;
            if (utc.Kind == DateTimeKind.Unspecified)
                utc = DateTime.SpecifyKind(utc, DateTimeKind.Utc);
            else if (utc.Kind == DateTimeKind.Local)
                utc = utc.ToUniversalTime();
            return TimeZoneInfo.ConvertTimeFromUtc(utc, tz);
        }

        public static TimeZoneInfo ResolveTimeZone(string? timeZoneId)
        {
            if (string.IsNullOrWhiteSpace(timeZoneId))
                return TimeZoneInfo.Utc;

            var id = timeZoneId.Trim();

            if (TryFindTimeZone(id, out var direct))
                return direct!;

            foreach (var (iana, windows) in TimeZonePairs)
            {
                if (id.Equals(iana, StringComparison.OrdinalIgnoreCase) &&
                    TryFindTimeZone(windows, out var winTz))
                    return winTz!;
                if (id.Equals(windows, StringComparison.OrdinalIgnoreCase) &&
                    TryFindTimeZone(iana, out var ianaTz))
                    return ianaTz!;
            }

            // Unknown id — do not use server Local (skews multi-tenant schedules).
            return TimeZoneInfo.Utc;
        }

        private static bool TryFindTimeZone(string id, out TimeZoneInfo? tz)
        {
            try
            {
                tz = TimeZoneInfo.FindSystemTimeZoneById(id);
                return true;
            }
            catch (TimeZoneNotFoundException)
            {
                tz = null;
                return false;
            }
            catch (InvalidTimeZoneException)
            {
                tz = null;
                return false;
            }
        }

        /// <summary>
        /// Convert unspecified local wall time to UTC; skip DST spring-forward gaps.
        /// </summary>
        private static bool TryConvertLocalToUtc(DateTime localUnspecified, TimeZoneInfo tz, out DateTime utc)
        {
            var local = DateTime.SpecifyKind(localUnspecified, DateTimeKind.Unspecified);

            // Advance through an invalid DST gap (up to 3 hours).
            for (var attempt = 0; attempt < 4; attempt++)
            {
                var candidate = local.AddHours(attempt);
                if (tz.IsInvalidTime(candidate))
                    continue;

                try
                {
                    // Ambiguous (fall-back): pick the standard/earlier offset.
                    if (tz.IsAmbiguousTime(candidate))
                    {
                        var offsets = tz.GetAmbiguousTimeOffsets(candidate);
                        var offset = offsets.Length > 0
                            ? offsets.Min()
                            : tz.GetUtcOffset(candidate);
                        utc = DateTime.SpecifyKind(candidate - offset, DateTimeKind.Utc);
                        return true;
                    }

                    utc = TimeZoneInfo.ConvertTimeToUtc(candidate, tz);
                    return true;
                }
                catch (ArgumentException)
                {
                    // Keep trying next hour.
                }
            }

            utc = default;
            return false;
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
