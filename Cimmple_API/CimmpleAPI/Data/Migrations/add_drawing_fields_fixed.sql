-- Add DrawingNumber and DrawingRevision columns to JobOrderMaster
-- This script is safe to run multiple times and handles all edge cases

USE CimmpleDb;
GO

-- Verify table exists first
IF OBJECT_ID('JobOrderMaster', 'U') IS NULL
BEGIN
    PRINT 'ERROR: Table JobOrderMaster does not exist. Please create the table first.';
    RETURN;
END

PRINT 'Table JobOrderMaster found. Proceeding to add columns...';
GO

-- Add DrawingNumber column
IF NOT EXISTS (
    SELECT 1 
    FROM sys.columns 
    WHERE object_id = OBJECT_ID('CimmpleDb.dbo.JobOrderMaster') 
    AND name = 'DrawingNumber'
)
BEGIN
    ALTER TABLE CimmpleDb.dbo.JobOrderMaster
    ADD DrawingNumber nvarchar(max) NULL;
    
    PRINT '✓ Column DrawingNumber added successfully.';
END
ELSE
BEGIN
    PRINT 'ℹ Column DrawingNumber already exists. Skipping.';
END
GO

-- Add DrawingRevision column
IF NOT EXISTS (
    SELECT 1 
    FROM sys.columns 
    WHERE object_id = OBJECT_ID('CimmpleDb.dbo.JobOrderMaster') 
    AND name = 'DrawingRevision'
)
BEGIN
    ALTER TABLE CimmpleDb.dbo.JobOrderMaster
    ADD DrawingRevision nvarchar(max) NULL;
    
    PRINT '✓ Column DrawingRevision added successfully.';
END
ELSE
BEGIN
    PRINT 'ℹ Column DrawingRevision already exists. Skipping.';
END
GO

-- Verify columns were added
PRINT '';
PRINT 'Verification:';
IF EXISTS (
    SELECT 1 
    FROM sys.columns 
    WHERE object_id = OBJECT_ID('CimmpleDb.dbo.JobOrderMaster') 
    AND name = 'DrawingNumber'
) AND EXISTS (
    SELECT 1 
    FROM sys.columns 
    WHERE object_id = OBJECT_ID('CimmpleDb.dbo.JobOrderMaster') 
    AND name = 'DrawingRevision'
)
BEGIN
    PRINT '✓ SUCCESS: Both columns now exist in JobOrderMaster table.';
END
ELSE
BEGIN
    PRINT '✗ ERROR: One or both columns are still missing.';
END
GO

