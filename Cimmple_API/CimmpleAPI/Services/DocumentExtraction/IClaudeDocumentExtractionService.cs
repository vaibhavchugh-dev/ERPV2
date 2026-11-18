using System.Threading;
using System.Threading.Tasks;
using CimmpleAPI.Data.Dtos;

namespace CimmpleAPI.Services.DocumentExtraction
{
    /// <summary>Direct Claude Haiku extraction (used as fallback).</summary>
    public interface IClaudeDocumentExtractionService
    {
        Task<VendorQuotationExtractionDto> ExtractVendorQuotationFromPdfAsync(
            byte[] pdfBytes,
            string? fileName = null,
            CancellationToken cancellationToken = default);
    }
}
