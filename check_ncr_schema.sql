-- Check NonConformanceReports table schema and data
USE YourDatabaseName; -- Replace with your actual database name

PRINT '=== TABLE EXISTS CHECK ===';
IF EXISTS (SELECT * FROM sys.tables WHERE name = 'NonConformanceReports')
    PRINT '✓ NonConformanceReports table exists'
ELSE
    PRINT '✗ NonConformanceReports table does NOT exist'

PRINT '';
PRINT '=== MIGRATION HISTORY ===';
SELECT MigrationId, ProductVersion
FROM __EFMigrationsHistory
WHERE MigrationId LIKE '%NonConformanceReports%'
ORDER BY MigrationId;

PRINT '';
PRINT '=== TABLE COLUMNS ===';
SELECT
    COLUMN_NAME,
    DATA_TYPE,
    IS_NULLABLE,
    COLUMN_DEFAULT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'NonConformanceReports'
ORDER BY ORDINAL_POSITION;

PRINT '';
PRINT '=== SAMPLE DATA ===';
SELECT TOP 3
    NcrId,
    NcrNumber,
    Title,
    ReportedBy,
    ReportedDate
FROM NonConformanceReports
WHERE TenantId = 1
ORDER BY NcrId DESC;

PRINT '';
PRINT '=== TOTAL RECORDS ===';
SELECT COUNT(*) as TotalRecords FROM NonConformanceReports WHERE TenantId = 1;























