using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace CimmpleAPI.Data.Models
{
    public class VendorQuotationsDetails
    {
        [Key]
        public int ID { get; set; }

        [Column(TypeName = "decimal(18,2)")]
        public decimal Discount { get; set; }

        public DateTime? DueDate { get; set; }

        public int? Groupid { get; set; }

        public bool? IsAdditionItem { get; set; }

        public int ItemNo { get; set; }

        public string JobDesc { get; set; }

        public int JobId { get; set; }

        public string JobNumber { get; set; }

        public int JobPriority { get; set; }

        public int OrderID { get; set; }

        public int QtyOrdered { get; set; }

        public string Received { get; set; }

        public int? ReceivedQty { get; set; }

        public int Tenantid { get; set; }

        public string Unit { get; set; }

        [Column(TypeName = "decimal(18,2)")]
        public decimal UnitPrice { get; set; }

        public string glcode { get; set; }

        public string itemname { get; set; }

        public int? jobdetailId { get; set; }

        public int? productid { get; set; }

        public string notes { get; set; }

        public string PartNo { get; set; }

        public string AttachmentsJson { get; set; }

        // Navigation property
        public virtual VendorQuotations VendorQuotation { get; set; }
    }
}
