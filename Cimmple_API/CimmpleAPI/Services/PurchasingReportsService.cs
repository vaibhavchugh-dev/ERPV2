using CimmpleAPI.Data;
using Microsoft.EntityFrameworkCore;

namespace CimmpleAPI.Services;

/// <summary>
/// Purchasing BI reports: vendor performance, PO trends, cost analysis, material price trends, delivery.
/// Period filter on VendorOrder.OrderDate; location on VendorOrder.LocationId.
/// </summary>
public static class PurchasingReportsService
{
    public static ReportResultDto BuildVendorPerformance(
        CimmpleDbContext db,
        int tenantId,
        DateTime startDate,
        DateTime endDate,
        int? locationId = null)
    {
        var start = startDate.Date;
        var endExclusive = endDate.Date.AddDays(1);
        var report = ReportResultFactory.Create(
            "vendor-performance",
            "Vendor Performance",
            start,
            endDate.Date,
            locationId);

        var orders = QueryVendorOrders(db, tenantId, locationId)
            .Where(o => o.OrderDate >= start && o.OrderDate < endExclusive)
            .Select(o => new
            {
                o.OrderID,
                o.VendorID,
                VendorName = o.VendorName ?? "",
                o.TotalAmount,
                Status = o.Status ?? "",
            })
            .ToList();

        var orderIds = orders.Select(o => o.OrderID).ToList();

        var details = db.VendorOrderDetails.AsNoTracking()
            .Where(d => d.Tenantid == tenantId && orderIds.Contains(d.OrderID))
            .Select(d => new { d.ID, d.OrderID, d.DueDateDateTime })
            .ToList();

        var detailIds = details.Select(d => d.ID).ToList();
        var receiving = db.VendorReceiving.AsNoTracking()
            .Where(r => r.Tenantid == tenantId && detailIds.Contains(r.VendorOrderDetailID))
            .Select(r => new { r.VendorOrderDetailID, r.ReceivedDate })
            .ToList();

        var maxReceivedByDetail = receiving
            .GroupBy(r => r.VendorOrderDetailID)
            .ToDictionary(g => g.Key, g => g.Max(x => x.ReceivedDate));

        var detailsByOrder = details.GroupBy(d => d.OrderID).ToDictionary(g => g.Key, g => g.ToList());

        var byVendor = orders
            .GroupBy(o => string.IsNullOrWhiteSpace(o.VendorName) ? $"Vendor #{o.VendorID}" : o.VendorName.Trim())
            .OrderByDescending(g => g.Sum(x => x.TotalAmount))
            .ThenBy(g => g.Key);

        var table = ReportResultFactory.Section(
                "Spend by vendor",
                "Vendor", "POs", "Spend", "On-Time Recv %", "Status mix")
            .WithNumeric(1, 2, 3);

        var totalSpend = 0m;
        var totalPos = 0;
        foreach (var g in byVendor)
        {
            var poCount = g.Count();
            var spend = g.Sum(x => x.TotalAmount);
            totalSpend += spend;
            totalPos += poCount;

            var statusMix = string.Join(", ",
                g.GroupBy(x => string.IsNullOrWhiteSpace(x.Status) ? "Unknown" : x.Status)
                    .OrderByDescending(s => s.Count())
                    .Select(s => $"{s.Key}:{s.Count()}"));

            var dueLines = 0;
            var onTimeLines = 0;
            foreach (var o in g)
            {
                if (!detailsByOrder.TryGetValue(o.OrderID, out var lines))
                    continue;
                foreach (var line in lines)
                {
                    if (line.DueDateDateTime == default)
                        continue;
                    if (!maxReceivedByDetail.TryGetValue(line.ID, out var received))
                        continue;
                    dueLines++;
                    if (received.Date <= line.DueDateDateTime.Date)
                        onTimeLines++;
                }
            }

            var otPct = dueLines == 0
                ? "—"
                : ReportResultFactory.Pct((decimal)onTimeLines / dueLines * 100m);

            table.AddRow(
                g.Key,
                ReportResultFactory.Num(poCount),
                ReportResultFactory.Money(spend),
                otPct,
                statusMix);
        }

        report.Sections.Add(table);
        report.AddStat("Vendors", ReportResultFactory.Num(byVendor.Count()));
        report.AddStat("POs", ReportResultFactory.Num(totalPos));
        report.AddStat("Spend", ReportResultFactory.Money(totalSpend));

        return report;
    }

    public static ReportResultDto BuildPurchaseTrends(
        CimmpleDbContext db,
        int tenantId,
        DateTime startDate,
        DateTime endDate,
        int? locationId = null)
    {
        var start = startDate.Date;
        var endExclusive = endDate.Date.AddDays(1);
        var report = ReportResultFactory.Create(
            "purchase-trends",
            "Purchase Trends",
            start,
            endDate.Date,
            locationId);

        var orders = QueryVendorOrders(db, tenantId, locationId)
            .Where(o => o.OrderDate >= start && o.OrderDate < endExclusive)
            .Select(o => new { o.OrderDate, o.TotalAmount })
            .ToList();

        var byMonth = orders
            .GroupBy(o => new DateTime(o.OrderDate.Year, o.OrderDate.Month, 1))
            .OrderBy(g => g.Key);

        var table = ReportResultFactory.Section(
                "POs by month",
                "Period", "POs", "Spend")
            .WithNumeric(1, 2);

        foreach (var g in byMonth)
        {
            table.AddRow(
                g.Key.ToString("yyyy-MM"),
                ReportResultFactory.Num(g.Count()),
                ReportResultFactory.Money(g.Sum(x => x.TotalAmount)));
        }

        report.Sections.Add(table);
        report.AddStat("Months", ReportResultFactory.Num(byMonth.Count()));
        report.AddStat("POs", ReportResultFactory.Num(orders.Count));
        report.AddStat("Spend", ReportResultFactory.Money(orders.Sum(o => o.TotalAmount)));

        return report;
    }

    public static ReportResultDto BuildVendorCostAnalysis(
        CimmpleDbContext db,
        int tenantId,
        DateTime startDate,
        DateTime endDate,
        int? locationId = null)
    {
        var start = startDate.Date;
        var endExclusive = endDate.Date.AddDays(1);
        var report = ReportResultFactory.Create(
            "vendor-cost-analysis",
            "Vendor Cost Analysis",
            start,
            endDate.Date,
            locationId);

        var lines = (
            from d in db.VendorOrderDetails.AsNoTracking()
            join o in QueryVendorOrders(db, tenantId, locationId)
                on d.OrderID equals o.OrderID
            where d.Tenantid == tenantId
                  && o.OrderDate >= start
                  && o.OrderDate < endExclusive
            select new
            {
                VendorName = o.VendorName ?? "",
                PartNo = d.PartNo ?? "",
                d.UnitPrice,
                d.QtyOrdered,
            }).ToList();

        var groups = lines
            .GroupBy(l => (
                Vendor: string.IsNullOrWhiteSpace(l.VendorName) ? "(unknown)" : l.VendorName.Trim(),
                Part: string.IsNullOrWhiteSpace(l.PartNo) ? "(no part)" : l.PartNo.Trim()))
            .OrderBy(g => g.Key.Vendor)
            .ThenBy(g => g.Key.Part);

        var table = ReportResultFactory.Section(
                "Avg unit price by vendor / part",
                "Vendor", "Part", "Lines", "Qty", "Avg Unit Price", "Spend")
            .WithNumeric(2, 3, 4, 5);

        foreach (var g in groups)
        {
            var qty = g.Sum(x => (decimal)x.QtyOrdered);
            var spend = g.Sum(x => x.UnitPrice * x.QtyOrdered);
            var avg = qty > 0 ? spend / qty : g.Average(x => x.UnitPrice);
            table.AddRow(
                g.Key.Vendor,
                g.Key.Part,
                ReportResultFactory.Num(g.Count()),
                ReportResultFactory.Qty(qty),
                ReportResultFactory.Money(avg),
                ReportResultFactory.Money(spend));
        }

        report.Sections.Add(table);
        report.AddStat("Vendor/part combos", ReportResultFactory.Num(groups.Count()));
        report.AddStat("Lines", ReportResultFactory.Num(lines.Count));
        report.AddStat("Spend", ReportResultFactory.Money(lines.Sum(l => l.UnitPrice * l.QtyOrdered)));

        return report;
    }

    public static ReportResultDto BuildMaterialCostTrends(
        CimmpleDbContext db,
        int tenantId,
        DateTime startDate,
        DateTime endDate,
        int? locationId = null)
    {
        var start = startDate.Date;
        var endExclusive = endDate.Date.AddDays(1);
        var report = ReportResultFactory.Create(
            "material-cost-trends",
            "Material Cost Trends",
            start,
            endDate.Date,
            locationId);

        var lines = (
            from d in db.VendorOrderDetails.AsNoTracking()
            join o in QueryVendorOrders(db, tenantId, locationId)
                on d.OrderID equals o.OrderID
            where d.Tenantid == tenantId
                  && o.OrderDate >= start
                  && o.OrderDate < endExclusive
            select new
            {
                o.OrderDate,
                PartNo = d.PartNo ?? "",
                d.RawMaterialId,
                d.UnitPrice,
                d.QtyOrdered,
            }).ToList();

        var groups = lines
            .GroupBy(l =>
            {
                var month = new DateTime(l.OrderDate.Year, l.OrderDate.Month, 1);
                var partKey = !string.IsNullOrWhiteSpace(l.PartNo)
                    ? l.PartNo.Trim()
                    : (l.RawMaterialId.HasValue ? $"RM#{l.RawMaterialId}" : "(no part)");
                return (Month: month, Part: partKey);
            })
            .OrderBy(g => g.Key.Month)
            .ThenBy(g => g.Key.Part);

        var table = ReportResultFactory.Section(
                "Avg unit price by month / part",
                "Period", "Part", "Lines", "Qty", "Avg Unit Price", "Spend")
            .WithNumeric(2, 3, 4, 5);

        foreach (var g in groups)
        {
            var qty = g.Sum(x => (decimal)x.QtyOrdered);
            var spend = g.Sum(x => x.UnitPrice * x.QtyOrdered);
            var avg = qty > 0 ? spend / qty : g.Average(x => x.UnitPrice);
            table.AddRow(
                g.Key.Month.ToString("yyyy-MM"),
                g.Key.Part,
                ReportResultFactory.Num(g.Count()),
                ReportResultFactory.Qty(qty),
                ReportResultFactory.Money(avg),
                ReportResultFactory.Money(spend));
        }

        report.Sections.Add(table);
        report.AddStat("Period/part rows", ReportResultFactory.Num(groups.Count()));
        report.AddStat("Lines", ReportResultFactory.Num(lines.Count));

        return report;
    }

    public static ReportResultDto BuildVendorDelivery(
        CimmpleDbContext db,
        int tenantId,
        DateTime startDate,
        DateTime endDate,
        int? locationId = null)
    {
        var start = startDate.Date;
        var endExclusive = endDate.Date.AddDays(1);
        var report = ReportResultFactory.Create(
            "vendor-delivery",
            "Vendor Delivery Performance",
            start,
            endDate.Date,
            locationId);

        var lines = (
            from d in db.VendorOrderDetails.AsNoTracking()
            join o in QueryVendorOrders(db, tenantId, locationId)
                on d.OrderID equals o.OrderID
            where d.Tenantid == tenantId
                  && o.OrderDate >= start
                  && o.OrderDate < endExclusive
            select new
            {
                VendorName = o.VendorName ?? "",
                o.PONumber,
                PartNo = d.PartNo ?? "",
                d.ID,
                d.DueDateDateTime,
            }).ToList();

        var detailIds = lines.Select(l => l.ID).ToList();
        var maxReceived = db.VendorReceiving.AsNoTracking()
            .Where(r => r.Tenantid == tenantId && detailIds.Contains(r.VendorOrderDetailID))
            .GroupBy(r => r.VendorOrderDetailID)
            .Select(g => new { DetailId = g.Key, ReceivedDate = g.Max(x => x.ReceivedDate) })
            .ToList()
            .ToDictionary(x => x.DetailId, x => x.ReceivedDate);

        var table = ReportResultFactory.Section(
                "Delivery vs due date",
                "Vendor", "PO", "Part", "Due", "Received", "On Time")
            .WithNumeric(1);

        var scored = 0;
        var onTime = 0;
        foreach (var line in lines
                     .Where(l => l.DueDateDateTime != default)
                     .OrderBy(l => l.DueDateDateTime)
                     .ThenBy(l => l.PONumber))
        {
            maxReceived.TryGetValue(line.ID, out var received);
            var hasRecv = maxReceived.ContainsKey(line.ID);
            var isOnTime = hasRecv && received.Date <= line.DueDateDateTime.Date;
            if (hasRecv)
            {
                scored++;
                if (isOnTime) onTime++;
            }

            table.AddRow(
                string.IsNullOrWhiteSpace(line.VendorName) ? "(unknown)" : line.VendorName.Trim(),
                line.PONumber.ToString(),
                string.IsNullOrWhiteSpace(line.PartNo) ? "(no part)" : line.PartNo.Trim(),
                line.DueDateDateTime.ToString("yyyy-MM-dd"),
                hasRecv ? received.ToString("yyyy-MM-dd") : "—",
                !hasRecv ? "—" : (isOnTime ? "Yes" : "No"));
        }

        report.Sections.Add(table);
        report.AddStat("Lines with due date", ReportResultFactory.Num(lines.Count(l => l.DueDateDateTime != default)));
        report.AddStat("Received", ReportResultFactory.Num(scored));
        report.AddStat(
            "On-time rate",
            scored == 0 ? "—" : ReportResultFactory.Pct((decimal)onTime / scored * 100m));

        return report;
    }

    private static IQueryable<Data.Models.VendorOrder> QueryVendorOrders(
        CimmpleDbContext db,
        int tenantId,
        int? locationId)
    {
        var query = db.VendorOrders.AsNoTracking().Where(o => o.Tenantid == tenantId);
        if (locationId.HasValue && locationId.Value > 0)
        {
            var locId = locationId.Value;
            query = query.Where(o => o.LocationId == locId);
        }
        return query;
    }
}
