using CimmpleAPI.Data;
using Microsoft.EntityFrameworkCore;

namespace CimmpleAPI.Services;

/// <summary>
/// Job Order Status Dashboard: status summary, overdue count, and job rows for a period.
/// Filters by OrderDate; location via linked CustomerOrder.locationId.
/// </summary>
public static class JobOrderStatusReportService
{
    private static readonly HashSet<string> ClosedStatuses = new(StringComparer.OrdinalIgnoreCase)
    {
        "Completed",
        "Shipped",
        "Cancelled",
        "Canceled",
    };

    public static ReportResultDto Build(
        CimmpleDbContext db,
        int tenantId,
        DateTime startDate,
        DateTime endDate,
        int? locationId = null)
    {
        var start = startDate.Date;
        var endExclusive = endDate.Date.AddDays(1);
        var today = DateTime.Now.Date;

        var query =
            from j in db.JobOrderMaster.AsNoTracking()
            where j.Tenantid == tenantId
                  && j.OrderDate >= start
                  && j.OrderDate < endExclusive
            join o in db.CustomerOrder.AsNoTracking().Where(x => x.Tenantid == tenantId)
                on j.CustomerOrderID equals o.OrderID into orderGroup
            from o in orderGroup.DefaultIfEmpty()
            select new
            {
                Job = j,
                OrderLocationId = o != null ? o.locationId : 0,
            };

        if (locationId.HasValue && locationId.Value > 0)
        {
            var locId = locationId.Value;
            query = query.Where(x => x.OrderLocationId == locId);
        }

        var rows = query
            .OrderByDescending(x => x.Job.OrderDate)
            .ThenByDescending(x => x.Job.JobOrderNumber)
            .Select(x => new
            {
                x.Job.JobOrderNumber,
                CustomerName = x.Job.CustomerName ?? "",
                PartNo = x.Job.PartNo ?? "",
                PartName = x.Job.PartName ?? "",
                x.Job.QtyOrdered,
                Unit = x.Job.Unit ?? "",
                Status = x.Job.Status ?? "Draft",
                x.Job.OrderDate,
                x.Job.DueDate,
            })
            .ToList();

        var jobs = rows.Select(r =>
        {
            var status = string.IsNullOrWhiteSpace(r.Status) ? "Draft" : r.Status;
            var isOverdue = r.DueDate.Date < today && !ClosedStatuses.Contains(status);
            return new
            {
                r.JobOrderNumber,
                r.CustomerName,
                r.PartNo,
                r.PartName,
                r.QtyOrdered,
                r.Unit,
                Status = status,
                OrderDate = r.OrderDate.ToString("yyyy-MM-dd"),
                DueDate = r.DueDate.ToString("yyyy-MM-dd"),
                IsOverdue = isOverdue,
            };
        }).ToList();

        var byStatus = jobs
            .GroupBy(j => j.Status)
            .OrderByDescending(g => g.Count())
            .ThenBy(g => g.Key)
            .ToList();

        var overdue = jobs.Count(j => j.IsOverdue);
        var open = jobs.Count(j => !ClosedStatuses.Contains(j.Status));

        var report = ReportResultFactory.Create(
            "job-status-dashboard",
            "Job Order Status Dashboard",
            start,
            endDate.Date,
            locationId);

        report.AddStat("Total", ReportResultFactory.Num(jobs.Count));
        report.AddStat("Open", ReportResultFactory.Num(open));
        report.AddStat("Overdue", ReportResultFactory.Num(overdue), warn: overdue > 0);

        if (jobs.Count == 0)
            report.SummaryNote = "No job orders found for this period and site.";

        var statusSection = ReportResultFactory.Section("By status", "Status", "Count")
            .WithNumeric(1);
        foreach (var g in byStatus)
            statusSection.AddRow(g.Key, ReportResultFactory.Num(g.Count()));
        report.Sections.Add(statusSection);

        var jobsSection = ReportResultFactory
            .Section("Job orders", "JO #", "Customer", "Part", "Qty", "Status", "Order", "Due", "Overdue")
            .WithNumeric(3);
        foreach (var j in jobs)
        {
            var part = string.Join(" — ", new[] { j.PartNo, j.PartName }.Where(s => !string.IsNullOrWhiteSpace(s)));
            jobsSection.AddRow(
                FormatJobOrderNumber(j.JobOrderNumber),
                j.CustomerName,
                string.IsNullOrWhiteSpace(part) ? "—" : part,
                $"{ReportResultFactory.Qty(j.QtyOrdered)}{(string.IsNullOrWhiteSpace(j.Unit) ? "" : " " + j.Unit)}",
                j.Status,
                j.OrderDate,
                j.DueDate,
                j.IsOverdue ? "Yes" : "");
        }
        report.Sections.Add(jobsSection);

        return report;
    }

    private static string FormatJobOrderNumber(int number) =>
        number < 1000 ? $"JO#{number + 999}" : $"JO#{number}";
}
