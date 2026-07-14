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
    public class ProcessController : ApiBaseController
    {
        private readonly CimmpleDbContext _context;

        public ProcessController(CimmpleDbContext context)
        {
            _context = context;
        }

        [HttpGet("GetProcesses")]
        public IActionResult GetProcesses([FromQuery] int tenantid)
        {
            try
            {
                var processes = _context.ProcessMaster
                    .Where(p => p.Tenantid == tenantid)
                    .OrderBy(p => p.Srno)
                    .Select(p => new
                    {
                        id = p.Id,
                        processName = p.ProcessName ?? "",
                        srno = p.Srno,
                        pDescription = p.PDescription ?? "",
                        isFixed = p.isFixed ?? 0,
                        status = p.status,
                        ledgercode = p.ledgercode ?? "",
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

                var processData = new
                {
                    id = process.Id,
                    processName = process.ProcessName ?? "",
                    srno = process.Srno,
                    pDescription = process.PDescription ?? "",
                    isFixed = process.isFixed ?? 0,
                    status = process.status,
                    ledgercode = process.ledgercode ?? "",
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

                // Ensure required fields are not null
                if (string.IsNullOrEmpty(request.ProcessName))
                {
                    return BadRequest(new { error = "Process Name is required" });
                }

                ProcessMaster process;

                if (request.Id > 0)
                {
                    // Update existing process
                    process = _context.ProcessMaster
                        .FirstOrDefault(p => p.Id == request.Id && p.Tenantid == request.Tenantid);

                    if (process == null)
                    {
                        return NotFound(new { error = "Process not found" });
                    }

                    // Update fields
                    process.ProcessName = request.ProcessName ?? process.ProcessName ?? "";
                    process.PDescription = request.PDescription ?? process.PDescription ?? "";
                    process.Srno = request.Srno > 0 ? request.Srno : process.Srno;
                    process.isFixed = request.IsFixed ?? process.isFixed ?? 0;
                    process.status = request.Status == "Active" ? 1 : (request.Status == "Inactive" ? 0 : process.status);
                    process.ledgercode = request.Ledgercode ?? process.ledgercode ?? "";
                }
                else
                {
                    // Create new process
                    // Get max Srno for ordering
                    var existingProcesses = _context.ProcessMaster
                        .Where(p => p.Tenantid == request.Tenantid)
                        .ToList();

                    int maxSrno = existingProcesses.Any() 
                        ? existingProcesses.Max(p => p.Srno) 
                        : 0;

                    process = new ProcessMaster
                    {
                        Tenantid = request.Tenantid,
                        ProcessName = request.ProcessName ?? "",
                        PDescription = request.PDescription ?? "",
                        Srno = request.Srno > 0 ? request.Srno : maxSrno + 1,
                        isFixed = request.IsFixed ?? 0,
                        status = request.Status == "Active" ? 1 : 0,
                        ledgercode = request.Ledgercode ?? ""
                    };

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

                // Check if process is fixed (system process that shouldn't be deleted)
                if (process.isFixed == 1)
                {
                    impact.BlockingReasons.Add("This is a fixed system process and cannot be deleted.");
                    impact.CanDelete = false;
                }

                // Check for Job Order routing steps that use this process
                // Note: This depends on your JobOrder routing structure
                // If JobOrderRouting or similar table exists, check it here

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

                // Check if process is fixed
                if (process.isFixed == 1)
                {
                    return BadRequest(new { error = "Fixed system processes cannot be deleted" });
                }

                // Delete the process
                _context.ProcessMaster.Remove(process);
                _context.SaveChanges();

                return Ok(new { result = new { message = "Process deleted successfully" } });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message, stackTrace = ex.StackTrace });
            }
        }
    }

    public class ProcessMasterReq
    {
        public int Id { get; set; }
        public int Tenantid { get; set; }
        public string ProcessName { get; set; } = "";
        public int Srno { get; set; }
        public string PDescription { get; set; } = "";
        public int? IsFixed { get; set; }
        public string Status { get; set; } = "Active";
        public string Ledgercode { get; set; } = "";
    }
}

