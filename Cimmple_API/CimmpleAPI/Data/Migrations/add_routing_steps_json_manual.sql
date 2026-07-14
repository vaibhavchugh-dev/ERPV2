-- Add RoutingStepsJson column to JobOrderMaster
-- This script is safe to run multiple times (checks if column exists first)

IF NOT EXISTS (
    SELECT 1 
    FROM sys.columns 
    WHERE object_id = OBJECT_ID('JobOrderMaster') 
    AND name = 'RoutingStepsJson'
)
BEGIN
    ALTER TABLE JobOrderMaster
    ADD RoutingStepsJson nvarchar(max) NULL;
    
    PRINT 'Column RoutingStepsJson added successfully.';
END
ELSE
BEGIN
    PRINT 'Column RoutingStepsJson already exists.';
END
GO


