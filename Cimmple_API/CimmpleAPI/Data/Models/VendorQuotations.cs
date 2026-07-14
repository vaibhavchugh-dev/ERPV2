using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace CimmpleAPI.Data.Models
{
    public class VendorQuotations
    {
        [Key]
        public int OrderID { get; set; }

        public DateTime? DueDate { get; set; }

        public DateTime? OrderDate { get; set; }

        public bool? POInitiated { get; set; }

        public int PONumber { get; set; }

        public string Status { get; set; }

        public int Tenantid { get; set; }

        [Column(TypeName = "decimal(18,2)")]
        public decimal TotalAmount { get; set; }

        public int UserId { get; set; }

        public int UserToken { get; set; }

        public int VendorID { get; set; }

        public string VendorName { get; set; }

        public string VendorOrderType { get; set; }

        public string VendorPoNumber { get; set; }

        public string address { get; set; }

        public string contactName { get; set; }

        public int? convertedOrderId { get; set; }

        public bool isSent { get; set; }

        public int? isconverted { get; set; }

        public int? locationid { get; set; }

        public DateTime? sentDate { get; set; }

        public string ship_via { get; set; }

        public string shippingInstructions { get; set; }

        public string vendorcode { get; set; }

        public int? ParentQuotationID { get; set; }

        public string AdditionalNotes { get; set; }

        public string AttachmentsJson { get; set; }

        public string CommentsJson { get; set; }

        public bool? IsResponseOnly { get; set; }

        // Navigation properties
        public virtual ICollection<VendorQuotationsDetails> VendorQuotationsDetails { get; set; }
    }
}
