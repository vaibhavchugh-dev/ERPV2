-- Extended raw material master: SKU, storage labels, material attributes, dimensions, remnant link, default location.
-- Run once against your Cimmple database.

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'CimmpleFlow.RawMaterialMaster') AND name = N'Sku')
BEGIN
    ALTER TABLE CimmpleFlow.RawMaterialMaster ADD Sku NVARCHAR(80) NULL;
END
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'CimmpleFlow.RawMaterialMaster') AND name = N'WarehouseLocation')
BEGIN
    ALTER TABLE CimmpleFlow.RawMaterialMaster ADD WarehouseLocation NVARCHAR(200) NULL;
END
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'CimmpleFlow.RawMaterialMaster') AND name = N'Bin')
BEGIN
    ALTER TABLE CimmpleFlow.RawMaterialMaster ADD Bin NVARCHAR(100) NULL;
END
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'CimmpleFlow.RawMaterialMaster') AND name = N'Box')
BEGIN
    ALTER TABLE CimmpleFlow.RawMaterialMaster ADD Box NVARCHAR(100) NULL;
END
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'CimmpleFlow.RawMaterialMaster') AND name = N'MaterialGrade')
BEGIN
    ALTER TABLE CimmpleFlow.RawMaterialMaster ADD MaterialGrade NVARCHAR(200) NULL;
END
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'CimmpleFlow.RawMaterialMaster') AND name = N'Specification')
BEGIN
    ALTER TABLE CimmpleFlow.RawMaterialMaster ADD Specification NVARCHAR(500) NULL;
END
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'CimmpleFlow.RawMaterialMaster') AND name = N'StockForm')
BEGIN
    ALTER TABLE CimmpleFlow.RawMaterialMaster ADD StockForm NVARCHAR(100) NULL;
END
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'CimmpleFlow.RawMaterialMaster') AND name = N'ThicknessMm')
BEGIN
    ALTER TABLE CimmpleFlow.RawMaterialMaster ADD ThicknessMm DECIMAL(18,4) NULL;
END
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'CimmpleFlow.RawMaterialMaster') AND name = N'WidthMm')
BEGIN
    ALTER TABLE CimmpleFlow.RawMaterialMaster ADD WidthMm DECIMAL(18,4) NULL;
END
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'CimmpleFlow.RawMaterialMaster') AND name = N'LengthMm')
BEGIN
    ALTER TABLE CimmpleFlow.RawMaterialMaster ADD LengthMm DECIMAL(18,4) NULL;
END
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'CimmpleFlow.RawMaterialMaster') AND name = N'IsRemnant')
BEGIN
    ALTER TABLE CimmpleFlow.RawMaterialMaster ADD IsRemnant BIT NOT NULL CONSTRAINT DF_RawMaterialMaster_IsRemnant DEFAULT 0;
END
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'CimmpleFlow.RawMaterialMaster') AND name = N'ParentRawMaterialId')
BEGIN
    ALTER TABLE CimmpleFlow.RawMaterialMaster ADD ParentRawMaterialId INT NULL;
END
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'CimmpleFlow.RawMaterialMaster') AND name = N'DefaultLocationId')
BEGIN
    ALTER TABLE CimmpleFlow.RawMaterialMaster ADD DefaultLocationId INT NULL;
END
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'CimmpleFlow.RawMaterialMaster') AND name = N'IsActive')
BEGIN
    ALTER TABLE CimmpleFlow.RawMaterialMaster ADD IsActive BIT NOT NULL CONSTRAINT DF_RawMaterialMaster_IsActive DEFAULT 1;
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_RawMaterialMaster_ParentRawMaterial')
BEGIN
    ALTER TABLE CimmpleFlow.RawMaterialMaster ADD CONSTRAINT FK_RawMaterialMaster_ParentRawMaterial
        FOREIGN KEY (ParentRawMaterialId) REFERENCES CimmpleFlow.RawMaterialMaster(Id);
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_RawMaterialMaster_DefaultLocation')
BEGIN
    ALTER TABLE CimmpleFlow.RawMaterialMaster ADD CONSTRAINT FK_RawMaterialMaster_DefaultLocation
        FOREIGN KEY (DefaultLocationId) REFERENCES CimmpleFlow.Locations(LocationId);
END
GO

PRINT 'RawMaterialMaster extended columns and FKs applied (if missing).';
GO
