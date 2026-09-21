using CimmpleAPI.Data;
using Microsoft.EntityFrameworkCore;

namespace CimmpleAPI.Services;

/// <summary>
/// Customer analytics operational reports (profitability, LTV, orders, top customers, payment behavior).
/// Invoice location is applied via InvoiceDetail → CustomerOrder.locationId. Invoice totals are
/// counted once per distinct invoice (no double-count when joining details).
/// </summary>
public static class CustomerReportsService
{
    public static ReportResultDto BuildCustomerProfitability(
        CimmpleDbContext db,
        int tenantId,
        DateTime startDate,
        DateTime endDate,
        int? locationId = null)
    {
        var start = startDate.Date;
        var endExclusive = endDate.Date.AddDays(1);
        var report = ReportResultFactory.Create(
            "customer-profitability",
            "Customer Profitability Analysis",
            startDate.Date,
            endDate.Date,
            locationId);

        var invoices = LoadDistinctInvoices(db, tenantId, start, endExclusive, locationId);

        var byCustomer = invoices
            .GroupBy(i => new { i.CustomerId, i.CustomerName })
            .Select(g => new
            {
                Customer = string.IsNullOrWhiteSpace(g.Key.CustomerName)
                    ? $"Customer #{g.Key.CustomerId}"
                    : g.Key.CustomerName,
                Revenue = g.Sum(x => x.TotalAmount),
                Invoices = g.Count(),
            })
            .OrderByDescending(x => x.Revenue)
            .ThenBy(x => x.Customer)
            .ToList();

        report.AddStat("Revenue", ReportResultFactory.Money(byCustomer.Sum(x => x.Revenue)));
        report.AddStat("Customers", ReportResultFactory.Num(byCustomer.Count));
        report.AddStat("Invoices", ReportResultFactory.Num(invoices.Count));
        report.SummaryNote =
            "Gross billed revenue (COGS allocation not fully modeled). Material cost approximation skipped (treated as 0).";

        var section = ReportResultFactory.Section(
                "Revenue by Customer",
                "Customer", "Revenue", "Invoices")
            .WithNumeric(1, 2);
        foreach (var row in byCustomer)
            section.AddRow(row.Customer, ReportResultFactory.Money(row.Revenue), ReportResultFactory.Num(row.Invoices));
        report.Sections.Add(section);

        return report;
    }

    public static ReportResultDto BuildCustomerLifetimeValue(
        CimmpleDbContext db,
        int tenantId,
        DateTime startDate,
        DateTime endDate,
        int? locationId = null)
    {
        // All-time revenue; PeriodStart/End retained as filter context only.
        var report = ReportResultFactory.Create(
            "customer-lifetime-value",
            "Customer Lifetime Value",
            startDate.Date,
            endDate.Date,
            locationId);

        var invoices = LoadDistinctInvoices(db, tenantId, start: null, endExclusive: null, locationId);

        var byCustomer = invoices
            .GroupBy(i => new { i.CustomerId, i.CustomerName })
            .Select(g => new
            {
                Customer = string.IsNullOrWhiteSpace(g.Key.CustomerName)
                    ? $"Customer #{g.Key.CustomerId}"
                    : g.Key.CustomerName,
                LifetimeRevenue = g.Sum(x => x.TotalAmount),
                Invoices = g.Count(),
                FirstInvoice = g.Min(x => x.InvoiceDate),
                LastInvoice = g.Max(x => x.InvoiceDate),
            })
            .OrderByDescending(x => x.LifetimeRevenue)
            .ThenBy(x => x.Customer)
            .ToList();

        report.AddStat("Customers", ReportResultFactory.Num(byCustomer.Count));
        report.AddStat("Lifetime Revenue", ReportResultFactory.Money(byCustomer.Sum(x => x.LifetimeRevenue)));
        report.AddStat("Invoices", ReportResultFactory.Num(invoices.Count));
        report.SummaryNote =
            "All-time billed revenue and invoice activity by customer (period dates shown for context only). Location filter still applied.";

        var section = ReportResultFactory.Section(
                "Customer Lifetime Value",
                "Customer", "Lifetime Revenue", "Invoices", "First Invoice", "Last Invoice")
            .WithNumeric(1, 2);
        foreach (var row in byCustomer)
        {
            section.AddRow(
                row.Customer,
                ReportResultFactory.Money(row.LifetimeRevenue),
                ReportResultFactory.Num(row.Invoices),
                row.FirstInvoice.ToString("yyyy-MM-dd"),
                row.LastInvoice.ToString("yyyy-MM-dd"));
        }

        report.Sections.Add(section);
        return report;
    }

    public static ReportResultDto BuildCustomerOrderHistory(
        CimmpleDbContext db,
        int tenantId,
        DateTime startDate,
        DateTime endDate,
        int? locationId = null)
    {
        var start = startDate.Date;
        var endExclusive = endDate.Date.AddDays(1);
        var report = ReportResultFactory.Create(
            "customer-order-history",
            "Customer Order History Trends",
            startDate.Date,
            endDate.Date,
            locationId);

        var ordersQuery = db.CustomerOrder.AsNoTracking()
            .Where(o => o.Tenantid == tenantId
                        && o.OrderDate >= start
                        && o.OrderDate < endExclusive);
        if (locationId.HasValue && locationId.Value > 0)
            ordersQuery = ordersQuery.Where(o => o.locationId == locationId.Value);

        var orders = ordersQuery
            .Select(o => new
            {
                o.OrderID,
                o.PONumber,
                o.CustomerID,
                CustomerName = o.CustomerName ?? "",
                o.OrderDate,
                o.TotalAmount,
                Status = o.Status ?? ""
            })
            .ToList();

        var byCustomer = orders
            .GroupBy(o => new { o.CustomerID, o.CustomerName })
            .Select(g => new
            {
                g.Key.CustomerID,
                Customer = string.IsNullOrWhiteSpace(g.Key.CustomerName)
                    ? $"Customer #{g.Key.CustomerID}"
                    : g.Key.CustomerName,
                Orders = g.Count(),
                OrderValue = g.Sum(x => x.TotalAmount),
                LastOrder = g.Max(x => x.OrderDate),
                Items = g.OrderByDescending(x => x.OrderDate).ToList()
            })
            .OrderByDescending(x => x.OrderValue)
            .ThenBy(x => x.Customer)
            .ToList();

        report.AddStat("Customers", ReportResultFactory.Num(byCustomer.Count));
        report.AddStat("Orders", ReportResultFactory.Num(orders.Count));
        report.AddStat("Order Value", ReportResultFactory.Money(byCustomer.Sum(x => x.OrderValue)));

        var section = ReportResultFactory.Section(
                "Orders by Customer",
                "Customer", "Orders", "Order Value", "Last Order")
            .WithNumeric(1, 2);
        foreach (var row in byCustomer)
        {
            section.AddRow(
                new ReportRowMetaDto
                {
                    EntityType = "customer",
                    EntityId = row.CustomerID > 0 ? row.CustomerID : null,
                    Title = row.Customer,
                    LinkPath = "/orders/customer",
                    Details = row.Items.Select(o => new ReportDrillItemDto
                    {
                        Label = FormatCustomerOrderNo(o.PONumber),
                        SubLabel = string.IsNullOrWhiteSpace(o.Status) ? "—" : o.Status,
                        Date = o.OrderDate.ToString("yyyy-MM-dd"),
                        Amount = ReportResultFactory.Money(o.TotalAmount),
                        Status = o.Status,
                        EntityId = o.OrderID,
                        LinkPath = "/orders/customer"
                    }).ToList()
                },
                row.Customer,
                ReportResultFactory.Num(row.Orders),
                ReportResultFactory.Money(row.OrderValue),
                row.LastOrder.ToString("yyyy-MM-dd"));
        }

        report.Sections.Add(section);
        return report;
    }

    public static ReportResultDto BuildTopCustomers(
        CimmpleDbContext db,
        int tenantId,
        DateTime startDate,
        DateTime endDate,
        int? locationId = null)
    {
        var start = startDate.Date;
        var endExclusive = endDate.Date.AddDays(1);
        var report = ReportResultFactory.Create(
            "top-customers",
            "Top Customers by Revenue",
            startDate.Date,
            endDate.Date,
            locationId);

        var invoices = LoadDistinctInvoices(db, tenantId, start, endExclusive, locationId);

        // Distinct OrderId counts via invoice details (one pass over details for invoices in set)
        var invoiceIds = invoices.Select(i => i.InvoiceId).ToHashSet();
        var orderPairs = (
            from id in db.InvoiceDetail.AsNoTracking()
            where invoiceIds.Contains(id.InvoiceId)
            select new { id.InvoiceId, id.OrderId }
        ).ToList();

        var ordersByInvoice = orderPairs
            .GroupBy(x => x.InvoiceId)
            .ToDictionary(g => g.Key, g => g.Select(x => x.OrderId).Distinct().ToList());

        var top = invoices
            .GroupBy(i => new { i.CustomerId, i.CustomerName })
            .Select(g =>
            {
                var orderIds = g
                    .SelectMany(inv => ordersByInvoice.TryGetValue(inv.InvoiceId, out var list) ? list : Enumerable.Empty<int>())
                    .Distinct()
                    .Count();
                return new
                {
                    g.Key.CustomerId,
                    Customer = string.IsNullOrWhiteSpace(g.Key.CustomerName)
                        ? $"Customer #{g.Key.CustomerId}"
                        : g.Key.CustomerName,
                    Revenue = g.Sum(x => x.TotalAmount),
                    Invoices = g.Count(),
                    Orders = orderIds,
                    Items = g.OrderByDescending(x => x.InvoiceDate).ToList()
                };
            })
            .OrderByDescending(x => x.Revenue)
            .ThenBy(x => x.Customer)
            .Take(25)
            .ToList();

        report.AddStat("Top Customers", ReportResultFactory.Num(top.Count));
        report.AddStat("Revenue (Top 25)", ReportResultFactory.Money(top.Sum(x => x.Revenue)));

        var section = ReportResultFactory.Section(
                "Top 25 Customers",
                "Customer", "Revenue", "Invoices", "Orders")
            .WithNumeric(1, 2, 3);
        foreach (var row in top)
        {
            section.AddRow(
                new ReportRowMetaDto
                {
                    EntityType = "customer",
                    EntityId = row.CustomerId > 0 ? row.CustomerId : null,
                    Title = row.Customer,
                    LinkPath = "/orders/customer-invoices",
                    Details = row.Items.Select(inv => new ReportDrillItemDto
                    {
                        Label = FormatInvoiceNo(inv.PrefixInvoiceNo, inv.InvoiceNo),
                        SubLabel = inv.InvoiceDate.ToString("yyyy-MM-dd"),
                        Date = inv.InvoiceDate.ToString("yyyy-MM-dd"),
                        Amount = ReportResultFactory.Money(inv.TotalAmount),
                        Status = ResolvePaymentStatus(inv, EffectivePaidAmount(inv)),
                        EntityId = inv.InvoiceId,
                        LinkPath = "/orders/customer-invoices"
                    }).ToList()
                },
                row.Customer,
                ReportResultFactory.Money(row.Revenue),
                ReportResultFactory.Num(row.Invoices),
                ReportResultFactory.Num(row.Orders));
        }

        report.Sections.Add(section);
        return report;
    }

    public static ReportResultDto BuildCustomerPaymentBehavior(
        CimmpleDbContext db,
        int tenantId,
        DateTime startDate,
        DateTime endDate,
        int? locationId = null)
    {
        var start = startDate.Date;
        var endExclusive = endDate.Date.AddDays(1);
        var report = ReportResultFactory.Create(
            "customer-payment-behavior",
            "Customer Payment Behavior",
            startDate.Date,
            endDate.Date,
            locationId);

        var invoices = LoadDistinctInvoices(db, tenantId, start, endExclusive, locationId);

        var fullyPaid = invoices.Where(i => IsFullyPaid(i)).ToList();
        var partial = invoices.Where(i => IsPartialPaid(i)).ToList();
        var unpaid = invoices.Count(i => EffectivePaidAmount(i) <= 0.009m);
        var late = fullyPaid.Count(i => i.PaymentDate.HasValue && i.PaymentDate!.Value.Date > i.DueDate.Date);
        var daysToPay = fullyPaid
            .Where(i => i.PaymentDate.HasValue)
            .Select(i => (i.PaymentDate!.Value.Date - i.InvoiceDate.Date).TotalDays)
            .ToList();
        var avgDays = daysToPay.Count > 0 ? daysToPay.Average() : 0d;
        var pctLate = fullyPaid.Count > 0 ? (decimal)late / fullyPaid.Count * 100m : 0m;

        report.AddStat("Invoices", ReportResultFactory.Num(invoices.Count));
        report.AddStat("Unpaid", ReportResultFactory.Num(unpaid), warn: unpaid > 0);
        report.AddStat("Partial", ReportResultFactory.Num(partial.Count), warn: partial.Count > 0);
        report.AddStat("% Paid Late", ReportResultFactory.Pct(pctLate), warn: late > 0);
        report.AddStat("Avg Days to Pay", ReportResultFactory.Days(avgDays));

        var section = ReportResultFactory.Section(
                "Invoice Payment Detail",
                "Invoice#", "Customer", "Invoice Date", "Due", "Total", "Paid Amt", "Status", "Paid On", "Days to Pay", "Late")
            .WithNumeric(4, 5, 8);
        foreach (var inv in invoices.OrderByDescending(i => i.InvoiceDate).ThenByDescending(i => i.InvoiceNo))
        {
            var paidAmt = EffectivePaidAmount(inv);
            var status = ResolvePaymentStatus(inv, paidAmt);
            var paidOn = inv.PaymentDate.HasValue ? inv.PaymentDate.Value.ToString("yyyy-MM-dd") : "—";
            string daysStr = "—";
            string lateStr = "—";
            if (inv.PaymentDate.HasValue && IsFullyPaid(inv))
            {
                var days = (inv.PaymentDate.Value.Date - inv.InvoiceDate.Date).TotalDays;
                daysStr = ReportResultFactory.Days(days);
                lateStr = inv.PaymentDate.Value.Date > inv.DueDate.Date ? "Yes" : "No";
            }
            else if (status == "Partial" || status == "Unpaid" || status == "Overdue")
            {
                // Still open: mark late when past due with any remaining balance
                lateStr = DateTime.Now.Date > inv.DueDate.Date && paidAmt < inv.TotalAmount - 0.009m
                    ? "Yes"
                    : "No";
            }

            section.AddRow(
                FormatInvoiceNo(inv.PrefixInvoiceNo, inv.InvoiceNo),
                string.IsNullOrWhiteSpace(inv.CustomerName) ? $"Customer #{inv.CustomerId}" : inv.CustomerName,
                inv.InvoiceDate.ToString("yyyy-MM-dd"),
                inv.DueDate.ToString("yyyy-MM-dd"),
                ReportResultFactory.Money(inv.TotalAmount),
                ReportResultFactory.Money(paidAmt),
                status,
                paidOn,
                daysStr,
                lateStr);
        }

        report.Sections.Add(section);
        return report;
    }

    private sealed class InvoiceRow
    {
        public int InvoiceId { get; set; }
        public int InvoiceNo { get; set; }
        public string PrefixInvoiceNo { get; set; } = "";
        public DateTime InvoiceDate { get; set; }
        public DateTime DueDate { get; set; }
        public DateTime? PaymentDate { get; set; }
        public decimal TotalAmount { get; set; }
        public decimal PaidAmount { get; set; }
        public int CustomerId { get; set; }
        public string CustomerName { get; set; } = "";
    }

    private static decimal EffectivePaidAmount(InvoiceRow invoice)
    {
        if (invoice.PaidAmount > 0)
            return invoice.PaidAmount;
        if (invoice.PaymentDate.HasValue)
            return invoice.TotalAmount;
        return 0m;
    }

    private static bool IsFullyPaid(InvoiceRow invoice)
    {
        var paid = EffectivePaidAmount(invoice);
        return paid >= invoice.TotalAmount - 0.009m && invoice.TotalAmount > 0;
    }

    private static bool IsPartialPaid(InvoiceRow invoice)
    {
        var paid = EffectivePaidAmount(invoice);
        return paid > 0.009m && !IsFullyPaid(invoice);
    }

    private static string ResolvePaymentStatus(InvoiceRow invoice, decimal paid)
    {
        if (paid >= invoice.TotalAmount - 0.009m && invoice.TotalAmount > 0)
            return "Paid";
        if (paid > 0.009m)
            return "Partial";
        if (invoice.DueDate.Date < DateTime.Now.Date)
            return "Overdue";
        return "Unpaid";
    }

    /// <summary>
    /// Distinct non-voided invoices with customer via detail→order. Optional period and location filters.
    /// </summary>
    private static List<InvoiceRow> LoadDistinctInvoices(
        CimmpleDbContext db,
        int tenantId,
        DateTime? start,
        DateTime? endExclusive,
        int? locationId)
    {
        var query =
            from im in db.InvoiceMaster.AsNoTracking()
            where im.TenantId == tenantId && !im.IsVoided
            join id in db.InvoiceDetail.AsNoTracking() on im.Id equals id.InvoiceId
            join co in db.CustomerOrder.AsNoTracking().Where(x => x.Tenantid == tenantId)
                on id.OrderId equals co.OrderID
            select new
            {
                im.Id,
                im.InvoiceNo,
                PrefixInvoiceNo = im.PrefixInvoiceNo ?? "",
                im.InvoiceDate,
                im.DueDate,
                im.PaymentDate,
                im.TotalAmount,
                im.PaidAmount,
                co.CustomerID,
                CustomerName = co.CustomerName ?? "",
                co.locationId,
            };

        if (start.HasValue)
            query = query.Where(x => x.InvoiceDate >= start.Value);
        if (endExclusive.HasValue)
            query = query.Where(x => x.InvoiceDate < endExclusive.Value);
        if (locationId.HasValue && locationId.Value > 0)
            query = query.Where(x => x.locationId == locationId.Value);

        return query
            .AsEnumerable()
            .GroupBy(x => x.Id)
            .Select(g =>
            {
                var first = g.First();
                return new InvoiceRow
                {
                    InvoiceId = first.Id,
                    InvoiceNo = first.InvoiceNo,
                    PrefixInvoiceNo = first.PrefixInvoiceNo,
                    InvoiceDate = first.InvoiceDate,
                    DueDate = first.DueDate,
                    PaymentDate = first.PaymentDate,
                    TotalAmount = first.TotalAmount,
                    PaidAmount = first.PaidAmount,
                    CustomerId = first.CustomerID,
                    CustomerName = first.CustomerName,
                };
            })
            .ToList();
    }

    private static string FormatInvoiceNo(string? prefix, int invoiceNo)
    {
        var p = (prefix ?? "").Trim();
        return string.IsNullOrEmpty(p) ? invoiceNo.ToString() : $"{p}{invoiceNo}";
    }

    private static string FormatCustomerOrderNo(int poNumber) =>
        poNumber < 1000 ? $"CO#{poNumber + 999}" : $"CO#{poNumber}";
}
