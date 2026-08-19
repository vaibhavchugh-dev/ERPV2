-- CimmplePunch: face enrollment store (Flow users stay in CimmpleFlow.UserDetails).
-- Safe to re-run. Does not copy v1 punch history.

IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = N'CimmplePunch')
BEGIN
    EXEC(N'CREATE SCHEMA CimmplePunch');
END
GO

IF OBJECT_ID(N'CimmplePunch.EmployeeFace', N'U') IS NULL
BEGIN
    CREATE TABLE CimmplePunch.EmployeeFace (
        Id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_EmployeeFace PRIMARY KEY,
        TenantId INT NOT NULL,
        UserUniqueId INT NOT NULL,
        AzurePersonId NVARCHAR(255) NULL,
        AzurePersistedFaceId NVARCHAR(255) NULL,
        AzureFaceRegistered BIT NOT NULL CONSTRAINT DF_EmployeeFace_AzureFaceRegistered DEFAULT (0),
        AzureFaceLastSync DATETIME2 NULL,
        AwsPersonId NVARCHAR(255) NULL,
        AwsFaceRegistered BIT NOT NULL CONSTRAINT DF_EmployeeFace_AwsFaceRegistered DEFAULT (0),
        AwsFaceLastSync DATETIME2 NULL,
        FaceApprovalPending BIT NOT NULL CONSTRAINT DF_EmployeeFace_FaceApprovalPending DEFAULT (0),
        PendingImagePath NVARCHAR(500) NULL,
        CreatedUtc DATETIME2 NOT NULL CONSTRAINT DF_EmployeeFace_CreatedUtc DEFAULT (SYSUTCDATETIME()),
        UpdatedUtc DATETIME2 NULL
    );

    CREATE UNIQUE INDEX UX_EmployeeFace_Tenant_User
        ON CimmplePunch.EmployeeFace (TenantId, UserUniqueId);
END
GO
