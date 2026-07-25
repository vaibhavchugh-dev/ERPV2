using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Linq;
using System.Security.Claims;

namespace CimmpleAPI.Controllers
{
    [Authorize]
    [ApiController]
    [Route("api/[controller]")]
    public abstract class ApiBaseController : ControllerBase
    {
        protected int GetTenantId()
        {
            var claimValue = User.FindFirst("tenantid")?.Value;
            if (int.TryParse(claimValue, out var tenantId) && tenantId > 0)
            {
                return tenantId;
            }

            var tenantIdHeader = Request.Headers["tenantId"].FirstOrDefault();
            return int.TryParse(tenantIdHeader, out var headerTenantId) ? headerTenantId : 0;
        }

        protected string? GetUsername()
        {
            var claimValue = User.FindFirst("username")?.Value ?? User.FindFirst(ClaimTypes.Name)?.Value;
            if (!string.IsNullOrEmpty(claimValue))
            {
                return claimValue;
            }

            return Request.Headers["Username"].FirstOrDefault();
        }

        protected int? GetUserId()
        {
            var claimValue = User.FindFirst("uid")?.Value ?? User.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? User.FindFirst("sub")?.Value;
            if (int.TryParse(claimValue, out var userId))
            {
                return userId;
            }

            var userIdHeader = Request.Headers["userId"].FirstOrDefault();
            return int.TryParse(userIdHeader, out var headerUserId) ? headerUserId : (int?)null;
        }
    }
}

