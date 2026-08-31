using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using CimmpleAPI.Data;
using CimmpleAPI.Data.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace CimmpleAPI.Services.Auth
{
    public interface IAuthService
    {
        Task<(LoginResponse? response, string? error, int statusCode)> LoginAsync(LoginRequest request, string? ipAddress, string? browser);
        Task<(LoginResponse? response, string? error, int statusCode)> VendorLoginAsync(VendorLoginRequest request, string? ipAddress, string? browser);
        Task<(LoginResponse? response, string? error, int statusCode)> RefreshAsync(string refreshToken);
        Task LogoutAsync(int userId);
        Task<AuthUserDto?> GetCurrentUserAsync(int userId);
        Task<(bool ok, string? error)> ChangePasswordAsync(int userId, ChangePasswordRequest request);
        Task<(bool ok, string? error)> ValidateAndApplyPasswordAsync(UserDetail user, string newPassword, SystemSettings settings);
        Task TrimPasswordHistoryAsync(int userId, int keepCount);
        bool ValidatePasswordAgainstPolicy(string password, SystemSettings settings, out string? error);
        Task EnsurePasswordHashedAsync(UserDetail user, string plaintextPassword);
    }

    public class AuthService : IAuthService
    {
        private readonly CimmpleDbContext _db;
        private readonly IJwtTokenService _jwt;
        private readonly TokenConfigOptions _tokenOptions;

        public AuthService(CimmpleDbContext db, IJwtTokenService jwt, IOptions<TokenConfigOptions> tokenOptions)
        {
            _db = db;
            _jwt = jwt;
            _tokenOptions = tokenOptions.Value;
        }

        public async Task<(LoginResponse? response, string? error, int statusCode)> LoginAsync(
            LoginRequest request, string? ipAddress, string? browser)
        {
            if (string.IsNullOrWhiteSpace(request.Username) || string.IsNullOrWhiteSpace(request.Password))
            {
                return (null, "Username and password are required", 400);
            }

            var query = _db.UserDetails.AsQueryable()
                .Where(u => u.UserName == request.Username);

            if (request.TenantId.HasValue && request.TenantId.Value > 0)
            {
                query = query.Where(u => u.TenantID == request.TenantId.Value);
            }

            var matches = await query.ToListAsync();
            if (matches.Count == 0)
            {
                await LogLoginAttemptAsync(request.Username, ipAddress, browser);
                return (null, "Invalid username or password", 401);
            }

            if (matches.Count > 1 && (!request.TenantId.HasValue || request.TenantId.Value <= 0))
            {
                return (null, "Multiple accounts found. Please specify tenant.", 400);
            }

            var user = matches[0];
            if (user.VendorId.HasValue && user.VendorId.Value > 0)
            {
                return (null, "This account is for the vendor portal. Please sign in at /vendor/login.", 403);
            }

            return await AuthenticateUserAsync(user, request.Password, "erp", ipAddress, browser);
        }

        public async Task<(LoginResponse? response, string? error, int statusCode)> VendorLoginAsync(
            VendorLoginRequest request, string? ipAddress, string? browser)
        {
            if (string.IsNullOrWhiteSpace(request.VendorCode) || string.IsNullOrWhiteSpace(request.Password))
            {
                return (null, "Vendor code and password are required", 400);
            }

            var vendorQuery = _db.VendorMaster.AsQueryable()
                .Where(v => v.vendorcode == request.VendorCode);

            if (request.TenantId.HasValue && request.TenantId.Value > 0)
            {
                vendorQuery = vendorQuery.Where(v => v.Tenantid == request.TenantId.Value);
            }

            var vendors = await vendorQuery.ToListAsync();
            if (vendors.Count == 0)
            {
                return (null, "Invalid vendor code or password", 401);
            }

            if (vendors.Count > 1 && (!request.TenantId.HasValue || request.TenantId.Value <= 0))
            {
                return (null, "Multiple vendors found. Please specify tenant.", 400);
            }

            var vendor = vendors[0];
            if (!string.Equals(vendor.status, "Active", StringComparison.OrdinalIgnoreCase)
                && !string.IsNullOrEmpty(vendor.status)
                && !string.Equals(vendor.status, "A", StringComparison.OrdinalIgnoreCase))
            {
                return (null, "Vendor account is inactive", 403);
            }

            // Portal login uses a UserDetail linked via VendorId (password lives on the user account)
            var portalUsers = await _db.UserDetails
                .Where(u => u.VendorId == vendor.vendor_id && u.TenantID == vendor.Tenantid)
                .ToListAsync();

            if (portalUsers.Count == 0)
            {
                return (null, "No portal user is configured for this vendor. Contact your administrator.", 403);
            }

            UserDetail? authenticated = null;
            foreach (var candidate in portalUsers)
            {
                if (PasswordHasher.Verify(request.Password, candidate.Password, candidate.PasswordSalt, out _))
                {
                    authenticated = candidate;
                    break;
                }
            }

            if (authenticated == null)
            {
                // Increment lockout on first portal user for this vendor
                var primary = portalUsers[0];
                await RecordFailedLoginAsync(primary);
                return (null, "Invalid vendor code or password", 401);
            }

            var result = await AuthenticateUserAsync(authenticated, request.Password, "vendor", ipAddress, browser);
            if (result.response != null)
            {
                result.response.User.VendorId = vendor.vendor_id;
                result.response.User.VendorCode = vendor.vendorcode;
                vendor.last_login_date = DateTime.UtcNow;
                await _db.SaveChangesAsync();
            }

            return result;
        }

        public async Task<(LoginResponse? response, string? error, int statusCode)> RefreshAsync(string refreshToken)
        {
            if (string.IsNullOrWhiteSpace(refreshToken))
            {
                return (null, "Refresh token is required", 400);
            }

            var user = await _db.UserDetails.FirstOrDefaultAsync(u => u.UserToken == refreshToken);
            if (user == null)
            {
                return (null, "Invalid refresh token", 401);
            }

            if (!IsUserActive(user))
            {
                return (null, "Account is inactive or locked", 403);
            }

            if (user.LockoutEndUtc.HasValue && user.LockoutEndUtc.Value > DateTime.UtcNow)
            {
                return (null, "Account is locked. Try again later.", 403);
            }

            var settings = await GetSettingsAsync(user.TenantID);
            var portalType = user.VendorId.HasValue && user.VendorId.Value > 0 ? "vendor" : "erp";
            var response = await BuildLoginResponseAsync(user, portalType, settings);
            // Persist rotated refresh token — without this, the next refresh fails and the UI force-logs out.
            await _db.SaveChangesAsync();
            return (response, null, 200);
        }

        public async Task LogoutAsync(int userId)
        {
            var user = await _db.UserDetails.FirstOrDefaultAsync(u => u.User_UniqueID == userId);
            if (user == null) return;

            user.UserToken = "";
            var sessions = await _db.UserInfo
                .Where(s => s.User_UniqueID == userId && s.LogInStatus == 1)
                .ToListAsync();
            foreach (var s in sessions)
            {
                s.LogInStatus = 0;
            }

            await _db.SaveChangesAsync();
        }

        public async Task<AuthUserDto?> GetCurrentUserAsync(int userId)
        {
            var user = await _db.UserDetails.FirstOrDefaultAsync(u => u.User_UniqueID == userId);
            if (user == null) return null;
            return await BuildAuthUserDtoAsync(user, user.VendorId.HasValue && user.VendorId > 0 ? "vendor" : "erp");
        }

        public async Task<(bool ok, string? error)> ChangePasswordAsync(int userId, ChangePasswordRequest request)
        {
            var user = await _db.UserDetails.FirstOrDefaultAsync(u => u.User_UniqueID == userId);
            if (user == null) return (false, "User not found");

            if (!PasswordHasher.Verify(request.CurrentPassword, user.Password, user.PasswordSalt, out _))
            {
                return (false, "Current password is incorrect");
            }

            var settings = await GetSettingsAsync(user.TenantID);
            var (applied, applyError) = await ValidateAndApplyPasswordAsync(user, request.NewPassword, settings);
            if (!applied)
                return (false, applyError);

            user.ChangePassword = "N";
            user.PwdChangeStatus = "Changed";
            await _db.SaveChangesAsync();
            await TrimPasswordHistoryAsync(user.User_UniqueID, settings.PasswordHistoryCount);
            return (true, null);
        }

        public async Task<(bool ok, string? error)> ValidateAndApplyPasswordAsync(
            UserDetail user, string newPassword, SystemSettings settings)
        {
            if (!ValidatePasswordAgainstPolicy(newPassword, settings, out var policyError))
                return (false, policyError);

            if (user.User_UniqueID > 0 && settings.PasswordHistoryCount > 0)
            {
                if (!string.IsNullOrEmpty(user.Password)
                    && PasswordHasher.Verify(newPassword, user.Password, user.PasswordSalt, out _))
                {
                    return (false, "Cannot reuse your current password");
                }

                var recentHistory = await _db.UserPasswordHistory
                    .Where(h => h.UserId == user.User_UniqueID)
                    .OrderByDescending(h => h.CreatedDate)
                    .Take(settings.PasswordHistoryCount)
                    .ToListAsync();

                foreach (var entry in recentHistory)
                {
                    if (PasswordHasher.Verify(newPassword, entry.PasswordHash, entry.PasswordSalt, out _))
                        return (false, "Cannot reuse a recent password");
                }

                if (!string.IsNullOrEmpty(user.Password))
                {
                    _db.UserPasswordHistory.Add(new UserPasswordHistory
                    {
                        UserId = user.User_UniqueID,
                        TenantId = user.TenantID,
                        PasswordHash = user.Password,
                        PasswordSalt = user.PasswordSalt ?? "",
                        CreatedDate = DateTime.UtcNow
                    });
                }
            }

            await EnsurePasswordHashedAsync(user, newPassword);
            user.PwdResetDate = DateTime.UtcNow;
            return (true, null);
        }

        public async Task TrimPasswordHistoryAsync(int userId, int keepCount)
        {
            if (userId <= 0 || keepCount <= 0)
                return;

            var staleEntries = await _db.UserPasswordHistory
                .Where(h => h.UserId == userId)
                .OrderByDescending(h => h.CreatedDate)
                .Skip(keepCount)
                .ToListAsync();

            if (staleEntries.Count == 0)
                return;

            _db.UserPasswordHistory.RemoveRange(staleEntries);
            await _db.SaveChangesAsync();
        }

        public bool ValidatePasswordAgainstPolicy(string password, SystemSettings settings, out string? error)
        {
            error = null;
            if (string.IsNullOrEmpty(password))
            {
                error = "Password is required";
                return false;
            }

            var minLen = settings.MinPasswordLength > 0 ? settings.MinPasswordLength : 8;
            if (password.Length < minLen)
            {
                error = $"Password must be at least {minLen} characters";
                return false;
            }

            if (settings.RequireUppercase && !password.Any(char.IsUpper))
            {
                error = "Password must contain an uppercase letter";
                return false;
            }

            if (settings.RequireLowercase && !password.Any(char.IsLower))
            {
                error = "Password must contain a lowercase letter";
                return false;
            }

            if (settings.RequireNumbers && !password.Any(char.IsDigit))
            {
                error = "Password must contain a number";
                return false;
            }

            if (settings.RequireSpecialChars && password.All(char.IsLetterOrDigit))
            {
                error = "Password must contain a special character";
                return false;
            }

            return true;
        }

        public Task EnsurePasswordHashedAsync(UserDetail user, string plaintextPassword)
        {
            var (hash, salt) = PasswordHasher.HashPassword(plaintextPassword);
            user.Password = hash;
            user.PasswordSalt = salt;
            return Task.CompletedTask;
        }

        private async Task<(LoginResponse? response, string? error, int statusCode)> AuthenticateUserAsync(
            UserDetail user, string password, string portalType, string? ipAddress, string? browser)
        {
            if (!IsUserActive(user))
            {
                return (null, "Account is inactive", 403);
            }

            var settings = await GetSettingsAsync(user.TenantID);

            if (user.LockoutEndUtc.HasValue && user.LockoutEndUtc.Value > DateTime.UtcNow)
            {
                var mins = (int)Math.Ceiling((user.LockoutEndUtc.Value - DateTime.UtcNow).TotalMinutes);
                return (null, $"Account is locked. Try again in {Math.Max(mins, 1)} minute(s).", 403);
            }

            if (!PasswordHasher.Verify(password, user.Password, user.PasswordSalt, out var needsUpgrade))
            {
                await RecordFailedLoginAsync(user, settings);
                await LogLoginAttemptAsync(user.UserName, ipAddress, browser);
                return (null, "Invalid username or password", 401);
            }

            if (needsUpgrade || !PasswordHasher.IsHashed(user.Password))
            {
                await EnsurePasswordHashedAsync(user, password);
            }

            // Password expiration
            if (settings.PasswordExpirationDays > 0
                && user.PwdResetDate != default
                && user.PwdResetDate.AddDays(settings.PasswordExpirationDays) < DateTime.UtcNow)
            {
                user.ChangePassword = "Y";
            }

            user.FailedLoginCount = 0;
            user.LockoutEndUtc = null;

            await EnforceConcurrentSessionsAsync(user, settings);
            await CreateSessionAsync(user, ipAddress);
            await LogLoginAttemptAsync(user.UserName, ipAddress, browser);

            var response = await BuildLoginResponseAsync(user, portalType, settings);
            await _db.SaveChangesAsync();
            return (response, null, 200);
        }

        private async Task RecordFailedLoginAsync(UserDetail user, SystemSettings? settings = null)
        {
            settings ??= await GetSettingsAsync(user.TenantID);
            user.FailedLoginCount += 1;
            var maxAttempts = settings.FailedLoginAttempts > 0 ? settings.FailedLoginAttempts : 5;
            if (user.FailedLoginCount >= maxAttempts)
            {
                var lockMinutes = settings.AccountLockoutMinutes > 0 ? settings.AccountLockoutMinutes : 15;
                user.LockoutEndUtc = DateTime.UtcNow.AddMinutes(lockMinutes);
                user.FailedLoginCount = 0;
            }

            await _db.SaveChangesAsync();
        }

        private async Task EnforceConcurrentSessionsAsync(UserDetail user, SystemSettings settings)
        {
            if (settings.MaxConcurrentSessions <= 0) return;

            var active = await _db.UserInfo
                .Where(s => s.User_UniqueID == user.User_UniqueID && s.LogInStatus == 1)
                .OrderBy(s => s.LogInTime)
                .ToListAsync();

            var overflow = active.Count - settings.MaxConcurrentSessions + 1;
            if (overflow > 0)
            {
                foreach (var old in active.Take(overflow))
                {
                    old.LogInStatus = 0;
                }
            }
        }

        private Task CreateSessionAsync(UserDetail user, string? ipAddress)
        {
            _db.UserInfo.Add(new UserInfo
            {
                User_UniqueID = user.User_UniqueID,
                LogInTime = DateTime.UtcNow,
                LogInStatus = 1,
                IPAddress = ipAddress ?? "",
                TenantId = user.TenantID
            });
            return Task.CompletedTask;
        }

        private async Task LogLoginAttemptAsync(string? username, string? ipAddress, string? browser)
        {
            try
            {
                // UserLogin.ipaddress is historically an int column — store a hashed form of the IP when possible
                int ipAsInt = 0;
                if (!string.IsNullOrEmpty(ipAddress) && System.Net.IPAddress.TryParse(ipAddress, out var parsed))
                {
                    var bytes = parsed.GetAddressBytes();
                    if (bytes.Length >= 4)
                    {
                        ipAsInt = BitConverter.ToInt32(bytes, 0);
                    }
                }

                _db.UserLogin.Add(new UserLogin
                {
                    username = username,
                    logintime = DateTime.UtcNow,
                    ipaddress = ipAsInt,
                    browser = browser != null && browser.Length > 250 ? browser[..250] : browser
                });
                await _db.SaveChangesAsync();
            }
            catch
            {
                // Audit must not break login
            }
        }

        private async Task<LoginResponse> BuildLoginResponseAsync(UserDetail user, string portalType, SystemSettings settings)
        {
            var authUser = await BuildAuthUserDtoAsync(user, portalType);
            var refresh = _jwt.CreateRefreshToken();
            user.UserToken = refresh;

            var claims = BuildClaims(authUser);
            var timeout = settings.SessionTimeoutMinutes > 0 ? settings.SessionTimeoutMinutes : _tokenOptions.AccessTokenMinutes;
            var (accessToken, expires) = _jwt.CreateAccessToken(claims, timeout);

            return new LoginResponse
            {
                AccessToken = accessToken,
                RefreshToken = refresh,
                ExpiresAtUtc = expires,
                SessionTimeoutMinutes = timeout,
                User = authUser
            };
        }

        private async Task<AuthUserDto> BuildAuthUserDtoAsync(UserDetail user, string portalType)
        {
            string? roleName = null;
            string? roleTag = null;
            if (user.Role.HasValue)
            {
                var role = await _db.UserRole.FirstOrDefaultAsync(r => r.RoleID == user.Role.Value);
                roleName = role?.RoleName;
                roleTag = role?.RoleTag;
            }

            var canAccessAll = IsAdminRole(roleName, roleTag) || user.CanAccessAllLocations;

            var mappingIds = await _db.UserMapping
                .Where(m => m.userId == user.User_UniqueID)
                .Select(m => m.locationId)
                .ToListAsync();

            List<Location> locations;
            if (canAccessAll)
            {
                locations = await _db.Locations
                    .Where(l => l.TenantId == user.TenantID)
                    .OrderBy(l => l.Name)
                    .ToListAsync();
            }
            else
            {
                locations = await _db.Locations
                    .Where(l => l.TenantId == user.TenantID && mappingIds.Contains(l.LocationId))
                    .OrderBy(l => l.Name)
                    .ToListAsync();
            }

            var defaultLocationId = user.DefaultLocationId;
            if (!defaultLocationId.HasValue || defaultLocationId <= 0
                || locations.All(l => l.LocationId != defaultLocationId.Value))
            {
                defaultLocationId = locations.FirstOrDefault()?.LocationId
                    ?? mappingIds.FirstOrDefault();
                if (defaultLocationId == 0) defaultLocationId = null;
            }

            var permissions = new List<PermissionClaimDto>();
            // Admins get an empty permission list → UI treats that as "show everything"
            // (avoids incomplete PermissionMaster seeds hiding menus like Job Templates).
            if (!canAccessAll && user.Role.HasValue)
            {
                permissions = await (
                    from pr in _db.PermissionRole
                    join pm in _db.PermissionMaster on pr.PermissionId equals pm.PermissionId
                    where pr.RoleId == user.Role.Value && pr.TenantId == user.TenantID
                    select new PermissionClaimDto
                    {
                        PermissionId = pm.PermissionId,
                        PermissionName = pm.PermissionName ?? "",
                        Url = pm.Url,
                        ReportGroup = pm.ReportGroup
                    }).ToListAsync();
            }

            string? vendorCode = null;
            if (user.VendorId.HasValue && user.VendorId.Value > 0)
            {
                vendorCode = await _db.VendorMaster
                    .Where(v => v.vendor_id == user.VendorId.Value && v.Tenantid == user.TenantID)
                    .Select(v => v.vendorcode)
                    .FirstOrDefaultAsync();
            }

            return new AuthUserDto
            {
                UserId = user.User_UniqueID,
                UserName = user.UserName ?? "",
                FirstName = user.FirstName,
                LastName = user.LastName,
                Email = user.Email,
                TenantId = user.TenantID,
                RoleId = user.Role,
                RoleName = roleName,
                CanAccessAllLocations = canAccessAll,
                DefaultLocationId = defaultLocationId,
                MustChangePassword = string.Equals(user.ChangePassword, "Y", StringComparison.OrdinalIgnoreCase)
                    || string.Equals(user.ChangePassword, "Yes", StringComparison.OrdinalIgnoreCase),
                VendorId = user.VendorId,
                VendorCode = vendorCode,
                PortalType = portalType,
                Locations = locations.Select(l => new LocationClaimDto
                {
                    LocationId = l.LocationId,
                    Name = l.Name,
                    Code = l.Code,
                    LocType = l.LocType
                }).ToList(),
                Permissions = permissions
            };
        }

        private static List<Claim> BuildClaims(AuthUserDto user)
        {
            var claims = new List<Claim>
            {
                new(JwtRegisteredClaimNames.Sub, user.UserId.ToString()),
                new("userId", user.UserId.ToString()),
                new("tenantId", user.TenantId.ToString()),
                new(ClaimTypes.Name, user.UserName),
                new("userName", user.UserName),
                new("portalType", user.PortalType),
                new("canAccessAllLocations", user.CanAccessAllLocations ? "true" : "false")
            };

            if (user.RoleId.HasValue)
            {
                claims.Add(new Claim(ClaimTypes.Role, user.RoleId.Value.ToString()));
                claims.Add(new Claim("roleId", user.RoleId.Value.ToString()));
            }

            if (user.DefaultLocationId.HasValue)
            {
                claims.Add(new Claim("defaultLocationId", user.DefaultLocationId.Value.ToString()));
            }

            if (user.VendorId.HasValue)
            {
                claims.Add(new Claim("vendorId", user.VendorId.Value.ToString()));
            }

            // Embed allowed location ids (cap to keep token size reasonable)
            var locIds = user.Locations.Select(l => l.LocationId).Take(50);
            claims.Add(new Claim("locationIds", string.Join(",", locIds)));

            return claims;
        }

        private static bool IsAdminRole(string? roleName, string? roleTag)
        {
            static bool Match(string? value) =>
                !string.IsNullOrEmpty(value)
                && (value.Contains("admin", StringComparison.OrdinalIgnoreCase)
                    || value.Equals("Administrator", StringComparison.OrdinalIgnoreCase)
                    || value.Equals("ADMIN", StringComparison.OrdinalIgnoreCase));

            return Match(roleName) || Match(roleTag);
        }

        private static bool IsUserActive(UserDetail user)
        {
            if (string.IsNullOrWhiteSpace(user.Status)) return true;
            return string.Equals(user.Status, "Active", StringComparison.OrdinalIgnoreCase)
                || string.Equals(user.Status, "A", StringComparison.OrdinalIgnoreCase);
        }

        private async Task<SystemSettings> GetSettingsAsync(int tenantId)
        {
            var settings = await _db.SystemSettings.FirstOrDefaultAsync(s => s.TenantId == tenantId);
            return settings ?? new SystemSettings { TenantId = tenantId };
        }
    }
}
