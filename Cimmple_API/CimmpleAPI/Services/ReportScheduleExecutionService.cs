using CimmpleAPI.Data;
using CimmpleAPI.Data.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace CimmpleAPI.Services
{
    public class ReportScheduleExecutionService
    {
        private readonly CimmpleDbContext _context;
        private readonly EmailOutboxService _emailOutbox;
        private readonly ILogger<ReportScheduleExecutionService> _logger;

        public ReportScheduleExecutionService(
            CimmpleDbContext context,
            EmailOutboxService emailOutbox,
            ILogger<ReportScheduleExecutionService> logger)
        {
            _context = context;
            _emailOutbox = emailOutbox;
            _logger = logger;
        }

        public async Task ProcessDueSchedulesAsync(CancellationToken cancellationToken = default)
        {
            var now = DateTime.UtcNow;
            var due = await _context.ReportSchedules
                .Where(s => s.IsEnabled && s.NextRunUtc != null && s.NextRunUtc <= now)
                .OrderBy(s => s.NextRunUtc)
                .Take(20)
                .ToListAsync(cancellationToken);

            foreach (var schedule in due)
            {
                if (cancellationToken.IsCancellationRequested)
                    break;
                await ExecuteAsync(schedule, cancellationToken);
            }
        }

        public async Task<(bool ok, string? error)> ExecuteAsync(
            ReportSchedule schedule,
            CancellationToken cancellationToken = default)
        {
            try
            {
                var attachment = ReportAttachmentBuilder.Build(_context, schedule);
                if (!attachment.Ok)
                {
                    await MarkFailureAsync(schedule, attachment.Error ?? "Failed to generate report.");
                    return (false, attachment.Error);
                }

                var reportLabel = string.IsNullOrWhiteSpace(schedule.ReportName)
                    ? schedule.ReportType
                    : schedule.ReportName;
                var subject = !string.IsNullOrWhiteSpace(schedule.Subject)
                    ? schedule.Subject!.Trim()
                    : $"Scheduled report: {reportLabel}";

                var body =
                    $"<p>Your scheduled report <strong>{System.Net.WebUtility.HtmlEncode(reportLabel)}</strong> is attached.</p>" +
                    $"<p>Period: {System.Net.WebUtility.HtmlEncode(schedule.DateRange ?? "")}" +
                    (string.Equals(schedule.DateRange, "Custom", StringComparison.OrdinalIgnoreCase)
                        ? $" ({System.Net.WebUtility.HtmlEncode(schedule.CustomStartDate)} → {System.Net.WebUtility.HtmlEncode(schedule.CustomEndDate)})"
                        : "") +
                    ".</p>" +
                    "<p>This email was sent automatically by Cimmple ERP.</p>";

                var mail = new MailRequest
                {
                    To = schedule.ToEmails,
                    Cc = schedule.CcEmails,
                    Subject = subject,
                    Body = body,
                    IsHtml = true,
                    Attachments = new List<EmailAttachment>
                    {
                        new()
                        {
                            FileName = attachment.FileName,
                            Content = attachment.Content,
                            ContentType = attachment.ContentType
                        }
                    }
                };

                var (ok, error) = await _emailOutbox.EnqueueAsync(schedule.TenantId, mail);
                if (!ok)
                {
                    await MarkFailureAsync(schedule, error ?? "Failed to queue email.");
                    return (false, error);
                }

                await MarkQueuedAsync(schedule);
                return (true, null);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Scheduled report {ScheduleId} failed", schedule.Id);
                await MarkFailureAsync(schedule, ex.Message);
                return (false, ex.Message);
            }
        }

        private async Task MarkQueuedAsync(ReportSchedule schedule)
        {
            var now = DateTime.UtcNow;
            schedule.LastRunUtc = now;
            // Queued = report generated and email accepted by outbox (not necessarily delivered yet).
            schedule.LastRunStatus = "Queued";
            schedule.LastRunError = null;
            schedule.NextRunUtc = ReportScheduleTiming.ComputeNextRunUtc(schedule, now);
            schedule.UpdatedUtc = now;
            await _context.SaveChangesAsync();
        }

        private async Task MarkFailureAsync(ReportSchedule schedule, string error)
        {
            var now = DateTime.UtcNow;
            schedule.LastRunUtc = now;
            schedule.LastRunStatus = "Failed";
            schedule.LastRunError = Truncate(error, 2000);
            // Still advance so a permanent failure does not hot-loop every poll.
            schedule.NextRunUtc = ReportScheduleTiming.ComputeNextRunUtc(schedule, now);
            schedule.UpdatedUtc = now;
            await _context.SaveChangesAsync();
        }

        private static string Truncate(string value, int max) =>
            value.Length <= max ? value : value[..max];
    }
}
