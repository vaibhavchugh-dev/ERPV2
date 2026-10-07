using CimmpleAPI.Data;
using CimmpleAPI.Data.Models;

namespace CimmpleAPI.Services.Tenancy
{
    /// <summary>Default payment terms and AP approval limits. Callers must run AccountingGapSchemaService first.</summary>
    public static class AccountingDefaultsSeed
    {
        private static readonly (string Name, int Days, string Description)[] PaymentTerms =
        {
            ("Net 15", 15, "Payment due within 15 days"),
            ("Net 30", 30, "Payment due within 30 days"),
            ("Net 45", 45, "Payment due within 45 days"),
            ("Net 60", 60, "Payment due within 60 days")
        };

        private static readonly Dictionary<string, (decimal Limit, bool Dual)> ApprovalLimits =
            new(StringComparer.OrdinalIgnoreCase)
            {
                ["Staff"] = (500m, false),
                ["Supervisor"] = (2500m, false),
                ["Manager"] = (10000m, true),
                ["Director"] = (50000m, true),
                ["Admin"] = (100000m, true),
                ["Administrator"] = (100000m, true)
            };

        /// <summary>Adds the default terms only when the tenant has none.</summary>
        public static int EnsurePaymentTerms(CimmpleDbContext context, int tenantId)
        {
            if (context.PaymentTerms.Any(p => p.TenantId == tenantId))
                return 0;

            var now = DateTime.UtcNow;
            foreach (var (name, days, description) in PaymentTerms)
            {
                context.PaymentTerms.Add(new PaymentTerm
                {
                    TenantId = tenantId,
                    Name = name,
                    Days = days,
                    Description = description,
                    IsActive = true,
                    CreatedDate = now,
                    UpdatedDate = now
                });
            }

            context.SaveChanges();
            return PaymentTerms.Length;
        }

        /// <summary>Adds limits for roles whose names match the defaults, only when the tenant has none.</summary>
        public static int EnsureApprovalLimits(CimmpleDbContext context, int tenantId)
        {
            if (context.ApApprovalLimits.Any(a => a.TenantId == tenantId))
                return 0;

            var roles = context.UserRole
                .Where(r => r.TenantId == tenantId || r.TenantId == 0)
                .ToList();
            if (roles.Count == 0)
                return 0;

            var now = DateTime.UtcNow;
            var added = 0;
            foreach (var role in roles)
            {
                if (!ApprovalLimits.TryGetValue(role.RoleName ?? "", out var cfg))
                    continue;
                if (context.ApApprovalLimits.Any(a => a.TenantId == tenantId && a.RoleId == role.RoleID && a.IsActive))
                    continue;
                context.ApApprovalLimits.Add(new ApApprovalLimit
                {
                    TenantId = tenantId,
                    RoleId = role.RoleID,
                    LimitAmount = cfg.Limit,
                    RequiresDualApproval = cfg.Dual,
                    IsActive = true,
                    CreatedDate = now,
                    UpdatedDate = now
                });
                added++;
            }

            if (added > 0)
                context.SaveChanges();
            return added;
        }
    }
}
