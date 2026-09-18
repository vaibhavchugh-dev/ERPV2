using Microsoft.EntityFrameworkCore;
using CimmpleAPI.Data;

namespace CimmpleAPI.Services
{
    /// <summary>
    /// Ensures Notifications table exists for DBs that lag EF migrations.
    /// </summary>
    public static class NotificationSchemaService
    {
        public static async Task EnsureTablesAsync(CimmpleDbContext context)
        {
            await context.Database.ExecuteSqlRawAsync(@"
IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = N'CimmpleFlow')
BEGIN
    EXEC('CREATE SCHEMA CimmpleFlow');
END

IF OBJECT_ID(N'CimmpleFlow.Notifications', N'U') IS NULL
BEGIN
    CREATE TABLE CimmpleFlow.Notifications (
        [Id] int IDENTITY(1,1) NOT NULL,
        [TenantId] int NOT NULL,
        [RecipientUserId] int NOT NULL,
        [ActorUserId] int NULL,
        [Type] nvarchar(64) NOT NULL,
        [Title] nvarchar(200) NOT NULL,
        [Body] nvarchar(4000) NOT NULL,
        [EntityType] nvarchar(64) NULL,
        [EntityId] int NULL,
        [LinkPath] nvarchar(500) NULL,
        [IsRead] bit NOT NULL DEFAULT 0,
        [ReadAt] datetime2 NULL,
        [EmailSent] bit NOT NULL DEFAULT 0,
        [EmailSentAt] datetime2 NULL,
        [CreatedAt] datetime2 NOT NULL,
        CONSTRAINT [PK_Notifications] PRIMARY KEY ([Id])
    );
    CREATE INDEX [IX_Notifications_Tenant_Recipient_Read_Created]
        ON CimmpleFlow.Notifications ([TenantId], [RecipientUserId], [IsRead], [CreatedAt]);
END
");
        }
    }
}
