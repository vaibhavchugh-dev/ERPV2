-- Add EnableJobTracking column to JobOrderMaster
-- Persists the "Enable Job Tracking" checkbox on the Job Order slideout.
-- This script is safe to run multiple times (checks if column exists first)
USE ERPV2DB
IF NOT EXISTS (
    SELECT 1
    FROM sys.columns
    WHERE object_id = OBJECT_ID('JobOrderMaster')
    AND name = 'EnableJobTracking'
)
BEGIN
    ALTER TABLE JobOrderMaster
    ADD EnableJobTracking bit NOT NULL CONSTRAINT DF_JobOrderMaster_EnableJobTracking DEFAULT (0);

    PRINT 'Column EnableJobTracking added successfully.';
END
ELSE
BEGIN
    PRINT 'Column EnableJobTracking already exists.';
END
GO

-- Record the EF migration so "dotnet ef database update" does not try to add this again.
IF OBJECT_ID('dbo.__EFMigrationsHistory', 'U') IS NOT NULL
BEGIN
    IF NOT EXISTS (SELECT 1 FROM dbo.__EFMigrationsHistory WHERE MigrationId = '20260807210000_AddEnableJobTrackingToJobOrderMaster')
        INSERT INTO dbo.__EFMigrationsHistory (MigrationId, ProductVersion)
        VALUES ('20260807210000_AddEnableJobTrackingToJobOrderMaster', '7.0.0');
END
GO
