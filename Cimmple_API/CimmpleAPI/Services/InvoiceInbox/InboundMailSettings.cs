namespace CimmpleAPI.Services.InvoiceInbox
{
    /// <summary>
    /// Settings for the Draft Inbox (<c>InboundMail</c> section of appsettings).
    /// The inbound email provider (Mailgun route, etc.) forwards parsed mail to
    /// <c>POST /api/InvoiceInbox/Inbound</c>.
    /// </summary>
    public class InboundMailSettings
    {
        public const string SectionName = "InboundMail";

        /// <summary>Master switch. When false the webhook answers 503 and the worker idles.</summary>
        public bool Enabled { get; set; } = true;

        /// <summary>Mail domain that receives invoices, e.g. <c>inbox.example.com</c>. Addresses are <c>{locationId}-{code}@{Domain}</c> (e.g. <c>1002-inv</c>, <c>1002-po</c>, <c>1002-co</c>).</summary>
        public string Domain { get; set; } = "";

        /// <summary>Mailgun HTTP webhook signing key (HMAC-SHA256 of timestamp + token).</summary>
        public string SigningKey { get; set; } = "";

        /// <summary>
        /// Alternative to <see cref="SigningKey"/> for providers without signatures:
        /// the webhook URL carries <c>?key={SharedSecret}</c>.
        /// </summary>
        public string SharedSecret { get; set; } = "";

        /// <summary>Largest PDF accepted from an email.</summary>
        public int MaxAttachmentMb { get; set; } = 25;

        /// <summary>When false, items stay <c>New</c> until someone retries them.</summary>
        public bool AutoExtract { get; set; } = true;

        /// <summary>Extraction attempts before an item is marked Failed.</summary>
        public int MaxExtractionAttempts { get; set; } = 3;

        public bool HasVerification =>
            !string.IsNullOrWhiteSpace(SigningKey) || !string.IsNullOrWhiteSpace(SharedSecret);
    }
}
