using System.Security.Claims;
using System.Text;
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
            var http = context.HttpContext.Request;
            var path = http.Path.Value ?? "";
            var action = ErpPermissionActions.ResolveActionFromRequest(http.Method, path);
            var payload = await ReadPayloadJsonAsync(http, path);

            if (ErpPermissionActions.IsPriceBreakdownSave(path))
            {
                var (hasNew, hasExisting) = ErpPermissionActions.ClassifyPriceBreakdownSave(payload);
                var page = "/masters/pricebreakdown";
                var allowed = urls.Contains(page)
                    && (!hasNew || ErpPermissionActions.HasAction(urls, page, ErpPermissionActions.Add))
                    && (!hasExisting || ErpPermissionActions.HasAction(urls, page, ErpPermissionActions.Edit))
                    && (hasNew || hasExisting);
                if (!allowed)
                {
                    Forbid(context);
                    return;
                }

                context.HttpContext.Items["ErpPerm.PriceBreakdown.Delete"] =
                    ErpPermissionActions.HasAction(urls, page, ErpPermissionActions.Delete);
                context.HttpContext.Items["ErpPerm.PriceBreakdown.Checked"] = true;
                return;
            }

            var alternatives = ErpPermissionActions.BuildAlternatives(requiredPages, action, path, payload);

            var authorized = false;
            foreach (var alt in alternatives)
            {
                if (!urls.Contains(alt.PageUrl))
                    continue;
                if (ErpPermissionActions.HasAction(urls, alt.PageUrl, alt.Action))
                {
                    authorized = true;
                    break;
                }
            }

            if (!authorized)
            {
                Forbid(context);
                return;
            }

            if (path.Contains("SaveJobOrder", StringComparison.OrdinalIgnoreCase))
            {
                var items = context.HttpContext.Items;
                items[ErpPermissionActions.JobOrderPermCheckedKey] = true;
                items[ErpPermissionActions.JobOrderPermEditKey] =
                    ErpPermissionActions.HasAction(urls, "/job-orders", ErpPermissionActions.Edit);
                items[ErpPermissionActions.JobOrderPermCompleteKey] =
                    ErpPermissionActions.HasAction(urls, "/job-orders", ErpPermissionActions.Complete);
            }
        }

        /// <summary>
        /// Upsert endpoints need the record id (and quotation id) to choose Add vs Edit vs Convert.
        /// The body is buffered so the controller can read it again.
        /// </summary>
        private static async Task<string?> ReadPayloadJsonAsync(HttpRequest http, string path)
        {
            var method = http.Method ?? "";
            if (!string.Equals(method, "POST", StringComparison.OrdinalIgnoreCase))
                return null;
            if (path.IndexOf("Save", StringComparison.OrdinalIgnoreCase) < 0
                && path.IndexOf("PriceBreakdown", StringComparison.OrdinalIgnoreCase) < 0)
                return null;

            try
            {
                http.EnableBuffering();
                if (http.HasFormContentType)
                {
                    var form = await http.ReadFormAsync();
                    http.Body.Position = 0;
                    return form["formField"].FirstOrDefault()
                        ?? form["FormField"].FirstOrDefault();
                }

                http.Body.Position = 0;
                using var reader = new StreamReader(http.Body, Encoding.UTF8, detectEncodingFromByteOrderMarks: false, leaveOpen: true);
                var text = await reader.ReadToEndAsync();
                http.Body.Position = 0;
                return string.IsNullOrWhiteSpace(text) ? null : text;
            }
            catch
            {
                try { http.Body.Position = 0; } catch { /* body may not be seekable */ }
                return null;
            }
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
