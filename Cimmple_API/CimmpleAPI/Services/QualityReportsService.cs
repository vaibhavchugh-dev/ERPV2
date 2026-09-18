using CimmpleAPI.Data;
using Microsoft.EntityFrameworkCore;

namespace CimmpleAPI.Services;

/// <summary>
/// Quality metrics operational reports (NCR trends, defect rate, cost, root cause).
/// NCR has no locationId — location filter is accepted but ignored with a SummaryNote.
/// </summary>
public static class QualityReportsService
{
    public static ReportResultDto BuildNcrTrends(
        CimmpleDbContext db,
        int tenantId,
        DateTime startDate,
        DateTime endDate,
        int? locationId = null)
    {
        var start = startDate.Date;
        var endExclusive = endDate.Date.AddDays(1);
        var report = ReportResultFactory.Create(
            "ncr-trends",
            "NCR Trends Over Time",
            startDate.Date,
            endDate.Date,
            locationId);

        var ncrs = db.NonConformanceReports.AsNoTracking()
            .Where(n => n.TenantId == tenantId
                        && n.ReportedDate >= start
                        && n.ReportedDate < endExclusive)
            .Select(n => new
            {
                n.NcrId,
                NcrNumber = n.NcrNumber ?? "",
                n.ReportedDate,
                Status = n.Status ?? "",
                Severity = n.Severity ?? "",
                Title = n.Title ?? ""
            })
            .ToList()
            .Select(n => new NcrTrendRow
            {
                NcrId = n.NcrId,
                NcrNumber = n.NcrNumber,
                ReportedDate = n.ReportedDate,
                Status = n.Status,
                Severity = n.Severity,
                Title = n.Title
            })
            .ToList();

        var closed = ncrs.Count(n => string.Equals(n.Status, "Closed", StringComparison.OrdinalIgnoreCase));
        var open = ncrs.Count - closed;

        report.AddStat("Total NCRs", ReportResultFactory.Num(ncrs.Count));
        report.AddStat("Open", ReportResultFactory.Num(open));
        report.AddStat("Closed", ReportResultFactory.Num(closed));
        NoteLocationIgnored(report, locationId);

        var byMonth = ncrs
            .GroupBy(n => new { n.ReportedDate.Year, n.ReportedDate.Month })
            .OrderBy(g => g.Key.Year).ThenBy(g => g.Key.Month)
            .Select(g => new
            {
                Month = $"{g.Key.Year:D4}-{g.Key.Month:D2}",
                Count = g.Count(),
                Open = g.Count(x => !string.Equals(x.Status, "Closed", StringComparison.OrdinalIgnoreCase)),
                Closed = g.Count(x => string.Equals(x.Status, "Closed", StringComparison.OrdinalIgnoreCase)),
                Items = g.OrderByDescending(x => x.ReportedDate).ToList()
            })
            .ToList();

        var monthSection = ReportResultFactory.Section(
                "By Month (Reported Date)",
                "Month", "NCRs", "Open", "Closed")
            .WithNumeric(1, 2, 3);
        foreach (var row in byMonth)
        {
            monthSection.AddRow(
                new ReportRowMetaDto
                {
                    EntityType = "ncr-bucket",
                    EntityKey = row.Month,
                    Title = $"NCRs — {row.Month}",
                    LinkPath = "/quality",
                    Details = row.Items.Select(ToNcrDrillItem).ToList()
                },
                row.Month,
                ReportResultFactory.Num(row.Count),
                ReportResultFactory.Num(row.Open),
                ReportResultFactory.Num(row.Closed));
        }
        report.Sections.Add(monthSection);

        var byStatus = ncrs
            .GroupBy(n => string.IsNullOrWhiteSpace(n.Status) ? "Unknown" : n.Status)
            .OrderByDescending(g => g.Count())
            .ThenBy(g => g.Key);
        var statusSection = ReportResultFactory.Section("By Status", "Status", "Count").WithNumeric(1);
        foreach (var g in byStatus)
        {
            statusSection.AddRow(
                new ReportRowMetaDto
                {
                    EntityType = "ncr-bucket",
                    EntityKey = g.Key,
                    Title = $"Status: {g.Key}",
                    LinkPath = "/quality",
                    Details = g.OrderByDescending(x => x.ReportedDate).Select(ToNcrDrillItem).ToList()
                },
                g.Key,
                ReportResultFactory.Num(g.Count()));
        }
        report.Sections.Add(statusSection);

        var bySeverity = ncrs
            .GroupBy(n => string.IsNullOrWhiteSpace(n.Severity) ? "Unknown" : n.Severity)
            .OrderByDescending(g => g.Count())
            .ThenBy(g => g.Key);
        var severitySection = ReportResultFactory.Section("By Severity", "Severity", "Count").WithNumeric(1);
        foreach (var g in bySeverity)
        {
            severitySection.AddRow(
                new ReportRowMetaDto
                {
                    EntityType = "ncr-bucket",
                    EntityKey = g.Key,
                    Title = $"Severity: {g.Key}",
                    LinkPath = "/quality",
                    Details = g.OrderByDescending(x => x.ReportedDate).Select(ToNcrDrillItem).ToList()
                },
                g.Key,
                ReportResultFactory.Num(g.Count()));
        }
        report.Sections.Add(severitySection);

        return report;
    }

    private sealed class NcrTrendRow
    {
        public int NcrId { get; set; }
        public string NcrNumber { get; set; } = "";
        public DateTime ReportedDate { get; set; }
        public string Status { get; set; } = "";
        public string Severity { get; set; } = "";
        public string Title { get; set; } = "";
    }

    private static ReportDrillItemDto ToNcrDrillItem(NcrTrendRow n) =>
        new()
        {
            Label = string.IsNullOrWhiteSpace(n.NcrNumber) ? $"NCR #{n.NcrId}" : n.NcrNumber,
            SubLabel = Truncate(n.Title, 80),
            Date = n.ReportedDate.ToString("yyyy-MM-dd"),
            Status = string.IsNullOrWhiteSpace(n.Status) ? "—" : n.Status,
            EntityId = n.NcrId,
            LinkPath = "/quality"
        };

    private static string Truncate(string value, int max) =>
        string.IsNullOrEmpty(value) ? "" : (value.Length <= max ? value : value[..(max - 1)] + "…");

    public static ReportResultDto BuildDefectRate(
        CimmpleDbContext db,
        int tenantId,
        DateTime startDate,
        DateTime endDate,
        int? locationId = null)
    {
        var start = startDate.Date;
        var endExclusive = endDate.Date.AddDays(1);
        var report = ReportResultFactory.Create(
            "defect-rate",
            "Defect Rate by Process",
            startDate.Date,
            endDate.Date,
            locationId);

        var ncrs = db.NonConformanceReports.AsNoTracking()
            .Where(n => n.TenantId == tenantId
                        && n.ReportedDate >= start
                        && n.ReportedDate < endExclusive)
            .Select(n => new
            {
                n.NcrNumber,
                PartNo = n.PartNo ?? "",
                n.DefectQuantity,
                n.TotalQuantity,
            })
            .OrderByDescending(n => n.DefectQuantity)
            .ToList();

        var defectSum = ncrs.Sum(n => n.DefectQuantity);
        var totalSum = ncrs.Where(n => n.TotalQuantity > 0).Sum(n => n.TotalQuantity);
        var overallRate = totalSum > 0 ? (decimal)defectSum / totalSum * 100m : 0m;

        report.AddStat("NCR Count", ReportResultFactory.Num(ncrs.Count));
        report.AddStat("Defect Qty", ReportResultFactory.Num(defectSum));
        report.AddStat("Total Qty", ReportResultFactory.Num(totalSum));
        report.AddStat("Defect Rate", ReportResultFactory.Pct(overallRate));
        NoteLocationIgnored(report, locationId,
            "Defect rate = sum(DefectQuantity) / sum(TotalQuantity) for NCRs with TotalQuantity > 0.");

        var section = ReportResultFactory.Section(
                "NCR Defect Rates",
                "NCR#", "Part", "Defect Qty", "Total Qty", "Rate")
            .WithNumeric(2, 3, 4);
        foreach (var n in ncrs)
        {
            var rate = n.TotalQuantity > 0
                ? (decimal)n.DefectQuantity / n.TotalQuantity * 100m
                : 0m;
            section.AddRow(
                n.NcrNumber ?? "",
                string.IsNullOrWhiteSpace(n.PartNo) ? "—" : n.PartNo,
                ReportResultFactory.Num(n.DefectQuantity),
                ReportResultFactory.Num(n.TotalQuantity),
                n.TotalQuantity > 0 ? ReportResultFactory.Pct(rate) : "—");
        }

        report.Sections.Add(section);
        return report;
    }

    public static ReportResultDto BuildQualityCost(
        CimmpleDbContext db,
        int tenantId,
        DateTime startDate,
        DateTime endDate,
        int? locationId = null)
    {
        var start = startDate.Date;
        var endExclusive = endDate.Date.AddDays(1);
        var report = ReportResultFactory.Create(
            "quality-cost",
            "Quality Cost Analysis",
            startDate.Date,
            endDate.Date,
            locationId);

        var ncrs = db.NonConformanceReports.AsNoTracking()
            .Where(n => n.TenantId == tenantId
                        && n.ReportedDate >= start
                        && n.ReportedDate < endExclusive)
            .Select(n => new
            {
                Category = n.Category ?? "Unknown",
                Cost = n.CostImpact ?? 0m,
            })
            .ToList();

        var byCategory = ncrs
            .GroupBy(n => string.IsNullOrWhiteSpace(n.Category) ? "Unknown" : n.Category)
            .Select(g => new { Category = g.Key, Cost = g.Sum(x => x.Cost), Count = g.Count() })
            .OrderByDescending(x => x.Cost)
            .ThenBy(x => x.Category)
            .ToList();

        var totalCost = byCategory.Sum(x => x.Cost);
        report.AddStat("Total Cost Impact", ReportResultFactory.Money(totalCost));
        report.AddStat("NCRs", ReportResultFactory.Num(ncrs.Count));
        NoteLocationIgnored(report, locationId,
            "CostImpact summed by Category. Prevention and appraisal costs are not modeled.");

        var section = ReportResultFactory.Section(
                "Cost by Category",
                "Category", "Cost Impact", "NCRs")
            .WithNumeric(1, 2);
        foreach (var row in byCategory)
            section.AddRow(row.Category, ReportResultFactory.Money(row.Cost), ReportResultFactory.Num(row.Count));
        report.Sections.Add(section);

        return report;
    }

    public static ReportResultDto BuildRootCauseAnalysis(
        CimmpleDbContext db,
        int tenantId,
        DateTime startDate,
        DateTime endDate,
        int? locationId = null)
    {
        var start = startDate.Date;
        var endExclusive = endDate.Date.AddDays(1);
        var report = ReportResultFactory.Create(
            "root-cause-analysis",
            "Root Cause Analysis Summary",
            startDate.Date,
            endDate.Date,
            locationId);

        var ncrs = db.NonConformanceReports.AsNoTracking()
            .Where(n => n.TenantId == tenantId
                        && n.ReportedDate >= start
                        && n.ReportedDate < endExclusive)
            .Select(n => new
            {
                Category = n.RootCauseCategory ?? "",
                RootCause = n.RootCause ?? "",
            })
            .ToList();

        report.AddStat("NCRs Analyzed", ReportResultFactory.Num(ncrs.Count));
        NoteLocationIgnored(report, locationId);

        var byCategory = ncrs
            .GroupBy(n => string.IsNullOrWhiteSpace(n.Category) ? "Unspecified" : n.Category)
            .Select(g => new { Category = g.Key, Count = g.Count() })
            .OrderByDescending(x => x.Count)
            .ThenBy(x => x.Category)
            .ToList();

        var catSection = ReportResultFactory.Section(
                "By Root Cause Category",
                "Category", "Frequency")
            .WithNumeric(1);
        foreach (var row in byCategory)
            catSection.AddRow(row.Category, ReportResultFactory.Num(row.Count));
        report.Sections.Add(catSection);

        var topCauses = ncrs
            .Where(n => !string.IsNullOrWhiteSpace(n.RootCause))
            .GroupBy(n => n.RootCause.Trim())
            .Select(g => new { RootCause = g.Key, Count = g.Count() })
            .OrderByDescending(x => x.Count)
            .ThenBy(x => x.RootCause)
            .Take(25)
            .ToList();

        var causeSection = ReportResultFactory.Section(
                "Top Root Causes",
                "Root Cause", "Frequency")
            .WithNumeric(1);
        foreach (var row in topCauses)
            causeSection.AddRow(row.RootCause, ReportResultFactory.Num(row.Count));
        report.Sections.Add(causeSection);

        return report;
    }

    private static void NoteLocationIgnored(ReportResultDto report, int? locationId, string? extra = null)
    {
        var parts = new List<string>();
        if (locationId.HasValue && locationId.Value > 0)
            parts.Add("NCR data is tenant-wide (no locationId); location filter was ignored.");
        if (!string.IsNullOrWhiteSpace(extra))
            parts.Add(extra);
        if (parts.Count > 0)
            report.SummaryNote = string.Join(" ", parts);
    }
}
