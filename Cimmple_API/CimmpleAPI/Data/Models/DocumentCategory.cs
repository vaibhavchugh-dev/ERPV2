using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace CimmpleAPI.Data.Models
{
    [Table("DocumentCategories")]
    public class DocumentCategory
    {
        [Key]
        public int Id { get; set; }
        
        [Required]
        [MaxLength(200)]
        public string CategoryName { get; set; }
        
        public string? Description { get; set; }
        
        [Required]
        public int TenantId { get; set; }
        
        [Required]
        public int CreatedBy { get; set; }
        
        [Required]
        public DateTime CreatedDate { get; set; } = DateTime.UtcNow;
        
        [Required]
        public bool IsActive { get; set; } = true;

        public ICollection<Document> Documents { get; set; } = new List<Document>();
    }
}
















