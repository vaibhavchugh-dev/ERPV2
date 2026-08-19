-- Auth / multi-location columns for UserDetails
-- Run against CimmpleERPDB (CimmpleFlow schema) before deploying auth.
USE CimmpleERPDB
IF COL_LENGTH('CimmpleFlow.UserDetails', 'DefaultLocationId') IS NULL
BEGIN
    ALTER TABLE CimmpleFlow.UserDetails ADD DefaultLocationId INT NULL;
END
GO

IF COL_LENGTH('CimmpleFlow.UserDetails', 'CanAccessAllLocations') IS NULL
BEGIN
    ALTER TABLE CimmpleFlow.UserDetails ADD CanAccessAllLocations BIT NOT NULL CONSTRAINT DF_UserDetails_CanAccessAllLocations DEFAULT (0);
END
GO

IF COL_LENGTH('CimmpleFlow.UserDetails', 'FailedLoginCount') IS NULL
BEGIN
    ALTER TABLE CimmpleFlow.UserDetails ADD FailedLoginCount INT NOT NULL CONSTRAINT DF_UserDetails_FailedLoginCount DEFAULT (0);
END
GO

IF COL_LENGTH('CimmpleFlow.UserDetails', 'LockoutEndUtc') IS NULL
BEGIN
    ALTER TABLE CimmpleFlow.UserDetails ADD LockoutEndUtc DATETIME2 NULL;
END
GO

-- Optional: mark Administrator role so CanAccessAllLocations is inferred from RoleTag
UPDATE CimmpleFlow.UserRole
SET RoleTag = 'ADMIN'
WHERE RoleName LIKE '%Admin%'
  AND (RoleTag IS NULL OR RoleTag = '');
GO
