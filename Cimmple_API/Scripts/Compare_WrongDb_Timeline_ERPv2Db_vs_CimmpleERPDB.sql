/*
================================================================================
  Diagnostic: how long were schema scripts hitting the wrong database?

  Compares ERPv2Db (often used in USE statements / SSMS default)
  vs CimmpleERPDB (API connection string).

  Run in SSMS on the same server as appsettings.json.
  Read-only. Does not change anything.

  How to read results:
    OnlyOnWrongDb     → script likely applied to ERPv2Db, missing on live DB
    OnlyOnLiveDb      → live has it; wrong DB never got it (or was cleaned)
    OnBoth            → both have it (replay already caught up, or always OK)
    MissingBoth       → neither has it (never run / different object names)
    create_date/modify_date → earliest wrong-only objects ≈ when drift started
================================================================================
*/

SET NOCOUNT ON;

IF DB_ID(N'ERPv2Db') IS NULL
    PRINT N'WARNING: ERPv2Db not found — marker compare will show OnWrongDb=0 for everything.';
IF DB_ID(N'CimmpleERPDB') IS NULL
BEGIN
    RAISERROR(N'CimmpleERPDB not found. Aborting.', 16, 1);
    RETURN;
END

DECLARE @HasWrong bit = CASE WHEN DB_ID(N'ERPv2Db') IS NOT NULL THEN 1 ELSE 0 END;

/* NCR permission row checks via dynamic SQL (never bind missing tables). */
DECLARE @NcrWrong bit = 0, @NcrLive bit = 0, @sql nvarchar(max), @cnt int;

IF @HasWrong = 1
BEGIN
    IF OBJECT_ID(N'ERPv2Db.CimmpleFlow.PermissionMaster', N'U') IS NOT NULL
        SET @sql = N'SELECT @c = COUNT(*) FROM ERPv2Db.CimmpleFlow.PermissionMaster WITH (NOLOCK) WHERE Url = N''/quality/ncr-codes''';
    ELSE IF OBJECT_ID(N'ERPv2Db.dbo.PermissionMaster', N'U') IS NOT NULL
        SET @sql = N'SELECT @c = COUNT(*) FROM ERPv2Db.dbo.PermissionMaster WITH (NOLOCK) WHERE Url = N''/quality/ncr-codes''';
    ELSE
        SET @sql = NULL;

    IF @sql IS NOT NULL
    BEGIN
        SET @cnt = 0;
        EXEC sp_executesql @sql, N'@c INT OUTPUT', @c = @cnt OUTPUT;
        IF @cnt > 0 SET @NcrWrong = 1;
    END
END

IF OBJECT_ID(N'CimmpleERPDB.CimmpleFlow.PermissionMaster', N'U') IS NOT NULL
    SET @sql = N'SELECT @c = COUNT(*) FROM CimmpleERPDB.CimmpleFlow.PermissionMaster WITH (NOLOCK) WHERE Url = N''/quality/ncr-codes''';
ELSE IF OBJECT_ID(N'CimmpleERPDB.dbo.PermissionMaster', N'U') IS NOT NULL
    SET @sql = N'SELECT @c = COUNT(*) FROM CimmpleERPDB.dbo.PermissionMaster WITH (NOLOCK) WHERE Url = N''/quality/ncr-codes''';
ELSE
    SET @sql = NULL;

IF @sql IS NOT NULL
BEGIN
    SET @cnt = 0;
    EXEC sp_executesql @sql, N'@c INT OUTPUT', @c = @cnt OUTPUT;
    IF @cnt > 0 SET @NcrLive = 1;
END

PRINT N'=== Marker objects / columns: wrong DB vs live ===';

;WITH Markers AS (
    SELECT * FROM (VALUES
        (N'table',  N'CimmpleFlow', N'AccountingDefaults',        NULL),
        (N'table',  N'CimmpleFlow', N'GlAccountingPeriodLocks',    NULL),
        (N'table',  N'CimmpleFlow', N'UserPasswordHistory',        NULL),
        (N'table',  N'dbo',         N'UserPasswordHistory',        NULL),
        (N'column', N'CimmpleFlow', N'SystemSettings',             N'EmailDeliveryMode'),
        (N'column', N'dbo',         N'SystemSettings',             N'EmailDeliveryMode'),
        (N'column', N'CimmpleFlow', N'InvoiceMaster',              N'PaidAmount'),
        (N'column', N'CimmpleFlow', N'VendorInvoiceMaster',        N'PaidAmount'),
        (N'column', N'CimmpleFlow', N'InvoiceMaster',              N'DiscountType'),
        (N'column', N'CimmpleFlow', N'ShippingMaster',             N'Notes'),
        (N'column', N'CimmpleFlow', N'InvoiceMaster',              N'IsVoided'),
        (N'table',  N'CimmpleFlow', N'RawMaterialMaster',          NULL),
        (N'table',  N'CimmpleFlow', N'InventoryBalance',           NULL),
        (N'table',  N'CimmpleFlow', N'InventoryReservation',       NULL),
        (N'table',  N'CimmpleFlow', N'JobTemplateMaster',          NULL),
        (N'table',  N'CimmpleFlow', N'JobTemplateMaterial',        NULL),
        (N'table',  N'CimmpleFlow', N'JobMaterialRequirement',     NULL),
        (N'table',  N'CimmpleFlow', N'CategoryType',               NULL),
        (N'column', N'CimmpleFlow', N'ProductMaster',              N'SourcingType'),
        (N'column', N'CimmpleFlow', N'ProductMaster',              N'ReorderPoint'),
        (N'column', N'CimmpleFlow', N'VendorOrderDetails',         N'LineType'),
        (N'column', N'CimmpleFlow', N'VendorOrderDetails',         N'RawMaterialId'),
        (N'column', N'CimmpleFlow', N'VendorQuotationsDetails',    N'LineType'),
        (N'column', N'CimmpleFlow', N'RawMaterialMaster',          N'Sku'),
        (N'column', N'CimmpleFlow', N'ProcessMaster',              N'ProcessCode'),
        (N'column', N'CimmpleFlow', N'JobOrderMaster',             N'JobTemplateId'),
        (N'column', N'CimmpleFlow', N'JobOrderMaster',             N'EnableJobTracking'),
        (N'column', N'CimmpleFlow', N'VendorOrderAttachments',     N'FileUniqueno'),
        (N'column', N'CimmpleFlow', N'VendorOrderAttachments',     N'UploadFile'),
        (N'column', N'CimmpleFlow', N'CreditCardMaster',           N'COA'),
        (N'column', N'CimmpleFlow', N'Locations',                  N'ParentLocationId'),
        (N'table',  N'CimmplePunch',N'EmployeeFace',               NULL),
        (N'row',    N'CimmpleFlow', N'PermissionMaster',           N'/quality/ncr-codes')
    ) AS v(Kind, SchemaName, ObjectName, Extra)
),
Eval AS (
    SELECT
        m.Kind,
        m.SchemaName,
        m.ObjectName,
        m.Extra,
        CASE
            WHEN m.Kind = N'row' THEN CAST(@NcrWrong AS int)
            WHEN @HasWrong = 0 THEN 0
            WHEN m.Kind = N'table' THEN
                CASE WHEN OBJECT_ID(N'ERPv2Db.' + m.SchemaName + N'.' + m.ObjectName, N'U') IS NOT NULL THEN 1 ELSE 0 END
            WHEN m.Kind = N'column' THEN
                CASE WHEN COL_LENGTH(N'ERPv2Db.' + m.SchemaName + N'.' + m.ObjectName, m.Extra) IS NOT NULL THEN 1 ELSE 0 END
            ELSE 0
        END AS OnWrongDb,
        CASE
            WHEN m.Kind = N'row' THEN CAST(@NcrLive AS int)
            WHEN m.Kind = N'table' THEN
                CASE WHEN OBJECT_ID(N'CimmpleERPDB.' + m.SchemaName + N'.' + m.ObjectName, N'U') IS NOT NULL THEN 1 ELSE 0 END
            WHEN m.Kind = N'column' THEN
                CASE WHEN COL_LENGTH(N'CimmpleERPDB.' + m.SchemaName + N'.' + m.ObjectName, m.Extra) IS NOT NULL THEN 1 ELSE 0 END
            ELSE 0
        END AS OnLiveDb
    FROM Markers m
)
SELECT
    Kind,
    SchemaName + N'.' + ObjectName
        + CASE WHEN Extra IS NULL THEN N'' ELSE N'.' + Extra END AS Marker,
    OnWrongDb,
    OnLiveDb,
    CASE
        WHEN OnWrongDb = 1 AND OnLiveDb = 0 THEN N'OnlyOnWrongDb (script hit ERPv2Db)'
        WHEN OnWrongDb = 0 AND OnLiveDb = 1 THEN N'OnlyOnLiveDb'
        WHEN OnWrongDb = 1 AND OnLiveDb = 1 THEN N'OnBoth'
        ELSE N'MissingBoth'
    END AS Status
FROM Eval
ORDER BY
    CASE
        WHEN OnWrongDb = 1 AND OnLiveDb = 0 THEN 1
        WHEN OnWrongDb = 0 AND OnLiveDb = 0 THEN 2
        WHEN OnWrongDb = 1 AND OnLiveDb = 1 THEN 3
        ELSE 4
    END,
    Marker;
GO

PRINT N'=== Tables present on ERPv2Db but missing on CimmpleERPDB (CimmpleFlow) ===';
IF DB_ID(N'ERPv2Db') IS NOT NULL
BEGIN
    SELECT
        w.name AS TableName,
        w.create_date AS WrongDb_CreateDate,
        w.modify_date AS WrongDb_ModifyDate
    FROM ERPv2Db.sys.tables w
    JOIN ERPv2Db.sys.schemas ws ON w.schema_id = ws.schema_id
    WHERE ws.name = N'CimmpleFlow'
      AND NOT EXISTS (
          SELECT 1
          FROM CimmpleERPDB.sys.tables l
          JOIN CimmpleERPDB.sys.schemas ls ON l.schema_id = ls.schema_id
          WHERE ls.name = N'CimmpleFlow' AND l.name = w.name
      )
    ORDER BY w.create_date;
END
ELSE
    PRINT N'Skipped (ERPv2Db not found).';
GO

PRINT N'=== Columns on ERPv2Db.CimmpleFlow missing on live (same table name) ===';
IF DB_ID(N'ERPv2Db') IS NOT NULL
BEGIN
    SELECT
        ws.name + N'.' + wt.name + N'.' + wc.name AS ColumnMarker,
        wt.create_date AS Table_CreateDate,
        wc.name AS ColumnName
    FROM ERPv2Db.sys.columns wc
    JOIN ERPv2Db.sys.tables wt ON wc.object_id = wt.object_id
    JOIN ERPv2Db.sys.schemas ws ON wt.schema_id = ws.schema_id
    WHERE ws.name = N'CimmpleFlow'
      AND EXISTS (
          SELECT 1
          FROM CimmpleERPDB.sys.tables lt
          JOIN CimmpleERPDB.sys.schemas ls ON lt.schema_id = ls.schema_id
          WHERE ls.name = N'CimmpleFlow' AND lt.name = wt.name
      )
      AND NOT EXISTS (
          SELECT 1
          FROM CimmpleERPDB.sys.columns lc
          JOIN CimmpleERPDB.sys.tables lt ON lc.object_id = lt.object_id
          JOIN CimmpleERPDB.sys.schemas ls ON lt.schema_id = ls.schema_id
          WHERE ls.name = N'CimmpleFlow' AND lt.name = wt.name AND lc.name = wc.name
      )
    ORDER BY wt.name, wc.column_id;
END
ELSE
    PRINT N'Skipped (ERPv2Db not found).';
GO

PRINT N'=== EF migration history compare ===';
DECLARE @HasWrongHist bit = CASE WHEN OBJECT_ID(N'ERPv2Db.CimmpleFlow.__EFMigrationsHistory', N'U') IS NOT NULL THEN 1 ELSE 0 END;
DECLARE @HasLiveHist bit = CASE WHEN OBJECT_ID(N'CimmpleERPDB.CimmpleFlow.__EFMigrationsHistory', N'U') IS NOT NULL THEN 1 ELSE 0 END;
DECLARE @histSql nvarchar(max);

IF @HasWrongHist = 1 AND @HasLiveHist = 1
BEGIN
    SET @histSql = N'
    SELECT
        COALESCE(w.MigrationId, l.MigrationId) AS MigrationId,
        CASE WHEN w.MigrationId IS NOT NULL THEN 1 ELSE 0 END AS OnWrongDb,
        CASE WHEN l.MigrationId IS NOT NULL THEN 1 ELSE 0 END AS OnLiveDb,
        CASE
            WHEN w.MigrationId IS NOT NULL AND l.MigrationId IS NULL THEN N''OnlyOnWrongDb''
            WHEN w.MigrationId IS NULL AND l.MigrationId IS NOT NULL THEN N''OnlyOnLiveDb''
            ELSE N''OnBoth''
        END AS Status
    FROM ERPv2Db.CimmpleFlow.__EFMigrationsHistory w
    FULL OUTER JOIN CimmpleERPDB.CimmpleFlow.__EFMigrationsHistory l
        ON w.MigrationId = l.MigrationId
    ORDER BY Status, MigrationId;';
    EXEC sp_executesql @histSql;
END
ELSE IF @HasWrongHist = 1
BEGIN
    SET @histSql = N'
    SELECT MigrationId, 1 AS OnWrongDb, 0 AS OnLiveDb, N''OnlyOnWrongDb'' AS Status
    FROM ERPv2Db.CimmpleFlow.__EFMigrationsHistory
    ORDER BY MigrationId;';
    EXEC sp_executesql @histSql;
END
ELSE IF @HasLiveHist = 1
BEGIN
    SET @histSql = N'
    SELECT MigrationId, 0 AS OnWrongDb, 1 AS OnLiveDb, N''OnlyOnLiveDb'' AS Status
    FROM CimmpleERPDB.CimmpleFlow.__EFMigrationsHistory
    ORDER BY MigrationId;';
    EXEC sp_executesql @histSql;
END
ELSE
    PRINT N'No CimmpleFlow.__EFMigrationsHistory on either DB.';
GO

PRINT N'=== Timeline hint: earliest CimmpleFlow table create_date on each DB ===';
IF DB_ID(N'ERPv2Db') IS NOT NULL
    SELECT N'ERPv2Db' AS DbName, MIN(t.create_date) AS EarliestTable, MAX(t.modify_date) AS LatestModify
    FROM ERPv2Db.sys.tables t
    JOIN ERPv2Db.sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = N'CimmpleFlow';

SELECT N'CimmpleERPDB' AS DbName, MIN(t.create_date) AS EarliestTable, MAX(t.modify_date) AS LatestModify
FROM CimmpleERPDB.sys.tables t
JOIN CimmpleERPDB.sys.schemas s ON t.schema_id = s.schema_id
WHERE s.name = N'CimmpleFlow';
GO

PRINT N'=== Done. Focus on OnlyOnWrongDb rows + earliest WrongDb_CreateDate above. ===';
GO
