using System;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using CimmpleAPI.Services.DocumentExtraction;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace CimmpleAPI.Controllers
{
    /// <summary>
    /// PDF document extraction endpoints.
    /// Primary: hosted Cimmple extraction API; fallback: Claude Haiku.
    /// </summary>
    [ApiController]
    [Route("api/[controller]")]
    public class DocumentExtractionController : ApiBaseController
    {
        private const long MaxFileSize = 52_428_800; // ~50 MB

        private readonly IDocumentExtractionService _extractionService;

        public DocumentExtractionController(IDocumentExtractionService extractionService)
        {
            _extractionService = extractionService;
        }

        [HttpPost("ExtractVendorQuotation")]
        [Consumes("multipart/form-data")]
        [Produces("application/json")]
        [RequestSizeLimit(MaxFileSize)]
        [RequestFormLimits(MultipartBodyLengthLimit = MaxFileSize)]
        public async Task<IActionResult> ExtractVendorQuotation(
            [FromForm] IFormFile? file,
            CancellationToken cancellationToken)
        {
            if (file == null || file.Length == 0)
                return BadRequest(new { success = false, message = "A PDF file is required." });

            if (file.Length > MaxFileSize)
                return BadRequest(new { success = false, message = "File exceeds the 50 MB size limit." });

            var extension = Path.GetExtension(file.FileName)?.ToUpperInvariant();
            if (extension != ".PDF")
                return BadRequest(new { success = false, message = "Only PDF files are supported." });

            try
            {
                byte[] pdfBytes;
                await using (var stream = new MemoryStream())
                {
                    await file.CopyToAsync(stream, cancellationToken);
                    pdfBytes = stream.ToArray();
                }

                Console.WriteLine(
                    $"[DocumentExtractionController] ExtractVendorQuotation file={file.FileName}, size={pdfBytes.Length}");

                var outcome = await _extractionService.ExtractVendorQuotationFromPdfAsync(
                    pdfBytes,
                    file.FileName,
                    cancellationToken);

                return Ok(new
                {
                    success = true,
                    message = outcome.Message ?? "Success",
                    provider = outcome.Provider,
                    result = outcome.Result
                });
            }
            catch (ArgumentException ex)
            {
                return BadRequest(new { success = false, message = ex.Message });
            }
            catch (InvalidOperationException ex)
            {
                return StatusCode(StatusCodes.Status500InternalServerError, new
                {
                    success = false,
                    message = ex.Message
                });
            }
            catch (Exception ex)
            {
                return StatusCode(StatusCodes.Status500InternalServerError, new
                {
                    success = false,
                    message = $"Document extraction failed: {ex.Message}"
                });
            }
        }
    }
}
