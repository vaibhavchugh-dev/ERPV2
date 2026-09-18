using System.Threading;
using Microsoft.EntityFrameworkCore;
using CimmpleAPI.Data;

namespace CimmpleAPI.Services
{
    /// <summary>
    /// Ensures EmailOutbox table exists for DBs that lag EF migrations.
    /// Runs at most once per process.
    /// </summary>
    public static class EmailOutboxSchemaService
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

IF OBJECT_ID(N'CimmpleFlow.EmailOutbox', N'U') IS NULL
BEGIN
    CREATE TABLE CimmpleFlow.EmailOutbox (
        [Id] int IDENTITY(1,1) NOT NULL,
        [TenantId] int NOT NULL,
        [Status] nvarchar(32) NOT NULL,
        [ToAddresses] nvarchar(1000) NOT NULL,
        [CcAddresses] nvarchar(1000) NULL,
        [Subject] nvarchar(300) NOT NULL,
        [Body] nvarchar(max) NOT NULL,
        [IsHtml] bit NOT NULL DEFAULT 0,
        [AttachmentsJson] nvarchar(max) NULL,
        [SkipNotificationGate] bit NOT NULL DEFAULT 0,
        [RelatedNotificationId] int NULL,
        [Attempts] int NOT NULL DEFAULT 0,
        [MaxAttempts] int NOT NULL DEFAULT 5,
        [LastError] nvarchar(2000) NULL,
        [CreatedUtc] datetime2 NOT NULL,
        [ProcessedUtc] datetime2 NULL,
        [LockedUntilUtc] datetime2 NULL,
        [LockedBy] nvarchar(128) NULL,
        CONSTRAINT [PK_EmailOutbox] PRIMARY KEY ([Id])
    );
    CREATE INDEX [IX_EmailOutbox_Status_Created]
        ON CimmpleFlow.EmailOutbox ([Status], [CreatedUtc]);
    CREATE INDEX [IX_EmailOutbox_Status_Locked]
        ON CimmpleFlow.EmailOutbox ([Status], [LockedUntilUtc]);
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
