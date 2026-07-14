using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;

namespace CimmpleAPI.Data.Dtos
{
    public class CreateVendorInvoiceFromOrderRequest
    {
        [Required]
        public int VendorOrderId { get; set; }

        [Required]
        public int OrderId { get; set; }

        [Required]
        public int VendorId { get; set; }

        public string VendorCode { get; set; }
        public string VendorName { get; set; }
        public string InvoiceNo { get; set; }

        public DateTime? InvoiceDate { get; set; }
        public DateTime? DueDate { get; set; }

        public string Notes { get; set; }

        public List<VendorInvoiceLineItemDto> LineItems { get; set; } = new List<VendorInvoiceLineItemDto>();
    }

    public class VendorInvoiceLineItemDto
    {
        public int VendorOrderDetailId { get; set; }
        public int OrderDetailId { get; set; }
        public int? AccountId { get; set; }
        public string Description { get; set; }
        public decimal Amount { get; set; }
        public int? Quantity { get; set; }
        public int QtyToInvoice { get; set; }
        public decimal? UnitPrice { get; set; }
        public string VendorPoNumber { get; set; }
        public DateTime? OrderDate { get; set; }
    }
}
