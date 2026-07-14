using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace CimmpleAPI.Data.Models
{
    [Table("VendorReceiving")]
    public class VendorReceiving
    {
        [Key]
        public int ID { get; set; }

        [Column("VendorOrderDetailID")]
        public int VendorOrderDetailID { get; set; }

        [Column("ReceivedQty")]
        public int ReceivedQty { get; set; }

        [Column("ReceivedDate")]
        public DateTime ReceivedDate { get; set; }

        [Column("ReceivedBy")]
        public int ReceivedBy { get; set; }

        [Column("LocationId")]
        public int? LocationId { get; set; }

        [Column("Notes")]
        public string Notes { get; set; } = "";

        [Column("Tenantid")]
        public int Tenantid { get; set; }

        // Navigation property
        [ForeignKey("VendorOrderDetailID")]
        public VendorOrderDetail VendorOrderDetail { get; set; }
    }
}
































