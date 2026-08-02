using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using CimmpleAPI.Data;
using CimmpleAPI.Data.Models;
using CimmpleAPI.Data.Dtos;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;

namespace CimmpleAPI.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [AllowAnonymous]
    public class JobTemplateController : ApiBaseController
    {
        private readonly CimmpleDbContext _context;
        private readonly IWebHostEnvironment _environment;

        public static readonly string[] AttachmentTypes = new[]
        {
            "Drawing", "SOP", "Setup Sheet", "Image", "PDF", "Other"
        };

        public static readonly string[] InspectionTypes = new[]
        {
            "None", "Visual", "Dimensional", "First Article", "In-Process", "Final", "CMM", "Functional"
        };

        private static readonly string[] AllowedAttachmentExtensions = new[]
        {
            ".pdf", ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".svg", ".webp",
            ".dwg", ".dxf", ".step", ".stp", ".igs", ".iges",
            ".doc", ".docx", ".xls", ".xlsx", ".csv", ".txt"
        };

        private const long MaxAttachmentSize = 25 * 1024 * 1024;

        public JobTemplateController(CimmpleDbContext context, IWebHostEnvironment environment)
        {
            _context = context;
            _environment = environment;
        }

        [HttpGet("GetAttachmentTypes")]
        public IActionResult GetAttachmentTypes()
        {
            return Ok(new { result = AttachmentTypes });
        }

        [HttpGet("GetInspectionTypes")]
        public IActionResult GetInspectionTypes()
        {
            return Ok(new { result = InspectionTypes });
        }

        /// <summary>
        /// Paged, sorted and faceted listing. Category filtering ORs values inside a category
        /// type and ANDs across types, which is what a multi-select facet panel implies:
        /// "(Milling OR Turning) AND Aluminium AND ABC Aerospace".
        /// Pass matchMode=any to OR everything instead. A pageSize of 0 returns all matches,
        /// which the UI uses to build an export of the current filter.
        /// </summary>
        [HttpGet("GetJobTemplates")]
        public IActionResult GetJobTemplates(
            [FromQuery] int tenantid,
            [FromQuery] string? search,
            [FromQuery] string? status,
            [FromQuery] string? categoryIds,
            [FromQuery] string? matchMode,
            [FromQuery] int page = 1,
            [FromQuery] int pageSize = 25,
            [FromQuery] string? sortBy = null,
            [FromQuery] string? sortDir = null)
        {
            try
            {
                var query = _context.JobTemplateMaster.Where(t => t.Tenantid == tenantid);

                if (!string.IsNullOrWhiteSpace(search))
                {
                    var term = search.Trim().ToLower();
                    query = query.Where(t =>
                        (t.TemplateCode != null && t.TemplateCode.ToLower().Contains(term)) ||
                        (t.TemplateName != null && t.TemplateName.ToLower().Contains(term)) ||
                        (t.Description != null && t.Description.ToLower().Contains(term)));
                }

                if (string.Equals(status, "active", StringComparison.OrdinalIgnoreCase))
                {
                    query = query.Where(t => t.Status == 1);
                }
                else if (string.Equals(status, "inactive", StringComparison.OrdinalIgnoreCase))
                {
                    query = query.Where(t => t.Status == 0);
                }

                var selectedCategoryIds = ParseIdList(categoryIds);
                if (selectedCategoryIds.Count > 0)
                {
                    if (string.Equals(matchMode, "any", StringComparison.OrdinalIgnoreCase))
                    {
                        query = query.Where(t => t.Categories.Any(c => selectedCategoryIds.Contains(c.CategoryValueId)));
                    }
                    else
                    {
                        var groupedByType = _context.CategoryValue
                            .Where(v => v.Tenantid == tenantid && selectedCategoryIds.Contains(v.Id))
                            .Select(v => new { v.Id, v.CategoryTypeId })
                            .ToList()
                            .GroupBy(v => v.CategoryTypeId)
                            .Select(g => g.Select(v => v.Id).ToList())
                            .ToList();

                        foreach (var idsForType in groupedByType)
                        {
                            var ids = idsForType;
                            query = query.Where(t => t.Categories.Any(c => ids.Contains(c.CategoryValueId)));
                        }
                    }
                }

                var pagedQuery = ApplySort(query, sortBy, sortDir);

                if (pageSize > 0)
                {
                    if (page < 1) page = 1;
                    pagedQuery = pagedQuery.Skip((page - 1) * pageSize).Take(pageSize);
                }

                // Everything the row needs comes back in one query. The database is often
                // remote, so each extra round trip costs far more than the work it does.
                var rows = pagedQuery.Select(t => new
                {
                    t.Id,
                    t.TemplateCode,
                    t.TemplateName,
                    t.Revision,
                    t.Status,
                    t.IsSystem,
                    t.PrimaryProcessId,
                    PrimaryProcessName = _context.ProcessMaster
                        .Where(p => p.Id == t.PrimaryProcessId)
                        .Select(p => p.ProcessName)
                        .FirstOrDefault(),
                    t.WorkstationId,
                    WorkstationName = _context.WorkstationMaster
                        .Where(w => w.Id == t.WorkstationId)
                        .Select(w => w.WorkstationName)
                        .FirstOrDefault(),
                    t.EffectiveFrom,
                    t.EffectiveTo,
                    t.DefaultMaterial,
                    t.CreatedDate,
                    t.ModifiedDate,
                    OperationCount = t.Operations.Count(),
                    AttachmentCount = t.Attachments.Count(),
                    Categories = t.Categories.Select(c => new
                    {
                        CategoryValueId = c.CategoryValueId,
                        CategoryValueName = c.CategoryValue!.Name,
                        ValueOrder = c.CategoryValue!.DisplayOrder,
                        CategoryTypeId = c.CategoryValue!.CategoryTypeId,
                        CategoryTypeName = c.CategoryValue!.CategoryType!.Name,
                        TypeOrder = c.CategoryValue!.CategoryType!.DisplayOrder
                    }).ToList()
                })
                .ToList();

                var items = rows.Select(t => new
                {
                    id = t.Id,
                    templateCode = t.TemplateCode ?? "",
                    templateName = t.TemplateName ?? "",
                    revision = t.Revision,
                    status = t.Status,
                    statusText = t.Status == 1 ? "Active" : "Inactive",
                    isSystem = t.IsSystem,
                    primaryProcessId = t.PrimaryProcessId,
                    primaryProcessName = t.PrimaryProcessName ?? "",
                    workstationId = t.WorkstationId,
                    workstationName = t.WorkstationName ?? "",
                    effectiveFrom = t.EffectiveFrom,
                    effectiveTo = t.EffectiveTo,
                    defaultMaterial = t.DefaultMaterial ?? "",
                    operationCount = t.OperationCount,
                    attachmentCount = t.AttachmentCount,
                    categories = t.Categories
                        .OrderBy(c => c.TypeOrder)
                        .ThenBy(c => c.ValueOrder)
                        .ThenBy(c => c.CategoryValueName)
                        .Select(c => new
                        {
                            categoryValueId = c.CategoryValueId,
                            categoryValueName = c.CategoryValueName ?? "",
                            categoryTypeId = c.CategoryTypeId,
                            categoryTypeName = c.CategoryTypeName ?? ""
                        })
                        .ToList(),
                    lastUpdated = t.ModifiedDate ?? t.CreatedDate
                })
                .ToList();

                // A full first page means there may be more, so the total has to be asked for.
                // Anything else is already known from the rows in hand, and skipping that second
                // round trip is worth having on a remote database.
                var firstPageHoldsEverything = pageSize <= 0 || (page == 1 && rows.Count < pageSize);
                var totalCount = firstPageHoldsEverything ? rows.Count : query.Count();

                var effectivePageSize = pageSize > 0 ? pageSize : (totalCount == 0 ? 1 : totalCount);

                return Ok(new
                {
                    result = new
                    {
                        items,
                        totalCount,
                        page = pageSize > 0 ? page : 1,
                        pageSize = pageSize > 0 ? pageSize : totalCount,
                        totalPages = (int)Math.Ceiling(totalCount / (double)effectivePageSize)
                    }
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message, stackTrace = ex.StackTrace });
            }
        }

        [HttpGet("GetJobTemplateById")]
        public IActionResult GetJobTemplateById([FromQuery] int jobTemplateId, [FromQuery] int tenantId)
        {
            try
            {
                // Header, operations, attachments and tags in one round trip.
                var template = _context.JobTemplateMaster
                    .Where(t => t.Id == jobTemplateId && t.Tenantid == tenantId)
                    .Select(t => new
                    {
                        Header = t,
                        PrimaryProcessName = _context.ProcessMaster
                            .Where(p => p.Id == t.PrimaryProcessId)
                            .Select(p => p.ProcessName)
                            .FirstOrDefault(),
                        WorkstationName = _context.WorkstationMaster
                            .Where(w => w.Id == t.WorkstationId)
                            .Select(w => w.WorkstationName)
                            .FirstOrDefault(),
                        Operations = t.Operations.Select(o => new
                        {
                            o.Id,
                            o.SequenceNumber,
                            o.ProcessId,
                            ProcessName = _context.ProcessMaster
                                .Where(p => p.Id == o.ProcessId)
                                .Select(p => p.ProcessName)
                                .FirstOrDefault(),
                            o.WorkstationId,
                            WorkstationName = _context.WorkstationMaster
                                .Where(w => w.Id == o.WorkstationId)
                                .Select(w => w.WorkstationName)
                                .FirstOrDefault(),
                            o.SetupTimeMinutes,
                            o.CycleTimeMinutes,
                            o.Instructions,
                            o.IsMandatory,
                            o.QualityCheckRequired
                        }).ToList(),
                        Attachments = t.Attachments.Select(a => new
                        {
                            a.Id,
                            a.AttachmentType,
                            a.FileName,
                            a.FileUrl,
                            a.ContentType,
                            a.FileSize,
                            a.UploadedDate
                        }).ToList(),
                        Categories = t.Categories.Select(c => new
                        {
                            CategoryValueId = c.CategoryValueId,
                            CategoryValueName = c.CategoryValue!.Name,
                            ValueOrder = c.CategoryValue!.DisplayOrder,
                            CategoryTypeId = c.CategoryValue!.CategoryTypeId,
                            CategoryTypeName = c.CategoryValue!.CategoryType!.Name,
                            TypeOrder = c.CategoryValue!.CategoryType!.DisplayOrder
                        }).ToList()
                    })
                    .FirstOrDefault();

                if (template == null)
                {
                    return NotFound(new { error = "Job template not found" });
                }

                var header = template.Header;

                var operations = template.Operations
                    .OrderBy(o => o.SequenceNumber)
                    .Select(o => new
                    {
                        id = o.Id,
                        sequenceNumber = o.SequenceNumber,
                        processId = o.ProcessId,
                        processName = o.ProcessName ?? "",
                        workstationId = o.WorkstationId,
                        workstationName = o.WorkstationName ?? "",
                        setupTimeMinutes = o.SetupTimeMinutes,
                        cycleTimeMinutes = o.CycleTimeMinutes,
                        instructions = o.Instructions ?? "",
                        isMandatory = o.IsMandatory,
                        qualityCheckRequired = o.QualityCheckRequired
                    })
                    .ToList();

                var attachments = template.Attachments
                    .OrderBy(a => a.Id)
                    .Select(a => new
                    {
                        id = a.Id,
                        attachmentType = a.AttachmentType ?? "",
                        fileName = a.FileName ?? "",
                        fileUrl = a.FileUrl ?? "",
                        contentType = a.ContentType ?? "",
                        fileSize = a.FileSize,
                        uploadedDate = a.UploadedDate
                    })
                    .ToList();

                var categories = template.Categories
                    .OrderBy(c => c.TypeOrder)
                    .ThenBy(c => c.ValueOrder)
                    .ThenBy(c => c.CategoryValueName)
                    .Select(c => new
                    {
                        categoryValueId = c.CategoryValueId,
                        categoryValueName = c.CategoryValueName ?? "",
                        categoryTypeId = c.CategoryTypeId,
                        categoryTypeName = c.CategoryTypeName ?? ""
                    })
                    .ToList();

                var data = new
                {
                    id = header.Id,
                    templateCode = header.TemplateCode ?? "",
                    templateName = header.TemplateName ?? "",
                    description = header.Description ?? "",
                    status = header.Status,
                    statusText = header.Status == 1 ? "Active" : "Inactive",
                    revision = header.Revision,
                    effectiveFrom = header.EffectiveFrom,
                    effectiveTo = header.EffectiveTo,
                    primaryProcessId = header.PrimaryProcessId,
                    primaryProcessName = template.PrimaryProcessName ?? "",
                    workstationId = header.WorkstationId,
                    workstationName = template.WorkstationName ?? "",
                    estimatedSetupTimeMinutes = header.EstimatedSetupTimeMinutes,
                    estimatedCycleTimeMinutes = header.EstimatedCycleTimeMinutes,
                    estimatedLabourTimeMinutes = header.EstimatedLabourTimeMinutes,
                    estimatedMachineTimeMinutes = header.EstimatedMachineTimeMinutes,
                    defaultMaterial = header.DefaultMaterial ?? "",
                    materialGrade = header.MaterialGrade ?? "",
                    rawMaterialSize = header.RawMaterialSize ?? "",
                    materialNotes = header.MaterialNotes ?? "",
                    tool = header.Tool ?? "",
                    fixture = header.Fixture ?? "",
                    workholding = header.Workholding ?? "",
                    gauge = header.Gauge ?? "",
                    toolingNotes = header.ToolingNotes ?? "",
                    inspectionType = header.InspectionType ?? "",
                    firstArticleRequired = header.FirstArticleRequired,
                    inProcessInspection = header.InProcessInspection,
                    finalInspection = header.FinalInspection,
                    cmmRequired = header.CmmRequired,
                    inspectionNotes = header.InspectionNotes ?? "",
                    isSystem = header.IsSystem,
                    createdDate = header.CreatedDate,
                    modifiedDate = header.ModifiedDate,
                    lastUpdated = header.ModifiedDate ?? header.CreatedDate,
                    operations,
                    attachments,
                    categories
                };

                return Ok(new { result = data });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message, stackTrace = ex.StackTrace });
            }
        }

        [HttpPost("SaveJobTemplate")]
        public IActionResult SaveJobTemplate([FromBody] JobTemplateReq request)
        {
            try
            {
                if (request == null)
                {
                    return BadRequest(new { error = "Request is null" });
                }

                var validationError = Validate(request);
                if (validationError != null)
                {
                    return BadRequest(new { error = validationError });
                }

                var categoryValueIds = (request.CategoryValueIds ?? new List<int>()).Distinct().ToList();
                if (categoryValueIds.Count > 0)
                {
                    var validCount = _context.CategoryValue
                        .Count(v => v.Tenantid == request.Tenantid && categoryValueIds.Contains(v.Id));
                    if (validCount != categoryValueIds.Count)
                    {
                        return BadRequest(new { error = "One or more selected categories no longer exist" });
                    }
                }

                using var tx = _context.Database.BeginTransaction();
                try
                {
                    JobTemplateMaster template;

                    if (request.Id > 0)
                    {
                        template = _context.JobTemplateMaster
                            .FirstOrDefault(t => t.Id == request.Id && t.Tenantid == request.Tenantid);

                        if (template == null)
                        {
                            return NotFound(new { error = "Job template not found" });
                        }

                        ApplyRequestToEntity(template, request);
                        template.ModifiedDate = DateTime.Now;
                        template.ModifiedBy = GetUserId();
                    }
                    else
                    {
                        template = new JobTemplateMaster
                        {
                            Tenantid = request.Tenantid,
                            CreatedDate = DateTime.Now,
                            CreatedBy = GetUserId()
                        };

                        ApplyRequestToEntity(template, request);
                        _context.JobTemplateMaster.Add(template);
                    }

                    _context.SaveChanges();

                    // Children are replaced wholesale. Removing before inserting keeps the
                    // unique (JobTemplateId, SequenceNumber) index satisfied when steps are
                    // resequenced in place.
                    var existingOperations = _context.JobTemplateOperation
                        .Where(o => o.JobTemplateId == template.Id)
                        .ToList();
                    var existingCategories = _context.JobTemplateCategory
                        .Where(c => c.JobTemplateId == template.Id)
                        .ToList();

                    _context.JobTemplateOperation.RemoveRange(existingOperations);
                    _context.JobTemplateCategory.RemoveRange(existingCategories);
                    _context.SaveChanges();

                    foreach (var op in request.Operations ?? new List<JobTemplateOperationReq>())
                    {
                        _context.JobTemplateOperation.Add(new JobTemplateOperation
                        {
                            JobTemplateId = template.Id,
                            Tenantid = request.Tenantid,
                            SequenceNumber = op.SequenceNumber,
                            ProcessId = op.ProcessId.HasValue && op.ProcessId.Value > 0 ? op.ProcessId : null,
                            WorkstationId = op.WorkstationId.HasValue && op.WorkstationId.Value > 0 ? op.WorkstationId : null,
                            SetupTimeMinutes = op.SetupTimeMinutes,
                            CycleTimeMinutes = op.CycleTimeMinutes,
                            Instructions = op.Instructions?.Trim() ?? "",
                            IsMandatory = op.IsMandatory,
                            QualityCheckRequired = op.QualityCheckRequired
                        });
                    }

                    foreach (var categoryValueId in categoryValueIds)
                    {
                        _context.JobTemplateCategory.Add(new JobTemplateCategory
                        {
                            JobTemplateId = template.Id,
                            CategoryValueId = categoryValueId,
                            Tenantid = request.Tenantid
                        });
                    }

                    _context.SaveChanges();
                    tx.Commit();

                    return Ok(new { result = new { id = template.Id, message = "Job template saved successfully" } });
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

        /// <summary>Copies a template, its operations and its category tags under a new code.</summary>
        [HttpPost("CloneJobTemplate")]
        public IActionResult CloneJobTemplate([FromBody] CloneJobTemplateReq request)
        {
            try
            {
                if (request == null || request.JobTemplateId <= 0)
                {
                    return BadRequest(new { error = "A source job template is required" });
                }

                if (string.IsNullOrWhiteSpace(request.NewTemplateCode))
                {
                    return BadRequest(new { error = "New Template Code is required" });
                }

                var source = _context.JobTemplateMaster
                    .FirstOrDefault(t => t.Id == request.JobTemplateId && t.Tenantid == request.Tenantid);

                if (source == null)
                {
                    return NotFound(new { error = "Job template not found" });
                }

                var newCode = request.NewTemplateCode.Trim();
                var codeExists = _context.JobTemplateMaster.Any(t =>
                    t.Tenantid == request.Tenantid &&
                    t.TemplateCode != null &&
                    t.TemplateCode.ToLower() == newCode.ToLower());

                if (codeExists)
                {
                    return BadRequest(new { error = $"Template Code '{newCode}' already exists" });
                }

                using var tx = _context.Database.BeginTransaction();
                try
                {
                    var clone = new JobTemplateMaster
                    {
                        Tenantid = source.Tenantid,
                        TemplateCode = newCode,
                        TemplateName = string.IsNullOrWhiteSpace(request.NewTemplateName)
                            ? $"{source.TemplateName} (Copy)"
                            : request.NewTemplateName.Trim(),
                        Description = source.Description,
                        Status = source.Status,
                        Revision = 1,
                        EffectiveFrom = source.EffectiveFrom,
                        EffectiveTo = source.EffectiveTo,
                        PrimaryProcessId = source.PrimaryProcessId,
                        WorkstationId = source.WorkstationId,
                        EstimatedSetupTimeMinutes = source.EstimatedSetupTimeMinutes,
                        EstimatedCycleTimeMinutes = source.EstimatedCycleTimeMinutes,
                        EstimatedLabourTimeMinutes = source.EstimatedLabourTimeMinutes,
                        EstimatedMachineTimeMinutes = source.EstimatedMachineTimeMinutes,
                        DefaultMaterial = source.DefaultMaterial,
                        MaterialGrade = source.MaterialGrade,
                        RawMaterialSize = source.RawMaterialSize,
                        MaterialNotes = source.MaterialNotes,
                        Tool = source.Tool,
                        Fixture = source.Fixture,
                        Workholding = source.Workholding,
                        Gauge = source.Gauge,
                        ToolingNotes = source.ToolingNotes,
                        InspectionType = source.InspectionType,
                        FirstArticleRequired = source.FirstArticleRequired,
                        InProcessInspection = source.InProcessInspection,
                        FinalInspection = source.FinalInspection,
                        CmmRequired = source.CmmRequired,
                        InspectionNotes = source.InspectionNotes,
                        IsSystem = false,
                        CreatedDate = DateTime.Now,
                        CreatedBy = GetUserId()
                    };

                    _context.JobTemplateMaster.Add(clone);
                    _context.SaveChanges();

                    var sourceOperations = _context.JobTemplateOperation
                        .Where(o => o.JobTemplateId == source.Id)
                        .OrderBy(o => o.SequenceNumber)
                        .ToList();

                    foreach (var op in sourceOperations)
                    {
                        _context.JobTemplateOperation.Add(new JobTemplateOperation
                        {
                            JobTemplateId = clone.Id,
                            Tenantid = clone.Tenantid,
                            SequenceNumber = op.SequenceNumber,
                            ProcessId = op.ProcessId,
                            WorkstationId = op.WorkstationId,
                            SetupTimeMinutes = op.SetupTimeMinutes,
                            CycleTimeMinutes = op.CycleTimeMinutes,
                            Instructions = op.Instructions,
                            IsMandatory = op.IsMandatory,
                            QualityCheckRequired = op.QualityCheckRequired
                        });
                    }

                    var sourceCategoryIds = _context.JobTemplateCategory
                        .Where(c => c.JobTemplateId == source.Id)
                        .Select(c => c.CategoryValueId)
                        .ToList();

                    foreach (var categoryValueId in sourceCategoryIds)
                    {
                        _context.JobTemplateCategory.Add(new JobTemplateCategory
                        {
                            JobTemplateId = clone.Id,
                            CategoryValueId = categoryValueId,
                            Tenantid = clone.Tenantid
                        });
                    }

                    _context.SaveChanges();
                    tx.Commit();

                    return Ok(new { result = new { id = clone.Id, message = "Job template cloned successfully" } });
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

        [HttpGet("CheckJobTemplateDeletionImpact")]
        public IActionResult CheckJobTemplateDeletionImpact([FromQuery] int jobTemplateId, [FromQuery] int tenantId)
        {
            try
            {
                var template = _context.JobTemplateMaster
                    .FirstOrDefault(t => t.Id == jobTemplateId && t.Tenantid == tenantId);

                if (template == null)
                {
                    return NotFound(new { error = "Job template not found" });
                }

                var impact = new DeletionImpactResult { CanDelete = true };

                if (template.IsSystem)
                {
                    impact.CanDelete = false;
                    impact.BlockingReasons.Add("Protected system templates cannot be deleted");
                }

                var operationCount = _context.JobTemplateOperation.Count(o => o.JobTemplateId == jobTemplateId);
                if (operationCount > 0)
                {
                    impact.WillBeDeleted.Add(new ImpactedEntity
                    {
                        EntityType = "Operation",
                        Count = operationCount,
                        Description = $"{operationCount} routing operation(s) defined on this template"
                    });
                }

                var categoryCount = _context.JobTemplateCategory.Count(c => c.JobTemplateId == jobTemplateId);
                if (categoryCount > 0)
                {
                    impact.WillBeDeleted.Add(new ImpactedEntity
                    {
                        EntityType = "Category Tag",
                        Count = categoryCount,
                        Description = $"{categoryCount} category tag(s) assigned to this template"
                    });
                }

                var attachmentCount = _context.JobTemplateAttachment.Count(a => a.JobTemplateId == jobTemplateId);
                if (attachmentCount > 0)
                {
                    impact.WillBeDeleted.Add(new ImpactedEntity
                    {
                        EntityType = "Attachment",
                        Count = attachmentCount,
                        Description = $"{attachmentCount} attached file(s) will be removed from storage"
                    });
                }

                impact.Warnings.Add("Job orders already created from this template are not affected.");

                return Ok(new { result = impact });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message, stackTrace = ex.StackTrace });
            }
        }

        [HttpDelete("DeleteJobTemplate")]
        public IActionResult DeleteJobTemplate([FromQuery] int jobTemplateId, [FromQuery] int tenantId)
        {
            try
            {
                var template = _context.JobTemplateMaster
                    .FirstOrDefault(t => t.Id == jobTemplateId && t.Tenantid == tenantId);

                if (template == null)
                {
                    return NotFound(new { error = "Job template not found" });
                }

                if (template.IsSystem)
                {
                    return BadRequest(new { error = "Protected system templates cannot be deleted" });
                }

                var attachments = _context.JobTemplateAttachment
                    .Where(a => a.JobTemplateId == jobTemplateId)
                    .ToList();

                _context.JobTemplateOperation.RemoveRange(
                    _context.JobTemplateOperation.Where(o => o.JobTemplateId == jobTemplateId));
                _context.JobTemplateCategory.RemoveRange(
                    _context.JobTemplateCategory.Where(c => c.JobTemplateId == jobTemplateId));
                _context.JobTemplateAttachment.RemoveRange(attachments);
                _context.JobTemplateMaster.Remove(template);
                _context.SaveChanges();

                foreach (var attachment in attachments)
                {
                    DeletePhysicalFile(attachment.FileUrl);
                }

                return Ok(new { result = new { message = "Job template deleted successfully" } });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message, stackTrace = ex.StackTrace });
            }
        }

        [HttpPost("UploadJobTemplateAttachment")]
        public async Task<IActionResult> UploadJobTemplateAttachment(
            [FromForm] int jobTemplateId,
            [FromForm] int tenantId,
            [FromForm] string? attachmentType,
            [FromForm] IFormFile file)
        {
            try
            {
                if (file == null || file.Length == 0)
                {
                    return BadRequest(new { error = "A file is required" });
                }

                var extension = Path.GetExtension(file.FileName).ToLowerInvariant();
                if (!AllowedAttachmentExtensions.Contains(extension))
                {
                    return BadRequest(new { error = $"Invalid file type '{extension}'. Allowed types: {string.Join(", ", AllowedAttachmentExtensions)}" });
                }

                if (file.Length > MaxAttachmentSize)
                {
                    return BadRequest(new { error = "File size exceeds maximum allowed size of 25MB" });
                }

                var template = _context.JobTemplateMaster
                    .FirstOrDefault(t => t.Id == jobTemplateId && t.Tenantid == tenantId);

                if (template == null)
                {
                    return NotFound(new { error = "Job template not found" });
                }

                var webRootPath = _environment.WebRootPath ?? Path.Combine(_environment.ContentRootPath, "wwwroot");
                var folderPath = Path.Combine(webRootPath, "uploads", "jobtemplates", tenantId.ToString(), jobTemplateId.ToString());

                if (!Directory.Exists(folderPath))
                {
                    Directory.CreateDirectory(folderPath);
                }

                var timestamp = DateTime.UtcNow.ToString("yyyyMMddHHmmssfff");
                var uniqueFileName = $"{timestamp}{extension}";
                var filePath = Path.Combine(folderPath, uniqueFileName);

                using (var stream = new FileStream(filePath, FileMode.Create))
                {
                    await file.CopyToAsync(stream);
                }

                var attachment = new JobTemplateAttachment
                {
                    JobTemplateId = jobTemplateId,
                    Tenantid = tenantId,
                    AttachmentType = string.IsNullOrWhiteSpace(attachmentType) ? "Other" : attachmentType.Trim(),
                    FileName = Path.GetFileName(file.FileName),
                    FileUrl = $"/uploads/jobtemplates/{tenantId}/{jobTemplateId}/{uniqueFileName}",
                    ContentType = file.ContentType,
                    FileSize = file.Length,
                    UploadedDate = DateTime.Now,
                    UploadedBy = GetUserId()
                };

                _context.JobTemplateAttachment.Add(attachment);
                _context.SaveChanges();

                return Ok(new
                {
                    result = new
                    {
                        id = attachment.Id,
                        attachmentType = attachment.AttachmentType,
                        fileName = attachment.FileName,
                        fileUrl = attachment.FileUrl,
                        contentType = attachment.ContentType,
                        fileSize = attachment.FileSize,
                        uploadedDate = attachment.UploadedDate
                    }
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message, stackTrace = ex.StackTrace });
            }
        }

        [HttpDelete("DeleteJobTemplateAttachment")]
        public IActionResult DeleteJobTemplateAttachment([FromQuery] int attachmentId, [FromQuery] int tenantId)
        {
            try
            {
                var attachment = _context.JobTemplateAttachment
                    .FirstOrDefault(a => a.Id == attachmentId && a.Tenantid == tenantId);

                if (attachment == null)
                {
                    return NotFound(new { error = "Attachment not found" });
                }

                _context.JobTemplateAttachment.Remove(attachment);
                _context.SaveChanges();

                DeletePhysicalFile(attachment.FileUrl);

                return Ok(new { result = new { message = "Attachment deleted successfully" } });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message, stackTrace = ex.StackTrace });
            }
        }

        // =============================================
        // HELPERS
        // =============================================

        private string? Validate(JobTemplateReq request)
        {
            if (request.Tenantid <= 0)
            {
                return "A valid tenant is required";
            }

            if (string.IsNullOrWhiteSpace(request.TemplateName))
            {
                return "Template Name is required";
            }

            if (string.IsNullOrWhiteSpace(request.TemplateCode))
            {
                return "Template Code is required";
            }

            var code = request.TemplateCode.Trim();
            var codeExists = _context.JobTemplateMaster.Any(t =>
                t.Tenantid == request.Tenantid &&
                t.Id != request.Id &&
                t.TemplateCode != null &&
                t.TemplateCode.ToLower() == code.ToLower());

            if (codeExists)
            {
                return $"Template Code '{code}' already exists";
            }

            if (request.Revision < 1)
            {
                return "Revision must be a positive number";
            }

            if (request.EffectiveFrom.HasValue && request.EffectiveTo.HasValue &&
                request.EffectiveTo.Value < request.EffectiveFrom.Value)
            {
                return "Effective To must be on or after Effective From";
            }

            var operations = request.Operations ?? new List<JobTemplateOperationReq>();

            if (operations.Count == 0)
            {
                return "At least one operation is required";
            }

            if (operations.Any(o => !o.ProcessId.HasValue || o.ProcessId.Value <= 0))
            {
                return "Every operation must reference a process";
            }

            if (operations.Any(o => o.SequenceNumber <= 0))
            {
                return "Operation sequence numbers must be positive";
            }

            var duplicateSequence = operations
                .GroupBy(o => o.SequenceNumber)
                .FirstOrDefault(g => g.Count() > 1);

            if (duplicateSequence != null)
            {
                return $"Operation sequence number {duplicateSequence.Key} is used more than once";
            }

            var processIds = operations
                .Select(o => o.ProcessId!.Value)
                .Concat(request.PrimaryProcessId.HasValue && request.PrimaryProcessId.Value > 0
                    ? new[] { request.PrimaryProcessId.Value }
                    : Array.Empty<int>())
                .Distinct()
                .ToList();

            var knownProcessCount = _context.ProcessMaster
                .Count(p => p.Tenantid == request.Tenantid && processIds.Contains(p.Id));

            if (knownProcessCount != processIds.Count)
            {
                return "One or more referenced processes no longer exist";
            }

            var workstationIds = operations
                .Where(o => o.WorkstationId.HasValue && o.WorkstationId.Value > 0)
                .Select(o => o.WorkstationId!.Value)
                .Concat(request.WorkstationId.HasValue && request.WorkstationId.Value > 0
                    ? new[] { request.WorkstationId.Value }
                    : Array.Empty<int>())
                .Distinct()
                .ToList();

            if (workstationIds.Count > 0)
            {
                var knownWorkstationCount = _context.WorkstationMaster
                    .Count(w => w.TenantId == request.Tenantid && workstationIds.Contains(w.Id));

                if (knownWorkstationCount != workstationIds.Count)
                {
                    return "One or more referenced workstations no longer exist";
                }
            }

            return null;
        }

        private static void ApplyRequestToEntity(JobTemplateMaster template, JobTemplateReq request)
        {
            template.TemplateCode = request.TemplateCode?.Trim() ?? "";
            template.TemplateName = request.TemplateName?.Trim() ?? "";
            template.Description = request.Description?.Trim() ?? "";
            template.Status = request.Status == "Inactive" ? 0 : 1;
            template.Revision = request.Revision < 1 ? 1 : request.Revision;
            template.EffectiveFrom = request.EffectiveFrom;
            template.EffectiveTo = request.EffectiveTo;

            template.PrimaryProcessId = NullIfNotPositive(request.PrimaryProcessId);
            template.WorkstationId = NullIfNotPositive(request.WorkstationId);
            template.EstimatedSetupTimeMinutes = request.EstimatedSetupTimeMinutes;
            template.EstimatedCycleTimeMinutes = request.EstimatedCycleTimeMinutes;
            template.EstimatedLabourTimeMinutes = request.EstimatedLabourTimeMinutes;
            template.EstimatedMachineTimeMinutes = request.EstimatedMachineTimeMinutes;

            template.DefaultMaterial = request.DefaultMaterial?.Trim() ?? "";
            template.MaterialGrade = request.MaterialGrade?.Trim() ?? "";
            template.RawMaterialSize = request.RawMaterialSize?.Trim() ?? "";
            template.MaterialNotes = request.MaterialNotes?.Trim() ?? "";

            template.Tool = request.Tool?.Trim() ?? "";
            template.Fixture = request.Fixture?.Trim() ?? "";
            template.Workholding = request.Workholding?.Trim() ?? "";
            template.Gauge = request.Gauge?.Trim() ?? "";
            template.ToolingNotes = request.ToolingNotes?.Trim() ?? "";

            template.InspectionType = request.InspectionType?.Trim() ?? "";
            template.FirstArticleRequired = request.FirstArticleRequired;
            template.InProcessInspection = request.InProcessInspection;
            template.FinalInspection = request.FinalInspection;
            template.CmmRequired = request.CmmRequired;
            template.InspectionNotes = request.InspectionNotes?.Trim() ?? "";
        }

        private static IQueryable<JobTemplateMaster> ApplySort(
            IQueryable<JobTemplateMaster> query, string? sortBy, string? sortDir)
        {
            var descending = string.Equals(sortDir, "desc", StringComparison.OrdinalIgnoreCase);

            switch ((sortBy ?? "").ToLowerInvariant())
            {
                case "templatename":
                    return descending ? query.OrderByDescending(t => t.TemplateName) : query.OrderBy(t => t.TemplateName);
                case "revision":
                    return descending ? query.OrderByDescending(t => t.Revision) : query.OrderBy(t => t.Revision);
                case "status":
                    return descending ? query.OrderByDescending(t => t.Status) : query.OrderBy(t => t.Status);
                case "lastupdated":
                    return descending
                        ? query.OrderByDescending(t => t.ModifiedDate ?? t.CreatedDate)
                        : query.OrderBy(t => t.ModifiedDate ?? t.CreatedDate);
                case "effectivefrom":
                    return descending ? query.OrderByDescending(t => t.EffectiveFrom) : query.OrderBy(t => t.EffectiveFrom);
                case "templatecode":
                default:
                    return descending ? query.OrderByDescending(t => t.TemplateCode) : query.OrderBy(t => t.TemplateCode);
            }
        }

        private static List<int> ParseIdList(string? csv)
        {
            if (string.IsNullOrWhiteSpace(csv))
            {
                return new List<int>();
            }

            return csv
                .Split(',', StringSplitOptions.RemoveEmptyEntries)
                .Select(part => int.TryParse(part.Trim(), out var id) ? id : 0)
                .Where(id => id > 0)
                .Distinct()
                .ToList();
        }

        private static int? NullIfNotPositive(int? value)
        {
            return value.HasValue && value.Value > 0 ? value : null;
        }

        private void DeletePhysicalFile(string? fileUrl)
        {
            if (string.IsNullOrWhiteSpace(fileUrl))
            {
                return;
            }

            try
            {
                var webRootPath = _environment.WebRootPath ?? Path.Combine(_environment.ContentRootPath, "wwwroot");
                var relativePath = fileUrl.TrimStart('/').Replace('/', Path.DirectorySeparatorChar);
                var fullPath = Path.Combine(webRootPath, relativePath);

                if (System.IO.File.Exists(fullPath))
                {
                    System.IO.File.Delete(fullPath);
                }
            }
            catch (Exception ex)
            {
                // A stranded file is preferable to failing a delete that already committed
                Console.WriteLine($"[JobTemplate] Could not remove file '{fileUrl}': {ex.Message}");
            }
        }
    }

    public class JobTemplateReq
    {
        public int Id { get; set; }
        public int Tenantid { get; set; }

        public string TemplateCode { get; set; } = "";
        public string TemplateName { get; set; } = "";
        public string Description { get; set; } = "";
        public string Status { get; set; } = "Active";
        public int Revision { get; set; } = 1;
        public DateTime? EffectiveFrom { get; set; }
        public DateTime? EffectiveTo { get; set; }

        public int? PrimaryProcessId { get; set; }
        public int? WorkstationId { get; set; }
        public decimal? EstimatedSetupTimeMinutes { get; set; }
        public decimal? EstimatedCycleTimeMinutes { get; set; }
        public decimal? EstimatedLabourTimeMinutes { get; set; }
        public decimal? EstimatedMachineTimeMinutes { get; set; }

        public string DefaultMaterial { get; set; } = "";
        public string MaterialGrade { get; set; } = "";
        public string RawMaterialSize { get; set; } = "";
        public string MaterialNotes { get; set; } = "";

        public string Tool { get; set; } = "";
        public string Fixture { get; set; } = "";
        public string Workholding { get; set; } = "";
        public string Gauge { get; set; } = "";
        public string ToolingNotes { get; set; } = "";

        public string InspectionType { get; set; } = "";
        public bool FirstArticleRequired { get; set; }
        public bool InProcessInspection { get; set; }
        public bool FinalInspection { get; set; }
        public bool CmmRequired { get; set; }
        public string InspectionNotes { get; set; } = "";

        public List<JobTemplateOperationReq> Operations { get; set; } = new();
        public List<int> CategoryValueIds { get; set; } = new();
    }

    public class JobTemplateOperationReq
    {
        public int Id { get; set; }
        public int SequenceNumber { get; set; }
        public int? ProcessId { get; set; }
        public int? WorkstationId { get; set; }
        public decimal? SetupTimeMinutes { get; set; }
        public decimal? CycleTimeMinutes { get; set; }
        public string Instructions { get; set; } = "";
        public bool IsMandatory { get; set; } = true;
        public bool QualityCheckRequired { get; set; }
    }

    public class CloneJobTemplateReq
    {
        public int JobTemplateId { get; set; }
        public int Tenantid { get; set; }
        public string NewTemplateCode { get; set; } = "";
        public string NewTemplateName { get; set; } = "";
    }
}
