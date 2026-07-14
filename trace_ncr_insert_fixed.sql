-- TRACE NCR INSERT: Find what changes NCR#1000 (FIXED VERSION)
-- This creates a comprehensive trace without procedure batch issues

USE [YourDatabaseName]; -- Replace with your actual database name
GO

-- Create trace tables first (before any other statements)
IF OBJECT_ID('tempdb..#NCR_Trace_Log') IS NOT NULL DROP TABLE #NCR_Trace_Log;
CREATE TABLE #NCR_Trace_Log (
    StepNumber INT IDENTITY(1,1),
    StepTime DATETIME2 DEFAULT SYSDATETIME(),
    Action VARCHAR(100),
    Details NVARCHAR(MAX)
);

-- Create logging procedure first
CREATE OR ALTER PROCEDURE #LogStep (@Action VARCHAR(100), @Details NVARCHAR(MAX) = NULL)
AS
BEGIN
    INSERT INTO #NCR_Trace_Log (Action, Details)
    VALUES (@Action, @Details);
END;
GO

-- Now start the actual trace
EXEC #LogStep 'TRACE_START', 'Beginning NCR insert trace';

-- STEP 1: Check current table structure
EXEC #LogStep 'CHECK_TABLE_STRUCTURE', 'Examining NonConformanceReports table';
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
EXEC #LogStep 'NCRNUMBER_COLUMN_INFO', @TableInfo;

-- STEP 2: Check for any active triggers
EXEC #LogStep 'CHECK_TRIGGERS', 'Looking for active triggers';
DECLARE @TriggerInfo NVARCHAR(MAX) = (
    SELECT t.name + ' (' + CASE WHEN t.is_disabled = 1 THEN 'DISABLED' ELSE 'ENABLED' END +
           ', ' + CASE WHEN t.is_instead_of_trigger = 1 THEN 'INSTEAD OF' ELSE 'AFTER' END + ')'
    FROM sys.triggers t
    WHERE t.parent_id = OBJECT_ID('NonConformanceReports')
    FOR XML PATH('')
);
IF @TriggerInfo IS NULL SET @TriggerInfo = 'NO TRIGGERS FOUND';
EXEC #LogStep 'TRIGGER_INFO', @TriggerInfo;

-- STEP 3: Attempt direct INSERT with NCR#9999
EXEC #LogStep 'DIRECT_INSERT_START', 'Attempting INSERT with NCR#9999';
DECLARE @TestNcrId INT;

BEGIN TRY
    INSERT INTO NonConformanceReports (
        NcrNumber, Title, Description, Category, Severity, Status, Source,
        ReportedBy, ReportedDate, TenantId, CreatedBy, CreatedDate
    ) VALUES (
        'NCR#9999', 'Trace Test NCR', 'Testing NCR insert behavior', 'Other', 'Minor', 'Open', 'Internal',
        1, GETUTCDATE(), 1, 1, GETUTCDATE()
    );

    SET @TestNcrId = SCOPE_IDENTITY();
    EXEC #LogStep 'DIRECT_INSERT_SUCCESS', 'INSERT completed, NcrId: ' + CAST(@TestNcrId AS VARCHAR(10));

    -- Check what was actually stored
    DECLARE @StoredValue NVARCHAR(100);
    SELECT @StoredValue = NcrNumber FROM NonConformanceReports WHERE NcrId = @TestNcrId;
    EXEC #LogStep 'STORED_VALUE_CHECK', 'Stored NcrNumber: ' + @StoredValue;

    IF @StoredValue != 'NCR#9999'
    BEGIN
        EXEC #LogStep 'VALUE_CHANGED', 'WARNING: Value changed from NCR#9999 to ' + @StoredValue;
    END
    ELSE
    BEGIN
        EXEC #LogStep 'VALUE_UNCHANGED', 'Value remained NCR#9999 as expected';
    END

    -- Clean up test record
    DELETE FROM NonConformanceReports WHERE NcrId = @TestNcrId;
    EXEC #LogStep 'CLEANUP_COMPLETE', 'Test record deleted';

END TRY
BEGIN CATCH
    EXEC #LogStep 'DIRECT_INSERT_ERROR', 'INSERT failed: ' + ERROR_MESSAGE();
END CATCH;

-- STEP 4: Test with Entity Framework simulation (raw SQL with parameters)
EXEC #LogStep 'EF_SIMULATION_START', 'Simulating Entity Framework INSERT pattern';
DECLARE @EF_TestNcrId INT;

BEGIN TRY
    -- Simulate EF parameter binding
    DECLARE @NcrNumberParam NVARCHAR(50) = 'NCR#8888';
    DECLARE @TitleParam NVARCHAR(200) = 'EF Simulation Test';
    DECLARE @TenantParam INT = 1;
    DECLARE @ReportedByParam INT = 1;

    EXEC #LogStep 'EF_PARAMS_SET', 'NcrNumber: ' + @NcrNumberParam + ', Title: ' + @TitleParam;

    INSERT INTO NonConformanceReports (
        NcrNumber, Title, Description, Category, Severity, Status, Source,
        ReportedBy, ReportedDate, TenantId, CreatedBy, CreatedDate
    ) VALUES (
        @NcrNumberParam, @TitleParam, 'EF simulation test', 'Other', 'Minor', 'Open', 'Internal',
        @ReportedByParam, GETUTCDATE(), @TenantParam, @ReportedByParam, GETUTCDATE()
    );

    SET @EF_TestNcrId = SCOPE_IDENTITY();
    EXEC #LogStep 'EF_SIMULATION_SUCCESS', 'EF-style INSERT completed, NcrId: ' + CAST(@EF_TestNcrId AS VARCHAR(10));

    -- Check stored value
    DECLARE @EF_StoredValue NVARCHAR(100);
    SELECT @EF_StoredValue = NcrNumber FROM NonConformanceReports WHERE NcrId = @EF_TestNcrId;
    EXEC #LogStep 'EF_STORED_VALUE', 'EF-style stored NcrNumber: ' + @EF_StoredValue;

    IF @EF_StoredValue != @NcrNumberParam
    BEGIN
        EXEC #LogStep 'EF_VALUE_CHANGED', 'WARNING: EF-style insert changed ' + @NcrNumberParam + ' to ' + @EF_StoredValue;
    END

    -- Clean up
    DELETE FROM NonConformanceReports WHERE NcrId = @EF_TestNcrId;
    EXEC #LogStep 'EF_CLEANUP_COMPLETE', 'EF test record deleted';

END TRY
BEGIN CATCH
    EXEC #LogStep 'EF_SIMULATION_ERROR', 'EF simulation failed: ' + ERROR_MESSAGE();
END CATCH;

-- STEP 5: Check for any SQL Server features that might affect this
EXEC #LogStep 'CHECK_ADVANCED_FEATURES', 'Checking for CDC, Replication, etc.';

-- Check CDC
IF EXISTS (SELECT 1 FROM sys.change_tracking_databases WHERE database_id = DB_ID())
BEGIN
    EXEC #LogStep 'CDC_FOUND', 'Change Data Capture is enabled on database';
    IF EXISTS (SELECT 1 FROM cdc.change_tables WHERE source_object_id = OBJECT_ID('NonConformanceReports'))
    BEGIN
        EXEC #LogStep 'CDC_TABLE_FOUND', 'Change Data Capture is enabled on NonConformanceReports';
    END
END
ELSE
BEGIN
    EXEC #LogStep 'CDC_NOT_FOUND', 'Change Data Capture not enabled';
END

-- Check replication
IF EXISTS (SELECT 1 FROM sys.databases WHERE is_published = 1 AND name = DB_NAME())
BEGIN
    EXEC #LogStep 'REPLICATION_FOUND', 'Database is published for replication';
    IF EXISTS (SELECT 1 FROM sysarticles WHERE dest_table = 'NonConformanceReports')
    BEGIN
        EXEC #LogStep 'REPLICATION_TABLE_FOUND', 'NonConformanceReports is replicated';
    END
END
ELSE
BEGIN
    EXEC #LogStep 'REPLICATION_NOT_FOUND', 'Replication not configured';
END

-- Final summary
EXEC #LogStep 'TRACE_COMPLETE', 'NCR insert trace completed';

-- Display results
SELECT
    StepNumber,
    CONVERT(VARCHAR(23), StepTime, 121) AS StepTime,
    Action,
    Details
FROM #NCR_Trace_Log
ORDER BY StepNumber;

-- Clean up
DROP PROCEDURE #LogStep;
DROP TABLE #NCR_Trace_Log;

PRINT '';
PRINT '=== TRACE RESULTS ANALYSIS ===';
PRINT 'Look for VALUE_CHANGED or EF_VALUE_CHANGED entries above.';
PRINT 'If you see these, something is modifying the NcrNumber during INSERT.';
PRINT 'The Details column will show what it changed FROM -> TO.';



















