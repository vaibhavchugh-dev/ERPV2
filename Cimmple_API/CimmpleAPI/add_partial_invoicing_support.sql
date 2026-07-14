-- Add partial invoicing support to CustomerOrderDetails and InvoiceDetail tables
-- This script adds columns to support tracking invoiced quantities per line item

USE CimmpleDB;
GO

-- Add invoicing-related columns to CustomerOrderDetails table
IF NOT EXISTS (
    SELECT 1
    FROM sys.columns
    WHERE object_id = OBJECT_ID('CustomerOrderDetails')
    AND name = 'InvoicedQty'
)
BEGIN
    ALTER TABLE CustomerOrderDetails
    ADD InvoicedQty INT DEFAULT 0;
    PRINT 'Added InvoicedQty column to CustomerOrderDetails';
END

IF NOT EXISTS (
    SELECT 1
    FROM sys.columns
    WHERE object_id = OBJECT_ID('CustomerOrderDetails')
    AND name = 'InvoiceStatus'
)
BEGIN
    ALTER TABLE CustomerOrderDetails
    ADD InvoiceStatus NVARCHAR(50) DEFAULT 'Not Invoiced';
    PRINT 'Added InvoiceStatus column to CustomerOrderDetails';
END

-- Add OrderDetailID and QtyInvoiced columns to InvoiceDetail table
IF NOT EXISTS (
    SELECT 1
    FROM sys.columns
    WHERE object_id = OBJECT_ID('InvoiceDetail')
    AND name = 'OrderDetailID'
)
BEGIN
    ALTER TABLE InvoiceDetail
    ADD OrderDetailID INT;
    PRINT 'Added OrderDetailID column to InvoiceDetail';

    -- Add foreign key constraint
    ALTER TABLE InvoiceDetail
    ADD CONSTRAINT FK_InvoiceDetail_OrderDetail
    FOREIGN KEY (OrderDetailID) REFERENCES CustomerOrderDetails(ID);
    PRINT 'Added foreign key constraint for OrderDetailID';
END

IF NOT EXISTS (
    SELECT 1
    FROM sys.columns
    WHERE object_id = OBJECT_ID('InvoiceDetail')
    AND name = 'QtyInvoiced'
)
BEGIN
    ALTER TABLE InvoiceDetail
    ADD QtyInvoiced INT DEFAULT 0;
    PRINT 'Added QtyInvoiced column to InvoiceDetail';
END

-- Update existing records to have default invoice status
-- Use EXEC to avoid column reference issues during script parsing
EXEC('UPDATE CustomerOrderDetails SET InvoiceStatus = ''Not Invoiced'' WHERE InvoiceStatus IS NULL;');
PRINT 'Updated existing InvoiceStatus values';

EXEC('UPDATE CustomerOrderDetails SET InvoicedQty = 0 WHERE InvoicedQty IS NULL;');
PRINT 'Updated existing InvoicedQty values';

EXEC('UPDATE InvoiceDetail SET QtyInvoiced = qty WHERE QtyInvoiced IS NULL OR QtyInvoiced = 0;');
PRINT 'Updated existing QtyInvoiced values from qty column';

PRINT 'Migration completed successfully';
PRINT 'Added partial invoicing support to database schema';
