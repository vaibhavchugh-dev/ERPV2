using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace CimmpleAPI.Data.Models
{
    /// <summary>
    /// Durable outbound email queue. HTTP paths enqueue; a hosted worker sends via SMTP.
    /// </summary>
    [Table("EmailOutbox")]
    public class EmailOutbox
    {
        public const string StatusPending = "Pending";
        public const string StatusProcessing = "Processing";
        public const string StatusSent = "Sent";
        public const string StatusFailed = "Failed";

        [Key]
        public int Id { get; set; }

        public int TenantId { get; set; }

        [MaxLength(32)]
        public string Status { get; set; } = StatusPending;

        [MaxLength(1000)]
        public string ToAddresses { get; set; } = "";

        [MaxLength(1000)]
        public string? CcAddresses { get; set; }

        [MaxLength(300)]
        public string Subject { get; set; } = "";

        public string Body { get; set; } = "";

        public bool IsHtml { get; set; }

        /// <summary>JSON array of { fileName, contentType, contentBase64 }.</summary>
        public string? AttachmentsJson { get; set; }

        public bool SkipNotificationGate { get; set; }

        /// <summary>When set, worker marks the related in-app notification EmailSent on success.</summary>
        public int? RelatedNotificationId { get; set; }

        public int Attempts { get; set; }

        public int MaxAttempts { get; set; } = 5;

        [MaxLength(2000)]
        public string? LastError { get; set; }

        public DateTime CreatedUtc { get; set; } = DateTime.UtcNow;

        public DateTime? ProcessedUtc { get; set; }

        public DateTime? LockedUntilUtc { get; set; }

        [MaxLength(128)]
        public string? LockedBy { get; set; }
    }
}
