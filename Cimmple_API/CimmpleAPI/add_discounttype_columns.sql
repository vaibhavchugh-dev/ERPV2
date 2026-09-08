-- Add DiscountType (Percent | Amount) to customer quotation/order details.
-- EF maps tables under CimmpleFlow (not dbo).

IF OBJECT_ID(N'CimmpleFlow.QuotationOrderDetails', N'U') IS NOT NULL
   AND COL_LENGTH(N'CimmpleFlow.QuotationOrderDetails', N'DiscountType') IS NULL
BEGIN
    ALTER TABLE CimmpleFlow.QuotationOrderDetails
    ADD [DiscountType] NVARCHAR(20) NULL;
    PRINT 'DiscountType column added to CimmpleFlow.QuotationOrderDetails';
END
GO

IF OBJECT_ID(N'CimmpleFlow.CustomerOrderDetails', N'U') IS NOT NULL
   AND COL_LENGTH(N'CimmpleFlow.CustomerOrderDetails', N'DiscountType') IS NULL
BEGIN
    ALTER TABLE CimmpleFlow.CustomerOrderDetails
    ADD [DiscountType] NVARCHAR(20) NULL;
    PRINT 'DiscountType column added to CimmpleFlow.CustomerOrderDetails';
END
GO
