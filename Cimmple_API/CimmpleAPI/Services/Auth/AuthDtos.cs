namespace CimmpleAPI.Services.Auth
{
    public class LoginRequest
    {
        public string Username { get; set; } = string.Empty;
        public string Password { get; set; } = string.Empty;
        /// <summary>Optional when usernames are unique globally; required if shared across tenants.</summary>
        public int? TenantId { get; set; }
    }

    public class VendorLoginRequest
    {
        public string VendorCode { get; set; } = string.Empty;
        public string Password { get; set; } = string.Empty;
        public int? TenantId { get; set; }
    }

    public class RefreshTokenRequest
    {
        public string RefreshToken { get; set; } = string.Empty;
    }

    public class ChangePasswordRequest
    {
        public string CurrentPassword { get; set; } = string.Empty;
        public string NewPassword { get; set; } = string.Empty;
    }

    public class LocationClaimDto
    {
        public int LocationId { get; set; }
        public string Name { get; set; } = string.Empty;
        public string Code { get; set; } = string.Empty;
        public int LocType { get; set; }
    }

    public class PermissionClaimDto
    {
        public int PermissionId { get; set; }
        public string PermissionName { get; set; } = string.Empty;
        public string? Url { get; set; }
        public string? ReportGroup { get; set; }
    }

    public class AuthUserDto
    {
        public int UserId { get; set; }
        public string UserName { get; set; } = string.Empty;
        public string? FirstName { get; set; }
        public string? LastName { get; set; }
        public string? Email { get; set; }
        public int TenantId { get; set; }
        public int? RoleId { get; set; }
        public string? RoleName { get; set; }
        public bool CanAccessAllLocations { get; set; }
        public int? DefaultLocationId { get; set; }
        public bool MustChangePassword { get; set; }
        public int? VendorId { get; set; }
        public string? VendorCode { get; set; }
        public string PortalType { get; set; } = "erp"; // erp | vendor
        public string? TimeZone { get; set; }
        public List<LocationClaimDto> Locations { get; set; } = new();
        public List<PermissionClaimDto> Permissions { get; set; } = new();
    }

    public class LoginResponse
    {
        public string AccessToken { get; set; } = string.Empty;
        public string RefreshToken { get; set; } = string.Empty;
        public DateTime ExpiresAtUtc { get; set; }
        public int SessionTimeoutMinutes { get; set; }
        public AuthUserDto User { get; set; } = new();
    }
}
