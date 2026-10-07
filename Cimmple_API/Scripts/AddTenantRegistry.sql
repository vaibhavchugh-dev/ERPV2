/*
  Tenant registry (CimmpleFlow.Tenant).
  The API runs the same statements at startup (Services/TenantSchemaService.cs); this script is
  for DBAs who prefer to apply schema changes ahead of a deployment. Safe to run repeatedly.

  Existing tenant ids found in EntityMaster / UserDetails / UserRole are registered as Active,
  and the identity moves past the highest id so new tenants never reuse one.
*/

IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = N'CimmpleFlow')
BEGIN
    EXEC('CREATE SCHEMA CimmpleFlow');
END
GO

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
GO

SET XACT_ABORT ON;
BEGIN TRAN;
DECLARE @lock int;
EXEC @lock = sp_getapplock @Resource = 'cimmple-tenant-registry', @LockMode = 'Exclusive', @LockOwner = 'Transaction', @LockTimeout = 15000;
IF @lock < 0 THROW 51000, 'Tenant registry is busy, please try again.', 1;

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
COMMIT;
GO
