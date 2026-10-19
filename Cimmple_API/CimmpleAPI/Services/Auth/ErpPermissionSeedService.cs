using CimmpleAPI.Data;
using CimmpleAPI.Data.Models;
using CimmpleAPI.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace CimmpleAPI.Services.Auth
{
    /// <summary>
    /// Keeps PermissionMaster in sync with the ERP module catalog and grants new permissions to appropriate roles.
    /// </summary>
    public static class ErpPermissionSeedService
    {
        public const string ScheduledReportEmailsUrl = "/reports/schedules";
        public const string BusinessReportsUrl = "/reports";
        public const string FinancialReportsUrl = "/accounts/reports";

        public static IReadOnlyList<PermissionMaster> BuildPermissionCatalog()
        {
            var pages = new List<PermissionMaster>
            {
                new PermissionMaster { PermissionName = "Dashboard", DisplayPermissionName = "Dashboard", LevelInfo = 1, OrderNo = 1, Url = "/home", ReportGroup = "Dashboard", ReportDescription = "Access main dashboard" },
                new PermissionMaster { PermissionName = "Customer Quotations", DisplayPermissionName = "Customer Quotations", LevelInfo = 1, OrderNo = 10, Url = "/quotations/customer", ReportGroup = "Sales & Orders", ReportDescription = "View and manage customer quotations" },
                new PermissionMaster { PermissionName = "Customer Orders", DisplayPermissionName = "Customer Orders", LevelInfo = 1, OrderNo = 11, Url = "/orders/customer", ReportGroup = "Sales & Orders", ReportDescription = "View and manage customer orders" },
                new PermissionMaster { PermissionName = "Customer Shipments", DisplayPermissionName = "Customer Shipments", LevelInfo = 1, OrderNo = 12, Url = "/orders/customer-shipments", ReportGroup = "Sales & Orders", ReportDescription = "View and manage customer shipments" },
                new PermissionMaster { PermissionName = "Customer Invoices", DisplayPermissionName = "Customer Invoices", LevelInfo = 1, OrderNo = 13, Url = "/orders/customer-invoices", ReportGroup = "Sales & Orders", ReportDescription = "View and manage customer invoices" },
                new PermissionMaster { PermissionName = "Job Orders", DisplayPermissionName = "Job Orders", LevelInfo = 1, OrderNo = 14, Url = "/job-orders", ReportGroup = "Sales & Orders", ReportDescription = "View and manage job orders" },
                new PermissionMaster { PermissionName = "Vendor Quotations", DisplayPermissionName = "Vendor Quotations", LevelInfo = 1, OrderNo = 20, Url = "/quotations/vendor", ReportGroup = "Purchasing", ReportDescription = "View and manage vendor quotations" },
                new PermissionMaster { PermissionName = "Vendor Orders", DisplayPermissionName = "Vendor Orders", LevelInfo = 1, OrderNo = 21, Url = "/purchasing/vendor-orders", ReportGroup = "Purchasing", ReportDescription = "View and manage vendor orders" },
                new PermissionMaster { PermissionName = "Vendor Receiving", DisplayPermissionName = "Vendor Receiving", LevelInfo = 1, OrderNo = 22, Url = "/purchasing/vendor-receiving", ReportGroup = "Purchasing", ReportDescription = "Manage vendor receiving" },
                new PermissionMaster { PermissionName = "Vendor Invoices", DisplayPermissionName = "Vendor Invoices", LevelInfo = 1, OrderNo = 23, Url = "/purchasing/vendor-invoices", ReportGroup = "Purchasing", ReportDescription = "View and manage vendor invoices" },
                new PermissionMaster { PermissionName = "Inventory", DisplayPermissionName = "Inventory", LevelInfo = 1, OrderNo = 24, Url = "/inventory", ReportGroup = "Purchasing", ReportDescription = "View and manage inventory" },
                new PermissionMaster { PermissionName = "Non Conformance Reports", DisplayPermissionName = "Non Conformance Reports", LevelInfo = 1, OrderNo = 30, Url = "/quality", ReportGroup = "Quality", ReportDescription = "View and manage non-conformance reports" },
                new PermissionMaster { PermissionName = "NCR Code Master", DisplayPermissionName = "NCR Code Master", LevelInfo = 1, OrderNo = 31, Url = "/quality/ncr-codes", ReportGroup = "Quality", ReportDescription = "Manage NCR code master data" },
                new PermissionMaster { PermissionName = "Business Intelligence", DisplayPermissionName = "Reports", LevelInfo = 1, OrderNo = 40, Url = BusinessReportsUrl, ReportGroup = "Reports", ReportDescription = "Access operational and business reports" },
                new PermissionMaster { PermissionName = "Scheduled Report Emails", DisplayPermissionName = "Scheduled Report Emails", LevelInfo = 1, OrderNo = 41, Url = ScheduledReportEmailsUrl, ReportGroup = "Reports", ReportDescription = "Manage scheduled report email delivery" },
                new PermissionMaster { PermissionName = "Documents", DisplayPermissionName = "Documents", LevelInfo = 1, OrderNo = 45, Url = "/documents", ReportGroup = "Documents", ReportDescription = "Manage documents" },
                new PermissionMaster { PermissionName = "Payment Dashboard", DisplayPermissionName = "Payment Dashboard", LevelInfo = 1, OrderNo = 50, Url = "/accounts/dashboard", ReportGroup = "Accounting", ReportDescription = "View payment dashboard" },
                new PermissionMaster { PermissionName = "Accounts Payable", DisplayPermissionName = "Accounts Payable (AP)", LevelInfo = 1, OrderNo = 51, Url = "/accounts/payable", ReportGroup = "Accounting", ReportDescription = "Manage accounts payable" },
                new PermissionMaster { PermissionName = "Accounts Receivable", DisplayPermissionName = "Accounts Receivable (AR)", LevelInfo = 1, OrderNo = 52, Url = "/accounts/receivable", ReportGroup = "Accounting", ReportDescription = "Manage accounts receivable" },
                new PermissionMaster { PermissionName = "Bank Reconciliation", DisplayPermissionName = "Bank Reconciliation", LevelInfo = 1, OrderNo = 53, Url = "/accounts/banks", ReportGroup = "Accounting", ReportDescription = "Perform bank reconciliation" },
                new PermissionMaster { PermissionName = "Deposits & Withdrawals", DisplayPermissionName = "Deposits & Withdrawals", LevelInfo = 1, OrderNo = 53, Url = "/accounts/bank-cash", ReportGroup = "Accounting", ReportDescription = "Record bank deposits and withdrawals not tied to invoices" },
                new PermissionMaster { PermissionName = "Financial Reports", DisplayPermissionName = "Financial Reports", LevelInfo = 1, OrderNo = 54, Url = "/accounts/reports", ReportGroup = "Accounting", ReportDescription = "View financial reports" },
                new PermissionMaster { PermissionName = "Accounting Setup", DisplayPermissionName = "Accounting Setup", LevelInfo = 1, OrderNo = 55, Url = "/accounts/setup", ReportGroup = "Accounting", ReportDescription = "Configure accounting settings" },
                new PermissionMaster { PermissionName = "Journal Entries", DisplayPermissionName = "Journal Entries", LevelInfo = 1, OrderNo = 56, Url = "/accounts/journal-entries", ReportGroup = "Accounting", ReportDescription = "Manage journal entries" },
                new PermissionMaster { PermissionName = "Payroll Journals", DisplayPermissionName = "Payroll Journals", LevelInfo = 1, OrderNo = 56, Url = "/accounts/payroll", ReportGroup = "Accounting", ReportDescription = "View payroll journals posted to the GL" },
                new PermissionMaster { PermissionName = "GL Account Activity", DisplayPermissionName = "GL Account Activity", LevelInfo = 1, OrderNo = 57, Url = "/accounts/general-ledger", ReportGroup = "Accounting", ReportDescription = "View general ledger activity" },
                new PermissionMaster { PermissionName = "Period Close & Audit", DisplayPermissionName = "Period Close & Audit", LevelInfo = 1, OrderNo = 58, Url = "/accounts/periods", ReportGroup = "Accounting", ReportDescription = "Period close and audit" },
                new PermissionMaster { PermissionName = "Bank Master", DisplayPermissionName = "Bank Master", LevelInfo = 1, OrderNo = 59, Url = "/masters/bank", ReportGroup = "Accounting", ReportDescription = "Manage bank master data" },
                new PermissionMaster { PermissionName = "Credit Card Master", DisplayPermissionName = "Credit Card Master", LevelInfo = 1, OrderNo = 60, Url = "/masters/creditcard", ReportGroup = "Accounting", ReportDescription = "Manage credit card master data" },
                new PermissionMaster { PermissionName = "Chart of Accounts Master", DisplayPermissionName = "Chart of Accounts Master", LevelInfo = 1, OrderNo = 61, Url = "/masters/chartofaccounts", ReportGroup = "Accounting", ReportDescription = "Manage chart of accounts" },
                new PermissionMaster { PermissionName = "Customer Master", DisplayPermissionName = "Customer Master", LevelInfo = 1, OrderNo = 70, Url = "/masters/customer", ReportGroup = "Administration", ReportDescription = "Manage customer master data" },
                new PermissionMaster { PermissionName = "Vendor Master", DisplayPermissionName = "Vendor Master", LevelInfo = 1, OrderNo = 71, Url = "/masters/vendor", ReportGroup = "Administration", ReportDescription = "Manage vendor master data" },
                new PermissionMaster { PermissionName = "Workstation Master", DisplayPermissionName = "Workstation Master", LevelInfo = 1, OrderNo = 72, Url = "/masters/workstation", ReportGroup = "Administration", ReportDescription = "Manage workstation master data" },
                new PermissionMaster { PermissionName = "Employee Master", DisplayPermissionName = "Employee Master", LevelInfo = 1, OrderNo = 73, Url = "/masters/employee", ReportGroup = "Administration", ReportDescription = "Manage employee master data" },
                new PermissionMaster { PermissionName = "Location Master", DisplayPermissionName = "Location Master", LevelInfo = 1, OrderNo = 74, Url = "/masters/location", ReportGroup = "Administration", ReportDescription = "Manage location master data" },
                new PermissionMaster { PermissionName = "Process Master", DisplayPermissionName = "Process Master", LevelInfo = 1, OrderNo = 75, Url = "/masters/process", ReportGroup = "Administration", ReportDescription = "Manage process master data" },
                new PermissionMaster { PermissionName = "Job Template Master", DisplayPermissionName = "Job Template Master", LevelInfo = 1, OrderNo = 76, Url = "/masters/jobtemplate", ReportGroup = "Administration", ReportDescription = "Manage job templates" },
                new PermissionMaster { PermissionName = "Category Master", DisplayPermissionName = "Category Master", LevelInfo = 1, OrderNo = 77, Url = "/masters/category", ReportGroup = "Administration", ReportDescription = "Manage categories" },
                new PermissionMaster { PermissionName = "Price Breakdown Master", DisplayPermissionName = "Price Breakdown Master", LevelInfo = 1, OrderNo = 78, Url = "/masters/pricebreakdown", ReportGroup = "Administration", ReportDescription = "Manage price breakdown master data" },
                new PermissionMaster { PermissionName = "Product Master", DisplayPermissionName = "Product Master", LevelInfo = 1, OrderNo = 79, Url = "/masters/product", ReportGroup = "Administration", ReportDescription = "Manage product master data" },
                new PermissionMaster { PermissionName = "Raw Material Master", DisplayPermissionName = "Raw Material Master", LevelInfo = 1, OrderNo = 80, Url = "/masters/raw-material", ReportGroup = "Administration", ReportDescription = "Manage raw materials" },
                new PermissionMaster { PermissionName = "Attendance Register", DisplayPermissionName = "Attendance Register", LevelInfo = 1, OrderNo = 89, Url = "/attendance", ReportGroup = "Administration", ReportDescription = "View Time Clock attendance by day" },
                // Admin-only: never assigned to non-admin roles (see Assign* / AssignPermissionsToRole).
                new PermissionMaster { PermissionName = "User Management", DisplayPermissionName = "User Management (Admin only)", LevelInfo = 1, OrderNo = 90, Url = ErpPermissionActions.UserManagementUrl, ReportGroup = "Administration", ReportDescription = "Administrator-only: manage users, roles, and permissions" },
                new PermissionMaster { PermissionName = "System Settings", DisplayPermissionName = "System Settings", LevelInfo = 1, OrderNo = 91, Url = "/settings", ReportGroup = "Administration", ReportDescription = "Configure system settings" },
            };

            var catalog = new List<PermissionMaster>();
            foreach (var page in pages)
            {
                catalog.Add(page);
                catalog.AddRange(ErpPermissionActions.BuildActionPermissions(page));
            }
            return catalog;
        }

        /// <summary>Insert any catalog permissions missing from PermissionMaster (safe on every startup).</summary>
        public static async Task<int> EnsureMissingPermissionsAsync(CimmpleDbContext context, ILogger? logger = null)
        {
            try
            {
                if (!await context.Database.CanConnectAsync())
                {
                    return 0;
                }

                var catalog = BuildPermissionCatalog();
                var existingUrls = await context.PermissionMaster
                    .Where(p => p.Url != null)
                    .Select(p => p.Url!)
                    .ToListAsync();

                var missing = catalog
                    .Where(p => p.Url != null && !existingUrls.Contains(p.Url))
                    .ToList();

                if (missing.Count > 0)
                {
                    await context.PermissionMaster.AddRangeAsync(missing);
                    await context.SaveChangesAsync();
                    logger?.LogInformation("ERP permissions: added {Count} missing definition(s)", missing.Count);

                    var assignments = await AssignNewPermissionsToRolesAsync(context, missing);
                    if (assignments > 0)
                    {
                        logger?.LogInformation("ERP permissions: added {Count} role assignment(s) for new permission(s)", assignments);
                    }
                }

                var inherited = await InheritLevel2ActionsForExistingPageGrantsAsync(context);
                if (inherited > 0)
                {
                    logger?.LogInformation("ERP permissions: inherited {Count} Level-2 action(s) onto roles with page access", inherited);
                }

                var stripped = await StripUserManagementFromNonAdminRolesAsync(context);
                if (stripped > 0)
                {
                    logger?.LogInformation("ERP permissions: removed User Management from {Count} non-admin role assignment(s)", stripped);
                }

                var mirrored = await EnsureScheduledReportEmailsRoleMirroringAsync(context);
                if (mirrored > 0)
                {
                    logger?.LogInformation("ERP permissions: mirrored Scheduled Report Emails onto {Count} role(s) with Reports access", mirrored);
                }

                var removedObsolete = await RemoveObsoletePermissionDefinitionsAsync(context);
                if (removedObsolete > 0)
                {
                    logger?.LogInformation("ERP permissions: removed {Count} obsolete permission definition(s)", removedObsolete);
                }

                return missing.Count;
            }
            catch (Exception ex) when (SystemSettingsSchemaService.IsMissingTableException(ex))
            {
                return 0;
            }
        }

        /// <summary>
        /// Grant newly added permissions to admin roles (all new perms) and mirror Scheduled Report Emails onto roles that already have Reports.
        /// </summary>
        public static async Task<int> AssignNewPermissionsToRolesAsync(
            CimmpleDbContext context,
            IReadOnlyList<PermissionMaster> newlyAddedPermissions)
        {
            if (newlyAddedPermissions == null || newlyAddedPermissions.Count == 0)
            {
                return 0;
            }

            var newPermissionIds = newlyAddedPermissions
                .Where(p => p.PermissionId > 0)
                .Select(p => p.PermissionId)
                .Distinct()
                .ToList();

            if (newPermissionIds.Count == 0)
            {
                return 0;
            }

            var tenantIds = await context.UserRole.AsNoTracking()
                .Select(r => r.TenantId)
                .Distinct()
                .ToListAsync();

            if (tenantIds.Count == 0)
            {
                return 0;
            }

            var roles = await context.UserRole.AsNoTracking().ToListAsync();
            var existingAssignments = await context.PermissionRole.AsNoTracking()
                .Select(pr => new { pr.RoleId, pr.TenantId, pr.PermissionId })
                .ToListAsync();

            var existingSet = existingAssignments
                .Select(a => (a.RoleId, a.TenantId, a.PermissionId))
                .ToHashSet();

            var schedulesPermission = newlyAddedPermissions.FirstOrDefault(p =>
                string.Equals(p.Url, ScheduledReportEmailsUrl, StringComparison.OrdinalIgnoreCase));
            int? schedulesPermissionId = schedulesPermission?.PermissionId;

            var roleIdsWithReports = new HashSet<(int RoleId, int TenantId)>();
            if (schedulesPermissionId.HasValue)
            {
                var reportPermissionIds = await context.PermissionMaster.AsNoTracking()
                    .Where(p => p.Url == BusinessReportsUrl || p.Url == FinancialReportsUrl)
                    .Select(p => p.PermissionId)
                    .ToListAsync();

                foreach (var a in existingAssignments.Where(a => reportPermissionIds.Contains(a.PermissionId)))
                {
                    roleIdsWithReports.Add((a.RoleId, a.TenantId));
                }
            }

            // Map new L2 actions → parent page Url for inheritance onto roles that already have the page.
            var newPermById = newlyAddedPermissions
                .Where(p => p.PermissionId > 0)
                .ToDictionary(p => p.PermissionId);
            var allPages = await context.PermissionMaster.AsNoTracking()
                .Where(p => p.LevelInfo == 1 && p.Url != null)
                .Select(p => new { p.PermissionId, p.Url })
                .ToListAsync();
            var pageIdByUrl = allPages
                .GroupBy(p => ErpPermissionActions.NormalizePageUrl(p.Url))
                .ToDictionary(g => g.Key, g => g.First().PermissionId, StringComparer.OrdinalIgnoreCase);

            var toAdd = new List<PermissionRole>();

            foreach (var tenantId in tenantIds)
            {
                var tenantRoles = roles.Where(r => r.TenantId == tenantId).ToList();
                foreach (var role in tenantRoles)
                {
                    if (IsAdminRoleName(role.RoleName, role.RoleTag))
                    {
                        foreach (var permissionId in newPermissionIds)
                        {
                            if (existingSet.Contains((role.RoleID, tenantId, permissionId)))
                            {
                                continue;
                            }

                            toAdd.Add(new PermissionRole
                            {
                                RoleId = role.RoleID,
                                TenantId = tenantId,
                                PermissionId = permissionId
                            });
                            existingSet.Add((role.RoleID, tenantId, permissionId));
                        }

                        continue;
                    }

                    // Non-admin: never auto-grant User Management; inherit new L2 when page already granted.
                    foreach (var permissionId in newPermissionIds)
                    {
                        if (!newPermById.TryGetValue(permissionId, out var perm))
                            continue;
                        if (ErpPermissionActions.IsAdminOnlyPage(perm.Url))
                            continue;
                        if (!ErpPermissionActions.IsActionUrl(perm.Url))
                            continue;
                        if (existingSet.Contains((role.RoleID, tenantId, permissionId)))
                            continue;

                        var pageUrl = ErpPermissionActions.NormalizePageUrl(perm.Url);
                        if (!pageIdByUrl.TryGetValue(pageUrl, out var pagePermId))
                            continue;
                        if (!existingSet.Contains((role.RoleID, tenantId, pagePermId)))
                            continue;

                        toAdd.Add(new PermissionRole
                        {
                            RoleId = role.RoleID,
                            TenantId = tenantId,
                            PermissionId = permissionId
                        });
                        existingSet.Add((role.RoleID, tenantId, permissionId));
                    }

                    if (schedulesPermissionId.HasValue
                        && roleIdsWithReports.Contains((role.RoleID, tenantId))
                        && !existingSet.Contains((role.RoleID, tenantId, schedulesPermissionId.Value)))
                    {
                        toAdd.Add(new PermissionRole
                        {
                            RoleId = role.RoleID,
                            TenantId = tenantId,
                            PermissionId = schedulesPermissionId.Value
                        });
                        existingSet.Add((role.RoleID, tenantId, schedulesPermissionId.Value));
                    }
                }
            }

            if (toAdd.Count == 0)
            {
                return 0;
            }

            await context.PermissionRole.AddRangeAsync(toAdd);
            await context.SaveChangesAsync();
            return toAdd.Count;
        }

        /// <summary>Roles with Reports (/reports) also receive Scheduled Report Emails when that permission exists.</summary>
        public static async Task<int> EnsureScheduledReportEmailsRoleMirroringAsync(CimmpleDbContext context)
        {
            var schedules = await context.PermissionMaster.AsNoTracking()
                .FirstOrDefaultAsync(p => p.Url == ScheduledReportEmailsUrl);
            var reports = await context.PermissionMaster.AsNoTracking()
                .FirstOrDefaultAsync(p => p.Url == BusinessReportsUrl);
            var financialReports = await context.PermissionMaster.AsNoTracking()
                .FirstOrDefaultAsync(p => p.Url == FinancialReportsUrl);

            if (schedules == null)
            {
                return 0;
            }

            var assignments = await context.PermissionRole.AsNoTracking()
                .Select(pr => new { pr.RoleId, pr.TenantId, pr.PermissionId })
                .ToListAsync();

            var withReports = new HashSet<(int RoleId, int TenantId)>();
            if (reports != null)
            {
                foreach (var a in assignments.Where(a => a.PermissionId == reports.PermissionId))
                {
                    withReports.Add((a.RoleId, a.TenantId));
                }
            }

            if (financialReports != null)
            {
                foreach (var a in assignments.Where(a => a.PermissionId == financialReports.PermissionId))
                {
                    withReports.Add((a.RoleId, a.TenantId));
                }
            }

            if (withReports.Count == 0)
            {
                return 0;
            }

            var withSchedules = assignments
                .Where(a => a.PermissionId == schedules.PermissionId)
                .Select(a => (a.RoleId, a.TenantId))
                .ToHashSet();

            var toAdd = new List<PermissionRole>();
            foreach (var key in withReports)
            {
                if (withSchedules.Contains(key))
                {
                    continue;
                }

                toAdd.Add(new PermissionRole
                {
                    RoleId = key.RoleId,
                    TenantId = key.TenantId,
                    PermissionId = schedules.PermissionId
                });
            }

            if (toAdd.Count == 0)
            {
                return 0;
            }

            await context.PermissionRole.AddRangeAsync(toAdd);
            await context.SaveChangesAsync();
            return toAdd.Count;
        }

        /// <summary>
        /// Default assignments for one tenant: admin roles get every permission; other roles get Dashboard only.
        /// With <paramref name="onlyRolesWithoutAssignments"/> roles that already have permissions are left alone;
        /// otherwise every role's assignments in the tenant are replaced.
        /// </summary>
        public static async Task<(int AdminRoles, int NonAdminRoles, int Assignments)> AssignDefaultRolePermissionsAsync(
            CimmpleDbContext context, int tenantId, bool onlyRolesWithoutAssignments)
        {
            var allPermissions = await context.PermissionMaster.AsNoTracking().ToListAsync();
            if (allPermissions.Count == 0)
                return (0, 0, 0);

            var dashboard = allPermissions.FirstOrDefault(p =>
                string.Equals(p.Url, "/home", StringComparison.OrdinalIgnoreCase)
                || string.Equals(p.PermissionName, "Dashboard", StringComparison.OrdinalIgnoreCase));

            var roles = await context.UserRole.AsNoTracking()
                .Where(r => r.TenantId == tenantId)
                .ToListAsync();
            if (roles.Count == 0)
                return (0, 0, 0);

            var roleIds = roles.Select(r => r.RoleID).ToList();
            var existing = await context.PermissionRole
                .Where(pr => pr.TenantId == tenantId && roleIds.Contains(pr.RoleId))
                .ToListAsync();

            if (onlyRolesWithoutAssignments)
            {
                var assignedRoleIds = existing.Select(pr => pr.RoleId).ToHashSet();
                roles = roles.Where(r => !assignedRoleIds.Contains(r.RoleID)).ToList();
            }
            else if (existing.Count > 0)
            {
                context.PermissionRole.RemoveRange(existing);
                await context.SaveChangesAsync();
            }

            var toAdd = new List<PermissionRole>();
            var adminRoles = 0;
            var nonAdminRoles = 0;

            foreach (var role in roles)
            {
                if (IsAdminRoleName(role.RoleName, role.RoleTag))
                {
                    adminRoles++;
                    toAdd.AddRange(allPermissions.Select(perm => new PermissionRole
                    {
                        RoleId = role.RoleID,
                        TenantId = tenantId,
                        PermissionId = perm.PermissionId
                    }));
                }
                else if (dashboard != null)
                {
                    nonAdminRoles++;
                    // Dashboard page only (no User Management, no Level-2 until pages are granted).
                    toAdd.Add(new PermissionRole
                    {
                        RoleId = role.RoleID,
                        TenantId = tenantId,
                        PermissionId = dashboard.PermissionId
                    });
                }
            }

            if (toAdd.Count > 0)
            {
                await context.PermissionRole.AddRangeAsync(toAdd);
                await context.SaveChangesAsync();
            }

            return (adminRoles, nonAdminRoles, toAdd.Count);
        }

        /// <summary>
        /// When a role already has a Level-1 page but is missing that page's Level-2 actions,
        /// grant all Level-2 actions (one-time inheritance so existing roles keep full page access).
        /// </summary>
        public static async Task<int> InheritLevel2ActionsForExistingPageGrantsAsync(CimmpleDbContext context)
        {
            var allPerms = await context.PermissionMaster.AsNoTracking().ToListAsync();
            var pagePerms = allPerms
                .Where(p => p.LevelInfo == 1 && !string.IsNullOrEmpty(p.Url) && !ErpPermissionActions.IsActionUrl(p.Url))
                .ToList();
            var actionsByPage = allPerms
                .Where(p => p.LevelInfo == 2 && ErpPermissionActions.IsActionUrl(p.Url))
                .GroupBy(p => ErpPermissionActions.NormalizePageUrl(p.Url))
                .ToDictionary(g => g.Key, g => g.ToList(), StringComparer.OrdinalIgnoreCase);

            if (actionsByPage.Count == 0) return 0;

            var assignments = await context.PermissionRole.AsNoTracking()
                .Select(pr => new { pr.RoleId, pr.TenantId, pr.PermissionId })
                .ToListAsync();
            var existingSet = assignments
                .Select(a => (a.RoleId, a.TenantId, a.PermissionId))
                .ToHashSet();

            var roles = await context.UserRole.AsNoTracking().ToListAsync();
            var toAdd = new List<PermissionRole>();

            foreach (var a in assignments)
            {
                var page = pagePerms.FirstOrDefault(p => p.PermissionId == a.PermissionId);
                if (page?.Url == null) continue;
                if (ErpPermissionActions.IsAdminOnlyPage(page.Url)) continue;

                var pageUrl = ErpPermissionActions.NormalizePageUrl(page.Url);
                if (!actionsByPage.TryGetValue(pageUrl, out var actions)) continue;

                var role = roles.FirstOrDefault(r => r.RoleID == a.RoleId);
                if (role != null && IsAdminRoleName(role.RoleName, role.RoleTag))
                    continue; // admins already get everything via AssignNewPermissions

                // If this role already has any Level-2 action for the page, do not fill gaps —
                // an admin intentionally configured (or removed) actions.
                var hasAnyLevel2 = actions.Any(action =>
                    existingSet.Contains((a.RoleId, a.TenantId, action.PermissionId)));
                if (hasAnyLevel2)
                    continue;

                foreach (var action in actions)
                {
                    toAdd.Add(new PermissionRole
                    {
                        RoleId = a.RoleId,
                        TenantId = a.TenantId,
                        PermissionId = action.PermissionId
                    });
                    existingSet.Add((a.RoleId, a.TenantId, action.PermissionId));
                }
            }

            if (toAdd.Count == 0) return 0;
            await context.PermissionRole.AddRangeAsync(toAdd);
            await context.SaveChangesAsync();
            return toAdd.Count;
        }

        /// <summary>
        /// Drop Level-2 definitions that are no longer in the catalog (e.g. Job Orders Add).
        /// </summary>
        public static async Task<int> RemoveObsoletePermissionDefinitionsAsync(CimmpleDbContext context)
        {
            var catalogUrls = new HashSet<string>(
                BuildPermissionCatalog()
                    .Where(p => !string.IsNullOrEmpty(p.Url))
                    .Select(p => ErpPermissionActions.NormalizePermissionUrl(p.Url)),
                StringComparer.OrdinalIgnoreCase);

            var obsolete = await context.PermissionMaster
                .Where(p => p.LevelInfo == 2 && p.Url != null && p.Url.Contains("#"))
                .ToListAsync();

            var toRemove = obsolete
                .Where(p => !catalogUrls.Contains(ErpPermissionActions.NormalizePermissionUrl(p.Url)))
                .ToList();
            if (toRemove.Count == 0) return 0;

            var ids = toRemove.Select(p => p.PermissionId).ToHashSet();
            var roleLinks = await context.PermissionRole
                .Where(pr => ids.Contains(pr.PermissionId))
                .ToListAsync();
            if (roleLinks.Count > 0)
                context.PermissionRole.RemoveRange(roleLinks);
            context.PermissionMaster.RemoveRange(toRemove);
            await context.SaveChangesAsync();
            return toRemove.Count;
        }

        public static async Task<int> StripUserManagementFromNonAdminRolesAsync(CimmpleDbContext context)
        {
            var um = await context.PermissionMaster.AsNoTracking()
                .FirstOrDefaultAsync(p => p.Url == ErpPermissionActions.UserManagementUrl);
            if (um == null) return 0;

            var roles = await context.UserRole.AsNoTracking().ToListAsync();
            var nonAdminRoleIds = roles
                .Where(r => !IsAdminRoleName(r.RoleName, r.RoleTag))
                .Select(r => r.RoleID)
                .ToHashSet();
            if (nonAdminRoleIds.Count == 0) return 0;

            var bad = await context.PermissionRole
                .Where(pr => pr.PermissionId == um.PermissionId && nonAdminRoleIds.Contains(pr.RoleId))
                .ToListAsync();
            if (bad.Count == 0) return 0;

            context.PermissionRole.RemoveRange(bad);
            await context.SaveChangesAsync();
            return bad.Count;
        }

        public static bool IsAdminRoleName(string? roleName, string? roleTag)
        {
            static bool Match(string? value) =>
                !string.IsNullOrEmpty(value)
                && (value.Contains("admin", StringComparison.OrdinalIgnoreCase)
                    || value.Equals("Administrator", StringComparison.OrdinalIgnoreCase)
                    || value.Equals("ADMIN", StringComparison.OrdinalIgnoreCase));

            return Match(roleName) || Match(roleTag);
        }
    }
}
