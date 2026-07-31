-- Enhance ProcessMaster columns (run if EF migration has not been applied yet)
USE ERPv2Db
IF COL_LENGTH('dbo.ProcessMaster', 'ProcessCode') IS NULL
BEGIN
    ALTER TABLE dbo.ProcessMaster ALTER COLUMN ProcessName nvarchar(200) NULL;
    ALTER TABLE dbo.ProcessMaster ALTER COLUMN ledgercode nvarchar(50) NULL;

    ALTER TABLE dbo.ProcessMaster ADD ProcessCode nvarchar(50) NULL;
    ALTER TABLE dbo.ProcessMaster ADD ProcessCategory nvarchar(50) NULL;
    ALTER TABLE dbo.ProcessMaster ADD DefaultEstimatedTimeMinutes int NULL;
    ALTER TABLE dbo.ProcessMaster ADD DefaultWorkstationId int NULL;
    ALTER TABLE dbo.ProcessMaster ADD StandardCostPerHour decimal(18,2) NULL;

    CREATE INDEX IX_ProcessMaster_Tenantid_ProcessName ON dbo.ProcessMaster (Tenantid, ProcessName);
    CREATE INDEX IX_ProcessMaster_Tenantid_ProcessCode ON dbo.ProcessMaster (Tenantid, ProcessCode);
END
GO

-- Deletion protection moved off the Outside Services flag onto its own column
IF COL_LENGTH('dbo.ProcessMaster', 'IsSystem') IS NULL
BEGIN
    ALTER TABLE dbo.ProcessMaster ADD IsSystem bit NOT NULL CONSTRAINT DF_ProcessMaster_IsSystem DEFAULT 0;
END
GO

-- Mark the equivalent EF migrations as applied so a later "dotnet ef database update"
-- does not try to re-add these columns
IF OBJECT_ID('dbo.__EFMigrationsHistory', 'U') IS NOT NULL
BEGIN
    IF NOT EXISTS (SELECT 1 FROM dbo.__EFMigrationsHistory WHERE MigrationId = '20260729154500_EnhanceProcessMaster')
        INSERT INTO dbo.__EFMigrationsHistory (MigrationId, ProductVersion)
        VALUES ('20260729154500_EnhanceProcessMaster', '7.0.0');

    IF NOT EXISTS (SELECT 1 FROM dbo.__EFMigrationsHistory WHERE MigrationId = '20260731070000_AddIsSystemToProcessMaster')
        INSERT INTO dbo.__EFMigrationsHistory (MigrationId, ProductVersion)
        VALUES ('20260731070000_AddIsSystemToProcessMaster', '7.0.0');
END
GO
