using System.Text.Json;
using CimmpleAPI.Data;
using CimmpleAPI.Data.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace CimmpleAPI.Services
{
    public class EmailOutboxService
    {
        private static readonly JsonSerializerOptions JsonOptions = new()
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase
        };

        private readonly CimmpleDbContext _context;
        private readonly IConfiguration _configuration;
        private readonly ILogger<EmailOutboxService> _logger;

        public EmailOutboxService(
            CimmpleDbContext context,
            IConfiguration configuration,
            ILogger<EmailOutboxService> logger)
        {
            _context = context;
            _configuration = configuration;
            _logger = logger;
        }

        public async Task EnsureSchemaAsync()
        {
            await EmailOutboxSchemaService.EnsureTablesAsync(_context);
        }

        /// <summary>
        /// Enqueues mail for background SMTP send. Returns quickly; does not talk to SMTP.
        /// </summary>
        public async Task<(bool queued, string? error)> EnqueueAsync(
            int tenantId,
            MailRequest request,
            bool skipNotificationGate = false,
            int? relatedNotificationId = null)
        {
            if (tenantId <= 0)
                return (false, "Tenant is required.");
            if (request == null || string.IsNullOrWhiteSpace(request.To))
                return (false, "Recipient email address is missing.");
            if (string.IsNullOrWhiteSpace(request.Subject))
                return (false, "Email subject is required.");

            await EnsureSchemaAsync();

            if (!skipNotificationGate)
            {
                var settings = await _context.SystemSettings.AsNoTracking()
                    .FirstOrDefaultAsync(s => s.TenantId == tenantId);
                if (settings != null && !settings.EnableEmailNotifications)
                    return (false, "Email notifications are disabled in System Settings.");
            }

            string? attachmentsJson = null;
            if (request.Attachments is { Count: > 0 })
            {
                var parts = request.Attachments
                    .Where(a => a?.Content is { Length: > 0 })
                    .Select(a => new EmailOutboxAttachmentDto
                    {
                        FileName = string.IsNullOrWhiteSpace(a.FileName) ? "attachment.bin" : a.FileName.Trim(),
                        ContentType = a.ContentType,
                        ContentBase64 = Convert.ToBase64String(a.Content)
                    })
                    .ToList();
                if (parts.Count > 0)
                    attachmentsJson = JsonSerializer.Serialize(parts, JsonOptions);
            }

            var row = new EmailOutbox
            {
                TenantId = tenantId,
                Status = EmailOutbox.StatusPending,
                ToAddresses = Truncate(request.To.Trim(), 1000),
                CcAddresses = TruncateNullable(request.Cc, 1000),
                Subject = Truncate(request.Subject.Trim(), 300),
                Body = request.Body ?? "",
                IsHtml = request.IsHtml,
                AttachmentsJson = attachmentsJson,
                SkipNotificationGate = skipNotificationGate,
                RelatedNotificationId = relatedNotificationId,
                Attempts = 0,
                MaxAttempts = 5,
                CreatedUtc = DateTime.UtcNow
            };

            _context.EmailOutbox.Add(row);
            await _context.SaveChangesAsync();
            return (true, null);
        }

        /// <summary>Claims and sends a batch of pending outbox rows.</summary>
        public async Task ProcessPendingAsync(CancellationToken cancellationToken)
        {
            await EnsureSchemaAsync();

            var now = DateTime.UtcNow;
            var lockOwner = $"{Environment.MachineName}:{Environment.ProcessId}";
            var lockUntil = now.AddMinutes(5);

            var candidates = await _context.EmailOutbox
                .Where(e =>
                    e.Status == EmailOutbox.StatusPending &&
                    (e.LockedUntilUtc == null || e.LockedUntilUtc < now))
                .OrderBy(e => e.CreatedUtc)
                .Take(10)
                .ToListAsync(cancellationToken);

            if (candidates.Count == 0)
                return;

            foreach (var row in candidates)
            {
                row.Status = EmailOutbox.StatusProcessing;
                row.LockedUntilUtc = lockUntil;
                row.LockedBy = lockOwner;
            }
            await _context.SaveChangesAsync(cancellationToken);

            foreach (var row in candidates)
            {
                if (cancellationToken.IsCancellationRequested)
                    break;
                await ProcessOneAsync(row, cancellationToken);
            }
        }

        private async Task ProcessOneAsync(EmailOutbox row, CancellationToken cancellationToken)
        {
            row.Attempts += 1;
            try
            {
                var settings = await _context.SystemSettings.AsNoTracking()
                    .FirstOrDefaultAsync(s => s.TenantId == row.TenantId, cancellationToken);

                var mail = new MailRequest
                {
                    To = row.ToAddresses,
                    Cc = row.CcAddresses,
                    Subject = row.Subject,
                    Body = row.Body,
                    IsHtml = row.IsHtml,
                    Attachments = DeserializeAttachments(row.AttachmentsJson)
                };

                var (ok, error) = EmailService.TrySend(
                    settings,
                    mail,
                    _configuration,
                    skipNotificationGate: row.SkipNotificationGate);

                if (ok)
                {
                    row.Status = EmailOutbox.StatusSent;
                    row.ProcessedUtc = DateTime.UtcNow;
                    row.LastError = null;
                    row.LockedUntilUtc = null;
                    row.LockedBy = null;

                    if (row.RelatedNotificationId is int nid and > 0)
                    {
                        var notification = await _context.Notifications
                            .FirstOrDefaultAsync(n => n.Id == nid && n.TenantId == row.TenantId, cancellationToken);
                        if (notification != null)
                        {
                            notification.EmailSent = true;
                            notification.EmailSentAt = DateTime.UtcNow;
                        }
                    }

                    await _context.SaveChangesAsync(cancellationToken);
                    return;
                }

                await MarkRetryOrFailedAsync(row, error ?? "Failed to send email.", cancellationToken);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Email outbox send failed for Id={Id}", row.Id);
                await MarkRetryOrFailedAsync(row, Truncate(ex.Message, 2000) ?? "Unexpected error.", cancellationToken);
            }
        }

        private async Task MarkRetryOrFailedAsync(EmailOutbox row, string error, CancellationToken cancellationToken)
        {
            row.LastError = Truncate(error, 2000);
            if (row.Attempts >= row.MaxAttempts)
            {
                row.Status = EmailOutbox.StatusFailed;
                row.ProcessedUtc = DateTime.UtcNow;
                row.LockedUntilUtc = null;
                row.LockedBy = null;
            }
            else
            {
                // Exponential backoff: 30s, 60s, 120s, …
                var delaySec = Math.Min(30 * (1 << Math.Max(0, row.Attempts - 1)), 900);
                row.Status = EmailOutbox.StatusPending;
                row.LockedUntilUtc = DateTime.UtcNow.AddSeconds(delaySec);
                row.LockedBy = null;
            }

            await _context.SaveChangesAsync(cancellationToken);
        }

        private static List<EmailAttachment> DeserializeAttachments(string? json)
        {
            var list = new List<EmailAttachment>();
            if (string.IsNullOrWhiteSpace(json))
                return list;

            try
            {
                var parts = JsonSerializer.Deserialize<List<EmailOutboxAttachmentDto>>(json, JsonOptions);
                if (parts == null) return list;
                foreach (var part in parts)
                {
                    if (string.IsNullOrWhiteSpace(part.ContentBase64)) continue;
                    try
                    {
                        list.Add(new EmailAttachment
                        {
                            FileName = string.IsNullOrWhiteSpace(part.FileName) ? "attachment.bin" : part.FileName,
                            ContentType = part.ContentType,
                            Content = Convert.FromBase64String(part.ContentBase64)
                        });
                    }
                    catch
                    {
                        /* skip corrupt attachment */
                    }
                }
            }
            catch
            {
                /* ignore bad JSON */
            }

            return list;
        }

        private static string Truncate(string value, int max)
            => value.Length <= max ? value : value.Substring(0, max);

        private static string? TruncateNullable(string? value, int max)
        {
            if (string.IsNullOrWhiteSpace(value)) return null;
            var trimmed = value.Trim();
            return trimmed.Length <= max ? trimmed : trimmed.Substring(0, max);
        }

        private sealed class EmailOutboxAttachmentDto
        {
            public string FileName { get; set; } = "attachment.bin";
            public string? ContentType { get; set; }
            public string ContentBase64 { get; set; } = "";
        }
    }
}
