-- =============================================
-- Add IsResponseOnly column to VendorQuotations table
-- This script is safe to run multiple times
-- Run this in SQL Server Management Studio
-- =============================================

USE CimmpleDb; -- Change this to your database name if different
GO

-- Check if column exists first
IF NOT EXISTS (
    SELECT 1 
    FROM sys.columns 
    WHERE object_id = OBJECT_ID('dbo.VendorQuotations') 
    AND name = 'IsResponseOnly'
)
BEGIN
    -- Add the IsResponseOnly column as nullable
    ALTER TABLE dbo.VendorQuotations
    ADD IsResponseOnly BIT NULL;
    
    PRINT '✓ IsResponseOnly column added successfully.';
END
ELSE
BEGIN
    PRINT 'ℹ IsResponseOnly column already exists. Skipping.';
END
GO

-- Mark existing child quotations as response-only
-- Child quotations are those where ParentQuotationID != OrderID and ParentQuotationID IS NOT NULL
UPDATE dbo.VendorQuotations 
SET IsResponseOnly = 1 
WHERE ParentQuotationID IS NOT NULL 
  AND ParentQuotationID != OrderID
  AND (IsResponseOnly IS NULL OR IsResponseOnly = 0);

PRINT '✓ Marked existing child quotations as response-only.';
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

-- Verify the update
SELECT 
    COUNT(*) AS TotalQuotations,
    SUM(CASE WHEN IsResponseOnly = 1 THEN 1 ELSE 0 END) AS ResponseOnlyQuotations,
    SUM(CASE WHEN IsResponseOnly = 0 OR IsResponseOnly IS NULL THEN 1 ELSE 0 END) AS RegularQuotations
FROM dbo.VendorQuotations;
GO

-- Show sample of response-only quotations
PRINT '';
PRINT 'Sample of Response-Only Quotations (first 10):';
SELECT TOP 10
    OrderID,
    PONumber,
    VendorName,
    ParentQuotationID,
    IsResponseOnly,
    Status
FROM dbo.VendorQuotations
WHERE IsResponseOnly = 1
ORDER BY OrderID;
GO

PRINT '';
PRINT '✓ Script completed successfully!';
PRINT 'Response-only quotations will now be filtered from the listing page.';
GO

