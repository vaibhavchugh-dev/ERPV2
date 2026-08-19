-- GL period locks, audit trail, and journal reversal links (matches EF migration 20260418120000_AddGlFinancialControls)
IF COL_LENGTH('CimmpleFlow.JournalEntries', 'ReversesJournalEntryId') IS NULL
    ALTER TABLE CimmpleFlow.JournalEntries ADD ReversesJournalEntryId INT NULL;

IF COL_LENGTH('CimmpleFlow.JournalEntries', 'ReversedByJournalEntryId') IS NULL
    ALTER TABLE CimmpleFlow.JournalEntries ADD ReversedByJournalEntryId INT NULL;

IF OBJECT_ID(N'CimmpleFlow.GlAccountingPeriodLocks', N'U') IS NULL
BEGIN
    CREATE TABLE CimmpleFlow.GlAccountingPeriodLocks (
        Id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_GlAccountingPeriodLocks PRIMARY KEY,
        TenantId INT NOT NULL,
        PeriodKey NVARCHAR(6) NOT NULL,
        ClosedUtc DATETIME2 NOT NULL,
        ClosedByUserId INT NULL
    );
    CREATE UNIQUE INDEX IX_GlAccountingPeriodLocks_TenantId_PeriodKey
        ON CimmpleFlow.GlAccountingPeriodLocks (TenantId, PeriodKey);
END

IF OBJECT_ID(N'CimmpleFlow.GlAuditEvents', N'U') IS NULL
BEGIN
    CREATE TABLE CimmpleFlow.GlAuditEvents (
        Id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_GlAuditEvents PRIMARY KEY,
        TenantId INT NOT NULL,
        Action NVARCHAR(64) NOT NULL,
        OccurredUtc DATETIME2 NOT NULL,
        ActorUserId INT NULL,
        JournalEntryId INT NULL,
        RelatedJournalEntryId INT NULL,
        PeriodKey NVARCHAR(6) NULL,
        Notes NVARCHAR(2000) NULL
    );
    CREATE INDEX IX_GlAuditEvents_TenantId_OccurredUtc ON CimmpleFlow.GlAuditEvents (TenantId, OccurredUtc DESC);
END
