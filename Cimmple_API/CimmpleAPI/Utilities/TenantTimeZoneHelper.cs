using System;
using System.Collections.Generic;

namespace CimmpleAPI.Utilities
{
    /// <summary>Resolves tenant IANA / Windows timezone ids for attendance punch rules.</summary>
    public static class TenantTimeZoneHelper
    {
        public const int EndOfDayPunchHour = 17;

        private static readonly Dictionary<string, string> IanaToWindows = new(StringComparer.OrdinalIgnoreCase)
        {
            ["Asia/Kolkata"] = "India Standard Time",
            ["Asia/Calcutta"] = "India Standard Time",
            ["America/New_York"] = "Eastern Standard Time",
            ["America/Chicago"] = "Central Standard Time",
            ["America/Denver"] = "Mountain Standard Time",
            ["America/Los_Angeles"] = "Pacific Standard Time",
            ["Europe/London"] = "GMT Standard Time",
            ["Europe/Paris"] = "Romance Standard Time",
            ["Europe/Berlin"] = "W. Europe Standard Time",
            ["Australia/Sydney"] = "AUS Eastern Standard Time",
        };

        public static TimeZoneInfo Resolve(string? timezoneId)
        {
            if (string.IsNullOrWhiteSpace(timezoneId))
            {
                return TimeZoneInfo.Local;
            }

            var id = timezoneId.Trim();

            if (TryFind(id, out var tz))
            {
                return tz;
            }

            if (IanaToWindows.TryGetValue(id, out var windowsId) && TryFind(windowsId, out tz))
            {
                return tz;
            }

            foreach (var pair in IanaToWindows)
            {
                if (string.Equals(pair.Value, id, StringComparison.OrdinalIgnoreCase)
                    && TryFind(pair.Key, out tz))
                {
                    return tz;
                }
            }

            return TimeZoneInfo.Local;
        }

        private static bool TryFind(string id, out TimeZoneInfo timeZone)
        {
            try
            {
                timeZone = TimeZoneInfo.FindSystemTimeZoneById(id);
                return true;
            }
            catch (TimeZoneNotFoundException)
            {
                timeZone = TimeZoneInfo.Utc;
                return false;
            }
            catch (InvalidTimeZoneException)
            {
                timeZone = TimeZoneInfo.Utc;
                return false;
            }
        }

        /// <summary>Before 5:00 PM local → break; at/after 5:00 PM → end-of-day out.</summary>
        public static bool IsAtOrAfterEndOfDay(DateTime localTime) =>
            localTime.TimeOfDay >= TimeSpan.FromHours(EndOfDayPunchHour);
    }
}
