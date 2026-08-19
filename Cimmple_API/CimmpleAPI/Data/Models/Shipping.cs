using System;
using System.ComponentModel.DataAnnotations;

namespace CimmpleAPI.Data.Models
{
    public class Shipping
    {
        [Key]
        public int Id { get; set; }
        public string? ShipmentNo { get; set; }
        public int? ShipViaId { get; set; }
        public string? ShipVia { get; set; }
        public string? CourierTrackingNo { get; set; }
        public int? TotalBoxNo { get; set; }
        public string? PackingType { get; set; }
        public string? Terms { get; set; }
        public DateTime ShipmentDate { get; set; }
        public int TenantId { get; set; }
        public int OrderId { get; set; }
        public string? Notes { get; set; }
    }

    public class ShippingDetails
    {
        [Key]
        public int Id { get; set; }
        public int ShippedQty { get; set; }
        public int JobId { get; set; }
        public int ShipmentId { get; set; }
        public int? OrderDetailID { get; set; }
    }
}







