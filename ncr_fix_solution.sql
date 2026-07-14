-- NCR NUMBERING FIX: Direct Solution
-- If investigation shows NCR#1000 is being forced, try these fixes

USE [YourDatabaseName]; -- Replace with your actual database name
GO

PRINT '=== NCR NUMBERING FIX ATTEMPT ===';

-- METHOD 1: Remove any default constraint on NcrNumber
BEGIN TRY
    PRINT 'Attempting to drop default constraint on NcrNumber...';

    DECLARE @ConstraintName NVARCHAR(128);
    SELECT @ConstraintName = dc.name
    FROM sys.default_constraints dc
    JOIN sys.columns c ON dc.parent_column_id = c.column_id
    WHERE c.object_id = OBJECT_ID('NonConformanceReports')
    AND c.name = 'NcrNumber';

    IF @ConstraintName IS NOT NULL
    BEGIN
        PRINT 'Found default constraint: ' + @ConstraintName;
        EXEC('ALTER TABLE NonConformanceReports DROP CONSTRAINT ' + @ConstraintName);
        PRINT '✅ Default constraint removed successfully!';
    END
    ELSE
    BEGIN
        PRINT 'No default constraint found on NcrNumber column.';
    END
END TRY
BEGIN CATCH
    PRINT '❌ Error removing default constraint: ' + ERROR_MESSAGE();
END CATCH;

-- METHOD 2: Check and disable any triggers
BEGIN TRY
    PRINT '';
    PRINT 'Checking for triggers to disable...';

    DECLARE @TriggerCursor CURSOR;
    DECLARE @TriggerName NVARCHAR(128);

    SET @TriggerCursor = CURSOR FOR
    SELECT name FROM sys.triggers
    WHERE parent_id = OBJECT_ID('NonConformanceReports');

    OPEN @TriggerCursor;
    FETCH NEXT FROM @TriggerCursor INTO @TriggerName;

    WHILE @@FETCH_STATUS = 0
    BEGIN
        PRINT 'Found trigger: ' + @TriggerName + ' - attempting to disable...';
        EXEC('ALTER TABLE NonConformanceReports DISABLE TRIGGER ' + @TriggerName);
        PRINT '✅ Trigger ' + @TriggerName + ' disabled.';
        FETCH NEXT FROM @TriggerCursor INTO @TriggerName;
    END;

    CLOSE @TriggerCursor;
    DEALLOCATE @TriggerCursor;

    IF @@ROWCOUNT = 0
    BEGIN
        PRINT 'No triggers found to disable.';
    END
END TRY
BEGIN CATCH
    PRINT '❌ Error disabling triggers: ' + ERROR_MESSAGE();
END CATCH;

-- METHOD 3: Test the fix
PRINT '';
PRINT '=== TESTING THE FIX ===';

BEGIN TRY
    DECLARE @TestId INT;

    -- Test 1: Insert with specific NCR number
    INSERT INTO NonConformanceReports (
        NcrNumber, Title, Description, Category, Severity, Status, Source,
        ReportedBy, ReportedDate, TenantId, CreatedBy, CreatedDate
    ) VALUES (
        'NCR#1234', 'Fix Test NCR', 'Testing if NCR numbering fix works', 'Other', 'Minor', 'Open', 'Internal',
        1, GETUTCDATE(), 1, 1, GETUTCDATE()
    );

    SET @TestId = SCOPE_IDENTITY();

    DECLARE @Result NVARCHAR(100);
    SELECT @Result = NcrNumber FROM NonConformanceReports WHERE NcrId = @TestId;

    PRINT 'Test INSERT with NCR#1234:';
    PRINT 'Expected: NCR#1234';
    PRINT 'Actual: ' + @Result;

    IF @Result = 'NCR#1234'
    BEGIN
        PRINT '✅ SUCCESS: NCR number was preserved!';
    END
    ELSE
    BEGIN
        PRINT '❌ FAILURE: NCR number was changed to ' + @Result;
        PRINT 'The constraint/trigger is still active.';
    END

    -- Clean up
    DELETE FROM NonConformanceReports WHERE NcrId = @TestId;

END TRY
BEGIN CATCH
    PRINT '❌ Test failed: ' + ERROR_MESSAGE();
END CATCH;

-- METHOD 4: If still failing, try recreating the column
PRINT '';
PRINT '=== EMERGENCY FIX: Recreate NcrNumber Column ===';
PRINT 'ONLY RUN THIS IF ALL ELSE FAILS - THIS WILL LOSE EXISTING NCR NUMBERS!';
PRINT '';

/*
-- EMERGENCY FIX - Uncomment only if desperate!
-- This will drop and recreate the NcrNumber column without any constraints

-- Step 1: Backup existing data
SELECT NcrId, NcrNumber INTO #NCR_Backup FROM NonConformanceReports;

-- Step 2: Drop the problematic column
ALTER TABLE NonConformanceReports DROP COLUMN NcrNumber;

-- Step 3: Recreate the column without constraints
ALTER TABLE NonConformanceReports ADD NcrNumber NVARCHAR(50) NULL;

-- Step 4: Restore data (but this won't help with the constraint issue)
-- You'll need to update NCR numbers through the application
*/

PRINT '';
PRINT '=== NEXT STEPS ===';
PRINT '1. If the test shows SUCCESS, the fix worked!';
PRINT '2. Run your application test again: node test_ncr_fix.js';
PRINT '3. If still failing, you may need the emergency column recreation.';
PRINT '4. Or there might be a database-level trigger we cannot see.';
PRINT '';
PRINT 'Run this script and let me know the results!';



















