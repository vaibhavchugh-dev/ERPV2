using Microsoft.AspNetCore.Mvc;
using System.Linq;

namespace CimmpleAPI.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public abstract class ApiBaseController : ControllerBase
    {
        protected int GetTenantId()
        {
            var tenantIdHeader = Request.Headers["tenantId"].FirstOrDefault();
            return int.TryParse(tenantIdHeader, out var tenantId) ? tenantId : 0;
        }

        protected string? GetUsername()
        {
            return Request.Headers["Username"].FirstOrDefault();
        }

        protected int? GetUserId()
        {
            var userIdHeader = Request.Headers["userId"].FirstOrDefault();
            return int.TryParse(userIdHeader, out var userId) ? userId : (int?)null;
        }
    }
}

