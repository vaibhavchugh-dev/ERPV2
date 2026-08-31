using Microsoft.EntityFrameworkCore;
using CimmpleAPI.Data;

namespace CimmpleAPI.Services
{
    /// <summary>
    /// Ensures optional settings-related tables exist (for DBs created before migrations included them).
    /// </summary>
    public static class SystemSettingsSchemaService
    {
        public static async Task EnsureTablesAsync(CimmpleDbContext context)
        {
            await context.Database.ExecuteSqlRawAsync(@"
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[SystemSettings]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[SystemSettings] (
        [Id] int IDENTITY(1,1) NOT NULL,
        [TenantId] int NOT NULL,
        [DateFormat] nvarchar(50) NOT NULL DEFAULT 'M/d/yyyy',
        [TimeFormat] nvarchar(10) NOT NULL DEFAULT '12',
        [Timezone] nvarchar(100) NOT NULL DEFAULT 'America/New_York',
        [Locale] nvarchar(50) NOT NULL DEFAULT 'en-US',
        [DefaultCurrency] nvarchar(10) NOT NULL DEFAULT 'USD',
        [CurrencySymbol] nvarchar(10) NOT NULL DEFAULT '$',
        [DecimalPlaces] int NOT NULL DEFAULT 2,
        [DecimalSeparator] nvarchar(10) NOT NULL DEFAULT '.',
        [ThousandsSeparator] nvarchar(10) NOT NULL DEFAULT ',',
        [MinPasswordLength] int NOT NULL DEFAULT 8,
        [RequireUppercase] bit NOT NULL DEFAULT 1,
        [RequireLowercase] bit NOT NULL DEFAULT 1,
        [RequireNumbers] bit NOT NULL DEFAULT 1,
        [RequireSpecialChars] bit NOT NULL DEFAULT 0,
        [PasswordExpirationDays] int NOT NULL DEFAULT 90,
        [PasswordHistoryCount] int NOT NULL DEFAULT 5,
        [SessionTimeoutMinutes] int NOT NULL DEFAULT 30,
        [MaxConcurrentSessions] int NOT NULL DEFAULT 3,
        [FailedLoginAttempts] int NOT NULL DEFAULT 5,
        [AccountLockoutMinutes] int NOT NULL DEFAULT 15,
        [SmtpServer] nvarchar(255) NULL,
        [SmtpPort] int NOT NULL DEFAULT 587,
        [SmtpUseSsl] bit NOT NULL DEFAULT 1,
        [SmtpUsername] nvarchar(255) NULL,
        [SmtpPassword] nvarchar(255) NULL,
        [SmtpFromEmail] nvarchar(255) NULL,
        [SmtpFromName] nvarchar(255) NULL,
        [DefaultPageSize] int NOT NULL DEFAULT 10,
        [EnableEmailNotifications] bit NOT NULL DEFAULT 1,
        [EnableInAppNotifications] bit NOT NULL DEFAULT 1,
        [CreatedDate] datetime2 NULL,
        [UpdatedDate] datetime2 NULL,
        CONSTRAINT [PK_SystemSettings] PRIMARY KEY ([Id])
    );
    CREATE INDEX [IX_SystemSettings_TenantId] ON [dbo].[SystemSettings] ([TenantId]);
END");

            await context.Database.ExecuteSqlRawAsync(@"
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[UserPasswordHistory]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[UserPasswordHistory] (
        [Id] int IDENTITY(1,1) NOT NULL,
        [UserId] int NOT NULL,
        [TenantId] int NOT NULL,
        [PasswordHash] nvarchar(max) NOT NULL,
        [PasswordSalt] nvarchar(max) NOT NULL,
        [CreatedDate] datetime2 NOT NULL,
        CONSTRAINT [PK_UserPasswordHistory] PRIMARY KEY ([Id])
    );
    CREATE INDEX [IX_UserPasswordHistory_UserId_CreatedDate]
        ON [dbo].[UserPasswordHistory] ([UserId], [CreatedDate] DESC);
END");
        }

        public static bool IsMissingTableException(Exception ex)
        {
            var message = ex.Message;
            if (ex.InnerException != null)
                message += " " + ex.InnerException.Message;

            return message.Contains("Invalid object name", StringComparison.OrdinalIgnoreCase)
                || message.Contains("does not exist", StringComparison.OrdinalIgnoreCase);
        }
    }
}
