-- Add partial shipping support to CustomerOrderDetails and ShippingDetails tables
-- This script adds columns to support tracking shipped quantities and shipping status per line item

USE CimmpleDB;
GO

-- Add shipping-related columns to CustomerOrderDetails table
IF NOT EXISTS (
    SELECT 1
    FROM sys.columns
    WHERE object_id = OBJECT_ID('CustomerOrderDetails')
    AND name = 'ShippedQty'
)
BEGIN
    ALTER TABLE CustomerOrderDetails
    ADD ShippedQty INT DEFAULT 0;
    PRINT 'Added ShippedQty column to CustomerOrderDetails';
END

IF NOT EXISTS (
    SELECT 1
    FROM sys.columns
    WHERE object_id = OBJECT_ID('CustomerOrderDetails')
    AND name = 'ShippingStatus'
)
BEGIN
    ALTER TABLE CustomerOrderDetails
    ADD ShippingStatus NVARCHAR(50) DEFAULT 'Not Started';
    PRINT 'Added ShippingStatus column to CustomerOrderDetails';
END

-- Add OrderDetailID column to ShippingDetails table to link shipments to order line items
IF NOT EXISTS (
    SELECT 1
    FROM sys.columns
    WHERE object_id = OBJECT_ID('ShippingDetails')
    AND name = 'OrderDetailID'
)
BEGIN
    ALTER TABLE ShippingDetails
    ADD OrderDetailID INT;
    PRINT 'Added OrderDetailID column to ShippingDetails';

    -- Add foreign key constraint
    ALTER TABLE ShippingDetails
    ADD CONSTRAINT FK_ShippingDetails_OrderDetail
    FOREIGN KEY (OrderDetailID) REFERENCES CustomerOrderDetails(ID);
    PRINT 'Added foreign key constraint for OrderDetailID';
END

-- Update existing records to have default values
-- Use dynamic SQL to avoid column validation issues
DECLARE @sql NVARCHAR(MAX);

-- Update ShippingStatus if column exists
IF EXISTS (
    SELECT 1
    FROM sys.columns
    WHERE object_id = OBJECT_ID('CustomerOrderDetails')
    AND name = 'ShippingStatus'
)
BEGIN
    SET @sql = N'UPDATE CustomerOrderDetails SET ShippingStatus = ''Not Started'' WHERE ShippingStatus IS NULL;';
    EXEC sp_executesql @sql;
    PRINT 'Updated existing ShippingStatus values';
END

-- Update ShippedQty if column exists
IF EXISTS (
    SELECT 1
    FROM sys.columns
    WHERE object_id = OBJECT_ID('CustomerOrderDetails')
    AND name = 'ShippedQty'
)
BEGIN
    SET @sql = N'UPDATE CustomerOrderDetails SET ShippedQty = 0 WHERE ShippedQty IS NULL;';
    EXEC sp_executesql @sql;
    PRINT 'Updated existing ShippedQty values';
END

PRINT 'Migration completed successfully';
PRINT 'Added partial shipping support to database schema';
