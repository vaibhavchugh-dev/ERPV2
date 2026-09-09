using Microsoft.EntityFrameworkCore;
using CimmpleAPI.Data;

namespace CimmpleAPI.Services
{
    /// <summary>
    /// Ensures Accounting gap tables/columns exist for DBs that have not run the matching migration yet.
    /// </summary>
    public static class AccountingGapSchemaService
    {
        public static async Task EnsureAsync(CimmpleDbContext context)
        {
            await context.Database.ExecuteSqlRawAsync(@"
IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = N'CimmpleFlow')
BEGIN
    EXEC('CREATE SCHEMA CimmpleFlow');
END

IF OBJECT_ID(N'CimmpleFlow.PaymentTerm', N'U') IS NULL
BEGIN
    CREATE TABLE CimmpleFlow.PaymentTerm (
        [Id] int IDENTITY(1,1) NOT NULL,
        [TenantId] int NOT NULL,
        [Name] nvarchar(100) NOT NULL,
        [Days] int NOT NULL,
        [Description] nvarchar(500) NULL,
        [IsActive] bit NOT NULL CONSTRAINT [DF_PaymentTerm_IsActive] DEFAULT 1,
        [CreatedDate] datetime2 NULL,
        [UpdatedDate] datetime2 NULL,
        CONSTRAINT [PK_PaymentTerm] PRIMARY KEY ([Id])
    );
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_PaymentTerm_TenantId_Name' AND object_id = OBJECT_ID(N'CimmpleFlow.PaymentTerm'))
BEGIN
    CREATE UNIQUE INDEX [IX_PaymentTerm_TenantId_Name]
        ON CimmpleFlow.PaymentTerm ([TenantId], [Name]) WHERE [IsActive] = 1;
END

IF OBJECT_ID(N'CimmpleFlow.ApApprovalLimit', N'U') IS NULL
BEGIN
    CREATE TABLE CimmpleFlow.ApApprovalLimit (
        [Id] int IDENTITY(1,1) NOT NULL,
        [TenantId] int NOT NULL,
        [RoleId] int NOT NULL,
        [LimitAmount] decimal(18,2) NOT NULL,
        [RequiresDualApproval] bit NOT NULL CONSTRAINT [DF_ApApprovalLimit_RequiresDualApproval] DEFAULT 0,
        [IsActive] bit NOT NULL CONSTRAINT [DF_ApApprovalLimit_IsActive] DEFAULT 1,
        [CreatedDate] datetime2 NULL,
        [UpdatedDate] datetime2 NULL,
        CONSTRAINT [PK_ApApprovalLimit] PRIMARY KEY ([Id])
    );
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_ApApprovalLimit_TenantId_RoleId' AND object_id = OBJECT_ID(N'CimmpleFlow.ApApprovalLimit'))
BEGIN
    CREATE UNIQUE INDEX [IX_ApApprovalLimit_TenantId_RoleId]
        ON CimmpleFlow.ApApprovalLimit ([TenantId], [RoleId]) WHERE [IsActive] = 1;
END

IF OBJECT_ID(N'CimmpleFlow.ArReminderLog', N'U') IS NULL
BEGIN
    CREATE TABLE CimmpleFlow.ArReminderLog (
        [Id] int IDENTITY(1,1) NOT NULL,
        [TenantId] int NOT NULL,
        [InvoiceId] int NOT NULL,
        [SentUtc] datetime2 NOT NULL,
        [ToEmail] nvarchar(255) NULL,
        [Status] nvarchar(32) NOT NULL,
        [Error] nvarchar(2000) NULL,
        [ActorUserId] int NULL,
        CONSTRAINT [PK_ArReminderLog] PRIMARY KEY ([Id])
    );
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_ArReminderLog_TenantId_InvoiceId' AND object_id = OBJECT_ID(N'CimmpleFlow.ArReminderLog'))
BEGIN
    CREATE INDEX [IX_ArReminderLog_TenantId_InvoiceId]
        ON CimmpleFlow.ArReminderLog ([TenantId], [InvoiceId]);
END

-- Prefer CimmpleFlow; also patch dbo when legacy tables live there
IF COL_LENGTH(N'CimmpleFlow.Transactions', N'IsReconciled') IS NULL AND OBJECT_ID(N'CimmpleFlow.Transactions', N'U') IS NOT NULL
BEGIN
    ALTER TABLE CimmpleFlow.Transactions ADD [IsReconciled] bit NOT NULL CONSTRAINT [DF_Transactions_IsReconciled] DEFAULT 0;
END
IF COL_LENGTH(N'dbo.Transactions', N'IsReconciled') IS NULL AND OBJECT_ID(N'dbo.Transactions', N'U') IS NOT NULL
BEGIN
    ALTER TABLE dbo.Transactions ADD [IsReconciled] bit NOT NULL CONSTRAINT [DF_dbo_Transactions_IsReconciled] DEFAULT 0;
END

IF COL_LENGTH(N'CimmpleFlow.Transactions', N'ReconciledUtc') IS NULL AND OBJECT_ID(N'CimmpleFlow.Transactions', N'U') IS NOT NULL
BEGIN
    ALTER TABLE CimmpleFlow.Transactions ADD [ReconciledUtc] datetime2 NULL;
END
IF COL_LENGTH(N'dbo.Transactions', N'ReconciledUtc') IS NULL AND OBJECT_ID(N'dbo.Transactions', N'U') IS NOT NULL
BEGIN
    ALTER TABLE dbo.Transactions ADD [ReconciledUtc] datetime2 NULL;
END

IF COL_LENGTH(N'CimmpleFlow.BankMaster', N'LastReconciledDate') IS NULL AND OBJECT_ID(N'CimmpleFlow.BankMaster', N'U') IS NOT NULL
BEGIN
    ALTER TABLE CimmpleFlow.BankMaster ADD [LastReconciledDate] datetime2 NULL;
END
IF COL_LENGTH(N'dbo.BankMaster', N'LastReconciledDate') IS NULL AND OBJECT_ID(N'dbo.BankMaster', N'U') IS NOT NULL
BEGIN
    ALTER TABLE dbo.BankMaster ADD [LastReconciledDate] datetime2 NULL;
END

IF COL_LENGTH(N'CimmpleFlow.InvoiceMaster', N'PaymentTermId') IS NULL AND OBJECT_ID(N'CimmpleFlow.InvoiceMaster', N'U') IS NOT NULL
BEGIN
    ALTER TABLE CimmpleFlow.InvoiceMaster ADD [PaymentTermId] int NULL;
END
IF COL_LENGTH(N'dbo.InvoiceMaster', N'PaymentTermId') IS NULL AND OBJECT_ID(N'dbo.InvoiceMaster', N'U') IS NOT NULL
BEGIN
    ALTER TABLE dbo.InvoiceMaster ADD [PaymentTermId] int NULL;
END

IF COL_LENGTH(N'CimmpleFlow.VendorInvoiceMaster', N'PaymentTermId') IS NULL AND OBJECT_ID(N'CimmpleFlow.VendorInvoiceMaster', N'U') IS NOT NULL
BEGIN
    ALTER TABLE CimmpleFlow.VendorInvoiceMaster ADD [PaymentTermId] int NULL;
END
IF COL_LENGTH(N'dbo.VendorInvoiceMaster', N'PaymentTermId') IS NULL AND OBJECT_ID(N'dbo.VendorInvoiceMaster', N'U') IS NOT NULL
BEGIN
    ALTER TABLE dbo.VendorInvoiceMaster ADD [PaymentTermId] int NULL;
END

IF COL_LENGTH(N'CimmpleFlow.AccountingDefaults', N'GstEnabled') IS NULL AND OBJECT_ID(N'CimmpleFlow.AccountingDefaults', N'U') IS NOT NULL
BEGIN
    ALTER TABLE CimmpleFlow.AccountingDefaults ADD [GstEnabled] bit NOT NULL CONSTRAINT [DF_AccountingDefaults_GstEnabled] DEFAULT 0;
END
IF COL_LENGTH(N'dbo.AccountingDefaults', N'GstEnabled') IS NULL AND OBJECT_ID(N'dbo.AccountingDefaults', N'U') IS NOT NULL
BEGIN
    ALTER TABLE dbo.AccountingDefaults ADD [GstEnabled] bit NOT NULL CONSTRAINT [DF_dbo_AccountingDefaults_GstEnabled] DEFAULT 0;
END

IF COL_LENGTH(N'CimmpleFlow.AccountingDefaults', N'TaxRegistrationNumber') IS NULL AND OBJECT_ID(N'CimmpleFlow.AccountingDefaults', N'U') IS NOT NULL
BEGIN
    ALTER TABLE CimmpleFlow.AccountingDefaults ADD [TaxRegistrationNumber] nvarchar(50) NULL;
END
IF COL_LENGTH(N'dbo.AccountingDefaults', N'TaxRegistrationNumber') IS NULL AND OBJECT_ID(N'dbo.AccountingDefaults', N'U') IS NOT NULL
BEGIN
    ALTER TABLE dbo.AccountingDefaults ADD [TaxRegistrationNumber] nvarchar(50) NULL;
END
");
        }
    }
}
