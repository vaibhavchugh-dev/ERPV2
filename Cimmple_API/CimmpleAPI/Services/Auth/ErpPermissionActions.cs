using System.Text.Json;
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
        public const string Assign = "Assign";
        public const string Acknowledge = "Acknowledge";
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
                ["/workflow"] = new[] { Assign, Acknowledge },
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
                ["/accounts/banks"] = new[] { Add, Reconcile, Import, Export, Close, Delete },
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
        /// Reads (GET/HEAD) stay View even when the path contains words like Ship or Invoice.
        /// </summary>
        public static string? ResolveActionFromRequest(string httpMethod, string path)
        {
            var method = (httpMethod ?? "GET").ToUpperInvariant();
            var p = path ?? "";

            if (method is "GET" or "HEAD" or "OPTIONS")
            {
                if (Contains(p, "Download")) return Download;
                if (Contains(p, "Export")) return Export;
                if (Contains(p, "Print") || Contains(p, "Pdf") || Contains(p, "Generate")) return Print;
                return null;
            }

            // DeleteShipment / DeleteInvoice contain Ship/Invoice; the verb is Delete.
            if (method == "DELETE") return Delete;

            // Payroll cash posts. "Pay" is a prefix of "Payroll", and these names
            // must not be classified as Receive/Post by a later keyword.
            if (Contains(p, "PostTaxRemittance")) return Post;
            if (Contains(p, "PostPayment")) return Pay;

            if (Contains(p, "CreateJobOrderFromOrderDetail")) return CreateJob;
            if (Contains(p, "/Workflow/Assign") || Contains(p, "/Workflow/ResolveBlocker")) return Assign;
            if (Contains(p, "/Workflow/Acknowledge") || Contains(p, "/Workflow/Reject")) return Acknowledge;
            if (Contains(p, "CopyAttachments")) return Convert;
            if (Contains(p, "Convert")) return Convert;
            if (Contains(p, "Compare")) return Compare;
            if (Contains(p, "Duplicate") || Contains(p, "Clone")) return Contains(p, "Clone") ? Add : Duplicate;
            if (Contains(p, "Approve")) return Approve;
            if (Contains(p, "Reconcile")) return Reconcile;
            if (Contains(p, "Reverse")) return Reverse;
            if (Contains(p, "Void")) return Void;
            // SendShipment contains "Ship"; email must win over the Ship action.
            if (Contains(p, "TestSmtp")) return Send;
            if (Contains(p, "Send") || Contains(p, "Email") || Contains(p, "Reminder")) return Send;
            if (Contains(p, "Ship")) return Ship;
            if (Contains(p, "Receive") || Contains(p, "Receiving")) return Receive;
            if (Contains(p, "Transfer")) return Transfer;
            if (Contains(p, "Adjust") || Contains(p, "Adjustment")) return Adjust;
            if (Contains(p, "Reserve")) return Reserve;
            if (Contains(p, "Issue") && !Contains(p, "Invoice")) return Issue;
            // "Pay" is a prefix of "Payroll" — only real payment endpoints.
            // Must run before the Invoice rule: RecordCustomerPayment is a POST on InvoiceController.
            if (Contains(p, "Payment")) return Pay;
            // Direct vendor bills are Add on Vendor Invoices. PO billing stays Invoice.
            if (Contains(p, "CreateVendorInvoice") && Contains(p, "/VendorInvoice/")) return Add;
            if (Contains(p, "Invoice") && (Contains(p, "Create") || Contains(p, "Generate") || method == "POST"))
                return Invoice;
            if (Contains(p, "Post") && !Contains(p, "Postal")) return Post;
            if (Contains(p, "Import")) return Import;
            if (Contains(p, "Export")) return Export;
            // ReportSchedules API path contains "Schedule" but View/list is Level-1 only;
            // Schedule action belongs to Reports pages (create schedule from a report).
            if (Contains(p, "Schedule") && !Contains(p, "ReportSchedules")) return Schedule;
            if (Contains(p, "Upload")) return Upload;
            if (Contains(p, "Download")) return Download;
            if (Contains(p, "Print") || Contains(p, "Pdf")) return Print;
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

            // Documents has Manage, not Edit. Metadata updates and categories use Manage.
            if ((method is "PUT" or "PATCH") && Contains(p, "/Documents/")) return Manage;
            if (method == "POST" && Contains(p, "/Documents/") && Contains(p, "categories")) return Manage;

            if (method is "PUT" or "PATCH") return Edit;
            if (method == "POST")
            {
                // Calculate-only endpoints (payroll preview/parse). They do not write.
                if (Contains(p, "Preview") || Contains(p, "ParseImport")) return null;
                // Posting a journal is Post. Add remains an alternative in BuildAlternatives.
                if (Contains(p, "/JournalEntry/Create")) return Post;
                if (Contains(p, "Delete") || Contains(p, "Remove")) return Delete;
                if (Contains(p, "Update") || Contains(p, "Edit") || Contains(p, "Save"))
                {
                    if (Contains(p, "Create") || Contains(p, "Add") || Contains(p, "Insert") || Contains(p, "New"))
                        return Add;
                    return Edit;
                }
                if (Contains(p, "Create") || Contains(p, "Add") || Contains(p, "Insert") || Contains(p, "New") || Contains(p, "Clone"))
                    return Add;
                // Generic POST on a module → treat as Edit (mutate)
                return Edit;
            }

            return null;
        }

        public readonly record struct PermissionAlternative(string PageUrl, string? Action);

        /// <summary>
        /// Page/action pairs that may authorize the request (OR).
        /// Upsert saves use Add when the payload id is 0 and the page catalog includes Add.
        /// </summary>
        public static List<PermissionAlternative> BuildAlternatives(
            IReadOnlyList<string> pages,
            string? action,
            string path,
            string? payloadJson)
        {
            var list = new List<PermissionAlternative>();
            var resolved = action;
            var p = path ?? "";

            if (string.Equals(resolved, Edit, StringComparison.OrdinalIgnoreCase)
                && pages.Count > 0
                && IsUpsertSave(p)
                && TryReadNewRecord(p, payloadJson, out var isNew)
                && isNew
                && PageActions.TryGetValue(NormalizePageUrl(pages[0]), out var catalog)
                && catalog.Any(a => string.Equals(a, Add, StringComparison.OrdinalIgnoreCase)))
            {
                resolved = Add;
            }

            foreach (var page in pages)
            {
                list.Add(new PermissionAlternative(NormalizePageUrl(page), resolved));
            }

            // CQ/VQ Convert creates the order through SaveOrder / SaveVendorOrder.
            if (string.Equals(resolved, Add, StringComparison.OrdinalIgnoreCase)
                && TryReadPositive(payloadJson, "QuotationId", out _))
            {
                if (Contains(p, "SaveVendorOrder"))
                    list.Add(new PermissionAlternative("/quotations/vendor", Convert));
                else if (Contains(p, "SaveOrder"))
                    list.Add(new PermissionAlternative("/quotations/customer", Convert));
            }

            // Completing a job is SaveJobOrder. Complete is checked again in the controller
            // so a Complete-only caller cannot rewrite the rest of the job.
            if (Contains(p, "SaveJobOrder")
                && PayloadMentionsCompleted(payloadJson))
            {
                list.Add(new PermissionAlternative("/job-orders", Complete));
            }

            // New journal entries are posted immediately. Either Post or Add is enough.
            if (Contains(p, "/JournalEntry/Create"))
                list.Add(new PermissionAlternative("/accounts/journal-entries", Add));

            // New chart groups are created while adding or editing an account.
            if (Contains(p, "SaveMainGroup") || Contains(p, "SaveSubGroup"))
                list.Add(new PermissionAlternative("/masters/chartofaccounts", Add));

            return list;
        }

        public static bool IsPriceBreakdownSave(string? path) =>
            Contains(path ?? "", "SavePriceBreakdowns");

        /// <summary>
        /// Reads the batch. <paramref name="parsed"/> is false when the body is missing or not a JSON array.
        /// An empty array is a valid delete-all payload.
        /// </summary>
        public static (bool parsed, bool hasNew, bool hasExisting) ClassifyPriceBreakdownSave(string? payloadJson)
        {
            if (string.IsNullOrWhiteSpace(payloadJson)) return (false, false, false);
            try
            {
                using var doc = JsonDocument.Parse(payloadJson);
                if (doc.RootElement.ValueKind != JsonValueKind.Array) return (false, false, false);
                var hasNew = false;
                var hasExisting = false;
                foreach (var row in doc.RootElement.EnumerateArray())
                {
                    var id = ReadInt(row, "Id", "id");
                    if (id > 0) hasExisting = true;
                    else hasNew = true;
                }

                return (true, hasNew, hasExisting);
            }
            catch
            {
                return (false, false, false);
            }
        }

        /// <summary>
        /// Batch save sends the whole grid. New rows need Add, updates need Edit,
        /// and a delete-only payload (including deleting every row) needs Delete.
        /// </summary>
        public static bool PriceBreakdownSaveAllowed(
            ISet<string> normalizedPermissionUrls,
            bool hasNew,
            bool hasExisting)
        {
            const string page = "/masters/pricebreakdown";
            if (!normalizedPermissionUrls.Contains(page)) return false;
            var canAdd = HasAction(normalizedPermissionUrls, page, Add);
            var canEdit = HasAction(normalizedPermissionUrls, page, Edit);
            var canDelete = HasAction(normalizedPermissionUrls, page, Delete);
            if (!hasNew && !hasExisting) return canDelete;
            if (hasNew && !canAdd) return false;
            if (hasExisting && !canEdit && !canDelete) return false;
            return true;
        }

        public const string JobOrderPermCheckedKey = "ErpPerm.JobOrder.Checked";
        public const string JobOrderPermEditKey = "ErpPerm.JobOrder.Edit";
        public const string JobOrderPermCompleteKey = "ErpPerm.JobOrder.Complete";

        private static bool IsUpsertSave(string path) =>
            Contains(path, "Save")
            && !Contains(path, "SaveFile")
            && !Contains(path, "SaveSettings")
            && !Contains(path, "SaveCompanyInfo")
            && !Contains(path, "SaveAccountingSettings")
            && !Contains(path, "SaveReorderPolicy");

        private static bool TryReadNewRecord(string path, string? json, out bool isNew)
        {
            isNew = false;
            if (string.IsNullOrWhiteSpace(json)) return false;
            var names = IdPropertiesFor(path);
            if (names.Length == 0) return false;
            try
            {
                using var doc = JsonDocument.Parse(json);
                var root = doc.RootElement;
                if (root.ValueKind != JsonValueKind.Object) return false;
                var id = ReadInt(root, names);
                isNew = id <= 0;
                return true;
            }
            catch
            {
                return false;
            }
        }

        private static string[] IdPropertiesFor(string path)
        {
            if (Contains(path, "SaveVendorQuotation") || Contains(path, "SaveQuotation"))
                return new[] { "OrderID", "orderID" };
            if (Contains(path, "SaveVendorOrder") || Contains(path, "SaveOrder"))
                return new[] { "OrderID", "orderID" };
            if (Contains(path, "SaveJobOrder")) return new[] { "JobOrderID", "jobOrderID" };
            if (Contains(path, "SaveCustomerData")) return new[] { "customer_id", "CustomerId" };
            if (Contains(path, "SaveVendorData")) return new[] { "vendor_id", "VendorId" };
            if (Contains(path, "SaveEmployee")) return new[] { "User_UniqueID", "user_UniqueID" };
            if (Contains(path, "SaveLocation")) return new[] { "LocationId", "locationId" };
            if (Contains(path, "SaveChartofAccount")) return new[] { "AccountID", "accountID" };
            if (Contains(path, "SaveJobTemplate") || Contains(path, "SaveProcess")
                || Contains(path, "SaveWorkstation") || Contains(path, "SaveBankData")
                || Contains(path, "SaveCreditCard") || Contains(path, "SaveNCRCode")
                || Contains(path, "SaveRawMaterial") || Contains(path, "SaveCategory"))
                return new[] { "Id", "id" };
            return Array.Empty<string>();
        }

        private static bool TryReadPositive(string? json, string property, out int value)
        {
            value = 0;
            if (string.IsNullOrWhiteSpace(json)) return false;
            try
            {
                using var doc = JsonDocument.Parse(json);
                if (doc.RootElement.ValueKind != JsonValueKind.Object) return false;
                value = ReadInt(doc.RootElement, property);
                return value > 0;
            }
            catch
            {
                return false;
            }
        }

        private static int ReadInt(JsonElement obj, params string[] names)
        {
            if (obj.ValueKind != JsonValueKind.Object) return 0;
            foreach (var prop in obj.EnumerateObject())
            {
                foreach (var name in names)
                {
                    if (!prop.Name.Equals(name, StringComparison.OrdinalIgnoreCase)) continue;
                    if (prop.Value.ValueKind == JsonValueKind.Number && prop.Value.TryGetInt32(out var n))
                        return n;
                    if (prop.Value.ValueKind == JsonValueKind.String
                        && int.TryParse(prop.Value.GetString(), out var parsed))
                        return parsed;
                }
            }

            return 0;
        }

        private static bool PayloadMentionsCompleted(string? json)
        {
            if (string.IsNullOrWhiteSpace(json)) return false;
            return json.IndexOf("Completed", StringComparison.OrdinalIgnoreCase) >= 0;
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
