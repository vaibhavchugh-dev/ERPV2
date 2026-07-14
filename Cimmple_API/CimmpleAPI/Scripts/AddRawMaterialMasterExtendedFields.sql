-- Extended raw material master: SKU, storage labels, material attributes, dimensions, remnant link, default location.
-- Run once against your Cimmple database.

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.RawMaterialMaster') AND name = N'Sku')
BEGIN
    ALTER TABLE dbo.RawMaterialMaster ADD Sku NVARCHAR(80) NULL;
END
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.RawMaterialMaster') AND name = N'WarehouseLocation')
BEGIN
    ALTER TABLE dbo.RawMaterialMaster ADD WarehouseLocation NVARCHAR(200) NULL;
END
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.RawMaterialMaster') AND name = N'Bin')
BEGIN
    ALTER TABLE dbo.RawMaterialMaster ADD Bin NVARCHAR(100) NULL;
END
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.RawMaterialMaster') AND name = N'Box')
BEGIN
    ALTER TABLE dbo.RawMaterialMaster ADD Box NVARCHAR(100) NULL;
END
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.RawMaterialMaster') AND name = N'MaterialGrade')
BEGIN
    ALTER TABLE dbo.RawMaterialMaster ADD MaterialGrade NVARCHAR(200) NULL;
END
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.RawMaterialMaster') AND name = N'Specification')
BEGIN
    ALTER TABLE dbo.RawMaterialMaster ADD Specification NVARCHAR(500) NULL;
END
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.RawMaterialMaster') AND name = N'StockForm')
BEGIN
    ALTER TABLE dbo.RawMaterialMaster ADD StockForm NVARCHAR(100) NULL;
END
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.RawMaterialMaster') AND name = N'ThicknessMm')
BEGIN
    ALTER TABLE dbo.RawMaterialMaster ADD ThicknessMm DECIMAL(18,4) NULL;
END
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.RawMaterialMaster') AND name = N'WidthMm')
BEGIN
    ALTER TABLE dbo.RawMaterialMaster ADD WidthMm DECIMAL(18,4) NULL;
END
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.RawMaterialMaster') AND name = N'LengthMm')
BEGIN
    ALTER TABLE dbo.RawMaterialMaster ADD LengthMm DECIMAL(18,4) NULL;
END
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.RawMaterialMaster') AND name = N'IsRemnant')
BEGIN
    ALTER TABLE dbo.RawMaterialMaster ADD IsRemnant BIT NOT NULL CONSTRAINT DF_RawMaterialMaster_IsRemnant DEFAULT 0;
END
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.RawMaterialMaster') AND name = N'ParentRawMaterialId')
BEGIN
    ALTER TABLE dbo.RawMaterialMaster ADD ParentRawMaterialId INT NULL;
END
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.RawMaterialMaster') AND name = N'DefaultLocationId')
BEGIN
    ALTER TABLE dbo.RawMaterialMaster ADD DefaultLocationId INT NULL;
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_RawMaterialMaster_ParentRawMaterial')
BEGIN
    ALTER TABLE dbo.RawMaterialMaster ADD CONSTRAINT FK_RawMaterialMaster_ParentRawMaterial
        FOREIGN KEY (ParentRawMaterialId) REFERENCES dbo.RawMaterialMaster(Id);
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_RawMaterialMaster_DefaultLocation')
BEGIN
    ALTER TABLE dbo.RawMaterialMaster ADD CONSTRAINT FK_RawMaterialMaster_DefaultLocation
        FOREIGN KEY (DefaultLocationId) REFERENCES dbo.Locations(LocationId);
END
GO

PRINT 'RawMaterialMaster extended columns and FKs applied (if missing).';
GO
