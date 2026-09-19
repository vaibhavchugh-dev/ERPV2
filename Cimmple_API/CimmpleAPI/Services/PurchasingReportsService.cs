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
                o.PONumber,
                VendorPoNumber = o.VendorPoNumber ?? "",
                VendorName = o.VendorName ?? "",
                o.OrderDate,
                o.TotalAmount,
                Status = o.Status ?? "",
            })
            .ToList();

        var orderIds = orders.Select(o => o.OrderID).ToList();

        var headerDueByOrder = QueryVendorOrders(db, tenantId, locationId)
            .Where(o => orderIds.Contains(o.OrderID))
            .Select(o => new { o.OrderID, o.ExternalOrderDate })
            .ToList()
            .ToDictionary(o => o.OrderID, o => o.ExternalOrderDate);

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
            .GroupBy(o => new
            {
                o.VendorID,
                Name = string.IsNullOrWhiteSpace(o.VendorName) ? $"Vendor #{o.VendorID}" : o.VendorName.Trim()
            })
            .OrderByDescending(g => g.Sum(x => x.TotalAmount))
            .ThenBy(g => g.Key.Name);

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
                g.GroupBy(x => NormalizeVendorStatus(x.Status))
                    .OrderByDescending(s => s.Count())
                    .Select(s => $"{s.Key}:{s.Count()}"));

            var dueLines = 0;
            var onTimeLines = 0;
            foreach (var o in g)
            {
                if (!detailsByOrder.TryGetValue(o.OrderID, out var lines))
                    continue;
                headerDueByOrder.TryGetValue(o.OrderID, out var headerDue);
                foreach (var line in lines)
                {
                    var due = ResolveVendorDueDate(headerDue, line.DueDateDateTime);
                    if (!due.HasValue)
                        continue;
                    if (!maxReceivedByDetail.TryGetValue(line.ID, out var received))
                        continue;
                    dueLines++;
                    if (received.Date <= due.Value.Date)
                        onTimeLines++;
                }
            }

            var otPct = dueLines == 0
                ? "—"
                : ReportResultFactory.Pct((decimal)onTimeLines / dueLines * 100m);

            table.AddRow(
                new ReportRowMetaDto
                {
                    EntityType = "vendor",
                    EntityId = g.Key.VendorID > 0 ? g.Key.VendorID : null,
                    Title = g.Key.Name,
                    LinkPath = "/purchasing/vendor-orders",
                    Details = g.OrderByDescending(o => o.TotalAmount).Select(o => new ReportDrillItemDto
                    {
                        Label = FormatVendorOrderLabel(o.PONumber, o.VendorPoNumber),
                        SubLabel = string.IsNullOrWhiteSpace(o.Status) ? "—" : NormalizeVendorStatus(o.Status),
                        Date = o.OrderDate.ToString("yyyy-MM-dd"),
                        Amount = ReportResultFactory.Money(o.TotalAmount),
                        Status = NormalizeVendorStatus(o.Status),
                        EntityId = o.OrderID,
                        LinkPath = "/purchasing/vendor-orders"
                    }).ToList()
                },
                g.Key.Name,
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
            .Select(o => new
            {
                o.OrderID,
                o.PONumber,
                VendorPoNumber = o.VendorPoNumber ?? "",
                o.OrderDate,
                o.TotalAmount,
                VendorName = o.VendorName ?? "",
                Status = o.Status ?? ""
            })
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
            var monthKey = g.Key.ToString("yyyy-MM");
            table.AddRow(
                new ReportRowMetaDto
                {
                    EntityType = "po-month",
                    EntityKey = monthKey,
                    Title = $"POs — {monthKey}",
                    LinkPath = "/purchasing/vendor-orders",
                    Details = g.OrderByDescending(o => o.OrderDate).Select(o => new ReportDrillItemDto
                    {
                        Label = FormatVendorOrderLabel(o.PONumber, o.VendorPoNumber),
                        SubLabel = string.IsNullOrWhiteSpace(o.VendorName) ? "—" : o.VendorName.Trim(),
                        Date = o.OrderDate.ToString("yyyy-MM-dd"),
                        Amount = ReportResultFactory.Money(o.TotalAmount),
                        Status = NormalizeVendorStatus(o.Status),
                        EntityId = o.OrderID,
                        LinkPath = "/purchasing/vendor-orders"
                    }).ToList()
                },
                monthKey,
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
                o.OrderID,
                o.VendorID,
                o.PONumber,
                VendorPoNumber = o.VendorPoNumber ?? "",
                o.OrderDate,
                Status = o.Status ?? "",
                VendorName = o.VendorName ?? "",
                PartNo = d.PartNo ?? "",
                PartName = d.PartName ?? "",
                JobNumber = d.JobNumber ?? "",
                d.UnitPrice,
                d.QtyOrdered,
                d.Discount,
                d.DiscountType,
            }).ToList();

        var groups = lines
            .GroupBy(l => (
                VendorId: l.VendorID,
                Vendor: string.IsNullOrWhiteSpace(l.VendorName) ? "(unknown)" : l.VendorName.Trim(),
                Part: ResolveVendorLinePart(l.PartNo, l.PartName, l.JobNumber)))
            .OrderBy(g => g.Key.Vendor)
            .ThenBy(g => g.Key.Part);

        var table = ReportResultFactory.Section(
                "Avg unit price by vendor / part",
                "Vendor", "Part", "Lines", "Qty", "Avg Unit Price", "Spend")
            .WithNumeric(2, 3, 4, 5);

        foreach (var g in groups)
        {
            var qty = g.Sum(x => (decimal)x.QtyOrdered);
            var spend = g.Sum(x => LineNetSpend(x.UnitPrice, x.QtyOrdered, x.Discount, x.DiscountType));
            var avg = qty > 0 ? spend / qty : g.Average(x => x.UnitPrice);
            var poDetails = g
                .GroupBy(x => x.OrderID)
                .Select(og =>
                {
                    var first = og.First();
                    var lineSpend = og.Sum(x => LineNetSpend(x.UnitPrice, x.QtyOrdered, x.Discount, x.DiscountType));
                    return new
                    {
                        first.PONumber,
                        first.VendorPoNumber,
                        first.OrderDate,
                        first.Status,
                        OrderId = og.Key,
                        Part = g.Key.Part,
                        Spend = lineSpend
                    };
                })
                .OrderByDescending(x => x.Spend)
                .Select(x => new ReportDrillItemDto
                {
                    Label = FormatVendorOrderLabel(x.PONumber, x.VendorPoNumber),
                    SubLabel = x.Part,
                    Date = x.OrderDate.ToString("yyyy-MM-dd"),
                    Amount = ReportResultFactory.Money(x.Spend),
                    Status = NormalizeVendorStatus(x.Status),
                    EntityId = x.OrderId,
                    LinkPath = "/purchasing/vendor-orders"
                })
                .ToList();

            table.AddRow(
                new ReportRowMetaDto
                {
                    EntityType = "vendor-part",
                    EntityId = g.Key.VendorId > 0 ? g.Key.VendorId : null,
                    EntityKey = g.Key.Part,
                    Title = $"{g.Key.Vendor} — {g.Key.Part}",
                    LinkPath = "/purchasing/vendor-orders",
                    Details = poDetails
                },
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
        report.AddStat("Spend", ReportResultFactory.Money(
            lines.Sum(l => LineNetSpend(l.UnitPrice, l.QtyOrdered, l.Discount, l.DiscountType))));

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
                PartName = d.PartName ?? "",
                JobNumber = d.JobNumber ?? "",
                d.RawMaterialId,
                d.UnitPrice,
                d.QtyOrdered,
                d.Discount,
                d.DiscountType,
            }).ToList();

        var groups = lines
            .GroupBy(l =>
            {
                var month = new DateTime(l.OrderDate.Year, l.OrderDate.Month, 1);
                var partKey = ResolveVendorLinePart(l.PartNo, l.PartName, l.JobNumber);
                if (partKey == "(no part)" && l.RawMaterialId.HasValue)
                    partKey = $"RM#{l.RawMaterialId}";
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
            var spend = g.Sum(x => LineNetSpend(x.UnitPrice, x.QtyOrdered, x.Discount, x.DiscountType));
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
                o.OrderID,
                VendorName = o.VendorName ?? "",
                o.PONumber,
                VendorPoNumber = o.VendorPoNumber ?? "",
                PartNo = d.PartNo ?? "",
                PartName = d.PartName ?? "",
                JobNumber = d.JobNumber ?? "",
                d.ID,
                HeaderDue = o.ExternalOrderDate,
                LineDue = d.DueDateDateTime,
            }).ToList()
            .Select(l => new
            {
                l.OrderID,
                l.VendorName,
                l.PONumber,
                l.VendorPoNumber,
                Part = ResolveVendorLinePart(l.PartNo, l.PartName, l.JobNumber),
                l.ID,
                DueDate = ResolveVendorDueDate(l.HeaderDue, l.LineDue),
            })
            .ToList();

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
                     .Where(l => l.DueDate.HasValue)
                     .OrderBy(l => l.DueDate)
                     .ThenBy(l => l.PONumber))
        {
            var due = line.DueDate!.Value;
            maxReceived.TryGetValue(line.ID, out var received);
            var hasRecv = maxReceived.ContainsKey(line.ID);
            var isOnTime = hasRecv && received.Date <= due.Date;
            if (hasRecv)
            {
                scored++;
                if (isOnTime) onTime++;
            }

            var vendor = string.IsNullOrWhiteSpace(line.VendorName) ? "(unknown)" : line.VendorName.Trim();
            var voLabel = FormatVendorOrderLabel(line.PONumber, line.VendorPoNumber);
            table.AddRow(
                new ReportRowMetaDto
                {
                    EntityType = "vendor-po",
                    EntityId = line.OrderID,
                    Title = $"{voLabel} — {line.Part}",
                    LinkPath = "/purchasing/vendor-orders",
                    Details = new List<ReportDrillItemDto>
                    {
                        new()
                        {
                            Label = voLabel,
                            SubLabel = $"{vendor} · {line.Part}",
                            Date = due.ToString("yyyy-MM-dd"),
                            Status = !hasRecv ? "Not received" : (isOnTime ? "On time" : "Late"),
                            EntityId = line.OrderID,
                            LinkPath = "/purchasing/vendor-orders"
                        }
                    }
                },
                vendor,
                voLabel,
                line.Part,
                due.ToString("yyyy-MM-dd"),
                hasRecv ? received.ToString("yyyy-MM-dd") : "—",
                !hasRecv ? "—" : (isOnTime ? "Yes" : "No"));
        }

        report.Sections.Add(table);
        report.AddStat("Lines with due date", ReportResultFactory.Num(lines.Count(l => l.DueDate.HasValue)));
        report.AddStat("Received", ReportResultFactory.Num(scored));
        report.AddStat(
            "On-time rate",
            scored == 0 ? "—" : ReportResultFactory.Pct((decimal)onTime / scored * 100m));

        return report;
    }

    /// <summary>
    /// Prefer the Vendor Order header Due Date (ExternalOrderDate); fall back to line due only when header is unset.
    /// </summary>
    private static DateTime? ResolveVendorDueDate(DateTime? headerDue, DateTime lineDue)
    {
        if (headerDue.HasValue && headerDue.Value != default)
            return headerDue.Value.Date;
        if (lineDue != default)
            return lineDue.Date;
        return null;
    }

    /// <summary>
    /// Prefer Vendor PO Number when set; otherwise display sequential number as VO# (same as Vendor Orders UI).
    /// </summary>
    private static string FormatVendorOrderLabel(int poNumber, string? vendorPoNumber)
    {
        if (!string.IsNullOrWhiteSpace(vendorPoNumber))
            return vendorPoNumber.Trim();
        var display = poNumber < 1000 ? poNumber + 999 : poNumber;
        return $"VO#{display}";
    }

    /// <summary>Collapse receiving aliases so status mix counts are consistent.</summary>
    private static string NormalizeVendorStatus(string? status)
    {
        if (string.IsNullOrWhiteSpace(status))
            return "Unknown";
        var s = status.Trim();
        if (s.Equals("Receiving", StringComparison.OrdinalIgnoreCase) ||
            s.Equals("Partially Received", StringComparison.OrdinalIgnoreCase))
            return "Partially Received";
        if (s.Equals("Completed", StringComparison.OrdinalIgnoreCase) ||
            s.Equals("Fully Received", StringComparison.OrdinalIgnoreCase))
            return "Fully Received";
        return s;
    }

    /// <summary>
    /// Prefer part name/number; ignore PartNo when it duplicates JobNumber (common data issue).
    /// </summary>
    private static string ResolveVendorLinePart(string? partNo, string? partName, string? jobNumber)
    {
        var no = (partNo ?? "").Trim();
        var name = (partName ?? "").Trim();
        var job = (jobNumber ?? "").Trim();

        if (!string.IsNullOrEmpty(job) && !string.IsNullOrEmpty(no))
        {
            var jobNorm = job.StartsWith("JO#", StringComparison.OrdinalIgnoreCase) ? job.Substring(3) : job;
            var noNorm = no.StartsWith("JO#", StringComparison.OrdinalIgnoreCase) ? no.Substring(3) : no;
            if (no.Equals(job, StringComparison.OrdinalIgnoreCase) ||
                noNorm.Equals(jobNorm, StringComparison.OrdinalIgnoreCase))
            {
                no = "";
            }
        }

        if (string.IsNullOrEmpty(no) && string.IsNullOrEmpty(name))
            return "(no part)";
        if (string.IsNullOrEmpty(no))
            return name;
        if (string.IsNullOrEmpty(name) || no.Equals(name, StringComparison.OrdinalIgnoreCase))
            return no;
        return $"{no} — {name}";
    }

    /// <summary>Net line spend after Percent or Amount discount (matches Vendor Order UI / PDF).</summary>
    private static decimal LineNetSpend(decimal unitPrice, int qtyOrdered, decimal discount, string? discountType)
    {
        var subtotal = unitPrice * qtyOrdered;
        if (subtotal <= 0) return 0m;
        var discountAmount = CalculateDiscountAmount(subtotal, discount, discountType);
        var net = subtotal - discountAmount;
        return net < 0 ? 0m : net;
    }

    private static decimal CalculateDiscountAmount(decimal subtotal, decimal discount, string? discountType)
    {
        if (discount <= 0 || subtotal <= 0) return 0m;
        if (string.Equals(discountType, "Amount", StringComparison.OrdinalIgnoreCase))
            return Math.Min(Math.Max(discount, 0m), subtotal);
        var pct = Math.Min(Math.Max(discount, 0m), 100m);
        return subtotal * (pct / 100m);
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
