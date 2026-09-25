using System.Text.Json;
using CimmpleAPI.Data;
using Microsoft.EntityFrameworkCore;

namespace CimmpleAPI.Services;

/// <summary>
/// Operations BI reports: completion time, OTD, efficiency, workstation hours, process performance.
/// Location filter via JobOrderMaster.CustomerOrderID → CustomerOrder.OrderID → locationId.
/// </summary>
public static class OperationsReportsService
{
    private static readonly HashSet<string> ClosedStatuses = new(StringComparer.OrdinalIgnoreCase)
    {
        "Completed",
        "Shipped",
    };

    private static readonly HashSet<string> CancelledStatuses = new(StringComparer.OrdinalIgnoreCase)
    {
        "Cancelled",
        "Canceled",
    };

    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNameCaseInsensitive = true,
    };

    private sealed class RoutingStepParse
    {
        public int? processId { get; set; }
        public string? processName { get; set; }
        public int? workstationId { get; set; }
        public string? workstationName { get; set; }
        public int? estimatedTime { get; set; }
        public int? elapsedSeconds { get; set; }
        public int? elapsedTime { get; set; }
        public string? status { get; set; }
        public string? startTime { get; set; }
    }

    public static ReportResultDto BuildJobCompletionTime(
        CimmpleDbContext db,
        int tenantId,
        DateTime startDate,
        DateTime endDate,
        int? locationId = null, IReadOnlyList<int>? restrictToLocationIds = null)
    {
        var start = startDate.Date;
        var endExclusive = endDate.Date.AddDays(1);
        var report = ReportResultFactory.Create(
            "job-completion-time",
            "Job Completion Time",
            start,
            endDate.Date,
            locationId);

        var jobs = QueryJobs(db, tenantId, locationId, restrictToLocationIds)
            .Where(j => j.OrderDate >= start && j.OrderDate < endExclusive)
            .ToList()
            .Where(j => ClosedStatuses.Contains(j.Status ?? ""))
            .ToList();

        var leadDays = new List<double>(jobs.Count);
        var table = ReportResultFactory.Section(
                "Completed jobs",
                "JO #", "Customer", "Part", "Order", "Completed", "Lead Days")
            .WithNumeric(5);

        foreach (var j in jobs.OrderByDescending(x => x.OrderDate).ThenByDescending(x => x.JobOrderNumber))
        {
            var completed = CompletionDate(j);
            var lead = (completed.Date - j.OrderDate.Date).TotalDays;
            leadDays.Add(lead);
            var joLabel = FormatJobOrderNumber(j.JobOrderNumber);
            table.AddRow(
                new ReportRowMetaDto
                {
                    EntityType = "job",
                    EntityId = j.JobOrderID,
                    Title = joLabel,
                    LinkPath = "/job-orders",
                    Details = new List<ReportDrillItemDto>
                    {
                        new()
                        {
                            Label = joLabel,
                            SubLabel = j.CustomerName ?? "",
                            Date = completed.ToString("yyyy-MM-dd"),
                            Amount = ReportResultFactory.Days(lead),
                            Status = j.Status ?? "Completed",
                            EntityId = j.JobOrderID,
                            LinkPath = "/job-orders"
                        }
                    }
                },
                joLabel,
                j.CustomerName ?? "",
                FormatPart(j.PartNo, j.PartName),
                j.OrderDate.ToString("yyyy-MM-dd"),
                completed.ToString("yyyy-MM-dd"),
                ReportResultFactory.Days(lead));
        }

        report.Sections.Add(table);
        report.AddStat("Jobs", ReportResultFactory.Num(jobs.Count));
        report.AddStat(
            "Avg lead days",
            leadDays.Count == 0 ? "—" : ReportResultFactory.Days(leadDays.Average()));
        report.AddStat(
            "Median lead days",
            leadDays.Count == 0 ? "—" : ReportResultFactory.Days(Median(leadDays)));

        var tracked = jobs
            .Where(j => j.EnableJobTracking && !string.IsNullOrWhiteSpace(j.RoutingStepsJson))
            .ToList();
        if (tracked.Count > 0)
        {
            var byProcess = new Dictionary<string, (int Count, double Hours, List<(Data.Models.JobOrderMaster Job, double Hours)> Items)>(
                StringComparer.OrdinalIgnoreCase);
            foreach (var j in tracked)
            {
                foreach (var step in ParseSteps(j.RoutingStepsJson))
                {
                    var name = string.IsNullOrWhiteSpace(step.processName) ? "(unnamed)" : step.processName.Trim();
                    var hours = GetElapsedSeconds(step) / 3600d;
                    if (!byProcess.TryGetValue(name, out var agg))
                        agg = (0, 0, new List<(Data.Models.JobOrderMaster, double)>());
                    agg.Items.Add((j, hours));
                    byProcess[name] = (agg.Count + 1, agg.Hours + hours, agg.Items);
                }
            }

            if (byProcess.Count > 0)
            {
                var processSection = ReportResultFactory.Section(
                        "Avg elapsed hours by process",
                        "Process", "Steps", "Avg Hours")
                    .WithNumeric(1, 2);
                foreach (var kv in byProcess.OrderByDescending(x => x.Value.Hours).ThenBy(x => x.Key))
                {
                    var avg = kv.Value.Count == 0 ? 0 : kv.Value.Hours / kv.Value.Count;
                    // One drill row per job (sum hours if multiple steps of same process on a job)
                    var jobDetails = kv.Value.Items
                        .GroupBy(x => x.Job.JobOrderID)
                        .Select(g =>
                        {
                            var job = g.First().Job;
                            var joLabel = FormatJobOrderNumber(job.JobOrderNumber);
                            return new ReportDrillItemDto
                            {
                                Label = joLabel,
                                SubLabel = job.CustomerName ?? "",
                                Date = job.OrderDate.ToString("yyyy-MM-dd"),
                                Amount = ReportResultFactory.Num((decimal)g.Sum(x => x.Hours)),
                                Status = job.Status ?? "",
                                EntityId = job.JobOrderID,
                                LinkPath = "/job-orders"
                            };
                        })
                        .OrderByDescending(d => d.Label)
                        .ToList();

                    processSection.AddRow(
                        new ReportRowMetaDto
                        {
                            EntityType = "process",
                            EntityKey = kv.Key,
                            Title = $"Process — {kv.Key}",
                            LinkPath = "/job-orders",
                            Details = jobDetails
                        },
                        kv.Key,
                        ReportResultFactory.Num(kv.Value.Count),
                        ReportResultFactory.Num((decimal)avg));
                }
                report.Sections.Add(processSection);
            }
        }

        return report;
    }

    public static ReportResultDto BuildOnTimeDelivery(
        CimmpleDbContext db,
        int tenantId,
        DateTime startDate,
        DateTime endDate,
        int? locationId = null, IReadOnlyList<int>? restrictToLocationIds = null)
    {
        var start = startDate.Date;
        var endExclusive = endDate.Date.AddDays(1);
        var report = ReportResultFactory.Create(
            "on-time-delivery",
            "On-Time Delivery",
            start,
            endDate.Date,
            locationId);

        var jobs = QueryJobs(db, tenantId, locationId, restrictToLocationIds)
            .Where(j => j.DueDate >= start && j.DueDate < endExclusive)
            .ToList()
            .Where(j => !CancelledStatuses.Contains(j.Status ?? ""))
            .ToList();

        var table = ReportResultFactory.Section(
            "Jobs due in period",
            "JO #", "Customer", "Part", "Due", "Completed On", "Status", "On Time");

        var onTimeCount = 0;
        foreach (var j in jobs.OrderBy(x => x.DueDate).ThenBy(x => x.JobOrderNumber))
        {
            var status = j.Status ?? "";
            var isClosed = ClosedStatuses.Contains(status);
            var completed = CompletionDate(j);
            var onTime = isClosed && completed.Date <= j.DueDate.Date;
            if (onTime) onTimeCount++;

            var joLabel = FormatJobOrderNumber(j.JobOrderNumber);
            table.AddRow(
                new ReportRowMetaDto
                {
                    EntityType = "job",
                    EntityId = j.JobOrderID,
                    Title = joLabel,
                    LinkPath = "/job-orders",
                    Details = new List<ReportDrillItemDto>
                    {
                        new()
                        {
                            Label = joLabel,
                            SubLabel = j.CustomerName ?? "",
                            Date = j.DueDate.ToString("yyyy-MM-dd"),
                            Status = onTime ? "On time" : (isClosed ? "Late" : status),
                            EntityId = j.JobOrderID,
                            LinkPath = "/job-orders"
                        }
                    }
                },
                joLabel,
                j.CustomerName ?? "",
                FormatPart(j.PartNo, j.PartName),
                j.DueDate.ToString("yyyy-MM-dd"),
                isClosed ? completed.ToString("yyyy-MM-dd") : "—",
                status,
                onTime ? "Yes" : "No");
        }

        report.Sections.Add(table);
        var dueCount = jobs.Count;
        var rate = dueCount == 0 ? 0m : (decimal)onTimeCount / dueCount * 100m;
        report.AddStat("Due", ReportResultFactory.Num(dueCount));
        report.AddStat("On time", ReportResultFactory.Num(onTimeCount));
        report.AddStat("On-time rate", ReportResultFactory.Pct(rate), warn: dueCount > 0 && rate < 90m);

        return report;
    }

    public static ReportResultDto BuildProductionEfficiency(
        CimmpleDbContext db,
        int tenantId,
        DateTime startDate,
        DateTime endDate,
        int? locationId = null, IReadOnlyList<int>? restrictToLocationIds = null)
    {
        var start = startDate.Date;
        var endExclusive = endDate.Date.AddDays(1);
        var report = ReportResultFactory.Create(
            "production-efficiency",
            "Production Efficiency",
            start,
            endDate.Date,
            locationId);

        var jobs = QueryJobs(db, tenantId, locationId, restrictToLocationIds)
            .Where(j => j.OrderDate >= start && j.OrderDate < endExclusive)
            .ToList()
            .Where(j => j.EnableJobTracking && !string.IsNullOrWhiteSpace(j.RoutingStepsJson))
            .ToList();

        var byProcess = new Dictionary<string, (int Steps, decimal EstMin, decimal ActualMin)>(
            StringComparer.OrdinalIgnoreCase);

        foreach (var j in jobs)
        {
            foreach (var step in ParseSteps(j.RoutingStepsJson))
            {
                var name = string.IsNullOrWhiteSpace(step.processName) ? "(unnamed)" : step.processName.Trim();
                var est = step.estimatedTime ?? 0;
                var actual = (decimal)(GetElapsedSeconds(step) / 60d);
                if (!byProcess.TryGetValue(name, out var agg))
                    agg = (0, 0, 0);
                byProcess[name] = (agg.Steps + 1, agg.EstMin + est, agg.ActualMin + actual);
            }
        }

        var table = ReportResultFactory.Section(
                "Efficiency by process",
                "Process", "Steps", "Est Min", "Actual Min", "Efficiency %")
            .WithNumeric(1, 2, 3, 4);

        var efficiencies = new List<decimal>();
        foreach (var kv in byProcess.OrderBy(x => x.Key))
        {
            var eff = kv.Value.ActualMin > 0
                ? kv.Value.EstMin / kv.Value.ActualMin * 100m
                : 0m;
            if (kv.Value.ActualMin > 0)
                efficiencies.Add(eff);
            table.AddRow(
                kv.Key,
                ReportResultFactory.Num(kv.Value.Steps),
                ReportResultFactory.Num(kv.Value.EstMin),
                ReportResultFactory.Num(kv.Value.ActualMin),
                kv.Value.ActualMin > 0 ? ReportResultFactory.Pct(eff) : "—");
        }

        report.Sections.Add(table);
        report.AddStat("Jobs tracked", ReportResultFactory.Num(jobs.Count));
        report.AddStat(
            "Avg efficiency",
            efficiencies.Count == 0 ? "—" : ReportResultFactory.Pct(efficiencies.Average()));

        if (byProcess.Count == 0)
        {
            report.SummaryNote =
                "No job-tracking routing data in this period. Enable job tracking and record step times to populate efficiency.";
        }

        return report;
    }

    public static ReportResultDto BuildWorkstationUtilization(
        CimmpleDbContext db,
        int tenantId,
        DateTime startDate,
        DateTime endDate,
        int? locationId = null, IReadOnlyList<int>? restrictToLocationIds = null)
    {
        var start = startDate.Date;
        var endExclusive = endDate.Date.AddDays(1);
        var report = ReportResultFactory.Create(
            "workstation-utilization",
            "Workstation Utilization",
            start,
            endDate.Date,
            locationId);

        var jobs = QueryJobs(db, tenantId, locationId, restrictToLocationIds)
            .Where(j => j.OrderDate >= start && j.OrderDate < endExclusive)
            .ToList()
            .Where(j => j.EnableJobTracking && !string.IsNullOrWhiteSpace(j.RoutingStepsJson))
            .ToList();

        var byWs = new Dictionary<string, (int Steps, double Seconds)>(StringComparer.OrdinalIgnoreCase);
        foreach (var j in jobs)
        {
            foreach (var step in ParseSteps(j.RoutingStepsJson))
            {
                var name = string.IsNullOrWhiteSpace(step.workstationName)
                    ? "(unnamed)"
                    : step.workstationName.Trim();
                var sec = GetElapsedSeconds(step);
                if (!byWs.TryGetValue(name, out var agg))
                    agg = (0, 0);
                byWs[name] = (agg.Steps + 1, agg.Seconds + sec);
            }
        }

        var table = ReportResultFactory.Section(
                "Hours by workstation",
                "Workstation", "Steps", "Hours")
            .WithNumeric(1, 2);

        foreach (var kv in byWs.OrderByDescending(x => x.Value.Seconds).ThenBy(x => x.Key))
        {
            table.AddRow(
                kv.Key,
                ReportResultFactory.Num(kv.Value.Steps),
                ReportResultFactory.Num((decimal)(kv.Value.Seconds / 3600.0)));
        }

        report.Sections.Add(table);
        report.AddStat("Workstations", ReportResultFactory.Num(byWs.Count));
        report.AddStat(
            "Total hours",
            ReportResultFactory.Num((decimal)(byWs.Values.Sum(v => v.Seconds) / 3600.0)));
        report.SummaryNote =
            "No calendar capacity configured — hours reflect recorded elapsed time only, not utilization % against available capacity.";

        return report;
    }

    public static ReportResultDto BuildProcessPerformance(
        CimmpleDbContext db,
        int tenantId,
        DateTime startDate,
        DateTime endDate,
        int? locationId = null, IReadOnlyList<int>? restrictToLocationIds = null)
    {
        var start = startDate.Date;
        var endExclusive = endDate.Date.AddDays(1);
        var report = ReportResultFactory.Create(
            "process-performance",
            "Process Performance",
            start,
            endDate.Date,
            locationId);

        var jobs = QueryJobs(db, tenantId, locationId, restrictToLocationIds)
            .Where(j => j.OrderDate >= start && j.OrderDate < endExclusive)
            .ToList()
            .Where(j => j.EnableJobTracking && !string.IsNullOrWhiteSpace(j.RoutingStepsJson))
            .ToList();

        var byProcess = new Dictionary<string, (int Steps, int Completed, decimal EstMin, decimal ActualMin)>(
            StringComparer.OrdinalIgnoreCase);

        foreach (var j in jobs)
        {
            foreach (var step in ParseSteps(j.RoutingStepsJson))
            {
                var name = string.IsNullOrWhiteSpace(step.processName) ? "(unnamed)" : step.processName.Trim();
                var est = step.estimatedTime ?? 0;
                var actual = (decimal)(GetElapsedSeconds(step) / 60d);
                var completed = string.Equals(step.status, "Completed", StringComparison.OrdinalIgnoreCase) ? 1 : 0;
                if (!byProcess.TryGetValue(name, out var agg))
                    agg = (0, 0, 0, 0);
                byProcess[name] = (
                    agg.Steps + 1,
                    agg.Completed + completed,
                    agg.EstMin + est,
                    agg.ActualMin + actual);
            }
        }

        var table = ReportResultFactory.Section(
                "Process performance",
                "Process", "Steps", "Completed", "Est Min", "Actual Min", "Efficiency %")
            .WithNumeric(1, 2, 3, 4, 5);

        var efficiencies = new List<decimal>();
        foreach (var kv in byProcess.OrderBy(x => x.Key))
        {
            var eff = kv.Value.ActualMin > 0
                ? kv.Value.EstMin / kv.Value.ActualMin * 100m
                : 0m;
            if (kv.Value.ActualMin > 0)
                efficiencies.Add(eff);
            table.AddRow(
                kv.Key,
                ReportResultFactory.Num(kv.Value.Steps),
                ReportResultFactory.Num(kv.Value.Completed),
                ReportResultFactory.Num(kv.Value.EstMin),
                ReportResultFactory.Num(kv.Value.ActualMin),
                kv.Value.ActualMin > 0 ? ReportResultFactory.Pct(eff) : "—");
        }

        report.Sections.Add(table);
        report.AddStat("Processes", ReportResultFactory.Num(byProcess.Count));
        report.AddStat("Jobs tracked", ReportResultFactory.Num(jobs.Count));
        report.AddStat(
            "Avg efficiency",
            efficiencies.Count == 0 ? "—" : ReportResultFactory.Pct(efficiencies.Average()));

        if (byProcess.Count == 0)
        {
            report.SummaryNote =
                "No job-tracking routing data in this period.";
        }

        return report;
    }

    private static IQueryable<Data.Models.JobOrderMaster> QueryJobs(
        CimmpleDbContext db,
        int tenantId,
        int? locationId, IReadOnlyList<int>? restrictToLocationIds = null)
    {
        var query =
            from j in db.JobOrderMaster.AsNoTracking()
            where j.Tenantid == tenantId
            join o in db.CustomerOrder.AsNoTracking().Where(x => x.Tenantid == tenantId)
                on j.CustomerOrderID equals o.OrderID into orderGroup
            from o in orderGroup.DefaultIfEmpty()
            select new { Job = j, LocationId = o != null ? o.locationId : 0 };

        var allowed = ReportLocationScope.Resolve(locationId, restrictToLocationIds);
        if (allowed != null)
        {
            query = allowed.Count == 0
                ? query.Where(_ => false)
                : query.Where(x => allowed.Contains(x.LocationId));
        }

        return query.Select(x => x.Job);
    }

    private static DateTime CompletionDate(Data.Models.JobOrderMaster j) =>
        (j.ModifiedDate ?? (j.CreatedDate == default ? (DateTime?)null : j.CreatedDate) ?? j.OrderDate);

    private static string FormatPart(string? partNo, string? partName)
    {
        var no = partNo?.Trim() ?? "";
        var name = partName?.Trim() ?? "";
        if (string.IsNullOrEmpty(no)) return name;
        if (string.IsNullOrEmpty(name)) return no;
        return $"{no} — {name}";
    }

    private static string FormatJobOrderNumber(int number) =>
        number < 1000 ? $"JO#{number + 999}" : $"JO#{number}";

    private static List<RoutingStepParse> ParseSteps(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
            return new List<RoutingStepParse>();
        try
        {
            return JsonSerializer.Deserialize<List<RoutingStepParse>>(json, JsonOpts)
                   ?? new List<RoutingStepParse>();
        }
        catch (JsonException)
        {
            return new List<RoutingStepParse>();
        }
    }

    private static double GetElapsedSeconds(RoutingStepParse step)
    {
        if (step.elapsedSeconds.HasValue && step.elapsedSeconds.Value >= 0)
            return step.elapsedSeconds.Value;
        return (step.elapsedTime ?? 0) * 60d;
    }

    private static double Median(List<double> values)
    {
        if (values.Count == 0) return 0;
        var sorted = values.OrderBy(v => v).ToList();
        var mid = sorted.Count / 2;
        if (sorted.Count % 2 == 0)
            return (sorted[mid - 1] + sorted[mid]) / 2.0;
        return sorted[mid];
    }
}
