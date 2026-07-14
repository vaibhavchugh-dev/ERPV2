using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace CimmpleAPI.Data.Models
{
    [Table("VendorOrderAttachments")]
    public class VendorOrderAttachment
    {
        [Key]
        public int Id { get; set; }
        public int OrderID { get; set; }
        public string Name { get; set; } = "";
        public long Size { get; set; } = 0;
        public string FileUrl { get; set; } = "";
        public DateTime CreatedDate { get; set; } = DateTime.UtcNow;

        // Navigation property
        [ForeignKey("OrderID")]
        public VendorOrder VendorOrder { get; set; }
    }
}

































