-- Add DrawingNumber and DrawingRevision columns to JobOrderMaster
-- Run this script directly in SQL Server Management Studio or via sqlcmd

USE CimmpleDb;
GO

-- Add DrawingNumber column if it doesn't exist
IF NOT EXISTS (
    SELECT 1 
    FROM sys.columns 
    WHERE object_id = OBJECT_ID('dbo.JobOrderMaster') 
    AND name = 'DrawingNumber'
)
BEGIN
    ALTER TABLE dbo.JobOrderMaster
    ADD DrawingNumber nvarchar(max) NULL;
    PRINT 'Column DrawingNumber added successfully.';
END
ELSE
BEGIN
    PRINT 'Column DrawingNumber already exists.';
END
GO

-- Add DrawingRevision column if it doesn't exist
IF NOT EXISTS (
    SELECT 1 
    FROM sys.columns 
    WHERE object_id = OBJECT_ID('dbo.JobOrderMaster') 
    AND name = 'DrawingRevision'
)
BEGIN
    ALTER TABLE dbo.JobOrderMaster
    ADD DrawingRevision nvarchar(max) NULL;
    PRINT 'Column DrawingRevision added successfully.';
END
ELSE
BEGIN
    PRINT 'Column DrawingRevision already exists.';
END
GO

