-- Job Template Master + generic category system
-- (run if the EF migration 20260731085225_AddJobTemplateMaster has not been applied yet)
USE ERPv2Db
GO

-- =============================================
-- CATEGORY TYPE / CATEGORY VALUE
-- Generic classification tables, not specific to job templates
-- =============================================

IF OBJECT_ID('dbo.CategoryType', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.CategoryType
    (
        Id              int IDENTITY(1,1) NOT NULL CONSTRAINT PK_CategoryType PRIMARY KEY,
        Tenantid        int NOT NULL,
        Code            nvarchar(50) NULL,
        Name            nvarchar(100) NULL,
        Description     nvarchar(500) NULL,
        DisplayOrder    int NOT NULL CONSTRAINT DF_CategoryType_DisplayOrder DEFAULT 0,
        AllowUserValues bit NOT NULL CONSTRAINT DF_CategoryType_AllowUserValues DEFAULT 1,
        IsSystem        bit NOT NULL CONSTRAINT DF_CategoryType_IsSystem DEFAULT 0,
        IsActive        bit NOT NULL CONSTRAINT DF_CategoryType_IsActive DEFAULT 1
    );

    CREATE UNIQUE INDEX IX_CategoryType_Tenantid_Name
        ON dbo.CategoryType (Tenantid, Name) WHERE Name IS NOT NULL;
END
GO

IF OBJECT_ID('dbo.CategoryValue', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.CategoryValue
    (
        Id             int IDENTITY(1,1) NOT NULL CONSTRAINT PK_CategoryValue PRIMARY KEY,
        Tenantid       int NOT NULL,
        CategoryTypeId int NOT NULL,
        Code           nvarchar(50) NULL,
        Name           nvarchar(150) NULL,
        Description    nvarchar(500) NULL,
        DisplayOrder   int NOT NULL CONSTRAINT DF_CategoryValue_DisplayOrder DEFAULT 0,
        IsSystem       bit NOT NULL CONSTRAINT DF_CategoryValue_IsSystem DEFAULT 0,
        IsActive       bit NOT NULL CONSTRAINT DF_CategoryValue_IsActive DEFAULT 1,
        CONSTRAINT FK_CategoryValue_CategoryType_CategoryTypeId
            FOREIGN KEY (CategoryTypeId) REFERENCES dbo.CategoryType (Id) ON DELETE CASCADE
    );

    CREATE UNIQUE INDEX IX_CategoryValue_CategoryTypeId_Name
        ON dbo.CategoryValue (CategoryTypeId, Name) WHERE Name IS NOT NULL;
    CREATE INDEX IX_CategoryValue_Tenantid_CategoryTypeId
        ON dbo.CategoryValue (Tenantid, CategoryTypeId);
END
GO

-- =============================================
-- JOB TEMPLATE MASTER
-- =============================================

IF OBJECT_ID('dbo.JobTemplateMaster', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.JobTemplateMaster
    (
        Id                           int IDENTITY(1,1) NOT NULL CONSTRAINT PK_JobTemplateMaster PRIMARY KEY,
        Tenantid                     int NOT NULL,

        TemplateCode                 nvarchar(50) NULL,
        TemplateName                 nvarchar(200) NULL,
        [Description]                nvarchar(max) NULL,
        [Status]                     int NOT NULL CONSTRAINT DF_JobTemplateMaster_Status DEFAULT 1,
        Revision                     int NOT NULL CONSTRAINT DF_JobTemplateMaster_Revision DEFAULT 1,
        EffectiveFrom                datetime2 NULL,
        EffectiveTo                  datetime2 NULL,

        PrimaryProcessId             int NULL,
        WorkstationId                int NULL,
        EstimatedSetupTimeMinutes    decimal(18,2) NULL,
        EstimatedCycleTimeMinutes    decimal(18,2) NULL,
        EstimatedLabourTimeMinutes   decimal(18,2) NULL,
        EstimatedMachineTimeMinutes  decimal(18,2) NULL,

        DefaultMaterial              nvarchar(200) NULL,
        MaterialGrade                nvarchar(100) NULL,
        RawMaterialSize              nvarchar(100) NULL,
        MaterialNotes                nvarchar(max) NULL,

        Tool                         nvarchar(200) NULL,
        Fixture                      nvarchar(200) NULL,
        Workholding                  nvarchar(200) NULL,
        Gauge                        nvarchar(200) NULL,
        ToolingNotes                 nvarchar(max) NULL,

        InspectionType               nvarchar(100) NULL,
        FirstArticleRequired         bit NOT NULL CONSTRAINT DF_JobTemplateMaster_FirstArticleRequired DEFAULT 0,
        InProcessInspection          bit NOT NULL CONSTRAINT DF_JobTemplateMaster_InProcessInspection DEFAULT 0,
        FinalInspection              bit NOT NULL CONSTRAINT DF_JobTemplateMaster_FinalInspection DEFAULT 0,
        CmmRequired                  bit NOT NULL CONSTRAINT DF_JobTemplateMaster_CmmRequired DEFAULT 0,
        InspectionNotes              nvarchar(max) NULL,

        IsSystem                     bit NOT NULL CONSTRAINT DF_JobTemplateMaster_IsSystem DEFAULT 0,
        CreatedDate                  datetime2 NOT NULL CONSTRAINT DF_JobTemplateMaster_CreatedDate DEFAULT SYSDATETIME(),
        CreatedBy                    int NULL,
        ModifiedDate                 datetime2 NULL,
        ModifiedBy                   int NULL
    );

    CREATE UNIQUE INDEX IX_JobTemplateMaster_Tenantid_TemplateCode
        ON dbo.JobTemplateMaster (Tenantid, TemplateCode) WHERE TemplateCode IS NOT NULL;
    CREATE INDEX IX_JobTemplateMaster_Tenantid_TemplateName
        ON dbo.JobTemplateMaster (Tenantid, TemplateName);
    CREATE INDEX IX_JobTemplateMaster_Tenantid_Status
        ON dbo.JobTemplateMaster (Tenantid, [Status]);
END
GO

IF OBJECT_ID('dbo.JobTemplateOperation', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.JobTemplateOperation
    (
        Id                   int IDENTITY(1,1) NOT NULL CONSTRAINT PK_JobTemplateOperation PRIMARY KEY,
        JobTemplateId        int NOT NULL,
        Tenantid             int NOT NULL,
        SequenceNumber       int NOT NULL,
        ProcessId            int NULL,
        WorkstationId        int NULL,
        SetupTimeMinutes     decimal(18,2) NULL,
        CycleTimeMinutes     decimal(18,2) NULL,
        Instructions         nvarchar(max) NULL,
        IsMandatory          bit NOT NULL CONSTRAINT DF_JobTemplateOperation_IsMandatory DEFAULT 1,
        QualityCheckRequired bit NOT NULL CONSTRAINT DF_JobTemplateOperation_QualityCheckRequired DEFAULT 0,
        CONSTRAINT FK_JobTemplateOperation_JobTemplateMaster_JobTemplateId
            FOREIGN KEY (JobTemplateId) REFERENCES dbo.JobTemplateMaster (Id) ON DELETE CASCADE
    );

    CREATE UNIQUE INDEX IX_JobTemplateOperation_JobTemplateId_SequenceNumber
        ON dbo.JobTemplateOperation (JobTemplateId, SequenceNumber);
END
GO

IF OBJECT_ID('dbo.JobTemplateCategory', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.JobTemplateCategory
    (
        Id              int IDENTITY(1,1) NOT NULL CONSTRAINT PK_JobTemplateCategory PRIMARY KEY,
        JobTemplateId   int NOT NULL,
        CategoryValueId int NOT NULL,
        Tenantid        int NOT NULL,
        CONSTRAINT FK_JobTemplateCategory_JobTemplateMaster_JobTemplateId
            FOREIGN KEY (JobTemplateId) REFERENCES dbo.JobTemplateMaster (Id) ON DELETE CASCADE,
        CONSTRAINT FK_JobTemplateCategory_CategoryValue_CategoryValueId
            FOREIGN KEY (CategoryValueId) REFERENCES dbo.CategoryValue (Id)
    );

    CREATE UNIQUE INDEX IX_JobTemplateCategory_JobTemplateId_CategoryValueId
        ON dbo.JobTemplateCategory (JobTemplateId, CategoryValueId);
    CREATE INDEX IX_JobTemplateCategory_CategoryValueId
        ON dbo.JobTemplateCategory (CategoryValueId);
END
GO

IF OBJECT_ID('dbo.JobTemplateAttachment', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.JobTemplateAttachment
    (
        Id             int IDENTITY(1,1) NOT NULL CONSTRAINT PK_JobTemplateAttachment PRIMARY KEY,
        JobTemplateId  int NOT NULL,
        Tenantid       int NOT NULL,
        AttachmentType nvarchar(50) NULL,
        FileName       nvarchar(255) NULL,
        FileUrl        nvarchar(500) NULL,
        ContentType    nvarchar(100) NULL,
        FileSize       bigint NOT NULL CONSTRAINT DF_JobTemplateAttachment_FileSize DEFAULT 0,
        UploadedDate   datetime2 NOT NULL CONSTRAINT DF_JobTemplateAttachment_UploadedDate DEFAULT SYSDATETIME(),
        UploadedBy     int NULL,
        CONSTRAINT FK_JobTemplateAttachment_JobTemplateMaster_JobTemplateId
            FOREIGN KEY (JobTemplateId) REFERENCES dbo.JobTemplateMaster (Id) ON DELETE CASCADE
    );

    CREATE INDEX IX_JobTemplateAttachment_JobTemplateId
        ON dbo.JobTemplateAttachment (JobTemplateId);
END
GO

-- =============================================
-- Seed the starter category types for every tenant that already has master data.
-- Tenants created later get the same set from the "Load Default Types" action on
-- the Category Master page, which calls Category/EnsureDefaultCategoryTypes.
-- =============================================

DECLARE @DefaultTypes TABLE (Name nvarchar(100), Code nvarchar(50), DisplayOrder int);
INSERT INTO @DefaultTypes (Name, Code, DisplayOrder) VALUES
    ('Process',         'PROCESS',     1),
    ('Material',        'MATERIAL',    2),
    ('Part Family',     'PARTFAMILY',  3),
    ('Machine',         'MACHINE',     4),
    ('Customer',        'CUSTOMER',    5),
    ('Production Type', 'PRODTYPE',    6),
    ('Inspection',      'INSPECTION',  7),
    ('Complexity',      'COMPLEXITY',  8),
    ('Product Line',    'PRODUCTLINE', 9);

DECLARE @DefaultValues TABLE (TypeName nvarchar(100), Name nvarchar(150), DisplayOrder int);
INSERT INTO @DefaultValues (TypeName, Name, DisplayOrder) VALUES
    ('Process', 'Milling', 1), ('Process', 'Turning', 2), ('Process', 'Grinding', 3),
    ('Process', 'Drilling', 4), ('Process', 'Welding', 5), ('Process', 'Assembly', 6),
    ('Process', 'Finishing', 7),
    ('Material', 'Aluminium', 1), ('Material', 'Steel', 2), ('Material', 'Stainless Steel', 3),
    ('Material', 'Titanium', 4), ('Material', 'Brass', 5), ('Material', 'Plastic', 6),
    ('Production Type', 'Prototype', 1), ('Production Type', 'Batch Production', 2),
    ('Production Type', 'Mass Production', 3), ('Production Type', 'One-Off', 4),
    ('Inspection', 'First Article', 1), ('Inspection', 'In-Process', 2),
    ('Inspection', 'Final', 3), ('Inspection', 'CMM', 4),
    ('Complexity', 'Low', 1), ('Complexity', 'Medium', 2), ('Complexity', 'High', 3);

INSERT INTO dbo.CategoryType (Tenantid, Name, Code, DisplayOrder, AllowUserValues, IsSystem, IsActive)
SELECT t.Tenantid, d.Name, d.Code, d.DisplayOrder, 1, 1, 1
FROM (SELECT DISTINCT Tenantid FROM dbo.ProcessMaster) t
CROSS JOIN @DefaultTypes d
WHERE NOT EXISTS (
    SELECT 1 FROM dbo.CategoryType ct
    WHERE ct.Tenantid = t.Tenantid AND ct.Name = d.Name
);

INSERT INTO dbo.CategoryValue (Tenantid, CategoryTypeId, Name, DisplayOrder, IsSystem, IsActive)
SELECT ct.Tenantid, ct.Id, dv.Name, dv.DisplayOrder, 1, 1
FROM dbo.CategoryType ct
INNER JOIN @DefaultValues dv ON dv.TypeName = ct.Name
WHERE ct.IsSystem = 1
  AND NOT EXISTS (
    SELECT 1 FROM dbo.CategoryValue cv
    WHERE cv.CategoryTypeId = ct.Id AND cv.Name = dv.Name
);
GO

-- Mark the equivalent EF migration as applied so a later "dotnet ef database update"
-- does not try to re-create these tables
IF OBJECT_ID('dbo.__EFMigrationsHistory', 'U') IS NOT NULL
BEGIN
    IF NOT EXISTS (SELECT 1 FROM dbo.__EFMigrationsHistory WHERE MigrationId = '20260731085225_AddJobTemplateMaster')
        INSERT INTO dbo.__EFMigrationsHistory (MigrationId, ProductVersion)
        VALUES ('20260731085225_AddJobTemplateMaster', '7.0.0');
END
GO
