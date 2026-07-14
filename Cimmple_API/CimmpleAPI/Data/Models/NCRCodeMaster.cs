using System;
using System.ComponentModel.DataAnnotations;

namespace CimmpleAPI.Data.Models
{
    public class NCRCodeMaster
    {
        [Key]
        public int Id { get; set; }
        public string? NCRCode { get; set; }
        public string? Description { get; set; }
        public int CreatedBy { get; set; }
        public int TenantId { get; set; }
        public DateTime CreatedDate { get; set; }
    }
}







