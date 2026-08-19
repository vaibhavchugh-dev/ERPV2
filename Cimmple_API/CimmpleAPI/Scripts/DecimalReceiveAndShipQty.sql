-- SUPERSEDED. Do not run. Reverted by RevertDecimalReceiveAndShipQty.sql.
-- Allow fractional qty on vendor receive and customer ship.
-- Drop default constraints first; ALTER COLUMN fails while they exist.

DECLARE @sql nvarchar(max);

-- VendorReceiving.ReceivedQty
SET @sql = NULL;
SELECT @sql = N'ALTER TABLE dbo.VendorReceiving DROP CONSTRAINT ' + QUOTENAME(dc.name)
FROM sys.default_constraints dc
JOIN sys.columns c ON c.default_object_id = dc.object_id
WHERE dc.parent_object_id = OBJECT_ID(N'dbo.VendorReceiving') AND c.name = N'ReceivedQty';
IF @sql IS NOT NULL EXEC sp_executesql @sql;

IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID(N'dbo.VendorReceiving') AND name = N'ReceivedQty'
)
    ALTER TABLE dbo.VendorReceiving ALTER COLUMN ReceivedQty decimal(18, 4) NOT NULL;

-- VendorOrderDetails.ReceivedQty
SET @sql = NULL;
SELECT @sql = N'ALTER TABLE dbo.VendorOrderDetails DROP CONSTRAINT ' + QUOTENAME(dc.name)
FROM sys.default_constraints dc
JOIN sys.columns c ON c.default_object_id = dc.object_id
WHERE dc.parent_object_id = OBJECT_ID(N'dbo.VendorOrderDetails') AND c.name = N'ReceivedQty';
IF @sql IS NOT NULL EXEC sp_executesql @sql;

IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID(N'dbo.VendorOrderDetails') AND name = N'ReceivedQty'
)
    ALTER TABLE dbo.VendorOrderDetails ALTER COLUMN ReceivedQty decimal(18, 4) NULL;

-- ShippingDetails.ShippedQty
SET @sql = NULL;
SELECT @sql = N'ALTER TABLE dbo.ShippingDetails DROP CONSTRAINT ' + QUOTENAME(dc.name)
FROM sys.default_constraints dc
JOIN sys.columns c ON c.default_object_id = dc.object_id
WHERE dc.parent_object_id = OBJECT_ID(N'dbo.ShippingDetails') AND c.name = N'ShippedQty';
IF @sql IS NOT NULL EXEC sp_executesql @sql;

IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID(N'dbo.ShippingDetails') AND name = N'ShippedQty'
)
    ALTER TABLE dbo.ShippingDetails ALTER COLUMN ShippedQty decimal(18, 4) NOT NULL;

-- CustomerOrderDetails.ShippedQty
SET @sql = NULL;
SELECT @sql = N'ALTER TABLE dbo.CustomerOrderDetails DROP CONSTRAINT ' + QUOTENAME(dc.name)
FROM sys.default_constraints dc
JOIN sys.columns c ON c.default_object_id = dc.object_id
WHERE dc.parent_object_id = OBJECT_ID(N'dbo.CustomerOrderDetails') AND c.name = N'ShippedQty';
IF @sql IS NOT NULL EXEC sp_executesql @sql;

IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID(N'dbo.CustomerOrderDetails') AND name = N'ShippedQty'
)
    ALTER TABLE dbo.CustomerOrderDetails ALTER COLUMN ShippedQty decimal(18, 4) NOT NULL;
