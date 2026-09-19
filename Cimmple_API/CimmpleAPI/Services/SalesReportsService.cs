using CimmpleAPI.Data;
using Microsoft.EntityFrameworkCore;

namespace CimmpleAPI.Services;

/// <summary>
/// Sales &amp; Revenue operational reports for the Reports / BI module.
/// Billed revenue = non-voided invoices in period (PaymentDate not required).
/// Location is resolved via InvoiceDetail.OrderId → CustomerOrder.locationId.
/// </summary>
public static class SalesReportsService
{
    public static ReportResultDto BuildSalesPerformance(
        CimmpleDbContext db,
        int tenantId,
        DateTime startDate,
        DateTime endDate,
        int? locationId)
    {
        var start = startDate.Date;
        var end = endDate.Date;
        var invoices = LoadDistinctBilledInvoices(db, tenantId, start, end, locationId);

        var byCustomer = invoices
            .GroupBy(x => new
            {
                CustomerId = x.CustomerId > 0 ? x.CustomerId : 0,
                Customer = string.IsNullOrWhiteSpace(x.CustomerName) ? "(Unknown)" : x.CustomerName.Trim()
            })
            .Select(g => new
            {
                g.Key.CustomerId,
                g.Key.Customer,
                Invoices = g.Count(),
                Revenue = g.Sum(x => x.TotalAmount),
                Items = g.OrderByDescending(x => x.InvoiceDate).ToList()
            })
            .OrderByDescending(x => x.Revenue)
            .ThenBy(x => x.Customer)
            .ToList();

        var totalRevenue = byCustomer.Sum(x => x.Revenue);
        var totalInvoices = byCustomer.Sum(x => x.Invoices);

        var report = ReportResultFactory.Create(
            "sales-performance",
            "Sales Performance by Customer",
            start,
            end,
            locationId);

        report.AddStat("Total Revenue", ReportResultFactory.Money(totalRevenue));
        report.AddStat("Customers", ReportResultFactory.Num(byCustomer.Count));
        report.AddStat("Invoices", ReportResultFactory.Num(totalInvoices));

        var section = ReportResultFactory
            .Section("By customer", "Customer", "Invoices", "Revenue", "Avg Invoice")
            .WithNumeric(1, 2, 3);

        foreach (var row in byCustomer)
        {
            var avg = row.Invoices > 0 ? row.Revenue / row.Invoices : 0m;
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
                        Status = ResolveInvoicePaymentStatus(inv),
                        EntityId = inv.Id,
                        LinkPath = "/orders/customer-invoices"
                    }).ToList()
                },
                row.Customer,
                ReportResultFactory.Num(row.Invoices),
                ReportResultFactory.Money(row.Revenue),
                ReportResultFactory.Money(avg));
        }

        report.Sections.Add(section);
        if (byCustomer.Count == 0)
            report.SummaryNote = "No billed invoices found for this period and site.";

        return report;
    }

    public static ReportResultDto BuildSalesTrends(
        CimmpleDbContext db,
        int tenantId,
        DateTime startDate,
        DateTime endDate,
        int? locationId)
    {
        var start = startDate.Date;
        var end = endDate.Date;
        var invoices = LoadDistinctBilledInvoices(db, tenantId, start, end, locationId);

        var byPeriod = invoices
            .GroupBy(x => x.InvoiceDate.ToString("yyyy-MM"))
            .Select(g => new
            {
                Period = g.Key,
                Invoices = g.Count(),
                Revenue = g.Sum(x => x.TotalAmount),
            })
            .OrderBy(x => x.Period)
            .ToList();

        var totalRevenue = byPeriod.Sum(x => x.Revenue);

        var report = ReportResultFactory.Create(
            "sales-trends",
            "Sales Trends Over Time",
            start,
            end,
            locationId);

        report.AddStat("Total Revenue", ReportResultFactory.Money(totalRevenue));
        report.AddStat("Periods", ReportResultFactory.Num(byPeriod.Count));

        var section = ReportResultFactory
            .Section("By period", "Period", "Invoices", "Revenue")
            .WithNumeric(1, 2);

        foreach (var row in byPeriod)
        {
            section.AddRow(
                row.Period,
                ReportResultFactory.Num(row.Invoices),
                ReportResultFactory.Money(row.Revenue));
        }

        report.Sections.Add(section);
        if (byPeriod.Count == 0)
            report.SummaryNote = "No billed invoices found for this period and site.";

        return report;
    }

    public static ReportResultDto BuildProductRevenue(
        CimmpleDbContext db,
        int tenantId,
        DateTime startDate,
        DateTime endDate,
        int? locationId)
    {
        var start = startDate.Date;
        var end = endDate.Date;
        var endExclusive = end.AddDays(1);

        var linesQuery =
            from inv in db.InvoiceMaster.AsNoTracking()
            where inv.TenantId == tenantId
                  && !inv.IsVoided
                  && inv.InvoiceDate >= start
                  && inv.InvoiceDate < endExclusive
            join d in db.InvoiceDetail.AsNoTracking() on inv.Id equals d.InvoiceId
            join o in db.CustomerOrder.AsNoTracking().Where(x => x.Tenantid == tenantId)
                on d.OrderId equals o.OrderID into orderGroup
            from o in orderGroup.DefaultIfEmpty()
            join p in db.ProductMaster.AsNoTracking().Where(x => x.tenantid == tenantId)
                on d.ProductId equals p.Id into productGroup
            from p in productGroup.DefaultIfEmpty()
            select new
            {
                inv.Id,
                d.Amount,
                d.qty,
                d.ProductId,
                Description = d.Description ?? "",
                PartNo = p != null ? p.partno : null,
                PartName = p != null ? p.partname : null,
                LocationId = o != null ? o.locationId : 0,
            };

        if (locationId.HasValue && locationId.Value > 0)
        {
            var locId = locationId.Value;
            linesQuery = linesQuery.Where(x => x.LocationId == locId);
        }

        var lines = linesQuery.ToList();

        var byProduct = lines
            .GroupBy(x =>
            {
                if (x.ProductId.HasValue && x.ProductId.Value > 0)
                {
                    var name = !string.IsNullOrWhiteSpace(x.PartName)
                        ? x.PartName!.Trim()
                        : (!string.IsNullOrWhiteSpace(x.PartNo) ? x.PartNo!.Trim() : $"Product #{x.ProductId}");
                    var partNo = !string.IsNullOrWhiteSpace(x.PartNo) ? x.PartNo!.Trim() : "";
                    return string.IsNullOrEmpty(partNo) || partNo.Equals(name, StringComparison.OrdinalIgnoreCase)
                        ? name
                        : $"{partNo} — {name}";
                }

                return string.IsNullOrWhiteSpace(x.Description) ? "(Unspecified)" : x.Description.Trim();
            })
            .Select(g => new
            {
                Product = g.Key,
                Qty = g.Sum(x => (decimal)x.qty),
                Revenue = g.Sum(x => x.Amount),
                Invoices = g.Select(x => x.Id).Distinct().Count(),
            })
            .OrderByDescending(x => x.Revenue)
            .ThenBy(x => x.Product)
            .ToList();

        var totalRevenue = byProduct.Sum(x => x.Revenue);

        var report = ReportResultFactory.Create(
            "product-revenue",
            "Product/Service Revenue Analysis",
            start,
            end,
            locationId);

        report.AddStat("Total Revenue", ReportResultFactory.Money(totalRevenue));
        report.AddStat("Products", ReportResultFactory.Num(byProduct.Count));
        report.AddStat("Line Qty", ReportResultFactory.Qty(byProduct.Sum(x => x.Qty)));

        var section = ReportResultFactory
            .Section("By product", "Product", "Qty", "Revenue", "Invoices")
            .WithNumeric(1, 2, 3);

        foreach (var row in byProduct)
        {
            section.AddRow(
                row.Product,
                ReportResultFactory.Qty(row.Qty),
                ReportResultFactory.Money(row.Revenue),
                ReportResultFactory.Num(row.Invoices));
        }

        report.Sections.Add(section);
        if (byProduct.Count == 0)
            report.SummaryNote = "No invoice lines found for this period and site.";

        return report;
    }

    public static ReportResultDto BuildQuotationConversion(
        CimmpleDbContext db,
        int tenantId,
        DateTime startDate,
        DateTime endDate,
        int? locationId)
    {
        var start = startDate.Date;
        var end = endDate.Date;
        var endExclusive = end.AddDays(1);

        var query = db.QuotationOrder.AsNoTracking()
            .Where(q => q.Tenantid == tenantId
                        && q.OrderDate >= start
                        && q.OrderDate < endExclusive);

        if (locationId.HasValue && locationId.Value > 0)
        {
            var locId = locationId.Value;
            query = query.Where(q => q.Locationid == locId);
        }

        var quotes = query
            .OrderByDescending(q => q.OrderDate)
            .ThenByDescending(q => q.PONumber)
            .Select(q => new
            {
                q.OrderID,
                q.CustomerName,
                q.PONumber,
                q.OrderDate,
                q.TotalAmount,
                q.isConverted,
                q.convertedOrderId,
            })
            .ToList()
            .Select(q =>
            {
                var converted = (q.isConverted == 1) || (q.convertedOrderId.HasValue && q.convertedOrderId.Value > 0);
                return new
                {
                    q.OrderID,
                    Customer = string.IsNullOrWhiteSpace(q.CustomerName) ? "(Unknown)" : q.CustomerName.Trim(),
                    QuoteNo = FormatQuoteNumber(q.PONumber),
                    Date = q.OrderDate.ToString("yyyy-MM-dd"),
                    Amount = q.TotalAmount,
                    Converted = converted,
                    ConvertedOrderId = q.convertedOrderId,
                };
            })
            .ToList();

        var convertedCount = quotes.Count(q => q.Converted);
        var rate = quotes.Count > 0 ? (decimal)convertedCount / quotes.Count * 100m : 0m;

        var report = ReportResultFactory.Create(
            "quotation-conversion",
            "Quotation-to-Order Conversion",
            start,
            end,
            locationId);

        report.AddStat("Quotes", ReportResultFactory.Num(quotes.Count));
        report.AddStat("Converted", ReportResultFactory.Num(convertedCount));
        report.AddStat("Rate %", ReportResultFactory.Pct(rate));

        var section = ReportResultFactory
            .Section("Quotations", "Customer", "Quote #", "Date", "Amount", "Converted")
            .WithNumeric(3);

        foreach (var row in quotes)
        {
            var details = new List<ReportDrillItemDto>
            {
                new()
                {
                    Label = row.QuoteNo,
                    SubLabel = row.Customer,
                    Date = row.Date,
                    Amount = ReportResultFactory.Money(row.Amount),
                    Status = row.Converted ? "Converted" : "Open",
                    EntityId = row.OrderID,
                    LinkPath = "/quotations/customer"
                }
            };
            if (row.Converted && row.ConvertedOrderId.HasValue && row.ConvertedOrderId.Value > 0)
            {
                details.Add(new ReportDrillItemDto
                {
                    Label = $"Order #{row.ConvertedOrderId.Value}",
                    SubLabel = "Converted customer order",
                    Status = "Order",
                    EntityId = row.ConvertedOrderId.Value,
                    LinkPath = "/orders/customer"
                });
            }

            section.AddRow(
                new ReportRowMetaDto
                {
                    EntityType = "quotation",
                    EntityId = row.OrderID,
                    Title = $"{row.QuoteNo} — {row.Customer}",
                    LinkPath = "/quotations/customer",
                    Details = details
                },
                row.Customer,
                row.QuoteNo,
                row.Date,
                ReportResultFactory.Money(row.Amount),
                row.Converted ? "Yes" : "No");
        }

        report.Sections.Add(section);
        if (quotes.Count == 0)
            report.SummaryNote = "No quotations found for this period and site.";

        return report;
    }

    public static ReportResultDto BuildRevenueByLocation(
        CimmpleDbContext db,
        int tenantId,
        DateTime startDate,
        DateTime endDate,
        int? locationId)
    {
        var start = startDate.Date;
        var end = endDate.Date;
        var invoices = LoadDistinctBilledInvoices(db, tenantId, start, end, locationId);

        var locationNames = db.Locations.AsNoTracking()
            .Where(l => l.TenantId == tenantId)
            .Select(l => new { l.LocationId, l.Name })
            .ToList()
            .ToDictionary(l => l.LocationId, l => string.IsNullOrWhiteSpace(l.Name) ? $"Location #{l.LocationId}" : l.Name.Trim());

        var byLocation = invoices
            .GroupBy(x => x.LocationId)
            .Select(g => new
            {
                LocationId = g.Key,
                Location = g.Key > 0 && locationNames.TryGetValue(g.Key, out var name)
                    ? name
                    : (g.Key > 0 ? $"Location #{g.Key}" : "(Unassigned)"),
                Invoices = g.Count(),
                Revenue = g.Sum(x => x.TotalAmount),
            })
            .OrderByDescending(x => x.Revenue)
            .ThenBy(x => x.Location)
            .ToList();

        var totalRevenue = byLocation.Sum(x => x.Revenue);

        var report = ReportResultFactory.Create(
            "revenue-by-location",
            "Revenue by Location/Region",
            start,
            end,
            locationId);

        report.AddStat("Total Revenue", ReportResultFactory.Money(totalRevenue));
        report.AddStat("Locations", ReportResultFactory.Num(byLocation.Count));
        report.AddStat("Invoices", ReportResultFactory.Num(byLocation.Sum(x => x.Invoices)));

        var section = ReportResultFactory
            .Section("By location", "Location", "Invoices", "Revenue")
            .WithNumeric(1, 2);

        foreach (var row in byLocation)
        {
            section.AddRow(
                row.Location,
                ReportResultFactory.Num(row.Invoices),
                ReportResultFactory.Money(row.Revenue));
        }

        report.Sections.Add(section);
        if (byLocation.Count == 0)
            report.SummaryNote = "No billed invoices found for this period and site.";
        else if (locationId.HasValue && locationId.Value > 0)
            report.SummaryNote =
                "Results are limited to the selected site. Choose All sites to compare revenue across locations.";

        return report;
    }

    /// <summary>
    /// Loads non-voided invoices in period, distinct by invoice Id (avoids double-counting TotalAmount
    /// when joining InvoiceDetail). Customer/location taken from the first linked CustomerOrder.
    /// </summary>
    private static List<BilledInvoiceRow> LoadDistinctBilledInvoices(
        CimmpleDbContext db,
        int tenantId,
        DateTime start,
        DateTime end,
        int? locationId)
    {
        var endExclusive = end.AddDays(1);

        var query =
            from inv in db.InvoiceMaster.AsNoTracking()
            where inv.TenantId == tenantId
                  && !inv.IsVoided
                  && inv.InvoiceDate >= start
                  && inv.InvoiceDate < endExclusive
            join d in db.InvoiceDetail.AsNoTracking() on inv.Id equals d.InvoiceId into details
            from d in details.DefaultIfEmpty()
            join o in db.CustomerOrder.AsNoTracking().Where(x => x.Tenantid == tenantId)
                on d.OrderId equals o.OrderID into orderGroup
            from o in orderGroup.DefaultIfEmpty()
            select new
            {
                inv.Id,
                inv.InvoiceNo,
                PrefixInvoiceNo = inv.PrefixInvoiceNo ?? "",
                inv.InvoiceDate,
                inv.DueDate,
                inv.TotalAmount,
                inv.PaidAmount,
                CustomerName = o != null ? o.CustomerName : null,
                CustomerId = o != null ? o.CustomerID : 0,
                LocationId = o != null ? o.locationId : 0,
            };

        if (locationId.HasValue && locationId.Value > 0)
        {
            var locId = locationId.Value;
            query = query.Where(x => x.LocationId == locId);
        }

        return query
            .ToList()
            .GroupBy(x => x.Id)
            .Select(g =>
            {
                var first = g.FirstOrDefault(x => x.CustomerId > 0) ?? g.First();
                return new BilledInvoiceRow
                {
                    Id = g.Key,
                    InvoiceNo = first.InvoiceNo,
                    PrefixInvoiceNo = first.PrefixInvoiceNo ?? "",
                    InvoiceDate = first.InvoiceDate,
                    DueDate = first.DueDate,
                    TotalAmount = first.TotalAmount,
                    PaidAmount = first.PaidAmount,
                    CustomerName = first.CustomerName ?? "",
                    CustomerId = first.CustomerId,
                    LocationId = first.LocationId,
                };
            })
            .ToList();
    }

    private static string FormatInvoiceNo(string? prefix, int invoiceNo) =>
        !string.IsNullOrWhiteSpace(prefix) ? prefix! : invoiceNo.ToString();

    private static string FormatQuoteNumber(int poNumber) =>
        poNumber < 1000 ? $"CQ#{poNumber + 999}" : $"CQ#{poNumber}";

    private static string ResolveInvoicePaymentStatus(BilledInvoiceRow inv)
    {
        if (inv.PaidAmount >= inv.TotalAmount - 0.009m && inv.TotalAmount > 0)
            return "Paid";
        if (inv.PaidAmount > 0.009m)
            return "Partial";
        if (inv.DueDate != default && inv.DueDate.Date < DateTime.Now.Date)
            return "Overdue";
        return "Unpaid";
    }

    private sealed class BilledInvoiceRow
    {
        public int Id { get; set; }
        public int InvoiceNo { get; set; }
        public string PrefixInvoiceNo { get; set; } = "";
        public DateTime InvoiceDate { get; set; }
        public DateTime DueDate { get; set; }
        public decimal TotalAmount { get; set; }
        public decimal PaidAmount { get; set; }
        public string CustomerName { get; set; } = "";
        public int CustomerId { get; set; }
        public int LocationId { get; set; }
    }
}
