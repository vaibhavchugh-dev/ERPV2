using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using CimmpleAPI.Data;
using CimmpleAPI.Data.Models;
using CimmpleAPI.Services;
using CimmpleAPI.Services.Auth;
using CimmpleAPI.Services.Tenancy;
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

        private static SystemSettings CreateDefaultSettings(int tenantId) => TenantDefaults.CreateSystemSettings(tenantId);

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

        private static void ApplyDefaultSecuritySettings(SystemSettings target)
        {
            var defaults = TenantDefaults.CreateSystemSettings(target.TenantId);
            ApplySecuritySettings(target, defaults);
        }

        private static void ApplySecuritySettings(SystemSettings target, SystemSettings source)
        {
            target.MinPasswordLength = source.MinPasswordLength;
            target.RequireUppercase = source.RequireUppercase;
            target.RequireLowercase = source.RequireLowercase;
            target.RequireNumbers = source.RequireNumbers;
            target.RequireSpecialChars = source.RequireSpecialChars;
            target.PasswordExpirationDays = source.PasswordExpirationDays;
            target.PasswordHistoryCount = source.PasswordHistoryCount;
            target.SessionTimeoutMinutes = source.SessionTimeoutMinutes;
            target.MaxConcurrentSessions = source.MaxConcurrentSessions;
            target.FailedLoginAttempts = source.FailedLoginAttempts;
            target.AccountLockoutMinutes = source.AccountLockoutMinutes;
        }

        private static void ApplyNonSecuritySettings(SystemSettings target, SystemSettings source)
        {
            target.DateFormat = source.DateFormat;
            target.TimeFormat = source.TimeFormat;
            target.Timezone = source.Timezone;
            target.Locale = source.Locale;
            target.DefaultCurrency = source.DefaultCurrency;
            target.CurrencySymbol = source.CurrencySymbol;
            target.DecimalPlaces = source.DecimalPlaces;
            target.DecimalSeparator = source.DecimalSeparator;
            target.ThousandsSeparator = source.ThousandsSeparator;
            target.EmailDeliveryMode = SmtpSettingsResolver.NormalizeMode(source.EmailDeliveryMode);
            target.SmtpFromName = source.SmtpFromName;
            if (SmtpSettingsResolver.IsCustomMode(target.EmailDeliveryMode))
            {
                target.SmtpServer = source.SmtpServer;
                target.SmtpPort = source.SmtpPort;
                target.SmtpUseSsl = source.SmtpUseSsl;
                target.SmtpUsername = source.SmtpUsername;
                if (!string.IsNullOrEmpty(source.SmtpPassword))
                    target.SmtpPassword = source.SmtpPassword;
                target.SmtpFromEmail = source.SmtpFromEmail;
            }
            else
            {
                ClearTenantCustomSmtpFields(target);
            }
            target.DefaultPageSize = source.DefaultPageSize;
            target.EnableEmailNotifications = source.EnableEmailNotifications;
            target.EnableInAppNotifications = source.EnableInAppNotifications;
        }

        // GET: api/SystemSettings/GetSettings
        [HttpGet("GetSettings")]
        [CimmpleAPI.Services.Auth.AllowTenantlessCaller]
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

        /// <summary>
        /// Display/notification preferences every signed-in tenant user needs (formatting, toasts, session timeout).
        /// Tenant always comes from the token; security and SMTP fields are never returned.
        /// </summary>
        [HttpGet("GetRuntimeSettings")]
        [CimmpleAPI.Services.Auth.SkipErpPermissionCheck]
        public async Task<IActionResult> GetRuntimeSettings()
        {
            var tenantId = GetTenantId();
            if (tenantId <= 0)
                return BadRequest(new { message = "Tenant is required" });

            SystemSettings settings;
            try
            {
                await SystemSettingsSchemaService.EnsureTablesAsync(_context);
                settings = await LoadSettingsForTenantAsync(tenantId);
            }
            catch (Exception ex) when (SystemSettingsSchemaService.IsMissingTableException(ex))
            {
                settings = CreateDefaultSettings(tenantId);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[GetRuntimeSettings] Error: {ex.Message}");
                return StatusCode(500, new { message = "Error retrieving system settings" });
            }

            return Ok(new
            {
                tenantId,
                settings.DateFormat,
                settings.TimeFormat,
                settings.Timezone,
                settings.Locale,
                settings.DefaultCurrency,
                settings.CurrencySymbol,
                settings.DecimalPlaces,
                settings.DecimalSeparator,
                settings.ThousandsSeparator,
                settings.SessionTimeoutMinutes,
                settings.DefaultPageSize,
                settings.EnableEmailNotifications,
                settings.EnableInAppNotifications
            });
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
            if (settings == null)
                return BadRequest(new { message = "Settings data is required" });

            try
            {
                await SystemSettingsSchemaService.EnsureTablesAsync(_context);

                var existingSettings = await _context.SystemSettings
                    .FirstOrDefaultAsync(s => s.TenantId == settings.TenantId);

                if (existingSettings == null)
                {
                    settings.EmailDeliveryMode = SmtpSettingsResolver.NormalizeMode(settings.EmailDeliveryMode);
                    if (!SmtpSettingsResolver.IsCustomMode(settings.EmailDeliveryMode))
                        ClearTenantCustomSmtpFields(settings);
                    // Security policy is edited in the Support Portal, not from this screen.
                    ApplyDefaultSecuritySettings(settings);
                    settings.CreatedDate = DateTime.UtcNow;
                    settings.UpdatedDate = DateTime.UtcNow;
                    _context.SystemSettings.Add(settings);
                }
                else
                {
                    ApplyNonSecuritySettings(existingSettings, settings);
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
                        ApplyDefaultSecuritySettings(settings);
                        settings.CreatedDate = DateTime.UtcNow;
                        settings.UpdatedDate = DateTime.UtcNow;
                        _context.SystemSettings.Add(settings);
                    }
                    else
                    {
                        ApplyNonSecuritySettings(existingSettings, settings!);
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

            // Empty password means "keep saved password" only when the test targets the saved SMTP host/settings.
            if (!string.IsNullOrEmpty(request.SmtpPassword))
            {
                settings.SmtpPassword = request.SmtpPassword;
            }
            else if (saved != null && SmtpTestTargetMatchesSaved(saved, request))
            {
                settings.SmtpPassword = saved.SmtpPassword;
            }
            else
            {
                settings.SmtpPassword = "";
            }
            if (!string.IsNullOrWhiteSpace(request.SmtpFromEmail))
                settings.SmtpFromEmail = request.SmtpFromEmail.Trim();
            if (request.SmtpFromName != null)
                settings.SmtpFromName = request.SmtpFromName;

            return settings;
        }

        private static bool SmtpTestTargetMatchesSaved(SystemSettings saved, TestSmtpRequest request)
        {
            if (!string.IsNullOrWhiteSpace(request.SmtpServer)
                && !string.Equals(request.SmtpServer.Trim(), saved.SmtpServer?.Trim(), StringComparison.OrdinalIgnoreCase))
            {
                return false;
            }

            if (request.SmtpPort.HasValue && request.SmtpPort.Value > 0 && request.SmtpPort != saved.SmtpPort)
            {
                return false;
            }

            if (request.SmtpUseSsl.HasValue && request.SmtpUseSsl != saved.SmtpUseSsl)
            {
                return false;
            }

            if (request.SmtpUsername != null
                && !string.Equals(request.SmtpUsername, saved.SmtpUsername ?? "", StringComparison.Ordinal))
            {
                return false;
            }

            return true;
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
                    entity = TenantDefaults.CreateCompanyProfile(
                        dto.TenantId,
                        dto.CompanyName,
                        dto.Email,
                        phone: dto.PhoneNumber,
                        country: dto.Country,
                        webAddress: dto.WebAddress,
                        address: dto.Address,
                        city: dto.City,
                        state: dto.State,
                        zip: dto.Zip);
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
