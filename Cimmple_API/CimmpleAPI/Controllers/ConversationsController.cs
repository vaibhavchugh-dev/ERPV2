using CimmpleAPI.Services;
using Microsoft.AspNetCore.Mvc;

namespace CimmpleAPI.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class ConversationsController : ApiBaseController
    {
        private readonly ConversationService _conversations;

        public ConversationsController(ConversationService conversations)
        {
            _conversations = conversations;
        }

        [HttpGet("ListMine")]
        public async Task<IActionResult> ListMine([FromQuery] int take = 50)
        {
            var tenantId = GetTenantId();
            var userId = GetUserId();
            if (tenantId <= 0 || userId == null || userId <= 0)
                return BadRequest(new { error = "Tenant and user are required." });

            var items = await _conversations.ListMineAsync(tenantId, userId.Value, take);
            var unreadCount = items.Sum(i => i.UnreadCount);
            return Ok(new { result = items, unreadCount });
        }

        [HttpGet("GetUnreadCount")]
        public async Task<IActionResult> GetUnreadCount()
        {
            var tenantId = GetTenantId();
            var userId = GetUserId();
            if (tenantId <= 0 || userId == null || userId <= 0)
                return BadRequest(new { error = "Tenant and user are required." });

            var count = await _conversations.GetUnreadTotalAsync(tenantId, userId.Value);
            return Ok(new { result = count });
        }

        [HttpGet("Get/{id:int}")]
        public async Task<IActionResult> Get(int id, [FromQuery] int take = 100)
        {
            var tenantId = GetTenantId();
            var userId = GetUserId();
            if (tenantId <= 0 || userId == null || userId <= 0)
                return BadRequest(new { error = "Tenant and user are required." });

            var (convo, otherName, messages, error) =
                await _conversations.GetThreadAsync(tenantId, id, userId.Value, take, markRead: true);
            if (convo == null)
                return NotFound(new { error = error ?? "Conversation not found." });

            return Ok(new
            {
                result = new
                {
                    id = convo.Id,
                    subject = convo.Subject,
                    otherUserName = otherName,
                    lastMessageAt = convo.LastMessageAt,
                    messages
                }
            });
        }

        [HttpPost("Reply")]
        public async Task<IActionResult> Reply([FromBody] ReplyRequest request)
        {
            var tenantId = GetTenantId();
            var userId = GetUserId();
            if (tenantId <= 0 || userId == null || userId <= 0)
                return BadRequest(new { error = "Tenant and user are required." });
            if (request == null || request.ConversationId <= 0)
                return BadRequest(new { error = "Conversation id is required." });

            var result = await _conversations.ReplyAsync(
                tenantId,
                request.ConversationId,
                userId.Value,
                request.Body ?? "",
                request.ParentMessageId,
                request.SendEmail);

            if (!string.IsNullOrEmpty(result.Error) && result.MessageId <= 0)
                return BadRequest(new { error = result.Error });

            return Ok(new
            {
                result = new
                {
                    conversationId = result.ConversationId,
                    messageId = result.MessageId,
                    inboxCreated = result.InboxCreated,
                    emailSent = result.EmailSent,
                    emailError = result.EmailError
                },
                message = "Reply sent."
            });
        }

        [HttpPost("MarkRead")]
        public async Task<IActionResult> MarkRead([FromBody] MarkConversationReadRequest request)
        {
            var tenantId = GetTenantId();
            var userId = GetUserId();
            if (tenantId <= 0 || userId == null || userId <= 0)
                return BadRequest(new { error = "Tenant and user are required." });
            if (request == null || request.ConversationId <= 0)
                return BadRequest(new { error = "Conversation id is required." });

            var marked = await _conversations.MarkReadAsync(tenantId, request.ConversationId, userId.Value);
            return Ok(new { result = new { markedNotifications = marked } });
        }

        public class ReplyRequest
        {
            public int ConversationId { get; set; }
            public string Body { get; set; } = "";
            public int? ParentMessageId { get; set; }
            public bool SendEmail { get; set; }
        }

        public class MarkConversationReadRequest
        {
            public int ConversationId { get; set; }
        }
    }
}
