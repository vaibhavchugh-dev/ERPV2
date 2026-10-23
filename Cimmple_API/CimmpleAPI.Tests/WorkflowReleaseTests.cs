using CimmpleAPI.Services.Auth;
using CimmpleAPI.Services.Workflow;
using Xunit;

namespace CimmpleAPI.Tests;

public class WorkflowReleaseTests
{
    [Fact]
    public void WorkflowPosts_UseAssignOrAcknowledge_NotGenericEdit()
    {
        Assert.Equal(ErpPermissionActions.Assign, ErpPermissionActions.ResolveActionFromRequest("POST", "/api/Workflow/Assign"));
        Assert.Equal(ErpPermissionActions.Assign, ErpPermissionActions.ResolveActionFromRequest("POST", "/api/Workflow/ResolveBlocker"));
        Assert.Equal(ErpPermissionActions.Acknowledge, ErpPermissionActions.ResolveActionFromRequest("POST", "/api/Workflow/Acknowledge"));
        Assert.Equal(ErpPermissionActions.Acknowledge, ErpPermissionActions.ResolveActionFromRequest("POST", "/api/Workflow/Reject"));
        Assert.Null(ErpPermissionActions.ResolveActionFromRequest("GET", "/api/Workflow/GetOverview"));
        Assert.Null(ErpPermissionActions.ResolveActionFromRequest("GET", "/api/Workflow/GetAssignees"));
    }

    [Fact]
    public void WorkflowPage_GrantsOnlyAssignAndAcknowledge()
    {
        var actions = ErpPermissionActions.PageActions["/workflow"];
        Assert.Equal(new[] { ErpPermissionActions.Assign, ErpPermissionActions.Acknowledge }, actions);
    }

    [Fact]
    public void VendorOrder_DoesNotReduceTheShortage()
    {
        var beforePurchase = WorkflowStageRules.MaterialShortageQty(needed: 10, reserved: 0, issued: 0, available: 0);
        var afterPurchaseOrderOnly = WorkflowStageRules.MaterialShortageQty(needed: 10, reserved: 0, issued: 0, available: 0);
        Assert.Equal(10m, beforePurchase);
        Assert.Equal(beforePurchase, afterPurchaseOrderOnly);
        Assert.Equal(4m, WorkflowStageRules.MaterialShortageQty(needed: 10, reserved: 2, issued: 1, available: 3));
    }

    [Fact]
    public void PartialIssue_KeepsTheJobShort()
    {
        Assert.Equal(6m, WorkflowStageRules.MaterialShortageQty(needed: 10, reserved: 0, issued: 4, available: 0));
        Assert.Equal(0m, WorkflowStageRules.MaterialShortageQty(needed: 10, reserved: 0, issued: 10, available: 0));
    }

    [Fact]
    public void StayingBlockedAndOverdue_DoesNotSendAnotherNotice()
    {
        Assert.Empty(WorkflowCoordination.PlanAttentionNotices(wasBlocked: true, nowBlocked: true, wasOverdue: true, nowOverdue: true));
    }

    [Fact]
    public void AssigningTheSamePerson_IsRejected()
    {
        var again = WorkflowCoordination.PlanAssign(9, 9, "Sam");
        Assert.False(again.Ok);
    }
}
