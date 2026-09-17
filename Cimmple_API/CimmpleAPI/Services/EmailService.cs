using System.Net.Mime;
using CimmpleAPI.Data.Models;
using MailKit.Net.Smtp;
using MailKit.Security;
using MimeKit;

namespace CimmpleAPI.Services
{
    /// <summary>
    /// Tenant SMTP sender (MailKit). Uses System Settings for host/credentials;
    /// supports multi-To, CC, HTML body, and binary attachments.
    /// MailKit is used instead of System.Net.Mail so AUTH works on plain (non-SSL) relays.
    /// </summary>
    public static class EmailService
    {
        private static readonly char[] AddressSeparators = { ',', ';' };

        /// <summary>Per-operation SMTP timeout (connect + auth + send). Slow relays / external CC can exceed 60s.</summary>
        private const int SmtpTimeoutMs = 120_000;

        /// <summary>One automatic retry for transient SMTP failures (timeout / connection dropped).</summary>
        private const int MaxAttempts = 2;
        private const int RetryDelayMs = 1500;

        /// <summary>
        /// Resolves Hosted (platform) vs Custom (tenant) SMTP, then sends.
        /// </summary>
        public static (bool ok, string? error) TrySend(
            SystemSettings? tenantSettings,
            MailRequest request,
            Microsoft.Extensions.Configuration.IConfiguration? configuration,
            bool skipNotificationGate = false)
        {
            var (resolved, resolveError) = SmtpSettingsResolver.Resolve(tenantSettings, configuration);
            if (resolved == null)
                return (false, resolveError ?? "Email settings are not configured.");
            return TrySend(resolved, request, skipNotificationGate);
        }

        public static (bool ok, string? error) TrySend(
            SystemSettings settings,
            MailRequest request,
            bool skipNotificationGate = false)
        {
            if (settings == null)
                return (false, "Email settings are not configured.");

            if (!skipNotificationGate && !settings.EnableEmailNotifications)
                return (false, "Email notifications are disabled in System Settings.");

            if (string.IsNullOrWhiteSpace(settings.SmtpServer) ||
                string.IsNullOrWhiteSpace(settings.SmtpFromEmail))
                return (false, "SMTP server / from address is not configured in System Settings.");

            if (string.IsNullOrWhiteSpace(settings.SmtpUsername))
                return (false, "SMTP username is required. Enter the mailbox login (often the same as From Email).");

            if (string.IsNullOrEmpty(settings.SmtpPassword))
                return (false, "SMTP password is missing. Enter the password (and Save settings if you want it stored).");

            if (request == null || string.IsNullOrWhiteSpace(request.To))
                return (false, "Recipient email address is missing.");

            if (string.IsNullOrWhiteSpace(request.Subject))
                return (false, "Email subject is required.");

            var toList = SplitAddresses(request.To);
            if (toList.Count == 0)
                return (false, "Recipient email address is missing.");

            var ccList = SplitAddresses(request.Cc);
            Exception? lastEx = null;

            for (var attempt = 1; attempt <= MaxAttempts; attempt++)
            {
                using var client = new SmtpClient();
                client.Timeout = SmtpTimeoutMs;

                try
                {
                    var fromName = string.IsNullOrWhiteSpace(settings.SmtpFromName)
                        ? settings.SmtpFromEmail.Trim()
                        : settings.SmtpFromName.Trim();
                    var fromAddress = settings.SmtpFromEmail.Trim();

                    var secureOption = ResolveSecureSocketOptions(settings);
                    client.Connect(settings.SmtpServer.Trim(), settings.SmtpPort, secureOption);
                    client.Authenticate(settings.SmtpUsername.Trim(), settings.SmtpPassword);

                    // One message with all To/Cc — avoids N round-trips (legacy loop was slow and amplified timeouts).
                    var message = BuildMimeMessage(fromAddress, fromName, toList, ccList, request);
                    client.Send(message);

                    return (true, null);
                }
                catch (Exception ex)
                {
                    lastEx = ex;
                    if (attempt < MaxAttempts && IsTransient(ex))
                    {
                        try { Thread.Sleep(RetryDelayMs); }
                        catch { /* ignore */ }
                        continue;
                    }
                    return (false, FormatSendError(ex, settings));
                }
                finally
                {
                    // Always tear down so a hung/failed send does not poison the next attempt.
                    if (client.IsConnected)
                    {
                        try { client.Disconnect(true); }
                        catch { /* ignore disconnect errors */ }
                    }
                }
            }

            return (false, lastEx != null ? FormatSendError(lastEx, settings) : "Failed to send email.");
        }

        /// <summary>Convenience overload matching the previous AR reminder call shape.</summary>
        public static (bool ok, string? error) TrySend(
            SystemSettings settings,
            string toEmail,
            string subject,
            string body,
            bool isHtml = false)
        {
            return TrySend(settings, new MailRequest
            {
                To = toEmail,
                Subject = subject,
                Body = body,
                IsHtml = isHtml
            });
        }

        private static SecureSocketOptions ResolveSecureSocketOptions(SystemSettings settings)
        {
            if (!settings.SmtpUseSsl)
                return SecureSocketOptions.None;

            return settings.SmtpPort == 465
                ? SecureSocketOptions.SslOnConnect
                : SecureSocketOptions.StartTls;
        }

        private static MimeMessage BuildMimeMessage(
            string fromAddress,
            string fromName,
            List<string> toRecipients,
            List<string> ccList,
            MailRequest request)
        {
            var message = new MimeMessage();
            message.From.Add(new MailboxAddress(fromName, fromAddress));
            foreach (var to in toRecipients)
                message.To.Add(MailboxAddress.Parse(to));
            foreach (var cc in ccList)
                message.Cc.Add(MailboxAddress.Parse(cc));
            message.Subject = request.Subject;

            var builder = new BodyBuilder();
            if (request.IsHtml)
                builder.HtmlBody = request.Body ?? "";
            else
                builder.TextBody = request.Body ?? "";

            if (request.Attachments != null)
            {
                foreach (var file in request.Attachments)
                {
                    if (file?.Content == null || file.Content.Length == 0)
                        continue;

                    var contentType = string.IsNullOrWhiteSpace(file.ContentType)
                        ? MediaTypeNames.Application.Octet
                        : file.ContentType;
                    builder.Attachments.Add(
                        file.FileName ?? "attachment.bin",
                        file.Content,
                        MimeKit.ContentType.Parse(contentType));
                }
            }

            message.Body = builder.ToMessageBody();
            return message;
        }

        public static List<string> SplitAddresses(string? addresses)
        {
            if (string.IsNullOrWhiteSpace(addresses))
                return new List<string>();

            return addresses
                .Split(AddressSeparators, StringSplitOptions.RemoveEmptyEntries)
                .Select(a => a.Trim())
                .Where(a => a.Length > 0)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();
        }

        private static string FormatSendError(Exception ex, SystemSettings settings)
        {
            var detail = FlattenException(ex);

            if (IsTimeout(ex))
            {
                return
                    "SMTP timed out waiting for the mail server. " +
                    "PDF generation plus a slow relay (especially with external CC addresses) can exceed the limit. " +
                    "Try again without CC, or retry in a moment. Details: " + detail;
            }

            if (IsAuthFailure(ex))
            {
                return
                    "SMTP authentication failed. Check username and password in System Settings → Email. " +
                    "On some hosts the username must match the From Email. Details: " + detail;
            }

            if (IsSslMismatch(ex))
            {
                return
                    "SMTP secure connection failed. Try toggling Use SSL/TLS, or switch port " +
                    "(465 = SSL, 587 = STARTTLS, 25 = often no SSL). Details: " + detail;
            }

            if (IsConnectionFailure(ex))
            {
                return
                    $"Could not reach SMTP server {settings.SmtpServer}:{settings.SmtpPort}. " +
                    "Verify host, port, firewall, and SSL settings. Details: " + detail;
            }

            return detail;
        }

        private static bool IsTransient(Exception ex)
        {
            if (IsTimeout(ex) || IsConnectionFailure(ex))
                return true;

            for (Exception? e = ex; e != null; e = e.InnerException)
            {
                var msg = e.Message ?? "";
                if (msg.Contains("421", StringComparison.OrdinalIgnoreCase) ||
                    msg.Contains("450", StringComparison.OrdinalIgnoreCase) ||
                    msg.Contains("451", StringComparison.OrdinalIgnoreCase) ||
                    msg.Contains("452", StringComparison.OrdinalIgnoreCase) ||
                    msg.Contains("try again", StringComparison.OrdinalIgnoreCase) ||
                    msg.Contains("temporarily", StringComparison.OrdinalIgnoreCase))
                    return true;
            }

            return false;
        }

        private static bool IsTimeout(Exception ex)
        {
            for (Exception? e = ex; e != null; e = e.InnerException)
            {
                if (e is TimeoutException or OperationCanceledException)
                    return true;
                if (e.Message.Contains("timed out", StringComparison.OrdinalIgnoreCase) ||
                    e.Message.Contains("timeout", StringComparison.OrdinalIgnoreCase))
                    return true;
            }
            return false;
        }

        private static bool IsAuthFailure(Exception ex)
        {
            for (Exception? e = ex; e != null; e = e.InnerException)
            {
                if (e is MailKit.Security.AuthenticationException)
                    return true;
                var msg = e.Message ?? "";
                if (msg.Contains("535", StringComparison.OrdinalIgnoreCase) ||
                    msg.Contains("534", StringComparison.OrdinalIgnoreCase) ||
                    msg.Contains("authentication", StringComparison.OrdinalIgnoreCase) ||
                    msg.Contains("auth failed", StringComparison.OrdinalIgnoreCase) ||
                    msg.Contains("invalid credentials", StringComparison.OrdinalIgnoreCase) ||
                    msg.Contains("login failed", StringComparison.OrdinalIgnoreCase))
                    return true;
            }
            return false;
        }

        private static bool IsSslMismatch(Exception ex)
        {
            for (Exception? e = ex; e != null; e = e.InnerException)
            {
                var msg = e.Message ?? "";
                if (msg.Contains("SSL", StringComparison.OrdinalIgnoreCase) ||
                    msg.Contains("TLS", StringComparison.OrdinalIgnoreCase) ||
                    msg.Contains("secure connection", StringComparison.OrdinalIgnoreCase) ||
                    msg.Contains("certificate", StringComparison.OrdinalIgnoreCase) ||
                    msg.Contains("handshake", StringComparison.OrdinalIgnoreCase))
                    return true;
            }
            return false;
        }

        private static bool IsConnectionFailure(Exception ex)
        {
            for (Exception? e = ex; e != null; e = e.InnerException)
            {
                if (e is System.Net.Sockets.SocketException)
                    return true;
                var msg = e.Message ?? "";
                if (msg.Contains("connection refused", StringComparison.OrdinalIgnoreCase) ||
                    msg.Contains("could not connect", StringComparison.OrdinalIgnoreCase) ||
                    msg.Contains("unable to connect", StringComparison.OrdinalIgnoreCase) ||
                    msg.Contains("no such host", StringComparison.OrdinalIgnoreCase) ||
                    msg.Contains("name or service not known", StringComparison.OrdinalIgnoreCase) ||
                    msg.Contains("network is unreachable", StringComparison.OrdinalIgnoreCase))
                    return true;
            }
            return false;
        }

        private static string FlattenException(Exception ex)
        {
            var detail = ex.Message;
            if (ex.InnerException != null && !string.IsNullOrWhiteSpace(ex.InnerException.Message))
                detail = $"{ex.Message} ({ex.InnerException.Message})";
            return detail;
        }
    }
}
