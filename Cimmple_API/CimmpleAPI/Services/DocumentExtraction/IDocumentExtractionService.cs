using System.Threading;
using System.Threading.Tasks;
using CimmpleAPI.Data.Dtos;

namespace CimmpleAPI.Services.DocumentExtraction
{
    public interface IDocumentExtractionService
    {
        /// <summary>
        /// Extract structured document data from a PDF for the given kind
        /// (vendorQuotation, vendorOrder, customerQuotation, customerOrder).
        /// Primary: hosted Cimmple extraction API; fallback: Claude Haiku with kind-specific prompt.
        /// </summary>
        Task<DocumentExtractionOutcome> ExtractDocumentFromPdfAsync(
            byte[] pdfBytes,
            string documentKind,
            string? fileName = null,
            CancellationToken cancellationToken = default);

        /// <summary>Backward-compatible alias for vendor quotation extraction.</summary>
        Task<DocumentExtractionOutcome> ExtractVendorQuotationFromPdfAsync(
            byte[] pdfBytes,
            string? fileName = null,
            CancellationToken cancellationToken = default);
    }
}
