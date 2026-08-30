using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using System.Text.Json;
using System.IO;
using CimmpleAPI.Data;
using CimmpleAPI.Data.Models;
using CimmpleAPI.Data.Dtos;

namespace CimmpleAPI.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class QualityController : ApiBaseController
    {
        private static readonly HashSet<string> AllowedPhotoExtensions = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            ".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"
        };
        private const long MaxPhotoSizeBytes = 8 * 1024 * 1024;
        private const int MaxPhotosPerNcr = 10;

        private readonly CimmpleDbContext _context;
        private readonly IWebHostEnvironment _environment;

        public QualityController(CimmpleDbContext context, IWebHostEnvironment environment)
        {
            _context = context;
            _environment = environment;
        }

        private static int _ncrExternalColumnsReady;

        private async Task EnsureNcrExternalColumnsAsync()
        {
            if (System.Threading.Interlocked.CompareExchange(ref _ncrExternalColumnsReady, 1, 0) != 0)
            {
                return;
            }

            try
            {
                await _context.Database.ExecuteSqlRawAsync(@"
IF COL_LENGTH('CimmpleFlow.NonConformanceReports', 'VendorId') IS NULL
BEGIN
    ALTER TABLE CimmpleFlow.NonConformanceReports ADD
        VendorId int NULL,
        VendorName nvarchar(200) NULL,
        VendorOrderId int NULL,
        PoNumber nvarchar(50) NULL;
END
IF COL_LENGTH('CimmpleFlow.NonConformanceReports', 'NcrCodeId') IS NULL
BEGIN
    ALTER TABLE CimmpleFlow.NonConformanceReports ADD
        NcrCodeId int NULL,
        NcrCode nvarchar(50) NULL;
END");
            }
            catch
            {
                System.Threading.Interlocked.Exchange(ref _ncrExternalColumnsReady, 0);
            }
        }

        private async Task ResolveNcrCodeFieldsAsync(NonConformanceReport ncr)
        {
            if (ncr.NcrCodeId.GetValueOrDefault() > 0)
            {
                var code = await _context.NCRCodeMaster
                    .AsNoTracking()
                    .FirstOrDefaultAsync(c => c.Id == ncr.NcrCodeId && c.TenantId == ncr.TenantId);

                ncr.NcrCode = code?.NCRCode ?? "";
            }
            else
            {
                ncr.NcrCodeId = null;
                ncr.NcrCode = ncr.NcrCode ?? "";
            }
        }

                // GET: api/Quality/FixDatabase
                [HttpGet("FixDatabase")]
                public async Task<IActionResult> FixDatabase()
                {
                    try
                    {
                        Console.WriteLine("Fixing database null values using raw SQL...");

                        // Use raw SQL to avoid EF null reference issues
                        var sqlCommands = new[]
                        {
                            // Fix critical required fields that might be null
                            "UPDATE CimmpleFlow.NonConformanceReports SET NcrNumber = 'NCR-UNKNOWN-' + CAST(NcrId AS VARCHAR(10)) WHERE NcrNumber IS NULL OR NcrNumber = ''",
                            "UPDATE CimmpleFlow.NonConformanceReports SET Title = 'Untitled NCR' WHERE Title IS NULL OR Title = ''",
                            "UPDATE CimmpleFlow.NonConformanceReports SET Category = 'Other' WHERE Category IS NULL OR Category = ''",
                            "UPDATE CimmpleFlow.NonConformanceReports SET Severity = 'Minor' WHERE Severity IS NULL OR Severity = ''",
                            "UPDATE CimmpleFlow.NonConformanceReports SET Status = 'Open' WHERE Status IS NULL OR Status = ''",
                            "UPDATE CimmpleFlow.NonConformanceReports SET Source = 'Internal' WHERE Source IS NULL OR Source = ''",
                            "UPDATE CimmpleFlow.NonConformanceReports SET ReportedBy = 1 WHERE ReportedBy IS NULL OR ReportedBy = 0",
                            "UPDATE CimmpleFlow.NonConformanceReports SET ReportedDate = GETUTCDATE() WHERE ReportedDate IS NULL",
                            "UPDATE CimmpleFlow.NonConformanceReports SET TenantId = 1 WHERE TenantId IS NULL OR TenantId = 0",
                            "UPDATE CimmpleFlow.NonConformanceReports SET CreatedBy = ISNULL(ReportedBy, 1) WHERE CreatedBy IS NULL OR CreatedBy = 0",
                            "UPDATE CimmpleFlow.NonConformanceReports SET CreatedDate = GETUTCDATE() WHERE CreatedDate IS NULL",

                            // Fix nullable string fields
                            "UPDATE CimmpleFlow.NonConformanceReports SET Description = '' WHERE Description IS NULL",
                            "UPDATE CimmpleFlow.NonConformanceReports SET DefectLocation = '' WHERE DefectLocation IS NULL",
                            "UPDATE CimmpleFlow.NonConformanceReports SET PartNo = '' WHERE PartNo IS NULL",
                            "UPDATE CimmpleFlow.NonConformanceReports SET PartName = '' WHERE PartName IS NULL",
                            "UPDATE CimmpleFlow.NonConformanceReports SET RootCause = '' WHERE RootCause IS NULL",
                            "UPDATE CimmpleFlow.NonConformanceReports SET ImmediateAction = '' WHERE ImmediateAction IS NULL",
                            "UPDATE CimmpleFlow.NonConformanceReports SET CorrectiveAction = '' WHERE CorrectiveAction IS NULL",
                            "UPDATE CimmpleFlow.NonConformanceReports SET PreventiveAction = '' WHERE PreventiveAction IS NULL",
                            "UPDATE CimmpleFlow.NonConformanceReports SET Notes = '' WHERE Notes IS NULL",

                            // Fix nullable int fields
                            "UPDATE CimmpleFlow.NonConformanceReports SET DefectQuantity = 0 WHERE DefectQuantity IS NULL",
                            "UPDATE CimmpleFlow.NonConformanceReports SET TotalQuantity = 0 WHERE TotalQuantity IS NULL"
                        };

                        foreach (var sql in sqlCommands)
                        {
                            Console.WriteLine($"Executing: {sql}");
                            await _context.Database.ExecuteSqlRawAsync(sql);
                        }

                        Console.WriteLine("Database fixes applied successfully");

                        return Ok(new { message = "Database fixed successfully" });
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine($"Database fix failed: {ex.Message}");
                        Console.WriteLine($"Stack trace: {ex.StackTrace}");
                        return BadRequest(new { error = new { message = ex.Message } });
                    }
                }

        // GET: api/Quality/TestDB
        [HttpGet("TestDB")]
        public async Task<IActionResult> TestDB()
        {
            try
            {
                // Test basic query
                var count = await _context.NonConformanceReports.CountAsync();
                Console.WriteLine($"Total NCRs in database: {count}");

                // Test raw SQL to check actual values
                var testResults = await _context.NonConformanceReports
                    .FromSqlRaw(@"
                        SELECT TOP 5
                            NcrId, NcrNumber, Title, Category, Severity, Status, Source,
                            ReportedBy, TenantId, CreatedBy
                        FROM CimmpleFlow.NonConformanceReports
                        WHERE TenantId = 1
                    ")
                    .Select(n => new {
                        n.NcrId,
                        n.NcrNumber,
                        n.Title,
                        n.Category,
                        n.Severity,
                        n.Status,
                        n.Source,
                        n.ReportedBy,
                        n.TenantId,
                        n.CreatedBy
                    })
                    .ToListAsync();

                Console.WriteLine("Sample NCR data:");
                foreach (var ncr in testResults)
                {
                    Console.WriteLine($"ID: {ncr.NcrId}, Number: {ncr.NcrNumber}, Title: {ncr.Title}, Category: {ncr.Category}, Status: {ncr.Status}");
                }

                return Ok(new { count, samples = testResults });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"TestDB failed: {ex.Message}");
                Console.WriteLine($"Stack trace: {ex.StackTrace}");
                return BadRequest(new { error = ex.Message });
            }
        }

        // GET: api/Quality/DebugNCRs
        [HttpGet("DebugNCRs")]
        public async Task<IActionResult> DebugNCRs([FromQuery] int tenantId = 1)
        {
            try
            {
                Console.WriteLine($"DebugNCRs called for tenantId: {tenantId}");

                var allNCRs = await _context.NonConformanceReports
                    .Where(n => n.TenantId == tenantId)
                    .OrderByDescending(n => n.CreatedDate)
                    .ToListAsync();

                Console.WriteLine($"Found {allNCRs.Count} NCRs for tenant {tenantId}");
                foreach (var ncr in allNCRs)
                {
                    Console.WriteLine($"NCR: ID={ncr.NcrId}, Number={ncr.NcrNumber}, Title={ncr.Title}, Status={ncr.Status}, TenantId={ncr.TenantId}");
                }

                var result = allNCRs.Select(n => new {
                    ncrId = n.NcrId,
                    ncrNumber = n.NcrNumber,
                    title = n.Title,
                    status = n.Status,
                    reportedBy = n.ReportedBy,
                    createdDate = n.CreatedDate
                }).ToList();

                return Ok(new { count = allNCRs.Count, ncrs = result });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"DebugNCRs failed: {ex.Message}");
                return BadRequest(new { error = ex.Message });
            }
        }

        // DELETE: api/Quality/DeleteAllNCRs
        [HttpDelete("DeleteAllNCRs")]
        public async Task<IActionResult> DeleteAllNCRs([FromQuery] int tenantId)
        {
            try
            {
                Console.WriteLine($"DeleteAllNCRs called for tenantId: {tenantId}");

                // Use raw SQL to avoid null reference issues
                var deletedCount = await _context.Database.ExecuteSqlRawAsync(
                    "DELETE FROM CimmpleFlow.NonConformanceReports WHERE TenantId = {0}", tenantId);

                Console.WriteLine($"Successfully deleted {deletedCount} NCRs");

                return Ok(new { message = $"Deleted {deletedCount} NCRs successfully" });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"DeleteAllNCRs failed: {ex.Message}");
                return BadRequest(new { error = ex.Message });
            }
        }

        // GET: api/Quality/CheckDatabase
        [HttpGet("CheckDatabase")]
        public async Task<IActionResult> CheckDatabase()
        {
            try
            {
                var recordCount = await _context.NonConformanceReports.CountAsync();

                return Ok(new {
                    recordCount = recordCount,
                    message = $"Found {recordCount} NCR records in database"
                });
            }
            catch (Exception ex)
            {
                return BadRequest(new { error = ex.Message });
            }
        }

        // GET: api/Quality/GetNCRs
        [HttpGet("CheckNCRDeletionImpact")]
        public async Task<IActionResult> CheckNCRDeletionImpact([FromQuery] int ncrId, [FromQuery] int tenantId)
        {
            try
            {
                // Only select the fields we need to avoid null value issues
                var ncr = await _context.NonConformanceReports
                    .Where(n => n.NcrId == ncrId && (tenantId <= 0 || n.TenantId == tenantId))
                    .Select(n => new
                    {
                        n.NcrId,
                        n.JobOrderId,
                        n.CustomerId,
                        n.TenantId
                    })
                    .FirstOrDefaultAsync();

                if (ncr == null)
                {
                    ncr = await _context.NonConformanceReports
                        .Where(n => n.NcrId == ncrId)
                        .Select(n => new
                        {
                            n.NcrId,
                            n.JobOrderId,
                            n.CustomerId,
                            n.TenantId
                        })
                        .FirstOrDefaultAsync();
                }

                if (ncr == null)
                {
                    return NotFound(new { error = "NCR not found" });
                }

                var result = new DeletionImpactResult
                {
                    CanDelete = true,
                    BlockingReasons = new List<string>(),
                    BlockingDependencies = new List<BlockingDependency>(),
                    WillBeDeleted = new List<ImpactedEntity>(),
                    WillBeAffected = new List<ImpactedEntity>(),
                    Warnings = new List<string>()
                };

                // NCRs are generally standalone records
                // They reference JobOrder and Customer, but those are optional foreign keys
                // No child records depend on NCR, so deletion should be allowed

                // Add warning if NCR is linked to a job order
                if (ncr.JobOrderId.HasValue)
                {
                    result.Warnings.Add("This NCR is linked to a Job Order. The link will be removed upon deletion.");
                }

                // Add warning if NCR is linked to a customer
                if (ncr.CustomerId.HasValue)
                {
                    result.Warnings.Add("This NCR is linked to a Customer. The link will be removed upon deletion.");
                }

                return Ok(new { result = result });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message, stackTrace = ex.StackTrace });
            }
        }

        [HttpGet("GetNCRs")]
        public async Task<IActionResult> GetNCRs(
            [FromQuery] int tenantId,
            [FromQuery] string status = null,
            [FromQuery] string category = null,
            [FromQuery] string severity = null,
            [FromQuery] string source = null,
            [FromQuery] int? jobOrderId = null,
            [FromQuery] int? customerId = null,
            [FromQuery] string dateFrom = null,
            [FromQuery] string dateTo = null,
            [FromQuery] bool overdueOnly = false,
            [FromQuery] bool openOnly = false)
        {
            try
            {
                Console.WriteLine($"GetNCRs called with tenantId: {tenantId}, status={status}, category={category}, severity={severity}, source={source}, jobOrderId={jobOrderId}, customerId={customerId}, dateFrom={dateFrom}, dateTo={dateTo}, overdueOnly={overdueOnly}, openOnly={openOnly}");

                await EnsureNcrExternalColumnsAsync();

                var sql = @"
                    SELECT
                        NcrId,
                        ISNULL(NcrNumber, 'NCR-' + CAST(NcrId AS VARCHAR(10))) as NcrNumber,
                        ISNULL(Title, 'Untitled NCR') as Title,
                        ISNULL(Description, '') as Description,
                        ISNULL(Category, 'Other') as Category,
                        ISNULL(Severity, 'Minor') as Severity,
                        ISNULL(Status, 'Open') as Status,
                        ISNULL(Source, 'Internal') as Source,
                        JobOrderId,
                        ISNULL(JobOrderNumber, '') as JobOrderNumber,
                        ISNULL(PartNo, '') as PartNo,
                        ISNULL(PartName, '') as PartName,
                        CustomerId,
                        ISNULL(CustomerName, '') as CustomerName,
                        VendorId,
                        ISNULL(VendorName, '') as VendorName,
                        VendorOrderId,
                        ISNULL(PoNumber, '') as PoNumber,
                        NcrCodeId,
                        ISNULL(NcrCode, '') as NcrCode,
                        ReportedBy,
                        ISNULL(ReportedByName, 'Unknown User') as ReportedByName,
                        Photos,
                        ReportedDate,
                        DueDate,
                        CreatedDate
                    FROM CimmpleFlow.NonConformanceReports
                    WHERE TenantId = @tenantId";

                var parameters = new List<(string Name, object Value)>
                {
                    ("@tenantId", tenantId)
                };

                if (openOnly)
                {
                    sql += " AND Status IN ('Open', 'Under_Investigation')";
                }
                else if (!string.IsNullOrWhiteSpace(status) &&
                         !string.Equals(status, "all", StringComparison.OrdinalIgnoreCase))
                {
                    sql += " AND Status = @status";
                    parameters.Add(("@status", status.Trim()));
                }

                if (!string.IsNullOrWhiteSpace(category) &&
                    !string.Equals(category, "all", StringComparison.OrdinalIgnoreCase))
                {
                    sql += " AND Category = @category";
                    parameters.Add(("@category", category.Trim()));
                }

                if (!string.IsNullOrWhiteSpace(severity) &&
                    !string.Equals(severity, "all", StringComparison.OrdinalIgnoreCase))
                {
                    sql += " AND Severity = @severity";
                    parameters.Add(("@severity", severity.Trim()));
                }

                if (!string.IsNullOrWhiteSpace(source) &&
                    !string.Equals(source, "all", StringComparison.OrdinalIgnoreCase))
                {
                    sql += " AND Source = @source";
                    parameters.Add(("@source", source.Trim()));
                }

                if (jobOrderId.HasValue && jobOrderId.Value > 0)
                {
                    sql += " AND JobOrderId = @jobOrderId";
                    parameters.Add(("@jobOrderId", jobOrderId.Value));
                }

                if (customerId.HasValue && customerId.Value > 0)
                {
                    sql += " AND CustomerId = @customerId";
                    parameters.Add(("@customerId", customerId.Value));
                }

                if (DateTime.TryParse(dateFrom, out var parsedFrom))
                {
                    sql += " AND ReportedDate >= @dateFrom";
                    parameters.Add(("@dateFrom", parsedFrom.Date));
                }

                if (DateTime.TryParse(dateTo, out var parsedTo))
                {
                    // Inclusive end-of-day for date-only strings
                    var exclusiveEnd = parsedTo.Date.AddDays(1);
                    sql += " AND ReportedDate < @dateTo";
                    parameters.Add(("@dateTo", exclusiveEnd));
                }

                if (overdueOnly)
                {
                    sql += " AND DueDate IS NOT NULL AND DueDate < GETUTCDATE() AND Status <> 'Closed'";
                }

                sql += " ORDER BY ReportedDate DESC";

                var rawResults = new List<object>();

                await _context.Database.OpenConnectionAsync();
                try
                {
                    using (var command = _context.Database.GetDbConnection().CreateCommand())
                    {
                        command.CommandText = sql;
                        foreach (var (name, value) in parameters)
                        {
                            var param = command.CreateParameter();
                            param.ParameterName = name;
                            param.Value = value ?? DBNull.Value;
                            command.Parameters.Add(param);
                        }

                        using (var reader = await command.ExecuteReaderAsync())
                        {
                            while (await reader.ReadAsync())
                            {
                                var ncrId = reader.GetInt32(reader.GetOrdinal("NcrId"));
                                rawResults.Add(new
                                {
                                    ncrId,
                                    ncrNumber = reader.IsDBNull(reader.GetOrdinal("NcrNumber"))
                                        ? $"NCR-{ncrId}"
                                        : reader.GetString(reader.GetOrdinal("NcrNumber")),
                                    title = reader.IsDBNull(reader.GetOrdinal("Title"))
                                        ? "Untitled NCR"
                                        : reader.GetString(reader.GetOrdinal("Title")),
                                    description = reader.IsDBNull(reader.GetOrdinal("Description"))
                                        ? ""
                                        : reader.GetString(reader.GetOrdinal("Description")),
                                    category = reader.IsDBNull(reader.GetOrdinal("Category"))
                                        ? "Other"
                                        : reader.GetString(reader.GetOrdinal("Category")),
                                    severity = reader.IsDBNull(reader.GetOrdinal("Severity"))
                                        ? "Minor"
                                        : reader.GetString(reader.GetOrdinal("Severity")),
                                    status = reader.IsDBNull(reader.GetOrdinal("Status"))
                                        ? "Open"
                                        : reader.GetString(reader.GetOrdinal("Status")),
                                    source = reader.IsDBNull(reader.GetOrdinal("Source"))
                                        ? "Internal"
                                        : reader.GetString(reader.GetOrdinal("Source")),
                                    jobOrderId = reader.IsDBNull(reader.GetOrdinal("JobOrderId"))
                                        ? (int?)null
                                        : reader.GetInt32(reader.GetOrdinal("JobOrderId")),
                                    jobOrderNumber = reader.IsDBNull(reader.GetOrdinal("JobOrderNumber"))
                                        ? ""
                                        : reader.GetString(reader.GetOrdinal("JobOrderNumber")),
                                    partNo = reader.IsDBNull(reader.GetOrdinal("PartNo"))
                                        ? ""
                                        : reader.GetString(reader.GetOrdinal("PartNo")),
                                    partName = reader.IsDBNull(reader.GetOrdinal("PartName"))
                                        ? ""
                                        : reader.GetString(reader.GetOrdinal("PartName")),
                                    customerId = reader.IsDBNull(reader.GetOrdinal("CustomerId"))
                                        ? (int?)null
                                        : reader.GetInt32(reader.GetOrdinal("CustomerId")),
                                    customerName = reader.IsDBNull(reader.GetOrdinal("CustomerName"))
                                        ? ""
                                        : reader.GetString(reader.GetOrdinal("CustomerName")),
                                    vendorId = reader.IsDBNull(reader.GetOrdinal("VendorId"))
                                        ? (int?)null
                                        : reader.GetInt32(reader.GetOrdinal("VendorId")),
                                    vendorName = reader.IsDBNull(reader.GetOrdinal("VendorName"))
                                        ? ""
                                        : reader.GetString(reader.GetOrdinal("VendorName")),
                                    vendorOrderId = reader.IsDBNull(reader.GetOrdinal("VendorOrderId"))
                                        ? (int?)null
                                        : reader.GetInt32(reader.GetOrdinal("VendorOrderId")),
                                    poNumber = reader.IsDBNull(reader.GetOrdinal("PoNumber"))
                                        ? ""
                                        : reader.GetString(reader.GetOrdinal("PoNumber")),
                                    ncrCodeId = reader.IsDBNull(reader.GetOrdinal("NcrCodeId"))
                                        ? (int?)null
                                        : reader.GetInt32(reader.GetOrdinal("NcrCodeId")),
                                    ncrCode = reader.IsDBNull(reader.GetOrdinal("NcrCode"))
                                        ? ""
                                        : reader.GetString(reader.GetOrdinal("NcrCode")),
                                    reportedBy = reader.IsDBNull(reader.GetOrdinal("ReportedBy"))
                                        ? 0
                                        : reader.GetInt32(reader.GetOrdinal("ReportedBy")),
                                    reportedByName = reader.IsDBNull(reader.GetOrdinal("ReportedByName"))
                                        ? "Unknown User"
                                        : reader.GetString(reader.GetOrdinal("ReportedByName")),
                                    photos = reader.IsDBNull(reader.GetOrdinal("Photos"))
                                        ? ""
                                        : reader.GetString(reader.GetOrdinal("Photos")),
                                    reportedDate = reader.IsDBNull(reader.GetOrdinal("ReportedDate"))
                                        ? null
                                        : reader.GetDateTime(reader.GetOrdinal("ReportedDate")).ToString("yyyy-MM-ddTHH:mm:ssZ"),
                                    dueDate = reader.IsDBNull(reader.GetOrdinal("DueDate"))
                                        ? null
                                        : reader.GetDateTime(reader.GetOrdinal("DueDate")).ToString("yyyy-MM-ddTHH:mm:ssZ"),
                                    createdDate = reader.IsDBNull(reader.GetOrdinal("CreatedDate"))
                                        ? null
                                        : reader.GetDateTime(reader.GetOrdinal("CreatedDate")).ToString("yyyy-MM-ddTHH:mm:ssZ")
                                });
                            }
                        }
                    }
                }
                finally
                {
                    await _context.Database.CloseConnectionAsync();
                }

                Console.WriteLine($"Returning {rawResults.Count} NCR objects");
                return Ok(new { result = rawResults });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"GetNCRs failed: {ex.Message}");
                Console.WriteLine($"Stack trace: {ex.StackTrace}");
                return BadRequest(new { error = new { message = $"Failed to retrieve NCRs: {ex.Message}" } });
            }
        }

        // GET: api/Quality/GetNCR/5?tenantId=1
        [HttpGet("GetNCR/{id}")]
        public async Task<IActionResult> GetNCR(int id, [FromQuery] int tenantId = 0)
        {
            try
            {
                Console.WriteLine($"GetNCR called with id: {id}, tenantId: {tenantId}");
                await EnsureNcrExternalColumnsAsync();

                // Use raw ADO.NET to completely bypass EF issues
                Console.WriteLine("Starting ADO.NET query...");
                dynamic rawResults = null;

                try
                {
                    using (var command = _context.Database.GetDbConnection().CreateCommand())
                    {
                        command.CommandText = @"
                            SELECT TOP 1
                                NcrId,
                                ISNULL(NcrNumber, 'NCR-' + CAST(NcrId AS VARCHAR(10))) as NcrNumber,
                                ISNULL(Title, 'Untitled NCR') as Title,
                                ISNULL(Description, '') as Description,
                                ISNULL(Category, 'Other') as Category,
                                ISNULL(Severity, 'Minor') as Severity,
                                ISNULL(Status, 'Open') as Status,
                                ISNULL(Source, 'Internal') as Source,
                                JobOrderId,
                                JobOrderNumber,
                                RoutingStepId,
                                ISNULL(PartNo, '') as PartNo,
                                ISNULL(PartName, '') as PartName,
                                CustomerId,
                                CustomerName,
                                VendorId,
                                ISNULL(VendorName, '') as VendorName,
                                VendorOrderId,
                                ISNULL(PoNumber, '') as PoNumber,
                                NcrCodeId,
                                ISNULL(NcrCode, '') as NcrCode,
                                ISNULL(DefectLocation, '') as DefectLocation,
                                ISNULL(DefectQuantity, 0) as DefectQuantity,
                                ISNULL(TotalQuantity, 0) as TotalQuantity,
                                ISNULL(DefectDescription, '') as DefectDescription,
                                ISNULL(Photos, '') as Photos,
                                ISNULL(RootCause, '') as RootCause,
                                ISNULL(RootCauseCategory, '') as RootCauseCategory,
                                ISNULL(ImmediateAction, '') as ImmediateAction,
                                ISNULL(CorrectiveAction, '') as CorrectiveAction,
                                ISNULL(PreventiveAction, '') as PreventiveAction,
                                ReportedBy,
                                ISNULL(ReportedByName, 'Unknown User') as ReportedByName,
                                ReportedDate,
                                InvestigatedBy,
                                InvestigatedByName,
                                InvestigatedDate,
                                ApprovedBy,
                                ApprovedByName,
                                ApprovedDate,
                                DueDate,
                                ClosedDate,
                                CostImpact,
                                ISNULL(Notes, '') as Notes,
                                TenantId
                            FROM CimmpleFlow.NonConformanceReports
                            WHERE NcrId = @id";

                        if (tenantId > 0)
                        {
                            command.CommandText += " AND TenantId = @tenantId";
                        }

                        var idParam = command.CreateParameter();
                        idParam.ParameterName = "@id";
                        idParam.Value = id;
                        command.Parameters.Add(idParam);

                        if (tenantId > 0)
                        {
                            var tenantParam = command.CreateParameter();
                            tenantParam.ParameterName = "@tenantId";
                            tenantParam.Value = tenantId;
                            command.Parameters.Add(tenantParam);
                        }

                        Console.WriteLine($"Executing query for NCR ID: {id}");
                        await _context.Database.OpenConnectionAsync();

                        using (var reader = await command.ExecuteReaderAsync())
                        {
                            Console.WriteLine("Reader created, checking for data...");
                            if (!await reader.ReadAsync())
                {
                    Console.WriteLine($"NCR with ID {id} not found in database");
                    return NotFound(new { error = new { message = $"NCR with ID {id} not found" } });
                }

                            Console.WriteLine("Reading basic data...");
                            // Read data safely
                            rawResults = new {
                                ncrId = reader.GetInt32(reader.GetOrdinal("NcrId")),
                                ncrNumber = reader.IsDBNull(reader.GetOrdinal("NcrNumber")) ? $"NCR-{id}" : reader.GetString(reader.GetOrdinal("NcrNumber")),
                                title = reader.IsDBNull(reader.GetOrdinal("Title")) ? "Untitled NCR" : reader.GetString(reader.GetOrdinal("Title")),
                                description = reader.IsDBNull(reader.GetOrdinal("Description")) ? "" : reader.GetString(reader.GetOrdinal("Description")),
                                category = reader.IsDBNull(reader.GetOrdinal("Category")) ? "Other" : reader.GetString(reader.GetOrdinal("Category")),
                                severity = reader.IsDBNull(reader.GetOrdinal("Severity")) ? "Minor" : reader.GetString(reader.GetOrdinal("Severity")),
                                status = reader.IsDBNull(reader.GetOrdinal("Status")) ? "Open" : reader.GetString(reader.GetOrdinal("Status")),
                                source = reader.IsDBNull(reader.GetOrdinal("Source")) ? "Internal" : reader.GetString(reader.GetOrdinal("Source")),
                                jobOrderId = reader.IsDBNull(reader.GetOrdinal("JobOrderId")) ? 0 : reader.GetInt32(reader.GetOrdinal("JobOrderId")),
                                jobOrderNumber = reader.IsDBNull(reader.GetOrdinal("JobOrderNumber")) ? "" : reader.GetString(reader.GetOrdinal("JobOrderNumber")),
                                routingStepId = reader.IsDBNull(reader.GetOrdinal("RoutingStepId")) ? 0 : reader.GetInt32(reader.GetOrdinal("RoutingStepId")),
                                partNo = reader.IsDBNull(reader.GetOrdinal("PartNo")) ? "" : reader.GetString(reader.GetOrdinal("PartNo")),
                                partName = reader.IsDBNull(reader.GetOrdinal("PartName")) ? "" : reader.GetString(reader.GetOrdinal("PartName")),
                                customerId = reader.IsDBNull(reader.GetOrdinal("CustomerId")) ? 0 : reader.GetInt32(reader.GetOrdinal("CustomerId")),
                                customerName = reader.IsDBNull(reader.GetOrdinal("CustomerName")) ? "" : reader.GetString(reader.GetOrdinal("CustomerName")),
                                vendorId = reader.IsDBNull(reader.GetOrdinal("VendorId")) ? 0 : reader.GetInt32(reader.GetOrdinal("VendorId")),
                                vendorName = reader.IsDBNull(reader.GetOrdinal("VendorName")) ? "" : reader.GetString(reader.GetOrdinal("VendorName")),
                                vendorOrderId = reader.IsDBNull(reader.GetOrdinal("VendorOrderId")) ? 0 : reader.GetInt32(reader.GetOrdinal("VendorOrderId")),
                                poNumber = reader.IsDBNull(reader.GetOrdinal("PoNumber")) ? "" : reader.GetString(reader.GetOrdinal("PoNumber")),
                                ncrCodeId = reader.IsDBNull(reader.GetOrdinal("NcrCodeId")) ? 0 : reader.GetInt32(reader.GetOrdinal("NcrCodeId")),
                                ncrCode = reader.IsDBNull(reader.GetOrdinal("NcrCode")) ? "" : reader.GetString(reader.GetOrdinal("NcrCode")),
                                defectLocation = reader.IsDBNull(reader.GetOrdinal("DefectLocation")) ? "" : reader.GetString(reader.GetOrdinal("DefectLocation")),
                                defectQuantity = reader.IsDBNull(reader.GetOrdinal("DefectQuantity")) ? 0 : reader.GetInt32(reader.GetOrdinal("DefectQuantity")),
                                totalQuantity = reader.IsDBNull(reader.GetOrdinal("TotalQuantity")) ? 0 : reader.GetInt32(reader.GetOrdinal("TotalQuantity")),
                                defectDescription = reader.IsDBNull(reader.GetOrdinal("DefectDescription")) ? "" : reader.GetString(reader.GetOrdinal("DefectDescription")),
                                photos = reader.IsDBNull(reader.GetOrdinal("Photos")) ? "" : reader.GetString(reader.GetOrdinal("Photos")),
                                rootCause = reader.IsDBNull(reader.GetOrdinal("RootCause")) ? "" : reader.GetString(reader.GetOrdinal("RootCause")),
                                rootCauseCategory = reader.IsDBNull(reader.GetOrdinal("RootCauseCategory")) ? "" : reader.GetString(reader.GetOrdinal("RootCauseCategory")),
                                immediateAction = reader.IsDBNull(reader.GetOrdinal("ImmediateAction")) ? "" : reader.GetString(reader.GetOrdinal("ImmediateAction")),
                                correctiveAction = reader.IsDBNull(reader.GetOrdinal("CorrectiveAction")) ? "" : reader.GetString(reader.GetOrdinal("CorrectiveAction")),
                                preventiveAction = reader.IsDBNull(reader.GetOrdinal("PreventiveAction")) ? "" : reader.GetString(reader.GetOrdinal("PreventiveAction")),
                                reportedBy = reader.IsDBNull(reader.GetOrdinal("ReportedBy")) ? 0 : reader.GetInt32(reader.GetOrdinal("ReportedBy")),
                                reportedByName = reader.IsDBNull(reader.GetOrdinal("ReportedByName")) ? "Unknown User" : reader.GetString(reader.GetOrdinal("ReportedByName")),
                                reportedDate = reader.IsDBNull(reader.GetOrdinal("ReportedDate")) ? DateTime.Now.ToString("yyyy-MM-ddTHH:mm:ssZ") : reader.GetDateTime(reader.GetOrdinal("ReportedDate")).ToString("yyyy-MM-ddTHH:mm:ssZ"),
                                investigatedBy = reader.IsDBNull(reader.GetOrdinal("InvestigatedBy")) ? (int?)null : reader.GetInt32(reader.GetOrdinal("InvestigatedBy")),
                                investigatedByName = reader.IsDBNull(reader.GetOrdinal("InvestigatedByName")) ? "" : reader.GetString(reader.GetOrdinal("InvestigatedByName")),
                                investigatedDate = reader.IsDBNull(reader.GetOrdinal("InvestigatedDate")) ? null : (DateTime?)reader.GetDateTime(reader.GetOrdinal("InvestigatedDate")),
                                approvedBy = reader.IsDBNull(reader.GetOrdinal("ApprovedBy")) ? (int?)null : reader.GetInt32(reader.GetOrdinal("ApprovedBy")),
                                approvedByName = reader.IsDBNull(reader.GetOrdinal("ApprovedByName")) ? "" : reader.GetString(reader.GetOrdinal("ApprovedByName")),
                                approvedDate = reader.IsDBNull(reader.GetOrdinal("ApprovedDate")) ? null : (DateTime?)reader.GetDateTime(reader.GetOrdinal("ApprovedDate")),
                                dueDate = reader.IsDBNull(reader.GetOrdinal("DueDate")) ? null : (DateTime?)reader.GetDateTime(reader.GetOrdinal("DueDate")),
                                closedDate = reader.IsDBNull(reader.GetOrdinal("ClosedDate")) ? null : (DateTime?)reader.GetDateTime(reader.GetOrdinal("ClosedDate")),
                                costImpact = reader.IsDBNull(reader.GetOrdinal("CostImpact")) ? (decimal?)null : reader.GetDecimal(reader.GetOrdinal("CostImpact")),
                                notes = reader.IsDBNull(reader.GetOrdinal("Notes")) ? "" : reader.GetString(reader.GetOrdinal("Notes")),
                                tenantId = reader.IsDBNull(reader.GetOrdinal("TenantId")) ? 0 : reader.GetInt32(reader.GetOrdinal("TenantId"))
                            };

                            Console.WriteLine($"Successfully read NCR: ID={rawResults.ncrId}, Title='{rawResults.title}'");
                        }
                    }
                }
                catch (Exception adoEx)
                {
                    Console.WriteLine($"ADO.NET error: {adoEx.Message}");
                    Console.WriteLine($"Stack trace: {adoEx.StackTrace}");
                    throw;
                }

                Console.WriteLine($"Raw ADO.NET query succeeded for NCR ID: {rawResults.ncrId}");

                // Format dates for JSON response
                var result = new {
                    ncrId = rawResults.ncrId,
                    ncrNumber = rawResults.ncrNumber,
                    title = rawResults.title,
                    description = rawResults.description,
                    category = rawResults.category,
                    severity = rawResults.severity,
                    status = rawResults.status,
                    source = rawResults.source,
                    jobOrderId = rawResults.jobOrderId,
                    jobOrderNumber = rawResults.jobOrderNumber,
                    routingStepId = rawResults.routingStepId,
                    partNo = rawResults.partNo,
                    partName = rawResults.partName,
                    customerId = rawResults.customerId,
                    customerName = rawResults.customerName,
                    vendorId = rawResults.vendorId,
                    vendorName = rawResults.vendorName,
                    vendorOrderId = rawResults.vendorOrderId,
                    poNumber = rawResults.poNumber,
                    ncrCodeId = rawResults.ncrCodeId,
                    ncrCode = rawResults.ncrCode,
                    defectLocation = rawResults.defectLocation,
                    defectQuantity = rawResults.defectQuantity,
                    totalQuantity = rawResults.totalQuantity,
                    defectDescription = rawResults.defectDescription,
                    photos = rawResults.photos,
                    rootCause = rawResults.rootCause,
                    rootCauseCategory = rawResults.rootCauseCategory,
                    immediateAction = rawResults.immediateAction,
                    correctiveAction = rawResults.correctiveAction,
                    preventiveAction = rawResults.preventiveAction,
                    reportedBy = rawResults.reportedBy,
                    reportedByName = rawResults.reportedByName,
                    reportedDate = rawResults.reportedDate,
                    investigatedBy = rawResults.investigatedBy,
                    investigatedByName = rawResults.investigatedByName,
                    investigatedDate = rawResults.investigatedDate?.ToString("yyyy-MM-ddTHH:mm:ssZ"),
                    approvedBy = rawResults.approvedBy,
                    approvedByName = rawResults.approvedByName,
                    approvedDate = rawResults.approvedDate?.ToString("yyyy-MM-ddTHH:mm:ssZ"),
                    dueDate = rawResults.dueDate?.ToString("yyyy-MM-ddTHH:mm:ssZ"),
                    closedDate = rawResults.closedDate?.ToString("yyyy-MM-ddTHH:mm:ssZ"),
                    costImpact = rawResults.costImpact,
                    notes = rawResults.notes,
                    tenantId = rawResults.tenantId
                };

                return Ok(new { result });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"GetNCR failed for id {id}: {ex.Message}");
                Console.WriteLine($"Stack trace: {ex.StackTrace}");
                return BadRequest(new { error = new { message = ex.Message } });
            }
        }

        // POST: api/Quality/CreateNCR
        [HttpPost("CreateNCR")]
        public async Task<IActionResult> CreateNCR()
        {
            Console.WriteLine("=== CREATENCR CALLED ===");
            Console.WriteLine("CreateNCR endpoint called");
            await EnsureNcrExternalColumnsAsync();

            // Read the raw request body for debugging
            string rawContent;
            using (var reader = new StreamReader(Request.Body))
            {
                rawContent = await reader.ReadToEndAsync();
            }
            Console.WriteLine($"Raw request body: {rawContent}");

            try
            {
                // Validate input
                if (string.IsNullOrWhiteSpace(rawContent) || rawContent == "{}")
                {
                    Console.WriteLine("Empty request body");
                    return BadRequest(new { error = new { message = "NCR data is required" } });
                }

                // Now deserialize manually for debugging
                var ncr = System.Text.Json.JsonSerializer.Deserialize<NonConformanceReport>(rawContent, new System.Text.Json.JsonSerializerOptions
                {
                    PropertyNameCaseInsensitive = true,
                    PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase
                });

                if (ncr == null)
                {
                    Console.WriteLine("NCR object is null after deserialization");
                    return BadRequest(new { error = new { message = "Invalid NCR data format" } });
                }

                Console.WriteLine($"Deserialized NCR - Title: '{ncr.Title}', TenantId: {ncr.TenantId}, ReportedBy: {ncr.ReportedBy}");
                Console.WriteLine($"NcrNumber from request: '{ncr.NcrNumber}'");
                Console.WriteLine($"Photos field: '{ncr.Photos}'");
                Console.WriteLine($"Date fields - DueDate: {ncr.DueDate}, InvestigatedDate: {ncr.InvestigatedDate}, ApprovedDate: {ncr.ApprovedDate}, ClosedDate: {ncr.ClosedDate}");
                Console.WriteLine($"Int fields - DefectQuantity: {ncr.DefectQuantity}, TotalQuantity: {ncr.TotalQuantity}, JobOrderId: {ncr.JobOrderId}");

                // Validate required fields
                if (string.IsNullOrEmpty(ncr.Title))
                {
                    return BadRequest(new { error = new { message = "Title is required" } });
                }

                if (ncr.TenantId <= 0)
                {
                    return BadRequest(new { error = new { message = "Invalid tenant ID" } });
                }

                // Debug: Log all relevant headers
                var userIdHeader = Request.Headers["userId"].FirstOrDefault();
                var usernameHeader = Request.Headers["Username"].FirstOrDefault();
                var tenantIdHeader = Request.Headers["tenantId"].FirstOrDefault();
                Console.WriteLine($"Headers - userId: '{userIdHeader}', Username: '{usernameHeader}', tenantId: '{tenantIdHeader}'");

                // Auto-populate ReportedBy with current logged-in user if not provided
                if (ncr.ReportedBy <= 0)
                {
                    int? currentUserId = GetUserId();
                    Console.WriteLine($"GetUserId() returned: {currentUserId}");

                    if (currentUserId.HasValue && currentUserId.Value > 0)
                    {
                        ncr.ReportedBy = currentUserId.Value;
                        Console.WriteLine($"ReportedBy not provided, auto-setting to current user: {currentUserId.Value}");
                    }
                    else
                    {
                        Console.WriteLine("ReportedBy not provided and no current user found, defaulting to admin user (ID: 1)");
                        ncr.ReportedBy = 1; // Fallback to admin user
                    }
                }
                else
                {
                    Console.WriteLine($"ReportedBy provided in request: {ncr.ReportedBy}");
                }

                // Ensure all required string fields have values
                ncr.Title = ncr.Title?.Trim() ?? "Untitled NCR";
                ncr.Category = ncr.Category ?? "Other";
                ncr.Severity = ncr.Severity ?? "Minor";
                ncr.Status = ncr.Status ?? "Open";
                ncr.Source = ncr.Source ?? "Internal";

                // Initialize nullable string fields
                ncr.Description = ncr.Description ?? "";
                ncr.DefectLocation = ncr.DefectLocation ?? "";
                ncr.PartNo = ncr.PartNo ?? "";
                ncr.PartName = ncr.PartName ?? "";
                ncr.RootCause = ncr.RootCause ?? "";
                ncr.ImmediateAction = ncr.ImmediateAction ?? "";
                ncr.CorrectiveAction = ncr.CorrectiveAction ?? "";
                ncr.PreventiveAction = ncr.PreventiveAction ?? "";
                ncr.Notes = ncr.Notes ?? "";
                ncr.JobOrderNumber = ncr.JobOrderNumber ?? "";
                ncr.CustomerName = ncr.CustomerName ?? "";
                ncr.VendorName = ncr.VendorName ?? "";
                ncr.PoNumber = ncr.PoNumber ?? "";
                ncr.VendorId = ncr.VendorId.GetValueOrDefault() > 0 ? ncr.VendorId : 0;
                ncr.VendorOrderId = ncr.VendorOrderId.GetValueOrDefault() > 0 ? ncr.VendorOrderId : 0;
                ncr.DefectDescription = ncr.DefectDescription ?? "";
                ncr.RootCauseCategory = ncr.RootCauseCategory ?? "Other";
                ncr.ReportedByName = ncr.ReportedByName ?? "";
                ncr.InvestigatedByName = ncr.InvestigatedByName ?? "";
                ncr.ApprovedByName = ncr.ApprovedByName ?? "";

                // Initialize nullable int fields (columns are required ints; 0 = unset)
                ncr.JobOrderId = ncr.JobOrderId.GetValueOrDefault() > 0 ? ncr.JobOrderId : 0;
                ncr.RoutingStepId = ncr.RoutingStepId.GetValueOrDefault() > 0 ? ncr.RoutingStepId : 0;
                ncr.CustomerId = ncr.CustomerId.GetValueOrDefault() > 0 ? ncr.CustomerId : 0;
                ncr.DefectQuantity = ncr.DefectQuantity > 0 ? ncr.DefectQuantity : 0;
                ncr.TotalQuantity = ncr.TotalQuantity > 0 ? ncr.TotalQuantity : 0;

                // Do not persist base64 data URLs in nvarchar(4000) — upload after create
                if (string.IsNullOrWhiteSpace(ncr.Photos) ||
                    ncr.Photos.IndexOf("data:", StringComparison.OrdinalIgnoreCase) >= 0 ||
                    ncr.Photos.Length > 3500)
                {
                    ncr.Photos = null;
                }

                Console.WriteLine($"Creating NCR with title: {ncr.Title}, tenantId: {ncr.TenantId}");

                // Auto-generate NCR number starting from NCR#1000, scoped to tenant
                Console.WriteLine("=== STARTING NCR NUMBER GENERATION ===");
                var ncrNumbers = await _context.NonConformanceReports
                    .Where(n => n.TenantId == ncr.TenantId && n.NcrNumber != null && n.NcrNumber.StartsWith("NCR#"))
                    .Select(n => n.NcrNumber)
                    .ToListAsync();

                Console.WriteLine($"Found {ncrNumbers.Count} existing NCR numbers:");
                foreach (var num in ncrNumbers)
                {
                    Console.WriteLine($"  {num}");
                }

                // Extract and find the highest number
                int maxNumber = 999; // Start from 999, so first NCR will be 1000
                foreach (var ncrNum in ncrNumbers)
                {
                    if (ncrNum.Length > 4) // NCR# + at least one digit
                    {
                        var numberPart = ncrNum.Substring(4); // Remove "NCR#"
                        if (int.TryParse(numberPart, out var num))
                        {
                            Console.WriteLine($"  Parsed {ncrNum} -> {num}");
                            if (num > maxNumber)
                            {
                                maxNumber = num;
                                Console.WriteLine($"  New max: {maxNumber}");
                            }
                        }
                        else
                        {
                            Console.WriteLine($"  Failed to parse number from: {numberPart}");
                        }
                    }
                    else
                    {
                        Console.WriteLine($"  NCR number too short: {ncrNum}");
                    }
                }

                int nextNumber = maxNumber + 1;
                Console.WriteLine($"Max existing number: {maxNumber}, Next number: {nextNumber}");
                Console.WriteLine($"Assigning NCR number: NCR#{nextNumber}");

                ncr.NcrNumber = $"NCR#{nextNumber}";
                Console.WriteLine($"Assigned NCR number: {ncr.NcrNumber}");
                ncr.ReportedDate = DateTime.Now;
                ncr.Status = ncr.Status ?? "Open";
                ncr.Category = ncr.Category ?? "Other";
                ncr.Severity = ncr.Severity ?? "Minor";
                ncr.Source = ncr.Source ?? "Internal";

                // Set audit fields
                ncr.CreatedBy = ncr.ReportedBy; // Use the reporter as creator
                ncr.CreatedDate = DateTime.Now;

                // Populate ReportedByName by looking up the user
                try
                {
                    Console.WriteLine($"Looking up user with ID: {ncr.ReportedBy}");
                    var user = await _context.UserDetails
                        .Where(u => u.User_UniqueID == ncr.ReportedBy)
                        .FirstOrDefaultAsync();

                    Console.WriteLine($"User lookup result: {(user != null ? "Found" : "Not found")}");
                    if (user != null)
                    {
                        Console.WriteLine($"User details - FirstName: '{user.FirstName}', LastName: '{user.LastName}', UserName: '{user.UserName}'");
                    }

                    if (user != null && !string.IsNullOrEmpty(user.FirstName) && !string.IsNullOrEmpty(user.LastName))
                    {
                        ncr.ReportedByName = $"{user.FirstName} {user.LastName}".Trim();
                        Console.WriteLine($"Set ReportedByName to: {ncr.ReportedByName}");
                    }
                    else
                    {
                        ncr.ReportedByName = "Unknown User";
                        Console.WriteLine("User not found or name missing, set ReportedByName to 'Unknown User'");
                    }
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"Error looking up user name: {ex.Message}");
                    ncr.ReportedByName = "Unknown User";
                }

                // Debug: Log all field values before save
                Console.WriteLine("=== NCR FIELD VALUES BEFORE SAVE ===");
                Console.WriteLine($"NcrId: {ncr.NcrId}");
                Console.WriteLine($"NcrNumber: '{ncr.NcrNumber}'");
                Console.WriteLine($"Title: '{ncr.Title}'");
                Console.WriteLine($"Description: '{ncr.Description}'");
                Console.WriteLine($"Category: '{ncr.Category}'");
                Console.WriteLine($"Severity: '{ncr.Severity}'");
                Console.WriteLine($"Status: '{ncr.Status}'");
                Console.WriteLine($"Source: '{ncr.Source}'");
                Console.WriteLine($"ReportedBy: {ncr.ReportedBy}");
                Console.WriteLine($"ReportedDate: {ncr.ReportedDate}");
                Console.WriteLine($"TenantId: {ncr.TenantId}");
                Console.WriteLine($"CreatedBy: {ncr.CreatedBy}");
                Console.WriteLine($"CreatedDate: {ncr.CreatedDate}");
                Console.WriteLine("====================================");

                Console.WriteLine("Adding NCR to context...");
                await ResolveNcrCodeFieldsAsync(ncr);
                _context.NonConformanceReports.Add(ncr);

                Console.WriteLine("Saving changes to database...");
                try
                {
                    await _context.SaveChangesAsync();
                    Console.WriteLine("Database save successful!");
                    Console.WriteLine($"After SaveChanges - NcrId: {ncr.NcrId}, NcrNumber: {ncr.NcrNumber}");

                    // Always update the NCR number to the correct sequential value after save
                    // This ensures it overrides any database-level default that might be applied
                    string correctNcrNumber = $"NCR#{nextNumber}";
                    Console.WriteLine($"Ensuring NCR number is set to correct sequential value: {correctNcrNumber}");

                    // Update the NCR number using raw SQL to ensure it persists
                    using (var updateCommand = _context.Database.GetDbConnection().CreateCommand())
                    {
                        updateCommand.CommandText = "UPDATE CimmpleFlow.NonConformanceReports SET NcrNumber = @NcrNumber WHERE NcrId = @NcrId";
                        AddParameter(updateCommand, "@NcrNumber", correctNcrNumber);
                        AddParameter(updateCommand, "@NcrId", ncr.NcrId);

                        await _context.Database.OpenConnectionAsync();
                        int rowsAffected = await updateCommand.ExecuteNonQueryAsync();

                        Console.WriteLine($"UPDATE executed: rows affected = {rowsAffected}");

                        // Verify the update worked by reading back from database
                        using (var verifyCommand = _context.Database.GetDbConnection().CreateCommand())
                        {
                            verifyCommand.CommandText = "SELECT NcrNumber FROM CimmpleFlow.NonConformanceReports WHERE NcrId = @NcrId";
                            AddParameter(verifyCommand, "@NcrId", ncr.NcrId);

                            var verifiedValue = await verifyCommand.ExecuteScalarAsync();
                            Console.WriteLine($"Verified database value after UPDATE: '{verifiedValue}'");
                        }

                        // Update the in-memory object to match
                        ncr.NcrNumber = correctNcrNumber;

                        Console.WriteLine($"NCR number updated in database: {correctNcrNumber}, in-memory object: {ncr.NcrNumber}");
                    }
                }
                catch (Exception saveEx)
                {
                    Console.WriteLine($"Database save failed: {saveEx.Message}");
                    Console.WriteLine($"Inner exception: {saveEx.InnerException?.Message}");
                    Console.WriteLine($"Stack trace: {saveEx.StackTrace}");
                    throw; // Re-throw to be caught by outer catch
                }

                Console.WriteLine($"NCR created successfully with ID: {ncr.NcrId}, Number: {ncr.NcrNumber}, TenantId: {ncr.TenantId}");

                Console.WriteLine($"Building response - ncr.NcrNumber: '{ncr.NcrNumber}', nextNumber: {nextNumber}");

                // Read the actual value from database to ensure we have the latest
                string actualNcrNumber;
                using (var checkCommand = _context.Database.GetDbConnection().CreateCommand())
                {
                    checkCommand.CommandText = "SELECT NcrNumber FROM CimmpleFlow.NonConformanceReports WHERE NcrId = @NcrId";
                    AddParameter(checkCommand, "@NcrId", ncr.NcrId);

                    await _context.Database.OpenConnectionAsync();
                    var scalarResult = await checkCommand.ExecuteScalarAsync();
                    actualNcrNumber = scalarResult?.ToString() ?? "NULL";
                    Console.WriteLine($"Actual NCR number in database: '{actualNcrNumber}'");
                }

                // Use the database value for the response
                string responseNcrNumber = $"NCR#{nextNumber}"; // What it should be
                string actualResponseNcrNumber = actualNcrNumber; // What's actually in DB

                Console.WriteLine($"Response NCR number - Expected: {responseNcrNumber}, Actual in DB: {actualResponseNcrNumber}");

                // Return with proper camelCase field names for frontend compatibility
                var result = new {
                    ncrId = ncr.NcrId,
                    ncrNumber = actualResponseNcrNumber,
                    title = ncr.Title,
                    description = ncr.Description,
                    category = ncr.Category,
                    severity = ncr.Severity,
                    status = ncr.Status,
                    source = ncr.Source,
                    jobOrderId = ncr.JobOrderId,
                    jobOrderNumber = ncr.JobOrderNumber,
                    routingStepId = ncr.RoutingStepId,
                    partNo = ncr.PartNo,
                    partName = ncr.PartName,
                    customerId = ncr.CustomerId,
                    customerName = ncr.CustomerName,
                    vendorId = ncr.VendorId,
                    vendorName = ncr.VendorName,
                    vendorOrderId = ncr.VendorOrderId,
                    poNumber = ncr.PoNumber,
                    defectLocation = ncr.DefectLocation,
                    defectQuantity = ncr.DefectQuantity,
                    totalQuantity = ncr.TotalQuantity,
                    defectDescription = ncr.DefectDescription,
                    photos = ncr.Photos,
                    rootCause = ncr.RootCause,
                    rootCauseCategory = ncr.RootCauseCategory,
                    immediateAction = ncr.ImmediateAction,
                    correctiveAction = ncr.CorrectiveAction,
                    preventiveAction = ncr.PreventiveAction,
                    reportedBy = ncr.ReportedBy,
                    reportedByName = ncr.ReportedByName,
                    reportedDate = ncr.ReportedDate.ToString("yyyy-MM-ddTHH:mm:ssZ"),
                    investigatedBy = ncr.InvestigatedBy,
                    investigatedByName = ncr.InvestigatedByName,
                    investigatedDate = ncr.InvestigatedDate?.ToString("yyyy-MM-ddTHH:mm:ssZ"),
                    approvedBy = ncr.ApprovedBy,
                    approvedByName = ncr.ApprovedByName,
                    approvedDate = ncr.ApprovedDate?.ToString("yyyy-MM-ddTHH:mm:ssZ"),
                    dueDate = ncr.DueDate?.ToString("yyyy-MM-ddTHH:mm:ssZ"),
                    closedDate = ncr.ClosedDate?.ToString("yyyy-MM-ddTHH:mm:ssZ"),
                    costImpact = ncr.CostImpact,
                    notes = ncr.Notes,
                    tenantId = ncr.TenantId
                };

                Console.WriteLine($"Returning NCR creation result with ncrId: {result.ncrId}, ncrNumber: {result.ncrNumber}");
                return Ok(new { result });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error creating NCR: {ex.Message}");
                Console.WriteLine($"Stack trace: {ex.StackTrace}");
                return BadRequest(new { error = new { message = ex.Message } });
            }
        }

        // PUT: api/Quality/UpdateNCR/5
        [HttpPut("UpdateNCR/{id}")]
        public async Task<IActionResult> UpdateNCR(int id, [FromBody] NonConformanceReport ncrUpdate)
        {
            try
            {
                // Use raw ADO.NET to update safely and avoid EF null reference issues
                Console.WriteLine($"=== UPDATENCR CALLED ===");
                await EnsureNcrExternalColumnsAsync();
                await ResolveNcrCodeFieldsAsync(ncrUpdate);
                Console.WriteLine($"UpdateNCR called for id: {id}");
                Console.WriteLine($"Update data - Title: '{ncrUpdate.Title}', Status: '{ncrUpdate.Status}'");

                using (var command = _context.Database.GetDbConnection().CreateCommand())
                {
                    command.CommandText = @"
                        UPDATE CimmpleFlow.NonConformanceReports SET
                            Title = @Title,
                            Description = @Description,
                            Category = @Category,
                            Severity = @Severity,
                            Status = @Status,
                            Source = @Source,
                            JobOrderId = @JobOrderId,
                            JobOrderNumber = @JobOrderNumber,
                            RoutingStepId = @RoutingStepId,
                            PartNo = @PartNo,
                            PartName = @PartName,
                            CustomerId = @CustomerId,
                            CustomerName = @CustomerName,
                            VendorId = @VendorId,
                            VendorName = @VendorName,
                            VendorOrderId = @VendorOrderId,
                            PoNumber = @PoNumber,
                            NcrCodeId = @NcrCodeId,
                            NcrCode = @NcrCode,
                            DefectLocation = @DefectLocation,
                            DefectQuantity = @DefectQuantity,
                            TotalQuantity = @TotalQuantity,
                            DefectDescription = @DefectDescription,
                            Photos = @Photos,
                            RootCause = @RootCause,
                            RootCauseCategory = @RootCauseCategory,
                            ImmediateAction = @ImmediateAction,
                            CorrectiveAction = @CorrectiveAction,
                            PreventiveAction = @PreventiveAction,
                            ReportedBy = @ReportedBy,
                            ReportedByName = @ReportedByName,
                            InvestigatedBy = @InvestigatedBy,
                            InvestigatedByName = @InvestigatedByName,
                            InvestigatedDate = @InvestigatedDate,
                            ApprovedBy = @ApprovedBy,
                            ApprovedByName = @ApprovedByName,
                            ApprovedDate = @ApprovedDate,
                            DueDate = @DueDate,
                            ClosedDate = @ClosedDate,
                            CostImpact = @CostImpact,
                            Notes = @Notes,
                            ModifiedDate = GETUTCDATE()
                        WHERE NcrId = @Id";

                    // Add parameters with null-safe values
                    AddParameter(command, "@Id", id);
                    AddParameter(command, "@Title", ncrUpdate.Title);
                    AddParameter(command, "@Description", ncrUpdate.Description);
                    AddParameter(command, "@Category", ncrUpdate.Category);
                    AddParameter(command, "@Severity", ncrUpdate.Severity);
                    AddParameter(command, "@Status", ncrUpdate.Status);
                    AddParameter(command, "@Source", ncrUpdate.Source);
                    AddParameter(command, "@JobOrderId", ncrUpdate.JobOrderId.GetValueOrDefault() > 0 ? ncrUpdate.JobOrderId : 0);
                    AddParameter(command, "@JobOrderNumber", ncrUpdate.JobOrderNumber ?? "");
                    AddParameter(command, "@RoutingStepId", ncrUpdate.RoutingStepId.GetValueOrDefault() > 0 ? ncrUpdate.RoutingStepId : 0);
                    AddParameter(command, "@PartNo", ncrUpdate.PartNo ?? "");
                    AddParameter(command, "@PartName", ncrUpdate.PartName ?? "");
                    AddParameter(command, "@CustomerId", ncrUpdate.CustomerId.GetValueOrDefault() > 0 ? ncrUpdate.CustomerId : 0);
                    AddParameter(command, "@CustomerName", ncrUpdate.CustomerName ?? "");
                    AddParameter(command, "@VendorId", ncrUpdate.VendorId.GetValueOrDefault() > 0 ? ncrUpdate.VendorId : 0);
                    AddParameter(command, "@VendorName", ncrUpdate.VendorName ?? "");
                    AddParameter(command, "@VendorOrderId", ncrUpdate.VendorOrderId.GetValueOrDefault() > 0 ? ncrUpdate.VendorOrderId : 0);
                    AddParameter(command, "@PoNumber", ncrUpdate.PoNumber ?? "");
                    AddParameter(command, "@NcrCodeId", ncrUpdate.NcrCodeId.GetValueOrDefault() > 0 ? ncrUpdate.NcrCodeId : 0);
                    AddParameter(command, "@NcrCode", ncrUpdate.NcrCode ?? "");
                    AddParameter(command, "@DefectLocation", ncrUpdate.DefectLocation);
                    AddParameter(command, "@DefectQuantity", ncrUpdate.DefectQuantity);
                    AddParameter(command, "@TotalQuantity", ncrUpdate.TotalQuantity);
                    AddParameter(command, "@DefectDescription", ncrUpdate.DefectDescription);
                    var photosToStore = ncrUpdate.Photos;
                    if (!string.IsNullOrWhiteSpace(photosToStore) &&
                        (photosToStore.IndexOf("data:", StringComparison.OrdinalIgnoreCase) >= 0 || photosToStore.Length > 3500))
                    {
                        photosToStore = null;
                    }
                    AddParameter(command, "@Photos", photosToStore);
                    AddParameter(command, "@RootCause", ncrUpdate.RootCause);
                    AddParameter(command, "@RootCauseCategory", ncrUpdate.RootCauseCategory);
                    AddParameter(command, "@ImmediateAction", ncrUpdate.ImmediateAction);
                    AddParameter(command, "@CorrectiveAction", ncrUpdate.CorrectiveAction);
                    AddParameter(command, "@PreventiveAction", ncrUpdate.PreventiveAction);
                    AddParameter(command, "@ReportedBy", ncrUpdate.ReportedBy);
                    AddParameter(command, "@ReportedByName", ncrUpdate.ReportedByName ?? "");
                    AddParameter(command, "@InvestigatedBy", ncrUpdate.InvestigatedBy);
                    AddParameter(command, "@InvestigatedByName", ncrUpdate.InvestigatedByName ?? "");
                    AddParameter(command, "@InvestigatedDate", ncrUpdate.InvestigatedDate);
                    AddParameter(command, "@ApprovedBy", ncrUpdate.ApprovedBy);
                    AddParameter(command, "@ApprovedByName", ncrUpdate.ApprovedByName ?? "");
                    AddParameter(command, "@ApprovedDate", ncrUpdate.ApprovedDate);
                    AddParameter(command, "@DueDate", ncrUpdate.DueDate);

                    // Handle closed date logic - set if status is Closed and not already set
                    DateTime? closedDate = ncrUpdate.ClosedDate;
                    if (ncrUpdate.Status == "Closed" && !closedDate.HasValue)
                    {
                        closedDate = DateTime.Now;
                    }
                    AddParameter(command, "@ClosedDate", closedDate);

                    AddParameter(command, "@CostImpact", ncrUpdate.CostImpact);
                    AddParameter(command, "@Notes", ncrUpdate.Notes);

                    Console.WriteLine("Executing UPDATE command...");
                    await _context.Database.OpenConnectionAsync();

                    int rowsAffected = await command.ExecuteNonQueryAsync();
                    Console.WriteLine($"Update completed, rows affected: {rowsAffected}");

                    if (rowsAffected == 0)
                    {
                        return NotFound(new { error = new { message = "NCR not found" } });
                    }

                    return Ok(new { success = true });
                }
            }
            catch (Exception ex)
            {
                return BadRequest(new { error = new { message = ex.Message } });
            }
        }

        private void AddParameter(System.Data.Common.DbCommand command, string name, object value)
        {
            var param = command.CreateParameter();
            param.ParameterName = name;
            param.Value = value ?? DBNull.Value;
            command.Parameters.Add(param);
        }

        // Debug endpoint to check NCR numbers in database
        [HttpGet("DebugNCRNumbers")]
        public async Task<IActionResult> DebugNCRNumbers([FromQuery] int tenantId = 1)
        {
            try
            {
                var ncrNumbers = await _context.NonConformanceReports
                    .Where(n => n.TenantId == tenantId)
                    .Select(n => new { n.NcrId, n.NcrNumber, n.Title })
                    .OrderByDescending(n => n.NcrId)
                    .Take(10)
                    .ToListAsync();

                return Ok(new { ncrs = ncrNumbers });
            }
            catch (Exception ex)
            {
                return BadRequest(new { error = ex.Message });
            }
        }

        // DELETE: api/Quality/DeleteNCR
        [HttpDelete("DeleteNCR")]
        public async Task<IActionResult> DeleteNCR([FromQuery] int ncrId, [FromQuery] int tenantId)
        {
            try
            {
                var ncrMeta = await _context.NonConformanceReports
                    .Where(n => n.NcrId == ncrId && (tenantId <= 0 || n.TenantId == tenantId))
                    .Select(n => new { n.NcrId, n.JobOrderId, n.TenantId })
                    .FirstOrDefaultAsync();
                
                if (ncrMeta == null)
                {
                    ncrMeta = await _context.NonConformanceReports
                        .Where(n => n.NcrId == ncrId)
                        .Select(n => new { n.NcrId, n.JobOrderId, n.TenantId })
                        .FirstOrDefaultAsync();
                }

                if (ncrMeta == null)
                {
                    return NotFound(new { error = "NCR not found" });
                }

                // Drop stale step NCR pointers so Job Details no longer shows the deleted NCR.
                try
                {
                    var jobOrdersToClean = new List<JobOrderMaster>();
                    if (ncrMeta.JobOrderId.HasValue && ncrMeta.JobOrderId.Value > 0)
                    {
                        var linked = await _context.JobOrderMaster
                            .FirstOrDefaultAsync(j =>
                                j.JobOrderID == ncrMeta.JobOrderId.Value &&
                                (tenantId <= 0 || j.Tenantid == tenantId));
                        if (linked != null)
                            jobOrdersToClean.Add(linked);
                    }

                    // Fallback: scan tenant job orders when JobOrderId was not stored on the NCR.
                    if (jobOrdersToClean.Count == 0)
                    {
                        var candidates = await _context.JobOrderMaster
                            .Where(j =>
                                (tenantId <= 0 || j.Tenantid == tenantId) &&
                                j.RoutingStepsJson != null &&
                                j.RoutingStepsJson.Contains(ncrId.ToString()))
                            .ToListAsync();
                        jobOrdersToClean.AddRange(candidates);
                    }

                    foreach (var jobOrder in jobOrdersToClean)
                    {
                        if (string.IsNullOrWhiteSpace(jobOrder.RoutingStepsJson))
                            continue;

                        try
                        {
                            var steps = JsonSerializer.Deserialize<List<JobOrderRoutingStepDto>>(
                                jobOrder.RoutingStepsJson,
                                new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

                            if (steps == null || steps.Count == 0)
                                continue;

                            var changed = false;
                            foreach (var step in steps)
                            {
                                if (step.ncrFlags == null || step.ncrFlags.Count == 0)
                                    continue;

                                var before = step.ncrFlags.Count;
                                step.ncrFlags = step.ncrFlags
                                    .Where(f => f == null || f.ncrId != ncrId)
                                    .ToList();
                                if (step.ncrFlags.Count != before)
                                    changed = true;
                            }

                            if (changed)
                            {
                                var routingOptions = new JsonSerializerOptions
                                {
                                    PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
                                    WriteIndented = false
                                };
                                jobOrder.RoutingStepsJson = JsonSerializer.Serialize(steps, routingOptions);
                                jobOrder.ModifiedDate = DateTime.UtcNow;
                            }
                        }
                        catch
                        {
                            // Do not block NCR deletion if routing JSON is malformed.
                        }
                    }
                }
                catch (Exception cleanupEx)
                {
                    Console.WriteLine($"Non-fatal error during JobOrder pointer cleanup for NCR {ncrId}: {cleanupEx.Message}");
                }

                var stub = new NonConformanceReport { NcrId = ncrMeta.NcrId };
                _context.NonConformanceReports.Attach(stub);
                _context.NonConformanceReports.Remove(stub);
                await _context.SaveChangesAsync();

                return Ok(new { result = new { message = "NCR deleted successfully" } });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        // GET: api/Quality/GetNCRStats
        [HttpGet("GetNCRStats")]
        public async Task<IActionResult> GetNCRStats([FromQuery] int tenantId)
        {
            try
            {
                Console.WriteLine($"GetNCRStats called for tenantId: {tenantId}");

                // Use raw SQL count to avoid null reference issues
                var totalCount = await _context.NonConformanceReports
                    .FromSqlRaw("SELECT * FROM CimmpleFlow.NonConformanceReports WHERE TenantId = {0}", tenantId)
                    .AsNoTracking()
                    .CountAsync();

                Console.WriteLine($"Found {totalCount} NCRs for stats calculation");

                // Calculate stats using raw SQL to avoid null reference issues
                var openCount = await _context.NonConformanceReports
                    .FromSqlRaw("SELECT * FROM CimmpleFlow.NonConformanceReports WHERE TenantId = {0} AND (Status = 'Open' OR Status = 'Under_Investigation')", tenantId)
                    .AsNoTracking()
                    .CountAsync();

                var criticalCount = await _context.NonConformanceReports
                    .FromSqlRaw("SELECT * FROM CimmpleFlow.NonConformanceReports WHERE TenantId = {0} AND Severity = 'Critical'", tenantId)
                    .AsNoTracking()
                    .CountAsync();

                var overdueCount = await _context.NonConformanceReports
                    .FromSqlRaw("SELECT * FROM CimmpleFlow.NonConformanceReports WHERE TenantId = {0} AND DueDate IS NOT NULL AND DueDate < GETUTCDATE() AND Status != 'Closed'", tenantId)
                    .AsNoTracking()
                    .CountAsync();

                var stats = new
                {
                    totalNCRs = totalCount,
                    openNCRs = openCount,
                    criticalNCRs = criticalCount,
                    overdueNCRs = overdueCount
                };

                return Ok(new { result = stats });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"GetNCRStats failed: {ex.Message}");
                Console.WriteLine($"Stack trace: {ex.StackTrace}");
                return BadRequest(new { error = new { message = $"Failed to retrieve NCR stats: {ex.Message}" } });
            }
        }

        // POST: api/Quality/UploadNCRPhotos/5
        [HttpPost("UploadNCRPhotos/{ncrId}")]
        public async Task<IActionResult> UploadNCRPhotos(int ncrId)
        {
            try
            {
                var ncr = await _context.NonConformanceReports.FindAsync(ncrId);
                if (ncr == null)
                    return NotFound(new { error = new { message = "NCR not found" } });

                var files = Request.Form.Files;
                if (files == null || files.Count == 0)
                {
                    return BadRequest(new { error = new { message = "At least one photo is required" } });
                }

                var existing = ParsePhotoUrls(ncr.Photos);
                if (existing.Count + files.Count > MaxPhotosPerNcr)
                {
                    return BadRequest(new { error = new { message = $"A maximum of {MaxPhotosPerNcr} photos is allowed per NCR" } });
                }

                var webRootPath = _environment.WebRootPath ?? Path.Combine(_environment.ContentRootPath, "wwwroot");
                var folderPath = Path.Combine(webRootPath, "uploads", "ncr-photos", ncr.TenantId.ToString(), ncrId.ToString());
                if (!Directory.Exists(folderPath))
                {
                    Directory.CreateDirectory(folderPath);
                }

                foreach (var file in files)
                {
                    if (file == null || file.Length == 0)
                    {
                        continue;
                    }

                    var extension = Path.GetExtension(file.FileName).ToLowerInvariant();
                    if (!AllowedPhotoExtensions.Contains(extension))
                    {
                        return BadRequest(new { error = new { message = $"Invalid file type '{extension}'" } });
                    }

                    if (file.Length > MaxPhotoSizeBytes)
                    {
                        return BadRequest(new { error = new { message = "Each photo must be 8MB or smaller" } });
                    }

                    var uniqueFileName = $"{DateTime.UtcNow:yyyyMMddHHmmssfff}_{Guid.NewGuid():N}{extension}";
                    var filePath = Path.Combine(folderPath, uniqueFileName);
                    using (var stream = new FileStream(filePath, FileMode.Create))
                    {
                        await file.CopyToAsync(stream);
                    }

                    existing.Add($"/uploads/ncr-photos/{ncr.TenantId}/{ncrId}/{uniqueFileName}");
                }

                ncr.Photos = JsonSerializer.Serialize(existing);
                ncr.ModifiedDate = DateTime.UtcNow;
                await _context.SaveChangesAsync();

                return Ok(new { result = existing });
            }
            catch (Exception ex)
            {
                return BadRequest(new { error = new { message = ex.Message } });
            }
        }

        private static List<string> ParsePhotoUrls(string? photos)
        {
            var urls = new List<string>();
            if (string.IsNullOrWhiteSpace(photos))
            {
                return urls;
            }

            try
            {
                var parsed = JsonSerializer.Deserialize<List<string>>(photos);
                if (parsed == null)
                {
                    return urls;
                }

                foreach (var item in parsed)
                {
                    if (string.IsNullOrWhiteSpace(item) ||
                        item.StartsWith("data:", StringComparison.OrdinalIgnoreCase))
                    {
                        continue;
                    }
                    urls.Add(item);
                }
            }
            catch
            {
                // Ignore unparseable legacy payloads
            }

            return urls;
        }

        // GET: api/Quality/CheckTable
        [HttpGet("CheckTable")]
        public async Task<IActionResult> CheckTable()
        {
            try
            {
                // Check if table exists by trying to query it
                var tableExists = await _context.NonConformanceReports.AnyAsync();
                return Ok(new { tableExists = true, message = "NonConformanceReports table exists" });
            }
            catch (Exception ex)
            {
                return Ok(new { tableExists = false, message = $"Table check failed: {ex.Message}" });
            }
        }

        /// <summary>
        /// Deletes all NCR records - USE WITH EXTREME CAUTION
        /// This method requires explicit confirmation to prevent accidental deletion
        /// </summary>
        [HttpDelete("delete-all-ncrs")]
        public async Task<IActionResult> DeleteAllNCRs([FromQuery] string confirmation)
        {
            // Require explicit confirmation to prevent accidental deletion
            if (string.IsNullOrEmpty(confirmation) || confirmation.ToUpper() != "DELETE_ALL_TEST_DATA")
            {
                return BadRequest(new
                {
                    error = "Confirmation required",
                    message = "To delete all NCR data, you must provide confirmation='DELETE_ALL_TEST_DATA' as a query parameter"
                });
            }

            try
            {
                // Count existing records before deletion
                var countBefore = await _context.NonConformanceReports.CountAsync();

                if (countBefore == 0)
                {
                    return Ok(new
                    {
                        message = "No NCR records found to delete",
                        deletedCount = 0
                    });
                }

                // Delete all NCR records
                _context.NonConformanceReports.RemoveRange(_context.NonConformanceReports);
                await _context.SaveChangesAsync();

                return Ok(new
                {
                    message = "All NCR records have been deleted successfully",
                    deletedCount = countBefore,
                    warning = "This action cannot be undone. Make sure you have backups if needed."
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new
                {
                    error = "Deletion failed",
                    message = $"Failed to delete NCR records: {ex.Message}",
                    innerException = ex.InnerException?.Message
                });
            }
        }

        /// <summary>
        /// Gets all active users for NCR reporting selection
        /// </summary>
        [HttpGet("users")]
        public async Task<IActionResult> GetUsers()
        {
            try
            {
                var users = await _context.UserDetails
                    .Where(u => u.Status == "Active")
                    .Select(u => new
                    {
                        userId = u.User_UniqueID,
                        name = $"{u.FirstName} {u.LastName}".Trim(),
                        username = u.UserName,
                        email = u.Email
                    })
                    .OrderBy(u => u.name)
                    .ToListAsync();

                return Ok(new { users });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = "Failed to retrieve users", message = ex.Message });
            }
        }
    }
}
