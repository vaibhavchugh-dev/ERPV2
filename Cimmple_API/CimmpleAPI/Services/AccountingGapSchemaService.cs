using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using CimmpleAPI.Data;
using Microsoft.EntityFrameworkCore;

namespace CimmpleAPI.Services
{
    /// <summary>
    /// One-time (per process) schema ensure for Accounting gap columns/tables.
    /// Avoids running a large DDL script on every bank/recon request.
    /// </summary>
    public static class AccountingGapSchemaService
    {
        private static readonly SemaphoreSlim Gate = new(1, 1);
        private static int _ensured; // 0 = not done, 1 = done

        public static async Task EnsureAsync(CimmpleDbContext context)
        {
            if (Volatile.Read(ref _ensured) == 1)
                return;

            await Gate.WaitAsync().ConfigureAwait(false);
            try
            {
                if (Volatile.Read(ref _ensured) == 1)
                    return;

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
").ConfigureAwait(false);

                Volatile.Write(ref _ensured, 1);
            }
            finally
            {
                Gate.Release();
            }
        }
    }

    /// <summary>
    /// Fills BankId on legacy payment rows. Batched + throttled so bank recon reads stay fast.
    /// </summary>
    public static class BankPaymentBackfillService
    {
        private static readonly ConcurrentDictionary<int, DateTime> LastRunUtc = new();
        private static readonly TimeSpan MinInterval = TimeSpan.FromMinutes(5);

        public static void RunIfNeeded(CimmpleDbContext context, int tenantId, bool force = false)
        {
            if (tenantId <= 0)
                return;

            var now = DateTime.UtcNow;
            if (!force &&
                LastRunUtc.TryGetValue(tenantId, out var last) &&
                now - last < MinInterval)
            {
                return;
            }

            // Claim the slot early so concurrent list/txn requests don't all backfill.
            LastRunUtc[tenantId] = now;

            var orphans = context.Transactions
                .Where(t => t.TenantId == tenantId &&
                            t.TransactionType != null &&
                            EF.Functions.Like(t.TransactionType, "%Payment%") &&
                            (t.BankId == null || t.BankId <= 0) &&
                            t.invoiceNo != null &&
                            t.invoiceNo != "")
                .Select(t => new { t.TransactionID, t.invoiceNo, t.isCustomer })
                .Take(500)
                .ToList();

            if (orphans.Count == 0)
                return;

            var customerNos = orphans
                .Where(o => o.isCustomer == 1)
                .Select(o => o.invoiceNo!.Trim())
                .Where(s => s.Length > 0)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();
            var vendorNos = orphans
                .Where(o => o.isCustomer != 1)
                .Select(o => o.invoiceNo!.Trim())
                .Where(s => s.Length > 0)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();

            var customerBankByNo = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
            if (customerNos.Count > 0)
            {
                var customerInvoiceIds = customerNos
                    .Select(s => int.TryParse(s, out var n) ? n : (int?)null)
                    .Where(n => n.HasValue)
                    .Select(n => n!.Value)
                    .Distinct()
                    .ToList();
                var customerRows = context.InvoiceMaster
                    .AsNoTracking()
                    .Where(im => im.TenantId == tenantId && im.Bankid != null && im.Bankid > 0 &&
                                 (customerNos.Contains(im.PrefixInvoiceNo!) ||
                                  customerInvoiceIds.Contains(im.InvoiceNo)))
                    .Select(im => new { im.PrefixInvoiceNo, im.InvoiceNo, im.Bankid })
                    .ToList();
                foreach (var row in customerRows)
                {
                    var bankId = row.Bankid!.Value;
                    if (!string.IsNullOrWhiteSpace(row.PrefixInvoiceNo))
                        customerBankByNo.TryAdd(row.PrefixInvoiceNo.Trim(), bankId);
                    customerBankByNo.TryAdd(row.InvoiceNo.ToString(), bankId);
                }
            }

            var vendorBankByNo = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
            if (vendorNos.Count > 0)
            {
                var vendorRows = context.VendorInvoiceMaster
                    .AsNoTracking()
                    .Where(vim => vim.TenantId == tenantId && vim.Bankid != null && vim.Bankid > 0 &&
                                  (vendorNos.Contains(vim.prefixinvoiceno!) ||
                                   vendorNos.Contains(vim.InvoiceNo!)))
                    .Select(vim => new { vim.prefixinvoiceno, vim.InvoiceNo, vim.Bankid })
                    .ToList();
                foreach (var row in vendorRows)
                {
                    var bankId = row.Bankid!.Value;
                    if (!string.IsNullOrWhiteSpace(row.prefixinvoiceno))
                        vendorBankByNo.TryAdd(row.prefixinvoiceno.Trim(), bankId);
                    if (!string.IsNullOrWhiteSpace(row.InvoiceNo))
                        vendorBankByNo.TryAdd(row.InvoiceNo.Trim(), bankId);
                }
            }

            var updates = new List<(int id, int bankId)>();
            foreach (var orphan in orphans)
            {
                var invoiceNo = orphan.invoiceNo!.Trim();
                int bankId = 0;
                if (orphan.isCustomer == 1)
                    customerBankByNo.TryGetValue(invoiceNo, out bankId);
                else
                    vendorBankByNo.TryGetValue(invoiceNo, out bankId);

                if (bankId > 0)
                    updates.Add((orphan.TransactionID, bankId));
            }

            if (updates.Count == 0)
                return;

            var ids = updates.Select(u => u.id).ToList();
            var txns = context.Transactions
                .Where(t => ids.Contains(t.TransactionID))
                .ToList();
            var bankById = updates.ToDictionary(u => u.id, u => u.bankId);
            foreach (var txn in txns)
            {
                if (bankById.TryGetValue(txn.TransactionID, out var bankId))
                    txn.BankId = bankId;
            }

            context.SaveChanges();
        }
    }
}
