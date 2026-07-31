using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using CimmpleAPI.Data;
using CimmpleAPI.Data.Models;
using CimmpleAPI.Data.Dtos;
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;

namespace CimmpleAPI.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [AllowAnonymous]
    public class ProcessController : ApiBaseController
    {
        private readonly CimmpleDbContext _context;

        public static readonly string[] ProcessCategories = new[]
        {
            "Machining", "Assembly", "Inspection", "Finishing", "Outside", "Other"
        };

        public ProcessController(CimmpleDbContext context)
        {
            _context = context;
        }

        [HttpGet("GetProcesses")]
        public IActionResult GetProcesses([FromQuery] int tenantid)
        {
            try
            {
                var workstationNames = _context.WorkstationMaster
                    .Where(w => w.TenantId == tenantid)
                    .Select(w => new { w.Id, w.WorkstationName })
                    .ToList()
                    .ToDictionary(w => w.Id, w => w.WorkstationName ?? "");

                var processes = _context.ProcessMaster
                    .Where(p => p.Tenantid == tenantid)
                    .OrderBy(p => p.Srno)
                    .AsEnumerable()
                    .Select(p => new
                    {
                        id = p.Id,
                        processCode = p.ProcessCode ?? "",
                        processName = p.ProcessName ?? "",
                        srno = p.Srno,
                        pDescription = p.PDescription ?? "",
                        isFixed = p.isFixed ?? 0,
                        isSystem = p.IsSystem,
                        status = p.status,
                        ledgercode = p.ledgercode ?? "",
                        processCategory = p.ProcessCategory ?? "",
                        defaultEstimatedTimeMinutes = p.DefaultEstimatedTimeMinutes,
                        defaultWorkstationId = p.DefaultWorkstationId,
                        defaultWorkstationName = p.DefaultWorkstationId.HasValue && workstationNames.ContainsKey(p.DefaultWorkstationId.Value)
                            ? workstationNames[p.DefaultWorkstationId.Value]
                            : "",
                        standardCostPerHour = p.StandardCostPerHour,
                        statusText = p.status == 1 ? "Active" : "Inactive"
                    })
                    .ToList();

                return Ok(new { result = processes });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpGet("GetProcessCategories")]
        public IActionResult GetProcessCategories()
        {
            return Ok(new { result = ProcessCategories });
        }

        [HttpGet("GetProcessById")]
        public IActionResult GetProcessById([FromQuery] int processId, [FromQuery] int tenantId)
        {
            try
            {
                var process = _context.ProcessMaster
                    .Where(p => p.Id == processId && p.Tenantid == tenantId)
                    .FirstOrDefault();

                if (process == null)
                {
                    return NotFound(new { error = "Process not found" });
                }

                string workstationName = "";
                if (process.DefaultWorkstationId.HasValue)
                {
                    workstationName = _context.WorkstationMaster
                        .Where(w => w.Id == process.DefaultWorkstationId.Value && w.TenantId == tenantId)
                        .Select(w => w.WorkstationName)
                        .FirstOrDefault() ?? "";
                }

                var processData = new
                {
                    id = process.Id,
                    processCode = process.ProcessCode ?? "",
                    processName = process.ProcessName ?? "",
                    srno = process.Srno,
                    pDescription = process.PDescription ?? "",
                    isFixed = process.isFixed ?? 0,
                    isSystem = process.IsSystem,
                    status = process.status,
                    ledgercode = process.ledgercode ?? "",
                    processCategory = process.ProcessCategory ?? "",
                    defaultEstimatedTimeMinutes = process.DefaultEstimatedTimeMinutes,
                    defaultWorkstationId = process.DefaultWorkstationId,
                    defaultWorkstationName = workstationName,
                    standardCostPerHour = process.StandardCostPerHour,
                    statusText = process.status == 1 ? "Active" : "Inactive"
                };

                return Ok(new { result = processData });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpPost("SaveProcess")]
        public IActionResult SaveProcess([FromBody] ProcessMasterReq request)
        {
            try
            {
                if (request == null)
                {
                    return BadRequest(new { error = "Request is null" });
                }

                if (string.IsNullOrWhiteSpace(request.ProcessName))
                {
                    return BadRequest(new { error = "Process Name is required" });
                }

                var uniquenessError = ValidateUniqueness(request.Tenantid, request.Id, request.ProcessName, request.ProcessCode);
                if (uniquenessError != null)
                {
                    return BadRequest(new { error = uniquenessError });
                }

                if (request.DefaultWorkstationId.HasValue && request.DefaultWorkstationId.Value > 0)
                {
                    var workstationExists = _context.WorkstationMaster.Any(w =>
                        w.Id == request.DefaultWorkstationId.Value && w.TenantId == request.Tenantid);
                    if (!workstationExists)
                    {
                        return BadRequest(new { error = "Default workstation not found" });
                    }
                }

                ProcessMaster process;

                if (request.Id > 0)
                {
                    process = _context.ProcessMaster
                        .FirstOrDefault(p => p.Id == request.Id && p.Tenantid == request.Tenantid);

                    if (process == null)
                    {
                        return NotFound(new { error = "Process not found" });
                    }

                    ApplyRequestToEntity(process, request, isCreate: false);
                }
                else
                {
                    var existingProcesses = _context.ProcessMaster
                        .Where(p => p.Tenantid == request.Tenantid)
                        .ToList();

                    int maxSrno = existingProcesses.Any()
                        ? existingProcesses.Max(p => p.Srno)
                        : 0;

                    process = new ProcessMaster
                    {
                        Tenantid = request.Tenantid,
                        Srno = request.Srno > 0 ? request.Srno : maxSrno + 1,
                    };

                    ApplyRequestToEntity(process, request, isCreate: true);
                    _context.ProcessMaster.Add(process);
                }

                _context.SaveChanges();

                return Ok(new { result = new { id = process.Id, message = "Process saved successfully" } });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message, stackTrace = ex.StackTrace });
            }
        }

        [HttpPost("ImportProcesses")]
        public IActionResult ImportProcesses([FromBody] ProcessImportRequest request)
        {
            try
            {
                if (request == null || request.Rows == null || request.Rows.Count == 0)
                {
                    return BadRequest(new { error = "No rows to import" });
                }

                if (request.Tenantid <= 0)
                {
                    return BadRequest(new { error = "Tenantid is required" });
                }

                var existing = _context.ProcessMaster
                    .Where(p => p.Tenantid == request.Tenantid)
                    .ToList();

                var workstations = _context.WorkstationMaster
                    .Where(w => w.TenantId == request.Tenantid)
                    .ToList();

                int maxSrno = existing.Any() ? existing.Max(p => p.Srno) : 0;
                var result = new ProcessImportResult();
                var rowResults = new List<ProcessImportRowResult>();

                // Track names/codes within this import batch to catch duplicates
                var batchNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                var batchCodes = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

                using var tx = _context.Database.BeginTransaction();
                try
                {
                    for (int i = 0; i < request.Rows.Count; i++)
                    {
                        var row = request.Rows[i];
                        // Client sends the original CSV line number so messages line up with the file
                        var rowNumber = row.RowNumber ?? (i + 2);
                        var rowResult = new ProcessImportRowResult { RowNumber = rowNumber };

                        var processName = (row.ProcessName ?? "").Trim();
                        var processCode = (row.ProcessCode ?? "").Trim();

                        if (string.IsNullOrWhiteSpace(processName))
                        {
                            rowResult.Status = "Error";
                            rowResult.Message = "Process Name is required";
                            result.Failed++;
                            rowResults.Add(rowResult);
                            continue;
                        }

                        if (!string.IsNullOrEmpty(processCode) && !batchCodes.Add(processCode))
                        {
                            rowResult.Status = "Error";
                            rowResult.Message = $"Duplicate Process Code '{processCode}' in import file";
                            result.Failed++;
                            rowResults.Add(rowResult);
                            continue;
                        }

                        if (!batchNames.Add(processName))
                        {
                            rowResult.Status = "Error";
                            rowResult.Message = $"Duplicate Process Name '{processName}' in import file";
                            result.Failed++;
                            rowResults.Add(rowResult);
                            continue;
                        }

                        ProcessMaster? match = null;
                        if (!string.IsNullOrEmpty(processCode))
                        {
                            match = existing.FirstOrDefault(p =>
                                string.Equals(p.ProcessCode, processCode, StringComparison.OrdinalIgnoreCase));
                        }
                        if (match == null)
                        {
                            match = existing.FirstOrDefault(p =>
                                string.Equals(p.ProcessName, processName, StringComparison.OrdinalIgnoreCase));
                        }

                        // Cross-check uniqueness against other existing rows
                        var nameConflict = existing.FirstOrDefault(p =>
                            (match == null || p.Id != match.Id) &&
                            string.Equals(p.ProcessName, processName, StringComparison.OrdinalIgnoreCase));
                        if (nameConflict != null)
                        {
                            rowResult.Status = "Error";
                            rowResult.Message = $"Process Name '{processName}' already exists";
                            result.Failed++;
                            rowResults.Add(rowResult);
                            continue;
                        }

                        if (!string.IsNullOrEmpty(processCode))
                        {
                            var codeConflict = existing.FirstOrDefault(p =>
                                (match == null || p.Id != match.Id) &&
                                !string.IsNullOrEmpty(p.ProcessCode) &&
                                string.Equals(p.ProcessCode, processCode, StringComparison.OrdinalIgnoreCase));
                            if (codeConflict != null)
                            {
                                rowResult.Status = "Error";
                                rowResult.Message = $"Process Code '{processCode}' already exists";
                                result.Failed++;
                                rowResults.Add(rowResult);
                                continue;
                            }
                        }

                        int? workstationId = null;
                        var workstationName = (row.DefaultWorkstationName ?? "").Trim();
                        if (!string.IsNullOrEmpty(workstationName))
                        {
                            var ws = workstations.FirstOrDefault(w =>
                                string.Equals(w.WorkstationName, workstationName, StringComparison.OrdinalIgnoreCase));
                            if (ws == null)
                            {
                                rowResult.Warning = $"Workstation '{workstationName}' not found, default workstation left blank";
                            }
                            else
                            {
                                workstationId = ws.Id;
                            }
                        }

                        var isOutside = ParseYesNo(row.OutsideServices);
                        var status = ParseStatus(row.Status);
                        var category = NormalizeCategory(row.ProcessCategory);
                        var estimatedTime = ParseNullableInt(row.DefaultEstimatedTimeMinutes);
                        var cost = ParseNullableDecimal(row.StandardCostPerHour);

                        if (match != null)
                        {
                            if (!request.UpdateExisting)
                            {
                                rowResult.Status = "Skipped";
                                rowResult.Message = "Process already exists";
                                rowResult.ProcessId = match.Id;
                                result.Skipped++;
                                rowResults.Add(rowResult);
                                continue;
                            }

                            match.ProcessCode = string.IsNullOrEmpty(processCode) ? match.ProcessCode : processCode;
                            match.ProcessName = processName;
                            match.PDescription = row.Description?.Trim() ?? match.PDescription ?? "";
                            match.ledgercode = row.LedgerCode?.Trim() ?? match.ledgercode ?? "";
                            match.ProcessCategory = category ?? match.ProcessCategory;
                            match.isFixed = isOutside ?? match.isFixed ?? 0;
                            match.status = status ?? match.status;
                            if (estimatedTime.HasValue) match.DefaultEstimatedTimeMinutes = estimatedTime;
                            if (workstationId.HasValue) match.DefaultWorkstationId = workstationId;
                            if (cost.HasValue) match.StandardCostPerHour = cost;

                            rowResult.Status = "Updated";
                            rowResult.Message = "Updated";
                            rowResult.ProcessId = match.Id;
                            result.Updated++;
                        }
                        else
                        {
                            maxSrno++;
                            var process = new ProcessMaster
                            {
                                Tenantid = request.Tenantid,
                                ProcessCode = processCode,
                                ProcessName = processName,
                                PDescription = row.Description?.Trim() ?? "",
                                ledgercode = row.LedgerCode?.Trim() ?? "",
                                ProcessCategory = category ?? "",
                                isFixed = isOutside ?? 0,
                                status = status ?? 1,
                                DefaultEstimatedTimeMinutes = estimatedTime,
                                DefaultWorkstationId = workstationId,
                                StandardCostPerHour = cost,
                                Srno = maxSrno
                            };
                            _context.ProcessMaster.Add(process);
                            existing.Add(process);

                            rowResult.Status = "Created";
                            rowResult.Message = "Created";
                            rowResult.ProcessId = process.Id;
                            result.Created++;
                        }

                        rowResults.Add(rowResult);
                    }

                    if (request.StopOnError && result.Failed > 0)
                    {
                        tx.Rollback();
                        return BadRequest(new
                        {
                            error = "Import cancelled due to validation errors",
                            result = new
                            {
                                created = 0,
                                updated = 0,
                                skipped = 0,
                                failed = result.Failed,
                                rows = rowResults
                            }
                        });
                    }

                    _context.SaveChanges();
                    tx.Commit();

                    result.Rows = rowResults;
                    return Ok(new { result });
                }
                catch
                {
                    tx.Rollback();
                    throw;
                }
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message, stackTrace = ex.StackTrace });
            }
        }

        [HttpGet("CheckProcessDeletionImpact")]
        public IActionResult CheckProcessDeletionImpact([FromQuery] int processId, [FromQuery] int tenantId)
        {
            try
            {
                var process = _context.ProcessMaster
                    .FirstOrDefault(p => p.Id == processId && p.Tenantid == tenantId);

                if (process == null)
                {
                    return NotFound(new { error = "Process not found" });
                }

                var impact = new DeletionImpactResult
                {
                    CanDelete = true,
                    BlockingReasons = new List<string>(),
                    BlockingDependencies = new List<BlockingDependency>(),
                    WillBeDeleted = new List<ImpactedEntity>(),
                    WillBeAffected = new List<ImpactedEntity>(),
                    Warnings = new List<string>()
                };

                if (process.IsSystem)
                {
                    impact.BlockingReasons.Add("This is a protected system process and cannot be deleted.");
                    impact.CanDelete = false;
                }

                if (impact.CanDelete)
                {
                    impact.Warnings.Add("This action cannot be undone");
                }

                return Ok(new { result = impact });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message, stackTrace = ex.StackTrace });
            }
        }

        [HttpDelete("DeleteProcess")]
        public IActionResult DeleteProcess([FromQuery] int processId, [FromQuery] int tenantId)
        {
            try
            {
                var process = _context.ProcessMaster
                    .FirstOrDefault(p => p.Id == processId && p.Tenantid == tenantId);

                if (process == null)
                {
                    return NotFound(new { error = "Process not found" });
                }

                if (process.IsSystem)
                {
                    return BadRequest(new { error = "Protected system processes cannot be deleted" });
                }

                _context.ProcessMaster.Remove(process);
                _context.SaveChanges();

                return Ok(new { result = new { message = "Process deleted successfully" } });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message, stackTrace = ex.StackTrace });
            }
        }

        private string? ValidateUniqueness(int tenantId, int processId, string processName, string? processCode)
        {
            var nameExists = _context.ProcessMaster.Any(p =>
                p.Tenantid == tenantId &&
                p.Id != processId &&
                p.ProcessName != null &&
                p.ProcessName.ToLower() == processName.Trim().ToLower());

            if (nameExists)
            {
                return $"Process Name '{processName.Trim()}' already exists";
            }

            if (!string.IsNullOrWhiteSpace(processCode))
            {
                var code = processCode.Trim();
                var codeExists = _context.ProcessMaster.Any(p =>
                    p.Tenantid == tenantId &&
                    p.Id != processId &&
                    p.ProcessCode != null &&
                    p.ProcessCode.ToLower() == code.ToLower());

                if (codeExists)
                {
                    return $"Process Code '{code}' already exists";
                }
            }

            return null;
        }

        private static void ApplyRequestToEntity(ProcessMaster process, ProcessMasterReq request, bool isCreate)
        {
            process.ProcessCode = request.ProcessCode?.Trim() ?? "";
            process.ProcessName = request.ProcessName?.Trim() ?? "";
            process.PDescription = request.PDescription ?? "";
            process.isFixed = request.IsFixed ?? 0;
            process.status = request.Status == "Active" ? 1 : (request.Status == "Inactive" ? 0 : (isCreate ? 1 : process.status));
            process.ledgercode = request.Ledgercode?.Trim() ?? "";
            process.ProcessCategory = request.ProcessCategory?.Trim() ?? "";
            process.DefaultEstimatedTimeMinutes = request.DefaultEstimatedTimeMinutes;
            process.DefaultWorkstationId = request.DefaultWorkstationId.HasValue && request.DefaultWorkstationId.Value > 0
                ? request.DefaultWorkstationId
                : null;
            process.StandardCostPerHour = request.StandardCostPerHour;
            if (request.Srno > 0) process.Srno = request.Srno;
        }

        private static int? ParseYesNo(string? value)
        {
            if (string.IsNullOrWhiteSpace(value)) return null;
            var v = value.Trim().ToLowerInvariant();
            if (v is "yes" or "y" or "1" or "true") return 1;
            if (v is "no" or "n" or "0" or "false") return 0;
            return null;
        }

        private static int? ParseStatus(string? value)
        {
            if (string.IsNullOrWhiteSpace(value)) return null;
            var v = value.Trim().ToLowerInvariant();
            if (v is "active" or "1" or "yes" or "true") return 1;
            if (v is "inactive" or "0" or "no" or "false") return 0;
            return null;
        }

        private static string? NormalizeCategory(string? value)
        {
            if (string.IsNullOrWhiteSpace(value)) return null;
            var trimmed = value.Trim();
            var match = ProcessCategories.FirstOrDefault(c =>
                string.Equals(c, trimmed, StringComparison.OrdinalIgnoreCase));
            return match ?? trimmed;
        }

        private static int? ParseNullableInt(string? value)
        {
            if (string.IsNullOrWhiteSpace(value)) return null;
            return int.TryParse(value.Trim(), NumberStyles.Integer, CultureInfo.InvariantCulture, out var n) ? n : null;
        }

        private static decimal? ParseNullableDecimal(string? value)
        {
            if (string.IsNullOrWhiteSpace(value)) return null;
            return decimal.TryParse(value.Trim(), NumberStyles.Number, CultureInfo.InvariantCulture, out var n) ? n : null;
        }
    }

    public class ProcessMasterReq
    {
        public int Id { get; set; }
        public int Tenantid { get; set; }
        public string ProcessCode { get; set; } = "";
        public string ProcessName { get; set; } = "";
        public int Srno { get; set; }
        public string PDescription { get; set; } = "";
        public int? IsFixed { get; set; }
        public string Status { get; set; } = "Active";
        public string Ledgercode { get; set; } = "";
        public string ProcessCategory { get; set; } = "";
        public int? DefaultEstimatedTimeMinutes { get; set; }
        public int? DefaultWorkstationId { get; set; }
        public decimal? StandardCostPerHour { get; set; }
    }

    public class ProcessImportRequest
    {
        public int Tenantid { get; set; }
        public bool UpdateExisting { get; set; } = true;
        public bool StopOnError { get; set; } = false;
        public List<ProcessImportRow> Rows { get; set; } = new();
    }

    public class ProcessImportRow
    {
        public int? RowNumber { get; set; }
        public string? ProcessCode { get; set; }
        public string? ProcessName { get; set; }
        public string? Description { get; set; }
        public string? LedgerCode { get; set; }
        public string? ProcessCategory { get; set; }
        public string? OutsideServices { get; set; }
        public string? Status { get; set; }
        public string? DefaultEstimatedTimeMinutes { get; set; }
        public string? DefaultWorkstationName { get; set; }
        public string? StandardCostPerHour { get; set; }
    }

    public class ProcessImportResult
    {
        public int Created { get; set; }
        public int Updated { get; set; }
        public int Skipped { get; set; }
        public int Failed { get; set; }
        public List<ProcessImportRowResult> Rows { get; set; } = new();
    }

    public class ProcessImportRowResult
    {
        public int RowNumber { get; set; }
        public int? ProcessId { get; set; }
        public string Status { get; set; } = "";
        public string Message { get; set; } = "";
        public string? Warning { get; set; }
    }
}
