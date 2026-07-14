using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace CimmpleAPI.Data.Models
{
    [Table("VendorOrders")]
    public class VendorOrder
    {
        [Key]
        public int OrderID { get; set; }
        public int Tenantid { get; set; }
        public int VendorID { get; set; }
        public string VendorCode { get; set; } = "";
        public int PONumber { get; set; }
        public string VendorName { get; set; } = "";
        public string Address { get; set; } = "";
        public string VendorPoNumber { get; set; } = "";
        public DateTime OrderDate { get; set; }
        public decimal TotalAmount { get; set; } = 0;
        public int UserId { get; set; }
        public int UserToken { get; set; }
        public string Status { get; set; } = "Draft";
        public string ShippingInstructions { get; set; } = "";
        public string ExternalVendorPO { get; set; } = "";
        public DateTime? ExternalOrderDate { get; set; }
        public string BuyerName { get; set; } = "";
        public string VendorRefNo { get; set; } = "";
        public string OrderType { get; set; } = "Vendor";
        public string MaterialType { get; set; } = "Material";
        public int? LocationId { get; set; }
        public int? convertedOrderId { get; set; }
        public int? ParentQuotationID { get; set; }
        public int? QuotationId { get; set; }
        public string QuotationNo { get; set; } = "";
        public string AdditionalNotes { get; set; } = "";

        // Navigation properties
        public ICollection<VendorOrderDetail> VendorOrderDetails { get; set; }
        public ICollection<VendorOrderAttachment> VendorOrderAttachments { get; set; }
        public ICollection<VendorOrderComment> VendorOrderComments { get; set; }
    }
}