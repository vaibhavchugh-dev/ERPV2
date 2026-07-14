-- Add convertedOrderId column to QuotationOrder table
-- This script is safe to run multiple times (checks if column exists first)

IF NOT EXISTS (
    SELECT 1 
    FROM sys.columns 
    WHERE object_id = OBJECT_ID('QuotationOrder') 
    AND name = 'convertedOrderId'
)
BEGIN
    ALTER TABLE QuotationOrder
    ADD convertedOrderId int NULL;
    
    PRINT 'Column convertedOrderId added successfully to QuotationOrder table.';
END
ELSE
BEGIN
    PRINT 'Column convertedOrderId already exists in QuotationOrder table.';
END
GO


