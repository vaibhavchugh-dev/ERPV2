using CimmpleAPI.Data;
using Microsoft.EntityFrameworkCore;

namespace CimmpleAPI.Services;

/// <summary>
/// Inventory &amp; materials operational reports (valuation, movements, usage, turnover).
/// </summary>
public static class InventoryReportsService
{
    public static ReportResultDto BuildInventoryValuation(
        CimmpleDbContext db,
        int tenantId,
        DateTime startDate,
        DateTime endDate,
        int? locationId = null, IReadOnlyList<int>? restrictToLocationIds = null)
    {
        var report = ReportResultFactory.Create(
            "inventory-valuation",
            "Inventory Valuation Report",
            startDate.Date,
            endDate.Date,
            locationId);

        var balancesQuery = db.InventoryBalance.AsNoTracking()
            .Where(b => b.Tenantid == tenantId);
        if (locationId.HasValue && locationId.Value > 0)
            balancesQuery = balancesQuery.Where(b => b.LocationId == locationId.Value);
        else if (restrictToLocationIds != null)
        {
            var allowed = restrictToLocationIds.ToList();
            balancesQuery = allowed.Count == 0
                ? balancesQuery.Where(_ => false)
                : balancesQuery.Where(b => allowed.Contains(b.LocationId));
        }

        var rawRows = (
            from b in balancesQuery
            join loc in db.Locations.AsNoTracking() on b.LocationId equals loc.LocationId into locGroup
            from loc in locGroup.DefaultIfEmpty()
            join p in db.ProductMaster.AsNoTracking() on b.ProductId equals p.Id into pGroup
            from p in pGroup.DefaultIfEmpty()
            join rm in db.RawMaterialMaster.AsNoTracking() on b.RawMaterialId equals rm.Id into rmGroup
            from rm in rmGroup.DefaultIfEmpty()
            select new
            {
                b.LocationId,
                LocName = loc != null ? loc.Name : null,
                LocCode = loc != null ? loc.Code : null,
                ProductPartNo = p != null ? p.partno : null,
                ProductPartName = p != null ? p.partname : null,
                RawPartNo = rm != null ? rm.PartNo : null,
                RawPartName = rm != null ? rm.PartName : null,
                b.ProductId,
                b.RawMaterialId,
                b.QuantityOnHand,
                BalanceUnitCost = b.UnitCost,
                MasterUnitCost = rm != null ? (decimal?)rm.UnitCost : null,
            }
        ).ToList();

        var rows = rawRows.Select(r =>
        {
            var unitCost = ResolveUnitCost(r.BalanceUnitCost, r.MasterUnitCost);
            return new
            {
                r.LocationId,
                LocationName = !string.IsNullOrWhiteSpace(r.LocName) ? r.LocName!
                    : !string.IsNullOrWhiteSpace(r.LocCode) ? r.LocCode!
                    : $"Location #{r.LocationId}",
                ItemName = ResolveItemName(r.ProductPartNo, r.ProductPartName, r.RawPartNo, r.RawPartName,
                    r.ProductId, r.RawMaterialId),
                SearchKey = ResolveSearchKey(r.ProductPartNo, r.ProductPartName, r.RawPartNo, r.RawPartName,
                    r.ProductId, r.RawMaterialId),
                r.ProductId,
                r.RawMaterialId,
                r.QuantityOnHand,
                UnitCost = unitCost,
            };
        }).ToList();

        var grouped = rows
            .GroupBy(r => new { r.LocationId, r.LocationName, r.ItemName, r.SearchKey, r.ProductId, r.RawMaterialId })
            .Select(g =>
            {
                var qty = g.Sum(x => x.QuantityOnHand);
                var hasCost = g.Any(x => x.UnitCost.HasValue);
                var unitCost = hasCost
                    ? g.Where(x => x.UnitCost.HasValue).Average(x => x.UnitCost!.Value)
                    : (decimal?)null;
                var value = g.Sum(x => x.QuantityOnHand * (x.UnitCost ?? 0m));
                var unvalued = g.Any(x => !x.UnitCost.HasValue && x.QuantityOnHand > 0);
                return new
                {
                    g.Key.LocationId,
                    g.Key.LocationName,
                    g.Key.ItemName,
                    g.Key.SearchKey,
                    g.Key.ProductId,
                    g.Key.RawMaterialId,
                    Qty = qty,
                    UnitCost = unitCost,
                    Value = value,
                    Unvalued = unvalued,
                };
            })
            .OrderBy(x => x.LocationName)
            .ThenBy(x => x.ItemName)
            .ToList();

        var totalValue = grouped.Sum(x => x.Value);
        var unvaluedCount = grouped.Count(x => x.Unvalued);

        report.AddStat("Total Value", ReportResultFactory.Money(totalValue));
        report.AddStat("Lines", ReportResultFactory.Num(grouped.Count));
        report.AddStat("Unvalued Lines", ReportResultFactory.Num(unvaluedCount), warn: unvaluedCount > 0);
        report.SummaryNote =
            "Point-in-time balances as of period end (dates ignored for valuation). " +
            "Unit Cost uses InventoryBalance.UnitCost when set, otherwise Raw Material master UnitCost. " +
            "Value = Qty On Hand × (UnitCost ?? 0). Lines with no cost and qty > 0 are flagged as unvalued.";

        var section = ReportResultFactory.Section(
                "Inventory Valuation",
                "Location", "Item", "Qty On Hand", "Unit Cost", "Value")
            .WithNumeric(2, 3, 4);
        foreach (var row in grouped)
        {
            section.AddRow(
                new ReportRowMetaDto
                {
                    EntityType = "inventory-item",
                    EntityId = row.ProductId ?? row.RawMaterialId,
                    EntityKey = row.SearchKey,
                    Title = $"{row.ItemName} @ {row.LocationName}",
                    LinkPath = "/inventory",
                    Details = new List<ReportDrillItemDto>
                    {
                        new()
                        {
                            Label = row.ItemName,
                            SubLabel = row.LocationName,
                            Amount = ReportResultFactory.Money(row.Value),
                            Status = row.Unvalued ? "Unvalued" : $"Qty {ReportResultFactory.Qty(row.Qty)}",
                            EntityId = row.ProductId ?? row.RawMaterialId,
                            LinkPath = "/inventory"
                        }
                    }
                },
                row.LocationName,
                row.ItemName,
                ReportResultFactory.Qty(row.Qty),
                row.UnitCost.HasValue ? ReportResultFactory.Money(row.UnitCost.Value) : "—",
                ReportResultFactory.Money(row.Value));
        }

        report.Sections.Add(section);
        return report;
    }

    public static ReportResultDto BuildStockMovement(
        CimmpleDbContext db,
        int tenantId,
        DateTime startDate,
        DateTime endDate,
        int? locationId = null, IReadOnlyList<int>? restrictToLocationIds = null)
    {
        var start = startDate.Date;
        var endExclusive = endDate.Date.AddDays(1);
        var report = ReportResultFactory.Create(
            "stock-movement",
            "Stock Movement Analysis",
            startDate.Date,
            endDate.Date,
            locationId);

        var txQuery = db.InventoryTransaction.AsNoTracking()
            .Where(t => t.Tenantid == tenantId
                        && t.TransactionDate >= start
                        && t.TransactionDate < endExclusive);
        if (locationId.HasValue && locationId.Value > 0)
            txQuery = txQuery.Where(t => t.LocationId == locationId.Value);
        else if (restrictToLocationIds != null)
        {
            var allowed = restrictToLocationIds.ToList();
            txQuery = allowed.Count == 0
                ? txQuery.Where(_ => false)
                : txQuery.Where(t => allowed.Contains(t.LocationId));
        }

        var txs = (
            from t in txQuery
            join tt in db.InventoryTransactionType.AsNoTracking()
                on t.TransactionTypeId equals tt.Id into ttGroup
            from tt in ttGroup.DefaultIfEmpty()
            join p in db.ProductMaster.AsNoTracking() on t.ProductId equals p.Id into pGroup
            from p in pGroup.DefaultIfEmpty()
            join rm in db.RawMaterialMaster.AsNoTracking() on t.RawMaterialId equals rm.Id into rmGroup
            from rm in rmGroup.DefaultIfEmpty()
            select new
            {
                t.Id,
                t.TransactionDate,
                TypeName = tt != null ? tt.Name : null,
                TypeCode = tt != null ? tt.Code : null,
                t.TransactionTypeId,
                t.Quantity,
                t.ProductId,
                t.RawMaterialId,
                ProductPartNo = p != null ? p.partno : null,
                ProductPartName = p != null ? p.partname : null,
                RawPartNo = rm != null ? rm.PartNo : null,
                RawPartName = rm != null ? rm.PartName : null,
                t.ReferenceType,
                t.ReferenceId,
            }
        ).AsEnumerable()
        .Select(t => new
        {
            t.Id,
            t.TransactionDate,
            TypeName = !string.IsNullOrWhiteSpace(t.TypeName) ? t.TypeName!
                : !string.IsNullOrWhiteSpace(t.TypeCode) ? t.TypeCode!
                : $"Type #{t.TransactionTypeId}",
            t.Quantity,
            ItemName = ResolveItemName(t.ProductPartNo, t.ProductPartName, t.RawPartNo, t.RawPartName,
                t.ProductId, t.RawMaterialId),
            SearchKey = ResolveSearchKey(t.ProductPartNo, t.ProductPartName, t.RawPartNo, t.RawPartName,
                t.ProductId, t.RawMaterialId),
            Ref = string.IsNullOrWhiteSpace(t.ReferenceType)
                ? ""
                : $"{t.ReferenceType}{(t.ReferenceId.HasValue ? " #" + t.ReferenceId : "")}"
        })
        .ToList();

        var byDate = txs
            .GroupBy(t => t.TransactionDate.Date)
            .OrderBy(g => g.Key)
            .Select(g => new
            {
                Label = g.Key.ToString("yyyy-MM-dd"),
                InQty = g.Where(x => x.Quantity > 0).Sum(x => x.Quantity),
                OutQty = g.Where(x => x.Quantity < 0).Sum(x => Math.Abs(x.Quantity)),
                Net = g.Sum(x => x.Quantity),
                Items = g.OrderByDescending(x => Math.Abs(x.Quantity)).Take(100).ToList()
            })
            .ToList();

        var byType = txs
            .GroupBy(t => string.IsNullOrWhiteSpace(t.TypeName) ? "Unknown" : t.TypeName)
            .OrderByDescending(g => g.Sum(x => Math.Abs(x.Quantity)))
            .ThenBy(g => g.Key)
            .Select(g => new
            {
                Label = g.Key,
                InQty = g.Where(x => x.Quantity > 0).Sum(x => x.Quantity),
                OutQty = g.Where(x => x.Quantity < 0).Sum(x => Math.Abs(x.Quantity)),
                Net = g.Sum(x => x.Quantity),
                Items = g.OrderByDescending(x => x.TransactionDate).Take(100).ToList()
            })
            .ToList();

        report.AddStat("Transactions", ReportResultFactory.Num(txs.Count));
        report.AddStat("In Qty", ReportResultFactory.Qty(txs.Where(t => t.Quantity > 0).Sum(t => t.Quantity)));
        report.AddStat("Out Qty", ReportResultFactory.Qty(txs.Where(t => t.Quantity < 0).Sum(t => Math.Abs(t.Quantity))));
        report.AddStat("Net Qty", ReportResultFactory.Qty(txs.Sum(t => t.Quantity)));

        var dateSection = ReportResultFactory.Section(
                "By Date",
                "Date", "In Qty", "Out Qty", "Net")
            .WithNumeric(1, 2, 3);
        foreach (var row in byDate)
        {
            dateSection.AddRow(
                new ReportRowMetaDto
                {
                    EntityType = "stock-date",
                    EntityKey = row.Label,
                    Title = $"Movements — {row.Label}",
                    LinkPath = "/inventory",
                    Details = row.Items.Select(t => new ReportDrillItemDto
                    {
                        Label = t.ItemName,
                        SubLabel = string.IsNullOrWhiteSpace(t.Ref) ? t.TypeName : $"{t.TypeName} · {t.Ref}",
                        Date = t.TransactionDate.ToString("yyyy-MM-dd"),
                        Amount = ReportResultFactory.Qty(t.Quantity),
                        Status = t.Quantity >= 0 ? "In" : "Out",
                        EntityId = t.Id,
                        LinkPath = "/inventory"
                    }).ToList()
                },
                row.Label,
                ReportResultFactory.Qty(row.InQty),
                ReportResultFactory.Qty(row.OutQty),
                ReportResultFactory.Qty(row.Net));
        }
        report.Sections.Add(dateSection);

        var typeSection = ReportResultFactory.Section(
                "By Type",
                "Type", "In Qty", "Out Qty", "Net")
            .WithNumeric(1, 2, 3);
        foreach (var row in byType)
        {
            typeSection.AddRow(
                new ReportRowMetaDto
                {
                    EntityType = "stock-type",
                    EntityKey = row.Label,
                    Title = $"Type: {row.Label}",
                    LinkPath = "/inventory",
                    Details = row.Items.Select(t => new ReportDrillItemDto
                    {
                        Label = t.ItemName,
                        SubLabel = string.IsNullOrWhiteSpace(t.Ref) ? t.TransactionDate.ToString("yyyy-MM-dd") : t.Ref,
                        Date = t.TransactionDate.ToString("yyyy-MM-dd"),
                        Amount = ReportResultFactory.Qty(t.Quantity),
                        Status = t.Quantity >= 0 ? "In" : "Out",
                        EntityId = t.Id,
                        LinkPath = "/inventory"
                    }).ToList()
                },
                row.Label,
                ReportResultFactory.Qty(row.InQty),
                ReportResultFactory.Qty(row.OutQty),
                ReportResultFactory.Qty(row.Net));
        }
        report.Sections.Add(typeSection);

        return report;
    }

    public static ReportResultDto BuildMaterialUsage(
        CimmpleDbContext db,
        int tenantId,
        DateTime startDate,
        DateTime endDate,
        int? locationId = null, IReadOnlyList<int>? restrictToLocationIds = null)
    {
        var start = startDate.Date;
        var endExclusive = endDate.Date.AddDays(1);
        var report = ReportResultFactory.Create(
            "material-usage",
            "Material Usage Trends",
            startDate.Date,
            endDate.Date,
            locationId);

        var txQuery = db.InventoryTransaction.AsNoTracking()
            .Where(t => t.Tenantid == tenantId
                        && t.TransactionDate >= start
                        && t.TransactionDate < endExclusive
                        && t.Quantity < 0
                        && t.ReferenceType != null
                        && t.ReferenceType.ToLower() == "joborder");
        if (locationId.HasValue && locationId.Value > 0)
            txQuery = txQuery.Where(t => t.LocationId == locationId.Value);
        else if (restrictToLocationIds != null)
        {
            var allowed = restrictToLocationIds.ToList();
            txQuery = allowed.Count == 0
                ? txQuery.Where(_ => false)
                : txQuery.Where(t => allowed.Contains(t.LocationId));
        }

        var rows = (
            from t in txQuery
            join p in db.ProductMaster.AsNoTracking() on t.ProductId equals p.Id into pGroup
            from p in pGroup.DefaultIfEmpty()
            join rm in db.RawMaterialMaster.AsNoTracking() on t.RawMaterialId equals rm.Id into rmGroup
            from rm in rmGroup.DefaultIfEmpty()
            select new
            {
                ProductPartNo = p != null ? p.partno : null,
                ProductPartName = p != null ? p.partname : null,
                RawPartNo = rm != null ? rm.PartNo : null,
                RawPartName = rm != null ? rm.PartName : null,
                t.ProductId,
                t.RawMaterialId,
                t.Quantity,
            }
        ).AsEnumerable()
        .Select(t => new
        {
            ItemName = ResolveItemName(t.ProductPartNo, t.ProductPartName, t.RawPartNo, t.RawPartName,
                t.ProductId, t.RawMaterialId),
            QtyIssued = Math.Abs(t.Quantity),
        })
        .ToList();

        var grouped = rows
            .GroupBy(r => r.ItemName)
            .Select(g => new
            {
                Item = g.Key,
                QtyIssued = g.Sum(x => x.QtyIssued),
                Txns = g.Count(),
            })
            .OrderByDescending(x => x.QtyIssued)
            .ThenBy(x => x.Item)
            .ToList();

        report.AddStat("Materials", ReportResultFactory.Num(grouped.Count));
        report.AddStat("Qty Issued", ReportResultFactory.Qty(grouped.Sum(x => x.QtyIssued)));
        report.AddStat("Transactions", ReportResultFactory.Num(rows.Count));
        report.SummaryNote = "Issues with ReferenceType = JobOrder (case-insensitive) and Quantity < 0 in the period.";

        var section = ReportResultFactory.Section(
                "Material Usage (Job Orders)",
                "Material", "Qty Issued", "Txns")
            .WithNumeric(1, 2);
        foreach (var row in grouped)
            section.AddRow(row.Item, ReportResultFactory.Qty(row.QtyIssued), ReportResultFactory.Num(row.Txns));
        report.Sections.Add(section);

        return report;
    }

    public static ReportResultDto BuildInventoryTurnover(
        CimmpleDbContext db,
        int tenantId,
        DateTime startDate,
        DateTime endDate,
        int? locationId = null, IReadOnlyList<int>? restrictToLocationIds = null)
    {
        var start = startDate.Date;
        var endExclusive = endDate.Date.AddDays(1);
        var report = ReportResultFactory.Create(
            "inventory-turnover",
            "Inventory Turnover Analysis",
            startDate.Date,
            endDate.Date,
            locationId);

        var balancesQuery = db.InventoryBalance.AsNoTracking()
            .Where(b => b.Tenantid == tenantId);
        if (locationId.HasValue && locationId.Value > 0)
            balancesQuery = balancesQuery.Where(b => b.LocationId == locationId.Value);
        else if (restrictToLocationIds != null)
        {
            var allowed = restrictToLocationIds.ToList();
            balancesQuery = allowed.Count == 0
                ? balancesQuery.Where(_ => false)
                : balancesQuery.Where(b => allowed.Contains(b.LocationId));
        }

        var balances = (
            from b in balancesQuery
            join p in db.ProductMaster.AsNoTracking() on b.ProductId equals p.Id into pGroup
            from p in pGroup.DefaultIfEmpty()
            join rm in db.RawMaterialMaster.AsNoTracking() on b.RawMaterialId equals rm.Id into rmGroup
            from rm in rmGroup.DefaultIfEmpty()
            select new
            {
                b.ProductId,
                b.RawMaterialId,
                ProductPartNo = p != null ? p.partno : null,
                ProductPartName = p != null ? p.partname : null,
                RawPartNo = rm != null ? rm.PartNo : null,
                RawPartName = rm != null ? rm.PartName : null,
                b.QuantityOnHand,
                BalanceUnitCost = b.UnitCost,
                MasterUnitCost = rm != null ? (decimal?)rm.UnitCost : null,
            }
        ).AsEnumerable()
        .Select(b =>
        {
            var unitCost = ResolveUnitCost(b.BalanceUnitCost, b.MasterUnitCost) ?? 0m;
            return new
            {
                Key = ItemKey(b.ProductId, b.RawMaterialId),
                ItemName = ResolveItemName(b.ProductPartNo, b.ProductPartName, b.RawPartNo, b.RawPartName,
                    b.ProductId, b.RawMaterialId),
                OnHandValue = b.QuantityOnHand * unitCost,
                UnitCost = unitCost,
            };
        })
        .ToList();

        var costByItem = balances
            .GroupBy(b => b.Key)
            .ToDictionary(
                g => g.Key,
                g => g.Where(x => x.UnitCost > 0).Select(x => x.UnitCost).DefaultIfEmpty(0m).Average());

        var avgOnHandByItem = balances
            .GroupBy(b => new { b.Key, b.ItemName })
            .ToDictionary(
                g => g.Key.Key,
                g => new { g.Key.ItemName, AvgOnHand = g.Sum(x => x.OnHandValue) });

        var txQuery = db.InventoryTransaction.AsNoTracking()
            .Where(t => t.Tenantid == tenantId
                        && t.TransactionDate >= start
                        && t.TransactionDate < endExclusive
                        && t.Quantity < 0);
        if (locationId.HasValue && locationId.Value > 0)
            txQuery = txQuery.Where(t => t.LocationId == locationId.Value);
        else if (restrictToLocationIds != null)
        {
            var allowed = restrictToLocationIds.ToList();
            txQuery = allowed.Count == 0
                ? txQuery.Where(_ => false)
                : txQuery.Where(t => allowed.Contains(t.LocationId));
        }

        var outbound = txQuery
            .Select(t => new { t.ProductId, t.RawMaterialId, t.Quantity })
            .ToList();

        var issuesByItem = outbound
            .GroupBy(t => ItemKey(t.ProductId, t.RawMaterialId))
            .Select(g =>
            {
                var unitCost = costByItem.TryGetValue(g.Key, out var c) ? c : 0m;
                var issuesCost = g.Sum(x => Math.Abs(x.Quantity) * unitCost);
                avgOnHandByItem.TryGetValue(g.Key, out var info);
                var name = info?.ItemName ?? g.Key;
                var avgOnHand = info?.AvgOnHand ?? 0m;
                var turnover = avgOnHand > 0 ? issuesCost / avgOnHand : 0m;
                return new
                {
                    Item = name,
                    IssuesCost = issuesCost,
                    AvgOnHand = avgOnHand,
                    Turnover = turnover,
                };
            })
            .ToList();

        var seenKeys = outbound.Select(t => ItemKey(t.ProductId, t.RawMaterialId)).ToHashSet();
        foreach (var bal in avgOnHandByItem)
        {
            if (seenKeys.Contains(bal.Key))
                continue;
            issuesByItem.Add(new
            {
                Item = bal.Value.ItemName,
                IssuesCost = 0m,
                AvgOnHand = bal.Value.AvgOnHand,
                Turnover = 0m,
            });
        }

        var totalIssues = issuesByItem.Sum(x => x.IssuesCost);
        var totalAvgOnHand = avgOnHandByItem.Values.Sum(x => x.AvgOnHand);
        var overallTurnover = totalAvgOnHand > 0 ? totalIssues / totalAvgOnHand : 0m;

        report.AddStat("Issues Cost (proxy)", ReportResultFactory.Money(totalIssues));
        report.AddStat("Avg On-Hand Value", ReportResultFactory.Money(totalAvgOnHand));
        report.AddStat("Turnover", ReportResultFactory.Num(overallTurnover));
        report.SummaryNote =
            "Issues cost proxy = Σ Abs(Quantity) × UnitCost from balance (or 0). " +
            "Avg on-hand value from current InventoryBalance. Turnover = issues / avg on-hand when avg > 0. " +
            "Single snapshot used as average (beginning/ending inventory history not modeled).";

        var section = ReportResultFactory.Section(
                "Turnover by Item",
                "Item", "Issues Cost", "Avg On-Hand", "Turnover")
            .WithNumeric(1, 2, 3);
        foreach (var row in issuesByItem.OrderByDescending(x => x.Turnover).ThenBy(x => x.Item))
        {
            section.AddRow(
                row.Item,
                ReportResultFactory.Money(row.IssuesCost),
                ReportResultFactory.Money(row.AvgOnHand),
                ReportResultFactory.Num(row.Turnover));
        }

        report.Sections.Add(section);
        return report;
    }

    private static decimal? ResolveUnitCost(decimal? balanceUnitCost, decimal? masterUnitCost)
    {
        if (balanceUnitCost.HasValue)
            return balanceUnitCost.Value;
        if (masterUnitCost.HasValue && masterUnitCost.Value > 0)
            return masterUnitCost.Value;
        return null;
    }

    private static string ItemKey(int? productId, int? rawMaterialId) =>
        productId.HasValue ? $"P:{productId.Value}" :
        rawMaterialId.HasValue ? $"R:{rawMaterialId.Value}" :
        "Unknown";

    private static string ResolveItemName(
        string? productPartNo,
        string? productPartName,
        string? rawPartNo,
        string? rawPartName,
        int? productId,
        int? rawMaterialId)
    {
        if (productId.HasValue)
        {
            var label = FormatPart(productPartNo, productPartName);
            return !string.IsNullOrWhiteSpace(label) ? label : $"Product #{productId.Value}";
        }

        if (rawMaterialId.HasValue)
        {
            var label = FormatPart(rawPartNo, rawPartName);
            return !string.IsNullOrWhiteSpace(label) ? label : $"Material #{rawMaterialId.Value}";
        }

        return "Unknown";
    }

    /// <summary>Part number (or name) suitable for Inventory list ?search= matching.</summary>
    private static string ResolveSearchKey(
        string? productPartNo,
        string? productPartName,
        string? rawPartNo,
        string? rawPartName,
        int? productId,
        int? rawMaterialId)
    {
        if (productId.HasValue)
        {
            var no = (productPartNo ?? "").Trim();
            if (!string.IsNullOrEmpty(no)) return no;
            var name = (productPartName ?? "").Trim();
            return !string.IsNullOrEmpty(name) ? name : $"Product #{productId.Value}";
        }

        if (rawMaterialId.HasValue)
        {
            var no = (rawPartNo ?? "").Trim();
            if (!string.IsNullOrEmpty(no)) return no;
            var name = (rawPartName ?? "").Trim();
            return !string.IsNullOrEmpty(name) ? name : $"Material #{rawMaterialId.Value}";
        }

        return "Unknown";
    }

    private static string FormatPart(string? partNo, string? partName)
    {
        var no = (partNo ?? "").Trim();
        var name = (partName ?? "").Trim();
        if (string.IsNullOrEmpty(no) && string.IsNullOrEmpty(name))
            return "";
        if (string.IsNullOrEmpty(no))
            return name;
        if (string.IsNullOrEmpty(name))
            return no;
        return $"{no} — {name}";
    }
}
