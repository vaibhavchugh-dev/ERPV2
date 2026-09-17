using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using CimmpleAPI.Data;
using CimmpleAPI.Services;
using CimmpleAPI.Services.Pdf;

namespace CimmpleAPI.Controllers
{
    [ApiController]
    [Route("api/DocumentEmail")]
    public class DocumentEmailController : ApiBaseController
    {
        private readonly CimmpleDbContext _context;
        private readonly DocumentPdfService _documentPdfService;

        public DocumentEmailController(CimmpleDbContext context, DocumentPdfService documentPdfService)
        {
            _context = context;
            _documentPdfService = documentPdfService;
        }

        [HttpPost("SendQuotation")]
        public async Task<IActionResult> SendQuotation([FromBody] SendDocumentEmailRequest request)
        {
            return await SendDocumentAsync(request, "Quotation",
                (id, tid, lid) => _documentPdfService.BuildQuotationAsync(id, tid, lid));
        }

        [HttpPost("SendOrder")]
        public async Task<IActionResult> SendOrder([FromBody] SendDocumentEmailRequest request)
        {
            return await SendDocumentAsync(request, "Order",
                (id, tid, lid) => _documentPdfService.BuildOrderAsync(id, tid, lid));
        }

        [HttpPost("SendInvoice")]
        public async Task<IActionResult> SendInvoice([FromBody] SendDocumentEmailRequest request)
        {
            return await SendDocumentAsync(request, "Invoice",
                (id, tid, lid) => _documentPdfService.BuildInvoiceAsync(id, tid, lid));
        }

        [HttpPost("SendVendorInvoice")]
        public async Task<IActionResult> SendVendorInvoice([FromBody] SendDocumentEmailRequest request)
        {
            return await SendDocumentAsync(request, "Vendor Invoice",
                (id, tid, lid) => _documentPdfService.BuildVendorInvoiceAsync(id, tid, lid));
        }

        [HttpPost("SendVendorOrder")]
        public async Task<IActionResult> SendVendorOrder([FromBody] SendDocumentEmailRequest request)
        {
            return await SendDocumentAsync(request, "Vendor Order",
                (id, tid, lid) => _documentPdfService.BuildVendorOrderAsync(id, tid, lid));
        }

        [HttpPost("SendVendorQuotation")]
        public async Task<IActionResult> SendVendorQuotation([FromBody] SendDocumentEmailRequest request)
        {
            return await SendDocumentAsync(request, "Vendor Quotation",
                (id, tid, lid) => _documentPdfService.BuildVendorQuotationAsync(id, tid, lid));
        }

        [HttpPost("SendShipment")]
        public async Task<IActionResult> SendShipment([FromBody] SendDocumentEmailRequest request)
        {
            return await SendDocumentAsync(request, "Shipment",
                (id, tid, lid) => _documentPdfService.BuildShipmentAsync(id, tid, lid));
        }

        [HttpPost("SendJobOrder")]
        public async Task<IActionResult> SendJobOrder([FromBody] SendDocumentEmailRequest request)
        {
            return await SendDocumentAsync(request, "Job Order",
                (id, tid, lid) => _documentPdfService.BuildJobOrderAsync(id, tid, lid));
        }

        [HttpPost("SendNcr")]
        public async Task<IActionResult> SendNcr([FromBody] SendDocumentEmailRequest request)
        {
            return await SendDocumentAsync(request, "NCR",
                (id, tid, lid) => _documentPdfService.BuildNcrAsync(id, tid, lid));
        }

        private async Task<IActionResult> SendDocumentAsync(
            SendDocumentEmailRequest request,
            string documentTypeLabel,
            Func<int, int, int?, Task<DocumentPdfResult>> buildPdf)
        {
            if (request == null || request.Id <= 0)
                return BadRequest(new { message = "Document id is required." });

            var tenantId = request.TenantId > 0 ? request.TenantId.Value : GetTenantId();
            if (tenantId <= 0)
                return BadRequest(new { message = "Tenant id is required." });

            var locationId = request.LocationId;
            if (!locationId.HasValue || locationId.Value <= 0)
            {
                if (!TryGetActiveLocationId(out var headerLocationId, out var forbidResult))
                    return forbidResult!;
                locationId = headerLocationId;
            }

            DocumentPdfResult pdf;
            try
            {
                pdf = await buildPdf(request.Id, tenantId, locationId);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = ex.Message });
            }

            if (!string.IsNullOrEmpty(pdf.Error))
            {
                var isNotFound = pdf.Error.Contains("not found", StringComparison.OrdinalIgnoreCase);
                return isNotFound
                    ? NotFound(new { message = pdf.Error })
                    : BadRequest(new { message = pdf.Error });
            }

            if (pdf.Bytes == null || pdf.Bytes.Length == 0)
                return BadRequest(new { message = "PDF generation produced an empty document." });

            var settings = await _context.SystemSettings.AsNoTracking()
                .FirstOrDefaultAsync(s => s.TenantId == tenantId);
            if (settings == null)
                return BadRequest(new { message = "System settings are not configured for this tenant." });

            var toEmail = !string.IsNullOrWhiteSpace(request.ToEmail)
                ? request.ToEmail.Trim()
                : pdf.DefaultToEmail;
            if (string.IsNullOrWhiteSpace(toEmail))
                return BadRequest(new { message = "Recipient email is missing" });

            var label = string.IsNullOrWhiteSpace(pdf.DocumentLabel) ? documentTypeLabel : pdf.DocumentLabel;
            var subject = !string.IsNullOrWhiteSpace(request.Subject)
                ? request.Subject.Trim()
                : $"{documentTypeLabel} {label}";

            string body;
            bool isHtml;
            if (!string.IsNullOrWhiteSpace(request.Message))
            {
                body = request.Message;
                isHtml = request.Message.Contains('<');
            }
            else
            {
                var companyName = !string.IsNullOrWhiteSpace(settings.SmtpFromName)
                    ? settings.SmtpFromName
                    : null;
                body = DocumentEmailTemplates.BuildDefaultBody(
                    documentTypeLabel,
                    label,
                    pdf.PartyName,
                    companyName);
                isHtml = true;
            }

            var mailRequest = new MailRequest
            {
                To = toEmail,
                Cc = request.Cc,
                Subject = subject,
                Body = body,
                IsHtml = isHtml,
                Attachments = new List<EmailAttachment>
                {
                    new EmailAttachment
                    {
                        FileName = pdf.FileName,
                        Content = pdf.Bytes,
                        ContentType = "application/pdf"
                    }
                }
            };

            var (ok, error) = EmailService.TrySend(settings, mailRequest);
            if (!ok)
                return BadRequest(new { message = error ?? "Failed to send email." });

            return Ok(new
            {
                message = "Email sent successfully.",
                toEmail,
                fileName = pdf.FileName
            });
        }
    }

    public class SendDocumentEmailRequest
    {
        public int Id { get; set; }
        public int? TenantId { get; set; }
        public int? LocationId { get; set; }
        public string? ToEmail { get; set; }
        public string? Cc { get; set; }
        public string? Subject { get; set; }
        public string? Message { get; set; }
    }
}
