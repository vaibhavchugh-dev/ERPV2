using System.Globalization;
using CimmpleAPI.Data;
using CimmpleAPI.Data.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace CimmpleAPI.Services.Workflow
{
    /// <summary>
    /// Creates and updates coordination rows from the read-only projection.
    /// A repeated call does not insert a second task for the same source.
    /// Failures are logged by the Try* methods so a source save still succeeds.
    /// </summary>
    public sealed class WorkflowSyncService
    {
        private readonly CimmpleDbContext _context;
        private readonly WorkflowProjectionService _projection;
        private readonly ILogger<WorkflowSyncService> _logger;

        public WorkflowSyncService(
            CimmpleDbContext context,
            WorkflowProjectionService projection,
            ILogger<WorkflowSyncService> logger)
        {
            _context = context;
            _projection = projection;
            _logger = logger;
        }

        public async Task AttachStoredAsync(int tenantId, WorkflowOverviewDto overview)
        {
            if (overview.Workflows.Count == 0)
                return;

            var instances = await LoadInstancesAsync(tenantId, overview);
            if (instances.Count == 0)
                return;

            var instanceIds = instances.Select(i => i.Id).ToList();
            var tasks = await _context.WorkflowTasks.AsNoTracking()
                .Where(t => instanceIds.Contains(t.WorkflowInstanceId))
                .ToListAsync();
            await AttachAsync(overview, instances, tasks);
        }

        public async Task SyncOverviewAsync(int tenantId, WorkflowOverviewDto overview, int? actorUserId)
        {
            if (overview.Workflows.Count == 0)
                return;

            var now = DateTime.Now;
            var instances = await LoadInstancesAsync(tenantId, overview);
            var pendingEvents = new List<(WorkflowInstance Instance, string Type, string Summary)>();

            foreach (var row in overview.Workflows)
            {
                var instance = FindInstance(instances, row);
                var decision = WorkflowCoordination.ReconcileInstance(
                    instance?.Status,
                    instance?.PrincipalStageCode,
                    row.IsActive,
                    row.IsCancelled,
                    row.PrincipalStage);

                if (instance == null)
                {
                    instance = new WorkflowInstance
                    {
                        TenantId = tenantId,
                        CustomerOrderId = row.CustomerOrderId is > 0 ? row.CustomerOrderId : null,
                        QuotationId = row.QuotationId is > 0 ? row.QuotationId : null,
                        Status = decision.Status,
                        PrincipalStageCode = decision.StageCode,
                        CreatedAt = now,
                        UpdatedAt = now,
                    };
                    _context.WorkflowInstances.Add(instance);
                    instances.Add(instance);
                }
                else if (decision.EventType != null
                    || instance.Status != decision.Status
                    || instance.PrincipalStageCode != decision.StageCode)
                {
                    instance.Status = decision.Status;
                    instance.PrincipalStageCode = decision.StageCode;
                    instance.UpdatedAt = now;
                    if (row.QuotationId is > 0 && instance.QuotationId == null)
                        instance.QuotationId = row.QuotationId;
                }

                if (decision.EventType != null)
                    pendingEvents.Add((instance, decision.EventType, decision.EventSummary ?? ""));

                row.InstanceStatus = decision.Status;
            }

            CloseSupersededQuotations(overview, instances, pendingEvents, now);
            await _context.SaveChangesAsync();

            var instanceIds = instances.Where(i => i.Id > 0).Select(i => i.Id).ToList();
            var tasks = instanceIds.Count == 0
                ? new List<WorkflowTask>()
                : await _context.WorkflowTasks.Where(t => instanceIds.Contains(t.WorkflowInstanceId)).ToListAsync();

            foreach (var instance in instances.Where(i => i.Status == WorkflowCoordination.Closed))
            {
                if (overview.Workflows.Any(row => FindInstance(new List<WorkflowInstance> { instance }, row) != null))
                    continue;
                var stranded = tasks.Where(t => t.WorkflowInstanceId == instance.Id && t.Status == WorkflowCoordination.Open).ToList();
                if (stranded.Count == 0)
                    continue;
                ApplyTaskChanges(
                    tenantId,
                    instance,
                    stranded,
                    tasks,
                    WorkflowCoordination.ReconcileTasks(stranded.Select(ToState).ToList(), Array.Empty<DesiredTask>()),
                    actorUserId,
                    now);
            }

            foreach (var row in overview.Workflows)
            {
                var instance = FindInstance(instances, row);
                if (instance == null || instance.Id <= 0)
                    continue;

                var desired = WorkflowCoordination.PlanTasks(
                    WorkflowCoordination.SeedsFrom(overview.Actions.Where(a => a.WorkflowId == row.Id)));
                var owned = tasks.Where(t => t.WorkflowInstanceId == instance.Id).ToList();
                var changes = WorkflowCoordination.ReconcileTasks(owned.Select(ToState).ToList(), desired);
                ApplyTaskChanges(tenantId, instance, owned, tasks, changes, actorUserId, now);
                row.InstanceId = instance.Id;
                row.InstanceStatus = instance.Status;
            }

            foreach (var pending in pendingEvents)
            {
                _context.WorkflowEvents.Add(new WorkflowEvent
                {
                    TenantId = tenantId,
                    WorkflowInstanceId = pending.Instance.Id,
                    EventType = pending.Type,
                    Summary = pending.Summary,
                    ActorUserId = actorUserId is > 0 ? actorUserId : null,
                    CreatedAt = now,
                });
            }

            await _context.SaveChangesAsync();
            await AttachAsync(overview, instances, tasks);
        }

        public Task TryRefreshCustomerOrderAsync(int tenantId, int? orderId, int? actorUserId) =>
            Guard(tenantId, () => RefreshScopedAsync(tenantId, orderId, null, actorUserId));

        public async Task TryRefreshQuotationAsync(int tenantId, int quotationId, int? actorUserId)
        {
            if (tenantId <= 0 || quotationId <= 0)
                return;
            try
            {
                var converted = await _context.QuotationOrder.AsNoTracking()
                    .Where(q => q.Tenantid == tenantId && q.OrderID == quotationId)
                    .Select(q => q.convertedOrderId)
                    .FirstOrDefaultAsync();
                if (converted is > 0)
                {
                    await RefreshScopedAsync(tenantId, converted, null, actorUserId);
                    return;
                }

                var orderId = await _context.CustomerOrder.AsNoTracking()
                    .Where(o => o.Tenantid == tenantId && o.quotationId == quotationId)
                    .Select(o => (int?)o.OrderID)
                    .FirstOrDefaultAsync();
                if (orderId is > 0)
                {
                    await RefreshScopedAsync(tenantId, orderId, null, actorUserId);
                    return;
                }

                await RefreshScopedAsync(tenantId, null, quotationId, actorUserId);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Workflow refresh failed for quotation {QuotationId}", quotationId);
            }
        }

        public async Task TryRefreshJobAsync(int tenantId, int jobOrderId, int? actorUserId)
        {
            if (tenantId <= 0 || jobOrderId <= 0)
                return;
            try
            {
                var orderId = await _context.JobOrderMaster.AsNoTracking()
                    .Where(j => j.Tenantid == tenantId && j.JobOrderID == jobOrderId)
                    .Select(j => (int?)j.CustomerOrderID)
                    .FirstOrDefaultAsync();
                await TryRefreshCustomerOrderAsync(tenantId, orderId, actorUserId);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Workflow refresh failed for job {JobOrderId}", jobOrderId);
            }
        }

        public async Task TryRefreshNcrAsync(int tenantId, int ncrId, int? actorUserId)
        {
            if (tenantId <= 0 || ncrId <= 0)
                return;
            try
            {
                var jobId = await _context.NonConformanceReports.AsNoTracking()
                    .Where(n => n.TenantId == tenantId && n.NcrId == ncrId)
                    .Select(n => n.JobOrderId)
                    .FirstOrDefaultAsync();
                if (jobId is > 0)
                    await TryRefreshJobAsync(tenantId, jobId.Value, actorUserId);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Workflow refresh failed for NCR {NcrId}", ncrId);
            }
        }

        public async Task TryCloseCustomerOrderAsync(int tenantId, int orderId, int? actorUserId)
        {
            if (tenantId <= 0 || orderId <= 0)
                return;
            try
            {
                var instance = await _context.WorkflowInstances
                    .FirstOrDefaultAsync(i => i.TenantId == tenantId && i.CustomerOrderId == orderId);
                if (instance == null || instance.Status == WorkflowCoordination.Closed)
                    return;

                var now = DateTime.Now;
                instance.Status = WorkflowCoordination.Closed;
                instance.UpdatedAt = now;
                var tasks = await _context.WorkflowTasks
                    .Where(t => t.WorkflowInstanceId == instance.Id && t.Status == WorkflowCoordination.Open)
                    .ToListAsync();
                foreach (var task in tasks)
                {
                    task.Status = WorkflowCoordination.Completed;
                    task.CompletedAt = now;
                    task.UpdatedAt = now;
                    _context.WorkflowEvents.Add(Event(tenantId, instance.Id, task.Id, WorkflowCoordination.EventTaskCompleted, "Task completed because the customer order was deleted.", actorUserId, now));
                }

                _context.WorkflowEvents.Add(Event(tenantId, instance.Id, null, WorkflowCoordination.EventClosed, "Customer order was deleted.", actorUserId, now));
                await _context.SaveChangesAsync();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Workflow close failed for order {OrderId}", orderId);
            }
        }

        private async Task RefreshScopedAsync(int tenantId, int? orderId, int? quotationId, int? actorUserId)
        {
            var overview = await _projection.GetOverviewAsync(
                tenantId,
                null,
                null,
                null,
                orderId,
                quotationId);
            await SyncOverviewAsync(tenantId, overview, actorUserId);
        }

        private async Task Guard(int tenantId, Func<Task> action)
        {
            if (tenantId <= 0)
                return;
            try
            {
                await action();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Workflow refresh failed for tenant {TenantId}", tenantId);
            }
        }

        private async Task<List<WorkflowInstance>> LoadInstancesAsync(int tenantId, WorkflowOverviewDto overview)
        {
            var orderIds = overview.Workflows.Where(w => w.CustomerOrderId is > 0).Select(w => w.CustomerOrderId!.Value).Distinct().ToList();
            var quotationIds = overview.Workflows.Where(w => w.QuotationId is > 0).Select(w => w.QuotationId!.Value).Distinct().ToList();
            var instances = new List<WorkflowInstance>();
            if (orderIds.Count > 0)
            {
                instances.AddRange(await _context.WorkflowInstances
                    .Where(i => i.TenantId == tenantId && i.CustomerOrderId != null && orderIds.Contains(i.CustomerOrderId.Value))
                    .ToListAsync());
            }

            if (quotationIds.Count > 0)
            {
                var loaded = instances.Select(i => i.Id).ToHashSet();
                var quotations = await _context.WorkflowInstances
                    .Where(i => i.TenantId == tenantId && i.CustomerOrderId == null && i.QuotationId != null && quotationIds.Contains(i.QuotationId.Value))
                    .ToListAsync();
                instances.AddRange(quotations.Where(i => loaded.Add(i.Id)));
            }

            return instances;
        }

        private static WorkflowInstance? FindInstance(List<WorkflowInstance> instances, WorkflowRowDto row)
        {
            if (row.CustomerOrderId is > 0)
                return instances.FirstOrDefault(i => i.CustomerOrderId == row.CustomerOrderId);
            if (row.QuotationId is > 0)
                return instances.FirstOrDefault(i => i.CustomerOrderId == null && i.QuotationId == row.QuotationId);
            return null;
        }

        private void CloseSupersededQuotations(
            WorkflowOverviewDto overview,
            List<WorkflowInstance> instances,
            List<(WorkflowInstance Instance, string Type, string Summary)> pendingEvents,
            DateTime now)
        {
            var linked = overview.Workflows
                .Where(w => w.CustomerOrderId is > 0 && w.QuotationId is > 0)
                .Select(w => w.QuotationId!.Value)
                .ToHashSet();
            foreach (var instance in instances.Where(i => i.CustomerOrderId == null && i.QuotationId is > 0 && linked.Contains(i.QuotationId.Value)))
            {
                if (instance.Status == WorkflowCoordination.Closed)
                    continue;
                instance.Status = WorkflowCoordination.Closed;
                instance.UpdatedAt = now;
                pendingEvents.Add((instance, WorkflowCoordination.EventSuperseded, "Quotation workflow closed because the customer order exists."));
            }
        }

        private void ApplyTaskChanges(
            int tenantId,
            WorkflowInstance instance,
            List<WorkflowTask> owned,
            List<WorkflowTask> all,
            List<TaskChange> changes,
            int? actorUserId,
            DateTime now)
        {
            foreach (var change in changes)
            {
                WorkflowTask? task = null;
                if (change.Action == "Insert" && change.Desired != null)
                {
                    task = new WorkflowTask
                    {
                        TenantId = tenantId,
                        WorkflowInstanceId = instance.Id,
                        StageCode = change.StageCode,
                        TaskType = change.Desired.TaskType,
                        SourceType = change.Desired.SourceType,
                        SourceId = change.Desired.SourceId,
                        OwnerUserId = null,
                        Status = WorkflowCoordination.Open,
                        Priority = change.Priority,
                        DueDate = change.DueDate,
                        Blocker = change.Blocker,
                        NextAction = Trim(change.NextAction),
                        CreatedAt = now,
                        UpdatedAt = now,
                    };
                    _context.WorkflowTasks.Add(task);
                    owned.Add(task);
                    all.Add(task);
                }
                else if (change.Existing != null)
                {
                    task = owned.FirstOrDefault(t =>
                        t.SourceType == change.Existing.SourceType
                        && t.SourceId == change.Existing.SourceId
                        && t.TaskType == change.Existing.TaskType);
                    if (task == null)
                        continue;
                    task.Status = change.Status;
                    task.StageCode = change.StageCode;
                    task.Priority = change.Priority;
                    task.DueDate = change.DueDate;
                    task.Blocker = change.Blocker;
                    task.NextAction = Trim(change.NextAction);
                    task.UpdatedAt = now;
                    task.CompletedAt = change.Status == WorkflowCoordination.Completed ? now : null;
                    task.OwnerUserId = change.OwnerUserId;
                }

                if (task != null && change.EventType != null)
                {
                    var summary = change.EventType switch
                    {
                        WorkflowCoordination.EventTaskOpened => WorkflowCoordination.TaskLabel(task.TaskType) + " opened.",
                        WorkflowCoordination.EventTaskCompleted => WorkflowCoordination.TaskLabel(task.TaskType) + " completed.",
                        WorkflowCoordination.EventTaskReopened => WorkflowCoordination.TaskLabel(task.TaskType) + " reopened.",
                        _ => WorkflowCoordination.TaskLabel(task.TaskType) + " updated.",
                    };
                    _context.WorkflowEvents.Add(Event(tenantId, instance.Id, task.Id > 0 ? task.Id : null, change.EventType, summary, actorUserId, now));
                }
            }
        }

        private async Task AttachAsync(WorkflowOverviewDto overview, List<WorkflowInstance> instances, List<WorkflowTask> tasks)
        {
            var instanceIds = instances.Where(i => i.Id > 0).Select(i => i.Id).ToList();
            var events = instanceIds.Count == 0
                ? new List<WorkflowEvent>()
                : await _context.WorkflowEvents.AsNoTracking()
                    .Where(e => instanceIds.Contains(e.WorkflowInstanceId))
                    .OrderByDescending(e => e.CreatedAt)
                    .ThenByDescending(e => e.Id)
                    .ToListAsync();

            foreach (var row in overview.Workflows)
            {
                var instance = FindInstance(instances, row);
                if (instance == null)
                    continue;
                row.InstanceId = instance.Id;
                row.InstanceStatus = instance.Status;
                row.StoredTasks = tasks
                    .Where(t => t.WorkflowInstanceId == instance.Id)
                    .OrderBy(t => t.Status == WorkflowCoordination.Open ? 0 : 1)
                    .ThenBy(t => t.TaskType)
                    .Select(t => new WorkflowStoredTaskDto
                    {
                        TaskId = t.Id,
                        TaskType = t.TaskType,
                        Label = WorkflowCoordination.TaskLabel(t.TaskType),
                        StageCode = t.StageCode,
                        StageLabel = WorkflowStageRules.StageLabel(t.StageCode),
                        Status = t.Status,
                        Priority = t.Priority,
                        OwnerUserId = t.OwnerUserId,
                        OwnerLabel = t.OwnerUserId is > 0 ? "User " + t.OwnerUserId.Value : "Unassigned",
                        DueDate = t.DueDate?.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                        Blocker = t.Blocker,
                        NextAction = t.NextAction,
                    })
                    .ToList();
                row.RecentEvents = events
                    .Where(e => e.WorkflowInstanceId == instance.Id)
                    .Take(8)
                    .Select(e => new WorkflowStoredEventDto
                    {
                        EventType = e.EventType,
                        Summary = e.Summary,
                        CreatedAt = e.CreatedAt.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                    })
                    .ToList();
            }
        }

        private static StoredTaskState ToState(WorkflowTask task) => new()
        {
            TaskType = task.TaskType,
            SourceType = task.SourceType,
            SourceId = task.SourceId,
            Status = task.Status,
            StageCode = task.StageCode,
            Priority = task.Priority,
            OwnerUserId = task.OwnerUserId,
            DueDate = task.DueDate,
            DueDateIsManual = task.DueDateIsManual,
            Blocker = task.Blocker,
            BlockerIsManual = task.BlockerIsManual,
            NextAction = task.NextAction,
            NextActionIsManual = task.NextActionIsManual,
        };

        private static WorkflowEvent Event(int tenantId, int instanceId, int? taskId, string type, string summary, int? actorUserId, DateTime now) =>
            new()
            {
                TenantId = tenantId,
                WorkflowInstanceId = instanceId,
                WorkflowTaskId = taskId,
                EventType = type,
                Summary = summary,
                ActorUserId = actorUserId is > 0 ? actorUserId : null,
                CreatedAt = now,
            };

        private static string Trim(string? value)
        {
            if (string.IsNullOrWhiteSpace(value))
                return "";
            var text = value.Trim();
            return text.Length <= 500 ? text : text.Substring(0, 500);
        }
    }
}
