-- Backfill convertedOrderId for previously converted quotations
-- This script finds orders that were created from quotations (by matching QuotationId)
-- and updates the quotations with the corresponding order ID

-- First, let's see what we're working with
SELECT 
    qo.OrderID AS QuotationID,
    qo.PONumber AS QuotationNumber,
    qo.Status AS QuotationStatus,
    qo.convertedOrderId AS CurrentConvertedOrderId,
    co.OrderID AS OrderID,
    co.PONumber AS OrderNumber,
    co.quotationId AS OrderQuotationId
FROM QuotationOrder qo
LEFT JOIN CustomerOrder co ON co.quotationId = qo.OrderID
WHERE qo.Status = 'Converted' 
   OR qo.isConverted = 1
   OR co.quotationId IS NOT NULL
ORDER BY qo.OrderID;

-- Update quotations with the order ID from matching orders
UPDATE qo
SET qo.convertedOrderId = co.OrderID,
    qo.Status = 'Converted',
    qo.isConverted = 1
FROM QuotationOrder qo
INNER JOIN CustomerOrder co ON co.quotationId = qo.OrderID
WHERE qo.convertedOrderId IS NULL
  AND co.quotationId IS NOT NULL;

-- Verify the updates
SELECT 
    qo.OrderID AS QuotationID,
    qo.PONumber AS QuotationNumber,
    qo.Status AS QuotationStatus,
    qo.convertedOrderId AS ConvertedOrderId,
    co.OrderID AS OrderID,
    co.PONumber AS OrderNumber
FROM QuotationOrder qo
INNER JOIN CustomerOrder co ON co.quotationId = qo.OrderID
WHERE qo.convertedOrderId IS NOT NULL
ORDER BY qo.OrderID;

PRINT 'Backfill completed. Check the results above to verify.';


