using System.Net;

namespace CimmpleAPI.Services
{
    /// <summary>
    /// Default HTML bodies for document emails when the caller does not supply a custom message.
    /// </summary>
    public static class DocumentEmailTemplates
    {
        public static string BuildDefaultBody(
            string documentTypeLabel,
            string documentLabel,
            string? partyName,
            string? companyName = null)
        {
            var party = WebUtility.HtmlEncode(
                string.IsNullOrWhiteSpace(partyName) ? "there" : partyName.Trim());
            var label = WebUtility.HtmlEncode(
                string.IsNullOrWhiteSpace(documentLabel) ? documentTypeLabel : documentLabel.Trim());
            var type = WebUtility.HtmlEncode(documentTypeLabel ?? "Document");
            var company = WebUtility.HtmlEncode(
                string.IsNullOrWhiteSpace(companyName) ? "Cimmple" : companyName.Trim());

            var intro = documentTypeLabel?.Trim().ToLowerInvariant() switch
            {
                "quotation" or "vendor quotation" =>
                    $"Please find attached quotation <strong>{label}</strong> for your review.",
                "order" =>
                    $"Please find attached sales order <strong>{label}</strong>.",
                "vendor order" =>
                    $"Please find attached purchase order <strong>{label}</strong>.",
                "invoice" =>
                    $"Please find attached invoice <strong>{label}</strong>. Kindly arrange payment per the terms shown on the invoice.",
                "vendor invoice" =>
                    $"Please find attached vendor invoice <strong>{label}</strong> for your records.",
                "shipment" =>
                    $"Please find attached packing / shipment document <strong>{label}</strong>.",
                "job order" =>
                    $"Please find attached job order <strong>{label}</strong>.",
                "ncr" =>
                    $"Please find attached non-conformance report <strong>{label}</strong>.",
                _ =>
                    $"Please find attached {type.ToLowerInvariant()} <strong>{label}</strong>."
            };

            return
                $"<p>Hello {party},</p>" +
                $"<p>{intro}</p>" +
                "<p>The PDF is attached to this email. If you have any questions, reply to this message or contact us.</p>" +
                $"<p>Thank you,<br/>{company}</p>";
        }
    }
}
