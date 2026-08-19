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
