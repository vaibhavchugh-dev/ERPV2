-- Line-level descriptor for vendor PO lines (RawMaterial, FinishedProduct, Tool, Service, Subcontract, Other).
-- Run against your Cimmple database if the column does not exist.

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID(N'dbo.VendorOrderDetails') AND name = N'LineType'
)
BEGIN
    ALTER TABLE dbo.VendorOrderDetails ADD LineType NVARCHAR(50) NULL;
    -- Backfill: optional — align with order MaterialType when known via app, or leave NULL (API defaults on read)
    PRINT 'Column VendorOrderDetails.LineType added.';
END
ELSE
    PRINT 'Column VendorOrderDetails.LineType already exists.';
GO
