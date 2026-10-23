using System;
using System.Linq;
using CimmpleAPI.Services.Workflow;
using Xunit;

namespace CimmpleAPI.Tests;

public class WorkflowCoordinationTests
{
    [Fact]
    public void PlanTasks_CollapsesInvoiceBalanceAndOverdueIntoOneCollectionTask()
    {
        var tasks = WorkflowCoordination.PlanTasks(new[]
        {
            Seed("OpenBalance", WorkflowCoordination.SourceInvoice, 9, "Normal"),
            Seed("OverdueInvoice", WorkflowCoordination.SourceInvoice, 9, "Overdue"),
        });

        var task = Assert.Single(tasks);
        Assert.Equal(WorkflowCoordination.TaskCollection, task.TaskType);
        Assert.Equal(9, task.SourceId);
        Assert.Equal("Overdue", task.Priority);
    }

    [Fact]
    public void PlanTasks_KeepsShortageAndNcrAsSeparateTasks()
    {
        var tasks = WorkflowCoordination.PlanTasks(new[]
        {
            Seed("MaterialShortage", WorkflowCoordination.SourceJob, 4, "Blocked"),
            Seed("OpenNcr", WorkflowCoordination.SourceNcr, 8, "High"),
        });

        Assert.Equal(2, tasks.Count);
        Assert.Contains(tasks, t => t.TaskType == WorkflowCoordination.TaskMaterialShortage && t.SourceId == 4);
        Assert.Contains(tasks, t => t.TaskType == WorkflowCoordination.TaskOpenNcr && t.SourceId == 8);
    }

    [Fact]
    public void PlanTasks_SecondPass_ReturnsTheSameKeys()
    {
        var seeds = new[]
        {
            Seed("PlanningGap", WorkflowCoordination.SourceOrderDetail, 3, "Normal"),
            Seed("PlanningGap", WorkflowCoordination.SourceOrderDetail, 5, "Normal"),
        };

        var first = WorkflowCoordination.PlanTasks(seeds).Select(t => t.SourceId + ":" + t.TaskType);
        var second = WorkflowCoordination.PlanTasks(seeds).Select(t => t.SourceId + ":" + t.TaskType);

        Assert.Equal(first, second);
    }

    [Fact]
    public void ReconcileTasks_LeavesAnUnchangedOpenTaskAlone()
    {
        var desired = WorkflowCoordination.PlanTasks(new[]
        {
            Seed("OpenNcr", WorkflowCoordination.SourceNcr, 8, "High", "Inspect the part."),
        });
        var existing = new[]
        {
            new StoredTaskState
            {
                TaskType = WorkflowCoordination.TaskOpenNcr,
                SourceType = WorkflowCoordination.SourceNcr,
                SourceId = 8,
                Status = WorkflowCoordination.Open,
                StageCode = WorkflowStageRules.Quality,
                Priority = "High",
                OwnerUserId = 42,
                NextAction = "Inspect the part.",
            },
        };

        Assert.Empty(WorkflowCoordination.ReconcileTasks(existing, desired));
    }

    [Fact]
    public void ReconcileTasks_CompletesATaskThatIsNoLongerDesired_AndKeepsTheOwnerOnReopen()
    {
        var existing = new[]
        {
            new StoredTaskState
            {
                TaskType = WorkflowCoordination.TaskOpenNcr,
                SourceType = WorkflowCoordination.SourceNcr,
                SourceId = 8,
                Status = WorkflowCoordination.Open,
                OwnerUserId = 42,
                NextAction = "Inspect the part.",
            },
        };

        var completed = Assert.Single(WorkflowCoordination.ReconcileTasks(existing, Array.Empty<DesiredTask>()));
        Assert.Equal("Complete", completed.Action);
        Assert.Equal(WorkflowCoordination.EventTaskCompleted, completed.EventType);
        Assert.Equal(42, completed.OwnerUserId);

        var desired = WorkflowCoordination.PlanTasks(new[]
        {
            Seed("OpenNcr", WorkflowCoordination.SourceNcr, 8, "High", "Inspect the part."),
        });
        var closed = new[]
        {
            new StoredTaskState
            {
                TaskType = WorkflowCoordination.TaskOpenNcr,
                SourceType = WorkflowCoordination.SourceNcr,
                SourceId = 8,
                Status = WorkflowCoordination.Completed,
                StageCode = WorkflowStageRules.Quality,
                Priority = "Normal",
                OwnerUserId = 42,
                DueDate = new DateTime(2026, 1, 1),
                DueDateIsManual = true,
                NextAction = "Old note",
            },
        };
        var reopened = Assert.Single(WorkflowCoordination.ReconcileTasks(closed, desired));
        Assert.Equal("Reopen", reopened.Action);
        Assert.Equal(42, reopened.OwnerUserId);
        Assert.Equal(new DateTime(2026, 1, 1), reopened.DueDate);
        Assert.Equal(WorkflowCoordination.EventTaskReopened, reopened.EventType);
    }

    [Fact]
    public void ReconcileInstance_EmitsStageChangeOnce_AndDoesNotRepeatIt()
    {
        var moved = WorkflowCoordination.ReconcileInstance(
            WorkflowCoordination.Open, WorkflowStageRules.Production, true, false, WorkflowStageRules.Quality);
        Assert.Equal(WorkflowCoordination.EventStageChanged, moved.EventType);

        var same = WorkflowCoordination.ReconcileInstance(
            WorkflowCoordination.Open, WorkflowStageRules.Quality, true, false, WorkflowStageRules.Quality);
        Assert.Null(same.EventType);
    }

    [Fact]
    public void ReconcileInstance_ClosedWorkflow_DoesNotStoreABalance()
    {
        var change = WorkflowCoordination.ReconcileInstance(
            WorkflowCoordination.Open, WorkflowStageRules.Collection, false, false, WorkflowStageRules.Collection);
        Assert.Equal(WorkflowCoordination.Closed, change.Status);
        Assert.Equal("Workflow completed.", change.EventSummary);
        Assert.DoesNotContain("amount", change.EventSummary, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void PlanAssign_SetsPendingHandoffAndKeepsThePreviousOwnerAsFrom()
    {
        var decision = WorkflowCoordination.PlanAssign(4, 9, "Ada");
        Assert.True(decision.Ok);
        Assert.Equal(9, decision.OwnerUserId);
        Assert.Equal(4, decision.NewFromUserId);
        Assert.Equal(9, decision.NewToUserId);
        Assert.Equal(WorkflowCoordination.HandoffPending, decision.NewHandoffStatus);
        Assert.True(decision.SupersedePending);
    }

    [Fact]
    public void PlanAssign_SamePerson_IsRejected()
    {
        var decision = WorkflowCoordination.PlanAssign(9, 9, "Ada");
        Assert.False(decision.Ok);
    }

    [Fact]
    public void PlanAcknowledge_OnlyTheAssigneeWithAPendingHandoff()
    {
        Assert.False(WorkflowCoordination.PlanAcknowledge(9, 4, true).Ok);
        Assert.False(WorkflowCoordination.PlanAcknowledge(9, 9, false).Ok);
        var decision = WorkflowCoordination.PlanAcknowledge(9, 9, true);
        Assert.True(decision.Ok);
        Assert.Equal(9, decision.OwnerUserId);
        Assert.Equal(WorkflowCoordination.HandoffAcknowledged, decision.UpdatedHandoffStatus);
    }

    [Fact]
    public void PlanReject_ReturnsToPreviousOwnerAndKeepsTheHandoffRejected()
    {
        var decision = WorkflowCoordination.PlanReject(9, 9, 4, true, "Sam");
        Assert.True(decision.Ok);
        Assert.Equal(4, decision.OwnerUserId);
        Assert.Equal(WorkflowCoordination.HandoffRejected, decision.UpdatedHandoffStatus);
        Assert.Contains("Sam", decision.EventSummary);
        Assert.False(WorkflowCoordination.PlanReject(9, 4, 4, true, "Sam").Ok);
    }

    [Fact]
    public void PlanBlockerNote_DoesNotClaimTheShortageIsCleared()
    {
        var decision = WorkflowCoordination.PlanBlockerNote("Waiting on the vendor receipt.");
        Assert.True(decision.Ok);
        Assert.True(decision.BlockerIsManual);
        Assert.Equal("Waiting on the vendor receipt.", decision.Blocker);
        Assert.DoesNotContain("cleared", decision.EventSummary, StringComparison.OrdinalIgnoreCase);
        Assert.False(WorkflowCoordination.PlanBlockerNote(new string('x', 501)).Ok);
        var cleared = WorkflowCoordination.PlanBlockerNote("  ");
        Assert.True(cleared.Ok);
        Assert.Equal(false, cleared.BlockerIsManual);
    }

    [Fact]
    public void PersonCoversLocation_UsesTheOrdersLocation()
    {
        Assert.True(WorkflowCoordination.PersonCoversLocation(4, false, false, 4));
        Assert.True(WorkflowCoordination.PersonCoversLocation(9, false, true, 4));
        Assert.True(WorkflowCoordination.PersonCoversLocation(9, true, false, 4));
        Assert.False(WorkflowCoordination.PersonCoversLocation(9, false, false, 4));
        Assert.True(WorkflowCoordination.PersonCoversLocation(9, false, false, 0));
    }

    [Fact]
    public void PlanAttentionNotices_TellsThemOnceWhenBlockedOrOverdue()
        {
            var firstBlock = WorkflowCoordination.PlanAttentionNotices(false, true, false, false);
            Assert.Equal(WorkflowCoordination.EventBecameBlocked, Assert.Single(firstBlock).EventType);
            Assert.True(firstBlock[0].Notify);

            Assert.Empty(WorkflowCoordination.PlanAttentionNotices(true, true, true, true));

            var cleared = WorkflowCoordination.PlanAttentionNotices(true, false, true, false);
            Assert.Equal(2, cleared.Count);
            Assert.All(cleared, notice => Assert.False(notice.Notify));

            Assert.True(WorkflowCoordination.WasMarkedOverdue(WorkflowCoordination.EventBecameOverdue));
            Assert.False(WorkflowCoordination.WasMarkedOverdue(WorkflowCoordination.EventOverdueCleared));
            Assert.False(WorkflowCoordination.WasMarkedOverdue(null));
        }

        private static ActionSeed Seed(string kind, string sourceType, int sourceId, string priority, string? next = "Follow up.") =>
        new()
        {
            Kind = kind,
            SourceType = sourceType,
            SourceId = sourceId,
            StageCode = kind == "OpenNcr" ? WorkflowStageRules.Quality : WorkflowStageRules.Collection,
            Priority = priority,
            NextAction = next,
        };
}
