using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace CimmpleAPI.Data.Models
{
    /// <summary>
    /// Multi-location inventory balance. Tracks quantity on hand and reserved per product/raw material per location.
    /// ProductId used for finished parts (ProductMaster); RawMaterialId for raw materials (RawMaterialMaster).
    /// </summary>
    [Table("InventoryBalance")]
    public class InventoryBalance
    {
        [Key]
        public int Id { get; set; }

        /// <summary>Product for finished parts; null when MaterialType is RawMaterial.</summary>
        [Column("ProductId")]
        public int? ProductId { get; set; }

        /// <summary>Raw material; null when MaterialType is Product.</summary>
        [Column("RawMaterialId")]
        public int? RawMaterialId { get; set; }

        [Column("LocationId")]
        public int LocationId { get; set; }

        [Column("QuantityOnHand")]
        public decimal QuantityOnHand { get; set; }

        [Column("QuantityReserved")]
        public decimal QuantityReserved { get; set; }

        [Column("ReorderPoint")]
        public decimal? ReorderPoint { get; set; }

        [Column("ReorderQuantity")]
        public decimal? ReorderQuantity { get; set; }

        [Column("MaxQuantity")]
        public decimal? MaxQuantity { get; set; }

        [Column("LastCountDate")]
        public DateTime? LastCountDate { get; set; }

        [Column("UnitCost")]
        public decimal? UnitCost { get; set; }

        [Column("Tenantid")]
        public int Tenantid { get; set; }

        // Navigation properties
        [ForeignKey("ProductId")]
        public ProductMaster? Product { get; set; }

        [ForeignKey("RawMaterialId")]
        public RawMaterialMaster? RawMaterial { get; set; }

        [ForeignKey("LocationId")]
        public Location? Location { get; set; }

        /// <summary>Computed: QuantityOnHand - QuantityReserved</summary>
        [NotMapped]
        public decimal QuantityAvailable => QuantityOnHand - QuantityReserved;
    }
}
