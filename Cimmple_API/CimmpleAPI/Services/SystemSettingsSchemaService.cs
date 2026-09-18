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
        [EmailDeliveryMode] nvarchar(20) NULL DEFAULT 'Hosted',
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

            // Must be a separate batch from CREATE/other statements: SQL Server compiles the
            // whole batch and rejects UPDATE referencing a column that is only ADD'ed above.
            await EnsureEmailDeliveryModeColumnAsync(context);
            await EnsureLoginSchemaAsync(context);
        }

        /// <summary>
        /// Columns/tables required by /api/Auth/Login. Missing ones produce IIS 500 with an empty body.
        /// </summary>
        public static async Task EnsureLoginSchemaAsync(CimmpleDbContext context)
        {
            await context.Database.ExecuteSqlRawAsync(@"
IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = N'CimmpleFlow')
    EXEC(N'CREATE SCHEMA CimmpleFlow');

IF OBJECT_ID(N'CimmpleFlow.UserDetails', N'U') IS NULL
   AND OBJECT_ID(N'CimmpleFlow.UserDetails', N'SN') IS NULL
   AND OBJECT_ID(N'dbo.UserDetails', N'U') IS NOT NULL
    EXEC(N'CREATE SYNONYM CimmpleFlow.UserDetails FOR dbo.UserDetails');
");

            await AddUserDetailsLoginColumnsAsync(context, "dbo.UserDetails");
            await AddUserDetailsLoginColumnsAsync(context, "CimmpleFlow.UserDetails");
            await EnsureEmailDeliveryModeColumnAsync(context);

            await context.Database.ExecuteSqlRawAsync(@"
IF OBJECT_ID(N'dbo.SystemSettings', N'U') IS NOT NULL
AND COL_LENGTH(N'dbo.SystemSettings', N'EmailDeliveryMode') IS NULL
    EXEC(N'ALTER TABLE dbo.SystemSettings ADD EmailDeliveryMode nvarchar(20) NULL');

IF OBJECT_ID(N'CimmpleFlow.UserRole', N'U') IS NOT NULL
AND COL_LENGTH(N'CimmpleFlow.UserRole', N'RoleTag') IS NULL
    EXEC(N'ALTER TABLE CimmpleFlow.UserRole ADD RoleTag nvarchar(max) NULL');

IF OBJECT_ID(N'dbo.UserRole', N'U') IS NOT NULL
AND COL_LENGTH(N'dbo.UserRole', N'RoleTag') IS NULL
    EXEC(N'ALTER TABLE dbo.UserRole ADD RoleTag nvarchar(max) NULL');

IF OBJECT_ID(N'CimmpleFlow.Locations', N'U') IS NOT NULL
AND COL_LENGTH(N'CimmpleFlow.Locations', N'LocType') IS NULL
    EXEC(N'ALTER TABLE CimmpleFlow.Locations ADD LocType INT NOT NULL CONSTRAINT DF_Flow_Locations_LocType DEFAULT (0)');

IF OBJECT_ID(N'CimmpleFlow.Locations', N'U') IS NOT NULL
AND COL_LENGTH(N'CimmpleFlow.Locations', N'ParentLocationId') IS NULL
    EXEC(N'ALTER TABLE CimmpleFlow.Locations ADD ParentLocationId INT NULL');
");
        }

        private static async Task AddUserDetailsLoginColumnsAsync(CimmpleDbContext context, string tableName)
        {
            var constraintPrefix = tableName.Replace(".", "_");
            await context.Database.ExecuteSqlRawAsync($@"
IF OBJECT_ID(N'{tableName}', N'U') IS NOT NULL
BEGIN
    IF COL_LENGTH(N'{tableName}', N'DefaultLocationId') IS NULL
        EXEC(N'ALTER TABLE {tableName} ADD DefaultLocationId INT NULL');
    IF COL_LENGTH(N'{tableName}', N'CanAccessAllLocations') IS NULL
        EXEC(N'ALTER TABLE {tableName} ADD CanAccessAllLocations BIT NOT NULL CONSTRAINT DF_{constraintPrefix}_CanAccessAllLocations DEFAULT (0)');
    IF COL_LENGTH(N'{tableName}', N'FailedLoginCount') IS NULL
        EXEC(N'ALTER TABLE {tableName} ADD FailedLoginCount INT NOT NULL CONSTRAINT DF_{constraintPrefix}_FailedLoginCount DEFAULT (0)');
    IF COL_LENGTH(N'{tableName}', N'LockoutEndUtc') IS NULL
        EXEC(N'ALTER TABLE {tableName} ADD LockoutEndUtc DATETIME2 NULL');
    IF COL_LENGTH(N'{tableName}', N'ProfilePic') IS NULL
        EXEC(N'ALTER TABLE {tableName} ADD ProfilePic nvarchar(max) NULL');
    IF COL_LENGTH(N'{tableName}', N'Department') IS NULL
        EXEC(N'ALTER TABLE {tableName} ADD Department nvarchar(max) NULL');
    IF COL_LENGTH(N'{tableName}', N'EmployeeCategory') IS NULL
        EXEC(N'ALTER TABLE {tableName} ADD EmployeeCategory nvarchar(max) NULL');
    IF COL_LENGTH(N'{tableName}', N'Apartment') IS NULL
        EXEC(N'ALTER TABLE {tableName} ADD Apartment nvarchar(max) NULL');
    IF COL_LENGTH(N'{tableName}', N'PasswordSalt') IS NULL
        EXEC(N'ALTER TABLE {tableName} ADD PasswordSalt nvarchar(max) NULL');
    IF COL_LENGTH(N'{tableName}', N'VendorId') IS NULL
        EXEC(N'ALTER TABLE {tableName} ADD VendorId INT NULL');
END");
        }

        private static async Task EnsureEmailDeliveryModeColumnAsync(CimmpleDbContext context)
        {
            await context.Database.ExecuteSqlRawAsync(@"
IF OBJECT_ID(N'CimmpleFlow.SystemSettings', N'U') IS NOT NULL
AND NOT EXISTS (
    SELECT 1
    FROM sys.columns c
    INNER JOIN sys.tables t ON c.object_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = N'CimmpleFlow'
      AND t.name = N'SystemSettings'
      AND c.name = N'EmailDeliveryMode'
)
BEGIN
    ALTER TABLE CimmpleFlow.SystemSettings ADD [EmailDeliveryMode] nvarchar(20) NULL;
END");

            await context.Database.ExecuteSqlRawAsync(@"
IF OBJECT_ID(N'CimmpleFlow.SystemSettings', N'U') IS NOT NULL
AND EXISTS (
    SELECT 1
    FROM sys.columns c
    INNER JOIN sys.tables t ON c.object_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = N'CimmpleFlow'
      AND t.name = N'SystemSettings'
      AND c.name = N'EmailDeliveryMode'
)
BEGIN
    UPDATE CimmpleFlow.SystemSettings
    SET EmailDeliveryMode = N'Custom'
    WHERE EmailDeliveryMode IS NULL
      AND NULLIF(LTRIM(RTRIM(SmtpServer)), N'') IS NOT NULL;

    UPDATE CimmpleFlow.SystemSettings
    SET EmailDeliveryMode = N'Hosted'
    WHERE EmailDeliveryMode IS NULL;
END");
        }

        public static bool IsMissingTableException(Exception ex)
        {
            var message = ex.Message;
            if (ex.InnerException != null)
                message += " " + ex.InnerException.Message;

            return message.Contains("Invalid object name", StringComparison.OrdinalIgnoreCase)
                || message.Contains("Invalid column name", StringComparison.OrdinalIgnoreCase)
                || message.Contains("does not exist", StringComparison.OrdinalIgnoreCase);
        }
    }
}
