-- Removes everything created by SeedSampleJobTemplates.sql.
--
-- Individual templates can also be deleted from the Job Template Master page; this script
-- is just a bulk equivalent. Templates are matched on TemplateCode, so a template you
-- created yourself is only affected if you reused one of the sample codes below.
--
-- Category values added by the seed (part families, machines, customers) are removed only
-- when no remaining template still uses them, and never when they are marked IsSystem.

USE ERPv2Db
GO

-- Required for deletes against the filtered unique indexes on TemplateCode and CategoryValue.
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

IF OBJECT_ID('dbo.JobTemplateMaster', 'U') IS NULL
BEGIN
    RAISERROR('JobTemplateMaster does not exist. Nothing to remove.', 16, 1);
    RETURN;
END

-- Set to a tenant id to clear a single tenant, or leave NULL to clear every tenant.
DECLARE @TenantFilter int = NULL;

DECLARE @SampleCodes TABLE (Code nvarchar(50) PRIMARY KEY);
INSERT INTO @SampleCodes VALUES
    ('JT-1001'), ('JT-1002'), ('JT-1003'), ('JT-1004'), ('JT-1005');

DECLARE @SampleValues TABLE (TypeName nvarchar(100), ValueName nvarchar(150));
INSERT INTO @SampleValues VALUES
    ('Part Family', 'Bracket'),
    ('Part Family', 'Shaft'),
    ('Part Family', 'Enclosure'),
    ('Part Family', 'Pin'),
    ('Part Family', 'Frame'),
    ('Machine', 'Haas VF-2'),
    ('Machine', 'Mazak QT-200'),
    ('Machine', 'Amada Press Brake'),
    ('Machine', 'Studer S33'),
    ('Machine', 'Miller MIG Station'),
    ('Customer', 'ABC Aerospace'),
    ('Customer', 'Delta Motors'),
    ('Customer', 'Orion Industrial');

DECLARE @Doomed TABLE (Id int PRIMARY KEY);

INSERT INTO @Doomed (Id)
SELECT jt.Id
FROM dbo.JobTemplateMaster jt
INNER JOIN @SampleCodes c ON c.Code = jt.TemplateCode
WHERE @TenantFilter IS NULL OR jt.Tenantid = @TenantFilter;

-- Attachment rows are cleared here, but any uploaded files stay in wwwroot/uploads/jobtemplates.
-- Deleting through the UI removes the files as well.
DELETE FROM dbo.JobTemplateAttachment WHERE JobTemplateId IN (SELECT Id FROM @Doomed);
DELETE FROM dbo.JobTemplateCategory   WHERE JobTemplateId IN (SELECT Id FROM @Doomed);
DELETE FROM dbo.JobTemplateOperation  WHERE JobTemplateId IN (SELECT Id FROM @Doomed);
DELETE FROM dbo.JobTemplateMaster     WHERE Id IN (SELECT Id FROM @Doomed);

DELETE cv
FROM dbo.CategoryValue cv
INNER JOIN dbo.CategoryType ct ON ct.Id = cv.CategoryTypeId
INNER JOIN @SampleValues sv ON sv.TypeName = ct.Name AND sv.ValueName = cv.Name
WHERE cv.IsSystem = 0
  AND (@TenantFilter IS NULL OR cv.Tenantid = @TenantFilter)
  AND NOT EXISTS (
      SELECT 1 FROM dbo.JobTemplateCategory jc WHERE jc.CategoryValueId = cv.Id
  );

SELECT (SELECT COUNT(*) FROM @Doomed) AS TemplatesRemoved;
GO
