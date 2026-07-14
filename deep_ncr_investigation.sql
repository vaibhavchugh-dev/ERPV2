-- DEEP INVESTIGATION: What is forcing NCR#1000?
-- When Step 1 shows no triggers, we need to dig deeper

USE [YourDatabaseName]; -- Replace with your actual database name
GO

PRINT '=== COMPREHENSIVE DATABASE OBJECT SEARCH ===';

-- Check for ALL types of objects that could affect NonConformanceReports
SELECT
    o.name AS ObjectName,
    o.type AS ObjectType,
    o.type_desc AS TypeDescription,
    CASE o.type
        WHEN 'TR' THEN 'Trigger'
        WHEN 'U' THEN 'Table'
        WHEN 'V' THEN 'View'
        WHEN 'P' THEN 'Procedure'
        WHEN 'FN' THEN 'Function'
        WHEN 'R' THEN 'Rule'
        WHEN 'D' THEN 'Default'
        WHEN 'C' THEN 'Check Constraint'
        ELSE 'Other'
    END AS ObjectTypeDescription
FROM sys.objects o
WHERE o.name LIKE '%NCR%' OR o.name LIKE '%NonConform%'
ORDER BY o.type, o.name;

PRINT '';
PRINT '=== SPECIFIC INSTEAD OF TRIGGERS ===';
SELECT
    t.name AS TriggerName,
    OBJECT_NAME(t.parent_id) AS TableName,
    t.is_instead_of_trigger,
    OBJECT_DEFINITION(t.object_id) AS TriggerDefinition
FROM sys.triggers t
WHERE t.is_instead_of_trigger = 1;

PRINT '';
PRINT '=== CHECK TABLE STRUCTURE FOR HIDDEN DEFAULTS ===';
EXEC sp_help 'NonConformanceReports';

PRINT '';
PRINT '=== DIRECT TEST: What happens during INSERT? ===';

-- Create a test table to capture what gets inserted
IF OBJECT_ID('tempdb..#NCR_Test') IS NOT NULL DROP TABLE #NCR_Test;
CREATE TABLE #NCR_Test (
    TestID INT IDENTITY(1,1),
    ActionType VARCHAR(50),
    NcrNumber_Value VARCHAR(100),
    InsertedAt DATETIME DEFAULT GETUTCDATE()
);

-- Enable change tracking on our test
BEGIN TRANSACTION;

-- Insert test data
INSERT INTO NonConformanceReports (
    NcrNumber, Title, Description, Category, Severity, Status, Source,
    ReportedBy, ReportedDate, TenantId, CreatedBy, CreatedDate
) VALUES (
    'NCR#9999', 'Deep Investigation Test', 'Testing what overrides NcrNumber', 'Other', 'Minor', 'Open', 'Internal',
    1, GETUTCDATE(), 1, 1, GETUTCDATE()
);

-- Capture what was actually stored
INSERT INTO #NCR_Test (ActionType, NcrNumber_Value)
SELECT 'AFTER_INSERT', NcrNumber
FROM NonConformanceReports
WHERE Title = 'Deep Investigation Test';

-- Show results
SELECT * FROM #NCR_Test;

-- Check what was stored in the actual table
SELECT 'Stored NcrNumber:' as Info, NcrNumber, Title, NcrId
FROM NonConformanceReports
WHERE Title = 'Deep Investigation Test';

-- Clean up
DELETE FROM NonConformanceReports WHERE Title = 'Deep Investigation Test';
COMMIT TRANSACTION;

DROP TABLE #NCR_Test;

PRINT '';
PRINT '=== CHECK FOR DATABASE-LEVEL TRIGGERS ===';
SELECT
    t.name AS TriggerName,
    t.type_desc AS TriggerType,
    OBJECT_DEFINITION(t.object_id) AS TriggerDefinition
FROM sys.triggers t
WHERE t.parent_id = 0; -- Database-level triggers

PRINT '';
PRINT '=== CHECK FOR POLICIES OR EXTENDED PROPERTIES ===';
SELECT
    ep.name AS PropertyName,
    ep.value AS PropertyValue,
    OBJECT_NAME(ep.major_id) AS ObjectName
FROM sys.extended_properties ep
WHERE OBJECT_NAME(ep.major_id) = 'NonConformanceReports'
OR ep.name LIKE '%NCR%'
OR ep.name LIKE '%NonConform%';

PRINT '';
PRINT '=== CHECK FOR ANY VIEWS THAT MIGHT BE INVOLVED ===';
SELECT
    v.name AS ViewName,
    OBJECT_DEFINITION(v.object_id) AS ViewDefinition
FROM sys.views v
WHERE OBJECT_DEFINITION(v.object_id) LIKE '%NonConformanceReports%'
OR v.name LIKE '%NCR%';

PRINT '';
PRINT '=== CHECK IF TABLE HAS CHANGE DATA CAPTURE ===';
SELECT
    OBJECT_NAME(source_object_id) AS TableName,
    capture_instance AS CaptureInstance,
    start_lsn, end_lsn
FROM cdc.change_tables
WHERE OBJECT_NAME(source_object_id) = 'NonConformanceReports';

PRINT '';
PRINT '=== CHECK FOR REPLICATION ARTICLES ===';
SELECT
    a.name AS ArticleName,
    p.name AS PublicationName,
    a.source_object AS SourceObject
FROM sysarticles a
JOIN syspublications p ON a.pubid = p.pubid
WHERE a.name LIKE '%NCR%' OR a.name LIKE '%NonConform%';

PRINT '';
PRINT '=== MOST LIKELY CAUSES (if all above are empty) ===';
PRINT '1. Custom INSERT trigger with different name pattern';
PRINT '2. Application-level override we missed';
PRINT '3. Database maintenance job or scheduled task';
PRINT '4. Linked server or distributed query affecting data';
PRINT '5. Some other application component modifying the data';
PRINT '';
PRINT '=== NEXT STEPS ===';
PRINT 'If all queries return empty, try:';
PRINT '1. Search the entire database for "NCR#1000" references';
PRINT '2. Check application logs during INSERT';
PRINT '3. Use SQL Server Profiler to trace INSERT operations';
PRINT '4. Check if there are any CLR assemblies or extended procedures';



















