using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text.Json;
using CimmpleAPI.Controllers;

namespace CimmpleAPI.Utilities
{
    /// <summary>
    /// Shared Job Order tracking rules used when persisting routing-step progress.
    /// Does not enforce operation sequence — small shops often run ops out of order.
    /// </summary>
    public static class JobOrderTrackingHelper
    {
        /// <summary>
        /// Prevents a stale client save from wiping step notes / NCR flags when the
        /// incoming step has an empty list but the stored JSON already has data.
        /// </summary>
        public static void PreserveStepAnnotations(
            string? existingRoutingStepsJson,
            IList<JobOrderRoutingStepDto>? incoming)
        {
            if (incoming == null || incoming.Count == 0 || string.IsNullOrWhiteSpace(existingRoutingStepsJson))
                return;

            List<JobOrderRoutingStepDto>? existing;
            try
            {
                existing = JsonSerializer.Deserialize<List<JobOrderRoutingStepDto>>(
                    existingRoutingStepsJson,
                    new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
            }
            catch
            {
                return;
            }

            if (existing == null || existing.Count == 0)
                return;

            var byId = existing
                .GroupBy(s => s.id)
                .ToDictionary(g => g.Key, g => g.First());

            foreach (var step in incoming)
            {
                if (!byId.TryGetValue(step.id, out var prev))
                    continue;

                if ((step.notes == null || step.notes.Count == 0) &&
                    prev.notes != null && prev.notes.Count > 0)
                {
                    step.notes = prev.notes;
                }

                // null = omitted/stale client payload → preserve.
                // empty list = intentional clear (e.g. NCR deleted from the step).
                if (step.ncrFlags == null &&
                    prev.ncrFlags != null && prev.ncrFlags.Count > 0)
                {
                    step.ncrFlags = prev.ncrFlags;
                }
            }
        }

        public static string DeriveJobStatus(string currentStatus, IList<JobOrderRoutingStepDto> steps)
        {
            var status = string.IsNullOrWhiteSpace(currentStatus) ? "Draft" : currentStatus.Trim();

            if (status.Equals("Cancelled", StringComparison.OrdinalIgnoreCase))
                return status;

            // Shipping statuses are authoritative once set — do not overwrite from step progress.
            if (status.Equals("Partially Shipped", StringComparison.OrdinalIgnoreCase) ||
                status.Equals("Shipped", StringComparison.OrdinalIgnoreCase))
                return status;

            if (steps == null || steps.Count == 0)
                return status;

            var allCompleted = steps.All(s =>
                string.Equals(s.status, "Completed", StringComparison.OrdinalIgnoreCase));
            if (allCompleted)
                return "Completed";

            // A reopened / incomplete step must move the job out of Completed.
            if (status.Equals("Completed", StringComparison.OrdinalIgnoreCase))
                return "In Progress";

            var anyStarted = steps.Any(s =>
                string.Equals(s.progressState, "running", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(s.progressState, "paused", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(s.progressState, "stopped", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(s.status, "In Progress", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(s.status, "Completed", StringComparison.OrdinalIgnoreCase));

            if (anyStarted && status.Equals("Draft", StringComparison.OrdinalIgnoreCase))
                return "In Progress";

            return status;
        }

        /// <summary>
        /// For running steps, fold wall-clock time since startTime into elapsedSeconds
        /// (and legacy elapsedTime minutes) and reset startTime to now.
        /// </summary>
        public static void CommitLiveElapsed(IList<JobOrderRoutingStepDto> steps, DateTime utcNow)
        {
            if (steps == null) return;

            foreach (var step in steps)
            {
                if (!string.Equals(step.progressState, "running", StringComparison.OrdinalIgnoreCase))
                    continue;
                if (string.IsNullOrWhiteSpace(step.startTime))
                    continue;

                if (!TryParseStartTime(step.startTime, out var startedAt))
                    continue;

                var baseSeconds = GetCommittedSeconds(step);
                var liveSeconds = (int)Math.Max(0, Math.Floor((utcNow - startedAt.ToUniversalTime()).TotalSeconds));
                var total = baseSeconds + liveSeconds;
                step.elapsedSeconds = total;
                step.elapsedTime = total / 60;
                step.startTime = utcNow.ToString("o", CultureInfo.InvariantCulture);
            }
        }

        private static int GetCommittedSeconds(JobOrderRoutingStepDto step)
        {
            if (step.elapsedSeconds.HasValue && step.elapsedSeconds.Value >= 0)
                return step.elapsedSeconds.Value;
            return (step.elapsedTime ?? 0) * 60;
        }

        private static bool TryParseStartTime(string value, out DateTime result)
        {
            if (DateTime.TryParse(
                    value,
                    CultureInfo.InvariantCulture,
                    DateTimeStyles.RoundtripKind,
                    out result))
            {
                return true;
            }

            return DateTime.TryParse(value, out result);
        }
    }
}
