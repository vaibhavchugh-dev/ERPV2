using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using CimmpleAPI.Data;
using CimmpleAPI.Data.Models;
using CimmpleAPI.Data.Dtos;
using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.AspNetCore.Hosting;
using System.IO;
using System.Threading.Tasks;

namespace CimmpleAPI.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class LocationController : ApiBaseController
    {
        private readonly CimmpleDbContext _context;
        private readonly IWebHostEnvironment _environment;

        public LocationController(CimmpleDbContext context, IWebHostEnvironment environment)
        {
            _context = context;
            _environment = environment;
        }

        [HttpGet("GetLocations")]
        public IActionResult GetLocations([FromQuery] int tenantid)
        {
            try
            {
                var rows = _context.Locations
                    .AsNoTracking()
                    .Where(l => l.TenantId == tenantid)
                    .ToList();
                var dict = rows.ToDictionary(x => x.LocationId);

                var locations = rows.Select(l =>
                {
                    var parentName = l.ParentLocationId.HasValue && dict.TryGetValue(l.ParentLocationId.Value, out var p)
                        ? (string.IsNullOrWhiteSpace(p.Name) ? p.Code : p.Name)
                        : null;
                    return new
                    {
                        locationId = l.LocationId,
                        code = l.Code ?? "",
                        name = l.Name ?? "",
                        address = l.Address ?? "",
                        city = l.city ?? "",
                        state = l.state ?? "",
                        zip = l.zip ?? "",
                        country = l.Country ?? "",
                        region = l.Region ?? "",
                        email = l.email ?? "",
                        phone = l.phone ?? "",
                        webaddress = l.webaddress ?? "",
                        status = l.Status ?? "Active",
                        apartment = l.Region ?? "",
                        parentLocationId = l.ParentLocationId,
                        parentName,
                        locType = l.LocType,
                        locTypeName = LocationKind.GetDisplayName(l.LocType),
                        displayPath = BuildDisplayPath(l, dict)
                    };
                }).ToList();

                return Ok(new { result = locations });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        private static string BuildDisplayPath(Location start, Dictionary<int, Location> dict)
        {
            var parts = new List<string>();
            Location? cur = start;
            var guard = 0;
            while (cur != null && guard++ < 64)
            {
                parts.Insert(0, string.IsNullOrWhiteSpace(cur.Name) ? cur.Code ?? "" : cur.Name);
                if (cur.ParentLocationId == null || !dict.TryGetValue(cur.ParentLocationId.Value, out var parent))
                    break;
                cur = parent;
            }
            return string.Join(" > ", parts);
        }

        [HttpGet("GetLocationById")]
        public IActionResult GetLocationById([FromQuery] int locationId, [FromQuery] int tenantId)
        {
            try
            {
                var location = _context.Locations
                    .Where(l => l.LocationId == locationId && l.TenantId == tenantId)
                    .FirstOrDefault();

                if (location == null)
                {
                    return NotFound(new { error = "Location not found" });
                }

                // Get logo attachment if exists
                var logoAttachment = _context.LogoAttachment
                    .Where(la => la.locationId == locationId && la.TenantID == tenantId)
                    .OrderByDescending(la => la.Id)
                    .FirstOrDefault();

                string logoUrl = null;
                if (logoAttachment != null && !string.IsNullOrEmpty(logoAttachment.UploadFile))
                {
                    logoUrl = $"/{logoAttachment.UploadFile.Replace('\\', '/')}";
                }

                var rows = _context.Locations.AsNoTracking()
                    .Where(l => l.TenantId == tenantId)
                    .ToList();
                var dict = rows.ToDictionary(x => x.LocationId);
                var parentName = location.ParentLocationId.HasValue && dict.TryGetValue(location.ParentLocationId.Value, out var p)
                    ? (string.IsNullOrWhiteSpace(p.Name) ? p.Code : p.Name)
                    : null;

                var locationData = new
                {
                    locationId = location.LocationId,
                    code = location.Code ?? "",
                    name = location.Name ?? "",
                    address = location.Address ?? "",
                    apartment = location.Region ?? "",
                    city = location.city ?? "",
                    state = location.state ?? "",
                    zip = location.zip ?? "",
                    country = location.Country ?? "US",
                    region = location.Region ?? "",
                    email = location.email ?? "",
                    phone = location.phone ?? "",
                    webaddress = location.webaddress ?? "",
                    status = location.Status ?? "Active",
                    logoUrl = logoUrl,
                    parentLocationId = location.ParentLocationId,
                    parentName,
                    locType = location.LocType,
                    locTypeName = LocationKind.GetDisplayName(location.LocType),
                    displayPath = BuildDisplayPath(location, dict)
                };

                return Ok(new { result = locationData });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpPost("SaveLocation")]
        public IActionResult SaveLocation([FromBody] LocationMasterReq request)
        {
            try
            {
                if (request == null)
                    return BadRequest(new { error = "Request is null" });

                Location location;

                if (request.LocationId > 0)
                {
                    location = _context.Locations
                        .FirstOrDefault(l => l.LocationId == request.LocationId && l.TenantId == request.TenantId);

                    if (location == null)
                        return NotFound(new { error = "Location not found" });

                    location.Code = request.Code ?? location.Code ?? "";
                    location.Name = request.Name ?? location.Name ?? "";
                    location.Address = request.Address ?? location.Address ?? "";
                    location.Region = !string.IsNullOrWhiteSpace(request.Apartment) ? request.Apartment : (request.Region ?? location.Region ?? "");
                    location.city = request.City ?? location.city ?? "";
                    location.state = request.State ?? location.state ?? "";
                    location.zip = request.Zip ?? location.zip ?? "";
                    location.Country = request.Country ?? location.Country ?? "US";
                    location.email = request.Email ?? location.email ?? "";
                    location.phone = request.Phone ?? location.phone ?? "";
                    location.webaddress = request.WebAddress ?? location.webaddress ?? "";
                    location.Status = request.Status ?? location.Status ?? "Active";

                    // Parent is fixed after create (avoids moving subtrees / cycles).
                    if (location.ParentLocationId == null)
                        location.LocType = LocationKind.BusinessSite;
                    else
                    {
                        var parent = _context.Locations.FirstOrDefault(l =>
                            l.LocationId == location.ParentLocationId.Value && l.TenantId == request.TenantId);
                        if (parent == null)
                            return BadRequest(new { error = "Parent location not found." });
                        var desired = request.LocType > 0 ? request.LocType : location.LocType;
                        if (!LocationKind.IsValidParentChild(parent.LocType, desired))
                            return BadRequest(new { error = "Invalid location type for this parent." });
                        location.LocType = desired;
                    }
                }
                else
                {
                    int? parentId = request.ParentLocationId.HasValue && request.ParentLocationId.Value > 0
                        ? request.ParentLocationId
                        : null;

                    int childLocType;
                    if (parentId == null)
                        childLocType = LocationKind.BusinessSite;
                    else
                    {
                        var parent = _context.Locations.FirstOrDefault(l =>
                            l.LocationId == parentId.Value && l.TenantId == request.TenantId);
                        if (parent == null)
                            return BadRequest(new { error = "Parent location not found." });
                        childLocType = request.LocType > 0
                            ? request.LocType
                            : Math.Min(parent.LocType + 1, LocationKind.Bin);
                        if (!LocationKind.IsValidParentChild(parent.LocType, childLocType))
                            return BadRequest(new { error = "Invalid location type for the selected parent." });
                    }

                    location = new Location
                    {
                        TenantId = request.TenantId,
                        Code = request.Code ?? "",
                        Name = request.Name ?? "",
                        Address = request.Address ?? "",
                        city = request.City ?? "",
                        state = request.State ?? "",
                        zip = request.Zip ?? "",
                        Country = request.Country ?? "US",
                        Region = !string.IsNullOrWhiteSpace(request.Apartment) ? request.Apartment : (request.Region ?? ""),
                        email = request.Email ?? "",
                        phone = request.Phone ?? "",
                        webaddress = request.WebAddress ?? "",
                        Status = request.Status ?? "Active",
                        LocType = childLocType,
                        ParentLocationId = parentId
                    };

                    _context.Locations.Add(location);
                }

                _context.SaveChanges();

                return Ok(new { result = new { locationId = location.LocationId, message = "Location saved successfully" } });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpPost("UploadLogo")]
        public async Task<IActionResult> UploadLogo([FromForm] int locationId, [FromForm] int tenantId, [FromForm] IFormFile file)
        {
            try
            {
                if (file == null || file.Length == 0)
                {
                    return BadRequest(new { error = "Logo file is required" });
                }

                // Validate file type
                var allowedExtensions = new[] { ".jpg", ".jpeg", ".png", ".gif", ".svg" };
                var fileExtension = Path.GetExtension(file.FileName).ToLowerInvariant();
                if (!allowedExtensions.Contains(fileExtension))
                {
                    return BadRequest(new { error = "Invalid file type. Only image files (jpg, jpeg, png, gif, svg) are allowed." });
                }

                // Validate file size (max 5MB)
                const long maxFileSize = 5 * 1024 * 1024; // 5MB
                if (file.Length > maxFileSize)
                {
                    return BadRequest(new { error = "File size exceeds maximum allowed size of 5MB" });
                }

                // Verify location exists
                var location = _context.Locations
                    .FirstOrDefault(l => l.LocationId == locationId && l.TenantId == tenantId);

                if (location == null)
                {
                    return NotFound(new { error = "Location not found" });
                }

                if (location.LocType != LocationKind.BusinessSite)
                {
                    return BadRequest(new { error = "Logos are only supported on business sites (top-level locations)." });
                }

                // Get user ID
                var userId = GetUserId() ?? 0;
                if (userId == 0)
                {
                    userId = tenantId; // Fallback for development
                }

                // Create uploads/logos directory structure
                // Use WebRootPath if available, otherwise ContentRootPath + wwwroot
                var webRootPath = _environment.WebRootPath ?? Path.Combine(_environment.ContentRootPath, "wwwroot");
                var logosPath = Path.Combine(webRootPath, "uploads", "logos", tenantId.ToString(), locationId.ToString());
                
                if (!Directory.Exists(logosPath))
                {
                    Directory.CreateDirectory(logosPath);
                }

                // Generate unique filename
                var timestamp = DateTime.UtcNow.ToString("yyyyMMddHHmmss");
                var uniqueFileName = $"logo_{timestamp}{fileExtension}";
                var filePath = Path.Combine(logosPath, uniqueFileName);

                // Save file
                using (var stream = new FileStream(filePath, FileMode.Create))
                {
                    await file.CopyToAsync(stream);
                }

                // Calculate relative path from wwwroot
                var relativePath = Path.Combine("uploads", "logos", tenantId.ToString(), locationId.ToString(), uniqueFileName)
                    .Replace('\\', '/');

                // Delete old logo attachment if exists
                var oldLogo = _context.LogoAttachment
                    .Where(la => la.locationId == locationId && la.TenantID == tenantId)
                    .ToList();

                foreach (var oldLogoItem in oldLogo)
                {
                    // Delete old file if exists
                    if (!string.IsNullOrEmpty(oldLogoItem.UploadFile))
                    {
                        var oldFilePath = Path.Combine(webRootPath, oldLogoItem.UploadFile.Replace('/', Path.DirectorySeparatorChar));
                        if (System.IO.File.Exists(oldFilePath))
                        {
                            try
                            {
                                System.IO.File.Delete(oldFilePath);
                            }
                            catch
                            {
                                // Ignore deletion errors
                            }
                        }
                    }
                    _context.LogoAttachment.Remove(oldLogoItem);
                }

                // Save deletions first before adding new record
                if (oldLogo.Count > 0)
                {
                    await _context.SaveChangesAsync();
                }

                // Generate unique file number
                var existingFileNumbers = _context.LogoAttachment
                    .Where(la => la.TenantID == tenantId)
                    .Select(la => la.FileUniqueno)
                    .ToList();
                
                var maxFileUniqueNo = existingFileNumbers.Count > 0 ? existingFileNumbers.Max() : 0;

                // Create new logo attachment record
                var logoAttachment = new LogoAttachment
                {
                    locationId = locationId,
                    Name = file.FileName ?? "logo",
                    size = (int)file.Length,
                    FileUniqueno = maxFileUniqueNo + 1,
                    UploadFile = relativePath ?? "",
                    TenantID = tenantId,
                    FileCode = "LOGO",
                    Pageno = "1",
                    createdby = userId
                };

                _context.LogoAttachment.Add(logoAttachment);
                await _context.SaveChangesAsync();

                return Ok(new { result = new { logoUrl = $"/{relativePath}", message = "Logo uploaded successfully" } });
            }
            catch (Exception ex)
            {
                // Log the full exception details for debugging
                var errorMessage = ex.Message;
                var innerException = ex.InnerException?.Message ?? "";
                var stackTrace = ex.StackTrace ?? "";
                
                Console.WriteLine($"Error uploading logo: {errorMessage}");
                Console.WriteLine($"Inner exception: {innerException}");
                Console.WriteLine($"Stack trace: {stackTrace}");
                
                return StatusCode(500, new { 
                    error = errorMessage, 
                    innerException = innerException,
                    details = stackTrace 
                });
            }
        }

        [HttpDelete("DeleteLogo")]
        public IActionResult DeleteLogo([FromQuery] int locationId, [FromQuery] int tenantId)
        {
            try
            {
                var logoAttachments = _context.LogoAttachment
                    .Where(la => la.locationId == locationId && la.TenantID == tenantId)
                    .ToList();

                // Get web root path once
                var deleteWebRootPath = _environment.WebRootPath ?? Path.Combine(_environment.ContentRootPath, "wwwroot");
                
                foreach (var logoAttachment in logoAttachments)
                {
                    // Delete file if exists
                    if (!string.IsNullOrEmpty(logoAttachment.UploadFile))
                    {
                        var filePath = Path.Combine(deleteWebRootPath, logoAttachment.UploadFile.Replace('/', Path.DirectorySeparatorChar));
                        if (System.IO.File.Exists(filePath))
                        {
                            try
                            {
                                System.IO.File.Delete(filePath);
                            }
                            catch
                            {
                                // Ignore deletion errors
                            }
                        }
                    }
                    _context.LogoAttachment.Remove(logoAttachment);
                }

                _context.SaveChanges();

                return Ok(new { result = new { message = "Logo deleted successfully" } });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpGet("CheckLocationDeletionImpact")]
        public IActionResult CheckLocationDeletionImpact([FromQuery] int locationId, [FromQuery] int tenantId)
        {
            try
            {
                var location = _context.Locations
                    .FirstOrDefault(l => l.LocationId == locationId && l.TenantId == tenantId);

                if (location == null)
                {
                    return NotFound(new { error = "Location not found" });
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

                // Check for User Mappings
                var userMappings = _context.UserMapping
                    .Where(um => um.locationId == locationId)
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

                // Check for Logo Attachments
                var logoAttachments = _context.LogoAttachment
                    .Where(la => la.locationId == locationId && la.TenantID == tenantId)
                    .ToList();

                if (logoAttachments.Any())
                {
                    impact.WillBeDeleted.Add(new ImpactedEntity
                    {
                        EntityType = "Logo Attachments",
                        Count = logoAttachments.Count,
                        Description = $"{logoAttachments.Count} logo attachment(s) will be deleted"
                    });
                }

                var childCount = _context.Locations.Count(l => l.ParentLocationId == locationId);
                if (childCount > 0)
                {
                    impact.CanDelete = false;
                    impact.BlockingReasons.Add($"{childCount} child location(s) exist under this record. Remove or reassign them first.");
                }

                var invBal = _context.InventoryBalance.Count(ib => ib.LocationId == locationId && ib.Tenantid == tenantId);
                if (invBal > 0)
                {
                    impact.CanDelete = false;
                    impact.BlockingReasons.Add($"{invBal} inventory balance row(s) reference this location.");
                }

                var lotBal = _context.InventoryLotBalance.Count(ib => ib.LocationId == locationId && ib.Tenantid == tenantId);
                if (lotBal > 0)
                {
                    impact.CanDelete = false;
                    impact.BlockingReasons.Add($"{lotBal} lot balance row(s) reference this location.");
                }

                var invTx = _context.InventoryTransaction.Count(ib => ib.LocationId == locationId && ib.Tenantid == tenantId);
                if (invTx > 0)
                {
                    impact.CanDelete = false;
                    impact.BlockingReasons.Add($"{invTx} inventory transaction(s) reference this location.");
                }

                impact.Warnings.Add("This action cannot be undone");

                return Ok(new { result = impact });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message, stackTrace = ex.StackTrace });
            }
        }

        [HttpDelete("DeleteLocation")]
        public IActionResult DeleteLocation([FromQuery] int locationId, [FromQuery] int tenantId)
        {
            try
            {
                var location = _context.Locations
                    .FirstOrDefault(l => l.LocationId == locationId && l.TenantId == tenantId);

                if (location == null)
                {
                    return NotFound(new { error = "Location not found" });
                }

                if (_context.Locations.Any(l => l.ParentLocationId == locationId))
                    return BadRequest(new { error = "Cannot delete: child locations exist. Remove or reassign them first." });

                if (_context.InventoryBalance.Any(ib => ib.LocationId == locationId && ib.Tenantid == tenantId))
                    return BadRequest(new { error = "Cannot delete: inventory balances exist for this location." });

                if (_context.InventoryLotBalance.Any(ib => ib.LocationId == locationId && ib.Tenantid == tenantId))
                    return BadRequest(new { error = "Cannot delete: lot balances exist for this location." });

                if (_context.InventoryTransaction.Any(ib => ib.LocationId == locationId && ib.Tenantid == tenantId))
                    return BadRequest(new { error = "Cannot delete: inventory transactions exist for this location." });

                // Delete related entities
                var userMappings = _context.UserMapping
                    .Where(um => um.locationId == locationId)
                    .ToList();
                _context.UserMapping.RemoveRange(userMappings);

                // Delete logo attachments and files
                var logoAttachments = _context.LogoAttachment
                    .Where(la => la.locationId == locationId && la.TenantID == tenantId)
                    .ToList();

                var webRootPath = _environment.WebRootPath ?? Path.Combine(_environment.ContentRootPath, "wwwroot");
                foreach (var logoAttachment in logoAttachments)
                {
                    if (!string.IsNullOrEmpty(logoAttachment.UploadFile))
                    {
                        var filePath = Path.Combine(webRootPath, logoAttachment.UploadFile.Replace('/', Path.DirectorySeparatorChar));
                        if (System.IO.File.Exists(filePath))
                        {
                            try
                            {
                                System.IO.File.Delete(filePath);
                            }
                            catch
                            {
                                // Ignore deletion errors
                            }
                        }
                    }
                }
                _context.LogoAttachment.RemoveRange(logoAttachments);

                // Delete the location
                _context.Locations.Remove(location);
                _context.SaveChanges();

                return Ok(new { result = new { message = "Location deleted successfully" } });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message, stackTrace = ex.StackTrace });
            }
        }
    }

    public class LocationMasterReq
    {
        public int LocationId { get; set; }
        public int TenantId { get; set; }
        public string Code { get; set; }
        public string Name { get; set; }
        public string Address { get; set; }
        public string Apartment { get; set; }
        public string City { get; set; }
        public string State { get; set; }
        public string Zip { get; set; }
        public string Country { get; set; }
        public string Region { get; set; }
        public string Email { get; set; }
        public string Phone { get; set; }
        public string WebAddress { get; set; }
        public string Status { get; set; }

        /// <summary>Optional parent when creating a warehouse / storage node. Omit or 0 for a new business site.</summary>
        public int? ParentLocationId { get; set; }

        /// <summary>
        /// <see cref="LocationKind"/>. For new child rows, if 0 the server defaults to parent type + 1.
        /// </summary>
        public int LocType { get; set; }
    }
}

