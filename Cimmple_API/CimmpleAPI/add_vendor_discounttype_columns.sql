-- Add DiscountType column (Percent | Amount) to vendor quotation and vendor order detail tables.
-- Default NULL is treated as Percent for backward compatibility.

IF NOT EXISTS (
    SELECT 1
    FROM sys.columns
    WHERE object_id = OBJECT_ID(N'[dbo].[VendorQuotationsDetails]')
    AND name = 'DiscountType'
)
BEGIN
    ALTER TABLE [dbo].[VendorQuotationsDetails]
    ADD [DiscountType] NVARCHAR(20) NULL;
    PRINT 'DiscountType column added to VendorQuotationsDetails table';
END
ELSE
BEGIN
    PRINT 'DiscountType column already exists in VendorQuotationsDetails table';
END
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.columns
    WHERE object_id = OBJECT_ID(N'[dbo].[VendorOrderDetails]')
    AND name = 'DiscountType'
)
BEGIN
    ALTER TABLE [dbo].[VendorOrderDetails]
    ADD [DiscountType] NVARCHAR(20) NULL;
    PRINT 'DiscountType column added to VendorOrderDetails table';
END
ELSE
BEGIN
    PRINT 'DiscountType column already exists in VendorOrderDetails table';
END
GO
