using CimmpleAPI.Services.Auth;
using CimmpleAPI.Services.Tenancy;
using Microsoft.AspNetCore.Mvc;

namespace CimmpleAPI.Controllers
{
    /// <summary>
    /// Client (tenant) administration for Cimmple platform staff. Requires a support-staff token
    /// whose Support:Staff entry has PlatformAdmin = true.
    /// </summary>
    [ApiController]
    [Route("api/[controller]")]
    [SkipTenantScope]
    public class PlatformTenantsController : ApiBaseController
    {
        private readonly TenantProvisioningService _provisioning;
        private readonly ILogger<PlatformTenantsController> _logger;

        public PlatformTenantsController(TenantProvisioningService provisioning, ILogger<PlatformTenantsController> logger)
        {
            _provisioning = provisioning;
            _logger = logger;
        }

        [HttpGet("List")]
        public async Task<IActionResult> List()
        {
            if (!IsPlatformAdmin()) return Forbid();
            return Ok(new { result = await _provisioning.ListAsync() });
        }

        [HttpGet("Get/{tenantId:int}")]
        public async Task<IActionResult> Get(int tenantId)
        {
            if (!IsPlatformAdmin()) return Forbid();
            var tenant = await _provisioning.GetAsync(tenantId);
            return tenant == null
                ? NotFound(new { error = "Client not found." })
                : Ok(new { result = tenant });
        }

        [HttpPost("Create")]
        public async Task<IActionResult> Create([FromBody] ProvisionTenantRequest request)
        {
            if (!IsPlatformAdmin()) return Forbid();
            try
            {
                var result = await _provisioning.ProvisionAsync(request, GetStaffAuditName());
                if (result.Tenant == null)
                    return BadRequest(new { error = result.Error });

                return Ok(new { result });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Creating client {CompanyName} failed", request?.CompanyName);
                var root = ex.GetBaseException();
                return StatusCode(500, new { error = $"Creating the client failed: {root.Message}" });
            }
        }

        [HttpPost("Resume/{tenantId:int}")]
        public async Task<IActionResult> Resume(int tenantId)
        {
            if (!IsPlatformAdmin()) return Forbid();
            var result = await _provisioning.ResumeAsync(tenantId);
            return result.Tenant == null ? BadRequest(new { error = result.Error }) : Ok(new { result });
        }

        [HttpPost("ApplyDefaults/{tenantId:int}")]
        public async Task<IActionResult> ApplyDefaults(int tenantId)
        {
            if (!IsPlatformAdmin()) return Forbid();
            var result = await _provisioning.ApplyDefaultsAsync(tenantId);
            return result.Tenant == null ? BadRequest(new { error = result.Error }) : Ok(new { result });
        }

        [HttpPost("SetStatus/{tenantId:int}")]
        public async Task<IActionResult> SetStatus(int tenantId, [FromBody] SetTenantStatusRequest request)
        {
            if (!IsPlatformAdmin()) return Forbid();
            var (ok, error) = await _provisioning.SetStatusAsync(tenantId, request?.Status);
            if (!ok) return BadRequest(new { error });

            _logger.LogInformation("Tenant {TenantId} status set to {Status} by {Staff}", tenantId, request!.Status, GetStaffAuditName());
            return Ok(new { result = await _provisioning.GetAsync(tenantId) });
        }

        [HttpPost("ResendInvite/{tenantId:int}")]
        public async Task<IActionResult> ResendInvite(int tenantId)
        {
            if (!IsPlatformAdmin()) return Forbid();
            var result = await _provisioning.ResendAdminInviteAsync(tenantId);
            if (!result.Success) return BadRequest(new { error = result.Error });

            _logger.LogInformation("Administrator invite for tenant {TenantId} reissued by {Staff}", tenantId, GetStaffAuditName());
            return Ok(new { result });
        }

        private string GetStaffAuditName() => GetUsername() ?? GetSupportStaffName() ?? "platform";

        public class SetTenantStatusRequest
        {
            public string Status { get; set; } = "";
        }
    }
}
