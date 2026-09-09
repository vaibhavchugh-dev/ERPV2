/*
  Accounting integrity probes
  ---------------------------
  Run against CimmpleERPDB (schema CimmpleFlow / cimmpleflow) after smoke or manual testing.

  sqlcmd example:
    sqlcmd -S <server> -d CimmpleERPDB -U <user> -P <pwd> -C -v TenantId=1 -i scripts/accounting/accounting-integrity-probes.sql

  Or set @TenantId below and execute in SSMS.

  Interpretation:
    - Each section prints rows that FAIL the check (empty = good), except "Summary snapshot".
*/

DECLARE @TenantId INT = $(TenantId); -- sqlcmd -v TenantId=1 ; or replace with literal e.g. 1
-- DECLARE @TenantId INT = 1;

SET NOCOUNT ON;

PRINT '==== 0) Schema presence ====';
SELECT
    CASE WHEN OBJECT_ID(N'CimmpleFlow.PaymentTerm', N'U') IS NULL THEN 'MISSING' ELSE 'OK' END AS PaymentTerm,
    CASE WHEN OBJECT_ID(N'CimmpleFlow.ApApprovalLimit', N'U') IS NULL THEN 'MISSING' ELSE 'OK' END AS ApApprovalLimit,
    CASE WHEN OBJECT_ID(N'CimmpleFlow.ArReminderLog', N'U') IS NULL THEN 'MISSING' ELSE 'OK' END AS ArReminderLog,
    CASE WHEN COL_LENGTH(N'CimmpleFlow.Transactions', N'IsReconciled') IS NULL THEN 'MISSING' ELSE 'OK' END AS TxIsReconciled,
    CASE WHEN COL_LENGTH(N'CimmpleFlow.AccountingDefaults', N'GstEnabled') IS NULL THEN 'MISSING' ELSE 'OK' END AS GstEnabled;

PRINT '==== 1) Summary snapshot ====';
SELECT
    (SELECT COUNT(*) FROM CimmpleFlow.InvoiceMaster WHERE TenantId = @TenantId AND IsVoided = 0) AS ActiveCustomerInvoices,
    (SELECT COUNT(*) FROM CimmpleFlow.VendorInvoiceMaster WHERE TenantId = @TenantId AND voideddate IS NULL) AS ActiveVendorInvoices,
    (SELECT COUNT(*) FROM CimmpleFlow.JournalEntries WHERE TenantId = @TenantId) AS JournalEntries,
    (SELECT COUNT(*) FROM CimmpleFlow.Transactions WHERE TenantId = @TenantId AND TransactionType = N'Payment') AS PaymentTransactions,
    (SELECT COUNT(*) FROM CimmpleFlow.Transactions WHERE TenantId = @TenantId AND IsReconciled = 1) AS ReconciledTransactions,
    (SELECT COUNT(*) FROM CimmpleFlow.PaymentTerm WHERE TenantId = @TenantId AND IsActive = 1) AS ActivePaymentTerms,
    (SELECT COUNT(*) FROM CimmpleFlow.ApApprovalLimit WHERE TenantId = @TenantId AND IsActive = 1) AS ActiveApprovalLimits,
    (SELECT COUNT(*) FROM CimmpleFlow.ArReminderLog WHERE TenantId = @TenantId) AS ReminderLogs,
    (SELECT COUNT(*) FROM CimmpleFlow.GlAccountingPeriodLocks WHERE TenantId = @TenantId) AS ClosedPeriods;

PRINT '==== 2) FAIL: unbalanced journal entries (From debit != To credit) ====';
;WITH FromSum AS (
    SELECT JournalEntryId, SUM(Amount) AS DebitTotal
    FROM CimmpleFlow.JournalEntryFrom
    GROUP BY JournalEntryId
),
ToSum AS (
    SELECT JournalEntryId, SUM(Amount) AS CreditTotal
    FROM CimmpleFlow.JournalEntryTo
    GROUP BY JournalEntryId
)
SELECT je.Id, je.ReferenceNumber, je.EntryDate, je.AccountingPeriod,
       ISNULL(f.DebitTotal, 0) AS DebitTotal,
       ISNULL(t.CreditTotal, 0) AS CreditTotal,
       ISNULL(f.DebitTotal, 0) - ISNULL(t.CreditTotal, 0) AS Diff
FROM CimmpleFlow.JournalEntries je
LEFT JOIN FromSum f ON f.JournalEntryId = je.Id
LEFT JOIN ToSum t ON t.JournalEntryId = je.Id
WHERE je.TenantId = @TenantId
  AND ABS(ISNULL(f.DebitTotal, 0) - ISNULL(t.CreditTotal, 0)) > 0.009;

PRINT '==== 3) FAIL: customer invoices with PaidAmount > TotalAmount ====';
SELECT Id, PrefixInvoiceNo, InvoiceNo, TotalAmount, PaidAmount, PaymentDate, IsVoided
FROM CimmpleFlow.InvoiceMaster
WHERE TenantId = @TenantId
  AND PaidAmount > TotalAmount + 0.009;

PRINT '==== 4) FAIL: vendor invoices with PaidAmount > TotalAmount ====';
SELECT Id, prefixinvoiceno, InvoiceNo, TotalAmount, PaidAmount, isPaid, Paydate, voideddate
FROM CimmpleFlow.VendorInvoiceMaster
WHERE TenantId = @TenantId
  AND PaidAmount > TotalAmount + 0.009;

PRINT '==== 5) FAIL: Payment bank txs missing BankId ====';
SELECT TransactionID, TransactionType, Amount, TransactionDate, invoiceNo, Description, BankId, isCustomer
FROM CimmpleFlow.Transactions
WHERE TenantId = @TenantId
  AND TransactionType = N'Payment'
  AND (BankId IS NULL OR BankId <= 0);

PRINT '==== 6) FAIL: reconciled txs without ReconciledUtc ====';
SELECT TransactionID, BankId, Amount, TransactionDate, IsReconciled, ReconciledUtc
FROM CimmpleFlow.Transactions
WHERE TenantId = @TenantId
  AND IsReconciled = 1
  AND ReconciledUtc IS NULL;

PRINT '==== 7) Open AR / AP balances (informational) ====';
SELECT
    SUM(CASE WHEN PaidAmount < TotalAmount - 0.009 AND IsVoided = 0
             THEN TotalAmount - PaidAmount ELSE 0 END) AS OpenAR
FROM CimmpleFlow.InvoiceMaster
WHERE TenantId = @TenantId;

SELECT
    SUM(CASE WHEN PaidAmount < TotalAmount - 0.009 AND voideddate IS NULL
             THEN TotalAmount - PaidAmount ELSE 0 END) AS OpenAP
FROM CimmpleFlow.VendorInvoiceMaster
WHERE TenantId = @TenantId;

PRINT '==== 8) FAIL: duplicate active payment term names ====';
SELECT Name, COUNT(*) AS Cnt
FROM CimmpleFlow.PaymentTerm
WHERE TenantId = @TenantId AND IsActive = 1
GROUP BY Name
HAVING COUNT(*) > 1;

PRINT '==== 9) FAIL: duplicate active approval limits per role ====';
SELECT RoleId, COUNT(*) AS Cnt
FROM CimmpleFlow.ApApprovalLimit
WHERE TenantId = @TenantId AND IsActive = 1
GROUP BY RoleId
HAVING COUNT(*) > 1;

PRINT '==== 10) FAIL: ArReminderLog marked Sent without ToEmail ====';
SELECT Id, InvoiceId, SentUtc, ToEmail, Status, Error
FROM CimmpleFlow.ArReminderLog
WHERE TenantId = @TenantId
  AND Status = N'Sent'
  AND (ToEmail IS NULL OR LTRIM(RTRIM(ToEmail)) = N'');

PRINT '==== 11) Journals in closed periods that were posted AFTER close (informational) ====';
SELECT je.Id, je.ReferenceNumber, je.AccountingPeriod, je.EntryDate, lock.ClosedUtc
FROM CimmpleFlow.JournalEntries je
INNER JOIN CimmpleFlow.GlAccountingPeriodLocks lock
    ON lock.TenantId = je.TenantId AND lock.PeriodKey = je.AccountingPeriod
WHERE je.TenantId = @TenantId
  AND je.EntryDate > lock.ClosedUtc; -- may be timezone noisy; review manually

PRINT '==== 12) Banks with reconciled txs but null LastReconciledDate (soft fail) ====';
SELECT b.Id, b.NickName, b.BankName, b.LastReconciledDate,
       COUNT(t.TransactionID) AS ReconciledCount
FROM CimmpleFlow.BankMaster b
INNER JOIN CimmpleFlow.Transactions t
    ON t.BankId = b.Id AND t.TenantId = b.TenantId AND t.IsReconciled = 1
WHERE b.TenantId = @TenantId
  AND b.LastReconciledDate IS NULL
GROUP BY b.Id, b.NickName, b.BankName, b.LastReconciledDate;

PRINT '==== Done ====';
