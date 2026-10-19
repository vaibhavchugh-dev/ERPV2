using System.Security.Claims;
using CimmpleAPI.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.EntityFrameworkCore;

namespace CimmpleAPI.Services.Auth
{
    public sealed class ErpPermissionAuthorizationFilter : IAsyncAuthorizationFilter
    {
        private const string PermissionCacheKey = "__erpPermissionUrls";

        public async Task OnAuthorizationAsync(AuthorizationFilterContext context)
        {
            if (context.ActionDescriptor.EndpointMetadata.Any(m => m is AllowAnonymousAttribute))
            {
                return;
            }

            var user = context.HttpContext.User;
            if (user?.Identity?.IsAuthenticated != true)
            {
                return;
            }

            var portal = user.FindFirst("portalType")?.Value ?? "";
            if (string.Equals(portal, "vendor", StringComparison.OrdinalIgnoreCase)
                || string.Equals(portal, "support", StringComparison.OrdinalIgnoreCase)
                || string.Equals(portal, "integration", StringComparison.OrdinalIgnoreCase))
            {
                return;
            }

            if (IsAdminSession(user))
            {
                return;
            }

            var requiredPages = ErpApiPermissionCatalog.ResolveRequiredPermissionUrls(context.HttpContext);
            if (requiredPages == null || requiredPages.Length == 0)
            {
                if (ErpApiPermissionCatalog.IsUtilityController(
                        context.RouteData.Values["controller"]?.ToString()))
                {
                    var any = await GetPermissionUrlsAsync(context);
                    if (any.Count == 0)
                    {
                        Forbid(context);
                    }
                }

                return;
            }

            if (requiredPages.Any(r => r == "__deny_non_admin__"))
            {
                Forbid(context);
                return;
            }

            // User Management is administrator-only regardless of role grants.
            if (requiredPages.Any(ErpPermissionActions.IsAdminOnlyPage))
            {
                Forbid(context);
                return;
            }

            var urls = await GetPermissionUrlsAsync(context);
            var action = ErpPermissionActions.ResolveActionFromRequest(
                context.HttpContext.Request.Method,
                context.HttpContext.Request.Path.Value ?? "");

            // OR across alternate page permissions (e.g. AP ↔ Vendor Invoices).
            foreach (var required in requiredPages)
            {
                var page = ErpPermissionActions.NormalizePageUrl(required);
                if (!urls.Contains(page))
                    continue;
                if (ErpPermissionActions.HasAction(urls, page, action))
                    return;
            }

            Forbid(context);
        }

        private static void Forbid(AuthorizationFilterContext context)
        {
            context.Result = new ObjectResult(new { message = "Access denied" })
            {
                StatusCode = StatusCodes.Status403Forbidden
            };
        }

        private static bool IsAdminSession(ClaimsPrincipal user)
        {
            if (string.Equals(user.FindFirst("canAccessAllLocations")?.Value, "true", StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }

            return false;
        }

        private static async Task<HashSet<string>> GetPermissionUrlsAsync(AuthorizationFilterContext context)
        {
            if (context.HttpContext.Items.TryGetValue(PermissionCacheKey, out var cached)
                && cached is HashSet<string> set)
            {
                return set;
            }

            var user = context.HttpContext.User;
            var tenantId = int.TryParse(user.FindFirst("tenantId")?.Value, out var t) ? t : 0;
            var roleId = int.TryParse(user.FindFirst("roleId")?.Value, out var r) ? r : (int?)null;

            var urls = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            if (tenantId <= 0 || !roleId.HasValue || roleId.Value <= 0)
            {
                context.HttpContext.Items[PermissionCacheKey] = urls;
                return urls;
            }

            var db = context.HttpContext.RequestServices.GetRequiredService<CimmpleDbContext>();
            try
            {
                var list = await (
                    from pr in db.PermissionRole.AsNoTracking()
                    join pm in db.PermissionMaster.AsNoTracking() on pr.PermissionId equals pm.PermissionId
                    where pr.RoleId == roleId.Value && pr.TenantId == tenantId && pm.Url != null
                    select pm.Url!).ToListAsync();

                foreach (var url in list)
                {
                    urls.Add(ErpPermissionActions.NormalizePermissionUrl(url));
                }
            }
            catch
            {
                // Permission tables missing — deny non-admin except dashboard handled by empty set
            }

            context.HttpContext.Items[PermissionCacheKey] = urls;
            return urls;
        }
    }
}
