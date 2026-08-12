using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using CimmpleAPI.Data;
using CimmpleAPI.Data.Models;
using CimmpleAPI.Data.Dtos;
using CimmpleAPI.Data.Seeds;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace CimmpleAPI.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class NCRCodeController : ApiBaseController
    {
        private readonly CimmpleDbContext _context;

        public NCRCodeController(CimmpleDbContext context)
        {
            _context = context;
        }

        [HttpGet("GetNCRCodes")]
        public IActionResult GetNCRCodes([FromQuery] int tenantId)
        {
            try
            {
                var codes = _context.NCRCodeMaster
                    .AsNoTracking()
                    .Where(c => c.TenantId == tenantId)
                    .OrderBy(c => c.NCRCode)
                    .Select(c => new
                    {
                        id = c.Id,
                        ncrCode = c.NCRCode ?? "",
                        description = c.Description ?? "",
                        tenantId = c.TenantId,
                        createdDate = c.CreatedDate
                    })
                    .ToList();

                return Ok(new { result = codes });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpPost("SeedDefaultNCRCodes")]
        public async Task<IActionResult> SeedDefaultNCRCodes([FromQuery] int tenantId = 1, [FromQuery] int createdBy = 1)
        {
            try
            {
                if (tenantId <= 0)
                    return BadRequest(new { error = "tenantId is required" });

                var existingCodes = await _context.NCRCodeMaster
                    .AsNoTracking()
                    .Where(c => c.TenantId == tenantId && c.NCRCode != null)
                    .Select(c => c.NCRCode!.ToLower())
                    .ToListAsync();

                var existingSet = new HashSet<string>(existingCodes, StringComparer.OrdinalIgnoreCase);
                var now = DateTime.UtcNow;
                var toInsert = NCRCodeSeedData.DefaultCodes
                    .Where(c => !existingSet.Contains(c.Code))
                    .Select(c => new NCRCodeMaster
                    {
                        NCRCode = c.Code,
                        Description = c.Description,
                        TenantId = tenantId,
                        CreatedBy = createdBy > 0 ? createdBy : 1,
                        CreatedDate = now
                    })
                    .ToList();

                if (toInsert.Count > 0)
                {
                    _context.NCRCodeMaster.AddRange(toInsert);
                    await _context.SaveChangesAsync();
                }

                var total = await _context.NCRCodeMaster.CountAsync(c => c.TenantId == tenantId);

                return Ok(new
                {
                    message = "Default NCR codes seeded",
                    inserted = toInsert.Count,
                    skipped = NCRCodeSeedData.DefaultCodes.Length - toInsert.Count,
                    totalForTenant = total
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpGet("GetNCRCodeById")]
        public IActionResult GetNCRCodeById([FromQuery] int id, [FromQuery] int tenantId)
        {
            try
            {
                var code = _context.NCRCodeMaster
                    .AsNoTracking()
                    .FirstOrDefault(c => c.Id == id && c.TenantId == tenantId);

                if (code == null)
                    return NotFound(new { error = "NCR Code not found" });

                return Ok(new
                {
                    result = new
                    {
                        id = code.Id,
                        ncrCode = code.NCRCode ?? "",
                        description = code.Description ?? "",
                        tenantId = code.TenantId,
                        createdBy = code.CreatedBy,
                        createdDate = code.CreatedDate
                    }
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpPost("SaveNCRCode")]
        public async Task<IActionResult> SaveNCRCode([FromBody] NCRCodeMasterReq request)
        {
            try
            {
                if (request == null)
                    return BadRequest(new { error = "Request cannot be null" });

                if (string.IsNullOrWhiteSpace(request.NCRCode))
                    return BadRequest(new { error = "NCR Code is required" });

                var normalizedCode = request.NCRCode.Trim();
                var isNew = request.Id == 0;
                NCRCodeMaster entity;

                if (isNew)
                {
                    var duplicate = await _context.NCRCodeMaster.AnyAsync(c =>
                        c.TenantId == request.TenantId &&
                        c.NCRCode != null &&
                        c.NCRCode.ToLower() == normalizedCode.ToLower());

                    if (duplicate)
                        return BadRequest(new { error = "NCR Code already exists" });

                    entity = new NCRCodeMaster
                    {
                        NCRCode = normalizedCode,
                        Description = request.Description?.Trim() ?? "",
                        TenantId = request.TenantId,
                        CreatedBy = request.CreatedBy > 0 ? request.CreatedBy : 1,
                        CreatedDate = DateTime.UtcNow
                    };
                    _context.NCRCodeMaster.Add(entity);
                }
                else
                {
                    entity = await _context.NCRCodeMaster
                        .FirstOrDefaultAsync(c => c.Id == request.Id && c.TenantId == request.TenantId);

                    if (entity == null)
                        return NotFound(new { error = "NCR Code not found" });

                    var duplicate = await _context.NCRCodeMaster.AnyAsync(c =>
                        c.TenantId == request.TenantId &&
                        c.Id != request.Id &&
                        c.NCRCode != null &&
                        c.NCRCode.ToLower() == normalizedCode.ToLower());

                    if (duplicate)
                        return BadRequest(new { error = "NCR Code already exists" });

                    entity.NCRCode = normalizedCode;
                    entity.Description = request.Description?.Trim() ?? "";
                    _context.NCRCodeMaster.Update(entity);
                }

                await _context.SaveChangesAsync();

                return Ok(new
                {
                    result = new
                    {
                        id = entity.Id,
                        ncrCode = entity.NCRCode ?? "",
                        description = entity.Description ?? "",
                        tenantId = entity.TenantId
                    }
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpGet("CheckNCRCodeDeletionImpact")]
        public async Task<IActionResult> CheckNCRCodeDeletionImpact([FromQuery] int id, [FromQuery] int tenantId)
        {
            try
            {
                var code = await _context.NCRCodeMaster
                    .AsNoTracking()
                    .FirstOrDefaultAsync(c => c.Id == id && c.TenantId == tenantId);

                if (code == null)
                    return NotFound(new { error = "NCR Code not found" });

                var usageCount = 0;
                await EnsureNcrCodeColumnsAsync();
                await using (var command = _context.Database.GetDbConnection().CreateCommand())
                {
                    command.CommandText = "SELECT COUNT(*) FROM NonConformanceReports WHERE TenantId = @tenantId AND NcrCodeId = @ncrCodeId";
                    var tenantParam = command.CreateParameter();
                    tenantParam.ParameterName = "@tenantId";
                    tenantParam.Value = tenantId;
                    command.Parameters.Add(tenantParam);
                    var codeParam = command.CreateParameter();
                    codeParam.ParameterName = "@ncrCodeId";
                    codeParam.Value = id;
                    command.Parameters.Add(codeParam);

                    if (command.Connection!.State != System.Data.ConnectionState.Open)
                        await command.Connection.OpenAsync();

                    var scalar = await command.ExecuteScalarAsync();
                    usageCount = scalar != null && scalar != DBNull.Value ? Convert.ToInt32(scalar) : 0;
                }

                var result = new DeletionImpactResult
                {
                    CanDelete = usageCount == 0,
                    BlockingReasons = usageCount > 0
                        ? new List<string> { $"{usageCount} NCR(s) reference this code." }
                        : new List<string>(),
                    BlockingDependencies = new List<BlockingDependency>(),
                    WillBeDeleted = new List<ImpactedEntity>(),
                    WillBeAffected = usageCount > 0
                        ? new List<ImpactedEntity>
                        {
                            new ImpactedEntity
                            {
                                EntityType = "NonConformanceReport",
                                Description = $"{usageCount} NCR(s) use this code"
                            }
                        }
                        : new List<ImpactedEntity>(),
                    Warnings = new List<string>()
                };

                return Ok(new { result });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpDelete("DeleteNCRCode")]
        public async Task<IActionResult> DeleteNCRCode([FromQuery] int id, [FromQuery] int tenantId)
        {
            try
            {
                var entity = await _context.NCRCodeMaster
                    .FirstOrDefaultAsync(c => c.Id == id && c.TenantId == tenantId);

                if (entity == null)
                    return NotFound(new { error = "NCR Code not found" });

                await EnsureNcrCodeColumnsAsync();
                var usageCount = 0;
                await using (var command = _context.Database.GetDbConnection().CreateCommand())
                {
                    command.CommandText = "SELECT COUNT(*) FROM NonConformanceReports WHERE TenantId = @tenantId AND NcrCodeId = @ncrCodeId";
                    var tenantParam = command.CreateParameter();
                    tenantParam.ParameterName = "@tenantId";
                    tenantParam.Value = tenantId;
                    command.Parameters.Add(tenantParam);
                    var codeParam = command.CreateParameter();
                    codeParam.ParameterName = "@ncrCodeId";
                    codeParam.Value = id;
                    command.Parameters.Add(codeParam);

                    if (command.Connection!.State != System.Data.ConnectionState.Open)
                        await command.Connection.OpenAsync();

                    var scalar = await command.ExecuteScalarAsync();
                    usageCount = scalar != null && scalar != DBNull.Value ? Convert.ToInt32(scalar) : 0;
                }

                if (usageCount > 0)
                    return BadRequest(new { error = "Cannot delete NCR Code that is in use" });

                _context.NCRCodeMaster.Remove(entity);
                await _context.SaveChangesAsync();

                return Ok(new { message = "NCR Code deleted successfully" });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        private static int _ncrCodeColumnsReady;

        private async Task EnsureNcrCodeColumnsAsync()
        {
            if (System.Threading.Interlocked.CompareExchange(ref _ncrCodeColumnsReady, 1, 0) != 0)
                return;

            try
            {
                await _context.Database.ExecuteSqlRawAsync(@"
IF COL_LENGTH('dbo.NonConformanceReports', 'NcrCodeId') IS NULL
BEGIN
    ALTER TABLE dbo.NonConformanceReports ADD
        NcrCodeId int NULL,
        NcrCode nvarchar(50) NULL;
END");
            }
            catch
            {
                System.Threading.Interlocked.Exchange(ref _ncrCodeColumnsReady, 0);
            }
        }
    }

    public class NCRCodeMasterReq
    {
        public int Id { get; set; }
        public string NCRCode { get; set; } = "";
        public string Description { get; set; } = "";
        public int TenantId { get; set; }
        public int CreatedBy { get; set; }
    }
}
