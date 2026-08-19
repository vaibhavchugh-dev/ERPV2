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
