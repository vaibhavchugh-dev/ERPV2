using System.Security.Claims;
using Microsoft.AspNetCore.Mvc;

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
            return int.TryParse(tenantIdHeader, out var tenantId) ? tenantId : 0;
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
        /// Returns null if header missing; sets <paramref name="error"/> when invalid/forbidden.
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

        /// <summary>
        /// User's default location from JWT (login seed). Used so legacy unscoped rows
        /// (locationId 0/null) appear only under the default location, not every switch.
        /// </summary>
        protected int? GetDefaultLocationId()
        {
            var claim = User?.FindFirst("defaultLocationId")?.Value;
            if (int.TryParse(claim, out var id) && id > 0) return id;

            var allowed = GetAllowedLocationIds();
            return allowed.Count > 0 ? allowed[0] : null;
        }

        /// <summary>
        /// True when a stored location matches the active working location, or when the
        /// row is unscoped (0/null) and the active location is the user's default.
        /// </summary>
        protected bool MatchesActiveLocation(int? rowLocationId, int activeLocationId)
        {
            if (rowLocationId.HasValue && rowLocationId.Value > 0)
            {
                return rowLocationId.Value == activeLocationId;
            }

            var defaultId = GetDefaultLocationId();
            return defaultId.HasValue && defaultId.Value == activeLocationId;
        }

        /// <summary>
        /// Reads X-Location-Id. Returns false with a 403 result when the header is present but not allowed.
        /// <paramref name="locationId"/> is null when the header is absent.
        /// </summary>
        protected bool TryGetActiveLocationId(out int? locationId, out IActionResult? forbidResult)
        {
            locationId = GetActiveLocationId(out var error);
            if (error != null)
            {
                forbidResult = StatusCode(403, new { message = error });
                return false;
            }

            forbidResult = null;
            return true;
        }

        /// <summary>
        /// Shared multi-site list filter: only apply when the client passes an explicit
        /// <paramref name="queryLocationId"/> &gt; 0. Does not auto-filter from X-Location-Id
        /// so tenant-wide lists remain visible by default. Pass 0/null for all locations.
        /// </summary>
        protected bool TryResolveListLocationFilter(
            int? queryLocationId,
            out int? filterLocationId,
            out IActionResult? forbidResult)
        {
            filterLocationId = null;
            forbidResult = null;

            if (!queryLocationId.HasValue || queryLocationId.Value <= 0)
            {
                return true;
            }

            if (!CanAccessLocation(queryLocationId.Value))
            {
                forbidResult = StatusCode(403, new { message = "You do not have access to the selected location" });
                return false;
            }

            filterLocationId = queryLocationId.Value;
            return true;
        }

        /// <summary>
        /// Prefer an explicit request location when &gt; 0 (and allowed); otherwise use the active
        /// working location header; otherwise <paramref name="fallback"/>.
        /// </summary>
        protected bool TryResolveLocationId(
            int? requestLocationId,
            out int locationId,
            out IActionResult? forbidResult,
            int fallback = 0)
        {
            locationId = 0;
            forbidResult = null;

            if (requestLocationId.HasValue && requestLocationId.Value > 0)
            {
                if (!CanAccessLocation(requestLocationId.Value))
                {
                    forbidResult = StatusCode(403, new { message = "You do not have access to the selected location" });
                    return false;
                }

                locationId = requestLocationId.Value;
                return true;
            }

            if (!TryGetActiveLocationId(out var active, out forbidResult))
            {
                return false;
            }

            locationId = active ?? fallback;
            return true;
        }
    }
}
