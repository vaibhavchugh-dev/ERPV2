-- Fix Quotation PONumbers to start from 1000
-- This script renumbers all existing quotations for tenant 1 based on creation order
-- First quotation gets 1000, subsequent ones increment sequentially

-- Method 1: Renumber based on OrderID (assuming OrderID reflects creation order)
-- This assigns 1000 to the first quotation, 1001 to the second, etc.

-- Create a temporary table with the new numbering
WITH NumberedQuotations AS (
    SELECT 
        OrderID,
        ROW_NUMBER() OVER (ORDER BY OrderID ASC) - 1 + 1000 AS NewPONumber
    FROM QuotationOrder
    WHERE Tenantid = 1
)
UPDATE qo
SET qo.PONumber = nq.NewPONumber
FROM QuotationOrder qo
INNER JOIN NumberedQuotations nq ON qo.OrderID = nq.OrderID
WHERE qo.Tenantid = 1;

-- Verify the changes
SELECT OrderID, PONumber, CustomerName, Tenantid, OrderDate
FROM QuotationOrder
WHERE Tenantid = 1
ORDER BY OrderID ASC;

-- Expected result:
-- OrderID 1 (American Builders) -> PONumber 1000
-- OrderID 12 (Highstar) -> PONumber 1001

