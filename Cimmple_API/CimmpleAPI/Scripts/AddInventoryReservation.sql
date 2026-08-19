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
