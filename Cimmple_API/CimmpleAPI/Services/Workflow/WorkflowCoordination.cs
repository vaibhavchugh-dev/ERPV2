using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;

namespace CimmpleAPI.Services.Workflow
{
    /// <summary>
    /// Decides which coordination rows to open, update, or complete.
    /// It does not read the database and it does not copy balances.
    /// </summary>
    public static class WorkflowCoordination
    {
        public const string SourceCustomerOrder = "CustomerOrder";
        public const string SourceQuotation = "Quotation";
        public const string SourceOrderDetail = "CustomerOrderDetail";
        public const string SourceJob = "JobOrder";
        public const string SourceInvoice = "Invoice";
        public const string SourceNcr = "Ncr";

        public const string TaskCollection = "Collection";
        public const string TaskMaterialShortage = "MaterialShortage";
        public const string TaskOverdueJob = "OverdueJob";
        public const string TaskOpenNcr = "OpenNcr";
        public const string TaskReadyForInvoice = "ReadyForInvoice";
        public const string TaskReadyToShip = "ReadyToShip";
        public const string TaskPlanningGap = "PlanningGap";
        public const string TaskConfirmOrder = "ConfirmOrder";
        public const string TaskFollowQuotation = "FollowQuotation";

        public const string Open = "Open";
        public const string Completed = "Completed";
        public const string Closed = "Closed";

        public const string EventOpened = "InstanceOpened";
        public const string EventStageChanged = "StageChanged";
        public const string EventClosed = "InstanceClosed";
        public const string EventReopened = "InstanceReopened";
        public const string EventSuperseded = "InstanceSuperseded";
        public const string EventTaskOpened = "TaskOpened";
        public const string EventTaskCompleted = "TaskCompleted";
        public const string EventTaskReopened = "TaskReopened";
        public const string EventAssigned = "Assigned";
        public const string EventAcknowledged = "Acknowledged";
        public const string EventRejected = "Rejected";
        public const string EventBlockerNoted = "BlockerNoted";
        public const string EventBecameBlocked = "BecameBlocked";
        public const string EventBlockerCleared = "BlockerCleared";
        public const string EventBecameOverdue = "BecameOverdue";
        public const string EventOverdueCleared = "OverdueCleared";

        public const string HandoffPending = "Pending";
        public const string HandoffAcknowledged = "Acknowledged";
        public const string HandoffRejected = "Rejected";
        public const string HandoffSuperseded = "Superseded";

        public static string TaskTypeFor(string actionKind) => actionKind switch
        {
            "OverdueInvoice" or "OpenBalance" => TaskCollection,
            "MaterialShortage" => TaskMaterialShortage,
            "OverdueJob" => TaskOverdueJob,
            "OpenNcr" => TaskOpenNcr,
            "UninvoicedShipment" => TaskReadyForInvoice,
            "ReadyToShip" => TaskReadyToShip,
            "PlanningGap" => TaskPlanningGap,
            "DraftOrder" => TaskConfirmOrder,
            "Quotation" => TaskFollowQuotation,
            _ => actionKind,
        };

        public static string TaskLabel(string taskType) => taskType switch
        {
            TaskCollection => "Collection",
            TaskMaterialShortage => "Material shortage",
            TaskOverdueJob => "Overdue job",
            TaskOpenNcr => "Open NCR",
            TaskReadyForInvoice => "Ready for invoicing",
            TaskReadyToShip => "Ready to ship",
            TaskPlanningGap => "Planning gap",
            TaskConfirmOrder => "Confirm order",
            TaskFollowQuotation => "Follow quotation",
            _ => taskType,
        };

        public static List<DesiredTask> PlanTasks(IEnumerable<ActionSeed> actions)
        {
            return actions
                .Where(a => a.SourceId > 0 && !string.IsNullOrWhiteSpace(a.SourceType))
                .GroupBy(a => (TaskTypeFor(a.Kind), a.SourceType, a.SourceId))
                .Select(group =>
                {
                    var ranked = group.OrderBy(a => PriorityRank(a.Priority)).ThenBy(a => a.DueDate ?? DateTime.MaxValue).ToList();
                    var lead = ranked[0];
                    return new DesiredTask
                    {
                        TaskType = group.Key.Item1,
                        SourceType = group.Key.Item2,
                        SourceId = group.Key.Item3,
                        StageCode = lead.StageCode,
                        Priority = lead.Priority,
                        DueDate = ranked.Where(a => a.DueDate.HasValue).Select(a => a.DueDate).OrderBy(d => d).FirstOrDefault(),
                        Blocker = ranked.Select(a => a.Blocker).FirstOrDefault(b => !string.IsNullOrWhiteSpace(b)),
                        NextAction = lead.NextAction ?? "",
                    };
                })
                .OrderBy(t => t.TaskType)
                .ThenBy(t => t.SourceId)
                .ToList();
        }

        public static List<ActionSeed> SeedsFrom(IEnumerable<WorkflowActionDto> actions) =>
            actions.Select(a => new ActionSeed
            {
                Kind = a.Kind,
                SourceType = a.SourceType ?? "",
                SourceId = a.SourceId,
                StageCode = a.StageCode,
                Priority = a.PriorityLabel,
                DueDate = ParseDate(a.DueDate),
                Blocker = a.BlockerReason,
                NextAction = a.NextAction,
            }).ToList();

        public static InstanceChange ReconcileInstance(
            string? currentStatus,
            string? currentStage,
            bool isActive,
            bool isCancelled,
            string principalStage)
        {
            var status = isActive ? Open : Closed;
            if (currentStatus == null)
            {
                return new InstanceChange
                {
                    Create = true,
                    Status = status,
                    StageCode = principalStage,
                    EventType = EventOpened,
                    EventSummary = "Workflow opened.",
                };
            }

            string? eventType = null;
            string? summary = null;
            if (currentStatus == Closed && isActive)
            {
                eventType = EventReopened;
                summary = "Workflow is active again.";
            }
            else if (currentStatus == Open && !isActive)
            {
                eventType = EventClosed;
                summary = isCancelled ? "Workflow cancelled." : "Workflow completed.";
            }
            else if (!string.Equals(currentStage, principalStage, StringComparison.Ordinal))
            {
                eventType = EventStageChanged;
                summary = "Stage moved to " + WorkflowStageRules.StageLabel(principalStage) + ".";
            }

            return new InstanceChange
            {
                Create = false,
                Status = status,
                StageCode = principalStage,
                EventType = eventType,
                EventSummary = summary,
            };
        }

        public static List<TaskChange> ReconcileTasks(IReadOnlyList<StoredTaskState> existing, IReadOnlyList<DesiredTask> desired)
        {
            var changes = new List<TaskChange>();
            var wanted = desired.ToDictionary(d => Key(d.SourceType, d.SourceId, d.TaskType));
            var seen = new HashSet<string>();

            foreach (var task in existing)
            {
                var key = Key(task.SourceType, task.SourceId, task.TaskType);
                seen.Add(key);
                if (!wanted.TryGetValue(key, out var want))
                {
                    if (task.Status == Open)
                    {
                        changes.Add(new TaskChange
                        {
                            Action = "Complete",
                            Existing = task,
                            Status = Completed,
                            StageCode = task.StageCode,
                            Priority = task.Priority,
                            DueDate = task.DueDate,
                            Blocker = task.Blocker,
                            NextAction = task.NextAction,
                            OwnerUserId = task.OwnerUserId,
                            EventType = EventTaskCompleted,
                        });
                    }
                    continue;
                }

                var due = task.DueDateIsManual ? task.DueDate : want.DueDate;
                var blocker = task.BlockerIsManual ? task.Blocker : want.Blocker;
                var next = task.NextActionIsManual ? task.NextAction : want.NextAction;
                var reopening = task.Status != Open;
                var changed = reopening
                    || !string.Equals(task.StageCode, want.StageCode, StringComparison.Ordinal)
                    || !string.Equals(task.Priority, want.Priority, StringComparison.Ordinal)
                    || task.DueDate != due
                    || !string.Equals(task.Blocker ?? "", blocker ?? "", StringComparison.Ordinal)
                    || !string.Equals(task.NextAction ?? "", next ?? "", StringComparison.Ordinal);

                if (!changed)
                    continue;

                changes.Add(new TaskChange
                {
                    Action = reopening ? "Reopen" : "Update",
                    Existing = task,
                    Desired = want,
                    Status = Open,
                    StageCode = want.StageCode,
                    Priority = want.Priority,
                    DueDate = due,
                    Blocker = blocker,
                    NextAction = next ?? "",
                    OwnerUserId = task.OwnerUserId,
                    EventType = reopening ? EventTaskReopened : null,
                });
            }

            foreach (var want in desired)
            {
                if (seen.Contains(Key(want.SourceType, want.SourceId, want.TaskType)))
                    continue;
                changes.Add(new TaskChange
                {
                    Action = "Insert",
                    Desired = want,
                    Status = Open,
                    StageCode = want.StageCode,
                    Priority = want.Priority,
                    DueDate = want.DueDate,
                    Blocker = want.Blocker,
                    NextAction = want.NextAction,
                    EventType = EventTaskOpened,
                });
            }

            return changes;
        }

        /// <summary>
        /// A notice is sent only when a workflow becomes blocked or overdue.
        /// Staying blocked or overdue does not send another notice.
        /// </summary>
        public static List<AttentionNotice> PlanAttentionNotices(bool wasBlocked, bool nowBlocked, bool wasOverdue, bool nowOverdue)
        {
            var notices = new List<AttentionNotice>();
            if (nowBlocked && !wasBlocked)
                notices.Add(new AttentionNotice(EventBecameBlocked, "Material is short.", true));
            else if (wasBlocked && !nowBlocked)
                notices.Add(new AttentionNotice(EventBlockerCleared, "The material shortage has cleared.", false));

            if (nowOverdue && !wasOverdue)
                notices.Add(new AttentionNotice(EventBecameOverdue, "A due date has been missed.", true));
            else if (wasOverdue && !nowOverdue)
                notices.Add(new AttentionNotice(EventOverdueCleared, "The due date is no longer missed.", false));
            return notices;
        }

        public static bool WasMarkedOverdue(string? latestOverdueEventType) =>
            latestOverdueEventType == EventBecameOverdue;

        public static string PersonName(string? first, string? last, string? userName)
        {
            var name = string.Join(" ", new[] { first, last }.Where(s => !string.IsNullOrWhiteSpace(s))).Trim();
            if (name.Length > 0)
                return name;
            return string.IsNullOrWhiteSpace(userName) ? "" : userName.Trim();
        }

        /// <summary>
        /// A person can take work at a location when that is their usual location,
        /// they are mapped to it, or they can work at every location.
        /// A record with no location does not filter the list.
        /// </summary>
        public static bool PersonCoversLocation(int? defaultLocationId, bool canAccessAllLocations, bool mappedToLocation, int locationId) =>
            locationId <= 0
            || canAccessAllLocations
            || defaultLocationId == locationId
            || mappedToLocation;

        public static AssignmentDecision PlanAssign(int? currentOwner, int assigneeId, string assigneeName)
        {
            if (assigneeId <= 0 || string.IsNullOrWhiteSpace(assigneeName))
                return AssignmentDecision.Fail("Choose a person from this company.");
            if (currentOwner == assigneeId)
                return AssignmentDecision.Fail("This action is already assigned to that person.");
            return new AssignmentDecision
            {
                Ok = true,
                OwnerUserId = assigneeId,
                SupersedePending = true,
                NewFromUserId = currentOwner,
                NewToUserId = assigneeId,
                NewHandoffStatus = HandoffPending,
                EventType = EventAssigned,
                EventSummary = "Assigned to " + assigneeName.Trim() + ".",
            };
        }

        public static AssignmentDecision PlanAcknowledge(int? currentOwner, int actorId, bool pendingForOwner)
        {
            if (currentOwner is not > 0)
                return AssignmentDecision.Fail("Assign someone before this can be acknowledged.");
            if (actorId != currentOwner)
                return AssignmentDecision.Fail("Only the assigned person can acknowledge.");
            if (!pendingForOwner)
                return AssignmentDecision.Fail("There is no assignment waiting for acknowledgement.");
            return new AssignmentDecision
            {
                Ok = true,
                OwnerUserId = currentOwner,
                UpdatedHandoffStatus = HandoffAcknowledged,
                EventType = EventAcknowledged,
                EventSummary = "Assignment acknowledged.",
            };
        }

        public static AssignmentDecision PlanReject(int? currentOwner, int actorId, int? previousOwner, bool pendingForOwner, string previousName)
        {
            if (currentOwner is not > 0)
                return AssignmentDecision.Fail("There is nobody assigned to reject this.");
            if (actorId != currentOwner)
                return AssignmentDecision.Fail("Only the assigned person can reject.");
            if (!pendingForOwner)
                return AssignmentDecision.Fail("There is no assignment waiting to be rejected.");
            var returnedTo = string.IsNullOrWhiteSpace(previousName) ? "Unassigned" : previousName.Trim();
            return new AssignmentDecision
            {
                Ok = true,
                OwnerUserId = previousOwner is > 0 ? previousOwner : null,
                UpdatedHandoffStatus = HandoffRejected,
                EventType = EventRejected,
                EventSummary = "Assignment rejected. Returned to " + returnedTo + ".",
            };
        }

        public static AssignmentDecision PlanBlockerNote(string? note)
        {
            var text = (note ?? "").Trim();
            if (text.Length > 500)
                return AssignmentDecision.Fail("Keep the note under 500 characters.");
            if (text.Length == 0)
            {
                return new AssignmentDecision
                {
                    Ok = true,
                    Blocker = null,
                    BlockerIsManual = false,
                    EventType = EventBlockerNoted,
                    EventSummary = "Blocker note cleared.",
                };
            }

            return new AssignmentDecision
            {
                Ok = true,
                Blocker = text,
                BlockerIsManual = true,
                EventType = EventBlockerNoted,
                EventSummary = "Blocker note saved.",
            };
        }

        private static string Key(string sourceType, int sourceId, string taskType) =>
            sourceType + "|" + sourceId.ToString(CultureInfo.InvariantCulture) + "|" + taskType;

        private static int PriorityRank(string? priority) => priority switch
        {
            "Blocked" => 0,
            "Overdue" => 1,
            "High" => 2,
            _ => 3,
        };

        private static DateTime? ParseDate(string? value) =>
            DateTime.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsed)
                ? parsed.Date
                : null;
    }

    public sealed class ActionSeed
    {
        public string Kind { get; init; } = "";
        public string SourceType { get; init; } = "";
        public int SourceId { get; init; }
        public string StageCode { get; init; } = "";
        public string Priority { get; init; } = "Normal";
        public DateTime? DueDate { get; init; }
        public string? Blocker { get; init; }
        public string? NextAction { get; init; }
    }

    public sealed class DesiredTask
    {
        public string TaskType { get; init; } = "";
        public string StageCode { get; init; } = "";
        public string SourceType { get; init; } = "";
        public int SourceId { get; init; }
        public string Priority { get; init; } = "Normal";
        public DateTime? DueDate { get; init; }
        public string? Blocker { get; init; }
        public string NextAction { get; init; } = "";
    }

    public sealed class AttentionNotice
    {
        public AttentionNotice(string eventType, string summary, bool notify)
        {
            EventType = eventType;
            Summary = summary;
            Notify = notify;
        }

        public string EventType { get; }
        public string Summary { get; }
        public bool Notify { get; }
    }

    public sealed class StoredTaskState
    {
        public string TaskType { get; init; } = "";
        public string SourceType { get; init; } = "";
        public int SourceId { get; init; }
        public string Status { get; init; } = "";
        public string StageCode { get; init; } = "";
        public string Priority { get; init; } = "";
        public int? OwnerUserId { get; init; }
        public DateTime? DueDate { get; init; }
        public bool DueDateIsManual { get; init; }
        public string? Blocker { get; init; }
        public bool BlockerIsManual { get; init; }
        public string NextAction { get; init; } = "";
        public bool NextActionIsManual { get; init; }
    }

    public sealed class InstanceChange
    {
        public bool Create { get; init; }
        public string Status { get; init; } = "";
        public string StageCode { get; init; } = "";
        public string? EventType { get; init; }
        public string? EventSummary { get; init; }
    }

    public sealed class AssignmentDecision
    {
        public bool Ok { get; init; }
        public string? Error { get; init; }
        public int? OwnerUserId { get; init; }
        public bool SupersedePending { get; init; }
        public int? NewFromUserId { get; init; }
        public int? NewToUserId { get; init; }
        public string? NewHandoffStatus { get; init; }
        public string? UpdatedHandoffStatus { get; init; }
        public string? EventType { get; init; }
        public string EventSummary { get; init; } = "";
        public string? Blocker { get; init; }
        public bool? BlockerIsManual { get; init; }

        public static AssignmentDecision Fail(string error) => new() { Ok = false, Error = error };
    }

    public sealed class TaskChange
    {
        public string Action { get; init; } = "";
        public DesiredTask? Desired { get; init; }
        public StoredTaskState? Existing { get; init; }
        public string Status { get; init; } = "";
        public string StageCode { get; init; } = "";
        public string Priority { get; init; } = "";
        public DateTime? DueDate { get; init; }
        public string? Blocker { get; init; }
        public string NextAction { get; init; } = "";
        public int? OwnerUserId { get; init; }
        public string? EventType { get; init; }
    }
}
