using CimmpleAPI.Data.Models;
using Microsoft.Extensions.Configuration;

namespace CimmpleAPI.Services
{
    /// <summary>
    /// Resolves effective SMTP settings: Cimmple-hosted (platform config) vs tenant custom SMTP.
    /// </summary>
    public static class SmtpSettingsResolver
    {
        public const string ModeHosted = "Hosted";
        public const string ModeCustom = "Custom";

        public static string NormalizeMode(string? mode)
        {
            if (string.IsNullOrWhiteSpace(mode))
                return ModeHosted;

            var m = mode.Trim();
            if (m.Equals(ModeCustom, StringComparison.OrdinalIgnoreCase) ||
                m.Equals("Own", StringComparison.OrdinalIgnoreCase) ||
                m.Equals("Tenant", StringComparison.OrdinalIgnoreCase) ||
                m.Equals("BYO", StringComparison.OrdinalIgnoreCase))
                return ModeCustom;

            return ModeHosted;
        }

        public static bool IsCustomMode(string? mode) =>
            NormalizeMode(mode) == ModeCustom;

        /// <summary>
        /// Builds the SMTP settings used for an actual send.
        /// Hosted → PlatformSmtp from configuration (tenant may override From Name).
        /// Custom → tenant SystemSettings SMTP fields.
        /// </summary>
        public static (SystemSettings? settings, string? error) Resolve(
            SystemSettings? tenantSettings,
            IConfiguration? configuration)
        {
            var mode = NormalizeMode(tenantSettings?.EmailDeliveryMode);
            var notificationsEnabled = tenantSettings?.EnableEmailNotifications ?? true;

            if (mode == ModeCustom)
            {
                if (tenantSettings == null)
                    return (null, "Email settings are not configured for this tenant.");

                var custom = CloneSmtp(tenantSettings);
                custom.EnableEmailNotifications = notificationsEnabled;
                custom.EmailDeliveryMode = ModeCustom;
                return (custom, null);
            }

            var platform = LoadPlatformSmtp(configuration);
            if (platform == null)
            {
                return (null,
                    "Cimmple-hosted email is selected, but PlatformSmtp is not configured on the server " +
                    "(Server / FromEmail / Password in appsettings). Ask your Cimmple administrator, " +
                    "or switch to Custom SMTP in System Settings → Email.");
            }

            if (string.IsNullOrEmpty(platform.SmtpPassword))
            {
                return (null,
                    "Cimmple-hosted email is selected, but PlatformSmtp:Password is empty on the server. " +
                    "Set it in API appsettings / secrets (tenants never enter this password).");
            }

            // Tenant branding overrides for display name only.
            if (tenantSettings != null && !string.IsNullOrWhiteSpace(tenantSettings.SmtpFromName))
                platform.SmtpFromName = tenantSettings.SmtpFromName.Trim();

            platform.EnableEmailNotifications = notificationsEnabled;
            platform.EmailDeliveryMode = ModeHosted;
            if (tenantSettings != null)
                platform.TenantId = tenantSettings.TenantId;

            return (platform, null);
        }

        public static SystemSettings? LoadPlatformSmtp(IConfiguration? configuration)
        {
            if (configuration == null)
                return null;

            var section = configuration.GetSection("PlatformSmtp");
            var server = section["Server"]?.Trim();
            var fromEmail = section["FromEmail"]?.Trim();
            var username = section["Username"]?.Trim();
            var password = section["Password"] ?? "";

            if (string.IsNullOrWhiteSpace(server) || string.IsNullOrWhiteSpace(fromEmail))
                return null;

            var port = 587;
            if (int.TryParse(section["Port"], out var parsedPort) && parsedPort > 0)
                port = parsedPort;

            var useSsl = true;
            if (bool.TryParse(section["UseSsl"], out var parsedSsl))
                useSsl = parsedSsl;

            return new SystemSettings
            {
                SmtpServer = server,
                SmtpPort = port,
                SmtpUseSsl = useSsl,
                SmtpUsername = string.IsNullOrWhiteSpace(username) ? fromEmail : username,
                SmtpPassword = password,
                SmtpFromEmail = fromEmail,
                SmtpFromName = section["FromName"]?.Trim() ?? "Cimmple",
                EmailDeliveryMode = ModeHosted,
                EnableEmailNotifications = true
            };
        }

        private static SystemSettings CloneSmtp(SystemSettings source) => new SystemSettings
        {
            TenantId = source.TenantId,
            SmtpServer = source.SmtpServer,
            SmtpPort = source.SmtpPort,
            SmtpUseSsl = source.SmtpUseSsl,
            SmtpUsername = source.SmtpUsername,
            SmtpPassword = source.SmtpPassword,
            SmtpFromEmail = source.SmtpFromEmail,
            SmtpFromName = source.SmtpFromName,
            EmailDeliveryMode = source.EmailDeliveryMode,
            EnableEmailNotifications = source.EnableEmailNotifications
        };
    }
}
