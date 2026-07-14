/*
  Adds parent/child hierarchy to Locations without breaking existing LocationId references.
  Run once on SQL Server. Existing rows become business sites (LocType = 1).
*/
SET NOCOUNT ON;

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID(N'dbo.Locations') AND name = N'ParentLocationId'
)
BEGIN
    ALTER TABLE dbo.Locations ADD ParentLocationId INT NULL;
END
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_Locations_ParentLocation'
)
BEGIN
    ALTER TABLE dbo.Locations ADD CONSTRAINT FK_Locations_ParentLocation
        FOREIGN KEY (ParentLocationId) REFERENCES dbo.Locations (LocationId);
END
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes WHERE name = N'IX_Locations_TenantId_ParentLocationId' AND object_id = OBJECT_ID(N'dbo.Locations')
)
BEGIN
    CREATE NONCLUSTERED INDEX IX_Locations_TenantId_ParentLocationId
        ON dbo.Locations (TenantId, ParentLocationId);
END
GO

/* Normalize existing roots as business sites (company / plant addresses). */
UPDATE dbo.Locations
SET LocType = 1
WHERE ParentLocationId IS NULL;
GO
