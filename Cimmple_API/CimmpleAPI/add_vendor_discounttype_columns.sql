-- Add DiscountType (Percent | Amount) to vendor quotation/order details.
-- EF maps tables under CimmpleFlow (not dbo).

IF OBJECT_ID(N'CimmpleFlow.VendorQuotationsDetails', N'U') IS NOT NULL
   AND COL_LENGTH(N'CimmpleFlow.VendorQuotationsDetails', N'DiscountType') IS NULL
BEGIN
    ALTER TABLE CimmpleFlow.VendorQuotationsDetails
    ADD [DiscountType] NVARCHAR(20) NULL;
    PRINT 'DiscountType column added to CimmpleFlow.VendorQuotationsDetails';
END
GO

IF OBJECT_ID(N'CimmpleFlow.VendorOrderDetails', N'U') IS NOT NULL
   AND COL_LENGTH(N'CimmpleFlow.VendorOrderDetails', N'DiscountType') IS NULL
BEGIN
    ALTER TABLE CimmpleFlow.VendorOrderDetails
    ADD [DiscountType] NVARCHAR(20) NULL;
    PRINT 'DiscountType column added to CimmpleFlow.VendorOrderDetails';
END
GO
