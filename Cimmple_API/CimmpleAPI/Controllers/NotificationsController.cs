using CimmpleAPI.Data;
using CimmpleAPI.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CimmpleAPI.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class NotificationsController : ApiBaseController
    {
        private readonly CimmpleDbContext _context;
        private readonly NotificationService _notificationService;
        private readonly ConversationService _conversationService;

        public NotificationsController(
            CimmpleDbContext context,
            NotificationService notificationService,
            ConversationService conversationService)
        {
            _context = context;
            _notificationService = notificationService;
            _conversationService = conversationService;
        }

        [HttpGet("GetUnreadCount")]
        public async Task<IActionResult> GetUnreadCount()
        {
            var tenantId = GetTenantId();
            var userId = GetUserId();
            if (tenantId <= 0 || userId == null || userId <= 0)
                return BadRequest(new { error = "Tenant and user are required." });

            await _notificationService.EnsureSchemaAsync();

            var chatTypes = NotificationService.ChatNotificationTypes;

            var count = await _context.Notifications.AsNoTracking()
                .CountAsync(n =>
                    n.TenantId == tenantId &&
                    n.RecipientUserId == userId.Value &&
                    !n.IsRead &&
                    !chatTypes.Contains(n.Type));

            return Ok(new { result = count });
        }

        [HttpGet("GetMine")]
        public async Task<IActionResult> GetMine([FromQuery] int take = 30, [FromQuery] bool unreadOnly = false)
        {
            var tenantId = GetTenantId();
            var userId = GetUserId();
            if (tenantId <= 0 || userId == null || userId <= 0)
                return BadRequest(new { error = "Tenant and user are required." });

            await _notificationService.EnsureSchemaAsync();

            if (take <= 0) take = 30;
            if (take > 100) take = 100;

            var chatTypes = NotificationService.ChatNotificationTypes;

            var query = _context.Notifications.AsNoTracking()
                .Where(n =>
                    n.TenantId == tenantId &&
                    n.RecipientUserId == userId.Value &&
                    !chatTypes.Contains(n.Type));

            if (unreadOnly)
                query = query.Where(n => !n.IsRead);

            var unreadCount = await _context.Notifications.AsNoTracking()
                .CountAsync(n =>
                    n.TenantId == tenantId &&
                    n.RecipientUserId == userId.Value &&
                    !n.IsRead &&
                    !chatTypes.Contains(n.Type));

            var items = await query
                .OrderByDescending(n => n.CreatedAt)
                .Take(take)
                .Select(n => new
                {
                    n.Id,
                    n.Type,
                    n.Title,
                    n.Body,
                    n.EntityType,
                    n.EntityId,
                    n.LinkPath,
                    n.IsRead,
                    n.ReadAt,
                    n.EmailSent,
                    n.CreatedAt,
                    n.ActorUserId
                })
                .ToListAsync();

            // Compact list payload: strip chat mention tokens + short preview (dropdown only).
            var result = items.Select(n => new
            {
                n.Id,
                n.Type,
                n.Title,
                Body = TruncateNotificationPreview(StripMentionTokensForPreview(n.Body), 180),
                n.EntityType,
                n.EntityId,
                n.LinkPath,
                n.IsRead,
                n.ReadAt,
                n.EmailSent,
                n.CreatedAt,
                n.ActorUserId
            }).ToList();

            return Ok(new { result, unreadCount });
        }

        private static string StripMentionTokensForPreview(string? body)
        {
            if (string.IsNullOrEmpty(body)) return "";
            return System.Text.RegularExpressions.Regex.Replace(
                body,
                @"@\[([a-zA-Z]+):(\d+)\|([^\]]+)\]",
                "@$3");
        }

        private static string TruncateNotificationPreview(string value, int max)
        {
            if (string.IsNullOrEmpty(value) || value.Length <= max) return value ?? "";
            return value.Substring(0, max).TrimEnd() + "…";
        }

        [HttpPost("MarkRead")]
        public async Task<IActionResult> MarkRead([FromBody] MarkReadRequest request)
        {
            var tenantId = GetTenantId();
            var userId = GetUserId();
            if (tenantId <= 0 || userId == null || userId <= 0)
                return BadRequest(new { error = "Tenant and user are required." });

            await _notificationService.EnsureSchemaAsync();

            var query = _context.Notifications
                .Where(n =>
                    n.TenantId == tenantId &&
                    n.RecipientUserId == userId.Value &&
                    !n.IsRead);

            if (request?.MarkAll != true)
            {
                var ids = request?.Ids ?? new List<int>();
                if (ids.Count == 0)
                    return BadRequest(new { error = "Provide ids or markAll." });
                query = query.Where(n => ids.Contains(n.Id));
            }

            var now = DateTime.UtcNow;
            var items = await query.ToListAsync();
            foreach (var item in items)
            {
                item.IsRead = true;
                item.ReadAt = now;
            }

            if (items.Count > 0)
                await _context.SaveChangesAsync();

            return Ok(new { result = new { marked = items.Count } });
        }

        [HttpPost("Send")]
        public async Task<IActionResult> Send([FromBody] SendNotificationRequest request)
        {
            var tenantId = GetTenantId();
            var actorId = GetUserId();
            if (tenantId <= 0 || actorId == null || actorId <= 0)
                return BadRequest(new { error = "Tenant and user are required." });

            if (request == null || request.RecipientUserId <= 0)
                return BadRequest(new { error = "Recipient user id is required." });

            if (string.IsNullOrWhiteSpace(request.Body))
                return BadRequest(new { error = "Message body is required." });

            if (request.RecipientUserId == actorId.Value)
                return BadRequest(new { error = "Cannot send a notification to yourself." });

            var result = await _conversationService.PostDmAsync(
                tenantId,
                actorId.Value,
                request.RecipientUserId,
                request.Body.Trim(),
                subject: string.IsNullOrWhiteSpace(request.Title) ? null : request.Title.Trim(),
                sendEmail: request.SendEmail);

            if (!string.IsNullOrEmpty(result.Error) && result.MessageId <= 0)
                return BadRequest(new { error = result.Error });

            return Ok(new
            {
                result = new
                {
                    id = result.MessageId,
                    conversationId = result.ConversationId,
                    messageId = result.MessageId,
                    inboxCreated = result.InboxCreated,
                    emailSent = result.EmailSent,
                    emailError = result.EmailError
                },
                message = result.InboxCreated
                    ? (result.EmailSent ? "Message sent (in-app + email)." : "Message sent in-app.")
                    : (result.EmailSent ? "Message emailed." : "Message processed.")
            });
        }

        public class MarkReadRequest
        {
            public List<int>? Ids { get; set; }
            public bool MarkAll { get; set; }
        }

        public class SendNotificationRequest
        {
            public int RecipientUserId { get; set; }
            public string? Title { get; set; }
            public string Body { get; set; } = "";
            public string? EntityType { get; set; }
            public int? EntityId { get; set; }
            public string? LinkPath { get; set; }
            public bool SendEmail { get; set; }
        }
    }
}
