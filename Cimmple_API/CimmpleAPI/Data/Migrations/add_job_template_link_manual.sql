-- Add JobTemplateId, JobTemplateCode and JobTemplateRevision columns to JobOrderMaster
-- Records which job template a job order's router was built from.
-- This script is safe to run multiple times (checks if columns exist first)

IF NOT EXISTS (
    SELECT 1 
    FROM sys.columns 
    WHERE object_id = OBJECT_ID('JobOrderMaster') 
    AND name = 'JobTemplateId'
)
BEGIN
    ALTER TABLE JobOrderMaster
    ADD JobTemplateId int NULL;
    
    PRINT 'Column JobTemplateId added successfully.';
END
ELSE
BEGIN
    PRINT 'Column JobTemplateId already exists.';
END
GO

IF NOT EXISTS (
    SELECT 1 
    FROM sys.columns 
    WHERE object_id = OBJECT_ID('JobOrderMaster') 
    AND name = 'JobTemplateCode'
)
BEGIN
    ALTER TABLE JobOrderMaster
    ADD JobTemplateCode nvarchar(50) NULL;
    
    PRINT 'Column JobTemplateCode added successfully.';
END
ELSE
BEGIN
    PRINT 'Column JobTemplateCode already exists.';
END
GO

IF NOT EXISTS (
    SELECT 1 
    FROM sys.columns 
    WHERE object_id = OBJECT_ID('JobOrderMaster') 
    AND name = 'JobTemplateRevision'
)
BEGIN
    ALTER TABLE JobOrderMaster
    ADD JobTemplateRevision int NULL;
    
    PRINT 'Column JobTemplateRevision added successfully.';
END
ELSE
BEGIN
    PRINT 'Column JobTemplateRevision already exists.';
END
GO

-- Record the EF migration so "dotnet ef database update" does not try to add these again.
IF OBJECT_ID('dbo.__EFMigrationsHistory', 'U') IS NOT NULL
BEGIN
    IF NOT EXISTS (SELECT 1 FROM dbo.__EFMigrationsHistory WHERE MigrationId = '20260801120000_AddJobTemplateLinkToJobOrderMaster')
        INSERT INTO dbo.__EFMigrationsHistory (MigrationId, ProductVersion)
        VALUES ('20260801120000_AddJobTemplateLinkToJobOrderMaster', '7.0.0');
END
GO
