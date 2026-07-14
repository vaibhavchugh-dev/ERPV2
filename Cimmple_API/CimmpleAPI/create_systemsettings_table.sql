-- Create SystemSettings table if it doesn't exist
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[SystemSettings]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[SystemSettings] (
        [Id] int IDENTITY(1,1) NOT NULL,
        [TenantId] int NOT NULL,
        
        -- Date & Time Settings
        [DateFormat] nvarchar(50) NOT NULL DEFAULT 'M/d/yyyy',
        [TimeFormat] nvarchar(10) NOT NULL DEFAULT '12',
        [Timezone] nvarchar(100) NOT NULL DEFAULT 'America/New_York',
        [Locale] nvarchar(50) NOT NULL DEFAULT 'en-US',
        
        -- Currency Settings
        [DefaultCurrency] nvarchar(10) NOT NULL DEFAULT 'USD',
        [CurrencySymbol] nvarchar(10) NOT NULL DEFAULT '$',
        [DecimalPlaces] int NOT NULL DEFAULT 2,
        
        -- Number Formatting
        [DecimalSeparator] nvarchar(10) NOT NULL DEFAULT '.',
        [ThousandsSeparator] nvarchar(10) NOT NULL DEFAULT ',',
        
        -- Security Settings
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
        
        -- Email/SMTP Settings
        [SmtpServer] nvarchar(255) NULL,
        [SmtpPort] int NOT NULL DEFAULT 587,
        [SmtpUseSsl] bit NOT NULL DEFAULT 1,
        [SmtpUsername] nvarchar(255) NULL,
        [SmtpPassword] nvarchar(255) NULL,
        [SmtpFromEmail] nvarchar(255) NULL,
        [SmtpFromName] nvarchar(255) NULL,
        
        -- System Preferences
        [DefaultPageSize] int NOT NULL DEFAULT 10,
        [EnableEmailNotifications] bit NOT NULL DEFAULT 1,
        [EnableInAppNotifications] bit NOT NULL DEFAULT 1,
        
        -- Timestamps
        [CreatedDate] datetime2 NULL,
        [UpdatedDate] datetime2 NULL,
        
        CONSTRAINT [PK_SystemSettings] PRIMARY KEY ([Id])
    );
    
    -- Create index on TenantId for faster lookups
    CREATE INDEX [IX_SystemSettings_TenantId] ON [dbo].[SystemSettings] ([TenantId]);
    
    PRINT 'SystemSettings table created successfully';
END
ELSE
BEGIN
    PRINT 'SystemSettings table already exists';
END
GO

















