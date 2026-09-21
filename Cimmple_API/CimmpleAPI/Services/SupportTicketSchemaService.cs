using System.Threading;
using Microsoft.EntityFrameworkCore;
using CimmpleAPI.Data;

namespace CimmpleAPI.Services
{
    /// <summary>
    /// Ensures SupportTickets (+ messages / Product) exist for DBs that lag EF migrations.
    /// Runs at most once per process.
    /// </summary>
    public static class SupportTicketSchemaService
    {
        private static readonly SemaphoreSlim Gate = new(1, 1);
        private static int _ensured;

        public static async Task EnsureTablesAsync(CimmpleDbContext context)
        {
            if (Volatile.Read(ref _ensured) == 1)
                return;

            await Gate.WaitAsync().ConfigureAwait(false);
            try
            {
                if (Volatile.Read(ref _ensured) == 1)
                    return;

                await context.Database.ExecuteSqlRawAsync(@"
IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = N'CimmpleFlow')
BEGIN
    EXEC('CREATE SCHEMA CimmpleFlow');
END

IF OBJECT_ID(N'CimmpleFlow.SupportTickets', N'U') IS NULL
BEGIN
    CREATE TABLE CimmpleFlow.SupportTickets (
        [Id] int IDENTITY(1,1) NOT NULL,
        [TenantId] int NOT NULL,
        [CreatedByUserId] int NOT NULL,
        [Product] nvarchar(40) NOT NULL CONSTRAINT [DF_SupportTickets_Product] DEFAULT (N'CimmpleFlow'),
        [Category] nvarchar(40) NOT NULL,
        [Subject] nvarchar(200) NOT NULL,
        [Description] nvarchar(4000) NOT NULL,
        [Status] nvarchar(32) NOT NULL,
        [AppSource] nvarchar(20) NOT NULL,
        [AppVersion] nvarchar(40) NULL,
        [UserAgent] nvarchar(500) NULL,
        [LocationId] int NULL,
        [EntityType] nvarchar(80) NULL,
        [EntityId] int NULL,
        [LinkPath] nvarchar(500) NULL,
        [AttachmentBlobName] nvarchar(260) NULL,
        [AttachmentFileName] nvarchar(260) NULL,
        [EmailQueued] bit NOT NULL CONSTRAINT [DF_SupportTickets_EmailQueued] DEFAULT (0),
        [EmailError] nvarchar(500) NULL,
        [ClientHasUnread] bit NOT NULL CONSTRAINT [DF_SupportTickets_ClientHasUnread] DEFAULT (0),
        [CreatedAt] datetime2 NOT NULL,
        [UpdatedAt] datetime2 NOT NULL,
        [LastMessageAt] datetime2 NULL,
        CONSTRAINT [PK_SupportTickets] PRIMARY KEY ([Id])
    );
    CREATE INDEX [IX_SupportTickets_Tenant_User_Created]
        ON CimmpleFlow.SupportTickets ([TenantId], [CreatedByUserId], [CreatedAt]);
    CREATE INDEX [IX_SupportTickets_Tenant_Status]
        ON CimmpleFlow.SupportTickets ([TenantId], [Status]);
    CREATE INDEX [IX_SupportTickets_Product_Status_Updated]
        ON CimmpleFlow.SupportTickets ([Product], [Status], [UpdatedAt]);
END

IF OBJECT_ID(N'CimmpleFlow.SupportTickets', N'U') IS NOT NULL
   AND COL_LENGTH(N'CimmpleFlow.SupportTickets', N'Product') IS NULL
BEGIN
    ALTER TABLE CimmpleFlow.SupportTickets
        ADD [Product] nvarchar(40) NOT NULL
            CONSTRAINT [DF_SupportTickets_Product] DEFAULT (N'CimmpleFlow');
END

IF OBJECT_ID(N'CimmpleFlow.SupportTickets', N'U') IS NOT NULL
   AND COL_LENGTH(N'CimmpleFlow.SupportTickets', N'LastMessageAt') IS NULL
BEGIN
    ALTER TABLE CimmpleFlow.SupportTickets ADD [LastMessageAt] datetime2 NULL;
END

IF OBJECT_ID(N'CimmpleFlow.SupportTickets', N'U') IS NOT NULL
   AND COL_LENGTH(N'CimmpleFlow.SupportTickets', N'ClientHasUnread') IS NULL
BEGIN
    ALTER TABLE CimmpleFlow.SupportTickets
        ADD [ClientHasUnread] bit NOT NULL
            CONSTRAINT [DF_SupportTickets_ClientHasUnread] DEFAULT (0);
END

IF OBJECT_ID(N'CimmpleFlow.SupportTickets', N'U') IS NOT NULL
   AND NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name = N'IX_SupportTickets_Product_Status_Updated'
          AND object_id = OBJECT_ID(N'CimmpleFlow.SupportTickets'))
BEGIN
    CREATE INDEX [IX_SupportTickets_Product_Status_Updated]
        ON CimmpleFlow.SupportTickets ([Product], [Status], [UpdatedAt]);
END

IF OBJECT_ID(N'CimmpleFlow.SupportTicketMessages', N'U') IS NULL
BEGIN
    CREATE TABLE CimmpleFlow.SupportTicketMessages (
        [Id] int IDENTITY(1,1) NOT NULL,
        [TicketId] int NOT NULL,
        [TenantId] int NOT NULL,
        [AuthorType] nvarchar(20) NOT NULL,
        [AuthorUserId] int NULL,
        [AuthorName] nvarchar(120) NOT NULL,
        [Body] nvarchar(4000) NOT NULL,
        [EmailQueued] bit NOT NULL CONSTRAINT [DF_SupportTicketMessages_EmailQueued] DEFAULT (0),
        [EmailError] nvarchar(500) NULL,
        [CreatedAt] datetime2 NOT NULL,
        CONSTRAINT [PK_SupportTicketMessages] PRIMARY KEY ([Id])
    );
    CREATE INDEX [IX_SupportTicketMessages_Ticket_Created]
        ON CimmpleFlow.SupportTicketMessages ([TicketId], [CreatedAt]);
END
");
                Volatile.Write(ref _ensured, 1);
            }
            finally
            {
                Gate.Release();
            }
        }
    }
}
