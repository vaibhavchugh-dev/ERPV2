using System.Collections.Generic;

namespace CimmpleAPI.Data.Dtos
{
    public class ClaudeSettings
    {
        public const string SectionName = "Claude";

        public string ApiKey { get; set; } = string.Empty;
        public string Model { get; set; } = "claude-haiku-4-5";
        public int MaxTokens { get; set; } = 8192;
    }

    public class DocumentExtractionSettings
    {
        public const string SectionName = "DocumentExtraction";

        /// <summary>
        /// Preferred provider: "CimmpleApi" (hosted extraction) or "Claude".
        /// When CimmpleApi fails and FallbackToClaude is true, Claude Haiku is used.
        /// </summary>
        public string Provider { get; set; } = "CimmpleApi";

        /// <summary>When true and Claude:Model is empty, fall back to claude-haiku-4-5.</summary>
        public bool AllowAutoSwitch { get; set; } = false;

        /// <summary>If the primary Cimmple extraction API fails, fall back to Claude Haiku.</summary>
        public bool FallbackToClaude { get; set; } = true;

        public CimmpleExtractionApiSettings CimmpleApi { get; set; } = new();
    }

    /// <summary>Result of calling the hosted Cimmple extraction API (success or failure detail).</summary>
    public class CimmpleExtractionAttempt
    {
        public VendorQuotationExtractionDto? Result { get; set; }
        public bool Succeeded => Result != null;
        public int? StatusCode { get; set; }
        public string? Error { get; set; }
    }

    public class CimmpleExtractionApiSettings
    {
        public bool Enabled { get; set; } = true;
        public string BaseUrl { get; set; } = "https://api.extraction.cimmple.net";
        public string ExtractPath { get; set; } = "/api/documents/extract";
        /// <summary>Sent as X-Api-Key header (ExtractionApiKey on the host).</summary>
        public string ApiKey { get; set; } = string.Empty;
        public int TimeoutSeconds { get; set; } = 120;
    }

    /// <summary>Extraction result plus which provider produced it.</summary>
    public class DocumentExtractionOutcome
    {
        public VendorQuotationExtractionDto Result { get; set; } = new();
        /// <summary>"CimmpleApi" or "Claude".</summary>
        public string Provider { get; set; } = "CimmpleApi";
        public string? Message { get; set; }
    }

    /// <summary>
    /// Structured Vendor Quotation / drawing / RFQ extraction result.
    /// Schema mirrors the WorkFlowAPI Claude Haiku vendor-quotation prompt.
    /// </summary>
    public class VendorQuotationExtractionDto
    {
        public string? DocumentType { get; set; }

        public string? DrawingNumber { get; set; }
        public string? DrawingTitle { get; set; }
        public string? Revision { get; set; }
        public string? RevisionDate { get; set; }
        public string? SheetNumber { get; set; }
        public string? TotalSheets { get; set; }
        public string? DrawingDate { get; set; }
        public string? ProjectName { get; set; }
        public string? ClientName { get; set; }
        public string? CompanyName { get; set; }
        public string? DrawnBy { get; set; }
        public string? CheckedBy { get; set; }
        public string? ApprovedBy { get; set; }
        public string? Scale { get; set; }
        public string? Units { get; set; }
        public string? Material { get; set; }

        public string? QuotationNumber { get; set; }
        public string? QuotationDate { get; set; }
        public string? DueDate { get; set; }

        public List<string> VendorNames { get; set; } = new();

        public string? VendorContactName { get; set; }
        public string? VendorPhone { get; set; }
        public string? VendorEmail { get; set; }

        public List<VendorQuotationExtractionDetailDto> Details { get; set; } = new();
    }

    public class VendorQuotationExtractionDetailDto
    {
        public string? ItemName { get; set; }
        public string? ItemDescription { get; set; }
        public decimal? Quantity { get; set; }
        public string? Unit { get; set; }
        public decimal? UnitPrice { get; set; }
        public decimal? Amount { get; set; }
        public decimal? Discount { get; set; }
        /// <summary>"Amount" or "Percent".</summary>
        public string? DiscountType { get; set; }
        public string? Notes { get; set; }

        public List<VendorQuotationExtractionPartDto> Parts { get; set; } = new();
    }

    public class VendorQuotationExtractionPartDto
    {
        public string? PartNo { get; set; }
        public string? JobNo { get; set; }
        public string? PartName { get; set; }
        public string? Description { get; set; }
        public string? Material { get; set; }
        public decimal? Quantity { get; set; }
        public string? Unit { get; set; }
        public string? Remarks { get; set; }
    }
}
