-- Add NCR Code Master permission and inherit it from roles that already have /quality.
-- Idempotent. Safe to run in SSMS.
-- Uses CimmpleFlow (EF default); falls back to dbo if needed.

SET NOCOUNT ON;

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
    PRINT 'PermissionMaster not found in CimmpleFlow or dbo. Aborting.';
    RETURN;
END

DECLARE @PermissionId INT;
DECLARE @sql nvarchar(max);

SET @sql = N'
IF NOT EXISTS (SELECT 1 FROM ' + @Pm + N' WHERE [Url] = N''/quality/ncr-codes'')
BEGIN
    INSERT INTO ' + @Pm + N' (
        [PermissionName],
        [DisplayPermissionName],
        [LevelInfo],
        [OrderNo],
        [Url],
        [ReportGroup],
        [ReportDescription]
    )
    VALUES (
        N''NCR Code Master'',
        N''NCR Code Master'',
        1,
        31,
        N''/quality/ncr-codes'',
        N''Quality'',
        N''Manage NCR code master data''
    );
    SELECT @PermissionIdOut = SCOPE_IDENTITY();
    PRINT ''Inserted NCR Code Master permission'';
END
ELSE
BEGIN
    SELECT @PermissionIdOut = [PermissionId] FROM ' + @Pm + N' WHERE [Url] = N''/quality/ncr-codes'';
    PRINT ''NCR Code Master permission already exists'';
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
          SELECT 1
          FROM ' + @Pr + N' existing
          WHERE existing.[RoleId] = pr.[RoleId]
            AND existing.[TenantId] = pr.[TenantId]
            AND existing.[PermissionId] = @PermId
      );';
    EXEC sp_executesql @sql,
        N'@PermId INT, @QualityId INT',
        @PermId = @PermissionId,
        @QualityId = @QualityPermissionId;

    PRINT 'Inherited NCR Code Master permission to roles with /quality access';
END

GO
