/*
================================================================================
  Replay pack: Priority-2 schema (Inventory / Manufacturing / Job Templates)
  Target: CimmpleERPDB only (CimmpleFlow schema)

  Run in SSMS (Query window). Do not paste into a tool that ignores GO batches.
  Safe to re-run (idempotent checks). Skips sample seed scripts.
  DecimalReceiveAndShipQty is optional — run that file separately if needed.
================================================================================
*/

SET NOCOUNT ON;

IF DB_ID(N'CimmpleERPDB') IS NULL
BEGIN
    RAISERROR(N'Database CimmpleERPDB was not found on this server. Aborting.', 16, 1);
    RETURN;
END

USE CimmpleERPDB;
PRINT N'=== Priority-2 replay on ' + DB_NAME() + N' ===';
GO


PRINT N'--- AddInventoryModule.sql ---';
GO

-- =============================================
-- Inventory Module - SQL Script for SSMS
-- Run this script in SQL Server Management Studio
-- Idempotent: safe to run multiple times
-- =============================================

SET NOCOUNT ON;
GO

-- Ensure __EFMigrationsHistory exists (for EF Core migration tracking)
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[CimmpleFlow].[__EFMigrationsHistory]') AND type in (N'U'))
BEGIN
    CREATE TABLE [CimmpleFlow].[__EFMigrationsHistory] (
        [MigrationId] nvarchar(150) NOT NULL,
        [ProductVersion] nvarchar(32) NOT NULL,
        CONSTRAINT [PK___EFMigrationsHistory] PRIMARY KEY ([MigrationId])
    );
END
GO

-- Fix: If RawMaterialMaster exists with PartNo as nvarchar(max), alter to nvarchar(100) for index support
IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[CimmpleFlow].[RawMaterialMaster]') AND type in (N'U'))
BEGIN
    IF EXISTS (SELECT 1 FROM sys.columns c
        JOIN sys.types t ON c.user_type_id = t.user_type_id
        WHERE c.object_id = OBJECT_ID(N'[CimmpleFlow].[RawMaterialMaster]') AND c.name = 'PartNo' AND c.max_length = -1)
        ALTER TABLE [CimmpleFlow].[RawMaterialMaster] ALTER COLUMN [PartNo] nvarchar(100) NULL;
END
GO

-- Skip if already applied
IF NOT EXISTS (SELECT * FROM [CimmpleFlow].[__EFMigrationsHistory] WHERE [MigrationId] = N'20260311080000_AddInventoryModule')
BEGIN
    BEGIN TRANSACTION;

    -- 1. RawMaterialMaster
    IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[CimmpleFlow].[RawMaterialMaster]') AND type in (N'U'))
    BEGIN
        CREATE TABLE [CimmpleFlow].[RawMaterialMaster] (
            [Id] int NOT NULL IDENTITY(1,1),
            [PartNo] nvarchar(100) NULL,
            [PartName] nvarchar(max) NULL,
            [Description] nvarchar(max) NULL,
            [Unit] nvarchar(max) NULL,
            [UnitCost] decimal(18,2) NOT NULL,
            [VendorId] int NULL,
            [ReorderPoint] decimal(18,2) NULL,
            [ReorderQuantity] decimal(18,2) NULL,
            [Tenantid] int NOT NULL,
            CONSTRAINT [PK_RawMaterialMaster] PRIMARY KEY ([Id])
        );
        CREATE INDEX [IX_RawMaterialMaster_Tenantid_PartNo] ON [CimmpleFlow].[RawMaterialMaster] ([Tenantid], [PartNo]);
    END

    -- 2. InventoryTransactionType
    IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[CimmpleFlow].[InventoryTransactionType]') AND type in (N'U'))
    BEGIN
        CREATE TABLE [CimmpleFlow].[InventoryTransactionType] (
            [Id] int NOT NULL IDENTITY(1,1),
            [Code] nvarchar(450) NOT NULL,
            [Name] nvarchar(max) NOT NULL,
            [IsPositive] bit NOT NULL,
            CONSTRAINT [PK_InventoryTransactionType] PRIMARY KEY ([Id])
        );
        CREATE UNIQUE INDEX [IX_InventoryTransactionType_Code] ON [CimmpleFlow].[InventoryTransactionType] ([Code]);

        -- Seed default transaction types
        SET IDENTITY_INSERT [CimmpleFlow].[InventoryTransactionType] ON;
        INSERT INTO [CimmpleFlow].[InventoryTransactionType] ([Id], [Code], [Name], [IsPositive]) VALUES
            (1, N'RECEIPT', N'Receipt', 1),
            (2, N'ISSUE', N'Issue', 0),
            (3, N'TRANSFER_IN', N'Transfer In', 1),
            (4, N'TRANSFER_OUT', N'Transfer Out', 0),
            (5, N'ADJUSTMENT', N'Adjustment', 1);
        SET IDENTITY_INSERT [CimmpleFlow].[InventoryTransactionType] OFF;
    END

    -- 3. InventoryLot
    IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[CimmpleFlow].[InventoryLot]') AND type in (N'U'))
    BEGIN
        CREATE TABLE [CimmpleFlow].[InventoryLot] (
            [Id] int NOT NULL IDENTITY(1,1),
            [LotNumber] nvarchar(max) NOT NULL,
            [ProductId] int NULL,
            [RawMaterialId] int NULL,
            [ExpiryDate] datetime2 NULL,
            [ReceivedDate] datetime2 NULL,
            [Status] nvarchar(max) NOT NULL,
            [Tenantid] int NOT NULL,
            CONSTRAINT [PK_InventoryLot] PRIMARY KEY ([Id]),
            CONSTRAINT [FK_InventoryLot_ProductMaster_ProductId] FOREIGN KEY ([ProductId]) REFERENCES [CimmpleFlow].[ProductMaster] ([Id]) ON DELETE NO ACTION,
            CONSTRAINT [FK_InventoryLot_RawMaterialMaster_RawMaterialId] FOREIGN KEY ([RawMaterialId]) REFERENCES [CimmpleFlow].[RawMaterialMaster] ([Id]) ON DELETE NO ACTION
        );
        CREATE INDEX [IX_InventoryLot_ProductId] ON [CimmpleFlow].[InventoryLot] ([ProductId]);
        CREATE INDEX [IX_InventoryLot_RawMaterialId] ON [CimmpleFlow].[InventoryLot] ([RawMaterialId]);
    END

    -- 4. InventoryBalance
    IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[CimmpleFlow].[InventoryBalance]') AND type in (N'U'))
    BEGIN
        CREATE TABLE [CimmpleFlow].[InventoryBalance] (
            [Id] int NOT NULL IDENTITY(1,1),
            [ProductId] int NULL,
            [RawMaterialId] int NULL,
            [LocationId] int NOT NULL,
            [QuantityOnHand] decimal(18,2) NOT NULL,
            [QuantityReserved] decimal(18,2) NOT NULL,
            [ReorderPoint] decimal(18,2) NULL,
            [ReorderQuantity] decimal(18,2) NULL,
            [MaxQuantity] decimal(18,2) NULL,
            [LastCountDate] datetime2 NULL,
            [UnitCost] decimal(18,2) NULL,
            [Tenantid] int NOT NULL,
            CONSTRAINT [PK_InventoryBalance] PRIMARY KEY ([Id]),
            CONSTRAINT [FK_InventoryBalance_Locations_LocationId] FOREIGN KEY ([LocationId]) REFERENCES [CimmpleFlow].[Locations] ([LocationId]) ON DELETE NO ACTION,
            CONSTRAINT [FK_InventoryBalance_ProductMaster_ProductId] FOREIGN KEY ([ProductId]) REFERENCES [CimmpleFlow].[ProductMaster] ([Id]) ON DELETE NO ACTION,
            CONSTRAINT [FK_InventoryBalance_RawMaterialMaster_RawMaterialId] FOREIGN KEY ([RawMaterialId]) REFERENCES [CimmpleFlow].[RawMaterialMaster] ([Id]) ON DELETE NO ACTION
        );
        CREATE INDEX [IX_InventoryBalance_LocationId] ON [CimmpleFlow].[InventoryBalance] ([LocationId]);
        CREATE INDEX [IX_InventoryBalance_ProductId_LocationId_Tenantid] ON [CimmpleFlow].[InventoryBalance] ([ProductId], [LocationId], [Tenantid]) WHERE [ProductId] IS NOT NULL;
        CREATE INDEX [IX_InventoryBalance_RawMaterialId_LocationId_Tenantid] ON [CimmpleFlow].[InventoryBalance] ([RawMaterialId], [LocationId], [Tenantid]) WHERE [RawMaterialId] IS NOT NULL;
        CREATE INDEX [IX_InventoryBalance_Tenantid] ON [CimmpleFlow].[InventoryBalance] ([Tenantid]);
    END

    -- 5. InventoryLotBalance
    IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[CimmpleFlow].[InventoryLotBalance]') AND type in (N'U'))
    BEGIN
        CREATE TABLE [CimmpleFlow].[InventoryLotBalance] (
            [Id] int NOT NULL IDENTITY(1,1),
            [LotId] int NOT NULL,
            [LocationId] int NOT NULL,
            [QuantityOnHand] decimal(18,2) NOT NULL,
            [Tenantid] int NOT NULL,
            CONSTRAINT [PK_InventoryLotBalance] PRIMARY KEY ([Id]),
            CONSTRAINT [FK_InventoryLotBalance_InventoryLot_LotId] FOREIGN KEY ([LotId]) REFERENCES [CimmpleFlow].[InventoryLot] ([Id]) ON DELETE CASCADE,
            CONSTRAINT [FK_InventoryLotBalance_Locations_LocationId] FOREIGN KEY ([LocationId]) REFERENCES [CimmpleFlow].[Locations] ([LocationId]) ON DELETE NO ACTION,
            CONSTRAINT [UQ_InventoryLotBalance_LotId_LocationId_Tenantid] UNIQUE ([LotId], [LocationId], [Tenantid])
        );
        CREATE INDEX [IX_InventoryLotBalance_LotId] ON [CimmpleFlow].[InventoryLotBalance] ([LotId]);
        CREATE INDEX [IX_InventoryLotBalance_LocationId] ON [CimmpleFlow].[InventoryLotBalance] ([LocationId]);
    END

    -- 6. InventoryTransaction
    IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[CimmpleFlow].[InventoryTransaction]') AND type in (N'U'))
    BEGIN
        CREATE TABLE [CimmpleFlow].[InventoryTransaction] (
            [Id] int NOT NULL IDENTITY(1,1),
            [ProductId] int NULL,
            [RawMaterialId] int NULL,
            [LocationId] int NOT NULL,
            [TransactionTypeId] int NOT NULL,
            [Quantity] decimal(18,2) NOT NULL,
            [ReferenceType] nvarchar(max) NULL,
            [ReferenceId] int NULL,
            [TransactionDate] datetime2 NOT NULL,
            [LotId] int NULL,
            [CreatedBy] int NULL,
            [Notes] nvarchar(max) NULL,
            [Tenantid] int NOT NULL,
            CONSTRAINT [PK_InventoryTransaction] PRIMARY KEY ([Id]),
            CONSTRAINT [FK_InventoryTransaction_InventoryLot_LotId] FOREIGN KEY ([LotId]) REFERENCES [CimmpleFlow].[InventoryLot] ([Id]) ON DELETE SET NULL,
            CONSTRAINT [FK_InventoryTransaction_InventoryTransactionType_TransactionTypeId] FOREIGN KEY ([TransactionTypeId]) REFERENCES [CimmpleFlow].[InventoryTransactionType] ([Id]) ON DELETE NO ACTION,
            CONSTRAINT [FK_InventoryTransaction_Locations_LocationId] FOREIGN KEY ([LocationId]) REFERENCES [CimmpleFlow].[Locations] ([LocationId]) ON DELETE NO ACTION,
            CONSTRAINT [FK_InventoryTransaction_ProductMaster_ProductId] FOREIGN KEY ([ProductId]) REFERENCES [CimmpleFlow].[ProductMaster] ([Id]) ON DELETE NO ACTION,
            CONSTRAINT [FK_InventoryTransaction_RawMaterialMaster_RawMaterialId] FOREIGN KEY ([RawMaterialId]) REFERENCES [CimmpleFlow].[RawMaterialMaster] ([Id]) ON DELETE NO ACTION
        );
        CREATE INDEX [IX_InventoryTransaction_LocationId] ON [CimmpleFlow].[InventoryTransaction] ([LocationId]);
        CREATE INDEX [IX_InventoryTransaction_LotId] ON [CimmpleFlow].[InventoryTransaction] ([LotId]);
        CREATE INDEX [IX_InventoryTransaction_ProductId] ON [CimmpleFlow].[InventoryTransaction] ([ProductId]);
        CREATE INDEX [IX_InventoryTransaction_RawMaterialId] ON [CimmpleFlow].[InventoryTransaction] ([RawMaterialId]);
        CREATE INDEX [IX_InventoryTransaction_TransactionTypeId] ON [CimmpleFlow].[InventoryTransaction] ([TransactionTypeId]);
        CREATE INDEX [IX_InventoryTransaction_Tenantid] ON [CimmpleFlow].[InventoryTransaction] ([Tenantid]);
    END

    -- Record migration
    INSERT INTO [CimmpleFlow].[__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260311080000_AddInventoryModule', N'7.0.0');

    COMMIT TRANSACTION;
    PRINT 'Inventory module tables created successfully.';
END
ELSE
BEGIN
    PRINT 'Inventory module migration already applied. Skipping.';
END
GO

GO

PRINT N'--- AddRawMaterialMasterExtendedFields.sql ---';
GO

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

GO

PRINT N'--- AddRawMaterialIdToVendorOrderDetails.sql ---';
GO

-- Phase 1 inventory: vendor PO lines can reference Raw Material Master for stock receiving.
-- Idempotent: safe to run multiple times.

IF COL_LENGTH('CimmpleFlow.VendorOrderDetails', 'RawMaterialId') IS NULL
BEGIN
    ALTER TABLE [CimmpleFlow].[VendorOrderDetails] ADD [RawMaterialId] int NULL;
END
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_VendorOrderDetails_RawMaterialId'
      AND object_id = OBJECT_ID(N'CimmpleFlow.VendorOrderDetails')
)
BEGIN
    CREATE INDEX [IX_VendorOrderDetails_RawMaterialId]
        ON [CimmpleFlow].[VendorOrderDetails] ([RawMaterialId]);
END
GO

IF NOT EXISTS (
    SELECT 1 FROM [CimmpleFlow].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260812190000_AddRawMaterialIdToVendorOrderDetails'
)
BEGIN
    INSERT INTO [CimmpleFlow].[__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260812190000_AddRawMaterialIdToVendorOrderDetails', N'7.0.0');
END
GO

GO

PRINT N'--- AddInventoryReservation.sql ---';
GO

-- Hold qty for a job (on-hand unchanged; available drops). Idempotent.

IF OBJECT_ID(N'CimmpleFlow.InventoryReservation', N'U') IS NULL
BEGIN
    CREATE TABLE [CimmpleFlow].[InventoryReservation] (
        [Id] int IDENTITY(1,1) NOT NULL,
        [ProductId] int NULL,
        [RawMaterialId] int NULL,
        [LocationId] int NOT NULL,
        [Quantity] decimal(18,2) NOT NULL,
        [ReferenceType] nvarchar(40) NOT NULL,
        [ReferenceId] int NOT NULL,
        [Notes] nvarchar(max) NULL,
        [CreatedBy] int NULL,
        [CreatedDate] datetime2 NOT NULL,
        [Tenantid] int NOT NULL,
        CONSTRAINT [PK_InventoryReservation] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_InventoryReservation_Locations_LocationId]
            FOREIGN KEY ([LocationId]) REFERENCES [CimmpleFlow].[Locations] ([LocationId]),
        CONSTRAINT [FK_InventoryReservation_ProductMaster_ProductId]
            FOREIGN KEY ([ProductId]) REFERENCES [CimmpleFlow].[ProductMaster] ([Id]),
        CONSTRAINT [FK_InventoryReservation_RawMaterialMaster_RawMaterialId]
            FOREIGN KEY ([RawMaterialId]) REFERENCES [CimmpleFlow].[RawMaterialMaster] ([Id])
    );

    CREATE INDEX [IX_InventoryReservation_LocationId]
        ON [CimmpleFlow].[InventoryReservation] ([LocationId]);

    CREATE INDEX [IX_InventoryReservation_Tenantid_Reference]
        ON [CimmpleFlow].[InventoryReservation] ([Tenantid], [ReferenceType], [ReferenceId]);
END
GO

IF NOT EXISTS (
    SELECT 1 FROM [CimmpleFlow].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260816180000_AddInventoryReservation'
)
BEGIN
    INSERT INTO [CimmpleFlow].[__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260816180000_AddInventoryReservation', N'7.0.0');
END
GO

GO

PRINT N'--- AddSourcingTypeToProductMaster.sql ---';
GO

-- Classify Product Master as Make (shop), Buy (purchased finished), or Both.
-- Idempotent.

IF COL_LENGTH('CimmpleFlow.ProductMaster', 'SourcingType') IS NULL
BEGIN
    ALTER TABLE [CimmpleFlow].[ProductMaster] ADD [SourcingType] nvarchar(20) NULL;
END
GO

UPDATE [CimmpleFlow].[ProductMaster]
SET [SourcingType] = N'Make'
WHERE [SourcingType] IS NULL OR LTRIM(RTRIM([SourcingType])) = N'';
GO

IF NOT EXISTS (
    SELECT 1 FROM [CimmpleFlow].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260815120000_AddSourcingTypeToProductMaster'
)
BEGIN
    INSERT INTO [CimmpleFlow].[__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260815120000_AddSourcingTypeToProductMaster', N'7.0.0');
END
GO

GO

PRINT N'--- AddReorderPolicyToProductMaster.sql ---';
GO

-- Reorder point / qty on Product Master so finished goods can drive Inventory low stock.
-- Idempotent.

IF COL_LENGTH('CimmpleFlow.ProductMaster', 'ReorderPoint') IS NULL
BEGIN
    ALTER TABLE [CimmpleFlow].[ProductMaster] ADD [ReorderPoint] decimal(18,2) NULL;
END
GO

IF COL_LENGTH('CimmpleFlow.ProductMaster', 'ReorderQuantity') IS NULL
BEGIN
    ALTER TABLE [CimmpleFlow].[ProductMaster] ADD [ReorderQuantity] decimal(18,2) NULL;
END
GO

IF NOT EXISTS (
    SELECT 1 FROM [CimmpleFlow].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260816120000_AddReorderPolicyToProductMaster'
)
BEGIN
    INSERT INTO [CimmpleFlow].[__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260816120000_AddReorderPolicyToProductMaster', N'7.0.0');
END
GO

GO

PRINT N'--- AddVendorOrderDetailLineType.sql ---';
GO

-- Line-level descriptor for vendor PO lines (RawMaterial, FinishedProduct, Tool, Service, Subcontract, Other).
-- Run against your Cimmple database if the column does not exist.

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID(N'CimmpleFlow.VendorOrderDetails') AND name = N'LineType'
)
BEGIN
    ALTER TABLE CimmpleFlow.VendorOrderDetails ADD LineType NVARCHAR(50) NULL;
    -- Backfill: optional â€” align with order MaterialType when known via app, or leave NULL (API defaults on read)
    PRINT 'Column VendorOrderDetails.LineType added.';
END
ELSE
    PRINT 'Column VendorOrderDetails.LineType already exists.';
GO

GO

PRINT N'--- AddLineTypeToVendorQuotationsDetails.sql ---';
GO

-- Line type on vendor quotation details so convert-to-PO keeps classification.
-- Idempotent.

IF COL_LENGTH('CimmpleFlow.VendorQuotationsDetails', 'LineType') IS NULL
BEGIN
    ALTER TABLE [CimmpleFlow].[VendorQuotationsDetails] ADD [LineType] nvarchar(50) NULL;
END
GO

IF COL_LENGTH('CimmpleFlow.VendorQuotationsDetails', 'RawMaterialId') IS NULL
BEGIN
    ALTER TABLE [CimmpleFlow].[VendorQuotationsDetails] ADD [RawMaterialId] int NULL;
END
GO

IF NOT EXISTS (
    SELECT 1 FROM [CimmpleFlow].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260815220000_AddLineTypeToVendorQuotationsDetails'
)
BEGIN
    INSERT INTO [CimmpleFlow].[__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260815220000_AddLineTypeToVendorQuotationsDetails', N'7.0.0');
END
GO

GO

PRINT N'--- AddJobTemplateMaster.sql ---';
GO

-- Job Template Master + generic category system
-- (run if the EF migration 20260731085225_AddJobTemplateMaster has not been applied yet)
-- (USE stripped; already on CimmpleERPDB)
GO

-- =============================================
-- CATEGORY TYPE / CATEGORY VALUE
-- Generic classification tables, not specific to job templates
-- =============================================

IF OBJECT_ID('CimmpleFlow.CategoryType', 'U') IS NULL
BEGIN
    CREATE TABLE CimmpleFlow.CategoryType
    (
        Id              int IDENTITY(1,1) NOT NULL CONSTRAINT PK_CategoryType PRIMARY KEY,
        Tenantid        int NOT NULL,
        Code            nvarchar(50) NULL,
        Name            nvarchar(100) NULL,
        Description     nvarchar(500) NULL,
        DisplayOrder    int NOT NULL CONSTRAINT DF_CategoryType_DisplayOrder DEFAULT 0,
        AllowUserValues bit NOT NULL CONSTRAINT DF_CategoryType_AllowUserValues DEFAULT 1,
        IsSystem        bit NOT NULL CONSTRAINT DF_CategoryType_IsSystem DEFAULT 0,
        IsActive        bit NOT NULL CONSTRAINT DF_CategoryType_IsActive DEFAULT 1
    );

    CREATE UNIQUE INDEX IX_CategoryType_Tenantid_Name
        ON CimmpleFlow.CategoryType (Tenantid, Name) WHERE Name IS NOT NULL;
END
GO

IF OBJECT_ID('CimmpleFlow.CategoryValue', 'U') IS NULL
BEGIN
    CREATE TABLE CimmpleFlow.CategoryValue
    (
        Id             int IDENTITY(1,1) NOT NULL CONSTRAINT PK_CategoryValue PRIMARY KEY,
        Tenantid       int NOT NULL,
        CategoryTypeId int NOT NULL,
        Code           nvarchar(50) NULL,
        Name           nvarchar(150) NULL,
        Description    nvarchar(500) NULL,
        DisplayOrder   int NOT NULL CONSTRAINT DF_CategoryValue_DisplayOrder DEFAULT 0,
        IsSystem       bit NOT NULL CONSTRAINT DF_CategoryValue_IsSystem DEFAULT 0,
        IsActive       bit NOT NULL CONSTRAINT DF_CategoryValue_IsActive DEFAULT 1,
        CONSTRAINT FK_CategoryValue_CategoryType_CategoryTypeId
            FOREIGN KEY (CategoryTypeId) REFERENCES CimmpleFlow.CategoryType (Id) ON DELETE CASCADE
    );

    CREATE UNIQUE INDEX IX_CategoryValue_CategoryTypeId_Name
        ON CimmpleFlow.CategoryValue (CategoryTypeId, Name) WHERE Name IS NOT NULL;
    CREATE INDEX IX_CategoryValue_Tenantid_CategoryTypeId
        ON CimmpleFlow.CategoryValue (Tenantid, CategoryTypeId);
END
GO

-- =============================================
-- JOB TEMPLATE MASTER
-- =============================================

IF OBJECT_ID('CimmpleFlow.JobTemplateMaster', 'U') IS NULL
BEGIN
    CREATE TABLE CimmpleFlow.JobTemplateMaster
    (
        Id                           int IDENTITY(1,1) NOT NULL CONSTRAINT PK_JobTemplateMaster PRIMARY KEY,
        Tenantid                     int NOT NULL,

        TemplateCode                 nvarchar(50) NULL,
        TemplateName                 nvarchar(200) NULL,
        [Description]                nvarchar(max) NULL,
        [Status]                     int NOT NULL CONSTRAINT DF_JobTemplateMaster_Status DEFAULT 1,
        Revision                     int NOT NULL CONSTRAINT DF_JobTemplateMaster_Revision DEFAULT 1,
        EffectiveFrom                datetime2 NULL,
        EffectiveTo                  datetime2 NULL,

        PrimaryProcessId             int NULL,
        WorkstationId                int NULL,
        EstimatedSetupTimeMinutes    decimal(18,2) NULL,
        EstimatedCycleTimeMinutes    decimal(18,2) NULL,
        EstimatedLabourTimeMinutes   decimal(18,2) NULL,
        EstimatedMachineTimeMinutes  decimal(18,2) NULL,

        DefaultMaterial              nvarchar(200) NULL,
        MaterialGrade                nvarchar(100) NULL,
        RawMaterialSize              nvarchar(100) NULL,
        MaterialNotes                nvarchar(max) NULL,

        Tool                         nvarchar(200) NULL,
        Fixture                      nvarchar(200) NULL,
        Workholding                  nvarchar(200) NULL,
        Gauge                        nvarchar(200) NULL,
        ToolingNotes                 nvarchar(max) NULL,

        InspectionType               nvarchar(100) NULL,
        FirstArticleRequired         bit NOT NULL CONSTRAINT DF_JobTemplateMaster_FirstArticleRequired DEFAULT 0,
        InProcessInspection          bit NOT NULL CONSTRAINT DF_JobTemplateMaster_InProcessInspection DEFAULT 0,
        FinalInspection              bit NOT NULL CONSTRAINT DF_JobTemplateMaster_FinalInspection DEFAULT 0,
        CmmRequired                  bit NOT NULL CONSTRAINT DF_JobTemplateMaster_CmmRequired DEFAULT 0,
        InspectionNotes              nvarchar(max) NULL,

        IsSystem                     bit NOT NULL CONSTRAINT DF_JobTemplateMaster_IsSystem DEFAULT 0,
        CreatedDate                  datetime2 NOT NULL CONSTRAINT DF_JobTemplateMaster_CreatedDate DEFAULT SYSDATETIME(),
        CreatedBy                    int NULL,
        ModifiedDate                 datetime2 NULL,
        ModifiedBy                   int NULL
    );

    CREATE UNIQUE INDEX IX_JobTemplateMaster_Tenantid_TemplateCode
        ON CimmpleFlow.JobTemplateMaster (Tenantid, TemplateCode) WHERE TemplateCode IS NOT NULL;
    CREATE INDEX IX_JobTemplateMaster_Tenantid_TemplateName
        ON CimmpleFlow.JobTemplateMaster (Tenantid, TemplateName);
    CREATE INDEX IX_JobTemplateMaster_Tenantid_Status
        ON CimmpleFlow.JobTemplateMaster (Tenantid, [Status]);
END
GO

IF OBJECT_ID('CimmpleFlow.JobTemplateOperation', 'U') IS NULL
BEGIN
    CREATE TABLE CimmpleFlow.JobTemplateOperation
    (
        Id                   int IDENTITY(1,1) NOT NULL CONSTRAINT PK_JobTemplateOperation PRIMARY KEY,
        JobTemplateId        int NOT NULL,
        Tenantid             int NOT NULL,
        SequenceNumber       int NOT NULL,
        ProcessId            int NULL,
        WorkstationId        int NULL,
        SetupTimeMinutes     decimal(18,2) NULL,
        CycleTimeMinutes     decimal(18,2) NULL,
        Instructions         nvarchar(max) NULL,
        IsMandatory          bit NOT NULL CONSTRAINT DF_JobTemplateOperation_IsMandatory DEFAULT 1,
        QualityCheckRequired bit NOT NULL CONSTRAINT DF_JobTemplateOperation_QualityCheckRequired DEFAULT 0,
        CONSTRAINT FK_JobTemplateOperation_JobTemplateMaster_JobTemplateId
            FOREIGN KEY (JobTemplateId) REFERENCES CimmpleFlow.JobTemplateMaster (Id) ON DELETE CASCADE
    );

    CREATE UNIQUE INDEX IX_JobTemplateOperation_JobTemplateId_SequenceNumber
        ON CimmpleFlow.JobTemplateOperation (JobTemplateId, SequenceNumber);
END
GO

IF OBJECT_ID('CimmpleFlow.JobTemplateCategory', 'U') IS NULL
BEGIN
    CREATE TABLE CimmpleFlow.JobTemplateCategory
    (
        Id              int IDENTITY(1,1) NOT NULL CONSTRAINT PK_JobTemplateCategory PRIMARY KEY,
        JobTemplateId   int NOT NULL,
        CategoryValueId int NOT NULL,
        Tenantid        int NOT NULL,
        CONSTRAINT FK_JobTemplateCategory_JobTemplateMaster_JobTemplateId
            FOREIGN KEY (JobTemplateId) REFERENCES CimmpleFlow.JobTemplateMaster (Id) ON DELETE CASCADE,
        CONSTRAINT FK_JobTemplateCategory_CategoryValue_CategoryValueId
            FOREIGN KEY (CategoryValueId) REFERENCES CimmpleFlow.CategoryValue (Id)
    );

    CREATE UNIQUE INDEX IX_JobTemplateCategory_JobTemplateId_CategoryValueId
        ON CimmpleFlow.JobTemplateCategory (JobTemplateId, CategoryValueId);
    CREATE INDEX IX_JobTemplateCategory_CategoryValueId
        ON CimmpleFlow.JobTemplateCategory (CategoryValueId);
END
GO

IF OBJECT_ID('CimmpleFlow.JobTemplateAttachment', 'U') IS NULL
BEGIN
    CREATE TABLE CimmpleFlow.JobTemplateAttachment
    (
        Id             int IDENTITY(1,1) NOT NULL CONSTRAINT PK_JobTemplateAttachment PRIMARY KEY,
        JobTemplateId  int NOT NULL,
        Tenantid       int NOT NULL,
        AttachmentType nvarchar(50) NULL,
        FileName       nvarchar(255) NULL,
        FileUrl        nvarchar(500) NULL,
        ContentType    nvarchar(100) NULL,
        FileSize       bigint NOT NULL CONSTRAINT DF_JobTemplateAttachment_FileSize DEFAULT 0,
        UploadedDate   datetime2 NOT NULL CONSTRAINT DF_JobTemplateAttachment_UploadedDate DEFAULT SYSDATETIME(),
        UploadedBy     int NULL,
        CONSTRAINT FK_JobTemplateAttachment_JobTemplateMaster_JobTemplateId
            FOREIGN KEY (JobTemplateId) REFERENCES CimmpleFlow.JobTemplateMaster (Id) ON DELETE CASCADE
    );

    CREATE INDEX IX_JobTemplateAttachment_JobTemplateId
        ON CimmpleFlow.JobTemplateAttachment (JobTemplateId);
END
GO

-- =============================================
-- Seed the starter category types for every tenant that already has master data.
-- Tenants created later get the same set from the "Load Default Types" action on
-- the Category Master page, which calls Category/EnsureDefaultCategoryTypes.
-- =============================================

DECLARE @DefaultTypes TABLE (Name nvarchar(100), Code nvarchar(50), DisplayOrder int);
INSERT INTO @DefaultTypes (Name, Code, DisplayOrder) VALUES
    ('Process',         'PROCESS',     1),
    ('Material',        'MATERIAL',    2),
    ('Part Family',     'PARTFAMILY',  3),
    ('Machine',         'MACHINE',     4),
    ('Customer',        'CUSTOMER',    5),
    ('Production Type', 'PRODTYPE',    6),
    ('Inspection',      'INSPECTION',  7),
    ('Complexity',      'COMPLEXITY',  8),
    ('Product Line',    'PRODUCTLINE', 9);

DECLARE @DefaultValues TABLE (TypeName nvarchar(100), Name nvarchar(150), DisplayOrder int);
INSERT INTO @DefaultValues (TypeName, Name, DisplayOrder) VALUES
    ('Process', 'Milling', 1), ('Process', 'Turning', 2), ('Process', 'Grinding', 3),
    ('Process', 'Drilling', 4), ('Process', 'Welding', 5), ('Process', 'Assembly', 6),
    ('Process', 'Finishing', 7),
    ('Material', 'Aluminium', 1), ('Material', 'Steel', 2), ('Material', 'Stainless Steel', 3),
    ('Material', 'Titanium', 4), ('Material', 'Brass', 5), ('Material', 'Plastic', 6),
    ('Production Type', 'Prototype', 1), ('Production Type', 'Batch Production', 2),
    ('Production Type', 'Mass Production', 3), ('Production Type', 'One-Off', 4),
    ('Inspection', 'First Article', 1), ('Inspection', 'In-Process', 2),
    ('Inspection', 'Final', 3), ('Inspection', 'CMM', 4),
    ('Complexity', 'Low', 1), ('Complexity', 'Medium', 2), ('Complexity', 'High', 3);

INSERT INTO CimmpleFlow.CategoryType (Tenantid, Name, Code, DisplayOrder, AllowUserValues, IsSystem, IsActive)
SELECT t.Tenantid, d.Name, d.Code, d.DisplayOrder, 1, 1, 1
FROM (SELECT DISTINCT Tenantid FROM CimmpleFlow.ProcessMaster) t
CROSS JOIN @DefaultTypes d
WHERE NOT EXISTS (
    SELECT 1 FROM CimmpleFlow.CategoryType ct
    WHERE ct.Tenantid = t.Tenantid AND ct.Name = d.Name
);

INSERT INTO CimmpleFlow.CategoryValue (Tenantid, CategoryTypeId, Name, DisplayOrder, IsSystem, IsActive)
SELECT ct.Tenantid, ct.Id, dv.Name, dv.DisplayOrder, 1, 1
FROM CimmpleFlow.CategoryType ct
INNER JOIN @DefaultValues dv ON dv.TypeName = ct.Name
WHERE ct.IsSystem = 1
  AND NOT EXISTS (
    SELECT 1 FROM CimmpleFlow.CategoryValue cv
    WHERE cv.CategoryTypeId = ct.Id AND cv.Name = dv.Name
);
GO

-- Mark the equivalent EF migration as applied so a later "dotnet ef database update"
-- does not try to re-create these tables
IF OBJECT_ID('CimmpleFlow.__EFMigrationsHistory', 'U') IS NOT NULL
BEGIN
    IF NOT EXISTS (SELECT 1 FROM CimmpleFlow.__EFMigrationsHistory WHERE MigrationId = '20260731085225_AddJobTemplateMaster')
        INSERT INTO CimmpleFlow.__EFMigrationsHistory (MigrationId, ProductVersion)
        VALUES ('20260731085225_AddJobTemplateMaster', '7.0.0');
END
GO

GO

PRINT N'--- AddJobMaterialRequirements.sql ---';
GO

-- Planned material on job templates and job orders. Idempotent.

IF OBJECT_ID(N'CimmpleFlow.JobTemplateMaterial', N'U') IS NULL
BEGIN
    CREATE TABLE [CimmpleFlow].[JobTemplateMaterial] (
        [Id] int IDENTITY(1,1) NOT NULL,
        [JobTemplateId] int NOT NULL,
        [Tenantid] int NOT NULL,
        [SequenceNumber] int NOT NULL,
        [ProductId] int NULL,
        [RawMaterialId] int NULL,
        [Quantity] decimal(18,2) NOT NULL,
        [Notes] nvarchar(200) NULL,
        CONSTRAINT [PK_JobTemplateMaterial] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_JobTemplateMaterial_JobTemplateMaster_JobTemplateId]
            FOREIGN KEY ([JobTemplateId]) REFERENCES [CimmpleFlow].[JobTemplateMaster] ([Id]) ON DELETE CASCADE,
        CONSTRAINT [FK_JobTemplateMaterial_ProductMaster_ProductId]
            FOREIGN KEY ([ProductId]) REFERENCES [CimmpleFlow].[ProductMaster] ([Id]),
        CONSTRAINT [FK_JobTemplateMaterial_RawMaterialMaster_RawMaterialId]
            FOREIGN KEY ([RawMaterialId]) REFERENCES [CimmpleFlow].[RawMaterialMaster] ([Id])
    );

    CREATE INDEX [IX_JobTemplateMaterial_JobTemplateId_SequenceNumber]
        ON [CimmpleFlow].[JobTemplateMaterial] ([JobTemplateId], [SequenceNumber]);
END
GO

IF OBJECT_ID(N'CimmpleFlow.JobMaterialRequirement', N'U') IS NULL
BEGIN
    CREATE TABLE [CimmpleFlow].[JobMaterialRequirement] (
        [Id] int IDENTITY(1,1) NOT NULL,
        [JobOrderId] int NOT NULL,
        [Tenantid] int NOT NULL,
        [SequenceNumber] int NOT NULL,
        [ProductId] int NULL,
        [RawMaterialId] int NULL,
        [QuantityNeeded] decimal(18,2) NOT NULL,
        [Notes] nvarchar(200) NULL,
        CONSTRAINT [PK_JobMaterialRequirement] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_JobMaterialRequirement_JobOrderMaster_JobOrderId]
            FOREIGN KEY ([JobOrderId]) REFERENCES [CimmpleFlow].[JobOrderMaster] ([JobOrderID]) ON DELETE CASCADE,
        CONSTRAINT [FK_JobMaterialRequirement_ProductMaster_ProductId]
            FOREIGN KEY ([ProductId]) REFERENCES [CimmpleFlow].[ProductMaster] ([Id]),
        CONSTRAINT [FK_JobMaterialRequirement_RawMaterialMaster_RawMaterialId]
            FOREIGN KEY ([RawMaterialId]) REFERENCES [CimmpleFlow].[RawMaterialMaster] ([Id])
    );

    CREATE INDEX [IX_JobMaterialRequirement_JobOrderId]
        ON [CimmpleFlow].[JobMaterialRequirement] ([JobOrderId]);
END
GO

IF NOT EXISTS (
    SELECT 1 FROM [CimmpleFlow].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260817120000_AddJobMaterialRequirements'
)
BEGIN
    INSERT INTO [CimmpleFlow].[__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260817120000_AddJobMaterialRequirements', N'7.0.0');
END
GO

GO

PRINT N'--- EnhanceProcessMaster.sql ---';
GO

-- Enhance ProcessMaster columns (run if EF migration has not been applied yet)
-- (USE stripped; already on CimmpleERPDB)
IF COL_LENGTH('CimmpleFlow.ProcessMaster', 'ProcessCode') IS NULL
BEGIN
    ALTER TABLE CimmpleFlow.ProcessMaster ALTER COLUMN ProcessName nvarchar(200) NULL;
    ALTER TABLE CimmpleFlow.ProcessMaster ALTER COLUMN ledgercode nvarchar(50) NULL;

    ALTER TABLE CimmpleFlow.ProcessMaster ADD ProcessCode nvarchar(50) NULL;
    ALTER TABLE CimmpleFlow.ProcessMaster ADD ProcessCategory nvarchar(50) NULL;
    ALTER TABLE CimmpleFlow.ProcessMaster ADD DefaultEstimatedTimeMinutes int NULL;
    ALTER TABLE CimmpleFlow.ProcessMaster ADD DefaultWorkstationId int NULL;
    ALTER TABLE CimmpleFlow.ProcessMaster ADD StandardCostPerHour decimal(18,2) NULL;

    CREATE INDEX IX_ProcessMaster_Tenantid_ProcessName ON CimmpleFlow.ProcessMaster (Tenantid, ProcessName);
    CREATE INDEX IX_ProcessMaster_Tenantid_ProcessCode ON CimmpleFlow.ProcessMaster (Tenantid, ProcessCode);
END
GO

-- Deletion protection moved off the Outside Services flag onto its own column
IF COL_LENGTH('CimmpleFlow.ProcessMaster', 'IsSystem') IS NULL
BEGIN
    ALTER TABLE CimmpleFlow.ProcessMaster ADD IsSystem bit NOT NULL CONSTRAINT DF_ProcessMaster_IsSystem DEFAULT 0;
END
GO

-- Mark the equivalent EF migrations as applied so a later "dotnet ef database update"
-- does not try to re-add these columns
IF OBJECT_ID('CimmpleFlow.__EFMigrationsHistory', 'U') IS NOT NULL
BEGIN
    IF NOT EXISTS (SELECT 1 FROM CimmpleFlow.__EFMigrationsHistory WHERE MigrationId = '20260729154500_EnhanceProcessMaster')
        INSERT INTO CimmpleFlow.__EFMigrationsHistory (MigrationId, ProductVersion)
        VALUES ('20260729154500_EnhanceProcessMaster', '7.0.0');

    IF NOT EXISTS (SELECT 1 FROM CimmpleFlow.__EFMigrationsHistory WHERE MigrationId = '20260731070000_AddIsSystemToProcessMaster')
        INSERT INTO CimmpleFlow.__EFMigrationsHistory (MigrationId, ProductVersion)
        VALUES ('20260731070000_AddIsSystemToProcessMaster', '7.0.0');
END
GO

GO

PRINT N'--- add_job_template_link_manual.sql ---';
GO

-- Add JobTemplateId, JobTemplateCode and JobTemplateRevision columns to JobOrderMaster
-- Records which job template a job order's router was built from.
-- This script is safe to run multiple times (checks if columns exist first)
-- (USE stripped; already on CimmpleERPDB)
IF NOT EXISTS (
    SELECT 1 
    FROM sys.columns 
    WHERE object_id = OBJECT_ID(N'CimmpleFlow.JobOrderMaster') 
    AND name = 'JobTemplateId'
)
BEGIN
    ALTER TABLE CimmpleFlow.JobOrderMaster
    ADD JobTemplateId int NULL;
    
    PRINT 'Column JobTemplateId added successfully.';
END
ELSE
BEGIN
    PRINT 'Column JobTemplateId already exists.';
END
GO

IF NOT EXISTS (
    SELECT 1 
    FROM sys.columns 
    WHERE object_id = OBJECT_ID(N'CimmpleFlow.JobOrderMaster') 
    AND name = 'JobTemplateCode'
)
BEGIN
    ALTER TABLE CimmpleFlow.JobOrderMaster
    ADD JobTemplateCode nvarchar(50) NULL;
    
    PRINT 'Column JobTemplateCode added successfully.';
END
ELSE
BEGIN
    PRINT 'Column JobTemplateCode already exists.';
END
GO

IF NOT EXISTS (
    SELECT 1 
    FROM sys.columns 
    WHERE object_id = OBJECT_ID(N'CimmpleFlow.JobOrderMaster') 
    AND name = 'JobTemplateRevision'
)
BEGIN
    ALTER TABLE CimmpleFlow.JobOrderMaster
    ADD JobTemplateRevision int NULL;
    
    PRINT 'Column JobTemplateRevision added successfully.';
END
ELSE
BEGIN
    PRINT 'Column JobTemplateRevision already exists.';
END
GO

-- Record the EF migration so "dotnet ef database update" does not try to add these again.
IF OBJECT_ID(N'CimmpleFlow.__EFMigrationsHistory', 'U') IS NOT NULL
BEGIN
    IF NOT EXISTS (SELECT 1 FROM CimmpleFlow.__EFMigrationsHistory WHERE MigrationId = '20260801120000_AddJobTemplateLinkToJobOrderMaster')
        INSERT INTO CimmpleFlow.__EFMigrationsHistory (MigrationId, ProductVersion)
        VALUES ('20260801120000_AddJobTemplateLinkToJobOrderMaster', '7.0.0');
END
GO

GO

PRINT N'--- add_enable_job_tracking_manual.sql ---';
GO

-- Add EnableJobTracking column to JobOrderMaster
-- Persists the "Enable Job Tracking" checkbox on the Job Order slideout.
-- This script is safe to run multiple times (checks if column exists first)
-- (USE stripped; already on CimmpleERPDB)
IF NOT EXISTS (
    SELECT 1
    FROM sys.columns
    WHERE object_id = OBJECT_ID(N'CimmpleFlow.JobOrderMaster')
    AND name = 'EnableJobTracking'
)
BEGIN
    ALTER TABLE CimmpleFlow.JobOrderMaster
    ADD EnableJobTracking bit NOT NULL CONSTRAINT DF_JobOrderMaster_EnableJobTracking DEFAULT (0);

    PRINT 'Column EnableJobTracking added successfully.';
END
ELSE
BEGIN
    PRINT 'Column EnableJobTracking already exists.';
END
GO

-- Record the EF migration so "dotnet ef database update" does not try to add this again.
IF OBJECT_ID(N'CimmpleFlow.__EFMigrationsHistory', 'U') IS NOT NULL
BEGIN
    IF NOT EXISTS (SELECT 1 FROM CimmpleFlow.__EFMigrationsHistory WHERE MigrationId = '20260807210000_AddEnableJobTrackingToJobOrderMaster')
        INSERT INTO CimmpleFlow.__EFMigrationsHistory (MigrationId, ProductVersion)
        VALUES ('20260807210000_AddEnableJobTrackingToJobOrderMaster', '7.0.0');
END
GO

GO

PRINT N'--- Optional: DecimalReceiveAndShipQty (fractional qty) ---';
PRINT N'Skipped by default. Run Cimmple_API\CimmpleAPI\Scripts\DecimalReceiveAndShipQty.sql separately if needed.';
GO

PRINT N'=== Priority-2 verification ===';
SELECT DB_NAME() AS CurrentDatabase;

SELECT t.name AS TableName
FROM sys.tables t
JOIN sys.schemas s ON t.schema_id = s.schema_id
WHERE s.name = N'CimmpleFlow'
  AND t.name IN (
    N'RawMaterialMaster', N'InventoryBalance', N'InventoryTransaction', N'InventoryReservation',
    N'JobTemplateMaster', N'JobTemplateMaterial', N'JobMaterialRequirement', N'CategoryType'
  )
ORDER BY t.name;

SELECT
  COL_LENGTH(N'CimmpleFlow.ProductMaster', N'SourcingType') AS SourcingType,
  COL_LENGTH(N'CimmpleFlow.ProductMaster', N'ReorderPoint') AS ReorderPoint,
  COL_LENGTH(N'CimmpleFlow.VendorOrderDetails', N'LineType') AS VO_LineType,
  COL_LENGTH(N'CimmpleFlow.VendorOrderDetails', N'RawMaterialId') AS VO_RawMaterialId,
  COL_LENGTH(N'CimmpleFlow.JobOrderMaster', N'JobTemplateId') AS JO_JobTemplateId,
  COL_LENGTH(N'CimmpleFlow.JobOrderMaster', N'EnableJobTracking') AS JO_EnableJobTracking,
  COL_LENGTH(N'CimmpleFlow.ProcessMaster', N'ProcessCode') AS ProcessCode,
  COL_LENGTH(N'CimmpleFlow.RawMaterialMaster', N'Sku') AS RM_Sku;

PRINT N'=== Priority-2 replay finished ===';
GO
