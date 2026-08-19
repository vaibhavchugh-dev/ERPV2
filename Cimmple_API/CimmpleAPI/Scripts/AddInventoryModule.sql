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
IF NOT EXISTS (SELECT * FROM [__EFMigrationsHistory] WHERE [MigrationId] = N'20260311080000_AddInventoryModule')
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
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260311080000_AddInventoryModule', N'7.0.0');

    COMMIT TRANSACTION;
    PRINT 'Inventory module tables created successfully.';
END
ELSE
BEGIN
    PRINT 'Inventory module migration already applied. Skipping.';
END
GO
