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
                // Get workstations with concatenated user names
                var workstations = _context.WorkstationMaster
                    .Where(w => w.TenantId == tenantid)
                    .ToList()
                    .Select(w => new
                    {
                        id = w.Id,
                        workstationName = w.WorkstationName,
                        isActive = w.IsActive,
                        tenantId = w.TenantId,
                        // Concatenate user names from mappings
                        userName = string.Join(", ", _context.UserWorkstationMapping
                            .Where(uwm => uwm.WorkstationId == w.Id && uwm.TenantId == tenantid)
                            .Join(_context.UserDetails,
                                uwm => uwm.UserId,
                                ud => ud.User_UniqueID,
                                (uwm, ud) => ud.UserName)
                            .ToList())
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
}

