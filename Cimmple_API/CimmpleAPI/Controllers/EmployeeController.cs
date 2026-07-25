using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using CimmpleAPI.Data;
using CimmpleAPI.Data.Models;
using CimmpleAPI.Data.Dtos;
using CimmpleAPI.Utilities;
using Microsoft.WindowsAzure.Storage;
using Microsoft.WindowsAzure.Storage.Blob;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
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

        public EmployeeController(CimmpleDbContext context, IWebHostEnvironment environment, IConfiguration configuration)
        {
            _context = context;
            _environment = environment;
            _configuration = configuration;
        }

        [HttpGet("GetEmployees")]
        public IActionResult GetEmployees([FromQuery] int tenantid)
        {
            try
            {
                var employees = _context.UserDetails
                    .Where(u => u.TenantID == tenantid)
                    .GroupJoin(_context.UserRole,
                        u => u.Role,
                        r => r.RoleID,
                        (u, roles) => new { User = u, Roles = roles })
                    .SelectMany(
                        x => x.Roles.DefaultIfEmpty(),
                        (x, r) => new
                        {
                            user_UniqueID = x.User.User_UniqueID,
                            firstName = x.User.FirstName,
                            lastName = x.User.LastName,
                            email = x.User.Email,
                            userName = x.User.UserName,
                            status = x.User.Status ?? "Active",
                            role = x.User.Role,
                            roleName = r != null ? r.RoleName : "",
                            employeeType = x.User.EmployeeType ?? "",
                            empCode = x.User.EmpCode ?? "",
                            phone1 = x.User.Phone1 ?? "",
                            date_of_hire = x.User.Date_of_hire ?? "",
                            address = x.User.Address ?? "",
                            city = x.User.City ?? "",
                            state = x.User.State ?? "",
                            zip = x.User.Zip ?? "",
                            profilePic = x.User.ProfilePic ?? ""
                        })
                    .ToList();

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

                // Get location mapping if exists
                var locationMapping = _context.UserMapping
                    .Where(um => um.userId == employeeId)
                    .FirstOrDefault();

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
                    country = "US",
                    locationId = locationMapping != null ? (int?)locationMapping.locationId : null,
                    tenantID = employee.TenantID,
                    dob = employee.DOB ?? "",
                    ssn = employee.SSN ?? "",
                    profilePic = employee.ProfilePic ?? ""
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

                if (isNew)
                {
                    _context.UserDetails.Add(employee);
                }
                else
                {
                    _context.UserDetails.Update(employee);
                }

                await _context.SaveChangesAsync();

                if (file != null && file.Length > 0)
                {
                    string originalFileName = Path.GetFileName(file.FileName);
                    var allowedExtensions = new[] { ".jpg", ".jpeg", ".png", ".svg" };
                    string ext = Path.GetExtension(originalFileName).ToLower();

                    if (allowedExtensions.Contains(ext))
                    {
                        var fileInfo = new List<FileInfor>
                        {
                            new FileInfor
                            {
                                ContainerName = "data",
                                Dirname = "ProfilePic/" + employee.TenantID + "/" + employee.User_UniqueID,
                                UploadFileName = originalFileName,
                                tenantID = employee.TenantID,
                                type = "profilepic",
                                userUniqueno = employee.User_UniqueID
                            }
                        };

                        var fileList = new List<IFormFile> { file };
                        UploadFile uploadfile = new UploadFile(_context, _configuration);
                        var uploadResult = await uploadfile.UploadFileOnServer(fileList, fileInfo);
                      
                        // string provider = _configuration["FaceRecognition:Provider"] ?? "Azure";
                        // if (provider.Equals("Azure", StringComparison.OrdinalIgnoreCase))
                        // {
                        //     try
                        //     {
                        //         var validationResult = await ValidateFace(file);
                        //         if (validationResult.IsValid)
                        //         {
                        //             await EnsurePersonGroupExists(employee.TenantID);

                        //             string personId = employee.AzurePersonId ?? "";
                        //             if (string.IsNullOrEmpty(personId))
                        //             {
                        //                 personId = await CreatePerson(employee.TenantID, employee.User_UniqueID.ToString());
                        //                 employee.AzurePersonId = personId;
                        //             }

                        //             if (!string.IsNullOrEmpty(employee.AzurePersistedFaceId))
                        //             {
                        //                 await DeleteFace(employee.TenantID, personId, employee.AzurePersistedFaceId);
                        //             }

                        //             string persistedFaceId = await AddFaceToPerson(employee.TenantID, personId, file);
                        //             await TrainPersonGroup(employee.TenantID);

                        //             employee.AzurePersistedFaceId = persistedFaceId;
                        //             employee.AzureFaceRegistered = true;
                        //             employee.AzureFaceLastSync = DateTime.UtcNow;
                        //         }
                        //         else
                        //         {
                        //             employee.AzureFaceRegistered = false;
                        //         }
                        //     }
                        //     catch (Exception faceEx)
                        //     {
                        //         Console.WriteLine($"Azure face registration warning: {faceEx.Message}");
                        //     }
                        // }

                        employee.ProfilePic = "ProfilePic/" + employee.TenantID + "/" + employee.User_UniqueID + "/" + originalFileName;
                        _context.UserDetails.Update(employee);
                        await _context.SaveChangesAsync();
                    }
                }

                if (request.LocationId.HasValue && request.LocationId.Value > 0)
                {
                    var existingMapping = _context.UserMapping
                        .Where(um => um.userId == employee.User_UniqueID)
                        .FirstOrDefault();

                    if (existingMapping != null)
                    {
                        existingMapping.locationId = request.LocationId.Value;
                        _context.UserMapping.Update(existingMapping);
                    }
                    else
                    {
                        var newMapping = new UserMapping
                        {
                            userId = employee.User_UniqueID,
                            locationId = request.LocationId.Value
                        };
                        _context.UserMapping.Add(newMapping);
                    }
                }
                else
                {
                    var existingMapping = _context.UserMapping
                        .Where(um => um.userId == employee.User_UniqueID)
                        .FirstOrDefault();

                    if (existingMapping != null)
                    {
                        _context.UserMapping.Remove(existingMapping);
                    }
                }

                await _context.SaveChangesAsync();

                return Ok(new { result = employee });
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

        private HttpClient CreateFaceClient()
        {
            var faceKey = _configuration["AzureFace:Key"] ?? "";
            var client = new HttpClient();
            client.DefaultRequestHeaders.Add("Ocp-Apim-Subscription-Key", faceKey);
            return client;
        }

        private async Task<FaceValidationResult> ValidateFace(IFormFile file)
        {
            var faceEndpoint = _configuration["AzureFace:Endpoint"] ?? "";
            if (string.IsNullOrEmpty(faceEndpoint))
            {
                return new FaceValidationResult { IsValid = true, Message = "Validation skipped (no Azure endpoint configured)" };
            }

            try
            {
                using (var client = CreateFaceClient())
                {
                    using (var stream = file.OpenReadStream())
                    {
                        var content = new StreamContent(stream);
                        content.Headers.ContentType = new MediaTypeHeaderValue("application/octet-stream");

                        var response = await client.PostAsync(
                            faceEndpoint + "/face/v1.0/detect?returnFaceId=true&recognitionModel=recognition_04&detectionModel=detection_01&returnFaceAttributes=qualityForRecognition,blur,exposure,noise",
                            content);

                        var json = await response.Content.ReadAsStringAsync();
                        if (!response.IsSuccessStatusCode)
                        {
                            return new FaceValidationResult { IsValid = false, Message = "Face validation failed" };
                        }

                        using var doc = System.Text.Json.JsonDocument.Parse(json);
                        var root = doc.RootElement;
                        int count = root.GetArrayLength();

                        if (count == 0)
                        {
                            return new FaceValidationResult { IsValid = false, Message = "No face detected" };
                        }

                        if (count > 1)
                        {
                            return new FaceValidationResult { IsValid = false, Message = "Multiple faces detected" };
                        }

                        var face = root[0];
                        if (face.TryGetProperty("faceAttributes", out var attrs) &&
                            attrs.TryGetProperty("qualityForRecognition", out var qualityProp))
                        {
                            var quality = qualityProp.GetString();
                            if (!string.IsNullOrWhiteSpace(quality) && quality.Equals("low", StringComparison.OrdinalIgnoreCase))
                            {
                                return new FaceValidationResult { IsValid = false, Message = "Poor image quality" };
                            }
                        }

                        var faceId = face.GetProperty("faceId").GetString() ?? "";
                        return new FaceValidationResult { IsValid = true, Message = "VALID", FaceId = faceId };
                    }
                }
            }
            catch (Exception ex)
            {
                return new FaceValidationResult { IsValid = false, Message = ex.Message };
            }
        }

        private async Task EnsurePersonGroupExists(int tenantId)
        {
            var faceEndpoint = _configuration["AzureFace:Endpoint"] ?? "";
            if (string.IsNullOrEmpty(faceEndpoint)) return;

            using (var client = CreateFaceClient())
            {
                string groupId = $"tenant_{tenantId}";
                var response = await client.GetAsync(faceEndpoint + $"/face/v1.0/persongroups/{groupId}");
                if (response.IsSuccessStatusCode) return;

                var body = new { name = groupId, recognitionModel = "recognition_04" };
                var content = new StringContent(
                    System.Text.Json.JsonSerializer.Serialize(body),
                    Encoding.UTF8,
                    "application/json");

                await client.PutAsync(faceEndpoint + $"/face/v1.0/persongroups/{groupId}", content);
            }
        }

        private async Task<string> CreatePerson(int tenantId, string userId)
        {
            var faceEndpoint = _configuration["AzureFace:Endpoint"] ?? "";
            using (var client = CreateFaceClient())
            {
                string groupId = $"tenant_{tenantId}";
                var body = new { name = userId };
                var content = new StringContent(
                    System.Text.Json.JsonSerializer.Serialize(body),
                    Encoding.UTF8,
                    "application/json");

                var response = await client.PostAsync(faceEndpoint + $"/face/v1.0/persongroups/{groupId}/persons", content);
                var json = await response.Content.ReadAsStringAsync();

                if (!response.IsSuccessStatusCode)
                    throw new Exception(json);

                using var doc = System.Text.Json.JsonDocument.Parse(json);
                return doc.RootElement.GetProperty("personId").GetString() ?? "";
            }
        }

        private async Task DeleteFace(int tenantId, string personId, string persistedFaceId)
        {
            var faceEndpoint = _configuration["AzureFace:Endpoint"] ?? "";
            using (var client = CreateFaceClient())
            {
                string groupId = $"tenant_{tenantId}";
                await client.DeleteAsync(faceEndpoint + $"/face/v1.0/persongroups/{groupId}/persons/{personId}/persistedFaces/{persistedFaceId}");
            }
        }

        private async Task<string> AddFaceToPerson(int tenantId, string personId, IFormFile file)
        {
            var faceEndpoint = _configuration["AzureFace:Endpoint"] ?? "";
            using (var client = CreateFaceClient())
            {
                string groupId = $"tenant_{tenantId}";
                using (var stream = file.OpenReadStream())
                {
                    var content = new StreamContent(stream);
                    content.Headers.ContentType = new MediaTypeHeaderValue("application/octet-stream");

                    var response = await client.PostAsync(
                        faceEndpoint + $"/face/v1.0/persongroups/{groupId}/persons/{personId}/persistedFaces?detectionModel=detection_03&recognitionModel=recognition_04",
                        content);

                    var json = await response.Content.ReadAsStringAsync();
                    if (!response.IsSuccessStatusCode)
                        throw new Exception(json);

                    using var doc = System.Text.Json.JsonDocument.Parse(json);
                    return doc.RootElement.GetProperty("persistedFaceId").GetString() ?? "";
                }
            }
        }

        private async Task TrainPersonGroup(int tenantId)
        {
            var faceEndpoint = _configuration["AzureFace:Endpoint"] ?? "";
            using (var client = CreateFaceClient())
            {
                string groupId = $"tenant_{tenantId}";
                await client.PostAsync(faceEndpoint + $"/face/v1.0/persongroups/{groupId}/train", null);
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
        public int TenantID { get; set; }
        public string DOB { get; set; }
        public string SSN { get; set; }
    }
}

