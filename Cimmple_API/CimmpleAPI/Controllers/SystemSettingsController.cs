using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using CimmpleAPI.Data;
using CimmpleAPI.Data.Models;
using CimmpleAPI.Services;
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
        private readonly IConfiguration _configuration;

        public SystemSettingsController(CimmpleDbContext context, IConfiguration configuration)
        {
            _context = context;
            _configuration = configuration;
        }

        private static SystemSettings CreateDefaultSettings(int tenantId) => new SystemSettings
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
            EmailDeliveryMode = SmtpSettingsResolver.ModeHosted,
            SmtpPort = 587,
            SmtpUseSsl = true,
            DefaultPageSize = 10,
            EnableEmailNotifications = true,
            EnableInAppNotifications = true
        };

        private static SystemSettings RedactSmtpPassword(SystemSettings settings)
        {
            settings.EmailDeliveryMode = SmtpSettingsResolver.NormalizeMode(settings.EmailDeliveryMode);
            settings.HasSmtpPassword = !string.IsNullOrEmpty(settings.SmtpPassword);
            settings.SmtpPassword = "";

            // Hosted mode: never expose leftover tenant SMTP fields in the UI
            // (avoids prefilling Custom mode with old Cimmple/server values).
            if (!SmtpSettingsResolver.IsCustomMode(settings.EmailDeliveryMode))
            {
                settings.HasSmtpPassword = false;
                settings.SmtpServer = "";
                settings.SmtpUsername = "";
                settings.SmtpFromEmail = "";
                settings.SmtpPort = 587;
                settings.SmtpUseSsl = true;
            }

            return settings;
        }

        /// <summary>When using Cimmple hosted mail, clear tenant-stored SMTP secrets/host fields.</summary>
        private static void ClearTenantCustomSmtpFields(SystemSettings target)
        {
            target.SmtpServer = "";
            target.SmtpUsername = "";
            target.SmtpPassword = "";
            target.SmtpFromEmail = "";
            target.SmtpPort = 587;
            target.SmtpUseSsl = true;
        }

        // GET: api/SystemSettings/GetSettings
        [HttpGet("GetSettings")]
        public async Task<IActionResult> GetSettings([FromQuery] int tenantId)
        {
            try
            {
                await SystemSettingsSchemaService.EnsureTablesAsync(_context);
                return Ok(await LoadSettingsForTenantAsync(tenantId));
            }
            catch (Exception ex) when (SystemSettingsSchemaService.IsMissingTableException(ex))
            {
                try
                {
                    await SystemSettingsSchemaService.EnsureTablesAsync(_context);
                    return Ok(await LoadSettingsForTenantAsync(tenantId));
                }
                catch (Exception retryEx)
                {
                    Console.WriteLine($"[GetSettings] Schema retry failed: {retryEx.Message}");
                    return Ok(CreateDefaultSettings(tenantId));
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[GetSettings] Error: {ex.Message}");
                return StatusCode(500, new { message = "Error retrieving system settings", error = ex.Message });
            }
        }

        private async Task<SystemSettings> LoadSettingsForTenantAsync(int tenantId)
        {
            var settings = await _context.SystemSettings
                .AsNoTracking()
                .FirstOrDefaultAsync(s => s.TenantId == tenantId);

            if (settings == null)
                return CreateDefaultSettings(tenantId);

            if (string.IsNullOrWhiteSpace(settings.EmailDeliveryMode))
                settings.EmailDeliveryMode = SmtpSettingsResolver.ModeHosted;
            else
                settings.EmailDeliveryMode = SmtpSettingsResolver.NormalizeMode(settings.EmailDeliveryMode);

            return RedactSmtpPassword(settings);
        }

        // POST: api/SystemSettings/SaveSettings
        [HttpPost("SaveSettings")]
        public async Task<IActionResult> SaveSettings([FromBody] SystemSettings settings)
        {
            try
            {
                if (settings == null)
                    return BadRequest(new { message = "Settings data is required" });

                await SystemSettingsSchemaService.EnsureTablesAsync(_context);

                var existingSettings = await _context.SystemSettings
                    .FirstOrDefaultAsync(s => s.TenantId == settings.TenantId);

                if (existingSettings == null)
                {
                    settings.EmailDeliveryMode = SmtpSettingsResolver.NormalizeMode(settings.EmailDeliveryMode);
                    if (!SmtpSettingsResolver.IsCustomMode(settings.EmailDeliveryMode))
                        ClearTenantCustomSmtpFields(settings);
                    settings.CreatedDate = DateTime.UtcNow;
                    settings.UpdatedDate = DateTime.UtcNow;
                    _context.SystemSettings.Add(settings);
                }
                else
                {
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
                    existingSettings.EmailDeliveryMode = SmtpSettingsResolver.NormalizeMode(settings.EmailDeliveryMode);
                    existingSettings.SmtpFromName = settings.SmtpFromName;
                    if (SmtpSettingsResolver.IsCustomMode(existingSettings.EmailDeliveryMode))
                    {
                        existingSettings.SmtpServer = settings.SmtpServer;
                        existingSettings.SmtpPort = settings.SmtpPort;
                        existingSettings.SmtpUseSsl = settings.SmtpUseSsl;
                        existingSettings.SmtpUsername = settings.SmtpUsername;
                        if (!string.IsNullOrEmpty(settings.SmtpPassword))
                            existingSettings.SmtpPassword = settings.SmtpPassword;
                        existingSettings.SmtpFromEmail = settings.SmtpFromEmail;
                    }
                    else
                    {
                        ClearTenantCustomSmtpFields(existingSettings);
                    }
                    existingSettings.DefaultPageSize = settings.DefaultPageSize;
                    existingSettings.EnableEmailNotifications = settings.EnableEmailNotifications;
                    existingSettings.EnableInAppNotifications = settings.EnableInAppNotifications;
                    existingSettings.UpdatedDate = DateTime.UtcNow;
                }

                await _context.SaveChangesAsync();
                return Ok(new { message = "System settings saved successfully" });
            }
            catch (Exception ex) when (SystemSettingsSchemaService.IsMissingTableException(ex))
            {
                // Column may have been missing on first attempt; ensure again and retry once.
                try
                {
                    await SystemSettingsSchemaService.EnsureTablesAsync(_context);
                    _context.ChangeTracker.Clear();

                    var existingSettings = await _context.SystemSettings
                        .FirstOrDefaultAsync(s => s.TenantId == settings!.TenantId);

                    if (existingSettings == null)
                    {
                        settings!.EmailDeliveryMode = SmtpSettingsResolver.NormalizeMode(settings.EmailDeliveryMode);
                        if (!SmtpSettingsResolver.IsCustomMode(settings.EmailDeliveryMode))
                            ClearTenantCustomSmtpFields(settings);
                        settings.CreatedDate = DateTime.UtcNow;
                        settings.UpdatedDate = DateTime.UtcNow;
                        _context.SystemSettings.Add(settings);
                    }
                    else
                    {
                        existingSettings.DateFormat = settings!.DateFormat;
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
                        existingSettings.EmailDeliveryMode = SmtpSettingsResolver.NormalizeMode(settings.EmailDeliveryMode);
                        existingSettings.SmtpFromName = settings.SmtpFromName;
                        if (SmtpSettingsResolver.IsCustomMode(existingSettings.EmailDeliveryMode))
                        {
                            existingSettings.SmtpServer = settings.SmtpServer;
                            existingSettings.SmtpPort = settings.SmtpPort;
                            existingSettings.SmtpUseSsl = settings.SmtpUseSsl;
                            existingSettings.SmtpUsername = settings.SmtpUsername;
                            if (!string.IsNullOrEmpty(settings.SmtpPassword))
                                existingSettings.SmtpPassword = settings.SmtpPassword;
                            existingSettings.SmtpFromEmail = settings.SmtpFromEmail;
                        }
                        else
                        {
                            ClearTenantCustomSmtpFields(existingSettings);
                        }
                        existingSettings.DefaultPageSize = settings.DefaultPageSize;
                        existingSettings.EnableEmailNotifications = settings.EnableEmailNotifications;
                        existingSettings.EnableInAppNotifications = settings.EnableInAppNotifications;
                        existingSettings.UpdatedDate = DateTime.UtcNow;
                    }

                    await _context.SaveChangesAsync();
                    return Ok(new { message = "System settings saved successfully" });
                }
                catch (Exception retryEx)
                {
                    return StatusCode(503, new
                    {
                        message = "System settings table is not available. Contact your administrator.",
                        error = retryEx.Message
                    });
                }
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

        /// <summary>
        /// Sends a test message. Hosted mode uses PlatformSmtp; Custom mode uses form/saved tenant SMTP.
        /// Bypasses the email-notifications gate so admins can verify SMTP while notifications are off.
        /// </summary>
        [HttpPost("TestSmtp")]
        public async Task<IActionResult> TestSmtp([FromBody] TestSmtpRequest? request)
        {
            try
            {
                await SystemSettingsSchemaService.EnsureTablesAsync(_context);

                var tenantId = request?.TenantId > 0 ? request.TenantId : GetTenantId();
                var saved = await _context.SystemSettings
                    .FirstOrDefaultAsync(s => s.TenantId == tenantId);

                var mode = SmtpSettingsResolver.NormalizeMode(
                    !string.IsNullOrWhiteSpace(request?.EmailDeliveryMode)
                        ? request!.EmailDeliveryMode
                        : saved?.EmailDeliveryMode);

                SystemSettings settings;
                if (mode == SmtpSettingsResolver.ModeHosted)
                {
                    var (resolved, resolveError) = SmtpSettingsResolver.Resolve(
                        new SystemSettings
                        {
                            TenantId = tenantId,
                            EmailDeliveryMode = SmtpSettingsResolver.ModeHosted,
                            SmtpFromName = request?.SmtpFromName ?? saved?.SmtpFromName ?? "",
                            EnableEmailNotifications = true
                        },
                        _configuration);
                    if (resolved == null)
                        return BadRequest(new { message = resolveError ?? "Platform SMTP is not configured." });
                    settings = resolved;
                }
                else
                {
                    settings = BuildSmtpSettingsForTest(tenantId, saved, request);
                    settings.EmailDeliveryMode = SmtpSettingsResolver.ModeCustom;
                }

                var toEmail = !string.IsNullOrWhiteSpace(request?.ToEmail)
                    ? request!.ToEmail!.Trim()
                    : settings.SmtpFromEmail?.Trim() ?? "";

                if (string.IsNullOrWhiteSpace(toEmail))
                    return BadRequest(new { message = "Enter a test recipient email, or set From Email first." });

                var mail = new MailRequest
                {
                    To = toEmail,
                    Subject = "Cimmple SMTP test",
                    Body =
                        "<p>This is a test message from Cimmple System Settings.</p>" +
                        $"<p>Mode: {mode}<br/>Tenant id: {tenantId}<br/>Sent at (UTC): {DateTime.UtcNow:yyyy-MM-dd HH:mm:ss}</p>",
                    IsHtml = true
                };

                var (ok, error) = EmailService.TrySend(settings, mail, skipNotificationGate: true);
                if (!ok)
                {
                    Console.WriteLine($"[TestSmtp] Send failed: {error}");
                    return BadRequest(new { message = error ?? "Failed to send test email." });
                }

                return Ok(new { message = $"Test email sent to {toEmail} ({mode})." });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[TestSmtp] Error: {ex.Message}");
                return StatusCode(500, new { message = "Error sending test email", error = ex.Message });
            }
        }

        private static SystemSettings BuildSmtpSettingsForTest(
            int tenantId,
            SystemSettings? saved,
            TestSmtpRequest? request)
        {
            var settings = saved != null
                ? new SystemSettings
                {
                    TenantId = tenantId,
                    SmtpServer = saved.SmtpServer,
                    SmtpPort = saved.SmtpPort,
                    SmtpUseSsl = saved.SmtpUseSsl,
                    SmtpUsername = saved.SmtpUsername,
                    SmtpPassword = saved.SmtpPassword,
                    SmtpFromEmail = saved.SmtpFromEmail,
                    SmtpFromName = saved.SmtpFromName,
                    EnableEmailNotifications = true
                }
                : new SystemSettings
                {
                    TenantId = tenantId,
                    SmtpPort = 587,
                    SmtpUseSsl = true,
                    EnableEmailNotifications = true
                };

            if (request == null)
                return settings;

            if (!string.IsNullOrWhiteSpace(request.SmtpServer))
                settings.SmtpServer = request.SmtpServer.Trim();
            if (request.SmtpPort.HasValue && request.SmtpPort.Value > 0)
                settings.SmtpPort = request.SmtpPort.Value;
            if (request.SmtpUseSsl.HasValue)
                settings.SmtpUseSsl = request.SmtpUseSsl.Value;
            if (request.SmtpUsername != null)
                settings.SmtpUsername = request.SmtpUsername;
            // Empty password in the form means "keep saved password"
            if (!string.IsNullOrEmpty(request.SmtpPassword))
                settings.SmtpPassword = request.SmtpPassword;
            if (!string.IsNullOrWhiteSpace(request.SmtpFromEmail))
                settings.SmtpFromEmail = request.SmtpFromEmail.Trim();
            if (request.SmtpFromName != null)
                settings.SmtpFromName = request.SmtpFromName;

            return settings;
        }

        // POST: api/SystemSettings/SaveCompanyInfo
        [HttpPost("SaveCompanyInfo")]
        public async Task<IActionResult> SaveCompanyInfo([FromBody] CompanyInfoDto dto)
        {
            try
            {
                if (dto == null)
                    return BadRequest(new { message = "Company information is required" });

                if (dto.TenantId == 0)
                    return BadRequest(new { message = "TenantId is required" });

                var entity = await _context.EntityMaster
                    .FirstOrDefaultAsync(e => e.Tenantid == dto.TenantId);

                if (entity == null)
                {
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
                return StatusCode(500, new { message = "Error saving company information", error = ex.Message });
            }
        }
    }

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

    public class TestSmtpRequest
    {
        public int TenantId { get; set; }

        /// <summary>Optional override; defaults to From Email.</summary>
        public string? ToEmail { get; set; }

        /// <summary>Hosted or Custom; defaults to saved tenant mode.</summary>
        public string? EmailDeliveryMode { get; set; }

        public string? SmtpServer { get; set; }
        public int? SmtpPort { get; set; }
        public bool? SmtpUseSsl { get; set; }
        public string? SmtpUsername { get; set; }
        public string? SmtpPassword { get; set; }
        public string? SmtpFromEmail { get; set; }
        public string? SmtpFromName { get; set; }
    }
}
