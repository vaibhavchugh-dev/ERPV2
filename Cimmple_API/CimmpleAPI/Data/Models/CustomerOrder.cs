using System;
using System.ComponentModel.DataAnnotations;

namespace CimmpleAPI.Data.Models
{
    public class CustomerOrder
    {
        [Key]
        public int OrderID { get; set; }
        public int CustomerID { get; set; }
        public string customercode { get; set; }
        public int PONumber { get; set; }
        public string CustomerName { get; set; }
        public string address { get; set; }
        public string CustomerPoNumber { get; set; }
        public DateTime OrderDate { get; set; }
        public decimal TotalAmount { get; set; }
        public int UserId { get; set; }
        public int UserToken { get; set; }
        public string Status { get; set; }
        public int locationId { get; set; }
        public int Tenantid { get; set; }
        public int? quotationId { get; set; }
        public string shippingInstructions { get; set; }
        public string ExternalCustomerPO { get; set; }
        public string QuotationNo { get; set; }
        public DateTime? ExternalOrderDate { get; set; }
        public string BuyerName { get; set; }
        public string? AttachmentsJson { get; set; } // JSON string to store attachments
        public string? CommentsJson { get; set; } // JSON string to store comments
    }

    public class CustomerOrderDetails
    {
        [Key]
        public int ID { get; set; }
        public int OrderID { get; set; }
        public int ItemNo { get; set; }
        public string partname { get; set; }
        public string PartNo { get; set; }
        public DateTime DueDate { get; set; }
        public string JobNumber { get; set; }
        public string JobDesc { get; set; }
        public int QtyOrdered { get; set; }
        public string Unit { get; set; }
        public decimal UnitPrice { get; set; }
        public int JobPriority { get; set; }
        public decimal Discount { get; set; }
        /// <summary>Percent (default) or Amount ($).</summary>
        public string? DiscountType { get; set; }
        public int Tenantid { get; set; }
        public int? productid { get; set; }
        public string leadTime { get; set; }
        public string notes { get; set; }
        public int ShippedQty { get; set; } = 0;
        public string ShippingStatus { get; set; } = "Not Started";
        public int InvoicedQty { get; set; } = 0;
        public string InvoiceStatus { get; set; } = "Not Invoiced";
    }

    public class OrderAttachment
    {
        [Key]
        public int Id { get; set; }
        public int orderid { get; set; }
        public string Name { get; set; }
        public int size { get; set; }
        public int FileUniqueno { get; set; }
        public string UploadFile { get; set; }
        public int TenantID { get; set; }
        public string FileCode { get; set; }
        public string Pageno { get; set; }
        public int createdby { get; set; }
    }

    public class QuotationOrder
    {
        [Key]
        public int OrderID { get; set; }
        public int CustomerID { get; set; }
        public string customercode { get; set; }
        public int PONumber { get; set; }
        public string CustomerName { get; set; }
        public string address { get; set; }
        public string CustomerPoNumber { get; set; }
        public DateTime OrderDate { get; set; }
        public decimal TotalAmount { get; set; }
        public int UserId { get; set; }
        public int UserToken { get; set; }
        public string Status { get; set; }
        public int Tenantid { get; set; }
        public string shippingInstructions { get; set; }
        public string ExternalCustomerPO { get; set; }
        public DateTime? ExternalOrderDate { get; set; }
        public string BuyerName { get; set; }
        public string CustomerRefNo { get; set; }
        public int? isConverted { get; set; }
        public int? convertedOrderId { get; set; } // Order ID that was created from this quotation
        public int? Locationid { get; set; }
        public string? AttachmentsJson { get; set; } // JSON string to store attachments
        public string? CommentsJson { get; set; } // JSON string to store comments
    }

    public class QuotationOrderDetails
    {
        [Key]
        public int ID { get; set; }
        public int OrderID { get; set; }
        public int ItemNo { get; set; }
        public string partname { get; set; }
        public string PartNo { get; set; }
        public DateTime DueDate { get; set; }
        public string JobNumber { get; set; }
        public string JobDesc { get; set; }
        public int QtyOrdered { get; set; }
        public string Unit { get; set; }
        public decimal UnitPrice { get; set; }
        public int JobPriority { get; set; }
        public decimal Discount { get; set; }
        /// <summary>Percent (default) or Amount ($).</summary>
        public string? DiscountType { get; set; }
        public int Tenantid { get; set; }
        public int? productid { get; set; }
        public string leadTime { get; set; }
        public int? isConverted { get; set; }
        public int? convertedorderid { get; set; }
        public string notes { get; set; }
        public string? QuantityTiers { get; set; } // JSON string to store quantity-based pricing tiers (nullable)
    }

    public class QuotationOrderAttachment
    {
        [Key]
        public int Id { get; set; }
        public int orderid { get; set; }
        public string Name { get; set; }
        public int size { get; set; }
        public int FileUniqueno { get; set; }
        public string UploadFile { get; set; }
        public int TenantID { get; set; }
        public string FileCode { get; set; }
        public string Pageno { get; set; }
        public int createdby { get; set; }
    }
}







