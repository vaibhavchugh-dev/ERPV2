# QA — Payroll (Payroll Journals)

| Module | Matrix section | Bug ID prefix | Tested | Confirmed Bugs | Potential Bugs | Manual Verification |
| --- | --- | --- | --- | --- | --- | --- |
| Payroll (Payroll Journals) | 6.9 | BUG-PAY | Yes | 8 | 5 | 8 |

Source of test cases: `QA_TEST_MATRIX.md`. Method: static trace of the actual implementation (React UI → service → Axios → .NET controller → service/repository → EF Core → SQL Server, and back). No application code, configuration or database is changed during QA. Findings that depend on deployed configuration, data or a real browser go under **Needs Manual Verification**.

Severity scale:
- **Critical**: security breach, data corruption, financial corruption, or a blocked core workflow.
- **High**: a major feature is broken or a significant security control is bypassed, with a workaround that is hard or unavailable.
- **Medium**: a feature works incorrectly in specific conditions, or a security control is weaker than configured.
- **Low**: cosmetic, minor UX, or an informational/hardening issue.

Scope: matrix 6.9 Payroll Journals (`PayrollJournalLinks.tsx`, `ImportPayrollWizard.tsx`, `ManualPayrollWizard.tsx`, `PayrollController`, `ManualPayrollJournalBuilder`, `PayrollImportCsvService`, `PayrollCashJournalService`), plus the payroll rows of 6.4 and 10.4. The integration-token defect behind CimmplePay `PostJournal` is BUG-AUTH-014 in `QA_Authentication.md` and is only referenced here.

---

## Confirmed Bugs

### BUG-PAY-001 — Payroll net-pay and tax-remittance payments never create bank Transactions, so payroll cash is invisible to Bank Reconciliation, bank balances and the dashboard
**Severity:** High. A major feature is broken: the payroll bank cannot be reconciled to its statement, which in turn blocks a clean period close. The only workaround is to reconcile outside the system.
**Status:** Confirmed
**Test Area:** 6.9 Payroll Journals / Payments; 6.4 Payroll net pay and tax remittance; 10.4 Payroll → Bank
**Description:** `PostPayment` writes a `PAYPMT-` journal entry (Dr Accrued Payroll / Cr payroll bank GL) and updates the link. `PostTaxRemittance` writes a `PAYTAX-` journal entry. Neither writes a `Transactions` row. Bank Reconciliation, the bank's current balance (`Bank/GetBanklist`), the Payment Dashboard cash-out figure and the cash flow calculators all read `Transactions`. The matrix lists `Transactions` as a record for both payroll payment types and requires "recon of payroll payments".
**Steps to Reproduce:**
1. Post a payroll journal (manual wizard) with net pay of 10,000.
2. On Payroll Journals, click Pay net pay and post the full amount.
3. Open Bank Reconciliation for the payroll bank, and open the Payment Dashboard.
4. Enter the bank statement ending balance, which includes the 10,000 payroll debit.
**Expected:** A 10,000 debit row appears for the payroll bank and can be reconciled. The bank's current balance and the dashboard cash out include it.
**Actual:** No row appears. The current balance and cash out exclude it. The reconciliation difference stays at 10,000, so the reconciliation cannot be completed and the period cannot be closed for that bank.
**Evidence:**
- Frontend: `Cimmple_UI/src/Modules/Accounting/PayrollJournalLinks.tsx` lines 170–234 (payment and remittance submit). `Cimmple_UI/src/Modules/Accounting/BankReconciliation.tsx` lists only `GetBankTransactions` rows.
- Backend: `Cimmple_API/CimmpleAPI/Controllers/PayrollController.cs` lines 321–366 (`PostPayment`: `JournalEntries`, `JournalEntryFrom`/`To`, link and audit only) and lines 475–519 (`PostTaxRemittance`: same, no `Transactions.Add`). Compare `InvoiceController.cs` line 1197 and `VendorInvoiceController.cs` line 802, which do write `Transactions`. `Cimmple_API/CimmpleAPI/Controllers/AccountingController.cs` lines 486–493 (reconciliation reads only `Transactions` of type Payment, Deposit or Withdrawal).
- Database: `JournalEntries` has `PAYPMT-…` and `PAYTAX-…`, and `Transactions` has no row with that bank and amount.
**Root Cause:** The payroll cash legs were implemented as GL-only postings.
**Business Impact:** The payroll bank cannot be reconciled. Bank balances and cash KPIs are overstated by all payroll disbursements.
**Affected Areas:** Payroll Journals, Bank Reconciliation, Bank master balance, Payment Dashboard, Cash Flow report, Period Close.
**Recommended Fix:** Inside the same database transaction, write a `Transactions` row (type Payment, `BankId` = payroll bank, `isCustomer` = 0, date, period, reference) for each `PAYPMT-` and `PAYTAX-` entry. Remove or offset it when the payment is reversed.

---

### BUG-PAY-002 — The same pay period can be posted twice through different entry paths (no pay-period duplicate check)
**Severity:** High. Payroll expense and liabilities can be accrued twice for one pay period, despite the matrix's "duplicate period protection".
**Status:** Confirmed
**Test Area:** 6.9 Payroll Journals / Validation (duplicate period protection)
**Description:** Duplicate detection is keyed only on (Source + ExternalRunId) and on ReferenceNumber. Neither includes the pay period:
- Manual uses `MANUAL-{start}-{end}-{payDate}` with reference `MANUAL-{payDate}`.
- Import uses `IMPORT-{fileHash16}` (or the CSV run id) with reference `IMPORT-{payDate}`.
- CimmplePay uses its own run id.
Posting the same pay period once through the Manual wizard and once through Import (or CimmplePay) therefore creates two accruals. Nothing compares `PayPeriodStart`/`PayPeriodEnd`.
**Steps to Reproduce:**
1. In the Manual wizard, post a payroll run for pay period 2026-09-01 to 2026-09-15, pay date 2026-09-20.
2. In the Import wizard, upload the provider CSV for the same period and pay date, then post.
**Expected:** The second post is rejected or warned: "A payroll journal for 2026-09-01 to 2026-09-15 already exists (MANUAL-20260920)".
**Actual:** Both post. Two `PayrollJournalLink` rows are Posted and two accrual journal entries exist for the same period.
**Evidence:**
- Frontend: `Cimmple_UI/src/Modules/Accounting/ImportPayrollWizard.tsx` lines 176 and 426 (run id defaults from the file and can be edited) and lines 252–256 (only an `alreadyExists` message). `Cimmple_UI/src/Modules/Accounting/ManualPayrollWizard.tsx` lines 225–231.
- Backend: `Cimmple_API/CimmpleAPI/Controllers/PayrollController.cs` lines 852–873 (Source + ExternalRunId check) and lines 906–923 (ReferenceNumber check). There is no pay-period query. `Cimmple_API/CimmpleAPI/Services/ManualPayrollJournalBuilder.cs` lines 117–135 (prefix-specific reference and run id). `Cimmple_API/CimmpleAPI/Services/PayrollImportCsvService.cs` line 187 (`IMPORT-{hash}` run id).
- Database: the filtered unique index `IX_PayrollJournalLink_Tenant_Source_External` (`AccountingGapSchemaService.cs` lines 227–231) is per Source, so it cannot catch cross-source duplicates.
**Root Cause:** Idempotency keys identify a submission, not a pay period.
**Business Impact:** Payroll expense and liabilities are doubled, and net pay may be disbursed twice from the duplicate link.
**Affected Areas:** Manual wizard, Import wizard, CimmplePay `PostJournal`, Payroll cash payments, P&L.
**Recommended Fix:** Before posting, check for an existing Posted link in the tenant (and location) with overlapping `PayPeriodStart`/`PayPeriodEnd` and the same pay date. Block it, or require explicit confirmation.

---

### BUG-PAY-003 — Payroll journals can post with a 0.01 imbalance, and the preview (0.02) and post (0.01) tolerances disagree
**Severity:** High. An unbalanced payroll journal puts the ledger out of balance, and the trial balance reports it. It is rated High rather than Critical because the matrix documents a tolerance (0.02) for payroll; however, no rounding line is posted to absorb it.
**Status:** Confirmed
**Test Area:** 6.9 Payroll Journals / Validation (balanced, 0.02 tolerance)
**Description:** `ManualPayrollJournalBuilder` marks a run as postable when `|Dr − Cr| ≤ 0.02`. `PostJournal` rejects only when the difference is `> 0.01`, and saves the lines as given. So:
- A difference of 0.01 posts an unbalanced journal entry.
- A difference of 0.02 shows "can post" in the preview, but the post then fails with "Debits must equal credits".
`TrialBalanceReportService` treats a difference of 0.01 or more as unbalanced.
**Steps to Reproduce:**
1. In the Manual wizard, enter gross 5,000.00 and withholdings that leave a computed net of 3,417.50, then type net pay 3,417.49 (0.01 off). Preview, then post.
2. Run the Trial Balance.
3. Repeat with net pay 3,417.48 (0.02 off).
**Expected:** Either the journal posts exactly balanced (for example with a rounding line), or it is blocked in both preview and post.
**Actual:** Step 1 posts a journal with debits ≠ credits, and the trial balance shows `IsBalanced = false`. Step 3 previews as postable, then post returns 400.
**Evidence:**
- Frontend: `Cimmple_UI/src/Modules/Accounting/ManualPayrollWizard.tsx` lines 181–231 (preview, then post).
- Backend: `Cimmple_API/CimmpleAPI/Services/ManualPayrollJournalBuilder.cs` line 14 (`BalanceTolerance = 0.02m`) and lines 107–110 (`canPost`). `Cimmple_API/CimmpleAPI/Controllers/PayrollController.cs` lines 771–777 (built result gate) and line 890 (`> 0.01m`). `Cimmple_API/CimmpleAPI/Services/TrialBalanceReportService.cs` line 72.
- Database: `JournalEntryFrom` and `JournalEntryTo` totals differ by 0.01 for the payroll `JournalEntryId`.
**Root Cause:** Two different tolerances, and no rounding plug.
**Business Impact:** The trial balance and balance sheet are out of balance, and users are confused when a preview says "can post" but posting fails.
**Affected Areas:** Manual wizard, Import wizard, CimmplePay `PostJournal`, Trial Balance, Balance Sheet.
**Recommended Fix:** Use one tolerance constant in the builder and in `PostJournal`. When the difference is within tolerance, add an explicit rounding line to a configured account so the stored journal is exactly balanced.

---

### BUG-PAY-004 — PostJournal checks the period lock against the client-supplied AccountingPeriod, not the entry date (CimmplePay/API)
**Severity:** High. A payroll accrual can be posted into a closed period through the integration API. The UI wizards derive the period from the entry date and are not affected.
**Status:** Confirmed
**Test Area:** 6.9 Payroll Journals / CimmplePay integration / Validation (open period)
**Description:** `PostJournal` uses `request.AccountingPeriod` as the lock key whenever it is a valid YYYYMM. It falls back to `PeriodKeyFromDate(entryDate)` only when that field is missing or invalid. The journal entry is saved with the client's `EntryDate` and period, which can fall in different months.
**Steps to Reproduce:**
1. Close 202609.
2. With an integration token, POST `/api/Payroll/PostJournal` with `entryDate` "2026-09-30", `accountingPeriod` "202610" and balanced lines.
**Expected:** 400 "Accounting period 202609 is closed".
**Actual:** 200. The accrual is dated 2026-09-30 in a closed month.
**Evidence:**
- Backend: `Cimmple_API/CimmpleAPI/Controllers/PayrollController.cs` lines 901 and 926–933. The manual and import paths set the period from the entry date (`ManualPayrollJournalBuilder.cs` lines 122–123) and pass it through (`PayrollController.cs` line 793).
- Database: `JournalEntries` row with `EntryDate` in a locked month and an open `AccountingPeriod`.
**Root Cause:** The lock key is caller-controlled.
**Business Impact:** Closed-period payroll expense changes after close.
**Affected Areas:** CimmplePay integration, Period Close. The same pattern exists in Journal Entries (BUG-ACC-004). The integration identity issue is BUG-AUTH-014.
**Recommended Fix:** Lock-check `PeriodKeyFromDate(entryDate)` and reject a mismatched `AccountingPeriod`.

---

### BUG-PAY-005 — Distinct payroll runs that share a pay date are reported as "Already posted" and silently not posted
**Severity:** Medium. A legitimate payroll run (for example a second pay group or an off-cycle run on the same pay date) is never accrued unless the user notices the message and types a custom reference.
**Status:** Confirmed
**Test Area:** 6.9 Payroll Journals / Manual wizard / Import wizard
**Description:** When the reference is left blank (the wizard default), the builder sets it to `MANUAL-{payDate}` or `IMPORT-{payDate}`. `PostJournal` then returns `alreadyExists = true` for any existing Posted link with that reference, before checking period, amounts or run id. A second, different run for another pay period with the same pay date is therefore treated as a duplicate.
**Steps to Reproduce:**
1. In the Manual wizard, post the weekly payroll: period 2026-10-05 to 2026-10-11, pay date 2026-10-16, reference left blank.
2. Post the semi-monthly payroll: period 2026-10-01 to 2026-10-15, pay date 2026-10-16, reference left blank.
**Expected:** The second run posts, because it is a different pay period with a different run id.
**Actual:** The toast says "Already posted (MANUAL-20261016)" and no journal entry is created for the second run.
**Evidence:**
- Frontend: `Cimmple_UI/src/Modules/Accounting/ManualPayrollWizard.tsx` line 93 (reference blank by default), line 151 (sent as undefined) and lines 227–231 ("Already posted" toast). `ImportPayrollWizard.tsx` lines 112, 135 and 254–256.
- Backend: `Cimmple_API/CimmpleAPI/Services/ManualPayrollJournalBuilder.cs` lines 125–127 (default reference from the pay date only). `Cimmple_API/CimmpleAPI/Controllers/PayrollController.cs` lines 906–923 (reference lookup returns `alreadyExists`).
- Database: only one `PayrollJournalLink` for that pay date.
**Root Cause:** The default reference is not unique per run, and a reference collision is treated as idempotent success.
**Business Impact:** Payroll expense and liabilities are understated, and net pay for the missing run cannot be paid through the app.
**Affected Areas:** Manual wizard, Import wizard.
**Recommended Fix:** Include the pay period (or the run id) in the default reference. When the reference matches but the run id or period differs, return a conflict error instead of `alreadyExists`.

---

### BUG-PAY-006 — RegisterExisting accepts reversed, reversal, payment and non-payroll journals, enabling net pay against a cancelled accrual
**Severity:** Medium. Incorrect in specific conditions: a link can be created on a reversed accrual and then paid, leaving Accrued Payroll with a debit balance.
**Status:** Confirmed
**Test Area:** 6.9 Payroll Journals / Register existing JE / Backend Create
**Description:** `RegisterExisting` only checks that the journal entry exists in the tenant and has no Posted link. It does not reject:
- entries with `ReversedByJournalEntryId` set
- reversal entries (`ReversesJournalEntryId`)
- `PAYPMT-`/`PAYTAX-` entries
- entries without an Accrued Payroll credit
It also does not check that the user can access the journal entry's location. A Posted link is created, and `PostPayment` then computes "remaining net pay" from the reversed accrual.
**Steps to Reproduce:**
1. Post a payroll accrual, then reverse it on Journal Entries (no payments exist yet). The link becomes Reversed.
2. POST `/api/Payroll/RegisterExisting` with the original accrual `journalEntryId`.
3. POST `/api/Payroll/PostPayment` for the new link.
**Expected:** Step 2 is rejected: "Journal entry has been reversed".
**Actual:** Step 2 creates a Posted link. Step 3 posts a `PAYPMT-` journal entry against an accrual that no longer exists in substance.
**Evidence:**
- Frontend: no UI caller. `AccountingService.RegisterPayrollJournal` (`AccountingService.ts` lines 550–564) is unused.
- Backend: `Cimmple_API/CimmpleAPI/Controllers/PayrollController.cs` lines 1054–1057 (existence only), lines 1088–1102 (only Posted links are checked, so a Reversed link allows re-registration) and lines 1108–1127 (link created with `LocationId = je.locationId` and no access check). Lines 250–252 compute the payment base from the linked journal entry.
- Database: a `PayrollJournalLink` with Status Posted whose `JournalEntryId` has `ReversedByJournalEntryId` set.
**Root Cause:** Missing eligibility validation on the journal entry being registered.
**Business Impact:** Payroll cash can be disbursed against cancelled accruals.
**Affected Areas:** RegisterExisting, PostPayment, PostTaxRemittance.
**Recommended Fix:** Reject journals that are reversed, are themselves reversals, are payroll cash journals, or have no credit to the Net Pay Payable account. Validate the location with `CanAccessLocation`.

---

### BUG-PAY-007 — PostPayment and PostTaxRemittance accept any BankId without tenant, location or active checks (API)
**Severity:** Low. A hardening issue: the UI sends no `bankId` and uses the configured payroll bank, so only direct API callers are affected.
**Status:** Confirmed
**Test Area:** 6.9 Payroll Journals / Payments / Authorization
**Description:** `request.BankId` is passed straight to `ResolvePayrollBank` → `ResolveBank`. A bank from another site, an inactive bank, an unmapped bank or a non-existent id falls back to a keyword-matched "bank"/"cash" GL account (see BUG-ACC-010). The supplied id is stored in `PaymentBankId`.
**Steps to Reproduce:**
1. POST `/api/Payroll/PostPayment` with `linkId` = a valid link and `bankId` = 999999.
**Expected:** 400 "Bank not found", or 403 for a bank at a non-allowed site.
**Actual:** 200. Cash is credited to a guessed account, and `PaymentBankId` = 999999.
**Evidence:**
- Frontend: `Cimmple_UI/src/Modules/Accounting/PayrollJournalLinks.tsx` lines 178–181 and 215–219 (no `bankId` sent).
- Backend: `Cimmple_API/CimmpleAPI/Controllers/PayrollController.cs` lines 240–248 and 358, and lines 437–445. `Cimmple_API/CimmpleAPI/Services/GlAccountResolutionService.cs` lines 256–295 and 301–329.
- Database: `PayrollJournalLink.PaymentBankId` references a non-existent or foreign bank.
**Root Cause:** No bank validation before resolution.
**Business Impact:** Payroll cash can be posted to the wrong account with an invalid bank reference.
**Affected Areas:** Payroll payments, Bank Reconciliation (after BUG-PAY-001 is fixed).
**Recommended Fix:** Load the bank by id and tenant, require it to be active and accessible by location, and return an error if it is not mapped.

---

### BUG-PAY-008 — Payroll Journals page lacks the matrix's Register-existing action and Status filter
**Severity:** Low. Minor feature gaps. The API exists, and status can only be found through free-text search.
**Status:** Confirmed
**Test Area:** 6.9 Payroll Journals / List / Filter / Register existing JE
**Description:** The matrix lists "Filter / Search / Sort: Status Posted/Reversed, date" and "Register existing JE: Action → POST `/Payroll/RegisterExisting`". The page offers Source and date filters plus text search, but no status dropdown and no Register action. The service method exists but has no caller.
**Steps to Reproduce:**
1. Open `/accounts/payroll`.
2. Look for a Status filter and a "Register existing journal" action.
**Expected:** Both are available, as the matrix lists.
**Actual:** Neither exists. Status is matched only through the search box.
**Evidence:**
- Frontend: `Cimmple_UI/src/Modules/Accounting/PayrollJournalLinks.tsx` lines 463–529 (filters) and line 431 (search includes status). `Cimmple_UI/src/Common/Services/AccountingService.ts` lines 550–564 (`RegisterPayrollJournal`, unused).
- Backend: `Cimmple_API/CimmpleAPI/Controllers/PayrollController.cs` lines 1041–1145 (endpoint present).
**Root Cause:** The UI was not built for these matrix rows.
**Business Impact:** Accountants cannot link journals posted outside the wizards from the UI, and reviewing reversed runs is slower.
**Affected Areas:** Payroll Journals list.
**Recommended Fix:** Add a Status filter (Posted/Reversed/All) and a Register-existing action that picks a journal entry (with the validation from BUG-PAY-006).

---

## Potential Bugs

### BUG-PAY-009 — Tax remittance lines are not capped at the accrued payable balances and accept any active account
**Severity:** Medium. Liability accounts could be over-debited, or non-liability accounts debited, through the remittance flow.
**Status:** Potential
**Test Area:** 6.9 Payroll Journals / Cash preview / pay (tax remittance)
**Description:** `CashPreview` suggests tax lines from the accrual's payable credits, but the modal lets the user edit the amounts and `PostTaxRemittance` accepts any positive amount on any active tenant account. Remitting 1,000 against a 600 Federal Withholding payable leaves a 400 debit balance on the liability.
**Steps to Reproduce:**
1. Open Remit taxes on a link with Federal Withholding payable of 600.
2. Change the amount to 1,000 and post.
**Expected:** Each line is capped at the open payable amount and limited to payroll payable accounts, as the matrix's "Dr selected tax/deduction payables" implies.
**Actual:** Posts 1,000.
**Evidence:**
- Frontend: `Cimmple_UI/src/Modules/Accounting/PayrollJournalLinks.tsx` lines 695–718 (editable, uncapped amounts).
- Backend: `Cimmple_API/CimmpleAPI/Controllers/PayrollController.cs` lines 447–459 (only `amt > 0` and an active-account check). `Cimmple_API/CimmpleAPI/Services/PayrollCashJournalService.cs` lines 23–59 (suggested lines exist but are not enforced).
**Root Cause:** The suggestions are not enforced server-side.
**Business Impact:** Payroll liabilities can be misstated.
**Affected Areas:** Tax remittance, Balance Sheet liabilities.
**Recommended Fix:** Validate each line against the payable credits from the accrual, minus any prior remittance, and restrict accounts to the configured payroll payables.
**Why further verification is needed:** Overriding amounts may be intentional (for example, remitting penalties or combined deposits). The product owner must confirm whether caps are required.

---

### BUG-PAY-010 — CSV import converts negative amounts to positive, inflating totals when a file contains correction rows
**Severity:** Medium. A detail-level CSV with an adjustment row (for example −200 gross for a correction) would add 200 instead of subtracting it.
**Status:** Potential
**Test Area:** 6.9 Payroll Journals / Import wizard
**Description:** `AddAmount` applies `Math.Abs` to every parsed money value ("treat parentheses/negatives as absolute contribution"). This suits exports that show deductions as negatives, but it also flips true negative adjustments in earnings, tax or net columns.
**Steps to Reproduce:**
1. Import a per-employee CSV with two rows for employee A: gross 2,000, then gross −200 (a correction), with matching tax and net adjustments.
2. Preview.
**Expected:** Gross total 1,800.
**Actual:** Gross total 2,200, and other buckets inflated by the same pattern.
**Evidence:**
- Backend: `Cimmple_API/CimmpleAPI/Services/PayrollImportCsvService.cs` line 241.
**Root Cause:** The sign is discarded for all columns.
**Business Impact:** Payroll expense and liabilities are overstated for files that contain corrections.
**Affected Areas:** Import wizard, posted payroll journals.
**Recommended Fix:** Keep the sign for earnings, tax and net columns, or let the user choose a sign convention per column during mapping.
**Why further verification is needed:** It depends on the payroll providers' export formats, and the preview totals may let users notice before posting.

---

### BUG-PAY-011 — Concurrent net-pay posts for the same link can both succeed (double payment)
**Severity:** Medium. Two users or tabs could each pay the full remaining net pay.
**Status:** Potential
**Test Area:** 6.9 Payroll Journals / Cash preview / pay
**Description:** `PostPayment` reads `link.PaymentAmount`, computes the remaining amount, and inserts a `PAYPMT-` journal entry inside a transaction at the default isolation level. There is no row lock, concurrency token or unique constraint on payment journals per link. The UI disables the button only in the current tab (`cashPosting`).
**Steps to Reproduce:**
1. Open the same link's Pay net pay modal in two browser tabs.
2. Submit the full amount in both at nearly the same time.
**Expected:** One succeeds and the other returns "already fully paid".
**Actual (suspected):** Both post. Accrued Payroll is over-debited and the bank is credited twice.
**Evidence:**
- Frontend: `Cimmple_UI/src/Modules/Accounting/PayrollJournalLinks.tsx` lines 175–197.
- Backend: `Cimmple_API/CimmpleAPI/Controllers/PayrollController.cs` lines 250–294 (remaining computed from the tracked link) and lines 321–366 (insert and update, no concurrency check). `CimmpleDbContext.cs` lines 713–727 (no row-version column on `PayrollJournalLink`).
**Root Cause:** Read-then-write without concurrency control.
**Business Impact:** Possible double net-pay payment journal.
**Affected Areas:** Payroll payments.
**Recommended Fix:** Use a row-version on the link, or `UPDLOCK` when reading it, and recheck the remaining amount before inserting.
**Why further verification is needed:** The race needs runtime timing to confirm.

---

### BUG-PAY-012 — Fuzzy header matching can map YTD or unrelated columns into current-period buckets
**Severity:** Low. Mapping errors can be corrected in the wizard before posting.
**Status:** Potential
**Test Area:** 6.9 Payroll Journals / Import wizard (parse)
**Description:** When there is no exact alias match, the parser assigns a header to the first bucket whose alias is contained in the header, or which contains the header (aliases of four or more characters). "Gross Pay YTD" contains "grosspay" and maps to Gross wages. "Federal Tax YTD" maps to Federal tax. A short header such as "Pay" is contained in "grosspay" and maps to Gross wages. YTD amounts would then be summed into the current run.
**Steps to Reproduce:**
1. Import a CSV with columns "Gross Pay" and "Gross Pay YTD".
2. Check the proposed mapping and the preview totals.
**Expected:** YTD columns are ignored by default.
**Actual (suspected):** Both columns map to Gross wages, and the totals include YTD.
**Evidence:**
- Backend: `Cimmple_API/CimmpleAPI/Services/PayrollImportCsvService.cs` lines 37, 275 and 280.
- Frontend: `Cimmple_UI/src/Modules/Accounting/ImportPayrollWizard.tsx` lines 57–60 and 120 (bucket options allow an override).
**Root Cause:** Over-permissive substring matching.
**Business Impact:** Inflated imports if the user does not review the mapping.
**Affected Areas:** Import wizard.
**Recommended Fix:** Exclude headers containing "ytd" from auto-mapping, and drop the reverse `a.Contains(norm)` rule.
**Why further verification is needed:** It depends on real provider headers and on whether the wizard highlights duplicate bucket mappings.

---

### BUG-PAY-013 — Payroll Journals list loads only the latest 200 links with no paging
**Severity:** Low. Older runs are reachable only by narrowing the date filters.
**Status:** Potential
**Test Area:** 6.9 Payroll Journals / List / Pagination
**Description:** The page requests `take: 200`. Client search and sort apply only to that set.
**Steps to Reproduce:**
1. In a tenant with more than 200 payroll links in range, search for an old reference.
**Expected:** Found, or reachable by paging.
**Actual:** Not found unless the date range is narrowed.
**Evidence:**
- Frontend: `Cimmple_UI/src/Modules/Accounting/PayrollJournalLinks.tsx` line 97.
- Backend: `Cimmple_API/CimmpleAPI/Controllers/PayrollController.cs` lines 24–126.
**Root Cause:** Fixed client cap.
**Business Impact:** Older runs are harder to find for payment or reversal.
**Affected Areas:** Payroll Journals list.
**Recommended Fix:** Add server paging, or show a "showing latest 200" notice.
**Why further verification is needed:** Weekly payroll reaches 200 runs only after several years. The matrix does not specify paging.

---

## Needs Manual Verification

1. **Area:** 6.9 CimmplePay integration
   **What to Test:** Obtain a token from `Auth/IntegrationToken` and call `PostJournal` with source CimmplePay. Repeat with the same `externalRunId`.
   **Expected:** The first call posts. The repeat returns `alreadyExists`. The audit and `createdby` identify the integration (see BUG-AUTH-014).
   **Why Manual Testing Is Required:** It needs the deployed integration configuration and credentials.
2. **Area:** 6.9 Duplicate submission (database index)
   **What to Test:** Fire two identical `PostImport` requests at the same time.
   **Expected:** One posts. The other returns `alreadyExists` or a friendly duplicate error, not a raw SQL message.
   **Why Manual Testing Is Required:** The filtered unique index `IX_PayrollJournalLink_Tenant_Source_External` turns the race into a database exception. The 500 handler returns `ex.Message`, and its text needs a runtime check.
3. **Area:** 6.9 Import wizard with real provider files
   **What to Test:** Import CSVs from ADP, Gusto, Paychex and QuickBooks (summary and per-employee formats), including parentheses and negatives.
   **Expected:** The headers auto-map correctly and the totals match the provider register.
   **Why Manual Testing Is Required:** It depends on external file formats (see BUG-PAY-010 and BUG-PAY-012).
4. **Area:** 6.9 Large CSV upload
   **What to Test:** Upload a large CSV (5–20 MB) through `ParseImportCsv`.
   **Expected:** It is parsed, or rejected with a clear size message.
   **Why Manual Testing Is Required:** `CsvText` has no explicit size limit in the code, so behavior depends on Kestrel and IIS request limits.
5. **Area:** 6.9 Reverse guards from the UI
   **What to Test:** On Journal Entries, try to reverse a payroll accrual that has a net-pay payment, then reverse the payment, then the accrual.
   **Expected:** The first attempt is blocked with the guard message. After the payment is reversed, the accrual reverses and the link becomes Reversed.
   **Why Manual Testing Is Required:** It confirms the end-to-end lifecycle and the toast messages.
6. **Area:** 6.9 Permissions
   **What to Test:** Give a role only `/accounts/payroll`, then open `/accounts/payroll/import` and `/accounts/payroll/manual`.
   **Expected:** Wizard access follows the configured permissions.
   **Why Manual Testing Is Required:** Route permission matching is data-driven (server-side enforcement is tracked in QA_RolesPermissions.md).
7. **Area:** 6.9 Responsive
   **What to Test:** Complete the Manual and Import wizard steps and the payment modals on a phone.
   **Expected:** The steps are usable and the tables scroll.
   **Why Manual Testing Is Required:** It needs a real device or emulator.
8. **Area:** 6.9 Payroll bank location
   **What to Test:** Set a Default Payroll Bank at Site B, then post a payment as a Site A user.
   **Expected:** Behavior matches matrix 11.2 ("Payroll: tenant-wide; bank from setup") with the expected location handling.
   **Why Manual Testing Is Required:** The matrix does not define the expected outcome for a restricted user, so the product owner should confirm it.

## No Issues Found

- Payroll reverse guards block reversing an accrual that has a payment or remittance, and reversing a payment that has a remittance. The link lifecycle (Reversed, payment amount reduction, remittance cleared) is applied on reverse (`JournalEntryController.cs` lines 650–747).
- `PostPayment` caps the amount at the remaining net pay, supports partial payments with unique `PAYPMT-{linkId}-{seq}` references, and returns `alreadyExists` when fully paid (`PayrollController.cs` lines 250–319).
- Payment and remittance require a Posted link, and only one remittance journal is allowed per link (`PayrollController.cs` lines 418–433).
- Payment and remittance check the period lock against the payment date (`PayrollController.cs` lines 296–299 and 461–464).
- Manual and Import journals derive the accounting period from the entry date, which defaults to the pay date (`ManualPayrollJournalBuilder.cs` lines 122–123).
- `PostJournal` requires two or more lines, single-sided non-negative amounts, and active accounts in the tenant (`PayrollController.cs` lines 840 and 875–899).
- Missing payroll GL defaults are listed by name before posting (`PayrollController.cs` lines 762–769).
- Idempotency on Source + ExternalRunId is backed by a filtered unique index (`AccountingGapSchemaService.cs` lines 227–231).
- `PostImport` and the Import wizard require an External run id (`ImportPayrollWizard.tsx` lines 223–226).
- The import template sample is balanced (gross 5,000 = net 3,417.50 + withholdings + deductions).
- Payment and remittance check access to the link's location through `TryResolveLocationId` (`PayrollController.cs` lines 301–303 and 466–468).

## QA Coverage

| Test Area | Tested | Result |
| --- | --- | --- |
| Navigation | Yes | Pass |
| CRUD | Yes | Fail (BUG-PAY-002, BUG-PAY-005, BUG-PAY-006) |
| Search | Yes | Pass |
| Filters | Yes | Fail (BUG-PAY-008) |
| Sorting | Partial | Manual |
| Pagination | Partial | Potential (BUG-PAY-013) |
| Validation | Yes | Fail (BUG-PAY-002, BUG-PAY-003, BUG-PAY-004) |
| Permissions | Partial | Manual (server-side role enforcement: see Cross-Module Concerns) |
| API | Yes | Fail (BUG-PAY-004, BUG-PAY-006, BUG-PAY-007) |
| Database | Yes | Fail (BUG-PAY-001) |
| Business Logic | Yes | Fail (BUG-PAY-001, BUG-PAY-002, BUG-PAY-003, BUG-PAY-005); Potential (BUG-PAY-009, BUG-PAY-010, BUG-PAY-011) |
| Location | Partial | Fail (BUG-PAY-006, BUG-PAY-007) |
| Tenant | Yes | Fail (see Cross-Module Concerns, row a) |
| Cross-Module | Yes | Fail (BUG-PAY-001) |
| Responsive/PWA | No | Manual |

## Matrix Checklist

### 6.9 Payroll Journals — Frontend

| Matrix Row | Result | Notes |
| --- | --- | --- |
| List (`PayrollJournalLinks.tsx` + `PayrollJournalsHelp.tsx`; GET `/Payroll/List`) | Potential (BUG-PAY-013) | Loads the latest 200. Help panel present. |
| Filter / Search / Sort (Status Posted/Reversed, date) | Fail (BUG-PAY-008) | Date and Source filters plus text search exist; there is no status filter. |
| Register existing JE (POST `RegisterExisting`) | Fail (BUG-PAY-008, BUG-PAY-006) | No UI action, and the API lacks eligibility checks. |
| Cash preview / pay (net pay, tax remittance) | Fail (BUG-PAY-001); Potential (BUG-PAY-009, BUG-PAY-011) | Partial and capped net pay passes. |
| Import wizard (template, parse, preview, post) | Fail (BUG-PAY-002, BUG-PAY-005); Potential (BUG-PAY-010, BUG-PAY-012) | Template is balanced, and the run id is required. |
| Manual wizard (`PreviewManual`, `PostManual`) | Fail (BUG-PAY-003, BUG-PAY-005) | |
| CimmplePay integration (API only, `PostJournal` via integration token) | Fail (BUG-PAY-004) | Token identity issue: BUG-AUTH-014. Manual Verification item 1. |
| Validation (balanced 0.02 tolerance; duplicate period protection; open period) | Fail (BUG-PAY-002, BUG-PAY-003, BUG-PAY-004) | |
| Permissions / Responsive (`/accounts/payroll*`; wizard steps on phone) | Manual | Manual Verification items 6 and 7. |

### 6.9 Payroll Journals — Backend

| Matrix Row | Result | Notes |
| --- | --- | --- |
| List (`List`, `CashPreview`) | Pass | Tenant from body or query is trusted (Cross-Module Concerns, row a). |
| Create (`PostManual`, `PostImport`, `PostJournal`, `RegisterExisting`; `ManualPayrollJournalBuilder`) | Fail (BUG-PAY-002, BUG-PAY-003, BUG-PAY-004, BUG-PAY-005, BUG-PAY-006) | |
| Payments (`PostPayment`, `PostTaxRemittance` → `Transactions`) | Fail (BUG-PAY-001, BUG-PAY-007) | No `Transactions` rows are written. |
| Validation (`ValidatePayrollReverseGuards`; duplicates) | Fail (BUG-PAY-002) | Reverse guards pass. Delete bypasses them (BUG-ACC-009). |
| Authorization (authenticated; integration token for CimmplePay) | Fail (see Cross-Module Concerns) | BUG-AUTH-014 referenced. |

### 6.4 Payments — payroll rows

| Matrix Row | Result | Notes |
| --- | --- | --- |
| Payroll net pay (Dr Accrued Payroll / Cr payroll bank, `PAYPMT-`, audit `PayrollNetPayPayment`, idempotent per link; `PayrollJournalLinks`, `JournalEntries`, `Transactions`) | Fail (BUG-PAY-001) | The journal entry, audit and link update are correct. `Transactions` is missing. |
| Payroll tax remittance (Dr selected payables / Cr payroll bank, `PAYTAX-`, one per link) | Fail (BUG-PAY-001); Potential (BUG-PAY-009) | One per link passes. |
| Test: payment into a closed period | Pass | Locked by payment date. |
| Test: reconciliation of each payment row | Fail (BUG-PAY-001) | |

### 10.4 Accounting workflow — payroll row

| Matrix Row | Result | Notes |
| --- | --- | --- |
| Payroll (CimmplePay / import / manual) → Journal Entries / Bank: duplicate protection | Fail (BUG-PAY-002, BUG-PAY-005) | |
| Reverse guards | Pass | Delete bypass tracked as BUG-ACC-009. |
| Reconciliation of payroll payments | Fail (BUG-PAY-001) | |

## Cross-Module Concerns

| Concern | Where it shows up in Payroll | Owning file |
| --- | --- | --- |
| (a) Client-supplied tenantId trusted | `PayrollController.ResolveTenantId` (lines 1147–1151) prefers `request.TenantId` or the query tenant over the token for List, CashPreview, PostPayment, PostTaxRemittance, PreviewManual, PostManual, ParseImportCsv, PreviewImport, PostImport, PostJournal and RegisterExisting. | QA_TenantLocationFramework.md |
| (b) No server-side role/permission enforcement | Posting payroll journals, payments and remittances, and RegisterExisting, require only authentication. | QA_RolesPermissions.md |
| Integration token identity (userId 0) used by CimmplePay `PostJournal` | Audit and `createdby` for integration posts. | QA_Authentication.md (BUG-AUTH-014) |
