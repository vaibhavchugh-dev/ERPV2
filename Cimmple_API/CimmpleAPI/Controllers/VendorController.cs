using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using CimmpleAPI.Data;
using CimmpleAPI.Data.Models;
using CimmpleAPI.Data.Dtos;
using CimmpleAPI.Services.Auth;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading.Tasks;

namespace CimmpleAPI.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class VendorController : ApiBaseController
    {
        private readonly CimmpleDbContext _context;
        private readonly IAuthService _authService;

        public VendorController(CimmpleDbContext context, IAuthService authService)
        {
            _context = context;
            _authService = authService;
        }

        [HttpGet("GetVendorlist")]
        public IActionResult GetVendorlist([FromQuery] int tenantid)
        {
            try
            {
                var vendors = _context.VendorMaster
                    .Where(v => v.Tenantid == tenantid)
                    .Select(v => new
                    {
                        v.vendor_id,
                        v.vendorcode,
                        v.company_name,
                        v.companyAlias,
                        v.email,
                        v.address,
                        v.apartment,
                        v.city,
                        v.state,
                        v.zip,
                        v.country,
                        v.shippingAddress,
                        v.shippingCity,
                        v.shippingStates,
                        v.shippingCountry,
                        v.shippingZipCode,
                        v.shippingApartment,
                        v.status,
                        // For now we ignore term/ship_via in the grid; they can be added later
                        term = v.term,
                        ship_via = v.ship_via,
                        // Derive contact person and phone from default contact (like CustomerMaster)
                        contactPerson = _context.VendorContact
                            .Where(vc => vc.customer_id == v.vendor_id && vc.isDefault == true)
                            .Select(vc => string.IsNullOrWhiteSpace(vc.lastname)
                                ? vc.firstname
                                : (vc.firstname + " " + vc.lastname).Trim())
                            .FirstOrDefault() ?? string.Empty,
                        phone_number = _context.VendorContact
                            .Where(vc => vc.customer_id == v.vendor_id && vc.isDefault == true)
                            .Select(vc => string.IsNullOrEmpty(vc.phoneno) ? v.phone_number : vc.phoneno)
                            .FirstOrDefault() ?? v.phone_number
                    })
                    .ToList()
                    .Select(v => new
                    {
                        v.vendor_id,
                        v.vendorcode,
                        v.company_name,
                        v.companyAlias,
                        v.email,
                        v.address,
                        v.apartment,
                        v.city,
                        v.state,
                        v.zip,
                        v.country,
                        v.shippingAddress,
                        v.shippingCity,
                        v.shippingStates,
                        v.shippingCountry,
                        v.shippingZipCode,
                        v.shippingApartment,
                        v.status,
                        v.term,
                        v.ship_via,
                        fullAddress = BuildFullAddress(v.address, v.city, v.state, v.zip),
                        v.contactPerson,
                        v.phone_number
                    })
                    .ToList();

                return Ok(new { result = vendors });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpGet("GetVendorById")]
        public IActionResult GetVendorById([FromQuery] int vendorId, [FromQuery] int tenantId)
        {
            try
            {
                var vendor = _context.VendorMaster
                    .Where(v => v.vendor_id == vendorId && v.Tenantid == tenantId)
                    .FirstOrDefault();

                if (vendor == null)
                {
                    return NotFound(new { error = "Vendor not found" });
                }

                var contacts = _context.VendorContact
                    .Where(vc => vc.customer_id == vendorId)
                    .ToList();

                var coaMapping = _context.VendorCOAMapping
                    .Where(vcm => vcm.vendorid == vendorId)
                    .FirstOrDefault();

                var portalUser = _context.UserDetails
                    .Where(u => u.VendorId == vendorId && u.TenantID == tenantId)
                    .OrderBy(u => u.User_UniqueID)
                    .FirstOrDefault();

                var portalEnabled = portalUser != null
                    && (string.IsNullOrWhiteSpace(portalUser.Status)
                        || string.Equals(portalUser.Status, "Active", StringComparison.OrdinalIgnoreCase)
                        || string.Equals(portalUser.Status, "A", StringComparison.OrdinalIgnoreCase));

                var result = new
                {
                    vendor_id = vendor.vendor_id,
                    vendorcode = vendor.vendorcode,
                    company_name = vendor.company_name,
                    companyAlias = vendor.companyAlias,
                    email = vendor.email,
                    phone_number = vendor.phone_number,
                    address = vendor.address,
                    apartment = vendor.apartment,
                    City = vendor.city,
                    states = vendor.state,
                    zipcode = vendor.zip,
                    country = vendor.country ?? "US",
                    shippingaddress = vendor.shippingAddress,
                    shippingCity = vendor.shippingCity,
                    shippingStates = vendor.shippingStates,
                    shippingCountry = vendor.shippingCountry ?? "US",
                    shippingZipCode = vendor.shippingZipCode,
                    shippingApartment = vendor.shippingApartment,
                    status = vendor.status ?? "Active",
                    term = vendor.term,
                    ship_via = vendor.ship_via,
                    TenantID = vendor.Tenantid,
                    VendorContact = contacts,
                    coaAccountId = coaMapping != null && coaMapping.accountid > 0 ? (int?)coaMapping.accountid : null,
                    defaultExpenseAccountId = coaMapping?.expenseAccountId,
                    portalAccessEnabled = portalEnabled,
                    portalHasPassword = portalUser != null && !string.IsNullOrEmpty(portalUser.Password),
                    portalUserId = portalUser?.User_UniqueID,
                    portalUserName = portalUser?.UserName
                };

                return Ok(new { result = result });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        /// <summary>
        /// Enable/disable vendor portal login and optionally set/reset the portal password.
        /// Creates a UserDetails row linked via VendorId when enabling.
        /// </summary>
        [HttpPost("SaveVendorPortalAccess")]
        public async Task<IActionResult> SaveVendorPortalAccess([FromBody] SaveVendorPortalAccessRequest request)
        {
            try
            {
                if (request == null || request.VendorId <= 0)
                {
                    return BadRequest(new { error = "VendorId is required" });
                }

                var tenantId = request.TenantId > 0 ? request.TenantId : GetTenantId();
                if (tenantId <= 0)
                {
                    return BadRequest(new { error = "TenantId is required" });
                }

                var (ok, error, result) = await ApplyVendorPortalAccessAsync(
                    request.VendorId, tenantId, request.Enabled, request.NewPassword);

                if (!ok)
                {
                    if (string.Equals(error, "Vendor not found", StringComparison.OrdinalIgnoreCase))
                    {
                        return NotFound(new { error });
                    }
                    return BadRequest(new { error });
                }

                return Ok(new { result });
            }
            catch (Exception ex)
            {
                var detail = ex.InnerException?.Message ?? ex.Message;
                return StatusCode(500, new { error = detail });
            }
        }

        private async Task<(bool ok, string? error, object? result)> ApplyVendorPortalAccessAsync(
            int vendorId, int tenantId, bool enabled, string? newPassword)
        {
            var vendor = await _context.VendorMaster
                .FirstOrDefaultAsync(v => v.vendor_id == vendorId && v.Tenantid == tenantId);

            if (vendor == null)
            {
                return (false, "Vendor not found", null);
            }

            var portalUsers = await _context.UserDetails
                .Where(u => u.VendorId == vendorId && u.TenantID == tenantId)
                .OrderBy(u => u.User_UniqueID)
                .ToListAsync();

            if (!enabled)
            {
                foreach (var user in portalUsers)
                {
                    user.Status = "Inactive";
                }

                await _context.SaveChangesAsync();
                return (true, null, new
                {
                    message = "Vendor portal access disabled",
                    portalAccessEnabled = false,
                    portalHasPassword = portalUsers.Any(u => !string.IsNullOrEmpty(u.Password)),
                    portalUserId = portalUsers.FirstOrDefault()?.User_UniqueID,
                    portalUserName = portalUsers.FirstOrDefault()?.UserName
                });
            }

            var portalUser = portalUsers.FirstOrDefault();
            var isNew = portalUser == null;
            if (portalUser == null)
            {
                var userName = await GenerateUniquePortalUserNameAsync(vendor.vendorcode, tenantId, vendorId);
                portalUser = new UserDetail
                {
                    TenantID = tenantId,
                    VendorId = vendorId,
                    UserName = userName,
                    FirstName = string.IsNullOrWhiteSpace(vendor.firstname) ? (vendor.company_name ?? "Vendor") : vendor.firstname,
                    LastName = string.IsNullOrWhiteSpace(vendor.last_name) ? "Portal" : vendor.last_name,
                    Email = vendor.email ?? vendor.ContactEmail ?? "",
                    Phone1 = vendor.phone_number ?? "",
                    Phone2 = "",
                    Status = "Active",
                    EmployeeType = "Vendor",
                    Date_of_hire = "",
                    DOB = "",
                    SSN = "",
                    EmpCode = "",
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
                    SearchSSN = "",
                    Address = vendor.address ?? "",
                    City = vendor.city ?? "",
                    State = vendor.state ?? "",
                    Zip = vendor.zip ?? "",
                    Street = "",
                    CanAccessAllLocations = false,
                    FailedLoginCount = 0
                };
                _context.UserDetails.Add(portalUser);
            }
            else
            {
                portalUser.Status = "Active";
                portalUser.VendorId = vendorId;
                portalUser.EmployeeType = "Vendor";
                if (string.IsNullOrWhiteSpace(portalUser.Email))
                {
                    portalUser.Email = vendor.email ?? vendor.ContactEmail ?? "";
                }
            }

            var passwordProvided = !string.IsNullOrWhiteSpace(newPassword);
            var hasExistingPassword = !string.IsNullOrEmpty(portalUser.Password);

            if (passwordProvided)
            {
                var settings = await _context.SystemSettings
                    .FirstOrDefaultAsync(s => s.TenantId == tenantId)
                    ?? new SystemSettings { TenantId = tenantId };

                if (!_authService.ValidatePasswordAgainstPolicy(newPassword!, settings, out var policyError))
                {
                    return (false, policyError ?? "Password does not meet policy requirements", null);
                }

                await _authService.EnsurePasswordHashedAsync(portalUser, newPassword!);
                portalUser.PwdResetDate = DateTime.UtcNow;
                portalUser.ChangePassword = "N";
                portalUser.FailedLoginCount = 0;
                portalUser.LockoutEndUtc = null;
            }
            else if (isNew || !hasExistingPassword)
            {
                return (false, "Password is required when enabling portal access for the first time.", null);
            }

            await _context.SaveChangesAsync();

            return (true, null, new
            {
                message = isNew ? "Vendor portal access enabled" : "Vendor portal access updated",
                portalAccessEnabled = true,
                portalHasPassword = !string.IsNullOrEmpty(portalUser.Password),
                portalUserId = portalUser.User_UniqueID,
                portalUserName = portalUser.UserName,
                vendorCode = vendor.vendorcode
            });
        }

        private async Task<string> GenerateUniquePortalUserNameAsync(string? vendorCode, int tenantId, int vendorId)
        {
            var code = string.IsNullOrWhiteSpace(vendorCode) ? vendorId.ToString() : vendorCode.Trim();
            var baseName = $"vendor.{code}";
            var candidate = baseName;
            var suffix = 0;
            while (await _context.UserDetails.AnyAsync(u =>
                       u.TenantID == tenantId
                       && u.UserName == candidate
                       && (u.VendorId == null || u.VendorId != vendorId)))
            {
                suffix++;
                candidate = $"{baseName}.{suffix}";
            }

            return candidate;
        }

        // Manual body deserialization to avoid any stale model-binding metadata issues
        [HttpPost("SaveVendorData")]
        public async Task<IActionResult> SaveVendorData()
        {
            try
            {
                using var reader = new StreamReader(Request.Body);
                var body = await reader.ReadToEndAsync();
                if (string.IsNullOrWhiteSpace(body))
                {
                    return BadRequest(new { error = "Request body is required." });
                }

                var request = System.Text.Json.JsonSerializer.Deserialize<VendorMasterReq>(body,
                    new System.Text.Json.JsonSerializerOptions { PropertyNameCaseInsensitive = true });

                if (request == null)
                {
                    return BadRequest(new { error = "Invalid request payload." });
                }

                if (request.TenantID == 0)
                {
                    return BadRequest(new { error = "TenantID is required" });
                }

                if (string.IsNullOrWhiteSpace(request.company_name))
                {
                    return BadRequest(new { error = "Vendor name is required." });
                }

                if (request.vendor_id == 0)
                {
                    // Create new vendor
                    var newVendor = new VendorMaster
                    {
                        company_name = request.company_name,
                        companyAlias = request.companyAlias ?? string.Empty,
                        email = request.email ?? string.Empty,
                        phone_number = request.phone_number ?? string.Empty,
                        address = request.address ?? string.Empty,
                        apartment = request.apartment ?? string.Empty,
                        city = request.City ?? string.Empty,
                        state = request.states ?? string.Empty,
                        zip = request.zipcode ?? string.Empty,
                        country = request.country ?? "US",
                        shippingAddress = request.shippingaddress ?? string.Empty,
                        shippingCity = request.shippingCity ?? string.Empty,
                        shippingStates = request.shippingStates ?? string.Empty,
                        shippingCountry = request.shippingCountry ?? "US",
                        shippingZipCode = request.shippingZipCode ?? string.Empty,
                        shippingApartment = request.shippingApartment ?? string.Empty,
                        status = request.status ?? "Active",
                        term = request.term ?? string.Empty,
                        ship_via = request.ship_via ?? string.Empty,
                        Tenantid = request.TenantID,
                        vendorcode = GenerateVendorCode(request.TenantID),
                        // Set required fields that may not be in the request
                        ContactEmail = request.email ?? string.Empty,
                        WebAddress = string.Empty,
                        last_name = string.Empty,
                        firstname = string.Empty
                    };

                    // Set firstname and last_name from default contact (if provided)
                    if (request.VendorContact != null && request.VendorContact.Any())
                    {
                        var defaultContact = request.VendorContact.FirstOrDefault(c => c.isDefault)
                                            ?? request.VendorContact.FirstOrDefault();
                        if (defaultContact != null)
                        {
                            newVendor.firstname = defaultContact.firstname ?? string.Empty;
                            newVendor.last_name = defaultContact.lastname ?? string.Empty;
                            newVendor.ContactEmail = defaultContact.email ?? string.Empty;
                        }
                    }

                    _context.VendorMaster.Add(newVendor);
                    _context.SaveChanges();

                    // Save contacts if provided
                    if (request.VendorContact != null && request.VendorContact.Any())
                    {
                        foreach (var contact in request.VendorContact)
                        {
                            var vendorContact = new VendorContact
                            {
                                customer_id = newVendor.vendor_id,
                                title = contact.title ?? string.Empty,
                                firstname = contact.firstname ?? string.Empty,
                                lastname = contact.lastname ?? string.Empty,
                                phoneno = contact.phoneno ?? string.Empty,
                                email = contact.email ?? string.Empty,
                                isDefault = contact.isDefault
                            };
                            _context.VendorContact.Add(vendorContact);
                        }
                        _context.SaveChanges();
                    }

                    UpsertVendorCoaMapping(newVendor.vendor_id, request.coaAccountId, request.defaultExpenseAccountId);

                    if (request.portalAccessEnabled.HasValue)
                    {
                        var (ok, portalError, _) = await ApplyVendorPortalAccessAsync(
                            newVendor.vendor_id, request.TenantID, request.portalAccessEnabled.Value, request.portalPassword);
                        if (!ok)
                        {
                            return BadRequest(new { error = portalError });
                        }
                    }

                    return Ok(new { result = new { vendor_id = newVendor.vendor_id, message = "Vendor created successfully" } });
                }
                else
                {
                    // Update existing vendor
                    var existingVendor = _context.VendorMaster
                        .Where(v => v.vendor_id == request.vendor_id && v.Tenantid == request.TenantID)
                        .FirstOrDefault();

                    if (existingVendor == null)
                    {
                        return NotFound(new { error = "Vendor not found" });
                    }

                    existingVendor.company_name = request.company_name;
                    existingVendor.companyAlias = request.companyAlias ?? string.Empty;
                    existingVendor.email = request.email ?? string.Empty;
                    existingVendor.phone_number = request.phone_number ?? string.Empty;
                    existingVendor.address = request.address ?? string.Empty;
                    existingVendor.apartment = request.apartment ?? string.Empty;
                    existingVendor.city = request.City ?? string.Empty;
                    existingVendor.state = request.states ?? string.Empty;
                    existingVendor.zip = request.zipcode ?? string.Empty;
                    existingVendor.country = request.country ?? "US";
                    existingVendor.shippingAddress = request.shippingaddress ?? string.Empty;
                    existingVendor.shippingCity = request.shippingCity ?? string.Empty;
                    existingVendor.shippingStates = request.shippingStates ?? string.Empty;
                    existingVendor.shippingCountry = request.shippingCountry ?? "US";
                    existingVendor.shippingZipCode = request.shippingZipCode ?? string.Empty;
                    existingVendor.shippingApartment = request.shippingApartment ?? string.Empty;
                    existingVendor.status = request.status ?? "Active";
                    existingVendor.term = request.term ?? string.Empty;
                    existingVendor.ship_via = request.ship_via ?? string.Empty;

                    // Set required fields that may not be in the request
                    existingVendor.ContactEmail = request.email ?? string.Empty;
                    existingVendor.WebAddress = existingVendor.WebAddress ?? string.Empty;

                    // Set firstname and last_name from default contact (if provided)
                    if (request.VendorContact != null && request.VendorContact.Any())
                    {
                        var defaultContact = request.VendorContact.FirstOrDefault(c => c.isDefault)
                                            ?? request.VendorContact.FirstOrDefault();
                        if (defaultContact != null)
                        {
                            existingVendor.firstname = defaultContact.firstname ?? string.Empty;
                            existingVendor.last_name = defaultContact.lastname ?? string.Empty;
                            existingVendor.ContactEmail = defaultContact.email ?? string.Empty;
                        }
                    }
                    else
                    {
                        // Ensure required fields are set even if no contacts
                        existingVendor.firstname = existingVendor.firstname ?? string.Empty;
                        existingVendor.last_name = existingVendor.last_name ?? string.Empty;
                    }

                    _context.SaveChanges();

                    // Replace contacts
                    if (request.VendorContact != null && request.VendorContact.Any())
                    {
                        var existingContacts = _context.VendorContact
                            .Where(vc => vc.customer_id == request.vendor_id)
                            .ToList();
                        _context.VendorContact.RemoveRange(existingContacts);

                        foreach (var contact in request.VendorContact)
                        {
                            var vendorContact = new VendorContact
                            {
                                customer_id = request.vendor_id,
                                title = contact.title ?? string.Empty,
                                firstname = contact.firstname ?? string.Empty,
                                lastname = contact.lastname ?? string.Empty,
                                phoneno = contact.phoneno ?? string.Empty,
                                email = contact.email ?? string.Empty,
                                isDefault = contact.isDefault
                            };
                            _context.VendorContact.Add(vendorContact);
                        }
                        _context.SaveChanges();
                    }

                    UpsertVendorCoaMapping(request.vendor_id, request.coaAccountId, request.defaultExpenseAccountId);

                    if (request.portalAccessEnabled.HasValue)
                    {
                        var (ok, portalError, _) = await ApplyVendorPortalAccessAsync(
                            existingVendor.vendor_id, request.TenantID, request.portalAccessEnabled.Value, request.portalPassword);
                        if (!ok)
                        {
                            return BadRequest(new { error = portalError });
                        }
                    }

                    return Ok(new { result = new { vendor_id = existingVendor.vendor_id, message = "Vendor updated successfully" } });
                }
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        private string GenerateVendorCode(int tenantId)
        {
            var maxCode = _context.VendorMaster
                .Where(v => v.Tenantid == tenantId)
                .Count();
            return $"V{(maxCode + 1001)}";
        }

        [HttpPost("ImportVendors")]
        public IActionResult ImportVendors([FromBody] VendorImportRequest request)
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

                var existing = _context.VendorMaster
                    .Where(v => v.Tenantid == request.Tenantid)
                    .ToList();

                var existingIds = existing.Select(v => v.vendor_id).ToList();
                var existingContacts = existingIds.Count == 0
                    ? new List<VendorContact>()
                    : _context.VendorContact
                        .Where(vc => existingIds.Contains(vc.customer_id))
                        .ToList();

                int nextCodeSeq = existing.Count + 1001;
                var result = new VendorImportResult();
                var rowResults = new List<VendorImportRowResult>();
                var batchNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                var batchCodes = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

                using var tx = _context.Database.BeginTransaction();
                try
                {
                    for (int i = 0; i < request.Rows.Count; i++)
                    {
                        var row = request.Rows[i];
                        var rowNumber = row.RowNumber ?? (i + 2);
                        var rowResult = new VendorImportRowResult { RowNumber = rowNumber };

                        var companyName = (row.CompanyName ?? "").Trim();
                        var vendorCode = (row.VendorCode ?? "").Trim();

                        if (string.IsNullOrWhiteSpace(companyName))
                        {
                            rowResult.Status = "Error";
                            rowResult.Message = "Company Name is required";
                            result.Failed++;
                            rowResults.Add(rowResult);
                            continue;
                        }

                        if (!string.IsNullOrEmpty(vendorCode) && !batchCodes.Add(vendorCode))
                        {
                            rowResult.Status = "Error";
                            rowResult.Message = $"Duplicate Vendor Code '{vendorCode}' in import file";
                            result.Failed++;
                            rowResults.Add(rowResult);
                            continue;
                        }

                        if (!batchNames.Add(companyName))
                        {
                            rowResult.Status = "Error";
                            rowResult.Message = $"Duplicate Company Name '{companyName}' in import file";
                            result.Failed++;
                            rowResults.Add(rowResult);
                            continue;
                        }

                        VendorMaster? match = null;
                        if (!string.IsNullOrEmpty(vendorCode))
                        {
                            match = existing.FirstOrDefault(v =>
                                string.Equals(v.vendorcode, vendorCode, StringComparison.OrdinalIgnoreCase));
                        }
                        if (match == null)
                        {
                            match = existing.FirstOrDefault(v =>
                                string.Equals(v.company_name, companyName, StringComparison.OrdinalIgnoreCase));
                        }

                        var nameConflict = existing.FirstOrDefault(v =>
                            (match == null || v.vendor_id != match.vendor_id) &&
                            string.Equals(v.company_name, companyName, StringComparison.OrdinalIgnoreCase));
                        if (nameConflict != null)
                        {
                            rowResult.Status = "Error";
                            rowResult.Message = $"Company Name '{companyName}' already exists";
                            result.Failed++;
                            rowResults.Add(rowResult);
                            continue;
                        }

                        if (!string.IsNullOrEmpty(vendorCode))
                        {
                            var codeConflict = existing.FirstOrDefault(v =>
                                (match == null || v.vendor_id != match.vendor_id) &&
                                !string.IsNullOrEmpty(v.vendorcode) &&
                                string.Equals(v.vendorcode, vendorCode, StringComparison.OrdinalIgnoreCase));
                            if (codeConflict != null)
                            {
                                rowResult.Status = "Error";
                                rowResult.Message = $"Vendor Code '{vendorCode}' already exists";
                                result.Failed++;
                                rowResults.Add(rowResult);
                                continue;
                            }
                        }

                        var status = ParseVendorStatus(row.Status);
                        var country = string.IsNullOrWhiteSpace(row.Country) ? null : row.Country.Trim();
                        var shippingCountry = string.IsNullOrWhiteSpace(row.ShippingCountry) ? null : row.ShippingCountry.Trim();

                        VendorMaster vendor;
                        bool isNew = match == null;

                        if (match != null)
                        {
                            if (!request.UpdateExisting)
                            {
                                rowResult.Status = "Skipped";
                                rowResult.Message = "Vendor already exists";
                                rowResult.VendorId = match.vendor_id;
                                result.Skipped++;
                                rowResults.Add(rowResult);
                                continue;
                            }

                            vendor = match;
                            if (!string.IsNullOrEmpty(vendorCode)) vendor.vendorcode = vendorCode;
                            vendor.company_name = companyName;
                            if (row.CompanyAlias != null) vendor.companyAlias = row.CompanyAlias.Trim();
                            if (row.Email != null) vendor.email = row.Email.Trim();
                            if (row.Phone != null) vendor.phone_number = row.Phone.Trim();
                            if (row.Address != null) vendor.address = row.Address.Trim();
                            if (row.Apartment != null) vendor.apartment = row.Apartment.Trim();
                            if (row.City != null) vendor.city = row.City.Trim();
                            if (row.State != null) vendor.state = row.State.Trim();
                            if (row.Zip != null) vendor.zip = row.Zip.Trim();
                            if (country != null) vendor.country = country;
                            if (row.ShippingAddress != null) vendor.shippingAddress = row.ShippingAddress.Trim();
                            if (row.ShippingApartment != null) vendor.shippingApartment = row.ShippingApartment.Trim();
                            if (row.ShippingCity != null) vendor.shippingCity = row.ShippingCity.Trim();
                            if (row.ShippingState != null) vendor.shippingStates = row.ShippingState.Trim();
                            if (row.ShippingZip != null) vendor.shippingZipCode = row.ShippingZip.Trim();
                            if (shippingCountry != null) vendor.shippingCountry = shippingCountry;
                            if (row.Term != null) vendor.term = row.Term.Trim();
                            if (row.ShipVia != null) vendor.ship_via = row.ShipVia.Trim();
                            if (status != null) vendor.status = status;
                            vendor.ContactEmail = vendor.email ?? "";

                            rowResult.Status = "Updated";
                            rowResult.Message = "Updated";
                            rowResult.VendorId = vendor.vendor_id;
                            result.Updated++;
                        }
                        else
                        {
                            vendor = new VendorMaster
                            {
                                Tenantid = request.Tenantid,
                                vendorcode = string.IsNullOrEmpty(vendorCode) ? $"V{nextCodeSeq++}" : vendorCode,
                                company_name = companyName,
                                companyAlias = row.CompanyAlias?.Trim() ?? "",
                                email = row.Email?.Trim() ?? "",
                                phone_number = row.Phone?.Trim() ?? "",
                                address = row.Address?.Trim() ?? "",
                                apartment = row.Apartment?.Trim() ?? "",
                                city = row.City?.Trim() ?? "",
                                state = row.State?.Trim() ?? "",
                                zip = row.Zip?.Trim() ?? "",
                                country = country ?? "US",
                                shippingAddress = row.ShippingAddress?.Trim() ?? "",
                                shippingApartment = row.ShippingApartment?.Trim() ?? "",
                                shippingCity = row.ShippingCity?.Trim() ?? "",
                                shippingStates = row.ShippingState?.Trim() ?? "",
                                shippingZipCode = row.ShippingZip?.Trim() ?? "",
                                shippingCountry = shippingCountry ?? "US",
                                status = status ?? "Active",
                                term = row.Term?.Trim() ?? "",
                                ship_via = row.ShipVia?.Trim() ?? "",
                                ContactEmail = row.Email?.Trim() ?? "",
                                WebAddress = "",
                                firstname = row.ContactFirstName?.Trim() ?? "",
                                last_name = row.ContactLastName?.Trim() ?? ""
                            };
                            _context.VendorMaster.Add(vendor);
                            existing.Add(vendor);
                            _context.SaveChanges();

                            rowResult.Status = "Created";
                            rowResult.Message = "Created";
                            rowResult.VendorId = vendor.vendor_id;
                            result.Created++;
                        }

                        UpsertImportedVendorContact(vendor, row, existingContacts, isNew);
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

        private void UpsertImportedVendorContact(
            VendorMaster vendor,
            VendorImportRow row,
            List<VendorContact> existingContacts,
            bool isNew)
        {
            var hasContactData =
                !string.IsNullOrWhiteSpace(row.ContactFirstName) ||
                !string.IsNullOrWhiteSpace(row.ContactLastName) ||
                !string.IsNullOrWhiteSpace(row.ContactPhone) ||
                !string.IsNullOrWhiteSpace(row.ContactEmail) ||
                !string.IsNullOrWhiteSpace(row.ContactTitle);

            if (!hasContactData && !isNew) return;

            var contact = existingContacts.FirstOrDefault(c =>
                c.customer_id == vendor.vendor_id && c.isDefault);

            if (contact == null && !isNew)
            {
                contact = existingContacts.FirstOrDefault(c => c.customer_id == vendor.vendor_id);
            }

            if (contact == null)
            {
                if (!hasContactData) return;

                contact = new VendorContact
                {
                    customer_id = vendor.vendor_id,
                    title = row.ContactTitle?.Trim() ?? "",
                    firstname = row.ContactFirstName?.Trim() ?? "",
                    lastname = row.ContactLastName?.Trim() ?? "",
                    phoneno = row.ContactPhone?.Trim() ?? row.Phone?.Trim() ?? "",
                    email = row.ContactEmail?.Trim() ?? row.Email?.Trim() ?? "",
                    isDefault = true
                };
                _context.VendorContact.Add(contact);
                existingContacts.Add(contact);
            }
            else if (hasContactData)
            {
                if (row.ContactTitle != null) contact.title = row.ContactTitle.Trim();
                if (row.ContactFirstName != null) contact.firstname = row.ContactFirstName.Trim();
                if (row.ContactLastName != null) contact.lastname = row.ContactLastName.Trim();
                if (row.ContactPhone != null) contact.phoneno = row.ContactPhone.Trim();
                if (row.ContactEmail != null) contact.email = row.ContactEmail.Trim();
                contact.isDefault = true;
            }

            if (!string.IsNullOrWhiteSpace(contact.firstname))
                vendor.firstname = contact.firstname;
            if (!string.IsNullOrWhiteSpace(contact.lastname))
                vendor.last_name = contact.lastname;
        }

        private static string? ParseVendorStatus(string? value)
        {
            if (string.IsNullOrWhiteSpace(value)) return null;
            var v = value.Trim().ToLowerInvariant();
            if (v is "active" or "1" or "yes" or "true") return "Active";
            if (v is "inactive" or "0" or "no" or "false") return "Inactive";
            return null;
        }

        [HttpGet("CheckVendorDeletionImpact")]
        public IActionResult CheckVendorDeletionImpact([FromQuery] int vendorId, [FromQuery] int tenantId)
        {
            try
            {
                var vendor = _context.VendorMaster
                    .FirstOrDefault(v => v.vendor_id == vendorId && v.Tenantid == tenantId);

                if (vendor == null)
                {
                    return NotFound(new { error = "Vendor not found" });
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

                // Check for Vendor Orders
                var vendorOrders = _context.VendorOrders
                    .Where(vo => vo.VendorID == vendorId && vo.Tenantid == tenantId)
                    .ToList();

                if (vendorOrders.Any())
                {
                    var orderDependency = new BlockingDependency
                    {
                        EntityType = "VendorOrder",
                        Description = $"Vendor has {vendorOrders.Count} order(s) associated",
                        Items = vendorOrders.Select(vo => new DependencyItem
                        {
                            Id = vo.OrderID,
                            Name = $"VO#{vo.PONumber}",
                            DeleteEndpoint = $"/Order/DeleteVendorOrder?orderId={vo.OrderID}&tenantId={tenantId}"
                        }).ToList()
                    };

                    impact.BlockingDependencies.Add(orderDependency);
                    impact.BlockingReasons.Add(
                        $"Vendor has {vendorOrders.Count} order(s) associated: {string.Join(", ", vendorOrders.Select(vo => $"VO#{vo.PONumber}"))}. Delete orders first."
                    );
                    impact.CanDelete = false;
                }

                // Check for Vendor Quotations
                var quotations = _context.VendorQuotations
                    .Where(vq => vq.VendorID == vendorId && vq.Tenantid == tenantId)
                    .ToList();

                if (quotations.Any())
                {
                    var quotationDependency = new BlockingDependency
                    {
                        EntityType = "VendorQuotation",
                        Description = $"Vendor has {quotations.Count} quotation(s) associated",
                        Items = quotations.Select(vq => new DependencyItem
                        {
                            Id = vq.OrderID,
                            Name = $"VQ#{vq.PONumber}",
                            DeleteEndpoint = $"/Quotation/DeleteVendorQuotation?quotationId={vq.OrderID}&tenantId={tenantId}"
                        }).ToList()
                    };

                    impact.BlockingDependencies.Add(quotationDependency);
                    impact.BlockingReasons.Add(
                        $"Vendor has {quotations.Count} quotation(s) associated: {string.Join(", ", quotations.Select(vq => $"VQ#{vq.PONumber}"))}. Delete quotations first."
                    );
                    impact.CanDelete = false;
                }

                // Check for Vendor Invoices
                var vendorInvoices = _context.VendorInvoiceMaster
                    .Where(vim => vim.vid == vendorId && vim.TenantId == tenantId)
                    .ToList();

                if (vendorInvoices.Any())
                {
                    var invoiceDependency = new BlockingDependency
                    {
                        EntityType = "VendorInvoice",
                        Description = $"Vendor has {vendorInvoices.Count} invoice(s) associated",
                        Items = vendorInvoices.Select(vim => new DependencyItem
                        {
                            Id = vim.Id,
                            Name = vim.InvoiceNo ?? $"Invoice #{vim.Id}",
                            DeleteEndpoint = $"/VendorInvoice/DeleteVendorInvoice/{vim.Id}"
                        }).ToList()
                    };

                    impact.BlockingDependencies.Add(invoiceDependency);
                    impact.BlockingReasons.Add(
                        $"Vendor has {vendorInvoices.Count} invoice(s) associated: {string.Join(", ", vendorInvoices.Select(vim => vim.InvoiceNo ?? $"Invoice #{vim.Id}"))}. Delete invoices first."
                    );
                    impact.CanDelete = false;
                }

                // Check for Vendor Receiving
                var vendorOrderDetailIds = _context.VendorOrderDetails
                    .Where(vod => vendorOrders.Select(vo => vo.OrderID).Contains(vod.OrderID))
                    .Select(vod => vod.ID)
                    .ToList();

                if (vendorOrderDetailIds.Any())
                {
                    var receivingRecords = _context.VendorReceiving
                        .Where(vr => vendorOrderDetailIds.Contains(vr.VendorOrderDetailID) && vr.Tenantid == tenantId)
                        .ToList();

                    if (receivingRecords.Any())
                    {
                        impact.BlockingReasons.Add(
                            $"Vendor has {receivingRecords.Count} receiving record(s) associated with orders. Delete orders first."
                        );
                        impact.CanDelete = false;
                    }
                }

                // If can delete, list what will be deleted
                if (impact.CanDelete)
                {
                    var contactCount = _context.VendorContact
                        .Count(vc => vc.customer_id == vendorId);
                    if (contactCount > 0)
                    {
                        impact.WillBeDeleted.Add(new ImpactedEntity
                        {
                            EntityType = "Contacts",
                            Count = contactCount,
                            Description = $"{contactCount} contact(s) will be deleted"
                        });
                    }

                    var coaMappingCount = _context.VendorCOAMapping
                        .Count(vcm => vcm.vendorid == vendorId);
                    if (coaMappingCount > 0)
                    {
                        impact.WillBeDeleted.Add(new ImpactedEntity
                        {
                            EntityType = "COA Mappings",
                            Count = coaMappingCount,
                            Description = $"{coaMappingCount} COA mapping(s) will be deleted"
                        });
                    }

                    impact.Warnings.Add("This action cannot be undone");
                }

                return Ok(new { result = impact });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message, stackTrace = ex.StackTrace });
            }
        }

        [HttpDelete("DeleteVendor")]
        public IActionResult DeleteVendor([FromQuery] int vendorId, [FromQuery] int tenantId)
        {
            try
            {
                var vendor = _context.VendorMaster
                    .FirstOrDefault(v => v.vendor_id == vendorId && v.Tenantid == tenantId);

                if (vendor == null)
                {
                    return NotFound(new { error = "Vendor not found" });
                }

                // Delete related entities
                var contacts = _context.VendorContact
                    .Where(vc => vc.customer_id == vendorId)
                    .ToList();
                _context.VendorContact.RemoveRange(contacts);

                var coaMappings = _context.VendorCOAMapping
                    .Where(vcm => vcm.vendorid == vendorId)
                    .ToList();
                _context.VendorCOAMapping.RemoveRange(coaMappings);

                // Delete the vendor
                _context.VendorMaster.Remove(vendor);
                _context.SaveChanges();

                return Ok(new { result = new { message = "Vendor deleted successfully" } });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message, stackTrace = ex.StackTrace });
            }
        }

        private string BuildFullAddress(string address, string city, string state, string zip)
        {
            var parts = new List<string>();
            if (!string.IsNullOrWhiteSpace(address)) parts.Add(address);
            if (!string.IsNullOrWhiteSpace(city)) parts.Add(city);
            if (!string.IsNullOrWhiteSpace(state) || !string.IsNullOrWhiteSpace(zip))
            {
                var stateZip = string.IsNullOrWhiteSpace(state)
                    ? zip
                    : string.IsNullOrWhiteSpace(zip)
                        ? state
                        : $"{state} {zip}";
                parts.Add(stateZip);
            }
            return parts.Count > 0 ? string.Join(", ", parts) : string.Empty;
        }

        /// <summary>
        /// Upserts vendor AP (accountid) and optional default expense mapping.
        /// Removes the row when both accounts are cleared.
        /// </summary>
        private void UpsertVendorCoaMapping(int vendorId, int? apAccountId, int? expenseAccountId)
        {
            var hasAp = apAccountId.HasValue && apAccountId.Value > 0;
            var hasExpense = expenseAccountId.HasValue && expenseAccountId.Value > 0;
            var existing = _context.VendorCOAMapping.FirstOrDefault(vcm => vcm.vendorid == vendorId);

            if (!hasAp && !hasExpense)
            {
                if (existing != null)
                {
                    _context.VendorCOAMapping.Remove(existing);
                    _context.SaveChanges();
                }
                return;
            }

            if (existing == null)
            {
                _context.VendorCOAMapping.Add(new VendorCOAMapping
                {
                    vendorid = vendorId,
                    accountid = hasAp ? apAccountId!.Value : 0,
                    expenseAccountId = hasExpense ? expenseAccountId : null
                });
            }
            else
            {
                existing.accountid = hasAp ? apAccountId!.Value : 0;
                existing.expenseAccountId = hasExpense ? expenseAccountId : null;
                _context.VendorCOAMapping.Update(existing);
            }

            _context.SaveChanges();
        }
    }

    public class VendorMasterReq
    {
        public int vendor_id { get; set; }
        // Only vendor name is required; all other fields are optional
        public string company_name { get; set; } = string.Empty;
        public string? companyAlias { get; set; }
        public string? email { get; set; }
        public string? phone_number { get; set; }
        public string? address { get; set; }
        public string? apartment { get; set; }
        public string? City { get; set; }
        public string? states { get; set; }
        public string? zipcode { get; set; }
        public string? country { get; set; }
        public string? shippingaddress { get; set; }
        public string? shippingCity { get; set; }
        public string? shippingStates { get; set; }
        public string? shippingCountry { get; set; }
        public string? shippingZipCode { get; set; }
        public string? shippingApartment { get; set; }
        public string? status { get; set; }
        public string? term { get; set; }
        public string? ship_via { get; set; }
        public int TenantID { get; set; }
        public List<VendorContactReq>? VendorContact { get; set; }
        /// <summary>Optional Accounts Payable control account.</summary>
        public int? coaAccountId { get; set; }
        /// <summary>Optional default expense account when PO lines have no glcode.</summary>
        public int? defaultExpenseAccountId { get; set; }

        /// <summary>When set, enable/disable vendor portal login as part of save.</summary>
        public bool? portalAccessEnabled { get; set; }
        /// <summary>Optional new portal password (required when enabling without an existing password).</summary>
        public string? portalPassword { get; set; }
    }

    public class VendorContactReq
    {
        public int id { get; set; }
        public int customer_id { get; set; }
        public string title { get; set; }
        public string firstname { get; set; }
        public string lastname { get; set; }
        public string phoneno { get; set; }
        public string email { get; set; }
        public bool isDefault { get; set; }
    }

    public class VendorImportRequest
    {
        public int Tenantid { get; set; }
        public bool UpdateExisting { get; set; } = true;
        public bool StopOnError { get; set; } = false;
        public List<VendorImportRow> Rows { get; set; } = new();
    }

    public class VendorImportRow
    {
        public int? RowNumber { get; set; }
        public string? VendorCode { get; set; }
        public string? CompanyName { get; set; }
        public string? CompanyAlias { get; set; }
        public string? Email { get; set; }
        public string? Phone { get; set; }
        public string? Address { get; set; }
        public string? Apartment { get; set; }
        public string? City { get; set; }
        public string? State { get; set; }
        public string? Zip { get; set; }
        public string? Country { get; set; }
        public string? ShippingAddress { get; set; }
        public string? ShippingApartment { get; set; }
        public string? ShippingCity { get; set; }
        public string? ShippingState { get; set; }
        public string? ShippingZip { get; set; }
        public string? ShippingCountry { get; set; }
        public string? Term { get; set; }
        public string? ShipVia { get; set; }
        public string? Status { get; set; }
        public string? ContactTitle { get; set; }
        public string? ContactFirstName { get; set; }
        public string? ContactLastName { get; set; }
        public string? ContactPhone { get; set; }
        public string? ContactEmail { get; set; }
    }

    public class VendorImportResult
    {
        public int Created { get; set; }
        public int Updated { get; set; }
        public int Skipped { get; set; }
        public int Failed { get; set; }
        public List<VendorImportRowResult> Rows { get; set; } = new();
    }

    public class VendorImportRowResult
    {
        public int RowNumber { get; set; }
        public int? VendorId { get; set; }
        public string Status { get; set; } = "";
        public string Message { get; set; } = "";
        public string? Warning { get; set; }
    }

    public class SaveVendorPortalAccessRequest
    {
        public int VendorId { get; set; }
        public int TenantId { get; set; }
        public bool Enabled { get; set; }
        public string? NewPassword { get; set; }
    }
}





