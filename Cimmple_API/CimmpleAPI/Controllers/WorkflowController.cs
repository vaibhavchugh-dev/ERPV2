using CimmpleAPI.Services.Workflow;
using Microsoft.AspNetCore.Mvc;

namespace CimmpleAPI.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class WorkflowController : ApiBaseController
    {
        private readonly WorkflowProjectionService _workflow;
        private readonly WorkflowSyncService _sync;
        private readonly ILogger<WorkflowController> _logger;

        public WorkflowController(
            WorkflowProjectionService workflow,
            WorkflowSyncService sync,
            ILogger<WorkflowController> logger)
        {
            _workflow = workflow;
            _sync = sync;
            _logger = logger;
        }

        [HttpGet("GetOverview")]
        public async Task<IActionResult> GetOverview([FromQuery] int? locationId = null)
        {
            var tenantId = GetTenantId();
            if (tenantId <= 0)
                return BadRequest(new { error = "TenantId is required" });

            if (!TryResolveListLocationFilter(locationId, out var filterLocationId, out var forbid, out var restrictToLocationIds))
                return forbid!;

            try
            {
                var result = await _workflow.GetOverviewAsync(tenantId, filterLocationId, restrictToLocationIds);
                try
                {
                    await _sync.AttachStoredAsync(tenantId, result);
                }
                catch (Exception syncEx)
                {
                    _logger.LogError(syncEx, "Workflow coordination read failed for tenant {TenantId}", tenantId);
                }
                return Ok(new { result });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Workflow overview failed for tenant {TenantId}", tenantId);
                return StatusCode(500, new { error = "Workflow Center could not be loaded. Try again." });
            }
        }
    }
}
