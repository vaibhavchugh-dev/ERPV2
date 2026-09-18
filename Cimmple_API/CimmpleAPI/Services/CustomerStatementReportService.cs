using System.Text.Json;
using CimmpleAPI.Data;
using CimmpleAPI.Data.Models;
using Microsoft.EntityFrameworkCore;

namespace CimmpleAPI.Services;

/// <summary>
/// Customer statements: opening AR, period invoices/payments, closing balance per customer.
/// </summary>
public static class CustomerStatementReportService
{
    private const decimal Epsilon = 0.009m;

    public sealed class ActivityLineDto
    {
        public string Date { get; set; } = "";
        public string Type { get; set; } = "";
        public string Reference { get; set; } = "";
        public string Description { get; set; } = "";
        public decimal Charges { get; set; }
        public decimal Payments { get; set; }
        public decimal Balance { get; set; }
        public int? InvoiceId { get; set; }
        public int? TransactionId { get; set; }
        public string LinkPath { get; set; } = "/orders/customer-invoices";
    }

    public sealed class StatementDto
    {
        public int CustomerId { get; set; }
        public string CustomerName { get; set; } = "";
        public string CustomerCode { get; set; } = "";
        public decimal OpeningBalance { get; set; }
        public decimal ClosingBalance { get; set; }
        public List<ActivityLineDto> Activity { get; set; } = new();
    }

    public sealed class ResultDto
    {
        public string ReportType { get; set; } = "Customer Statements";
        public string PeriodStart { get; set; } = "";
        public string PeriodEnd { get; set; } = "";
        public int? LocationId { get; set; }
        public int? FilterCustomerId { get; set; }
        public List<StatementDto> Statements { get; set; } = new();
        public string? SummaryNote { get; set; }
    }

    public static ResultDto Build(
        CimmpleDbContext db,
        int tenantId,
        DateTime startDate,
        DateTime endDate,
        int? locationId = null,
        object? parameters = null)
    {
        var start = startDate.Date;
        var end = endDate.Date;
        var endInclusive = end.AddDays(1).AddTicks(-1);
        var filterCustomerId = TryGetCustomerId(parameters);

        // Invoice → customer via order
        var invoiceCustomerPairs = (
            from im in db.InvoiceMaster.AsNoTracking()
            join id in db.InvoiceDetail.AsNoTracking() on im.Id equals id.InvoiceId
            join co in db.CustomerOrder.AsNoTracking() on id.OrderId equals co.OrderID
            where im.TenantId == tenantId && !im.IsVoided && co.Tenantid == tenantId
            select new
            {
                im.Id,
                im.InvoiceNo,
                im.PrefixInvoiceNo,
                im.InvoiceDate,
                im.TotalAmount,
                im.PaidAmount,
                im.PaymentDate,
                co.CustomerID,
                co.CustomerName,
                co.customercode,
                co.locationId
            }
        ).ToList();

        if (locationId.HasValue)
            invoiceCustomerPairs = invoiceCustomerPairs.Where(x => x.locationId == locationId.Value).ToList();
        if (filterCustomerId.HasValue)
            invoiceCustomerPairs = invoiceCustomerPairs.Where(x => x.CustomerID == filterCustomerId.Value).ToList();

        var byCustomer = invoiceCustomerPairs
            .GroupBy(x => x.CustomerID)
            .ToList();

        // Also include customers from master if filtered and no invoices
        var statements = new List<StatementDto>();

        foreach (var group in byCustomer.OrderBy(g => g.First().CustomerName))
        {
            var customerId = group.Key;
            var sample = group.First();
            var distinctInvoices = group
                .GroupBy(x => x.Id)
                .Select(g => g.First())
                .ToList();

            var invoiceNos = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var inv in distinctInvoices)
            {
                invoiceNos.Add(inv.InvoiceNo.ToString());
                if (!string.IsNullOrWhiteSpace(inv.PrefixInvoiceNo))
                    invoiceNos.Add(inv.PrefixInvoiceNo.Trim());
            }

            // Opening: invoices before start with open balance contribution
            // Simplified: sum of invoice totals dated before start minus payments attributed before start
            decimal opening = 0;
            foreach (var inv in distinctInvoices.Where(i => i.InvoiceDate.Date < start))
            {
                opening += AccountingRules.OpenBalance(inv.TotalAmount, inv.PaidAmount);
                // If fully/partially paid and payment date is in-period, opening should include full then payments reduce in period —
                // better approach: opening = charges before start − payments before start
            }

            // Recalculate opening properly from activity before period
            decimal chargesBefore = distinctInvoices.Where(i => i.InvoiceDate.Date < start).Sum(i => i.TotalAmount);
            decimal paymentsBefore = 0;

            var paymentQuery = db.Transactions.AsNoTracking()
                .Where(t => t.TenantId == tenantId &&
                            t.isCustomer == 1 &&
                            t.TransactionType != null &&
                            EF.Functions.Like(t.TransactionType, "%Payment%") &&
                            t.TransactionDate != null);
            if (locationId.HasValue)
                paymentQuery = paymentQuery.Where(t => t.locationId == locationId.Value);

            var allPayments = paymentQuery.ToList()
                .Where(t =>
                {
                    var invNo = t.invoiceNo?.Trim() ?? "";
                    return invoiceNos.Contains(invNo) ||
                           (!string.IsNullOrEmpty(sample.CustomerName) &&
                            (t.Description ?? "").Contains(sample.CustomerName, StringComparison.OrdinalIgnoreCase));
                })
                .ToList();

            paymentsBefore = allPayments
                .Where(t => t.TransactionDate!.Value.Date < start)
                .Sum(t => t.Amount ?? 0);
            opening = Math.Max(0, chargesBefore - paymentsBefore);

            var activity = new List<ActivityLineDto>();
            decimal running = opening;

            foreach (var inv in distinctInvoices.Where(i => i.InvoiceDate.Date >= start && i.InvoiceDate.Date <= end)
                         .OrderBy(i => i.InvoiceDate))
            {
                running += inv.TotalAmount;
                activity.Add(new ActivityLineDto
                {
                    Date = inv.InvoiceDate.ToString("yyyy-MM-dd"),
                    Type = "Invoice",
                    Reference = !string.IsNullOrWhiteSpace(inv.PrefixInvoiceNo)
                        ? inv.PrefixInvoiceNo!
                        : inv.InvoiceNo.ToString(),
                    Description = "Sales invoice",
                    Charges = inv.TotalAmount,
                    Payments = 0,
                    Balance = running,
                    InvoiceId = inv.Id,
                    LinkPath = "/orders/customer-invoices"
                });
            }

            foreach (var pay in allPayments
                         .Where(t => t.TransactionDate!.Value.Date >= start && t.TransactionDate.Value.Date <= end)
                         .OrderBy(t => t.TransactionDate))
            {
                var amt = pay.Amount ?? 0;
                running -= amt;
                activity.Add(new ActivityLineDto
                {
                    Date = pay.TransactionDate!.Value.ToString("yyyy-MM-dd"),
                    Type = "Payment",
                    Reference = pay.invoiceNo ?? pay.CheckNo ?? "",
                    Description = pay.Description ?? "Payment received",
                    Charges = 0,
                    Payments = amt,
                    Balance = running,
                    TransactionId = pay.TransactionID,
                    LinkPath = "/orders/customer-invoices"
                });
            }

            activity = activity
                .OrderBy(a => a.Date)
                .ThenBy(a => a.Type == "Invoice" ? 0 : 1)
                .ToList();

            // Recompute running balance in sorted order
            running = opening;
            foreach (var line in activity)
            {
                running += line.Charges - line.Payments;
                line.Balance = running;
            }

            if (activity.Count == 0 && opening < Epsilon)
                continue;

            statements.Add(new StatementDto
            {
                CustomerId = customerId,
                CustomerName = sample.CustomerName ?? $"Customer {customerId}",
                CustomerCode = sample.customercode ?? "",
                OpeningBalance = opening,
                ClosingBalance = running,
                Activity = activity
            });
        }

        // If specific customer requested but no statement, still return empty shell from master
        if (filterCustomerId.HasValue && statements.Count == 0)
        {
            var cust = db.CustomerMaster.AsNoTracking()
                .FirstOrDefault(c => c.Tenantid == tenantId && c.customer_id == filterCustomerId.Value);
            if (cust != null)
            {
                statements.Add(new StatementDto
                {
                    CustomerId = cust.customer_id,
                    CustomerName = cust.company_name ?? $"{cust.firstname} {cust.last_name}".Trim(),
                    CustomerCode = cust.customercode ?? "",
                    OpeningBalance = 0,
                    ClosingBalance = 0,
                    Activity = new List<ActivityLineDto>()
                });
            }
        }

        return new ResultDto
        {
            ReportType = "Customer Statements",
            PeriodStart = start.ToString("yyyy-MM-dd"),
            PeriodEnd = end.ToString("yyyy-MM-dd"),
            LocationId = locationId,
            FilterCustomerId = filterCustomerId,
            Statements = statements,
            SummaryNote = statements.Count == 0
                ? "No customer invoice/payment activity in this period for the selected filters."
                : null
        };
    }

    private static int? TryGetCustomerId(object? parameters)
    {
        if (parameters == null) return null;
        try
        {
            if (parameters is JsonElement je)
            {
                if (je.ValueKind == JsonValueKind.Object)
                {
                    if (je.TryGetProperty("customerId", out var p) || je.TryGetProperty("CustomerId", out p))
                    {
                        if (p.ValueKind == JsonValueKind.Number && p.TryGetInt32(out var id) && id > 0)
                            return id;
                        if (p.ValueKind == JsonValueKind.String && int.TryParse(p.GetString(), out id) && id > 0)
                            return id;
                    }
                }
            }
            else if (parameters is IDictionary<string, object> dict)
            {
                foreach (var key in new[] { "customerId", "CustomerId" })
                {
                    if (dict.TryGetValue(key, out var v) && v != null &&
                        int.TryParse(v.ToString(), out var id) && id > 0)
                        return id;
                }
            }
            else
            {
                var json = JsonSerializer.Serialize(parameters);
                using var doc = JsonDocument.Parse(json);
                return TryGetCustomerId(doc.RootElement);
            }
        }
        catch
        {
            /* ignore */
        }
        return null;
    }
}
