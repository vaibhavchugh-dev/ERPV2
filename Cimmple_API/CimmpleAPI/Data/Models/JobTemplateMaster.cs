using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace CimmpleAPI.Data.Models
{
    /// <summary>
    /// A reusable, standardised manufacturing process definition that job orders,
    /// production orders and routings can be created from.
    /// </summary>
    public class JobTemplateMaster
    {
        [Key]
        public int Id { get; set; }

        public int Tenantid { get; set; }

        // ---- General information ----

        [MaxLength(50)]
        public string? TemplateCode { get; set; }

        [MaxLength(200)]
        public string? TemplateName { get; set; }

        public string? Description { get; set; }

        public int Status { get; set; } = 1;

        public int Revision { get; set; } = 1;

        public DateTime? EffectiveFrom { get; set; }

        public DateTime? EffectiveTo { get; set; }

        // ---- Manufacturing information ----

        /// <summary>Headline process for the template. Detail lives in the operations list.</summary>
        public int? PrimaryProcessId { get; set; }

        public int? WorkstationId { get; set; }

        [Column(TypeName = "decimal(18,2)")]
        public decimal? EstimatedSetupTimeMinutes { get; set; }

        [Column(TypeName = "decimal(18,2)")]
        public decimal? EstimatedCycleTimeMinutes { get; set; }

        [Column(TypeName = "decimal(18,2)")]
        public decimal? EstimatedLabourTimeMinutes { get; set; }

        [Column(TypeName = "decimal(18,2)")]
        public decimal? EstimatedMachineTimeMinutes { get; set; }

        // ---- Material information ----

        [MaxLength(200)]
        public string? DefaultMaterial { get; set; }

        [MaxLength(100)]
        public string? MaterialGrade { get; set; }

        [MaxLength(100)]
        public string? RawMaterialSize { get; set; }

        public string? MaterialNotes { get; set; }

        // ---- Tooling ----

        [MaxLength(200)]
        public string? Tool { get; set; }

        [MaxLength(200)]
        public string? Fixture { get; set; }

        [MaxLength(200)]
        public string? Workholding { get; set; }

        [MaxLength(200)]
        public string? Gauge { get; set; }

        public string? ToolingNotes { get; set; }

        // ---- Inspection ----

        [MaxLength(100)]
        public string? InspectionType { get; set; }

        public bool FirstArticleRequired { get; set; }

        public bool InProcessInspection { get; set; }

        public bool FinalInspection { get; set; }

        public bool CmmRequired { get; set; }

        public string? InspectionNotes { get; set; }

        // ---- Audit / protection ----

        /// <summary>Protected template seeded by the system. Cannot be deleted by users.</summary>
        public bool IsSystem { get; set; }

        public DateTime CreatedDate { get; set; }

        public int? CreatedBy { get; set; }

        public DateTime? ModifiedDate { get; set; }

        public int? ModifiedBy { get; set; }

        public ICollection<JobTemplateOperation> Operations { get; set; } = new List<JobTemplateOperation>();

        public ICollection<JobTemplateCategory> Categories { get; set; } = new List<JobTemplateCategory>();

        public ICollection<JobTemplateAttachment> Attachments { get; set; } = new List<JobTemplateAttachment>();
    }

    /// <summary>
    /// One step in a template's standard routing. Held in its own table rather than a
    /// JSON column so operations stay queryable for future routing and costing rollups.
    /// </summary>
    public class JobTemplateOperation
    {
        [Key]
        public int Id { get; set; }

        public int JobTemplateId { get; set; }

        public int Tenantid { get; set; }

        public int SequenceNumber { get; set; }

        public int? ProcessId { get; set; }

        public int? WorkstationId { get; set; }

        [Column(TypeName = "decimal(18,2)")]
        public decimal? SetupTimeMinutes { get; set; }

        [Column(TypeName = "decimal(18,2)")]
        public decimal? CycleTimeMinutes { get; set; }

        public string? Instructions { get; set; }

        public bool IsMandatory { get; set; } = true;

        public bool QualityCheckRequired { get; set; }

        public JobTemplateMaster? JobTemplate { get; set; }
    }

    /// <summary>Join row placing a template into one category value. Many-to-many by design.</summary>
    public class JobTemplateCategory
    {
        [Key]
        public int Id { get; set; }

        public int JobTemplateId { get; set; }

        public int CategoryValueId { get; set; }

        public int Tenantid { get; set; }

        public JobTemplateMaster? JobTemplate { get; set; }

        public CategoryValue? CategoryValue { get; set; }
    }

    /// <summary>Drawing, SOP, setup sheet, image or PDF attached to a template.</summary>
    public class JobTemplateAttachment
    {
        [Key]
        public int Id { get; set; }

        public int JobTemplateId { get; set; }

        public int Tenantid { get; set; }

        /// <summary>Drawing, SOP, SetupSheet, Image, PDF or Other.</summary>
        [MaxLength(50)]
        public string? AttachmentType { get; set; }

        [MaxLength(255)]
        public string? FileName { get; set; }

        [MaxLength(500)]
        public string? FileUrl { get; set; }

        [MaxLength(100)]
        public string? ContentType { get; set; }

        public long FileSize { get; set; }

        public DateTime UploadedDate { get; set; }

        public int? UploadedBy { get; set; }

        public JobTemplateMaster? JobTemplate { get; set; }
    }
}
