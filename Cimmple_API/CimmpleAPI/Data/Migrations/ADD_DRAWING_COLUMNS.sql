-- =============================================
-- Add DrawingNumber and DrawingRevision to JobOrderMaster
-- Run this in SQL Server Management Studio
-- =============================================

USE CimmpleDb;
GO

-- Check if columns exist first
IF NOT EXISTS (
    SELECT 1 
    FROM sys.columns 
    WHERE object_id = OBJECT_ID('dbo.JobOrderMaster') 
    AND name = 'DrawingNumber'
)
BEGIN
    ALTER TABLE dbo.JobOrderMaster
    ADD DrawingNumber nvarchar(max) NULL;
    PRINT '✓ DrawingNumber column added successfully.';
END
ELSE
BEGIN
    PRINT 'ℹ DrawingNumber column already exists.';
END
GO

IF NOT EXISTS (
    SELECT 1 
    FROM sys.columns 
    WHERE object_id = OBJECT_ID('dbo.JobOrderMaster') 
    AND name = 'DrawingRevision'
)
BEGIN
    ALTER TABLE dbo.JobOrderMaster
    ADD DrawingRevision nvarchar(max) NULL;
    PRINT '✓ DrawingRevision column added successfully.';
END
ELSE
BEGIN
    PRINT 'ℹ DrawingRevision column already exists.';
END
GO

-- Verify the columns were added
SELECT 
    COLUMN_NAME,
    DATA_TYPE,
    IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'JobOrderMaster'
    AND COLUMN_NAME IN ('DrawingNumber', 'DrawingRevision')
ORDER BY COLUMN_NAME;
GO

