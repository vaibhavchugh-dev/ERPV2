/*
================================================================================
  Replay pack: Priority-1 schema scripts → CimmpleERPDB
  Safe to re-run (idempotent where possible).

  Run in SSMS (Query window). Do not paste into a tool that ignores GO batches.
  Database dropdown can be anything; script switches to CimmpleERPDB.
================================================================================
*/

SET NOCOUNT ON;

IF DB_ID(N'CimmpleERPDB') IS NULL
BEGIN
    RAISERROR(N'Database CimmpleERPDB was not found on this server. Aborting.', 16, 1);
    RETURN;
END

USE CimmpleERPDB;

PRINT N'=== Replay starting on database: ' + DB_NAME() + N' ===';
GO

/* --------------------------------------------------------------------------
   0) EmailDeliveryMode (Hosted vs Custom SMTP) — dbo + CimmpleFlow
   -------------------------------------------------------------------------- */
PRINT N'--- EmailDeliveryMode ---';
GO

IF OBJECT_ID(N'dbo.SystemSettings', N'U') IS NOT NULL
   AND COL_LENGTH(N'dbo.SystemSettings', N'EmailDeliveryMode') IS NULL
BEGIN
    ALTER TABLE dbo.SystemSettings ADD EmailDeliveryMode nvarchar(20) NULL;
    PRINT N'Added dbo.SystemSettings.EmailDeliveryMode';
END
GO

IF OBJECT_ID(N'dbo.SystemSettings', N'U') IS NOT NULL
   AND COL_LENGTH(N'dbo.SystemSettings', N'EmailDeliveryMode') IS NOT NULL
BEGIN
    UPDATE dbo.SystemSettings
    SET EmailDeliveryMode = N'Custom'
    WHERE EmailDeliveryMode IS NULL
      AND NULLIF(LTRIM(RTRIM(SmtpServer)), N'') IS NOT NULL;

    UPDATE dbo.SystemSettings
    SET EmailDeliveryMode = N'Hosted'
    WHERE EmailDeliveryMode IS NULL;

    PRINT N'Backfilled dbo.SystemSettings.EmailDeliveryMode';
END
GO

IF OBJECT_ID(N'CimmpleFlow.SystemSettings', N'U') IS NOT NULL
   AND COL_LENGTH(N'CimmpleFlow.SystemSettings', N'EmailDeliveryMode') IS NULL
BEGIN
    ALTER TABLE CimmpleFlow.SystemSettings ADD EmailDeliveryMode nvarchar(20) NULL;
    PRINT N'Added CimmpleFlow.SystemSettings.EmailDeliveryMode';
END
GO

IF OBJECT_ID(N'CimmpleFlow.SystemSettings', N'U') IS NOT NULL
   AND COL_LENGTH(N'CimmpleFlow.SystemSettings', N'EmailDeliveryMode') IS NOT NULL
BEGIN
    UPDATE CimmpleFlow.SystemSettings
    SET EmailDeliveryMode = N'Custom'
    WHERE EmailDeliveryMode IS NULL
      AND NULLIF(LTRIM(RTRIM(SmtpServer)), N'') IS NOT NULL;

    UPDATE CimmpleFlow.SystemSettings
    SET EmailDeliveryMode = N'Hosted'
    WHERE EmailDeliveryMode IS NULL;

    PRINT N'Backfilled CimmpleFlow.SystemSettings.EmailDeliveryMode';
END
GO

/* --------------------------------------------------------------------------
   1) Auth / multi-location columns (AddAuthAndLocationColumns.sql)
   -------------------------------------------------------------------------- */
PRINT N'--- Auth / location columns on UserDetails ---';
GO

IF OBJECT_ID(N'CimmpleFlow.UserDetails', N'U') IS NOT NULL
BEGIN
    IF COL_LENGTH(N'CimmpleFlow.UserDetails', N'DefaultLocationId') IS NULL
        ALTER TABLE CimmpleFlow.UserDetails ADD DefaultLocationId INT NULL;

    IF COL_LENGTH(N'CimmpleFlow.UserDetails', N'CanAccessAllLocations') IS NULL
        ALTER TABLE CimmpleFlow.UserDetails ADD CanAccessAllLocations BIT NOT NULL
            CONSTRAINT DF_UserDetails_CanAccessAllLocations DEFAULT (0);

    IF COL_LENGTH(N'CimmpleFlow.UserDetails', N'FailedLoginCount') IS NULL
        ALTER TABLE CimmpleFlow.UserDetails ADD FailedLoginCount INT NOT NULL
            CONSTRAINT DF_UserDetails_FailedLoginCount DEFAULT (0);

    IF COL_LENGTH(N'CimmpleFlow.UserDetails', N'LockoutEndUtc') IS NULL
        ALTER TABLE CimmpleFlow.UserDetails ADD LockoutEndUtc DATETIME2 NULL;

    PRINT N'UserDetails auth columns ensured';
END
ELSE
    PRINT N'SKIP: CimmpleFlow.UserDetails not found';
GO

IF OBJECT_ID(N'CimmpleFlow.UserRole', N'U') IS NOT NULL
BEGIN
    UPDATE CimmpleFlow.UserRole
    SET RoleTag = N'ADMIN'
    WHERE RoleName LIKE N'%Admin%'
      AND (RoleTag IS NULL OR RoleTag = N'');
END
GO

/* --------------------------------------------------------------------------
   2) UserPasswordHistory (dbo + CimmpleFlow — API prefers CimmpleFlow)
   -------------------------------------------------------------------------- */
PRINT N'--- UserPasswordHistory ---';
GO

IF OBJECT_ID(N'dbo.UserPasswordHistory', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.UserPasswordHistory (
        Id int IDENTITY(1,1) NOT NULL,
        UserId int NOT NULL,
        TenantId int NOT NULL,
        PasswordHash nvarchar(max) NOT NULL,
        PasswordSalt nvarchar(max) NOT NULL,
        CreatedDate datetime2 NOT NULL,
        CONSTRAINT PK_UserPasswordHistory PRIMARY KEY (Id)
    );
    CREATE INDEX IX_UserPasswordHistory_UserId_CreatedDate
        ON dbo.UserPasswordHistory (UserId, CreatedDate DESC);
    PRINT N'Created dbo.UserPasswordHistory';
END
GO

IF OBJECT_ID(N'CimmpleFlow.UserPasswordHistory', N'U') IS NULL
BEGIN
    CREATE TABLE CimmpleFlow.UserPasswordHistory (
        Id int IDENTITY(1,1) NOT NULL,
        UserId int NOT NULL,
        TenantId int NOT NULL,
        PasswordHash nvarchar(max) NOT NULL,
        PasswordSalt nvarchar(max) NOT NULL,
        CreatedDate datetime2 NOT NULL,
        CONSTRAINT PK_UserPasswordHistory_Flow PRIMARY KEY (Id)
    );
    CREATE INDEX IX_UserPasswordHistory_Flow_UserId_CreatedDate
        ON CimmpleFlow.UserPasswordHistory (UserId, CreatedDate DESC);
    PRINT N'Created CimmpleFlow.UserPasswordHistory';
END
GO

IF OBJECT_ID(N'dbo.UserPasswordHistory', N'U') IS NOT NULL
   AND OBJECT_ID(N'CimmpleFlow.UserPasswordHistory', N'U') IS NOT NULL
BEGIN
    INSERT INTO CimmpleFlow.UserPasswordHistory (UserId, TenantId, PasswordHash, PasswordSalt, CreatedDate)
    SELECT d.UserId, d.TenantId, d.PasswordHash, d.PasswordSalt, d.CreatedDate
    FROM dbo.UserPasswordHistory d
    WHERE NOT EXISTS (
        SELECT 1 FROM CimmpleFlow.UserPasswordHistory t
        WHERE t.UserId = d.UserId
          AND t.CreatedDate = d.CreatedDate
          AND t.PasswordHash = d.PasswordHash
    );
END
GO

/* --------------------------------------------------------------------------
   3) AccountingDefaults (+ freight columns) — Flow preferred, dbo fallback
   -------------------------------------------------------------------------- */
PRINT N'--- AccountingDefaults ---';
GO

DECLARE @acct nvarchar(256) =
    CASE
        WHEN OBJECT_ID(N'CimmpleFlow.AccountingDefaults', N'U') IS NOT NULL THEN N'CimmpleFlow.AccountingDefaults'
        WHEN OBJECT_ID(N'dbo.AccountingDefaults', N'U') IS NOT NULL THEN N'dbo.AccountingDefaults'
        ELSE NULL
    END;

IF @acct IS NULL
BEGIN
    CREATE TABLE CimmpleFlow.AccountingDefaults
    (
        Id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_AccountingDefaults PRIMARY KEY,
        TenantId INT NOT NULL,
        CompanyName NVARCHAR(200) NOT NULL CONSTRAINT DF_AccountingDefaults_CompanyName DEFAULT (N'Cimmple Corp'),
        FiscalYearStart NVARCHAR(10) NOT NULL CONSTRAINT DF_AccountingDefaults_FiscalYearStart DEFAULT (N'01-01'),
        DefaultCurrency NVARCHAR(10) NOT NULL CONSTRAINT DF_AccountingDefaults_DefaultCurrency DEFAULT (N'USD'),
        TaxRate DECIMAL(18,2) NOT NULL CONSTRAINT DF_AccountingDefaults_TaxRate DEFAULT (8.25),
        DefaultAccountsReceivableAccountId INT NULL,
        DefaultAccountsPayableAccountId INT NULL,
        DefaultRevenueAccountId INT NULL,
        DefaultExpenseAccountId INT NULL,
        DefaultInventoryAccountId INT NULL,
        DefaultSalesTaxPayableAccountId INT NULL,
        DefaultInputTaxAccountId INT NULL,
        DefaultFreightOutAccountId INT NULL,
        DefaultOtherChargeAccountId INT NULL,
        DefaultFreightInAccountId INT NULL,
        CreatedDate DATETIME2 NULL,
        UpdatedDate DATETIME2 NULL
    );
    CREATE UNIQUE INDEX IX_AccountingDefaults_TenantId ON CimmpleFlow.AccountingDefaults (TenantId);
    PRINT N'Created CimmpleFlow.AccountingDefaults';
END
ELSE
BEGIN
    DECLARE @sql nvarchar(max);

    IF COL_LENGTH(@acct, N'DefaultFreightOutAccountId') IS NULL
    BEGIN
        SET @sql = N'ALTER TABLE ' + @acct + N' ADD DefaultFreightOutAccountId INT NULL;';
        EXEC sp_executesql @sql;
    END
    IF COL_LENGTH(@acct, N'DefaultOtherChargeAccountId') IS NULL
    BEGIN
        SET @sql = N'ALTER TABLE ' + @acct + N' ADD DefaultOtherChargeAccountId INT NULL;';
        EXEC sp_executesql @sql;
    END
    IF COL_LENGTH(@acct, N'DefaultFreightInAccountId') IS NULL
    BEGIN
        SET @sql = N'ALTER TABLE ' + @acct + N' ADD DefaultFreightInAccountId INT NULL;';
        EXEC sp_executesql @sql;
    END
    PRINT N'Ensured freight columns on ' + @acct;
END
GO

-- Vendor COA expense mapping
IF OBJECT_ID(N'CimmpleFlow.VendorCOAMapping', N'U') IS NOT NULL
   AND COL_LENGTH(N'CimmpleFlow.VendorCOAMapping', N'expenseAccountId') IS NULL
    ALTER TABLE CimmpleFlow.VendorCOAMapping ADD expenseAccountId INT NULL;
ELSE IF OBJECT_ID(N'dbo.VendorCOAMapping', N'U') IS NOT NULL
   AND COL_LENGTH(N'dbo.VendorCOAMapping', N'expenseAccountId') IS NULL
    ALTER TABLE dbo.VendorCOAMapping ADD expenseAccountId INT NULL;
GO

-- Vendor invoice freight charge
IF OBJECT_ID(N'CimmpleFlow.VendorInvoiceMaster', N'U') IS NOT NULL
   AND COL_LENGTH(N'CimmpleFlow.VendorInvoiceMaster', N'FreightCharge') IS NULL
    ALTER TABLE CimmpleFlow.VendorInvoiceMaster ADD FreightCharge DECIMAL(18,2) NOT NULL
        CONSTRAINT DF_VendorInvoiceMaster_FreightCharge DEFAULT (0);
ELSE IF OBJECT_ID(N'dbo.VendorInvoiceMaster', N'U') IS NOT NULL
   AND COL_LENGTH(N'dbo.VendorInvoiceMaster', N'FreightCharge') IS NULL
    ALTER TABLE dbo.VendorInvoiceMaster ADD FreightCharge DECIMAL(18,2) NOT NULL
        CONSTRAINT DF_VendorInvoiceMaster_FreightCharge_dbo DEFAULT (0);
GO

/* --------------------------------------------------------------------------
   4) GL financial controls
   -------------------------------------------------------------------------- */
PRINT N'--- GL period locks / audit ---';
GO

IF OBJECT_ID(N'CimmpleFlow.JournalEntries', N'U') IS NOT NULL
BEGIN
    IF COL_LENGTH(N'CimmpleFlow.JournalEntries', N'ReversesJournalEntryId') IS NULL
        ALTER TABLE CimmpleFlow.JournalEntries ADD ReversesJournalEntryId INT NULL;
    IF COL_LENGTH(N'CimmpleFlow.JournalEntries', N'ReversedByJournalEntryId') IS NULL
        ALTER TABLE CimmpleFlow.JournalEntries ADD ReversedByJournalEntryId INT NULL;
END
GO

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
    PRINT N'Created GlAccountingPeriodLocks';
END
GO

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
    CREATE INDEX IX_GlAuditEvents_TenantId_OccurredUtc
        ON CimmpleFlow.GlAuditEvents (TenantId, OccurredUtc DESC);
    PRINT N'Created GlAuditEvents';
END
GO

/* --------------------------------------------------------------------------
   5) PaidAmount (partial payments) — prefer CimmpleFlow
   -------------------------------------------------------------------------- */
PRINT N'--- PaidAmount columns ---';
GO

DECLARE @inv nvarchar(256) =
    CASE
        WHEN OBJECT_ID(N'CimmpleFlow.InvoiceMaster', N'U') IS NOT NULL THEN N'CimmpleFlow.InvoiceMaster'
        WHEN OBJECT_ID(N'dbo.InvoiceMaster', N'U') IS NOT NULL THEN N'dbo.InvoiceMaster'
        ELSE NULL
    END;
DECLARE @vinv nvarchar(256) =
    CASE
        WHEN OBJECT_ID(N'CimmpleFlow.VendorInvoiceMaster', N'U') IS NOT NULL THEN N'CimmpleFlow.VendorInvoiceMaster'
        WHEN OBJECT_ID(N'dbo.VendorInvoiceMaster', N'U') IS NOT NULL THEN N'dbo.VendorInvoiceMaster'
        ELSE NULL
    END;
DECLARE @sql nvarchar(max);

IF @inv IS NOT NULL AND COL_LENGTH(@inv, N'PaidAmount') IS NULL
BEGIN
    SET @sql = N'ALTER TABLE ' + @inv + N' ADD PaidAmount decimal(18,2) NOT NULL CONSTRAINT DF_InvoiceMaster_PaidAmount DEFAULT (0);';
    EXEC sp_executesql @sql;
    PRINT N'Added PaidAmount to ' + @inv;
END

IF @inv IS NOT NULL AND COL_LENGTH(@inv, N'PaidAmount') IS NOT NULL
BEGIN
    SET @sql = N'
        UPDATE ' + @inv + N'
        SET PaidAmount = TotalAmount
        WHERE PaymentDate IS NOT NULL AND PaidAmount = 0;';
    EXEC sp_executesql @sql;
END

IF @vinv IS NOT NULL AND COL_LENGTH(@vinv, N'PaidAmount') IS NULL
BEGIN
    SET @sql = N'ALTER TABLE ' + @vinv + N' ADD PaidAmount decimal(18,2) NOT NULL CONSTRAINT DF_VendorInvoiceMaster_PaidAmount DEFAULT (0);';
    EXEC sp_executesql @sql;
    PRINT N'Added PaidAmount to ' + @vinv;
END

IF @vinv IS NOT NULL AND COL_LENGTH(@vinv, N'PaidAmount') IS NOT NULL
BEGIN
    SET @sql = N'
        UPDATE ' + @vinv + N'
        SET PaidAmount = TotalAmount
        WHERE (isPaid = 1 OR Paydate IS NOT NULL) AND PaidAmount = 0;';
    EXEC sp_executesql @sql;
END
GO

/* --------------------------------------------------------------------------
   6) DiscountType columns
   -------------------------------------------------------------------------- */
PRINT N'--- DiscountType columns ---';
GO

IF OBJECT_ID(N'CimmpleFlow.QuotationOrderDetails', N'U') IS NOT NULL
   AND COL_LENGTH(N'CimmpleFlow.QuotationOrderDetails', N'DiscountType') IS NULL
    ALTER TABLE CimmpleFlow.QuotationOrderDetails ADD DiscountType NVARCHAR(20) NULL;

IF OBJECT_ID(N'CimmpleFlow.CustomerOrderDetails', N'U') IS NOT NULL
   AND COL_LENGTH(N'CimmpleFlow.CustomerOrderDetails', N'DiscountType') IS NULL
    ALTER TABLE CimmpleFlow.CustomerOrderDetails ADD DiscountType NVARCHAR(20) NULL;

IF OBJECT_ID(N'CimmpleFlow.VendorQuotationsDetails', N'U') IS NOT NULL
   AND COL_LENGTH(N'CimmpleFlow.VendorQuotationsDetails', N'DiscountType') IS NULL
    ALTER TABLE CimmpleFlow.VendorQuotationsDetails ADD DiscountType NVARCHAR(20) NULL;

IF OBJECT_ID(N'CimmpleFlow.VendorOrderDetails', N'U') IS NOT NULL
   AND COL_LENGTH(N'CimmpleFlow.VendorOrderDetails', N'DiscountType') IS NULL
    ALTER TABLE CimmpleFlow.VendorOrderDetails ADD DiscountType NVARCHAR(20) NULL;

IF OBJECT_ID(N'CimmpleFlow.InvoiceDetail', N'U') IS NOT NULL
   AND COL_LENGTH(N'CimmpleFlow.InvoiceDetail', N'DiscountType') IS NULL
    ALTER TABLE CimmpleFlow.InvoiceDetail ADD DiscountType NVARCHAR(20) NULL;

PRINT N'DiscountType columns ensured (where tables exist)';
GO

/* --------------------------------------------------------------------------
   7) Shipment notes + invoice void
   -------------------------------------------------------------------------- */
PRINT N'--- Shipment Notes / Invoice IsVoided ---';
GO

DECLARE @shipping nvarchar(256) =
    CASE
        WHEN OBJECT_ID(N'CimmpleFlow.Shipping', N'U') IS NOT NULL THEN N'CimmpleFlow.Shipping'
        WHEN OBJECT_ID(N'dbo.Shipping', N'U') IS NOT NULL THEN N'dbo.Shipping'
        ELSE NULL
    END;
DECLARE @invoice nvarchar(256) =
    CASE
        WHEN OBJECT_ID(N'CimmpleFlow.InvoiceMaster', N'U') IS NOT NULL THEN N'CimmpleFlow.InvoiceMaster'
        WHEN OBJECT_ID(N'dbo.InvoiceMaster', N'U') IS NOT NULL THEN N'dbo.InvoiceMaster'
        ELSE NULL
    END;
DECLARE @sql nvarchar(max);

IF @shipping IS NOT NULL AND COL_LENGTH(@shipping, N'Notes') IS NULL
BEGIN
    SET @sql = N'ALTER TABLE ' + @shipping + N' ADD Notes nvarchar(max) NULL;';
    EXEC sp_executesql @sql;
    PRINT N'Added Notes to ' + @shipping;
END

IF @invoice IS NOT NULL AND COL_LENGTH(@invoice, N'IsVoided') IS NULL
BEGIN
    SET @sql = N'ALTER TABLE ' + @invoice + N' ADD IsVoided bit NOT NULL CONSTRAINT DF_InvoiceMaster_IsVoided DEFAULT (0);';
    EXEC sp_executesql @sql;
    PRINT N'Added IsVoided to ' + @invoice;
END

IF OBJECT_ID(N'CimmpleFlow.__EFMigrationsHistory', N'U') IS NOT NULL
AND NOT EXISTS (
    SELECT 1 FROM CimmpleFlow.__EFMigrationsHistory
    WHERE MigrationId = N'20260819120000_AddShipmentNotesAndInvoiceVoid'
)
    INSERT INTO CimmpleFlow.__EFMigrationsHistory (MigrationId, ProductVersion)
    VALUES (N'20260819120000_AddShipmentNotesAndInvoiceVoid', N'7.0.0');
GO

/* --------------------------------------------------------------------------
   8) Verification summary
   -------------------------------------------------------------------------- */
PRINT N'=== Verification ===';

SELECT DB_NAME() AS CurrentDatabase;

SELECT s.name AS SchemaName, t.name AS TableName
FROM sys.tables t
JOIN sys.schemas s ON t.schema_id = s.schema_id
WHERE t.name IN (
    N'SystemSettings', N'UserPasswordHistory', N'AccountingDefaults',
    N'GlAccountingPeriodLocks', N'GlAuditEvents'
)
ORDER BY 1, 2;

SELECT
    COL_LENGTH(N'CimmpleFlow.SystemSettings', N'EmailDeliveryMode') AS Flow_EmailDeliveryMode,
    COL_LENGTH(N'dbo.SystemSettings', N'EmailDeliveryMode') AS Dbo_EmailDeliveryMode,
    COL_LENGTH(N'CimmpleFlow.InvoiceMaster', N'PaidAmount') AS Flow_Inv_PaidAmount,
    COL_LENGTH(N'CimmpleFlow.VendorInvoiceMaster', N'PaidAmount') AS Flow_VInv_PaidAmount,
    COL_LENGTH(N'CimmpleFlow.InvoiceMaster', N'IsVoided') AS Flow_Inv_IsVoided,
    COL_LENGTH(N'CimmpleFlow.Shipping', N'Notes') AS Flow_Ship_Notes,
    COL_LENGTH(N'CimmpleFlow.QuotationOrderDetails', N'DiscountType') AS Flow_CQ_DiscountType,
    COL_LENGTH(N'CimmpleFlow.UserDetails', N'DefaultLocationId') AS Flow_User_DefaultLocationId;

PRINT N'=== Replay pack finished. Restart the API. ===';
GO
