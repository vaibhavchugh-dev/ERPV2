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
    public class EmployeeController : ApiBaseController
    {
        private readonly CimmpleDbContext _context;

        public EmployeeController(CimmpleDbContext context)
        {
            _context = context;
        }

        [HttpGet("GetEmployees")]
        public IActionResult GetEmployees([FromQuery] int tenantid)
        {
            try
            {
                var employees = _context.UserDetails
                    .Where(u => u.TenantID == tenantid && (u.VendorId == null || u.VendorId == 0))
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
                            zip = x.User.Zip ?? ""
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
                    employeeCategory = "", // UserDetail doesn't have employeeCategory field, can be added later
                    empCode = employee.EmpCode ?? "",
                    department = "", // UserDetail doesn't have department field, can be added later
                    phone1 = employee.Phone1 ?? "",
                    phone2 = employee.Phone2 ?? "",
                    date_of_hire = employee.Date_of_hire ?? "",
                    address = employee.Address ?? "",
                    apartment = "", // UserDetail doesn't have apartment field, can be added later
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
                    ssn = employee.SSN ?? ""
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
                    // Check for duplicate username (only if username is provided)
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
                    employee.Password = ""; // Will be set by password reset
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

                    // Check for duplicate username (excluding current, only if username is provided)
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

                // Update fields
                employee.FirstName = request.FirstName;
                employee.LastName = request.LastName;
                employee.Email = request.Email ?? "";
                employee.UserName = request.UserName ?? "";
                employee.Status = request.Status ?? "Active";
                employee.Role = request.Role;
                employee.EmployeeType = request.EmployeeType ?? "";
                employee.EmpCode = request.EmpCode ?? "";
                // Note: UserDetail doesn't have Department field, can be added to model later if needed
                employee.Phone1 = request.Phone1 ?? "";
                employee.Phone2 = request.Phone2 ?? "";
                employee.Date_of_hire = request.Date_of_hire ?? "";
                employee.Address = request.Address ?? "";
                // Note: UserDetail doesn't have Apartment field, can be added to model later if needed
                employee.City = request.City ?? "";
                employee.State = request.State ?? "";
                employee.Zip = request.Zip ?? "";
                employee.Street = ""; // UserDetail has Street field (required), but we use Address
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

                // Save employee first to get the User_UniqueID for new employees
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

                // Save location mapping changes
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

