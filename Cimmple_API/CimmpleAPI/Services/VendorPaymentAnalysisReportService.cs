using CimmpleAPI.Data;
using Microsoft.EntityFrameworkCore;

namespace CimmpleAPI.Services;

/// <summary>
/// Vendor payment analysis: cash paid by vendor in period plus open AP snapshot.
/// </summary>
public static class VendorPaymentAnalysisReportService
{
    private const decimal Epsilon = 0.009m;

    public sealed class VendorRowDto
    {
        public int VendorId { get; set; }
        public string VendorName { get; set; } = "";
        public string VendorCode { get; set; } = "";
        public decimal PaymentsInPeriod { get; set; }
        public int PaymentCount { get; set; }
        public decimal OpenApBalance { get; set; }
        public decimal InvoicesPaidAmountInPeriod { get; set; }
    }

    public sealed class ResultDto
    {
        public string ReportType { get; set; } = "Vendor Payment Analysis";
        public string PeriodStart { get; set; } = "";
        public string PeriodEnd { get; set; } = "";
        public int? LocationId { get; set; }
        public List<VendorRowDto> Vendors { get; set; } = new();
        public decimal TotalPaymentsInPeriod { get; set; }
        public decimal TotalOpenAp { get; set; }
        public string? SummaryNote { get; set; }
    }

    public static ResultDto Build(
        CimmpleDbContext db, int tenantId, DateTime startDate, DateTime endDate, int? locationId = null)
    {
        var start = startDate.Date;
        var endInclusive = endDate.Date.AddDays(1).AddTicks(-1);

        var paymentQuery = db.Transactions.AsNoTracking()
            .Where(t => t.TenantId == tenantId &&
                        (t.isCustomer == 0 || t.isCustomer == null) &&
                        t.TransactionType != null &&
                        EF.Functions.Like(t.TransactionType, "%Payment%") &&
                        t.TransactionDate != null &&
                        t.TransactionDate >= start &&
                        t.TransactionDate <= endInclusive);
        if (locationId.HasValue)
            paymentQuery = paymentQuery.Where(t => t.locationId == locationId.Value);

        var payments = paymentQuery.ToList();

        var vendorInvoicesQuery = db.VendorInvoiceMaster.AsNoTracking()
            .Where(vim => vim.TenantId == tenantId && vim.voideddate == null);
        if (locationId.HasValue)
            vendorInvoicesQuery = vendorInvoicesQuery.Where(vim => vim.locationId == locationId.Value);
        var vendorInvoices = vendorInvoicesQuery.ToList();

        var vendorNames = vendorInvoices
            .GroupBy(v => v.vid)
            .ToDictionary(
                g => g.Key,
                g => (
                    Name: g.Select(x => x.VendorName).FirstOrDefault(n => !string.IsNullOrWhiteSpace(n)) ?? $"Vendor {g.Key}",
                    Code: g.Select(x => x.VendorCode).FirstOrDefault(c => !string.IsNullOrWhiteSpace(c)) ?? ""
                ));

        // Map payments: prefer vendorid; else match invoiceNo to vendor invoice
        var invoiceToVendor = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        foreach (var vim in vendorInvoices)
        {
            if (!string.IsNullOrWhiteSpace(vim.InvoiceNo))
                invoiceToVendor[vim.InvoiceNo.Trim()] = vim.vid;
            if (!string.IsNullOrWhiteSpace(vim.prefixinvoiceno))
                invoiceToVendor[vim.prefixinvoiceno.Trim()] = vim.vid;
        }

        var payByVendor = new Dictionary<int, (decimal Amount, int Count)>();
        foreach (var t in payments)
        {
            var vid = t.vendorid ?? 0;
            if (vid <= 0)
            {
                var invNo = t.invoiceNo?.Trim() ?? "";
                if (!string.IsNullOrEmpty(invNo) && invoiceToVendor.TryGetValue(invNo, out var mapped))
                    vid = mapped;
            }
            if (vid <= 0)
            {
                // Unmatched bucket
                vid = -1;
            }

            if (!payByVendor.TryGetValue(vid, out var agg))
                agg = (0, 0);
            payByVendor[vid] = (agg.Amount + (t.Amount ?? 0), agg.Count + 1);
        }

        var openByVendor = vendorInvoices
            .Where(v => v.PaidAmount < v.TotalAmount - Epsilon)
            .GroupBy(v => v.vid)
            .ToDictionary(
                g => g.Key,
                g => g.Sum(v => AccountingRules.OpenBalance(v.TotalAmount, v.PaidAmount)));

        var paidInPeriodByVendor = vendorInvoices
            .Where(v => v.Paydate != null && v.Paydate.Value.Date >= start && v.Paydate.Value.Date <= endDate.Date)
            .GroupBy(v => v.vid)
            .ToDictionary(g => g.Key, g => g.Sum(v => v.PaidAmount > 0 ? v.PaidAmount : v.TotalAmount));

        var vendorIds = payByVendor.Keys
            .Union(openByVendor.Keys)
            .Union(paidInPeriodByVendor.Keys)
            .Where(id => id != 0)
            .Distinct()
            .ToList();

        var rows = new List<VendorRowDto>();
        foreach (var vid in vendorIds)
        {
            payByVendor.TryGetValue(vid, out var pay);
            openByVendor.TryGetValue(vid, out var open);
            paidInPeriodByVendor.TryGetValue(vid, out var invPaid);

            string name;
            string code;
            if (vid < 0)
            {
                name = "Unmatched payments";
                code = "";
            }
            else if (vendorNames.TryGetValue(vid, out var meta))
            {
                name = meta.Name;
                code = meta.Code;
            }
            else
            {
                name = $"Vendor {vid}";
                code = "";
            }

            if (pay.Amount < Epsilon && open < Epsilon && invPaid < Epsilon)
                continue;

            rows.Add(new VendorRowDto
            {
                VendorId = vid,
                VendorName = name,
                VendorCode = code,
                PaymentsInPeriod = pay.Amount,
                PaymentCount = pay.Count,
                OpenApBalance = open,
                InvoicesPaidAmountInPeriod = invPaid
            });
        }

        rows = rows
            .OrderByDescending(r => r.PaymentsInPeriod)
            .ThenBy(r => r.VendorName)
            .ToList();

        return new ResultDto
        {
            ReportType = "Vendor Payment Analysis",
            PeriodStart = start.ToString("yyyy-MM-dd"),
            PeriodEnd = endDate.Date.ToString("yyyy-MM-dd"),
            LocationId = locationId,
            Vendors = rows,
            TotalPaymentsInPeriod = rows.Sum(r => r.PaymentsInPeriod),
            TotalOpenAp = rows.Sum(r => r.OpenApBalance),
            SummaryNote = rows.Count == 0
                ? "No vendor payment or open AP activity for this period/location."
                : null
        };
    }
}
