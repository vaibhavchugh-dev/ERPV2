using CimmpleAPI.Data;
using CimmpleAPI.Data.Models;
using CimmpleAPI.Services.InvoiceInbox;
using CimmpleAPI.Utilities;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace CimmpleAPI.Controllers
{
    /// <summary>
    /// Draft Inbox: vendor invoices emailed to a per-location inbound address.
    /// <c>Inbound</c> is the anonymous provider webhook (authenticated by signature / shared secret);
    /// everything else is a normal signed-in ERP endpoint.
    /// </summary>
    [ApiController]
    [Route("api/[controller]")]
    public class InvoiceInboxController : ApiBaseController
    {
        private const long InboundMaxRequestBytes = 60L * 1024 * 1024;

        private readonly CimmpleDbContext _context;
        private readonly IConfiguration _configuration;
        private readonly IWebHostEnvironment _environment;
        private readonly InboundMailSettings _settings;
        private readonly InvoiceInboxService _inbox;
        private readonly InvoiceInboxExtractionService _extraction;
        private readonly ILogger<InvoiceInboxController> _logger;

        public InvoiceInboxController(
            CimmpleDbContext context,
            IConfiguration configuration,
            IWebHostEnvironment environment,
            IOptions<InboundMailSettings> settings,
            InvoiceInboxService inbox,
            InvoiceInboxExtractionService extraction,
            ILogger<InvoiceInboxController> logger)
        {
            _context = context;
            _configuration = configuration;
            _environment = environment;
            _settings = settings.Value;
            _inbox = inbox;
            _extraction = extraction;
            _logger = logger;
        }

        // ------------------------------------------------------------------ webhook

        /// <summary>
        /// Inbound-mail provider webhook (Mailgun-style multipart form: recipient, sender, subject,
        /// Message-Id, body-plain, body-html, attachment files).
        /// 200 = stored; 406 = permanently rejected (no retry); 5xx = provider should redeliver.
        /// </summary>
        [AllowAnonymous]
        [HttpPost("Inbound")]
        [RequestSizeLimit(InboundMaxRequestBytes)]
        [RequestFormLimits(MultipartBodyLengthLimit = InboundMaxRequestBytes)]
        public async Task<IActionResult> Inbound(CancellationToken ct)
        {
            if (!_settings.Enabled)
                return StatusCode(503, new { message = "Invoice inbox is disabled." });

            if (!Request.HasFormContentType)
                return BadRequest(new { message = "Expected a form post." });

            try
            {
                await InvoiceInboxSchemaService.EnsureAsync(_context);
                var form = await Request.ReadFormAsync(ct);
                var queryKey = Request.Query["key"].ToString();
                if (!InboundMailVerifier.IsAuthentic(_settings, form, queryKey, _environment.IsDevelopment()))
                {
                    _logger.LogWarning("Invoice inbox: webhook call rejected (bad or missing signature)");
                    return Unauthorized(new { message = "Invalid signature." });
                }

                var result = await _inbox.ReceiveAsync(form, ct);
                if (result.Outcome == InboundReceiveOutcome.UnknownRecipient)
                {
                    _logger.LogInformation("Invoice inbox: mail rejected - {Reason}", result.Message);
                    return StatusCode(406, new { message = result.Message });
                }

                return Ok(new { created = result.Created, skipped = result.Skipped });
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                throw;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Invoice inbox: could not process inbound mail");
                return StatusCode(500, new { message = "Could not process inbound mail." });
            }
        }

        // ------------------------------------------------------------------ list / detail

        /// <summary>
        /// status: Open (default: everything still to be handled), Converted, Discarded, All,
        /// or one exact status.
        /// </summary>
        [HttpGet("List")]
        public async Task<IActionResult> List(
            [FromQuery] string status = "Open",
            [FromQuery] string? searchTerm = null,
            [FromQuery] int? locationId = null,
            [FromQuery] int page = 1,
            [FromQuery] int pageSize = 50,
            CancellationToken ct = default)
        {
            if (Blocked(out var blocked)) return blocked!;
            var tenantId = GetTenantId();
            if (tenantId <= 0) return Unauthorized(new { message = "Tenant not resolved." });
            await InvoiceInboxSchemaService.EnsureAsync(_context);

            if (!TryResolveListLocationFilter(locationId, out var filterLocationId, out var forbid, out var restrict))
                return forbid!;

            pageSize = Math.Clamp(pageSize, 1, 200);
            page = Math.Max(1, page);

            var scoped = _context.InvoiceInboxItems.AsNoTracking().Where(x => x.TenantId == tenantId);
            if (filterLocationId.HasValue)
                scoped = scoped.Where(x => x.LocationId == filterLocationId.Value);
            else if (restrict != null)
                scoped = scoped.Where(x => restrict.Contains(x.LocationId));

            if (!string.IsNullOrWhiteSpace(searchTerm))
            {
                var term = searchTerm.Trim();
                scoped = scoped.Where(x =>
                    (x.Subject != null && x.Subject.Contains(term))
                    || (x.FromEmail != null && x.FromEmail.Contains(term))
                    || (x.FromName != null && x.FromName.Contains(term))
                    || (x.FileName != null && x.FileName.Contains(term))
                    || (x.ExtractedVendorName != null && x.ExtractedVendorName.Contains(term))
                    || (x.ExtractedInvoiceNo != null && x.ExtractedInvoiceNo.Contains(term)));
            }

            var counts = await scoped
                .GroupBy(x => x.Status)
                .Select(g => new { status = g.Key, count = g.Count() })
                .ToListAsync(ct);
            int Count(params string[] statuses) => counts.Where(c => statuses.Contains(c.status)).Sum(c => c.count);

            var openStatuses = new[]
            {
                InvoiceInboxItem.StatusNew, InvoiceInboxItem.StatusExtracting, InvoiceInboxItem.StatusExtracted,
                InvoiceInboxItem.StatusFailed, InvoiceInboxItem.StatusNoAttachment
            };

            var filtered = scoped;
            var wanted = (status ?? "Open").Trim();
            if (wanted.Equals("Open", StringComparison.OrdinalIgnoreCase))
                filtered = filtered.Where(x => openStatuses.Contains(x.Status));
            else if (!wanted.Equals("All", StringComparison.OrdinalIgnoreCase))
                filtered = filtered.Where(x => x.Status == wanted);

            var total = await filtered.CountAsync(ct);
            var items = await filtered
                .OrderByDescending(x => x.ReceivedUtc)
                .ThenByDescending(x => x.Id)
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .Select(x => new
                {
                    id = x.Id,
                    locationId = x.LocationId,
                    fromName = x.FromName,
                    fromEmail = x.FromEmail,
                    subject = x.Subject,
                    fileName = x.FileName,
                    fileSize = x.FileSize,
                    hasFile = x.BlobName != null,
                    status = x.Status,
                    extractedVendorName = x.ExtractedVendorName,
                    extractedInvoiceNo = x.ExtractedInvoiceNo,
                    extractedTotal = x.ExtractedTotal,
                    failureReason = x.FailureReason,
                    receivedUtc = x.ReceivedUtc,
                    vendorInvoiceId = x.VendorInvoiceId
                })
                .ToListAsync(ct);

            return Ok(new
            {
                result = new
                {
                    items,
                    total,
                    page,
                    pageSize,
                    counts = new
                    {
                        open = Count(openStatuses),
                        ready = Count(InvoiceInboxItem.StatusExtracted),
                        processing = Count(InvoiceInboxItem.StatusNew, InvoiceInboxItem.StatusExtracting),
                        failed = Count(InvoiceInboxItem.StatusFailed, InvoiceInboxItem.StatusNoAttachment),
                        converted = Count(InvoiceInboxItem.StatusConverted),
                        discarded = Count(InvoiceInboxItem.StatusDiscarded)
                    }
                }
            });
        }

        [HttpGet("Get/{id:int}")]
        public async Task<IActionResult> GetItem(int id, CancellationToken ct)
        {
            var (item, error) = await LoadAccessibleAsync(id, tracking: false, ct);
            if (item == null) return error!;

            return Ok(new
            {
                result = new
                {
                    id = item.Id,
                    locationId = item.LocationId,
                    fromName = item.FromName,
                    fromEmail = item.FromEmail,
                    subject = item.Subject,
                    bodyText = item.BodyText,
                    bodyHtml = string.IsNullOrWhiteSpace(item.BodyText) ? item.BodyHtml : null,
                    fileName = item.FileName,
                    fileSize = item.FileSize,
                    hasFile = item.BlobName != null,
                    status = item.Status,
                    extractionJson = item.ExtractionJson,
                    extractionProvider = item.ExtractionProvider,
                    extractedVendorName = item.ExtractedVendorName,
                    extractedInvoiceNo = item.ExtractedInvoiceNo,
                    extractedTotal = item.ExtractedTotal,
                    failureReason = item.FailureReason,
                    receivedUtc = item.ReceivedUtc,
                    vendorInvoiceId = item.VendorInvoiceId
                }
            });
        }

        /// <summary>The emailed PDF, for the review pane.</summary>
        [HttpGet("File/{id:int}")]
        public async Task<IActionResult> GetFile(int id, CancellationToken ct)
        {
            var (item, error) = await LoadAccessibleAsync(id, tracking: false, ct);
            if (item == null) return error!;
            if (string.IsNullOrWhiteSpace(item.BlobName))
                return NotFound(new { message = "This email has no attachment." });

            var fileInfo = ModuleFileStorage.CreateFileInfo(item.TenantId, InvoiceInboxService.BlobFolder, item.BlobName);
            var bytes = ModuleFileStorage.DownloadBytes(_context, _configuration, fileInfo);
            if (bytes == null || bytes.Length == 0)
                return NotFound(new { message = "Attachment file was not found." });

            Response.Headers["X-Content-Type-Options"] = "nosniff";
            return File(bytes, "application/pdf");
        }

        // ------------------------------------------------------------------ actions

        public class MarkConvertedRequest
        {
            public int VendorInvoiceId { get; set; }
        }

        /// <summary>Called after the vendor invoice was created from this item (links the two).</summary>
        [HttpPost("MarkConverted/{id:int}")]
        public async Task<IActionResult> MarkConverted(int id, [FromBody] MarkConvertedRequest request, CancellationToken ct)
        {
            var (item, error) = await LoadAccessibleAsync(id, tracking: true, ct);
            if (item == null) return error!;

            if (request == null || request.VendorInvoiceId <= 0)
                return BadRequest(new { message = "Vendor invoice id is required." });

            var tenantId = GetTenantId();
            var invoiceExists = await _context.VendorInvoiceMaster.AsNoTracking()
                .AnyAsync(v => v.Id == request.VendorInvoiceId && v.TenantId == tenantId, ct);
            if (!invoiceExists)
                return BadRequest(new { message = "Vendor invoice not found." });

            if (item.Status == InvoiceInboxItem.StatusConverted)
            {
                return item.VendorInvoiceId == request.VendorInvoiceId
                    ? Ok(new { result = new { message = "Already linked." } })
                    : BadRequest(new { message = "This item was already converted to another vendor invoice." });
            }

            if (item.Status == InvoiceInboxItem.StatusDiscarded)
                return BadRequest(new { message = "This item was discarded." });

            item.Status = InvoiceInboxItem.StatusConverted;
            item.VendorInvoiceId = request.VendorInvoiceId;
            item.ConvertedBy = GetUserId();
            item.ConvertedUtc = DateTime.UtcNow;
            item.LockedUntilUtc = null;
            await _context.SaveChangesAsync(ct);

            return Ok(new { result = new { message = "Marked as converted." } });
        }

        /// <summary>Re-run extraction for a Failed (or already Extracted) item.</summary>
        [HttpPost("Retry/{id:int}")]
        public async Task<IActionResult> Retry(int id, CancellationToken ct)
        {
            var (item, error) = await LoadAccessibleAsync(id, tracking: false, ct);
            if (item == null) return error!;

            var queued = await _extraction.RequeueAsync(item.TenantId, id, ct);
            if (!queued)
                return BadRequest(new { message = "Only items with a PDF that failed or finished extraction can be retried." });

            return Ok(new { result = new { message = "Queued for extraction." } });
        }

        [HttpPost("Discard/{id:int}")]
        public async Task<IActionResult> Discard(int id, CancellationToken ct)
        {
            var (item, error) = await LoadAccessibleAsync(id, tracking: true, ct);
            if (item == null) return error!;

            if (item.Status == InvoiceInboxItem.StatusConverted)
                return BadRequest(new { message = "A converted item cannot be discarded." });

            item.Status = InvoiceInboxItem.StatusDiscarded;
            item.LockedUntilUtc = null;
            await _context.SaveChangesAsync(ct);
            return Ok(new { result = new { message = "Discarded." } });
        }

        // ------------------------------------------------------------------ address

        /// <summary>The inbound email address for a site: <c>{locationId}-inv@{domain}</c>.</summary>
        [HttpGet("Address")]
        public async Task<IActionResult> GetAddress([FromQuery] int? locationId, CancellationToken ct)
        {
            if (Blocked(out var blocked)) return blocked!;
            if (!TryResolveLocationId(locationId, out var resolved, out var forbid)) return forbid!;
            if (resolved <= 0)
                return BadRequest(new { message = "Select a working site to see its inbox address." });

            var tenantId = GetTenantId();
            var locType = await _context.Locations.AsNoTracking()
                .Where(l => l.LocationId == resolved && l.TenantId == tenantId)
                .Select(l => (int?)l.LocType)
                .FirstOrDefaultAsync(ct);
            if (locType == null || !InvoiceInboxService.IsMailSite(locType.Value))
                return BadRequest(new { message = "Invoices can only be received at a business site or warehouse." });

            return Ok(new
            {
                result = new
                {
                    locationId = resolved,
                    address = _inbox.BuildAddress(resolved),
                    configured = !string.IsNullOrWhiteSpace(_settings.Domain) && _settings.Enabled
                }
            });
        }

        // ------------------------------------------------------------------ helpers

        private bool Blocked(out IActionResult? result)
        {
            // Vendor-portal sessions skip the ERP permission filter; this is an internal screen.
            if (IsVendorPortal())
            {
                result = StatusCode(403, new { message = "Access denied" });
                return true;
            }

            result = null;
            return false;
        }

        private async Task<(InvoiceInboxItem? Item, IActionResult? Error)> LoadAccessibleAsync(
            int id, bool tracking, CancellationToken ct)
        {
            if (Blocked(out var blocked)) return (null, blocked);

            var tenantId = GetTenantId();
            if (tenantId <= 0) return (null, Unauthorized(new { message = "Tenant not resolved." }));

            var query = tracking ? _context.InvoiceInboxItems : _context.InvoiceInboxItems.AsNoTracking();
            var item = await query.FirstOrDefaultAsync(x => x.Id == id && x.TenantId == tenantId, ct);
            if (item == null) return (null, NotFound(new { message = "Inbox item not found." }));

            if (!CanAccessLocation(item.LocationId))
                return (null, StatusCode(403, new { message = "You do not have access to this location." }));

            return (item, null);
        }
    }
}
