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
        };

        private static readonly Dictionary<string, string> ControllerToPermissionUrl =
            new(StringComparer.OrdinalIgnoreCase)
            {
                ["Dashboard"] = "/home",
                ["Employee"] = "/masters/employee",
                ["Workstation"] = "/masters/workstation",
                ["Process"] = "/masters/process",
                ["JobTemplate"] = "/masters/jobtemplate",
                ["Category"] = "/masters/category",
                ["ProductMaster"] = "/masters/product",
                ["PriceBreakdown"] = "/masters/pricebreakdown",
                ["NCRCode"] = "/quality/ncr-codes",
                ["CreditCard"] = "/masters/creditcard",
                ["ChartofAccounts"] = "/masters/chartofaccounts",
                ["UserManagement"] = "/user-management",
                ["SystemSettings"] = "/settings",
                ["JobOrder"] = "/job-orders",
                ["Quality"] = "/quality",
                ["Attendance"] = "/attendance",
                ["Reports"] = "/reports",
                ["ReportSchedule"] = "/reports/schedules",
                ["Documents"] = "/documents",
                ["JournalEntry"] = "/accounts/journal-entries",
                ["Payroll"] = "/accounts/payroll",
                ["SupportTickets"] = "/home",
            };

        public static bool IsExemptController(string? controller) =>
            !string.IsNullOrEmpty(controller) && ExemptControllers.Contains(controller);

        public static bool IsUtilityController(string? controller) =>
            !string.IsNullOrEmpty(controller) && UtilityControllers.Contains(controller);

        /// <summary>
        /// Permission page URL(s) that may authorize the request (OR).
        /// Null / empty = no module check (utility/exempt).
        /// Single "__deny_non_admin__" = admin only.
        /// </summary>
        public static string[]? ResolveRequiredPermissionUrls(HttpContext httpContext)
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
            var method = httpContext.Request.Method ?? "GET";

            if (string.Equals(controller, "Pdf", StringComparison.OrdinalIgnoreCase)
                || string.Equals(controller, "DocumentEmail", StringComparison.OrdinalIgnoreCase))
            {
                return ResolveDocumentPermissionUrls(path);
            }

            if (string.Equals(controller, "Quotation", StringComparison.OrdinalIgnoreCase))
            {
                if (path.Contains("Vendor", StringComparison.OrdinalIgnoreCase))
                    return One("/quotations/vendor");
                return One("/quotations/customer");
            }

            if (string.Equals(controller, "Order", StringComparison.OrdinalIgnoreCase))
            {
                // Vendor receiving list/detail/post live on OrderController, not a Receiving controller.
                if (path.Contains("Receiving", StringComparison.OrdinalIgnoreCase)
                    || path.Contains("ReceiveLineItem", StringComparison.OrdinalIgnoreCase))
                    return One("/purchasing/vendor-receiving");
                if (path.Contains("Vendor", StringComparison.OrdinalIgnoreCase))
                    return One("/purchasing/vendor-orders");
                if (path.Contains("Shipment", StringComparison.OrdinalIgnoreCase))
                    return One("/orders/customer-shipments");
                return One("/orders/customer");
            }

            // Create JO from CO line — permission lives on Customer Orders (CreateJob).
            if (string.Equals(controller, "JobOrder", StringComparison.OrdinalIgnoreCase)
                && path.Contains("CreateJobOrderFromOrderDetail", StringComparison.OrdinalIgnoreCase))
            {
                return One("/orders/customer");
            }

            if (string.Equals(controller, "Accounting", StringComparison.OrdinalIgnoreCase))
            {
                if (path.Contains("GenerateFinancialReport", StringComparison.OrdinalIgnoreCase)
                    || path.Contains("FinancialReport", StringComparison.OrdinalIgnoreCase))
                    return One("/accounts/reports");

                if (path.Contains("SendArReminder", StringComparison.OrdinalIgnoreCase)
                    || path.Contains("BulkArReminder", StringComparison.OrdinalIgnoreCase)
                    || path.Contains("ArReminder", StringComparison.OrdinalIgnoreCase))
                    return One("/accounts/receivable");

                if (path.Contains("Payable", StringComparison.OrdinalIgnoreCase)
                    || path.Contains("VendorPayment", StringComparison.OrdinalIgnoreCase))
                    return One("/accounts/payable");

                if (path.Contains("Receivable", StringComparison.OrdinalIgnoreCase)
                    || path.Contains("CustomerPayment", StringComparison.OrdinalIgnoreCase))
                    return One("/accounts/receivable");

                // Bank reconciliation + deposit/withdrawal cash lines on the bank register.
                if (path.Contains("Bank", StringComparison.OrdinalIgnoreCase)
                    || path.Contains("Reconcile", StringComparison.OrdinalIgnoreCase)
                    || path.Contains("DeleteTransaction", StringComparison.OrdinalIgnoreCase)
                    || path.Contains("ImportStatement", StringComparison.OrdinalIgnoreCase)
                    || path.Contains("BankStatement", StringComparison.OrdinalIgnoreCase))
                    return One("/accounts/banks");

                if (path.Contains("CloseAccountingPeriod", StringComparison.OrdinalIgnoreCase)
                    || path.Contains("OpenAccountingPeriod", StringComparison.OrdinalIgnoreCase)
                    || path.Contains("ListClosedPeriods", StringComparison.OrdinalIgnoreCase)
                    || path.Contains("ListGlAuditTrail", StringComparison.OrdinalIgnoreCase))
                    return One("/accounts/periods");

                if (path.Contains("GeneralLedger", StringComparison.OrdinalIgnoreCase)
                    || path.Contains("GlAccount", StringComparison.OrdinalIgnoreCase))
                    return One("/accounts/general-ledger");

                if (path.Contains("Dashboard", StringComparison.OrdinalIgnoreCase)
                    || path.Contains("RecentTransactions", StringComparison.OrdinalIgnoreCase))
                    return One("/accounts/dashboard");

                return One("/accounts/setup");
            }

            if (string.Equals(controller, "Invoice", StringComparison.OrdinalIgnoreCase))
            {
                // Creating an invoice is the Customer Order "Invoice" action.
                // Order-scoped reads are used while that slideout is open.
                // GetAllInvoices stays on the invoice / AR pages.
                var orderScoped = path.Contains("CreateInvoice", StringComparison.OrdinalIgnoreCase)
                    || path.Contains("GetInvoiceableItems", StringComparison.OrdinalIgnoreCase)
                    || path.Contains("GetInvoiceDetails", StringComparison.OrdinalIgnoreCase)
                    || path.Contains("GetInvoices/", StringComparison.OrdinalIgnoreCase);
                if (orderScoped)
                {
                    return new[]
                    {
                        "/orders/customer",
                        "/orders/customer-invoices",
                        "/accounts/receivable",
                    };
                }

                return new[] { "/orders/customer-invoices", "/accounts/receivable" };
            }

            if (string.Equals(controller, "Shipping", StringComparison.OrdinalIgnoreCase))
            {
                // Creating a shipment is the Customer Order "Ship" action.
                if (path.Contains("CreateShipment", StringComparison.OrdinalIgnoreCase))
                    return One("/orders/customer");
                if (string.Equals(method, "DELETE", StringComparison.OrdinalIgnoreCase)
                    || path.Contains("GetAllShipments", StringComparison.OrdinalIgnoreCase))
                    return One("/orders/customer-shipments");
                return new[] { "/orders/customer-shipments", "/orders/customer" };
            }

            if (string.Equals(controller, "VendorInvoice", StringComparison.OrdinalIgnoreCase))
            {
                if (path.Contains("Receiving", StringComparison.OrdinalIgnoreCase))
                    return One("/purchasing/vendor-receiving");
                // Vendor Invoices page and Accounts Payable share these APIs.
                return new[] { "/purchasing/vendor-invoices", "/accounts/payable" };
            }

            if (string.Equals(controller, "Bank", StringComparison.OrdinalIgnoreCase))
            {
                // Mutating bank master requires Bank Master; reads also used by AP/AR/Bank Rec.
                if (string.Equals(method, "GET", StringComparison.OrdinalIgnoreCase)
                    || path.Contains("GetBank", StringComparison.OrdinalIgnoreCase)
                    || path.Contains("RevealAccountNo", StringComparison.OrdinalIgnoreCase))
                {
                    return new[]
                    {
                        "/masters/bank",
                        "/accounts/banks",
                        "/accounts/payable",
                        "/accounts/receivable",
                        "/accounts/setup",
                        "/purchasing/vendor-invoices",
                        "/orders/customer-invoices",
                    };
                }

                return One("/masters/bank");
            }

            if (string.Equals(controller, "CreditCard", StringComparison.OrdinalIgnoreCase))
            {
                if (string.Equals(method, "GET", StringComparison.OrdinalIgnoreCase))
                {
                    return new[]
                    {
                        "/masters/creditcard",
                        "/accounts/payable",
                        "/purchasing/vendor-invoices",
                    };
                }

                return One("/masters/creditcard");
            }

            // Raw Material Master lives under InventoryController endpoints.
            // Dropdown reads are shared with the documents that pick a part or material.
            if (string.Equals(controller, "Inventory", StringComparison.OrdinalIgnoreCase))
            {
                if (path.Contains("SaveRawMaterial", StringComparison.OrdinalIgnoreCase)
                    || path.Contains("EnsureRawMaterial", StringComparison.OrdinalIgnoreCase)
                    || path.Contains("SetRawMaterialStatus", StringComparison.OrdinalIgnoreCase))
                    return One("/masters/raw-material");

                if (string.Equals(method, "GET", StringComparison.OrdinalIgnoreCase)
                    && (path.Contains("GetProducts", StringComparison.OrdinalIgnoreCase)
                        || path.Contains("GetRawMaterials", StringComparison.OrdinalIgnoreCase)))
                {
                    return new[]
                    {
                        "/inventory",
                        "/masters/raw-material",
                        "/job-orders",
                        "/masters/jobtemplate",
                        "/quotations/vendor",
                        "/purchasing/vendor-orders",
                    };
                }

                if (string.Equals(method, "GET", StringComparison.OrdinalIgnoreCase)
                    && (path.Contains("GetJobMaterialUsage", StringComparison.OrdinalIgnoreCase)
                        || path.Contains("GetReservations", StringComparison.OrdinalIgnoreCase)))
                    return new[] { "/inventory", "/job-orders" };

                return One("/inventory");
            }

            if (string.Equals(controller, "ProductMaster", StringComparison.OrdinalIgnoreCase))
            {
                if (string.Equals(method, "GET", StringComparison.OrdinalIgnoreCase)
                    && path.Contains("GetPartsByCustomer", StringComparison.OrdinalIgnoreCase))
                {
                    return new[]
                    {
                        "/masters/product",
                        "/quotations/customer",
                        "/orders/customer",
                    };
                }

                if (string.Equals(method, "GET", StringComparison.OrdinalIgnoreCase)
                    && path.Contains("GetPartsByVendor", StringComparison.OrdinalIgnoreCase))
                {
                    return new[]
                    {
                        "/masters/product",
                        "/quotations/vendor",
                        "/purchasing/vendor-orders",
                    };
                }

                if (string.Equals(method, "GET", StringComparison.OrdinalIgnoreCase)
                    && path.Contains("GetProductMasterList", StringComparison.OrdinalIgnoreCase))
                {
                    return new[]
                    {
                        "/masters/product",
                        "/inventory",
                        "/quotations/vendor",
                        "/purchasing/vendor-orders",
                    };
                }

                return One("/masters/product");
            }

            if (string.Equals(controller, "PriceBreakdown", StringComparison.OrdinalIgnoreCase))
            {
                if (string.Equals(method, "GET", StringComparison.OrdinalIgnoreCase)
                    && path.Contains("GetPriceBreakdowns", StringComparison.OrdinalIgnoreCase)
                    && !path.Contains("GetPriceBreakdownById", StringComparison.OrdinalIgnoreCase))
                {
                    return new[]
                    {
                        "/masters/pricebreakdown",
                        "/quotations/customer",
                        "/orders/customer",
                    };
                }

                return One("/masters/pricebreakdown");
            }

            if (string.Equals(controller, "ChartofAccounts", StringComparison.OrdinalIgnoreCase))
            {
                if (string.Equals(method, "GET", StringComparison.OrdinalIgnoreCase)
                    && path.Contains("GetChartofAccounts", StringComparison.OrdinalIgnoreCase))
                {
                    return new[]
                    {
                        "/masters/chartofaccounts",
                        "/accounts/setup",
                        "/accounts/journal-entries",
                        "/accounts/general-ledger",
                        "/accounts/banks",
                        "/accounts/payable",
                        "/masters/bank",
                        "/masters/creditcard",
                        "/masters/vendor",
                        "/quotations/vendor",
                        "/purchasing/vendor-orders",
                        "/purchasing/vendor-invoices",
                    };
                }

                return One("/masters/chartofaccounts");
            }

            if (string.Equals(controller, "Employee", StringComparison.OrdinalIgnoreCase))
            {
                if (string.Equals(method, "GET", StringComparison.OrdinalIgnoreCase)
                    && path.Contains("GetProfilePic", StringComparison.OrdinalIgnoreCase))
                    return null;

                if (string.Equals(method, "GET", StringComparison.OrdinalIgnoreCase)
                    && path.Contains("GetEmployees", StringComparison.OrdinalIgnoreCase))
                {
                    return new[]
                    {
                        "/masters/employee",
                        "/job-orders",
                        "/quality",
                        "/attendance",
                    };
                }

                return One("/masters/employee");
            }

            if (string.Equals(controller, "Process", StringComparison.OrdinalIgnoreCase))
            {
                if (string.Equals(method, "GET", StringComparison.OrdinalIgnoreCase)
                    && (path.Contains("GetProcesses", StringComparison.OrdinalIgnoreCase)
                        || path.Contains("GetProcessCategories", StringComparison.OrdinalIgnoreCase)))
                {
                    return new[] { "/masters/process", "/job-orders", "/masters/jobtemplate" };
                }

                return One("/masters/process");
            }

            if (string.Equals(controller, "Workstation", StringComparison.OrdinalIgnoreCase))
            {
                if (string.Equals(method, "GET", StringComparison.OrdinalIgnoreCase)
                    && path.Contains("GetWorkstations", StringComparison.OrdinalIgnoreCase))
                {
                    return new[]
                    {
                        "/masters/workstation",
                        "/masters/process",
                        "/job-orders",
                        "/masters/jobtemplate",
                    };
                }

                return One("/masters/workstation");
            }

            if (string.Equals(controller, "JobTemplate", StringComparison.OrdinalIgnoreCase))
            {
                if (string.Equals(method, "GET", StringComparison.OrdinalIgnoreCase)
                    && (path.Contains("GetJobTemplates", StringComparison.OrdinalIgnoreCase)
                        || path.Contains("GetJobTemplateById", StringComparison.OrdinalIgnoreCase)
                        || path.Contains("GetAttachmentTypes", StringComparison.OrdinalIgnoreCase)
                        || path.Contains("GetInspectionTypes", StringComparison.OrdinalIgnoreCase)))
                    return new[] { "/masters/jobtemplate", "/job-orders" };

                return One("/masters/jobtemplate");
            }

            if (string.Equals(controller, "Category", StringComparison.OrdinalIgnoreCase))
            {
                if (string.Equals(method, "GET", StringComparison.OrdinalIgnoreCase)
                    && path.Contains("GetCategoryTypes", StringComparison.OrdinalIgnoreCase))
                    return new[] { "/masters/category", "/masters/jobtemplate", "/job-orders" };

                return One("/masters/category");
            }

            if (string.Equals(controller, "NCRCode", StringComparison.OrdinalIgnoreCase))
            {
                if (string.Equals(method, "GET", StringComparison.OrdinalIgnoreCase)
                    && path.Contains("GetNCRCodes", StringComparison.OrdinalIgnoreCase))
                    return new[] { "/quality/ncr-codes", "/quality" };

                return One("/quality/ncr-codes");
            }

            // Location / Vendor lists are used as lookups from Settings and other masters.
            if (string.Equals(controller, "Location", StringComparison.OrdinalIgnoreCase))
            {
                if (string.Equals(method, "GET", StringComparison.OrdinalIgnoreCase)
                    || path.Contains("GetLocation", StringComparison.OrdinalIgnoreCase))
                {
                    return new[]
                    {
                        "/masters/location",
                        "/settings",
                        "/masters/raw-material",
                        "/masters/employee",
                        "/masters/bank",
                        "/inventory",
                        "/purchasing/vendor-receiving",
                    };
                }

                return One("/masters/location");
            }

            if (string.Equals(controller, "Vendor", StringComparison.OrdinalIgnoreCase))
            {
                if (string.Equals(method, "GET", StringComparison.OrdinalIgnoreCase)
                    || path.Contains("GetVendor", StringComparison.OrdinalIgnoreCase))
                {
                    return new[]
                    {
                        "/masters/vendor",
                        "/masters/raw-material",
                        "/purchasing/vendor-orders",
                        "/purchasing/vendor-invoices",
                        "/quotations/vendor",
                        "/inventory",
                        "/quality",
                    };
                }

                return One("/masters/vendor");
            }

            if (string.Equals(controller, "Customer", StringComparison.OrdinalIgnoreCase))
            {
                if (string.Equals(method, "GET", StringComparison.OrdinalIgnoreCase)
                    || path.Contains("GetCustomer", StringComparison.OrdinalIgnoreCase))
                {
                    return new[]
                    {
                        "/masters/customer",
                        "/masters/product",
                        "/orders/customer",
                        "/quotations/customer",
                        "/orders/customer-invoices",
                        "/quality",
                    };
                }

                return One("/masters/customer");
            }

            if (controller != null && ControllerToPermissionUrl.TryGetValue(controller, out var url))
            {
                return One(url);
            }

            // Unknown controller: require admin (handled by filter as deny non-admin).
            return new[] { "__deny_non_admin__" };
        }

        /// <summary>
        /// Print and email endpoints. Checked before generic page maps so "Ship" does not steal Send.
        /// </summary>
        private static string[] ResolveDocumentPermissionUrls(string path)
        {
            if (path.Contains("VendorQuotation", StringComparison.OrdinalIgnoreCase))
                return One("/quotations/vendor");
            if (path.Contains("VendorInvoice", StringComparison.OrdinalIgnoreCase))
                return new[] { "/purchasing/vendor-invoices", "/accounts/payable" };
            if (path.Contains("VendorOrder", StringComparison.OrdinalIgnoreCase))
                return One("/purchasing/vendor-orders");
            if (path.Contains("Shipment", StringComparison.OrdinalIgnoreCase))
                return One("/orders/customer-shipments");
            if (path.Contains("JobOrder", StringComparison.OrdinalIgnoreCase))
                return One("/job-orders");
            if (path.Contains("Ncr", StringComparison.OrdinalIgnoreCase) || path.Contains("NCR", StringComparison.OrdinalIgnoreCase))
                return One("/quality");
            if (path.Contains("Invoice", StringComparison.OrdinalIgnoreCase))
                return new[] { "/orders/customer-invoices", "/accounts/receivable" };
            if (path.Contains("Quotation", StringComparison.OrdinalIgnoreCase))
                return One("/quotations/customer");
            if (path.Contains("Order", StringComparison.OrdinalIgnoreCase))
                return One("/orders/customer");
            return new[] { "__deny_non_admin__" };
        }

        /// <summary>Backward-compatible single-url resolver (first alternate).</summary>
        public static string? ResolveRequiredPermissionUrl(HttpContext httpContext)
        {
            var urls = ResolveRequiredPermissionUrls(httpContext);
            if (urls == null || urls.Length == 0) return null;
            return urls[0];
        }

        private static string[] One(string url) => new[] { url };
    }
}
