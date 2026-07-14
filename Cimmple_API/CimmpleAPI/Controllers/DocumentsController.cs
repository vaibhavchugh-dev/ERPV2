using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using CimmpleAPI.Data;
using CimmpleAPI.Data.Models;
using CimmpleAPI.Services;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;

namespace CimmpleAPI.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class DocumentsController : ApiBaseController
    {
        private readonly CimmpleDbContext _context;
        private readonly DocumentStorageService _storageService;
        private const long MaxFileSize = 50 * 1024 * 1024; // 50MB

        public DocumentsController(CimmpleDbContext context, DocumentStorageService storageService)
        {
            _context = context;
            _storageService = storageService;
        }

        // GET: api/documents
        [HttpGet]
        public async Task<IActionResult> GetDocuments(
            [FromQuery] int? categoryId = null,
            [FromQuery] string? relatedEntityType = null,
            [FromQuery] int? relatedEntityId = null,
            [FromQuery] string? search = null,
            [FromQuery] int page = 1,
            [FromQuery] int pageSize = 20)
        {
            try
            {
                var tenantId = GetTenantId();
                if (tenantId == 0)
                {
                    return BadRequest(new { error = "TenantId is required" });
                }

                var query = _context.Documents
                    .Where(d => d.TenantId == tenantId && !d.IsDeleted)
                    .Include(d => d.Category)
                    .Include(d => d.CurrentVersion)
                    .AsQueryable();

                // Apply filters
                if (categoryId.HasValue)
                {
                    query = query.Where(d => d.CategoryId == categoryId.Value);
                }

                if (!string.IsNullOrEmpty(relatedEntityType))
                {
                    query = query.Where(d => d.RelatedEntityType == relatedEntityType);
                    if (relatedEntityId.HasValue)
                    {
                        query = query.Where(d => d.RelatedEntityId == relatedEntityId.Value);
                    }
                }

                if (!string.IsNullOrEmpty(search))
                {
                    var searchLower = search.ToLower();
                    query = query.Where(d =>
                        d.DocumentName.ToLower().Contains(searchLower) ||
                        (d.DocumentNumber != null && d.DocumentNumber.ToLower().Contains(searchLower)) ||
                        (d.Description != null && d.Description.ToLower().Contains(searchLower)) ||
                        (d.Tags != null && d.Tags.ToLower().Contains(searchLower)));
                }

                var totalCount = await query.CountAsync();

                var documents = await query
                    .OrderByDescending(d => d.CreatedDate)
                    .Skip((page - 1) * pageSize)
                    .Take(pageSize)
                    .Select(d => new
                    {
                        id = d.Id,
                        documentName = d.DocumentName,
                        description = d.Description,
                        documentType = d.DocumentType,
                        categoryId = d.CategoryId,
                        categoryName = d.Category != null ? d.Category.CategoryName : null,
                        fileExtension = d.FileExtension,
                        mimeType = d.MimeType,
                        createdBy = d.CreatedBy,
                        createdDate = d.CreatedDate,
                        modifiedBy = d.ModifiedBy,
                        modifiedDate = d.ModifiedDate,
                        tags = d.Tags,
                        relatedEntityType = d.RelatedEntityType,
                        relatedEntityId = d.RelatedEntityId,
                        requiresVersionControl = d.RequiresVersionControl,
                        currentVersionNumber = d.CurrentVersionNumber,
                        currentVersionId = d.CurrentVersionId,
                        fileSize = d.RequiresVersionControl && d.CurrentVersion != null
                            ? d.CurrentVersion.FileSize
                            : d.Files.FirstOrDefault() != null ? d.Files.FirstOrDefault().FileSize : 0,
                        fileName = d.RequiresVersionControl && d.CurrentVersion != null
                            ? d.CurrentVersion.FileName
                            : d.Files.FirstOrDefault() != null ? d.Files.FirstOrDefault().FileName : null,
                        filePath = d.RequiresVersionControl && d.CurrentVersion != null
                            ? d.CurrentVersion.FilePath
                            : d.Files.FirstOrDefault() != null ? d.Files.FirstOrDefault().FilePath : null,
                        documentNumber = d.DocumentNumber,
                        isDocumentNumberAutoGenerated = d.IsDocumentNumberAutoGenerated
                    })
                    .ToListAsync();

                return Ok(new
                {
                    documents,
                    totalCount,
                    page,
                    pageSize,
                    totalPages = (int)Math.Ceiling(totalCount / (double)pageSize)
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        // GET: api/documents/{id}
        [HttpGet("{id}")]
        public async Task<IActionResult> GetDocument(int id)
        {
            try
            {
                var tenantId = GetTenantId();
                if (tenantId == 0)
                {
                    return BadRequest(new { error = "TenantId is required" });
                }

                var document = await _context.Documents
                    .Include(d => d.Category)
                    .Include(d => d.CurrentVersion)
                    .Where(d => d.Id == id && d.TenantId == tenantId && !d.IsDeleted)
                    .FirstOrDefaultAsync();

                if (document == null)
                {
                    return NotFound(new { error = "Document not found" });
                }

                var result = new
                {
                    id = document.Id,
                    documentName = document.DocumentName,
                    documentNumber = document.DocumentNumber,
                    isDocumentNumberAutoGenerated = document.IsDocumentNumberAutoGenerated,
                    description = document.Description,
                    documentType = document.DocumentType,
                    categoryId = document.CategoryId,
                    categoryName = document.Category != null ? document.Category.CategoryName : null,
                    fileExtension = document.FileExtension,
                    mimeType = document.MimeType,
                    createdBy = document.CreatedBy,
                    createdDate = document.CreatedDate,
                    modifiedBy = document.ModifiedBy,
                    modifiedDate = document.ModifiedDate,
                    tags = document.Tags,
                    relatedEntityType = document.RelatedEntityType,
                    relatedEntityId = document.RelatedEntityId,
                    requiresVersionControl = document.RequiresVersionControl,
                    currentVersionNumber = document.CurrentVersionNumber,
                    currentVersionId = document.CurrentVersionId,
                    fileSize = document.RequiresVersionControl && document.CurrentVersion != null
                        ? document.CurrentVersion.FileSize
                        : document.Files.FirstOrDefault() != null ? document.Files.FirstOrDefault().FileSize : 0,
                    fileName = document.RequiresVersionControl && document.CurrentVersion != null
                        ? document.CurrentVersion.FileName
                        : document.Files.FirstOrDefault() != null ? document.Files.FirstOrDefault().FileName : null,
                    filePath = document.RequiresVersionControl && document.CurrentVersion != null
                        ? document.CurrentVersion.FilePath
                        : document.Files.FirstOrDefault() != null ? document.Files.FirstOrDefault().FilePath : null
                };

                // Log access
                await LogAccessAsync(document.Id, null, "View");

                return Ok(new { result });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        // POST: api/documents/upload
        [HttpPost("upload")]
        public async Task<IActionResult> UploadDocument([FromForm] IFormFile file, [FromForm] string documentName,
            [FromForm] string? description = null, [FromForm] int? categoryId = null,
            [FromForm] string? requiresVersionControl = null, [FromForm] string? tags = null,
            [FromForm] string? relatedEntityType = null, [FromForm] int? relatedEntityId = null,
            [FromForm] string? documentNumber = null)
        {
            try
            {
                var tenantId = GetTenantId();
                var userId = GetUserId() ?? 0;

                if (tenantId == 0)
                {
                    return BadRequest(new { error = "TenantId is required" });
                }

                // If userId is not provided, use tenantId as fallback for development
                if (userId == 0)
                {
                    userId = tenantId;
                }

                if (file == null || file.Length == 0)
                {
                    return BadRequest(new { error = "File is required" });
                }

                if (string.IsNullOrWhiteSpace(documentName))
                {
                    return BadRequest(new { error = "Document name is required" });
                }

                // Parse boolean from string (form data sends booleans as strings)
                bool requiresVersionControlBool = false;
                if (!string.IsNullOrEmpty(requiresVersionControl))
                {
                    bool.TryParse(requiresVersionControl, out requiresVersionControlBool);
                }

                if (file.Length > MaxFileSize)
                {
                    return BadRequest(new { error = $"File size exceeds maximum allowed size of {MaxFileSize / (1024 * 1024)}MB" });
                }

                // Handle document number (custom or auto-generated)
                string? finalDocumentNumber = null;
                bool isAutoGenerated = true;

                if (!string.IsNullOrWhiteSpace(documentNumber))
                {
                    // User provided custom number - validate uniqueness
                    var exists = await _context.Documents
                        .AnyAsync(d => d.TenantId == tenantId &&
                                      d.DocumentNumber == documentNumber.Trim() &&
                                      !d.IsDeleted);

                    if (exists)
                    {
                        return BadRequest(new { error = $"Document number '{documentNumber.Trim()}' already exists" });
                    }

                    finalDocumentNumber = documentNumber.Trim();
                    isAutoGenerated = false;
                }
                else
                {
                    // Auto-generate document number
                    finalDocumentNumber = await GenerateDocumentNumber(tenantId, categoryId);
                    isAutoGenerated = true;
                }

                // Create document record
                var document = new Document
                {
                    DocumentName = documentName,
                    Description = description,
                    DocumentType = requiresVersionControlBool ? "Versioned" : "Simple",
                    CategoryId = categoryId,
                    FileExtension = Path.GetExtension(file.FileName),
                    MimeType = file.ContentType,
                    TenantId = tenantId,
                    CreatedBy = userId,
                    CreatedDate = DateTime.UtcNow,
                    Tags = tags,
                    RelatedEntityType = relatedEntityType,
                    RelatedEntityId = relatedEntityId,
                    RequiresVersionControl = requiresVersionControlBool,
                    DocumentNumber = finalDocumentNumber,
                    IsDocumentNumberAutoGenerated = isAutoGenerated,
                    IsActive = true,
                    IsDeleted = false
                };

                _context.Documents.Add(document);
                await _context.SaveChangesAsync();

                // Calculate file hash and save file
                string filePath;
                string fileHash;

                using (var stream = file.OpenReadStream())
                {
                    fileHash = await _storageService.CalculateFileHashAsync(stream);
                }

                if (requiresVersionControlBool)
                {
                    // Create version 1
                    using (var stream = file.OpenReadStream())
                    {
                        filePath = await _storageService.SaveFileAsync(stream, tenantId, document.Id, file.FileName, true, 1);
                    }

                    var version = new DocumentVersion
                    {
                        DocumentId = document.Id,
                        VersionNumber = 1,
                        FileName = file.FileName,
                        FilePath = filePath,
                        FileSize = file.Length,
                        FileHash = fileHash,
                        MimeType = file.ContentType,
                        UploadedBy = userId,
                        UploadedDate = DateTime.UtcNow,
                        IsCurrentVersion = true,
                        TenantId = tenantId
                    };

                    _context.DocumentVersions.Add(version);
                    await _context.SaveChangesAsync();
                    
                    document.CurrentVersionNumber = 1;
                    document.CurrentVersionId = version.Id;
                }
                else
                {
                    // Create simple file record
                    using (var stream = file.OpenReadStream())
                    {
                        filePath = await _storageService.SaveFileAsync(stream, tenantId, document.Id, file.FileName, false);
                    }

                    var documentFile = new DocumentFile
                    {
                        DocumentId = document.Id,
                        FileName = file.FileName,
                        FilePath = filePath,
                        FileSize = file.Length,
                        FileHash = fileHash,
                        MimeType = file.ContentType,
                        UploadedBy = userId,
                        UploadedDate = DateTime.UtcNow,
                        TenantId = tenantId
                    };

                    _context.DocumentFiles.Add(documentFile);
                }

                await _context.SaveChangesAsync();

                // Log access
                await LogAccessAsync(document.Id, null, "Upload");

                return Ok(new { id = document.Id, message = "Document uploaded successfully" });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        // POST: api/documents/{id}/upload-version
        [HttpPost("{id}/upload-version")]
        public async Task<IActionResult> UploadVersion(int id, [FromForm] IFormFile file, [FromForm] string? versionNotes = null)
        {
            try
            {
                var tenantId = GetTenantId();
                var userId = GetUserId() ?? 0;

                if (tenantId == 0)
                {
                    return BadRequest(new { error = "TenantId is required" });
                }

                // If userId is not provided, use tenantId as fallback for development
                if (userId == 0)
                {
                    userId = tenantId;
                }

                var document = await _context.Documents
                    .Where(d => d.Id == id && d.TenantId == tenantId && !d.IsDeleted)
                    .FirstOrDefaultAsync();

                if (document == null)
                {
                    return NotFound(new { error = "Document not found" });
                }

                if (!document.RequiresVersionControl)
                {
                    return BadRequest(new { error = "This document does not support version control" });
                }

                if (file == null || file.Length == 0)
                {
                    return BadRequest(new { error = "File is required" });
                }

                if (file.Length > MaxFileSize)
                {
                    return BadRequest(new { error = $"File size exceeds maximum allowed size of {MaxFileSize / (1024 * 1024)}MB" });
                }

                // Get next version number
                var maxVersion = await _context.DocumentVersions
                    .Where(v => v.DocumentId == id)
                    .MaxAsync(v => (int?)v.VersionNumber) ?? 0;

                var nextVersionNumber = maxVersion + 1;

                // Mark all previous versions as not current
                await _context.DocumentVersions
                    .Where(v => v.DocumentId == id && v.IsCurrentVersion)
                    .ExecuteUpdateAsync(v => v.SetProperty(x => x.IsCurrentVersion, false));

                // Calculate file hash and save file
                string fileHash;
                string filePath;

                using (var stream = file.OpenReadStream())
                {
                    fileHash = await _storageService.CalculateFileHashAsync(stream);
                }

                using (var stream = file.OpenReadStream())
                {
                    filePath = await _storageService.SaveFileAsync(stream, tenantId, document.Id, file.FileName, true, nextVersionNumber);
                }

                // Create new version
                var version = new DocumentVersion
                {
                    DocumentId = document.Id,
                    VersionNumber = nextVersionNumber,
                    FileName = file.FileName,
                    FilePath = filePath,
                    FileSize = file.Length,
                    FileHash = fileHash,
                    MimeType = file.ContentType,
                    UploadedBy = userId,
                    UploadedDate = DateTime.UtcNow,
                    VersionNotes = versionNotes,
                    IsCurrentVersion = true,
                    TenantId = tenantId
                };

                _context.DocumentVersions.Add(version);
                await _context.SaveChangesAsync();

                // Update document current version
                document.CurrentVersionNumber = nextVersionNumber;
                document.CurrentVersionId = version.Id;
                document.ModifiedBy = userId;
                document.ModifiedDate = DateTime.UtcNow;
                await _context.SaveChangesAsync();

                // Log access
                await LogAccessAsync(document.Id, version.Id, "Upload");

                return Ok(new { versionId = version.Id, versionNumber = version.VersionNumber, message = "Version uploaded successfully" });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        // GET: api/documents/{id}/versions
        [HttpGet("{id}/versions")]
        public async Task<IActionResult> GetVersions(int id)
        {
            try
            {
                var tenantId = GetTenantId();
                if (tenantId == 0)
                {
                    return BadRequest(new { error = "TenantId is required" });
                }

                var document = await _context.Documents
                    .Where(d => d.Id == id && d.TenantId == tenantId && !d.IsDeleted)
                    .FirstOrDefaultAsync();

                if (document == null)
                {
                    return NotFound(new { error = "Document not found" });
                }

                if (!document.RequiresVersionControl)
                {
                    return BadRequest(new { error = "This document does not support version control" });
                }

                var versions = await _context.DocumentVersions
                    .Where(v => v.DocumentId == id && v.TenantId == tenantId)
                    .OrderByDescending(v => v.VersionNumber)
                    .Select(v => new
                    {
                        id = v.Id,
                        versionNumber = v.VersionNumber,
                        fileName = v.FileName,
                        fileSize = v.FileSize,
                        uploadedBy = v.UploadedBy,
                        uploadedDate = v.UploadedDate,
                        versionNotes = v.VersionNotes,
                        isCurrentVersion = v.IsCurrentVersion
                    })
                    .ToListAsync();

                return Ok(new { versions });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        // GET: api/documents/{id}/download
        [HttpGet("{id}/download")]
        public async Task<IActionResult> DownloadDocument(int id, [FromQuery] int? versionId = null)
        {
            try
            {
                var tenantId = GetTenantId();
                if (tenantId == 0)
                {
                    return BadRequest(new { error = "TenantId is required" });
                }

                var document = await _context.Documents
                    .Where(d => d.Id == id && d.TenantId == tenantId && !d.IsDeleted)
                    .FirstOrDefaultAsync();

                if (document == null)
                {
                    return NotFound(new { error = "Document not found" });
                }

                string filePath;
                string fileName;

                if (document.RequiresVersionControl)
                {
                    DocumentVersion? version;
                    if (versionId.HasValue)
                    {
                        version = await _context.DocumentVersions
                            .Where(v => v.Id == versionId.Value && v.DocumentId == id && v.TenantId == tenantId)
                            .FirstOrDefaultAsync();
                    }
                    else
                    {
                        version = await _context.DocumentVersions
                            .Where(v => v.DocumentId == id && v.IsCurrentVersion && v.TenantId == tenantId)
                            .FirstOrDefaultAsync();
                    }

                    if (version == null)
                    {
                        return NotFound(new { error = "Version not found" });
                    }

                    filePath = version.FilePath;
                    fileName = version.FileName;
                }
                else
                {
                    var file = await _context.DocumentFiles
                        .Where(f => f.DocumentId == id && f.TenantId == tenantId)
                        .FirstOrDefaultAsync();

                    if (file == null)
                    {
                        return NotFound(new { error = "File not found" });
                    }

                    filePath = file.FilePath;
                    fileName = file.FileName;
                }

                if (!_storageService.FileExists(filePath))
                {
                    return NotFound(new { error = "File not found on disk" });
                }

                var fileStream = _storageService.GetFileStream(filePath);
                var contentType = document.MimeType ?? "application/octet-stream";

                // Log access
                await LogAccessAsync(document.Id, versionId, "Download");

                return File(fileStream, contentType, fileName);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        // GET: api/documents/{id}/download-version/{versionId}
        [HttpGet("{id}/download-version/{versionId}")]
        public async Task<IActionResult> DownloadVersion(int id, int versionId)
        {
            return await DownloadDocument(id, versionId);
        }

        // PUT: api/documents/{id}
        [HttpPut("{id}")]
        public async Task<IActionResult> UpdateDocument(int id, [FromBody] UpdateDocumentRequest request)
        {
            try
            {
                var tenantId = GetTenantId();
                var userId = GetUserId() ?? 0;

                if (tenantId == 0)
                {
                    return BadRequest(new { error = "TenantId is required" });
                }

                var document = await _context.Documents
                    .Where(d => d.Id == id && d.TenantId == tenantId && !d.IsDeleted)
                    .FirstOrDefaultAsync();

                if (document == null)
                {
                    return NotFound(new { error = "Document not found" });
                }

                if (!string.IsNullOrWhiteSpace(request.DocumentName))
                {
                    document.DocumentName = request.DocumentName;
                }

                if (request.Description != null)
                {
                    document.Description = request.Description;
                }

                if (request.CategoryId.HasValue)
                {
                    document.CategoryId = request.CategoryId.Value;
                }

                if (request.Tags != null)
                {
                    document.Tags = request.Tags;
                }

                // Update document number if provided
                if (!string.IsNullOrWhiteSpace(request.DocumentNumber))
                {
                    var newNumber = request.DocumentNumber.Trim();
                    
                    // Check if different from current number
                    if (document.DocumentNumber != newNumber)
                    {
                        // Validate uniqueness
                        var exists = await _context.Documents
                            .AnyAsync(d => d.TenantId == tenantId &&
                                          d.DocumentNumber == newNumber &&
                                          d.Id != id &&
                                          !d.IsDeleted);

                        if (exists)
                        {
                            return BadRequest(new { error = $"Document number '{newNumber}' already exists" });
                        }

                        document.DocumentNumber = newNumber;
                        document.IsDocumentNumberAutoGenerated = false;
                    }
                }

                document.ModifiedBy = userId;
                document.ModifiedDate = DateTime.UtcNow;

                await _context.SaveChangesAsync();

                // Log access
                await LogAccessAsync(document.Id, null, "Update");

                return Ok(new { id = document.Id, message = "Document updated successfully" });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        // DELETE: api/documents/{id}
        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteDocument(int id)
        {
            try
            {
                var tenantId = GetTenantId();
                var userId = GetUserId() ?? 0;

                if (tenantId == 0)
                {
                    return BadRequest(new { error = "TenantId is required" });
                }

                var document = await _context.Documents
                    .Where(d => d.Id == id && d.TenantId == tenantId && !d.IsDeleted)
                    .FirstOrDefaultAsync();

                if (document == null)
                {
                    return NotFound(new { error = "Document not found" });
                }

                // Soft delete
                document.IsDeleted = true;
                document.ModifiedBy = userId;
                document.ModifiedDate = DateTime.UtcNow;

                await _context.SaveChangesAsync();

                // Log access
                await LogAccessAsync(document.Id, null, "Delete");

                return Ok(new { message = "Document deleted successfully" });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        // GET: api/documents/categories
        [HttpGet("categories")]
        public async Task<IActionResult> GetCategories()
        {
            try
            {
                var tenantId = GetTenantId();
                if (tenantId == 0)
                {
                    return BadRequest(new { error = "TenantId is required" });
                }

                var categories = await _context.DocumentCategories
                    .Where(c => c.TenantId == tenantId && c.IsActive)
                    .OrderBy(c => c.CategoryName)
                    .Select(c => new
                    {
                        id = c.Id,
                        categoryName = c.CategoryName,
                        description = c.Description
                    })
                    .ToListAsync();

                return Ok(new { categories });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        // POST: api/documents/categories
        [HttpPost("categories")]
        public async Task<IActionResult> CreateCategory([FromBody] CreateCategoryRequest request)
        {
            try
            {
                var tenantId = GetTenantId();
                var userId = GetUserId() ?? 0;

                if (tenantId == 0)
                {
                    return BadRequest(new { error = "TenantId is required" });
                }

                // If userId is not provided, use tenantId as fallback for development
                if (userId == 0)
                {
                    userId = tenantId;
                }

                if (string.IsNullOrWhiteSpace(request.CategoryName))
                {
                    return BadRequest(new { error = "Category name is required" });
                }

                // Check if category already exists
                var exists = await _context.DocumentCategories
                    .AnyAsync(c => c.CategoryName == request.CategoryName && c.TenantId == tenantId);

                if (exists)
                {
                    return BadRequest(new { error = "Category already exists" });
                }

                var category = new DocumentCategory
                {
                    CategoryName = request.CategoryName,
                    Description = request.Description,
                    TenantId = tenantId,
                    CreatedBy = userId,
                    CreatedDate = DateTime.UtcNow,
                    IsActive = true
                };

                _context.DocumentCategories.Add(category);
                await _context.SaveChangesAsync();

                return Ok(new { id = category.Id, message = "Category created successfully" });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        // Helper method to generate document number
        private async Task<string> GenerateDocumentNumber(int tenantId, int? categoryId = null)
        {
            var year = DateTime.UtcNow.Year;
            var prefix = "DOC"; // Default prefix

            // Optional: Could get prefix from category if CategoryPrefix field exists
            // For now, using default "DOC" prefix

            // Get max document number for this year (only auto-generated ones)
            var existingDocs = await _context.Documents
                .Where(d => d.TenantId == tenantId &&
                            d.DocumentNumber != null &&
                            d.IsDocumentNumberAutoGenerated &&
                            d.DocumentNumber.StartsWith($"{prefix}-{year}-"))
                .ToListAsync();

            int nextNumber = 1;
            if (existingDocs.Any())
            {
                var maxNumber = existingDocs
                    .Select(d =>
                    {
                        var parts = d.DocumentNumber.Split('-');
                        if (parts.Length >= 3 && int.TryParse(parts[2], out int num))
                        {
                            return num;
                        }
                        return 0;
                    })
                    .Max();
                nextNumber = maxNumber + 1;
            }

            return $"{prefix}-{year}-{nextNumber:D4}";
        }

        // Helper method to log access
        private async Task LogAccessAsync(int documentId, int? versionId, string action)
        {
            try
            {
                var tenantId = GetTenantId();
                var userId = GetUserId() ?? 0;

                if (tenantId == 0 || userId == 0)
                {
                    return;
                }

                var log = new DocumentAccessLog
                {
                    DocumentId = documentId,
                    VersionId = versionId,
                    UserId = userId,
                    Action = action,
                    ActionDate = DateTime.UtcNow,
                    IPAddress = HttpContext.Connection.RemoteIpAddress?.ToString(),
                    UserAgent = Request.Headers["User-Agent"].ToString(),
                    TenantId = tenantId
                };

                _context.DocumentAccessLogs.Add(log);
                await _context.SaveChangesAsync();
            }
            catch
            {
                // Silently fail logging
            }
        }
    }

    public class UpdateDocumentRequest
    {
        public string? DocumentName { get; set; }
        public string? Description { get; set; }
        public int? CategoryId { get; set; }
        public string? Tags { get; set; }
        public string? DocumentNumber { get; set; }
    }

    public class CreateCategoryRequest
    {
        public string CategoryName { get; set; }
        public string? Description { get; set; }
    }
}

