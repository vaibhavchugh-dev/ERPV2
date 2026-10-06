using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using CimmpleAPI.Data;
using CimmpleAPI.Data.Models;
using CimmpleAPI.Services;

namespace CimmpleAPI.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class EntityCommentsController : ApiBaseController
    {
        private readonly CimmpleDbContext _context;
        private readonly NotificationService _notificationService;

        public EntityCommentsController(CimmpleDbContext context, NotificationService notificationService)
        {
            _context = context;
            _notificationService = notificationService;
        }

        /// <summary>
        /// Persist comments for a saved document without requiring a full document Save.
        /// </summary>
        [HttpPut]
        public async Task<IActionResult> Save([FromBody] SaveEntityCommentsRequest request)
        {
            if (request == null)
                return BadRequest(new { message = "Request is required." });

            var tenantId = GetTenantId();
            if (tenantId <= 0)
                tenantId = request.TenantId;
            if (tenantId <= 0)
                return BadRequest(new { message = "Tenant id is required." });
            if (request.EntityId <= 0)
                return BadRequest(new { message = "Entity id is required." });

            var entityType = (request.EntityType ?? "").Trim();
            if (string.IsNullOrWhiteSpace(entityType))
                return BadRequest(new { message = "Entity type is required." });

            var comments = request.Comments ?? new List<EntityCommentDto>();
            var mentions = CommentMentionHelper.FromDtos(comments);
            var (actorLabels, isAdmin) = await GetCommentActorAsync(tenantId);

            string? linkPath = request.LinkPath;
            string? entityLabel = request.EntityLabel;
            string notifyEntityType = entityType;

            switch (entityType.ToLowerInvariant())
            {
                case "customerorder":
                case "order":
                    {
                        var order = await _context.CustomerOrder
                            .FirstOrDefaultAsync(o => o.OrderID == request.EntityId && o.Tenantid == tenantId);
                        if (order == null)
                            return NotFound(new { message = "Customer order not found." });
                        if (order.locationId > 0 && !CanAccessLocation(order.locationId))
                            return StatusCode(403, new { message = "You don't have access to this document. Your account is not assigned to its location." });

                        var coExisting = ParseCommentsJson(order.CommentsJson);
                        var coDenied = ValidateCommentChanges(coExisting, comments, actorLabels, isAdmin);
                        if (coDenied != null) return coDenied;

                        order.CommentsJson = comments.Count > 0
                            ? CommentMentionHelper.SerializeDtosForStorage(comments)
                            : null;
                        notifyEntityType = "CustomerOrder";
                        entityLabel ??= order.PONumber > 0
                            ? $"Customer Order CO-{order.PONumber}"
                            : $"Customer Order #{order.OrderID}";
                        linkPath ??= $"/orders/customer?open={order.OrderID}";
                        break;
                    }
                case "customerquotation":
                case "quotation":
                    {
                        var quotation = await _context.QuotationOrder
                            .FirstOrDefaultAsync(q => q.OrderID == request.EntityId && q.Tenantid == tenantId);
                        if (quotation == null)
                            return NotFound(new { message = "Customer quotation not found." });
                        if (quotation.Locationid.HasValue && quotation.Locationid.Value > 0 &&
                            !CanAccessLocation(quotation.Locationid.Value))
                            return StatusCode(403, new { message = "You don't have access to this document. Your account is not assigned to its location." });

                        var cqExisting = ParseCommentsJson(quotation.CommentsJson);
                        var cqDenied = ValidateCommentChanges(cqExisting, comments, actorLabels, isAdmin);
                        if (cqDenied != null) return cqDenied;

                        quotation.CommentsJson = comments.Count > 0
                            ? CommentMentionHelper.SerializeDtosForStorage(comments)
                            : null;
                        notifyEntityType = "CustomerQuotation";
                        entityLabel ??= quotation.PONumber > 0
                            ? $"Customer Quotation CQ-{quotation.PONumber}"
                            : $"Customer Quotation #{quotation.OrderID}";
                        linkPath ??= $"/quotations/customer?open={quotation.OrderID}";
                        break;
                    }
                case "vendororder":
                    {
                        var order = await _context.VendorOrders
                            .FirstOrDefaultAsync(o => o.OrderID == request.EntityId && o.Tenantid == tenantId);
                        if (order == null)
                            return NotFound(new { message = "Vendor order not found." });
                        if (order.LocationId.HasValue && order.LocationId.Value > 0 &&
                            !CanAccessLocation(order.LocationId.Value))
                            return StatusCode(403, new { message = "You don't have access to this document. Your account is not assigned to its location." });

                        var existing = await _context.VendorOrderComments
                            .Where(c => c.OrderID == order.OrderID)
                            .ToListAsync();
                        var voExisting = existing
                            .Select(c => new EntityCommentDto
                            {
                                Id = c.Id,
                                Text = c.Text,
                                CreatedBy = c.CreatedBy,
                                CreatedAt = c.CreatedAt.ToString("o")
                            })
                            .ToList();
                        var voDenied = ValidateCommentChanges(voExisting, comments, actorLabels, isAdmin);
                        if (voDenied != null) return voDenied;

                        if (existing.Count > 0)
                            _context.VendorOrderComments.RemoveRange(existing);

                        foreach (var c in comments)
                        {
                            DateTime createdAt = DateTime.UtcNow;
                            if (!string.IsNullOrWhiteSpace(c.CreatedAt) &&
                                DateTime.TryParse(c.CreatedAt, out var parsed))
                            {
                                createdAt = parsed.Kind == DateTimeKind.Unspecified
                                    ? DateTime.SpecifyKind(parsed, DateTimeKind.Utc)
                                    : parsed.ToUniversalTime();
                            }

                            _context.VendorOrderComments.Add(new VendorOrderComment
                            {
                                OrderID = order.OrderID,
                                Text = c.Text ?? "",
                                CreatedAt = createdAt,
                                CreatedBy = string.IsNullOrWhiteSpace(c.CreatedBy) ? "User" : c.CreatedBy.Trim()
                            });
                        }

                        notifyEntityType = "VendorOrder";
                        entityLabel ??= order.PONumber > 0
                            ? $"Vendor Order VO-{order.PONumber}"
                            : $"Vendor Order #{order.OrderID}";
                        linkPath ??= $"/purchasing/vendor-orders?open={order.OrderID}";
                        break;
                    }
                case "vendorquotation":
                    {
                        var quotation = await _context.VendorQuotations
                            .FirstOrDefaultAsync(q => q.OrderID == request.EntityId && q.Tenantid == tenantId);
                        if (quotation == null)
                            return NotFound(new { message = "Vendor quotation not found." });
                        if (quotation.locationid.HasValue && quotation.locationid.Value > 0 &&
                            !CanAccessLocation(quotation.locationid.Value))
                            return StatusCode(403, new { message = "You don't have access to this document. Your account is not assigned to its location." });

                        var vqExisting = ParseCommentsJson(quotation.CommentsJson);
                        var vqDenied = ValidateCommentChanges(vqExisting, comments, actorLabels, isAdmin);
                        if (vqDenied != null) return vqDenied;

                        quotation.CommentsJson = comments.Count > 0
                            ? CommentMentionHelper.SerializeDtosForStorage(comments)
                            : null;
                        notifyEntityType = "VendorQuotation";
                        entityLabel ??= quotation.PONumber > 0
                            ? $"Vendor Quotation VQ-{quotation.PONumber}"
                            : $"Vendor Quotation #{quotation.OrderID}";
                        linkPath ??= $"/quotations/vendor?open={quotation.OrderID}";
                        break;
                    }
                case "joborder":
                    {
                        var jobOrder = await _context.JobOrderMaster
                            .FirstOrDefaultAsync(j => j.JobOrderID == request.EntityId && j.Tenantid == tenantId);
                        if (jobOrder == null)
                            return NotFound(new { message = "Job order not found." });

                        var joExisting = ParseCommentsJson(jobOrder.CommentsJson);
                        var joDenied = ValidateCommentChanges(joExisting, comments, actorLabels, isAdmin);
                        if (joDenied != null) return joDenied;

                        jobOrder.CommentsJson = comments.Count > 0
                            ? CommentMentionHelper.SerializeDtosForStorage(comments)
                            : null;
                        notifyEntityType = "JobOrder";
                        entityLabel ??= !string.IsNullOrWhiteSpace(jobOrder.JobNumber)
                            ? $"Job Order {jobOrder.JobNumber}"
                            : $"Job Order #{jobOrder.JobOrderID}";
                        linkPath ??= $"/job-orders?open={jobOrder.JobOrderID}";
                        break;
                    }
                default:
                    return BadRequest(new { message = $"Unsupported entity type '{entityType}'." });
            }

            await _context.SaveChangesAsync();

            if (mentions.Count > 0)
            {
                await CommentMentionHelper.NotifyAsync(
                    _notificationService,
                    tenantId,
                    GetUserId(),
                    mentions,
                    notifyEntityType,
                    request.EntityId,
                    entityLabel ?? notifyEntityType,
                    linkPath ?? "/home");
            }

            return Ok(new { message = "Comments saved.", count = comments.Count });
        }

        private static List<EntityCommentDto> ParseCommentsJson(string? json)
        {
            if (string.IsNullOrWhiteSpace(json))
                return new List<EntityCommentDto>();

            try
            {
                return JsonSerializer.Deserialize<List<EntityCommentDto>>(json, new JsonSerializerOptions
                {
                    PropertyNameCaseInsensitive = true
                }) ?? new List<EntityCommentDto>();
            }
            catch
            {
                return new List<EntityCommentDto>();
            }
        }

        private async Task<(HashSet<string> labels, bool isAdmin)> GetCommentActorAsync(int tenantId)
        {
            var isAdmin = CanAccessAllLocations();
            var labels = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var userId = GetUserId();
            if (!userId.HasValue)
                return (labels, isAdmin);

            var user = await _context.UserDetails.AsNoTracking()
                .FirstOrDefaultAsync(u => u.User_UniqueID == userId.Value && u.TenantID == tenantId);
            if (user == null)
                return (labels, isAdmin);

            if (!string.IsNullOrWhiteSpace(user.UserName))
                labels.Add(user.UserName.Trim());
            var display = $"{user.FirstName} {user.LastName}".Trim();
            if (!string.IsNullOrWhiteSpace(display))
                labels.Add(display);

            return (labels, isAdmin);
        }

        private static bool AuthoredBy(EntityCommentDto comment, HashSet<string> actorLabels) =>
            !string.IsNullOrWhiteSpace(comment.CreatedBy)
            && actorLabels.Contains(comment.CreatedBy.Trim());

        private static IActionResult? ValidateCommentChanges(
            List<EntityCommentDto> existing,
            List<EntityCommentDto> incoming,
            HashSet<string> actorLabels,
            bool isAdmin)
        {
            if (isAdmin)
                return null;

            var incomingById = incoming
                .Where(c => c.Id > 0)
                .ToDictionary(c => c.Id);

            foreach (var old in existing)
            {
                if (old.Id <= 0)
                    continue;

                if (!incomingById.TryGetValue(old.Id, out var updated))
                {
                    if (!AuthoredBy(old, actorLabels))
                        return new ObjectResult(new { message = "You can only delete your own comments." })
                        {
                            StatusCode = StatusCodes.Status403Forbidden
                        };
                    continue;
                }

                var textChanged = !string.Equals(old.Text?.Trim(), updated.Text?.Trim(), StringComparison.Ordinal);
                var authorChanged = !string.Equals(
                    old.CreatedBy?.Trim(),
                    updated.CreatedBy?.Trim(),
                    StringComparison.OrdinalIgnoreCase);
                if ((textChanged || authorChanged) && !AuthoredBy(old, actorLabels))
                {
                    return new ObjectResult(new { message = "You can only edit your own comments." })
                    {
                        StatusCode = StatusCodes.Status403Forbidden
                    };
                }
            }

            return null;
        }
    }

    public class SaveEntityCommentsRequest
    {
        public int TenantId { get; set; }
        public string EntityType { get; set; } = "";
        public int EntityId { get; set; }
        public string? EntityLabel { get; set; }
        public string? LinkPath { get; set; }
        public List<EntityCommentDto> Comments { get; set; } = new();
    }

    public class EntityCommentDto
    {
        public int Id { get; set; }
        public string Text { get; set; } = "";
        public string CreatedAt { get; set; } = "";
        public string CreatedBy { get; set; } = "";
        /// <summary>Client-only; stripped before persist.</summary>
        public List<int>? MentionedUserIds { get; set; }
    }
}
