using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace CimmpleAPI.Data.Models
{
    /// <summary>
    /// Lookup for inventory transaction types (Receipt, Issue, Transfer, Adjustment, etc.).
    /// </summary>
    [Table("InventoryTransactionType")]
    public class InventoryTransactionType
    {
        [Key]
        public int Id { get; set; }

        [Column("Code")]
        public string Code { get; set; } = "";

        [Column("Name")]
        public string Name { get; set; } = "";

        [Column("IsPositive")]
        public bool IsPositive { get; set; }  // true = adds to stock, false = subtracts
    }
}
