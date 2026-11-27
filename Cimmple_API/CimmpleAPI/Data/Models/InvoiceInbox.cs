using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace CimmpleAPI.Data.Models
{
    /// <summary>
    /// One vendor-invoice candidate received through a location's inbound email address.
    /// One row per PDF attachment (an email with no usable attachment still produces one
    /// <see cref="StatusNoAttachment"/> row so the user can see it).
    /// </summary>
    [Table("InvoiceInboxItem")]
    public class InvoiceInboxItem
    {
        public const string StatusNew = "New";
        public const string StatusExtracting = "Extracting";
        public const string StatusExtracted = "Extracted";
        public const string StatusFailed = "Failed";
        public const string StatusNoAttachment = "NoAttachment";
        public const string StatusConverted = "Converted";
        public const string StatusDiscarded = "Discarded";

        public const string SourceEmail = "Email";

        public const string DocTypeVendorInvoice = "vendorInvoice";
        public const string DocTypeVendorOrder = "vendorOrder";
        public const string DocTypeVendorQuotation = "vendorQuotation";
        public const string DocTypeCustomerOrder = "customerOrder";
        public const string DocTypeCustomerQuotation = "customerQuotation";
        public const string DocTypeCustomerInvoice = "customerInvoice";

        [Key]
        public int Id { get; set; }

        public int TenantId { get; set; }

        public int LocationId { get; set; }

        [MaxLength(40)]
        public string DocumentType { get; set; } = DocTypeVendorInvoice;

        [MaxLength(20)]
        public string Source { get; set; } = SourceEmail;

        [MaxLength(300)]
        public string? FromName { get; set; }

        [MaxLength(320)]
        public string? FromEmail { get; set; }

        [MaxLength(500)]
        public string? Subject { get; set; }

        public string? BodyText { get; set; }

        public string? BodyHtml { get; set; }

        /// <summary>RFC Message-Id of the email (dedupes provider retries).</summary>
        [MaxLength(300)]
        public string MessageId { get; set; } = "";

        /// <summary>0-based position of the attachment within the email.</summary>
        public int AttachmentIndex { get; set; }

        [MaxLength(500)]
        public string? FileName { get; set; }

        [MaxLength(100)]
        public string? ContentType { get; set; }

        public long FileSize { get; set; }

        /// <summary>Blob name under data/{tenantId}/InvoiceInbox/.</summary>
        [MaxLength(300)]
        public string? BlobName { get; set; }

        [MaxLength(32)]
        public string Status { get; set; } = StatusNew;

        /// <summary>Serialized <c>VendorQuotationExtractionDto</c> (camelCase) from the extraction service.</summary>
        public string? ExtractionJson { get; set; }

        [MaxLength(50)]
        public string? ExtractionProvider { get; set; }

        [MaxLength(300)]
        public string? ExtractedVendorName { get; set; }

        [MaxLength(100)]
        public string? ExtractedInvoiceNo { get; set; }

        public decimal? ExtractedTotal { get; set; }

        [MaxLength(2000)]
        public string? FailureReason { get; set; }

        public int Attempts { get; set; }

        public DateTime ReceivedUtc { get; set; } = DateTime.UtcNow;

        public DateTime? ProcessedUtc { get; set; }

        /// <summary>Extraction claim expiry so a crashed worker's rows are retried.</summary>
        public DateTime? LockedUntilUtc { get; set; }

        /// <summary>Vendor invoice created from this item (when DocumentType is vendorInvoice).</summary>
        public int? VendorInvoiceId { get; set; }

        /// <summary>Created record id for any document type (VQ, VO, VI, CQ, CO, CI).</summary>
        public int? ConvertedRecordId { get; set; }

        public int? ConvertedBy { get; set; }

        public DateTime? ConvertedUtc { get; set; }
    }
}
