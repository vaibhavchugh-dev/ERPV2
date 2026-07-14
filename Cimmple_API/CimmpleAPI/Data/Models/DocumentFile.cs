using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace CimmpleAPI.Data.Models
{
    [Table("DocumentFiles")]
    public class DocumentFile
    {
        [Key]
        public int Id { get; set; }
        
        [Required]
        public int DocumentId { get; set; }
        
        [Required]
        [MaxLength(500)]
        public string FileName { get; set; }
        
        [Required]
        [MaxLength(1000)]
        public string FilePath { get; set; }
        
        [Required]
        public long FileSize { get; set; }
        
        [MaxLength(64)]
        public string? FileHash { get; set; } // SHA-256 hash
        
        [MaxLength(100)]
        public string? MimeType { get; set; }
        
        [Required]
        public int UploadedBy { get; set; }
        
        [Required]
        public DateTime UploadedDate { get; set; } = DateTime.UtcNow;
        
        [Required]
        public int TenantId { get; set; }

        [ForeignKey("DocumentId")]
        public Document Document { get; set; }
    }
}
















