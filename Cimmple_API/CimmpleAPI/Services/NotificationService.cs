using System.Net;
using CimmpleAPI.Data;
using CimmpleAPI.Data.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace CimmpleAPI.Services
{
    public class NotificationCreateRequest
    {
        public int TenantId { get; set; }
        public int RecipientUserId { get; set; }
        public int? ActorUserId { get; set; }
        public string Type { get; set; } = "";
        public string Title { get; set; } = "";
        public string Body { get; set; } = "";
        public string? EntityType { get; set; }
        public int? EntityId { get; set; }
        public string? LinkPath { get; set; }
        public bool SendEmail { get; set; }
        public string? EmailSubject { get; set; }
    }

    public class NotificationCreateResult
    {
        public Notification? Notification { get; set; }
        public bool InboxCreated { get; set; }
        public bool EmailSent { get; set; }
        public string? EmailError { get; set; }
        public string? Error { get; set; }
    }

    public class NotificationService
    {
        public const string TypeNcrAssignment = "NcrAssignment";
        public const string TypeUserMessage = "UserMessage";
        public const string TypeCommentMention = "CommentMention";
        public const string TypeApInvoiceApproved = "ApInvoiceApproved";
        public const string TypeNcrPendingApproval = "NcrPendingApproval";
        public const string TypeNcrClosed = "NcrClosed";
        public const string TypeJobOrderCompleted = "JobOrderCompleted";
        public const string TypeVendorOrderFullyReceived = "VendorOrderFullyReceived";
        public const string TypeCustomerOrderShipped = "CustomerOrderShipped";
        public const string TypeQuotationAccepted = "QuotationAccepted";
        public const string TypeVendorOrderAssignment = "VendorOrderAssignment";

        private readonly CimmpleDbContext _context;
        private readonly IConfiguration _configuration;

        public NotificationService(CimmpleDbContext context, IConfiguration configuration)
        {
            _context = context;
            _configuration = configuration;
        }

        public async Task EnsureSchemaAsync()
        {
            await NotificationSchemaService.EnsureTablesAsync(_context);
        }

        public async Task<NotificationCreateResult> CreateAsync(NotificationCreateRequest request)
        {
            var result = new NotificationCreateResult();
            if (request.TenantId <= 0 || request.RecipientUserId <= 0)
            {
                result.Error = "Tenant and recipient are required.";
                return result;
            }

            if (string.IsNullOrWhiteSpace(request.Body) && string.IsNullOrWhiteSpace(request.Title))
            {
                result.Error = "Title or body is required.";
                return result;
            }

            var settings = await _context.SystemSettings.AsNoTracking()
                .FirstOrDefaultAsync(s => s.TenantId == request.TenantId);

            var inAppEnabled = settings?.EnableInAppNotifications ?? true;
            var emailEnabled = settings?.EnableEmailNotifications ?? true;

            if (!inAppEnabled && !request.SendEmail)
            {
                result.Error = null;
                return result;
            }

            if (!inAppEnabled && request.SendEmail && !emailEnabled)
            {
                result.Error = "In-app and email notifications are disabled in System Settings.";
                return result;
            }

            Notification? notification = null;
            if (inAppEnabled)
            {
                notification = new Notification
                {
                    TenantId = request.TenantId,
                    RecipientUserId = request.RecipientUserId,
                    ActorUserId = request.ActorUserId,
                    Type = Truncate(request.Type ?? "", 64),
                    Title = Truncate(string.IsNullOrWhiteSpace(request.Title) ? "Notification" : request.Title.Trim(), 200),
                    Body = Truncate(request.Body?.Trim() ?? "", 4000),
                    EntityType = TruncateNullable(request.EntityType, 64),
                    EntityId = request.EntityId,
                    LinkPath = TruncateNullable(request.LinkPath, 500),
                    IsRead = false,
                    CreatedAt = DateTime.UtcNow
                };
                _context.Notifications.Add(notification);
                await _context.SaveChangesAsync();
                result.Notification = notification;
                result.InboxCreated = true;
            }

            if (request.SendEmail && emailEnabled)
            {
                var user = await _context.UserDetails.AsNoTracking()
                    .FirstOrDefaultAsync(u =>
                        u.User_UniqueID == request.RecipientUserId && u.TenantID == request.TenantId);

                if (user == null || string.IsNullOrWhiteSpace(user.Email))
                {
                    result.EmailError = "Recipient has no email on file.";
                }
                else
                {
                    var displayName = $"{user.FirstName} {user.LastName}".Trim();
                    if (string.IsNullOrWhiteSpace(displayName))
                        displayName = user.UserName ?? "there";

                    var company = !string.IsNullOrWhiteSpace(settings?.SmtpFromName)
                        ? settings!.SmtpFromName!
                        : "Cimmple";
                    var subject = string.IsNullOrWhiteSpace(request.EmailSubject)
                        ? (string.IsNullOrWhiteSpace(request.Title) ? "Notification from Cimmple" : request.Title.Trim())
                        : request.EmailSubject.Trim();

                    var baseUrl = IdentityEmailService.ResolveAppBaseUrl(_configuration);
                    var linkHtml = "";
                    if (!string.IsNullOrWhiteSpace(request.LinkPath) && !string.IsNullOrEmpty(baseUrl))
                    {
                        var href = baseUrl.TrimEnd('/') +
                                   (request.LinkPath!.StartsWith("/") ? request.LinkPath : "/" + request.LinkPath);
                        linkHtml = $"<p><a href=\"{WebUtility.HtmlEncode(href)}\">Open in Cimmple</a></p>";
                    }
                    else if (!string.IsNullOrEmpty(baseUrl))
                    {
                        linkHtml = $"<p><a href=\"{WebUtility.HtmlEncode(baseUrl)}\">Open Cimmple</a></p>";
                    }

                    var body =
                        $"<p>Hello {WebUtility.HtmlEncode(displayName)},</p>" +
                        $"<p>{WebUtility.HtmlEncode(request.Body?.Trim() ?? request.Title?.Trim() ?? "")}</p>" +
                        linkHtml +
                        $"<p>Thank you,<br/>{WebUtility.HtmlEncode(company)}</p>";

                    var (ok, error) = EmailService.TrySend(settings, new MailRequest
                    {
                        To = user.Email!,
                        Subject = subject,
                        Body = body,
                        IsHtml = true
                    }, _configuration);

                    result.EmailSent = ok;
                    result.EmailError = ok ? null : error;

                    if (ok && notification != null)
                    {
                        notification.EmailSent = true;
                        notification.EmailSentAt = DateTime.UtcNow;
                        await _context.SaveChangesAsync();
                    }
                }
            }
            else if (request.SendEmail && !emailEnabled)
            {
                result.EmailError = "Email notifications are disabled in System Settings.";
            }

            return result;
        }

        private static string Truncate(string value, int max)
            => value.Length <= max ? value : value.Substring(0, max);

        private static string? TruncateNullable(string? value, int max)
        {
            if (string.IsNullOrWhiteSpace(value)) return null;
            var trimmed = value.Trim();
            return trimmed.Length <= max ? trimmed : trimmed.Substring(0, max);
        }
    }
}
