using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using CimmpleAPI.Data;
using CimmpleAPI.Data.Models;
using CimmpleAPI.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace CimmpleAPI.Services.Auth
{
    public static class AuthClaimTypes
    {
        public const string SessionId = "sessionId";
        public const string PasswordChangeRequired = "pwdChangeRequired";
        public const string LocationIdsTruncated = "locationIdsTruncated";
    }

    public interface IAuthService
    {
        Task<(LoginResponse? response, string? error, int statusCode)> LoginAsync(LoginRequest request, string? ipAddress, string? browser);
        Task<(LoginResponse? response, string? error, int statusCode)> VendorLoginAsync(VendorLoginRequest request, string? ipAddress, string? browser);
        Task<(LoginResponse? response, string? error, int statusCode)> RefreshAsync(string refreshToken);
        Task LogoutAsync(int userId, int? sessionId = null);
        Task RevokeSessionAsync(string refreshToken);
        Task<AuthUserDto?> GetCurrentUserAsync(int userId);
        Task<(bool ok, string? error)> ChangePasswordAsync(int userId, ChangePasswordRequest request);
        Task<(bool ok, string? error)> ValidateAndApplyPasswordAsync(UserDetail user, string newPassword, SystemSettings settings);
        Task TrimPasswordHistoryAsync(int userId, int keepCount);
        bool ValidatePasswordAgainstPolicy(string password, SystemSettings settings, out string? error);
        Task EnsurePasswordHashedAsync(UserDetail user, string plaintextPassword);
    }

    public class AuthService : IAuthService
    {
        private const int MaxLocationIdsInToken = 50;
        private readonly CimmpleDbContext _db;
        private readonly IJwtTokenService _jwt;
        private readonly TokenConfigOptions _tokenOptions;
        private readonly ISessionValidationService _sessions;
        private readonly ILogger<AuthService> _logger;

        public AuthService(
            CimmpleDbContext db,
            IJwtTokenService jwt,
            IOptions<TokenConfigOptions> tokenOptions,
            ISessionValidationService sessions,
            ILogger<AuthService> logger)
        {
            _db = db;
            _jwt = jwt;
            _tokenOptions = tokenOptions.Value;
            _sessions = sessions;
            _logger = logger;
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

            return await AuthenticateUserAsync(matches[0], request.Password, "erp", ipAddress, browser);
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
                result.response.User.VendorName = vendor.company_name;
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

            if (!TryParseRefreshToken(refreshToken, out var sessionId, out var secret))
            {
                return await RefreshLegacyTokenAsync(refreshToken);
            }

            var session = await _db.UserInfo.FirstOrDefaultAsync(s => s.UserID == sessionId);
            if (session == null || session.LogInStatus != 1 || !RefreshSecretMatches(session.RefreshTokenHash, secret))
            {
                return (null, "Invalid refresh token", 401);
            }

            var user = await _db.UserDetails.FirstOrDefaultAsync(u => u.User_UniqueID == session.User_UniqueID);
            if (user == null)
            {
                return (null, "Invalid refresh token", 401);
            }

            var settings = await GetSettingsAsync(user.TenantID);
            var now = DateTime.UtcNow;
            if ((session.RefreshExpiresUtc.HasValue && session.RefreshExpiresUtc.Value <= now)
                || (session.LastRefreshUtc ?? session.LogInTime) + GetRefreshIdleWindow(settings) <= now)
            {
                RevokeSession(session);
                await _db.SaveChangesAsync();
                return (null, "Session expired. Please sign in again.", 401);
            }

            var (stateError, stateStatus) = CheckAccountUsable(user);
            if (stateError == null)
            {
                (stateError, stateStatus) = await CheckTenantUsableAsync(user.TenantID);
            }
            if (stateError != null)
            {
                return (null, stateError, stateStatus);
            }

            ApplyPasswordExpiry(user, settings);

            var newSecret = _jwt.CreateRefreshToken();
            session.RefreshTokenHash = HashRefreshSecret(newSecret);
            session.LastRefreshUtc = now;

            var response = await BuildLoginResponseAsync(user, GetPortalType(user), settings, session.UserID, newSecret);
            await _db.SaveChangesAsync();
            return (response, null, 200);
        }

        /// <summary>
        /// Tokens issued before per-session refresh tokens were stored in UserDetails.UserToken.
        /// Accept such a token once and convert it into a normal expiring session.
        /// </summary>
        private async Task<(LoginResponse? response, string? error, int statusCode)> RefreshLegacyTokenAsync(string refreshToken)
        {
            var user = await _db.UserDetails.FirstOrDefaultAsync(u => u.UserToken == refreshToken);
            if (user == null)
            {
                return (null, "Invalid refresh token", 401);
            }

            var (stateError, stateStatus) = CheckAccountUsable(user);
            if (stateError == null)
            {
                (stateError, stateStatus) = await CheckTenantUsableAsync(user.TenantID);
            }
            if (stateError != null)
            {
                return (null, stateError, stateStatus);
            }

            user.UserToken = "";
            var settings = await GetSettingsAsync(user.TenantID);
            ApplyPasswordExpiry(user, settings);

            var response = await CreateSessionWithTokensAsync(user, GetPortalType(user), settings, null);
            return response == null
                ? (null, "Sign-in could not be completed. Please try again.", 503)
                : (response, null, 200);
        }

        public async Task LogoutAsync(int userId, int? sessionId = null)
        {
            if (sessionId.HasValue)
            {
                var session = await _db.UserInfo
                    .FirstOrDefaultAsync(s => s.UserID == sessionId.Value && s.User_UniqueID == userId);
                if (session != null)
                {
                    RevokeSession(session);
                    await _db.SaveChangesAsync();
                }
                return;
            }

            // Access tokens issued before per-session tokens carry no session id: end every session.
            var user = await _db.UserDetails.FirstOrDefaultAsync(u => u.User_UniqueID == userId);
            if (user == null) return;

            user.UserToken = "";
            var sessions = await _db.UserInfo
                .Where(s => s.User_UniqueID == userId && s.LogInStatus == 1)
                .ToListAsync();
            foreach (var s in sessions)
            {
                RevokeSession(s);
            }

            await _db.SaveChangesAsync();
        }

        public async Task RevokeSessionAsync(string refreshToken)
        {
            if (string.IsNullOrWhiteSpace(refreshToken))
            {
                return;
            }

            if (TryParseRefreshToken(refreshToken, out var sessionId, out var secret))
            {
                var session = await _db.UserInfo.FirstOrDefaultAsync(s => s.UserID == sessionId);
                if (session != null && RefreshSecretMatches(session.RefreshTokenHash, secret))
                {
                    RevokeSession(session);
                    await _db.SaveChangesAsync();
                }
                return;
            }

            var user = await _db.UserDetails.FirstOrDefaultAsync(u => u.UserToken == refreshToken);
            if (user != null)
            {
                user.UserToken = "";
                await _db.SaveChangesAsync();
            }
        }

        public async Task<AuthUserDto?> GetCurrentUserAsync(int userId)
        {
            var user = await _db.UserDetails.FirstOrDefaultAsync(u => u.User_UniqueID == userId);
            if (user == null) return null;
            var dto = await BuildAuthUserDtoAsync(user, user.VendorId.HasValue && user.VendorId > 0 ? "vendor" : "erp");
            var settings = await GetSettingsAsync(user.TenantID);
            dto.TimeZone = settings.Timezone;
            return dto;
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

            if (user.User_UniqueID > 0
                && !string.IsNullOrEmpty(user.Password)
                && PasswordHasher.Verify(newPassword, user.Password, user.PasswordSalt, out _))
            {
                return (false, "Cannot reuse your current password");
            }

            if (user.User_UniqueID > 0 && settings.PasswordHistoryCount > 0)
            {
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
            var settings = await GetSettingsAsync(user.TenantID);
            var isLocked = user.LockoutEndUtc.HasValue && user.LockoutEndUtc.Value > DateTime.UtcNow;

            // Account state (inactive / locked / vendor) is only disclosed after a correct password.
            if (!PasswordHasher.Verify(password, user.Password, user.PasswordSalt, out var needsUpgrade))
            {
                if (!isLocked)
                {
                    try
                    {
                        await RecordFailedLoginAsync(user, settings);
                    }
                    catch
                    {
                        // Lockout counters must not block a 401
                    }
                }
                await LogLoginAttemptAsync(user.UserName, ipAddress, browser);
                return (null, "Invalid username or password", 401);
            }

            var (stateError, stateStatus) = CheckAccountUsable(user);
            if (stateError == null)
            {
                (stateError, stateStatus) = await CheckTenantUsableAsync(user.TenantID);
            }
            if (stateError != null)
            {
                return (null, stateError, stateStatus);
            }

            if (portalType == "erp" && user.VendorId.HasValue && user.VendorId.Value > 0)
            {
                return (null, "This account is for the vendor portal. Please sign in at /vendor/login.", 403);
            }

            if (needsUpgrade || !PasswordHasher.IsHashed(user.Password))
            {
                await EnsurePasswordHashedAsync(user, password);
            }

            ApplyPasswordExpiry(user, settings);

            user.FailedLoginCount = 0;
            user.LockoutEndUtc = null;
            user.UserToken = "";

            var response = await CreateSessionWithTokensAsync(user, portalType, settings, ipAddress);
            if (response == null)
            {
                return (null, "Sign-in could not be completed. Please try again.", 503);
            }

            await LogLoginAttemptAsync(user.UserName, ipAddress, browser);
            return (response, null, 200);
        }

        private static (string? error, int statusCode) CheckAccountUsable(UserDetail user)
        {
            if (!IsUserActive(user))
            {
                return ("Account is inactive", 403);
            }

            if (user.LockoutEndUtc.HasValue && user.LockoutEndUtc.Value > DateTime.UtcNow)
            {
                var mins = (int)Math.Ceiling((user.LockoutEndUtc.Value - DateTime.UtcNow).TotalMinutes);
                return ($"Account is locked. Try again in {Math.Max(mins, 1)} minute(s).", 403);
            }

            return (null, 200);
        }

        /// <summary>Tenants missing from the registry (legacy data) are allowed; see TenantSchemaService.</summary>
        private async Task<(string? error, int statusCode)> CheckTenantUsableAsync(int tenantId)
        {
            if (tenantId <= 0)
            {
                return (null, 200);
            }

            string? status;
            try
            {
                status = await _db.Tenants.AsNoTracking()
                    .Where(t => t.TenantId == tenantId)
                    .Select(t => t.Status)
                    .FirstOrDefaultAsync();
            }
            catch (Exception ex) when (SystemSettingsSchemaService.IsMissingTableException(ex))
            {
                return (null, 200);
            }

            return TenantStatus.Normalize(status) switch
            {
                TenantStatus.Provisioning => ("This account is still being set up. Please try again shortly.", 403),
                TenantStatus.Suspended => ("This account has been suspended. Please contact Cimmple support.", 403),
                TenantStatus.Cancelled => ("This account is no longer active. Please contact Cimmple support.", 403),
                _ => (null, 200)
            };
        }

        private static void ApplyPasswordExpiry(UserDetail user, SystemSettings settings)
        {
            if (settings.PasswordExpirationDays > 0
                && user.PwdResetDate.HasValue
                && user.PwdResetDate.Value != default
                && user.PwdResetDate.Value.AddDays(settings.PasswordExpirationDays) < DateTime.UtcNow)
            {
                user.ChangePassword = "Y";
            }
        }

        /// <summary>
        /// Creates the login session row and its tokens. If the first save fails (together with the
        /// user's lockout/upgrade changes), retries persisting only the session; returns null when the
        /// refresh token cannot be stored so the caller fails the login instead of issuing a dead session.
        /// </summary>
        private async Task<LoginResponse?> CreateSessionWithTokensAsync(
            UserDetail user, string portalType, SystemSettings settings, string? ipAddress)
        {
            try
            {
                return await CreateSessionCoreAsync(user, portalType, settings, ipAddress, enforceSessionLimit: true);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Saving login session failed for user {UserId}; retrying session only.", user.User_UniqueID);
                _db.ChangeTracker.Clear();
            }

            try
            {
                return await CreateSessionCoreAsync(user, portalType, settings, ipAddress, enforceSessionLimit: false);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Login session could not be persisted for user {UserId}.", user.User_UniqueID);
                _db.ChangeTracker.Clear();
                return null;
            }
        }

        private async Task<LoginResponse> CreateSessionCoreAsync(
            UserDetail user, string portalType, SystemSettings settings, string? ipAddress, bool enforceSessionLimit)
        {
            var now = DateTime.UtcNow;
            if (enforceSessionLimit)
            {
                await EnforceConcurrentSessionsAsync(user, settings, now);
            }

            var refreshDays = _tokenOptions.RefreshTokenDays > 0 ? _tokenOptions.RefreshTokenDays : 7;
            var secret = _jwt.CreateRefreshToken();
            var session = new UserInfo
            {
                User_UniqueID = user.User_UniqueID,
                LogInTime = now,
                LogInStatus = 1,
                IPAddress = ipAddress ?? "",
                TenantId = user.TenantID,
                RefreshTokenHash = HashRefreshSecret(secret),
                RefreshExpiresUtc = now.AddDays(refreshDays),
                LastRefreshUtc = now
            };
            _db.UserInfo.Add(session);
            await _db.SaveChangesAsync();

            return await BuildLoginResponseAsync(user, portalType, settings, session.UserID, secret);
        }

        private void RevokeSession(UserInfo session)
        {
            session.LogInStatus = 0;
            session.RefreshTokenHash = null;
            _sessions.Invalidate(session.UserID);
        }

        /// <summary>
        /// A session whose refresh token has not been used for this long is treated as abandoned
        /// (browser closed without logout). The UI refreshes shortly before every access-token expiry
        /// while the user is not idle, so this only ends sessions that are no longer open.
        /// </summary>
        private TimeSpan GetRefreshIdleWindow(SystemSettings settings)
        {
            var timeout = settings.SessionTimeoutMinutes > 0 ? settings.SessionTimeoutMinutes : _tokenOptions.AccessTokenMinutes;
            if (timeout <= 0) timeout = 60;
            return TimeSpan.FromMinutes(timeout * 2 + 5);
        }

        private static string GetPortalType(UserDetail user) =>
            user.VendorId.HasValue && user.VendorId.Value > 0 ? "vendor" : "erp";

        private static bool TryParseRefreshToken(string token, out int sessionId, out string secret)
        {
            sessionId = 0;
            secret = "";
            var dot = token.IndexOf('.');
            if (dot <= 0 || dot == token.Length - 1)
            {
                return false;
            }

            if (!int.TryParse(token[..dot], out sessionId) || sessionId <= 0)
            {
                return false;
            }

            secret = token[(dot + 1)..];
            return true;
        }

        private static string HashRefreshSecret(string secret) =>
            Convert.ToBase64String(SHA256.HashData(Encoding.UTF8.GetBytes(secret)));

        private static bool RefreshSecretMatches(string? storedHash, string secret)
        {
            if (string.IsNullOrEmpty(storedHash))
            {
                return false;
            }

            return CryptographicOperations.FixedTimeEquals(
                Encoding.UTF8.GetBytes(storedHash),
                Encoding.UTF8.GetBytes(HashRefreshSecret(secret)));
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

        private async Task EnforceConcurrentSessionsAsync(UserDetail user, SystemSettings settings, DateTime now)
        {
            var active = await _db.UserInfo
                .Where(s => s.User_UniqueID == user.User_UniqueID && s.LogInStatus == 1)
                .OrderBy(s => s.LogInTime)
                .ToListAsync();

            var live = new List<UserInfo>();
            foreach (var session in active)
            {
                if (session.RefreshExpiresUtc.HasValue && session.RefreshExpiresUtc.Value <= now)
                {
                    RevokeSession(session);
                }
                else
                {
                    live.Add(session);
                }
            }

            if (settings.MaxConcurrentSessions <= 0) return;

            var overflow = live.Count - settings.MaxConcurrentSessions + 1;
            if (overflow > 0)
            {
                foreach (var old in live.Take(overflow))
                {
                    RevokeSession(old);
                }
            }
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

                var entry = _db.UserLogin.Add(new UserLogin
                {
                    username = username,
                    logintime = DateTime.UtcNow,
                    ipaddress = ipAsInt,
                    browser = browser != null && browser.Length > 250 ? browser[..250] : browser
                });
                try
                {
                    await _db.SaveChangesAsync();
                }
                catch
                {
                    entry.State = EntityState.Detached;
                    throw;
                }
            }
            catch
            {
                // Audit must not break login
            }
        }

        private async Task<LoginResponse> BuildLoginResponseAsync(
            UserDetail user, string portalType, SystemSettings settings, int sessionId, string refreshSecret)
        {
            var authUser = await BuildAuthUserDtoAsync(user, portalType);
            authUser.TimeZone = settings.Timezone;
            var refresh = $"{sessionId}.{refreshSecret}";

            // The role-level "Reset Password Required" flag stays a UI prompt; only the user-level flag
            // (admin reset or password expiry) restricts the token server-side. Vendor portal has no
            // change-password screen, so vendor tokens are never restricted.
            var passwordChangeRequired = portalType == "erp" && IsUserChangePasswordFlagSet(user);
            var claims = BuildClaims(authUser, sessionId, passwordChangeRequired);
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
            string? roleResetPwd = null;
            if (user.Role.HasValue)
            {
                try
                {
                    var role = await _db.UserRole.AsNoTracking().FirstOrDefaultAsync(r =>
                        r.RoleID == user.Role.Value
                        && (r.TenantId == user.TenantID || r.TenantId == 0));
                    roleName = role?.RoleName;
                    roleTag = role?.RoleTag;
                    roleResetPwd = role?.ResetPwd;
                }
                catch (Exception ex) when (SystemSettingsSchemaService.IsMissingTableException(ex))
                {
                    // Login must succeed even if role metadata columns are missing
                }
            }

            var canAccessAll = IsAdminRole(roleName, roleTag) || user.CanAccessAllLocations;

            var mappingIds = new List<int>();
            try
            {
                mappingIds = await _db.UserMapping
                    .AsNoTracking()
                    .Where(m => m.userId == user.User_UniqueID)
                    .Select(m => m.locationId)
                    .ToListAsync();
            }
            catch (Exception ex) when (SystemSettingsSchemaService.IsMissingTableException(ex))
            {
            }

            List<LocationClaimDto> locationClaims = new();
            try
            {
                var locationQuery = _db.Locations.AsNoTracking().Where(l => l.TenantId == user.TenantID);
                if (!canAccessAll)
                {
                    locationQuery = locationQuery.Where(l => mappingIds.Contains(l.LocationId));
                }

                locationClaims = await locationQuery
                    .OrderBy(l => l.Name)
                    .Select(l => new LocationClaimDto
                    {
                        LocationId = l.LocationId,
                        Name = l.Name ?? "",
                        Code = l.Code ?? "",
                        LocType = l.LocType
                    })
                    .ToListAsync();
            }
            catch (Exception ex) when (SystemSettingsSchemaService.IsMissingTableException(ex))
            {
                try
                {
                    var fallbackQuery = _db.Locations.AsNoTracking().Where(l => l.TenantId == user.TenantID);
                    if (!canAccessAll)
                    {
                        fallbackQuery = fallbackQuery.Where(l => mappingIds.Contains(l.LocationId));
                    }

                    locationClaims = await fallbackQuery
                        .OrderBy(l => l.Name)
                        .Select(l => new LocationClaimDto
                        {
                            LocationId = l.LocationId,
                            Name = l.Name ?? "",
                            Code = l.Code ?? "",
                            LocType = 0
                        })
                        .ToListAsync();
                }
                catch
                {
                    locationClaims = new List<LocationClaimDto>();
                }
            }

            var defaultLocationId = user.DefaultLocationId;
            if (!defaultLocationId.HasValue || defaultLocationId <= 0
                || locationClaims.All(l => l.LocationId != defaultLocationId.Value))
            {
                defaultLocationId = locationClaims.FirstOrDefault()?.LocationId
                    ?? mappingIds.FirstOrDefault();
                if (defaultLocationId == 0) defaultLocationId = null;
            }

            var permissions = new List<PermissionClaimDto>();
            if (!canAccessAll && user.Role.HasValue)
            {
                try
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
                catch (Exception ex) when (SystemSettingsSchemaService.IsMissingTableException(ex))
                {
                    permissions = new List<PermissionClaimDto>();
                }
            }

            string? vendorCode = null;
            string? vendorName = null;
            if (user.VendorId.HasValue && user.VendorId.Value > 0)
            {
                try
                {
                    var vendorInfo = await _db.VendorMaster
                        .Where(v => v.vendor_id == user.VendorId.Value && v.Tenantid == user.TenantID)
                        .Select(v => new { v.vendorcode, v.company_name })
                        .FirstOrDefaultAsync();
                    vendorCode = vendorInfo?.vendorcode;
                    vendorName = vendorInfo?.company_name;
                }
                catch (Exception ex) when (SystemSettingsSchemaService.IsMissingTableException(ex))
                {
                }
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
                MustChangePassword = IsUserChangePasswordFlagSet(user)
                    || string.Equals(roleResetPwd, "Y", StringComparison.OrdinalIgnoreCase)
                    || string.Equals(roleResetPwd, "Yes", StringComparison.OrdinalIgnoreCase),
                VendorId = user.VendorId,
                VendorCode = vendorCode,
                VendorName = vendorName,
                PortalType = portalType,
                Locations = locationClaims,
                Permissions = permissions
            };
        }

        private static bool IsUserChangePasswordFlagSet(UserDetail user) =>
            string.Equals(user.ChangePassword, "Y", StringComparison.OrdinalIgnoreCase)
            || string.Equals(user.ChangePassword, "Yes", StringComparison.OrdinalIgnoreCase);

        private static List<Claim> BuildClaims(AuthUserDto user, int sessionId, bool passwordChangeRequired)
        {
            var claims = new List<Claim>
            {
                new(JwtRegisteredClaimNames.Sub, user.UserId.ToString()),
                new("userId", user.UserId.ToString()),
                new("tenantId", user.TenantId.ToString()),
                new(ClaimTypes.Name, user.UserName),
                new("userName", user.UserName),
                new("portalType", user.PortalType),
                new("canAccessAllLocations", user.CanAccessAllLocations ? "true" : "false"),
                new(AuthClaimTypes.SessionId, sessionId.ToString())
            };

            if (passwordChangeRequired)
            {
                claims.Add(new Claim(AuthClaimTypes.PasswordChangeRequired, "true"));
            }

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

            // Cap keeps the token small; when truncated the API resolves the full set from UserMapping.
            var locIds = user.Locations.Select(l => l.LocationId).Take(MaxLocationIdsInToken);
            claims.Add(new Claim("locationIds", string.Join(",", locIds)));
            if (!user.CanAccessAllLocations && user.Locations.Count > MaxLocationIdsInToken)
            {
                claims.Add(new Claim(AuthClaimTypes.LocationIdsTruncated, "true"));
            }

            return claims;
        }

        private static bool IsAdminRole(string? roleName, string? roleTag)
        {
            static bool Match(string? value) =>
                !string.IsNullOrEmpty(value)
                && (value.Contains("admin", StringComparison.OrdinalIgnoreCase)
                    || value.Equals("Administrator", StringComparison.OrdinalIgnoreCase)
                    || value.Equals("ADMIN", StringComparison.OrdinalIgnoreCase));

            return Match(roleName);
        }

        private static bool IsUserActive(UserDetail user)
        {
            if (string.IsNullOrWhiteSpace(user.Status)) return true;
            return string.Equals(user.Status, "Active", StringComparison.OrdinalIgnoreCase)
                || string.Equals(user.Status, "A", StringComparison.OrdinalIgnoreCase);
        }

        private async Task<SystemSettings> GetSettingsAsync(int tenantId)
        {
            try
            {
                var settings = await _db.SystemSettings.AsNoTracking().FirstOrDefaultAsync(s => s.TenantId == tenantId);
                return settings ?? new SystemSettings { TenantId = tenantId };
            }
            catch (Exception ex) when (SystemSettingsSchemaService.IsMissingTableException(ex))
            {
                try
                {
                    await SystemSettingsSchemaService.EnsureTablesAsync(_db);
                    var settings = await _db.SystemSettings.AsNoTracking().FirstOrDefaultAsync(s => s.TenantId == tenantId);
                    return settings ?? new SystemSettings { TenantId = tenantId };
                }
                catch
                {
                    return new SystemSettings { TenantId = tenantId };
                }
            }
        }
    }
}
