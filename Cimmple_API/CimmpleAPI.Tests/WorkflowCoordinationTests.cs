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
