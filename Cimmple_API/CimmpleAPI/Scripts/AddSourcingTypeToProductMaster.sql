-- Classify Product Master as Make (shop), Buy (purchased finished), or Both.
-- Idempotent.

IF COL_LENGTH('dbo.ProductMaster', 'SourcingType') IS NULL
BEGIN
    ALTER TABLE [dbo].[ProductMaster] ADD [SourcingType] nvarchar(20) NULL;
END
GO

UPDATE [dbo].[ProductMaster]
SET [SourcingType] = N'Make'
WHERE [SourcingType] IS NULL OR LTRIM(RTRIM([SourcingType])) = N'';
GO

IF NOT EXISTS (
    SELECT 1 FROM [dbo].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260815120000_AddSourcingTypeToProductMaster'
)
BEGIN
    INSERT INTO [dbo].[__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260815120000_AddSourcingTypeToProductMaster', N'7.0.0');
END
GO
