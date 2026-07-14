-- Add AdditionalNotes column to VendorQuotations table
-- This stores additional notes from vendors in their quotation responses
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[VendorQuotations]') AND name = 'AdditionalNotes')
BEGIN
    ALTER TABLE [dbo].[VendorQuotations]
    ADD [AdditionalNotes] NVARCHAR(MAX) NULL;
    PRINT 'Added AdditionalNotes column to VendorQuotations';
END
ELSE
BEGIN
    PRINT 'AdditionalNotes column already exists in VendorQuotations';
END
GO

PRINT 'Script completed successfully!';



































