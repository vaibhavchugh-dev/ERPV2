-- Migration: Add ParentQuotationID to VendorQuotations table
-- This field links related quotations for comparison when sending to multiple vendors

IF NOT EXISTS (
    SELECT * FROM sys.columns 
    WHERE object_id = OBJECT_ID(N'[dbo].[VendorQuotations]') 
    AND name = 'ParentQuotationID'
)
BEGIN
    ALTER TABLE [dbo].[VendorQuotations]
    ADD [ParentQuotationID] int NULL;

    -- Add index for faster queries
    CREATE INDEX IX_VendorQuotations_ParentQuotationID 
    ON [dbo].[VendorQuotations]([ParentQuotationID]);

    PRINT 'ParentQuotationID column added successfully';
END
ELSE
BEGIN
    PRINT 'ParentQuotationID column already exists';
END
GO




































