using System;
using System.Collections.Generic;

namespace CimmpleAPI.Services.Workflow
{
    public sealed class WorkflowOverviewDto
    {
        public string GeneratedAt { get; set; } = "";
        public string Limitation { get; set; } = "";
        public WorkflowSummaryDto Summary { get; set; } = new();
        public List<WorkflowStageCountDto> Stages { get; set; } = new();
        public List<WorkflowRowDto> Workflows { get; set; } = new();
        public List<WorkflowActionDto> Actions { get; set; } = new();
        public List<WorkflowCollectionCardDto> Collection { get; set; } = new();
    }

    public sealed class WorkflowSummaryDto
    {
        public int Active { get; set; }
        public int NeedsAction { get; set; }
        public int Blocked { get; set; }
        public int Overdue { get; set; }
    }

    public sealed class WorkflowStageCountDto
    {
        public string Code { get; set; } = "";
        public string Label { get; set; } = "";
        public int ActiveCount { get; set; }
        public int BlockedCount { get; set; }
        public int OverdueCount { get; set; }
        public int? OldestAgeDays { get; set; }
    }

    public sealed class WorkflowRowDto
    {
        public string Id { get; set; } = "";
        public string Kind { get; set; } = "";
        public string CustomerName { get; set; } = "";
        public string Reference { get; set; } = "";
        public string? CustomerPo { get; set; }
        public string PrincipalStage { get; set; } = "";
        public string PrincipalStageLabel { get; set; } = "";
        public string Indicator { get; set; } = "";
        public bool IsActive { get; set; }
        public bool IsBlocked { get; set; }
        public bool IsOverdue { get; set; }
        public bool NeedsAction { get; set; }
        public bool IsComplete { get; set; }
        public bool IsCancelled { get; set; }
        public string OwnerLabel { get; set; } = "Unassigned";
        public int? OwnerUserId { get; set; }
        public int? CoordinationTaskId { get; set; }
        public string? HandoffStatus { get; set; }
        public string? RejectionNote { get; set; }
        public string? ManualBlocker { get; set; }
        public string? CreatedByName { get; set; }
        public string? DocumentDate { get; set; }
        public string? DueDate { get; set; }
        public int AgeDays { get; set; }
        public string? BlockerReason { get; set; }
        public string NextAction { get; set; } = "";
        public string? QuotationPath { get; set; }
        public string? OrderPath { get; set; }
        public List<WorkflowStageStateDto> Stages { get; set; } = new();
        public List<WorkflowJobLinkDto> Jobs { get; set; } = new();
        public List<WorkflowShipmentLinkDto> Shipments { get; set; } = new();
        public List<WorkflowInvoiceLinkDto> Invoices { get; set; } = new();
        public List<WorkflowNcrLinkDto> Ncrs { get; set; } = new();
        public List<WorkflowPurchaseLinkDto> Purchases { get; set; } = new();
        public List<WorkflowShortageDto> Shortages { get; set; } = new();
        public string SearchText { get; set; } = "";
        public int? CustomerOrderId { get; set; }
        public int? QuotationId { get; set; }
        public int? InstanceId { get; set; }
        public string? InstanceStatus { get; set; }
        public List<WorkflowStoredTaskDto> StoredTasks { get; set; } = new();
        public List<WorkflowStoredEventDto> RecentEvents { get; set; } = new();
    }

    public sealed class WorkflowStageStateDto
    {
        public string Code { get; set; } = "";
        public string Label { get; set; } = "";
        public string State { get; set; } = "";
    }

    public sealed class WorkflowJobLinkDto
    {
        public int JobOrderId { get; set; }
        public string Number { get; set; } = "";
        public string? PartNo { get; set; }
        public string? PartName { get; set; }
        public string? Status { get; set; }
        public string? DueDate { get; set; }
        public string Path { get; set; } = "";
    }

    public sealed class WorkflowShipmentLinkDto
    {
        public int ShipmentId { get; set; }
        public string Number { get; set; } = "";
        public string? ShipmentDate { get; set; }
        public string Path { get; set; } = "";
    }

    public sealed class WorkflowInvoiceLinkDto
    {
        public int InvoiceId { get; set; }
        public string Number { get; set; } = "";
        public string Status { get; set; } = "";
        public string Substage { get; set; } = "";
        public decimal TotalAmount { get; set; }
        public decimal PaidAmount { get; set; }
        public decimal Balance { get; set; }
        public string? DueDate { get; set; }
        public int? DaysOverdue { get; set; }
        public string Path { get; set; } = "";
        public string ReceivablePath { get; set; } = "/accounts/receivable";
    }

    public sealed class WorkflowNcrLinkDto
    {
        public int NcrId { get; set; }
        public int? JobOrderId { get; set; }
        public string Number { get; set; } = "";
        public string? Title { get; set; }
        public string? Status { get; set; }
        public string? Severity { get; set; }
        public string Path { get; set; } = "";
    }

    public sealed class WorkflowPurchaseLinkDto
    {
        public int VendorOrderId { get; set; }
        public string Number { get; set; } = "";
        public string? VendorName { get; set; }
        public string? Status { get; set; }
        public int JobOrderId { get; set; }
        public string DetailKey { get; set; } = "";
        public int QtyOrdered { get; set; }
        public int QtyReceived { get; set; }
        public string OrderPath { get; set; } = "";
        public string ReceivingPath { get; set; } = "";
    }

    public sealed class WorkflowShortageDto
    {
        public int JobOrderId { get; set; }
        public string JobNumber { get; set; } = "";
        public string? PartNo { get; set; }
        public string? PartName { get; set; }
        public decimal Needed { get; set; }
        public decimal Available { get; set; }
        public decimal Reserved { get; set; }
        public decimal Issued { get; set; }
        public decimal ShortQty { get; set; }
        public string? RequiredBy { get; set; }
    }

    public sealed class WorkflowActionDto
    {
        public string Id { get; set; } = "";
        public string WorkflowId { get; set; } = "";
        public string Kind { get; set; } = "";
        public int Rank { get; set; }
        public string PriorityLabel { get; set; } = "";
        public string Title { get; set; } = "";
        public string? Detail { get; set; }
        public string CustomerName { get; set; } = "";
        public string Reference { get; set; } = "";
        public string? OrderPath { get; set; }
        public string LinkText { get; set; } = "";
        public string StageCode { get; set; } = "";
        public string StageLabel { get; set; } = "";
        public string OwnerLabel { get; set; } = "Unassigned";
        public string? DueDate { get; set; }
        public int AgeDays { get; set; }
        public string? BlockerReason { get; set; }
        public string NextAction { get; set; } = "";
        public string? LinkPath { get; set; }
        public string LinkLabel { get; set; } = "Open record";
        public string? SourceType { get; set; }
        public int SourceId { get; set; }
    }

    public sealed class WorkflowCollectionCardDto
    {
        public string Id { get; set; } = "";
        public string WorkflowId { get; set; } = "";
        public string Lane { get; set; } = "";
        public string Substage { get; set; } = "";
        public int Rank { get; set; }
        public string CustomerName { get; set; } = "";
        public string OrderNumber { get; set; } = "";
        public string? OrderPath { get; set; }
        public List<string> JobNumbers { get; set; } = new();
        public string? InvoiceNumber { get; set; }
        public string? InvoicePath { get; set; }
        public string ReceivablePath { get; set; } = "/accounts/receivable";
        public string OwnerLabel { get; set; } = "Unassigned";
        public int AgeDays { get; set; }
        public decimal? InvoiceAmount { get; set; }
        public decimal? PaidAmount { get; set; }
        public decimal? Outstanding { get; set; }
        public string? DueDate { get; set; }
        public string? BlockerReason { get; set; }
        public string NextAction { get; set; } = "";
        public bool IsOverdue { get; set; }
        public bool IsBlocked { get; set; }
        public string SearchText { get; set; } = "";
    }

    public sealed class WorkflowStoredTaskDto
    {
        public int TaskId { get; set; }
        public string TaskType { get; set; } = "";
        public string Label { get; set; } = "";
        public string StageCode { get; set; } = "";
        public string StageLabel { get; set; } = "";
        public string Status { get; set; } = "";
        public string Priority { get; set; } = "";
        public int? OwnerUserId { get; set; }
        public string OwnerLabel { get; set; } = "Unassigned";
        public string? DueDate { get; set; }
        public string? Blocker { get; set; }
        public string NextAction { get; set; } = "";
    }

    public sealed class WorkflowStoredEventDto
    {
        public string EventType { get; set; } = "";
        public string Summary { get; set; } = "";
        public string CreatedAt { get; set; } = "";
    }
}
