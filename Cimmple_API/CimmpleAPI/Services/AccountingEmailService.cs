using CimmpleAPI.Data.Models;

namespace CimmpleAPI.Services
{
    /// <summary>
    /// Backward-compatible wrapper; prefer <see cref="EmailService"/> for new callers.
    /// </summary>
    public static class AccountingEmailService
    {
        public static (bool ok, string? error) TrySend(
            SystemSettings settings,
            string toEmail,
            string subject,
            string body)
        {
            return EmailService.TrySend(settings, toEmail, subject, body, isHtml: false);
        }
    }
}
