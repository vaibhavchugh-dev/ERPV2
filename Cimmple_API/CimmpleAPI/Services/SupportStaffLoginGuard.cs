using System.Collections.Concurrent;

namespace CimmpleAPI.Services
{
    /// <summary>
    /// In-memory lockout for support-staff login attempts (per username + client IP).
    /// </summary>
    public static class SupportStaffLoginGuard
    {
        private const int MaxAttempts = 5;
        private static readonly TimeSpan LockoutDuration = TimeSpan.FromMinutes(15);

        private static readonly ConcurrentDictionary<string, (int Failures, DateTime? LockedUntilUtc)> Attempts =
            new(StringComparer.OrdinalIgnoreCase);

        public static bool IsLockedOut(string key, out int minutesRemaining)
        {
            minutesRemaining = 0;
            if (!Attempts.TryGetValue(key, out var state) || !state.LockedUntilUtc.HasValue)
            {
                return false;
            }

            if (state.LockedUntilUtc.Value <= DateTime.UtcNow)
            {
                Attempts.TryRemove(key, out _);
                return false;
            }

            minutesRemaining = Math.Max(1, (int)Math.Ceiling((state.LockedUntilUtc.Value - DateTime.UtcNow).TotalMinutes));
            return true;
        }

        public static void RecordFailure(string key)
        {
            Attempts.AddOrUpdate(
                key,
                _ => (1, null),
                (_, prev) =>
                {
                    var failures = prev.Failures + 1;
                    if (failures >= MaxAttempts)
                    {
                        return (failures, DateTime.UtcNow.Add(LockoutDuration));
                    }

                    return (failures, prev.LockedUntilUtc);
                });
        }

        public static void ClearFailures(string key)
        {
            Attempts.TryRemove(key, out _);
        }
    }
}
