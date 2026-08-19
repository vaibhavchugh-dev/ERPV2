using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using CimmpleAPI.Data;
using CimmpleAPI.Data.Models;
using CimmpleAPI.Data.Dtos;
using CimmpleAPI.Services;
using CimmpleAPI.Services.Auth;
using CimmpleAPI.Utilities;
using Microsoft.WindowsAzure.Storage;
using Microsoft.WindowsAzure.Storage.Blob;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading.Tasks;

namespace CimmpleAPI.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class EmployeeController : ApiBaseController
    {
        private readonly CimmpleDbContext _context;
        private readonly IWebHostEnvironment _environment;
        private readonly IConfiguration _configuration;
        private readonly IAuthService _authService;
        private readonly FaceRecognitionService _faceRecognition;

        public EmployeeController(
            CimmpleDbContext context,
            IWebHostEnvironment environment,
            IConfiguration configuration,
            IAuthService authService,
            FaceRecognitionService faceRecognition)
        {
            _context = context;
            _environment = environment;
            _configuration = configuration;
            _authService = authService;
            _faceRecognition = faceRecognition;
        }

        [HttpGet("GetEmployees")]
        public IActionResult GetEmployees([FromQuery] int tenantid)
        {
            try
            {
                var users = _context.UserDetails
                    .Where(u => u.TenantID == tenantid && (u.VendorId == null || u.VendorId == 0))
                    .Select(u => new
                    {
                        u.User_UniqueID,
                        u.FirstName,
                        u.LastName,
                        u.Email,
                        u.UserName,
                        u.Status,
                        u.Role,
                        u.EmployeeType,
                        u.EmpCode,
                        u.Phone1,
                        u.Date_of_hire,
                        u.Address,
                        u.City,
                        u.State,
                        u.Zip,
                        u.ProfilePic,
                        u.DefaultLocationId,
                        u.CanAccessAllLocations,
                        HasPassword = u.Password != null && u.Password != ""
                    })
                    .ToList();

                var roleIds = users.Where(u => u.Role.HasValue).Select(u => u.Role!.Value).Distinct().ToList();
                var roles = _context.UserRole
                    .Where(r => roleIds.Contains(r.RoleID))
                    .ToDictionary(r => r.RoleID, r => r.RoleName ?? "");

                var userIds = users.Select(u => u.User_UniqueID).ToList();
                var enrolledIds = _context.EmployeeFace
                    .Where(f => f.TenantId == tenantid && f.AzureFaceRegistered && userIds.Contains(f.UserUniqueId))
                    .Select(f => f.UserUniqueId)
                    .ToHashSet();
                var mappings = _context.UserMapping
                    .Where(m => userIds.Contains(m.userId))
                    .Select(m => new { m.userId, m.locationId })
                    .ToList();

                var locationIds = mappings.Select(m => m.locationId)
                    .Concat(users.Where(u => u.DefaultLocationId.HasValue).Select(u => u.DefaultLocationId!.Value))
                    .Distinct()
                    .ToList();

                var locationNames = _context.Locations
                    .Where(l => l.TenantId == tenantid && locationIds.Contains(l.LocationId))
                    .ToDictionary(l => l.LocationId, l => l.Name ?? l.Code ?? ("#" + l.LocationId));

                var mappingsByUser = mappings
                    .GroupBy(m => m.userId)
                    .ToDictionary(g => g.Key, g => g.Select(x => x.locationId).ToList());

                var employees = users.Select(u =>
                {
                    var userName = u.UserName ?? "";
                    var hasPassword = u.HasPassword;
                    var hasLoginAccess = hasPassword && !string.IsNullOrWhiteSpace(userName);

                    var assignedIds = mappingsByUser.TryGetValue(u.User_UniqueID, out var ids)
                        ? ids
                        : new List<int>();

                    string locationName = "";
                    if (u.DefaultLocationId.HasValue &&
                        locationNames.TryGetValue(u.DefaultLocationId.Value, out var defaultName))
                    {
                        locationName = defaultName;
                        if (u.CanAccessAllLocations)
                        {
                            locationName += " (all)";
                        }
                        else if (assignedIds.Count > 1)
                        {
                            locationName += $" (+{assignedIds.Count - 1})";
                        }
                    }
                    else if (assignedIds.Count > 0)
                    {
                        var firstId = assignedIds[0];
                        locationName = locationNames.TryGetValue(firstId, out var firstName)
                            ? firstName
                            : $"#{firstId}";
                        if (assignedIds.Count > 1)
                        {
                            locationName += $" (+{assignedIds.Count - 1})";
                        }
                    }
                    else if (u.CanAccessAllLocations)
                    {
                        locationName = "All locations";
                    }

                    return new
                    {
                        user_UniqueID = u.User_UniqueID,
                        firstName = u.FirstName,
                        lastName = u.LastName,
                        email = u.Email,
                        userName,
                        status = u.Status ?? "Active",
                        role = u.Role,
                        roleName = u.Role.HasValue && roles.TryGetValue(u.Role.Value, out var rn) ? rn : "",
                        employeeType = u.EmployeeType ?? "",
                        empCode = u.EmpCode ?? "",
                        phone1 = u.Phone1 ?? "",
                        date_of_hire = u.Date_of_hire ?? "",
                        address = u.Address ?? "",
                        city = u.City ?? "",
                        state = u.State ?? "",
                        zip = u.Zip ?? "",
                        profilePic = u.ProfilePic ?? "",
                        locationName,
                        defaultLocationId = u.DefaultLocationId,
                        canAccessAllLocations = u.CanAccessAllLocations,
                        hasPassword,
                        hasLoginAccess,
                        faceEnrolled = enrolledIds.Contains(u.User_UniqueID)
                    };
                }).ToList();

                return Ok(new { result = employees });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpGet("GetEmployeeById")]
        public IActionResult GetEmployeeById([FromQuery] int employeeId, [FromQuery] int tenantId)
        {
            try
            {
                var employee = _context.UserDetails
                    .Where(u => u.User_UniqueID == employeeId && u.TenantID == tenantId)
                    .FirstOrDefault();

                if (employee == null)
                {
                    return NotFound(new { error = "Employee not found" });
                }

                var role = _context.UserRole
                    .Where(r => r.RoleID == employee.Role)
                    .FirstOrDefault();

                // Get location mappings
                var locationMappings = _context.UserMapping
                    .Where(um => um.userId == employeeId)
                    .Select(um => um.locationId)
                    .ToList();

                var result = new
                {
                    user_UniqueID = employee.User_UniqueID,
                    firstName = employee.FirstName,
                    lastName = employee.LastName,
                    email = employee.Email,
                    userName = employee.UserName,
                    status = employee.Status ?? "Active",
                    role = employee.Role,
                    roleName = role != null ? role.RoleName : "",
                    employeeType = employee.EmployeeType ?? "",
                    employeeCategory = "",
                    empCode = employee.EmpCode ?? "",
                    department = "",
                    phone1 = employee.Phone1 ?? "",
                    phone2 = employee.Phone2 ?? "",
                    date_of_hire = employee.Date_of_hire ?? "",
                    address = employee.Address ?? "",
                    apartment = "",
                    city = employee.City ?? "",
                    state = employee.State ?? "",
                    zip = employee.Zip ?? "",
                    country = "US", // Default to US for now, can be added to UserDetail model later
                    locationId = locationMappings.FirstOrDefault() > 0 ? (int?)locationMappings.FirstOrDefault() : null,
                    locationIds = locationMappings,
                    defaultLocationId = employee.DefaultLocationId,
                    canAccessAllLocations = employee.CanAccessAllLocations,
                    tenantID = employee.TenantID,
                    dob = employee.DOB ?? "",
                    ssn = employee.SSN ?? "",
                    profilePic = employee.ProfilePic ?? "",
                    faceEnrolled = _context.EmployeeFace.Any(f =>
                        f.TenantId == tenantId
                        && f.UserUniqueId == employeeId
                        && f.AzureFaceRegistered),
                    // True only when a password exists — username alone is not enough to log in
                    hasPassword = !string.IsNullOrEmpty(employee.Password),
                    canLogin = !string.IsNullOrWhiteSpace(employee.UserName)
                        && !string.IsNullOrEmpty(employee.Password)
                        && string.Equals(employee.Status, "Active", StringComparison.OrdinalIgnoreCase)
                };

                return Ok(new { result = result });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpPost("SaveEmployee")]
        public async Task<IActionResult> SaveEmployee([FromBody] EmployeeMasterReq request)
        {
            return await SaveEmployeeInternal(request, null);
        }

        [HttpPost("SaveEmployeeData")]
        [Consumes("multipart/form-data")]
        public async Task<IActionResult> SaveEmployeeData([FromForm] IFormFile? file, [FromForm] string? formField)
        {
            if (string.IsNullOrEmpty(formField))
            {
                return BadRequest(new { error = "formField is required" });
            }

            try
            {
                var options = new System.Text.Json.JsonSerializerOptions { PropertyNameCaseInsensitive = true };
                var request = System.Text.Json.JsonSerializer.Deserialize<EmployeeMasterReq>(formField, options);
                if (request == null)
                {
                    return BadRequest(new { error = "Invalid request payload" });
                }

                return await SaveEmployeeInternal(request, file);
            }
            catch (Exception ex)
            {
                return BadRequest(new { error = $"Failed to parse payload: {ex.Message}" });
            }
        }

        [HttpGet("GetProfilePic")]
        [AllowAnonymous]
        public async Task<IActionResult> GetProfilePic([FromQuery] int userId, [FromQuery] int? tenantId)
        {
            try
            {
                var user = _context.UserDetails.AsNoTracking().FirstOrDefault(u => u.User_UniqueID == userId);
                int effTenantId = (tenantId.HasValue && tenantId.Value > 0) ? tenantId.Value : (user?.TenantID ?? 0);

                // 1. Try Azure Blob Directory Listing (matching WorkFlowAPI_New)
                string? cloudConn = _configuration?["AzureConnection:storageConnectionString"]
                         ?? _configuration?["AzureConnString"];

                if (string.IsNullOrEmpty(cloudConn))
                {
                    try
                    {
                        cloudConn = _context.gcwConfig
                            .Where(e => e.KeyName.ToLower() == "AzureConnString".ToLower())
                            .Select(e => e.KeyValue)
                            .FirstOrDefault();
                    }
                    catch
                    {
                        // gcwConfig table may not exist in database
                    }
                }

                if (user != null && !string.IsNullOrEmpty(user.ProfilePic))
                {
                    string fileName = Path.GetFileName(user.ProfilePic);
                    var fileInfo = new FileInfor
                    {
                        ContainerName = "data",
                        Dirname = "ProfilePic/" + effTenantId + "/" + userId,
                        UploadFileName = fileName,
                        tenantID = effTenantId,
                        type = "profilepic",
                        userUniqueno = userId
                    };

                    UploadFile uploadfile = new UploadFile(_context, _configuration);
                    byte[]? blobBytes = uploadfile.GetFilebyte(fileInfo);
                    if (blobBytes != null && blobBytes.Length > 0)
                    {
                        var ext = Path.GetExtension(fileName).ToLower();
                        var contentType = ext switch
                        {
                            ".png" => "image/png",
                            ".gif" => "image/gif",
                            ".webp" => "image/webp",
                            ".svg" => "image/svg+xml",
                            _ => "image/jpeg"
                        };
                        return File(blobBytes, contentType, fileName);
                    }
                }

    

                return NotFound("No profile picture found for this user");
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"Failed to fetch profile picture: {ex.Message}");
            }
        }

        private async Task<IActionResult> SaveEmployeeInternal(EmployeeMasterReq request, IFormFile? file)
        {
            try
            {
                if (request == null)
                {
                    return BadRequest(new { error = "Request cannot be null" });
                }

                if (string.IsNullOrWhiteSpace(request.FirstName))
                {
                    return BadRequest(new { error = "First Name is required" });
                }

                if (string.IsNullOrWhiteSpace(request.LastName))
                {
                    return BadRequest(new { error = "Last Name is required" });
                }

                var isNew = request.User_UniqueID == 0;
                UserDetail employee;

                if (isNew)
                {
                    if (!string.IsNullOrWhiteSpace(request.UserName))
                    {
                        var duplicate = _context.UserDetails
                            .Any(u => u.UserName == request.UserName && u.TenantID == request.TenantID);

                        if (duplicate)
                        {
                            return BadRequest(new { error = "Username already exists" });
                        }
                    }

                    employee = new UserDetail();
                    employee.TenantID = request.TenantID;
                    employee.CreateDate = DateTime.UtcNow;
                    employee.PwdResetDate = DateTime.UtcNow;
                    employee.Password = "";
                    employee.PasswordSalt = "";
                    employee.UserToken = "";
                    employee.PwdChangeStatus = "No";
                    employee.ChangePassword = "No";
                    employee.HID = "";
                    employee.PrimaryContact = "";
                    employee.Date_of_termination = "";
                    employee.Termination_Reason = "";
                    employee.ValidateStatus = "";
                    employee.ChangedBy = "";
                    employee.BlockedPhone = "";
                    employee.PwdType = "";
                    employee.PhoneUpdateStatus = "";
                    employee.PrimaryMethod = "";
                    employee.ContractId = "";
                    employee.SearchSSN = "";
                }
                else
                {
                    employee = _context.UserDetails
                        .FirstOrDefault(u => u.User_UniqueID == request.User_UniqueID && u.TenantID == request.TenantID);

                    if (employee == null)
                    {
                        return NotFound(new { error = "Employee not found" });
                    }

                    if (!string.IsNullOrWhiteSpace(request.UserName) && employee.UserName != request.UserName)
                    {
                        var duplicate = _context.UserDetails
                            .Any(u => u.UserName == request.UserName && u.TenantID == request.TenantID && u.User_UniqueID != request.User_UniqueID);

                        if (duplicate)
                        {
                            return BadRequest(new { error = "Username already exists" });
                        }
                    }
                }

                employee.FirstName = request.FirstName;
                employee.LastName = request.LastName;
                employee.Email = request.Email ?? "";
                employee.UserName = request.UserName ?? "";
                employee.Status = request.Status ?? "Active";
                employee.Role = request.Role;
                employee.EmployeeType = request.EmployeeType ?? "";
                employee.EmpCode = request.EmpCode ?? "";
                employee.Phone1 = request.Phone1 ?? "";
                employee.Phone2 = request.Phone2 ?? "";
                employee.Date_of_hire = request.Date_of_hire ?? "";
                employee.Address = request.Address ?? "";
                employee.City = request.City ?? "";
                employee.State = request.State ?? "";
                employee.Zip = request.Zip ?? "";
                employee.Street = "";
                employee.DOB = request.DOB ?? "";
                employee.SSN = request.SSN ?? "";

                var loginAccessEnabled = !string.IsNullOrWhiteSpace(request.UserName);
                var passwordProvided = !string.IsNullOrWhiteSpace(request.Password);
                var hasExistingPassword = !isNew && !string.IsNullOrEmpty(employee.Password);

                if (!loginAccessEnabled)
                {
                    // Disable login: clear credentials so the account cannot authenticate
                    employee.UserName = "";
                    employee.Password = "";
                    employee.PasswordSalt = "";
                    employee.ChangePassword = "No";
                    employee.FailedLoginCount = 0;
                    employee.LockoutEndUtc = null;
                }
                else if (passwordProvided)
                {
                    var settings = await _context.SystemSettings
                        .FirstOrDefaultAsync(s => s.TenantId == request.TenantID)
                        ?? new SystemSettings { TenantId = request.TenantID };

                    if (!_authService.ValidatePasswordAgainstPolicy(request.Password!, settings, out var policyError))
                    {
                        return BadRequest(new { error = policyError ?? "Password does not meet policy requirements" });
                    }

                    await _authService.EnsurePasswordHashedAsync(employee, request.Password!);
                    employee.PwdResetDate = DateTime.UtcNow;
                    employee.ChangePassword = "N";
                    employee.FailedLoginCount = 0;
                    employee.LockoutEndUtc = null;
                }
                else if (isNew || !hasExistingPassword)
                {
                    return BadRequest(new { error = "Password is required to enable login access" });
                }

                if (isNew)
                {
                    _context.UserDetails.Add(employee);
                }
                else
                {
                    _context.UserDetails.Update(employee);
                }

                await _context.SaveChangesAsync();

                // Handle Location Mapping — supports multi-location (LocationIds) or legacy single LocationId
                var locationIds = (request.LocationIds != null && request.LocationIds.Count > 0)
                    ? request.LocationIds.Where(id => id > 0).Distinct().ToList()
                    : (request.LocationId.HasValue && request.LocationId.Value > 0
                        ? new List<int> { request.LocationId.Value }
                        : new List<int>());

                var existingMappings = _context.UserMapping
                    .Where(um => um.userId == employee.User_UniqueID)
                    .ToList();

                if (locationIds.Count > 0)
                {
                    var toRemove = existingMappings.Where(m => !locationIds.Contains(m.locationId)).ToList();
                    if (toRemove.Count > 0)
                    {
                        _context.UserMapping.RemoveRange(toRemove);
                    }

                    var existingIds = existingMappings.Select(m => m.locationId).ToHashSet();
                    foreach (var locId in locationIds.Where(id => !existingIds.Contains(id)))
                    {
                        _context.UserMapping.Add(new UserMapping
                        {
                            userId = employee.User_UniqueID,
                            locationId = locId
                        });
                    }

                    if (!employee.DefaultLocationId.HasValue
                        || !locationIds.Contains(employee.DefaultLocationId.Value))
                    {
                        employee.DefaultLocationId = locationIds[0];
                    }
                }
                else
                {
                    if (existingMappings.Count > 0)
                    {
                        _context.UserMapping.RemoveRange(existingMappings);
                    }

                    employee.DefaultLocationId = null;
                }

                if (request.CanAccessAllLocations.HasValue)
                {
                    employee.CanAccessAllLocations = request.CanAccessAllLocations.Value;
                }

                if (request.DefaultLocationId.HasValue && request.DefaultLocationId.Value > 0)
                {
                    employee.DefaultLocationId = request.DefaultLocationId.Value;
                }

                await _context.SaveChangesAsync();

                var faceEnrolled = false;
                string? faceMessage = null;
                if (file != null && file.Length > 0)
                {
                    byte[] imageBytes;
                    await using (var buffer = new MemoryStream())
                    {
                        await file.CopyToAsync(buffer);
                        imageBytes = buffer.ToArray();
                    }

                    await TrySaveProfilePicAsync(employee, file.FileName, imageBytes);
                    try
                    {
                        var enroll = await _faceRecognition.EnrollFromBytesAsync(
                            employee.TenantID,
                            employee.User_UniqueID,
                            imageBytes);
                        faceEnrolled = enroll.enrolled;
                        faceMessage = enroll.message;
                    }
                    catch (Exception faceEx)
                    {
                        faceMessage = "Photo saved, but face enrollment failed: " + faceEx.Message;
                    }
                }
                else
                {
                    faceEnrolled = _context.EmployeeFace.Any(f =>
                        f.TenantId == employee.TenantID
                        && f.UserUniqueId == employee.User_UniqueID
                        && f.AzureFaceRegistered);
                }

                return Ok(new
                {
                    result = new
                    {
                        employee.User_UniqueID,
                        faceEnrolled,
                        faceMessage
                    }
                });
            }
            catch (DbUpdateException dbEx)
            {
                var errorMessage = dbEx.Message;
                if (dbEx.InnerException != null)
                {
                    errorMessage += " | " + dbEx.InnerException.Message;
                }
                return StatusCode(500, new { error = errorMessage });
            }
            catch (Exception ex)
            {
                var errorMessage = ex.Message;
                if (ex.InnerException != null)
                {
                    errorMessage += " | Inner: " + ex.InnerException.Message;
                }
                return StatusCode(500, new { error = errorMessage });
            }
        }

        [HttpGet("GetAllRoles")]
        public IActionResult GetAllRoles([FromQuery] int tenantid)
        {
            try
            {
                var roles = _context.UserRole
                    .Where(r => r.TenantId == tenantid)
                    .Select(r => new
                    {
                        roleID = r.RoleID,
                        roleName = r.RoleName
                    })
                    .ToList();

                return Ok(new { result = roles });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpPost("ImportEmployees")]
        public IActionResult ImportEmployees([FromBody] EmployeeImportRequest request)
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

                var existing = _context.UserDetails
                    .Where(u => u.TenantID == request.Tenantid)
                    .ToList();

                var roles = _context.UserRole
                    .Where(r => r.TenantId == request.Tenantid)
                    .ToList();

                var locations = _context.Locations
                    .Where(l => l.TenantId == request.Tenantid)
                    .ToList();

                var existingUserIds = existing.Select(e => e.User_UniqueID).ToList();
                var existingMappings = existingUserIds.Count == 0
                    ? new List<UserMapping>()
                    : _context.UserMapping
                        .Where(um => existingUserIds.Contains(um.userId))
                        .ToList();

                var result = new EmployeeImportResult();
                var rowResults = new List<EmployeeImportRowResult>();
                var batchCodes = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                var batchUserNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                var batchEmails = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

                using var tx = _context.Database.BeginTransaction();
                try
                {
                    for (int i = 0; i < request.Rows.Count; i++)
                    {
                        var row = request.Rows[i];
                        var rowNumber = row.RowNumber ?? (i + 2);
                        var rowResult = new EmployeeImportRowResult { RowNumber = rowNumber };

                        var firstName = (row.FirstName ?? "").Trim();
                        var lastName = (row.LastName ?? "").Trim();
                        var empCode = (row.EmpCode ?? "").Trim();
                        var userName = (row.UserName ?? "").Trim();
                        var email = (row.Email ?? "").Trim();

                        if (string.IsNullOrWhiteSpace(firstName))
                        {
                            rowResult.Status = "Error";
                            rowResult.Message = "First Name is required";
                            result.Failed++;
                            rowResults.Add(rowResult);
                            continue;
                        }

                        if (string.IsNullOrWhiteSpace(lastName))
                        {
                            rowResult.Status = "Error";
                            rowResult.Message = "Last Name is required";
                            result.Failed++;
                            rowResults.Add(rowResult);
                            continue;
                        }

                        if (!string.IsNullOrEmpty(empCode) && !batchCodes.Add(empCode))
                        {
                            rowResult.Status = "Error";
                            rowResult.Message = $"Duplicate Emp Code '{empCode}' in import file";
                            result.Failed++;
                            rowResults.Add(rowResult);
                            continue;
                        }

                        if (!string.IsNullOrEmpty(userName) && !batchUserNames.Add(userName))
                        {
                            rowResult.Status = "Error";
                            rowResult.Message = $"Duplicate User Name '{userName}' in import file";
                            result.Failed++;
                            rowResults.Add(rowResult);
                            continue;
                        }

                        if (!string.IsNullOrEmpty(email) && !batchEmails.Add(email))
                        {
                            rowResult.Status = "Error";
                            rowResult.Message = $"Duplicate Email '{email}' in import file";
                            result.Failed++;
                            rowResults.Add(rowResult);
                            continue;
                        }

                        UserDetail? match = null;
                        if (!string.IsNullOrEmpty(empCode))
                        {
                            match = existing.FirstOrDefault(u =>
                                string.Equals(u.EmpCode, empCode, StringComparison.OrdinalIgnoreCase));
                        }
                        if (match == null && !string.IsNullOrEmpty(userName))
                        {
                            match = existing.FirstOrDefault(u =>
                                string.Equals(u.UserName, userName, StringComparison.OrdinalIgnoreCase));
                        }
                        if (match == null && !string.IsNullOrEmpty(email))
                        {
                            match = existing.FirstOrDefault(u =>
                                string.Equals(u.Email, email, StringComparison.OrdinalIgnoreCase));
                        }

                        if (!string.IsNullOrEmpty(userName))
                        {
                            var userConflict = existing.FirstOrDefault(u =>
                                (match == null || u.User_UniqueID != match.User_UniqueID) &&
                                !string.IsNullOrEmpty(u.UserName) &&
                                string.Equals(u.UserName, userName, StringComparison.OrdinalIgnoreCase));
                            if (userConflict != null)
                            {
                                rowResult.Status = "Error";
                                rowResult.Message = $"User Name '{userName}' already exists";
                                result.Failed++;
                                rowResults.Add(rowResult);
                                continue;
                            }
                        }

                        if (!string.IsNullOrEmpty(empCode))
                        {
                            var codeConflict = existing.FirstOrDefault(u =>
                                (match == null || u.User_UniqueID != match.User_UniqueID) &&
                                !string.IsNullOrEmpty(u.EmpCode) &&
                                string.Equals(u.EmpCode, empCode, StringComparison.OrdinalIgnoreCase));
                            if (codeConflict != null)
                            {
                                rowResult.Status = "Error";
                                rowResult.Message = $"Emp Code '{empCode}' already exists";
                                result.Failed++;
                                rowResults.Add(rowResult);
                                continue;
                            }
                        }

                        int? roleId = null;
                        var roleName = (row.RoleName ?? "").Trim();
                        if (!string.IsNullOrEmpty(roleName))
                        {
                            var role = roles.FirstOrDefault(r =>
                                string.Equals(r.RoleName, roleName, StringComparison.OrdinalIgnoreCase));
                            if (role == null)
                            {
                                rowResult.Warning = $"Role '{roleName}' not found, role left blank";
                            }
                            else
                            {
                                roleId = role.RoleID;
                            }
                        }

                        int? locationId = null;
                        var locationName = (row.LocationName ?? "").Trim();
                        if (!string.IsNullOrEmpty(locationName))
                        {
                            var location = locations.FirstOrDefault(l =>
                                string.Equals(l.Name, locationName, StringComparison.OrdinalIgnoreCase) ||
                                string.Equals(l.Code, locationName, StringComparison.OrdinalIgnoreCase));
                            if (location == null)
                            {
                                var locWarn = $"Location '{locationName}' not found, location left blank";
                                rowResult.Warning = string.IsNullOrEmpty(rowResult.Warning)
                                    ? locWarn
                                    : $"{rowResult.Warning}; {locWarn}";
                            }
                            else
                            {
                                locationId = location.LocationId;
                            }
                        }

                        var status = ParseEmployeeStatus(row.Status);
                        var employeeType = NormalizeEmployeeType(row.EmployeeType);

                        UserDetail employee;
                        bool isNew = match == null;

                        if (match != null)
                        {
                            if (!request.UpdateExisting)
                            {
                                rowResult.Status = "Skipped";
                                rowResult.Message = "Employee already exists";
                                rowResult.EmployeeId = match.User_UniqueID;
                                result.Skipped++;
                                rowResults.Add(rowResult);
                                continue;
                            }

                            employee = match;
                            employee.FirstName = firstName;
                            employee.LastName = lastName;
                            if (!string.IsNullOrEmpty(empCode)) employee.EmpCode = empCode;
                            if (row.Email != null) employee.Email = email;
                            if (row.UserName != null) employee.UserName = userName;
                            if (status != null) employee.Status = status;
                            if (roleId.HasValue) employee.Role = roleId;
                            if (employeeType != null) employee.EmployeeType = employeeType;
                            if (row.Phone1 != null) employee.Phone1 = row.Phone1.Trim();
                            if (row.Phone2 != null) employee.Phone2 = row.Phone2.Trim();
                            if (row.DateOfHire != null) employee.Date_of_hire = row.DateOfHire.Trim();
                            if (row.Address != null) employee.Address = row.Address.Trim();
                            if (row.City != null) employee.City = row.City.Trim();
                            if (row.State != null) employee.State = row.State.Trim();
                            if (row.Zip != null) employee.Zip = row.Zip.Trim();
                            if (row.DOB != null) employee.DOB = row.DOB.Trim();
                            if (row.SSN != null) employee.SSN = row.SSN.Trim();

                            rowResult.Status = "Updated";
                            rowResult.Message = "Updated";
                            rowResult.EmployeeId = employee.User_UniqueID;
                            result.Updated++;
                        }
                        else
                        {
                            employee = new UserDetail
                            {
                                TenantID = request.Tenantid,
                                FirstName = firstName,
                                LastName = lastName,
                                EmpCode = empCode,
                                Email = email,
                                UserName = userName,
                                Status = status ?? "Active",
                                Role = roleId,
                                EmployeeType = employeeType ?? "Regular",
                                Phone1 = row.Phone1?.Trim() ?? "",
                                Phone2 = row.Phone2?.Trim() ?? "",
                                Date_of_hire = row.DateOfHire?.Trim() ?? "",
                                Address = row.Address?.Trim() ?? "",
                                City = row.City?.Trim() ?? "",
                                State = row.State?.Trim() ?? "",
                                Zip = row.Zip?.Trim() ?? "",
                                Street = "",
                                DOB = row.DOB?.Trim() ?? "",
                                SSN = row.SSN?.Trim() ?? "",
                                CreateDate = DateTime.UtcNow,
                                PwdResetDate = DateTime.UtcNow,
                                Password = "",
                                PasswordSalt = "",
                                UserToken = "",
                                PwdChangeStatus = "No",
                                ChangePassword = "No",
                                HID = "",
                                PrimaryContact = "",
                                Date_of_termination = "",
                                Termination_Reason = "",
                                ValidateStatus = "",
                                ChangedBy = "",
                                BlockedPhone = "",
                                PwdType = "",
                                PhoneUpdateStatus = "",
                                PrimaryMethod = "",
                                ContractId = "",
                                SearchSSN = ""
                            };
                            _context.UserDetails.Add(employee);
                            existing.Add(employee);
                            _context.SaveChanges();

                            rowResult.Status = "Created";
                            rowResult.Message = "Created";
                            rowResult.EmployeeId = employee.User_UniqueID;
                            result.Created++;
                        }

                        if (locationId.HasValue)
                        {
                            var mapping = existingMappings.FirstOrDefault(m => m.userId == employee.User_UniqueID);
                            if (mapping != null)
                            {
                                mapping.locationId = locationId.Value;
                            }
                            else
                            {
                                mapping = new UserMapping
                                {
                                    userId = employee.User_UniqueID,
                                    locationId = locationId.Value
                                };
                                _context.UserMapping.Add(mapping);
                                existingMappings.Add(mapping);
                            }
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

        private static string? ParseEmployeeStatus(string? value)
        {
            if (string.IsNullOrWhiteSpace(value)) return null;
            var v = value.Trim().ToLowerInvariant();
            if (v is "active" or "1" or "yes" or "true") return "Active";
            if (v is "inactive" or "0" or "no" or "false") return "Inactive";
            return null;
        }

        private static string? NormalizeEmployeeType(string? value)
        {
            if (string.IsNullOrWhiteSpace(value)) return null;
            var v = value.Trim();
            if (string.Equals(v, "Regular", StringComparison.OrdinalIgnoreCase)) return "Regular";
            if (string.Equals(v, "Contractor", StringComparison.OrdinalIgnoreCase)) return "Contractor";
            return v;
        }

        [HttpGet("CheckEmployeeDeletionImpact")]
        public IActionResult CheckEmployeeDeletionImpact([FromQuery] int employeeId, [FromQuery] int tenantId)
        {
            try
            {
                var employee = _context.UserDetails
                    .FirstOrDefault(u => u.User_UniqueID == employeeId && u.TenantID == tenantId);

                if (employee == null)
                {
                    return NotFound(new { error = "Employee not found" });
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

                // Check for Job Orders created by this employee (UserId field)
                var jobOrders = _context.JobOrderMaster
                    .Where(jo => jo.UserId == employeeId && jo.Tenantid == tenantId)
                    .ToList();

                if (jobOrders.Any())
                {
                    impact.WillBeAffected.Add(new ImpactedEntity
                    {
                        EntityType = "Job Orders",
                        Count = jobOrders.Count,
                        Description = $"{jobOrders.Count} job order(s) were created by this employee (will remain but creator reference will be lost)"
                    });
                    // Note: This is not blocking, just informational
                }

                // Check for User Workstation Mappings
                var workstationMappings = _context.UserWorkstationMapping
                    .Where(uwm => uwm.UserId == employeeId && uwm.TenantId == tenantId)
                    .ToList();

                if (workstationMappings.Any())
                {
                    impact.WillBeDeleted.Add(new ImpactedEntity
                    {
                        EntityType = "Workstation Mappings",
                        Count = workstationMappings.Count,
                        Description = $"{workstationMappings.Count} workstation mapping(s) will be deleted"
                    });
                }

                // Check for User Location Mappings
                var locationMappings = _context.UserMapping
                    .Where(um => um.userId == employeeId)
                    .ToList();

                if (locationMappings.Any())
                {
                    impact.WillBeDeleted.Add(new ImpactedEntity
                    {
                        EntityType = "Location Mappings",
                        Count = locationMappings.Count,
                        Description = $"{locationMappings.Count} location mapping(s) will be deleted"
                    });
                }

                // Check for Orders created by this employee (warning only, not blocking)
                var ordersCreated = _context.CustomerOrder
                    .Where(co => co.UserId == employeeId && co.Tenantid == tenantId)
                    .Count();

                if (ordersCreated > 0)
                {
                    impact.WillBeAffected.Add(new ImpactedEntity
                    {
                        EntityType = "Customer Orders",
                        Count = ordersCreated,
                        Description = $"{ordersCreated} order(s) were created by this employee (will remain but creator reference will be lost)"
                    });
                }

                var vendorOrdersCreated = _context.VendorOrders
                    .Where(vo => vo.UserId == employeeId && vo.Tenantid == tenantId)
                    .Count();

                if (vendorOrdersCreated > 0)
                {
                    impact.WillBeAffected.Add(new ImpactedEntity
                    {
                        EntityType = "Vendor Orders",
                        Count = vendorOrdersCreated,
                        Description = $"{vendorOrdersCreated} vendor order(s) were created by this employee (will remain but creator reference will be lost)"
                    });
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

        [HttpDelete("DeleteEmployee")]
        public IActionResult DeleteEmployee([FromQuery] int employeeId, [FromQuery] int tenantId)
        {
            try
            {
                var employee = _context.UserDetails
                    .FirstOrDefault(u => u.User_UniqueID == employeeId && u.TenantID == tenantId);

                if (employee == null)
                {
                    return NotFound(new { error = "Employee not found" });
                }

                // Delete related entities
                var workstationMappings = _context.UserWorkstationMapping
                    .Where(uwm => uwm.UserId == employeeId && uwm.TenantId == tenantId)
                    .ToList();
                _context.UserWorkstationMapping.RemoveRange(workstationMappings);

                var locationMappings = _context.UserMapping
                    .Where(um => um.userId == employeeId)
                    .ToList();
                _context.UserMapping.RemoveRange(locationMappings);

                // Delete the employee
                _context.UserDetails.Remove(employee);
                _context.SaveChanges();

                return Ok(new { result = new { message = "Employee deleted successfully" } });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message, stackTrace = ex.StackTrace });
            }
        }

        private async Task TrySaveProfilePicAsync(UserDetail employee, string originalFileName, byte[] imageBytes)
        {
            var fileName = Path.GetFileName(originalFileName);
            if (string.IsNullOrWhiteSpace(fileName))
            {
                fileName = $"profile-{employee.User_UniqueID}.jpg";
            }

            try
            {
                var fileInfo = new FileInfor
                {
                    ContainerName = "data",
                    Dirname = "ProfilePic/" + employee.TenantID + "/" + employee.User_UniqueID,
                    UploadFileName = fileName,
                    tenantID = employee.TenantID,
                    type = "profilepic",
                    userUniqueno = employee.User_UniqueID
                };

                var upload = new UploadFile(_context, _configuration);
                using var stream = new MemoryStream(imageBytes);
                var formFile = new FormFile(stream, 0, imageBytes.Length, "file", fileName)
                {
                    Headers = new HeaderDictionary(),
                    ContentType = "application/octet-stream"
                };
                await upload.UploadFileOnServer(new[] { formFile }, new List<FileInfor> { fileInfo });
                employee.ProfilePic = fileName;
                await _context.SaveChangesAsync();
            }
            catch
            {
                // Profile blob storage is optional; face enrollment can still proceed.
            }
        }
    }

    // Request DTOs
    public class EmployeeMasterReq
    {
        public int User_UniqueID { get; set; }
        public string FirstName { get; set; }
        public string LastName { get; set; }
        public string Email { get; set; }
        public string UserName { get; set; }
        public string Status { get; set; }
        public int? Role { get; set; }
        public string EmployeeType { get; set; }
        public string EmployeeCategory { get; set; }
        public string EmpCode { get; set; }
        public string Department { get; set; }
        public string Phone1 { get; set; }
        public string Phone2 { get; set; }
        public string Date_of_hire { get; set; }
        public string Address { get; set; }
        public string City { get; set; }
        public string State { get; set; }
        public string Zip { get; set; }
        public string Apartment { get; set; }
        public string Country { get; set; }
        public int? LocationId { get; set; }
        /// <summary>Assigned locations (multi-location). Takes precedence over LocationId when provided.</summary>
        public List<int>? LocationIds { get; set; }
        public int? DefaultLocationId { get; set; }
        public bool? CanAccessAllLocations { get; set; }
        public int TenantID { get; set; }
        public string DOB { get; set; }
        public string SSN { get; set; }
        /// <summary>Optional plaintext password when enabling or changing login access. Never returned from GET.</summary>
        public string? Password { get; set; }
    }

    public class EmployeeImportRequest
    {
        public int Tenantid { get; set; }
        public bool UpdateExisting { get; set; } = true;
        public bool StopOnError { get; set; } = false;
        public List<EmployeeImportRow> Rows { get; set; } = new();
    }

    public class EmployeeImportRow
    {
        public int? RowNumber { get; set; }
        public string? EmpCode { get; set; }
        public string? FirstName { get; set; }
        public string? LastName { get; set; }
        public string? Email { get; set; }
        public string? UserName { get; set; }
        public string? Status { get; set; }
        public string? RoleName { get; set; }
        public string? EmployeeType { get; set; }
        public string? Phone1 { get; set; }
        public string? Phone2 { get; set; }
        public string? DateOfHire { get; set; }
        public string? Address { get; set; }
        public string? City { get; set; }
        public string? State { get; set; }
        public string? Zip { get; set; }
        public string? LocationName { get; set; }
        public string? DOB { get; set; }
        public string? SSN { get; set; }
    }

    public class EmployeeImportResult
    {
        public int Created { get; set; }
        public int Updated { get; set; }
        public int Skipped { get; set; }
        public int Failed { get; set; }
        public List<EmployeeImportRowResult> Rows { get; set; } = new();
    }

    public class EmployeeImportRowResult
    {
        public int RowNumber { get; set; }
        public int? EmployeeId { get; set; }
        public string Status { get; set; } = "";
        public string Message { get; set; } = "";
        public string? Warning { get; set; }
    }
}

