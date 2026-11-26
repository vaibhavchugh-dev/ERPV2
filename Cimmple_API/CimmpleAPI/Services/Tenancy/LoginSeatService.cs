using CimmpleAPI.Data;
using CimmpleAPI.Data.Models;
using CimmpleAPI.Services.Auth;
using Microsoft.EntityFrameworkCore;

namespace CimmpleAPI.Services.Tenancy
{
    /// <summary>
    /// Per-tenant cap on employees who can sign in. A seat is an active, non-vendor,
    /// non-admin user with both a username and a password. A missing limit is 0,
    /// so no employee login can be added until a platform administrator allots seats.
    /// The administrator role does not use a seat.
    /// </summary>
    public static class LoginSeatService
    {
        public static async Task<LoginSeatUsage> GetUsageAsync(CimmpleDbContext db, int tenantId)
        {
            var limit = await db.Tenants.AsNoTracking()
                .Where(t => t.TenantId == tenantId)
                .Select(t => t.LoginSeatLimit)
                .FirstOrDefaultAsync();
            var used = await CountAsync(db, tenantId);
            return LoginSeatRules.Usage(limit, used);
        }

        public static Task<int> CountAsync(CimmpleDbContext db, int tenantId) =>
            OccupyingSeats(db).CountAsync(u => u.TenantID == tenantId);

        public static async Task<Dictionary<int, int>> CountByTenantAsync(CimmpleDbContext db)
        {
            var rows = await OccupyingSeats(db)
                .GroupBy(u => u.TenantID)
                .Select(g => new { TenantId = g.Key, Count = g.Count() })
                .ToListAsync();
            return rows.ToDictionary(x => x.TenantId, x => x.Count);
        }

        /// <summary>
        /// Locks this tenant's seats, rejects a new seat when the cap is full, then runs
        /// <paramref name="persist"/> inside that lock. Joins a transaction that is already open.
        /// </summary>
        public static async Task<LoginSeatDenial?> ExecuteIfAllowedAsync(
            CimmpleDbContext db,
            int tenantId,
            bool needsNewSeat,
            Func<Task> persist,
            int extraReserved = 0)
        {
            var ownsTransaction = db.Database.CurrentTransaction == null;
            var transaction = ownsTransaction ? await db.Database.BeginTransactionAsync() : null;
            try
            {
                await LockAsync(db, tenantId);
                if (needsNewSeat)
                {
                    var denial = await EvaluateAsync(db, tenantId, extraReserved);
                    if (denial != null)
                    {
                        if (transaction != null)
                            await transaction.RollbackAsync();
                        return denial;
                    }
                }

                await persist();
                if (transaction != null)
                    await transaction.CommitAsync();
                return null;
            }
            catch
            {
                if (transaction != null)
                {
                    try { await transaction.RollbackAsync(); } catch { /* already finished */ }
                }
                throw;
            }
            finally
            {
                if (transaction != null)
                    await transaction.DisposeAsync();
            }
        }

        /// <summary>Checks the cap inside the caller's transaction. Does not save.</summary>
        public static async Task<LoginSeatDenial?> DenyNewSeatAsync(
            CimmpleDbContext db, int tenantId, int extraReserved = 0)
        {
            if (db.Database.CurrentTransaction == null)
                throw new InvalidOperationException("A transaction is required to reserve a login seat.");

            await LockAsync(db, tenantId);
            return await EvaluateAsync(db, tenantId, extraReserved);
        }

        private static async Task<LoginSeatDenial?> EvaluateAsync(
            CimmpleDbContext db, int tenantId, int extraReserved)
        {
            var limit = await db.Tenants.AsNoTracking()
                .Where(t => t.TenantId == tenantId)
                .Select(t => t.LoginSeatLimit)
                .FirstOrDefaultAsync();
            var used = await CountAsync(db, tenantId);
            return LoginSeatRules.DenialForNewSeat(limit, used, extraReserved);
        }

        private static Task LockAsync(CimmpleDbContext db, int tenantId) =>
            db.Database.ExecuteSqlRawAsync(@"
DECLARE @r int;
EXEC @r = sp_getapplock @Resource = {0}, @LockMode = 'Exclusive', @LockOwner = 'Transaction', @LockTimeout = 15000;
IF @r < 0 THROW 51000, 'Login seats are busy. Please try again.', 1;",
                $"cimmple-login-seats-{tenantId}");

        public static async Task<bool> IsAdminRoleAsync(CimmpleDbContext db, int? roleId)
        {
            if (roleId == null || roleId <= 0) return false;
            var role = await db.UserRole.AsNoTracking()
                .Where(r => r.RoleID == roleId)
                .Select(r => new { r.RoleName, r.RoleTag })
                .FirstOrDefaultAsync();
            return role != null && ErpPermissionSeedService.IsAdminRoleName(role.RoleName, role.RoleTag);
        }

        private static IQueryable<UserDetail> OccupyingSeats(CimmpleDbContext db)
        {
            // Only an admin role is free. Matching the client contact email is not enough:
            // other employees often share that address and still use a seat.
            return db.UserDetails.AsNoTracking().Where(u =>
                (u.VendorId == null || u.VendorId == 0)
                && u.UserName != null && u.UserName != ""
                && u.Password != null && u.Password != ""
                && (u.Status == null || u.Status == ""
                    || u.Status.ToLower() == "active"
                    || u.Status.ToLower() == "a")
                && !db.UserRole.Any(r =>
                    u.Role != null
                    && r.RoleID == u.Role
                    && (
                        (r.RoleName != null && EF.Functions.Like(r.RoleName, "%admin%"))
                        || (r.RoleTag != null && EF.Functions.Like(r.RoleTag, "%admin%")))));
        }
    }

    public static class LoginSeatRules
    {
        public static bool IsActiveAccount(string? status)
        {
            if (string.IsNullOrWhiteSpace(status)) return true;
            return status.Equals("Active", StringComparison.OrdinalIgnoreCase)
                || status.Equals("A", StringComparison.OrdinalIgnoreCase);
        }

        public static bool Occupies(UserDetail user, bool isAdmin = false) =>
            Occupies(user.VendorId, user.UserName, user.Password, user.Status, isAdmin);

        public static bool Occupies(int? vendorId, string? userName, string? password, string? status, bool isAdmin = false)
        {
            if (isAdmin) return false;
            if (vendorId.HasValue && vendorId.Value > 0) return false;
            if (string.IsNullOrWhiteSpace(userName)) return false;
            if (string.IsNullOrEmpty(password)) return false;
            return IsActiveAccount(status);
        }

        public static LoginSeatUsage Usage(int? limit, int used)
        {
            var cap = limit ?? 0;
            return new LoginSeatUsage
            {
                LoginSeatLimit = cap,
                UsedSeats = used,
                AvailableSeats = Math.Max(0, cap - used),
                Configured = true
            };
        }

        /// <summary>
        /// Rejects when this save would take a new seat and other seats already fill the cap.
        /// <paramref name="extraReserved"/> counts unsaved seats in the same request (negative when a seat is being released).
        /// </summary>
        public static LoginSeatDenial? DenialForNewSeat(int? limit, int usedByOthers, int extraReserved = 0)
        {
            var cap = limit ?? 0;
            var used = usedByOthers + extraReserved;
            if (used < cap) return null;
            return new LoginSeatDenial
            {
                LoginSeatLimit = cap,
                UsedSeats = Math.Max(0, used),
                AvailableSeats = 0,
                Error = Message(cap, Math.Max(0, used))
            };
        }

        public static string Message(int limit, int used) =>
            limit <= 0
                ? "No login seats are allotted. Ask Cimmple to set login seats before enabling login."
                : $"Login seat limit reached ({used} of {limit} in use). Deactivate another login or ask Cimmple to increase the seat limit.";
    }

    public class LoginSeatUsage
    {
        public int? LoginSeatLimit { get; set; }
        public int UsedSeats { get; set; }
        public int AvailableSeats { get; set; }
        public bool Configured { get; set; }
    }

    public class LoginSeatDenial
    {
        public int LoginSeatLimit { get; set; }
        public int UsedSeats { get; set; }
        public int AvailableSeats { get; set; }
        public string Error { get; set; } = "";

        public object ToResponse() => new
        {
            error = Error,
            loginSeatLimit = LoginSeatLimit,
            usedSeats = UsedSeats,
            availableSeats = AvailableSeats
        };
    }
}
