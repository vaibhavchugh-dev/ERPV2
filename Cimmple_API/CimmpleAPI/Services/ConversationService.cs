using CimmpleAPI.Data;
using CimmpleAPI.Data.Models;
using Microsoft.EntityFrameworkCore;

namespace CimmpleAPI.Services
{
    public class ConversationPostResult
    {
        public int ConversationId { get; set; }
        public int MessageId { get; set; }
        public bool InboxCreated { get; set; }
        public bool EmailSent { get; set; }
        public string? EmailError { get; set; }
        public string? Error { get; set; }
    }

    public class ConversationListItem
    {
        public int Id { get; set; }
        public string? Subject { get; set; }
        public DateTime? LastMessageAt { get; set; }
        public string? LastMessagePreview { get; set; }
        public int OtherUserId { get; set; }
        public string OtherUserName { get; set; } = "";
        public int UnreadCount { get; set; }
    }

    public class ConversationMessageDto
    {
        public int Id { get; set; }
        public int SenderUserId { get; set; }
        public string SenderName { get; set; } = "";
        public string Body { get; set; } = "";
        public int? ParentMessageId { get; set; }
        public DateTime CreatedAt { get; set; }
        public bool IsMine { get; set; }
    }

    public class ConversationService
    {
        private readonly CimmpleDbContext _context;
        private readonly NotificationService _notificationService;

        public ConversationService(CimmpleDbContext context, NotificationService notificationService)
        {
            _context = context;
            _notificationService = notificationService;
        }

        public async Task EnsureSchemaAsync()
        {
            await ConversationSchemaService.EnsureTablesAsync(_context);
            await _notificationService.EnsureSchemaAsync();
        }

        /// <summary>Find existing 1:1 DM between two users, or create one.</summary>
        public async Task<Conversation> FindOrCreateDmAsync(int tenantId, int userA, int userB, string? subject = null)
        {
            if (userA == userB)
                throw new InvalidOperationException("Cannot create a DM with yourself.");

            var existingId = await FindDmConversationIdAsync(tenantId, userA, userB);
            if (existingId.HasValue)
            {
                var existing = await _context.Conversations
                    .FirstAsync(c => c.Id == existingId.Value && c.TenantId == tenantId);
                if (!string.IsNullOrWhiteSpace(subject) && string.IsNullOrWhiteSpace(existing.Subject))
                {
                    existing.Subject = Truncate(subject.Trim(), 200);
                    await _context.SaveChangesAsync();
                }
                return existing;
            }

            var now = DateTime.UtcNow;
            var convo = new Conversation
            {
                TenantId = tenantId,
                CreatedByUserId = userA,
                Subject = string.IsNullOrWhiteSpace(subject) ? null : Truncate(subject.Trim(), 200),
                CreatedAt = now
            };
            _context.Conversations.Add(convo);
            await _context.SaveChangesAsync();

            _context.ConversationParticipants.AddRange(
                new ConversationParticipant
                {
                    TenantId = tenantId,
                    ConversationId = convo.Id,
                    UserId = userA,
                    JoinedAt = now
                },
                new ConversationParticipant
                {
                    TenantId = tenantId,
                    ConversationId = convo.Id,
                    UserId = userB,
                    JoinedAt = now
                });
            await _context.SaveChangesAsync();
            return convo;
        }

        public async Task<ConversationPostResult> PostDmAsync(
            int tenantId,
            int senderUserId,
            int recipientUserId,
            string body,
            string? subject = null,
            bool sendEmail = false)
        {
            var result = new ConversationPostResult();
            if (tenantId <= 0 || senderUserId <= 0 || recipientUserId <= 0)
            {
                result.Error = "Tenant and users are required.";
                return result;
            }
            if (senderUserId == recipientUserId)
            {
                result.Error = "Cannot send a message to yourself.";
                return result;
            }
            if (string.IsNullOrWhiteSpace(body))
            {
                result.Error = "Message body is required.";
                return result;
            }

            await EnsureSchemaAsync();

            var recipientOk = await _context.UserDetails.AsNoTracking()
                .AnyAsync(u => u.User_UniqueID == recipientUserId && u.TenantID == tenantId);
            if (!recipientOk)
            {
                result.Error = "Recipient user was not found in this tenant.";
                return result;
            }

            var convo = await FindOrCreateDmAsync(tenantId, senderUserId, recipientUserId, subject);
            var post = await PostMessageInternalAsync(
                tenantId,
                convo,
                senderUserId,
                body.Trim(),
                parentMessageId: null,
                sendEmail,
                notifyOthers: true,
                subjectOverride: subject);

            result.ConversationId = convo.Id;
            result.MessageId = post.MessageId;
            result.InboxCreated = post.InboxCreated;
            result.EmailSent = post.EmailSent;
            result.EmailError = post.EmailError;
            result.Error = post.Error;
            return result;
        }

        public async Task<ConversationPostResult> ReplyAsync(
            int tenantId,
            int conversationId,
            int senderUserId,
            string body,
            int? parentMessageId = null,
            bool sendEmail = false)
        {
            var result = new ConversationPostResult { ConversationId = conversationId };
            if (string.IsNullOrWhiteSpace(body))
            {
                result.Error = "Message body is required.";
                return result;
            }

            await EnsureSchemaAsync();

            var convo = await _context.Conversations
                .FirstOrDefaultAsync(c => c.Id == conversationId && c.TenantId == tenantId);
            if (convo == null)
            {
                result.Error = "Conversation not found.";
                return result;
            }

            var isParticipant = await _context.ConversationParticipants.AsNoTracking()
                .AnyAsync(p => p.ConversationId == conversationId && p.UserId == senderUserId && p.TenantId == tenantId);
            if (!isParticipant)
            {
                result.Error = "You are not a participant in this conversation.";
                return result;
            }

            var post = await PostMessageInternalAsync(
                tenantId,
                convo,
                senderUserId,
                body.Trim(),
                parentMessageId,
                sendEmail,
                notifyOthers: true,
                subjectOverride: null);

            result.MessageId = post.MessageId;
            result.InboxCreated = post.InboxCreated;
            result.EmailSent = post.EmailSent;
            result.EmailError = post.EmailError;
            result.Error = post.Error;
            return result;
        }

        public async Task<List<ConversationListItem>> ListMineAsync(int tenantId, int userId, int take = 50)
        {
            await EnsureSchemaAsync();
            if (take <= 0) take = 50;
            if (take > 100) take = 100;

            var myConvoIds = await _context.ConversationParticipants.AsNoTracking()
                .Where(p => p.TenantId == tenantId && p.UserId == userId)
                .Select(p => p.ConversationId)
                .ToListAsync();

            if (myConvoIds.Count == 0)
                return new List<ConversationListItem>();

            var convos = await _context.Conversations.AsNoTracking()
                .Where(c => c.TenantId == tenantId && myConvoIds.Contains(c.Id))
                .OrderByDescending(c => c.LastMessageAt ?? c.CreatedAt)
                .Take(take)
                .ToListAsync();

            var participants = await _context.ConversationParticipants.AsNoTracking()
                .Where(p => p.TenantId == tenantId && myConvoIds.Contains(p.ConversationId))
                .ToListAsync();

            var otherUserIds = participants
                .Where(p => p.UserId != userId)
                .Select(p => p.UserId)
                .Distinct()
                .ToList();

            var users = await _context.UserDetails.AsNoTracking()
                .Where(u => u.TenantID == tenantId && otherUserIds.Contains(u.User_UniqueID))
                .Select(u => new { u.User_UniqueID, u.FirstName, u.LastName, u.UserName })
                .ToListAsync();

            var lastMessages = await _context.ConversationMessages.AsNoTracking()
                .Where(m => m.TenantId == tenantId && myConvoIds.Contains(m.ConversationId))
                .GroupBy(m => m.ConversationId)
                .Select(g => new
                {
                    ConversationId = g.Key,
                    Body = g.OrderByDescending(x => x.CreatedAt).Select(x => x.Body).FirstOrDefault(),
                    MaxId = g.Max(x => x.Id)
                })
                .ToListAsync();

            var myReads = participants
                .Where(p => p.UserId == userId)
                .ToDictionary(p => p.ConversationId, p => p.LastReadMessageId ?? 0);

            var unreadRows = await _context.ConversationMessages.AsNoTracking()
                .Where(m =>
                    m.TenantId == tenantId &&
                    myConvoIds.Contains(m.ConversationId) &&
                    m.SenderUserId != userId)
                .Select(m => new { m.ConversationId, m.Id })
                .ToListAsync();

            var unreadByConvo = unreadRows
                .GroupBy(x => x.ConversationId)
                .ToDictionary(
                    g => g.Key,
                    g =>
                    {
                        var lastRead = myReads.TryGetValue(g.Key, out var lr) ? lr : 0;
                        return g.Count(x => x.Id > lastRead);
                    });

            var result = new List<ConversationListItem>();
            foreach (var c in convos)
            {
                var other = participants.FirstOrDefault(p => p.ConversationId == c.Id && p.UserId != userId);
                var otherUser = other == null ? null : users.FirstOrDefault(u => u.User_UniqueID == other.UserId);
                var name = otherUser == null
                    ? "User"
                    : $"{otherUser.FirstName} {otherUser.LastName}".Trim();
                if (string.IsNullOrWhiteSpace(name))
                    name = otherUser?.UserName ?? "User";

                var last = lastMessages.FirstOrDefault(l => l.ConversationId == c.Id);
                unreadByConvo.TryGetValue(c.Id, out var unread);

                result.Add(new ConversationListItem
                {
                    Id = c.Id,
                    Subject = c.Subject,
                    LastMessageAt = c.LastMessageAt ?? c.CreatedAt,
                    LastMessagePreview = TruncateNullable(StripMentionTokensForPreview(last?.Body ?? ""), 120),
                    OtherUserId = other?.UserId ?? 0,
                    OtherUserName = name,
                    UnreadCount = unread
                });
            }

            return result;
        }

        /// <summary>Total unread messages across all conversations for this user.</summary>
        public async Task<int> GetUnreadTotalAsync(int tenantId, int userId)
        {
            await EnsureSchemaAsync();

            var parts = await _context.ConversationParticipants.AsNoTracking()
                .Where(p => p.TenantId == tenantId && p.UserId == userId)
                .Select(p => new { p.ConversationId, LastRead = p.LastReadMessageId ?? 0 })
                .ToListAsync();
            if (parts.Count == 0) return 0;

            var convoIds = parts.Select(p => p.ConversationId).ToList();
            var lastRead = parts.ToDictionary(p => p.ConversationId, p => p.LastRead);

            var rows = await _context.ConversationMessages.AsNoTracking()
                .Where(m =>
                    m.TenantId == tenantId &&
                    convoIds.Contains(m.ConversationId) &&
                    m.SenderUserId != userId)
                .Select(m => new { m.ConversationId, m.Id })
                .ToListAsync();

            return rows.Count(m =>
                m.Id > (lastRead.TryGetValue(m.ConversationId, out var lr) ? lr : 0));
        }

        public async Task<(Conversation? convo, string? otherName, List<ConversationMessageDto> messages, string? error)> GetThreadAsync(
            int tenantId,
            int conversationId,
            int userId,
            int take = 100,
            bool markRead = false)
        {
            await EnsureSchemaAsync();
            if (take <= 0) take = 100;
            if (take > 200) take = 200;

            var participants = await _context.ConversationParticipants
                .Where(p => p.ConversationId == conversationId && p.TenantId == tenantId)
                .ToListAsync();

            var me = participants.FirstOrDefault(p => p.UserId == userId);
            if (me == null)
                return (null, null, new List<ConversationMessageDto>(), "Conversation not found.");

            var convo = await _context.Conversations.AsNoTracking()
                .FirstOrDefaultAsync(c => c.Id == conversationId && c.TenantId == tenantId);
            if (convo == null)
                return (null, null, new List<ConversationMessageDto>(), "Conversation not found.");

            var other = participants.FirstOrDefault(p => p.UserId != userId);
            string otherName = "User";
            var otherCount = participants.Count(p => p.UserId != userId);
            if (otherCount > 1)
            {
                otherName = $"{otherCount} people";
            }
            else if (other != null)
            {
                var u = await _context.UserDetails.AsNoTracking()
                    .Where(x => x.User_UniqueID == other.UserId && x.TenantID == tenantId)
                    .Select(x => new { x.FirstName, x.LastName, x.UserName })
                    .FirstOrDefaultAsync();
                if (u != null)
                {
                    otherName = $"{u.FirstName} {u.LastName}".Trim();
                    if (string.IsNullOrWhiteSpace(otherName))
                        otherName = u.UserName ?? "User";
                }
            }

            // Prefer Id order (clustered PK) — CreatedAt is set at insert so Id ≈ time for DMs.
            var rows = await _context.ConversationMessages.AsNoTracking()
                .Where(m => m.ConversationId == conversationId && m.TenantId == tenantId)
                .OrderByDescending(m => m.Id)
                .Take(take)
                .ToListAsync();
            rows.Reverse();

            var senderIds = rows.Select(r => r.SenderUserId).Distinct().ToList();
            Dictionary<int, string> senderNames = new();
            if (senderIds.Count > 0)
            {
                var senders = await _context.UserDetails.AsNoTracking()
                    .Where(u => u.TenantID == tenantId && senderIds.Contains(u.User_UniqueID))
                    .Select(u => new { u.User_UniqueID, u.FirstName, u.LastName, u.UserName })
                    .ToListAsync();
                foreach (var s in senders)
                {
                    var name = $"{s.FirstName} {s.LastName}".Trim();
                    if (string.IsNullOrWhiteSpace(name)) name = s.UserName ?? "User";
                    senderNames[s.User_UniqueID] = name;
                }
            }

            var dtos = rows.Select(m => new ConversationMessageDto
            {
                Id = m.Id,
                SenderUserId = m.SenderUserId,
                SenderName = senderNames.TryGetValue(m.SenderUserId, out var n) ? n : "User",
                Body = m.Body,
                ParentMessageId = m.ParentMessageId,
                CreatedAt = m.CreatedAt,
                IsMine = m.SenderUserId == userId
            }).ToList();

            if (markRead)
            {
                var lastId = rows.Count > 0 ? rows[rows.Count - 1].Id : 0;
                await MarkReadCoreAsync(tenantId, conversationId, userId, me, lastId);
            }

            return (convo, otherName, dtos, null);
        }

        public async Task<int> MarkReadAsync(int tenantId, int conversationId, int userId)
        {
            await EnsureSchemaAsync();

            var participant = await _context.ConversationParticipants
                .FirstOrDefaultAsync(p =>
                    p.ConversationId == conversationId &&
                    p.UserId == userId &&
                    p.TenantId == tenantId);
            if (participant == null)
                return 0;

            var lastId = await _context.ConversationMessages.AsNoTracking()
                .Where(m => m.ConversationId == conversationId && m.TenantId == tenantId)
                .Select(m => (int?)m.Id)
                .MaxAsync() ?? 0;

            return await MarkReadCoreAsync(tenantId, conversationId, userId, participant, lastId);
        }

        private async Task<int> MarkReadCoreAsync(
            int tenantId,
            int conversationId,
            int userId,
            ConversationParticipant participant,
            int lastMessageId)
        {
            var now = DateTime.UtcNow;
            var cursorChanged = false;
            if (lastMessageId > 0 && participant.LastReadMessageId != lastMessageId)
            {
                participant.LastReadMessageId = lastMessageId;
                participant.LastReadAt = now;
                cursorChanged = true;
            }
            else if (participant.LastReadAt == null)
            {
                participant.LastReadAt = now;
                cursorChanged = true;
            }

            var notifs = await _context.Notifications
                .Where(n =>
                    n.TenantId == tenantId &&
                    n.RecipientUserId == userId &&
                    !n.IsRead &&
                    n.Type == NotificationService.TypeChatMessage &&
                    n.EntityType == "Conversation" &&
                    n.EntityId == conversationId)
                .ToListAsync();

            foreach (var n in notifs)
            {
                n.IsRead = true;
                n.ReadAt = now;
            }

            if (cursorChanged || notifs.Count > 0)
                await _context.SaveChangesAsync();

            return notifs.Count;
        }

        private async Task<int?> FindDmConversationIdAsync(int tenantId, int userA, int userB)
        {
            var aConvos = await _context.ConversationParticipants.AsNoTracking()
                .Where(p => p.TenantId == tenantId && p.UserId == userA)
                .Select(p => p.ConversationId)
                .ToListAsync();
            if (aConvos.Count == 0) return null;

            var shared = await _context.ConversationParticipants.AsNoTracking()
                .Where(p => p.TenantId == tenantId && p.UserId == userB && aConvos.Contains(p.ConversationId))
                .Select(p => p.ConversationId)
                .Distinct()
                .ToListAsync();

            int? bestId = null;
            var bestCount = int.MaxValue;
            foreach (var cid in shared)
            {
                var count = await _context.ConversationParticipants.AsNoTracking()
                    .CountAsync(p => p.ConversationId == cid && p.TenantId == tenantId);
                if (count == 2)
                    return cid;
                if (count >= 2 && count < bestCount)
                {
                    bestCount = count;
                    bestId = cid;
                }
            }

            return bestId;
        }

        private async Task<ConversationPostResult> PostMessageInternalAsync(
            int tenantId,
            Conversation convo,
            int senderUserId,
            string body,
            int? parentMessageId,
            bool sendEmail,
            bool notifyOthers,
            string? subjectOverride)
        {
            var result = new ConversationPostResult { ConversationId = convo.Id };
            var now = DateTime.UtcNow;

            var message = new ConversationMessage
            {
                TenantId = tenantId,
                ConversationId = convo.Id,
                SenderUserId = senderUserId,
                Body = Truncate(body, 4000),
                ParentMessageId = parentMessageId,
                CreatedAt = now
            };
            _context.ConversationMessages.Add(message);
            convo.LastMessageAt = now;
            if (!string.IsNullOrWhiteSpace(subjectOverride) && string.IsNullOrWhiteSpace(convo.Subject))
                convo.Subject = Truncate(subjectOverride.Trim(), 200);

            await _context.SaveChangesAsync();
            result.MessageId = message.Id;

            var senderParticipant = await _context.ConversationParticipants
                .FirstOrDefaultAsync(p => p.ConversationId == convo.Id && p.UserId == senderUserId);
            if (senderParticipant != null)
            {
                senderParticipant.LastReadMessageId = message.Id;
                senderParticipant.LastReadAt = now;
                await _context.SaveChangesAsync();
            }

            if (!notifyOthers)
                return result;

            var mentionedUserIds = ExtractMentionedUserIds(body)
                .Where(id => id > 0 && id != senderUserId)
                .Distinct()
                .ToList();

            // Mentions of users outside the DM: add them so they can open the thread.
            if (mentionedUserIds.Count > 0)
            {
                var existingIds = await _context.ConversationParticipants.AsNoTracking()
                    .Where(p => p.ConversationId == convo.Id && p.TenantId == tenantId)
                    .Select(p => p.UserId)
                    .ToListAsync();
                foreach (var uid in mentionedUserIds)
                {
                    if (existingIds.Contains(uid)) continue;
                    var exists = await _context.UserDetails.AsNoTracking()
                        .AnyAsync(u => u.User_UniqueID == uid && u.TenantID == tenantId);
                    if (!exists) continue;
                    _context.ConversationParticipants.Add(new ConversationParticipant
                    {
                        TenantId = tenantId,
                        ConversationId = convo.Id,
                        UserId = uid,
                        JoinedAt = now
                    });
                    existingIds.Add(uid);
                }
                await _context.SaveChangesAsync();
            }

            // Delivery channel is the conversation + Messages badge (not the alert bell).
            result.InboxCreated = true;

            // Optional email fan-out only (still does not surface in the alert bell — filtered by type).
            if (sendEmail)
            {
                var others = await _context.ConversationParticipants.AsNoTracking()
                    .Where(p => p.ConversationId == convo.Id && p.UserId != senderUserId)
                    .Select(p => p.UserId)
                    .ToListAsync();

                var actor = await _context.UserDetails.AsNoTracking()
                    .FirstOrDefaultAsync(u => u.User_UniqueID == senderUserId && u.TenantID == tenantId);
                var actorName = actor == null
                    ? "A teammate"
                    : $"{actor.FirstName} {actor.LastName}".Trim();
                if (string.IsNullOrWhiteSpace(actorName))
                    actorName = actor?.UserName ?? "A teammate";

                var title = !string.IsNullOrWhiteSpace(convo.Subject)
                    ? convo.Subject!
                    : $"Message from {actorName}";
                if (!string.IsNullOrWhiteSpace(subjectOverride))
                    title = subjectOverride.Trim();

                var previewBody = Truncate(StripMentionTokensForPreview(body), 4000);

                foreach (var otherId in others)
                {
                    var create = await _notificationService.CreateAsync(new NotificationCreateRequest
                    {
                        TenantId = tenantId,
                        RecipientUserId = otherId,
                        ActorUserId = senderUserId,
                        Type = NotificationService.TypeChatMessage,
                        Title = title,
                        Body = previewBody,
                        EntityType = "Conversation",
                        EntityId = convo.Id,
                        LinkPath = $"/messages?open={convo.Id}",
                        SendEmail = true,
                        EmailSubject = title
                    });

                    if (create.EmailSent) result.EmailSent = true;
                    if (!string.IsNullOrEmpty(create.EmailError) && string.IsNullOrEmpty(result.EmailError))
                        result.EmailError = create.EmailError;
                }
            }

            return result;
        }

        private static List<int> ExtractMentionedUserIds(string body)
        {
            var ids = new List<int>();
            if (string.IsNullOrEmpty(body)) return ids;
            // @[user:123|Label]
            var matches = System.Text.RegularExpressions.Regex.Matches(
                body,
                @"@\[user:(\d+)\|[^\]]*\]",
                System.Text.RegularExpressions.RegexOptions.IgnoreCase);
            foreach (System.Text.RegularExpressions.Match m in matches)
            {
                if (int.TryParse(m.Groups[1].Value, out var id) && id > 0 && !ids.Contains(id))
                    ids.Add(id);
            }
            return ids;
        }

        private static string StripMentionTokensForPreview(string body)
        {
            if (string.IsNullOrEmpty(body)) return body;
            return System.Text.RegularExpressions.Regex.Replace(
                body,
                @"@\[([a-zA-Z]+):(\d+)\|([^\]]+)\]",
                "@$3");
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
