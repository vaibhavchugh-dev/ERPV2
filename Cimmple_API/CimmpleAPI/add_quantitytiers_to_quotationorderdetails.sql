-- Add QuantityTiers column to QuotationOrderDetails table
-- This column stores JSON string for quantity-based pricing tiers

IF NOT EXISTS (
    SELECT 1 
    FROM sys.columns 
    WHERE object_id = OBJECT_ID(N'[dbo].[QuotationOrderDetails]') 
    AND name = 'QuantityTiers'
)
BEGIN
    ALTER TABLE [dbo].[QuotationOrderDetails]
    ADD [QuantityTiers] NVARCHAR(MAX) NULL;
    
    PRINT 'QuantityTiers column added to QuotationOrderDetails table';
END
ELSE
BEGIN
    PRINT 'QuantityTiers column already exists in QuotationOrderDetails table';
END
GO



