-- Restore whole-unit qty on vendor receive and customer ship.
-- Round any leftover fractional values first so ALTER COLUMN succeeds.

UPDATE dbo.VendorReceiving
SET ReceivedQty = ROUND(ReceivedQty, 0)
WHERE ReceivedQty <> ROUND(ReceivedQty, 0);

UPDATE dbo.VendorOrderDetails
SET ReceivedQty = ROUND(ReceivedQty, 0)
WHERE ReceivedQty IS NOT NULL AND ReceivedQty <> ROUND(ReceivedQty, 0);

UPDATE dbo.ShippingDetails
SET ShippedQty = ROUND(ShippedQty, 0)
WHERE ShippedQty <> ROUND(ShippedQty, 0);

UPDATE dbo.CustomerOrderDetails
SET ShippedQty = ROUND(ShippedQty, 0)
WHERE ShippedQty <> ROUND(ShippedQty, 0);
GO

DECLARE @sql nvarchar(max);

SET @sql = NULL;
SELECT @sql = N'ALTER TABLE dbo.VendorReceiving DROP CONSTRAINT ' + QUOTENAME(dc.name)
FROM sys.default_constraints dc
JOIN sys.columns c ON c.default_object_id = dc.object_id
WHERE dc.parent_object_id = OBJECT_ID(N'dbo.VendorReceiving') AND c.name = N'ReceivedQty';
IF @sql IS NOT NULL EXEC sp_executesql @sql;

ALTER TABLE dbo.VendorReceiving ALTER COLUMN ReceivedQty int NOT NULL;

SET @sql = NULL;
SELECT @sql = N'ALTER TABLE dbo.VendorOrderDetails DROP CONSTRAINT ' + QUOTENAME(dc.name)
FROM sys.default_constraints dc
JOIN sys.columns c ON c.default_object_id = dc.object_id
WHERE dc.parent_object_id = OBJECT_ID(N'dbo.VendorOrderDetails') AND c.name = N'ReceivedQty';
IF @sql IS NOT NULL EXEC sp_executesql @sql;

ALTER TABLE dbo.VendorOrderDetails ALTER COLUMN ReceivedQty int NULL;

SET @sql = NULL;
SELECT @sql = N'ALTER TABLE dbo.ShippingDetails DROP CONSTRAINT ' + QUOTENAME(dc.name)
FROM sys.default_constraints dc
JOIN sys.columns c ON c.default_object_id = dc.object_id
WHERE dc.parent_object_id = OBJECT_ID(N'dbo.ShippingDetails') AND c.name = N'ShippedQty';
IF @sql IS NOT NULL EXEC sp_executesql @sql;

ALTER TABLE dbo.ShippingDetails ALTER COLUMN ShippedQty int NOT NULL;

SET @sql = NULL;
SELECT @sql = N'ALTER TABLE dbo.CustomerOrderDetails DROP CONSTRAINT ' + QUOTENAME(dc.name)
FROM sys.default_constraints dc
JOIN sys.columns c ON c.default_object_id = dc.object_id
WHERE dc.parent_object_id = OBJECT_ID(N'dbo.CustomerOrderDetails') AND c.name = N'ShippedQty';
IF @sql IS NOT NULL EXEC sp_executesql @sql;

ALTER TABLE dbo.CustomerOrderDetails ALTER COLUMN ShippedQty int NOT NULL;
