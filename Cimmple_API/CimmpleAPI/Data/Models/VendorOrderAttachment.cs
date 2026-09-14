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
        /// <summary>Legacy / display; mirrors UploadFile blob name when set.</summary>
        public string FileUrl { get; set; } = "";
        public int FileUniqueno { get; set; }
        /// <summary>Azure blob name under data/{tenantId}/VendorOrders/.</summary>
        public string UploadFile { get; set; } = "";
        public int TenantID { get; set; }
        public int createdby { get; set; }
        public DateTime CreatedDate { get; set; } = DateTime.UtcNow;

        [ForeignKey("OrderID")]
        public VendorOrder VendorOrder { get; set; }
    }
}
