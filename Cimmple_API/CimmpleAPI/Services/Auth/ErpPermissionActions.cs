using CimmpleAPI.Data.Models;

namespace CimmpleAPI.Services.Auth
{
    /// <summary>
    /// Level-2 action permissions. Page (Level 1) Url is unchanged;
    /// actions use <c>{pageUrl}#Action</c> (e.g. <c>/quotations/customer#Add</c>).
    /// </summary>
    public static class ErpPermissionActions
    {
        public const char Separator = '#';

        public const string View = "View";
        public const string Add = "Add";
        public const string Edit = "Edit";
        public const string Delete = "Delete";
        public const string Convert = "Convert";
        public const string Send = "Send";
        public const string Print = "Print";
        public const string Duplicate = "Duplicate";
        public const string Ship = "Ship";
        public const string Invoice = "Invoice";
        public const string Pay = "Pay";
        public const string Void = "Void";
        public const string Complete = "Complete";
        public const string Compare = "Compare";
        public const string Approve = "Approve";
        public const string Receive = "Receive";
        public const string Issue = "Issue";
        public const string Reserve = "Reserve";
        public const string Transfer = "Transfer";
        public const string Adjust = "Adjust";
        public const string Export = "Export";
        public const string Import = "Import";
        public const string Schedule = "Schedule";
        public const string Upload = "Upload";
        public const string Download = "Download";
        public const string Manage = "Manage";
        public const string CreateJob = "CreateJob";
        public const string Reconcile = "Reconcile";
        public const string Close = "Close";
        public const string Reopen = "Reopen";
        public const string Post = "Post";
        public const string Reverse = "Reverse";
        public const string Sync = "Sync";
        public const string Seed = "Seed";

        /// <summary>User Management is never grantable to non-admin roles.</summary>
        public const string UserManagementUrl = "/user-management";

        public static bool IsAdminOnlyPage(string? pageUrl) =>
            string.Equals(NormalizePageUrl(pageUrl), UserManagementUrl, StringComparison.OrdinalIgnoreCase);

        public static string NormalizePageUrl(string? url)
        {
            var u = (url ?? "").Trim();
            var hash = u.IndexOf(Separator);
            if (hash >= 0) u = u[..hash];
            if (u.Length == 0) return "/";
            if (!u.StartsWith('/')) u = "/" + u;
            u = u.TrimEnd('/');
            return u.Length == 0 ? "/" : u.ToLowerInvariant();
        }

        public static string NormalizePermissionUrl(string? url)
        {
            var raw = (url ?? "").Trim();
            if (raw.Length == 0) return "/";
            var hash = raw.IndexOf(Separator);
            if (hash < 0)
                return NormalizePageUrl(raw);

            var page = NormalizePageUrl(raw[..hash]);
            var action = raw[(hash + 1)..].Trim();
            if (action.Length == 0) return page;
            return $"{page}{Separator}{action.ToLowerInvariant()}";
        }

        public static bool TrySplit(string? url, out string pageUrl, out string? action)
        {
            pageUrl = NormalizePageUrl(url);
            action = null;
            var raw = (url ?? "").Trim();
            var hash = raw.IndexOf(Separator);
            if (hash < 0) return false;
            var a = raw[(hash + 1)..].Trim();
            if (a.Length == 0) return false;
            action = a;
            return true;
        }

        public static string ActionUrl(string pageUrl, string action) =>
            $"{NormalizePageUrl(pageUrl)}{Separator}{action}";

        public static bool IsActionUrl(string? url) =>
            !string.IsNullOrEmpty(url) && url.Contains(Separator);

        /// <summary>Page Url → Level-2 actions (excluding implicit View = Level 1 grant).</summary>
        public static IReadOnlyDictionary<string, string[]> PageActions { get; } =
            new Dictionary<string, string[]>(StringComparer.OrdinalIgnoreCase)
            {
                ["/home"] = Array.Empty<string>(),
                ["/workflow"] = Array.Empty<string>(),
                ["/quotations/customer"] = new[] { Add, Edit, Delete, Convert, Send, Print, Duplicate },
                ["/orders/customer"] = new[] { Add, Edit, Delete, Ship, Invoice, Send, Print, Duplicate, CreateJob },
                ["/orders/customer-shipments"] = new[] { Print, Send, Delete },
                ["/orders/customer-invoices"] = new[] { Pay, Print, Send, Void },
                // Jobs are created from Customer Orders (CreateJob); JO has no standalone Add.
                ["/job-orders"] = new[] { Edit, Delete, Complete, Print, Send, Manage },
                ["/quotations/vendor"] = new[] { Add, Edit, Delete, Convert, Compare, Send, Print, Duplicate },
                ["/purchasing/vendor-orders"] = new[] { Add, Edit, Delete, Send, Print, Duplicate, Invoice },
                ["/purchasing/vendor-receiving"] = new[] { Receive },
                ["/purchasing/vendor-invoices"] = new[] { Add, Approve, Pay, Print, Send, Void, Delete },
                ["/inventory"] = new[] { Receive, Issue, Reserve, Transfer, Adjust },
                ["/quality"] = new[] { Add, Edit, Delete, Print, Send },
                ["/quality/ncr-codes"] = new[] { Add, Edit, Delete },
                ["/reports"] = new[] { Export, Schedule },
                ["/reports/schedules"] = new[] { Edit, Delete, Send, Manage },
                ["/documents"] = new[] { Upload, Download, Delete, Manage },
                ["/accounts/dashboard"] = Array.Empty<string>(),
                ["/accounts/payable"] = new[] { Approve, Pay, Void },
                ["/accounts/receivable"] = new[] { Pay, Send },
                // Bank register (deposits / withdrawals / payments) + reconciliation workflow
                ["/accounts/banks"] = new[] { Reconcile, Import, Export, Close, Delete },
                ["/accounts/reports"] = new[] { Export, Schedule },
                ["/accounts/setup"] = new[] { Edit },
                ["/accounts/journal-entries"] = new[] { Add, Post, Delete, Reverse },
                ["/accounts/payroll"] = new[] { Add, Import, Post, Pay },
                ["/accounts/general-ledger"] = Array.Empty<string>(),
                ["/accounts/periods"] = new[] { Close, Reopen },
                ["/masters/bank"] = new[] { Add, Edit, Delete },
                ["/masters/creditcard"] = new[] { Add, Edit, Delete },
                ["/masters/chartofaccounts"] = new[] { Add, Edit, Delete },
                ["/masters/customer"] = new[] { Add, Edit, Delete, Import },
                ["/masters/vendor"] = new[] { Add, Edit, Delete, Import },
                ["/masters/workstation"] = new[] { Add, Edit, Delete, Import },
                ["/masters/employee"] = new[] { Add, Edit, Delete, Import },
                ["/masters/location"] = new[] { Add, Edit, Delete },
                ["/masters/process"] = new[] { Add, Edit, Delete, Import },
                ["/masters/jobtemplate"] = new[] { Add, Edit, Delete, Export },
                ["/masters/category"] = new[] { Add, Edit, Delete, Seed },
                ["/masters/pricebreakdown"] = new[] { Add, Edit, Delete },
                ["/masters/product"] = new[] { Edit, Sync },
                ["/masters/raw-material"] = new[] { Add, Edit },
                ["/attendance"] = new[] { Export },
                // User Management: admin-only page; no Level-2 grants for roles
                [UserManagementUrl] = Array.Empty<string>(),
                ["/settings"] = new[] { Edit, Send },
            };

        public static IEnumerable<PermissionMaster> BuildActionPermissions(PermissionMaster page)
        {
            if (page?.Url == null) yield break;
            var pageUrl = NormalizePageUrl(page.Url);
            if (IsAdminOnlyPage(pageUrl)) yield break;
            if (!PageActions.TryGetValue(pageUrl, out var actions) || actions.Length == 0)
                yield break;

            var baseOrder = (page.OrderNo ?? page.PermissionId) * 100;
            for (var i = 0; i < actions.Length; i++)
            {
                var action = actions[i];
                var displayAction = string.Equals(action, CreateJob, StringComparison.OrdinalIgnoreCase)
                    ? "Create Job"
                    : action;
                yield return new PermissionMaster
                {
                    PermissionName = $"{page.PermissionName} - {displayAction}",
                    DisplayPermissionName = displayAction,
                    LevelInfo = 2,
                    OrderNo = baseOrder + i + 1,
                    Url = ActionUrl(pageUrl, action),
                    ReportGroup = page.ReportGroup,
                    ReportDescription = $"{displayAction} on {page.DisplayPermissionName ?? page.PermissionName}"
                };
            }
        }

        /// <summary>
        /// Map HTTP verb + path segment keywords to a Level-2 action (null = page View / L1 only).
        /// </summary>
        public static string? ResolveActionFromRequest(string httpMethod, string path)
        {
            var method = (httpMethod ?? "GET").ToUpperInvariant();
            var p = path ?? "";

            if (Contains(p, "CreateJobOrderFromOrderDetail")) return CreateJob;
            if (Contains(p, "Convert")) return Convert;
            if (Contains(p, "Compare")) return Compare;
            if (Contains(p, "Duplicate")) return Duplicate;
            if (Contains(p, "Approve")) return Approve;
            if (Contains(p, "Reconcile")) return Reconcile;
            if (Contains(p, "Reverse")) return Reverse;
            if (Contains(p, "Void")) return Void;
            if (Contains(p, "Ship")) return Ship;
            if (Contains(p, "Receive") || Contains(p, "Receiving")) return Receive;
            if (Contains(p, "Transfer")) return Transfer;
            if (Contains(p, "Adjust") || Contains(p, "Adjustment")) return Adjust;
            if (Contains(p, "Reserve")) return Reserve;
            if (Contains(p, "Issue") && !Contains(p, "Invoice")) return Issue;
            if (Contains(p, "Invoice") && (Contains(p, "Create") || Contains(p, "Generate") || method == "POST"))
                return Invoice;
            if (Contains(p, "Pay") || Contains(p, "Payment")) return Pay;
            if (Contains(p, "Post") && !Contains(p, "Postal")) return Post;
            if (Contains(p, "Import")) return Import;
            if (Contains(p, "Export")) return Export;
            // ReportSchedules API path contains "Schedule" but View/list is Level-1 only;
            // Schedule action belongs to Reports pages (create schedule from a report).
            if (Contains(p, "Schedule") && !Contains(p, "ReportSchedules")) return Schedule;
            if (Contains(p, "Upload")) return Upload;
            if (Contains(p, "Download")) return Download;
            if (Contains(p, "Print") || Contains(p, "Pdf")) return Print;
            if (Contains(p, "TestSmtp")) return Send;
            if (Contains(p, "Send") || Contains(p, "Email") || Contains(p, "Reminder")) return Send;
            if (Contains(p, "Sync")) return Sync;
            if (Contains(p, "Seed") || Contains(p, "LoadDefault")) return Seed;
            if (Contains(p, "ClosePeriod") || (Contains(p, "Close") && Contains(p, "Period"))) return Close;
            if (Contains(p, "Reopen")) return Reopen;
            if (Contains(p, "CompleteBankReconciliation") || Contains(p, "StartBankReconciliation")
                || Contains(p, "UpdateBankReconciliation"))
                return Close;
            if (Contains(p, "Complete")) return Complete;
            if (Contains(p, "ImportStatement") || Contains(p, "BankStatement") || Contains(p, "ApplyStatement"))
                return Import;

            // Report preview/export share Generate* endpoints — View is enough at API;
            // Export is enforced in the UI via Level-2 Export.
            if (Contains(p, "GenerateReport") || Contains(p, "GenerateFinancialReport"))
                return null;

            // Scheduled report emails: run-now emails recipients; enable/disable is Manage.
            if (Contains(p, "ReportSchedules") && Contains(p, "/run")) return Send;
            if (Contains(p, "ReportSchedules") && Contains(p, "enabled")) return Manage;

            if (method is "DELETE") return Delete;
            if (method is "PUT" or "PATCH") return Edit;
            if (method == "POST")
            {
                if (Contains(p, "Delete") || Contains(p, "Remove")) return Delete;
                if (Contains(p, "Update") || Contains(p, "Edit") || Contains(p, "Save"))
                {
                    // Save often upserts — require Edit (Add covered when creating via separate endpoints)
                    if (Contains(p, "Create") || Contains(p, "Add") || Contains(p, "Insert") || Contains(p, "New"))
                        return Add;
                    return Edit;
                }
                if (Contains(p, "Create") || Contains(p, "Add") || Contains(p, "Insert") || Contains(p, "New"))
                    return Add;
                // Generic POST on a module → treat as Edit (mutate)
                return Edit;
            }

            return null; // GET → View via Level 1
        }

        private static bool Contains(string path, string token) =>
            path.IndexOf(token, StringComparison.OrdinalIgnoreCase) >= 0;

        /// <summary>
        /// True when the role may perform the action.
        /// If any Level-2 grants exist for the page, only those actions are allowed.
        /// If the page has a Level-2 catalog but none are granted → View only.
        /// </summary>
        public static bool HasAction(
            ISet<string> normalizedPermissionUrls,
            string pageUrl,
            string? action)
        {
            var page = NormalizePageUrl(pageUrl);
            if (!normalizedPermissionUrls.Contains(page))
                return false;

            if (string.IsNullOrWhiteSpace(action)
                || string.Equals(action, View, StringComparison.OrdinalIgnoreCase))
                return true;

            var prefix = page + Separator;
            var hasAnyAction = false;
            foreach (var u in normalizedPermissionUrls)
            {
                if (!u.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
                    continue;
                hasAnyAction = true;
                if (string.Equals(u, NormalizePermissionUrl(ActionUrl(page, action)), StringComparison.OrdinalIgnoreCase))
                    return true;
            }

            if (hasAnyAction)
                return false;

            // Page has Level-2 actions in catalog but none granted → View only
            if (PageActions.TryGetValue(page, out var catalogActions) && catalogActions.Length > 0)
                return false;

            // Unknown / view-only pages → allow
            return true;
        }
    }
}
