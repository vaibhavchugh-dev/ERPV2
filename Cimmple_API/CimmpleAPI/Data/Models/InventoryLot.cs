using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace CimmpleAPI.Data.Models
{
    /// <summary>
    /// Lot/batch tracking for traceability. Used for raw materials and finished goods requiring lot control.
    /// </summary>
    [Table("InventoryLot")]
    public class InventoryLot
    {
        [Key]
        public int Id { get; set; }

        [Column("LotNumber")]
        public string LotNumber { get; set; } = "";

        [Column("ProductId")]
        public int? ProductId { get; set; }

        [Column("RawMaterialId")]
        public int? RawMaterialId { get; set; }

        [Column("ExpiryDate")]
        public DateTime? ExpiryDate { get; set; }

        [Column("ReceivedDate")]
        public DateTime? ReceivedDate { get; set; }

        [Column("Status")]
        public string Status { get; set; } = "Active";

        [Column("Tenantid")]
        public int Tenantid { get; set; }

        // Navigation properties
        [ForeignKey("ProductId")]
        public ProductMaster? Product { get; set; }

        [ForeignKey("RawMaterialId")]
        public RawMaterialMaster? RawMaterial { get; set; }
    }
}
