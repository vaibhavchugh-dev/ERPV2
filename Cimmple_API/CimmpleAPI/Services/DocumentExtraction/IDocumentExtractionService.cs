using System.Threading;
using System.Threading.Tasks;
using CimmpleAPI.Data.Dtos;

namespace CimmpleAPI.Services.DocumentExtraction
{
    public interface IDocumentExtractionService
    {
        /// <summary>
        /// Extract structured Vendor Quotation data from a PDF.
        /// Primary: hosted Cimmple extraction API; fallback: Claude Haiku.
        /// </summary>
        Task<DocumentExtractionOutcome> ExtractVendorQuotationFromPdfAsync(
            byte[] pdfBytes,
            string? fileName = null,
            CancellationToken cancellationToken = default);
    }
}
