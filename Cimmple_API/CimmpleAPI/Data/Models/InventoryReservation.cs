using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace CimmpleAPI.Data.Models
{
    /// <summary>
    /// Qty held on the shelf for a job. On-hand does not change; available drops until issued or released.
    /// </summary>
    [Table("InventoryReservation")]
    public class InventoryReservation
    {
        [Key]
        public int Id { get; set; }

        [Column("ProductId")]
        public int? ProductId { get; set; }

        [Column("RawMaterialId")]
        public int? RawMaterialId { get; set; }

        [Column("LocationId")]
        public int LocationId { get; set; }

        [Column("Quantity")]
        public decimal Quantity { get; set; }

        [Column("ReferenceType")]
        [MaxLength(40)]
        public string ReferenceType { get; set; } = "JobOrder";

        [Column("ReferenceId")]
        public int ReferenceId { get; set; }

        [Column("Notes")]
        public string? Notes { get; set; }

        [Column("CreatedBy")]
        public int? CreatedBy { get; set; }

        [Column("CreatedDate")]
        public DateTime CreatedDate { get; set; }

        [Column("Tenantid")]
        public int Tenantid { get; set; }

        [ForeignKey("ProductId")]
        public ProductMaster? Product { get; set; }

        [ForeignKey("RawMaterialId")]
        public RawMaterialMaster? RawMaterial { get; set; }

        [ForeignKey("LocationId")]
        public Location? Location { get; set; }
    }
}
