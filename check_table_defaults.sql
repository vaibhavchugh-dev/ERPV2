-- Check for ANY default values or constraints on NonConformanceReports table
-- This is a comprehensive check for defaults, computed columns, etc.

USE [YourDatabaseName]; -- Replace with your actual database name
GO

PRINT '=== COMPREHENSIVE DEFAULT VALUE CHECK ===';

-- Check the actual table definition
EXEC sp_help 'NonConformanceReports';

PRINT '';
PRINT '=== COLUMN DEFAULTS FROM INFORMATION_SCHEMA ===';

SELECT
    COLUMN_NAME,
    COLUMN_DEFAULT,
    IS_NULLABLE,
    DATA_TYPE,
    CHARACTER_MAXIMUM_LENGTH
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'NonConformanceReports'
AND COLUMN_NAME = 'NcrNumber';

PRINT '';
PRINT '=== CHECK FOR ANY DEFAULT CONSTRAINTS ===';

SELECT
    dc.name AS ConstraintName,
    dc.definition AS ConstraintDefinition,
    c.name AS ColumnName,
    t.name AS TableName
FROM sys.default_constraints dc
JOIN sys.columns c ON dc.parent_column_id = c.column_id
JOIN sys.tables t ON dc.parent_object_id = t.object_id
WHERE t.name = 'NonConformanceReports';

PRINT '';
PRINT '=== CHECK FOR COMPUTED COLUMNS ===';

SELECT
    c.name AS ColumnName,
    CASE WHEN c.is_computed = 1 THEN 'YES' ELSE 'NO' END AS IsComputed,
    OBJECT_DEFINITION(c.object_id) AS ComputedDefinition
FROM sys.columns c
JOIN sys.tables t ON c.object_id = t.object_id
WHERE t.name = 'NonConformanceReports'
AND c.name = 'NcrNumber';

PRINT '';
PRINT '=== CHECK FOR RULES (old SQL Server feature) ===';

SELECT
    r.name AS RuleName,
    OBJECT_DEFINITION(r.object_id) AS RuleDefinition
FROM sys.objects r
WHERE r.type = 'R';

PRINT '';
PRINT '=== CHECK FOR ANY CHECK CONSTRAINTS ===';

SELECT
    cc.name AS ConstraintName,
    cc.definition AS ConstraintDefinition
FROM sys.check_constraints cc
WHERE OBJECT_NAME(cc.parent_object_id) = 'NonConformanceReports';

PRINT '';
PRINT '=== CHECK TABLE DDL (complete structure) ===';

-- Get the complete CREATE TABLE statement
DECLARE @sql NVARCHAR(MAX);
SELECT @sql = OBJECT_DEFINITION(OBJECT_ID('NonConformanceReports'));
PRINT 'Table DDL:';
PRINT @sql;

PRINT '';
PRINT '=== CHECK FOR ANY TRIGGERS (including disabled ones) ===';

SELECT
    t.name AS TriggerName,
    t.is_disabled,
    t.is_instead_of_trigger,
    OBJECT_NAME(t.parent_id) AS TableName,
    OBJECT_DEFINITION(t.object_id) AS TriggerDefinition
FROM sys.triggers t
WHERE OBJECT_NAME(t.parent_id) = 'NonConformanceReports';

PRINT '';
PRINT '=== TEST: INSERT AND CHECK IMMEDIATELY ===';

-- Test direct insert and immediate select
BEGIN TRANSACTION;

INSERT INTO NonConformanceReports (
    NcrNumber, Title, Description, Category, Severity, Status, Source,
    ReportedBy, ReportedDate, TenantId, CreatedBy, CreatedDate
) VALUES (
    'NCR#1234', 'Default Check Test', 'Testing for defaults', 'Other', 'Minor', 'Open', 'Internal',
    1, GETUTCDATE(), 1, 1, GETUTCDATE()
);

DECLARE @NewId INT = SCOPE_IDENTITY();

-- Check immediately after insert
SELECT
    'IMMEDIATE CHECK' as TestType,
    NcrId,
    NcrNumber,
    Title
FROM NonConformanceReports
WHERE NcrId = @NewId;

-- Clean up
DELETE FROM NonConformanceReports WHERE NcrId = @NewId;
COMMIT TRANSACTION;

PRINT '';
PRINT '=== SUMMARY ===';
PRINT 'If NcrNumber shows NCR#1234 above, then defaults are not the issue.';
PRINT 'The problem must be in the Entity Framework or application code.';
PRINT 'Look for EF model configurations, computed columns, or other EF features.';



















