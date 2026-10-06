using CimmpleAPI.Data;
using CimmpleAPI.Data.Models;
using Microsoft.EntityFrameworkCore;

namespace CimmpleAPI.Services
{
    public sealed class GlobalSearchSiteScope
    {
        public int? FilterLocationId { get; init; }
        public IReadOnlyList<int>? RestrictToLocationIds { get; init; }
    }

    public static class GlobalSearchSupport
    {
        public static int ToDisplayDocNumber(int raw) =>
            raw > 0 && raw < 1000 ? raw + 999 : raw;

        public static bool HasDocPrefix(string searchTerm, params string[] prefixes)
        {
            var t = (searchTerm ?? "").Trim().ToLowerInvariant();
            return prefixes.Any(p => t.StartsWith(p.ToLowerInvariant()));
        }

        /// <summary>
        /// EF-translatable display doc match (CO#/CQ#/VO#/VQ#/JO# partial numbers).
        /// </summary>
        public static bool DisplayPoNumberMatches(int poNumber, string cleanedDigits, bool prefixedQuery)
        {
            if (poNumber <= 0 || string.IsNullOrEmpty(cleanedDigits))
                return false;
            if (!cleanedDigits.All(char.IsDigit))
                return false;

            if (prefixedQuery)
            {
                var display = ToDisplayDocNumber(poNumber);
                return display.ToString().StartsWith(cleanedDigits);
            }

            return poNumber.ToString().Contains(cleanedDigits)
                || ToDisplayDocNumber(poNumber).ToString().Contains(cleanedDigits);
        }

        public static string MaskAccountNumber(string? account)
        {
            var digits = (account ?? "").Trim();
            if (digits.Length <= 4)
                return digits.Length == 0 ? "" : new string('•', Math.Max(0, digits.Length - 1)) + digits[^1];
            return "••••" + digits[^4..];
        }

        public static string ResolveCustomerInvoiceStatus(InvoiceMaster invoice)
        {
            if (invoice.IsVoided)
                return "Void";

            var paid = invoice.PaidAmount;
            var total = invoice.TotalAmount;

            if (paid >= total - 0.009m && total > 0)
                return "Paid";
            if (paid > 0.009m)
                return "Partially Paid";
            if (invoice.DueDate < DateTime.Now)
                return "Overdue";
            return "Unpaid";
        }

        public static string ResolveVendorInvoiceStatus(VendorInvoiceMaster invoice)
        {
            if (invoice.isPaid == 2)
                return "Void";

            var paid = invoice.PaidAmount;
            if (paid >= invoice.TotalAmount - 0.009m && invoice.TotalAmount > 0)
                return "Paid";
            if (paid > 0.009m)
                return "Partially Paid";
            if (invoice.Approved == true)
                return "Approved";
            if (DateTime.Now > invoice.DueDate)
                return "Overdue";
            return "Pending Approval";
        }

        public static IQueryable<CustomerOrder> ApplySiteFilter(
            IQueryable<CustomerOrder> q,
            GlobalSearchSiteScope? scope)
        {
            if (scope?.FilterLocationId is int loc)
                return q.Where(o => o.locationId == loc);
            if (scope?.RestrictToLocationIds is { Count: > 0 } allowed)
                return q.Where(o => allowed.Contains(o.locationId));
            return q;
        }

        public static IQueryable<VendorOrder> ApplySiteFilter(
            IQueryable<VendorOrder> q,
            GlobalSearchSiteScope? scope)
        {
            if (scope?.FilterLocationId is int loc)
                return q.Where(o => o.LocationId.HasValue && o.LocationId.Value == loc);
            if (scope?.RestrictToLocationIds is { Count: > 0 } allowed)
                return q.Where(o => o.LocationId.HasValue && allowed.Contains(o.LocationId.Value));
            return q;
        }

        public static IQueryable<QuotationOrder> ApplySiteFilter(
            IQueryable<QuotationOrder> q,
            GlobalSearchSiteScope? scope)
        {
            if (scope?.FilterLocationId is int loc)
                return q.Where(o => o.Locationid.HasValue && o.Locationid.Value == loc);
            if (scope?.RestrictToLocationIds is { Count: > 0 } allowed)
                return q.Where(o => o.Locationid.HasValue && allowed.Contains(o.Locationid.Value));
            return q;
        }

        public static IQueryable<BankMaster> ApplySiteFilter(
            IQueryable<BankMaster> q,
            GlobalSearchSiteScope? scope)
        {
            if (scope?.FilterLocationId is int loc)
                return q.Where(b => b.locationId == loc);
            if (scope?.RestrictToLocationIds is { Count: > 0 } allowed)
                return q.Where(b => allowed.Contains(b.locationId));
            return q;
        }

        public static async Task<HashSet<string>> LoadPermissionUrlsAsync(
            CimmpleDbContext db,
            int tenantId,
            int? roleId)
        {
            var urls = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            if (tenantId <= 0 || !roleId.HasValue || roleId.Value <= 0)
                return urls;

            var list = await (
                from pr in db.PermissionRole.AsNoTracking()
                join pm in db.PermissionMaster.AsNoTracking() on pr.PermissionId equals pm.PermissionId
                where pr.TenantId == tenantId && pr.RoleId == roleId.Value && pm.Url != null
                select pm.Url!
            ).ToListAsync();

            foreach (var url in list)
            {
                var normalized = url.Trim().TrimEnd('/').ToLowerInvariant();
                if (normalized.Length == 0) normalized = "/";
                if (!normalized.StartsWith('/')) normalized = "/" + normalized;
                urls.Add(normalized);
            }

            return urls;
        }

        public static bool HasPermissionForPath(HashSet<string>? granted, string path)
        {
            if (granted == null)
                return true;
            var normalized = path.Trim().TrimEnd('/').ToLowerInvariant();
            if (normalized.Length == 0) normalized = "/";
            if (!normalized.StartsWith('/')) normalized = "/" + normalized;
            return granted.Contains(normalized);
        }
    }
}
