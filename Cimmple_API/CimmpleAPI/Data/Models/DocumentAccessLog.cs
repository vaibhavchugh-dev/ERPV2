using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace CimmpleAPI.Data.Models
{
    [Table("DocumentAccessLog")]
    public class DocumentAccessLog
    {
        [Key]
        public int Id { get; set; }
        
        [Required]
        public int DocumentId { get; set; }
        
        public int? VersionId { get; set; } // NULL for simple files
        
        [Required]
        public int UserId { get; set; }
        
        [Required]
        [MaxLength(50)]
        public string Action { get; set; } // "View", "Download", "Upload", "Delete", "Update"
        
        [Required]
        public DateTime ActionDate { get; set; } = DateTime.UtcNow;
        
        [MaxLength(50)]
        public string? IPAddress { get; set; }
        
        [MaxLength(500)]
        public string? UserAgent { get; set; }
        
        [Required]
        public int TenantId { get; set; }

        [ForeignKey("DocumentId")]
        public Document Document { get; set; }
        
        [ForeignKey("VersionId")]
        public DocumentVersion? Version { get; set; }
    }
}
















