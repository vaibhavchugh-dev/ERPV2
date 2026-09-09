using System.Net;
using System.Net.Mail;
using CimmpleAPI.Data.Models;

namespace CimmpleAPI.Services
{
    public static class AccountingEmailService
    {
        public static (bool ok, string? error) TrySend(
            SystemSettings settings,
            string toEmail,
            string subject,
            string body)
        {
            if (settings == null)
                return (false, "Email settings are not configured.");

            if (!settings.EnableEmailNotifications)
                return (false, "Email notifications are disabled in System Settings.");

            if (string.IsNullOrWhiteSpace(settings.SmtpServer) ||
                string.IsNullOrWhiteSpace(settings.SmtpFromEmail))
                return (false, "SMTP server / from address is not configured in System Settings.");

            if (string.IsNullOrWhiteSpace(toEmail))
                return (false, "Recipient email address is missing.");

            try
            {
                using var client = new SmtpClient(settings.SmtpServer, settings.SmtpPort)
                {
                    EnableSsl = settings.SmtpUseSsl,
                    DeliveryMethod = SmtpDeliveryMethod.Network,
                    UseDefaultCredentials = false
                };

                if (!string.IsNullOrWhiteSpace(settings.SmtpUsername))
                {
                    client.Credentials = new NetworkCredential(
                        settings.SmtpUsername,
                        settings.SmtpPassword ?? "");
                }

                using var message = new MailMessage
                {
                    From = new MailAddress(
                        settings.SmtpFromEmail.Trim(),
                        string.IsNullOrWhiteSpace(settings.SmtpFromName)
                            ? settings.SmtpFromEmail.Trim()
                            : settings.SmtpFromName.Trim()),
                    Subject = subject,
                    Body = body,
                    IsBodyHtml = false
                };
                message.To.Add(toEmail.Trim());
                client.Send(message);
                return (true, null);
            }
            catch (Exception ex)
            {
                return (false, ex.Message);
            }
        }
    }
}
