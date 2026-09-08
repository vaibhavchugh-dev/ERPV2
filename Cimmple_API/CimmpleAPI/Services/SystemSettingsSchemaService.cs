using Microsoft.EntityFrameworkCore;
using CimmpleAPI.Data;

namespace CimmpleAPI.Services
{
    /// <summary>
    /// Ensures optional settings-related tables exist (for DBs created before migrations included them).
    /// Tables must live in CimmpleFlow to match EF HasDefaultSchema(DbSchema.Flow).
    /// </summary>
    public static class SystemSettingsSchemaService
    {
        public static async Task EnsureTablesAsync(CimmpleDbContext context)
        {
            await context.Database.ExecuteSqlRawAsync(@"
IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = N'CimmpleFlow')
BEGIN
    EXEC('CREATE SCHEMA CimmpleFlow');
END

IF OBJECT_ID(N'CimmpleFlow.SystemSettings', N'U') IS NULL
BEGIN
    CREATE TABLE CimmpleFlow.SystemSettings (
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
    CREATE INDEX [IX_SystemSettings_TenantId] ON CimmpleFlow.SystemSettings ([TenantId]);
END

-- Copy/sync from legacy dbo table when CimmpleFlow is missing tenant rows
IF OBJECT_ID(N'dbo.SystemSettings', N'U') IS NOT NULL
   AND OBJECT_ID(N'CimmpleFlow.SystemSettings', N'U') IS NOT NULL
BEGIN
    INSERT INTO CimmpleFlow.SystemSettings (
        [TenantId], [DateFormat], [TimeFormat], [Timezone], [Locale],
        [DefaultCurrency], [CurrencySymbol], [DecimalPlaces], [DecimalSeparator], [ThousandsSeparator],
        [MinPasswordLength], [RequireUppercase], [RequireLowercase], [RequireNumbers], [RequireSpecialChars],
        [PasswordExpirationDays], [PasswordHistoryCount], [SessionTimeoutMinutes], [MaxConcurrentSessions],
        [FailedLoginAttempts], [AccountLockoutMinutes],
        [SmtpServer], [SmtpPort], [SmtpUseSsl], [SmtpUsername], [SmtpPassword], [SmtpFromEmail], [SmtpFromName],
        [DefaultPageSize], [EnableEmailNotifications], [EnableInAppNotifications], [CreatedDate], [UpdatedDate]
    )
    SELECT
        [TenantId], [DateFormat], [TimeFormat], [Timezone], [Locale],
        [DefaultCurrency], [CurrencySymbol], [DecimalPlaces], [DecimalSeparator], [ThousandsSeparator],
        [MinPasswordLength], [RequireUppercase], [RequireLowercase], [RequireNumbers], [RequireSpecialChars],
        [PasswordExpirationDays], [PasswordHistoryCount], [SessionTimeoutMinutes], [MaxConcurrentSessions],
        [FailedLoginAttempts], [AccountLockoutMinutes],
        [SmtpServer], [SmtpPort], [SmtpUseSsl], [SmtpUsername], [SmtpPassword], [SmtpFromEmail], [SmtpFromName],
        [DefaultPageSize], [EnableEmailNotifications], [EnableInAppNotifications], [CreatedDate], [UpdatedDate]
    FROM dbo.SystemSettings s
    WHERE NOT EXISTS (
        SELECT 1 FROM CimmpleFlow.SystemSettings t WHERE t.TenantId = s.TenantId
    );
END

IF OBJECT_ID(N'CimmpleFlow.UserPasswordHistory', N'U') IS NULL
BEGIN
    CREATE TABLE CimmpleFlow.UserPasswordHistory (
        [Id] int IDENTITY(1,1) NOT NULL,
        [UserId] int NOT NULL,
        [TenantId] int NOT NULL,
        [PasswordHash] nvarchar(max) NOT NULL,
        [PasswordSalt] nvarchar(max) NOT NULL,
        [CreatedDate] datetime2 NOT NULL,
        CONSTRAINT [PK_UserPasswordHistory] PRIMARY KEY ([Id])
    );
    CREATE INDEX [IX_UserPasswordHistory_UserId_CreatedDate]
        ON CimmpleFlow.UserPasswordHistory ([UserId], [CreatedDate] DESC);
END

IF OBJECT_ID(N'dbo.UserPasswordHistory', N'U') IS NOT NULL
   AND OBJECT_ID(N'CimmpleFlow.UserPasswordHistory', N'U') IS NOT NULL
BEGIN
    INSERT INTO CimmpleFlow.UserPasswordHistory (
        [UserId], [TenantId], [PasswordHash], [PasswordSalt], [CreatedDate]
    )
    SELECT d.[UserId], d.[TenantId], d.[PasswordHash], d.[PasswordSalt], d.[CreatedDate]
    FROM dbo.UserPasswordHistory d
    WHERE NOT EXISTS (
        SELECT 1 FROM CimmpleFlow.UserPasswordHistory t
        WHERE t.UserId = d.UserId AND t.CreatedDate = d.CreatedDate AND t.PasswordHash = d.PasswordHash
    );
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
