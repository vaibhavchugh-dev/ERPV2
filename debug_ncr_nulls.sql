-- Debug script to find null values in NonConformanceReports table
-- Run this in SQL Server Management Studio

-- IMPORTANT: Make sure to set your database name below
USE [YourDatabaseName]; -- Replace with your actual database name

PRINT '=== NON-CONFORMANCE REPORTS NULL VALUES ANALYSIS ===';
PRINT '';

-- 1. Basic table info
SELECT COUNT(*) as TotalRecords FROM NonConformanceReports WHERE TenantId = 1;
PRINT '';

-- 2. Check for null values in critical required fields
PRINT '=== NULL VALUES IN REQUIRED FIELDS ===';
SELECT
    COUNT(*) as TotalRecords,
    SUM(CASE WHEN NcrNumber IS NULL THEN 1 ELSE 0 END) as NullNcrNumbers,
    SUM(CASE WHEN Title IS NULL THEN 1 ELSE 0 END) as NullTitles,
    SUM(CASE WHEN Category IS NULL THEN 1 ELSE 0 END) as NullCategories,
    SUM(CASE WHEN Severity IS NULL THEN 1 ELSE 0 END) as NullSeverities,
    SUM(CASE WHEN Status IS NULL THEN 1 ELSE 0 END) as NullStatuses,
    SUM(CASE WHEN Source IS NULL THEN 1 ELSE 0 END) as NullSources,
    SUM(CASE WHEN ReportedBy IS NULL OR ReportedBy = 0 THEN 1 ELSE 0 END) as NullReportedBy,
    SUM(CASE WHEN ReportedDate IS NULL THEN 1 ELSE 0 END) as NullReportedDates,
    SUM(CASE WHEN TenantId IS NULL OR TenantId = 0 THEN 1 ELSE 0 END) as NullTenantIds,
    SUM(CASE WHEN CreatedBy IS NULL OR CreatedBy = 0 THEN 1 ELSE 0 END) as NullCreatedBy,
    SUM(CASE WHEN CreatedDate IS NULL THEN 1 ELSE 0 END) as NullCreatedDates
FROM NonConformanceReports
WHERE TenantId = 1;
PRINT '';

-- 3. Show actual records with null values
PRINT '=== RECORDS WITH NULL VALUES ===';
SELECT TOP 10
    NcrId,
    CASE WHEN NcrNumber IS NULL THEN 'NULL' ELSE NcrNumber END as NcrNumber,
    CASE WHEN Title IS NULL THEN 'NULL' ELSE LEFT(Title, 30) END as Title,
    CASE WHEN Category IS NULL THEN 'NULL' ELSE Category END as Category,
    CASE WHEN Severity IS NULL THEN 'NULL' ELSE Severity END as Severity,
    CASE WHEN Status IS NULL THEN 'NULL' ELSE Status END as Status,
    CASE WHEN Source IS NULL THEN 'NULL' ELSE Source END as Source,
    CASE WHEN ReportedBy IS NULL THEN 'NULL' ELSE CAST(ReportedBy AS VARCHAR) END as ReportedBy,
    CASE WHEN ReportedDate IS NULL THEN 'NULL' ELSE CONVERT(VARCHAR, ReportedDate, 120) END as ReportedDate,
    CASE WHEN TenantId IS NULL THEN 'NULL' ELSE CAST(TenantId AS VARCHAR) END as TenantId
FROM NonConformanceReports
WHERE TenantId = 1
AND (
    NcrNumber IS NULL OR
    Title IS NULL OR
    Category IS NULL OR
    Severity IS NULL OR
    Status IS NULL OR
    Source IS NULL OR
    ReportedBy IS NULL OR ReportedBy = 0 OR
    ReportedDate IS NULL OR
    TenantId IS NULL OR TenantId = 0 OR
    CreatedBy IS NULL OR CreatedBy = 0 OR
    CreatedDate IS NULL
);
PRINT '';

-- 4. Check Photos column specifically
PRINT '=== PHOTOS COLUMN ANALYSIS ===';
SELECT
    COUNT(*) as TotalRecords,
    SUM(CASE WHEN Photos IS NULL THEN 1 ELSE 0 END) as NullPhotos,
    SUM(CASE WHEN Photos = '' THEN 1 ELSE 0 END) as EmptyPhotos,
    SUM(CASE WHEN LEN(ISNULL(Photos, '')) > 0 THEN 1 ELSE 0 END) as NonEmptyPhotos
FROM NonConformanceReports
WHERE TenantId = 1;

-- Show some sample Photos values
SELECT TOP 5
    NcrId,
    CASE WHEN Photos IS NULL THEN 'NULL' ELSE LEFT(Photos, 50) + '...' END as PhotosSample
FROM NonConformanceReports
WHERE TenantId = 1;
PRINT '';

-- 5. Check all columns for any null values
PRINT '=== ALL COLUMNS NULL CHECK ===';
SELECT
    'NcrId' as ColumnName, SUM(CASE WHEN NcrId IS NULL THEN 1 ELSE 0 END) as NullCount FROM NonConformanceReports WHERE TenantId = 1
UNION ALL
SELECT 'NcrNumber', SUM(CASE WHEN NcrNumber IS NULL THEN 1 ELSE 0 END) FROM NonConformanceReports WHERE TenantId = 1
UNION ALL
SELECT 'Title', SUM(CASE WHEN Title IS NULL THEN 1 ELSE 0 END) FROM NonConformanceReports WHERE TenantId = 1
UNION ALL
SELECT 'Description', SUM(CASE WHEN Description IS NULL THEN 1 ELSE 0 END) FROM NonConformanceReports WHERE TenantId = 1
UNION ALL
SELECT 'Category', SUM(CASE WHEN Category IS NULL THEN 1 ELSE 0 END) FROM NonConformanceReports WHERE TenantId = 1
UNION ALL
SELECT 'Severity', SUM(CASE WHEN Severity IS NULL THEN 1 ELSE 0 END) FROM NonConformanceReports WHERE TenantId = 1
UNION ALL
SELECT 'Status', SUM(CASE WHEN Status IS NULL THEN 1 ELSE 0 END) FROM NonConformanceReports WHERE TenantId = 1
UNION ALL
SELECT 'Source', SUM(CASE WHEN Source IS NULL THEN 1 ELSE 0 END) FROM NonConformanceReports WHERE TenantId = 1
UNION ALL
SELECT 'JobOrderId', SUM(CASE WHEN JobOrderId IS NULL THEN 1 ELSE 0 END) FROM NonConformanceReports WHERE TenantId = 1
UNION ALL
SELECT 'PartNo', SUM(CASE WHEN PartNo IS NULL THEN 1 ELSE 0 END) FROM NonConformanceReports WHERE TenantId = 1
UNION ALL
SELECT 'PartName', SUM(CASE WHEN PartName IS NULL THEN 1 ELSE 0 END) FROM NonConformanceReports WHERE TenantId = 1
UNION ALL
SELECT 'CustomerId', SUM(CASE WHEN CustomerId IS NULL THEN 1 ELSE 0 END) FROM NonConformanceReports WHERE TenantId = 1
UNION ALL
SELECT 'DefectLocation', SUM(CASE WHEN DefectLocation IS NULL THEN 1 ELSE 0 END) FROM NonConformanceReports WHERE TenantId = 1
UNION ALL
SELECT 'DefectQuantity', SUM(CASE WHEN DefectQuantity IS NULL THEN 1 ELSE 0 END) FROM NonConformanceReports WHERE TenantId = 1
UNION ALL
SELECT 'TotalQuantity', SUM(CASE WHEN TotalQuantity IS NULL THEN 1 ELSE 0 END) FROM NonConformanceReports WHERE TenantId = 1
UNION ALL
SELECT 'DefectDescription', SUM(CASE WHEN DefectDescription IS NULL THEN 1 ELSE 0 END) FROM NonConformanceReports WHERE TenantId = 1
UNION ALL
SELECT 'RootCause', SUM(CASE WHEN RootCause IS NULL THEN 1 ELSE 0 END) FROM NonConformanceReports WHERE TenantId = 1
UNION ALL
SELECT 'RootCauseCategory', SUM(CASE WHEN RootCauseCategory IS NULL THEN 1 ELSE 0 END) FROM NonConformanceReports WHERE TenantId = 1
UNION ALL
SELECT 'ImmediateAction', SUM(CASE WHEN ImmediateAction IS NULL THEN 1 ELSE 0 END) FROM NonConformanceReports WHERE TenantId = 1
UNION ALL
SELECT 'CorrectiveAction', SUM(CASE WHEN CorrectiveAction IS NULL THEN 1 ELSE 0 END) FROM NonConformanceReports WHERE TenantId = 1
UNION ALL
SELECT 'PreventiveAction', SUM(CASE WHEN PreventiveAction IS NULL THEN 1 ELSE 0 END) FROM NonConformanceReports WHERE TenantId = 1
UNION ALL
SELECT 'ReportedBy', SUM(CASE WHEN ReportedBy IS NULL THEN 1 ELSE 0 END) FROM NonConformanceReports WHERE TenantId = 1
UNION ALL
SELECT 'ReportedDate', SUM(CASE WHEN ReportedDate IS NULL THEN 1 ELSE 0 END) FROM NonConformanceReports WHERE TenantId = 1
UNION ALL
SELECT 'TenantId', SUM(CASE WHEN TenantId IS NULL THEN 1 ELSE 0 END) FROM NonConformanceReports WHERE TenantId = 1
UNION ALL
SELECT 'CreatedBy', SUM(CASE WHEN CreatedBy IS NULL THEN 1 ELSE 0 END) FROM NonConformanceReports WHERE TenantId = 1
UNION ALL
SELECT 'CreatedDate', SUM(CASE WHEN CreatedDate IS NULL THEN 1 ELSE 0 END) FROM NonConformanceReports WHERE TenantId = 1
ORDER BY NullCount DESC;
PRINT '';

PRINT '=== SUMMARY ===';
PRINT 'This script identifies which columns contain null values that might be causing the API errors.';
PRINT 'Look for columns with NullCount > 0 - these are the problematic fields.';
