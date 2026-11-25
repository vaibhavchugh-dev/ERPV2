using System.Text.Json;
using CimmpleAPI.Data;
using CimmpleAPI.Data.Models;
using CimmpleAPI.Services.DocumentExtraction;
using CimmpleAPI.Utilities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace CimmpleAPI.Services.InvoiceInbox
{
    /// <summary>
    /// Runs the existing document-extraction service over queued Draft Inbox attachments
    /// and stores the result (camelCase JSON, same shape as <c>/api/DocumentExtraction</c>) on the item.
    /// </summary>
    public class InvoiceInboxExtractionService
    {
        private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
        private static readonly TimeSpan ClaimLease = TimeSpan.FromMinutes(5);
        private static readonly TimeSpan RetryDelay = TimeSpan.FromMinutes(2);

        private readonly CimmpleDbContext _db;
        private readonly IConfiguration _configuration;
        private readonly IDocumentExtractionService _extraction;
        private readonly InboundMailSettings _settings;
        private readonly ILogger<InvoiceInboxExtractionService> _logger;

        public InvoiceInboxExtractionService(
            CimmpleDbContext db,
            IConfiguration configuration,
            IDocumentExtractionService extraction,
            IOptions<InboundMailSettings> settings,
            ILogger<InvoiceInboxExtractionService> logger)
        {
            _db = db;
            _configuration = configuration;
            _extraction = extraction;
            _settings = settings.Value;
            _logger = logger;
        }

        /// <summary>Processes up to <paramref name="batchSize"/> due items. Returns how many were handled.</summary>
        public async Task<int> ProcessPendingAsync(int batchSize, CancellationToken ct)
        {
            var now = DateTime.UtcNow;
            var ids = await _db.InvoiceInboxItems.AsNoTracking()
                .Where(x =>
                    (x.Status == InvoiceInboxItem.StatusNew && (x.LockedUntilUtc == null || x.LockedUntilUtc < now))
                    || (x.Status == InvoiceInboxItem.StatusExtracting && x.LockedUntilUtc != null && x.LockedUntilUtc < now))
                .OrderBy(x => x.Id)
                .Select(x => x.Id)
                .Take(batchSize)
                .ToListAsync(ct);

            var handled = 0;
            foreach (var id in ids)
            {
                if (ct.IsCancellationRequested) break;
                if (await ProcessOneAsync(id, ct)) handled++;
            }

            return handled;
        }

        /// <summary>Puts a Failed / Extracted item back in the queue.</summary>
        public async Task<bool> RequeueAsync(int tenantId, int itemId, CancellationToken ct)
        {
            var rows = await _db.InvoiceInboxItems
                .Where(x => x.Id == itemId && x.TenantId == tenantId
                            && (x.Status == InvoiceInboxItem.StatusFailed || x.Status == InvoiceInboxItem.StatusExtracted)
                            && x.BlobName != null)
                .ExecuteUpdateAsync(s => s
                    .SetProperty(x => x.Status, InvoiceInboxItem.StatusNew)
                    .SetProperty(x => x.Attempts, 0)
                    .SetProperty(x => x.FailureReason, (string?)null)
                    .SetProperty(x => x.LockedUntilUtc, (DateTime?)null), ct);
            return rows > 0;
        }

        private async Task<bool> ProcessOneAsync(int id, CancellationToken ct)
        {
            var now = DateTime.UtcNow;
            var lease = now.Add(ClaimLease);

            // Atomic claim: only one worker/instance wins the row.
            var claimed = await _db.InvoiceInboxItems
                .Where(x => x.Id == id
                            && ((x.Status == InvoiceInboxItem.StatusNew && (x.LockedUntilUtc == null || x.LockedUntilUtc < now))
                                || (x.Status == InvoiceInboxItem.StatusExtracting && x.LockedUntilUtc != null && x.LockedUntilUtc < now)))
                .ExecuteUpdateAsync(s => s
                    .SetProperty(x => x.Status, InvoiceInboxItem.StatusExtracting)
                    .SetProperty(x => x.LockedUntilUtc, lease)
                    .SetProperty(x => x.Attempts, x => x.Attempts + 1), ct);
            if (claimed == 0) return false;

            var item = await _db.InvoiceInboxItems.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id, ct);
            if (item == null) return false;

            try
            {
                if (string.IsNullOrWhiteSpace(item.BlobName))
                {
                    await FailAsync(id, "No attachment to extract.", ct);
                    return true;
                }

                var fileInfo = ModuleFileStorage.CreateFileInfo(item.TenantId, InvoiceInboxService.BlobFolder, item.BlobName);
                var bytes = ModuleFileStorage.DownloadBytes(_db, _configuration, fileInfo);
                if (bytes == null || bytes.Length == 0)
                {
                    await FailAsync(id, "Attachment file could not be read from storage.", ct);
                    return true;
                }

                var outcome = await _extraction.ExtractDocumentFromPdfAsync(
                    bytes, DocumentExtractionKinds.VendorInvoice, item.FileName, ct);
                var result = outcome.Result;

                var vendorName = result.VendorNames?.FirstOrDefault(n => !string.IsNullOrWhiteSpace(n))?.Trim()
                                 ?? result.CompanyName?.Trim();
                var invoiceNo = (result.InvoiceNumber ?? result.QuotationNumber)?.Trim();
                var total = result.TotalAmount;

                if (string.IsNullOrWhiteSpace(vendorName)
                    && string.IsNullOrWhiteSpace(invoiceNo)
                    && total == null
                    && (result.Details == null || result.Details.Count == 0))
                {
                    await FailAsync(id, "No invoice data could be read from this PDF.", ct);
                    return true;
                }

                var json = JsonSerializer.Serialize(result, JsonOptions);
                var done = DateTime.UtcNow;
                await _db.InvoiceInboxItems
                    .Where(x => x.Id == id)
                    .ExecuteUpdateAsync(s => s
                        .SetProperty(x => x.Status, InvoiceInboxItem.StatusExtracted)
                        .SetProperty(x => x.ExtractionJson, json)
                        .SetProperty(x => x.ExtractionProvider, Truncate(outcome.Provider, 50))
                        .SetProperty(x => x.ExtractedVendorName, Truncate(vendorName, 300))
                        .SetProperty(x => x.ExtractedInvoiceNo, Truncate(invoiceNo, 100))
                        .SetProperty(x => x.ExtractedTotal, total)
                        .SetProperty(x => x.FailureReason, (string?)null)
                        .SetProperty(x => x.ProcessedUtc, done)
                        .SetProperty(x => x.LockedUntilUtc, (DateTime?)null), ct);
                return true;
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                // Shutting down: release the lease so the next run picks it up.
                await ReleaseAsync(id, CancellationToken.None);
                throw;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Invoice inbox extraction failed for item {ItemId} (attempt {Attempt})", id, item.Attempts + 1);
                if (item.Attempts + 1 >= Math.Max(1, _settings.MaxExtractionAttempts))
                {
                    await FailAsync(id, ex.Message, ct);
                }
                else
                {
                    // Back off, then let the poller retry.
                    var retryAt = DateTime.UtcNow.Add(RetryDelay);
                    await _db.InvoiceInboxItems
                        .Where(x => x.Id == id)
                        .ExecuteUpdateAsync(s => s
                            .SetProperty(x => x.Status, InvoiceInboxItem.StatusNew)
                            .SetProperty(x => x.FailureReason, Truncate(ex.Message, 1900))
                            .SetProperty(x => x.LockedUntilUtc, retryAt), CancellationToken.None);
                }

                return true;
            }
        }

        private Task<int> FailAsync(int id, string reason, CancellationToken ct) =>
            _db.InvoiceInboxItems
                .Where(x => x.Id == id)
                .ExecuteUpdateAsync(s => s
                    .SetProperty(x => x.Status, InvoiceInboxItem.StatusFailed)
                    .SetProperty(x => x.FailureReason, Truncate(reason, 1900))
                    .SetProperty(x => x.ProcessedUtc, DateTime.UtcNow)
                    .SetProperty(x => x.LockedUntilUtc, (DateTime?)null), CancellationToken.None);

        private Task<int> ReleaseAsync(int id, CancellationToken ct) =>
            _db.InvoiceInboxItems
                .Where(x => x.Id == id && x.Status == InvoiceInboxItem.StatusExtracting)
                .ExecuteUpdateAsync(s => s
                    .SetProperty(x => x.Status, InvoiceInboxItem.StatusNew)
                    .SetProperty(x => x.LockedUntilUtc, (DateTime?)null), ct);

        private static string? Truncate(string? value, int max) =>
            string.IsNullOrEmpty(value) || value.Length <= max ? value : value[..max];
    }
}
