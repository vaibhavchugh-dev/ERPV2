using CimmpleAPI.Data;
using CimmpleAPI.Data.Models;
using Microsoft.EntityFrameworkCore;

namespace CimmpleAPI.Services;

/// <summary>
/// Direct-method cash flow: operating from customer/vendor payments;
/// investing/financing from deposits/withdrawals classified by COA MainGroup/AccountType.
/// </summary>
public static class CashFlowDirectReportService
{
    private const decimal Epsilon = 0.0001m;

    public sealed class LineDto
    {
        public string Date { get; set; } = "";
        public string Description { get; set; } = "";
        public string Reference { get; set; } = "";
        public string Category { get; set; } = "";
        public decimal Amount { get; set; }
        /// <summary>Payment / bank transaction id when available.</summary>
        public int? TransactionId { get; set; }
        /// <summary>Customer or vendor invoice the payment was applied to, when it can be matched.</summary>
        public int? InvoiceId { get; set; }
        public int? AccountId { get; set; }
        public bool? IsCustomer { get; set; }
        public string SourceType { get; set; } = "";
    }

    public sealed class SectionDto
    {
        public string SectionId { get; set; } = "";
        public string Title { get; set; } = "";
        public List<LineDto> Lines { get; set; } = new();
        public decimal Subtotal { get; set; }
    }

    public sealed class ResultDto
    {
        public string ReportType { get; set; } = "Cash Flow Statement";
        public string ReportBasis { get; set; } = "direct-cash";
        public string PeriodStart { get; set; } = "";
        public string PeriodEnd { get; set; } = "";
        public int? LocationId { get; set; }
        public List<SectionDto> Sections { get; set; } = new();
        public decimal OperatingActivities { get; set; }
        public decimal InvestingActivities { get; set; }
        public decimal FinancingActivities { get; set; }
        public decimal NetCashFlow { get; set; }
        public string? SummaryNote { get; set; }
    }

    public static ResultDto Build(CimmpleDbContext db, int tenantId, DateTime startDate, DateTime endDate, int? locationId = null)
    {
        var endInclusive = endDate.Date.AddDays(1).AddTicks(-1);
        var start = startDate.Date;

        var operatingLines = BuildOperatingLines(db, tenantId, start, endInclusive, locationId);
        var investingLines = new List<LineDto>();
        var financingLines = new List<LineDto>();
        BuildInvestingFinancingLines(db, tenantId, start, endInclusive, locationId, investingLines, financingLines);

        var operating = operatingLines.Sum(l => l.Amount);
        var investing = investingLines.Sum(l => l.Amount);
        var financing = financingLines.Sum(l => l.Amount);
        var net = operating + investing + financing;

        var sections = new List<SectionDto>
        {
            new()
            {
                SectionId = "operating",
                Title = "Operating Activities",
                Lines = operatingLines,
                Subtotal = operating
            },
            new()
            {
                SectionId = "investing",
                Title = "Investing Activities",
                Lines = investingLines,
                Subtotal = investing
            },
            new()
            {
                SectionId = "financing",
                Title = "Financing Activities",
                Lines = financingLines,
                Subtotal = financing
            }
        };

        var hasAny = Math.Abs(net) >= Epsilon || sections.Any(s => s.Lines.Count > 0);

        return new ResultDto
        {
            ReportType = "Cash Flow Statement",
            ReportBasis = "direct-cash",
            PeriodStart = start.ToString("yyyy-MM-dd"),
            PeriodEnd = endDate.Date.ToString("yyyy-MM-dd"),
            LocationId = locationId,
            Sections = sections,
            OperatingActivities = operating,
            InvestingActivities = investing,
            FinancingActivities = financing,
            NetCashFlow = net,
            SummaryNote = hasAny
                ? null
                : "No cash payment or classified investing/financing activity in this period. Operating cash uses customer/vendor Payment transactions; investing/financing use deposits/withdrawals linked to fixed-asset, investment, equity, or loan COA accounts."
        };
    }

    private static List<LineDto> BuildOperatingLines(
        CimmpleDbContext db, int tenantId, DateTime start, DateTime endInclusive, int? locationId)
    {
        var lines = new List<LineDto>();

        var cashInQuery = db.Transactions.AsNoTracking()
            .Where(t => t.TenantId == tenantId &&
                        t.isCustomer == 1 &&
                        t.TransactionType != null &&
                        EF.Functions.Like(t.TransactionType, "%Payment%") &&
                        t.TransactionDate != null &&
                        t.TransactionDate >= start &&
                        t.TransactionDate <= endInclusive);
        if (locationId.HasValue)
            cashInQuery = cashInQuery.Where(t => t.locationId == locationId.Value);

        var customerPayments = cashInQuery.OrderBy(t => t.TransactionDate).ThenBy(t => t.TransactionID).ToList();
        var customerInvoiceIds = LoadCustomerInvoiceIds(db, tenantId, customerPayments);

        foreach (var t in customerPayments)
        {
            var amt = t.Amount ?? 0;
            if (Math.Abs(amt) < Epsilon) continue;
            lines.Add(new LineDto
            {
                Date = t.TransactionDate!.Value.ToString("yyyy-MM-dd"),
                Description = t.Description ?? "Customer payment",
                Reference = t.invoiceNo ?? t.CheckNo ?? "",
                Category = "Cash received from customers",
                Amount = amt,
                TransactionId = t.TransactionID,
                InvoiceId = customerInvoiceIds.TryGetValue(t.invoiceNo?.Trim() ?? "", out var customerInvoiceId)
                    ? customerInvoiceId
                    : null,
                IsCustomer = true,
                SourceType = "payment"
            });
        }

        // Card payments credit the card liability; cash leaves only when the card bill is paid.
        var cashOutQuery = db.Transactions.AsNoTracking()
            .Where(t => t.TenantId == tenantId &&
                        (t.isCustomer == 0 || t.isCustomer == null) &&
                        (t.PaymentMethod == null || t.PaymentMethod != "Credit Card") &&
                        t.TransactionType != null &&
                        EF.Functions.Like(t.TransactionType, "%Payment%") &&
                        t.TransactionDate != null &&
                        t.TransactionDate >= start &&
                        t.TransactionDate <= endInclusive);
        if (locationId.HasValue)
            cashOutQuery = cashOutQuery.Where(t => t.locationId == locationId.Value);

        var vendorPayments = cashOutQuery.OrderBy(t => t.TransactionDate).ThenBy(t => t.TransactionID).ToList();
        var resolveVendorInvoiceId = BuildVendorInvoiceIdResolver(db, tenantId, vendorPayments);

        foreach (var t in vendorPayments)
        {
            var amt = t.Amount ?? 0;
            if (Math.Abs(amt) < Epsilon) continue;
            lines.Add(new LineDto
            {
                Date = t.TransactionDate!.Value.ToString("yyyy-MM-dd"),
                Description = t.Description ?? "Vendor payment",
                Reference = t.invoiceNo ?? t.CheckNo ?? "",
                Category = "Cash paid to vendors",
                Amount = -amt,
                TransactionId = t.TransactionID,
                InvoiceId = resolveVendorInvoiceId(t),
                IsCustomer = false,
                SourceType = "payment"
            });
        }

        return lines;
    }

    private static Dictionary<string, int> LoadCustomerInvoiceIds(
        CimmpleDbContext db, int tenantId, IEnumerable<Transactions> payments)
    {
        var refs = payments
            .Select(t => t.invoiceNo?.Trim())
            .Where(no => !string.IsNullOrEmpty(no))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
        if (refs.Count == 0)
            return new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);

        return db.InvoiceMaster.AsNoTracking()
            .Where(im => im.TenantId == tenantId && refs.Contains(im.PrefixInvoiceNo))
            .Select(im => new { im.PrefixInvoiceNo, im.Id })
            .ToList()
            .GroupBy(x => x.PrefixInvoiceNo.Trim(), StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => g.First().Id, StringComparer.OrdinalIgnoreCase);
    }

    /// <summary>Vendor invoice numbers are only unique per vendor; match on vendor when the payment has one.</summary>
    private static Func<Transactions, int?> BuildVendorInvoiceIdResolver(
        CimmpleDbContext db, int tenantId, IEnumerable<Transactions> payments)
    {
        var refs = payments
            .Select(t => t.invoiceNo?.Trim())
            .Where(no => !string.IsNullOrEmpty(no))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
        if (refs.Count == 0)
            return _ => null;

        var invoices = db.VendorInvoiceMaster.AsNoTracking()
            .Where(v => v.TenantId == tenantId &&
                        (refs.Contains(v.prefixinvoiceno) || refs.Contains(v.InvoiceNo)))
            .Select(v => new { v.Id, v.vid, v.prefixinvoiceno, v.InvoiceNo })
            .ToList();

        var byNo = new Dictionary<string, List<(int Id, int Vid)>>(StringComparer.OrdinalIgnoreCase);
        foreach (var v in invoices)
        {
            foreach (var no in new[] { v.prefixinvoiceno, v.InvoiceNo })
            {
                if (string.IsNullOrWhiteSpace(no))
                    continue;
                var key = no.Trim();
                if (!byNo.TryGetValue(key, out var list))
                {
                    list = new List<(int Id, int Vid)>();
                    byNo[key] = list;
                }
                if (!list.Any(x => x.Id == v.Id))
                    list.Add((v.Id, v.vid));
            }
        }

        return t =>
        {
            var key = t.invoiceNo?.Trim();
            if (string.IsNullOrEmpty(key) || !byNo.TryGetValue(key, out var matches))
                return null;
            if (t.vendorid is > 0)
            {
                var forVendor = matches.Where(m => m.Vid == t.vendorid).ToList();
                return forVendor.Count == 1 ? forVendor[0].Id : null;
            }
            return matches.Count == 1 ? matches[0].Id : null;
        };
    }

    private static void BuildInvestingFinancingLines(
        CimmpleDbContext db,
        int tenantId,
        DateTime start,
        DateTime endInclusive,
        int? locationId,
        List<LineDto> investing,
        List<LineDto> financing)
    {
        var coa = db.ChartofAccounts.AsNoTracking()
            .Where(c => c.Tenantid == tenantId)
            .ToDictionary(c => c.AccountID);

        var txQuery = db.Transactions.AsNoTracking()
            .Where(t => t.TenantId == tenantId &&
                        t.TransactionDate != null &&
                        t.TransactionDate >= start &&
                        t.TransactionDate <= endInclusive);
        if (locationId.HasValue)
            txQuery = txQuery.Where(t => t.locationId == locationId.Value);

        var txs = txQuery.ToDictionary(t => t.TransactionID);

        var deposits = db.Deposits.AsNoTracking()
            .Where(d => d.TenantID == tenantId && txs.Keys.Contains(d.TransactionID))
            .ToList();
        var withdrawals = db.Withdrawals.AsNoTracking()
            .Where(w => w.TenantID == tenantId && txs.Keys.Contains(w.TransactionID))
            .ToList();

        void AddLine(Transactions? t, ChartofAccounts account, decimal signedAmount, string bucket)
        {
            if (Math.Abs(signedAmount) < Epsilon) return;
            var line = new LineDto
            {
                Date = t?.TransactionDate?.ToString("yyyy-MM-dd") ?? "",
                Description = $"{account.AccountCode} — {account.AccountName}",
                Reference = t?.invoiceNo ?? t?.CheckNo ?? "",
                Category = account.MainGroup ?? account.AccountType ?? "",
                Amount = signedAmount,
                TransactionId = t?.TransactionID,
                AccountId = account.AccountID,
                SourceType = "coa-cash"
            };
            if (bucket == "investing") investing.Add(line);
            else financing.Add(line);
        }

        foreach (var d in deposits)
        {
            if (!coa.TryGetValue(d.AccountID, out var account)) continue;
            var bucket = ClassifyCashBucket(account);
            if (bucket == null) continue;
            txs.TryGetValue(d.TransactionID, out var t);
            // Deposit into investing/financing account ≈ cash outflow to acquire (negative) unless it's equity/loan inflow to cash.
            // Convention: deposit to asset = investing outflow (-); deposit to liability/equity = financing inflow (+).
            var amt = IsFinancingCreditNormal(account) ? d.Amount : -d.Amount;
            AddLine(t, account, amt, bucket);
        }

        foreach (var w in withdrawals)
        {
            if (!coa.TryGetValue(w.AccountID, out var account)) continue;
            var bucket = ClassifyCashBucket(account);
            if (bucket == null) continue;
            txs.TryGetValue(w.TransactionID, out var t);
            // Withdrawal from asset = investing inflow (+ sale); withdrawal reducing liability = financing outflow.
            var amt = IsFinancingCreditNormal(account) ? -w.Amount : w.Amount;
            AddLine(t, account, amt, bucket);
        }

        investing.Sort((a, b) => string.Compare(a.Date, b.Date, StringComparison.Ordinal));
        financing.Sort((a, b) => string.Compare(a.Date, b.Date, StringComparison.Ordinal));
    }

    /// <summary>Returns "investing", "financing", or null for operating/cash accounts.</summary>
    public static string? ClassifyCashBucket(ChartofAccounts coa)
    {
        var type = (coa.AccountType ?? "").ToLowerInvariant();
        var mg = (coa.MainGroup ?? "").ToLowerInvariant();
        var name = (coa.AccountName ?? "").ToLowerInvariant();

        // Skip pure cash / bank / AR / AP / current operating accounts
        if (mg.Contains("cash") || mg.Contains("bank") || name.Contains("checking") || name.Contains("petty cash"))
            return null;
        if (mg.Contains("receivable") || mg.Contains("payable") || mg.Contains("inventory"))
            return null;

        if (type.Contains("asset"))
        {
            if (mg.Contains("fixed") || mg.Contains("property") || mg.Contains("equipment") ||
                mg.Contains("plant") || mg.Contains("pp&e") || mg.Contains("investment") ||
                mg.Contains("intangible") || name.Contains("investment"))
                return "investing";
            return null;
        }

        if (type.Contains("liabilit") || type.Contains("equity"))
        {
            if (mg.Contains("long-term") || mg.Contains("long term") || mg.Contains("loan") ||
                mg.Contains("note") || mg.Contains("equity") || mg.Contains("capital") ||
                mg.Contains("financing") || name.Contains("loan") || type.Contains("equity"))
                return "financing";
        }

        return null;
    }

    private static bool IsFinancingCreditNormal(ChartofAccounts coa)
    {
        var type = (coa.AccountType ?? "").ToLowerInvariant();
        return type.Contains("liabilit") || type.Contains("equity");
    }
}
