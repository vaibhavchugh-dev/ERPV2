namespace CimmpleAPI.Services
{
    /// <summary>Outbound email payload for <see cref="EmailService"/>.</summary>
    public class MailRequest
    {
        /// <summary>Comma- or semicolon-separated recipient addresses.</summary>
        public string To { get; set; } = "";

        /// <summary>Optional comma- or semicolon-separated CC addresses.</summary>
        public string? Cc { get; set; }

        public string Subject { get; set; } = "";

        public string Body { get; set; } = "";

        public bool IsHtml { get; set; }

        public List<EmailAttachment> Attachments { get; set; } = new();
    }

    public class EmailAttachment
    {
        public string FileName { get; set; } = "attachment.bin";

        public byte[] Content { get; set; } = Array.Empty<byte>();

        /// <summary>Optional MIME type (e.g. application/pdf). Defaults to application/octet-stream.</summary>
        public string? ContentType { get; set; }
    }
}
