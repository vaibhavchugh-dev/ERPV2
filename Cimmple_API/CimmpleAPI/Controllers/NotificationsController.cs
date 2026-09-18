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

        public NotificationsController(
            CimmpleDbContext context,
            NotificationService notificationService)
        {
            _context = context;
            _notificationService = notificationService;
        }

        [HttpGet("GetUnreadCount")]
        public async Task<IActionResult> GetUnreadCount()
        {
            var tenantId = GetTenantId();
            var userId = GetUserId();
            if (tenantId <= 0 || userId == null || userId <= 0)
                return BadRequest(new { error = "Tenant and user are required." });

            await _notificationService.EnsureSchemaAsync();

            var count = await _context.Notifications.AsNoTracking()
                .CountAsync(n =>
                    n.TenantId == tenantId &&
                    n.RecipientUserId == userId.Value &&
                    !n.IsRead);

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

            var query = _context.Notifications.AsNoTracking()
                .Where(n => n.TenantId == tenantId && n.RecipientUserId == userId.Value);

            if (unreadOnly)
                query = query.Where(n => !n.IsRead);

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

            return Ok(new { result = items });
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

            await _notificationService.EnsureSchemaAsync();

            var recipientExists = await _context.UserDetails.AsNoTracking()
                .AnyAsync(u => u.User_UniqueID == request.RecipientUserId && u.TenantID == tenantId);
            if (!recipientExists)
                return BadRequest(new { error = "Recipient user was not found in this tenant." });

            var actor = await _context.UserDetails.AsNoTracking()
                .FirstOrDefaultAsync(u => u.User_UniqueID == actorId.Value && u.TenantID == tenantId);
            var actorName = actor == null
                ? "A teammate"
                : $"{actor.FirstName} {actor.LastName}".Trim();
            if (string.IsNullOrWhiteSpace(actorName))
                actorName = actor?.UserName ?? "A teammate";

            var title = string.IsNullOrWhiteSpace(request.Title)
                ? $"Message from {actorName}"
                : request.Title.Trim();

            var create = await _notificationService.CreateAsync(new NotificationCreateRequest
            {
                TenantId = tenantId,
                RecipientUserId = request.RecipientUserId,
                ActorUserId = actorId.Value,
                Type = NotificationService.TypeUserMessage,
                Title = title,
                Body = request.Body.Trim(),
                EntityType = request.EntityType,
                EntityId = request.EntityId,
                LinkPath = request.LinkPath,
                SendEmail = request.SendEmail,
                EmailSubject = title
            });

            if (!string.IsNullOrEmpty(create.Error) && create.Notification == null && !create.EmailSent)
                return BadRequest(new { error = create.Error });

            return Ok(new
            {
                result = new
                {
                    id = create.Notification?.Id,
                    inboxCreated = create.InboxCreated,
                    emailSent = create.EmailSent,
                    emailError = create.EmailError
                },
                message = create.InboxCreated
                    ? (create.EmailSent ? "Notification sent (in-app + email)." : "Notification sent in-app.")
                    : (create.EmailSent ? "Notification emailed." : "Notification processed.")
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
