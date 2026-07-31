using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using CimmpleAPI.Data;
using CimmpleAPI.Data.Models;
using CimmpleAPI.Data.Dtos;
using System;
using System.Collections.Generic;
using System.Linq;

namespace CimmpleAPI.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [AllowAnonymous]
    public class WorkstationController : ApiBaseController
    {
        private readonly CimmpleDbContext _context;

        public WorkstationController(CimmpleDbContext context)
        {
            _context = context;
        }

        [HttpGet("GetWorkstations")]
        public IActionResult GetWorkstations([FromQuery] int tenantid)
        {
            try
            {
                // Assigned users are fetched in one query and grouped in memory; querying per
                // workstation turns this endpoint into dozens of round trips.
                var assignedUsers = _context.UserWorkstationMapping
                    .Where(uwm => uwm.TenantId == tenantid)
                    .Join(_context.UserDetails,
                        uwm => uwm.UserId,
                        ud => ud.User_UniqueID,
                        (uwm, ud) => new { uwm.WorkstationId, ud.UserName })
                    .ToList()
                    .GroupBy(x => x.WorkstationId)
                    .ToDictionary(g => g.Key, g => string.Join(", ", g.Select(x => x.UserName)));

                var workstations = _context.WorkstationMaster
                    .Where(w => w.TenantId == tenantid)
                    .ToList()
                    .Select(w => new
                    {
                        id = w.Id,
                        workstationName = w.WorkstationName,
                        isActive = w.IsActive,
                        tenantId = w.TenantId,
                        userName = assignedUsers.TryGetValue(w.Id, out var names) ? names : ""
                    })
                    .ToList();

                return Ok(new { result = workstations });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpGet("GetWorkstationById")]
        public IActionResult GetWorkstationById([FromQuery] int workstationId, [FromQuery] int tenantId)
        {
            try
            {
                var workstation = _context.WorkstationMaster
                    .FirstOrDefault(w => w.Id == workstationId && w.TenantId == tenantId);

                if (workstation == null)
                {
                    return NotFound(new { error = "Workstation not found" });
                }

                // Get user mappings
                var userMappings = _context.UserWorkstationMapping
                    .Where(uwm => uwm.WorkstationId == workstationId && uwm.TenantId == tenantId)
                    .Join(_context.UserDetails,
                        uwm => uwm.UserId,
                        ud => ud.User_UniqueID,
                        (uwm, ud) => new
                        {
                            id = uwm.Id,
                            userId = uwm.UserId,
                            userName = ud.UserName,
                            workstationId = uwm.WorkstationId,
                            tenantId = uwm.TenantId
                        })
                    .ToList();

                var result = new
                {
                    id = workstation.Id,
                    workstationName = workstation.WorkstationName,
                    isActive = workstation.IsActive,
                    tenantId = workstation.TenantId,
                    userWorkstationMappings = userMappings
                };

                return Ok(new { result = result });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpPost("SaveWorkstation")]
        public async Task<IActionResult> SaveWorkstation([FromBody] WorkstationMasterReq request)
        {
            try
            {
                if (request == null)
                {
                    return BadRequest(new { error = "Request cannot be null" });
                }

                if (string.IsNullOrWhiteSpace(request.WorkstationName))
                {
                    return BadRequest(new { error = "Workstation Name is required" });
                }

                var isNew = request.Id == 0;
                WorkstationMaster workstation;

                if (isNew)
                {
                    // Check for duplicate workstation name
                    var duplicate = _context.WorkstationMaster
                        .Any(w => w.WorkstationName == request.WorkstationName && 
                                 w.TenantId == request.TenantID);

                    if (duplicate)
                    {
                        return BadRequest(new { error = "Workstation name already exists" });
                    }

                    workstation = new WorkstationMaster();
                    workstation.WorkstationName = request.WorkstationName;
                    workstation.IsActive = request.IsActive;
                    workstation.TenantId = request.TenantID;
                    _context.WorkstationMaster.Add(workstation);
                }
                else
                {
                    workstation = _context.WorkstationMaster
                        .FirstOrDefault(w => w.Id == request.Id && w.TenantId == request.TenantID);

                    if (workstation == null)
                    {
                        return NotFound(new { error = "Workstation not found" });
                    }

                    // Check for duplicate workstation name (excluding current)
                    if (workstation.WorkstationName != request.WorkstationName)
                    {
                        var duplicate = _context.WorkstationMaster
                            .Any(w => w.WorkstationName == request.WorkstationName && 
                                     w.TenantId == request.TenantID && 
                                     w.Id != request.Id);

                        if (duplicate)
                        {
                            return BadRequest(new { error = "Workstation name already exists" });
                        }
                    }

                    workstation.WorkstationName = request.WorkstationName;
                    workstation.IsActive = request.IsActive;
                    _context.WorkstationMaster.Update(workstation);
                }

                await _context.SaveChangesAsync();

                // Handle User Workstation Mappings
                if (request.UserWorkstationMappings != null && request.UserWorkstationMappings.Any())
                {
                    // Delete existing mappings for this workstation
                    var existingMappings = _context.UserWorkstationMapping
                        .Where(uwm => uwm.WorkstationId == workstation.Id && uwm.TenantId == request.TenantID)
                        .ToList();

                    if (existingMappings.Any())
                    {
                        _context.UserWorkstationMapping.RemoveRange(existingMappings);
                    }

                    // Add new mappings
                    foreach (var mapping in request.UserWorkstationMappings)
                    {
                        // Skip if userId is 0 or not set
                        if (mapping.UserId > 0)
                        {
                            var userMapping = new UserWorkstationMapping
                            {
                                WorkstationId = workstation.Id,
                                UserId = mapping.UserId,
                                TenantId = request.TenantID
                            };
                            _context.UserWorkstationMapping.Add(userMapping);
                        }
                    }

                    await _context.SaveChangesAsync();
                }
                else
                {
                    // If no mappings provided, delete all existing mappings
                    var existingMappings = _context.UserWorkstationMapping
                        .Where(uwm => uwm.WorkstationId == workstation.Id && uwm.TenantId == request.TenantID)
                        .ToList();

                    if (existingMappings.Any())
                    {
                        _context.UserWorkstationMapping.RemoveRange(existingMappings);
                        await _context.SaveChangesAsync();
                    }
                }

                return Ok(new { result = workstation });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpPost("ImportWorkstations")]
        public IActionResult ImportWorkstations([FromBody] WorkstationImportRequest request)
        {
            try
            {
                if (request == null || request.Rows == null || request.Rows.Count == 0)
                {
                    return BadRequest(new { error = "No rows to import" });
                }

                if (request.TenantID <= 0)
                {
                    return BadRequest(new { error = "TenantID is required" });
                }

                var existing = _context.WorkstationMaster
                    .Where(w => w.TenantId == request.TenantID)
                    .ToList();

                var result = new WorkstationImportResult();
                var rowResults = new List<WorkstationImportRowResult>();
                var batchNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

                using var tx = _context.Database.BeginTransaction();
                try
                {
                    for (int i = 0; i < request.Rows.Count; i++)
                    {
                        var row = request.Rows[i];
                        var rowNumber = row.RowNumber ?? (i + 2);
                        var rowResult = new WorkstationImportRowResult { RowNumber = rowNumber };

                        var name = (row.WorkstationName ?? "").Trim();

                        if (string.IsNullOrWhiteSpace(name))
                        {
                            rowResult.Status = "Error";
                            rowResult.Message = "Workstation Name is required";
                            result.Failed++;
                            rowResults.Add(rowResult);
                            continue;
                        }

                        if (!batchNames.Add(name))
                        {
                            rowResult.Status = "Error";
                            rowResult.Message = $"Duplicate Workstation Name '{name}' in import file";
                            result.Failed++;
                            rowResults.Add(rowResult);
                            continue;
                        }

                        var isActive = ParseStatus(row.Status);
                        var match = existing.FirstOrDefault(w =>
                            string.Equals(w.WorkstationName, name, StringComparison.OrdinalIgnoreCase));

                        if (match != null)
                        {
                            if (!request.UpdateExisting)
                            {
                                rowResult.Status = "Skipped";
                                rowResult.Message = "Workstation already exists";
                                rowResult.WorkstationId = match.Id;
                                result.Skipped++;
                                rowResults.Add(rowResult);
                                continue;
                            }

                            match.WorkstationName = name;
                            if (isActive.HasValue) match.IsActive = isActive.Value;

                            rowResult.Status = "Updated";
                            rowResult.Message = "Updated";
                            rowResult.WorkstationId = match.Id;
                            result.Updated++;
                        }
                        else
                        {
                            var workstation = new WorkstationMaster
                            {
                                TenantId = request.TenantID,
                                WorkstationName = name,
                                IsActive = isActive ?? true
                            };
                            _context.WorkstationMaster.Add(workstation);
                            existing.Add(workstation);

                            rowResult.Status = "Created";
                            rowResult.Message = "Created";
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

        private static bool? ParseStatus(string? value)
        {
            if (string.IsNullOrWhiteSpace(value)) return null;
            var v = value.Trim().ToLowerInvariant();
            if (v is "active" or "1" or "yes" or "true") return true;
            if (v is "inactive" or "0" or "no" or "false") return false;
            return null;
        }

        [HttpGet("GetUserWorkstationMapping")]
        public IActionResult GetUserWorkstationMapping([FromQuery] int tenantid, [FromQuery] int workstationId)
        {
            try
            {
                var mappings = _context.UserWorkstationMapping
                    .Where(uwm => uwm.WorkstationId == workstationId && uwm.TenantId == tenantid)
                    .Join(_context.UserDetails,
                        uwm => uwm.UserId,
                        ud => ud.User_UniqueID,
                        (uwm, ud) => new
                        {
                            id = uwm.Id,
                            userId = uwm.UserId,
                            userName = ud.UserName,
                            workstationId = uwm.WorkstationId,
                            tenantId = uwm.TenantId
                        })
                    .ToList();

                return Ok(new { result = mappings });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpGet("GetAllUsers")]
        public IActionResult GetAllUsers([FromQuery] int tenantid)
        {
            try
            {
                var users = _context.UserDetails
                    .Where(u => u.TenantID == tenantid)
                    .Select(u => new
                    {
                        user_UniqueID = u.User_UniqueID,
                        userName = u.UserName,
                        email = u.Email ?? ""
                    })
                    .ToList();

                return Ok(new { result = users });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpGet("CheckWorkstationDeletionImpact")]
        public IActionResult CheckWorkstationDeletionImpact([FromQuery] int workstationId, [FromQuery] int tenantId)
        {
            try
            {
                var workstation = _context.WorkstationMaster
                    .FirstOrDefault(w => w.Id == workstationId && w.TenantId == tenantId);

                if (workstation == null)
                {
                    return NotFound(new { error = "Workstation not found" });
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

                // Check for User Workstation Mappings
                var userMappings = _context.UserWorkstationMapping
                    .Where(uwm => uwm.WorkstationId == workstationId && uwm.TenantId == tenantId)
                    .ToList();

                if (userMappings.Any())
                {
                    impact.WillBeDeleted.Add(new ImpactedEntity
                    {
                        EntityType = "User Mappings",
                        Count = userMappings.Count,
                        Description = $"{userMappings.Count} user mapping(s) will be deleted"
                    });
                }

                // Check for Job Orders (if workstation is referenced)
                // Note: Check JobOrderMaster for workstation references if the model has such a field
                // For now, we'll just add a warning if there are any job orders that might reference it

                impact.Warnings.Add("This action cannot be undone");

                return Ok(new { result = impact });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message, stackTrace = ex.StackTrace });
            }
        }

        [HttpDelete("DeleteWorkstation")]
        public IActionResult DeleteWorkstation([FromQuery] int workstationId, [FromQuery] int tenantId)
        {
            try
            {
                var workstation = _context.WorkstationMaster
                    .FirstOrDefault(w => w.Id == workstationId && w.TenantId == tenantId);

                if (workstation == null)
                {
                    return NotFound(new { error = "Workstation not found" });
                }

                // Delete related entities
                var userMappings = _context.UserWorkstationMapping
                    .Where(uwm => uwm.WorkstationId == workstationId && uwm.TenantId == tenantId)
                    .ToList();
                _context.UserWorkstationMapping.RemoveRange(userMappings);

                // Delete the workstation
                _context.WorkstationMaster.Remove(workstation);
                _context.SaveChanges();

                return Ok(new { result = new { message = "Workstation deleted successfully" } });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message, stackTrace = ex.StackTrace });
            }
        }
    }

    // Request DTOs
    public class WorkstationMasterReq
    {
        public int Id { get; set; }
        public string WorkstationName { get; set; }
        public bool IsActive { get; set; }
        public int TenantID { get; set; }
        public List<UserWorkstationMappingReq> UserWorkstationMappings { get; set; }
    }

    public class UserWorkstationMappingReq
    {
        public int Id { get; set; }
        public int WorkstationId { get; set; }
        public int UserId { get; set; }
        public int TenantId { get; set; }
        public string UserName { get; set; }
    }

    public class WorkstationImportRequest
    {
        public int TenantID { get; set; }
        public bool UpdateExisting { get; set; } = true;
        public bool StopOnError { get; set; } = false;
        public List<WorkstationImportRow> Rows { get; set; } = new();
    }

    public class WorkstationImportRow
    {
        public int? RowNumber { get; set; }
        public string? WorkstationName { get; set; }
        public string? Status { get; set; }
    }

    public class WorkstationImportResult
    {
        public int Created { get; set; }
        public int Updated { get; set; }
        public int Skipped { get; set; }
        public int Failed { get; set; }
        public List<WorkstationImportRowResult> Rows { get; set; } = new();
    }

    public class WorkstationImportRowResult
    {
        public int RowNumber { get; set; }
        public int? WorkstationId { get; set; }
        public string Status { get; set; } = "";
        public string Message { get; set; } = "";
    }
}

