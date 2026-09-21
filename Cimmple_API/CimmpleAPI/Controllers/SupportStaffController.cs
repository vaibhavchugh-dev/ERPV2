using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using CimmpleAPI.Services;
using CimmpleAPI.Services.Auth;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;

namespace CimmpleAPI.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class SupportStaffController : ApiBaseController
    {
        private readonly SupportTicketService _tickets;
        private readonly IJwtTokenService _jwt;
        private readonly IConfiguration _configuration;

        public SupportStaffController(
            SupportTicketService tickets,
            IJwtTokenService jwt,
            IConfiguration configuration)
        {
            _tickets = tickets;
            _jwt = jwt;
            _configuration = configuration;
        }

        [AllowAnonymous]
        [HttpPost("Login")]
        public IActionResult Login([FromBody] SupportStaffLoginRequest? request)
        {
            if (request == null ||
                string.IsNullOrWhiteSpace(request.Username) ||
                string.IsNullOrWhiteSpace(request.Password))
            {
                return BadRequest(new { message = "Username and password are required." });
            }

            var staff = FindStaff(request.Username.Trim(), request.Password);
            if (staff == null)
                return Unauthorized(new { message = "Invalid username or password." });

            var staffId = StableStaffId(staff.Username);
            var displayName = string.IsNullOrWhiteSpace(staff.DisplayName)
                ? staff.Username
                : staff.DisplayName.Trim();

            var claims = new List<Claim>
            {
                new(ClaimTypes.NameIdentifier, staffId.ToString()),
                new("userId", staffId.ToString()),
                new("tenantId", "0"),
                new(ClaimTypes.Name, staff.Username),
                new("userName", staff.Username),
                new("portalType", "support"),
                new("supportStaff", "true"),
                new("supportStaffName", displayName)
            };

            var (token, expires) = _jwt.CreateAccessToken(claims, sessionTimeoutMinutes: 480);

            return Ok(new
            {
                accessToken = token,
                expiresAtUtc = expires,
                user = new
                {
                    username = staff.Username,
                    displayName,
                    portalType = "support",
                    products = _tickets.GetConfiguredProducts()
                }
            });
        }

        [HttpGet("Products")]
        public IActionResult Products()
        {
            if (!IsSupportStaff())
                return Forbid();
            return Ok(new { result = _tickets.GetConfiguredProducts() });
        }

        [HttpGet("List")]
        public async Task<IActionResult> List(
            [FromQuery] string? product = null,
            [FromQuery] string? status = null,
            [FromQuery] string? q = null,
            [FromQuery] int take = 100)
        {
            if (!IsSupportStaff())
                return Forbid();

            var items = await _tickets.ListForStaffAsync(product, status, q, take);
            return Ok(new { result = items });
        }

        [HttpGet("Get/{id:int}")]
        public async Task<IActionResult> Get(int id)
        {
            if (!IsSupportStaff())
                return Forbid();

            var detail = await _tickets.GetForStaffAsync(id);
            if (detail == null)
                return NotFound(new { error = "Support ticket not found." });

            return Ok(new { result = detail });
        }

        [HttpPost("Reply")]
        public async Task<IActionResult> Reply([FromBody] SupportStaffReplyRequest? request)
        {
            if (!IsSupportStaff())
                return Forbid();
            if (request == null || request.TicketId <= 0)
                return BadRequest(new { error = "Ticket id is required." });

            var result = await _tickets.StaffReplyAsync(
                request.TicketId,
                GetSupportStaffName() ?? "Cimmple Support",
                request.Body ?? "",
                request.Status);

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

        [HttpPost("UpdateStatus")]
        public async Task<IActionResult> UpdateStatus([FromBody] SupportStaffStatusRequest? request)
        {
            if (!IsSupportStaff())
                return Forbid();
            if (request == null || request.TicketId <= 0)
                return BadRequest(new { error = "Ticket id is required." });

            var (ok, error) = await _tickets.StaffUpdateStatusAsync(request.TicketId, request.Status ?? "");
            if (!ok)
                return BadRequest(new { error = error ?? "Failed to update status." });

            return Ok(new { message = "Status updated." });
        }

        [HttpGet("DownloadAttachment/{id:int}")]
        public async Task<IActionResult> DownloadAttachment(int id)
        {
            if (!IsSupportStaff())
                return Forbid();

            var (bytes, fileName, contentType, error) = await _tickets.DownloadAttachmentAsync(
                id, tenantId: null, clientUserId: null, asStaff: true);
            if (bytes == null)
                return NotFound(new { error = error ?? "Attachment not found." });

            return File(bytes, contentType, fileName);
        }

        private SupportStaffConfigEntry? FindStaff(string username, string password)
        {
            var section = _configuration.GetSection("Support:Staff");
            var entries = section.Get<List<SupportStaffConfigEntry>>() ?? new List<SupportStaffConfigEntry>();
            return entries.FirstOrDefault(e =>
                !string.IsNullOrWhiteSpace(e.Username) &&
                e.Username.Trim().Equals(username, StringComparison.OrdinalIgnoreCase) &&
                e.Password == password);
        }

        private static int StableStaffId(string username)
        {
            var hash = SHA256.HashData(Encoding.UTF8.GetBytes(username.ToLowerInvariant()));
            var id = BitConverter.ToInt32(hash, 0);
            if (id == 0) id = 1;
            // Keep negative so staff ids never collide with positive User_UniqueID values.
            return id > 0 ? -id : id;
        }

        public class SupportStaffLoginRequest
        {
            public string Username { get; set; } = "";
            public string Password { get; set; } = "";
        }

        public class SupportStaffReplyRequest
        {
            public int TicketId { get; set; }
            public string Body { get; set; } = "";
            public string? Status { get; set; }
        }

        public class SupportStaffStatusRequest
        {
            public int TicketId { get; set; }
            public string Status { get; set; } = "";
        }

        private sealed class SupportStaffConfigEntry
        {
            public string Username { get; set; } = "";
            public string Password { get; set; } = "";
            public string? DisplayName { get; set; }
        }
    }
}
