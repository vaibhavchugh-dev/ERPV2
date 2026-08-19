-- Restore whole-unit qty on vendor receive and customer ship.
-- Round any leftover fractional values first so ALTER COLUMN succeeds.

UPDATE CimmpleFlow.VendorReceiving
SET ReceivedQty = ROUND(ReceivedQty, 0)
WHERE ReceivedQty <> ROUND(ReceivedQty, 0);

UPDATE CimmpleFlow.VendorOrderDetails
SET ReceivedQty = ROUND(ReceivedQty, 0)
WHERE ReceivedQty IS NOT NULL AND ReceivedQty <> ROUND(ReceivedQty, 0);

UPDATE CimmpleFlow.ShippingDetails
SET ShippedQty = ROUND(ShippedQty, 0)
WHERE ShippedQty <> ROUND(ShippedQty, 0);

UPDATE CimmpleFlow.CustomerOrderDetails
SET ShippedQty = ROUND(ShippedQty, 0)
WHERE ShippedQty <> ROUND(ShippedQty, 0);
GO

DECLARE @sql nvarchar(max);

SET @sql = NULL;
SELECT @sql = N'ALTER TABLE CimmpleFlow.VendorReceiving DROP CONSTRAINT ' + QUOTENAME(dc.name)
FROM sys.default_constraints dc
JOIN sys.columns c ON c.default_object_id = dc.object_id
WHERE dc.parent_object_id = OBJECT_ID(N'CimmpleFlow.VendorReceiving') AND c.name = N'ReceivedQty';
IF @sql IS NOT NULL EXEC sp_executesql @sql;

ALTER TABLE CimmpleFlow.VendorReceiving ALTER COLUMN ReceivedQty int NOT NULL;

SET @sql = NULL;
SELECT @sql = N'ALTER TABLE CimmpleFlow.VendorOrderDetails DROP CONSTRAINT ' + QUOTENAME(dc.name)
FROM sys.default_constraints dc
JOIN sys.columns c ON c.default_object_id = dc.object_id
WHERE dc.parent_object_id = OBJECT_ID(N'CimmpleFlow.VendorOrderDetails') AND c.name = N'ReceivedQty';
IF @sql IS NOT NULL EXEC sp_executesql @sql;

ALTER TABLE CimmpleFlow.VendorOrderDetails ALTER COLUMN ReceivedQty int NULL;

SET @sql = NULL;
SELECT @sql = N'ALTER TABLE CimmpleFlow.ShippingDetails DROP CONSTRAINT ' + QUOTENAME(dc.name)
FROM sys.default_constraints dc
JOIN sys.columns c ON c.default_object_id = dc.object_id
WHERE dc.parent_object_id = OBJECT_ID(N'CimmpleFlow.ShippingDetails') AND c.name = N'ShippedQty';
IF @sql IS NOT NULL EXEC sp_executesql @sql;

ALTER TABLE CimmpleFlow.ShippingDetails ALTER COLUMN ShippedQty int NOT NULL;

SET @sql = NULL;
SELECT @sql = N'ALTER TABLE CimmpleFlow.CustomerOrderDetails DROP CONSTRAINT ' + QUOTENAME(dc.name)
FROM sys.default_constraints dc
JOIN sys.columns c ON c.default_object_id = dc.object_id
WHERE dc.parent_object_id = OBJECT_ID(N'CimmpleFlow.CustomerOrderDetails') AND c.name = N'ShippedQty';
IF @sql IS NOT NULL EXEC sp_executesql @sql;

ALTER TABLE CimmpleFlow.CustomerOrderDetails ALTER COLUMN ShippedQty int NOT NULL;
