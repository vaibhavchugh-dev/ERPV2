using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace CimmpleAPI.Data.Models
{
    /// <summary>
    /// Records every inventory movement (receipt, issue, transfer, adjustment) for audit trail.
    /// </summary>
    [Table("InventoryTransaction")]
    public class InventoryTransaction
    {
        [Key]
        public int Id { get; set; }

        [Column("ProductId")]
        public int? ProductId { get; set; }

        [Column("RawMaterialId")]
        public int? RawMaterialId { get; set; }

        [Column("LocationId")]
        public int LocationId { get; set; }

        [Column("TransactionTypeId")]
        public int TransactionTypeId { get; set; }

        /// <summary>Signed quantity: positive = in, negative = out</summary>
        [Column("Quantity")]
        public decimal Quantity { get; set; }

        /// <summary>Reference: VendorReceiving, JobOrder, CustomerShipment, Adjustment, Transfer</summary>
        [Column("ReferenceType")]
        public string? ReferenceType { get; set; }

        [Column("ReferenceId")]
        public int? ReferenceId { get; set; }

        [Column("TransactionDate")]
        public DateTime TransactionDate { get; set; }

        [Column("LotId")]
        public int? LotId { get; set; }

        [Column("CreatedBy")]
        public int? CreatedBy { get; set; }

        [Column("Notes")]
        public string? Notes { get; set; }

        [Column("Tenantid")]
        public int Tenantid { get; set; }

        // Navigation properties
        [ForeignKey("ProductId")]
        public ProductMaster? Product { get; set; }

        [ForeignKey("RawMaterialId")]
        public RawMaterialMaster? RawMaterial { get; set; }

        [ForeignKey("LocationId")]
        public Location? Location { get; set; }

        [ForeignKey("TransactionTypeId")]
        public InventoryTransactionType? TransactionType { get; set; }

        [ForeignKey("LotId")]
        public InventoryLot? Lot { get; set; }
    }
}
