# QA — Accounting (Payment Dashboard, AP, AR, Payments, Bank Reconciliation, Financial Reports, Journal Entries, GL, Periods, Setup)

| Module | Matrix section | Bug ID prefix | Tested | Confirmed Bugs | Potential Bugs | Manual Verification |
| --- | --- | --- | --- | --- | --- | --- |
| Accounting (Payment Dashboard, AP, AR, Payments, Bank Reconciliation, Financial Reports, Journal Entries, GL, Periods, Setup) | 6.1–6.8, 6.10, 6.11 | BUG-ACC | Yes | 18 | 5 | 11 |

Source of test cases: `QA_TEST_MATRIX.md`. Method: static trace of the actual implementation (React UI → service → Axios → .NET controller → service/repository → EF Core → SQL Server, and back). No application code, configuration or database is changed during QA. Findings that depend on deployed configuration, data or a real browser go under **Needs Manual Verification**.

Severity scale:
- **Critical**: security breach, data corruption, financial corruption, or a blocked core workflow.
- **High**: a major feature is broken or a significant security control is bypassed, with a workaround that is hard or unavailable.
- **Medium**: a feature works incorrectly in specific conditions, or a security control is weaker than configured.
- **Low**: cosmetic, minor UX, or an informational/hardening issue.

Payroll Journals (6.9) and the payroll rows of 6.4 are covered in `QA_Payroll.md` (BUG-PAY).

---

## Confirmed Bugs

### BUG-ACC-001 — Customer and vendor payments are period-locked by the invoice's period instead of the payment date
**Severity:** Critical. Payments can be posted into a closed accounting period, and open invoices from a closed month cannot be paid at all.
**Status:** Confirmed
**Test Area:** 6.4 Payments / 6.2 AP / 6.3 AR / Business logic (period lock)
**Description:** `RecordCustomerPayment` and `RecordVendorPayment` derive the lock key from `invoice.AccountingPeriod` and only fall back to the payment date when the invoice has no period. The payment journal entry and the `Transactions` row are dated on the payment date but stamped with the invoice's period. The error text itself ("Open the period or pick another payment date") shows the payment date is meant to drive the check.
**Steps to Reproduce:**
1. Create and post a customer invoice in an open month, for example 202609.
2. On Period Close & Audit, close 202610.
3. On Accounts Receivable, record a payment against the invoice with a payment date in October 2026.
4. Next, reopen 202610, then close 202609 instead. Try to pay a different open invoice from September, using a payment date in October.
**Expected:** Step 3 is rejected because October is closed. Step 4 succeeds because the payment date is in an open period.
**Actual:** Step 3 succeeds. The `ARPMT-` journal entry is dated in the closed October period but stamped with AccountingPeriod 202609. Step 4 fails with "Accounting period 202609 is closed".
**Evidence:**
- Frontend: `Cimmple_UI/src/Modules/Accounting/AccountsReceivable.tsx` lines 48–90 (bulk payment with a payment date) and `Cimmple_UI/src/Modules/Accounting/AccountsPayable.tsx` lines 45–227 (bulk pay modal with a payment date picker). Both send the user-picked date.
- Backend: `Cimmple_API/CimmpleAPI/Controllers/InvoiceController.cs` lines 1119–1129 compute the lock key from `invoice.AccountingPeriod`. Lines 1168 and 1171 set `EntryDate = paymentDate` and `AccountingPeriod = periodKey`. Lines 1202 and 1206 do the same on the `Transactions` row. `Cimmple_API/CimmpleAPI/Controllers/VendorInvoiceController.cs` lines 737–748 apply the same lock logic to vendor payments, and the journal entry and `Transactions` row are stamped the same way further down (lines 773–811).
- Database: `JournalEntries` and `Transactions` rows end up with `EntryDate`/`TransactionDate` in one month and `AccountingPeriod` in another. Period-based reports and lock checks then disagree with date-based reports.
**Root Cause:** The lock key is taken from the invoice header instead of `GlWorkflowService.PeriodKeyFromDate(paymentDate)`.
**Business Impact:** Closed periods can be changed through cash postings, so closed bank and AR/AP balances shift after close. At the same time, legitimate collections or payments on older invoices are blocked after the invoice month is closed.
**Affected Areas:** Customer Invoices payment modal, AR single and bulk payment, Vendor Invoices, AP single and bulk payment, Bank Reconciliation, Period Close.
**Recommended Fix:** Derive the payment period from the payment date for both the lock check and the stamped `AccountingPeriod`, on both the journal entry and the `Transactions` row.

---

### BUG-ACC-002 — Customer invoice auto-post stamps the accounting period from the server clock, so backdated invoices post into closed periods
**Severity:** Critical. A user can post revenue and AR into a closed period simply by backdating the invoice date.
**Status:** Confirmed
**Test Area:** 6.10 Period Close / 10.4 Invoice → Journal Entries / Business logic
**Description:** `CreateInvoice` sets `AccountingPeriod` to the current server year and month, regardless of the user-selected `InvoiceDate`. The `ARINV-` lock check then runs against that current period, while the journal entry is dated on the invoice date. The error message ("choose a different invoice date") shows the invoice date is meant to drive the check.
**Steps to Reproduce:**
1. Close period 202609.
2. In October 2026, create a customer invoice from a shipped order and set the invoice date to 2026-09-20.
3. Save the invoice.
**Expected:** Save is rejected with "Accounting period 202609 is closed".
**Actual:** The invoice saves. The `ARINV-` journal entry has `EntryDate` 2026-09-20 (in the closed month) and `AccountingPeriod` 202610.
**Evidence:**
- Frontend: `Cimmple_UI/src/Modules/Orders/InvoiceModal.tsx` lets the user pick the invoice date (state at line 26, input at line 471, payload at line 175).
- Backend: `Cimmple_API/CimmpleAPI/Controllers/InvoiceController.cs` line 224 sets `AccountingPeriod = $"{DateTime.Now.Year}{DateTime.Now.Month:D2}"`. Lines 303–308 run the lock check on that period. Lines 316 and 319 date the journal entry on `invoice.InvoiceDate` but stamp `invoicePeriodKey`. `Cimmple_API/CimmpleAPI/Controllers/VendorInvoiceController.cs` line 327 does the same in `CreateVendorInvoice`, with the lock check at lines 405–415. That path is API-only; the UI bill path in `OrderController` (lines 4249–4267) correctly uses the invoice date.
- Database: `InvoiceMaster.AccountingPeriod` and `JournalEntries.AccountingPeriod` are 202610 while `EntryDate` is in 202609.
**Root Cause:** The period is taken from `DateTime.Now` instead of the document date.
**Business Impact:** Closed-period revenue and receivables change without reopening the period. Date-based reports (P&L, balance sheet) for the closed month change after close.
**Affected Areas:** Customer Invoices, AR, Financial Reports, Period Close; API `CreateVendorInvoice`.
**Recommended Fix:** Set `AccountingPeriod` from `InvoiceDate` (as the OrderController bill path already does) and run the lock check against that key.

---

### BUG-ACC-003 — Manual journal entries can be posted with a 0.01 debit/credit imbalance
**Severity:** Critical. An unbalanced journal breaks the double-entry invariant, and the system's own trial balance then reports "not balanced".
**Status:** Confirmed
**Test Area:** 6.7 Journal Entries / Validation
**Description:** The UI treats lines as balanced when `|debits − credits| < 0.02`, and the API only rejects when the difference is `> 0.01`. A journal entry with 100.00 debit and 99.99 credit passes both checks and is saved as-is, with no rounding line. `TrialBalanceReportService` flags any difference of 0.01 or more as unbalanced.
**Steps to Reproduce:**
1. Open Journal Entries and click New.
2. Add line 1: Debit 100.00 to an expense account. Add line 2: Credit 99.99 to a cash account.
3. Post.
4. Run the Trial Balance report.
**Expected:** Posting is blocked until debits equal credits exactly, as the matrix requires ("Balanced").
**Actual:** The entry posts. The trial balance shows debits and credits differing by 0.01, with `IsBalanced = false`.
**Evidence:**
- Frontend: `Cimmple_UI/src/Modules/Accounting/JournalEntries.tsx` line 179 (`balanced: Math.abs(td - tc) < 0.02`).
- Backend: `Cimmple_API/CimmpleAPI/Controllers/JournalEntryController.cs` line 230 (`if (Math.Abs(totalDebit - totalCredit) > 0.01m)`). `Cimmple_API/CimmpleAPI/Services/TrialBalanceReportService.cs` line 72 (`IsBalanced = Math.Abs(totalDebits - totalCredits) < 0.01m`).
- Database: `JournalEntryFrom` and `JournalEntryTo` totals differ by 0.01 for the same `JournalEntryId`.
**Root Cause:** A tolerance is used where an exact match is needed (after rounding both sides to two decimals).
**Business Impact:** The ledger goes out of balance, the trial balance fails, and the balance sheet no longer ties.
**Affected Areas:** Journal Entries, Trial Balance, Balance Sheet, GL detail.
**Recommended Fix:** Require `totalDebit == totalCredit` after rounding to two decimals, in both the UI and the API.

---

### BUG-ACC-004 — Journal entry period lock trusts the client-supplied AccountingPeriod instead of the entry date (API)
**Severity:** High. It allows posting into a closed period. It is rated High rather than Critical only because the UI does not send `accountingPeriod`, so it needs a direct API call.
**Status:** Confirmed
**Test Area:** 6.7 Journal Entries / 6.10 Period Close / API
**Description:** `JournalEntryController.Create` uses `request.AccountingPeriod` as the lock key whenever it is a valid YYYYMM. It falls back to the entry date only when that field is missing or invalid. The journal entry is stored with the client's period and the client's `EntryDate`, which can fall in different months.
**Steps to Reproduce:**
1. Close 202609.
2. POST `/api/JournalEntry/Create` with `entryDate` "2026-09-15", `accountingPeriod` "202610" and two balanced lines.
**Expected:** 400 "Accounting period 202609 is closed".
**Actual:** 200. The journal entry is saved with `EntryDate` 2026-09-15 and `AccountingPeriod` 202610.
**Evidence:**
- Frontend: `Cimmple_UI/src/Modules/Accounting/JournalEntries.tsx` lines 284–289 (the create payload has no `accountingPeriod`), so the UI path is safe.
- Backend: `Cimmple_API/CimmpleAPI/Controllers/JournalEntryController.cs` lines 246–253 (the lock key comes from `request.AccountingPeriod`) and line 267 (`AccountingPeriod = period`).
- Database: `JournalEntries` row with `EntryDate` in a locked period and `AccountingPeriod` in an open one.
**Root Cause:** The lock check uses a caller-controlled field instead of the posting date.
**Business Impact:** Date-based reports for a closed month can be changed after close by any authenticated API caller.
**Affected Areas:** Journal Entries API, Financial Reports, Period Close. Payroll `PostJournal` has the same pattern (see `QA_Payroll.md`).
**Recommended Fix:** Always lock-check `PeriodKeyFromDate(entryDate)`. Reject requests whose `AccountingPeriod` differs from the entry date's period, or derive the period server-side.

---

### BUG-ACC-005 — Reversing auto-posted invoice/payment journals leaves the subledger unchanged, and no payment-reversal path exists
**Severity:** High. The GL and AR/AP subledgers silently diverge, and the documented workflow ("Reverse payments first") cannot be completed.
**Status:** Confirmed
**Test Area:** 6.7 Journal Entries / 6.4 Payments / Business logic
**Description:** The Journal Entries detail panel offers Reverse for every journal entry, including auto-posted `ARINV-`, `ARPMT-`, `APBILL-` and `APPMT-` entries. `Reverse` only has payroll-specific guards and lifecycle updates. Reversing an `ARPMT-` entry therefore removes the cash and AR effect from the GL, but `InvoiceMaster.PaidAmount`, the invoice status and the `Transactions` cash row stay as they were. Conversely, Void and Delete on a paid invoice return "Reverse payments first", but no endpoint exists to reverse or unapply a customer or vendor payment.
**Steps to Reproduce:**
1. Record a full customer payment on an invoice.
2. On Journal Entries, open the `ARPMT-…` entry and click Reverse.
3. Check the invoice in AR, the bank transactions list and the AR aging report.
4. Try to void the invoice.
**Expected:** Either auto-posted subledger journals cannot be reversed from the generic screen, or reversing them also updates `PaidAmount`, status and the cash row. A supported payment-reversal action exists before "Reverse payments first" is shown.
**Actual:** The invoice still shows Paid, the bank cash row is still present (and reconcilable), and the GL AR balance is back up. Void still fails with "Reverse payments first".
**Evidence:**
- Frontend: `Cimmple_UI/src/Modules/Accounting/JournalEntries.tsx` lines 221–245 (`postReversal` for any `detail.id`, with no source check).
- Backend: `Cimmple_API/CimmpleAPI/Controllers/JournalEntryController.cs` lines 505–561 (Reverse: only `ValidatePayrollReverseGuards` at line 525) and lines 650–747 (payroll-only guards and lifecycle). `Cimmple_API/CimmpleAPI/Controllers/InvoiceController.cs` lines 846 and 916, and `Cimmple_API/CimmpleAPI/Controllers/VendorInvoiceController.cs` lines 883 and 940 ("Reverse payments first"). A repository search finds no ReversePayment, UnapplyPayment or VoidPayment endpoint.
- Database: after reversal, `JournalEntries` has `REV-ARPMT-…` while `InvoiceMaster.PaidAmount` and `Transactions` are unchanged.
**Root Cause:** Reversal treats every journal entry as a standalone manual entry, and there is no subledger-aware payment reversal.
**Business Impact:** The AR/AP aging and dashboard disagree with the GL. Paid invoices that need correcting cannot be voided through any supported workflow.
**Affected Areas:** Journal Entries, AR, AP, Bank Reconciliation, AR/AP aging, Payment Dashboard.
**Recommended Fix:** Block generic reversal of `ARINV-`, `ARPMT-`, `APBILL-` and `APPMT-` entries, the same way payroll guards block payroll entries. Add a payment-reversal endpoint that reverses the journal entry, reduces `PaidAmount` and voids or offsets the `Transactions` row inside one transaction.

---

### BUG-ACC-006 — Balance sheet takes the absolute value of liability and equity balances, so contra/debit balances are added instead of subtracted
**Severity:** High. Balance sheet totals are wrong and the report does not balance whenever any liability or equity account has a debit balance.
**Status:** Confirmed
**Test Area:** 6.6 Financial Reports / Business logic (balance sheet ties out)
**Description:** `BuildLiabilityLines` and `BuildEquityLines` use `Math.Abs(signed)` for each account. A contra-equity account such as the seeded "3040 Distributions / Dividends" (type Equity, normally a debit balance), or a liability with a debit balance, is shown as a positive amount and added to the total instead of reducing it.
**Steps to Reproduce:**
1. Post a journal entry: Debit 3040 Distributions / Dividends 1,000, Credit 1000 Cash - Operating 1,000.
2. Run the Balance Sheet for today.
**Expected:** Equity decreases by 1,000, cash decreases by 1,000, and Total Assets = Total Liabilities + Equity.
**Actual:** Equity shows Distributions as +1,000 while assets drop by 1,000. Liabilities + Equity exceed Assets by 2,000.
**Evidence:**
- Frontend: `Cimmple_UI/src/Modules/Accounting/FinancialReports.tsx` renders the server sections as returned.
- Backend: `Cimmple_API/CimmpleAPI/Services/BalanceSheetReportService.cs` lines 183–202 (`var balance = Math.Abs(signed);` at line 191) and lines 204–222 (line 212), with totals at lines 99 and 121.
- Database: `Cimmple_API/CimmpleAPI/Services/ManufacturingChartOfAccountsSeed.cs` line 65 seeds `3040 Distributions / Dividends` as Equity.
**Root Cause:** The sign convention is dropped instead of presenting credit-normal balances as `−signed`.
**Business Impact:** The balance sheet is misstated and out of balance.
**Affected Areas:** Balance Sheet (JSON, PDF, CSV), drill-down tie-out.
**Recommended Fix:** Present liabilities and equity as the credit-normal balance (`-signed`, keeping the sign), so debit balances reduce the section total.

---

### BUG-ACC-007 — Profit & Loss drops inactive accounts that have postings, so P&L and the retained-earnings plug disagree with the trial balance
**Severity:** High. Report totals are wrong after any revenue or expense account with history is deactivated, and the balance sheet stops balancing.
**Status:** Confirmed
**Test Area:** 6.6 Financial Reports / 10.4 Journal Entries → Financial Reports
**Description:** `ProfitLossGlReportService.Build` skips any account where `!coa.IsActive`. The balance sheet's retained-earnings plug comes from that P&L, while asset and liability balances (and the trial balance) still include all postings. Deactivating an expense account with activity therefore removes that expense from the P&L and the retained-earnings plug, but not from the cash side.
**Steps to Reproduce:**
1. Post a journal entry: Debit expense account X 500, Credit Cash 500.
2. In Chart of Accounts, deactivate X.
3. Run the P&L for the period and the Balance Sheet as of today.
**Expected:** The P&L still shows the 500 expense, and the balance sheet balances.
**Actual:** The P&L omits the 500, net income is overstated by 500, and the balance sheet is out by 500.
**Evidence:**
- Backend: `Cimmple_API/CimmpleAPI/Services/ProfitLossGlReportService.cs` lines 112–113 (`if (!coaById.TryGetValue(id, out var coa) || !coa.IsActive) continue;`). `Cimmple_API/CimmpleAPI/Services/BalanceSheetReportService.cs` lines 66–68 (no `IsActive` filter on the account list) and lines 85–97 (retained earnings = P&L net income).
- Database: `JournalEntryFrom` rows on an account with `ChartofAccounts.IsActive = 0`.
**Root Cause:** The active flag (a data-entry control) is used as a reporting filter.
**Business Impact:** The P&L and balance sheet are misstated whenever accounts are retired.
**Affected Areas:** P&L / Income Statement, Balance Sheet, PDF and CSV exports.
**Recommended Fix:** Include every account that has postings in the range, whatever its active flag.

---

### BUG-ACC-008 — Aging, balance sheet and trial balance use the end of the selected range (often a future date) as the as-of date
**Severity:** High. Under the default selection, the AR/AP aging misclassifies invoices that are not yet due as overdue, which directly misleads collections and payables.
**Status:** Confirmed
**Test Area:** 6.6 Financial Reports / Filter / Business logic (aging buckets)
**Description:** `GenerateFinancialReport` passes `dateFilter.endDate` as the as-of date for AR aging, AP aging, trial balance and balance sheet. `GetDateRangeFilter` returns the month end for "This Month" (the page default), the quarter end for "This Quarter", the fiscal year end for "This Year", and today + 1 year for "All". Aging buckets are computed against that future date.
**Steps to Reproduce:**
1. On the 2nd of a month, have an open invoice due on the 20th of the same month.
2. Open Financial Reports and run AR Aging with the default "This Month".
3. Repeat with "All Dates".
**Expected:** The invoice is in Current, because it is not yet due as of today.
**Actual:** With "This Month", as-of is the month end and the invoice appears in 1-30 Days. With "All Dates", as-of is one year ahead and it appears in Over 90 Days. Balance sheet and trial balance also include any future-dated entries up to that date.
**Evidence:**
- Frontend: `Cimmple_UI/src/Modules/Accounting/FinancialReports.tsx` line 135 (`useState("This Month")`).
- Backend: `Cimmple_API/CimmpleAPI/Controllers/AccountingController.cs` lines 1366–1383 (`dateFilter.endDate` passed as as-of) and lines 1558–1570 and 1620–1623 (month-end and today + 1 year end dates). `Cimmple_API/CimmpleAPI/Services/AgingReportService.cs` lines 71 and 80 (buckets are computed with `asOfDate`).
- Database: N/A (calculation only).
**Root Cause:** Period ranges designed for activity reports are reused as point-in-time dates without capping at today.
**Business Impact:** Overdue totals are inflated, and follow-up on not-yet-due invoices is wrong.
**Affected Areas:** AR Aging, AP Aging, Trial Balance, Balance Sheet (JSON, PDF, CSV).
**Recommended Fix:** For as-of reports, use `min(endDate, today)` or an explicit as-of date picker.

---

### BUG-ACC-009 — DeleteJournalEntry bypasses the payroll and subledger guards that Reverse enforces (API)
**Severity:** High. A significant control is bypassed. Deleting a payroll accrual or payment journal entry leaves `PayrollJournalLinks` pointing at deleted journals, and deleting an `ARPMT-`/`APPMT-` entry leaves paid invoices with no GL cash entry.
**Status:** Confirmed
**Test Area:** 6.7 Journal Entries / Delete / API
**Description:** `DeleteJournalEntry` checks only the period lock and whether the entry was already reversed. It does not call `ValidatePayrollReverseGuards`, does not update the payroll link lifecycle, and does not check whether the entry is an auto-posted subledger journal. The tenant comes only from the query string; there is no token fallback.
**Steps to Reproduce:**
1. Post a payroll journal and its net-pay payment.
2. DELETE `/api/Accounting/DeleteJournalEntry?journalEntryId={accrualJeId}&tenantId={tenant}`.
**Expected:** Blocked with the same rule as Reverse ("Cannot reverse this accrual: net-pay payment has already been posted").
**Actual:** The accrual journal entry and its lines are deleted. The payroll link is still Posted with `JournalEntryId` pointing at a missing row, and the payment journal entry remains, leaving Accrued Payroll with a debit balance.
**Evidence:**
- Frontend: no UI caller (the matrix states "API only").
- Backend: `Cimmple_API/CimmpleAPI/Controllers/AccountingController.cs` lines 1839–1901 (guards at lines 1852–1859 only). Compare `Cimmple_API/CimmpleAPI/Controllers/JournalEntryController.cs` lines 525–527 and 650–696.
- Database: `PayrollJournalLink.JournalEntryId` points at a deleted `JournalEntries.Id`, and `InvoiceMaster.PaidAmount` has no matching `ARPMT-` entry.
**Root Cause:** The delete path was not updated when payroll and subledger guards were added to Reverse.
**Business Impact:** The ledger and subledgers diverge, with no audit-friendly correction path.
**Affected Areas:** Journal Entries, Payroll Journals, AR, AP.
**Recommended Fix:** Apply the same guards as Reverse (or forbid deleting auto-posted and payroll journals), and resolve the tenant from the token.

---

### BUG-ACC-010 — Bank GL resolution silently falls back to a keyword-matched cash account when the selected bank has no valid COA mapping
**Severity:** Medium. Cash is posted to the wrong GL account for specific configurations, while the cash row is tagged to the selected bank.
**Status:** Confirmed
**Test Area:** 6.4 Payments / Business logic (posting accounts)
**Description:** `GlAccountResolutionService.ResolveBank` tries `BankCOAMapping` and then `BankMaster.coa`. If neither yields an active account in the tenant, it falls through to `FindByKeywords("bank"/"cash")` even though a specific bank was selected. As a result, the "Configure bank COA mapping first" errors in the payment endpoints can effectively never fire.
**Steps to Reproduce:**
1. Create bank B with no COA mapping, or one mapped to an account that has since been deactivated.
2. Record a customer payment and select bank B.
**Expected:** Error "Unable to determine a bank GL account for this payment. Configure bank COA mapping first."
**Actual:** The payment posts. The debit goes to the first account whose name or type contains "bank" or "cash" (for example 1000 Cash - Operating), while `Transactions.BankId` = B.
**Evidence:**
- Backend: `Cimmple_API/CimmpleAPI/Services/GlAccountResolutionService.cs` lines 256–295 (fallback at lines 290–294). `Cimmple_API/CimmpleAPI/Controllers/InvoiceController.cs` lines 1101–1108 and `Cimmple_API/CimmpleAPI/Controllers/VendorInvoiceController.cs` lines 720–727 contain the error branch that the fallback makes unreachable.
- Database: `JournalEntryFrom.AccountId` (cash) does not match the selected bank's GL account.
**Root Cause:** The keyword fallback that is meant for "no bank selected" also applies to an explicit but unmapped bank.
**Business Impact:** The bank's GL balance does not match its reconciliation, and another bank's GL is overstated.
**Affected Areas:** Customer and vendor payments, payroll payments (`ResolvePayrollBank`), Bank Reconciliation, Balance Sheet.
**Recommended Fix:** When an explicit `bankId` is given, return null if it cannot be mapped, so the existing error message is shown.

---

### BUG-ACC-011 — Bank reconciliation and payment endpoints do not check that the user can access the bank's location
**Severity:** Medium. The location access control is weaker than the matrix requires: a restricted user can reconcile, or post payments to, banks at sites they cannot access.
**Status:** Confirmed
**Test Area:** 6.5 Bank Reconciliation / 6.4 Payments / Authorization (bank location access)
**Description:** Only `Bank/GetBanklist` is filtered by location. `GetBankTransactions`, `GetBankReconciliationContext`, `Reconcile`, `BulkReconcile`, `Start`, `Update` and `CompleteBankReconciliationPeriod` look up the bank or transaction by tenant only. `RecordCustomerPayment` and `RecordVendorPayment` accept any `bankId`. None of them call `CanAccessLocation(bank.LocationId)`.
**Steps to Reproduce:**
1. Sign in as a user restricted to Site A.
2. Call GET `/api/Accounting/GetBankTransactions?bankAccountId={bankAtSiteB}`, then POST `StartBankReconciliationPeriod` with that bank.
3. Record a customer payment with `bankId` = the Site B bank.
**Expected:** 403 "You do not have access to the selected location" (matrix 6.5 Authorization and 11.2: "Restricted user recon on own-site bank only". Matrix 6.4: "A payment from a bank at a location the user can't access").
**Actual:** 200. Transactions are listed, the reconciliation period is created, and the payment is posted.
**Evidence:**
- Frontend: `Cimmple_UI/src/Modules/Accounting/BankReconciliation.tsx` picks the bank from the location-filtered list, so the restriction is UI-only.
- Backend: `Cimmple_API/CimmpleAPI/Controllers/AccountingController.cs` lines 471–568, 570–605, 731–798, 800–863 and 865–972 (tenant-only bank and transaction lookups, for example lines 490–491 and 752). `InvoiceController.cs` lines 1093–1101 (no bank location check). `Cimmple_API/CimmpleAPI/Controllers/ApiBaseController.cs` lines 121–126 (`CanAccessLocation` exists but is not called).
- Database: `BankReconciliationPeriod` and `Transactions` rows created for a bank at a non-allowed site.
**Root Cause:** The location check is applied only on the bank list endpoint.
**Business Impact:** Site-level segregation of cash duties is not enforced.
**Affected Areas:** Bank Reconciliation, AR and AP payments.
**Recommended Fix:** Load the bank and call `CanAccessLocation(bank.LocationId)` in every bank-scoped endpoint, returning 403 when access is denied.

---

### BUG-ACC-012 — Bank reconciliation start/update does not enforce statement-date order, corrupting the beginning balance
**Severity:** Medium. Incorrect in specific conditions: an out-of-order statement takes the wrong beginning balance and can be completed against it.
**Status:** Confirmed
**Test Area:** 6.5 Bank Reconciliation / Business logic (starting balance)
**Description:** The beginning balance is the `EndingBalance` of the completed period with the latest `StatementDate`. Neither Start nor Update rejects a statement date on or before that last completed statement. A user who completes October and then starts September gets October's ending balance as September's beginning balance.
**Steps to Reproduce:**
1. For bank B, complete a reconciliation with statement date 2026-10-31.
2. Start a new reconciliation with statement date 2026-09-30.
**Expected:** Rejected ("Statement date must be after the last completed statement 2026-10-31"), per the matrix rule that the starting balance is the previous completed reconciliation's ending balance.
**Actual:** Accepted, with `BeginningBalance` = October's ending balance. Update can also move an open period's statement date earlier.
**Evidence:**
- Backend: `Cimmple_API/CimmpleAPI/Controllers/AccountingController.cs` lines 763–769 (last completed by StatementDate, used as the beginning balance, with no date comparison) and lines 818–831 (Update allows any statement date).
- Database: `BankReconciliationPeriod` rows whose `StatementDate` order does not match the beginning/ending balance chain.
**Root Cause:** Missing chronological validation.
**Business Impact:** The reconciliation chain is broken, and completed reconciliations no longer prove the bank balance.
**Affected Areas:** Bank Reconciliation, Period Close (which relies on completed reconciliations).
**Recommended Fix:** Require `StatementDate > lastCompleted.StatementDate` on Start and Update.

---

### BUG-ACC-013 — Accounting Setup accepts negative approval limits and silently deactivates invalid payment terms or approval rows
**Severity:** Medium. Validation required by the matrix is missing, and a save reports success while dropping rows.
**Status:** Confirmed
**Test Area:** 6.11 Accounting Setup / Validation (limits ≥ 0; term days ≥ 0)
**Description:**
- **Approval limits:** the UI input has no minimum, and `UpsertApprovalLimits` saves any amount. A negative limit means no invoice can ever be approved by that role, because `CanApproveInvoice` requires total ≤ limit.
- **Payment terms:** a term with a blank name or negative days is skipped by `UpsertPaymentTerms`. The existing row is then deactivated because its name is not in the kept set, and the save still returns success.
- **Unresolved approval rows:** an approval row whose role cannot be resolved is skipped and its existing row deactivated. A role with no active limit can approve any amount.
**Steps to Reproduce:**
1. On Approval Limits, set a role's limit to −100 and save. Then try to approve a 50.00 bill as that role.
2. On Payment Terms, change "Net 30" days to −1 and save.
**Expected:** Validation errors: "Limit must be ≥ 0" and "Days must be ≥ 0".
**Actual:** Step 1 saves, and approval fails with "exceeds your approval limit of -100.00". Step 2 shows success, but "Net 30" is deactivated and disappears from term pickers.
**Evidence:**
- Frontend: `Cimmple_UI/src/Modules/Accounting/AccountingSetup.tsx` lines 668–670 (days input `parseInt || 0`, no minimum) and lines 756–758 (limit input, no minimum).
- Backend: `Cimmple_API/CimmpleAPI/Controllers/AccountingController.cs` lines 2368–2369 (silent skip), lines 2397–2404 (deactivate), lines 2423–2424 (skip unresolved role) and line 2441 (no `Limit >= 0` check). `Cimmple_API/CimmpleAPI/Services/AccountingRules.cs` lines 80–85. `VendorInvoiceController.cs` lines 633–641.
- Database: `PaymentTerm.IsActive = 0` for an edited term, and `ApApprovalLimit.LimitAmount < 0`.
**Root Cause:** Server-side validation is missing, and invalid input is treated as a deletion.
**Business Impact:** AP approval can be blocked or, for unresolved roles, left unlimited. Payment terms in use disappear without warning.
**Affected Areas:** Accounting Setup, AP approval, invoice and bill due dates.
**Recommended Fix:** Validate limit ≥ 0, days ≥ 0 and a non-blank name. Return 400 listing the invalid rows instead of skipping them.

---

### BUG-ACC-014 — Transactions in a completed reconciliation can still be un-reconciled
**Severity:** Low. Data inconsistency without a GL effect: a row's reconciled flag disagrees with the completed reconciliation snapshot.
**Status:** Confirmed
**Test Area:** 6.5 Bank Reconciliation / Reconcile
**Description:** `ReconcileBankTransaction` only checks the GL period lock. A transaction already linked to a Completed `BankReconciliationPeriodItem` can be toggled to unreconciled while its month is open. The cleared-balance math ignores it from then on, because it is already in a completed period, but the list shows it as outstanding.
**Steps to Reproduce:**
1. Complete a reconciliation that includes transaction T, and leave the month open.
2. On Bank Reconciliation, untick T.
**Expected:** Blocked: "This transaction belongs to a completed reconciliation".
**Actual:** T shows as unreconciled even though it remains part of the completed reconciliation.
**Evidence:**
- Frontend: `Cimmple_UI/src/Modules/Accounting/BankReconciliation.tsx` line 423 (toggle allows unreconcile).
- Backend: `Cimmple_API/CimmpleAPI/Controllers/AccountingController.cs` lines 579–597 (no completed-item check) and lines 1005–1031 (completed items excluded from later cleared math).
- Database: `Transactions.IsReconciled = 0` while a row exists in `BankReconciliationPeriodItem` for a Completed period.
**Root Cause:** Completed reconciliation items are not locked.
**Business Impact:** It confuses reviewers, and outstanding-items lists become unreliable.
**Affected Areas:** Bank Reconciliation.
**Recommended Fix:** Reject reconcile/unreconcile for transactions linked to a Completed period.

---

### BUG-ACC-015 — Recent Transactions shows a duplicated description and no customer/vendor name for payments
**Severity:** Low. Cosmetic: the text reads incorrectly and the party column is wrong.
**Status:** Confirmed
**Test Area:** 6.1 Payment Dashboard / List
**Description:** For customer payments, the description is built as "Payment received from {t.Description}" and `customerVendor` is set to `t.Description`. Because `Transactions.Description` is "Customer payment for INV-…", the dashboard shows "Payment received from Customer payment for INV-2026-0001", with the same text in the Customer/Vendor column. Vendor payments follow the same pattern.
**Steps to Reproduce:**
1. Record a customer payment.
2. Open Payment Dashboard and look at Recent Transactions.
**Expected:** The description reads like "Payment received from {Customer name}" and the Customer/Vendor column shows the customer name.
**Actual:** "Payment received from Customer payment for INV-…", and the column repeats the description.
**Evidence:**
- Backend: `Cimmple_API/CimmpleAPI/Controllers/AccountingController.cs` lines 208 and 212 (customer) and lines 293 and 297 (vendor). `InvoiceController.cs` line 1207 (description text).
**Root Cause:** The description field is used where the party name is expected.
**Business Impact:** Minor readability issue on the dashboard.
**Affected Areas:** Payment Dashboard.
**Recommended Fix:** Join to the customer or vendor name for the party column, and use it in the description.

---

### BUG-ACC-016 — AP "This Week" filter means "last 7 days", unlike the Payment Dashboard
**Severity:** Low. A minor filter inconsistency.
**Status:** Confirmed
**Test Area:** 6.2 AP / Filter
**Description:** On Accounts Payable, "This Week" shares a branch with "Last 7 Days" (invoice date within the past 7 days). The Payment Dashboard and Financial Reports use a calendar week starting Sunday (`GetDateRangeFilter`).
**Steps to Reproduce:**
1. On a Wednesday, select "This Week" on AP and on the Payment Dashboard.
**Expected:** Both screens use the same calendar week.
**Actual:** AP includes the previous Wednesday to Saturday, while the dashboard does not.
**Evidence:**
- Frontend: `Cimmple_UI/src/Modules/Accounting/AccountsPayable.tsx` lines 260–264 and 726.
- Backend: `Cimmple_API/CimmpleAPI/Controllers/AccountingController.cs` lines 1563–1566.
**Root Cause:** The client filter maps the label to a rolling window.
**Business Impact:** The AP list and dashboard totals for "This Week" do not match.
**Affected Areas:** Accounts Payable.
**Recommended Fix:** Use a calendar week (or rename the option "Last 7 Days").

---

### BUG-ACC-017 — AR reminders do not check the invoice's site, and bulk reminders without IDs go to all overdue invoices tenant-wide (API)
**Severity:** Low. A hardening issue: customer emails can be triggered for other sites' invoices. The UI path sends only the visible invoice IDs.
**Status:** Confirmed
**Test Area:** 6.3 AR / Reminders / Location
**Description:** `SendArReminder` and `SendBulkArReminders` validate the active location header but use it only for the PDF letterhead. Invoices are loaded by tenant only. When `InvoiceIds` is null, the bulk endpoint selects every overdue invoice in the tenant.
**Steps to Reproduce:**
1. As a user restricted to Site A, POST `/api/Accounting/SendBulkArReminders` with body `{ "invoiceIds": null }`.
**Expected:** Only invoices for the user's allowed sites are reminded, or the request is rejected.
**Actual:** Reminders are queued for overdue invoices at every site.
**Evidence:**
- Frontend: `Cimmple_UI/src/Modules/Accounting/AccountsReceivable.tsx` lines 394–396 (sends explicit IDs). `AccountingService.ts` lines 675–683 (allows null).
- Backend: `Cimmple_API/CimmpleAPI/Controllers/AccountingController.cs` lines 2085–2095 (tenant-wide fallback) and line 2217 (location used only for the PDF).
- Database: `ArReminderLogs` and `EmailOutbox` rows for invoices at non-allowed sites.
**Root Cause:** There is no per-invoice site check.
**Business Impact:** Possible unwanted customer emails across sites.
**Affected Areas:** AR reminders.
**Recommended Fix:** Filter invoices through the order's location against the user's allowed sites, and require explicit IDs.

---

### BUG-ACC-018 — DeleteTransaction lock check ignores the transaction date when AccountingPeriod is empty (API)
**Severity:** Low. A hardening issue affecting legacy rows only, through an API-only endpoint.
**Status:** Confirmed
**Test Area:** 6.5 Bank Reconciliation / Delete / 10.4 Period Close → posting modules
**Description:** `DeleteTransaction` checks the period lock only when `transaction.AccountingPeriod` is not blank. Legacy cash rows with no period, dated in a closed month, can be deleted (if unreconciled and not linked to a journal entry). Every other lock check falls back to the date.
**Steps to Reproduce:**
1. Find an unreconciled legacy `Transactions` row with `AccountingPeriod` NULL and `TransactionDate` in a closed month.
2. DELETE `/api/Accounting/DeleteTransaction?transactionId=…`.
**Expected:** Blocked because the period is closed (matrix 10.4: "delete blocked in closed period").
**Actual:** Deleted.
**Evidence:**
- Backend: `Cimmple_API/CimmpleAPI/Controllers/AccountingController.cs` lines 1724–1728.
**Root Cause:** There is no date fallback for the lock key.
**Business Impact:** Bank book balance for a closed month can change.
**Affected Areas:** Bank Reconciliation, Period Close.
**Recommended Fix:** Use `AccountingPeriod` or else `PeriodKeyFromDate(TransactionDate)`, as `DeleteJournalEntry` does.

---

## Potential Bugs

### BUG-ACC-019 — Aging for a past as-of date uses today's paid amounts
**Severity:** Medium. Historical aging totals would be wrong for past dates.
**Status:** Potential
**Test Area:** 6.6 Financial Reports / Business logic (aging)
**Description:** AR and AP aging filter on `InvoiceDate <= asOf` but use the current `PaidAmount`. An invoice paid after the as-of date is excluded or shown as partially paid, instead of fully open at that date.
**Steps to Reproduce:**
1. Pay an invoice in full on 2026-10-10.
2. Run AR Aging with a Custom range ending 2026-09-30.
**Expected:** The invoice shows as open as of 2026-09-30.
**Actual:** The invoice is missing from the aging.
**Evidence:**
- Backend: `Cimmple_API/CimmpleAPI/Services/AgingReportService.cs` lines 40–41 and 122–123 (current `PaidAmount`). There is no payment-date-aware paid-as-of calculation.
**Root Cause:** The paid amount is not time-sliced.
**Business Impact:** Month-end aging cannot be reproduced after the fact.
**Affected Areas:** AR and AP Aging.
**Recommended Fix:** Compute paid-as-of from payment `Transactions` or journal entries dated on or before the as-of date.
**Why further verification is needed:** The matrix does not state whether aging must be historical or a current snapshot with a date cutoff. The product owner should confirm the intended semantics.

---

### BUG-ACC-020 — Dashboard and aging treat legacy invoices paid only via PaymentDate differently
**Severity:** Low. Totals differ between screens, but only for legacy data.
**Status:** Potential
**Test Area:** 6.1 Payment Dashboard / 6.6 Financial Reports / Business logic
**Description:** The dashboard's AR metrics treat a legacy invoice with `PaymentDate` set as fully paid. The aging report uses only `PaidAmount < TotalAmount`, so the same invoice (with `PaidAmount` 0) appears open in the aging.
**Steps to Reproduce:**
1. Find a legacy invoice with `PaymentDate` set and `PaidAmount` 0.
2. Compare the dashboard's Total Receivables with the AR Aging total.
**Expected:** Both screens agree.
**Actual:** The aging includes the invoice and the dashboard does not.
**Evidence:**
- Backend: `Cimmple_API/CimmpleAPI/Controllers/AccountingController.cs` lines 1424–1486 (legacy PaymentDate treated as paid). `Cimmple_API/CimmpleAPI/Services/AgingReportService.cs` line 40.
**Root Cause:** Two different "paid" definitions.
**Business Impact:** Reconciling AR between screens is confusing.
**Affected Areas:** Payment Dashboard, AR Aging.
**Recommended Fix:** Use one shared effective-paid helper (as `InvoiceController.GetEffectivePaidAmount` does).
**Why further verification is needed:** It depends on whether such legacy rows exist in production data.

---

### BUG-ACC-021 — Report drill-down starts on calendar 1 January with a running balance from 0, so balance-sheet and trial-balance lines do not tie
**Severity:** Medium. Drill-down totals would not match the report line for any account with balances before 1 January.
**Status:** Potential
**Test Area:** 6.6 Financial Reports / Drill-down; 6.8 General Ledger
**Description:** For as-of reports, the drill range is `{year}-01-01` to the as-of date (calendar year, not fiscal year or inception). `GeneralLedgerDetail` starts its running balance at 0. A balance sheet line for cash (an all-time balance) therefore drills to a list whose final running balance is only this calendar year's activity.
**Steps to Reproduce:**
1. Post activity on Cash in the prior year.
2. Run the Balance Sheet and click the Cash line.
**Expected:** The drill-down ties to the reported balance (opening balance plus activity).
**Actual:** The drill-down shows only current-year activity, starting from 0.
**Evidence:**
- Frontend: `Cimmple_UI/src/Modules/Accounting/FinancialReports.tsx` lines 206–209.
- Backend: `Cimmple_API/CimmpleAPI/Controllers/JournalEntryController.cs` lines 326–503 (running balance from 0).
**Root Cause:** There is no opening-balance row and the start date is calendar-based.
**Business Impact:** Tie-out from statements to detail is unreliable.
**Affected Areas:** Financial Reports drill-down, GL account activity.
**Recommended Fix:** Add an opening-balance line (balance before the start date), or drill from inception for balance sheet accounts.
**Why further verification is needed:** The GL page labels its running balance "for the period", and the matrix states "running balance from 0". Whether drill-downs from as-of reports must tie exactly needs product confirmation.

---

### BUG-ACC-022 — Journal Entries list loads at most 200 rows with no paging
**Severity:** Low. Older entries are reachable only by narrowing the filters.
**Status:** Potential
**Test Area:** 6.7 Journal Entries / Pagination
**Description:** The UI requests `take: 200`, and the API clamps `take` to 1–500. There is no server paging, so client sort and search operate only on the latest 200 entries in the filter range.
**Steps to Reproduce:**
1. In a tenant with more than 200 journal entries in the selected range, search for an older reference.
**Expected:** The entry is found, or the user can page to it.
**Actual:** Not found unless the date filter is narrowed.
**Evidence:**
- Frontend: `Cimmple_UI/src/Modules/Accounting/JournalEntries.tsx` line 134.
- Backend: `Cimmple_API/CimmpleAPI/Controllers/JournalEntryController.cs` lines 32–106 (take clamped).
**Root Cause:** Fixed client cap.
**Business Impact:** Reviewers may miss entries.
**Affected Areas:** Journal Entries.
**Recommended Fix:** Add server paging, or warn when the cap is reached.
**Why further verification is needed:** Whether the date and source filters are sufficient in practice depends on data volume. The matrix lists "take 1–500" without stating that paging is required.

---

### BUG-ACC-023 — Financial reports and GL detail accept any LocationId without checking the user's allowed sites
**Severity:** Medium. A restricted user could produce another site's statements.
**Status:** Potential
**Test Area:** 6.6 Financial Reports / 6.8 General Ledger / Location
**Description:** `GenerateFinancialReport` uses `request.LocationId` directly, and `GeneralLedgerDetail` uses the query location. Neither calls `TryResolveListLocationFilter` or `CanAccessLocation`. With "All sites" (null), a restricted user gets tenant-wide figures.
**Steps to Reproduce:**
1. As a user restricted to Site A, POST `GenerateFinancialReport` with `locationId` = Site B.
**Expected:** 403, or results limited to allowed sites.
**Actual:** The Site B report is returned.
**Evidence:**
- Backend: `Cimmple_API/CimmpleAPI/Controllers/AccountingController.cs` lines 1357–1359. `JournalEntryController.cs` lines 326–503.
**Root Cause:** There is no location authorization on reporting endpoints.
**Business Impact:** Site-restricted users can see other sites' financial data.
**Affected Areas:** Financial Reports, GL account activity.
**Recommended Fix:** Validate the requested location with `TryResolveListLocationFilter`.
**Why further verification is needed:** Matrix 11.2 describes Journal Entries / GL / Financial Reports as "Tenant-wide (location where line has it)". It is not stated whether restricted users must be limited.

---

## Needs Manual Verification

1. **Area:** 6.5 Bank Reconciliation / Statement import
   **What to Test:** Import a bank CSV in `BankStatementImportModal.tsx`, auto-match rows, close and reopen to check the localStorage draft, then apply the matches.
   **Expected:** Rows are matched by amount, date and reference. The draft is restored. Applying the import marks only the matched rows as reconciled.
   **Why Manual Testing Is Required:** The matching is client-side and depends on real CSV formats and browser storage.
2. **Area:** 6.5 Bank Reconciliation / Export
   **What to Test:** Export the transactions list to CSV with filters applied.
   **Expected:** The CSV contains the filtered rows, signed amounts and the reconciled flag.
   **Why Manual Testing Is Required:** The browser download and file content need a running UI.
3. **Area:** 6.6 Financial Reports / Export
   **What to Test:** Export each report type to PDF and CSV and compare with the JSON view.
   **Expected:** Totals and sections match the on-screen report.
   **Why Manual Testing Is Required:** The PDF rendering and layout need visual inspection.
4. **Area:** 6.6 Financial Reports / Fiscal year
   **What to Test:** Set Fiscal Year Start to 07-01 and run "This Year" and "Last Year" in February and in August.
   **Expected:** The ranges are July to June of the correct fiscal year.
   **Why Manual Testing Is Required:** The result depends on `AccountingRules.GetFiscalYearBounds` and the server date.
5. **Area:** 6.4 Payments / Concurrency
   **What to Test:** Submit two payments for the same invoice at the same time (two tabs) for the full balance.
   **Expected:** One succeeds and the other is rejected as overpayment.
   **Why Manual Testing Is Required:** The race between the balance read and the commit can only be observed at runtime.
6. **Area:** 6.10 Period Close / Missing bank reconciliation
   **What to Test:** As a Site A user, close a period while a Site B bank has no completed reconciliation.
   **Expected:** 409 listing the Site B bank with its location name, up to 8 banks.
   **Why Manual Testing Is Required:** It needs real multi-site data and the rendered error.
7. **Area:** 6.1–6.11 Permissions
   **What to Test:** For each `/accounts/*` route, sign in with roles that have and do not have the page permission.
   **Expected:** Routes without permission show No access, and sidebar items are hidden.
   **Why Manual Testing Is Required:** Role configuration is data-driven (server-side enforcement is tracked in QA_RolesPermissions.md).
8. **Area:** Responsive / PWA
   **What to Test:** On a phone, check dashboard cards stacking, AP bulk selection on touch, the report drill drawer, and the period-close dialog.
   **Expected:** Usable layouts and controls on small screens.
   **Why Manual Testing Is Required:** It needs a real device or emulator.
9. **Area:** 6.3 AR / Reminders delivery
   **What to Test:** Send single and bulk reminders, then check `EmailOutbox` processing and the received email and attachment.
   **Expected:** The email is delivered with the invoice PDF, and `ArReminderLogs` is written. Customers without an email return a clear error.
   **Why Manual Testing Is Required:** It depends on SMTP and outbox configuration.
10. **Area:** 6.4 Payments / Legacy `Payment` table
    **What to Test:** Check whether any screen or report still reads or writes the legacy `Payment` table.
    **Expected:** No active dependency (the matrix marks it Needs Review).
    **Why Manual Testing Is Required:** It requires a database inspection of the deployed schema and data.
11. **Area:** 6.6 Financial Reports / Cash flow
    **What to Test:** Compare the Cash Flow report with bank activity for a month that includes payroll payments.
    **Expected:** Cash out includes payroll net pay and tax remittance.
    **Why Manual Testing Is Required:** Cash flow reads `Transactions`, which payroll does not write (BUG-PAY-001). The visible effect depends on data.

## No Issues Found

- Aging bucket boundaries in `AccountingRules.CalculateAgingBuckets` are correct: Current when due ≥ as-of, then 1-30, 31-60, 61-90 and Over 90 at exactly 30/60/90 days.
- Overpayment is rejected for customer and vendor payments (`InvoiceController.cs` lines 1090–1091 and the matching vendor code), and partial payments accumulate `PaidAmount` correctly.
- A bank is required for customer and vendor payments (`InvoiceController.cs` lines 1093–1100).
- A vendor bill must be approved before payment, and the approval limit is enforced (`VendorInvoiceController.cs` lines 612–677). The UI gates the Pay action the same way (`AccountsPayable.tsx` lines 23–34).
- Void and delete are blocked on paid or partially paid invoices and bills.
- Journal entry Create requires two or more lines, non-negative single-sided amounts, and active accounts in the tenant (`JournalEntryController.cs` lines 222–239).
- Reverse blocks an already-reversed entry and checks the lock on the reversal period, and payroll reverse guards are enforced (`JournalEntryController.cs` lines 520–561 and 650–696).
- Completing a reconciliation requires a difference under 0.01 on both the UI (`BankReconciliation.tsx` line 133) and the API (`AccountingController.cs` lines 893–900).
- Only one open reconciliation per bank is allowed, enforced by the API check and the filtered unique index `IX_BankReconPeriod_Tenant_Bank_Status` (`AccountingGapSchemaService.cs` lines 271–276).
- Start, update and complete of a reconciliation return 409 when the statement date is in a closed period.
- Close Period returns 409 when the period is already closed or a bank reconciliation is missing (listing up to 8 banks with location). Open Period returns 404 when the period is not closed. `GlAccountingPeriodLocks` has a unique (TenantId, PeriodKey) index (`CimmpleDbContext.cs` line 691).
- The Period Close dialog validates YYYYMM, supports Cancel and Esc, and shows 409 messages (`AccountingPeriods.tsx` lines 60–63 and 272).
- `ListGlAuditTrail` defaults to 150 rows and caps at 500.
- The Payment Dashboard and Recent Transactions apply `TryResolveListLocationFilter`, returning 403 for a non-allowed site (`AccountingController.cs` lines 48 and 100).
- GL account activity deep link (`accountId`, `startDate`, `endDate`, `run=1`) seeds the filters and auto-runs (`GeneralLedger.tsx` lines 58–123).
- `GetAccountingSettings` seeds defaults and payment terms, and `AccountingDefaults` is unique per tenant.
- `GetGstStatus` returns the status without side effects.

## QA Coverage

| Test Area | Tested | Result |
| --- | --- | --- |
| Navigation | Yes | Pass |
| CRUD | Yes | Fail (BUG-ACC-003, BUG-ACC-005, BUG-ACC-009, BUG-ACC-013) |
| Search | Partial | Pass |
| Filters | Yes | Fail (BUG-ACC-008, BUG-ACC-016) |
| Sorting | Partial | Manual |
| Pagination | Partial | Potential (BUG-ACC-022) |
| Validation | Yes | Fail (BUG-ACC-003, BUG-ACC-012, BUG-ACC-013) |
| Permissions | Partial | Manual (server-side role enforcement: see Cross-Module Concerns) |
| API | Yes | Fail (BUG-ACC-004, BUG-ACC-009, BUG-ACC-017, BUG-ACC-018) |
| Database | Yes | Fail (BUG-ACC-001, BUG-ACC-002, BUG-ACC-005, BUG-ACC-014) |
| Business Logic | Yes | Fail (BUG-ACC-001, BUG-ACC-002, BUG-ACC-006, BUG-ACC-007, BUG-ACC-008, BUG-ACC-010, BUG-ACC-012) |
| Location | Yes | Fail (BUG-ACC-011, BUG-ACC-017); Potential (BUG-ACC-023) |
| Tenant | Yes | Fail (see Cross-Module Concerns, row a) |
| Cross-Module | Yes | Fail (BUG-ACC-001, BUG-ACC-002, BUG-ACC-005, BUG-ACC-010; payroll cash see BUG-PAY-001) |
| Responsive/PWA | No | Manual |

## Matrix Checklist

### Shared accounting rules (section 6 header)

| Matrix Row | Result | Notes |
| --- | --- | --- |
| Every posting checks `GlAccountingPeriodLocks` | Fail (BUG-ACC-001, BUG-ACC-002, BUG-ACC-004, BUG-ACC-018) | The check exists everywhere, but the wrong key is used in payments, invoice create, JE create and transaction delete. |
| Posting accounts come from `AccountingDefaults` | Fail (BUG-ACC-010) | Defaults are used first, but the bank falls back to keyword matching. |
| Postings write `JournalEntries`, `Transactions`, `GlAuditEvents` | Pass | AR and AP payments write all three. Payroll does not write `Transactions` (BUG-PAY-001). |
| Journal reference prefixes | Pass | `ARINV-`, `ARPMT-`, `APBILL-`, `APPMT-`, `JE-yyyyMMdd-XXXX`, `PAYPMT-`/`PAYTAX-` are all generated. |

### 6.1 Payment Dashboard

| Matrix Row | Result | Notes |
| --- | --- | --- |
| FE List (KPI cards, recent transactions; metrics + recent take 100) | Fail (BUG-ACC-015) | Data loads. The payment description and party column are wrong. API limit is clamped to 1–200. |
| FE Filter (date range; working site) | Pass | Options All, This Week, This Month, Last 30 and Last 90 days. `locationId` is passed and validated. |
| FE Search / Sort / Pagination (client) | Manual | Client-side table; not exercised statically. |
| FE Add / Edit / Delete | N/A | Read-only. |
| FE Permissions / Responsive | Manual | Route-level permission and card stacking need a browser. |
| BE Get (`GetPaymentDashboardMetrics`, `GetRecentTransactions`) | Pass | Lines 40–469. Potential definition mismatch with aging (BUG-ACC-020). |
| BE Authorization (authenticated; location filter) | Pass | `TryResolveListLocationFilter` is applied. |
| BL Open AR/AP balances, overdue amounts and net cash for the range | Potential (BUG-ACC-020) | Net cash excludes payroll cash (BUG-PAY-001). |

### 6.2 Accounts Payable

| Matrix Row | Result | Notes |
| --- | --- | --- |
| FE List (`GetVendorInvoices`) | Pass | Loads through the vendor invoice service. |
| FE Search / Filter (vendor, status, date) | Fail (BUG-ACC-016) | "This Week" means the last 7 days. |
| FE Sort / Pagination (client) | Manual | Client-side. |
| FE Approve (single and bulk) | Pass | Approval limit enforced server-side. |
| FE Pay (single and bulk: bank, date, amount) | Fail (BUG-ACC-001, BUG-ACC-010) | The lock uses the bill period, and an unmapped bank falls back to a keyword cash account. |
| FE Void | Fail (BUG-ACC-005) | Paid bills are blocked with "Reverse payments first", but no reversal path exists. |
| FE Add / Edit / Delete | N/A | Created from vendor orders. |
| FE Validation (payment ≤ balance; bank required; approved before pay; approval limit) | Fail (BUG-ACC-013) | The first three pass. A negative approval limit is accepted. |
| FE Permissions / Responsive | Manual | Bulk selection on touch needs a device. |
| BE List | Pass | Tenant-scoped. |
| BE Approve / Pay / Void (`Transactions`, `JournalEntries`, `GlAuditEvents`) | Fail (BUG-ACC-001, BUG-ACC-011) | All records are written. The period key is wrong, and there is no bank location check. |
| BE Authorization (approval limits from `ApApprovalLimits`) | Fail (BUG-ACC-013) | The limit is enforced, but limit values are not validated. |

### 6.3 Accounts Receivable

| Matrix Row | Result | Notes |
| --- | --- | --- |
| FE List (`GetAllInvoices`) | Pass | |
| FE Search / Filter (customer, status, aging, date) | Pass | Client-side filters. |
| FE Sort / Pagination | Manual | Client-side. |
| FE Record payment (single and bulk) | Fail (BUG-ACC-001) | The lock uses the invoice period. |
| FE Reminders (single and bulk) | Fail (BUG-ACC-017) | The UI sends overdue IDs, but the API has no site check. |
| FE Add / Edit / Delete | N/A | Created from customer orders. |
| FE Validation (payment ≤ balance; bank required; customer email) | Pass | Overpayment rejected, bank required, and reminders fail gracefully without an email. |
| FE Permissions / Responsive | Manual | |
| BE List / Pay (`InvoiceMaster`, `Transactions`, `GlAuditEvents`) | Fail (BUG-ACC-001, BUG-ACC-011) | |
| BE Reminders (`ArReminderLogs`, `EmailOutbox`) | Fail (BUG-ACC-017) | Delivery is in Manual Verification item 9. |
| BE Authorization | Fail (BUG-ACC-017) | Tenant from token; no per-invoice site check. |

### 6.4 Payments (consolidated view)

| Matrix Row | Result | Notes |
| --- | --- | --- |
| Customer payment (Dr Bank / Cr AR, `ARPMT-`, `PaidAmount`, `Transactions` isCustomer=1, `JournalEntries`, `GlAuditEvents`) | Fail (BUG-ACC-001, BUG-ACC-010) | Records are written correctly apart from the period and bank account issues. |
| Vendor payment (Dr AP / Cr Bank, `APPMT-`) | Fail (BUG-ACC-001, BUG-ACC-010) | Same as customer payment. |
| Payroll net pay | See QA_Payroll.md | BUG-PAY-001 (no `Transactions` row). |
| Payroll tax remittance | See QA_Payroll.md | BUG-PAY-001. |
| Test: partial payments, overpayment rejection, payment into a closed period | Fail (BUG-ACC-001) | Partial and overpayment checks pass. The closed-period check uses the wrong key. |
| Test: payment from a bank at a location the user can't access | Fail (BUG-ACC-011) | |
| Test: reconciliation of each payment row | Pass | AR and AP rows appear in Bank Reconciliation. Payroll rows do not (BUG-PAY-001). |
| Test: void or delete blocked after payment | Fail (BUG-ACC-005) | It is blocked, but cannot be unblocked because no payment reversal exists. |
| Test: legacy `Payment` table | Manual | Manual Verification item 10. |

### 6.5 Bank Reconciliation

| Matrix Row | Result | Notes |
| --- | --- | --- |
| FE List (bank picker, transactions) | Pass | Bank list is location-filtered. |
| FE Search / Filter (reconciled, date, type) | Pass | |
| FE Sort / Pagination | Manual | |
| FE Start / Update / Complete period | Fail (BUG-ACC-012) | No statement-date ordering. |
| FE Reconcile (single and bulk) | Fail (BUG-ACC-014) | Completed items can be unticked. |
| FE Statement import (`BankStatementImportModal.tsx`) | Manual | Manual Verification item 1. |
| FE Export CSV | Manual | Manual Verification item 2. |
| FE Delete transaction (API only) | Fail (BUG-ACC-018) | Reconciled rows and journal-linked rows are blocked; the lock fallback is missing. |
| FE Validation (difference < 0.01; one open per bank) | Pass | Enforced on both UI and API, plus a filtered unique index. |
| FE Permissions / Responsive | Manual | |
| BE List/Get (`MapBankTransactionSign`) | Fail (BUG-ACC-011) | The sign mapping is correct. There is no bank location check. |
| BE Update (reconcile/bulk; start/update/complete; 409 when closed) | Fail (BUG-ACC-012, BUG-ACC-014) | 409 on a closed period passes. |
| BE Delete (impact, `DeleteTransaction`) | Fail (BUG-ACC-018) | |
| BE Authorization (bank location access) | Fail (BUG-ACC-011) | |
| BL Starting balance = previous completed ending balance (or opening balance) | Fail (BUG-ACC-012) | Correct for in-order statements only. |
| BL Recon status Open → Completed | Pass | Completed periods cannot be updated or completed again. |

### 6.6 Financial Reports

| Matrix Row | Result | Notes |
| --- | --- | --- |
| FE View (report picker, date/period, location) | Fail (BUG-ACC-008) | The default "This Month" gives a future as-of date. |
| FE Export PDF / CSV | Manual | Manual Verification item 3. |
| FE Drill-down (`ReportDrillDrawer`, 25 per page) | Potential (BUG-ACC-021) | |
| FE Filter (type, date range, comparison) | Fail (BUG-ACC-008) | |
| FE Permissions / Responsive | Manual | |
| BE Generate (all 8 report types) | Fail (BUG-ACC-006, BUG-ACC-007, BUG-ACC-008) | `request.TenantId` is trusted (Cross-Module Concerns, row a). |
| BE Authorization | Potential (BUG-ACC-023) | No location validation. |
| BL Fiscal year start from `AccountingDefaults` | Manual | Manual Verification item 4. |
| BL Aging buckets and 30/60/90 boundaries | Pass | Bucket logic is correct; the as-of input is wrong (BUG-ACC-008). Paid-as-of semantics: BUG-ACC-019. |
| BL Due date = invoice date + term days (`DueDateFromTerm`) | Pass | |
| BL Retained earnings plug keeps the balance sheet balanced; trial balance debits = credits | Fail (BUG-ACC-003, BUG-ACC-006, BUG-ACC-007) | |

### 6.7 Journal Entries

| Matrix Row | Result | Notes |
| --- | --- | --- |
| FE List (take 1–500) | Potential (BUG-ACC-022) | The UI requests 200. |
| FE Search / Filter (reference, date, source) | Pass | |
| FE Sort / Pagination | Potential (BUG-ACC-022) | |
| FE Add (manual journal entry) | Fail (BUG-ACC-003) | A 0.01 imbalance is accepted. |
| FE View (detail) | Pass | Shows reverses/reversed-by links. |
| FE Reverse | Fail (BUG-ACC-005) | Offered for auto-posted subledger journals. |
| FE Delete (API only) | Fail (BUG-ACC-009) | |
| FE Validation (balanced, ≥2 lines, active accounts, open period) | Fail (BUG-ACC-003, BUG-ACC-004) | Two or more lines and active accounts pass. |
| FE Permissions / Responsive | Manual | |
| BE List/Get | Pass | Tenant from body or query is trusted (Cross-Module Concerns, row a). |
| BE Create (`JournalEntries`, `GlAuditEvents`) | Fail (BUG-ACC-003, BUG-ACC-004) | |
| BE Reverse (audit `JournalReverse`; payroll guards) | Fail (BUG-ACC-005) | Payroll guards pass. |
| BE Delete (audit `JournalDelete`) | Fail (BUG-ACC-009) | |
| BE Authorization | Fail (see Cross-Module Concerns, rows a and b) | |

### 6.8 General Ledger

| Matrix Row | Result | Notes |
| --- | --- | --- |
| FE View (account picker, date range) | Pass | Only active accounts are listed. Drilling to an inactive account still runs, but the picker shows blank. |
| FE Deep link (`accountId`, `startDate`, `endDate`, `run=1`) | Pass | |
| FE Sort / Pagination / Export | Manual | No client paging or export controls were found in `GeneralLedger.tsx`. |
| FE Permissions / Responsive | Manual | |
| BE Get (`GeneralLedgerDetail`, running balance from 0) | Pass | Matches the matrix. Tie-out concern: BUG-ACC-021. Location: BUG-ACC-023. |

### 6.10 Accounting Periods / Period Close

| Matrix Row | Result | Notes |
| --- | --- | --- |
| FE List (closed periods, audit trail) | Pass | |
| FE Close (YYYYMM → confirmation) | Pass | |
| FE Reopen (confirmation) | Pass | |
| FE Cancel (no change; Esc closes) | Pass | |
| FE Validation (YYYYMM; already closed; missing reconciliation lists banks with location) | Pass | Live error rendering: Manual Verification item 6. |
| FE Permissions / Responsive | Manual | Server-side role enforcement: Cross-Module Concerns, row b. |
| BE List (`ListClosedPeriods`, `ListGlAuditTrail` take 150 / max 500) | Pass | Query tenantId trusted (Cross-Module Concerns, row a). |
| BE Close (409 already closed / reconciliation missing; ≤8 banks) | Pass | Unique Tenant+PeriodKey index present. |
| BE Open (404 if not closed) | Pass | |
| BE Authorization | Fail (see Cross-Module Concerns, rows a and b) | |
| BL Lock blocks invoice/bill posting, payments, JE create/reverse/delete, payroll posts, reconciliation changes | Fail (BUG-ACC-001, BUG-ACC-002, BUG-ACC-004, BUG-ACC-018; BUG-PAY-004) | JE reverse/delete and reconciliation changes pass. |

### 6.11 Accounting Setup

| Matrix Row | Result | Notes |
| --- | --- | --- |
| FE View / Edit (General, Default Accounts, Payment Terms, Approval Limits) | Pass | |
| FE Add / Delete rows | Fail (BUG-ACC-013) | Invalid rows are silently dropped and deactivated. |
| FE Validation (required default accounts; limits ≥ 0; term days ≥ 0) | Fail (BUG-ACC-013) | |
| FE Permissions / Responsive | Manual | |
| BE Get (seeds defaults) | Pass | |
| BE Save | Fail (BUG-ACC-013) | |
| BE GST (`GetGstStatus`, API only) | Pass | |

### 10.4 Accounting workflow

| Matrix Row | Result | Notes |
| --- | --- | --- |
| Customer / Vendor Invoice → Journal Entries (debits = credits; correct accounts; period stamped) | Fail (BUG-ACC-002, BUG-ACC-010) | Balanced. The customer invoice period comes from the server clock. |
| Invoice → Payment (`PaidAmount`, `isPaid`) | Fail (BUG-ACC-001, BUG-ACC-005) | |
| Payment → Cash Activity (dashboard and recent transactions match; bank balance updates) | Fail (BUG-ACC-015; BUG-PAY-001) | Payroll cash is missing from `Transactions` and from the bank balance. |
| Cash Activity → Bank Reconciliation (difference < 0.01; one open per bank) | Pass | Ordering issue: BUG-ACC-012. |
| Bank Reconciliation → Period Close (blocked when a bank lacks a reconciliation; lists banks with location; confirmation) | Pass | |
| Period Close → all posting modules (posting, payment, reversal, delete, reconciliation blocked; reopen allows; audit trail) | Fail (BUG-ACC-001, BUG-ACC-002, BUG-ACC-004, BUG-ACC-018) | |
| Payroll → Journal Entries / Bank (duplicate protection; reverse guards; reconciliation of payroll payments) | See QA_Payroll.md | BUG-PAY-001, BUG-PAY-002. |
| Journal Entries → GL / Financial Reports (running balance; trial balance balances; P&L and balance sheet tie out) | Fail (BUG-ACC-003, BUG-ACC-006, BUG-ACC-007) | |

## Cross-Module Concerns

| Concern | Where it shows up in Accounting | Owning file |
| --- | --- | --- |
| (a) Client-supplied tenantId trusted | `JournalEntryController.ResolveTenantId` (lines 24–30) for List, Get, Create, Reverse and GeneralLedgerDetail. `GenerateFinancialReport` (`AccountingController.cs` line 1333). `ListClosedPeriods`, `CloseAccountingPeriod`, `OpenAccountingPeriod`, `ListGlAuditTrail` (lines 1903–2040). `CheckJournalEntryDeletionImpact` and `DeleteJournalEntry` (lines 1778 and 1840; query tenant only). `CheckTransactionDeletionImpact` and `DeleteTransaction` (lines 1632 and 1710). | QA_TenantLocationFramework.md |
| (b) No server-side role/permission enforcement | Close and reopen period, `SaveAccountingSettings`, JE Create, Reverse and Delete, `DeleteTransaction`, and AP approval (apart from the amount limit) are protected only by authentication and UI route permissions. | QA_RolesPermissions.md |
