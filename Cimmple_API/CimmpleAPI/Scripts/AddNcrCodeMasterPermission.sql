-- Add NCR Code Master permission and inherit it from roles that already have /quality.
-- Idempotent. Safe to run in SSMS.

SET NOCOUNT ON;

DECLARE @PermissionId INT;

IF NOT EXISTS (
    SELECT 1 FROM [dbo].[PermissionMaster]
    WHERE [Url] = N'/quality/ncr-codes'
)
BEGIN
    INSERT INTO [dbo].[PermissionMaster] (
        [PermissionName],
        [DisplayPermissionName],
        [LevelInfo],
        [OrderNo],
        [Url],
        [ReportGroup],
        [ReportDescription]
    )
    VALUES (
        N'NCR Code Master',
        N'NCR Code Master',
        1,
        31,
        N'/quality/ncr-codes',
        N'Quality',
        N'Manage NCR code master data'
    );

    SET @PermissionId = SCOPE_IDENTITY();
    PRINT 'Inserted NCR Code Master permission';
END
ELSE
BEGIN
    SELECT @PermissionId = [PermissionId]
    FROM [dbo].[PermissionMaster]
    WHERE [Url] = N'/quality/ncr-codes';
    PRINT 'NCR Code Master permission already exists';
END

DECLARE @QualityPermissionId INT;
SELECT @QualityPermissionId = [PermissionId]
FROM [dbo].[PermissionMaster]
WHERE [Url] = N'/quality';

IF @QualityPermissionId IS NOT NULL AND @PermissionId IS NOT NULL
BEGIN
    INSERT INTO [dbo].[PermissionRole] ([RoleId], [PermissionId], [TenantId])
    SELECT DISTINCT pr.[RoleId], @PermissionId, pr.[TenantId]
    FROM [dbo].[PermissionRole] pr
    WHERE pr.[PermissionId] = @QualityPermissionId
      AND NOT EXISTS (
          SELECT 1
          FROM [dbo].[PermissionRole] existing
          WHERE existing.[RoleId] = pr.[RoleId]
            AND existing.[TenantId] = pr.[TenantId]
            AND existing.[PermissionId] = @PermissionId
      );

    PRINT 'Inherited NCR Code Master permission to roles with /quality access';
END

GO
