-- SIMPLE NCR TRACE: Find what changes NCR#1000
-- No procedures, just direct logging to temp table

USE [YourDatabaseName]; -- Replace with your actual database name
GO

-- Create trace table
IF OBJECT_ID('tempdb..#NCR_Trace_Log') IS NOT NULL DROP TABLE #NCR_Trace_Log;
CREATE TABLE #NCR_Trace_Log (
    StepNumber INT IDENTITY(1,1),
    StepTime DATETIME2 DEFAULT SYSDATETIME(),
    Action VARCHAR(100),
    Details NVARCHAR(MAX)
);

-- Log function (inline)
CREATE FUNCTION #LogStep(@Action VARCHAR(100), @Details NVARCHAR(MAX))
RETURNS INT
AS
BEGIN
    INSERT INTO #NCR_Trace_Log (Action, Details) VALUES (@Action, @Details);
    RETURN 1;
END;
GO

-- Start tracing
INSERT INTO #NCR_Trace_Log (Action, Details) VALUES ('TRACE_START', 'Beginning NCR insert trace');

-- STEP 1: Check current table structure
INSERT INTO #NCR_Trace_Log (Action, Details)
SELECT 'CHECK_TABLE_STRUCTURE', 'Examining NonConformanceReports table';

DECLARE @TableInfo NVARCHAR(MAX) = (
    SELECT
        c.name + ' (' + t.name + ', ' +
        CASE WHEN c.is_nullable = 1 THEN 'NULL' ELSE 'NOT NULL' END + ', ' +
        ISNULL(OBJECT_DEFINITION(c.default_object_id), 'NO DEFAULT') + ')'
    FROM sys.columns c
    JOIN sys.types t ON c.system_type_id = t.system_type_id
    WHERE c.object_id = OBJECT_ID('NonConformanceReports')
    AND c.name = 'NcrNumber'
    FOR XML PATH('')
);
INSERT INTO #NCR_Trace_Log (Action, Details) VALUES ('NCRNUMBER_COLUMN_INFO', @TableInfo);

-- STEP 2: Check for any active triggers
INSERT INTO #NCR_Trace_Log (Action, Details) VALUES ('CHECK_TRIGGERS', 'Looking for active triggers');
DECLARE @TriggerInfo NVARCHAR(MAX) = (
    SELECT t.name + ' (' + CASE WHEN t.is_disabled = 1 THEN 'DISABLED' ELSE 'ENABLED' END +
           ', ' + CASE WHEN t.is_instead_of_trigger = 1 THEN 'INSTEAD OF' ELSE 'AFTER' END + ')'
    FROM sys.triggers t
    WHERE t.parent_id = OBJECT_ID('NonConformanceReports')
    FOR XML PATH('')
);
IF @TriggerInfo IS NULL SET @TriggerInfo = 'NO TRIGGERS FOUND';
INSERT INTO #NCR_Trace_Log (Action, Details) VALUES ('TRIGGER_INFO', @TriggerInfo);

-- STEP 3: Attempt direct INSERT with NCR#9999
INSERT INTO #NCR_Trace_Log (Action, Details) VALUES ('DIRECT_INSERT_START', 'Attempting INSERT with NCR#9999');

DECLARE @TestNcrId INT;
DECLARE @StoredValue NVARCHAR(100);

BEGIN TRY
    INSERT INTO NonConformanceReports (
        NcrNumber, Title, Description, Category, Severity, Status, Source,
        ReportedBy, ReportedDate, TenantId, CreatedBy, CreatedDate
    ) VALUES (
        'NCR#9999', 'Trace Test NCR', 'Testing NCR insert behavior', 'Other', 'Minor', 'Open', 'Internal',
        1, GETUTCDATE(), 1, 1, GETUTCDATE()
    );

    SET @TestNcrId = SCOPE_IDENTITY();
    INSERT INTO #NCR_Trace_Log (Action, Details)
    VALUES ('DIRECT_INSERT_SUCCESS', 'INSERT completed, NcrId: ' + CAST(@TestNcrId AS VARCHAR(10)));

    -- Check what was actually stored
    SELECT @StoredValue = NcrNumber FROM NonConformanceReports WHERE NcrId = @TestNcrId;
    INSERT INTO #NCR_Trace_Log (Action, Details)
    VALUES ('STORED_VALUE_CHECK', 'Stored NcrNumber: ' + @StoredValue);

    IF @StoredValue != 'NCR#9999'
    BEGIN
        INSERT INTO #NCR_Trace_Log (Action, Details)
        VALUES ('VALUE_CHANGED', 'WARNING: Value changed from NCR#9999 to ' + @StoredValue);
    END
    ELSE
    BEGIN
        INSERT INTO #NCR_Trace_Log (Action, Details)
        VALUES ('VALUE_UNCHANGED', 'Value remained NCR#9999 as expected');
    END

    -- Clean up test record
    DELETE FROM NonConformanceReports WHERE NcrId = @TestNcrId;
    INSERT INTO #NCR_Trace_Log (Action, Details) VALUES ('CLEANUP_COMPLETE', 'Test record deleted');

END TRY
BEGIN CATCH
    INSERT INTO #NCR_Trace_Log (Action, Details)
    VALUES ('DIRECT_INSERT_ERROR', 'INSERT failed: ' + ERROR_MESSAGE());
END CATCH;

-- STEP 4: Test with different NCR number
INSERT INTO #NCR_Trace_Log (Action, Details) VALUES ('SECOND_TEST_START', 'Testing with NCR#7777');

DECLARE @SecondTestId INT;
DECLARE @SecondStoredValue NVARCHAR(100);

BEGIN TRY
    INSERT INTO NonConformanceReports (
        NcrNumber, Title, Description, Category, Severity, Status, Source,
        ReportedBy, ReportedDate, TenantId, CreatedBy, CreatedDate
    ) VALUES (
        'NCR#7777', 'Second Trace Test', 'Testing with different NCR number', 'Other', 'Minor', 'Open', 'Internal',
        1, GETUTCDATE(), 1, 1, GETUTCDATE()
    );

    SET @SecondTestId = SCOPE_IDENTITY();
    INSERT INTO #NCR_Trace_Log (Action, Details)
    VALUES ('SECOND_TEST_SUCCESS', 'Second INSERT completed, NcrId: ' + CAST(@SecondTestId AS VARCHAR(10)));

    SELECT @SecondStoredValue = NcrNumber FROM NonConformanceReports WHERE NcrId = @SecondTestId;
    INSERT INTO #NCR_Trace_Log (Action, Details)
    VALUES ('SECOND_STORED_VALUE', 'Second test stored NcrNumber: ' + @SecondStoredValue);

    IF @SecondStoredValue != 'NCR#7777'
    BEGIN
        INSERT INTO #NCR_Trace_Log (Action, Details)
        VALUES ('SECOND_VALUE_CHANGED', 'WARNING: Second test changed NCR#7777 to ' + @SecondStoredValue);
    END

    -- Clean up
    DELETE FROM NonConformanceReports WHERE NcrId = @SecondTestId;
    INSERT INTO #NCR_Trace_Log (Action, Details) VALUES ('SECOND_CLEANUP_COMPLETE', 'Second test record deleted');

END TRY
BEGIN CATCH
    INSERT INTO #NCR_Trace_Log (Action, Details)
    VALUES ('SECOND_TEST_ERROR', 'Second test failed: ' + ERROR_MESSAGE());
END CATCH;

-- Final summary
INSERT INTO #NCR_Trace_Log (Action, Details) VALUES ('TRACE_COMPLETE', 'NCR insert trace completed');

-- Display results
SELECT
    StepNumber,
    CONVERT(VARCHAR(23), StepTime, 121) AS StepTime,
    Action,
    Details
FROM #NCR_Trace_Log
ORDER BY StepNumber;

-- Clean up
DROP FUNCTION #LogStep;
DROP TABLE #NCR_Trace_Log;

PRINT '';
PRINT '=== TRACE RESULTS ANALYSIS ===';
PRINT 'Look for VALUE_CHANGED entries above.';
PRINT 'If you see these, something is definitely modifying NcrNumber during INSERT.';
PRINT 'The Details will show what it changed FROM -> TO.';



















