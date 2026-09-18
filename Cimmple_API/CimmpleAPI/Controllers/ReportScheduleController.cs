using System.Text.Json;
using CimmpleAPI.Data;
using CimmpleAPI.Data.Models;
using CimmpleAPI.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CimmpleAPI.Controllers
{
    [ApiController]
    [Route("api/ReportSchedules")]
    public class ReportScheduleController : ApiBaseController
    {
        private readonly CimmpleDbContext _context;
        private readonly ReportScheduleExecutionService _executionService;

        public ReportScheduleController(
            CimmpleDbContext context,
            ReportScheduleExecutionService executionService)
        {
            _context = context;
            _executionService = executionService;
        }

        [HttpGet]
        public async Task<IActionResult> List()
        {
            var tenantId = GetTenantId();
            if (tenantId <= 0)
                return BadRequest(new { message = "Tenant id is required." });

            var items = await _context.ReportSchedules.AsNoTracking()
                .Where(s => s.TenantId == tenantId)
                .OrderByDescending(s => s.UpdatedUtc)
                .ToListAsync();

            return Ok(new { result = items.Select(ToDto).ToList() });
        }

        [HttpGet("{id:int}")]
        public async Task<IActionResult> Get(int id)
        {
            var tenantId = GetTenantId();
            var item = await _context.ReportSchedules.AsNoTracking()
                .FirstOrDefaultAsync(s => s.Id == id && s.TenantId == tenantId);
            if (item == null)
                return NotFound(new { message = "Schedule not found." });
            return Ok(new { result = ToDto(item) });
        }

        [HttpPost]
        public async Task<IActionResult> Create([FromBody] ReportScheduleUpsertRequest request)
        {
            var tenantId = GetTenantId();
            if (tenantId <= 0)
                return BadRequest(new { message = "Tenant id is required." });

            var userId = GetUserId() ?? 0;
            var entity = MapToEntity(request, new ReportSchedule
            {
                TenantId = tenantId,
                CreatedByUserId = userId,
                CreatedUtc = DateTime.UtcNow
            });

            if (!TryResolveListLocationFilter(entity.LocationId, out var locId, out var forbid))
                return forbid!;
            entity.LocationId = locId;

            var validation = ReportScheduleTiming.ValidateScheduleFields(entity);
            if (validation != null)
                return BadRequest(new { message = validation });

            ApplyCategoryDefault(entity);
            entity.NextRunUtc = ReportScheduleTiming.ComputeNextRunUtc(entity);
            entity.UpdatedUtc = DateTime.UtcNow;

            _context.ReportSchedules.Add(entity);
            await _context.SaveChangesAsync();
            return Ok(new { result = ToDto(entity), message = "Schedule created." });
        }

        [HttpPut("{id:int}")]
        public async Task<IActionResult> Update(int id, [FromBody] ReportScheduleUpsertRequest request)
        {
            var tenantId = GetTenantId();
            var entity = await _context.ReportSchedules
                .FirstOrDefaultAsync(s => s.Id == id && s.TenantId == tenantId);
            if (entity == null)
                return NotFound(new { message = "Schedule not found." });

            MapToEntity(request, entity);

            if (!TryResolveListLocationFilter(entity.LocationId, out var locId, out var forbid))
                return forbid!;
            entity.LocationId = locId;

            var validation = ReportScheduleTiming.ValidateScheduleFields(entity);
            if (validation != null)
                return BadRequest(new { message = validation });

            ApplyCategoryDefault(entity);
            entity.NextRunUtc = ReportScheduleTiming.ComputeNextRunUtc(entity);
            entity.UpdatedUtc = DateTime.UtcNow;

            await _context.SaveChangesAsync();
            return Ok(new { result = ToDto(entity), message = "Schedule updated." });
        }

        [HttpPatch("{id:int}/enabled")]
        public async Task<IActionResult> SetEnabled(int id, [FromBody] ReportScheduleEnabledRequest request)
        {
            var tenantId = GetTenantId();
            var entity = await _context.ReportSchedules
                .FirstOrDefaultAsync(s => s.Id == id && s.TenantId == tenantId);
            if (entity == null)
                return NotFound(new { message = "Schedule not found." });

            entity.IsEnabled = request?.IsEnabled ?? !entity.IsEnabled;
            if (entity.IsEnabled)
                entity.NextRunUtc = ReportScheduleTiming.ComputeNextRunUtc(entity);
            entity.UpdatedUtc = DateTime.UtcNow;
            await _context.SaveChangesAsync();
            return Ok(new { result = ToDto(entity) });
        }

        [HttpDelete("{id:int}")]
        public async Task<IActionResult> Delete(int id)
        {
            var tenantId = GetTenantId();
            var entity = await _context.ReportSchedules
                .FirstOrDefaultAsync(s => s.Id == id && s.TenantId == tenantId);
            if (entity == null)
                return NotFound(new { message = "Schedule not found." });

            _context.ReportSchedules.Remove(entity);
            await _context.SaveChangesAsync();
            return Ok(new { message = "Schedule deleted." });
        }

        /// <summary>Run now and email (does not wait for NextRunUtc).</summary>
        [HttpPost("{id:int}/run")]
        public async Task<IActionResult> RunNow(int id)
        {
            var tenantId = GetTenantId();
            var entity = await _context.ReportSchedules
                .FirstOrDefaultAsync(s => s.Id == id && s.TenantId == tenantId);
            if (entity == null)
                return NotFound(new { message = "Schedule not found." });

            var (ok, error) = await _executionService.ExecuteAsync(entity);
            if (!ok)
                return BadRequest(new { message = error ?? "Failed to run schedule." });

            return Ok(new { message = "Report generated and emailed.", result = ToDto(entity) });
        }

        private static void ApplyCategoryDefault(ReportSchedule entity)
        {
            if (string.IsNullOrWhiteSpace(entity.ReportCategory))
            {
                entity.ReportCategory = ReportAttachmentBuilder.IsFinancial(entity.ReportType)
                    ? "financial"
                    : "operational";
            }
        }

        private static ReportSchedule MapToEntity(ReportScheduleUpsertRequest request, ReportSchedule entity)
        {
            if (request == null)
                return entity;

            entity.ReportCategory = (request.ReportCategory ?? entity.ReportCategory ?? "operational").Trim();
            entity.ReportType = (request.ReportType ?? "").Trim();
            entity.ReportName = (request.ReportName ?? entity.ReportType).Trim();
            entity.DateRange = string.IsNullOrWhiteSpace(request.DateRange) ? "This Month" : request.DateRange.Trim();
            entity.CustomStartDate = string.IsNullOrWhiteSpace(request.CustomStartDate) ? null : request.CustomStartDate.Trim();
            entity.CustomEndDate = string.IsNullOrWhiteSpace(request.CustomEndDate) ? null : request.CustomEndDate.Trim();
            entity.LocationId = request.LocationId.HasValue && request.LocationId.Value > 0
                ? request.LocationId
                : null;
            entity.ParametersJson = SerializeParameters(request.Parameters);
            entity.Format = string.IsNullOrWhiteSpace(request.Format) ? "pdf" : request.Format.Trim().ToLowerInvariant();
            entity.Frequency = string.IsNullOrWhiteSpace(request.Frequency) ? "Daily" : request.Frequency.Trim();
            entity.DayOfWeek = request.DayOfWeek;
            entity.DayOfMonth = request.DayOfMonth;
            entity.TimeOfDayMinutes = request.TimeOfDayMinutes ?? entity.TimeOfDayMinutes;
            if (!string.IsNullOrWhiteSpace(request.TimeZoneId))
                entity.TimeZoneId = request.TimeZoneId.Trim();
            entity.ToEmails = (request.ToEmails ?? "").Trim();
            entity.CcEmails = string.IsNullOrWhiteSpace(request.CcEmails) ? null : request.CcEmails.Trim();
            entity.Subject = string.IsNullOrWhiteSpace(request.Subject) ? null : request.Subject.Trim();
            if (request.IsEnabled.HasValue)
                entity.IsEnabled = request.IsEnabled.Value;
            return entity;
        }

        private static string? SerializeParameters(object? parameters)
        {
            if (parameters == null)
                return null;
            try
            {
                return JsonSerializer.Serialize(parameters);
            }
            catch
            {
                return null;
            }
        }

        private static object ToDto(ReportSchedule s) => new
        {
            s.Id,
            s.TenantId,
            s.CreatedByUserId,
            s.ReportCategory,
            s.ReportType,
            s.ReportName,
            s.DateRange,
            s.CustomStartDate,
            s.CustomEndDate,
            s.LocationId,
            s.ParametersJson,
            s.Format,
            s.Frequency,
            s.DayOfWeek,
            s.DayOfMonth,
            s.TimeOfDayMinutes,
            s.TimeZoneId,
            s.ToEmails,
            s.CcEmails,
            s.Subject,
            s.IsEnabled,
            s.NextRunUtc,
            s.LastRunUtc,
            s.LastRunStatus,
            s.LastRunError,
            s.CreatedUtc,
            s.UpdatedUtc
        };
    }

    public class ReportScheduleUpsertRequest
    {
        public string? ReportCategory { get; set; }
        public string? ReportType { get; set; }
        public string? ReportName { get; set; }
        public string? DateRange { get; set; }
        public string? CustomStartDate { get; set; }
        public string? CustomEndDate { get; set; }
        public int? LocationId { get; set; }
        public object? Parameters { get; set; }
        public string? Format { get; set; }
        public string? Frequency { get; set; }
        public int? DayOfWeek { get; set; }
        public int? DayOfMonth { get; set; }
        public int? TimeOfDayMinutes { get; set; }
        public string? TimeZoneId { get; set; }
        public string? ToEmails { get; set; }
        public string? CcEmails { get; set; }
        public string? Subject { get; set; }
        public bool? IsEnabled { get; set; }
    }

    public class ReportScheduleEnabledRequest
    {
        public bool IsEnabled { get; set; }
    }
}
