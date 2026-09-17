/*
================================================================================
  Replay pack: Priority-3 smaller fixes → CimmpleERPDB
  Target: CimmpleERPDB (CimmpleFlow / dbo / CimmplePunch)

  Run in SSMS after Priority 1 and 2. Safe to re-run (idempotent).
  Skips DecimalReceiveAndShipQty (marked SUPERSEDED in repo).
================================================================================
*/

SET NOCOUNT ON;

IF DB_ID(N'CimmpleERPDB') IS NULL
BEGIN
    RAISERROR(N'Database CimmpleERPDB was not found on this server. Aborting.', 16, 1);
    RETURN;
END

USE CimmpleERPDB;
PRINT N'=== Priority-3 replay on ' + DB_NAME() + N' ===';
GO

/* --------------------------------------------------------------------------
   1) VendorOrderAttachments Azure columns
   -------------------------------------------------------------------------- */
PRINT N'--- VendorOrderAttachments Azure columns ---';
GO

IF OBJECT_ID(N'CimmpleFlow.VendorOrderAttachments', N'U') IS NOT NULL
   AND COL_LENGTH(N'CimmpleFlow.VendorOrderAttachments', N'FileUniqueno') IS NULL
BEGIN
    ALTER TABLE CimmpleFlow.VendorOrderAttachments ADD FileUniqueno INT NOT NULL CONSTRAINT DF_CF_VOA_FileUniqueno DEFAULT (0);
END
GO

IF OBJECT_ID(N'CimmpleFlow.VendorOrderAttachments', N'U') IS NOT NULL
   AND COL_LENGTH(N'CimmpleFlow.VendorOrderAttachments', N'UploadFile') IS NULL
BEGIN
    ALTER TABLE CimmpleFlow.VendorOrderAttachments ADD UploadFile NVARCHAR(500) NULL;
END
GO

IF OBJECT_ID(N'CimmpleFlow.VendorOrderAttachments', N'U') IS NOT NULL
   AND COL_LENGTH(N'CimmpleFlow.VendorOrderAttachments', N'TenantID') IS NULL
BEGIN
    ALTER TABLE CimmpleFlow.VendorOrderAttachments ADD TenantID INT NOT NULL CONSTRAINT DF_CF_VOA_TenantID DEFAULT (0);
END
GO

IF OBJECT_ID(N'CimmpleFlow.VendorOrderAttachments', N'U') IS NOT NULL
   AND COL_LENGTH(N'CimmpleFlow.VendorOrderAttachments', N'createdby') IS NULL
BEGIN
    ALTER TABLE CimmpleFlow.VendorOrderAttachments ADD createdby INT NOT NULL CONSTRAINT DF_CF_VOA_createdby DEFAULT (0);
END
GO

IF OBJECT_ID(N'dbo.VendorOrderAttachments', N'U') IS NOT NULL
   AND COL_LENGTH(N'dbo.VendorOrderAttachments', N'FileUniqueno') IS NULL
BEGIN
    ALTER TABLE dbo.VendorOrderAttachments ADD FileUniqueno INT NOT NULL CONSTRAINT DF_VendorOrderAttachments_FileUniqueno DEFAULT (0);
END
GO

IF OBJECT_ID(N'dbo.VendorOrderAttachments', N'U') IS NOT NULL
   AND COL_LENGTH(N'dbo.VendorOrderAttachments', N'UploadFile') IS NULL
BEGIN
    ALTER TABLE dbo.VendorOrderAttachments ADD UploadFile NVARCHAR(500) NULL;
END
GO

IF OBJECT_ID(N'dbo.VendorOrderAttachments', N'U') IS NOT NULL
   AND COL_LENGTH(N'dbo.VendorOrderAttachments', N'TenantID') IS NULL
BEGIN
    ALTER TABLE dbo.VendorOrderAttachments ADD TenantID INT NOT NULL CONSTRAINT DF_VendorOrderAttachments_TenantID DEFAULT (0);
END
GO

IF OBJECT_ID(N'dbo.VendorOrderAttachments', N'U') IS NOT NULL
   AND COL_LENGTH(N'dbo.VendorOrderAttachments', N'createdby') IS NULL
BEGIN
    ALTER TABLE dbo.VendorOrderAttachments ADD createdby INT NOT NULL CONSTRAINT DF_VendorOrderAttachments_createdby DEFAULT (0);
END
GO

/* --------------------------------------------------------------------------
   2) NCR Code Master permission
   -------------------------------------------------------------------------- */
PRINT N'--- NCR Code Master permission ---';
GO

SET NOCOUNT ON;

-- Live ERP uses CimmpleFlow (EF default schema); fall back to dbo if present.
DECLARE @Pm sysname =
    CASE
        WHEN OBJECT_ID(N'CimmpleFlow.PermissionMaster', N'U') IS NOT NULL THEN N'CimmpleFlow.PermissionMaster'
        WHEN OBJECT_ID(N'dbo.PermissionMaster', N'U') IS NOT NULL THEN N'dbo.PermissionMaster'
        ELSE NULL
    END;
DECLARE @Pr sysname =
    CASE
        WHEN OBJECT_ID(N'CimmpleFlow.PermissionRole', N'U') IS NOT NULL THEN N'CimmpleFlow.PermissionRole'
        WHEN OBJECT_ID(N'dbo.PermissionRole', N'U') IS NOT NULL THEN N'dbo.PermissionRole'
        ELSE NULL
    END;

IF @Pm IS NULL
BEGIN
    PRINT N'PermissionMaster missing (CimmpleFlow/dbo) — skipped NCR permission';
END
ELSE
BEGIN
    DECLARE @PermissionId INT;
    DECLARE @sql nvarchar(max);

    SET @sql = N'
    IF NOT EXISTS (SELECT 1 FROM ' + @Pm + N' WHERE [Url] = N''/quality/ncr-codes'')
    BEGIN
        INSERT INTO ' + @Pm + N' (
            [PermissionName], [DisplayPermissionName], [LevelInfo], [OrderNo],
            [Url], [ReportGroup], [ReportDescription]
        )
        VALUES (
            N''NCR Code Master'', N''NCR Code Master'', 1, 31,
            N''/quality/ncr-codes'', N''Quality'', N''Manage NCR code master data''
        );
        SELECT @PermissionIdOut = SCOPE_IDENTITY();
        PRINT N''Inserted NCR Code Master permission into ' + @Pm + N''';
    END
    ELSE
    BEGIN
        SELECT @PermissionIdOut = [PermissionId] FROM ' + @Pm + N' WHERE [Url] = N''/quality/ncr-codes'';
        PRINT N''NCR Code Master permission already exists in ' + @Pm + N''';
    END';

    EXEC sp_executesql @sql, N'@PermissionIdOut INT OUTPUT', @PermissionIdOut = @PermissionId OUTPUT;

    DECLARE @QualityPermissionId INT;
    SET @sql = N'SELECT @IdOut = [PermissionId] FROM ' + @Pm + N' WHERE [Url] = N''/quality''';
    EXEC sp_executesql @sql, N'@IdOut INT OUTPUT', @IdOut = @QualityPermissionId OUTPUT;

    IF @Pr IS NOT NULL AND @QualityPermissionId IS NOT NULL AND @PermissionId IS NOT NULL
    BEGIN
        SET @sql = N'
        INSERT INTO ' + @Pr + N' ([RoleId], [PermissionId], [TenantId])
        SELECT DISTINCT pr.[RoleId], @PermId, pr.[TenantId]
        FROM ' + @Pr + N' pr
        WHERE pr.[PermissionId] = @QualityId
          AND NOT EXISTS (
              SELECT 1 FROM ' + @Pr + N' existing
              WHERE existing.[RoleId] = pr.[RoleId]
                AND existing.[TenantId] = pr.[TenantId]
                AND existing.[PermissionId] = @PermId
          );';
        EXEC sp_executesql @sql,
            N'@PermId INT, @QualityId INT',
            @PermId = @PermissionId,
            @QualityId = @QualityPermissionId;
        PRINT N'Inherited NCR Code Master permission to roles with /quality access';
    END
END
GO

/* --------------------------------------------------------------------------
   3) CreditCardMaster.COA
   -------------------------------------------------------------------------- */
PRINT N'--- CreditCardMaster.COA ---';
GO

IF OBJECT_ID(N'CimmpleFlow.CreditCardMaster', N'U') IS NOT NULL
   AND COL_LENGTH(N'CimmpleFlow.CreditCardMaster', N'COA') IS NULL
BEGIN
    ALTER TABLE CimmpleFlow.CreditCardMaster ADD COA nvarchar(100) NULL;
    PRINT N'COA column added to CimmpleFlow.CreditCardMaster';
END
ELSE IF OBJECT_ID(N'CimmpleFlow.CreditCardMaster', N'U') IS NOT NULL
    PRINT N'COA column already exists on CimmpleFlow.CreditCardMaster';
GO

IF OBJECT_ID(N'dbo.CreditCardMaster', N'U') IS NOT NULL
   AND COL_LENGTH(N'dbo.CreditCardMaster', N'COA') IS NULL
BEGIN
    ALTER TABLE dbo.CreditCardMaster ADD COA nvarchar(100) NULL;
    PRINT N'COA column added to dbo.CreditCardMaster';
END
GO

/* --------------------------------------------------------------------------
   4) Locations hierarchy
   -------------------------------------------------------------------------- */
PRINT N'--- Locations ParentLocationId ---';
GO

IF OBJECT_ID(N'CimmpleFlow.Locations', N'U') IS NOT NULL
   AND COL_LENGTH(N'CimmpleFlow.Locations', N'ParentLocationId') IS NULL
BEGIN
    ALTER TABLE CimmpleFlow.Locations ADD ParentLocationId INT NULL;
END
GO

IF OBJECT_ID(N'CimmpleFlow.Locations', N'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_Locations_ParentLocation')
BEGIN
    ALTER TABLE CimmpleFlow.Locations ADD CONSTRAINT FK_Locations_ParentLocation
        FOREIGN KEY (ParentLocationId) REFERENCES CimmpleFlow.Locations (LocationId);
END
GO

IF OBJECT_ID(N'CimmpleFlow.Locations', N'U') IS NOT NULL
   AND NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name = N'IX_Locations_TenantId_ParentLocationId'
          AND object_id = OBJECT_ID(N'CimmpleFlow.Locations')
   )
BEGIN
    CREATE NONCLUSTERED INDEX IX_Locations_TenantId_ParentLocationId
        ON CimmpleFlow.Locations (TenantId, ParentLocationId);
END
GO

IF OBJECT_ID(N'CimmpleFlow.Locations', N'U') IS NOT NULL
   AND COL_LENGTH(N'CimmpleFlow.Locations', N'LocType') IS NOT NULL
BEGIN
    UPDATE CimmpleFlow.Locations
    SET LocType = 1
    WHERE ParentLocationId IS NULL;
END
GO

/* --------------------------------------------------------------------------
   5) CimmplePunch.EmployeeFace (face enrollment)
   -------------------------------------------------------------------------- */
PRINT N'--- CimmplePunch.EmployeeFace ---';
GO

IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = N'CimmplePunch')
BEGIN
    EXEC(N'CREATE SCHEMA CimmplePunch');
END
GO

IF OBJECT_ID(N'CimmplePunch.EmployeeFace', N'U') IS NULL
BEGIN
    CREATE TABLE CimmplePunch.EmployeeFace (
        Id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_EmployeeFace PRIMARY KEY,
        TenantId INT NOT NULL,
        UserUniqueId INT NOT NULL,
        AzurePersonId NVARCHAR(255) NULL,
        AzurePersistedFaceId NVARCHAR(255) NULL,
        AzureFaceRegistered BIT NOT NULL CONSTRAINT DF_EmployeeFace_AzureFaceRegistered DEFAULT (0),
        AzureFaceLastSync DATETIME2 NULL,
        AwsPersonId NVARCHAR(255) NULL,
        AwsFaceRegistered BIT NOT NULL CONSTRAINT DF_EmployeeFace_AwsFaceRegistered DEFAULT (0),
        AwsFaceLastSync DATETIME2 NULL,
        FaceApprovalPending BIT NOT NULL CONSTRAINT DF_EmployeeFace_FaceApprovalPending DEFAULT (0),
        PendingImagePath NVARCHAR(500) NULL,
        CreatedUtc DATETIME2 NOT NULL CONSTRAINT DF_EmployeeFace_CreatedUtc DEFAULT (SYSUTCDATETIME()),
        UpdatedUtc DATETIME2 NULL
    );

    CREATE UNIQUE INDEX UX_EmployeeFace_Tenant_User
        ON CimmplePunch.EmployeeFace (TenantId, UserUniqueId);
END
GO

/* --------------------------------------------------------------------------
   Verification
   -------------------------------------------------------------------------- */
PRINT N'=== Priority-3 verification ===';
SELECT DB_NAME() AS CurrentDatabase;

SELECT
  COL_LENGTH(N'CimmpleFlow.VendorOrderAttachments', N'FileUniqueno') AS VOA_FileUniqueno,
  COL_LENGTH(N'CimmpleFlow.VendorOrderAttachments', N'UploadFile') AS VOA_UploadFile,
  COL_LENGTH(N'CimmpleFlow.CreditCardMaster', N'COA') AS CreditCard_COA,
  COL_LENGTH(N'CimmpleFlow.Locations', N'ParentLocationId') AS Loc_ParentLocationId,
  CASE WHEN OBJECT_ID(N'CimmplePunch.EmployeeFace', N'U') IS NOT NULL THEN 1 ELSE 0 END AS Punch_EmployeeFace,
  CASE WHEN OBJECT_ID(N'CimmpleFlow.PermissionMaster', N'U') IS NOT NULL THEN 1 ELSE 0 END AS HasPermissionMaster;

IF OBJECT_ID(N'CimmpleFlow.PermissionMaster', N'U') IS NOT NULL
    SELECT COUNT(*) AS NcrPermissionRows
    FROM CimmpleFlow.PermissionMaster
    WHERE Url = N'/quality/ncr-codes';
ELSE
    PRINT N'CimmpleFlow.PermissionMaster not found — NCR permission check skipped';
GO

PRINT N'=== Priority-3 replay finished. Restart the API. ===';
GO
