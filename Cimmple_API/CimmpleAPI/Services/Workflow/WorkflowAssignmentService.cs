using System.Globalization;
using CimmpleAPI.Data;
using CimmpleAPI.Data.Models;
using CimmpleAPI.Services;
using Microsoft.EntityFrameworkCore;

namespace CimmpleAPI.Services.Workflow
{
    /// <summary>
    /// Assigns the current coordination task. Shipping, invoicing, receiving, and
    /// non-conformance work stay on their own screens. A blocker note does not
    /// clear a material shortage.
    /// </summary>
    public sealed class WorkflowAssignmentService
    {
        private readonly CimmpleDbContext _context;
        private readonly WorkflowProjectionService _projection;
        private readonly WorkflowSyncService _sync;
        private readonly NotificationService _notifications;

        public WorkflowAssignmentService(
            CimmpleDbContext context,
            WorkflowProjectionService projection,
            WorkflowSyncService sync,
            NotificationService notifications)
        {
            _context = context;
            _projection = projection;
            _sync = sync;
            _notifications = notifications;
        }

        public async Task<(List<WorkflowAssigneeDto> People, string? Error)> ListAssigneesAsync(int tenantId, string workflowId)
        {
            var located = await FindLocationAsync(tenantId, workflowId);
            if (located.Error != null)
                return (new List<WorkflowAssigneeDto>(), located.Error);
            return (await PeopleAtLocationAsync(tenantId, located.LocationId), null);
        }

        public async Task<string?> AssignAsync(int tenantId, int actorUserId, string workflowId, int assigneeUserId, int? coordinationTaskId)
        {
            var located = await FindLocationAsync(tenantId, workflowId);
            if (located.Error != null)
                return located.Error;
            var allowed = await PeopleAtLocationAsync(tenantId, located.LocationId);
            if (!allowed.Any(u => u.UserId == assigneeUserId))
                return located.LocationId is > 0
                    ? "Choose a person who can work at this location."
                    : "Choose a person from this company.";
            return await ChangeAsync(tenantId, actorUserId, workflowId, coordinationTaskId, new[] { assigneeUserId }, (task, names, _) =>
            {
                names.TryGetValue(assigneeUserId, out var name);
                return Task.FromResult(WorkflowCoordination.PlanAssign(task.OwnerUserId, assigneeUserId, name ?? ""));
            });
        }

        public Task<string?> AcknowledgeAsync(int tenantId, int actorUserId, string workflowId, int? coordinationTaskId) =>
            ChangeAsync(tenantId, actorUserId, workflowId, coordinationTaskId, null, (task, _, handoffs) =>
            {
                var pending = PendingFor(handoffs, task);
                return Task.FromResult(WorkflowCoordination.PlanAcknowledge(task.OwnerUserId, actorUserId, pending != null));
            });

        public Task<string?> RejectAsync(int tenantId, int actorUserId, string workflowId, int? coordinationTaskId) =>
            ChangeAsync(tenantId, actorUserId, workflowId, coordinationTaskId, null, (task, names, handoffs) =>
            {
                var pending = PendingFor(handoffs, task);
                var previousName = "";
                if (pending?.FromUserId is > 0 && names.TryGetValue(pending.FromUserId.Value, out var name))
                    previousName = name;
                return Task.FromResult(WorkflowCoordination.PlanReject(
                    task.OwnerUserId,
                    actorUserId,
                    pending?.FromUserId,
                    pending != null,
                    previousName));
            });

        public Task<string?> SaveBlockerNoteAsync(int tenantId, int actorUserId, string workflowId, int? coordinationTaskId, string? note) =>
            ChangeAsync(tenantId, actorUserId, workflowId, coordinationTaskId, null, (_, _, _) =>
                Task.FromResult(WorkflowCoordination.PlanBlockerNote(note)));

        private async Task<string?> ChangeAsync(
            int tenantId,
            int actorUserId,
            string workflowId,
            int? coordinationTaskId,
            IEnumerable<int>? extraNameIds,
            Func<WorkflowTask, Dictionary<int, string>, List<WorkflowHandoff>, Task<AssignmentDecision>> plan)
        {
            if (actorUserId <= 0)
                return "Sign in again before changing the assignment.";
            if (!TryParseWorkflowId(workflowId, out var orderId, out var quotationId))
                return "This workflow could not be found.";

            var stored = await LoadStoredTaskAsync(tenantId, orderId, quotationId, coordinationTaskId);
            WorkflowOverviewDto? overview = stored.Overview;
            WorkflowRowDto? row = stored.Row;
            var instance = stored.Instance;
            var task = stored.Task;
            if (task == null || instance == null)
            {
                if (orderId is > 0)
                    overview = await _sync.RefreshAndReturnAsync(tenantId, orderId, null, actorUserId);
                else
                    overview = await _sync.RefreshAndReturnAsync(tenantId, null, quotationId, actorUserId);
                overview ??= await _projection.GetOverviewAsync(
                    tenantId, null, null, null, orderId, quotationId);
                row = overview.Workflows.FirstOrDefault(w => w.Id == workflowId);
                if (row == null || !row.IsActive)
                    return "There is no open coordination task for this record.";

                instance = await _context.WorkflowInstances.FirstOrDefaultAsync(i =>
                    i.TenantId == tenantId
                    && (orderId != null ? i.CustomerOrderId == orderId : i.QuotationId == quotationId));
                if (instance == null)
                    return "There is no open coordination task for this record.";

                var tasks = await _context.WorkflowTasks
                    .Where(t => t.TenantId == tenantId && t.WorkflowInstanceId == instance.Id)
                    .ToListAsync();
                task = Pick(row, overview.Actions, tasks);
            }

            if (task == null || instance == null)
                return "There is no open coordination task for this record.";

            var handoffs = await _context.WorkflowHandoffs
                .Where(h => h.TenantId == tenantId && h.WorkflowTaskId == task.Id)
                .ToListAsync();
            var nameIds = new List<int> { actorUserId };
            if (task.OwnerUserId is > 0)
                nameIds.Add(task.OwnerUserId.Value);
            if (extraNameIds != null)
                nameIds.AddRange(extraNameIds);
            nameIds.AddRange(handoffs.Select(h => h.FromUserId ?? 0));
            nameIds.AddRange(handoffs.Select(h => h.ToUserId ?? 0));
            var names = await NamesForAsync(tenantId, nameIds);
            var decision = await plan(task, names, handoffs);
            if (!decision.Ok)
                return decision.Error;

            var now = DateTime.Now;

            if (decision.SupersedePending)
            {
                foreach (var pending in handoffs.Where(h => h.Status == WorkflowCoordination.HandoffPending))
                    pending.Status = WorkflowCoordination.HandoffSuperseded;
            }

            if (decision.UpdatedHandoffStatus != null)
            {
                var pending = handoffs
                    .Where(h => h.Status == WorkflowCoordination.HandoffPending && h.ToUserId == task.OwnerUserId)
                    .OrderByDescending(h => h.Id)
                    .FirstOrDefault();
                if (pending == null)
                    return "There is no assignment waiting for a response.";
                pending.Status = decision.UpdatedHandoffStatus;
            }

            if (decision.EventType is WorkflowCoordination.EventAssigned or WorkflowCoordination.EventRejected)
                task.OwnerUserId = decision.OwnerUserId;

            if (decision.BlockerIsManual.HasValue)
            {
                task.Blocker = decision.Blocker;
                task.BlockerIsManual = decision.BlockerIsManual.Value;
            }

            task.UpdatedAt = now;
            if (decision.NewHandoffStatus != null && decision.NewToUserId is > 0)
            {
                _context.WorkflowHandoffs.Add(new WorkflowHandoff
                {
                    TenantId = tenantId,
                    WorkflowTaskId = task.Id,
                    FromUserId = decision.NewFromUserId is > 0 ? decision.NewFromUserId : null,
                    ToUserId = decision.NewToUserId,
                    Instruction = "",
                    Status = decision.NewHandoffStatus,
                    CreatedAt = now,
                });
            }

            _context.WorkflowEvents.Add(new WorkflowEvent
            {
                TenantId = tenantId,
                WorkflowInstanceId = instance.Id,
                WorkflowTaskId = task.Id,
                EventType = decision.EventType ?? "",
                Summary = decision.EventSummary,
                ActorUserId = actorUserId,
                CreatedAt = now,
            });
            await _context.SaveChangesAsync();
            if (decision.EventType == WorkflowCoordination.EventAssigned && decision.OwnerUserId is > 0)
                await NotifyAssigneeAsync(tenantId, actorUserId, workflowId, orderId, quotationId, row, decision.OwnerUserId.Value, names);
            return null;
        }

        private async Task<(WorkflowInstance? Instance, WorkflowTask? Task, WorkflowOverviewDto? Overview, WorkflowRowDto? Row)> LoadStoredTaskAsync(
            int tenantId,
            int? orderId,
            int? quotationId,
            int? coordinationTaskId)
        {
            if (coordinationTaskId is not > 0)
                return (null, null, null, null);

            var instance = await _context.WorkflowInstances.FirstOrDefaultAsync(i =>
                i.TenantId == tenantId
                && i.Status == WorkflowCoordination.Open
                && (orderId != null ? i.CustomerOrderId == orderId : i.QuotationId == quotationId));
            if (instance == null)
                return (null, null, null, null);

            var task = await _context.WorkflowTasks.FirstOrDefaultAsync(t =>
                t.Id == coordinationTaskId
                && t.TenantId == tenantId
                && t.WorkflowInstanceId == instance.Id
                && t.Status == WorkflowCoordination.Open);
            return (instance, task, null, null);
        }

        private async Task NotifyAssigneeAsync(
            int tenantId,
            int actorUserId,
            string workflowId,
            int? orderId,
            int? quotationId,
            WorkflowRowDto? row,
            int assigneeUserId,
            Dictionary<int, string> names)
        {
            names.TryGetValue(actorUserId, out var actorName);
            var who = string.IsNullOrWhiteSpace(actorName) ? "Someone" : actorName.Trim();
            var reference = row?.Reference?.Trim();
            var customerName = row?.CustomerName?.Trim();
            var sourceId = row?.CustomerOrderId is > 0 ? row.CustomerOrderId.Value : row?.QuotationId.GetValueOrDefault() ?? 0;
            var entityType = row?.CustomerOrderId is > 0 ? "CustomerOrder" : "Quotation";
            if (string.IsNullOrWhiteSpace(reference))
            {
                if (orderId is > 0)
                {
                    var order = await _context.CustomerOrder.AsNoTracking()
                        .Where(o => o.Tenantid == tenantId && o.OrderID == orderId)
                        .Select(o => new { o.PONumber, o.OrderID, o.CustomerName })
                        .FirstOrDefaultAsync();
                    if (order != null)
                    {
                        var raw = order.PONumber > 0 ? order.PONumber : order.OrderID;
                        reference = raw > 0 ? "CO#" + GlobalSearchSupport.ToDisplayDocNumber(raw) : "A workflow";
                        customerName = order.CustomerName;
                        sourceId = order.OrderID;
                        entityType = "CustomerOrder";
                    }
                }
                else if (quotationId is > 0)
                {
                    var quotation = await _context.QuotationOrder.AsNoTracking()
                        .Where(q => q.Tenantid == tenantId && q.OrderID == quotationId)
                        .Select(q => new { q.PONumber, q.OrderID, q.CustomerName })
                        .FirstOrDefaultAsync();
                    if (quotation != null)
                    {
                        var raw = quotation.PONumber > 0 ? quotation.PONumber : quotation.OrderID;
                        reference = raw > 0 ? "CQ#" + GlobalSearchSupport.ToDisplayDocNumber(raw) : "A workflow";
                        customerName = quotation.CustomerName;
                        sourceId = quotation.OrderID;
                        entityType = "Quotation";
                    }
                }
            }

            var customer = string.IsNullOrWhiteSpace(customerName) ? "" : " for " + customerName.Trim();
            await DomainNotificationHelper.NotifyUserAsync(
                _notifications,
                tenantId,
                assigneeUserId,
                actorUserId,
                NotificationService.TypeWorkflowAssignment,
                (string.IsNullOrWhiteSpace(reference) ? "A workflow" : reference) + " assigned to you",
                who + " assigned " + (string.IsNullOrWhiteSpace(reference) ? "a workflow" : reference) + customer + " to you.",
                entityType,
                sourceId,
                "/workflow?selected=" + workflowId);
        }

        private static WorkflowHandoff? PendingFor(List<WorkflowHandoff> handoffs, WorkflowTask task) =>
            handoffs
                .Where(h => h.Status == WorkflowCoordination.HandoffPending && h.ToUserId == task.OwnerUserId)
                .OrderByDescending(h => h.Id)
                .FirstOrDefault();

        private static WorkflowTask? Pick(WorkflowRowDto row, List<WorkflowActionDto> actions, List<WorkflowTask> tasks)
        {
            var open = tasks.Where(t => t.Status == WorkflowCoordination.Open).ToList();
            var linked = actions.Where(a => a.WorkflowId == row.Id && !string.IsNullOrWhiteSpace(a.LinkPath)).ToList();
            var matched = linked.Where(a => a.StageCode == row.PrincipalStage).ToList();
            var pool = matched.Count > 0 ? matched : linked;
            var primary = pool.OrderBy(a => a.Rank).FirstOrDefault();
            if (primary != null)
            {
                var type = WorkflowCoordination.TaskTypeFor(primary.Kind);
                var exact = open.FirstOrDefault(t =>
                    t.TaskType == type && t.SourceType == (primary.SourceType ?? "") && t.SourceId == primary.SourceId);
                if (exact != null)
                    return exact;
            }

            return open.FirstOrDefault(t => t.StageCode == row.PrincipalStage) ?? open.FirstOrDefault();
        }

        private async Task<(int? LocationId, string? Error)> FindLocationAsync(int tenantId, string workflowId)
        {
            if (!TryParseWorkflowId(workflowId, out var orderId, out var quotationId))
                return (null, "This workflow could not be found.");

            if (orderId is > 0)
            {
                var order = await _context.CustomerOrder.AsNoTracking()
                    .Where(o => o.Tenantid == tenantId && o.OrderID == orderId.Value)
                    .Select(o => new { o.locationId })
                    .FirstOrDefaultAsync();
                if (order == null)
                    return (null, "This workflow could not be found.");
                return (order.locationId > 0 ? order.locationId : null, null);
            }

            var quotation = await _context.QuotationOrder.AsNoTracking()
                .Where(q => q.Tenantid == tenantId && q.OrderID == quotationId!.Value)
                .Select(q => new { q.Locationid })
                .FirstOrDefaultAsync();
            if (quotation == null)
                return (null, "This workflow could not be found.");
            return (quotation.Locationid is > 0 ? quotation.Locationid : null, null);
        }

        private async Task<List<WorkflowAssigneeDto>> PeopleAtLocationAsync(int tenantId, int? locationId)
        {
            var users = await ActiveUsers(tenantId)
                .Select(u => new
                {
                    u.User_UniqueID,
                    u.FirstName,
                    u.LastName,
                    u.UserName,
                    u.DefaultLocationId,
                    u.CanAccessAllLocations,
                })
                .ToListAsync();

            var mapped = new HashSet<int>();
            if (locationId is > 0)
            {
                var ids = await _context.UserMapping.AsNoTracking()
                    .Where(m => m.locationId == locationId.Value)
                    .Select(m => m.userId)
                    .ToListAsync();
                mapped = ids.ToHashSet();
            }

            var place = locationId ?? 0;
            return users
                .Where(u => WorkflowCoordination.PersonCoversLocation(
                    u.DefaultLocationId, u.CanAccessAllLocations, mapped.Contains(u.User_UniqueID), place))
                .Select(u => new WorkflowAssigneeDto
                {
                    UserId = u.User_UniqueID,
                    Name = WorkflowCoordination.PersonName(u.FirstName, u.LastName, u.UserName),
                })
                .Where(u => u.UserId > 0 && u.Name.Length > 0)
                .OrderBy(u => u.Name)
                .ToList();
        }

        private IQueryable<UserDetail> ActiveUsers(int tenantId) =>
            _context.UserDetails.AsNoTracking().Where(u =>
                u.TenantID == tenantId && (u.Status == null || u.Status == "Active"));

        private async Task<Dictionary<int, string>> NamesForAsync(int tenantId, IEnumerable<int> userIds)
        {
            var ids = userIds.Where(id => id > 0).Distinct().ToList();
            if (ids.Count == 0)
                return new Dictionary<int, string>();
            var users = await _context.UserDetails.AsNoTracking()
                .Where(u => u.TenantID == tenantId && ids.Contains(u.User_UniqueID))
                .Select(u => new { u.User_UniqueID, u.FirstName, u.LastName, u.UserName })
                .ToListAsync();
            return users.ToDictionary(
                u => u.User_UniqueID,
                u => WorkflowCoordination.PersonName(u.FirstName, u.LastName, u.UserName));
        }

        private static bool TryParseWorkflowId(string? workflowId, out int? orderId, out int? quotationId)
        {
            orderId = null;
            quotationId = null;
            if (string.IsNullOrWhiteSpace(workflowId))
                return false;
            if (workflowId.StartsWith("order-", StringComparison.Ordinal)
                && int.TryParse(workflowId.AsSpan(6), NumberStyles.None, CultureInfo.InvariantCulture, out var order)
                && order > 0)
            {
                orderId = order;
                return true;
            }

            if (workflowId.StartsWith("quotation-", StringComparison.Ordinal)
                && int.TryParse(workflowId.AsSpan(10), NumberStyles.None, CultureInfo.InvariantCulture, out var quotation)
                && quotation > 0)
            {
                quotationId = quotation;
                return true;
            }

            return false;
        }
    }

    public sealed class WorkflowAssigneeDto
    {
        public int UserId { get; set; }
        public string Name { get; set; } = "";
    }
}
