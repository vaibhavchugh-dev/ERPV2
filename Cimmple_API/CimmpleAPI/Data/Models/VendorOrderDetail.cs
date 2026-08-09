using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace CimmpleAPI.Data.Models
{
    [Table("VendorOrderDetails")]
    public class VendorOrderDetail
    {
        [Key]
        public int ID { get; set; }
        
        public int OrderID { get; set; }
        
        [Column("JobId")]
        public int JobId { get; set; }
        
        public int ItemNo { get; set; }
        
        // Map PartName to itemname (required database column)
        [Column("itemname")]
        public string PartName { get; set; } = "";
        
        [Column("PartNo")]
        public string PartNo { get; set; } = "";
        
        // Map to DueDateString column (string-based date storage)
        [Column("DueDateString")]
        public string DueDate { get; set; } = "";
        
        // Required database column - DueDate as DateTime
        [Column("DueDate")]
        public DateTime DueDateDateTime { get; set; }
        
        [Column("JobNumber")]
        public string JobNumber { get; set; } = "";
        
        [Column("JobDesc")]
        public string JobDesc { get; set; } = "";
        
        [Column("QtyOrdered")]
        public int QtyOrdered { get; set; } = 0;
        
        [Column("Unit")]
        public string Unit { get; set; } = "";
        
        [Column("UnitPrice")]
        public decimal UnitPrice { get; set; } = 0;
        
        [Column("JobPriority")]
        public int JobPriority { get; set; } = 0;
        
        [Column("Discount")]
        public decimal Discount { get; set; } = 0;

        /// <summary>Percent (default) or Amount ($).</summary>
        [Column("DiscountType")]
        public string? DiscountType { get; set; }

        // Map to existing productid column (case-insensitive in SQL Server, but explicit is better)
        [Column("productid")]
        public int? ProductId { get; set; }
        
        [Column("LeadTime")]
        public string LeadTime { get; set; } = "";
        
        [Column("Notes")]
        public string Notes { get; set; } = "";
        
        [Column("ShippedQty")]
        public int ShippedQty { get; set; } = 0;
        
        [Column("ShippingStatus")]
        public string ShippingStatus { get; set; } = "";
        
        [Column("InvoicedQty")]
        public int InvoicedQty { get; set; } = 0;
        
        [Column("InvoiceStatus")]
        public string InvoiceStatus { get; set; } = "";
        
        // Required database columns that must be set
        [Column("Tenantid")]
        public int Tenantid { get; set; }
        
        [Column("glcode")]
        public string glcode { get; set; } = "";
        
        [Column("Received")]
        public string Received { get; set; } = "";

        [Column("ReceivedQty")]
        public int? ReceivedQty { get; set; }

        /// <summary>
        /// Line-level category: RawMaterial, FinishedProduct, Tool, Service, Subcontract, Other.
        /// </summary>
        [Column("LineType")]
        [MaxLength(50)]
        public string? LineType { get; set; }

        // Navigation property
        [ForeignKey("OrderID")]
        public VendorOrder VendorOrder { get; set; }

        // Navigation property for receiving transactions
        public ICollection<VendorReceiving> VendorReceivings { get; set; }

        // Navigation property for invoicing transactions
        public ICollection<VendorInvoicing> VendorInvoicings { get; set; }
    }
}
