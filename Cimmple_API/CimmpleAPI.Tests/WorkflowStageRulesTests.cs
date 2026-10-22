using System;
using System.Collections.Generic;
using System.Linq;
using CimmpleAPI.Services.Workflow;
using Xunit;

namespace CimmpleAPI.Tests;

public class WorkflowStageRulesTests
{
    private static readonly DateTime Today = new(2026, 10, 21);

    [Fact]
    public void MaterialShortageQty_MatchesJobOrderFormula()
    {
        Assert.Equal(1m, WorkflowStageRules.MaterialShortageQty(10, 3, 2, 4));
        Assert.Equal(0m, WorkflowStageRules.MaterialShortageQty(10, 10, 0, 0));
        Assert.Equal(0m, WorkflowStageRules.MaterialShortageQty(5, 0, 1, 4));
    }

    [Fact]
    public void CompletedJob_IgnoresMaterialShortage()
    {
        Assert.True(WorkflowStageRules.JobIgnoresMaterialShortage("Completed"));
        Assert.True(WorkflowStageRules.JobIgnoresMaterialShortage("Shipped"));
        Assert.False(WorkflowStageRules.JobIgnoresMaterialShortage("Partially Shipped"));
        Assert.False(WorkflowStageRules.JobIgnoresMaterialShortage("In Progress"));
    }

    [Fact]
    public void OpenQuotation_IsNeedsAction()
    {
        var result = WorkflowStageRules.Evaluate(new WorkflowFacts
        {
            QuotationStatus = "Sent",
            Today = Today,
        });

        Assert.Equal(WorkflowStageRules.Quotation, result.PrincipalStage);
        Assert.Equal(WorkflowStageRules.NeedsAction, result.Indicator);
        Assert.True(result.IsActive);
        Assert.False(result.IsBlocked);
        Assert.False(result.IsComplete);
    }

    [Fact]
    public void RejectedQuotation_StaysCancelled()
    {
        var result = WorkflowStageRules.Evaluate(new WorkflowFacts
        {
            QuotationStatus = "Rejected",
            Today = Today,
        });

        Assert.Equal(WorkflowStageRules.Cancelled, result.Indicator);
        Assert.False(result.IsActive);
        Assert.Contains(result.Stages, s => s.Code == WorkflowStageRules.Quotation && s.State == WorkflowStageRules.Cancelled);
    }

    [Fact]
    public void DraftOrder_WithoutJobs_WaitsForConfirmation()
    {
        var result = EvaluateOrder("Draft", lines: new[] { Line(4, due: Today.AddDays(-1)) });

        Assert.Equal(WorkflowStageRules.CustomerOrder, result.PrincipalStage);
        Assert.True(result.NeedsAction);
        Assert.True(result.IsOverdue);
        Assert.Equal(WorkflowStageRules.Overdue, result.Indicator);
    }

    [Fact]
    public void DraftOrder_WithInProgressJob_IsProduction()
    {
        var result = EvaluateOrder(
            "Draft",
            lines: new[] { Line(4, due: Today.AddDays(10), hasJob: true) },
            jobs: new[] { Job("In Progress", Today.AddDays(10)) });

        Assert.Equal(WorkflowStageRules.Production, result.PrincipalStage);
        Assert.Equal(WorkflowStageRules.OnTrack, result.Indicator);
        Assert.Equal(WorkflowStageRules.Complete, Stage(result, WorkflowStageRules.CustomerOrder));
        Assert.False(result.IsBlocked);
    }

    [Fact]
    public void MissingJob_IsPlanning()
    {
        var result = EvaluateOrder(
            "In Progress",
            lines: new[] { Line(2, due: Today.AddDays(5)) });

        Assert.Equal(WorkflowStageRules.Planning, result.PrincipalStage);
        Assert.True(result.NeedsAction);
        Assert.Equal(WorkflowStageRules.Current, Stage(result, WorkflowStageRules.Planning));
    }

    [Fact]
    public void MaterialShortage_BlocksOnlyTheOpenJob_AndKeepsOverdue()
    {
        var result = EvaluateOrder(
            "In Progress",
            lines: new[]
            {
                Line(2, due: Today.AddDays(-3), hasJob: true),
                Line(2, due: Today.AddDays(4), hasJob: true),
            },
            jobs: new[]
            {
                Job("In Progress", Today.AddDays(-3), shortMaterial: true, hasRequirements: true),
                Job("In Progress", Today.AddDays(4)),
            },
            invoices: new[] { Invoice(1000, 0, Today.AddDays(-2)) });

        Assert.Equal(WorkflowStageRules.Materials, result.PrincipalStage);
        Assert.True(result.IsBlocked);
        Assert.True(result.IsOverdue);
        Assert.Equal(WorkflowStageRules.Blocked, result.Indicator);
        Assert.Equal(WorkflowStageRules.Blocked, Stage(result, WorkflowStageRules.Materials));
        Assert.Equal(WorkflowStageRules.Current, Stage(result, WorkflowStageRules.Production));
        Assert.Contains("vendor order", result.NextAction, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void ShortageFlag_OnCompletedJob_DoesNotBlock()
    {
        var result = EvaluateOrder(
            "Shipped",
            lines: new[] { Line(2, shipped: 2, invoiced: 2, due: Today.AddDays(-1), hasJob: true) },
            jobs: new[] { Job("Completed", Today.AddDays(-1), shortMaterial: true, hasRequirements: true) },
            invoices: new[] { Invoice(500, 500, Today.AddDays(-1)) });

        Assert.False(result.IsBlocked);
        Assert.True(result.IsComplete);
        Assert.False(result.IsOverdue);
        Assert.Equal(WorkflowStageRules.Completed, result.Indicator);
    }

    [Fact]
    public void ShippedNotInvoiced_IsInvoiceStage()
    {
        var result = EvaluateOrder(
            "Shipped",
            lines: new[] { Line(5, shipped: 5, invoiced: 2, due: Today.AddDays(3), hasJob: true) },
            jobs: new[] { Job("Shipped", Today.AddDays(3)) });

        Assert.Equal(WorkflowStageRules.Invoice, result.PrincipalStage);
        Assert.True(result.HasUninvoicedShipment);
        Assert.True(result.NeedsAction);
        Assert.Equal(WorkflowStageRules.Current, Stage(result, WorkflowStageRules.Invoice));
    }

    [Fact]
    public void NothingShipped_IsNotReadyToInvoice()
    {
        var result = EvaluateOrder(
            "In Progress",
            lines: new[] { Line(3, hasJob: true, due: Today.AddDays(2)) },
            jobs: new[] { Job("In Progress", Today.AddDays(2)) });

        Assert.Equal(WorkflowStageRules.Upcoming, Stage(result, WorkflowStageRules.Invoice));
        Assert.False(result.HasUninvoicedShipment);
    }

    [Fact]
    public void PartialPayment_StaysOpen_AndSecondInvoiceDoesNotHideIt()
    {
        var result = EvaluateOrder(
            "Shipped",
            lines: new[] { Line(4, shipped: 4, invoiced: 4, hasJob: true, due: Today.AddDays(6)) },
            jobs: new[] { Job("Shipped", Today.AddDays(6)) },
            invoices: new[]
            {
                Invoice(800, 800, Today.AddDays(6)),
                Invoice(200, 50, Today.AddDays(6)),
            });

        Assert.Equal(WorkflowStageRules.Collection, result.PrincipalStage);
        Assert.False(result.IsComplete);
        Assert.Equal(150m, result.Invoices[1].Balance);
        Assert.Equal("Partially paid", result.Invoices[1].Substage);
        Assert.True(result.Invoices[0].Status == "Paid");
    }

    [Fact]
    public void LegacyPaymentDate_CountsAsPaid()
    {
        var paid = WorkflowStageRules.EffectivePaid(false, 400m, 0m, Today.AddDays(-1));
        Assert.Equal(400m, paid);
        Assert.Equal("Paid", WorkflowStageRules.InvoiceStatus(false, 400m, paid, Today.AddDays(-1), Today));
        Assert.Null(WorkflowStageRules.DaysOverdue(WorkflowStageRules.OpenBalance(400m, paid), Today.AddDays(-1), Today));
    }

    [Fact]
    public void VoidInvoice_HasNoBalance()
    {
        var paid = WorkflowStageRules.EffectivePaid(true, 400m, 400m, Today);
        Assert.Equal(0m, paid);
        Assert.Equal("Void", WorkflowStageRules.InvoiceStatus(true, 400m, paid, Today.AddDays(-5), Today));

        var result = EvaluateOrder(
            "Shipped",
            lines: new[] { Line(1, shipped: 1, invoiced: 0, hasJob: true, due: Today.AddDays(3)) },
            jobs: new[] { Job("Shipped", Today.AddDays(3)) },
            invoices: new[]
            {
                new WorkflowInvoiceFacts
                {
                    IsVoided = true,
                    TotalAmount = 400m,
                    PaidAmount = 400m,
                    DueDate = Today.AddDays(-5),
                },
            });
        Assert.Equal(0m, result.Invoices[0].Balance);
        Assert.Null(result.Invoices[0].DaysOverdue);
        Assert.False(result.Invoices[0].IsOpen);
        Assert.False(result.IsOverdue);
    }

    [Fact]
    public void OverdueBalance_IsIndependentOfAZeroPayment()
    {
        var result = EvaluateOrder(
            "Shipped",
            lines: new[] { Line(1, shipped: 1, invoiced: 1, hasJob: true, due: Today.AddDays(1)) },
            jobs: new[] { Job("Shipped", Today.AddDays(1)) },
            invoices: new[] { Invoice(250, 0, Today.AddDays(-4)) });

        Assert.Equal("Overdue", result.Invoices[0].Status);
        Assert.Equal("Overdue", result.Invoices[0].Substage);
        Assert.Equal(4, result.Invoices[0].DaysOverdue);
        Assert.Equal(WorkflowStageRules.Overdue, result.Indicator);
        Assert.False(result.IsBlocked);
    }

    [Fact]
    public void OpenNcr_NeedsAction_AndDoesNotBlock()
    {
        var result = EvaluateOrder(
            "In Progress",
            lines: new[] { Line(1, hasJob: true, due: Today.AddDays(8)) },
            jobs: new[] { Job("In Progress", Today.AddDays(8)) },
            ncrs: new[] { new WorkflowNcrFacts { Status = "Under_Investigation" } });

        Assert.True(result.HasOpenNcr);
        Assert.True(result.NeedsAction);
        Assert.False(result.IsBlocked);
        Assert.Equal(WorkflowStageRules.Attention, Stage(result, WorkflowStageRules.Quality));
        Assert.Equal(WorkflowStageRules.Production, result.PrincipalStage);
    }

    [Fact]
    public void PaidOrder_WithOpenNcr_IsNotComplete()
    {
        var result = EvaluateOrder(
            "Fully Invoiced",
            lines: new[] { Line(1, shipped: 1, invoiced: 1, hasJob: true, due: Today.AddDays(-2)) },
            jobs: new[] { Job("Completed", Today.AddDays(-2)) },
            invoices: new[] { Invoice(90, 90, Today.AddDays(-2)) },
            ncrs: new[] { new WorkflowNcrFacts { Status = "Open" } });

        Assert.False(result.IsComplete);
        Assert.Equal(WorkflowStageRules.Quality, result.PrincipalStage);
        Assert.Equal(WorkflowStageRules.Current, Stage(result, WorkflowStageRules.Quality));
    }

    [Fact]
    public void ClosedNcr_DoesNotKeepTheWorkflowOpen()
    {
        var result = EvaluateOrder(
            "Fully Invoiced",
            lines: new[] { Line(1, shipped: 1, invoiced: 1, hasJob: true, due: Today) },
            jobs: new[] { Job("Completed", Today) },
            invoices: new[] { Invoice(90, 90, Today) },
            ncrs: new[] { new WorkflowNcrFacts { Status = "Closed" } });

        Assert.True(result.IsComplete);
        Assert.Equal(WorkflowStageRules.Complete, Stage(result, WorkflowStageRules.Quality));
    }

    [Fact]
    public void CancelledOrder_KeepsAVisibleStage()
    {
        var result = EvaluateOrder(
            "Cancelled",
            lines: new[] { Line(2, hasJob: true) },
            jobs: new[] { Job("Cancelled", Today) });

        Assert.True(result.IsCancelled);
        Assert.False(result.IsActive);
        Assert.Equal(WorkflowStageRules.CustomerOrder, result.PrincipalStage);
        Assert.Contains("history", result.NextAction, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void PartialShipment_WithoutJobs_DoesNotPretendPlanningIsDone()
    {
        var result = EvaluateOrder(
            "Partially Shipped",
            lines: new[] { Line(10, shipped: 4, invoiced: 4) },
            invoices: new[] { Invoice(40, 40, Today.AddDays(5)) });

        Assert.Equal(WorkflowStageRules.Attention, Stage(result, WorkflowStageRules.Planning));
        Assert.Equal(WorkflowStageRules.Current, Stage(result, WorkflowStageRules.Shipment));
        Assert.Equal(WorkflowStageRules.Shipment, result.PrincipalStage);
        Assert.Equal(WorkflowStageRules.NotApplicable, Stage(result, WorkflowStageRules.Materials));
    }

    [Fact]
    public void DirectOrder_MarksQuotationComplete()
    {
        var result = EvaluateOrder("In Progress", lines: new[] { Line(1) });
        Assert.Equal(WorkflowStageRules.Complete, Stage(result, WorkflowStageRules.Quotation));
    }

    [Theory]
    [InlineData("MaterialShortage", 0)]
    [InlineData("OverdueInvoice", 1)]
    [InlineData("Quotation", 9)]
    public void AttentionRank_PutsBlockersFirst(string kind, int rank)
    {
        Assert.Equal(rank, WorkflowStageRules.AttentionRank(kind));
    }

    private static WorkflowEvaluation EvaluateOrder(
        string status,
        IEnumerable<WorkflowLineFacts>? lines = null,
        IEnumerable<WorkflowJobFacts>? jobs = null,
        IEnumerable<WorkflowInvoiceFacts>? invoices = null,
        IEnumerable<WorkflowNcrFacts>? ncrs = null)
    {
        return WorkflowStageRules.Evaluate(new WorkflowFacts
        {
            HasCustomerOrder = true,
            OrderStatus = status,
            Lines = (lines ?? Array.Empty<WorkflowLineFacts>()).ToList(),
            Jobs = (jobs ?? Array.Empty<WorkflowJobFacts>()).ToList(),
            Invoices = (invoices ?? Array.Empty<WorkflowInvoiceFacts>()).ToList(),
            Ncrs = (ncrs ?? Array.Empty<WorkflowNcrFacts>()).ToList(),
            Today = Today,
        });
    }

    private static WorkflowLineFacts Line(
        int qty,
        int shipped = 0,
        int invoiced = 0,
        DateTime? due = null,
        bool hasJob = false) => new()
    {
        QtyOrdered = qty,
        ShippedQty = shipped,
        InvoicedQty = invoiced,
        DueDate = due,
        HasJob = hasJob,
    };

    private static WorkflowJobFacts Job(
        string status,
        DateTime? due,
        bool shortMaterial = false,
        bool hasRequirements = false) => new()
    {
        Status = status,
        DueDate = due,
        MaterialShort = shortMaterial,
        HasMaterialRequirements = hasRequirements,
    };

    private static WorkflowInvoiceFacts Invoice(decimal total, decimal paid, DateTime due) => new()
    {
        TotalAmount = total,
        PaidAmount = paid,
        DueDate = due,
    };

    private static string Stage(WorkflowEvaluation result, string code) =>
        result.Stages.Single(s => s.Code == code).State;
}
