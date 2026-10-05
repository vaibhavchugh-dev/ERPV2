using Microsoft.AspNetCore.Http;

namespace CimmpleAPI.Services.Auth
{
    public static class ErpApiPermissionCatalog
    {
        private static readonly HashSet<string> ExemptControllers = new(StringComparer.OrdinalIgnoreCase)
        {
            "Auth",
            "User",
            "SupportStaff",
        };

        /// <summary>Shared UI helpers — any authenticated ERP user with at least one permission (or admin).</summary>
        private static readonly HashSet<string> UtilityControllers = new(StringComparer.OrdinalIgnoreCase)
        {
            "Conversations",
            "Notifications",
            "GlobalSearch",
            "EntityComments",
            "Pdf",
            "DocumentEmail",
        };

        private static readonly Dictionary<string, string> ControllerToPermissionUrl =
            new(StringComparer.OrdinalIgnoreCase)
            {
                ["Dashboard"] = "/home",
                ["Customer"] = "/masters/customer",
                ["Vendor"] = "/masters/vendor",
                ["Employee"] = "/masters/employee",
                ["Location"] = "/masters/location",
                ["Workstation"] = "/masters/workstation",
                ["Process"] = "/masters/process",
                ["JobTemplate"] = "/masters/jobtemplate",
                ["Category"] = "/masters/category",
                ["ProductMaster"] = "/masters/product",
                ["PriceBreakdown"] = "/masters/pricebreakdown",
                ["NCRCode"] = "/quality/ncr-codes",
                ["Bank"] = "/masters/bank",
                ["CreditCard"] = "/masters/creditcard",
                ["ChartofAccounts"] = "/masters/chartofaccounts",
                ["UserManagement"] = "/user-management",
                ["SystemSettings"] = "/settings",
                ["Inventory"] = "/inventory",
                ["JobOrder"] = "/job-orders",
                ["Quality"] = "/quality",
                ["Attendance"] = "/attendance",
                ["Reports"] = "/reports",
                ["ReportSchedule"] = "/reports",
                ["Documents"] = "/documents",
                ["Accounting"] = "/accounts/setup",
                ["JournalEntry"] = "/accounts/journal-entries",
                ["Payroll"] = "/accounts/payroll",
                ["SupportTickets"] = "/home",
            };

        public static bool IsExemptController(string? controller) =>
            !string.IsNullOrEmpty(controller) && ExemptControllers.Contains(controller);

        public static bool IsUtilityController(string? controller) =>
            !string.IsNullOrEmpty(controller) && UtilityControllers.Contains(controller);

        /// <summary>Returns null when no module permission is required (utility/exempt).</summary>
        public static string? ResolveRequiredPermissionUrl(HttpContext httpContext)
        {
            var endpoint = httpContext.GetEndpoint();
            if (endpoint?.Metadata.GetMetadata<SkipErpPermissionCheckAttribute>() != null)
            {
                return null;
            }

            var controller = httpContext.Request.RouteValues["controller"]?.ToString();
            if (IsExemptController(controller))
            {
                return null;
            }

            if (IsUtilityController(controller))
            {
                return null;
            }

            var path = httpContext.Request.Path.Value ?? "";

            if (string.Equals(controller, "Quotation", StringComparison.OrdinalIgnoreCase))
            {
                if (path.Contains("Vendor", StringComparison.OrdinalIgnoreCase))
                    return "/quotations/vendor";
                return "/quotations/customer";
            }

            if (string.Equals(controller, "Order", StringComparison.OrdinalIgnoreCase))
            {
                if (path.Contains("Vendor", StringComparison.OrdinalIgnoreCase))
                    return "/purchasing/vendor-orders";
                if (path.Contains("Shipment", StringComparison.OrdinalIgnoreCase))
                    return "/orders/customer-shipments";
                return "/orders/customer";
            }

            if (string.Equals(controller, "Invoice", StringComparison.OrdinalIgnoreCase))
            {
                return "/orders/customer-invoices";
            }

            if (string.Equals(controller, "Shipping", StringComparison.OrdinalIgnoreCase))
            {
                return "/orders/customer-shipments";
            }

            if (string.Equals(controller, "VendorInvoice", StringComparison.OrdinalIgnoreCase))
            {
                if (path.Contains("Receiving", StringComparison.OrdinalIgnoreCase))
                    return "/purchasing/vendor-receiving";
                return "/purchasing/vendor-invoices";
            }

            if (controller != null && ControllerToPermissionUrl.TryGetValue(controller, out var url))
            {
                return url;
            }

            // Unknown controller: require admin (handled by filter as deny non-admin).
            return "__deny_non_admin__";
        }
    }
}
