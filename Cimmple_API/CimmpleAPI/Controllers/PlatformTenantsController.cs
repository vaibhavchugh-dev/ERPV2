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
        private readonly MasterDataSetupService _masterData;
        private readonly ILogger<PlatformTenantsController> _logger;

        public PlatformTenantsController(
            TenantProvisioningService provisioning,
            MasterDataSetupService masterData,
            ILogger<PlatformTenantsController> logger)
        {
            _provisioning = provisioning;
            _masterData = masterData;
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

        [HttpGet("Industries")]
        public IActionResult Industries()
        {
            if (!IsPlatformAdmin()) return Forbid();
            return Ok(new { result = IndustryPacks.All });
        }

        [HttpGet("MasterSetup/{tenantId:int}")]
        public async Task<IActionResult> MasterSetup(int tenantId)
        {
            if (!IsPlatformAdmin()) return Forbid();
            var overview = await _masterData.GetOverviewAsync(tenantId);
            return overview == null
                ? NotFound(new { error = "Client not found." })
                : Ok(new { result = overview });
        }

        [HttpPost("SetIndustry/{tenantId:int}")]
        public async Task<IActionResult> SetIndustry(int tenantId, [FromBody] SetIndustryRequest request)
        {
            if (!IsPlatformAdmin()) return Forbid();
            var (ok, error) = await _masterData.SetIndustryAsync(tenantId, request?.Industry);
            if (!ok) return BadRequest(new { error });
            return Ok(new { result = await _provisioning.GetAsync(tenantId) });
        }

        [HttpPost("ApplySamples/{tenantId:int}")]
        public async Task<IActionResult> ApplySamples(int tenantId, [FromBody] ApplySamplesRequest request)
        {
            if (!IsPlatformAdmin()) return Forbid();
            try
            {
                var batch = await _masterData.ApplySamplesAsync(tenantId, request?.Industry, request?.Masters ?? new List<string>(), GetStaffAuditName());
                return batch.Results.Count == 0 ? BadRequest(new { error = batch.Error }) : Ok(new { result = batch });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Sample master data for tenant {TenantId} failed", tenantId);
                return StatusCode(500, new { error = ex.GetBaseException().Message });
            }
        }

        [HttpGet("MasterTemplate/{master}")]
        public IActionResult MasterTemplate(string master)
        {
            if (!IsPlatformAdmin()) return Forbid();
            try
            {
                var csv = MasterDataSetupService.TemplateCsv(master);
                return File(System.Text.Encoding.UTF8.GetBytes(csv), "text/csv", $"{master}-import-template.csv");
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new { error = ex.Message });
            }
        }

        [HttpPost("PreviewMasterFile/{tenantId:int}")]
        [RequestSizeLimit(10_000_000)]
        public Task<IActionResult> PreviewMasterFile(int tenantId, [FromForm] string master, IFormFile file) =>
            ImportUploadedFile(tenantId, master, file, commit: false);

        [HttpPost("ImportMasterFile/{tenantId:int}")]
        [RequestSizeLimit(10_000_000)]
        public Task<IActionResult> ImportMasterFile(int tenantId, [FromForm] string master, IFormFile file) =>
            ImportUploadedFile(tenantId, master, file, commit: true);

        [HttpPost("PreviewWorkbook/{tenantId:int}")]
        [RequestSizeLimit(10_000_000)]
        public Task<IActionResult> PreviewWorkbook(int tenantId, IFormFile file) =>
            ImportUploadedWorkbook(tenantId, file, commit: false);

        [HttpPost("ImportWorkbook/{tenantId:int}")]
        [RequestSizeLimit(10_000_000)]
        public Task<IActionResult> ImportWorkbook(int tenantId, IFormFile file) =>
            ImportUploadedWorkbook(tenantId, file, commit: true);

        private async Task<IActionResult> ImportUploadedFile(int tenantId, string master, IFormFile file, bool commit)
        {
            if (!IsPlatformAdmin()) return Forbid();
            if (file == null || file.Length == 0) return BadRequest(new { error = "Choose a CSV or Excel file." });
            try
            {
                await using var stream = file.OpenReadStream();
                var result = await _masterData.ImportFileAsync(tenantId, master, stream, file.FileName, GetStaffAuditName(), commit);
                return Ok(new { result });
            }
            catch (Exception ex) when (ex is InvalidOperationException or IOException)
            {
                return BadRequest(new { error = ex.GetBaseException().Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Master file import for tenant {TenantId} failed", tenantId);
                return StatusCode(500, new { error = ex.GetBaseException().Message });
            }
        }

        private async Task<IActionResult> ImportUploadedWorkbook(int tenantId, IFormFile file, bool commit)
        {
            if (!IsPlatformAdmin()) return Forbid();
            if (file == null || file.Length == 0) return BadRequest(new { error = "Choose an Excel workbook." });
            try
            {
                await using var stream = file.OpenReadStream();
                var batch = await _masterData.ImportWorkbookAsync(tenantId, stream, file.FileName, GetStaffAuditName(), commit);
                return batch.Results.Count == 0 ? BadRequest(new { error = batch.Error }) : Ok(new { result = batch });
            }
            catch (Exception ex) when (ex is InvalidOperationException or IOException)
            {
                return BadRequest(new { error = ex.GetBaseException().Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Workbook import for tenant {TenantId} failed", tenantId);
                return StatusCode(500, new { error = ex.GetBaseException().Message });
            }
        }

        private string GetStaffAuditName() => GetUsername() ?? GetSupportStaffName() ?? "platform";

        public class SetTenantStatusRequest
        {
            public string Status { get; set; } = "";
        }

        public class SetIndustryRequest
        {
            public string? Industry { get; set; }
        }

        public class ApplySamplesRequest
        {
            public string? Industry { get; set; }
            public List<string> Masters { get; set; } = new();
        }
    }
}
