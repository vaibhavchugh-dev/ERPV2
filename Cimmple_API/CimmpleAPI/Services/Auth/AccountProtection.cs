using System;
using System.Linq;
using CimmpleAPI.Data;
using CimmpleAPI.Data.Models;
using Microsoft.EntityFrameworkCore;

namespace CimmpleAPI.Services.Auth
{
    /// <summary>
    /// Guards that keep a tenant from locking out its admin accounts (or the signed-in user)
    /// and that keep non-admins from mutating security-sensitive fields.
    /// </summary>
    public static class AccountProtection
    {
        /// <summary>Matches AuthService login rule: blank, "Active" or "A" can sign in.</summary>
        public static bool IsActiveStatus(string? status) =>
            string.IsNullOrWhiteSpace(status)
            || string.Equals(status.Trim(), "Active", StringComparison.OrdinalIgnoreCase)
            || string.Equals(status.Trim(), "A", StringComparison.OrdinalIgnoreCase);

        public static bool IsAdminRoleName(string? roleName, string? roleTag) =>
            ErpPermissionSeedService.IsAdminRoleName(roleName, roleTag);

        public static bool IsAdminRole(CimmpleDbContext db, int? roleId)
        {
            if (!roleId.HasValue || roleId.Value <= 0) return false;
            var role = db.UserRole
                .AsNoTracking()
                .Where(r => r.RoleID == roleId.Value)
                .Select(r => new { r.RoleName, r.RoleTag })
                .FirstOrDefault();
            return role != null && IsAdminRoleName(role.RoleName, role.RoleTag);
        }

        /// <summary>
        /// Caller is treated as admin when they have all-locations access (admin login claim)
        /// or their assigned role is an admin role.
        /// </summary>
        public static bool IsAdminCaller(CimmpleDbContext db, bool canAccessAllLocations, int? callerRoleId) =>
            canAccessAllLocations || IsAdminRole(db, callerRoleId);

        public static int CountActiveAdmins(CimmpleDbContext db, int tenantId, int? excludeUserId = null)
        {
            var adminRoleIds = db.UserRole.AsNoTracking()
                .Where(r => r.TenantId == tenantId || r.TenantId == 0)
                .AsEnumerable()
                .Where(r => IsAdminRoleName(r.RoleName, r.RoleTag))
                .Select(r => r.RoleID)
                .ToHashSet();

            if (adminRoleIds.Count == 0) return 0;

            return db.UserDetails.AsNoTracking()
                .Where(u => u.TenantID == tenantId
                    && u.Role.HasValue
                    && adminRoleIds.Contains(u.Role.Value)
                    && (excludeUserId == null || u.User_UniqueID != excludeUserId.Value))
                .AsEnumerable()
                .Count(u => IsActiveStatus(u.Status));
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

        /// <summary>
        /// Reason the account cannot be deleted/deactivated, or null when allowed.
        /// Pass <paramref name="softDeactivate"/> when the API only soft-deactivates (User Management).
        /// </summary>
        public static string? GetDeleteBlockReason(
            CimmpleDbContext db,
            int targetUserId,
            int? roleId,
            int? currentUserId,
            bool softDeactivate = false)
        {
            if (currentUserId.HasValue && currentUserId.Value == targetUserId)
            {
                return softDeactivate
                    ? "You cannot deactivate your own account."
                    : "You cannot delete your own account.";
            }

            if (IsAdminRole(db, roleId))
            {
                return softDeactivate
                    ? "Admin accounts cannot be deactivated. Change the role first."
                    : "Admin accounts cannot be deleted. Change the role first.";
            }

            return null;
        }

        /// <summary>
        /// Strict policy: non-admins cannot edit Admin accounts at all (profile or security).
        /// </summary>
        public static string? GetAdminTargetMutationBlockReason(
            CimmpleDbContext db,
            bool callerIsAdmin,
            int? targetRoleId)
        {
            if (callerIsAdmin) return null;
            if (IsAdminRole(db, targetRoleId))
            {
                return "Only an administrator can edit an Admin account.";
            }
            return null;
        }

        /// <summary>
        /// Blocks non-admins from login access / password / all-locations / Admin role assignment.
        /// Blocks demoting the last active Admin (including self).
        /// </summary>
        public static string? GetEmployeeSecurityMutationBlockReason(
            CimmpleDbContext db,
            bool callerIsAdmin,
            int tenantId,
            int? currentUserId,
            UserDetail? existing,
            int? requestedRole,
            string? requestedUserName,
            bool passwordProvided,
            bool? requestedCanAccessAllLocations)
        {
            var existingRole = existing?.Role;
            var existingUserName = existing?.UserName ?? "";
            var existingHasPassword = !string.IsNullOrEmpty(existing?.Password);
            var requestUserName = (requestedUserName ?? "").Trim();
            var loginEnabled = !string.IsNullOrWhiteSpace(requestUserName);
            var existingLoginEnabled = !string.IsNullOrWhiteSpace(existingUserName) && existingHasPassword;

            var roleChanging = (existingRole ?? 0) != (requestedRole ?? 0);
            var loginChanging = !string.Equals(existingUserName.Trim(), requestUserName, StringComparison.Ordinal)
                || (loginEnabled != existingLoginEnabled)
                || passwordProvided;

            if (!callerIsAdmin)
            {
                // Strict: no profile or security edits on existing Admin accounts.
                if (existing != null)
                {
                    var targetBlock = GetAdminTargetMutationBlockReason(db, callerIsAdmin, existingRole);
                    if (targetBlock != null)
                    {
                        return targetBlock;
                    }
                }

                if (requestedCanAccessAllLocations == true)
                {
                    return "You cannot grant access to all locations.";
                }

                if (loginChanging)
                {
                    return "Only an administrator can change login access or passwords.";
                }

                if (roleChanging)
                {
                    return "Only an administrator can change user roles.";
                }
            }

            // Last-admin protection (admins and anyone who could change role)
            if (roleChanging
                && IsAdminRole(db, existingRole)
                && !IsAdminRole(db, requestedRole)
                && existing != null
                && IsActiveStatus(existing.Status))
            {
                var otherAdmins = CountActiveAdmins(db, tenantId, existing.User_UniqueID);
                if (otherAdmins <= 0)
                {
                    return "Cannot remove the last active Admin role for this tenant.";
                }
            }

            return null;
        }

        /// <summary>User Management UpdateUser / role change guards.</summary>
        public static string? GetUserManagementRoleChangeBlockReason(
            CimmpleDbContext db,
            bool callerIsAdmin,
            int tenantId,
            int? currentUserId,
            UserDetail existing,
            int? requestedRole)
        {
            var existingRole = existing.Role;
            var roleChanging = (existingRole ?? 0) != (requestedRole ?? 0);
            if (!roleChanging) return null;

            if (!callerIsAdmin)
            {
                if (IsAdminRole(db, existingRole) || IsAdminRole(db, requestedRole))
                {
                    return "Only an administrator can assign or change the Admin role.";
                }

                // Non-admins with User Management page still should not change roles at all
                return "Only an administrator can change user roles.";
            }

            if (IsAdminRole(db, existingRole)
                && !IsAdminRole(db, requestedRole)
                && IsActiveStatus(existing.Status))
            {
                var otherAdmins = CountActiveAdmins(db, tenantId, existing.User_UniqueID);
                if (otherAdmins <= 0)
                {
                    return "Cannot remove the last active Admin role for this tenant.";
                }
            }

            return null;
        }

        public static string? GetResetPasswordBlockReason(
            CimmpleDbContext db,
            bool callerIsAdmin,
            int? targetRoleId)
        {
            if (callerIsAdmin) return null;
            if (IsAdminRole(db, targetRoleId))
            {
                return "Only an administrator can reset an Admin account password.";
            }
            return null;
        }

        public static string? GetAdminRoleDefinitionBlockReason(
            CimmpleDbContext db,
            bool callerIsAdmin,
            int? roleId,
            string? newRoleName = null,
            string? newRoleTag = null)
        {
            if (!callerIsAdmin)
            {
                return "Only an administrator can manage roles and role permissions.";
            }

            // Admins: do not rename Admin role to a non-admin name (permission seed / guards rely on name).
            if (roleId.HasValue && IsAdminRole(db, roleId) && !string.IsNullOrWhiteSpace(newRoleName)
                && !IsAdminRoleName(newRoleName, newRoleTag ?? newRoleName))
            {
                return "Cannot rename the Admin role to a non-admin name. Create a new role instead.";
            }

            return null;
        }
    }
}
