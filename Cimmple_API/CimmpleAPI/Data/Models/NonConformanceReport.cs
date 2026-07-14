using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace CimmpleAPI.Data.Models
{
    public class NonConformanceReport
    {
        [Key]
        public int NcrId { get; set; }

        [Required]
        [StringLength(50)]
        public string NcrNumber { get; set; }

        [Required]
        [StringLength(200)]
        public string Title { get; set; }

        [StringLength(1000)]
        public string Description { get; set; }

        [Required]
        [StringLength(50)]
        public string Category { get; set; } // Material_Defect, Dimensional_Issue, etc.

        [Required]
        [StringLength(20)]
        public string Severity { get; set; } // Minor, Major, Critical

        [Required]
        [StringLength(30)]
        public string Status { get; set; } // Open, Under_Investigation, Pending_Approval, Approved, Implemented, Closed, Rejected

        // Source Information
        [Required]
        [StringLength(20)]
        public string Source { get; set; } // Internal, External, Customer

        public int? JobOrderId { get; set; }
        [StringLength(50)]
        public string JobOrderNumber { get; set; }

        public int? RoutingStepId { get; set; }

        [StringLength(100)]
        public string PartNo { get; set; }

        [StringLength(200)]
        public string PartName { get; set; }

        public int? CustomerId { get; set; }
        [StringLength(200)]
        public string CustomerName { get; set; }

        // Quality Details
        [StringLength(200)]
        public string DefectLocation { get; set; }

        [Required]
        public int DefectQuantity { get; set; }
        [Required]
        public int TotalQuantity { get; set; }

        [StringLength(500)]
        public string DefectDescription { get; set; }

        // Photos field (nullable string in database)
        [StringLength(4000)]
        public string? Photos { get; set; }

        // Root Cause Analysis
        [StringLength(500)]
        public string RootCause { get; set; }

        [StringLength(50)]
        public string RootCauseCategory { get; set; } // Man, Machine, Material, Method, Measurement, Other

        // Actions
        [StringLength(500)]
        public string ImmediateAction { get; set; }

        [StringLength(500)]
        public string CorrectiveAction { get; set; }

        [StringLength(500)]
        public string PreventiveAction { get; set; }

        // Workflow
        [Required]
        public int ReportedBy { get; set; }
        [StringLength(200)]
        public string ReportedByName { get; set; }

        [Required]
        public DateTime ReportedDate { get; set; }

        public int? InvestigatedBy { get; set; }
        [StringLength(200)]
        public string InvestigatedByName { get; set; }
        public DateTime? InvestigatedDate { get; set; }

        public int? ApprovedBy { get; set; }
        [StringLength(200)]
        public string ApprovedByName { get; set; }
        public DateTime? ApprovedDate { get; set; }

        // Tracking
        public DateTime? DueDate { get; set; }
        public DateTime? ClosedDate { get; set; }
        public decimal? CostImpact { get; set; }

        [StringLength(500)]
        public string Notes { get; set; }

        // Additional fields for UI
        [Required]
        public int TenantId { get; set; }

        // Audit fields
        [Required]
        public int CreatedBy { get; set; }
        [Required]
        public DateTime CreatedDate { get; set; }
        public int? ModifiedBy { get; set; }
        public DateTime? ModifiedDate { get; set; }

        // Navigation properties (optional)
        [ForeignKey("JobOrderId")]
        public virtual JobOrderMaster JobOrder { get; set; }

        [ForeignKey("CustomerId")]
        public virtual CustomerMaster Customer { get; set; }
    }
}
