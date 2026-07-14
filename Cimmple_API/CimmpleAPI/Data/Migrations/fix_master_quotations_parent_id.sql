-- =============================================
-- Fix Master Quotations: Set ParentQuotationID to their own OrderID
-- This ensures master quotations used for multi-vendor show the Compare button
-- Run this in SQL Server Management Studio
-- =============================================

USE CimmpleDb; -- Change this to your database name if different
GO

-- Fix master quotations: Set ParentQuotationID to their own OrderID if they have children
-- This ensures master quotations used for multi-vendor are properly marked
UPDATE master
SET master.ParentQuotationID = master.OrderID
FROM dbo.VendorQuotations master
WHERE master.ParentQuotationID IS NULL
  AND EXISTS (
    SELECT 1 
    FROM dbo.VendorQuotations child
    WHERE child.ParentQuotationID = master.OrderID
      AND child.OrderID != master.OrderID
  );

PRINT '✓ Fixed master quotations to have ParentQuotationID set to their own OrderID.';
GO

-- Show the updated master quotations
PRINT '';
PRINT 'Master Quotations (with children):';
SELECT 
    master.OrderID,
    master.PONumber,
    master.VendorName,
    master.ParentQuotationID,
    COUNT(child.OrderID) AS ChildCount
FROM dbo.VendorQuotations master
LEFT JOIN dbo.VendorQuotations child ON child.ParentQuotationID = master.OrderID AND child.OrderID != master.OrderID
WHERE master.ParentQuotationID = master.OrderID
GROUP BY master.OrderID, master.PONumber, master.VendorName, master.ParentQuotationID
ORDER BY master.OrderID;
GO

PRINT '';
PRINT '✓ Script completed successfully!';
PRINT 'Master quotations should now show the Compare button.';
GO



