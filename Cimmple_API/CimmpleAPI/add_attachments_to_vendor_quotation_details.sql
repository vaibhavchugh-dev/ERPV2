-- Add AttachmentsJson column to VendorQuotationsDetails table
-- This fixes the error: Invalid column name 'AttachmentsJson'
-- Run this script in SQL Server Management Studio or your database tool

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[VendorQuotationsDetails]') AND name = 'AttachmentsJson')
BEGIN
    ALTER TABLE [dbo].[VendorQuotationsDetails]
    ADD [AttachmentsJson] NVARCHAR(MAX) NULL;
    PRINT 'Added AttachmentsJson column to VendorQuotationsDetails';
END
ELSE
BEGIN
    PRINT 'AttachmentsJson column already exists in VendorQuotationsDetails';
END
GO

PRINT 'Script completed successfully!';



































