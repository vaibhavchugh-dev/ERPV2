-- Add DrawingNumber and DrawingRevision columns to JobOrderMaster
-- This script is safe to run multiple times (checks if columns exist first)

IF NOT EXISTS (
    SELECT 1 
    FROM sys.columns 
    WHERE object_id = OBJECT_ID('JobOrderMaster') 
    AND name = 'DrawingNumber'
)
BEGIN
    ALTER TABLE JobOrderMaster
    ADD DrawingNumber nvarchar(max) NULL;
    
    PRINT 'Column DrawingNumber added successfully.';
END
ELSE
BEGIN
    PRINT 'Column DrawingNumber already exists.';
END
GO

IF NOT EXISTS (
    SELECT 1 
    FROM sys.columns 
    WHERE object_id = OBJECT_ID('JobOrderMaster') 
    AND name = 'DrawingRevision'
)
BEGIN
    ALTER TABLE JobOrderMaster
    ADD DrawingRevision nvarchar(max) NULL;
    
    PRINT 'Column DrawingRevision added successfully.';
END
ELSE
BEGIN
    PRINT 'Column DrawingRevision already exists.';
END
GO


