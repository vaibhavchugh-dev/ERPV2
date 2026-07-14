using System;
using System.ComponentModel.DataAnnotations;

namespace CimmpleAPI.Data.Models
{
    public class DocumentMaster
    {
        [Key]
        public int Id { get; set; }
        public string DocumentName { get; set; }
        public string DocumentType { get; set; }
        public int TenantId { get; set; }
        public int CreatedBy { get; set; }
        public DateTime CreatedDate { get; set; }
    }

    public class DocumentType
    {
        [Key]
        public int Id { get; set; }
        public string TypeName { get; set; }
        public int TenantId { get; set; }
    }
}







