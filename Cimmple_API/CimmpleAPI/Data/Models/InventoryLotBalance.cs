using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace CimmpleAPI.Data.Models
{
    /// <summary>
    /// Quantity on hand per lot per location. Enables lot-level traceability and FIFO/expiry management.
    /// </summary>
    [Table("InventoryLotBalance")]
    public class InventoryLotBalance
    {
        [Key]
        public int Id { get; set; }

        [Column("LotId")]
        public int LotId { get; set; }

        [Column("LocationId")]
        public int LocationId { get; set; }

        [Column("QuantityOnHand")]
        public decimal QuantityOnHand { get; set; }

        [Column("Tenantid")]
        public int Tenantid { get; set; }

        // Navigation properties
        [ForeignKey("LotId")]
        public InventoryLot? Lot { get; set; }

        [ForeignKey("LocationId")]
        public Location? Location { get; set; }
    }
}
