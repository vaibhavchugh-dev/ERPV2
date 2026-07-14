using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace CimmpleAPI.Data.Models
{
    [Table("DocumentVersions")]
    public class DocumentVersion
    {
        [Key]
        public int Id { get; set; }
        
        [Required]
        public int DocumentId { get; set; }
        
        [Required]
        public int VersionNumber { get; set; }
        
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
        
        public string? VersionNotes { get; set; }
        
        [Required]
        public bool IsCurrentVersion { get; set; } = false;
        
        [Required]
        public int TenantId { get; set; }

        [ForeignKey("DocumentId")]
        public Document Document { get; set; }
    }
}
















