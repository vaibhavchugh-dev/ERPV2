using System.Threading;
using CimmpleAPI.Data;
using Microsoft.EntityFrameworkCore;

namespace CimmpleAPI.Services
{
    /// <summary>
    /// Creates CimmpleFlow.Tenant and registers every tenant id already used by
    /// EntityMaster / UserDetails / UserRole as an Active tenant, so new tenants never reuse an id.
    /// Mirrors Cimmple_API/Scripts/AddTenantRegistry.sql.
    /// </summary>
    public static class TenantSchemaService
    {
        private static readonly SemaphoreSlim Gate = new(1, 1);
        private static int _tableEnsured;

        private const string CreateTableSql = @"
IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = N'CimmpleFlow')
BEGIN
    EXEC('CREATE SCHEMA CimmpleFlow');
END

IF OBJECT_ID(N'CimmpleFlow.Tenant', N'U') IS NULL
BEGIN
    CREATE TABLE CimmpleFlow.Tenant (
        [TenantId] int IDENTITY(1,1) NOT NULL,
        [Name] nvarchar(200) NOT NULL,
        [Code] nvarchar(50) NULL,
        [Status] nvarchar(20) NOT NULL,
        [Plan] nvarchar(50) NULL,
        [ContactName] nvarchar(200) NULL,
        [ContactEmail] nvarchar(200) NULL,
        [Notes] nvarchar(2000) NULL,
        [SeedVersion] int NOT NULL CONSTRAINT [DF_Tenant_SeedVersion] DEFAULT 0,
        [LastProvisioningError] nvarchar(2000) NULL,
        [CreatedBy] nvarchar(100) NULL,
        [CreatedUtc] datetime2 NOT NULL,
        [ProvisionedUtc] datetime2 NULL,
        [StatusChangedUtc] datetime2 NULL,
        CONSTRAINT [PK_Tenant] PRIMARY KEY ([TenantId])
    );
    CREATE UNIQUE INDEX [IX_Tenant_Code] ON CimmpleFlow.Tenant ([Code]) WHERE [Code] IS NOT NULL;
END
";

        /// <summary>
        /// Registers tenant ids that exist in data but not in the registry. Inserting an explicit id
        /// larger than the current identity moves the identity forward, so the next new tenant gets a fresh id.
        /// </summary>
        private const string BackfillSql = @"
SET XACT_ABORT ON;
BEGIN TRAN;
DECLARE @lock int;
EXEC @lock = sp_getapplock @Resource = 'cimmple-tenant-registry', @LockMode = 'Exclusive', @LockOwner = 'Transaction', @LockTimeout = 15000;
IF @lock < 0 THROW 51000, 'Tenant registry is busy, please try again.', 1;

IF EXISTS (
    SELECT 1 FROM (
        SELECT Tenantid AS TenantId FROM CimmpleFlow.EntityMaster WHERE Tenantid > 0
        UNION SELECT TenantID FROM CimmpleFlow.UserDetails WHERE TenantID > 0
        UNION SELECT TenantId FROM CimmpleFlow.UserRole WHERE TenantId > 0
    ) ids
    WHERE NOT EXISTS (SELECT 1 FROM CimmpleFlow.Tenant t WHERE t.TenantId = ids.TenantId))
BEGIN
    SET IDENTITY_INSERT CimmpleFlow.Tenant ON;

    WITH ids AS (
        SELECT Tenantid AS TenantId FROM CimmpleFlow.EntityMaster WHERE Tenantid > 0
        UNION SELECT TenantID FROM CimmpleFlow.UserDetails WHERE TenantID > 0
        UNION SELECT TenantId FROM CimmpleFlow.UserRole WHERE TenantId > 0
    )
    INSERT INTO CimmpleFlow.Tenant (TenantId, Name, Status, SeedVersion, CreatedBy, CreatedUtc, ProvisionedUtc, StatusChangedUtc)
    SELECT i.TenantId,
           COALESCE(NULLIF(LTRIM(RTRIM(e.company_name)), ''), CONCAT('Tenant ', i.TenantId)),
           'Active', 0, 'backfill', SYSUTCDATETIME(), SYSUTCDATETIME(), SYSUTCDATETIME()
    FROM ids i
    OUTER APPLY (SELECT TOP 1 em.company_name FROM CimmpleFlow.EntityMaster em
                 WHERE em.Tenantid = i.TenantId ORDER BY em.entityid) e
    WHERE NOT EXISTS (SELECT 1 FROM CimmpleFlow.Tenant t WHERE t.TenantId = i.TenantId);

    SET IDENTITY_INSERT CimmpleFlow.Tenant OFF;
END

COMMIT;
";

        public static async Task EnsureAsync(CimmpleDbContext context)
        {
            await EnsureTableAsync(context);
            await context.Database.ExecuteSqlRawAsync(BackfillSql);
        }

        public static async Task EnsureTableAsync(CimmpleDbContext context)
        {
            if (Volatile.Read(ref _tableEnsured) == 1)
                return;

            await Gate.WaitAsync().ConfigureAwait(false);
            try
            {
                if (Volatile.Read(ref _tableEnsured) == 1)
                    return;

                await context.Database.ExecuteSqlRawAsync(CreateTableSql);
                Volatile.Write(ref _tableEnsured, 1);
            }
            finally
            {
                Gate.Release();
            }
        }
    }
}
