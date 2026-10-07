using System.Net.Mail;
using System.Security.Cryptography;
using System.Text.RegularExpressions;
using CimmpleAPI.Data;
using CimmpleAPI.Data.Models;
using CimmpleAPI.Services.Auth;
using Microsoft.EntityFrameworkCore;

namespace CimmpleAPI.Services.Tenancy
{
    /// <summary>
    /// Creates client tenants and keeps their default data up to date. A new tenant stays in
    /// <see cref="TenantStatus.Provisioning"/> (login blocked) until every seeder has run; if a
    /// seeder fails, <see cref="ResumeAsync"/> finishes the job.
    /// </summary>
    public class TenantProvisioningService
    {
        private static readonly Regex CodePattern = new("^[A-Z0-9][A-Z0-9-]{0,49}$", RegexOptions.Compiled);

        private readonly CimmpleDbContext _db;
        private readonly EmailOutboxService _outbox;
        private readonly IConfiguration _configuration;
        private readonly ISessionValidationService _sessions;
        private readonly ILogger<TenantProvisioningService> _logger;

        public TenantProvisioningService(
            CimmpleDbContext db,
            EmailOutboxService outbox,
            IConfiguration configuration,
            ISessionValidationService sessions,
            ILogger<TenantProvisioningService> logger)
        {
            _db = db;
            _outbox = outbox;
            _configuration = configuration;
            _sessions = sessions;
            _logger = logger;
        }

        public async Task<List<TenantSummaryDto>> ListAsync()
        {
            await TenantSchemaService.EnsureAsync(_db);

            var tenants = await _db.Tenants.AsNoTracking().OrderBy(t => t.Name).ToListAsync();
            var userCounts = await _db.UserDetails.AsNoTracking()
                .Where(u => u.VendorId == null || u.VendorId == 0)
                .GroupBy(u => u.TenantID)
                .Select(g => new { TenantId = g.Key, Count = g.Count() })
                .ToDictionaryAsync(x => x.TenantId, x => x.Count);

            return tenants.Select(t => ToSummary(t, userCounts.TryGetValue(t.TenantId, out var c) ? c : 0)).ToList();
        }

        public async Task<TenantSummaryDto?> GetAsync(int tenantId)
        {
            var tenant = await _db.Tenants.AsNoTracking().FirstOrDefaultAsync(t => t.TenantId == tenantId);
            if (tenant == null) return null;
            var users = await _db.UserDetails.CountAsync(u => u.TenantID == tenantId && (u.VendorId == null || u.VendorId == 0));
            return ToSummary(tenant, users);
        }

        public async Task<ProvisionTenantResult> ProvisionAsync(ProvisionTenantRequest request, string createdBy)
        {
            var validationError = Validate(request);
            if (validationError != null)
                return ProvisionTenantResult.Fail(validationError);

            var companyName = request.CompanyName.Trim();
            var code = string.IsNullOrWhiteSpace(request.Code) ? null : request.Code.Trim().ToUpperInvariant();
            var adminEmail = request.AdminEmail.Trim();
            var adminUserName = string.IsNullOrWhiteSpace(request.AdminUserName) ? adminEmail : request.AdminUserName.Trim();

            await TenantSchemaService.EnsureAsync(_db);
            await SystemSettingsSchemaService.EnsureTablesAsync(_db);
            await AccountingGapSchemaService.EnsureAsync(_db);

            Tenant tenant;
            UserDetail admin;
            string temporaryPassword;
            TenantSeedContext seedContext;

            await using (var tx = await _db.Database.BeginTransactionAsync())
            {
                await _db.Database.ExecuteSqlRawAsync(@"DECLARE @r int;
EXEC @r = sp_getapplock @Resource = 'cimmple-tenant-provisioning', @LockMode = 'Exclusive', @LockOwner = 'Transaction', @LockTimeout = 30000;
IF @r < 0 THROW 51000, 'Another client is being created. Please try again.', 1;");

                if (code != null && await _db.Tenants.AnyAsync(t => t.Code == code))
                    return ProvisionTenantResult.Fail($"Client code '{code}' is already in use.");

                // Login looks users up by username first, so it must be unique across every tenant.
                if (await _db.UserDetails.AnyAsync(u => u.UserName == adminUserName))
                    return ProvisionTenantResult.Fail($"Username '{adminUserName}' is already taken. Choose a different administrator username.");

                var now = DateTime.UtcNow;
                tenant = new Tenant
                {
                    Name = companyName,
                    Code = code,
                    Status = TenantStatus.Provisioning,
                    Plan = TrimOrNull(request.Plan),
                    ContactName = $"{request.AdminFirstName?.Trim()} {request.AdminLastName?.Trim()}".Trim(),
                    ContactEmail = adminEmail,
                    Notes = TrimOrNull(request.Notes),
                    CreatedBy = createdBy,
                    CreatedUtc = now,
                    StatusChangedUtc = now
                };
                _db.Tenants.Add(tenant);
                await _db.SaveChangesAsync();

                seedContext = new TenantSeedContext
                {
                    TenantId = tenant.TenantId,
                    CompanyName = companyName,
                    ContactEmail = adminEmail,
                    Phone = TrimOrNull(request.Phone),
                    Country = TrimOrNull(request.Country),
                    TimeZone = TrimOrNull(request.TimeZone),
                    Currency = TrimOrNull(request.Currency),
                    CurrencySymbol = TrimOrNull(request.CurrencySymbol)
                };

                foreach (var seeder in TenantSeeders.Core)
                {
                    await seeder.ApplyAsync(_db, seedContext);
                }

                var adminRole = await FindAdminRoleAsync(tenant.TenantId)
                    ?? throw new InvalidOperationException("Admin role was not created.");
                var mainSiteId = await _db.Locations
                    .Where(l => l.TenantId == tenant.TenantId)
                    .OrderBy(l => l.LocationId)
                    .Select(l => (int?)l.LocationId)
                    .FirstOrDefaultAsync();

                temporaryPassword = GenerateTemporaryPassword();
                var (hash, salt) = PasswordHasher.HashPassword(temporaryPassword);
                // UserDetails has many legacy NOT NULL text columns without defaults.
                admin = new UserDetail
                {
                    FirstName = request.AdminFirstName!.Trim(),
                    LastName = request.AdminLastName!.Trim(),
                    Email = adminEmail,
                    TenantID = tenant.TenantId,
                    UserName = adminUserName,
                    Password = hash,
                    PasswordSalt = salt,
                    Status = "Active",
                    Role = adminRole.RoleID,
                    CreateDate = now,
                    PwdResetDate = now,
                    ChangePassword = "Y",
                    PwdChangeStatus = "No",
                    ChangedBy = createdBy,
                    EmployeeType = "Regular",
                    Phone1 = TrimOrNull(request.Phone) ?? "",
                    Phone2 = "",
                    Date_of_hire = "",
                    DOB = "",
                    SSN = "",
                    SearchSSN = "",
                    EmpCode = "",
                    UserToken = "",
                    HID = "",
                    PrimaryContact = "",
                    Date_of_termination = "",
                    Termination_Reason = "",
                    ValidateStatus = "",
                    BlockedPhone = "",
                    PwdType = "",
                    PhoneUpdateStatus = "",
                    PrimaryMethod = "",
                    ContractId = "",
                    Address = "",
                    Street = "",
                    City = "",
                    State = "",
                    Zip = "",
                    Country = TrimOrNull(request.Country),
                    CanAccessAllLocations = true,
                    DefaultLocationId = mainSiteId,
                    FailedLoginCount = 0
                };
                _db.UserDetails.Add(admin);
                await _db.SaveChangesAsync();

                await tx.CommitAsync();
            }

            seedContext.CreatedByUserId = admin.User_UniqueID;
            _logger.LogInformation("Tenant {TenantId} ({Name}) created by {CreatedBy}", tenant.TenantId, tenant.Name, createdBy);

            var (steps, seedError) = await RunDefaultsAsync(tenant, seedContext, activate: true);

            var result = new ProvisionTenantResult
            {
                Success = seedError == null,
                Error = seedError == null ? null : $"The client was created but setup did not finish: {seedError}. Use Resume setup to try again.",
                Tenant = await GetAsync(tenant.TenantId),
                AdminUserName = adminUserName,
                TemporaryPassword = temporaryPassword,
                Steps = steps
            };

            if (seedError == null && request.SendInviteEmail)
            {
                (result.InviteQueued, result.InviteError) = await IdentityEmailService.TryQueueTenantAdminInviteAsync(
                    _outbox, tenant.TenantId, _configuration, adminEmail,
                    tenant.ContactName ?? "", companyName, adminUserName, temporaryPassword);
            }

            return result;
        }

        /// <summary>Finishes a tenant left in Provisioning by a failed seeder.</summary>
        public async Task<ProvisionTenantResult> ResumeAsync(int tenantId)
        {
            var tenant = await _db.Tenants.FirstOrDefaultAsync(t => t.TenantId == tenantId);
            if (tenant == null) return ProvisionTenantResult.Fail("Client not found.");
            if (tenant.Status != TenantStatus.Provisioning)
                return ProvisionTenantResult.Fail("Only clients that are still being set up can be resumed.");

            var seedContext = await BuildSeedContextAsync(tenant);
            foreach (var seeder in TenantSeeders.Core)
            {
                await seeder.ApplyAsync(_db, seedContext);
            }

            var (steps, error) = await RunDefaultsAsync(tenant, seedContext, activate: true);
            return new ProvisionTenantResult
            {
                Success = error == null,
                Error = error,
                Tenant = await GetAsync(tenantId),
                Steps = steps
            };
        }

        /// <summary>Re-runs every seeder on an existing tenant. Only adds what is missing.</summary>
        public async Task<ProvisionTenantResult> ApplyDefaultsAsync(int tenantId)
        {
            var tenant = await _db.Tenants.FirstOrDefaultAsync(t => t.TenantId == tenantId);
            if (tenant == null) return ProvisionTenantResult.Fail("Client not found.");

            var seedContext = await BuildSeedContextAsync(tenant);
            var steps = new List<SeedStepResult>();
            foreach (var seeder in TenantSeeders.Core)
            {
                steps.Add(new SeedStepResult(seeder.Name, await seeder.ApplyAsync(_db, seedContext)));
            }

            var (defaultSteps, error) = await RunDefaultsAsync(tenant, seedContext, activate: false);
            steps.AddRange(defaultSteps);
            return new ProvisionTenantResult
            {
                Success = error == null,
                Error = error,
                Tenant = await GetAsync(tenantId),
                Steps = steps
            };
        }

        public async Task<(bool Ok, string? Error)> SetStatusAsync(int tenantId, string? status)
        {
            var normalized = TenantStatus.Normalize(status);
            if (normalized == null || normalized == TenantStatus.Provisioning)
                return (false, "Status must be Active, Suspended or Cancelled.");

            var tenant = await _db.Tenants.FirstOrDefaultAsync(t => t.TenantId == tenantId);
            if (tenant == null) return (false, "Client not found.");
            if (tenant.Status == TenantStatus.Provisioning && normalized == TenantStatus.Active)
                return (false, "Finish setup with Resume setup before activating this client.");

            tenant.Status = normalized;
            tenant.StatusChangedUtc = DateTime.UtcNow;

            if (normalized != TenantStatus.Active)
            {
                var sessions = await _db.UserInfo
                    .Where(s => s.TenantId == tenantId && s.LogInStatus == 1)
                    .ToListAsync();
                foreach (var session in sessions)
                {
                    session.LogInStatus = 0;
                    session.RefreshTokenHash = null;
                }

                await _db.SaveChangesAsync();
                foreach (var session in sessions)
                {
                    _sessions.Invalidate(session.UserID);
                }

                _logger.LogInformation("Tenant {TenantId} set to {Status}; {Count} session(s) ended", tenantId, normalized, sessions.Count);
                return (true, null);
            }

            await _db.SaveChangesAsync();
            _logger.LogInformation("Tenant {TenantId} set to {Status}", tenantId, normalized);
            return (true, null);
        }

        /// <summary>Issues a new temporary password for the tenant's administrator and emails it.</summary>
        public async Task<ResendInviteResult> ResendAdminInviteAsync(int tenantId)
        {
            var tenant = await _db.Tenants.AsNoTracking().FirstOrDefaultAsync(t => t.TenantId == tenantId);
            if (tenant == null) return new ResendInviteResult { Error = "Client not found." };

            var admin = await FindAdminUserAsync(tenant);
            if (admin == null) return new ResendInviteResult { Error = "This client has no administrator account." };

            var temporaryPassword = GenerateTemporaryPassword();
            var (hash, salt) = PasswordHasher.HashPassword(temporaryPassword);
            admin.Password = hash;
            admin.PasswordSalt = salt;
            admin.PwdResetDate = DateTime.UtcNow;
            admin.ChangePassword = "Y";
            admin.FailedLoginCount = 0;
            admin.LockoutEndUtc = null;
            await _db.SaveChangesAsync();

            var displayName = $"{admin.FirstName} {admin.LastName}".Trim();
            var (queued, error) = await IdentityEmailService.TryQueueTenantAdminInviteAsync(
                _outbox, tenantId, _configuration, admin.Email ?? "",
                displayName, tenant.Name, admin.UserName ?? "", temporaryPassword);

            return new ResendInviteResult
            {
                Success = true,
                AdminUserName = admin.UserName,
                AdminEmail = admin.Email,
                TemporaryPassword = temporaryPassword,
                InviteQueued = queued,
                InviteError = error
            };
        }

        private async Task<(List<SeedStepResult> Steps, string? Error)> RunDefaultsAsync(
            Tenant tenant, TenantSeedContext seedContext, bool activate)
        {
            var steps = new List<SeedStepResult>();
            string? error = null;
            foreach (var seeder in TenantSeeders.Defaults)
            {
                try
                {
                    steps.Add(new SeedStepResult(seeder.Name, await seeder.ApplyAsync(_db, seedContext)));
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Seeder {Seeder} failed for tenant {TenantId}", seeder.Name, tenant.TenantId);
                    _db.ChangeTracker.Clear();
                    error = $"{seeder.Name}: {ex.GetBaseException().Message}";
                    break;
                }
            }

            var tracked = await _db.Tenants.FirstAsync(t => t.TenantId == tenant.TenantId);
            var now = DateTime.UtcNow;
            if (error == null)
            {
                tracked.SeedVersion = TenantSeeders.CurrentVersion;
                tracked.LastProvisioningError = null;
                if (activate && tracked.Status == TenantStatus.Provisioning)
                {
                    tracked.Status = TenantStatus.Active;
                    tracked.ProvisionedUtc = now;
                    tracked.StatusChangedUtc = now;
                }
            }
            else
            {
                tracked.LastProvisioningError = error.Length > 2000 ? error[..2000] : error;
            }

            await _db.SaveChangesAsync();
            return (steps, error);
        }

        private async Task<TenantSeedContext> BuildSeedContextAsync(Tenant tenant)
        {
            var company = await _db.EntityMaster.AsNoTracking()
                .Where(e => e.Tenantid == tenant.TenantId)
                .OrderBy(e => e.entityid)
                .FirstOrDefaultAsync();
            var settings = await _db.SystemSettings.AsNoTracking()
                .FirstOrDefaultAsync(s => s.TenantId == tenant.TenantId);
            var admin = await FindAdminUserAsync(tenant);
            var anyUserId = admin?.User_UniqueID ?? await _db.UserDetails
                .Where(u => u.TenantID == tenant.TenantId)
                .OrderBy(u => u.User_UniqueID)
                .Select(u => u.User_UniqueID)
                .FirstOrDefaultAsync();

            return new TenantSeedContext
            {
                TenantId = tenant.TenantId,
                CompanyName = company?.company_name ?? tenant.Name,
                ContactEmail = tenant.ContactEmail ?? company?.email,
                Phone = company?.phone_number,
                Country = company?.country,
                TimeZone = settings?.Timezone ?? company?.timezone,
                Currency = settings?.DefaultCurrency,
                CurrencySymbol = settings?.CurrencySymbol,
                CreatedByUserId = anyUserId
            };
        }

        private Task<UserRole?> FindAdminRoleAsync(int tenantId) =>
            _db.UserRole
                .Where(r => r.TenantId == tenantId && r.RoleName == TenantDefaults.AdminRoleName)
                .OrderBy(r => r.RoleID)
                .FirstOrDefaultAsync();

        private async Task<UserDetail?> FindAdminUserAsync(Tenant tenant)
        {
            var adminRoleIds = (await _db.UserRole.AsNoTracking()
                    .Where(r => r.TenantId == tenant.TenantId)
                    .ToListAsync())
                .Where(r => ErpPermissionSeedService.IsAdminRoleName(r.RoleName, r.RoleTag))
                .Select(r => r.RoleID)
                .ToList();

            var candidates = await _db.UserDetails
                .Where(u => u.TenantID == tenant.TenantId
                    && u.Role.HasValue && adminRoleIds.Contains(u.Role.Value)
                    && (u.VendorId == null || u.VendorId == 0))
                .OrderBy(u => u.User_UniqueID)
                .ToListAsync();

            return candidates.FirstOrDefault(u =>
                       !string.IsNullOrEmpty(tenant.ContactEmail)
                       && string.Equals(u.Email, tenant.ContactEmail, StringComparison.OrdinalIgnoreCase))
                   ?? candidates.FirstOrDefault();
        }

        private static string? Validate(ProvisionTenantRequest? request)
        {
            if (request == null) return "Request is required.";
            if (string.IsNullOrWhiteSpace(request.CompanyName)) return "Company name is required.";
            if (request.CompanyName.Trim().Length > 200) return "Company name must be 200 characters or fewer.";
            if (!string.IsNullOrWhiteSpace(request.Code) && !CodePattern.IsMatch(request.Code.Trim().ToUpperInvariant()))
                return "Client code may contain only letters, numbers and dashes (up to 50 characters).";
            if (string.IsNullOrWhiteSpace(request.AdminFirstName)) return "Administrator first name is required.";
            if (string.IsNullOrWhiteSpace(request.AdminLastName)) return "Administrator last name is required.";
            if (string.IsNullOrWhiteSpace(request.AdminEmail) || !IsValidEmail(request.AdminEmail.Trim()))
                return "A valid administrator email is required.";
            if (!string.IsNullOrWhiteSpace(request.AdminUserName) && request.AdminUserName.Trim().Length > 100)
                return "Administrator username must be 100 characters or fewer.";
            if (!string.IsNullOrWhiteSpace(request.TimeZone) && request.TimeZone.Trim().Length > 64)
                return "Time zone is not valid.";
            if (!string.IsNullOrWhiteSpace(request.Currency) && request.Currency.Trim().Length != 3)
                return "Currency must be a 3-letter code such as USD.";
            return null;
        }

        private static bool IsValidEmail(string email)
        {
            try
            {
                return new MailAddress(email).Address.Equals(email, StringComparison.OrdinalIgnoreCase);
            }
            catch (FormatException)
            {
                return false;
            }
        }

        /// <summary>Meets the strictest password policy a tenant can configure.</summary>
        private static string GenerateTemporaryPassword()
        {
            const string upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
            const string lower = "abcdefghijkmnpqrstuvwxyz";
            const string digits = "23456789";
            const string symbols = "!@#$%*?";
            const string all = upper + lower + digits + symbols;

            var chars = new List<char>
            {
                upper[RandomNumberGenerator.GetInt32(upper.Length)],
                lower[RandomNumberGenerator.GetInt32(lower.Length)],
                digits[RandomNumberGenerator.GetInt32(digits.Length)],
                symbols[RandomNumberGenerator.GetInt32(symbols.Length)]
            };
            while (chars.Count < 16)
            {
                chars.Add(all[RandomNumberGenerator.GetInt32(all.Length)]);
            }

            for (var i = chars.Count - 1; i > 0; i--)
            {
                var j = RandomNumberGenerator.GetInt32(i + 1);
                (chars[i], chars[j]) = (chars[j], chars[i]);
            }

            return new string(chars.ToArray());
        }

        private static string? TrimOrNull(string? value) =>
            string.IsNullOrWhiteSpace(value) ? null : value.Trim();

        private static TenantSummaryDto ToSummary(Tenant t, int userCount) => new()
        {
            TenantId = t.TenantId,
            Name = t.Name,
            Code = t.Code,
            Status = t.Status,
            Plan = t.Plan,
            ContactName = t.ContactName,
            ContactEmail = t.ContactEmail,
            Notes = t.Notes,
            SeedVersion = t.SeedVersion,
            CurrentSeedVersion = TenantSeeders.CurrentVersion,
            LastProvisioningError = t.LastProvisioningError,
            CreatedBy = t.CreatedBy,
            CreatedUtc = t.CreatedUtc,
            ProvisionedUtc = t.ProvisionedUtc,
            StatusChangedUtc = t.StatusChangedUtc,
            UserCount = userCount
        };
    }

    public class ProvisionTenantRequest
    {
        public string CompanyName { get; set; } = "";
        public string? Code { get; set; }
        public string? Plan { get; set; }
        public string? AdminFirstName { get; set; }
        public string? AdminLastName { get; set; }
        public string AdminEmail { get; set; } = "";

        /// <summary>Defaults to the administrator email.</summary>
        public string? AdminUserName { get; set; }

        public string? Phone { get; set; }
        public string? Country { get; set; }
        public string? TimeZone { get; set; }
        public string? Currency { get; set; }
        public string? CurrencySymbol { get; set; }
        public string? Notes { get; set; }
        public bool SendInviteEmail { get; set; } = true;
    }

    public class TenantSummaryDto
    {
        public int TenantId { get; set; }
        public string Name { get; set; } = "";
        public string? Code { get; set; }
        public string Status { get; set; } = "";
        public string? Plan { get; set; }
        public string? ContactName { get; set; }
        public string? ContactEmail { get; set; }
        public string? Notes { get; set; }
        public int SeedVersion { get; set; }
        public int CurrentSeedVersion { get; set; }
        public string? LastProvisioningError { get; set; }
        public string? CreatedBy { get; set; }
        public DateTime CreatedUtc { get; set; }
        public DateTime? ProvisionedUtc { get; set; }
        public DateTime? StatusChangedUtc { get; set; }
        public int UserCount { get; set; }
    }

    public record SeedStepResult(string Name, int Inserted);

    public class ProvisionTenantResult
    {
        public bool Success { get; set; }
        public string? Error { get; set; }
        public TenantSummaryDto? Tenant { get; set; }
        public string? AdminUserName { get; set; }

        /// <summary>Returned once so staff can pass it on if the invite email does not arrive.</summary>
        public string? TemporaryPassword { get; set; }

        public bool InviteQueued { get; set; }
        public string? InviteError { get; set; }
        public List<SeedStepResult> Steps { get; set; } = new();

        public static ProvisionTenantResult Fail(string error) => new() { Success = false, Error = error };
    }

    public class ResendInviteResult
    {
        public bool Success { get; set; }
        public string? Error { get; set; }
        public string? AdminUserName { get; set; }
        public string? AdminEmail { get; set; }
        public string? TemporaryPassword { get; set; }
        public bool InviteQueued { get; set; }
        public string? InviteError { get; set; }
    }
}
