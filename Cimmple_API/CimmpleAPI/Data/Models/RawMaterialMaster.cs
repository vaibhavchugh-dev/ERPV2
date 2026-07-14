using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace CimmpleAPI.Data.Models
{
    /// <summary>
    /// Master data for raw materials (distinct from ProductMaster which holds finished parts).
    /// Used for inventory tracking of materials consumed in manufacturing.
    /// </summary>
    [Table("RawMaterialMaster")]
    public class RawMaterialMaster
    {
        [Key]
        public int Id { get; set; }

        [Column("PartNo")]
        [MaxLength(100)]
        public string? PartNo { get; set; }

        [Column("PartName")]
        public string? PartName { get; set; }

        [Column("Description")]
        public string? Description { get; set; }

        [Column("Unit")]
        public string? Unit { get; set; }

        [Column("UnitCost")]
        public decimal UnitCost { get; set; }

        [Column("VendorId")]
        public int? VendorId { get; set; }

        [Column("ReorderPoint")]
        public decimal? ReorderPoint { get; set; }

        [Column("ReorderQuantity")]
        public decimal? ReorderQuantity { get; set; }

        [Column("Sku")]
        [MaxLength(80)]
        public string? Sku { get; set; }

        /// <summary>Human-readable warehouse zone / aisle / area (not necessarily the Location master row).</summary>
        [Column("WarehouseLocation")]
        [MaxLength(200)]
        public string? WarehouseLocation { get; set; }

        [Column("Bin")]
        [MaxLength(100)]
        public string? Bin { get; set; }

        [Column("Box")]
        [MaxLength(100)]
        public string? Box { get; set; }

        [Column("MaterialGrade")]
        [MaxLength(200)]
        public string? MaterialGrade { get; set; }

        [Column("Specification")]
        [MaxLength(500)]
        public string? Specification { get; set; }

        /// <summary>e.g. Sheet, Plate, Bar, Angle, Rod.</summary>
        [Column("StockForm")]
        [MaxLength(100)]
        public string? StockForm { get; set; }

        [Column("ThicknessMm")]
        public decimal? ThicknessMm { get; set; }

        [Column("WidthMm")]
        public decimal? WidthMm { get; set; }

        [Column("LengthMm")]
        public decimal? LengthMm { get; set; }

        [Column("IsRemnant")]
        public bool IsRemnant { get; set; }

        [Column("ParentRawMaterialId")]
        public int? ParentRawMaterialId { get; set; }

        /// <summary>Optional default storage location from Location master (inventory locations).</summary>
        [Column("DefaultLocationId")]
        public int? DefaultLocationId { get; set; }

        [Column("IsActive")]
        public bool IsActive { get; set; } = true;

        [Column("Tenantid")]
        public int Tenantid { get; set; }

        [ForeignKey("ParentRawMaterialId")]
        public RawMaterialMaster? ParentRawMaterial { get; set; }

        [ForeignKey("DefaultLocationId")]
        public Location? DefaultLocation { get; set; }
    }
}
