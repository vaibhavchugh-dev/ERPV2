using System;
using System.Collections.Generic;

namespace CimmpleAPI.Data.Dtos
{
    // DTOs for Vendor Invoice operations
    public class CreateVendorInvoiceRequest
    {
        public int VendorId { get; set; }
        public string VendorCode { get; set; }
        public string VendorName { get; set; }
        public int? LocationId { get; set; }
        public DateTime? InvoiceDate { get; set; }
        public DateTime? DueDate { get; set; }
        public string Notes { get; set; }
        public List<VendorInvoiceLineItem> LineItems { get; set; } = new List<VendorInvoiceLineItem>();
    }

    public class UpdateVendorInvoiceRequest
    {
        public DateTime? InvoiceDate { get; set; }
        public DateTime? DueDate { get; set; }
        public int? LocationId { get; set; }
        public string Notes { get; set; }
        public List<VendorInvoiceLineItem> LineItems { get; set; }
    }

    public class VendorInvoiceLineItem
    {
        public int VendorOrderId { get; set; }
        public int? VendorOrderDetailId { get; set; }
        public int? AccountId { get; set; }
        public string Description { get; set; }
        public decimal Amount { get; set; }
        public int? Quantity { get; set; }
        public decimal? UnitPrice { get; set; }
        public string VendorPoNumber { get; set; }
        public DateTime? OrderDate { get; set; }
    }

    public class RecordVendorPaymentRequest
    {
        public string PaymentMethod { get; set; }
        public DateTime? PaymentDate { get; set; }
        public string CheckNo { get; set; }
        public DateTime? CheckDate { get; set; }
        public int? PvrNo { get; set; }
        public string Series { get; set; }
        public int? BankId { get; set; }
        public decimal? PaymentAmount { get; set; }
    }

    // Legacy DTOs for backward compatibility with OrderController
    public class CreateVendorInvoiceFromOrderRequest
    {
        public int OrderId { get; set; }
        public List<VendorInvoiceFromOrderLineItem> LineItems { get; set; } = new List<VendorInvoiceFromOrderLineItem>();
        public string InvoiceNo { get; set; }
        public DateTime? InvoiceDate { get; set; }
        public DateTime? DueDate { get; set; }
        public string PaymentMethod { get; set; }
        public string Notes { get; set; }
    }

    public class VendorInvoiceFromOrderLineItem
    {
        public int OrderDetailId { get; set; }
        public int QtyToInvoice { get; set; }
        public decimal UnitPrice { get; set; }
        public decimal Discount { get; set; }
    }
}
