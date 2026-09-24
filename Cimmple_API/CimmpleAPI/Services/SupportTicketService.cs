using System.Net;
using System.Text;
using CimmpleAPI.Data;
using CimmpleAPI.Data.Models;
using CimmpleAPI.Utilities;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace CimmpleAPI.Services
{
    public class SupportTicketCreateRequest
    {
        public string Category { get; set; } = SupportTicket.CategoryOther;
        public string Subject { get; set; } = "";
        public string Description { get; set; } = "";
        public string AppSource { get; set; } = "UI";
        public string? AppVersion { get; set; }
        public string? UserAgent { get; set; }
        public int? LocationId { get; set; }
        public string? EntityType { get; set; }
        public int? EntityId { get; set; }
        public string? LinkPath { get; set; }
        public string? Product { get; set; }
    }

    public class SupportTicketMessageDto
    {
        public int Id { get; set; }
        public string AuthorType { get; set; } = "";
        public string AuthorName { get; set; } = "";
        public string Body { get; set; } = "";
        public DateTime CreatedAt { get; set; }
        public bool IsMine { get; set; }
    }

    public class SupportTicketListItem
    {
        public int Id { get; set; }
        public int TenantId { get; set; }
        public string? TenantName { get; set; }
        public int? LocationId { get; set; }
        public string? LocationName { get; set; }
        public string Product { get; set; } = "";
        public string Category { get; set; } = "";
        public string Subject { get; set; } = "";
        public string Status { get; set; } = "";
        public string AppSource { get; set; } = "";
        public string? RequesterName { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime UpdatedAt { get; set; }
        public DateTime? LastMessageAt { get; set; }
        public bool HasAttachment { get; set; }
        public int MessageCount { get; set; }
        public bool HasUnread { get; set; }
    }

    public class SupportTicketDetail : SupportTicketListItem
    {
        public string Description { get; set; } = "";
        public string? AppVersion { get; set; }
        public string? EntityType { get; set; }
        public int? EntityId { get; set; }
        public string? LinkPath { get; set; }
        public string? AttachmentFileName { get; set; }
        public string? RequesterEmail { get; set; }
        public bool EmailQueued { get; set; }
        public string? EmailError { get; set; }
        public List<SupportTicketMessageDto> Messages { get; set; } = new();
    }

    public class SupportTicketCreateResult
    {
        public int TicketId { get; set; }
        public bool EmailQueued { get; set; }
        public string? EmailError { get; set; }
        public string? Error { get; set; }
    }

    public class SupportTicketReplyResult
    {
        public int MessageId { get; set; }
        public bool EmailQueued { get; set; }
        public string? EmailError { get; set; }
        public string? Error { get; set; }
    }

    public class SupportTicketService
    {
        private const long MaxAttachmentBytes = 8 * 1024 * 1024;

        private readonly CimmpleDbContext _context;
        private readonly EmailOutboxService _emailOutbox;
        private readonly NotificationService _notifications;
        private readonly IConfiguration _configuration;

        public SupportTicketService(
            CimmpleDbContext context,
            EmailOutboxService emailOutbox,
            NotificationService notifications,
            IConfiguration configuration)
        {
            _context = context;
            _emailOutbox = emailOutbox;
            _notifications = notifications;
            _configuration = configuration;
        }

        public async Task EnsureSchemaAsync()
        {
            await SupportTicketSchemaService.EnsureTablesAsync(_context);
            await _emailOutbox.EnsureSchemaAsync();
            await _notifications.EnsureSchemaAsync();
        }

        public IReadOnlyList<string> GetConfiguredProducts()
        {
            var products = _configuration.GetSection("Support:Products").Get<string[]>();
            if (products is { Length: > 0 })
                return products.Where(p => !string.IsNullOrWhiteSpace(p)).Select(p => p.Trim()).Distinct(StringComparer.OrdinalIgnoreCase).ToList();
            return new[] { SupportTicket.ProductCimmpleFlow };
        }

        public string GetDefaultProduct()
        {
            var p = _configuration["Support:DefaultProduct"]?.Trim();
            return string.IsNullOrWhiteSpace(p) ? SupportTicket.ProductCimmpleFlow : p;
        }

        public async Task<List<SupportTicketListItem>> ListMineAsync(int tenantId, int userId, int take = 50)
        {
            await EnsureSchemaAsync();
            take = Math.Clamp(take, 1, 100);

            var tickets = await _context.SupportTickets.AsNoTracking()
                .Where(t => t.TenantId == tenantId && t.CreatedByUserId == userId)
                .OrderByDescending(t => t.UpdatedAt)
                .Take(take)
                .ToListAsync();

            return await MapListItemsAsync(tickets, includeTenantName: false);
        }

        public async Task<SupportTicketDetail?> GetMineAsync(int tenantId, int userId, int ticketId)
        {
            await EnsureSchemaAsync();

            var t = await _context.SupportTickets
                .FirstOrDefaultAsync(x =>
                    x.Id == ticketId &&
                    x.TenantId == tenantId &&
                    x.CreatedByUserId == userId);

            if (t == null) return null;

            if (t.ClientHasUnread)
            {
                t.ClientHasUnread = false;
                await _context.SaveChangesAsync();
            }

            return await MapDetailAsync(t, viewerIsStaff: false, viewerUserId: userId);
        }

        public async Task<int> GetClientUnreadCountAsync(int tenantId, int userId)
        {
            await EnsureSchemaAsync();
            return await _context.SupportTickets.AsNoTracking()
                .CountAsync(t =>
                    t.TenantId == tenantId &&
                    t.CreatedByUserId == userId &&
                    t.ClientHasUnread);
        }

        public async Task<List<SupportTicketListItem>> ListForStaffAsync(
            string? product,
            string? status,
            string? search = null,
            int take = 100)
        {
            await EnsureSchemaAsync();
            take = Math.Clamp(take, 1, 200);

            var q = _context.SupportTickets.AsNoTracking().AsQueryable();
            if (!string.IsNullOrWhiteSpace(product) &&
                !string.Equals(product, "all", StringComparison.OrdinalIgnoreCase))
            {
                var p = product.Trim();
                q = q.Where(t => t.Product == p);
            }

            string? term = null;
            int? ticketId = null;
            var pureTicketIdSearch = false;
            if (!string.IsNullOrWhiteSpace(search))
            {
                term = search.Trim();
                var termNoHash = term.StartsWith('#') ? term[1..].Trim() : term;
                if (int.TryParse(termNoHash, out var parsedId) && parsedId > 0)
                {
                    ticketId = parsedId;
                    pureTicketIdSearch = termNoHash == parsedId.ToString();
                }
            }

            // Exact ticket-id search should find the ticket regardless of status filter.
            if (!pureTicketIdSearch &&
                !string.IsNullOrWhiteSpace(status) &&
                !string.Equals(status, "all", StringComparison.OrdinalIgnoreCase))
            {
                var s = status.Trim();
                q = q.Where(t => t.Status == s);
            }

            if (term != null)
            {
                var matchingTenantIds = await _context.EntityMaster.AsNoTracking()
                    .Where(e => e.company_name != null && e.company_name.Contains(term))
                    .Select(e => e.Tenantid)
                    .Distinct()
                    .ToListAsync();

                if (pureTicketIdSearch && ticketId.HasValue)
                {
                    q = q.Where(t => t.Id == ticketId.Value);
                }
                else
                {
                    q = q.Where(t =>
                        (ticketId.HasValue && t.Id == ticketId.Value) ||
                        t.Subject.Contains(term) ||
                        matchingTenantIds.Contains(t.TenantId) ||
                        _context.UserDetails.Any(u =>
                            u.TenantID == t.TenantId &&
                            u.User_UniqueID == t.CreatedByUserId &&
                            (
                                (u.UserName != null && u.UserName.Contains(term)) ||
                                (u.FirstName != null && u.FirstName.Contains(term)) ||
                                (u.LastName != null && u.LastName.Contains(term)) ||
                                ((u.FirstName ?? "") + " " + (u.LastName ?? "")).Contains(term)
                            )));
                }
            }

            var tickets = await q
                .OrderByDescending(t => t.UpdatedAt)
                .Take(take)
                .ToListAsync();

            return await MapListItemsAsync(tickets, includeTenantName: true);
        }

        public async Task<SupportTicketDetail?> GetForStaffAsync(int ticketId)
        {
            await EnsureSchemaAsync();
            var t = await _context.SupportTickets.AsNoTracking()
                .FirstOrDefaultAsync(x => x.Id == ticketId);
            if (t == null) return null;
            return await MapDetailAsync(t, viewerIsStaff: true, viewerUserId: null);
        }

        public async Task<SupportTicketCreateResult> CreateAsync(
            int tenantId,
            int userId,
            string? username,
            SupportTicketCreateRequest request,
            IFormFile? attachment)
        {
            var result = new SupportTicketCreateResult();
            if (request == null)
            {
                result.Error = "Request is required.";
                return result;
            }

            var subject = (request.Subject ?? "").Trim();
            var description = (request.Description ?? "").Trim();
            if (string.IsNullOrWhiteSpace(subject))
            {
                result.Error = "Subject is required.";
                return result;
            }
            if (string.IsNullOrWhiteSpace(description))
            {
                result.Error = "Description is required.";
                return result;
            }
            if (subject.Length > 200)
            {
                result.Error = "Subject must be 200 characters or fewer.";
                return result;
            }
            if (description.Length > 4000)
            {
                result.Error = "Description must be 4000 characters or fewer.";
                return result;
            }

            var category = NormalizeCategory(request.Category);
            var appSource = NormalizeAppSource(request.AppSource);
            var product = NormalizeProduct(request.Product);

            if (attachment != null && attachment.Length > MaxAttachmentBytes)
            {
                result.Error = "Attachment must be 8 MB or smaller.";
                return result;
            }

            await EnsureSchemaAsync();

            var now = DateTime.UtcNow;
            var ticket = new SupportTicket
            {
                TenantId = tenantId,
                CreatedByUserId = userId,
                Product = product,
                Category = category,
                Subject = subject,
                Description = description,
                Status = SupportTicket.StatusOpen,
                AppSource = appSource,
                AppVersion = Truncate(request.AppVersion, 40),
                UserAgent = Truncate(request.UserAgent, 500),
                LocationId = request.LocationId > 0 ? request.LocationId : null,
                EntityType = Truncate(request.EntityType, 80),
                EntityId = request.EntityId > 0 ? request.EntityId : null,
                LinkPath = Truncate(request.LinkPath, 500),
                CreatedAt = now,
                UpdatedAt = now,
                LastMessageAt = now
            };

            byte[]? attachmentBytes = null;
            string? attachmentContentType = null;

            if (attachment != null && attachment.Length > 0)
            {
                var safeName = ModuleFileStorage.SanitizeFileName(attachment.FileName);
                var ext = Path.GetExtension(safeName);
                if (ext.Length > 20) ext = "";
                var blobName = $"{Guid.NewGuid():N}{ext}";

                await using var ms = new MemoryStream();
                await attachment.CopyToAsync(ms);
                attachmentBytes = ms.ToArray();
                if (attachmentBytes.Length == 0)
                {
                    result.Error = "Attachment is empty.";
                    return result;
                }

                attachmentContentType = string.IsNullOrWhiteSpace(attachment.ContentType)
                    ? ModuleFileStorage.GetContentType(safeName)
                    : attachment.ContentType;

                var fileInfo = ModuleFileStorage.CreateFileInfo(
                    tenantId,
                    ModuleFileStorage.SupportTicketsFolder,
                    blobName,
                    userId);

                var uploaded = await ModuleFileStorage.UploadBytesAsync(
                    _context, _configuration, attachmentBytes, fileInfo);
                if (!uploaded)
                {
                    result.Error = "Failed to upload attachment.";
                    return result;
                }

                ticket.AttachmentBlobName = blobName;
                ticket.AttachmentFileName = Truncate(safeName, 260);
            }

            _context.SupportTickets.Add(ticket);
            await _context.SaveChangesAsync();

            result.TicketId = ticket.Id;

            var user = await _context.UserDetails.AsNoTracking()
                .FirstOrDefaultAsync(u => u.User_UniqueID == userId && u.TenantID == tenantId);

            var displayName = BuildDisplayName(user, username);
            var userEmail = user?.Email?.Trim();

            var (queued, emailError) = await QueueNewTicketEmailAsync(
                ticket,
                displayName,
                userEmail,
                attachmentBytes,
                attachmentContentType);

            ticket.EmailQueued = queued;
            ticket.EmailError = Truncate(emailError, 500);
            ticket.UpdatedAt = DateTime.UtcNow;
            await _context.SaveChangesAsync();

            result.EmailQueued = queued;
            result.EmailError = emailError;
            return result;
        }

        public async Task<SupportTicketReplyResult> ClientReplyAsync(
            int tenantId,
            int userId,
            string? username,
            int ticketId,
            string body)
        {
            var result = new SupportTicketReplyResult();
            var text = (body ?? "").Trim();
            if (string.IsNullOrWhiteSpace(text))
            {
                result.Error = "Message is required.";
                return result;
            }
            if (text.Length > 4000)
            {
                result.Error = "Message must be 4000 characters or fewer.";
                return result;
            }

            await EnsureSchemaAsync();

            var ticket = await _context.SupportTickets
                .FirstOrDefaultAsync(t =>
                    t.Id == ticketId &&
                    t.TenantId == tenantId &&
                    t.CreatedByUserId == userId);

            if (ticket == null)
            {
                result.Error = "Support ticket not found.";
                return result;
            }

            if (string.Equals(ticket.Status, SupportTicket.StatusClosed, StringComparison.OrdinalIgnoreCase))
            {
                result.Error = "This ticket is closed.";
                return result;
            }

            var user = await _context.UserDetails.AsNoTracking()
                .FirstOrDefaultAsync(u => u.User_UniqueID == userId && u.TenantID == tenantId);
            var displayName = BuildDisplayName(user, username);
            var now = DateTime.UtcNow;

            var message = new SupportTicketMessage
            {
                TicketId = ticket.Id,
                TenantId = tenantId,
                AuthorType = SupportTicketMessage.AuthorClient,
                AuthorUserId = userId,
                AuthorName = Truncate(displayName, 120) ?? "User",
                Body = text,
                CreatedAt = now
            };

            _context.SupportTicketMessages.Add(message);
            ticket.Status = SupportTicket.StatusOpen;
            ticket.UpdatedAt = now;
            ticket.LastMessageAt = now;
            await _context.SaveChangesAsync();

            var (queued, emailError) = await QueueFollowUpToSupportAsync(ticket, displayName, user?.Email, text);
            message.EmailQueued = queued;
            message.EmailError = Truncate(emailError, 500);
            await _context.SaveChangesAsync();

            result.MessageId = message.Id;
            result.EmailQueued = queued;
            result.EmailError = emailError;
            return result;
        }

        public async Task<SupportTicketReplyResult> StaffReplyAsync(
            int ticketId,
            string staffName,
            string body,
            string? newStatus)
        {
            var result = new SupportTicketReplyResult();
            var text = (body ?? "").Trim();
            if (string.IsNullOrWhiteSpace(text))
            {
                result.Error = "Message is required.";
                return result;
            }
            if (text.Length > 4000)
            {
                result.Error = "Message must be 4000 characters or fewer.";
                return result;
            }

            await EnsureSchemaAsync();

            var ticket = await _context.SupportTickets.FirstOrDefaultAsync(t => t.Id == ticketId);
            if (ticket == null)
            {
                result.Error = "Support ticket not found.";
                return result;
            }

            var now = DateTime.UtcNow;
            var message = new SupportTicketMessage
            {
                TicketId = ticket.Id,
                TenantId = ticket.TenantId,
                AuthorType = SupportTicketMessage.AuthorStaff,
                AuthorUserId = null,
                AuthorName = Truncate(string.IsNullOrWhiteSpace(staffName) ? "Cimmple Support" : staffName, 120) ?? "Cimmple Support",
                Body = text,
                CreatedAt = now
            };

            _context.SupportTicketMessages.Add(message);

            var status = NormalizeStatus(newStatus);
            ticket.Status = status ?? SupportTicket.StatusWaiting;
            ticket.UpdatedAt = now;
            ticket.LastMessageAt = now;
            ticket.ClientHasUnread = true;
            await _context.SaveChangesAsync();

            var client = await _context.UserDetails.AsNoTracking()
                .FirstOrDefaultAsync(u =>
                    u.User_UniqueID == ticket.CreatedByUserId &&
                    u.TenantID == ticket.TenantId);

            var clientEmail = client?.Email?.Trim();
            var (queued, emailError) = await QueueStaffReplyToClientAsync(ticket, message.AuthorName, text, clientEmail);
            message.EmailQueued = queued;
            message.EmailError = Truncate(emailError, 500);
            await _context.SaveChangesAsync();

            var preview = text.Length > 120 ? text[..117] + "…" : text;
            await DomainNotificationHelper.NotifyUserAsync(
                _notifications,
                ticket.TenantId,
                ticket.CreatedByUserId,
                actorUserId: null,
                type: NotificationService.TypeSupportReply,
                title: $"Support replied on #{ticket.Id}",
                body: preview,
                entityType: "SupportTicket",
                entityId: ticket.Id,
                linkPath: "/?supportTicket=" + ticket.Id);

            result.MessageId = message.Id;
            result.EmailQueued = queued;
            result.EmailError = emailError;
            return result;
        }

        public async Task<(bool ok, string? error)> StaffUpdateStatusAsync(int ticketId, string status)
        {
            await EnsureSchemaAsync();
            var ticket = await _context.SupportTickets.FirstOrDefaultAsync(t => t.Id == ticketId);
            if (ticket == null) return (false, "Support ticket not found.");

            var normalized = NormalizeStatus(status);
            if (normalized == null) return (false, "Invalid status.");

            ticket.Status = normalized;
            ticket.UpdatedAt = DateTime.UtcNow;
            await _context.SaveChangesAsync();
            return (true, null);
        }

        public async Task<(byte[]? bytes, string fileName, string contentType, string? error)> DownloadAttachmentAsync(
            int ticketId,
            int? tenantId,
            int? clientUserId,
            bool asStaff)
        {
            await EnsureSchemaAsync();

            SupportTicket? ticket;
            if (asStaff)
            {
                ticket = await _context.SupportTickets.AsNoTracking()
                    .FirstOrDefaultAsync(t => t.Id == ticketId);
            }
            else
            {
                if (tenantId is null or <= 0 || clientUserId is null or <= 0)
                    return (null, "", "", "Tenant and user are required.");
                ticket = await _context.SupportTickets.AsNoTracking()
                    .FirstOrDefaultAsync(t =>
                        t.Id == ticketId &&
                        t.TenantId == tenantId &&
                        t.CreatedByUserId == clientUserId);
            }

            if (ticket == null)
                return (null, "", "", "Support ticket not found.");
            if (string.IsNullOrWhiteSpace(ticket.AttachmentBlobName))
                return (null, "", "", "This ticket has no attachment.");

            var fileInfo = ModuleFileStorage.CreateFileInfo(
                ticket.TenantId,
                ModuleFileStorage.SupportTicketsFolder,
                ticket.AttachmentBlobName!);

            var bytes = ModuleFileStorage.DownloadBytes(_context, _configuration, fileInfo);
            if (bytes == null || bytes.Length == 0)
                return (null, "", "", "Attachment file could not be downloaded.");

            var fileName = string.IsNullOrWhiteSpace(ticket.AttachmentFileName)
                ? ticket.AttachmentBlobName!
                : ticket.AttachmentFileName!;
            var contentType = ModuleFileStorage.GetContentType(fileName);
            return (bytes, fileName, contentType, null);
        }

        private async Task<List<SupportTicketListItem>> MapListItemsAsync(
            List<SupportTicket> tickets,
            bool includeTenantName)
        {
            if (tickets.Count == 0) return new List<SupportTicketListItem>();

            var ids = tickets.Select(t => t.Id).ToList();
            var counts = await _context.SupportTicketMessages.AsNoTracking()
                .Where(m => ids.Contains(m.TicketId))
                .GroupBy(m => m.TicketId)
                .Select(g => new { TicketId = g.Key, Count = g.Count() })
                .ToDictionaryAsync(x => x.TicketId, x => x.Count);

            Dictionary<int, string> tenantNames = new();
            if (includeTenantName)
            {
                var tenantIds = tickets.Select(t => t.TenantId).Distinct().ToList();
                tenantNames = await _context.EntityMaster.AsNoTracking()
                    .Where(e => tenantIds.Contains(e.Tenantid))
                    .GroupBy(e => e.Tenantid)
                    .Select(g => new { TenantId = g.Key, Name = g.Select(x => x.company_name).FirstOrDefault() })
                    .ToDictionaryAsync(x => x.TenantId, x => x.Name ?? $"Tenant {x.TenantId}");
            }

            var locationIds = tickets
                .Where(t => t.LocationId.HasValue && t.LocationId.Value > 0)
                .Select(t => t.LocationId!.Value)
                .Distinct()
                .ToList();
            var locationNames = locationIds.Count == 0
                ? new Dictionary<int, string>()
                : await _context.Locations.AsNoTracking()
                    .Where(l => locationIds.Contains(l.LocationId))
                    .ToDictionaryAsync(
                        l => l.LocationId,
                        l => string.IsNullOrWhiteSpace(l.Name)
                            ? (string.IsNullOrWhiteSpace(l.Code) ? $"Location {l.LocationId}" : l.Code)
                            : (string.IsNullOrWhiteSpace(l.Code) ? l.Name : $"{l.Name} ({l.Code})"));

            var userKeys = tickets.Select(t => new { t.TenantId, t.CreatedByUserId }).Distinct().ToList();
            var tenantIdSet = userKeys.Select(k => k.TenantId).Distinct().ToList();
            var userIdSet = userKeys.Select(k => k.CreatedByUserId).Distinct().ToList();
            var users = await _context.UserDetails.AsNoTracking()
                .Where(u => tenantIdSet.Contains(u.TenantID) && userIdSet.Contains(u.User_UniqueID))
                .ToListAsync();
            var userMap = users.ToDictionary(
                u => (u.TenantID, u.User_UniqueID),
                u => BuildDisplayName(u, u.UserName));

            return tickets.Select(t => new SupportTicketListItem
            {
                Id = t.Id,
                TenantId = t.TenantId,
                TenantName = includeTenantName
                    ? (tenantNames.TryGetValue(t.TenantId, out var n) ? n : $"Tenant {t.TenantId}")
                    : null,
                LocationId = t.LocationId,
                LocationName = t.LocationId.HasValue && t.LocationId.Value > 0 &&
                               locationNames.TryGetValue(t.LocationId.Value, out var ln)
                    ? ln
                    : null,
                Product = t.Product,
                Category = t.Category,
                Subject = t.Subject,
                Status = t.Status,
                AppSource = t.AppSource,
                RequesterName = userMap.TryGetValue((t.TenantId, t.CreatedByUserId), out var rn) ? rn : null,
                CreatedAt = t.CreatedAt,
                UpdatedAt = t.UpdatedAt,
                LastMessageAt = t.LastMessageAt,
                HasAttachment = !string.IsNullOrWhiteSpace(t.AttachmentBlobName),
                MessageCount = counts.TryGetValue(t.Id, out var c) ? c : 0,
                HasUnread = t.ClientHasUnread
            }).ToList();
        }

        private async Task<SupportTicketDetail> MapDetailAsync(
            SupportTicket t,
            bool viewerIsStaff,
            int? viewerUserId)
        {
            var user = await _context.UserDetails.AsNoTracking()
                .FirstOrDefaultAsync(u => u.User_UniqueID == t.CreatedByUserId && u.TenantID == t.TenantId);

            string? tenantName = null;
            if (viewerIsStaff)
            {
                tenantName = await _context.EntityMaster.AsNoTracking()
                    .Where(e => e.Tenantid == t.TenantId)
                    .Select(e => e.company_name)
                    .FirstOrDefaultAsync();
            }

            string? locationName = null;
            if (t.LocationId.HasValue && t.LocationId.Value > 0)
            {
                var loc = await _context.Locations.AsNoTracking()
                    .FirstOrDefaultAsync(l => l.LocationId == t.LocationId.Value);
                if (loc != null)
                {
                    locationName = string.IsNullOrWhiteSpace(loc.Name)
                        ? (string.IsNullOrWhiteSpace(loc.Code) ? $"Location {loc.LocationId}" : loc.Code)
                        : (string.IsNullOrWhiteSpace(loc.Code) ? loc.Name : $"{loc.Name} ({loc.Code})");
                }
            }

            var messages = await _context.SupportTicketMessages.AsNoTracking()
                .Where(m => m.TicketId == t.Id)
                .OrderBy(m => m.CreatedAt)
                .ToListAsync();

            var msgCount = messages.Count;
            return new SupportTicketDetail
            {
                Id = t.Id,
                TenantId = t.TenantId,
                TenantName = tenantName ?? (viewerIsStaff ? $"Tenant {t.TenantId}" : null),
                LocationId = t.LocationId,
                LocationName = locationName,
                Product = t.Product,
                Category = t.Category,
                Subject = t.Subject,
                Status = t.Status,
                AppSource = t.AppSource,
                RequesterName = BuildDisplayName(user, user?.UserName),
                RequesterEmail = user?.Email,
                CreatedAt = t.CreatedAt,
                UpdatedAt = t.UpdatedAt,
                LastMessageAt = t.LastMessageAt,
                HasAttachment = !string.IsNullOrWhiteSpace(t.AttachmentBlobName),
                MessageCount = msgCount,
                HasUnread = t.ClientHasUnread,
                Description = t.Description,
                AppVersion = t.AppVersion,
                EntityType = t.EntityType,
                EntityId = t.EntityId,
                LinkPath = t.LinkPath,
                AttachmentFileName = t.AttachmentFileName,
                EmailQueued = t.EmailQueued,
                EmailError = t.EmailError,
                Messages = messages.Select(m => new SupportTicketMessageDto
                {
                    Id = m.Id,
                    AuthorType = m.AuthorType,
                    AuthorName = m.AuthorName,
                    Body = m.Body,
                    CreatedAt = m.CreatedAt,
                    IsMine = viewerIsStaff
                        ? m.AuthorType == SupportTicketMessage.AuthorStaff
                        : (m.AuthorType == SupportTicketMessage.AuthorClient &&
                           m.AuthorUserId == viewerUserId)
                }).ToList()
            };
        }

        private async Task<(bool queued, string? error)> QueueNewTicketEmailAsync(
            SupportTicket ticket,
            string displayName,
            string? userEmail,
            byte[]? attachmentBytes,
            string? attachmentContentType)
        {
            var supportTo = GetSupportInboxEmail();
            var subject = $"[Cimmple Support #{ticket.Id}] [{ticket.Product}] {ticket.Category}: {ticket.Subject}";
            var body = BuildNewTicketEmailBody(ticket, displayName, userEmail);

            var mail = new MailRequest
            {
                To = supportTo,
                Subject = subject,
                Body = body,
                IsHtml = true
            };

            if (attachmentBytes is { Length: > 0 } && !string.IsNullOrWhiteSpace(ticket.AttachmentFileName))
            {
                mail.Attachments.Add(new EmailAttachment
                {
                    FileName = ticket.AttachmentFileName!,
                    Content = attachmentBytes,
                    ContentType = attachmentContentType
                });
            }

            return await _emailOutbox.EnqueueAsync(ticket.TenantId, mail, skipNotificationGate: true);
        }

        private async Task<(bool queued, string? error)> QueueFollowUpToSupportAsync(
            SupportTicket ticket,
            string displayName,
            string? userEmail,
            string messageBody)
        {
            var supportTo = GetSupportInboxEmail();
            var subject = $"[Cimmple Support #{ticket.Id}] Client follow-up: {ticket.Subject}";
            var sb = new StringBuilder();
            sb.Append("<html><body style=\"font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#111;\">");
            sb.Append("<h2 style=\"margin:0 0 12px;\">Client follow-up</h2>");
            sb.Append("<p>Ticket #").Append(ticket.Id)
                .Append(" · ").Append(WebUtility.HtmlEncode(ticket.Product))
                .Append(" · Tenant ").Append(ticket.TenantId).Append("</p>");
            sb.Append("<p>From: ").Append(WebUtility.HtmlEncode(displayName));
            if (!string.IsNullOrWhiteSpace(userEmail))
                sb.Append(" &lt;").Append(WebUtility.HtmlEncode(userEmail)).Append("&gt;");
            sb.Append("</p>");
            sb.Append("<pre style=\"white-space:pre-wrap;background:#f8fafc;border:1px solid #e2e8f0;padding:12px;border-radius:6px;\">");
            sb.Append(WebUtility.HtmlEncode(messageBody));
            sb.Append("</pre></body></html>");

            return await _emailOutbox.EnqueueAsync(
                ticket.TenantId,
                new MailRequest
                {
                    To = supportTo,
                    Subject = subject,
                    Body = sb.ToString(),
                    IsHtml = true
                },
                skipNotificationGate: true);
        }

        private async Task<(bool queued, string? error)> QueueStaffReplyToClientAsync(
            SupportTicket ticket,
            string staffName,
            string messageBody,
            string? clientEmail)
        {
            if (string.IsNullOrWhiteSpace(clientEmail))
                return (false, "Client has no email on file.");

            var subject = $"[Cimmple Support #{ticket.Id}] Re: {ticket.Subject}";
            var sb = new StringBuilder();
            sb.Append("<html><body style=\"font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#111;\">");
            sb.Append("<p>Hello,</p>");
            sb.Append("<p>").Append(WebUtility.HtmlEncode(staffName))
                .Append(" replied to your support request <strong>#")
                .Append(ticket.Id).Append("</strong>:</p>");
            sb.Append("<pre style=\"white-space:pre-wrap;background:#f8fafc;border:1px solid #e2e8f0;padding:12px;border-radius:6px;\">");
            sb.Append(WebUtility.HtmlEncode(messageBody));
            sb.Append("</pre>");
            sb.Append("<p style=\"color:#64748b;font-size:12px;\">You can also view and reply in Cimmple → Contact support → My requests.</p>");
            sb.Append("</body></html>");

            return await _emailOutbox.EnqueueAsync(
                ticket.TenantId,
                new MailRequest
                {
                    To = clientEmail.Trim(),
                    Subject = subject,
                    Body = sb.ToString(),
                    IsHtml = true
                },
                skipNotificationGate: true);
        }

        private string GetSupportInboxEmail()
        {
            var supportTo = _configuration["Support:Email"]?.Trim();
            return string.IsNullOrWhiteSpace(supportTo) ? "contact@cimmple.com" : supportTo;
        }

        private string BuildNewTicketEmailBody(SupportTicket ticket, string displayName, string? userEmail)
        {
            var sb = new StringBuilder();
            sb.Append("<html><body style=\"font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#111;\">");
            sb.Append("<h2 style=\"margin:0 0 12px;\">New support request</h2>");
            sb.Append("<table cellpadding=\"6\" cellspacing=\"0\" style=\"border-collapse:collapse;\">");
            AppendRow(sb, "Ticket", $"#{ticket.Id}");
            AppendRow(sb, "Product", WebUtility.HtmlEncode(ticket.Product));
            AppendRow(sb, "Category", ticket.Category);
            AppendRow(sb, "Status", ticket.Status);
            AppendRow(sb, "Subject", ticket.Subject);
            AppendRow(sb, "Tenant", ticket.TenantId.ToString());
            AppendRow(sb, "User", $"{WebUtility.HtmlEncode(displayName)} (id {ticket.CreatedByUserId})");
            if (!string.IsNullOrWhiteSpace(userEmail))
                AppendRow(sb, "User email", WebUtility.HtmlEncode(userEmail));
            AppendRow(sb, "App", ticket.AppSource);
            if (!string.IsNullOrWhiteSpace(ticket.AppVersion))
                AppendRow(sb, "Version", WebUtility.HtmlEncode(ticket.AppVersion));
            if (ticket.LocationId.HasValue)
            {
                var locName = _context.Locations.AsNoTracking()
                    .Where(l => l.LocationId == ticket.LocationId.Value)
                    .Select(l => l.Name)
                    .FirstOrDefault();
                AppendRow(sb, "Location",
                    string.IsNullOrWhiteSpace(locName)
                        ? ticket.LocationId.Value.ToString()
                        : $"{locName} (#{ticket.LocationId.Value})");
            }
            if (!string.IsNullOrWhiteSpace(ticket.EntityType) || ticket.EntityId.HasValue)
                AppendRow(sb, "Entity", $"{WebUtility.HtmlEncode(ticket.EntityType ?? "")} #{ticket.EntityId}");
            if (!string.IsNullOrWhiteSpace(ticket.LinkPath))
                AppendRow(sb, "Path", WebUtility.HtmlEncode(ticket.LinkPath));
            if (!string.IsNullOrWhiteSpace(ticket.AttachmentFileName))
                AppendRow(sb, "Attachment", WebUtility.HtmlEncode(ticket.AttachmentFileName));
            AppendRow(sb, "Created (UTC)", ticket.CreatedAt.ToString("u"));
            sb.Append("</table>");
            sb.Append("<h3 style=\"margin:18px 0 8px;\">Description</h3>");
            sb.Append("<pre style=\"white-space:pre-wrap;background:#f8fafc;border:1px solid #e2e8f0;padding:12px;border-radius:6px;\">");
            sb.Append(WebUtility.HtmlEncode(ticket.Description));
            sb.Append("</pre></body></html>");
            return sb.ToString();
        }

        private static void AppendRow(StringBuilder sb, string label, string value)
        {
            sb.Append("<tr><td style=\"font-weight:600;vertical-align:top;color:#475569;\">")
                .Append(WebUtility.HtmlEncode(label))
                .Append("</td><td>")
                .Append(value)
                .Append("</td></tr>");
        }

        private string NormalizeProduct(string? product)
        {
            var configured = GetConfiguredProducts();
            var p = (product ?? "").Trim();
            if (string.IsNullOrWhiteSpace(p))
                return GetDefaultProduct();
            var match = configured.FirstOrDefault(c => c.Equals(p, StringComparison.OrdinalIgnoreCase));
            return match ?? GetDefaultProduct();
        }

        private static string? NormalizeStatus(string? status)
        {
            return (status ?? "").Trim().ToLowerInvariant() switch
            {
                "open" => SupportTicket.StatusOpen,
                "waiting" or "waitingonuser" => SupportTicket.StatusWaiting,
                "resolved" => SupportTicket.StatusResolved,
                "closed" => SupportTicket.StatusClosed,
                "" => null,
                _ => null
            };
        }

        private static string NormalizeCategory(string? category)
        {
            return (category ?? "").Trim().ToLowerInvariant() switch
            {
                "bug" => SupportTicket.CategoryBug,
                "howto" => SupportTicket.CategoryHowTo,
                "billing" => SupportTicket.CategoryBilling,
                "access" => SupportTicket.CategoryAccess,
                "dataissue" => SupportTicket.CategoryData,
                _ => SupportTicket.CategoryOther
            };
        }

        private static string NormalizeAppSource(string? source)
        {
            return (source ?? "").Trim().ToLowerInvariant() switch
            {
                "pwa" => "PWA",
                "vpa" => "VPA",
                "punch" => "Punch",
                _ => "UI"
            };
        }

        private static string BuildDisplayName(UserDetail? user, string? username)
        {
            if (user != null)
            {
                var name = $"{user.FirstName} {user.LastName}".Trim();
                if (!string.IsNullOrWhiteSpace(name)) return name;
                if (!string.IsNullOrWhiteSpace(user.UserName)) return user.UserName!;
            }
            return string.IsNullOrWhiteSpace(username) ? "User" : username.Trim();
        }

        private static string? Truncate(string? value, int max)
        {
            if (string.IsNullOrWhiteSpace(value)) return null;
            var v = value.Trim();
            return v.Length <= max ? v : v[..max];
        }
    }
}
