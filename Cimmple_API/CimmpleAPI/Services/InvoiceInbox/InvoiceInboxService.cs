using System.Security.Cryptography;
using System.Text;
using CimmpleAPI.Data;
using CimmpleAPI.Data.Models;
using CimmpleAPI.Utilities;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace CimmpleAPI.Services.InvoiceInbox
{
    public enum InboundReceiveOutcome
    {
        /// <summary>Mail was stored (or was a repeat delivery we already hold).</summary>
        Accepted,
        /// <summary>Recipient is not a valid <c>{locationId}-inv@domain</c> address. Provider must not retry.</summary>
        UnknownRecipient
    }

    public sealed class InboundReceiveResult
    {
        public InboundReceiveOutcome Outcome { get; init; }
        public int Created { get; init; }
        public int Skipped { get; init; }
        public string? Message { get; init; }
    }

        /// <summary>Receives parsed inbound mail into the Draft Inbox (address = <c>{locationId}-inv@domain</c>).</summary>
    public class InvoiceInboxService
    {
        public const string BlobFolder = "InvoiceInbox";

        private const int MaxBodyTextChars = 100_000;
        private const int MaxBodyHtmlChars = 300_000;

        /// <summary>Primary suffix for vendor invoices in <c>{locationId}-{code}@domain</c>.</summary>
        public const string MailCode = "inv";

        public sealed record InboxAddressSpec(
            string Code,
            string DocumentType,
            string Label,
            string ShortLabel,
            string PartyGroup,
            string Description);

        /// <summary>All supported document-type inbox codes for each site.</summary>
        public static readonly IReadOnlyList<InboxAddressSpec> AddressSpecs = new[]
        {
            new InboxAddressSpec("cq", InvoiceInboxItem.DocTypeCustomerQuotation, "Customer Quotation", "Cust CQ", "Customer", "Customer RFQs and quotation requests"),
            new InboxAddressSpec("co", InvoiceInboxItem.DocTypeCustomerOrder, "Customer Order", "Cust CO", "Customer", "Customer purchase orders"),
            // Customer Invoice is hidden for now (invoices are billed from shipped orders). Re-enable to bring it back.
            // new InboxAddressSpec("ci", InvoiceInboxItem.DocTypeCustomerInvoice, "Customer Invoice", "Cust INV", "Customer", "Customer invoices"),
            new InboxAddressSpec("vq", InvoiceInboxItem.DocTypeVendorQuotation, "Vendor Quotation", "Vendor VQ", "Vendor", "Vendor quotes and pricing proposals"),
            new InboxAddressSpec("po", InvoiceInboxItem.DocTypeVendorOrder, "Vendor Order", "Vendor PO", "Vendor", "Vendor purchase orders (also accepts -vo)"),
            new InboxAddressSpec("inv", InvoiceInboxItem.DocTypeVendorInvoice, "Vendor Invoice", "Vendor INV", "Vendor", "Vendor bills and invoices"),
        };

        /// <summary>Maps address suffix code (case-insensitive) to canonical DocumentType.</summary>
        private static readonly Dictionary<string, string> CodeToDocType = new(StringComparer.OrdinalIgnoreCase)
        {
            ["cq"] = InvoiceInboxItem.DocTypeCustomerQuotation,
            ["co"] = InvoiceInboxItem.DocTypeCustomerOrder,
            // Customer Invoice hidden for now:
            // ["ci"] = InvoiceInboxItem.DocTypeCustomerInvoice,
            // ["cinv"] = InvoiceInboxItem.DocTypeCustomerInvoice,
            ["vq"] = InvoiceInboxItem.DocTypeVendorQuotation,
            ["po"] = InvoiceInboxItem.DocTypeVendorOrder,
            ["vo"] = InvoiceInboxItem.DocTypeVendorOrder,
            ["inv"] = InvoiceInboxItem.DocTypeVendorInvoice,
            ["vi"] = InvoiceInboxItem.DocTypeVendorInvoice,
        };

        private readonly CimmpleDbContext _db;
        private readonly IConfiguration _configuration;
        private readonly InboundMailSettings _settings;
        private readonly ILogger<InvoiceInboxService> _logger;

        public InvoiceInboxService(
            CimmpleDbContext db,
            IConfiguration configuration,
            IOptions<InboundMailSettings> settings,
            ILogger<InvoiceInboxService> logger)
        {
            _db = db;
            _configuration = configuration;
            _settings = settings.Value;
            _logger = logger;
        }

        // ---------------------------------------------------------------- addresses

        /// <summary>Tenant, site, and document type a received email belongs to.</summary>
        private sealed record InboxTarget(int TenantId, int LocationId, string DocumentType);

        /// <summary>
        /// Primary inbox address for a site: <c>{locationId}-{code}@{InboundMail:Domain}</c>.
        /// Null when the domain is not configured.
        /// </summary>
        public string? BuildAddress(int locationId, string code = MailCode)
        {
            var domain = (_settings.Domain ?? "").Trim().TrimStart('@');
            return string.IsNullOrEmpty(domain) || locationId <= 0
                ? null
                : $"{locationId}-{code}@{domain}";
        }

        /// <summary>All inbox addresses for a site (CQ, CO, CI, VQ, PO, INV).</summary>
        public IReadOnlyList<object> BuildAddresses(int locationId) =>
            AddressSpecs.Select(s => (object)new
            {
                code = s.Code,
                documentType = s.DocumentType,
                label = s.Label,
                shortLabel = s.ShortLabel,
                partyGroup = s.PartyGroup,
                description = s.Description,
                address = BuildAddress(locationId, s.Code)
            }).ToList();

        /// <summary>True for sites that can receive documents (business sites and warehouses).</summary>
        public static bool IsMailSite(int locType) =>
            locType == 0 || locType == LocationKind.BusinessSite || locType == LocationKind.Warehouse;

        // ---------------------------------------------------------------- intake

        public async Task<InboundReceiveResult> ReceiveAsync(IFormCollection form, CancellationToken ct = default)
        {
            var (locationId, documentType) = ExtractTarget(form["recipient"].ToString(), form["To"].ToString(), form["to"].ToString());
            if (locationId <= 0 || string.IsNullOrEmpty(documentType))
                return Unknown("Recipient is not a recognized inbox address.");

            var site = await _db.Locations.AsNoTracking()
                .Where(l => l.LocationId == locationId)
                .Select(l => new { l.LocationId, l.TenantId, l.LocType })
                .FirstOrDefaultAsync(ct);
            if (site == null || !IsMailSite(site.LocType))
                return Unknown("Inbox location does not exist.");

            var address = new InboxTarget(site.TenantId, site.LocationId, documentType);

            var (fromName, fromEmail) = ParseAddress(FirstNonEmpty(form, "from", "From", "sender", "Sender"));
            var subject = Truncate(FirstNonEmpty(form, "subject", "Subject"), 500);
            var bodyText = Truncate(FirstNonEmpty(form, "body-plain", "stripped-text"), MaxBodyTextChars);
            var bodyHtml = Truncate(FirstNonEmpty(form, "body-html", "stripped-html"), MaxBodyHtmlChars);

            var maxBytes = (long)Math.Max(1, _settings.MaxAttachmentMb) * 1024 * 1024;
            var pdfs = new List<(int Index, IFormFile File)>();
            for (var i = 0; i < form.Files.Count; i++)
            {
                var file = form.Files[i];
                if (file.Length <= 0 || file.Length > maxBytes || !LooksLikePdfName(file))
                    continue;
                pdfs.Add((i, file));
            }

            var messageId = Truncate(
                FirstNonEmpty(form, "Message-Id", "message-id", "Message-ID", "message_id"), 300);
            if (string.IsNullOrWhiteSpace(messageId))
            {
                messageId = "nomid-" + Hash(
                    $"{fromEmail}|{subject}|{FirstNonEmpty(form, "Date", "date")}|{string.Join(",", pdfs.Select(p => p.File.FileName))}");
            }

            var existingIndexes = (await _db.InvoiceInboxItems.AsNoTracking()
                    .Where(x => x.TenantId == address.TenantId && x.MessageId == messageId)
                    .Select(x => x.AttachmentIndex)
                    .ToListAsync(ct))
                .ToHashSet();

            var created = 0;
            var skipped = 0;
            var now = DateTime.UtcNow;

            if (pdfs.Count == 0)
            {
                if (existingIndexes.Contains(0))
                    return Accepted(0, 1);

                _db.InvoiceInboxItems.Add(NewItem(address, fromName, fromEmail, subject, bodyText, bodyHtml, messageId, 0, now));
                await TrySaveAsync(ct);
                return Accepted(1, 0);
            }

            foreach (var (index, file) in pdfs)
            {
                if (existingIndexes.Contains(index))
                {
                    skipped++;
                    continue;
                }

                byte[] bytes;
                await using (var stream = file.OpenReadStream())
                using (var ms = new MemoryStream())
                {
                    await stream.CopyToAsync(ms, ct);
                    bytes = ms.ToArray();
                }

                if (!IsPdfContent(bytes))
                {
                    skipped++;
                    continue;
                }

                var blobName = $"{Guid.NewGuid():N}.pdf";
                var fileInfo = ModuleFileStorage.CreateFileInfo(address.TenantId, BlobFolder, blobName);
                var uploaded = await ModuleFileStorage.UploadBytesAsync(_db, _configuration, bytes, fileInfo);
                if (!uploaded)
                {
                    // Surface as a server error so the provider redelivers; already-saved attachments dedupe on retry.
                    throw new InvalidOperationException("Could not store the attachment in blob storage.");
                }

                var item = NewItem(address, fromName, fromEmail, subject, bodyText, bodyHtml, messageId, index, now);
                item.FileName = Truncate(ModuleFileStorage.SanitizeFileName(Path.GetFileName(file.FileName)), 500);
                item.ContentType = "application/pdf";
                item.FileSize = bytes.LongLength;
                item.BlobName = blobName;
                item.Status = InvoiceInboxItem.StatusNew;
                _db.InvoiceInboxItems.Add(item);

                if (await TrySaveAsync(ct))
                {
                    created++;
                }
                else
                {
                    // Lost a race with a parallel delivery of the same message; drop the duplicate blob.
                    skipped++;
                    await ModuleFileStorage.DeleteAsync(_db, _configuration, fileInfo);
                }
            }

            return Accepted(created, skipped);
        }

        private static InvoiceInboxItem NewItem(
            InboxTarget address,
            string? fromName,
            string? fromEmail,
            string? subject,
            string? bodyText,
            string? bodyHtml,
            string messageId,
            int attachmentIndex,
            DateTime now) => new()
        {
            TenantId = address.TenantId,
            LocationId = address.LocationId,
            DocumentType = address.DocumentType,
            Source = InvoiceInboxItem.SourceEmail,
            FromName = Truncate(fromName, 300),
            FromEmail = Truncate(fromEmail, 320),
            Subject = subject,
            BodyText = bodyText,
            BodyHtml = bodyHtml,
            MessageId = messageId,
            AttachmentIndex = attachmentIndex,
            Status = InvoiceInboxItem.StatusNoAttachment,
            ReceivedUtc = now
        };

        /// <summary>Saves pending changes; false when the unique (message, attachment) index rejected a duplicate.</summary>
        private async Task<bool> TrySaveAsync(CancellationToken ct)
        {
            try
            {
                await _db.SaveChangesAsync(ct);
                return true;
            }
            catch (DbUpdateException ex) when (IsUniqueViolation(ex))
            {
                _logger.LogInformation("Invoice inbox: duplicate delivery ignored");
                foreach (var entry in _db.ChangeTracker.Entries<InvoiceInboxItem>()
                             .Where(e => e.State == EntityState.Added).ToList())
                {
                    entry.State = EntityState.Detached;
                }

                return false;
            }
        }

        private static bool IsUniqueViolation(DbUpdateException ex)
        {
            var message = ex.InnerException?.Message ?? ex.Message;
            return message.Contains("UX_InvoiceInboxItem_Message", StringComparison.OrdinalIgnoreCase)
                   || message.Contains("duplicate key", StringComparison.OrdinalIgnoreCase);
        }

        private static InboundReceiveResult Accepted(int created, int skipped) => new()
        {
            Outcome = InboundReceiveOutcome.Accepted,
            Created = created,
            Skipped = skipped
        };

        private static InboundReceiveResult Unknown(string message) => new()
        {
            Outcome = InboundReceiveOutcome.UnknownRecipient,
            Message = message
        };

        // ---------------------------------------------------------------- parsing helpers

        /// <summary>
        /// Site id and document type from the first recipient shaped <c>{locationId}-{code}@{domain}</c>
        /// (an optional '+tag' after the local part is ignored). Returns (0, "") when no recipient matches.
        /// Only addresses on the configured inbox domain are accepted when a domain is set.
        /// </summary>
        public (int LocationId, string DocumentType) ExtractTarget(params string[] recipientFields)
        {
            var domain = (_settings.Domain ?? "").Trim().TrimStart('@');

            foreach (var field in recipientFields)
            {
                if (string.IsNullOrWhiteSpace(field)) continue;
                foreach (var part in field.Split(new[] { ',', ';' }, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
                {
                    var (_, email) = ParseAddress(part);
                    var at = email?.LastIndexOf('@') ?? -1;
                    if (email == null || at <= 0) continue;

                    var local = email[..at];
                    var plus = local.IndexOf('+');
                    if (plus > 0) local = local[..plus];
                    local = local.Trim().ToLowerInvariant();
                    var dash = local.IndexOf('-');
                    if (dash <= 0) continue;

                    var code = local[(dash + 1)..];
                    if (!CodeToDocType.TryGetValue(code, out var docType)) continue;
                    if (!int.TryParse(local[..dash], System.Globalization.NumberStyles.None,
                            System.Globalization.CultureInfo.InvariantCulture, out var locationId) || locationId <= 0)
                        continue;

                    if (domain.Length == 0 || email[(at + 1)..].Equals(domain, StringComparison.OrdinalIgnoreCase))
                        return (locationId, docType);
                }
            }

            return (0, "");
        }

        /// <summary>Splits <c>Name &lt;user@host&gt;</c> into display name and address.</summary>
        public static (string? Name, string? Email) ParseAddress(string? raw)
        {
            if (string.IsNullOrWhiteSpace(raw)) return (null, null);
            var text = raw.Trim();
            var lt = text.LastIndexOf('<');
            var gt = text.LastIndexOf('>');
            if (lt >= 0 && gt > lt)
            {
                var email = text[(lt + 1)..gt].Trim();
                var name = text[..lt].Trim().Trim('"').Trim();
                return (string.IsNullOrEmpty(name) ? null : name, string.IsNullOrEmpty(email) ? null : email);
            }

            return (null, text.Contains('@') ? text : null);
        }

        private static string FirstNonEmpty(IFormCollection form, params string[] keys)
        {
            foreach (var key in keys)
            {
                var value = form[key].ToString();
                if (!string.IsNullOrWhiteSpace(value)) return value.Trim();
            }

            return "";
        }

        private static bool LooksLikePdfName(IFormFile file)
        {
            var ext = Path.GetExtension(file.FileName ?? "");
            if (string.Equals(ext, ".pdf", StringComparison.OrdinalIgnoreCase)) return true;
            return string.Equals(file.ContentType, "application/pdf", StringComparison.OrdinalIgnoreCase);
        }

        private static bool IsPdfContent(byte[] bytes) =>
            bytes.Length > 4 && bytes[0] == 0x25 && bytes[1] == 0x50 && bytes[2] == 0x44 && bytes[3] == 0x46;

        private static string Hash(string value) =>
            Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value)))[..32].ToLowerInvariant();

        private static string? Truncate(string? value, int max)
        {
            if (string.IsNullOrEmpty(value)) return value;
            return value.Length <= max ? value : value[..max];
        }
    }
}
