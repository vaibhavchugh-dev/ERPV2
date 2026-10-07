using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using CimmpleAPI.Data;
using CimmpleAPI.Data.Models;
using CimmpleAPI.Data.Dtos;
using CimmpleAPI.Data.Seeds;
using CimmpleAPI.Services.Tenancy;
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
        private readonly ILogger<NCRCodeController> _logger;

        public NCRCodeController(CimmpleDbContext context, ILogger<NCRCodeController> logger)
        {
            _context = context;
            _logger = logger;
        }

        private IActionResult ServerError(Exception ex, string action)
        {
            _logger.LogError(ex, "NCR code {Action} failed", action);
            return StatusCode(500, new { error = "An unexpected error occurred. Please try again." });
        }

        private Task LockNcrCodesAsync(int tenantId) => NcrCodeDefaults.LockNcrCodesAsync(_context, tenantId);

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
                return ServerError(ex, "list");
            }
        }

        [HttpPost("SeedDefaultNCRCodes")]
        public async Task<IActionResult> SeedDefaultNCRCodes([FromQuery] int? tenantId = null)
        {
            try
            {
                var tokenTenantId = GetTenantId();
                var userId = GetUserId();
                if (tokenTenantId <= 0 || !userId.HasValue)
                    return BadRequest(new { error = "A signed-in tenant user is required" });

                if (tenantId.HasValue && tenantId.Value != tokenTenantId)
                    return StatusCode(403, new { error = "Default NCR codes can only be seeded for your own tenant" });

                var (inserted, total) = await NcrCodeDefaults.EnsureForTenantAsync(_context, tokenTenantId, userId.Value);

                return Ok(new
                {
                    message = "Default NCR codes seeded",
                    inserted,
                    skipped = NCRCodeSeedData.DefaultCodes.Length - inserted,
                    totalForTenant = total
                });
            }
            catch (Exception ex)
            {
                return ServerError(ex, "seed");
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
                return ServerError(ex, "load");
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
                if (normalizedCode.Length > 50)
                    return BadRequest(new { error = "NCR Code must be 50 characters or fewer" });

                var isNew = request.Id == 0;
                var userId = GetUserId();
                if (isNew && !userId.HasValue)
                    return BadRequest(new { error = "A signed-in user is required" });

                NCRCodeMaster entity;

                await using var tx = await _context.Database.BeginTransactionAsync();
                await LockNcrCodesAsync(request.TenantId);

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
                        CreatedBy = userId!.Value,
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

                    var renamed = !string.Equals(entity.NCRCode, normalizedCode, StringComparison.Ordinal);
                    entity.NCRCode = normalizedCode;
                    entity.Description = request.Description?.Trim() ?? "";
                    _context.NCRCodeMaster.Update(entity);

                    // NCRs keep a copy of the code text for lists and search; keep it in step with the master.
                    if (renamed)
                    {
                        await EnsureNcrCodeColumnsAsync();
                        await _context.Database.ExecuteSqlRawAsync(
                            "UPDATE CimmpleFlow.NonConformanceReports SET NcrCode = {0} WHERE TenantId = {1} AND NcrCodeId = {2}",
                            normalizedCode, request.TenantId, entity.Id);
                    }
                }

                await _context.SaveChangesAsync();
                await tx.CommitAsync();

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
                return ServerError(ex, "save");
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
                    command.CommandText = "SELECT COUNT(*) FROM CimmpleFlow.NonConformanceReports WHERE TenantId = @tenantId AND NcrCodeId = @ncrCodeId";
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
                return ServerError(ex, "deletion impact");
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
                    command.CommandText = "SELECT COUNT(*) FROM CimmpleFlow.NonConformanceReports WHERE TenantId = @tenantId AND NcrCodeId = @ncrCodeId";
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
                return ServerError(ex, "delete");
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
IF COL_LENGTH('CimmpleFlow.NonConformanceReports', 'NcrCodeId') IS NULL
BEGIN
    ALTER TABLE CimmpleFlow.NonConformanceReports ADD
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
