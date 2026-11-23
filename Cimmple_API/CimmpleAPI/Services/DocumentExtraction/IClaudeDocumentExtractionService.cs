using System.Threading;
using System.Threading.Tasks;
using CimmpleAPI.Data.Dtos;

namespace CimmpleAPI.Services.DocumentExtraction
{
    /// <summary>Direct Claude Haiku extraction (used as fallback / primary when configured).</summary>
    public interface IClaudeDocumentExtractionService
    {
        Task<VendorQuotationExtractionDto> ExtractDocumentFromPdfAsync(
            byte[] pdfBytes,
            string documentKind,
            string? fileName = null,
            CancellationToken cancellationToken = default);

        /// <summary>Backward-compatible alias for vendor quotation.</summary>
        Task<VendorQuotationExtractionDto> ExtractVendorQuotationFromPdfAsync(
            byte[] pdfBytes,
            string? fileName = null,
            CancellationToken cancellationToken = default);
    }
}
