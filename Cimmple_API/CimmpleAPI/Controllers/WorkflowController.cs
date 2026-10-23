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
        private readonly WorkflowAssignmentService _assignment;
        private readonly ILogger<WorkflowController> _logger;

        public WorkflowController(
            WorkflowProjectionService workflow,
            WorkflowSyncService sync,
            WorkflowAssignmentService assignment,
            ILogger<WorkflowController> logger)
        {
            _workflow = workflow;
            _sync = sync;
            _assignment = assignment;
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

        [HttpGet("GetAssignees")]
        public async Task<IActionResult> GetAssignees([FromQuery] string? workflowId)
        {
            var tenantId = GetTenantId();
            if (tenantId <= 0)
                return BadRequest(new { error = "TenantId is required" });
            var (people, error) = await _assignment.ListAssigneesAsync(tenantId, workflowId ?? "");
            if (error != null)
                return BadRequest(new { error });
            return Ok(new { result = people });
        }

        [HttpPost("Assign")]
        public Task<IActionResult> Assign([FromBody] WorkflowAssignRequest request) =>
            Run(() => _assignment.AssignAsync(GetTenantId(), GetUserId() ?? 0, request?.WorkflowId ?? "", request?.AssigneeUserId ?? 0, request?.CoordinationTaskId));

        [HttpPost("Acknowledge")]
        public Task<IActionResult> Acknowledge([FromBody] WorkflowMutationRequest request) =>
            Run(() => _assignment.AcknowledgeAsync(GetTenantId(), GetUserId() ?? 0, request?.WorkflowId ?? "", request?.CoordinationTaskId));

        [HttpPost("Reject")]
        public Task<IActionResult> Reject([FromBody] WorkflowMutationRequest request) =>
            Run(() => _assignment.RejectAsync(GetTenantId(), GetUserId() ?? 0, request?.WorkflowId ?? "", request?.CoordinationTaskId));

        [HttpPost("ResolveBlocker")]
        public Task<IActionResult> ResolveBlocker([FromBody] WorkflowBlockerRequest request) =>
            Run(() => _assignment.SaveBlockerNoteAsync(GetTenantId(), GetUserId() ?? 0, request?.WorkflowId ?? "", request?.CoordinationTaskId, request?.Note));

        private async Task<IActionResult> Run(Func<Task<string?>> action)
        {
            var tenantId = GetTenantId();
            if (tenantId <= 0)
                return BadRequest(new { error = "TenantId is required" });
            try
            {
                var error = await action();
                if (error != null)
                    return BadRequest(new { error });
                return Ok(new { result = true });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Workflow assignment failed for tenant {TenantId}", tenantId);
                return StatusCode(500, new { error = "The assignment could not be saved. Try again." });
            }
        }
    }

    public sealed class WorkflowAssignRequest
    {
        public string? WorkflowId { get; set; }
        public int AssigneeUserId { get; set; }
        public int? CoordinationTaskId { get; set; }
    }

    public sealed class WorkflowMutationRequest
    {
        public string? WorkflowId { get; set; }
        public int? CoordinationTaskId { get; set; }
    }

    public sealed class WorkflowBlockerRequest
    {
        public string? WorkflowId { get; set; }
        public int? CoordinationTaskId { get; set; }
        public string? Note { get; set; }
    }
}
