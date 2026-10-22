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
