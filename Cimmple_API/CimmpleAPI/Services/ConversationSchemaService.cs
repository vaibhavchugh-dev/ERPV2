using System.Threading;
using Microsoft.EntityFrameworkCore;
using CimmpleAPI.Data;

namespace CimmpleAPI.Services
{
    /// <summary>
    /// Ensures DM conversation tables exist for DBs that lag EF migrations.
    /// Runs at most once per process.
    /// </summary>
    public static class ConversationSchemaService
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

IF OBJECT_ID(N'CimmpleFlow.Conversations', N'U') IS NULL
BEGIN
    CREATE TABLE CimmpleFlow.Conversations (
        [Id] int IDENTITY(1,1) NOT NULL,
        [TenantId] int NOT NULL,
        [CreatedByUserId] int NOT NULL,
        [Subject] nvarchar(200) NULL,
        [CreatedAt] datetime2 NOT NULL,
        [LastMessageAt] datetime2 NULL,
        CONSTRAINT [PK_Conversations] PRIMARY KEY ([Id])
    );
    CREATE INDEX [IX_Conversations_Tenant_LastMessage]
        ON CimmpleFlow.Conversations ([TenantId], [LastMessageAt]);
END

IF OBJECT_ID(N'CimmpleFlow.ConversationParticipants', N'U') IS NULL
BEGIN
    CREATE TABLE CimmpleFlow.ConversationParticipants (
        [Id] int IDENTITY(1,1) NOT NULL,
        [TenantId] int NOT NULL,
        [ConversationId] int NOT NULL,
        [UserId] int NOT NULL,
        [LastReadMessageId] int NULL,
        [LastReadAt] datetime2 NULL,
        [JoinedAt] datetime2 NOT NULL,
        CONSTRAINT [PK_ConversationParticipants] PRIMARY KEY ([Id])
    );
    CREATE UNIQUE INDEX [IX_ConversationParticipants_Convo_User]
        ON CimmpleFlow.ConversationParticipants ([ConversationId], [UserId]);
    CREATE INDEX [IX_ConversationParticipants_Tenant_User]
        ON CimmpleFlow.ConversationParticipants ([TenantId], [UserId]);
END

IF OBJECT_ID(N'CimmpleFlow.ConversationMessages', N'U') IS NULL
BEGIN
    CREATE TABLE CimmpleFlow.ConversationMessages (
        [Id] int IDENTITY(1,1) NOT NULL,
        [TenantId] int NOT NULL,
        [ConversationId] int NOT NULL,
        [SenderUserId] int NOT NULL,
        [Body] nvarchar(4000) NOT NULL,
        [ParentMessageId] int NULL,
        [CreatedAt] datetime2 NOT NULL,
        CONSTRAINT [PK_ConversationMessages] PRIMARY KEY ([Id])
    );
    CREATE INDEX [IX_ConversationMessages_Convo_Created]
        ON CimmpleFlow.ConversationMessages ([ConversationId], [CreatedAt]);
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
