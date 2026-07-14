using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace CimmpleAPI.Data.Models
{
    [Table("VendorInvoicing")]
    public class VendorInvoicing
    {
        [Key]
        public int ID { get; set; }

        [Column("VendorInvoiceDetailID")]
        public int VendorInvoiceDetailID { get; set; }

        [Column("VendorOrderDetailID")]
        public int VendorOrderDetailID { get; set; }

        [Column("InvoicedQty")]
        public int InvoicedQty { get; set; }

        [Column("InvoicedDate")]
        public DateTime InvoicedDate { get; set; }

        [Column("InvoicedBy")]
        public int InvoicedBy { get; set; }

        [Column("LocationId")]
        public int? LocationId { get; set; }

        [Column("Notes")]
        public string Notes { get; set; } = "";

        [Column("Tenantid")]
        public int Tenantid { get; set; }

        // Navigation properties
        [ForeignKey("VendorInvoiceDetailID")]
        public VendorInvoiceDetail VendorInvoiceDetail { get; set; }

        [ForeignKey("VendorOrderDetailID")]
        public VendorOrderDetail VendorOrderDetail { get; set; }
    }
}
































