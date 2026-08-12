-- Phase 1 inventory: vendor PO lines can reference Raw Material Master for stock receiving.
-- Idempotent: safe to run multiple times.

IF COL_LENGTH('dbo.VendorOrderDetails', 'RawMaterialId') IS NULL
BEGIN
    ALTER TABLE [dbo].[VendorOrderDetails] ADD [RawMaterialId] int NULL;
END
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_VendorOrderDetails_RawMaterialId'
      AND object_id = OBJECT_ID(N'dbo.VendorOrderDetails')
)
BEGIN
    CREATE INDEX [IX_VendorOrderDetails_RawMaterialId]
        ON [dbo].[VendorOrderDetails] ([RawMaterialId]);
END
GO

IF NOT EXISTS (
    SELECT 1 FROM [dbo].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260812190000_AddRawMaterialIdToVendorOrderDetails'
)
BEGIN
    INSERT INTO [dbo].[__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260812190000_AddRawMaterialIdToVendorOrderDetails', N'7.0.0');
END
GO
