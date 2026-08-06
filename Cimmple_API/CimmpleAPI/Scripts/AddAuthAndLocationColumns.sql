-- Auth / multi-location columns for UserDetails
-- Run against CimmplePayDb (or your ERPV2 database) before deploying auth.
USE ERPv2Db
IF COL_LENGTH('dbo.UserDetails', 'DefaultLocationId') IS NULL
BEGIN
    ALTER TABLE dbo.UserDetails ADD DefaultLocationId INT NULL;
END
GO

IF COL_LENGTH('dbo.UserDetails', 'CanAccessAllLocations') IS NULL
BEGIN
    ALTER TABLE dbo.UserDetails ADD CanAccessAllLocations BIT NOT NULL CONSTRAINT DF_UserDetails_CanAccessAllLocations DEFAULT (0);
END
GO

IF COL_LENGTH('dbo.UserDetails', 'FailedLoginCount') IS NULL
BEGIN
    ALTER TABLE dbo.UserDetails ADD FailedLoginCount INT NOT NULL CONSTRAINT DF_UserDetails_FailedLoginCount DEFAULT (0);
END
GO

IF COL_LENGTH('dbo.UserDetails', 'LockoutEndUtc') IS NULL
BEGIN
    ALTER TABLE dbo.UserDetails ADD LockoutEndUtc DATETIME2 NULL;
END
GO

-- Optional: mark Administrator role so CanAccessAllLocations is inferred from RoleTag
UPDATE dbo.UserRole
SET RoleTag = 'ADMIN'
WHERE RoleName LIKE '%Admin%'
  AND (RoleTag IS NULL OR RoleTag = '');
GO
