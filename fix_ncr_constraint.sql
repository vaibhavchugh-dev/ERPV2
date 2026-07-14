-- NCR Numbering Fix - Find and Remove Database Constraints
-- Execute these commands in your SQL Server database

USE [YourDatabaseName]; -- Replace with your actual database name
GO

-- STEP 1: Find ALL triggers on NonConformanceReports table
PRINT '=== Finding All Triggers on NonConformanceReports ===';
SELECT
    t.name AS TriggerName,
    OBJECT_NAME(t.parent_id) AS TableName,
    OBJECT_DEFINITION(t.object_id) AS TriggerDefinition,
    t.is_disabled,
    t.is_instead_of_trigger,
    t.type_desc
FROM sys.triggers t
WHERE OBJECT_NAME(t.parent_id) = 'NonConformanceReports'
ORDER BY t.name;

-- STEP 2: Check for computed columns that might be overriding NcrNumber
PRINT '';
PRINT '=== Checking for Computed Columns ===';
SELECT
    c.name AS ColumnName,
    c.is_computed,
    CASE WHEN c.is_computed = 1 THEN OBJECT_DEFINITION(c.default_object_id) ELSE NULL END AS ComputedDefinition,
    OBJECT_DEFINITION(c.default_object_id) AS DefaultConstraint
FROM sys.columns c
WHERE OBJECT_NAME(c.object_id) = 'NonConformanceReports'
AND c.name = 'NcrNumber';

-- STEP 3: Check for any rules bound to the column
PRINT '';
PRINT '=== Checking for Rules ===';
SELECT
    r.name AS RuleName,
    OBJECT_DEFINITION(r.object_id) AS RuleDefinition,
    c.name AS BoundColumn
FROM sys.objects r
CROSS APPLY sys.columns c
WHERE r.type = 'R'
AND c.object_id = OBJECT_ID('NonConformanceReports')
AND c.name = 'NcrNumber';

-- STEP 4: If you find a trigger, DISABLE it first to test
PRINT '';
PRINT '=== DISABLE TRIGGER (if found) ===';
-- Uncomment and modify the line below if you find a trigger
-- ALTER TABLE NonConformanceReports DISABLE TRIGGER [YourTriggerName];

-- STEP 5: Test INSERT to see if constraint is gone
PRINT '';
PRINT '=== TEST INSERT AFTER DISABLING TRIGGER ===';
BEGIN TRANSACTION;

INSERT INTO NonConformanceReports (
    NcrNumber, Title, Description, Category, Severity, Status, Source,
    ReportedBy, ReportedDate, TenantId, CreatedBy, CreatedDate
) VALUES (
    'TEST#9999', 'Test Insert After Fix', 'Testing if constraint is removed', 'Other', 'Minor', 'Open', 'Internal',
    1, GETUTCDATE(), 1, 1, GETUTCDATE()
);

SELECT 'After INSERT - NcrNumber should be TEST#9999:' as Test,
       NcrNumber, Title, NcrId
FROM NonConformanceReports
WHERE Title = 'Test Insert After Fix';

-- Clean up test data
DELETE FROM NonConformanceReports WHERE Title = 'Test Insert After Fix';
COMMIT TRANSACTION;

-- STEP 6: If test shows NCR#1000 again, the trigger is still active
-- Find the exact trigger by examining the definition
PRINT '';
PRINT '=== IF TRIGGER STILL ACTIVE, DROP IT ===';
-- Replace 'YourTriggerName' with the actual trigger name from Step 1
-- DROP TRIGGER [YourTriggerName] ON NonConformanceReports;

-- STEP 7: Alternative - Check if there's a DEFAULT constraint we missed
PRINT '';
PRINT '=== CHECKING FOR HIDDEN DEFAULT CONSTRAINTS ===';
SELECT
    dc.name,
    dc.definition,
    t.name AS TableName
FROM sys.default_constraints dc
JOIN sys.tables t ON dc.parent_object_id = t.object_id
JOIN sys.columns c ON dc.parent_column_id = c.column_id
WHERE t.name = 'NonConformanceReports'
AND c.name = 'NcrNumber';

-- STEP 8: If found, drop the default constraint
PRINT '';
PRINT '=== DROP DEFAULT CONSTRAINT (if found) ===';
-- ALTER TABLE NonConformanceReports DROP CONSTRAINT [YourDefaultConstraintName];

PRINT '';
PRINT '=== FINAL VERIFICATION ===';
PRINT 'After removing the trigger/constraint, run this test:';
PRINT 'INSERT INTO NonConformanceReports (NcrNumber, Title, ...) VALUES (''NCR#1234'', ''Test'', ...)';
PRINT 'Then SELECT NcrNumber FROM NonConformanceReports WHERE Title = ''Test''';
PRINT 'It should show NCR#1234, not NCR#1000';



















