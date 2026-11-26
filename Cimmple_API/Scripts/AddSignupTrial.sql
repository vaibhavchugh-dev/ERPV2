/*
  Self-service trial signup.
  The API runs the same statements at startup (Services/TenantSchemaService.cs and
  Services/Tenancy/SignupSchemaService.cs); this script is for DBAs who prefer to apply schema
  changes ahead of a deployment. Safe to run repeatedly.

  Requires CimmpleFlow.Tenant (see AddTenantRegistry.sql).
*/

IF COL_LENGTH(N'CimmpleFlow.Tenant', N'TrialEndsUtc') IS NULL
    ALTER TABLE CimmpleFlow.Tenant ADD [TrialEndsUtc] datetime2 NULL;
GO

IF OBJECT_ID(N'CimmpleFlow.SignupRequest', N'U') IS NULL
BEGIN
    CREATE TABLE CimmpleFlow.SignupRequest (
        [Id] int IDENTITY(1,1) NOT NULL,
        [FirstName] nvarchar(100) NOT NULL,
        [LastName] nvarchar(100) NOT NULL,
        [CompanyName] nvarchar(200) NOT NULL,
        [Email] nvarchar(200) NOT NULL,
        [IpAddress] nvarchar(45) NULL,
        [Status] nvarchar(32) NOT NULL,
        [Attempts] int NOT NULL CONSTRAINT [DF_SignupRequest_Attempts] DEFAULT 0,
        [TenantId] int NULL,
        [LastError] nvarchar(2000) NULL,
        [CreatedUtc] datetime2 NOT NULL,
        [NextAttemptUtc] datetime2 NULL,
        [LockedUntilUtc] datetime2 NULL,
        [CompletedUtc] datetime2 NULL,
        CONSTRAINT [PK_SignupRequest] PRIMARY KEY ([Id])
    );
    CREATE INDEX [IX_SignupRequest_Status_NextAttemptUtc] ON CimmpleFlow.SignupRequest ([Status], [NextAttemptUtc]);
    CREATE INDEX [IX_SignupRequest_IpAddress_CreatedUtc] ON CimmpleFlow.SignupRequest ([IpAddress], [CreatedUtc]);
    CREATE INDEX [IX_SignupRequest_Email_CreatedUtc] ON CimmpleFlow.SignupRequest ([Email], [CreatedUtc]);
END
GO
