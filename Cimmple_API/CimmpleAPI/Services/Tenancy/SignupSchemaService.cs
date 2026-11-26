using System.Threading;
using CimmpleAPI.Data;
using Microsoft.EntityFrameworkCore;

namespace CimmpleAPI.Services.Tenancy
{
    /// <summary>
    /// Creates CimmpleFlow.SignupRequest for databases that lag the model. Runs at most once per process.
    /// Mirrors Cimmple_API/Scripts/AddSignupTrial.sql.
    /// </summary>
    public static class SignupSchemaService
    {
        private static readonly SemaphoreSlim Gate = new(1, 1);
        private static int _ensured;

        private const string CreateSql = @"
IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = N'CimmpleFlow')
BEGIN
    EXEC('CREATE SCHEMA CimmpleFlow');
END

IF OBJECT_ID(N'CimmpleFlow.SignupRequest', N'U') IS NULL
BEGIN
    CREATE TABLE CimmpleFlow.SignupRequest (
        [Id] int IDENTITY(1,1) NOT NULL,
        [FirstName] nvarchar(100) NOT NULL,
        [LastName] nvarchar(100) NOT NULL,
        [CompanyName] nvarchar(200) NOT NULL,
        [Email] nvarchar(200) NOT NULL,
        [IpAddress] nvarchar(45) NULL,
        [Status] nvarchar(32) NOT NULL,
        [Attempts] int NOT NULL CONSTRAINT [DF_SignupRequest_Attempts] DEFAULT 0,
        [TenantId] int NULL,
        [LastError] nvarchar(2000) NULL,
        [CreatedUtc] datetime2 NOT NULL,
        [NextAttemptUtc] datetime2 NULL,
        [LockedUntilUtc] datetime2 NULL,
        [CompletedUtc] datetime2 NULL,
        CONSTRAINT [PK_SignupRequest] PRIMARY KEY ([Id])
    );
    CREATE INDEX [IX_SignupRequest_Status_NextAttemptUtc] ON CimmpleFlow.SignupRequest ([Status], [NextAttemptUtc]);
    CREATE INDEX [IX_SignupRequest_IpAddress_CreatedUtc] ON CimmpleFlow.SignupRequest ([IpAddress], [CreatedUtc]);
    CREATE INDEX [IX_SignupRequest_Email_CreatedUtc] ON CimmpleFlow.SignupRequest ([Email], [CreatedUtc]);
END
";

        public static async Task EnsureAsync(CimmpleDbContext context)
        {
            if (Volatile.Read(ref _ensured) == 1)
                return;

            await Gate.WaitAsync().ConfigureAwait(false);
            try
            {
                if (Volatile.Read(ref _ensured) == 1)
                    return;

                await context.Database.ExecuteSqlRawAsync(CreateSql);
                Volatile.Write(ref _ensured, 1);
            }
            finally
            {
                Gate.Release();
            }
        }
    }
}
