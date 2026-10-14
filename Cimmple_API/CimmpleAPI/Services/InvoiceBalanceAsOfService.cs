using CimmpleAPI.Data;
using Microsoft.EntityFrameworkCore;

namespace CimmpleAPI.Services;

/// <summary>
/// Paid / open balance of customer and vendor invoices as of a given date, from dated payment transactions.
/// Invoice PaidAmount stays the source of truth for the current total; transactions decide when it was paid.
/// </summary>
public static class InvoiceBalanceAsOfService
{
    public readonly record struct PaymentEntry(DateTime Date, decimal Amount, int? VendorId);

    public sealed class PaymentLedger
    {
        private readonly Dictionary<string, List<PaymentEntry>> _byInvoiceNo;

        internal PaymentLedger(Dictionary<string, List<PaymentEntry>> byInvoiceNo)
        {
            _byInvoiceNo = byInvoiceNo;
        }

        /// <summary>Payments recorded against any of the invoice's numbers; other vendors' payments are skipped.</summary>
        public List<PaymentEntry> For(IEnumerable<string?> invoiceNumbers, int? vendorId = null)
        {
            var result = new List<PaymentEntry>();
            var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var raw in invoiceNumbers)
            {
                var key = raw?.Trim();
                if (string.IsNullOrEmpty(key) || !seen.Add(key))
                    continue;
                if (!_byInvoiceNo.TryGetValue(key, out var list))
                    continue;
                foreach (var payment in list)
                {
                    if (vendorId.HasValue && payment.VendorId is > 0 && payment.VendorId != vendorId)
                        continue;
                    result.Add(payment);
                }
            }
            return result;
        }
    }

    public static PaymentLedger LoadCustomerPayments(CimmpleDbContext db, int tenantId) =>
        LoadPayments(db, tenantId, customer: true);

    public static PaymentLedger LoadVendorPayments(CimmpleDbContext db, int tenantId) =>
        LoadPayments(db, tenantId, customer: false);

    private static PaymentLedger LoadPayments(CimmpleDbContext db, int tenantId, bool customer)
    {
        var query = db.Transactions.AsNoTracking()
            .Where(t => t.TenantId == tenantId &&
                        t.TransactionType != null &&
                        EF.Functions.Like(t.TransactionType, "%Payment%") &&
                        t.TransactionDate != null &&
                        t.invoiceNo != null &&
                        t.invoiceNo != "");
        query = customer
            ? query.Where(t => t.isCustomer == 1)
            : query.Where(t => t.isCustomer == 0 || t.isCustomer == null);

        var rows = query
            .Select(t => new { t.invoiceNo, t.TransactionDate, t.Amount, t.vendorid })
            .ToList();

        var map = new Dictionary<string, List<PaymentEntry>>(StringComparer.OrdinalIgnoreCase);
        foreach (var row in rows)
        {
            var key = row.invoiceNo!.Trim();
            if (key.Length == 0)
                continue;
            if (!map.TryGetValue(key, out var list))
            {
                list = new List<PaymentEntry>();
                map[key] = list;
            }
            list.Add(new PaymentEntry(row.TransactionDate!.Value, Math.Abs(row.Amount ?? 0m), row.vendorid));
        }

        return new PaymentLedger(map);
    }

    /// <summary>
    /// Amount paid on or before <paramref name="asOfDate"/>. Paid amounts with no matching transaction
    /// (legacy data) count from the invoice pay date, or the invoice date when no pay date is stored.
    /// </summary>
    public static decimal PaidAsOf(
        decimal totalAmount,
        decimal paidAmount,
        DateTime? paidDate,
        DateTime invoiceDate,
        IReadOnlyCollection<PaymentEntry> payments,
        DateTime asOfDate)
    {
        if (paidAmount <= 0m)
            return 0m;

        var cutoff = asOfDate.Date.AddDays(1);
        decimal tracked = 0m;
        decimal trackedAsOf = 0m;
        foreach (var payment in payments)
        {
            tracked += payment.Amount;
            if (payment.Date < cutoff)
                trackedAsOf += payment.Amount;
        }

        var untracked = Math.Max(0m, paidAmount - tracked);
        var untrackedAsOf = untracked > 0m && (paidDate ?? invoiceDate) < cutoff ? untracked : 0m;

        var paid = Math.Min(trackedAsOf + untrackedAsOf, paidAmount);
        return Math.Max(0m, Math.Min(paid, totalAmount));
    }

    public static decimal OpenAsOf(
        decimal totalAmount,
        decimal paidAmount,
        DateTime? paidDate,
        DateTime invoiceDate,
        IReadOnlyCollection<PaymentEntry> payments,
        DateTime asOfDate) =>
        Math.Max(0m, totalAmount - PaidAsOf(totalAmount, paidAmount, paidDate, invoiceDate, payments, asOfDate));

    public static IEnumerable<string?> CustomerInvoiceKeys(string? prefixInvoiceNo, int invoiceNo) =>
        // The plain number repeats every year; only use it when the invoice has no prefixed number.
        string.IsNullOrWhiteSpace(prefixInvoiceNo)
            ? new[] { invoiceNo.ToString() }
            : new[] { prefixInvoiceNo };

    public static IEnumerable<string?> VendorInvoiceKeys(string? prefixInvoiceNo, string? invoiceNo) =>
        new[] { prefixInvoiceNo, invoiceNo };
}
