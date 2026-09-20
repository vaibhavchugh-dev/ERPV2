using CimmpleAPI.Services;
using Microsoft.AspNetCore.Mvc;

namespace CimmpleAPI.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class SupportTicketsController : ApiBaseController
    {
        private readonly SupportTicketService _tickets;

        public SupportTicketsController(SupportTicketService tickets)
        {
            _tickets = tickets;
        }

        [HttpGet("ListMine")]
        public async Task<IActionResult> ListMine([FromQuery] int take = 50)
        {
            var tenantId = GetTenantId();
            var userId = GetUserId();
            if (tenantId <= 0 || userId == null || userId <= 0)
                return BadRequest(new { error = "Tenant and user are required." });

            var items = await _tickets.ListMineAsync(tenantId, userId.Value, take);
            return Ok(new { result = items });
        }

        [HttpGet("GetUnreadCount")]
        public async Task<IActionResult> GetUnreadCount()
        {
            var tenantId = GetTenantId();
            var userId = GetUserId();
            if (tenantId <= 0 || userId == null || userId <= 0)
                return BadRequest(new { error = "Tenant and user are required." });

            var count = await _tickets.GetClientUnreadCountAsync(tenantId, userId.Value);
            return Ok(new { result = count });
        }

        [HttpGet("Get/{id:int}")]
        public async Task<IActionResult> Get(int id)
        {
            var tenantId = GetTenantId();
            var userId = GetUserId();
            if (tenantId <= 0 || userId == null || userId <= 0)
                return BadRequest(new { error = "Tenant and user are required." });

            var detail = await _tickets.GetMineAsync(tenantId, userId.Value, id);
            if (detail == null)
                return NotFound(new { error = "Support ticket not found." });

            return Ok(new { result = detail });
        }

        /// <summary>
        /// Create a support ticket. Accepts multipart/form-data (with optional file)
        /// or application/json without an attachment.
        /// </summary>
        [HttpPost("Create")]
        [RequestSizeLimit(10 * 1024 * 1024)]
        public async Task<IActionResult> Create()
        {
            var tenantId = GetTenantId();
            var userId = GetUserId();
            if (tenantId <= 0 || userId == null || userId <= 0)
                return BadRequest(new { error = "Tenant and user are required." });

            SupportTicketCreateRequest request;
            IFormFile? attachment = null;

            if (Request.HasFormContentType)
            {
                var form = await Request.ReadFormAsync();
                request = new SupportTicketCreateRequest
                {
                    Category = form["category"].ToString(),
                    Subject = form["subject"].ToString(),
                    Description = form["description"].ToString(),
                    AppSource = form["appSource"].ToString(),
                    AppVersion = NullIfEmpty(form["appVersion"].ToString()),
                    Product = NullIfEmpty(form["product"].ToString()),
                    UserAgent = NullIfEmpty(form["userAgent"].ToString())
                        ?? Truncate(Request.Headers.UserAgent.ToString(), 500),
                    LocationId = ParsePositiveInt(form["locationId"].ToString())
                        ?? GetActiveLocationId(out _),
                    EntityType = NullIfEmpty(form["entityType"].ToString()),
                    EntityId = ParsePositiveInt(form["entityId"].ToString()),
                    LinkPath = NullIfEmpty(form["linkPath"].ToString())
                };
                attachment = form.Files.GetFile("attachment") ?? form.Files.FirstOrDefault();
            }
            else
            {
                request = await ReadJsonBodyAsync() ?? new SupportTicketCreateRequest();
                if (string.IsNullOrWhiteSpace(request.UserAgent))
                    request.UserAgent = Truncate(Request.Headers.UserAgent.ToString(), 500);
                if (request.LocationId is null or <= 0)
                    request.LocationId = GetActiveLocationId(out _);
            }

            if (string.IsNullOrWhiteSpace(request.LinkPath))
            {
                var referer = Request.Headers.Referer.ToString();
                if (!string.IsNullOrWhiteSpace(referer))
                {
                    try
                    {
                        var uri = new Uri(referer);
                        request.LinkPath = Truncate(uri.PathAndQuery, 500);
                    }
                    catch
                    {
                        // ignore invalid referer
                    }
                }
            }

            var result = await _tickets.CreateAsync(
                tenantId,
                userId.Value,
                GetUsername(),
                request,
                attachment);

            if (!string.IsNullOrEmpty(result.Error) && result.TicketId <= 0)
                return BadRequest(new { error = result.Error });

            return Ok(new
            {
                result = new
                {
                    ticketId = result.TicketId,
                    emailQueued = result.EmailQueued,
                    emailError = result.EmailError
                },
                message = "Support request submitted."
            });
        }

        [HttpPost("Reply")]
        public async Task<IActionResult> Reply([FromBody] ClientSupportReplyRequest? request)
        {
            var tenantId = GetTenantId();
            var userId = GetUserId();
            if (tenantId <= 0 || userId == null || userId <= 0)
                return BadRequest(new { error = "Tenant and user are required." });
            if (request == null || request.TicketId <= 0)
                return BadRequest(new { error = "Ticket id is required." });

            var result = await _tickets.ClientReplyAsync(
                tenantId,
                userId.Value,
                GetUsername(),
                request.TicketId,
                request.Body ?? "");

            if (!string.IsNullOrEmpty(result.Error) && result.MessageId <= 0)
                return BadRequest(new { error = result.Error });

            return Ok(new
            {
                result = new
                {
                    messageId = result.MessageId,
                    emailQueued = result.EmailQueued,
                    emailError = result.EmailError
                },
                message = "Reply sent."
            });
        }

        [HttpGet("DownloadAttachment/{id:int}")]
        public async Task<IActionResult> DownloadAttachment(int id)
        {
            var tenantId = GetTenantId();
            var userId = GetUserId();
            if (tenantId <= 0 || userId == null || userId <= 0)
                return BadRequest(new { error = "Tenant and user are required." });

            var (bytes, fileName, contentType, error) = await _tickets.DownloadAttachmentAsync(
                id, tenantId, userId.Value, asStaff: false);
            if (bytes == null)
                return NotFound(new { error = error ?? "Attachment not found." });

            return File(bytes, contentType, fileName);
        }

        public class ClientSupportReplyRequest
        {
            public int TicketId { get; set; }
            public string Body { get; set; } = "";
        }

        private async Task<SupportTicketCreateRequest?> ReadJsonBodyAsync()
        {
            try
            {
                return await System.Text.Json.JsonSerializer.DeserializeAsync<SupportTicketCreateRequest>(
                    Request.Body,
                    new System.Text.Json.JsonSerializerOptions
                    {
                        PropertyNameCaseInsensitive = true
                    });
            }
            catch
            {
                return null;
            }
        }

        private static int? ParsePositiveInt(string? raw)
        {
            if (int.TryParse(raw, out var n) && n > 0) return n;
            return null;
        }

        private static string? NullIfEmpty(string? value)
        {
            return string.IsNullOrWhiteSpace(value) ? null : value.Trim();
        }

        private static string? Truncate(string? value, int max)
        {
            if (string.IsNullOrWhiteSpace(value)) return null;
            var v = value.Trim();
            return v.Length <= max ? v : v[..max];
        }
    }
}
