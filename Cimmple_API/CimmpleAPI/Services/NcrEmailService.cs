using System.Net;
using CimmpleAPI.Data.Models;
using Microsoft.Extensions.Configuration;

namespace CimmpleAPI.Services
{
    /// <summary>
    /// Soft-fail NCR workflow emails (investigator / approver assignment).
    /// </summary>
    public static class NcrEmailService
    {
        public static (bool sent, string? error) TrySendAssignmentNotice(
            SystemSettings settings,
            IConfiguration? configuration,
            string toEmail,
            string assigneeName,
            string roleLabel,
            string ncrNumber,
            string title,
            string? severity,
            string? status,
            string? companyName = null)
        {
            if (string.IsNullOrWhiteSpace(toEmail))
                return (false, "Assignee email is missing.");

            var baseUrl = IdentityEmailService.ResolveAppBaseUrl(configuration);
            var safeName = WebUtility.HtmlEncode(
                string.IsNullOrWhiteSpace(assigneeName) ? "there" : assigneeName.Trim());
            var safeRole = WebUtility.HtmlEncode(roleLabel ?? "assignee");
            var safeNcr = WebUtility.HtmlEncode(
                string.IsNullOrWhiteSpace(ncrNumber) ? "NCR" : ncrNumber.Trim());
            var safeTitle = WebUtility.HtmlEncode(title ?? "");
            var safeSeverity = WebUtility.HtmlEncode(
                string.IsNullOrWhiteSpace(severity) ? "—" : severity.Trim());
            var safeStatus = WebUtility.HtmlEncode(
                string.IsNullOrWhiteSpace(status) ? "—" : status.Trim());
            var company = WebUtility.HtmlEncode(
                string.IsNullOrWhiteSpace(companyName) ? "Cimmple" : companyName.Trim());

            var linkHtml = string.IsNullOrEmpty(baseUrl)
                ? ""
                : $"<p><a href=\"{WebUtility.HtmlEncode(baseUrl)}\">Open Cimmple</a> to review this NCR.</p>";

            var body =
                $"<p>Hello {safeName},</p>" +
                $"<p>You have been assigned as <strong>{safeRole}</strong> on " +
                $"non-conformance report <strong>{safeNcr}</strong>.</p>" +
                $"<p><strong>Title:</strong> {safeTitle}<br/>" +
                $"<strong>Severity:</strong> {safeSeverity}<br/>" +
                $"<strong>Status:</strong> {safeStatus}</p>" +
                linkHtml +
                $"<p>Thank you,<br/>{company}</p>";

            return EmailService.TrySend(settings, new MailRequest
            {
                To = toEmail.Trim(),
                Subject = $"{(string.IsNullOrWhiteSpace(ncrNumber) ? "NCR" : ncrNumber.Trim())} — assigned as {roleLabel}",
                Body = body,
                IsHtml = true
            });
        }
    }
}
