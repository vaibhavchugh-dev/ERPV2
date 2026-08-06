using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace CimmpleAPI.Data.Models
{
    public class InvoiceMaster
    {
        [Key]
        public int Id { get; set; }
        public int TenantId { get; set; }
        public int InvoiceNo { get; set; }
        public string PrefixInvoiceNo { get; set; }
        public DateTime InvoiceDate { get; set; }
        public DateTime DueDate { get; set; }
        public string AccountingPeriod { get; set; }
        public decimal ShippingCharge { get; set; }
        public decimal OtherCharge { get; set; }
        public decimal SaleTax { get; set; }
        public decimal SaleTaxAmount { get; set; }
        public decimal Amount { get; set; }
        public decimal TotalAmount { get; set; }
        /// <summary>Cumulative amount received against this invoice (supports partial payments).</summary>
        public decimal PaidAmount { get; set; }
        public string InternalNotes { get; set; }
        public string CheckNo { get; set; }
        public string PaymentMethod { get; set; }
        public DateTime? PaymentDate { get; set; }
        public int? Bankid { get; set; }
        public int? createdby { get; set; }
        public DateTime? createdDate { get; set; }
    }

    public class InvoiceDetail
    {
        [Key]
        public int Id { get; set; }
        public int InvoiceId { get; set; }
        public int OrderId { get; set; }
        public int? OrderDetailID { get; set; }
        public int? ProductId { get; set; }
        public DateTime OrderDate { get; set; }
        public string Description { get; set; }
        public string CustomerPoNumber { get; set; }
        public decimal Amount { get; set; }
        public decimal price { get; set; }
        public decimal discount { get; set; }
        public int qty { get; set; }
        public int QtyInvoiced { get; set; } = 0;
        public string ReconcileCL { get; set; }
    }

    public class VendorInvoiceMaster
    {
        [Key]
        public int Id { get; set; }
        public int TenantId { get; set; }
        public int locationId { get; set; }
        public string InvoiceNo { get; set; }
        public string PaymentMethod { get; set; }
        public DateTime InvoiceDate { get; set; }
        public DateTime DueDate { get; set; }
        public string VendorCode { get; set; }
        public string VendorName { get; set; }
        public string AccountingPeriod { get; set; }
        public decimal Amount { get; set; }
        public decimal TotalAmount { get; set; }
        /// <summary>Cumulative amount paid against this invoice (supports partial payments).</summary>
        public decimal PaidAmount { get; set; }
        public bool? Approved { get; set; }
        public string CkNo { get; set; }
        public DateTime? CkDate { get; set; }
        public int? PvrNo { get; set; }
        public string Series { get; set; }
        public bool? iscustomer { get; set; }
        public string entrytype { get; set; }
        public int vid { get; set; }
        public string Adj { get; set; }
        public int? isPaid { get; set; }
        public DateTime? Paydate { get; set; }
        public int? Bankid { get; set; }
        public int? createdby { get; set; }
        public int? voidedby { get; set; }
        public DateTime? entrydate { get; set; }
        public DateTime? voideddate { get; set; }
        public string prefixinvoiceno { get; set; }
    }

    public class VendorInvoiceDetail
    {
        [Key]
        public int Id { get; set; }
        public int InvoiceId { get; set; }
        public int? accountid { get; set; }
        public int? vdetailid { get; set; }
        public int OrderId { get; set; }
        public int? VendorOrderDetailID { get; set; }
        public int? splitLocationid { get; set; }
        public DateTime? OrderDate { get; set; }
        public string Description { get; set; }
        public string VendorPoNumber { get; set; }
        public decimal Amount { get; set; }
        public string ReconcileCL { get; set; }
        public int? adjustmentId { get; set; }
        public int? banksyncId { get; set; }
        public int? qty { get; set; }
        public decimal? price { get; set; }
        public int? qtyordered { get; set; }

        // Navigation property
        public ICollection<VendorInvoicing> VendorInvoicings { get; set; }
    }

    public class Payment
    {
        [Key]
        public int Id { get; set; }
        public string series { get; set; }
        public int ckno { get; set; }
        public DateTime ckdate { get; set; }
        public string memo { get; set; }
        public int tenantid { get; set; }
        public int vid { get; set; }
        public string isPrint { get; set; }
        public int createdby { get; set; }
        public int bankid { get; set; }
        public DateTime createdate { get; set; }
        public int Uniqueno { get; set; }
    }
}







