using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Linq;
using System.Security.Claims;

namespace CimmpleAPI.Controllers
{
    [Microsoft.AspNetCore.Mvc.ApiController]
    [Microsoft.AspNetCore.Mvc.Route("api/[controller]")]
    public abstract class ApiBaseController : Microsoft.AspNetCore.Mvc.ControllerBase
    {
        protected int GetTenantId()
        {
            var claim = User?.FindFirst("tenantId")?.Value
                ?? User?.FindFirst("tenant_id")?.Value;
            if (int.TryParse(claim, out var fromClaim) && fromClaim > 0)
            {
                return fromClaim;
            }

            // Fallback for transitional clients; prefer claims after login is enforced
            var tenantIdHeader = Request.Headers["tenantId"].FirstOrDefault();
            return int.TryParse(tenantIdHeader, out var headerTenantId) ? headerTenantId : 0;
        }

        protected string? GetUsername()
        {
            return User?.FindFirst("userName")?.Value
                ?? User?.FindFirst(ClaimTypes.Name)?.Value
                ?? Request.Headers["Username"].FirstOrDefault();
        }

        protected int? GetUserId()
        {
            var claim = User?.FindFirst("userId")?.Value
                ?? User?.FindFirst(ClaimTypes.NameIdentifier)?.Value
                ?? User?.FindFirst("sub")?.Value;
            if (int.TryParse(claim, out var fromClaim) && fromClaim > 0)
            {
                return fromClaim;
            }

            var userIdHeader = Request.Headers["userId"].FirstOrDefault();
            return int.TryParse(userIdHeader, out var userId) ? userId : null;
        }

        protected bool CanAccessAllLocations()
        {
            var claim = User?.FindFirst("canAccessAllLocations")?.Value;
            return string.Equals(claim, "true", StringComparison.OrdinalIgnoreCase);
        }

        protected IReadOnlyList<int> GetAllowedLocationIds()
        {
            var raw = User?.FindFirst("locationIds")?.Value;
            if (string.IsNullOrWhiteSpace(raw))
            {
                return Array.Empty<int>();
            }

            return raw.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .Select(s => int.TryParse(s, out var id) ? id : 0)
                .Where(id => id > 0)
                .Distinct()
                .ToList();
        }

        /// <summary>
        /// Active location from X-Location-Id header, validated against the user's allowed set.
        /// Returns null if header missing; throws Forbid-style via out error when invalid.
        /// </summary>
        protected int? GetActiveLocationId(out string? error)
        {
            error = null;
            var header = Request.Headers["X-Location-Id"].FirstOrDefault()
                ?? Request.Headers["locationId"].FirstOrDefault();
            if (string.IsNullOrWhiteSpace(header) || !int.TryParse(header, out var locationId) || locationId <= 0)
            {
                return null;
            }

            if (!CanAccessLocation(locationId))
            {
                error = "You do not have access to the selected location";
                return null;
            }

            return locationId;
        }

        protected bool CanAccessLocation(int locationId)
        {
            if (locationId <= 0) return false;
            if (CanAccessAllLocations()) return true;
            return GetAllowedLocationIds().Contains(locationId);
        }
    }
}
