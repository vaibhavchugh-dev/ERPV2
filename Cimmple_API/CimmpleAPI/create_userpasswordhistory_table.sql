-- Create UserPasswordHistory table if it doesn't exist
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

    PRINT 'UserPasswordHistory table created successfully';
END
ELSE
BEGIN
    PRINT 'UserPasswordHistory table already exists';
END
GO
