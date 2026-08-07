-- ============================================================
-- Auth columns for UserDetails — run on the SAME database as
-- ConnectionStrings:DB in appsettings.json
-- ============================================================

PRINT 'Connected database: ' + DB_NAME();
PRINT 'Server: ' + @@SERVERNAME;
GO

IF OBJECT_ID(N'dbo.UserDetails', N'U') IS NULL
BEGIN
    RAISERROR('Table dbo.UserDetails was not found in database [%s]. You are on the wrong database.', 16, 1, DB_NAME());
    RETURN;
END
GO

-- Show current status
SELECT
    c.name AS ColumnName,
    t.name AS DataType
FROM sys.columns c
JOIN sys.types t ON c.user_type_id = t.user_type_id
WHERE c.object_id = OBJECT_ID(N'dbo.UserDetails')
  AND c.name IN (N'DefaultLocationId', N'CanAccessAllLocations', N'FailedLoginCount', N'LockoutEndUtc')
ORDER BY c.name;
GO

IF COL_LENGTH(N'dbo.UserDetails', N'DefaultLocationId') IS NULL
BEGIN
    ALTER TABLE dbo.UserDetails ADD DefaultLocationId INT NULL;
    PRINT 'Added DefaultLocationId';
END
ELSE
    PRINT 'DefaultLocationId already exists';
GO

IF COL_LENGTH(N'dbo.UserDetails', N'CanAccessAllLocations') IS NULL
BEGIN
    ALTER TABLE dbo.UserDetails ADD CanAccessAllLocations BIT NOT NULL
        CONSTRAINT DF_UserDetails_CanAccessAllLocations DEFAULT (0);
    PRINT 'Added CanAccessAllLocations';
END
ELSE
    PRINT 'CanAccessAllLocations already exists';
GO

IF COL_LENGTH(N'dbo.UserDetails', N'FailedLoginCount') IS NULL
BEGIN
    ALTER TABLE dbo.UserDetails ADD FailedLoginCount INT NOT NULL
        CONSTRAINT DF_UserDetails_FailedLoginCount DEFAULT (0);
    PRINT 'Added FailedLoginCount';
END
ELSE
    PRINT 'FailedLoginCount already exists';
GO

IF COL_LENGTH(N'dbo.UserDetails', N'LockoutEndUtc') IS NULL
BEGIN
    ALTER TABLE dbo.UserDetails ADD LockoutEndUtc DATETIME2 NULL;
    PRINT 'Added LockoutEndUtc';
END
ELSE
    PRINT 'LockoutEndUtc already exists';
GO

-- Must return 4 rows after a successful run
SELECT
    c.name AS ColumnName,
    t.name AS DataType
FROM sys.columns c
JOIN sys.types t ON c.user_type_id = t.user_type_id
WHERE c.object_id = OBJECT_ID(N'dbo.UserDetails')
  AND c.name IN (N'DefaultLocationId', N'CanAccessAllLocations', N'FailedLoginCount', N'LockoutEndUtc')
ORDER BY c.name;

PRINT 'Done. Expected 4 columns above. If fewer, you are still on the wrong database.';
GO

-- Optional: mark Administrator roles
IF OBJECT_ID(N'dbo.UserRole', N'U') IS NOT NULL
BEGIN
    UPDATE dbo.UserRole
    SET RoleTag = 'ADMIN'
    WHERE RoleName LIKE '%Admin%'
      AND (RoleTag IS NULL OR RoleTag = '');
END
GO
