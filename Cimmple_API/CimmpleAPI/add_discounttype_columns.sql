-- Add DiscountType column (Percent | Amount) to quotation and order detail tables.
-- Default NULL is treated as Percent for backward compatibility.

IF NOT EXISTS (
    SELECT 1
    FROM sys.columns
    WHERE object_id = OBJECT_ID(N'[dbo].[QuotationOrderDetails]')
    AND name = 'DiscountType'
)
BEGIN
    ALTER TABLE [dbo].[QuotationOrderDetails]
    ADD [DiscountType] NVARCHAR(20) NULL;
    PRINT 'DiscountType column added to QuotationOrderDetails table';
END
ELSE
BEGIN
    PRINT 'DiscountType column already exists in QuotationOrderDetails table';
END
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.columns
    WHERE object_id = OBJECT_ID(N'[dbo].[CustomerOrderDetails]')
    AND name = 'DiscountType'
)
BEGIN
    ALTER TABLE [dbo].[CustomerOrderDetails]
    ADD [DiscountType] NVARCHAR(20) NULL;
    PRINT 'DiscountType column added to CustomerOrderDetails table';
END
ELSE
BEGIN
    PRINT 'DiscountType column already exists in CustomerOrderDetails table';
END
GO
