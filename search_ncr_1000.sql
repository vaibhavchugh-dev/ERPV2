-- SEARCH FOR ANY REFERENCES TO 'NCR#1000' IN THE DATABASE
-- This will find triggers, procedures, functions, etc. that contain this string

USE [YourDatabaseName]; -- Replace with your actual database name
GO

PRINT '=== SEARCHING FOR NCR#1000 REFERENCES ===';

-- Search in all object definitions
SELECT
    OBJECT_NAME(o.object_id) AS ObjectName,
    o.type_desc AS ObjectType,
    OBJECT_DEFINITION(o.object_id) AS ObjectDefinition
FROM sys.objects o
WHERE OBJECT_DEFINITION(o.object_id) LIKE '%NCR#1000%'
ORDER BY o.type_desc, OBJECT_NAME(o.object_id);

PRINT '';
PRINT '=== SEARCHING IN ALL TABLES FOR NCR#1000 VALUES ===';

-- Check if any tables have NCR#1000 as default or static values
DECLARE @TableName NVARCHAR(128);
DECLARE @ColumnName NVARCHAR(128);
DECLARE @SQL NVARCHAR(MAX);

-- Create a temp table to store results
IF OBJECT_ID('tempdb..#NCR1000_Results') IS NOT NULL DROP TABLE #NCR1000_Results;
CREATE TABLE #NCR1000_Results (
    TableName NVARCHAR(128),
    ColumnName NVARCHAR(128),
    RowCount INT
);

-- Cursor to check each table and column
DECLARE table_cursor CURSOR FOR
SELECT t.name AS TableName, c.name AS ColumnName
FROM sys.tables t
JOIN sys.columns c ON t.object_id = c.object_id
WHERE c.system_type_id IN (167, 175, 231, 239) -- VARCHAR, NVARCHAR types
AND t.name NOT LIKE 'sys%';

OPEN table_cursor;
FETCH NEXT FROM table_cursor INTO @TableName, @ColumnName;

WHILE @@FETCH_STATUS = 0
BEGIN
    SET @SQL = N'
    INSERT INTO #NCR1000_Results (TableName, ColumnName, RowCount)
    SELECT ''' + @TableName + ''', ''' + @ColumnName + ''', COUNT(*)
    FROM ' + QUOTENAME(@TableName) + '
    WHERE ' + QUOTENAME(@ColumnName) + ' = ''NCR#1000''';

    BEGIN TRY
        EXEC sp_executesql @SQL;
    END TRY
    BEGIN CATCH
        -- Skip tables that cause errors (permissions, etc.)
    END CATCH;

    FETCH NEXT FROM table_cursor INTO @TableName, @ColumnName;
END;

CLOSE table_cursor;
DEALLOCATE table_cursor;

-- Show results
SELECT * FROM #NCR1000_Results WHERE RowCount > 0 ORDER BY RowCount DESC;

PRINT '';
PRINT '=== CHECKING FOR INSTEAD OF TRIGGERS WITH DIFFERENT NAMES ===';

-- Look for any triggers that might affect NonConformanceReports
SELECT
    t.name AS TriggerName,
    OBJECT_NAME(t.parent_id) AS TableName,
    OBJECT_DEFINITION(t.object_id) AS TriggerDefinition,
    t.is_instead_of_trigger
FROM sys.triggers t
WHERE OBJECT_DEFINITION(t.object_id) LIKE '%NonConformanceReports%'
OR OBJECT_DEFINITION(t.object_id) LIKE '%NCR%'
OR OBJECT_DEFINITION(t.object_id) LIKE '%1000%';

PRINT '';
PRINT '=== CHECKING STORED PROCEDURES FOR NCR LOGIC ===';

SELECT
    p.name AS ProcedureName,
    OBJECT_DEFINITION(p.object_id) AS ProcedureDefinition
FROM sys.procedures p
WHERE OBJECT_DEFINITION(p.object_id) LIKE '%NonConformanceReports%'
OR OBJECT_DEFINITION(p.object_id) LIKE '%NCR%'
OR OBJECT_DEFINITION(p.object_id) LIKE '%1000%';

PRINT '';
PRINT '=== CHECKING FUNCTIONS FOR NCR LOGIC ===';

SELECT
    f.name AS FunctionName,
    OBJECT_DEFINITION(f.object_id) AS FunctionDefinition
FROM sys.objects f
WHERE f.type IN ('FN', 'IF', 'TF') -- Scalar, Inline, Table-valued functions
AND (OBJECT_DEFINITION(f.object_id) LIKE '%NonConformanceReports%'
OR OBJECT_DEFINITION(f.object_id) LIKE '%NCR%'
OR OBJECT_DEFINITION(f.object_id) LIKE '%1000%');

PRINT '';
PRINT '=== DIRECT TEST: INSERT AND CHECK WHAT HAPPENS ===';

-- Test what happens when we insert NCR#1000 directly
BEGIN TRANSACTION;

DECLARE @TestNcrId INT;

INSERT INTO NonConformanceReports (
    NcrNumber, Title, Description, Category, Severity, Status, Source,
    ReportedBy, ReportedDate, TenantId, CreatedBy, CreatedDate
) VALUES (
    'NCR#1000', 'Direct NCR#1000 Test', 'Testing direct insert of NCR#1000', 'Other', 'Minor', 'Open', 'Internal',
    1, GETUTCDATE(), 1, 1, GETUTCDATE()
);

SET @TestNcrId = SCOPE_IDENTITY();

SELECT 'Direct NCR#1000 insert result:' as Test, NcrNumber, Title, NcrId
FROM NonConformanceReports
WHERE NcrId = @TestNcrId;

-- Clean up
DELETE FROM NonConformanceReports WHERE NcrId = @TestNcrId;
COMMIT TRANSACTION;

PRINT '';
PRINT '=== SUMMARY ===';
PRINT 'If this search finds something, that is what is forcing NCR#1000.';
PRINT 'If it finds nothing, then the issue might be:';
PRINT '1. A trigger/procedure with a name we are not searching for';
PRINT '2. Logic in the application we have not seen yet';
PRINT '3. A database maintenance process or job';
PRINT '4. Some SQL Server feature we are not aware of';



















