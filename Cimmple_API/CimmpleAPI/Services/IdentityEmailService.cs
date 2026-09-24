using System.Net;
using CimmpleAPI.Data.Models;
using Microsoft.Extensions.Configuration;

namespace CimmpleAPI.Services
{
    /// <summary>
    /// Welcome / password-reset / vendor-portal invite emails via tenant SMTP (queued).
    /// Failures are soft — callers should not roll back account saves when email fails.
    /// </summary>
    public static class IdentityEmailService
    {
        public static string? ResolveAppBaseUrl(IConfiguration? configuration)
        {
            var url = configuration?["App:PublicAppBaseUrl"]?.Trim().TrimEnd('/');
            return string.IsNullOrWhiteSpace(url) ? null : url;
        }

        /// <summary>
        /// Returns true when the configured public UI base URL looks unusable for emails
        /// (missing or localhost) outside Development.
        /// </summary>
        public static bool IsPublicAppBaseUrlMisconfigured(IConfiguration? configuration, string? environmentName)
        {
            var baseUrl = ResolveAppBaseUrl(configuration);
            if (string.IsNullOrWhiteSpace(baseUrl)) return true;
            if (string.Equals(environmentName, "Development", StringComparison.OrdinalIgnoreCase))
                return false;
            return baseUrl.Contains("localhost", StringComparison.OrdinalIgnoreCase)
                || baseUrl.Contains("127.0.0.1", StringComparison.OrdinalIgnoreCase);
        }

        public static async Task<(bool queued, string? error)> TryQueueEmployeeWelcomeAsync(
            EmailOutboxService outbox,
            int tenantId,
            SystemSettings settings,
            IConfiguration? configuration,
            string toEmail,
            string displayName,
            string userName,
            string temporaryPassword)
        {
            if (string.IsNullOrWhiteSpace(toEmail))
                return (false, "Employee email is missing.");

            var baseUrl = ResolveAppBaseUrl(configuration);
            var loginUrl = string.IsNullOrEmpty(baseUrl) ? "/login" : $"{baseUrl}/login";
            if (string.IsNullOrEmpty(baseUrl) || baseUrl.Contains("localhost", StringComparison.OrdinalIgnoreCase))
            {
                Console.WriteLine(
                    "[IdentityEmail] Warning: App:PublicAppBaseUrl is missing or localhost; " +
                    "password/welcome email links will not work for remote recipients. " +
                    "Set App__PublicAppBaseUrl to the public UI URL (e.g. https://v2.cimmple.net).");
            }
            var safeName = WebUtility.HtmlEncode(string.IsNullOrWhiteSpace(displayName) ? "there" : displayName.Trim());
            var safeUser = WebUtility.HtmlEncode(userName ?? "");
            var safePwd = WebUtility.HtmlEncode(temporaryPassword ?? "");
            var safeLogin = WebUtility.HtmlEncode(loginUrl);

            var body =
                $"<p>Hello {safeName},</p>" +
                "<p>Your Cimmple account has been created. You can sign in with:</p>" +
                $"<p><strong>Username:</strong> {safeUser}<br/>" +
                $"<strong>Temporary password:</strong> {safePwd}</p>" +
                $"<p><a href=\"{safeLogin}\">Sign in</a></p>" +
                "<p>Please keep this message secure and change your password after signing in if prompted.</p>";

            return await outbox.EnqueueAsync(tenantId, new MailRequest
            {
                To = toEmail.Trim(),
                Subject = "Your Cimmple account",
                Body = body,
                IsHtml = true
            });
        }

        public static async Task<(bool queued, string? error)> TryQueuePasswordResetNoticeAsync(
            EmailOutboxService outbox,
            int tenantId,
            SystemSettings settings,
            IConfiguration? configuration,
            string toEmail,
            string displayName,
            string userName,
            string temporaryPassword,
            bool includePassword)
        {
            if (string.IsNullOrWhiteSpace(toEmail))
                return (false, "User email is missing.");

            var baseUrl = ResolveAppBaseUrl(configuration);
            var loginUrl = string.IsNullOrEmpty(baseUrl) ? "/login" : $"{baseUrl}/login";
            if (string.IsNullOrEmpty(baseUrl) || baseUrl.Contains("localhost", StringComparison.OrdinalIgnoreCase))
            {
                Console.WriteLine(
                    "[IdentityEmail] Warning: App:PublicAppBaseUrl is missing or localhost; " +
                    "password-reset email links will not work for remote recipients. " +
                    "Set App__PublicAppBaseUrl to the public UI URL (e.g. https://v2.cimmple.net).");
            }
            var safeName = WebUtility.HtmlEncode(string.IsNullOrWhiteSpace(displayName) ? "there" : displayName.Trim());
            var safeUser = WebUtility.HtmlEncode(userName ?? "");
            var safeLogin = WebUtility.HtmlEncode(loginUrl);

            string body;
            if (includePassword)
            {
                var safePwd = WebUtility.HtmlEncode(temporaryPassword ?? "");
                body =
                    $"<p>Hello {safeName},</p>" +
                    "<p>An administrator reset your Cimmple password. Sign in with:</p>" +
                    $"<p><strong>Username:</strong> {safeUser}<br/>" +
                    $"<strong>Temporary password:</strong> {safePwd}</p>" +
                    $"<p><a href=\"{safeLogin}\">Sign in</a></p>" +
                    "<p>You will be required to change this password on next login.</p>";
            }
            else
            {
                body =
                    $"<p>Hello {safeName},</p>" +
                    "<p>An administrator reset your Cimmple password. " +
                    "Please contact your administrator for the temporary password, then " +
                    $"<a href=\"{safeLogin}\">sign in</a> and change it when prompted.</p>" +
                    $"<p><strong>Username:</strong> {safeUser}</p>";
            }

            return await outbox.EnqueueAsync(tenantId, new MailRequest
            {
                To = toEmail.Trim(),
                Subject = "Your Cimmple password was reset",
                Body = body,
                IsHtml = true
            });
        }

        public static async Task<(bool queued, string? error)> TryQueueVendorPortalInviteAsync(
            EmailOutboxService outbox,
            int tenantId,
            SystemSettings settings,
            IConfiguration? configuration,
            string toEmail,
            string vendorName,
            string vendorCode,
            string portalUserName,
            string temporaryPassword)
        {
            if (string.IsNullOrWhiteSpace(toEmail))
                return (false, "Vendor email is missing.");

            var baseUrl = ResolveAppBaseUrl(configuration);
            var loginUrl = string.IsNullOrEmpty(baseUrl) ? "/vendor/login" : $"{baseUrl}/vendor/login";
            var safeName = WebUtility.HtmlEncode(string.IsNullOrWhiteSpace(vendorName) ? "there" : vendorName.Trim());
            var safeCode = WebUtility.HtmlEncode(vendorCode ?? "");
            var safeUser = WebUtility.HtmlEncode(portalUserName ?? "");
            var safePwd = WebUtility.HtmlEncode(temporaryPassword ?? "");
            var safeLogin = WebUtility.HtmlEncode(loginUrl);

            var body =
                $"<p>Hello {safeName},</p>" +
                "<p>Your Cimmple vendor portal access is ready. Sign in at the vendor portal with:</p>" +
                $"<p><strong>Vendor code:</strong> {safeCode}<br/>" +
                $"<strong>Username:</strong> {safeUser}<br/>" +
                $"<strong>Password:</strong> {safePwd}</p>" +
                $"<p><a href=\"{safeLogin}\">Open vendor portal</a></p>" +
                "<p>Please keep these credentials secure.</p>";

            return await outbox.EnqueueAsync(tenantId, new MailRequest
            {
                To = toEmail.Trim(),
                Subject = "Your Cimmple vendor portal access",
                Body = body,
                IsHtml = true
            });
        }
    }
}
