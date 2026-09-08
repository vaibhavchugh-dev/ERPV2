-- Add DiscountType column (Percent | Amount) to customer invoice detail lines.
-- EF maps tables under CimmpleFlow (not dbo). Default NULL is treated as Percent.

IF OBJECT_ID(N'CimmpleFlow.InvoiceDetail', N'U') IS NOT NULL
   AND COL_LENGTH(N'CimmpleFlow.InvoiceDetail', N'DiscountType') IS NULL
BEGIN
    ALTER TABLE CimmpleFlow.InvoiceDetail
    ADD [DiscountType] NVARCHAR(20) NULL;
    PRINT 'DiscountType column added to CimmpleFlow.InvoiceDetail';
END
ELSE
BEGIN
    PRINT 'DiscountType already present or CimmpleFlow.InvoiceDetail missing';
END
GO
