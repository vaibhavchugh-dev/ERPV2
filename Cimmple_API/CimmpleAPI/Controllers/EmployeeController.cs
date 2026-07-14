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
                    locationId = locationMapping != null ? (int?)locationMapping.locationId : null,
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

                // Handle Location Mapping (after employee is saved so we have User_UniqueID)
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
                    // Remove location mapping if LocationId is not provided or is 0
                    var existingMapping = _context.UserMapping
                        .Where(um => um.userId == employee.User_UniqueID)
                        .FirstOrDefault();

                    if (existingMapping != null)
                    {
                        _context.UserMapping.Remove(existingMapping);
                    }
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
        public int TenantID { get; set; }
        public string DOB { get; set; }
        public string SSN { get; set; }
    }
}

