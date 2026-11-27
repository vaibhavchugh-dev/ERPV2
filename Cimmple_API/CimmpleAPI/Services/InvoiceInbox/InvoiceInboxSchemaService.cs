using System.Threading;
using CimmpleAPI.Data;
using Microsoft.EntityFrameworkCore;

namespace CimmpleAPI.Services.InvoiceInbox
{
    /// <summary>
    /// Ensures the Invoice Inbox tables exist (idempotent; same pattern as the other *SchemaService types).
    /// Runs at most once per process.
    /// </summary>
    public static class InvoiceInboxSchemaService
    {
        private static readonly SemaphoreSlim Gate = new(1, 1);
        private static int _ensured;

        public static async Task EnsureAsync(CimmpleDbContext context)
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

IF OBJECT_ID(N'CimmpleFlow.InvoiceInboxItem', N'U') IS NULL
BEGIN
    CREATE TABLE CimmpleFlow.InvoiceInboxItem (
        [Id] int IDENTITY(1,1) NOT NULL,
        [TenantId] int NOT NULL,
        [LocationId] int NOT NULL,
        [DocumentType] nvarchar(40) NOT NULL DEFAULT N'vendorInvoice',
        [Source] nvarchar(20) NOT NULL,
        [FromName] nvarchar(300) NULL,
        [FromEmail] nvarchar(320) NULL,
        [Subject] nvarchar(500) NULL,
        [BodyText] nvarchar(max) NULL,
        [BodyHtml] nvarchar(max) NULL,
        [MessageId] nvarchar(300) NOT NULL,
        [AttachmentIndex] int NOT NULL DEFAULT 0,
        [FileName] nvarchar(500) NULL,
        [ContentType] nvarchar(100) NULL,
        [FileSize] bigint NOT NULL DEFAULT 0,
        [BlobName] nvarchar(300) NULL,
        [Status] nvarchar(32) NOT NULL,
        [ExtractionJson] nvarchar(max) NULL,
        [ExtractionProvider] nvarchar(50) NULL,
        [ExtractedVendorName] nvarchar(300) NULL,
        [ExtractedInvoiceNo] nvarchar(100) NULL,
        [ExtractedTotal] decimal(18,2) NULL,
        [FailureReason] nvarchar(2000) NULL,
        [Attempts] int NOT NULL DEFAULT 0,
        [ReceivedUtc] datetime2 NOT NULL,
        [ProcessedUtc] datetime2 NULL,
        [LockedUntilUtc] datetime2 NULL,
        [VendorInvoiceId] int NULL,
        [ConvertedRecordId] int NULL,
        [ConvertedBy] int NULL,
        [ConvertedUtc] datetime2 NULL,
        CONSTRAINT [PK_InvoiceInboxItem] PRIMARY KEY ([Id])
    );
    CREATE UNIQUE INDEX [UX_InvoiceInboxItem_Message]
        ON CimmpleFlow.InvoiceInboxItem ([TenantId], [MessageId], [AttachmentIndex]);
    CREATE INDEX [IX_InvoiceInboxItem_Tenant_Status]
        ON CimmpleFlow.InvoiceInboxItem ([TenantId], [Status], [ReceivedUtc]);
    CREATE INDEX [IX_InvoiceInboxItem_Status_Locked]
        ON CimmpleFlow.InvoiceInboxItem ([Status], [LockedUntilUtc]);
END

IF COL_LENGTH(N'CimmpleFlow.InvoiceInboxItem', N'DocumentType') IS NULL
BEGIN
    ALTER TABLE CimmpleFlow.InvoiceInboxItem
        ADD [DocumentType] nvarchar(40) NOT NULL CONSTRAINT [DF_InvoiceInboxItem_DocumentType] DEFAULT N'vendorInvoice';
END

IF COL_LENGTH(N'CimmpleFlow.InvoiceInboxItem', N'ConvertedRecordId') IS NULL
BEGIN
    ALTER TABLE CimmpleFlow.InvoiceInboxItem
        ADD [ConvertedRecordId] int NULL;
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
