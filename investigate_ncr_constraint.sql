-- Comprehensive investigation of NCR numbering issue
-- Run these queries in order to find what's forcing NcrNumber to 'NCR#1000'

USE [YourDatabaseName]; -- Replace with your actual database name
GO

PRINT '=== STEP 1: Check for Default Constraints ===';
SELECT
    dc.name AS ConstraintName,
    dc.definition AS ConstraintDefinition,
    t.name AS TableName,
    c.name AS ColumnName,
    dc.is_system_named
FROM sys.default_constraints dc
JOIN sys.tables t ON dc.parent_object_id = t.object_id
JOIN sys.columns c ON dc.parent_object_id = c.object_id AND dc.parent_column_id = c.column_id
WHERE t.name = 'NonConformanceReports' AND c.name = 'NcrNumber';

PRINT '';
PRINT '=== STEP 2: Check for Check Constraints ===';
SELECT
    cc.name AS ConstraintName,
    cc.definition AS ConstraintDefinition,
    t.name AS TableName,
    c.name AS ColumnName
FROM sys.check_constraints cc
JOIN sys.tables t ON cc.parent_object_id = t.object_id
WHERE t.name = 'NonConformanceReports';

PRINT '';
PRINT '=== STEP 3: Check for Triggers ===';
SELECT
    t.name AS TriggerName,
    OBJECT_NAME(t.parent_id) AS TableName,
    OBJECT_DEFINITION(t.object_id) AS TriggerDefinition,
    t.is_disabled,
    t.is_instead_of_trigger
FROM sys.triggers t
WHERE OBJECT_NAME(t.parent_id) = 'NonConformanceReports';

PRINT '';
PRINT '=== STEP 4: Check Column Definition (Computed Column?) ===';
SELECT
    c.name AS ColumnName,
    TYPE_NAME(c.system_type_id) AS DataType,
    c.max_length,
    c.is_nullable,
    c.is_computed,
    CASE WHEN c.is_computed = 1 THEN OBJECT_DEFINITION(c.object_id) ELSE NULL END AS ComputedDefinition,
    CASE WHEN c.default_object_id <> 0 THEN OBJECT_DEFINITION(c.default_object_id) ELSE NULL END AS DefaultDefinition
FROM sys.columns c
JOIN sys.tables t ON c.object_id = t.object_id
WHERE t.name = 'NonConformanceReports' AND c.name = 'NcrNumber';

PRINT '';
PRINT '=== STEP 5: Check Recent NCR Inserts (Last 5) ===';
SELECT TOP 5
    NcrId,
    NcrNumber,
    Title,
    CreatedDate
FROM NonConformanceReports
WHERE TenantId = 1
ORDER BY NcrId DESC;

PRINT '';
PRINT '=== STEP 6: Check if there are any Rules ===';
SELECT
    r.name AS RuleName,
    OBJECT_DEFINITION(r.object_id) AS RuleDefinition
FROM sys.objects r
WHERE r.type = 'R' AND r.name LIKE '%Ncr%';

PRINT '';
PRINT '=== STEP 7: Check for any INSTEAD OF triggers ===';
SELECT
    t.name AS TriggerName,
    OBJECT_NAME(t.parent_id) AS TableName,
    OBJECT_DEFINITION(t.object_id) AS TriggerDefinition
FROM sys.triggers t
WHERE t.is_instead_of_trigger = 1;

PRINT '';
PRINT '=== STEP 8: Check table DDL (structure) ===';
EXEC sp_help 'NonConformanceReports';

PRINT '';
PRINT '=== STEP 9: Test INSERT to see what happens ===';
-- This will show if there's a trigger or constraint that overrides the value
BEGIN TRANSACTION;
INSERT INTO NonConformanceReports (
    NcrNumber, Title, Description, Category, Severity, Status, Source,
    ReportedBy, ReportedDate, TenantId, CreatedBy, CreatedDate
) VALUES (
    'TEST#9999', 'Test Insert', 'Testing constraint behavior', 'Other', 'Minor', 'Open', 'Internal',
    1, GETUTCDATE(), 1, 1, GETUTCDATE()
);

SELECT 'After INSERT - NcrNumber should be TEST#9999 but might be overridden:' as Info,
       NcrNumber, Title
FROM NonConformanceReports
WHERE Title = 'Test Insert';

-- Clean up
DELETE FROM NonConformanceReports WHERE Title = 'Test Insert';
COMMIT TRANSACTION;

PRINT '';
PRINT '=== SUMMARY ===';
PRINT 'If Steps 1-4 show nothing, the issue might be:';
PRINT '1. Application code overriding the value';
PRINT '2. Database trigger that we missed';
PRINT '3. Some other database object (rule, computed column)';
PRINT '4. Replication or data import process';
PRINT '';
PRINT 'If Step 9 shows NcrNumber changed to NCR#1000, then there IS a trigger/constraint.';



















