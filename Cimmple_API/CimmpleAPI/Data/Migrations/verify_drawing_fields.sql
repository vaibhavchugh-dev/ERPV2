-- Verify if DrawingNumber and DrawingRevision columns exist in JobOrderMaster
-- Run this first to check the current state

USE CimmpleDb;
GO

-- Check if table exists
IF OBJECT_ID('JobOrderMaster', 'U') IS NOT NULL
BEGIN
    PRINT 'Table JobOrderMaster exists.';
    
    -- Check for DrawingNumber column
    IF EXISTS (
        SELECT 1 
        FROM sys.columns 
        WHERE object_id = OBJECT_ID('JobOrderMaster') 
        AND name = 'DrawingNumber'
    )
    BEGIN
        PRINT '✓ Column DrawingNumber EXISTS';
    END
    ELSE
    BEGIN
        PRINT '✗ Column DrawingNumber DOES NOT EXIST';
    END
    
    -- Check for DrawingRevision column
    IF EXISTS (
        SELECT 1 
        FROM sys.columns 
        WHERE object_id = OBJECT_ID('JobOrderMaster') 
        AND name = 'DrawingRevision'
    )
    BEGIN
        PRINT '✓ Column DrawingRevision EXISTS';
    END
    ELSE
    BEGIN
        PRINT '✗ Column DrawingRevision DOES NOT EXIST';
    END
    
    -- List all columns in the table
    PRINT '';
    PRINT 'All columns in JobOrderMaster:';
    SELECT 
        COLUMN_NAME,
        DATA_TYPE,
        IS_NULLABLE
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'JobOrderMaster'
    ORDER BY ORDINAL_POSITION;
END
ELSE
BEGIN
    PRINT '✗ Table JobOrderMaster DOES NOT EXIST';
END
GO

