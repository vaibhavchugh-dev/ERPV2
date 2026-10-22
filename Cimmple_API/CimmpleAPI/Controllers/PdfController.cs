using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using CimmpleAPI.Data;
using CimmpleAPI.Services.Pdf;

namespace CimmpleAPI.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class PdfController : ApiBaseController
    {
        private readonly DocumentPdfService _documentPdfService;
        private readonly CimmpleDbContext _context;

        public PdfController(DocumentPdfService documentPdfService, CimmpleDbContext context)
        {
            _documentPdfService = documentPdfService;
            _context = context;
        }

        [HttpGet("GenerateQuotation")]
        public async Task<IActionResult> GenerateQuotation([FromQuery] int quotationId, [FromQuery] int tenantId, [FromQuery] int? locationId = null)
        {
            var effectiveTenant = ResolvePdfTenant(tenantId);
            var docLocation = await _context.QuotationOrder.AsNoTracking()
                .Where(q => q.OrderID == quotationId && q.Tenantid == effectiveTenant)
                .Select(q => q.Locationid)
                .FirstOrDefaultAsync();
            var denied = DenyDocumentLocation(docLocation);
            if (denied != null) return denied;
            denied = DenyOptionalLetterhead(locationId);
            if (denied != null) return denied;
            return ToPdfFileResult(await _documentPdfService.BuildQuotationAsync(quotationId, effectiveTenant, LetterheadLocation(locationId, docLocation)));
        }

        [HttpGet("GenerateOrder")]
        public async Task<IActionResult> GenerateOrder([FromQuery] int orderId, [FromQuery] int tenantId, [FromQuery] int? locationId = null)
        {
            var effectiveTenant = ResolvePdfTenant(tenantId);
            var docLocation = await _context.CustomerOrder.AsNoTracking()
                .Where(o => o.OrderID == orderId && o.Tenantid == effectiveTenant)
                .Select(o => (int?)o.locationId)
                .FirstOrDefaultAsync();
            var denied = DenyDocumentLocation(docLocation);
            if (denied != null) return denied;
            denied = DenyOptionalLetterhead(locationId);
            if (denied != null) return denied;
            return ToPdfFileResult(await _documentPdfService.BuildOrderAsync(orderId, effectiveTenant, LetterheadLocation(locationId, docLocation)));
        }

        [HttpGet("GenerateInvoice")]
        public async Task<IActionResult> GenerateInvoice([FromQuery] int invoiceId, [FromQuery] int tenantId, [FromQuery] int? locationId = null)
        {
            var effectiveTenant = ResolvePdfTenant(tenantId);
            var docLocation = await (
                from detail in _context.InvoiceDetail.AsNoTracking()
                join order in _context.CustomerOrder.AsNoTracking() on detail.OrderId equals order.OrderID
                where detail.InvoiceId == invoiceId && order.Tenantid == effectiveTenant
                select (int?)order.locationId
            ).FirstOrDefaultAsync();
            var invoiceExists = await _context.InvoiceMaster.AsNoTracking()
                .AnyAsync(i => i.Id == invoiceId && i.TenantId == effectiveTenant);
            if (!invoiceExists)
                return NotFound(new { error = "Invoice not found" });
            var denied = DenyDocumentLocation(docLocation);
            if (denied != null) return denied;
            denied = DenyOptionalLetterhead(locationId);
            if (denied != null) return denied;
            return ToPdfFileResult(await _documentPdfService.BuildInvoiceAsync(invoiceId, effectiveTenant, LetterheadLocation(locationId, docLocation)));
        }

        [HttpGet("GenerateVendorInvoice")]
        public async Task<IActionResult> GenerateVendorInvoice([FromQuery] int invoiceId, [FromQuery] int tenantId, [FromQuery] int? locationId = null)
        {
            var effectiveTenant = ResolvePdfTenant(tenantId);
            var docLocation = await _context.VendorInvoiceMaster.AsNoTracking()
                .Where(i => i.Id == invoiceId && i.TenantId == effectiveTenant)
                .Select(i => (int?)i.locationId)
                .FirstOrDefaultAsync();
            var denied = DenyDocumentLocation(docLocation);
            if (denied != null) return denied;
            denied = DenyOptionalLetterhead(locationId);
            if (denied != null) return denied;
            return ToPdfFileResult(await _documentPdfService.BuildVendorInvoiceAsync(invoiceId, effectiveTenant, LetterheadLocation(locationId, docLocation)));
        }

        [HttpGet("GenerateVendorOrder")]
        public async Task<IActionResult> GenerateVendorOrder([FromQuery] int orderId, [FromQuery] int tenantId, [FromQuery] int? locationId = null)
        {
            var effectiveTenant = ResolvePdfTenant(tenantId);
            var docLocation = await _context.VendorOrders.AsNoTracking()
                .Where(o => o.OrderID == orderId && o.Tenantid == effectiveTenant)
                .Select(o => o.LocationId)
                .FirstOrDefaultAsync();
            var denied = DenyDocumentLocation(docLocation);
            if (denied != null) return denied;
            denied = DenyOptionalLetterhead(locationId);
            if (denied != null) return denied;
            return ToPdfFileResult(await _documentPdfService.BuildVendorOrderAsync(orderId, effectiveTenant, LetterheadLocation(locationId, docLocation)));
        }

        [HttpGet("GenerateVendorQuotation")]
        public async Task<IActionResult> GenerateVendorQuotation([FromQuery] int quotationId, [FromQuery] int tenantId, [FromQuery] int? locationId = null)
        {
            var effectiveTenant = ResolvePdfTenant(tenantId);
            var docLocation = await _context.VendorQuotations.AsNoTracking()
                .Where(q => q.OrderID == quotationId && q.Tenantid == effectiveTenant)
                .Select(q => q.locationid)
                .FirstOrDefaultAsync();
            var denied = DenyDocumentLocation(docLocation);
            if (denied != null) return denied;
            denied = DenyOptionalLetterhead(locationId);
            if (denied != null) return denied;
            return ToPdfFileResult(await _documentPdfService.BuildVendorQuotationAsync(quotationId, effectiveTenant, LetterheadLocation(locationId, docLocation)));
        }

        [HttpGet("GenerateShipment")]
        public async Task<IActionResult> GenerateShipment([FromQuery] int shipmentId, [FromQuery] int tenantId, [FromQuery] int? locationId = null)
        {
            var effectiveTenant = ResolvePdfTenant(tenantId);
            var docLocation = await (
                from shipment in _context.Shipping.AsNoTracking()
                join order in _context.CustomerOrder.AsNoTracking() on shipment.OrderId equals order.OrderID
                where shipment.Id == shipmentId && shipment.TenantId == effectiveTenant && order.Tenantid == effectiveTenant
                select (int?)order.locationId
            ).FirstOrDefaultAsync();
            var denied = DenyDocumentLocation(docLocation);
            if (denied != null) return denied;
            denied = DenyOptionalLetterhead(locationId);
            if (denied != null) return denied;
            return ToPdfFileResult(await _documentPdfService.BuildShipmentAsync(shipmentId, effectiveTenant, LetterheadLocation(locationId, docLocation)));
        }

        [HttpGet("GenerateJobOrder")]
        public async Task<IActionResult> GenerateJobOrder([FromQuery] int jobOrderId, [FromQuery] int tenantId, [FromQuery] int? locationId = null)
        {
            var effectiveTenant = ResolvePdfTenant(tenantId);
            var docLocation = await (
                from job in _context.JobOrderMaster.AsNoTracking()
                join order in _context.CustomerOrder.AsNoTracking() on job.CustomerOrderID equals order.OrderID
                where job.JobOrderID == jobOrderId && job.Tenantid == effectiveTenant && order.Tenantid == effectiveTenant
                select (int?)order.locationId
            ).FirstOrDefaultAsync();
            var denied = DenyDocumentLocation(docLocation);
            if (denied != null) return denied;
            denied = DenyOptionalLetterhead(locationId);
            if (denied != null) return denied;
            return ToPdfFileResult(await _documentPdfService.BuildJobOrderAsync(jobOrderId, effectiveTenant, LetterheadLocation(locationId, docLocation)));
        }

        [HttpGet("GenerateNCR")]
        public async Task<IActionResult> GenerateNCR([FromQuery] int ncrId, [FromQuery] int tenantId, [FromQuery] int? locationId = null)
        {
            var effectiveTenant = ResolvePdfTenant(tenantId);
            var jobOrderId = await _context.NonConformanceReports.AsNoTracking()
                .Where(n => n.NcrId == ncrId && n.TenantId == effectiveTenant)
                .Select(n => n.JobOrderId)
                .FirstOrDefaultAsync();
            int? docLocation = null;
            if (jobOrderId is > 0)
            {
                docLocation = await (
                    from job in _context.JobOrderMaster.AsNoTracking()
                    join order in _context.CustomerOrder.AsNoTracking() on job.CustomerOrderID equals order.OrderID
                    where job.JobOrderID == jobOrderId && job.Tenantid == effectiveTenant
                    select (int?)order.locationId
                ).FirstOrDefaultAsync();
            }
            var denied = DenyDocumentLocation(docLocation);
            if (denied != null) return denied;
            denied = DenyOptionalLetterhead(locationId);
            if (denied != null) return denied;
            return ToPdfFileResult(await _documentPdfService.BuildNcrAsync(ncrId, effectiveTenant, LetterheadLocation(locationId, docLocation)));
        }

        private int ResolvePdfTenant(int tenantId) => tenantId > 0 ? tenantId : GetTenantId();

        private static int? LetterheadLocation(int? requested, int? documentLocation)
            => requested is > 0 ? requested : documentLocation;

        private IActionResult? DenyOptionalLetterhead(int? locationId)
        {
            if (locationId is > 0 && !CanAccessLocation(locationId.Value))
                return StatusCode(403, new { error = "You do not have access to the selected location." });
            return null;
        }

        /// <summary>
        /// Missing row (null) is left to the PDF builder's not-found result.
        /// A positive location the caller cannot access is rejected.
        /// </summary>
        private IActionResult? DenyDocumentLocation(int? locationId)
        {
            if (locationId is > 0 && !CanAccessLocation(locationId.Value))
                return StatusCode(403, new { error = "You do not have access to this document's location." });
            return null;
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
