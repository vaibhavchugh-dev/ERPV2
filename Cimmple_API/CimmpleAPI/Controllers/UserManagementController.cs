using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using CimmpleAPI.Data;
using CimmpleAPI.Data.Models;
using CimmpleAPI.Services.Auth;
using System.Linq;
using System.Threading.Tasks;
using System.Collections.Generic;

namespace CimmpleAPI.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class UserManagementController : ApiBaseController
    {
        private readonly CimmpleDbContext _context;
        private readonly IAuthService _authService;

        public UserManagementController(CimmpleDbContext context, IAuthService authService)
        {
            _context = context;
            _authService = authService;
        }

        // GET: api/UserManagement/GetUsers
        [HttpGet("GetUsers")]
        public async Task<IActionResult> GetUsers(int tenantId, string? searchTerm = null, string? status = null, int pageNumber = 1, int pageSize = 10)
        {
            try
            {
                var query = _context.UserDetails.Where(u => u.TenantID == tenantId
                    && (u.VendorId == null || u.VendorId == 0));

                // Apply filters
                if (!string.IsNullOrEmpty(searchTerm))
                {
                    query = query.Where(u =>
                        (u.FirstName + " " + u.LastName).Contains(searchTerm) ||
                        u.Email.Contains(searchTerm) ||
                        u.UserName.Contains(searchTerm));
                }

                if (!string.IsNullOrEmpty(status))
                {
                    query = query.Where(u => u.Status == status);
                }

                // Get total count for pagination
                var totalCount = await query.CountAsync();

                // Apply pagination
                var users = await query
                    .OrderBy(u => u.FirstName)
                    .Skip((pageNumber - 1) * pageSize)
                    .Take(pageSize)
                    .Select(u => new UserDto
                    {
                        UserUniqueID = u.User_UniqueID,
                        FirstName = u.FirstName,
                        LastName = u.LastName,
                        Email = u.Email,
                        UserName = u.UserName,
                        Status = u.Status,
                        Role = u.Role,
                        Phone1 = u.Phone1,
                        EmployeeType = u.EmployeeType,
                        DateOfHire = u.Date_of_hire,
                        CreateDate = u.CreateDate,
                        IsSalesAgent = u.IsSalesAgent
                    })
                    .ToListAsync();

                var result = new
                {
                    users,
                    pagination = new
                    {
                        totalCount,
                        pageNumber,
                        pageSize,
                        totalPages = (int)Math.Ceiling((double)totalCount / pageSize)
                    }
                };

                return Ok(result);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Error retrieving users", error = ex.Message });
            }
        }

        // GET: api/UserManagement/GetUserById
        [HttpGet("GetUserById")]
        public async Task<IActionResult> GetUserById(int userId, int tenantId)
        {
            try
            {
                var user = await _context.UserDetails
                    .Where(u => u.User_UniqueID == userId && u.TenantID == tenantId)
                    .Select(u => new UserDetailDto
                    {
                        UserUniqueID = u.User_UniqueID,
                        FirstName = u.FirstName,
                        LastName = u.LastName,
                        Email = u.Email,
                        UserName = u.UserName,
                        Password = null, // Don't return password
                        Status = u.Status,
                        Role = u.Role,
                        Phone1 = u.Phone1,
                        Phone2 = u.Phone2,
                        EmployeeType = u.EmployeeType,
                        DateOfHire = u.Date_of_hire,
                        DateOfTermination = u.Date_of_termination,
                        TerminationReason = u.Termination_Reason,
                        Address = u.Address,
                        City = u.City,
                        State = u.State,
                        Zip = u.Zip,
                        Street = u.Street,
                        PrimaryContact = u.PrimaryContact,
                        DOB = u.DOB,
                        SSN = u.SSN,
                        IsSalesAgent = u.IsSalesAgent,
                        AllowPTO = u.AllowPTO,
                        AllowPerformance = u.AllowPerformance,
                        SendWelcomeEmail = u.SendWelcomeEmail,
                        CreateDate = u.CreateDate
                    })
                    .FirstOrDefaultAsync();

                if (user == null)
                {
                    return NotFound(new { message = "User not found" });
                }

                return Ok(user);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Error retrieving user", error = ex.Message });
            }
        }

        // PUT: api/UserManagement/UpdateUser
        // Note: User Management focuses on account management (roles, permissions, status, security)
        // Employee Master handles user creation and profile data updates
        [HttpPut("UpdateUser")]
        public async Task<IActionResult> UpdateUser([FromBody] UpdateUserDto userDto)
        {
            try
            {
                var user = await _context.UserDetails
                    .Where(u => u.User_UniqueID == userDto.UserUniqueID && u.TenantID == userDto.TenantID)
                    .FirstOrDefaultAsync();

                if (user == null)
                {
                    return NotFound(new { message = "User not found" });
                }

                // User Management focuses on account management only (roles, permissions, status, security)
                // Profile data (name, email, phone, address) should be managed via Employee Master
                
                // Update account management fields only
                user.Status = userDto.Status;
                user.Role = userDto.Role;
                user.IsSalesAgent = userDto.IsSalesAgent ? 1 : 0;
                user.AllowPTO = userDto.AllowPTO ? 1 : 0;
                user.AllowPerformance = userDto.AllowPerformance ? 1 : 0;
                
                // Update termination info if status is being changed to Inactive
                if (userDto.Status == "Inactive" && string.IsNullOrEmpty(user.Date_of_termination))
                {
                    user.Date_of_termination = DateTime.Now.ToString("yyyy-MM-dd");
                    user.Termination_Reason = userDto.TerminationReason ?? "Deactivated by admin";
                }
                else if (userDto.Status == "Active" && !string.IsNullOrEmpty(user.Date_of_termination))
                {
                    // Reactivating user - clear termination info
                    user.Date_of_termination = null;
                    user.Termination_Reason = null;
                }

                await _context.SaveChangesAsync();

                return Ok(new { message = "User updated successfully" });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Error updating user", error = ex.Message });
            }
        }

        // DELETE: api/UserManagement/DeleteUser
        [HttpDelete("DeleteUser")]
        public async Task<IActionResult> DeleteUser(int userId, int tenantId)
        {
            try
            {
                var user = await _context.UserDetails
                    .Where(u => u.User_UniqueID == userId && u.TenantID == tenantId)
                    .FirstOrDefaultAsync();

                if (user == null)
                {
                    return NotFound(new { message = "User not found" });
                }

                // Soft delete - set status to inactive instead of hard delete
                user.Status = "Inactive";
                user.Date_of_termination = DateTime.Now.ToString("yyyy-MM-dd");
                user.Termination_Reason = "Deleted by admin";

                await _context.SaveChangesAsync();

                return Ok(new { message = "User deactivated successfully" });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Error deleting user", error = ex.Message });
            }
        }

        // POST: api/UserManagement/ResetPassword
        [HttpPost("ResetPassword")]
        public async Task<IActionResult> ResetPassword([FromBody] ResetPasswordDto resetDto)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(resetDto.NewPassword))
                {
                    return BadRequest(new { message = "New password is required" });
                }

                var tenantId = resetDto.TenantId > 0 ? resetDto.TenantId : GetTenantId();
                var user = await _context.UserDetails
                    .Where(u => u.User_UniqueID == resetDto.UserId && u.TenantID == tenantId)
                    .FirstOrDefaultAsync();

                if (user == null)
                {
                    return NotFound(new { message = "User not found" });
                }

                var settings = await _context.SystemSettings.FirstOrDefaultAsync(s => s.TenantId == tenantId)
                    ?? new SystemSettings { TenantId = tenantId };

                if (!_authService.ValidatePasswordAgainstPolicy(resetDto.NewPassword, settings, out var policyError))
                {
                    return BadRequest(new { message = policyError });
                }

                await _authService.EnsurePasswordHashedAsync(user, resetDto.NewPassword);
                user.PwdResetDate = DateTime.UtcNow;
                user.ChangePassword = "Y";
                user.FailedLoginCount = 0;
                user.LockoutEndUtc = null;
                user.UserToken = ""; // invalidate refresh sessions

                await _context.SaveChangesAsync();

                return Ok(new { message = "Password reset successfully. User must change password on next login." });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Error resetting password", error = ex.Message });
            }
        }

        // GET: api/UserManagement/GetRoles
        [HttpGet("GetRoles")]
        public async Task<IActionResult> GetRoles([FromQuery] int? tenantId = null)
        {
            try
            {
                // If tenantId not provided, try to get from context or use default
                int effectiveTenantId = tenantId ?? 1; // Default fallback
                
                var roles = await _context.UserRole
                    .Where(r => r.TenantId == effectiveTenantId)
                    .OrderBy(r => r.OrderNo)
                    .Select(r => new
                    {
                        id = r.RoleID,
                        name = r.RoleName,
                        description = r.RoleTag ?? $"Role: {r.RoleName}",
                        orderNo = r.OrderNo,
                        tenantId = r.TenantId
                    })
                    .ToListAsync();

                return Ok(roles);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Error retrieving roles", error = ex.Message });
            }
        }

        // GET: api/UserManagement/GetPermissionsByRole
        [HttpGet("GetPermissionsByRole")]
        public async Task<IActionResult> GetPermissionsByRole(int roleId, int tenantId)
        {
            try
            {
                var permissions = await _context.PermissionRole
                    .Where(pr => pr.RoleId == roleId && pr.TenantId == tenantId)
                    .Join(_context.PermissionMaster,
                          pr => pr.PermissionId,
                          pm => pm.PermissionId,
                          (pr, pm) => pm)
                    .Select(pm => new
                    {
                        permissionId = pm.PermissionId,
                        permissionName = pm.PermissionName,
                        displayName = pm.DisplayPermissionName,
                        levelInfo = pm.LevelInfo
                    })
                    .ToListAsync();

                return Ok(permissions);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Error retrieving permissions", error = ex.Message });
            }
        }

        // GET: api/UserManagement/GetAllPermissions
        [HttpGet("GetAllPermissions")]
        public async Task<IActionResult> GetAllPermissions([FromQuery] int? tenantId = null)
        {
            try
            {
                var permissions = await _context.PermissionMaster
                    .OrderBy(p => p.OrderNo ?? p.PermissionId)
                    .Select(p => new
                    {
                        permissionId = p.PermissionId,
                        permissionName = p.PermissionName,
                        displayName = p.DisplayPermissionName,
                        levelInfo = p.LevelInfo,
                        orderNo = p.OrderNo,
                        moduleName = p.ReportGroup ?? "General"
                    })
                    .ToListAsync();

                // Log for debugging
                Console.WriteLine($"[GetAllPermissions] Found {permissions.Count} permissions");

                return Ok(permissions);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[GetAllPermissions] Error: {ex.Message}");
                return StatusCode(500, new { message = "Error retrieving permissions", error = ex.Message });
            }
        }

        // DELETE: api/UserManagement/ClearPermissions
        // This endpoint clears all permissions from PermissionMaster and PermissionRole tables
        [HttpDelete("ClearPermissions")]
        public async Task<IActionResult> ClearPermissions()
        {
            try
            {
                // First, delete all role-permission assignments
                var rolePermissions = await _context.PermissionRole.ToListAsync();
                _context.PermissionRole.RemoveRange(rolePermissions);
                
                // Then, delete all permissions
                var permissions = await _context.PermissionMaster.ToListAsync();
                _context.PermissionMaster.RemoveRange(permissions);
                
                await _context.SaveChangesAsync();
                
                return Ok(new { message = $"Cleared {permissions.Count} permissions and {rolePermissions.Count} role assignments", permissionsCleared = permissions.Count, roleAssignmentsCleared = rolePermissions.Count });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[ClearPermissions] Error: {ex.Message}");
                Console.WriteLine($"[ClearPermissions] Stack Trace: {ex.StackTrace}");
                if (ex.InnerException != null)
                {
                    Console.WriteLine($"[ClearPermissions] Inner Exception: {ex.InnerException.Message}");
                }
                return StatusCode(500, new { message = "Error clearing permissions", error = ex.Message, details = ex.InnerException?.Message });
            }
        }

        // POST: api/UserManagement/SeedPermissions
        // This endpoint seeds the PermissionMaster table with common permissions
        // Optional query parameter: clearExisting=true to clear existing permissions first
        [HttpPost("SeedPermissions")]
        public async Task<IActionResult> SeedPermissions([FromQuery(Name = "clearExisting")] bool clearExisting = false)
        {
            try
            {
                // Log the parameter value for debugging
                Console.WriteLine($"[SeedPermissions] Received clearExisting parameter: {clearExisting}");
                
                // Check if permissions already exist
                var existingCount = await _context.PermissionMaster.CountAsync();
                Console.WriteLine($"[SeedPermissions] Existing permissions count: {existingCount}");
                
                if (existingCount > 0 && !clearExisting)
                {
                    Console.WriteLine($"[SeedPermissions] Permissions exist and clearExisting=false, skipping seed");
                    return Ok(new { message = $"Permissions already exist ({existingCount} records). Use clearExisting=true to reset and reseed.", count = existingCount, clearExisting = false });
                }
                
                // Clear existing permissions if requested
                if (clearExisting && existingCount > 0)
                {
                    Console.WriteLine($"[SeedPermissions] Clearing {existingCount} existing permissions...");
                    // First, delete all role-permission assignments
                    var rolePermissions = await _context.PermissionRole.ToListAsync();
                    _context.PermissionRole.RemoveRange(rolePermissions);
                    Console.WriteLine($"[SeedPermissions] Removed {rolePermissions.Count} role-permission assignments");
                    
                    // Then, delete all permissions
                    var permissions = await _context.PermissionMaster.ToListAsync();
                    _context.PermissionMaster.RemoveRange(permissions);
                    
                    await _context.SaveChangesAsync();
                    Console.WriteLine($"[SeedPermissions] Cleared {permissions.Count} existing permissions");
                }

                var permissionsToSeed = new List<PermissionMaster>
                {
                    // Dashboard
                    new PermissionMaster { PermissionName = "Dashboard", DisplayPermissionName = "Dashboard", LevelInfo = 1, OrderNo = 1, Url = "/home", ReportGroup = "Dashboard", ReportDescription = "Access main dashboard" },
                    
                    // Sales & Orders
                    new PermissionMaster { PermissionName = "Customer Quotations", DisplayPermissionName = "Customer Quotations", LevelInfo = 1, OrderNo = 10, Url = "/quotations/customer", ReportGroup = "Sales & Orders", ReportDescription = "View and manage customer quotations" },
                    new PermissionMaster { PermissionName = "Customer Orders", DisplayPermissionName = "Customer Orders", LevelInfo = 1, OrderNo = 11, Url = "/orders/customer", ReportGroup = "Sales & Orders", ReportDescription = "View and manage customer orders" },
                    new PermissionMaster { PermissionName = "Customer Shipments", DisplayPermissionName = "Customer Shipments", LevelInfo = 1, OrderNo = 12, Url = "/orders/customer-shipments", ReportGroup = "Sales & Orders", ReportDescription = "View and manage customer shipments" },
                    new PermissionMaster { PermissionName = "Customer Invoices", DisplayPermissionName = "Customer Invoices", LevelInfo = 1, OrderNo = 13, Url = "/orders/customer-invoices", ReportGroup = "Sales & Orders", ReportDescription = "View and manage customer invoices" },
                    new PermissionMaster { PermissionName = "Job Orders", DisplayPermissionName = "Job Orders", LevelInfo = 1, OrderNo = 14, Url = "/job-orders", ReportGroup = "Sales & Orders", ReportDescription = "View and manage job orders" },
                    
                    // Purchasing
                    new PermissionMaster { PermissionName = "Vendor Quotations", DisplayPermissionName = "Vendor Quotations", LevelInfo = 1, OrderNo = 20, Url = "/quotations/vendor", ReportGroup = "Purchasing", ReportDescription = "View and manage vendor quotations" },
                    new PermissionMaster { PermissionName = "Vendor Orders", DisplayPermissionName = "Vendor Orders", LevelInfo = 1, OrderNo = 21, Url = "/purchasing/vendor-orders", ReportGroup = "Purchasing", ReportDescription = "View and manage vendor orders" },
                    new PermissionMaster { PermissionName = "Vendor Receiving", DisplayPermissionName = "Vendor Receiving", LevelInfo = 1, OrderNo = 22, Url = "/purchasing/vendor-receiving", ReportGroup = "Purchasing", ReportDescription = "Manage vendor receiving" },
                    new PermissionMaster { PermissionName = "Vendor Invoices", DisplayPermissionName = "Vendor Invoices", LevelInfo = 1, OrderNo = 23, Url = "/purchasing/vendor-invoices", ReportGroup = "Purchasing", ReportDescription = "View and manage vendor invoices" },
                    
                    // Quality
                    new PermissionMaster { PermissionName = "Non Conformance Reports", DisplayPermissionName = "Non Conformance Reports", LevelInfo = 1, OrderNo = 30, Url = "/quality", ReportGroup = "Quality", ReportDescription = "View and manage non-conformance reports" },
                    
                    // Reports
                    new PermissionMaster { PermissionName = "Business Intelligence", DisplayPermissionName = "Business Intelligence", LevelInfo = 1, OrderNo = 40, Url = "/reports", ReportGroup = "Reports", ReportDescription = "Access business intelligence and reports" },
                    
                    // Accounting
                    new PermissionMaster { PermissionName = "Payment Dashboard", DisplayPermissionName = "Payment Dashboard", LevelInfo = 1, OrderNo = 50, Url = "/accounts/dashboard", ReportGroup = "Accounting", ReportDescription = "View payment dashboard" },
                    new PermissionMaster { PermissionName = "Accounts Payable", DisplayPermissionName = "Accounts Payable (AP)", LevelInfo = 1, OrderNo = 51, Url = "/accounts/payable", ReportGroup = "Accounting", ReportDescription = "Manage accounts payable" },
                    new PermissionMaster { PermissionName = "Accounts Receivable", DisplayPermissionName = "Accounts Receivable (AR)", LevelInfo = 1, OrderNo = 52, Url = "/accounts/receivable", ReportGroup = "Accounting", ReportDescription = "Manage accounts receivable" },
                    new PermissionMaster { PermissionName = "Bank Reconciliation", DisplayPermissionName = "Bank Reconciliation", LevelInfo = 1, OrderNo = 53, Url = "/accounts/banks", ReportGroup = "Accounting", ReportDescription = "Perform bank reconciliation" },
                    new PermissionMaster { PermissionName = "Financial Reports", DisplayPermissionName = "Financial Reports", LevelInfo = 1, OrderNo = 54, Url = "/accounts/reports", ReportGroup = "Accounting", ReportDescription = "View financial reports" },
                    new PermissionMaster { PermissionName = "Accounting Setup", DisplayPermissionName = "Accounting Setup", LevelInfo = 1, OrderNo = 55, Url = "/accounts/setup", ReportGroup = "Accounting", ReportDescription = "Configure accounting settings" },
                    new PermissionMaster { PermissionName = "Journal Entries", DisplayPermissionName = "Journal Entries", LevelInfo = 1, OrderNo = 56, Url = "/accounts/journal-entries", ReportGroup = "Accounting", ReportDescription = "Manage journal entries" },
                    new PermissionMaster { PermissionName = "GL Account Activity", DisplayPermissionName = "GL Account Activity", LevelInfo = 1, OrderNo = 57, Url = "/accounts/general-ledger", ReportGroup = "Accounting", ReportDescription = "View general ledger activity" },
                    new PermissionMaster { PermissionName = "Period Close & Audit", DisplayPermissionName = "Period Close & Audit", LevelInfo = 1, OrderNo = 58, Url = "/accounts/periods", ReportGroup = "Accounting", ReportDescription = "Period close and audit" },
                    new PermissionMaster { PermissionName = "Bank Master", DisplayPermissionName = "Bank Master", LevelInfo = 1, OrderNo = 59, Url = "/masters/bank", ReportGroup = "Accounting", ReportDescription = "Manage bank master data" },
                    new PermissionMaster { PermissionName = "Credit Card Master", DisplayPermissionName = "Credit Card Master", LevelInfo = 1, OrderNo = 60, Url = "/masters/creditcard", ReportGroup = "Accounting", ReportDescription = "Manage credit card master data" },
                    new PermissionMaster { PermissionName = "Chart of Accounts Master", DisplayPermissionName = "Chart of Accounts Master", LevelInfo = 1, OrderNo = 61, Url = "/masters/chartofaccounts", ReportGroup = "Accounting", ReportDescription = "Manage chart of accounts" },

                    // Purchasing extras
                    new PermissionMaster { PermissionName = "Inventory", DisplayPermissionName = "Inventory", LevelInfo = 1, OrderNo = 24, Url = "/inventory", ReportGroup = "Purchasing", ReportDescription = "View and manage inventory" },

                    // Documents
                    new PermissionMaster { PermissionName = "Documents", DisplayPermissionName = "Documents", LevelInfo = 1, OrderNo = 45, Url = "/documents", ReportGroup = "Documents", ReportDescription = "Manage documents" },
                    
                    // Administration - Masters
                    new PermissionMaster { PermissionName = "Customer Master", DisplayPermissionName = "Customer Master", LevelInfo = 1, OrderNo = 70, Url = "/masters/customer", ReportGroup = "Administration", ReportDescription = "Manage customer master data" },
                    new PermissionMaster { PermissionName = "Vendor Master", DisplayPermissionName = "Vendor Master", LevelInfo = 1, OrderNo = 71, Url = "/masters/vendor", ReportGroup = "Administration", ReportDescription = "Manage vendor master data" },
                    new PermissionMaster { PermissionName = "Workstation Master", DisplayPermissionName = "Workstation Master", LevelInfo = 1, OrderNo = 72, Url = "/masters/workstation", ReportGroup = "Administration", ReportDescription = "Manage workstation master data" },
                    new PermissionMaster { PermissionName = "Employee Master", DisplayPermissionName = "Employee Master", LevelInfo = 1, OrderNo = 73, Url = "/masters/employee", ReportGroup = "Administration", ReportDescription = "Manage employee master data" },
                    new PermissionMaster { PermissionName = "Location Master", DisplayPermissionName = "Location Master", LevelInfo = 1, OrderNo = 74, Url = "/masters/location", ReportGroup = "Administration", ReportDescription = "Manage location master data" },
                    new PermissionMaster { PermissionName = "Process Master", DisplayPermissionName = "Process Master", LevelInfo = 1, OrderNo = 75, Url = "/masters/process", ReportGroup = "Administration", ReportDescription = "Manage process master data" },
                    new PermissionMaster { PermissionName = "Job Template Master", DisplayPermissionName = "Job Template Master", LevelInfo = 1, OrderNo = 76, Url = "/masters/jobtemplate", ReportGroup = "Administration", ReportDescription = "Manage job templates" },
                    new PermissionMaster { PermissionName = "Category Master", DisplayPermissionName = "Category Master", LevelInfo = 1, OrderNo = 77, Url = "/masters/category", ReportGroup = "Administration", ReportDescription = "Manage categories" },
                    new PermissionMaster { PermissionName = "Price Breakdown Master", DisplayPermissionName = "Price Breakdown Master", LevelInfo = 1, OrderNo = 78, Url = "/masters/pricebreakdown", ReportGroup = "Administration", ReportDescription = "Manage price breakdown master data" },
                    new PermissionMaster { PermissionName = "Product Master", DisplayPermissionName = "Product Master", LevelInfo = 1, OrderNo = 79, Url = "/masters/product", ReportGroup = "Administration", ReportDescription = "Manage product master data" },
                    new PermissionMaster { PermissionName = "Raw Material Master", DisplayPermissionName = "Raw Material Master", LevelInfo = 1, OrderNo = 80, Url = "/masters/raw-material", ReportGroup = "Administration", ReportDescription = "Manage raw materials" },
                    
                    // Administration - System
                    new PermissionMaster { PermissionName = "User Management", DisplayPermissionName = "User Management", LevelInfo = 1, OrderNo = 90, Url = "/user-management", ReportGroup = "Administration", ReportDescription = "Manage users, roles, and permissions" },
                    new PermissionMaster { PermissionName = "System Settings", DisplayPermissionName = "System Settings", LevelInfo = 1, OrderNo = 91, Url = "/settings", ReportGroup = "Administration", ReportDescription = "Configure system settings" }
                };

                await _context.PermissionMaster.AddRangeAsync(permissionsToSeed);
                await _context.SaveChangesAsync();

                return Ok(new { message = $"Successfully seeded {permissionsToSeed.Count} permissions", count = permissionsToSeed.Count });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SeedPermissions] Error: {ex.Message}");
                Console.WriteLine($"[SeedPermissions] Stack Trace: {ex.StackTrace}");
                if (ex.InnerException != null)
                {
                    Console.WriteLine($"[SeedPermissions] Inner Exception: {ex.InnerException.Message}");
                }
                return StatusCode(500, new { message = "Error seeding permissions", error = ex.Message, details = ex.InnerException?.Message });
            }
        }

        // POST: api/UserManagement/AssignPermissionsToRole
        [HttpPost("AssignPermissionsToRole")]
        public async Task<IActionResult> AssignPermissionsToRole([FromBody] AssignPermissionsDto dto)
        {
            try
            {
                // Remove existing permissions for this role
                var existingPermissions = await _context.PermissionRole
                    .Where(pr => pr.RoleId == dto.RoleId && pr.TenantId == dto.TenantId)
                    .ToListAsync();
                
                _context.PermissionRole.RemoveRange(existingPermissions);

                // Add new permissions
                var newPermissions = dto.PermissionIds.Select(permissionId => new PermissionRole
                {
                    RoleId = dto.RoleId,
                    PermissionId = permissionId,
                    TenantId = dto.TenantId
                }).ToList();

                await _context.PermissionRole.AddRangeAsync(newPermissions);
                await _context.SaveChangesAsync();

                return Ok(new { message = "Permissions assigned successfully" });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Error assigning permissions", error = ex.Message });
            }
        }

        // POST: api/UserManagement/CreateRole
        [HttpPost("CreateRole")]
        public async Task<IActionResult> CreateRole([FromBody] CreateRoleDto dto)
        {
            try
            {
                // Check if role name already exists for this tenant
                var existingRole = await _context.UserRole
                    .Where(r => r.RoleName == dto.RoleName && r.TenantId == dto.TenantId)
                    .FirstOrDefaultAsync();

                if (existingRole != null)
                {
                    return BadRequest(new { message = "Role name already exists for this tenant" });
                }

                // Get the next OrderNo if not provided
                int orderNo = dto.OrderNo ?? 0;
                if (orderNo == 0)
                {
                    var maxOrder = await _context.UserRole
                        .Where(r => r.TenantId == dto.TenantId)
                        .Select(r => (int?)r.OrderNo)
                        .MaxAsync();
                    orderNo = (maxOrder ?? 0) + 1;
                }

                var newRole = new UserRole
                {
                    RoleName = dto.RoleName,
                    RoleTag = dto.Description ?? dto.RoleName,
                    TenantId = dto.TenantId,
                    OrderNo = orderNo,
                    ResetPwd = dto.ResetPwd ?? "N"
                };

                _context.UserRole.Add(newRole);
                await _context.SaveChangesAsync();

                return Ok(new { 
                    message = "Role created successfully",
                    role = new {
                        id = newRole.RoleID,
                        name = newRole.RoleName,
                        description = newRole.RoleTag,
                        orderNo = newRole.OrderNo,
                        tenantId = newRole.TenantId
                    }
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Error creating role", error = ex.Message });
            }
        }

        // PUT: api/UserManagement/UpdateRole
        [HttpPut("UpdateRole")]
        public async Task<IActionResult> UpdateRole([FromBody] UpdateRoleDto dto)
        {
            try
            {
                var role = await _context.UserRole
                    .Where(r => r.RoleID == dto.RoleId && r.TenantId == dto.TenantId)
                    .FirstOrDefaultAsync();

                if (role == null)
                {
                    return NotFound(new { message = "Role not found" });
                }

                // Check if new name conflicts with existing role
                if (!string.IsNullOrEmpty(dto.RoleName) && dto.RoleName != role.RoleName)
                {
                    var existingRole = await _context.UserRole
                        .Where(r => r.RoleName == dto.RoleName && r.TenantId == dto.TenantId && r.RoleID != dto.RoleId)
                        .FirstOrDefaultAsync();

                    if (existingRole != null)
                    {
                        return BadRequest(new { message = "Role name already exists for this tenant" });
                    }
                }

                if (!string.IsNullOrEmpty(dto.RoleName))
                    role.RoleName = dto.RoleName;
                if (!string.IsNullOrEmpty(dto.Description))
                    role.RoleTag = dto.Description;
                if (dto.OrderNo.HasValue)
                    role.OrderNo = dto.OrderNo.Value;
                if (!string.IsNullOrEmpty(dto.ResetPwd))
                    role.ResetPwd = dto.ResetPwd;

                await _context.SaveChangesAsync();

                return Ok(new { message = "Role updated successfully" });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Error updating role", error = ex.Message });
            }
        }

        // DELETE: api/UserManagement/DeleteRole
        [HttpDelete("DeleteRole")]
        public async Task<IActionResult> DeleteRole(int roleId, int tenantId)
        {
            try
            {
                var role = await _context.UserRole
                    .Where(r => r.RoleID == roleId && r.TenantId == tenantId)
                    .FirstOrDefaultAsync();

                if (role == null)
                {
                    return NotFound(new { message = "Role not found" });
                }

                // Check if role is assigned to any users
                var usersWithRole = await _context.UserDetails
                    .Where(u => u.Role == roleId && u.TenantID == tenantId)
                    .CountAsync();

                if (usersWithRole > 0)
                {
                    return BadRequest(new { 
                        message = $"Cannot delete role. {usersWithRole} user(s) are assigned to this role.",
                        userCount = usersWithRole
                    });
                }

                // Delete associated permissions
                var rolePermissions = await _context.PermissionRole
                    .Where(pr => pr.RoleId == roleId && pr.TenantId == tenantId)
                    .ToListAsync();
                _context.PermissionRole.RemoveRange(rolePermissions);

                _context.UserRole.Remove(role);
                await _context.SaveChangesAsync();

                return Ok(new { message = "Role deleted successfully" });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Error deleting role", error = ex.Message });
            }
        }
    }

    // DTOs
    public class UserDto
    {
        public int UserUniqueID { get; set; }
        public string? FirstName { get; set; }
        public string? LastName { get; set; }
        public string? Email { get; set; }
        public string? UserName { get; set; }
        public string? Status { get; set; }
        public int? Role { get; set; }
        public string? Phone1 { get; set; }
        public string? EmployeeType { get; set; }
        public string? DateOfHire { get; set; }
        public DateTime? CreateDate { get; set; }
        public int? IsSalesAgent { get; set; }
    }

    public class UserDetailDto
    {
        public int UserUniqueID { get; set; }
        public string? FirstName { get; set; }
        public string? LastName { get; set; }
        public string? Email { get; set; }
        public string? UserName { get; set; }
        public string? Password { get; set; }
        public string? Status { get; set; }
        public int? Role { get; set; }
        public string? Phone1 { get; set; }
        public string? Phone2 { get; set; }
        public string? EmployeeType { get; set; }
        public string? DateOfHire { get; set; }
        public string? DateOfTermination { get; set; }
        public string? TerminationReason { get; set; }
        public string? Address { get; set; }
        public string? City { get; set; }
        public string? State { get; set; }
        public string? Zip { get; set; }
        public string? Street { get; set; }
        public string? PrimaryContact { get; set; }
        public string? DOB { get; set; }
        public string? SSN { get; set; }
        public int? IsSalesAgent { get; set; }
        public int? AllowPTO { get; set; }
        public int? AllowPerformance { get; set; }
        public int? SendWelcomeEmail { get; set; }
        public DateTime? CreateDate { get; set; }
    }

    // Note: CreateUserDto removed - users are created via Employee Master
    // User Management focuses on account management (roles, permissions, status, security)

    public class UpdateUserDto
    {
        public int UserUniqueID { get; set; }
        public int TenantID { get; set; }
        // Account Management Fields Only
        public string? Status { get; set; }
        public int? Role { get; set; }
        public bool IsSalesAgent { get; set; }
        public bool AllowPTO { get; set; }
        public bool AllowPerformance { get; set; }
        public string? TerminationReason { get; set; }
        // Note: Profile data (name, email, phone, address) should be managed via Employee Master
    }

    public class ResetPasswordDto
    {
        public int UserId { get; set; }
        public int TenantId { get; set; }
        public string? NewPassword { get; set; }
    }

    public class AssignPermissionsDto
    {
        public int RoleId { get; set; }
        public int TenantId { get; set; }
        public List<int> PermissionIds { get; set; } = new List<int>();
    }

    public class CreateRoleDto
    {
        public string RoleName { get; set; } = string.Empty;
        public string? Description { get; set; }
        public int TenantId { get; set; }
        public int? OrderNo { get; set; }
        public string? ResetPwd { get; set; }
    }

    public class UpdateRoleDto
    {
        public int RoleId { get; set; }
        public int TenantId { get; set; }
        public string? RoleName { get; set; }
        public string? Description { get; set; }
        public int? OrderNo { get; set; }
        public string? ResetPwd { get; set; }
    }
}
