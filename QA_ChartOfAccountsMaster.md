# QA — Chart of Accounts Master

| Module | Matrix section | Bug ID prefix | Tested | Fix Tested | Confirmed Bugs | Potential Bugs | Manual Verification |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Chart of Accounts Master | 2.14 | BUG-COA | Yes | Yes | 7 | 2 | 5 |

Source of test cases: `QA_TEST_MATRIX.md`. Method: static trace of the actual implementation (React UI → service → Axios → .NET controller → service/repository → EF Core → SQL Server, and back). No application code, configuration or database is changed during QA. Findings that depend on deployed configuration, data or a real browser go under **Needs Manual Verification**.

Severity scale:
- **Critical**: security breach, data corruption, financial corruption, or a blocked core workflow.
- **High**: a major feature is broken or a significant security control is bypassed, with a workaround that is hard or unavailable.
- **Medium**: a feature works incorrectly in specific conditions, or a security control is weaker than configured.
- **Low**: cosmetic, minor UX, or an informational/hardening issue.

---

## Confirmed Bugs

### BUG-COA-001 — `DeleteChartofAccount` deletes accounts that carry posted journal lines and transactions
**Severity:** Critical. One API call by any authenticated user removes a GL account referenced by posted entries, corrupting the ledger and financial reports.
**Status:** Confirmed
**Test Area:** CRUD (delete) / Business Logic / Database
**Description:** The matrix says COA delete is blocked by banks, credit cards, mappings, deposits, withdrawals, journal entries and TransCoa. Those checks live only in `CheckChartofAccountDeletionImpact`, which the UI calls first. `DeleteChartofAccount` performs no check: it deletes the vendor and bank COA mappings and then the account. There are no foreign keys from journal lines or transactions to `ChartofAccounts`, so the database does not stop it either.
**Steps to Reproduce:**
1. Pick an account used by posted journal entries (impact dialog shows "Cannot Delete").
2. Send `DELETE /api/ChartofAccounts/DeleteChartofAccount?accountId=<id>&tenantId=<tenant>` with a valid token.
3. Open Trial Balance / GL activity for the period.
**Expected:** 409 "Account is in use"; nothing deleted.
**Actual:** 200 "Chart of Account deleted successfully"; journal lines, deposits and withdrawals keep a dangling `AccountId`.
**Evidence:**
* Frontend: `Cimmple_UI/src/Common/Components/DeletionImpactDialog.tsx` lines 91-171 (the UI only hides the confirm button).
* Backend: `Cimmple_API/CimmpleAPI/Controllers/ChartofAccountsController.cs` lines 730-764 (no dependency checks), compare 510-655 (checks only in the impact endpoint).
* Database: `JournalDetailsFrom/To.AccountId`, `Deposits.AccountID`, `Withdrawals.AccountID`, `TransCoa.accountid` (`Cimmple_API/CimmpleAPI/Data/Models/Transaction.cs` lines 40, 56, 106, 116, 127) have no FK to `ChartofAccounts`.
**Root Cause:** Delete rules are advisory only.
**Business Impact:** Balances disappear from financial statements; the trial balance no longer balances by account; audit trail broken.
**Affected Areas:** GL, Journal Entries, Financial Reports, Bank Reconciliation, AR/AP posting.
**Recommended Fix:** Run the blocking checks inside `DeleteChartofAccount` and return 409; prefer deactivation (`IsActive = false`) for used accounts; add FKs with `Restrict`.

---

### BUG-COA-002 — Deletion impact check misses Accounting Setup defaults, credit cards, transfers, vendor invoice lines and vendor expense mappings
**Severity:** High. The UI offers "Delete Permanently" for accounts that drive automatic posting.
**Status:** Confirmed
**Test Area:** CRUD (delete) / Cross-Module
**Description:** The impact check ignores several references:
- The 23 default GL accounts in Accounting Setup (`AccountingDefaults`: AR, AP, revenue, expense, tax, freight, payroll…).
- Credit cards linked by COA code. The check is commented out with a note that the column "doesn't exist", but the column exists and is mapped; the matrix explicitly says "COA delete blocked by credit card".
- `Transfer.SourceAccountID`, `accountidfrom` and `accountidto`.
- `VendorInvoiceDetail.accountid`.
- `VendorCOAMapping.expenseAccountId`.

Vendor COA mappings matched on `accountid` are listed as "will be deleted" rather than blocking, although the matrix lists `VendorCOAMapping` as a blocker.
**Steps to Reproduce:**
1. In Accounting Setup set account 4000 as Default Revenue (or link a credit card to it, or use it on a vendor invoice line).
2. Open account 4000 in Chart of Accounts and click Delete.
3. Observe the dialog; confirm deletion; post a customer invoice.
**Expected:** Deletion blocked with the referencing setting/record listed.
**Actual:** Dialog allows deletion; afterwards revenue resolution silently falls back to keyword matching.
**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Masters/ChartofAccountsMasterSlideout.tsx` lines 343-358.
* Backend: `Cimmple_API/CimmpleAPI/Controllers/ChartofAccountsController.cs` lines 656-682 (credit-card check commented out), 684-710 (mappings as WillBeDeleted); `Cimmple_API/CimmpleAPI/Controllers/CreditCardController.cs` lines 29-53 and `Cimmple_API/CimmpleAPI/Data/CimmpleDbContext.cs` lines 316-320 (COA column exists and is mapped); `Cimmple_API/CimmpleAPI/Services/GlAccountResolutionService.cs` lines 15-21 and 30-45 (defaults used only if the account still exists and is active).
* Database: `AccountingDefaults` (`Data/Models/AccountingDefaults.cs` lines 28-73), `CreditCardMaster.COA`, `Transfer` (`Transaction.cs` lines 66-79), `VendorInvoiceDetail.accountid` (`InvoiceMaster.cs` line 105), `VendorCOAMapping.expenseAccountId` (`VendorMaster.cs` line 90).
**Root Cause:** Incomplete and outdated dependency list.
**Business Impact:** Automatic invoice, payment and payroll postings go to fallback accounts without warning; vendor default expense mappings vanish.
**Affected Areas:** Accounting Setup, AR/AP posting, Payroll, Credit Card Master, Vendor Master, Transfers.
**Recommended Fix:** Add all these references to the impact check and the server-side delete guard; restore the credit-card check; treat `VendorCOAMapping` as blocking, as the matrix specifies.

---

### BUG-COA-003 — Changing an account code silently breaks bank and credit-card links
**Severity:** High. Bank payments start posting to a keyword-matched fallback account, and the account becomes deletable while banks still depend on it.
**Status:** Confirmed
**Test Area:** CRUD (edit) / Cross-Module / Business Logic
**Description:** Banks and credit cards store the linked account's **code** string (`BankMaster.coa`, `CreditCardMaster.COA`), not its id. `SaveChartofAccount` lets the code be changed freely with no check for these references. After a rename from "1010" to "1011", `ResolveBank` no longer finds an account with code "1010" and falls back to the first account whose name/type/group contains "bank" or "cash". The bank's "Chart of Accounts" dropdown shows blank, and the COA impact check (which matches banks by the current code) no longer sees the bank.
**Steps to Reproduce:**
1. Link Bank A to account "1010 - Operating Account".
2. Edit the account and change Account Code to "1011"; save.
3. Record a customer payment to Bank A and inspect the GL lines; open Bank A; try deleting account 1011.
**Expected:** Code changes are blocked while referenced by code, or references are updated with it.
**Actual:** Payment posts to a keyword-matched account; Bank A shows no COA; account 1011 is deletable.
**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Masters/BankMasterSlideout.tsx` lines 733-735 and `CreditCardMasterSlideout.tsx` lines 612-616 (option value is `accountCode`).
* Backend: `Cimmple_API/CimmpleAPI/Controllers/ChartofAccountsController.cs` lines 135 (code overwritten), 637-640 (bank check by current code); `Cimmple_API/CimmpleAPI/Services/GlAccountResolutionService.cs` lines 272-294 (code match, then keyword fallback).
* Database: `BankMaster.coa`, `CreditCardMaster.COA`, `ChartofAccounts.AccountCode`.
**Root Cause:** References by mutable natural key with no integrity check.
**Business Impact:** Cash and card activity misposted; bank reconciliation no longer ties to GL.
**Affected Areas:** Bank Master, Credit Card Master, AR/AP payments, Bank Reconciliation.
**Recommended Fix:** Block code changes when banks/cards reference the code (or cascade the update); longer-term store `AccountID` in those masters.

---

### BUG-COA-004 — Duplicate account codes are allowed within a tenant
**Severity:** Medium. Code-based lookups become ambiguous and pick an arbitrary account.
**Status:** Confirmed
**Test Area:** Validation / Database
**Description:** Neither the slideout, the API nor the database checks that `AccountCode` is unique per tenant. Two accounts can both be "1010". Every code-based resolution (bank COA, credit-card COA, vendor order line GL code) uses `FirstOrDefault` without ordering, so the chosen account is undefined, and the bank dropdown shows two identical codes.
**Steps to Reproduce:**
1. Create account "1010 - Checking".
2. Create another account "1010 - Petty Cash".
3. Link a bank to "1010" and post a payment.
**Expected:** "Account code already exists" on step 2.
**Actual:** Both saved; posting picks either.
**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Masters/ChartofAccountsMasterSlideout.tsx` lines 292-305 (only required checks).
* Backend: `Cimmple_API/CimmpleAPI/Controllers/ChartofAccountsController.cs` lines 100-109, 134-143 (no uniqueness check); `Cimmple_API/CimmpleAPI/Services/GlAccountResolutionService.cs` lines 247-251 and 280-284 (`FirstOrDefault` by code).
* Database: `ChartofAccounts` has no index on `(Tenantid, AccountCode)` (`Cimmple_API/CimmpleAPI/Data/Migrations/CimmpleDbContextModelSnapshot.cs` lines 312-357).
**Root Cause:** Missing uniqueness rule.
**Business Impact:** Misposting; confusing reports and reconciliation.
**Affected Areas:** COA, Bank/Credit Card links, vendor order GL codes, Financial Reports.
**Recommended Fix:** Enforce case-insensitive unique `AccountCode` per tenant in API and with a unique index (after cleaning existing duplicates).

---

### BUG-COA-005 — Changing the Main Group or Subgroup keeps the old child subgroups, saving an inconsistent hierarchy
**Severity:** Medium. Accounts are classified under subgroups belonging to a different parent, which distorts grouped financial reports.
**Status:** Confirmed
**Test Area:** CRUD (edit) / Validation
**Description:** Child subgroup selections are cleared only when the parent is set to empty. Switching Main Group from "Assets" to "Liabilities" reloads the Subgroup 1 options but keeps the previous `Subgroupid` (and Subgroup 2/3) in form state; the dropdown may display blank or a mismatched value, and the stale ids are posted. The API stores `Groupid`/`Subgroupid*` without checking that each child belongs to its parent or to the tenant.
**Steps to Reproduce:**
1. Edit an account with Main Group "Assets", Subgroup 1 "Current Assets", Subgroup 2 "Cash".
2. Change Main Group to "Liabilities" without touching the subgroups.
3. Save and reopen the account (or inspect `ChartofAccounts.Subgroupid`).
**Expected:** Child subgroups cleared on parent change, and the API rejects mismatched hierarchies.
**Actual:** Old "Current Assets"/"Cash" ids saved under "Liabilities".
**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Masters/ChartofAccountsMasterSlideout.tsx` lines 83-111 (children reset only when the parent is falsy), 662-673, 681-691, 703-712.
* Backend: `Cimmple_API/CimmpleAPI/Controllers/ChartofAccountsController.cs` lines 139-142 (ids stored without validation).
* Database: `ChartofAccounts.Groupid`, `Subgroupid`, `Subgroupid2`, `Subgroupid3`.
**Root Cause:** Missing reset on parent change and missing server validation.
**Business Impact:** Accounts appear under the wrong headings in grouped reports.
**Affected Areas:** COA hierarchy, Financial Reports grouping.
**Recommended Fix:** Clear child selections whenever the parent value changes; validate the parent-child chain and tenant ownership in `SaveChartofAccount`.

---

### BUG-COA-006 — "Delete All" and per-dependency delete buttons only show "Deleting…" and do nothing
**Severity:** Low. Misleading controls; no data is changed.
**Status:** Confirmed
**Test Area:** CRUD (delete)
**Description:** For a blocked account the dialog shows × buttons per dependency and "Delete All (Dependencies + Order)". The handlers are stubs (comment "This would need to be implemented"): they toast "Deleting Journal Entries…", refresh, then report "Some dependencies could not be deleted". Offering to delete posted journal entries from the COA screen is also inappropriate for accounting data.
**Steps to Reproduce:**
1. Open an account used in journal entries; click Delete.
2. Click × on a journal entry, then "Delete All (Dependencies + Order)".
**Expected:** No such actions for financial records (or working ones with proper authorisation).
**Actual:** Info toast, nothing deleted, then an error toast.
**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Masters/ChartofAccountsMasterSlideout.tsx` lines 387-441; `Cimmple_UI/src/Common/Components/DeletionImpactDialog.tsx` lines 114-128, 155-169.
* Backend: dependency items advertise delete endpoints (`ChartofAccountsController.cs` lines 525, 545, 570, 632, 652).
* Database: n/a.
**Root Cause:** Unfinished feature wired into the generic dialog.
**Business Impact:** User confusion.
**Affected Areas:** COA delete dialog.
**Recommended Fix:** Do not pass `onDeleteDependency`/`onDeleteAll` for COA.

---

### BUG-COA-007 — Save, group-create and delete errors show a generic message while the API returns stack traces
**Severity:** Low. Hardening and UX.
**Status:** Confirmed
**Test Area:** Error handling / API
**Description:** All toasts use `error.message` ("Request failed with status code 400/404") instead of the server's `error` text ("Account Code is required", "Main Group ID is required", "Chart of Account not found"). `SaveChartofAccount` and the impact endpoint return the exception message, inner exception and `stackTrace` on 500.
**Steps to Reproduce:**
1. Save an account that another user just deleted (404), or trigger a 500.
2. Read the toast and response body.
**Expected:** Server message shown; no stack trace.
**Actual:** Generic toast; stack trace in the response.
**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Masters/ChartofAccountsMasterSlideout.tsx` lines 219, 242, 265, 288, 327, 354, 371.
* Backend: `Cimmple_API/CimmpleAPI/Controllers/ChartofAccountsController.cs` lines 169-177, 719-727.
* Database: n/a.
**Root Cause:** UI ignores `response.data.error`; catch blocks serialise internals.
**Business Impact:** Unclear errors; internal details exposed.
**Affected Areas:** COA save, group creation, delete.
**Recommended Fix:** Show `error.response?.data?.error`; return generic 500 messages.

---

## Potential Bugs

### BUG-COA-008 — Account type and active status can be changed on accounts with postings or configured as defaults
**Severity:** Medium. Can silently redirect automatic postings and misclassify historical balances.
**Status:** Potential
**Test Area:** Business Logic / Cross-Module
**Description:** `SaveChartofAccount` lets users change `AccountType` (for example Asset → Expense) and set an account Inactive with no check for postings or Accounting Setup references. GL resolution ignores inactive accounts (`IsActiveAccountForTenant`), so deactivating the Default AR account makes invoice posting fall back to keyword matching without any warning.
**Steps to Reproduce:**
1. Set account 1200 as Default AR in Accounting Setup.
2. Edit account 1200, set Status Inactive (or change Account Type); save.
3. Post a customer invoice and inspect the AR line.
**Expected:** Warning or block when the account is a configured default or has postings.
**Actual (per code):** Save succeeds; AR posts to a fallback account.
**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Masters/ChartofAccountsMasterSlideout.tsx` lines 307-331.
* Backend: `Cimmple_API/CimmpleAPI/Controllers/ChartofAccountsController.cs` lines 137-138; `Cimmple_API/CimmpleAPI/Services/GlAccountResolutionService.cs` lines 15-21, 30-45.
* Database: `ChartofAccounts.AccountType`, `IsActive`; `AccountingDefaults`.
**Root Cause:** No integrity checks on classification/status changes.
**Business Impact:** Misposted invoices/payments; historical balances move between statement sections.
**Affected Areas:** Accounting Setup, GL posting, Financial Reports.
**Recommended Fix:** Block deactivation of configured defaults; warn or block type changes on accounts with postings.
**Why further verification is needed:** Whether type changes on used accounts should be allowed is an accounting policy decision; confirm how Financial Reports classify accounts (type vs group).

---

### BUG-COA-009 — Main Group / Subgroup 1 / Subgroup 2 ids are generated as max + 1 without concurrency protection
**Severity:** Low. Rare race; produces duplicate logical ids.
**Status:** Potential
**Test Area:** Database / Business Logic
**Description:** `SaveMainGroup`, `SaveSubGroup` and `SaveSubGroup2` compute the next logical id as `max(id) + 1` for the tenant and insert it. Two simultaneous inline group creations can receive the same logical id, after which accounts referencing that id map to two groups. (Subgroup 3 uses an identity column and is not affected.)
**Steps to Reproduce:**
1. Two users click "+" and save a new Main Group at the same moment.
2. Query `MainGroup` for the tenant.
**Expected:** Unique `MainGroupID` per tenant.
**Actual (per code):** Both rows can get the same `MainGroupID`.
**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Masters/ChartofAccountsMasterSlideout.tsx` lines 204-290.
* Backend: `Cimmple_API/CimmpleAPI/Controllers/ChartofAccountsController.cs` lines 316-327, 367-379, 418-430.
* Database: `MainGroup`, `SubGroup`, `SubGroup2` (surrogate `Autoid` primary key; no unique index on the logical id per tenant).
**Root Cause:** Read-then-insert id generation.
**Business Impact:** Ambiguous grouping in reports.
**Affected Areas:** COA hierarchy.
**Recommended Fix:** Add a unique index on `(tenantid, MainGroupID)` etc. and retry on conflict, or use identity/sequence values.
**Why further verification is needed:** Requires concurrent requests to demonstrate.

---

## Needs Manual Verification

1. **Area:** Financial reports after hierarchy changes
   **What to Test:** Move an account between groups and run Balance Sheet / P&L.
   **Expected:** Account appears under the new heading; totals unchanged.
   **Why Manual Testing Is Required:** Report grouping logic is in another module and depends on data.
2. **Area:** Inline group creation
   **What to Test:** Create Main Group → Subgroup 1 → Subgroup 2 → Subgroup 3 inline, including a name that already exists.
   **Expected:** Existing group re-selected; new ones selected automatically.
   **Why Manual Testing Is Required:** UI flow across four dependent dropdowns.
3. **Area:** Vendor order line `glcode`
   **What to Test:** Whether vendor order lines store account id or code, and what happens after a code change.
   **Expected:** Lines keep resolving to the intended account.
   **Why Manual Testing Is Required:** `ResolveExpenseFromGlCode` accepts either; stored format depends on the vendor order UI and existing data.
4. **Area:** Responsive
   **What to Test:** List and slideout (four group dropdowns with "+" buttons) at 375 / 390 / 430 px.
   **Expected:** Usable layout.
   **Why Manual Testing Is Required:** Rendering only.
5. **Area:** Permissions
   **What to Test:** Role without "Chart of Accounts Master" (`/masters/chartofaccounts`); admin bypass.
   **Expected:** Menu hidden and route blocked.
   **Why Manual Testing Is Required:** Needs seeded roles.

## No Issues Found

- AccountCode and AccountName are required in both UI (`ChartofAccountsMasterSlideout.tsx` lines 292-305) and API (`ChartofAccountsController.cs` lines 100-109).
- List, detail, save, impact and delete all filter by tenant; update of a missing account returns 404 (lines 113-123).
- Active/Inactive filter works on `IsActive` (`ChartofAccountsMaster.tsx` lines 65-73).
- Impact check correctly blocks on deposits, withdrawals, journal entries (from/to), TransCoa and banks linked by current code (lines 510-655).
- Inline group creation re-uses an existing group with the same name and parent instead of duplicating it (lines 307-314, 356-365).
- `?open=` deep link opens the slideout (`ChartofAccountsMaster.tsx` lines 22-32).

## QA Coverage

| Test Area | Tested | Result |
| --- | --- | --- |
| Navigation | Yes | Pass |
| CRUD | Yes | Fail (BUG-COA-001, BUG-COA-003, BUG-COA-005, BUG-COA-006) |
| Search | Yes | Pass (`MasterListPage` client search) |
| Filters | Yes | Pass |
| Sorting | Yes | Pass |
| Pagination | Yes | Pass |
| Validation | Yes | Fail (BUG-COA-004, BUG-COA-005) |
| Permissions | Partial | Manual |
| API | Yes | Fail (BUG-COA-001, BUG-COA-007) |
| Database | Yes | Fail (BUG-COA-001, BUG-COA-004); Potential (BUG-COA-009) |
| Business Logic | Yes | Fail (BUG-COA-002, BUG-COA-003); Potential (BUG-COA-008) |
| Location | N/A | N/A (tenant-wide master) |
| Tenant | Yes | Pass (module-specific); generic pattern in Cross-Module Concerns |
| Cross-Module | Yes | Fail (BUG-COA-002, BUG-COA-003) |
| Responsive/PWA | No | Manual |

## Matrix Checklist

| Matrix Row | Result | Notes |
| --- | --- | --- |
| FE — List (`ChartofAccountsMaster.tsx`, `MasterListPage`, GET `GetChartofAccounts`) | Pass | |
| FE — Filter (Active/Inactive) | Pass | |
| FE — Add / Edit (slideout, inline group creation, 4 levels, `?open=`, group GET/POST endpoints) | Fail (BUG-COA-003, BUG-COA-005); Potential (BUG-COA-009) | Stale child subgroups; code changes break links. |
| FE — Delete (`DeletionImpactDialog`, `CheckChartofAccountDeletionImpact`, `DeleteChartofAccount`) | Fail (BUG-COA-002, BUG-COA-006) | |
| FE — Validation (AccountCode, AccountName required) | Pass / Fail (BUG-COA-004) | Required checks OK; no uniqueness. |
| FE — Permissions / Responsive (`/masters/chartofaccounts`) | Manual | Permission row at `UserManagementController.cs` line 894. |
| BE — CRUD (accounts and group endpoints) | Fail (BUG-COA-001, BUG-COA-007) | |
| BE — Validation: delete blocked by Bank, CreditCard, BankCOAMapping, VendorCOAMapping, Deposits, Withdrawals, JournalEntries/From/To, TransCoa | Fail (BUG-COA-001, BUG-COA-002) | Bank/Deposits/Withdrawals/JE/TransCoa blocked in impact only; CreditCard check commented out; BankCOAMapping and VendorCOAMapping are deleted, not blocking. |
| BE — Authorization (authenticated) | Pass | No role check (see Cross-Module Concerns). |
| Cross-Module — JE lines, Accounting Setup defaults, Financial Reports, GL activity, invoice GL resolution, vendor order `glcode` | Fail (BUG-COA-002, BUG-COA-003); Potential (BUG-COA-008) | |
| Database — `ChartofAccounts` (`IsActive`), `MainGroup`, `SubGroup`, `SubGroup2`, `SubGroup3`, `COARowtitle` | Fail (BUG-COA-004); Potential (BUG-COA-009) | No unique code index; `COARowtitle` not touched by any COA endpoint. |

## Cross-Module Concerns

| Concern | Affected endpoints | Owner |
| --- | --- | --- |
| Client-supplied `tenantid`/`Tenantid` trusted without comparing to the token tenant | `GET ChartofAccounts/GetChartofAccounts?tenantid`, `GetChartofAccountById`, `GetMainGroups`, `GetSubGroups*`, `POST SaveChartofAccount`, `SaveMainGroup`, `SaveSubGroup*`, `CheckChartofAccountDeletionImpact?tenantId`, `DeleteChartofAccount?tenantId` | `QA_TenantLocationFramework.md` |
| No server-side role/permission enforcement (any user can delete GL accounts) | All `ChartofAccountsController` endpoints | `QA_RolesPermissions.md` |
| GL resolution falls back to keyword matching when configured accounts are missing/inactive | `GlAccountResolutionService` | `QA_Accounting.md` |

