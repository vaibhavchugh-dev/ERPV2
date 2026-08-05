using CimmpleAPI.Data;
using CimmpleAPI.Data.Models;
using CimmpleAPI.Services.Auth;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CimmpleAPI.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class AuthController : ApiBaseController
    {
        private readonly IAuthService _authService;
        private readonly CimmpleDbContext _db;

        public AuthController(IAuthService authService, CimmpleDbContext db)
        {
            _authService = authService;
            _db = db;
        }
        [AllowAnonymous]
        [HttpPost("Login")]
        public async Task<IActionResult> Login([FromBody] LoginRequest request)
        {
            var ip = HttpContext.Connection.RemoteIpAddress?.ToString();
            var browser = Request.Headers.UserAgent.ToString();
            var (response, error, status) = await _authService.LoginAsync(request, ip, browser);
            if (response == null)
            {
                return StatusCode(status, new { message = error, session = status == 401 ? false : (bool?)null });
            }

            return Ok(response);
        }
        [AllowAnonymous]
        [HttpPost("VendorLogin")]
        public async Task<IActionResult> VendorLogin([FromBody] VendorLoginRequest request)
        {
            var ip = HttpContext.Connection.RemoteIpAddress?.ToString();
            var browser = Request.Headers.UserAgent.ToString();
            var (response, error, status) = await _authService.VendorLoginAsync(request, ip, browser);
            if (response == null)
            {
                return StatusCode(status, new { message = error, session = status == 401 ? false : (bool?)null });
            }

            return Ok(response);
        }
        [AllowAnonymous]
        [HttpPost("Refresh")]
        public async Task<IActionResult> Refresh([FromBody] RefreshTokenRequest request)
        {
            var (response, error, status) = await _authService.RefreshAsync(request.RefreshToken);
            if (response == null)
            {
                return StatusCode(status, new { message = error, session = false });
            }

            return Ok(response);
        }

        [Authorize]
        [HttpPost("Logout")]
        public async Task<IActionResult> Logout()
        {
            var userId = GetUserId();
            if (userId.HasValue)
            {
                await _authService.LogoutAsync(userId.Value);
            }

            return Ok(new { message = "Logged out" });
        }

        [Authorize]
        [HttpGet("Me")]
        public async Task<IActionResult> Me()
        {
            var userId = GetUserId();
            if (!userId.HasValue)
            {
                return Unauthorized(new { message = "Not authenticated", session = false });
            }

            var user = await _authService.GetCurrentUserAsync(userId.Value);
            if (user == null)
            {
                return Unauthorized(new { message = "User not found", session = false });
            }

            return Ok(user);
        }

        [Authorize]
        [HttpPost("ChangePassword")]
        public async Task<IActionResult> ChangePassword([FromBody] ChangePasswordRequest request)
        {
            var userId = GetUserId();
            if (!userId.HasValue)
            {
                return Unauthorized(new { message = "Not authenticated", session = false });
            }

            var (ok, error) = await _authService.ChangePasswordAsync(userId.Value, request);
            if (!ok)
            {
                return BadRequest(new { message = error });
            }

            return Ok(new { message = "Password changed successfully" });
        }

        [Authorize]
        [HttpPost("SetDefaultLocation")]
        public async Task<IActionResult> SetDefaultLocation([FromBody] SetDefaultLocationRequest request)
        {
            var userId = GetUserId();
            if (!userId.HasValue)
            {
                return Unauthorized(new { message = "Not authenticated", session = false });
            }

            if (!CanAccessLocation(request.LocationId))
            {
                return StatusCode(403, new { message = "You do not have access to the selected location" });
            }

            var user = await _db.UserDetails.FindAsync(userId.Value);
            if (user == null)
            {
                return NotFound(new { message = "User not found" });
            }

            user.DefaultLocationId = request.LocationId;
            await _db.SaveChangesAsync();
            return Ok(new { message = "Default location updated", locationId = request.LocationId });
        }

        /// <summary>
        /// Development helper: set/reset a user's password when they have none (bootstrap).
        /// Disabled outside Development.
        /// </summary>
        [AllowAnonymous]
        [HttpPost("BootstrapPassword")]
        public async Task<IActionResult> BootstrapPassword(
            [FromBody] BootstrapPasswordRequest request,
            [FromServices] IHostEnvironment env)
        {
            if (!env.IsDevelopment())
            {
                return NotFound();
            }

            if (string.IsNullOrWhiteSpace(request.Username) || string.IsNullOrWhiteSpace(request.NewPassword))
            {
                return BadRequest(new { message = "Username and NewPassword are required" });
            }

            var query = _db.UserDetails.Where(u => u.UserName == request.Username);
            if (request.TenantId.HasValue && request.TenantId > 0)
            {
                query = query.Where(u => u.TenantID == request.TenantId.Value);
            }

            var user = await query.FirstOrDefaultAsync();
            if (user == null)
            {
                return NotFound(new { message = "User not found" });
            }

            // Only allow bootstrap when password empty or Force=true
            if (!string.IsNullOrEmpty(user.Password) && !request.Force)
            {
                return BadRequest(new { message = "User already has a password. Pass force=true to overwrite (dev only)." });
            }

            var settings = await _db.SystemSettings.FirstOrDefaultAsync(s => s.TenantId == user.TenantID)
                ?? new SystemSettings { TenantId = user.TenantID };

            if (!_authService.ValidatePasswordAgainstPolicy(request.NewPassword, settings, out var policyError))
            {
                return BadRequest(new { message = policyError });
            }

            await _authService.EnsurePasswordHashedAsync(user, request.NewPassword);
            user.PwdResetDate = DateTime.UtcNow;
            user.ChangePassword = "N";
            user.FailedLoginCount = 0;
            user.LockoutEndUtc = null;
            if (request.CanAccessAllLocations == true)
            {
                user.CanAccessAllLocations = true;
            }

            await _db.SaveChangesAsync();
            return Ok(new { message = "Password set", userId = user.User_UniqueID, tenantId = user.TenantID });
        }
    }

    public class SetDefaultLocationRequest
    {
        public int LocationId { get; set; }
    }

    public class BootstrapPasswordRequest
    {
        public string Username { get; set; } = string.Empty;
        public string NewPassword { get; set; } = string.Empty;
        public int? TenantId { get; set; }
        public bool Force { get; set; }
        public bool? CanAccessAllLocations { get; set; }
    }
}
