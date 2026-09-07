-- Add DiscountType column (Percent | Amount) to customer invoice detail lines.
-- Default NULL is treated as Percent for backward compatibility.

IF NOT EXISTS (
    SELECT 1
    FROM sys.columns
    WHERE object_id = OBJECT_ID(N'[dbo].[InvoiceDetail]')
    AND name = 'DiscountType'
)
BEGIN
    ALTER TABLE [dbo].[InvoiceDetail]
    ADD [DiscountType] NVARCHAR(20) NULL;
    PRINT 'DiscountType column added to InvoiceDetail table';
END
ELSE
BEGIN
    PRINT 'DiscountType column already exists in InvoiceDetail table';
END
GO
