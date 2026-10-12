using System;
using System.Linq;
using CimmpleAPI.Data;
using Microsoft.EntityFrameworkCore;

namespace CimmpleAPI.Services.Auth
{
    /// <summary>
    /// Guards that keep a tenant from locking out its admin accounts (or the signed-in user)
    /// through delete / deactivate flows in Employee Master, User Management and imports.
    /// </summary>
    public static class AccountProtection
    {
        /// <summary>Matches AuthService login rule: blank, "Active" or "A" can sign in.</summary>
        public static bool IsActiveStatus(string? status) =>
            string.IsNullOrWhiteSpace(status)
            || string.Equals(status.Trim(), "Active", StringComparison.OrdinalIgnoreCase)
            || string.Equals(status.Trim(), "A", StringComparison.OrdinalIgnoreCase);

        public static bool IsAdminRole(CimmpleDbContext db, int? roleId)
        {
            if (!roleId.HasValue || roleId.Value <= 0) return false;
            var role = db.UserRole
                .AsNoTracking()
                .Where(r => r.RoleID == roleId.Value)
                .Select(r => new { r.RoleName, r.RoleTag })
                .FirstOrDefault();
            return role != null && ErpPermissionSeedService.IsAdminRoleName(role.RoleName, role.RoleTag);
        }

        /// <summary>
        /// Reason the account cannot be saved with <paramref name="status"/>, or null when allowed.
        /// <paramref name="roleId"/> is the role the account will have after the save.
        /// </summary>
        public static string? GetDeactivationBlockReason(
            CimmpleDbContext db,
            int targetUserId,
            int? roleId,
            string? status,
            int? currentUserId)
        {
            if (IsActiveStatus(status)) return null;

            if (targetUserId > 0 && currentUserId.HasValue && currentUserId.Value == targetUserId)
            {
                return "You cannot deactivate your own account.";
            }

            if (IsAdminRole(db, roleId))
            {
                return "Admin accounts cannot be set to Inactive. Change the role first.";
            }

            return null;
        }

        /// <summary>Reason the account cannot be deleted, or null when allowed.</summary>
        public static string? GetDeleteBlockReason(
            CimmpleDbContext db,
            int targetUserId,
            int? roleId,
            int? currentUserId)
        {
            if (currentUserId.HasValue && currentUserId.Value == targetUserId)
            {
                return "You cannot delete your own account.";
            }

            if (IsAdminRole(db, roleId))
            {
                return "Admin accounts cannot be deleted. Change the role first.";
            }

            return null;
        }
    }
}
