using CimmpleAPI.Data;
using CimmpleAPI.Data.Models;
using CimmpleAPI.Services.Auth;
using Microsoft.EntityFrameworkCore;

namespace CimmpleAPI.Services.Tenancy
{
    public sealed class TenantSeedContext
    {
        public int TenantId { get; init; }
        public string CompanyName { get; init; } = "";
        public string? ContactEmail { get; init; }
        public string? Phone { get; init; }
        public string? Country { get; init; }
        public string? TimeZone { get; init; }
        public string? Currency { get; init; }
        public string? CurrencySymbol { get; init; }

        /// <summary>Stored as CreatedBy on seeded rows that require a user (NCR codes).</summary>
        public int CreatedByUserId { get; set; }
    }

    /// <summary>One block of default data. Must be safe to run again on a tenant that already has it.</summary>
    public interface ITenantSeeder
    {
        string Name { get; }

        /// <returns>Number of rows inserted.</returns>
        Task<int> ApplyAsync(CimmpleDbContext db, TenantSeedContext context);
    }

    public static class TenantSeeders
    {
        /// <summary>
        /// Bump when a seeder is added or its defaults change, so staff can see which tenants
        /// have not had the newer defaults applied yet.
        /// </summary>
        public const int CurrentVersion = 1;

        /// <summary>Rows the admin user depends on; provisioning runs these in one transaction.</summary>
        public static readonly ITenantSeeder[] Core =
        {
            new CompanyProfileSeeder(),
            new SystemSettingsSeeder(),
            new RolesSeeder(),
            new MainSiteSeeder()
        };

        public static readonly ITenantSeeder[] Defaults =
        {
            new RolePermissionsSeeder(),
            new ChartOfAccountsSeeder(),
            new CategoryTypesSeeder(),
            new NcrCodesSeeder(),
            new PaymentTermsSeeder(),
            new ApprovalLimitsSeeder()
        };

        public static IEnumerable<ITenantSeeder> All => Core.Concat(Defaults);
    }

    internal sealed class CompanyProfileSeeder : ITenantSeeder
    {
        public string Name => "Company profile";

        public async Task<int> ApplyAsync(CimmpleDbContext db, TenantSeedContext context)
        {
            if (await db.EntityMaster.AnyAsync(e => e.Tenantid == context.TenantId))
                return 0;

            db.EntityMaster.Add(TenantDefaults.CreateCompanyProfile(
                context.TenantId,
                context.CompanyName,
                context.ContactEmail,
                phone: context.Phone,
                country: context.Country,
                timeZone: context.TimeZone));
            await db.SaveChangesAsync();
            return 1;
        }
    }

    internal sealed class SystemSettingsSeeder : ITenantSeeder
    {
        public string Name => "System settings";

        public async Task<int> ApplyAsync(CimmpleDbContext db, TenantSeedContext context)
        {
            await SystemSettingsSchemaService.EnsureTablesAsync(db);
            if (await db.SystemSettings.AnyAsync(s => s.TenantId == context.TenantId))
                return 0;

            db.SystemSettings.Add(TenantDefaults.CreateSystemSettings(
                context.TenantId, context.TimeZone, context.Currency, context.CurrencySymbol));
            await db.SaveChangesAsync();
            return 1;
        }
    }

    internal sealed class RolesSeeder : ITenantSeeder
    {
        public string Name => "Roles";

        public async Task<int> ApplyAsync(CimmpleDbContext db, TenantSeedContext context)
        {
            var existing = (await db.UserRole
                    .Where(r => r.TenantId == context.TenantId && r.RoleName != null)
                    .Select(r => r.RoleName!)
                    .ToListAsync())
                .ToHashSet(StringComparer.OrdinalIgnoreCase);

            var added = 0;
            foreach (var (name, tag, orderNo) in TenantDefaults.Roles)
            {
                if (existing.Contains(name)) continue;
                db.UserRole.Add(new UserRole
                {
                    RoleName = name,
                    RoleTag = tag,
                    OrderNo = orderNo,
                    ResetPwd = "N",
                    TenantId = context.TenantId
                });
                added++;
            }

            if (added > 0) await db.SaveChangesAsync();
            return added;
        }
    }

    internal sealed class MainSiteSeeder : ITenantSeeder
    {
        public string Name => "Main site";

        public async Task<int> ApplyAsync(CimmpleDbContext db, TenantSeedContext context)
        {
            if (await db.Locations.AnyAsync(l => l.TenantId == context.TenantId))
                return 0;

            var company = await db.EntityMaster.AsNoTracking()
                .Where(e => e.Tenantid == context.TenantId)
                .OrderBy(e => e.entityid)
                .FirstOrDefaultAsync();
            db.Locations.Add(TenantDefaults.CreateMainSite(context.TenantId, company));
            await db.SaveChangesAsync();
            return 1;
        }
    }

    internal sealed class RolePermissionsSeeder : ITenantSeeder
    {
        public string Name => "Role permissions";

        public async Task<int> ApplyAsync(CimmpleDbContext db, TenantSeedContext context)
        {
            await ErpPermissionSeedService.EnsureMissingPermissionsAsync(db);
            var result = await ErpPermissionSeedService.AssignDefaultRolePermissionsAsync(
                db, context.TenantId, onlyRolesWithoutAssignments: true);
            return result.Assignments;
        }
    }

    internal sealed class ChartOfAccountsSeeder : ITenantSeeder
    {
        public string Name => "Chart of accounts";

        public Task<int> ApplyAsync(CimmpleDbContext db, TenantSeedContext context) =>
            Task.FromResult(ManufacturingChartOfAccountsSeed.Apply(db, context.TenantId).Inserted);
    }

    internal sealed class CategoryTypesSeeder : ITenantSeeder
    {
        public string Name => "Category types";

        public Task<int> ApplyAsync(CimmpleDbContext db, TenantSeedContext context)
        {
            var (types, values) = CategoryDefaults.EnsureForTenant(db, context.TenantId);
            return Task.FromResult(types + values);
        }
    }

    internal sealed class NcrCodesSeeder : ITenantSeeder
    {
        public string Name => "NCR codes";

        public async Task<int> ApplyAsync(CimmpleDbContext db, TenantSeedContext context) =>
            (await NcrCodeDefaults.EnsureForTenantAsync(db, context.TenantId, context.CreatedByUserId)).Inserted;
    }

    internal sealed class PaymentTermsSeeder : ITenantSeeder
    {
        public string Name => "Payment terms";

        public async Task<int> ApplyAsync(CimmpleDbContext db, TenantSeedContext context)
        {
            await AccountingGapSchemaService.EnsureAsync(db);
            return AccountingDefaultsSeed.EnsurePaymentTerms(db, context.TenantId);
        }
    }

    internal sealed class ApprovalLimitsSeeder : ITenantSeeder
    {
        public string Name => "AP approval limits";

        public async Task<int> ApplyAsync(CimmpleDbContext db, TenantSeedContext context)
        {
            await AccountingGapSchemaService.EnsureAsync(db);
            return AccountingDefaultsSeed.EnsureApprovalLimits(db, context.TenantId);
        }
    }
}
