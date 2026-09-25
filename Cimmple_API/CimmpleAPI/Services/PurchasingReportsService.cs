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
        int? locationId = null, IReadOnlyList<int>? restrictToLocationIds = null)
    {
        var start = startDate.Date;
        var endExclusive = endDate.Date.AddDays(1);
        var report = ReportResultFactory.Create(
            "vendor-performance",
            "Vendor Performance",
            start,
            endDate.Date,
            locationId);

        var orders = QueryVendorOrders(db, tenantId, locationId, restrictToLocationIds)
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
                MaterialType = o.MaterialType ?? "",
            })
            .ToList();

        var orderIds = orders.Select(o => o.OrderID).ToList();

        var headerDueByOrder = QueryVendorOrders(db, tenantId, locationId, restrictToLocationIds)
            .Where(o => orderIds.Contains(o.OrderID))
            .Select(o => new { o.OrderID, o.ExternalOrderDate })
            .ToList()
            .ToDictionary(o => o.OrderID, o => o.ExternalOrderDate);

        var details = db.VendorOrderDetails.AsNoTracking()
            .Where(d => d.Tenantid == tenantId && orderIds.Contains(d.OrderID))
            .Select(d => new
            {
                d.ID,
                d.OrderID,
                d.DueDateDateTime,
                d.QtyOrdered,
                LineType = d.LineType ?? "",
            })
            .ToList();

        var detailIds = details.Select(d => d.ID).ToList();
        var receiving = db.VendorReceiving.AsNoTracking()
            .Where(r => r.Tenantid == tenantId && detailIds.Contains(r.VendorOrderDetailID))
            .Select(r => new { r.VendorOrderDetailID, r.ReceivedDate, r.ReceivedQty })
            .ToList();

        var maxReceivedByDetail = receiving
            .GroupBy(r => r.VendorOrderDetailID)
            .ToDictionary(g => g.Key, g => g.Max(x => x.ReceivedDate));

        var receivedQtyByDetail = receiving
            .GroupBy(r => r.VendorOrderDetailID)
            .ToDictionary(g => g.Key, g => g.Sum(x => x.ReceivedQty));

        var detailsByOrder = details.GroupBy(d => d.OrderID).ToDictionary(g => g.Key, g => g.ToList());

        // Derive display status the same way Vendor Orders list does (from receiving qty).
        var statusByOrder = orders.ToDictionary(
            o => o.OrderID,
            o =>
            {
                var detailModels = details
                    .Where(d => d.OrderID == o.OrderID)
                    .Select(l => new Data.Models.VendorOrderDetail
                    {
                        ID = l.ID,
                        QtyOrdered = l.QtyOrdered,
                        LineType = l.LineType,
                    })
                    .ToList();
                return DeriveVendorReceiveStatus(
                    detailModels,
                    receivedQtyByDetail,
                    o.MaterialType,
                    o.Status);
            });

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
                g.GroupBy(x => statusByOrder.TryGetValue(x.OrderID, out var st) ? st : (string.IsNullOrWhiteSpace(x.Status) ? "Unknown" : x.Status.Trim()))
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
                    Details = g.OrderByDescending(o => o.TotalAmount).Select(o =>
                    {
                        var derived = statusByOrder.TryGetValue(o.OrderID, out var st) ? st : o.Status;
                        return new ReportDrillItemDto
                        {
                            Label = FormatVendorOrderLabel(o.PONumber),
                            SubLabel = VendorOrderSubLabel(o.VendorPoNumber, derived),
                            Date = o.OrderDate.ToString("yyyy-MM-dd"),
                            Amount = ReportResultFactory.Money(o.TotalAmount),
                            Status = string.IsNullOrWhiteSpace(derived) ? "—" : derived,
                            EntityId = o.OrderID,
                            LinkPath = "/purchasing/vendor-orders"
                        };
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
        int? locationId = null, IReadOnlyList<int>? restrictToLocationIds = null)
    {
        var start = startDate.Date;
        var endExclusive = endDate.Date.AddDays(1);
        var report = ReportResultFactory.Create(
            "purchase-trends",
            "Purchase Trends",
            start,
            endDate.Date,
            locationId);

        var orders = QueryVendorOrders(db, tenantId, locationId, restrictToLocationIds)
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
                        Label = FormatVendorOrderLabel(o.PONumber),
                        SubLabel = VendorOrderSubLabel(o.VendorPoNumber, o.VendorName),
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
        int? locationId = null, IReadOnlyList<int>? restrictToLocationIds = null)
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
            join o in QueryVendorOrders(db, tenantId, locationId, restrictToLocationIds)
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
                    Label = FormatVendorOrderLabel(x.PONumber),
                    SubLabel = VendorOrderSubLabel(x.VendorPoNumber, x.Part),
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
        int? locationId = null, IReadOnlyList<int>? restrictToLocationIds = null)
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
            join o in QueryVendorOrders(db, tenantId, locationId, restrictToLocationIds)
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
        int? locationId = null, IReadOnlyList<int>? restrictToLocationIds = null)
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
            join o in QueryVendorOrders(db, tenantId, locationId, restrictToLocationIds)
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
                o.TotalAmount,
                PartNo = d.PartNo ?? "",
                PartName = d.PartName ?? "",
                JobNumber = d.JobNumber ?? "",
                d.ID,
                d.UnitPrice,
                d.QtyOrdered,
                d.Discount,
                d.DiscountType,
                HeaderDue = o.ExternalOrderDate,
                LineDue = d.DueDateDateTime,
            }).ToList()
            .Select(l => new
            {
                l.OrderID,
                l.VendorName,
                l.PONumber,
                l.VendorPoNumber,
                l.TotalAmount,
                LineSpend = LineNetSpend(l.UnitPrice, l.QtyOrdered, l.Discount, l.DiscountType),
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
            var voLabel = FormatVendorOrderLabel(line.PONumber);
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
                            SubLabel = VendorOrderSubLabel(line.VendorPoNumber, $"{vendor} · {line.Part}"),
                            Date = due.ToString("yyyy-MM-dd"),
                            Amount = ReportResultFactory.Money(line.LineSpend > 0 ? line.LineSpend : line.TotalAmount),
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
    /// Display sequential VO# from PONumber (same as Vendor Orders UI / PDF).
    /// Vendor PO Number is shown separately via <see cref="VendorOrderSubLabel"/>.
    /// </summary>
    private static string FormatVendorOrderLabel(int poNumber)
    {
        var display = poNumber < 1000 ? poNumber + 999 : poNumber;
        return $"VO#{display}";
    }

    private static string VendorOrderSubLabel(string? vendorPoNumber, string? other)
    {
        var vendorPo = (vendorPoNumber ?? "").Trim();
        var rest = (other ?? "").Trim();
        if (!string.IsNullOrEmpty(vendorPo) && !string.IsNullOrEmpty(rest))
            return $"Vendor PO: {vendorPo} · {rest}";
        if (!string.IsNullOrEmpty(vendorPo))
            return $"Vendor PO: {vendorPo}";
        return string.IsNullOrEmpty(rest) ? "—" : rest;
    }

    /// <summary>Collapse receiving aliases so drill status text stays consistent.</summary>
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
    /// Mirror Vendor Orders list: derive Fully/Partially Received from receiving qty
    /// (OrderController.DeriveVendorReceiveStatus).
    /// </summary>
    private static string DeriveVendorReceiveStatus(
        IReadOnlyCollection<Data.Models.VendorOrderDetail> details,
        IReadOnlyDictionary<int, int> receivedByDetail,
        string? materialType,
        string currentStatus)
    {
        var status = string.IsNullOrWhiteSpace(currentStatus) ? "" : currentStatus.Trim();
        var recalculate =
            status.Equals("Sent", StringComparison.OrdinalIgnoreCase)
            || status.Equals("Partially Received", StringComparison.OrdinalIgnoreCase)
            || status.Equals("Fully Received", StringComparison.OrdinalIgnoreCase)
            || status.Equals("Receiving", StringComparison.OrdinalIgnoreCase)
            || status.Equals("Completed", StringComparison.OrdinalIgnoreCase);

        if (!recalculate)
            return string.IsNullOrEmpty(status) ? "Unknown" : status;

        var receivable = details.Where(d => VendorLineCountsTowardReceive(d, materialType)).ToList();
        if (receivable.Count == 0)
            return string.IsNullOrEmpty(status) ? "Unknown" : status;

        var allComplete = true;
        var anyReceived = false;
        foreach (var detail in receivable)
        {
            var rec = receivedByDetail.TryGetValue(detail.ID, out var qty) ? qty : 0;
            if (rec > 0) anyReceived = true;
            if (rec < detail.QtyOrdered) allComplete = false;
        }

        if (allComplete && anyReceived)
            return "Fully Received";
        if (anyReceived)
            return "Partially Received";
        if (status.Equals("Fully Received", StringComparison.OrdinalIgnoreCase)
            || status.Equals("Partially Received", StringComparison.OrdinalIgnoreCase)
            || status.Equals("Receiving", StringComparison.OrdinalIgnoreCase)
            || status.Equals("Completed", StringComparison.OrdinalIgnoreCase))
            return "Sent";
        return status;
    }

    private static bool VendorLineCountsTowardReceive(Data.Models.VendorOrderDetail detail, string? orderMaterialType)
    {
        if (detail.QtyOrdered <= 0)
            return false;
        var lineType = NormalizeVendorOrderLineType(detail.LineType, orderMaterialType);
        return !string.Equals(lineType, "Service", StringComparison.OrdinalIgnoreCase)
            && !string.Equals(lineType, "Subcontract", StringComparison.OrdinalIgnoreCase);
    }

    private static string NormalizeVendorOrderLineType(string? value, string? orderMaterialType)
    {
        var allowed = new[] { "RawMaterial", "FinishedProduct", "Tool", "Service", "Subcontract", "Other" };
        var v = (value ?? "").Trim();
        if (string.IsNullOrEmpty(v))
            return string.Equals(orderMaterialType, "Service", StringComparison.OrdinalIgnoreCase) ? "Service" : "RawMaterial";
        foreach (var a in allowed)
        {
            if (string.Equals(v, a, StringComparison.OrdinalIgnoreCase))
                return a;
        }
        return "Other";
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
        int? locationId, IReadOnlyList<int>? restrictToLocationIds = null)
    {
        var query = db.VendorOrders.AsNoTracking().Where(o => o.Tenantid == tenantId);
        var allowed = ReportLocationScope.Resolve(locationId, restrictToLocationIds);
        if (allowed != null)
        {
            query = allowed.Count == 0
                ? query.Where(_ => false)
                : query.Where(o => o.LocationId.HasValue && allowed.Contains(o.LocationId.Value));
        }
        return query;
    }
}
