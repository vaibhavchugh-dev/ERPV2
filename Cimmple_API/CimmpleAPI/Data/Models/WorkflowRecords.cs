using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace CimmpleAPI.Data.Models
{
    /// <summary>
    /// One coordination row for a customer order, or for a quotation that has not become an order.
    /// Names, quantities, and balances stay on the source records.
    /// </summary>
    [Table("WorkflowInstance")]
    public class WorkflowInstance
    {
        [Key]
        public int Id { get; set; }

        public int TenantId { get; set; }

        public int? CustomerOrderId { get; set; }

        public int? QuotationId { get; set; }

        [MaxLength(32)]
        public string Status { get; set; } = "Open";

        [MaxLength(32)]
        public string PrincipalStageCode { get; set; } = "";

        public DateTime CreatedAt { get; set; }

        public DateTime UpdatedAt { get; set; }
    }

    /// <summary>
    /// One coordination task for a source record and task type. A refresh updates the same row.
    /// </summary>
    [Table("WorkflowTask")]
    public class WorkflowTask
    {
        [Key]
        public int Id { get; set; }

        public int TenantId { get; set; }

        public int WorkflowInstanceId { get; set; }

        [MaxLength(32)]
        public string StageCode { get; set; } = "";

        [MaxLength(64)]
        public string TaskType { get; set; } = "";

        [MaxLength(64)]
        public string SourceType { get; set; } = "";

        public int SourceId { get; set; }

        /// <summary>UserDetail.User_UniqueID. Null until someone is assigned.</summary>
        public int? OwnerUserId { get; set; }

        [MaxLength(32)]
        public string Status { get; set; } = "Open";

        [MaxLength(32)]
        public string Priority { get; set; } = "Normal";

        public DateTime? DueDate { get; set; }

        public bool DueDateIsManual { get; set; }

        [MaxLength(500)]
        public string? Blocker { get; set; }

        public bool BlockerIsManual { get; set; }

        [MaxLength(500)]
        public string NextAction { get; set; } = "";

        public bool NextActionIsManual { get; set; }

        public DateTime CreatedAt { get; set; }

        public DateTime UpdatedAt { get; set; }

        public DateTime? CompletedAt { get; set; }
    }

    /// <summary>A handoff of the current coordination task between users.</summary>
    [Table("WorkflowHandoff")]
    public class WorkflowHandoff
    {
        [Key]
        public int Id { get; set; }

        public int TenantId { get; set; }

        public int WorkflowTaskId { get; set; }

        public int? FromUserId { get; set; }

        public int? ToUserId { get; set; }

        [MaxLength(1000)]
        public string Instruction { get; set; } = "";

        public DateTime? DueDate { get; set; }

        [MaxLength(32)]
        public string Status { get; set; } = "Pending";

        public DateTime CreatedAt { get; set; }
    }

    /// <summary>Append-only coordination history. Rows are not updated or deleted.</summary>
    [Table("WorkflowEvent")]
    public class WorkflowEvent
    {
        [Key]
        public int Id { get; set; }

        public int TenantId { get; set; }

        public int WorkflowInstanceId { get; set; }

        public int? WorkflowTaskId { get; set; }

        [MaxLength(64)]
        public string EventType { get; set; } = "";

        [MaxLength(500)]
        public string Summary { get; set; } = "";

        public int? ActorUserId { get; set; }

        public DateTime CreatedAt { get; set; }
    }
}
