using System;
using System.ComponentModel.DataAnnotations;

namespace CimmpleAPI.Data.Models
{
    public class JobOrderMaster
    {
        [Key]
        public int JobOrderID { get; set; }
        public int JobOrderNumber { get; set; }
        public int CustomerOrderID { get; set; }
        public int CustomerOrderDetailID { get; set; }
        public int CustomerID { get; set; }
        public string? CustomerName { get; set; }
        public string? CustomerCode { get; set; }
        public string? JobNumber { get; set; }
        public string? JobDesc { get; set; }
        public string? PartNo { get; set; }
        public string? PartName { get; set; }
        public int QtyOrdered { get; set; }
        public string? Unit { get; set; }
        public decimal UnitPrice { get; set; }
        public DateTime DueDate { get; set; }
        public int JobPriority { get; set; }
        public string? Status { get; set; }
        public int Tenantid { get; set; }
        public int UserId { get; set; }
        public int UserToken { get; set; }
        public DateTime OrderDate { get; set; }
        public string? AttachmentsJson { get; set; }
        public string? CommentsJson { get; set; }
        public string? RoutingStepsJson { get; set; }
        public string? DrawingNumber { get; set; }
        public string? DrawingRevision { get; set; }
        public int? JobTemplateId { get; set; }
        // Code and revision are snapshotted so the traveller still shows where a router
        // came from after the template is renamed, revised or deleted.
        [MaxLength(50)]
        public string? JobTemplateCode { get; set; }
        public int? JobTemplateRevision { get; set; }
        public bool EnableJobTracking { get; set; }
        public DateTime CreatedDate { get; set; }
        public DateTime? ModifiedDate { get; set; }
    }
}

