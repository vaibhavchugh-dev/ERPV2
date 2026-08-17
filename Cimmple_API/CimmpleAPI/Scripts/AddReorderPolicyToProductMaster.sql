-- Reorder point / qty on Product Master so finished goods can drive Inventory low stock.
-- Idempotent.

IF COL_LENGTH('dbo.ProductMaster', 'ReorderPoint') IS NULL
BEGIN
    ALTER TABLE [dbo].[ProductMaster] ADD [ReorderPoint] decimal(18,2) NULL;
END
GO

IF COL_LENGTH('dbo.ProductMaster', 'ReorderQuantity') IS NULL
BEGIN
    ALTER TABLE [dbo].[ProductMaster] ADD [ReorderQuantity] decimal(18,2) NULL;
END
GO

IF NOT EXISTS (
    SELECT 1 FROM [dbo].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260816120000_AddReorderPolicyToProductMaster'
)
BEGIN
    INSERT INTO [dbo].[__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260816120000_AddReorderPolicyToProductMaster', N'7.0.0');
END
GO
