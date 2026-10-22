using System;
using System.Collections.Generic;
using System.Linq;

namespace CimmpleAPI.Services.Workflow
{
    /// <summary>
    /// Read-only workflow status. Every value here is calculated from source documents.
    /// Nothing in this class is stored. Owner, handoff, blocker notes, and time-in-stage
    /// are not available until those records exist.
    ///
    /// Customer order Status often stays Draft until the first shipment, so a Draft order
    /// that already has a job is not treated as waiting for confirmation.
    /// Material shortage uses the same quantity rule as job orders:
    /// short = max(0, needed - reserved - issued - available).
    /// A vendor order does not clear that shortage.
    /// Open non-conformance reports need action. They do not set the blocked flag,
    /// because the quality record does not stop the job.
    /// Invoice paid, balance, and overdue follow the customer invoice screen:
    /// a void pays nothing, PaidAmount wins, and a legacy PaymentDate with no PaidAmount
    /// counts as paid in full. Overdue is kept even when the workflow is also blocked.
    /// </summary>
    public static class WorkflowStageRules
    {
        public const decimal MoneyEpsilon = 0.009m;

        public const string Quotation = "Quotation";
        public const string CustomerOrder = "CustomerOrder";
        public const string Planning = "Planning";
        public const string Materials = "Materials";
        public const string Production = "Production";
        public const string Quality = "Quality";
        public const string Shipment = "Shipment";
        public const string Invoice = "Invoice";
        public const string Collection = "Collection";

        public const string NotApplicable = "NotApplicable";
        public const string Upcoming = "Upcoming";
        public const string Current = "Current";
        public const string Attention = "Attention";
        public const string Blocked = "Blocked";
        public const string Complete = "Complete";
        public const string Cancelled = "Cancelled";

        public const string OnTrack = "OnTrack";
        public const string NeedsAction = "NeedsAction";
        public const string Overdue = "Overdue";
        public const string Completed = "Completed";

        public static readonly IReadOnlyList<(string Code, string Label)> StageCatalog = new[]
        {
            (Quotation, "Quotation"),
            (CustomerOrder, "Customer Order"),
            (Planning, "Planning"),
            (Materials, "Materials"),
            (Production, "Production"),
            (Quality, "Quality"),
            (Shipment, "Shipment"),
            (Invoice, "Invoice"),
            (Collection, "Collection"),
        };

        public static string StageLabel(string code) =>
            StageCatalog.FirstOrDefault(s => s.Code == code).Label ?? code;

        public static decimal MaterialShortageQty(decimal needed, decimal reserved, decimal issued, decimal available) =>
            Math.Max(0m, needed - reserved - issued - available);

        public static bool JobIgnoresMaterialShortage(string? status) =>
            Eq(status, "Completed") || Eq(status, "Cancelled") || Eq(status, "Canceled") || Eq(status, "Shipped");

        public static decimal EffectivePaid(bool isVoided, decimal total, decimal paidAmount, DateTime? paymentDate)
        {
            if (isVoided)
                return 0m;
            if (paidAmount > 0m)
                return paidAmount;
            if (paymentDate.HasValue)
                return total;
            return 0m;
        }

        public static decimal OpenBalance(decimal total, decimal effectivePaid)
        {
            var balance = total - effectivePaid;
            return balance < 0m ? 0m : Math.Round(balance, 2);
        }

        public static string InvoiceStatus(bool isVoided, decimal total, decimal effectivePaid, DateTime dueDate, DateTime today)
        {
            if (isVoided)
                return "Void";
            if (effectivePaid >= total - MoneyEpsilon && total > 0m)
                return "Paid";
            if (effectivePaid > MoneyEpsilon)
                return "Partially Paid";
            if (dueDate.Date < today.Date)
                return "Overdue";
            return "Unpaid";
        }

        public static string CollectionSubstage(string invoiceStatus) => invoiceStatus switch
        {
            "Void" => "Void",
            "Paid" => "Paid",
            "Partially Paid" => "Partially paid",
            "Overdue" => "Overdue",
            _ => "Awaiting payment",
        };

        public static int? DaysOverdue(decimal balance, DateTime dueDate, DateTime today)
        {
            if (balance <= MoneyEpsilon)
                return null;
            if (dueDate.Date >= today.Date)
                return null;
            return (today.Date - dueDate.Date).Days;
        }

        public static int AttentionRank(string kind) => kind switch
        {
            "MaterialShortage" => 0,
            "OverdueInvoice" => 1,
            "OverdueJob" => 2,
            "OpenNcr" => 3,
            "UninvoicedShipment" => 4,
            "OpenBalance" => 5,
            "ReadyToShip" => 6,
            "PlanningGap" => 7,
            "DraftOrder" => 8,
            "Quotation" => 9,
            _ => 50,
        };

        public static WorkflowEvaluation Evaluate(WorkflowFacts facts)
        {
            var today = facts.Today.Date;
            var cancelled = facts.HasCustomerOrder && IsCancelled(facts.OrderStatus);
            var quotationRejected = !facts.HasCustomerOrder && Eq(facts.QuotationStatus, "Rejected");
            var anyShipped = facts.Lines.Any(l => l.ShippedQty > 0);
            var anyInvoicedQty = facts.Lines.Any(l => l.InvoicedQty > 0);
            var narrowDraft = facts.HasCustomerOrder
                && !cancelled
                && IsDraft(facts.OrderStatus)
                && facts.Jobs.Count == 0
                && !anyShipped
                && !anyInvoicedQty;

            var terminalJobs = facts.Jobs.Where(j => IsTerminalJob(j.Status)).ToList();
            var startedJobs = facts.Jobs.Where(j => !IsTerminalJob(j.Status) && !IsDraft(j.Status)).ToList();
            var materialBlocked = facts.Jobs.Any(j =>
                j.MaterialShort
                && j.HasMaterialRequirements
                && !JobIgnoresMaterialShortage(j.Status));

            var shipmentComplete = facts.HasCustomerOrder
                && facts.Lines.Count > 0
                && facts.Lines.All(l => l.QtyOrdered <= 0 || l.ShippedQty >= l.QtyOrdered);
            var hasUninvoiced = facts.Lines.Any(l => l.ShippedQty > l.InvoicedQty);
            var invoiceComplete = anyShipped && !hasUninvoiced;

            var invoiceEvals = facts.Invoices.Select(inv => EvaluateInvoice(inv, today)).ToList();
            var openInvoices = invoiceEvals.Where(i => i.IsOpen).ToList();
            var nonVoid = invoiceEvals.Where(i => i.Status != "Void").ToList();
            var collectionComplete = nonVoid.Count > 0 && openInvoices.Count == 0;

            var hasRequirements = facts.Jobs.Any(j => j.HasMaterialRequirements);
            var hasOpenNcr = facts.Ncrs.Any(IsOpenNcr);
            var openDraftJob = facts.Jobs.Any(j => IsDraft(j.Status));
            var jobsPlanned = facts.Lines.Count > 0
                && facts.Lines.All(l => l.HasJob)
                && !openDraftJob;
            // A shipped order with no jobs is planned enough. A draft job still open is not.
            var planningComplete = facts.HasCustomerOrder && !cancelled && !openDraftJob
                && (jobsPlanned || shipmentComplete);
            var planningGap = facts.HasCustomerOrder && !cancelled && !narrowDraft && !planningComplete;

            var productionState = ProductionState(facts.Jobs, startedJobs, terminalJobs, materialBlocked);
            var qualityState = facts.Ncrs.Count == 0
                ? NotApplicable
                : hasOpenNcr ? Attention : Complete;
            var materialsState = !hasRequirements
                ? NotApplicable
                : materialBlocked ? Blocked : Complete;
            var shipmentState = ShipmentState(facts.HasCustomerOrder, cancelled, facts.Lines.Count > 0, shipmentComplete, anyShipped, productionState, narrowDraft);
            var invoiceState = !anyShipped ? Upcoming : invoiceComplete ? Complete : Current;
            var collectionState = nonVoid.Count == 0 ? Upcoming : collectionComplete ? Complete : Current;

            var allJobsTerminal = facts.Jobs.Count == 0 || facts.Jobs.All(j => IsTerminalJob(j.Status));
            var isComplete = facts.HasCustomerOrder
                && !cancelled
                && !narrowDraft
                && !materialBlocked
                && shipmentComplete
                && invoiceComplete
                && collectionComplete
                && allJobsTerminal
                && !hasOpenNcr
                && facts.Lines.Any(l => l.QtyOrdered > 0);

            var productionBusy = productionState == Current || productionState == Blocked;
            var needsAction = !isComplete && !cancelled && !quotationRejected && (
                !facts.HasCustomerOrder
                || narrowDraft
                || planningGap
                || materialBlocked
                || hasOpenNcr
                || hasUninvoiced
                || collectionState == Current
                || (shipmentState == Current && !productionBusy));

            var isOverdue = !isComplete && !cancelled && !quotationRejected && (
                facts.Jobs.Any(j => !IsTerminalJob(j.Status) && j.DueDate.HasValue && j.DueDate.Value.Date < today)
                || facts.Lines.Any(l => l.QtyOrdered > l.ShippedQty && l.DueDate.HasValue && l.DueDate.Value.Date < today)
                || invoiceEvals.Any(i => i.DaysOverdue.HasValue));

            var isBlocked = materialBlocked;
            var isCancelled = cancelled || quotationRejected;
            var isActive = !isComplete && !isCancelled;

            var stages = new Dictionary<string, string>
            {
                [Quotation] = !facts.HasCustomerOrder ? (quotationRejected ? Cancelled : Current) : Complete,
                [CustomerOrder] = !facts.HasCustomerOrder ? Upcoming : cancelled ? Cancelled : narrowDraft ? Current : Complete,
                [Planning] = !facts.HasCustomerOrder || cancelled || narrowDraft
                    ? Upcoming
                    : planningComplete ? Complete : Attention,
                [Materials] = materialsState,
                [Production] = !facts.HasCustomerOrder || narrowDraft ? Upcoming : productionState,
                [Quality] = qualityState,
                [Shipment] = shipmentState,
                [Invoice] = invoiceState,
                [Collection] = collectionState,
            };

            var principal = Principal(
                facts.HasCustomerOrder,
                isComplete,
                isCancelled,
                materialBlocked,
                narrowDraft,
                planningGap,
                productionBusy,
                anyShipped,
                hasOpenNcr,
                shipmentComplete,
                shipmentState,
                hasUninvoiced,
                collectionState);

            if (!isComplete && !isCancelled && stages.TryGetValue(principal, out var principalState))
            {
                if (principalState == Attention || principalState == Upcoming)
                    stages[principal] = Current;
            }

            var indicator = isCancelled ? Cancelled
                : isComplete ? Completed
                : isBlocked ? Blocked
                : isOverdue ? Overdue
                : needsAction ? NeedsAction
                : OnTrack;

            var blocker = isBlocked ? "Material not available for an open job." : null;

            return new WorkflowEvaluation
            {
                PrincipalStage = principal,
                Indicator = indicator,
                IsActive = isActive,
                IsBlocked = isBlocked,
                IsOverdue = isOverdue,
                NeedsAction = needsAction && !isComplete && !isCancelled,
                IsComplete = isComplete,
                IsCancelled = isCancelled,
                PlanningGap = planningGap,
                HasUninvoicedShipment = hasUninvoiced,
                HasOpenNcr = hasOpenNcr,
                NarrowDraft = narrowDraft,
                MaterialBlocked = materialBlocked,
                ShipmentReady = shipmentState == Current && !productionBusy && !isComplete && !isCancelled,
                BlockerReason = blocker,
                NextAction = NextAction(principal, isComplete, isCancelled, isBlocked, isOverdue, facts.QuotationMarkedConverted && !facts.HasCustomerOrder),
                Stages = StageCatalog.Select(s => new WorkflowStageEvaluation
                {
                    Code = s.Code,
                    Label = s.Label,
                    State = stages[s.Code],
                }).ToList(),
                Invoices = invoiceEvals,
            };
        }

        public static string NextAction(
            string principal,
            bool isComplete,
            bool isCancelled,
            bool isBlocked,
            bool isOverdue,
            bool convertedWithoutOrder)
        {
            if (isCancelled)
                return "This record is cancelled. The source documents keep the history.";
            if (isComplete)
                return "No open action. Shipment, invoice, and collection are complete.";
            if (convertedWithoutOrder)
                return "The quotation is marked converted, but no customer order is linked.";
            if (isBlocked)
                return "Cover the shortage in Purchasing. Material is available only after receipt and allocation, not when a vendor order is created.";
            return principal switch
            {
                Quotation => "Follow up or convert the quotation in Customer Quotations.",
                CustomerOrder => "Confirm the customer order.",
                Planning => "Create the missing job order from the customer order line.",
                Production => "Production is in progress.",
                Quality => "Review the open non-conformance report.",
                Shipment => "Ship the remaining quantity.",
                Invoice => "Create the invoice for the shipped quantity.",
                Collection => isOverdue
                    ? "Follow up the overdue balance in Accounts Receivable."
                    : "Collect the outstanding balance in Accounts Receivable.",
                _ => "Review the source records.",
            };
        }

        private static WorkflowInvoiceEvaluation EvaluateInvoice(WorkflowInvoiceFacts inv, DateTime today)
        {
            var paid = EffectivePaid(inv.IsVoided, inv.TotalAmount, inv.PaidAmount, inv.PaymentDate);
            // A void has no receivable. Paid amount is also forced to zero, so the raw
            // total-minus-paid figure would otherwise look like the full invoice is still open.
            var balance = inv.IsVoided ? 0m : OpenBalance(inv.TotalAmount, paid);
            var status = InvoiceStatus(inv.IsVoided, inv.TotalAmount, paid, inv.DueDate, today);
            var days = DaysOverdue(balance, inv.DueDate, today);
            return new WorkflowInvoiceEvaluation
            {
                Status = status,
                Substage = CollectionSubstage(status),
                Paid = paid,
                Balance = balance,
                DaysOverdue = days,
                IsOpen = status != "Void" && status != "Paid",
            };
        }

        private static string ProductionState(
            IReadOnlyList<WorkflowJobFacts> jobs,
            IReadOnlyList<WorkflowJobFacts> started,
            IReadOnlyList<WorkflowJobFacts> terminal,
            bool materialBlocked)
        {
            if (jobs.Count == 0)
                return Upcoming;
            if (started.Count == 0)
                return terminal.Count == jobs.Count ? Complete : Upcoming;
            var openShort = started.Where(j => j.MaterialShort && j.HasMaterialRequirements).ToList();
            if (openShort.Count == started.Count && materialBlocked)
                return Blocked;
            return Current;
        }

        private static string ShipmentState(
            bool hasOrder,
            bool cancelled,
            bool hasLines,
            bool shipmentComplete,
            bool anyShipped,
            string productionState,
            bool narrowDraft)
        {
            if (!hasOrder || narrowDraft)
                return Upcoming;
            if (shipmentComplete)
                return Complete;
            if (cancelled)
                return Cancelled;
            if (!hasLines)
                return Upcoming;
            if (anyShipped)
                return Current;
            if (productionState == Complete)
                return Current;
            return Upcoming;
        }

        private static string Principal(
            bool hasOrder,
            bool isComplete,
            bool isCancelled,
            bool materialBlocked,
            bool narrowDraft,
            bool planningGap,
            bool productionBusy,
            bool anyShipped,
            bool hasOpenNcr,
            bool shipmentComplete,
            string shipmentState,
            bool hasUninvoiced,
            string collectionState)
        {
            if (!hasOrder)
                return Quotation;
            if (isCancelled)
                return CustomerOrder;
            if (isComplete)
                return Collection;
            if (materialBlocked)
                return Materials;
            if (narrowDraft)
                return CustomerOrder;
            if (planningGap && !productionBusy && !anyShipped)
                return Planning;
            if (productionBusy)
                return Production;
            if (hasOpenNcr && !shipmentComplete)
                return Quality;
            if (shipmentState == Current)
                return Shipment;
            if (hasUninvoiced)
                return Invoice;
            if (collectionState == Current)
                return Collection;
            if (hasOpenNcr)
                return Quality;
            if (planningGap)
                return Planning;
            return Collection;
        }

        private static bool IsTerminalJob(string? status) =>
            JobIgnoresMaterialShortage(status);

        private static bool IsOpenNcr(WorkflowNcrFacts ncr) =>
            !Eq(ncr.Status, "Closed") && !Eq(ncr.Status, "Rejected");

        private static bool IsCancelled(string? status) =>
            Eq(status, "Cancelled") || Eq(status, "Canceled");

        private static bool IsDraft(string? status) =>
            string.IsNullOrWhiteSpace(status) || Eq(status, "Draft");

        private static bool Eq(string? left, string right) =>
            string.Equals(left?.Trim(), right, StringComparison.OrdinalIgnoreCase);
    }

    public sealed class WorkflowFacts
    {
        public bool HasCustomerOrder { get; init; }
        public string? OrderStatus { get; init; }
        public bool HasQuotation { get; init; }
        public string? QuotationStatus { get; init; }
        public bool QuotationMarkedConverted { get; init; }
        public IReadOnlyList<WorkflowLineFacts> Lines { get; init; } = Array.Empty<WorkflowLineFacts>();
        public IReadOnlyList<WorkflowJobFacts> Jobs { get; init; } = Array.Empty<WorkflowJobFacts>();
        public IReadOnlyList<WorkflowInvoiceFacts> Invoices { get; init; } = Array.Empty<WorkflowInvoiceFacts>();
        public IReadOnlyList<WorkflowNcrFacts> Ncrs { get; init; } = Array.Empty<WorkflowNcrFacts>();
        public DateTime Today { get; init; }
    }

    public sealed class WorkflowLineFacts
    {
        public int QtyOrdered { get; init; }
        public int ShippedQty { get; init; }
        public int InvoicedQty { get; init; }
        public DateTime? DueDate { get; init; }
        public bool HasJob { get; init; }
    }

    public sealed class WorkflowJobFacts
    {
        public string? Status { get; init; }
        public DateTime? DueDate { get; init; }
        public bool MaterialShort { get; init; }
        public bool HasMaterialRequirements { get; init; }
    }

    public sealed class WorkflowInvoiceFacts
    {
        public bool IsVoided { get; init; }
        public decimal TotalAmount { get; init; }
        public decimal PaidAmount { get; init; }
        public DateTime? PaymentDate { get; init; }
        public DateTime DueDate { get; init; }
    }

    public sealed class WorkflowNcrFacts
    {
        public string? Status { get; init; }
    }

    public sealed class WorkflowEvaluation
    {
        public string PrincipalStage { get; init; } = "";
        public string Indicator { get; init; } = "";
        public bool IsActive { get; init; }
        public bool IsBlocked { get; init; }
        public bool IsOverdue { get; init; }
        public bool NeedsAction { get; init; }
        public bool IsComplete { get; init; }
        public bool IsCancelled { get; init; }
        public bool PlanningGap { get; init; }
        public bool HasUninvoicedShipment { get; init; }
        public bool HasOpenNcr { get; init; }
        public bool NarrowDraft { get; init; }
        public bool MaterialBlocked { get; init; }
        public bool ShipmentReady { get; init; }
        public string? BlockerReason { get; init; }
        public string NextAction { get; init; } = "";
        public IReadOnlyList<WorkflowStageEvaluation> Stages { get; init; } = Array.Empty<WorkflowStageEvaluation>();
        public IReadOnlyList<WorkflowInvoiceEvaluation> Invoices { get; init; } = Array.Empty<WorkflowInvoiceEvaluation>();
    }

    public sealed class WorkflowStageEvaluation
    {
        public string Code { get; init; } = "";
        public string Label { get; init; } = "";
        public string State { get; init; } = "";
    }

    public sealed class WorkflowInvoiceEvaluation
    {
        public string Status { get; init; } = "";
        public string Substage { get; init; } = "";
        public decimal Paid { get; init; }
        public decimal Balance { get; init; }
        public int? DaysOverdue { get; init; }
        public bool IsOpen { get; init; }
    }
}
