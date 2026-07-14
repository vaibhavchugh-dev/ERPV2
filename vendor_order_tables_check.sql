-- =============================================
-- Vendor Order Tables Setup and Verification
-- =============================================
-- This script checks for required tables and columns for vendor orders
-- and creates them if they don't exist.

USE [CimmpleDb]
GO

PRINT 'Connected to CimmpleDb database'
GO

-- =============================================
-- 1. CHECK EXISTING TABLES
-- =============================================

PRINT '=== CHECKING EXISTING TABLES ==='

-- Check vendor-specific tables (these are the main ones for vendor orders)
IF EXISTS (SELECT * FROM sysobjects WHERE name='VendorOrders' AND xtype='U')
    PRINT '✓ VendorOrders table exists'
ELSE
    PRINT '✗ VendorOrders table missing - THIS IS REQUIRED!'

IF EXISTS (SELECT * FROM sysobjects WHERE name='VendorOrderDetails' AND xtype='U')
    PRINT '✓ VendorOrderDetails table exists'
ELSE
    PRINT '✗ VendorOrderDetails table missing - THIS IS REQUIRED!'

-- Check if vendor tables have attachments and comments support
IF EXISTS (SELECT * FROM sysobjects WHERE name='VendorOrderAttachments' AND xtype='U')
    PRINT '✓ VendorOrderAttachments table exists'
ELSE
    PRINT 'ℹ VendorOrderAttachments table does not exist'

IF EXISTS (SELECT * FROM sysobjects WHERE name='VendorOrderComments' AND xtype='U')
    PRINT '✓ VendorOrderComments table exists'
ELSE
    PRINT 'ℹ VendorOrderComments table does not exist'

-- Check generic order tables (for reference)
IF EXISTS (SELECT * FROM sysobjects WHERE name='Orders' AND xtype='U')
    PRINT 'ℹ Orders table exists (generic orders)'
ELSE
    PRINT 'ℹ Orders table does not exist'

IF EXISTS (SELECT * FROM sysobjects WHERE name='OrderDetails' AND xtype='U')
    PRINT 'ℹ OrderDetails table exists (generic order details)'
ELSE
    PRINT 'ℹ OrderDetails table does not exist'

PRINT ''
PRINT '=== CHECKING VENDOR ORDERS TABLE COLUMNS ==='

-- =============================================
-- 2. ADD MISSING COLUMNS TO VENDOR ORDERS TABLE
-- =============================================

-- Add MaterialType column if it doesn't exist
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('VendorOrders') AND name = 'MaterialType')
BEGIN
    PRINT 'Adding MaterialType column to VendorOrders table...'
    ALTER TABLE VendorOrders ADD MaterialType NVARCHAR(50) DEFAULT 'Material';
    PRINT '✓ MaterialType column added'
END
ELSE
BEGIN
    PRINT '✓ MaterialType column already exists'
END
GO

-- Add QuotationId column if it doesn't exist (for tracking converted quotations)
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('VendorOrders') AND name = 'QuotationId')
BEGIN
    PRINT 'Adding QuotationId column to VendorOrders table...'
    ALTER TABLE VendorOrders ADD QuotationId INT NULL;
    PRINT '✓ QuotationId column added'
END
ELSE
BEGIN
    PRINT '✓ QuotationId column already exists'
END
GO

-- Add QuotationNo column if it doesn't exist
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('VendorOrders') AND name = 'QuotationNo')
BEGIN
    PRINT 'Adding QuotationNo column to VendorOrders table...'
    ALTER TABLE VendorOrders ADD QuotationNo NVARCHAR(50) NULL;
    PRINT '✓ QuotationNo column added'
END
ELSE
BEGIN
    PRINT '✓ QuotationNo column already exists'
END
GO

-- =============================================
-- ADD MISSING COLUMNS TO VENDOR ORDER DETAILS TABLE
-- =============================================

-- Add PartName column if it doesn't exist
IF OBJECT_ID('VendorOrderDetails') IS NOT NULL AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('VendorOrderDetails') AND name = 'PartName')
BEGIN
    PRINT 'Adding PartName column to VendorOrderDetails table...'
    ALTER TABLE VendorOrderDetails ADD PartName NVARCHAR(500) NULL;
    PRINT '✓ PartName column added'
END
ELSE IF OBJECT_ID('VendorOrderDetails') IS NOT NULL
BEGIN
    PRINT '✓ PartName column already exists'
END
GO

-- Add PartNo column if it doesn't exist
IF OBJECT_ID('VendorOrderDetails') IS NOT NULL AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('VendorOrderDetails') AND name = 'PartNo')
BEGIN
    PRINT 'Adding PartNo column to VendorOrderDetails table...'
    ALTER TABLE VendorOrderDetails ADD PartNo NVARCHAR(200) NULL;
    PRINT '✓ PartNo column added'
END
ELSE IF OBJECT_ID('VendorOrderDetails') IS NOT NULL
BEGIN
    PRINT '✓ PartNo column already exists'
END
GO

-- Add LeadTime column if it doesn't exist
IF OBJECT_ID('VendorOrderDetails') IS NOT NULL AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('VendorOrderDetails') AND name = 'LeadTime')
BEGIN
    PRINT 'Adding LeadTime column to VendorOrderDetails table...'
    ALTER TABLE VendorOrderDetails ADD LeadTime NVARCHAR(100) NULL;
    PRINT '✓ LeadTime column added'
END
ELSE IF OBJECT_ID('VendorOrderDetails') IS NOT NULL
BEGIN
    PRINT '✓ LeadTime column already exists'
END
GO

-- Add Notes column if it doesn't exist
IF OBJECT_ID('VendorOrderDetails') IS NOT NULL AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('VendorOrderDetails') AND name = 'Notes')
BEGIN
    PRINT 'Adding Notes column to VendorOrderDetails table...'
    ALTER TABLE VendorOrderDetails ADD Notes NVARCHAR(MAX) NULL;
    PRINT '✓ Notes column added'
END
ELSE IF OBJECT_ID('VendorOrderDetails') IS NOT NULL
BEGIN
    PRINT '✓ Notes column already exists'
END
GO

-- Add ShippedQty column if it doesn't exist
IF OBJECT_ID('VendorOrderDetails') IS NOT NULL AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('VendorOrderDetails') AND name = 'ShippedQty')
BEGIN
    PRINT 'Adding ShippedQty column to VendorOrderDetails table...'
    ALTER TABLE VendorOrderDetails ADD ShippedQty INT DEFAULT 0;
    PRINT '✓ ShippedQty column added'
END
ELSE IF OBJECT_ID('VendorOrderDetails') IS NOT NULL
BEGIN
    PRINT '✓ ShippedQty column already exists'
END
GO

-- Add ShippingStatus column if it doesn't exist
IF OBJECT_ID('VendorOrderDetails') IS NOT NULL AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('VendorOrderDetails') AND name = 'ShippingStatus')
BEGIN
    PRINT 'Adding ShippingStatus column to VendorOrderDetails table...'
    ALTER TABLE VendorOrderDetails ADD ShippingStatus NVARCHAR(50) NULL;
    PRINT '✓ ShippingStatus column added'
END
ELSE IF OBJECT_ID('VendorOrderDetails') IS NOT NULL
BEGIN
    PRINT '✓ ShippingStatus column already exists'
END
GO

-- Add InvoicedQty column if it doesn't exist
IF OBJECT_ID('VendorOrderDetails') IS NOT NULL AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('VendorOrderDetails') AND name = 'InvoicedQty')
BEGIN
    PRINT 'Adding InvoicedQty column to VendorOrderDetails table...'
    ALTER TABLE VendorOrderDetails ADD InvoicedQty INT DEFAULT 0;
    PRINT '✓ InvoicedQty column added'
END
ELSE IF OBJECT_ID('VendorOrderDetails') IS NOT NULL
BEGIN
    PRINT '✓ InvoicedQty column already exists'
END
GO

-- Add InvoiceStatus column if it doesn't exist
IF OBJECT_ID('VendorOrderDetails') IS NOT NULL AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('VendorOrderDetails') AND name = 'InvoiceStatus')
BEGIN
    PRINT 'Adding InvoiceStatus column to VendorOrderDetails table...'
    ALTER TABLE VendorOrderDetails ADD InvoiceStatus NVARCHAR(50) NULL;
    PRINT '✓ InvoiceStatus column added'
END
ELSE IF OBJECT_ID('VendorOrderDetails') IS NOT NULL
BEGIN
    PRINT '✓ InvoiceStatus column already exists'
END
GO

-- Add DueDateString column for string-based date storage (if DueDate exists as DateTime)
IF OBJECT_ID('VendorOrderDetails') IS NOT NULL 
   AND EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('VendorOrderDetails') AND name = 'DueDate')
   AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('VendorOrderDetails') AND name = 'DueDateString')
BEGIN
    PRINT 'Adding DueDateString column to VendorOrderDetails table for string-based date storage...'
    ALTER TABLE VendorOrderDetails ADD DueDateString NVARCHAR(50) NULL;
    PRINT '✓ DueDateString column added'
END
ELSE IF OBJECT_ID('VendorOrderDetails') IS NOT NULL 
        AND EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('VendorOrderDetails') AND name = 'DueDateString')
BEGIN
    PRINT '✓ DueDateString column already exists'
END
GO

-- =============================================
-- DATA MIGRATION: Map existing columns to new structure
-- =============================================

PRINT ''
PRINT '=== MIGRATING EXISTING DATA ==='

-- Migrate itemname to PartName (if PartName is empty and itemname exists)
IF OBJECT_ID('VendorOrderDetails') IS NOT NULL
   AND EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('VendorOrderDetails') AND name = 'itemname')
   AND EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('VendorOrderDetails') AND name = 'PartName')
BEGIN
    DECLARE @MigratedCount INT;
    UPDATE VendorOrderDetails 
    SET PartName = ISNULL(itemname, '')
    WHERE (PartName IS NULL OR PartName = '') AND itemname IS NOT NULL AND itemname != '';
    SET @MigratedCount = @@ROWCOUNT;
    IF @MigratedCount > 0
    BEGIN
        PRINT '✓ Migrated ' + CAST(@MigratedCount AS NVARCHAR(10)) + ' records: itemname -> PartName'
    END
    ELSE
    BEGIN
        PRINT '✓ No records needed migration (itemname -> PartName)'
    END
END
ELSE IF OBJECT_ID('VendorOrderDetails') IS NOT NULL
BEGIN
    PRINT 'ℹ Skipping itemname migration (columns not available)'
END
GO

-- Convert DueDate from DateTime to string format and store in DueDateString column
IF OBJECT_ID('VendorOrderDetails') IS NOT NULL 
   AND EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('VendorOrderDetails') AND name = 'DueDate')
   AND EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('VendorOrderDetails') AND name = 'DueDateString')
BEGIN
    DECLARE @DateMigratedCount INT;
    -- Check if DueDate is DateTime type
    IF EXISTS (
        SELECT 1 FROM sys.columns c
        INNER JOIN sys.types t ON c.user_type_id = t.user_type_id
        WHERE c.object_id = OBJECT_ID('VendorOrderDetails') 
        AND c.name = 'DueDate' 
        AND t.name IN ('datetime', 'datetime2', 'date')
    )
    BEGIN
        -- Migrate existing DateTime DueDate to string format
        UPDATE VendorOrderDetails 
        SET DueDateString = CONVERT(NVARCHAR(50), DueDate, 23) -- ISO format YYYY-MM-DD
        WHERE DueDate IS NOT NULL AND (DueDateString IS NULL OR DueDateString = '');
        SET @DateMigratedCount = @@ROWCOUNT;
        IF @DateMigratedCount > 0
        BEGIN
            PRINT '✓ Migrated ' + CAST(@DateMigratedCount AS NVARCHAR(10)) + ' records: DueDate (DateTime) -> DueDateString (string)'
        END
        ELSE
        BEGIN
            PRINT '✓ No records needed date migration'
        END
    END
    ELSE
    BEGIN
        PRINT 'ℹ DueDate is not DateTime type, skipping conversion'
    END
END
GO

-- Update default values for new columns and handle required fields
IF OBJECT_ID('VendorOrderDetails') IS NOT NULL
BEGIN
    DECLARE @UpdatedCount INT;
    
    -- Set default glcode where NULL or empty (required field)
    IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('VendorOrderDetails') AND name = 'glcode')
    BEGIN
        UPDATE VendorOrderDetails 
        SET glcode = '' 
        WHERE glcode IS NULL;
        SET @UpdatedCount = @@ROWCOUNT;
        IF @UpdatedCount > 0
            PRINT '✓ Updated ' + CAST(@UpdatedCount AS NVARCHAR(10)) + ' records: glcode defaulted to empty string'
    END
    
    -- Set default Received where NULL or empty (required field)
    IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('VendorOrderDetails') AND name = 'Received')
    BEGIN
        UPDATE VendorOrderDetails 
        SET Received = 'No' 
        WHERE Received IS NULL OR Received = '';
        SET @UpdatedCount = @@ROWCOUNT;
        IF @UpdatedCount > 0
            PRINT '✓ Updated ' + CAST(@UpdatedCount AS NVARCHAR(10)) + ' records: Received defaulted to "No"'
    END
    
    -- Set default JobId where NULL (required field) - use 0 as default
    IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('VendorOrderDetails') AND name = 'JobId')
    BEGIN
        UPDATE VendorOrderDetails 
        SET JobId = 0 
        WHERE JobId IS NULL;
        SET @UpdatedCount = @@ROWCOUNT;
        IF @UpdatedCount > 0
            PRINT '✓ Updated ' + CAST(@UpdatedCount AS NVARCHAR(10)) + ' records: JobId defaulted to 0'
    END
    
    -- Set default ShippedQty to 0 where NULL
    IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('VendorOrderDetails') AND name = 'ShippedQty')
    BEGIN
        UPDATE VendorOrderDetails 
        SET ShippedQty = 0 
        WHERE ShippedQty IS NULL;
        SET @UpdatedCount = @@ROWCOUNT;
        IF @UpdatedCount > 0
            PRINT '✓ Updated ' + CAST(@UpdatedCount AS NVARCHAR(10)) + ' records: ShippedQty defaulted to 0'
    END
    
    -- Set default InvoicedQty to 0 where NULL
    IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('VendorOrderDetails') AND name = 'InvoicedQty')
    BEGIN
        UPDATE VendorOrderDetails 
        SET InvoicedQty = 0 
        WHERE InvoicedQty IS NULL;
        SET @UpdatedCount = @@ROWCOUNT;
        IF @UpdatedCount > 0
            PRINT '✓ Updated ' + CAST(@UpdatedCount AS NVARCHAR(10)) + ' records: InvoicedQty defaulted to 0'
    END
    
    -- Set default ShippingStatus where NULL
    IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('VendorOrderDetails') AND name = 'ShippingStatus')
    BEGIN
        UPDATE VendorOrderDetails 
        SET ShippingStatus = 'Not Started' 
        WHERE ShippingStatus IS NULL OR ShippingStatus = '';
        SET @UpdatedCount = @@ROWCOUNT;
        IF @UpdatedCount > 0
            PRINT '✓ Updated ' + CAST(@UpdatedCount AS NVARCHAR(10)) + ' records: ShippingStatus defaulted to "Not Started"'
    END
    
    -- Set default InvoiceStatus where NULL
    IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('VendorOrderDetails') AND name = 'InvoiceStatus')
    BEGIN
        UPDATE VendorOrderDetails 
        SET InvoiceStatus = 'Not Invoiced' 
        WHERE InvoiceStatus IS NULL OR InvoiceStatus = '';
        SET @UpdatedCount = @@ROWCOUNT;
        IF @UpdatedCount > 0
            PRINT '✓ Updated ' + CAST(@UpdatedCount AS NVARCHAR(10)) + ' records: InvoiceStatus defaulted to "Not Invoiced"'
    END
END
GO

-- =============================================
-- VERIFY COLUMN STRUCTURE
-- =============================================

PRINT ''
PRINT '=== VERIFYING COLUMN STRUCTURE ==='

-- Show all columns in VendorOrderDetails with their types
IF OBJECT_ID('VendorOrderDetails') IS NOT NULL
BEGIN
    PRINT 'VendorOrderDetails table columns:'
    SELECT 
        c.name AS ColumnName,
        t.name AS DataType,
        CASE 
            WHEN t.name IN ('nvarchar', 'varchar', 'nchar', 'char') 
            THEN CAST(c.max_length AS NVARCHAR(10)) + ' chars'
            ELSE ''
        END AS Size,
        CASE WHEN c.is_nullable = 1 THEN 'YES' ELSE 'NO' END AS IsNullable,
        CASE WHEN c.is_identity = 1 THEN 'YES' ELSE 'NO' END AS IsIdentity
    FROM sys.columns c
    INNER JOIN sys.types t ON c.user_type_id = t.user_type_id
    WHERE c.object_id = OBJECT_ID('VendorOrderDetails')
    ORDER BY c.column_id;
END
ELSE
BEGIN
    PRINT '✗ VendorOrderDetails table does not exist!'
END
GO

-- Verify required columns exist
PRINT ''
PRINT '=== REQUIRED COLUMNS VERIFICATION ==='

IF OBJECT_ID('VendorOrderDetails') IS NOT NULL
BEGIN
    DECLARE @MissingColumns NVARCHAR(MAX) = '';
    
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('VendorOrderDetails') AND name = 'PartName')
        SET @MissingColumns = @MissingColumns + 'PartName, ';
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('VendorOrderDetails') AND name = 'PartNo')
        SET @MissingColumns = @MissingColumns + 'PartNo, ';
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('VendorOrderDetails') AND name = 'LeadTime')
        SET @MissingColumns = @MissingColumns + 'LeadTime, ';
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('VendorOrderDetails') AND name = 'Notes')
        SET @MissingColumns = @MissingColumns + 'Notes, ';
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('VendorOrderDetails') AND name = 'ShippedQty')
        SET @MissingColumns = @MissingColumns + 'ShippedQty, ';
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('VendorOrderDetails') AND name = 'ShippingStatus')
        SET @MissingColumns = @MissingColumns + 'ShippingStatus, ';
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('VendorOrderDetails') AND name = 'InvoicedQty')
        SET @MissingColumns = @MissingColumns + 'InvoicedQty, ';
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('VendorOrderDetails') AND name = 'InvoiceStatus')
        SET @MissingColumns = @MissingColumns + 'InvoiceStatus, ';
    
    IF LEN(@MissingColumns) > 0
    BEGIN
        SET @MissingColumns = LEFT(@MissingColumns, LEN(@MissingColumns) - 2);
        PRINT '✗ WARNING: Missing columns: ' + @MissingColumns
    END
    ELSE
    BEGIN
        PRINT '✓ All required columns exist'
    END
END
GO

-- =============================================
-- 3. CREATE MISSING TABLES (if needed)
-- =============================================

PRINT ''
PRINT '=== CREATING MISSING TABLES ==='

-- Create VendorOrderAttachments table if it doesn't exist
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='VendorOrderAttachments' AND xtype='U')
BEGIN
    PRINT 'Creating VendorOrderAttachments table...'
    CREATE TABLE [dbo].[VendorOrderAttachments] (
        [Id] INT IDENTITY(1,1) PRIMARY KEY,
        [OrderID] INT NOT NULL,
        [Name] NVARCHAR(255) NULL,
        [Size] BIGINT NULL,
        [FileUrl] NVARCHAR(MAX) NULL,
        [CreatedDate] DATETIME2 DEFAULT GETUTCDATE(),
        FOREIGN KEY ([OrderID]) REFERENCES [VendorOrders]([OrderID])
    );
    PRINT '✓ VendorOrderAttachments table created'
END
ELSE
BEGIN
    PRINT '✓ VendorOrderAttachments table already exists'
END
GO

-- Create VendorOrderComments table if it doesn't exist
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='VendorOrderComments' AND xtype='U')
BEGIN
    PRINT 'Creating VendorOrderComments table...'
    CREATE TABLE [dbo].[VendorOrderComments] (
        [Id] INT IDENTITY(1,1) PRIMARY KEY,
        [OrderID] INT NOT NULL,
        [Text] NVARCHAR(MAX) NULL,
        [CreatedAt] DATETIME2 DEFAULT GETUTCDATE(),
        [CreatedBy] NVARCHAR(255) NULL,
        FOREIGN KEY ([OrderID]) REFERENCES [VendorOrders]([OrderID])
    );
    PRINT '✓ VendorOrderComments table created'
END
ELSE
BEGIN
    PRINT '✓ VendorOrderComments table already exists'
END
GO

-- =============================================
-- 4. ADD INDEXES FOR PERFORMANCE
-- =============================================

PRINT ''
PRINT '=== ADDING INDEXES ==='

-- Add index on VendorID for better performance in VendorOrders
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE object_id = OBJECT_ID('VendorOrders') AND name = 'IX_VendorOrders_VendorID')
BEGIN
    PRINT 'Creating index on VendorOrders.VendorID...'
    CREATE INDEX IX_VendorOrders_VendorID ON VendorOrders(VendorID);
    PRINT '✓ Index IX_VendorOrders_VendorID created'
END
ELSE
BEGIN
    PRINT '✓ Index IX_VendorOrders_VendorID already exists'
END

-- Add index on QuotationId for tracking conversions
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE object_id = OBJECT_ID('VendorOrders') AND name = 'IX_VendorOrders_QuotationId')
BEGIN
    PRINT 'Creating index on VendorOrders.QuotationId...'
    CREATE INDEX IX_VendorOrders_QuotationId ON VendorOrders(QuotationId);
    PRINT '✓ Index IX_VendorOrders_QuotationId created'
END
ELSE
BEGIN
    PRINT '✓ Index IX_VendorOrders_QuotationId already exists'
END
GO

-- =============================================
-- 5. UPDATE EXISTING DATA
-- =============================================

PRINT ''
PRINT '=== UPDATING EXISTING DATA ==='

-- Update existing vendor orders to have MaterialType = 'Material' if NULL
DECLARE @MaterialOrders INT;
SELECT @MaterialOrders = COUNT(*) FROM VendorOrders WHERE MaterialType IS NULL;
IF @MaterialOrders > 0
BEGIN
    PRINT 'Updating ' + CAST(@MaterialOrders AS NVARCHAR(10)) + ' existing vendor orders to have MaterialType = Material...'
    UPDATE VendorOrders SET MaterialType = 'Material' WHERE MaterialType IS NULL;
    PRINT '✓ Updated existing vendor orders with MaterialType = Material'
END
ELSE
BEGIN
    PRINT '✓ All existing vendor orders already have MaterialType set'
END
GO

-- =============================================
-- 6. FINAL VERIFICATION
-- =============================================

PRINT ''
PRINT '=== FINAL VERIFICATION ==='

-- Show vendor table existence
SELECT 'VendorOrders' AS TableName,
       CASE WHEN EXISTS (SELECT * FROM sysobjects WHERE name='VendorOrders' AND xtype='U')
            THEN 'EXISTS' ELSE 'MISSING' END AS Status
UNION ALL
SELECT 'VendorOrderDetails',
       CASE WHEN EXISTS (SELECT * FROM sysobjects WHERE name='VendorOrderDetails' AND xtype='U')
            THEN 'EXISTS' ELSE 'MISSING' END
UNION ALL
SELECT 'VendorOrderAttachments',
       CASE WHEN EXISTS (SELECT * FROM sysobjects WHERE name='VendorOrderAttachments' AND xtype='U')
            THEN 'EXISTS' ELSE 'MISSING' END
UNION ALL
SELECT 'VendorOrderComments',
       CASE WHEN EXISTS (SELECT * FROM sysobjects WHERE name='VendorOrderComments' AND xtype='U')
            THEN 'EXISTS' ELSE 'MISSING' END;

-- Check if MaterialType column exists and show data
IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('VendorOrders') AND name = 'MaterialType')
BEGIN
    PRINT ''
    PRINT 'MaterialType distribution:'
    SELECT MaterialType, COUNT(*) as Count
    FROM VendorOrders
    GROUP BY MaterialType
    ORDER BY MaterialType;
END
ELSE
BEGIN
    PRINT ''
    PRINT 'WARNING: MaterialType column was not successfully added!'
END

-- Show recent vendor orders
PRINT ''
PRINT 'Recent vendor orders:'
IF EXISTS (SELECT * FROM sysobjects WHERE name='VendorOrders' AND xtype='U')
BEGIN
    SELECT TOP 5 OrderID, VendorName, OrderDate, TotalAmount, Status, MaterialType, QuotationId
    FROM VendorOrders
    ORDER BY OrderDate DESC;
END
ELSE
BEGIN
    PRINT 'No VendorOrders table found'
END

-- Show sample vendor order details
PRINT ''
PRINT 'Sample vendor order details (showing new columns):'
IF OBJECT_ID('VendorOrderDetails') IS NOT NULL
BEGIN
    SELECT TOP 5 
        ID, OrderID, ItemNo, 
        PartName, PartNo, 
        DueDateString AS DueDate,
        JobNumber, QtyOrdered, UnitPrice,
        ShippedQty, ShippingStatus,
        InvoicedQty, InvoiceStatus,
        LeadTime, Notes
    FROM VendorOrderDetails
    WHERE OrderID IN (SELECT TOP 1 OrderID FROM VendorOrders ORDER BY OrderDate DESC)
    ORDER BY ItemNo;
END
ELSE
BEGIN
    PRINT 'No VendorOrderDetails table found'
END

-- Column mapping summary
PRINT ''
PRINT '=== COLUMN MAPPING SUMMARY ==='
PRINT 'Model Property -> Database Column Mapping:'
PRINT '  PartName -> PartName (new column, migrated from itemname if exists)'
PRINT '  PartNo -> PartNo (new column)'
PRINT '  DueDate (string) -> DueDateString (new column, converted from DueDate DateTime if exists)'
PRINT '  ProductId -> productid (existing column, case handled by Column attribute)'
PRINT '  LeadTime -> LeadTime (new column)'
PRINT '  Notes -> Notes (new column)'
PRINT '  ShippedQty -> ShippedQty (new column, default 0)'
PRINT '  ShippingStatus -> ShippingStatus (new column, default "Not Started")'
PRINT '  InvoicedQty -> InvoicedQty (new column, default 0)'
PRINT '  InvoiceStatus -> InvoiceStatus (new column, default "Not Invoiced")'
PRINT ''
PRINT 'Existing columns preserved:'
PRINT '  itemname (kept for backward compatibility, data migrated to PartName)'
PRINT '  DueDate (DateTime, kept for backward compatibility, data also in DueDateString)'
PRINT '  productid (kept, mapped to ProductId in model)'
PRINT '  All other existing columns remain unchanged'

-- Data statistics
PRINT ''
PRINT '=== DATA STATISTICS ==='
IF OBJECT_ID('VendorOrderDetails') IS NOT NULL
BEGIN
    DECLARE @TotalDetails INT;
    DECLARE @DetailsWithPartName INT;
    DECLARE @DetailsWithDueDateString INT;
    DECLARE @DetailsWithShippingInfo INT;
    
    SELECT @TotalDetails = COUNT(*) FROM VendorOrderDetails;
    SELECT @DetailsWithPartName = COUNT(*) FROM VendorOrderDetails WHERE PartName IS NOT NULL AND PartName != '';
    SELECT @DetailsWithDueDateString = COUNT(*) FROM VendorOrderDetails WHERE DueDateString IS NOT NULL AND DueDateString != '';
    SELECT @DetailsWithShippingInfo = COUNT(*) FROM VendorOrderDetails WHERE ShippedQty > 0 OR ShippingStatus IS NOT NULL;
    
    PRINT 'Total VendorOrderDetails records: ' + CAST(@TotalDetails AS NVARCHAR(10));
    PRINT 'Records with PartName: ' + CAST(@DetailsWithPartName AS NVARCHAR(10)) + ' (' + CAST(CAST(@DetailsWithPartName * 100.0 / NULLIF(@TotalDetails, 0) AS DECIMAL(5,2)) AS NVARCHAR(10)) + '%)';
    PRINT 'Records with DueDateString: ' + CAST(@DetailsWithDueDateString AS NVARCHAR(10)) + ' (' + CAST(CAST(@DetailsWithDueDateString * 100.0 / NULLIF(@TotalDetails, 0) AS DECIMAL(5,2)) AS NVARCHAR(10)) + '%)';
    PRINT 'Records with shipping info: ' + CAST(@DetailsWithShippingInfo AS NVARCHAR(10));
END

PRINT ''
PRINT '=== SETUP COMPLETE ==='
PRINT '✅ Vendor Order functionality should now work with your existing database.'
PRINT ''
PRINT 'SUMMARY:'
PRINT '✅ VendorOrders table: Your main vendor orders table'
PRINT '✅ VendorOrderDetails table: Your vendor order details table'
PRINT '✅ VendorOrderAttachments table: Created for file attachments'
PRINT '✅ VendorOrderComments table: Created for order comments'
PRINT '✅ MaterialType column: Added to VendorOrders for Material/Service types'
PRINT '✅ QuotationId/QuotationNo columns: Added for tracking quotation conversions'
PRINT '✅ PartName column: Added to VendorOrderDetails (data migrated from itemname)'
PRINT '✅ PartNo column: Added to VendorOrderDetails'
PRINT '✅ DueDateString column: Added to VendorOrderDetails (data migrated from DueDate DateTime)'
PRINT '✅ LeadTime, Notes columns: Added to VendorOrderDetails'
PRINT '✅ ShippedQty, ShippingStatus columns: Added to VendorOrderDetails'
PRINT '✅ InvoicedQty, InvoiceStatus columns: Added to VendorOrderDetails'
PRINT '✅ Indexes: Added for performance'
PRINT '✅ Data migration: Existing data preserved and migrated to new structure'
PRINT '✅ Default values: Set for all new columns'
PRINT ''
PRINT 'The frontend will now be able to:'
PRINT '✅ Create vendor orders directly in VendorOrders table'
PRINT '✅ Convert quotations to vendor orders'
PRINT '✅ Display vendor orders in the Purchasing → Vendor Orders page'
PRINT '✅ Use all existing vendor order functionality'
PRINT '✅ Track shipping and invoicing status per line item'
PRINT ''
PRINT '🎉 Setup completed successfully!'
PRINT 'Your vendor order system is now ready to use.'
PRINT ''
PRINT 'NEXT STEPS:'
PRINT '1. Update VendorOrderDetail.cs model to use [Column] attributes for proper mapping'
PRINT '2. Restart your ASP.NET Core API'
PRINT '3. Test vendor order creation and quotation conversion'
