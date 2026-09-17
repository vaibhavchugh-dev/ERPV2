using Microsoft.AspNetCore.Mvc;
using CimmpleAPI.Services.Pdf;

namespace CimmpleAPI.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class PdfController : ApiBaseController
    {
        private readonly DocumentPdfService _documentPdfService;

        public PdfController(DocumentPdfService documentPdfService)
        {
            _documentPdfService = documentPdfService;
        }

        [HttpGet("GenerateQuotation")]
        public async Task<IActionResult> GenerateQuotation([FromQuery] int quotationId, [FromQuery] int tenantId, [FromQuery] int? locationId = null)
        {
            return ToPdfFileResult(await _documentPdfService.BuildQuotationAsync(quotationId, tenantId, locationId));
        }

        [HttpGet("GenerateOrder")]
        public async Task<IActionResult> GenerateOrder([FromQuery] int orderId, [FromQuery] int tenantId, [FromQuery] int? locationId = null)
        {
            return ToPdfFileResult(await _documentPdfService.BuildOrderAsync(orderId, tenantId, locationId));
        }

        [HttpGet("GenerateInvoice")]
        public async Task<IActionResult> GenerateInvoice([FromQuery] int invoiceId, [FromQuery] int tenantId, [FromQuery] int? locationId = null)
        {
            return ToPdfFileResult(await _documentPdfService.BuildInvoiceAsync(invoiceId, tenantId, locationId));
        }

        [HttpGet("GenerateVendorInvoice")]
        public async Task<IActionResult> GenerateVendorInvoice([FromQuery] int invoiceId, [FromQuery] int tenantId, [FromQuery] int? locationId = null)
        {
            return ToPdfFileResult(await _documentPdfService.BuildVendorInvoiceAsync(invoiceId, tenantId, locationId));
        }

        [HttpGet("GenerateVendorOrder")]
        public async Task<IActionResult> GenerateVendorOrder([FromQuery] int orderId, [FromQuery] int tenantId, [FromQuery] int? locationId = null)
        {
            return ToPdfFileResult(await _documentPdfService.BuildVendorOrderAsync(orderId, tenantId, locationId));
        }

        [HttpGet("GenerateVendorQuotation")]
        public async Task<IActionResult> GenerateVendorQuotation([FromQuery] int quotationId, [FromQuery] int tenantId, [FromQuery] int? locationId = null)
        {
            return ToPdfFileResult(await _documentPdfService.BuildVendorQuotationAsync(quotationId, tenantId, locationId));
        }

        [HttpGet("GenerateShipment")]
        public async Task<IActionResult> GenerateShipment([FromQuery] int shipmentId, [FromQuery] int tenantId, [FromQuery] int? locationId = null)
        {
            return ToPdfFileResult(await _documentPdfService.BuildShipmentAsync(shipmentId, tenantId, locationId));
        }

        [HttpGet("GenerateJobOrder")]
        public async Task<IActionResult> GenerateJobOrder([FromQuery] int jobOrderId, [FromQuery] int tenantId, [FromQuery] int? locationId = null)
        {
            return ToPdfFileResult(await _documentPdfService.BuildJobOrderAsync(jobOrderId, tenantId, locationId));
        }

        [HttpGet("GenerateNCR")]
        public async Task<IActionResult> GenerateNCR([FromQuery] int ncrId, [FromQuery] int tenantId, [FromQuery] int? locationId = null)
        {
            return ToPdfFileResult(await _documentPdfService.BuildNcrAsync(ncrId, tenantId, locationId));
        }

        private IActionResult ToPdfFileResult(DocumentPdfResult result)
        {
            if (!string.IsNullOrEmpty(result.Error))
            {
                // Preserve prior not-found shape; other failures were previously 500 with { error }.
                var isNotFound = result.Error.Contains("not found", StringComparison.OrdinalIgnoreCase);
                return isNotFound
                    ? NotFound(new { error = result.Error })
                    : StatusCode(500, new { error = result.Error });
            }

            return File(result.Bytes, "application/pdf", result.FileName);
        }
    }
}
