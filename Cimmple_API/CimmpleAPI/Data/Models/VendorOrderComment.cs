using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace CimmpleAPI.Data.Models
{
    [Table("VendorOrderComments")]
    public class VendorOrderComment
    {
        [Key]
        public int Id { get; set; }
        public int OrderID { get; set; }
        public string Text { get; set; } = "";
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public string CreatedBy { get; set; } = "";

        // Navigation property
        [ForeignKey("OrderID")]
        public VendorOrder VendorOrder { get; set; }
    }
}

































