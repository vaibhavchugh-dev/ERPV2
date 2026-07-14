using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using CimmpleAPI.Data;
using CimmpleAPI.Data.Models;
using System;
using System.Linq;
using System.Threading.Tasks;

namespace CimmpleAPI.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class SystemSettingsController : ApiBaseController
    {
        private readonly CimmpleDbContext _context;

        public SystemSettingsController(CimmpleDbContext context)
        {
            _context = context;
        }

        // GET: api/SystemSettings/GetSettings
        [HttpGet("GetSettings")]
        public async Task<IActionResult> GetSettings([FromQuery] int tenantId)
        {
            try
            {
                // Check if table exists by attempting to query it
                try
                {
                    var settings = await _context.SystemSettings
                        .FirstOrDefaultAsync(s => s.TenantId == tenantId);

                    if (settings == null)
                    {
                        // Return default settings if none exist
                        return Ok(new SystemSettings
                        {
                            TenantId = tenantId,
                            DateFormat = "M/d/yyyy",
                            TimeFormat = "12",
                            Timezone = "America/New_York",
                            Locale = "en-US",
                            DefaultCurrency = "USD",
                            CurrencySymbol = "$",
                            DecimalPlaces = 2,
                            DecimalSeparator = ".",
                            ThousandsSeparator = ",",
                            MinPasswordLength = 8,
                            RequireUppercase = true,
                            RequireLowercase = true,
                            RequireNumbers = true,
                            RequireSpecialChars = false,
                            PasswordExpirationDays = 90,
                            PasswordHistoryCount = 5,
                            SessionTimeoutMinutes = 30,
                            MaxConcurrentSessions = 3,
                            FailedLoginAttempts = 5,
                            AccountLockoutMinutes = 15,
                            SmtpPort = 587,
                            SmtpUseSsl = true,
                            DefaultPageSize = 10,
                            EnableEmailNotifications = true,
                            EnableInAppNotifications = true
                        });
                    }

                    return Ok(settings);
                }
                catch (Exception dbEx)
                {
                    // Check if it's a "table doesn't exist" error
                    if (dbEx.Message.Contains("Invalid object name") || 
                        dbEx.Message.Contains("SystemSettings") ||
                        dbEx.Message.Contains("does not exist") ||
                        (dbEx.InnerException != null && dbEx.InnerException.Message.Contains("Invalid object name")))
                    {
                        Console.WriteLine($"[GetSettings] SystemSettings table does not exist. Please run create_systemsettings_table.sql");
                        // Return default settings even if table doesn't exist
                        return Ok(new SystemSettings
                        {
                            TenantId = tenantId,
                            DateFormat = "M/d/yyyy",
                            TimeFormat = "12",
                            Timezone = "America/New_York",
                            Locale = "en-US",
                            DefaultCurrency = "USD",
                            CurrencySymbol = "$",
                            DecimalPlaces = 2,
                            DecimalSeparator = ".",
                            ThousandsSeparator = ",",
                            MinPasswordLength = 8,
                            RequireUppercase = true,
                            RequireLowercase = true,
                            RequireNumbers = true,
                            RequireSpecialChars = false,
                            PasswordExpirationDays = 90,
                            PasswordHistoryCount = 5,
                            SessionTimeoutMinutes = 30,
                            MaxConcurrentSessions = 3,
                            FailedLoginAttempts = 5,
                            AccountLockoutMinutes = 15,
                            SmtpPort = 587,
                            SmtpUseSsl = true,
                            DefaultPageSize = 10,
                            EnableEmailNotifications = true,
                            EnableInAppNotifications = true
                        });
                    }
                    throw; // Re-throw if it's a different error
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[GetSettings] Error: {ex.Message}");
                Console.WriteLine($"[GetSettings] StackTrace: {ex.StackTrace}");
                return StatusCode(500, new { message = "Error retrieving system settings", error = ex.Message, details = ex.StackTrace });
            }
        }

        // POST: api/SystemSettings/SaveSettings
        [HttpPost("SaveSettings")]
        public async Task<IActionResult> SaveSettings([FromBody] SystemSettings settings)
        {
            try
            {
                if (settings == null)
                {
                    return BadRequest(new { message = "Settings data is required" });
                }

                var existingSettings = await _context.SystemSettings
                    .FirstOrDefaultAsync(s => s.TenantId == settings.TenantId);

                if (existingSettings == null)
                {
                    // Create new settings
                    settings.CreatedDate = DateTime.UtcNow;
                    settings.UpdatedDate = DateTime.UtcNow;
                    _context.SystemSettings.Add(settings);
                }
                else
                {
                    // Update existing settings
                    existingSettings.DateFormat = settings.DateFormat;
                    existingSettings.TimeFormat = settings.TimeFormat;
                    existingSettings.Timezone = settings.Timezone;
                    existingSettings.Locale = settings.Locale;
                    existingSettings.DefaultCurrency = settings.DefaultCurrency;
                    existingSettings.CurrencySymbol = settings.CurrencySymbol;
                    existingSettings.DecimalPlaces = settings.DecimalPlaces;
                    existingSettings.DecimalSeparator = settings.DecimalSeparator;
                    existingSettings.ThousandsSeparator = settings.ThousandsSeparator;
                    existingSettings.MinPasswordLength = settings.MinPasswordLength;
                    existingSettings.RequireUppercase = settings.RequireUppercase;
                    existingSettings.RequireLowercase = settings.RequireLowercase;
                    existingSettings.RequireNumbers = settings.RequireNumbers;
                    existingSettings.RequireSpecialChars = settings.RequireSpecialChars;
                    existingSettings.PasswordExpirationDays = settings.PasswordExpirationDays;
                    existingSettings.PasswordHistoryCount = settings.PasswordHistoryCount;
                    existingSettings.SessionTimeoutMinutes = settings.SessionTimeoutMinutes;
                    existingSettings.MaxConcurrentSessions = settings.MaxConcurrentSessions;
                    existingSettings.FailedLoginAttempts = settings.FailedLoginAttempts;
                    existingSettings.AccountLockoutMinutes = settings.AccountLockoutMinutes;
                    existingSettings.SmtpServer = settings.SmtpServer;
                    existingSettings.SmtpPort = settings.SmtpPort;
                    existingSettings.SmtpUseSsl = settings.SmtpUseSsl;
                    existingSettings.SmtpUsername = settings.SmtpUsername;
                    existingSettings.SmtpPassword = settings.SmtpPassword;
                    existingSettings.SmtpFromEmail = settings.SmtpFromEmail;
                    existingSettings.SmtpFromName = settings.SmtpFromName;
                    existingSettings.DefaultPageSize = settings.DefaultPageSize;
                    existingSettings.EnableEmailNotifications = settings.EnableEmailNotifications;
                    existingSettings.EnableInAppNotifications = settings.EnableInAppNotifications;
                    existingSettings.UpdatedDate = DateTime.UtcNow;
                }

                await _context.SaveChangesAsync();

                return Ok(new { message = "System settings saved successfully" });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SaveSettings] Error: {ex.Message}");
                return StatusCode(500, new { message = "Error saving system settings", error = ex.Message });
            }
        }

        // GET: api/SystemSettings/GetCompanyInfo
        [HttpGet("GetCompanyInfo")]
        public async Task<IActionResult> GetCompanyInfo([FromQuery] int tenantId)
        {
            try
            {
                var entity = await _context.EntityMaster
                    .FirstOrDefaultAsync(e => e.Tenantid == tenantId);

                if (entity == null)
                {
                    return Ok(new
                    {
                        companyName = "",
                        email = "",
                        phoneNumber = "",
                        address = "",
                        city = "",
                        state = "",
                        zip = "",
                        country = "",
                        webAddress = ""
                    });
                }

                return Ok(new
                {
                    companyName = entity.company_name ?? "",
                    email = entity.email ?? "",
                    phoneNumber = entity.phone_number ?? "",
                    address = entity.address ?? "",
                    city = entity.city ?? "",
                    state = entity.state ?? "",
                    zip = entity.zip ?? "",
                    country = entity.country ?? "",
                    webAddress = entity.WebAddress ?? ""
                });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[GetCompanyInfo] Error: {ex.Message}");
                return StatusCode(500, new { message = "Error retrieving company information", error = ex.Message });
            }
        }

        // POST: api/SystemSettings/SaveCompanyInfo
        [HttpPost("SaveCompanyInfo")]
        public async Task<IActionResult> SaveCompanyInfo([FromBody] CompanyInfoDto dto)
        {
            try
            {
                if (dto == null)
                {
                    return BadRequest(new { message = "Company information is required" });
                }

                if (dto.TenantId == 0)
                {
                    return BadRequest(new { message = "TenantId is required" });
                }

                var entity = await _context.EntityMaster
                    .FirstOrDefaultAsync(e => e.Tenantid == dto.TenantId);

                if (entity == null)
                {
                    // Create new entity
                    entity = new EntityMaster
                    {
                        Tenantid = dto.TenantId,
                        company_name = dto.CompanyName ?? "",
                        email = dto.Email ?? "",
                        phone_number = dto.PhoneNumber ?? "",
                        address = dto.Address ?? "",
                        city = dto.City ?? "",
                        state = dto.State ?? "",
                        zip = dto.Zip ?? "",
                        country = dto.Country ?? "",
                        WebAddress = dto.WebAddress ?? "",
                        registration_date = DateTime.UtcNow,
                        // Set default values for required fields
                        first_name = "",
                        last_name = "",
                        pointofcontact = "",
                        ContactEmail = dto.Email ?? "",
                        apartment = "",
                        entitycode = "",
                        SaleTax = 0,
                        QuotationPrefix = "QT",
                        CustomerPrefix = "C",
                        VendorPrefix = "V",
                        ShippingPrefix = "SH",
                        InvoicePrefix = "INV",
                        timezoneui = "America/New_York",
                        timezone = "America/New_York",
                        coacount = 0
                    };
                    _context.EntityMaster.Add(entity);
                }
                else
                {
                    // Update existing entity
                    entity.company_name = dto.CompanyName ?? entity.company_name ?? "";
                    entity.email = dto.Email ?? entity.email ?? "";
                    entity.phone_number = dto.PhoneNumber ?? entity.phone_number ?? "";
                    entity.address = dto.Address ?? entity.address ?? "";
                    entity.city = dto.City ?? entity.city ?? "";
                    entity.state = dto.State ?? entity.state ?? "";
                    entity.zip = dto.Zip ?? entity.zip ?? "";
                    entity.country = dto.Country ?? entity.country ?? "";
                    entity.WebAddress = dto.WebAddress ?? entity.WebAddress ?? "";
                }

                await _context.SaveChangesAsync();

                return Ok(new { message = "Company information saved successfully" });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SaveCompanyInfo] Error: {ex.Message}");
                Console.WriteLine($"[SaveCompanyInfo] StackTrace: {ex.StackTrace}");
                if (ex.InnerException != null)
                {
                    Console.WriteLine($"[SaveCompanyInfo] InnerException: {ex.InnerException.Message}");
                }
                return StatusCode(500, new { message = "Error saving company information", error = ex.Message, details = ex.StackTrace });
            }
        }
    }

    // DTOs
    public class CompanyInfoDto
    {
        public int TenantId { get; set; }
        public string CompanyName { get; set; } = "";
        public string Email { get; set; } = "";
        public string PhoneNumber { get; set; } = "";
        public string Address { get; set; } = "";
        public string City { get; set; } = "";
        public string State { get; set; } = "";
        public string Zip { get; set; } = "";
        public string Country { get; set; } = "";
        public string WebAddress { get; set; } = "";
    }
}

