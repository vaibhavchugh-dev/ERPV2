using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace CimmpleAPI.Data.Models
{
    /// <summary>
    /// Material this job is planned to use. Distinct from inventory issues (what was
    /// actually consumed) and reservations (what is held on the shelf).
    /// </summary>
    [Table("JobMaterialRequirement")]
    public class JobMaterialRequirement
    {
        [Key]
        public int Id { get; set; }

        [Column("JobOrderId")]
        public int JobOrderId { get; set; }

        [Column("Tenantid")]
        public int Tenantid { get; set; }

        [Column("SequenceNumber")]
        public int SequenceNumber { get; set; }

        [Column("ProductId")]
        public int? ProductId { get; set; }

        [Column("RawMaterialId")]
        public int? RawMaterialId { get; set; }

        [Column("QuantityNeeded", TypeName = "decimal(18,2)")]
        public decimal QuantityNeeded { get; set; }

        [Column("Notes")]
        [MaxLength(200)]
        public string? Notes { get; set; }

        [ForeignKey("JobOrderId")]
        public JobOrderMaster? JobOrder { get; set; }

        [ForeignKey("ProductId")]
        public ProductMaster? Product { get; set; }

        [ForeignKey("RawMaterialId")]
        public RawMaterialMaster? RawMaterial { get; set; }
    }
}
