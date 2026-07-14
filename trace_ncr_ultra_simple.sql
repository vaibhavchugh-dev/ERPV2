-- ULTRA SIMPLE NCR TRACE: No procedures or functions
-- Just direct operations and prints

USE [YourDatabaseName]; -- Replace with your actual database name
GO

PRINT '=== NCR TRACE: Starting investigation ===';

-- Create trace table
IF OBJECT_ID('tempdb..#NCR_Trace_Log') IS NOT NULL DROP TABLE #NCR_Trace_Log;
CREATE TABLE #NCR_Trace_Log (
    StepNumber INT IDENTITY(1,1),
    StepTime DATETIME2 DEFAULT SYSDATETIME(),
    Action VARCHAR(100),
    Details NVARCHAR(MAX)
);

PRINT 'Step 1: Checking table structure...';
INSERT INTO #NCR_Trace_Log (Action, Details) VALUES ('STEP_1', 'Checking NonConformanceReports.NcrNumber column');

-- Check column info
SELECT
    'COLUMN_INFO' as CheckType,
    c.name as ColumnName,
    t.name as DataType,
    c.is_nullable as IsNullable,
    OBJECT_DEFINITION(c.default_object_id) as DefaultDefinition
FROM sys.columns c
JOIN sys.types t ON c.system_type_id = t.system_type_id
WHERE c.object_id = OBJECT_ID('NonConformanceReports')
AND c.name = 'NcrNumber';

PRINT 'Step 2: Checking for triggers...';
INSERT INTO #NCR_Trace_Log (Action, Details) VALUES ('STEP_2', 'Checking for triggers on NonConformanceReports');

SELECT
    'TRIGGER_INFO' as CheckType,
    t.name as TriggerName,
    t.is_disabled as IsDisabled,
    t.is_instead_of_trigger as IsInsteadOf,
    CASE WHEN t.is_disabled = 1 THEN 'DISABLED' ELSE 'ENABLED' END as Status
FROM sys.triggers t
WHERE t.parent_id = OBJECT_ID('NonConformanceReports');

PRINT 'Step 3: Testing INSERT with NCR#9999...';
INSERT INTO #NCR_Trace_Log (Action, Details) VALUES ('STEP_3', 'Testing INSERT with NCR#9999');

DECLARE @TestNcrId INT;
DECLARE @StoredValue NVARCHAR(100);

BEGIN TRY
    INSERT INTO NonConformanceReports (
        NcrNumber, Title, Description, Category, Severity, Status, Source,
        ReportedBy, ReportedDate, TenantId, CreatedBy, CreatedDate
    ) VALUES (
        'NCR#9999', 'Ultra Simple Trace Test', 'Testing NCR insert behavior', 'Other', 'Minor', 'Open', 'Internal',
        1, GETUTCDATE(), 1, 1, GETUTCDATE()
    );

    SET @TestNcrId = SCOPE_IDENTITY();
    PRINT 'INSERT successful, NcrId: ' + CAST(@TestNcrId AS VARCHAR(10));

    -- Check what was stored
    SELECT @StoredValue = NcrNumber FROM NonConformanceReports WHERE NcrId = @TestNcrId;
    PRINT 'Expected NCR#9999, got: ' + @StoredValue;

    INSERT INTO #NCR_Trace_Log (Action, Details)
    VALUES ('INSERT_RESULT', 'Expected: NCR#9999, Actual: ' + @StoredValue);

    IF @StoredValue != 'NCR#9999'
    BEGIN
        PRINT '*** VALUE WAS CHANGED! ***';
        INSERT INTO #NCR_Trace_Log (Action, Details)
        VALUES ('VALUE_CHANGED', 'CRITICAL: NCR#9999 was changed to ' + @StoredValue);
    END
    ELSE
    BEGIN
        PRINT 'Value preserved correctly.';
        INSERT INTO #NCR_Trace_Log (Action, Details)
        VALUES ('VALUE_PRESERVED', 'NCR#9999 was stored correctly');
    END

    -- Clean up
    DELETE FROM NonConformanceReports WHERE NcrId = @TestNcrId;
    PRINT 'Test record cleaned up.';

END TRY
BEGIN CATCH
    PRINT 'INSERT failed: ' + ERROR_MESSAGE();
    INSERT INTO #NCR_Trace_Log (Action, Details)
    VALUES ('INSERT_ERROR', ERROR_MESSAGE());
END CATCH;

PRINT 'Step 4: Testing INSERT with NCR#7777...';
INSERT INTO #NCR_Trace_Log (Action, Details) VALUES ('STEP_4', 'Testing INSERT with NCR#7777');

DECLARE @SecondTestId INT;
DECLARE @SecondStoredValue NVARCHAR(100);

BEGIN TRY
    INSERT INTO NonConformanceReports (
        NcrNumber, Title, Description, Category, Severity, Status, Source,
        ReportedBy, ReportedDate, TenantId, CreatedBy, CreatedDate
    ) VALUES (
        'NCR#7777', 'Second Ultra Simple Test', 'Testing with different NCR number', 'Other', 'Minor', 'Open', 'Internal',
        1, GETUTCDATE(), 1, 1, GETUTCDATE()
    );

    SET @SecondTestId = SCOPE_IDENTITY();
    PRINT 'Second INSERT successful, NcrId: ' + CAST(@SecondTestId AS VARCHAR(10));

    SELECT @SecondStoredValue = NcrNumber FROM NonConformanceReports WHERE NcrId = @SecondTestId;
    PRINT 'Expected NCR#7777, got: ' + @SecondStoredValue;

    INSERT INTO #NCR_Trace_Log (Action, Details)
    VALUES ('SECOND_RESULT', 'Expected: NCR#7777, Actual: ' + @SecondStoredValue);

    IF @SecondStoredValue != 'NCR#7777'
    BEGIN
        PRINT '*** SECOND VALUE WAS CHANGED! ***';
        INSERT INTO #NCR_Trace_Log (Action, Details)
        VALUES ('SECOND_VALUE_CHANGED', 'CRITICAL: NCR#7777 was changed to ' + @SecondStoredValue);
    END

    -- Clean up
    DELETE FROM NonConformanceReports WHERE NcrId = @SecondTestId;
    PRINT 'Second test record cleaned up.';

END TRY
BEGIN CATCH
    PRINT 'Second INSERT failed: ' + ERROR_MESSAGE();
END CATCH;

-- Show all trace results
PRINT '';
PRINT '=== TRACE LOG RESULTS ===';
SELECT
    StepNumber,
    CONVERT(VARCHAR(19), StepTime, 120) AS Time,
    Action,
    Details
FROM #NCR_Trace_Log
ORDER BY StepNumber;

-- Check for critical findings
DECLARE @CriticalCount INT;
SELECT @CriticalCount = COUNT(*) FROM #NCR_Trace_Log
WHERE Action LIKE '%CHANGED%' OR Details LIKE '%CRITICAL%';

IF @CriticalCount > 0
BEGIN
    PRINT '';
    PRINT '*** CRITICAL FINDINGS DETECTED ***';
    PRINT 'The database IS modifying NCR numbers during INSERT!';
    PRINT 'Look for VALUE_CHANGED entries above.';
END
ELSE
BEGIN
    PRINT '';
    PRINT '*** NO CRITICAL FINDINGS ***';
    PRINT 'If NCR numbers are still NCR#1000, the issue might be elsewhere.';
END

-- Clean up
DROP TABLE #NCR_Trace_Log;

PRINT '';
PRINT '=== NEXT STEPS ===';
PRINT 'If VALUE_CHANGED found: Run ncr_fix_solution.sql to remove the constraint';
PRINT 'If no changes detected: The issue might be in application code or elsewhere';



















