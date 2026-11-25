using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Http;

namespace CimmpleAPI.Services.InvoiceInbox
{
    /// <summary>Authenticates calls to the anonymous inbound-mail webhook.</summary>
    public static class InboundMailVerifier
    {
        /// <summary>
        /// True when the request carries a valid Mailgun signature or the shared secret.
        /// When neither is configured only Development is let through (so local testing works).
        /// </summary>
        public static bool IsAuthentic(
            InboundMailSettings settings,
            IFormCollection form,
            string? queryKey,
            bool isDevelopment)
        {
            if (!settings.HasVerification)
                return isDevelopment;

            if (!string.IsNullOrWhiteSpace(settings.SharedSecret)
                && !string.IsNullOrEmpty(queryKey)
                && FixedTimeEquals(queryKey, settings.SharedSecret))
            {
                return true;
            }

            if (!string.IsNullOrWhiteSpace(settings.SigningKey))
            {
                var timestamp = form["timestamp"].ToString();
                var token = form["token"].ToString();
                var signature = form["signature"].ToString();
                if (VerifyMailgunSignature(settings.SigningKey, timestamp, token, signature))
                    return true;
            }

            return false;
        }

        /// <summary>Mailgun: signature = hex(HMAC-SHA256(signingKey, timestamp + token)).</summary>
        public static bool VerifyMailgunSignature(string signingKey, string? timestamp, string? token, string? signature)
        {
            if (string.IsNullOrEmpty(signingKey)
                || string.IsNullOrEmpty(timestamp)
                || string.IsNullOrEmpty(token)
                || string.IsNullOrEmpty(signature))
            {
                return false;
            }

            using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(signingKey));
            var computed = Convert.ToHexString(hmac.ComputeHash(Encoding.UTF8.GetBytes(timestamp + token)));
            return FixedTimeEquals(computed.ToLowerInvariant(), signature.Trim().ToLowerInvariant());
        }

        private static bool FixedTimeEquals(string a, string b)
        {
            var left = Encoding.UTF8.GetBytes(a);
            var right = Encoding.UTF8.GetBytes(b);
            return left.Length == right.Length && CryptographicOperations.FixedTimeEquals(left, right);
        }
    }
}
