# QA — Bank Master

| Module | Matrix section | Bug ID prefix | Tested | Confirmed Bugs | Potential Bugs | Manual Verification |
| --- | --- | --- | --- | --- | --- | --- |
| Bank Master | 2.12 | BUG-BANK | Yes | 10 | 1 | 6 |

Source of test cases: `QA_TEST_MATRIX.md`. Method: static trace of the actual implementation (React UI → service → Axios → .NET controller → service/repository → EF Core → SQL Server, and back). No application code, configuration or database is changed during QA. Findings that depend on deployed configuration, data or a real browser go under **Needs Manual Verification**.

Severity scale:
- **Critical**: security breach, data corruption, financial corruption, or a blocked core workflow.
- **High**: a major feature is broken or a significant security control is bypassed, with a workaround that is hard or unavailable.
- **Medium**: a feature works incorrectly in specific conditions, or a security control is weaker than configured.
- **Low**: cosmetic, minor UX, or an informational/hardening issue.

---

## Confirmed Bugs

### BUG-BANK-001 — Saving a bank silently moves it to the hidden working site (or to no site)
**Severity:** High. Every edit can reassign a location-scoped financial master to the wrong site, changing who can see it and where its balances and reconciliations are reported.
**Status:** Confirmed
**Test Area:** Location / CRUD (create, edit)
**Description:** The slideout loads the bank's own `locationId`, but `BankService.SaveBankData` overwrites it with `localStorage.locationId` (the TopBar working site) before posting. The working-site switcher is hidden on `/masters/*`, and the Bank list has its own Site filter, so the user cannot see which site will be applied. When no working site is stored, the service sends 0, no `X-Location-Id` header is sent, and the API saves `locationId = 0`. The create form has no location field at all.
**Steps to Reproduce:**
1. As a multi-site user, set the working site to Site A (on any operational page), then open `/masters/bank`.
2. Change the on-page Site filter to Site B and open a bank that belongs to Site B.
3. Change nothing (or only the phone number) and click "Update Bank"; then filter the list by Site B again.
**Expected:** The bank stays at Site B; a new bank is created at an explicitly chosen site.
**Actual:** The bank's `locationId` becomes Site A (or 0 if no working site is stored) and it disappears from Site B's list.
**Evidence:**
* Frontend: `Cimmple_UI/src/Common/Services/BankService.ts` lines 120-123 (`request.locationId` replaced by `localStorage.locationId`); `Cimmple_UI/src/Modules/Masters/BankMasterSlideout.tsx` lines 81-88 and 127-128 (form holds the bank's own location, then discarded by the service); `Cimmple_UI/src/Common/Utils/workingSiteVisibility.ts` line 9 (switcher hidden on masters); `Cimmple_UI/src/Common/Hooks/useSiteListFilter.ts` lines 182-193 (independent on-page Site filter).
* Backend: `Cimmple_API/CimmpleAPI/Controllers/BankController.cs` lines 178-180 (`TryResolveLocationId`), 316 (`bank.locationId = request.locationId` on every save); `Cimmple_API/CimmpleAPI/Controllers/ApiBaseController.cs` lines 222-250 (falls back to header, then 0).
* Database: `BankMaster.locationId`.
**Root Cause:** The service always injects the working site instead of the record's location, and the API accepts a location change on update.
**Business Impact:** Banks jump between sites; restricted users lose access to their bank; site-level cash metrics, reconciliation lists and the period-close "missing reconciliation" message name the wrong site; duplicate-account checks run against the wrong site.
**Affected Areas:** Bank Master, Bank Reconciliation, Payment Dashboard, Period Close, customer/vendor payments bank pickers.
**Recommended Fix:** Keep the loaded `locationId` on edit and add an explicit, required Site selector on create; on the server, do not change `locationId` on update unless explicitly requested and allowed.

---

### BUG-BANK-002 — `DeleteBank` deletes banks that have transactions or invoices when called directly
**Severity:** High. Any authenticated user can bypass the delete guard with one request and orphan posted bank activity.
**Status:** Confirmed
**Test Area:** CRUD (delete) / Business Logic / Database
**Description:** The matrix says bank delete is blocked by transactions, customer invoices and vendor invoices. These checks exist only in `CheckBankDeletionImpact`, which the UI calls first. `DeleteBank` itself performs no dependency check and there are no foreign keys, so a direct DELETE (or a race between the check and the delete) removes the bank while `Transactions`, `InvoiceMaster` and `VendorInvoiceMaster` rows still point at it.
**Steps to Reproduce:**
1. Pick a bank that has payments recorded against it (impact dialog shows "Cannot Delete").
2. Send `DELETE /api/Bank/DeleteBank?bankId=<id>&tenantId=<tenant>` with a valid token.
3. Open Bank Reconciliation and the Payment Dashboard.
**Expected:** 400/409 "Bank is in use" from the API.
**Actual:** 200 "Bank deleted successfully"; the transactions remain with a dangling `BankId`.
**Evidence:**
* Frontend: `Cimmple_UI/src/Common/Components/DeletionImpactDialog.tsx` lines 91-171 (UI only hides the confirm button when `canDelete` is false).
* Backend: `Cimmple_API/CimmpleAPI/Controllers/BankController.cs` lines 468-491 (no checks before `Remove`), compare 381-439 (checks only in the impact endpoint).
* Database: `BankMaster`; `Transactions.BankId`, `InvoiceMaster.Bankid`, `VendorInvoiceMaster.Bankid` have no FK to `BankMaster` (no `principalTable: "BankMaster"` in any migration).
**Root Cause:** Delete rules are enforced only in an advisory endpoint.
**Business Impact:** Orphaned cash activity drops out of bank balances (`GetBanklist` lines 70-87 aggregate by existing bank ids) and reconciliation, and GL resolution for later reversals falls back to keyword matching.
**Affected Areas:** Bank Master, Bank Reconciliation, Payment Dashboard, AR/AP payments, Period Close.
**Recommended Fix:** Re-run the blocking checks inside `DeleteBank` (in the same transaction) and return 409 when in use; consider soft-delete/deactivate for used banks.

---

### BUG-BANK-003 — Deletion impact check misses reconciliation periods, check payments and the payroll default bank
**Severity:** Medium. The UI allows deleting banks that are still referenced by accounting records and settings.
**Status:** Confirmed
**Test Area:** CRUD (delete) / Cross-Module
**Description:** `CheckBankDeletionImpact` only checks `Transactions`, `VendorInvoiceMaster` and `InvoiceMaster`. Other tables that reference a bank id are ignored: `BankReconciliationPeriods.BankId`, `Payment.bankid` (printed checks) and `AccountingDefaults.DefaultPayrollBankId` (Accounting Setup payroll bank). A bank with a completed reconciliation, issued checks, or configured as the payroll bank shows "Delete Permanently".
**Steps to Reproduce:**
1. In Accounting Setup choose a bank as the default payroll bank (or complete a reconciliation for a bank with no remaining transactions).
2. Open that bank in Bank Master and click Delete.
3. Observe the impact dialog.
**Expected:** Deletion is blocked (or at least warned) because the bank is referenced.
**Actual:** The dialog allows permanent deletion.
**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Masters/BankMasterSlideout.tsx` lines 292-307.
* Backend: `Cimmple_API/CimmpleAPI/Controllers/BankController.cs` lines 381-453 (only the three tables plus mappings).
* Database: `BankReconciliationPeriods.BankId` (`Data/Models/AccountingGapModels.cs` lines 75-82); `Payment.bankid` (`Data/Models/InvoiceMaster.cs` lines 125-140); `AccountingDefaults.DefaultPayrollBankId` (`Data/Models/AccountingDefaults.cs` lines 75-76).
**Root Cause:** Incomplete dependency list.
**Business Impact:** Reconciliation history and check registers lose their bank; payroll silently falls back to another bank (`GlAccountResolutionService.cs` lines 301-329).
**Affected Areas:** Bank Reconciliation, check printing/payments, Accounting Setup, Payroll.
**Recommended Fix:** Add these references to both the impact check and the server-side delete guard.

---

### BUG-BANK-004 — Bank detail, impact and delete endpoints ignore the user's location access
**Severity:** Medium. A location-restricted user can view (including the full account number) and delete banks of sites they are not assigned to.
**Status:** Confirmed
**Test Area:** Location / Permissions
**Description:** The list applies `TryResolveListLocationFilter`, but `GetBankById`, `CheckBankDeletionImpact` and `DeleteBank` only filter by tenant. A restricted user who opens `/masters/bank?open=<id>` (or calls the API) for another site's bank sees all details and can delete it. Combined with BUG-BANK-001, clicking "Update Bank" moves the other site's bank into the user's own site.
**Steps to Reproduce:**
1. Log in as a user assigned only to Site A.
2. Navigate to `/masters/bank?open=<id of a Site B bank>`.
3. Click Show on the account number, then Delete (or Update Bank).
**Expected:** 403 for banks at sites the user cannot access, as the matrix requires ("Restricted user sees only own-site banks").
**Actual:** Details returned, delete succeeds, update re-homes the bank to Site A.
**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Masters/BankMaster.tsx` lines 21-32 (`?open=` deep link opens any id).
* Backend: `Cimmple_API/CimmpleAPI/Controllers/BankController.cs` lines 122-129, 358-364, 468-474 (no `CanAccessLocation(bank.locationId)`), compare list filter lines 29-30 and 37-48.
* Database: `BankMaster.locationId`.
**Root Cause:** Per-record location authorization is missing on single-record endpoints.
**Business Impact:** Weakens the site segregation configured for restricted users on sensitive banking data.
**Affected Areas:** Bank Master, global search open links.
**Recommended Fix:** After loading the bank, return 403 unless `CanAccessLocation(bank.locationId)`; apply the same check in `SaveBankData` for the existing record's location.

---

### BUG-BANK-005 — Full bank account numbers are stored in plaintext and returned by several endpoints
**Severity:** Medium. Sensitive financial data is exposed to any authenticated user and stored unprotected, contrary to the code's own note.
**Status:** Confirmed
**Test Area:** Security of sensitive data / API / Database
**Description:** `AccountNo` is saved as entered (the code comments "In production, encrypt this"). The full number is returned by `GetBankById`, by `SaveBankData` (which returns the whole entity including `AccountNo` and `RoutingNumber`), and by global search (`SearchBanks` returns `accountNo` and matches on the full number). The list masks the number, but the other responses do not, and none of them checks role or location.
**Steps to Reproduce:**
1. As any authenticated user, call `GET /api/Bank/GetBankById?bankId=<id>&tenantId=<tenant>`.
2. Save any bank and inspect the `SaveBankData` response.
3. Type part of an account number into global search and inspect the response JSON.
**Expected:** Account numbers encrypted at rest; only the masked value returned by default; full value only via an authorised, audited reveal.
**Actual:** Full account number in clear in the database and in all three responses.
**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Masters/BankMasterSlideout.tsx` lines 61-62 and 570-595 (masked display with a client-side Show toggle; the full value is already in the browser).
* Backend: `Cimmple_API/CimmpleAPI/Controllers/BankController.cs` lines 326-337 (plaintext save, comment line 328), 136-141 (`accountNo = bank.AccountNo`), 350 (`return Ok(new { result = bank })`); `Cimmple_API/CimmpleAPI/Controllers/GlobalSearchController.cs` lines 501-519.
* Database: `BankMaster.AccountNo` nvarchar(max), plaintext.
**Root Cause:** No encryption or field-level access control for account numbers.
**Business Impact:** Account and routing numbers enable payment fraud if exposed through a compromised low-privilege account, logs or backups.
**Affected Areas:** Bank Master, Global Search.
**Recommended Fix:** Encrypt `AccountNo` at rest, return only `lastAccountNo` from list/detail/save/search, and add a permission-checked, audited "reveal" endpoint for the Show button.

---

### BUG-BANK-006 — Clearing a bank's Chart of Accounts link fails with "COA already exists"
**Severity:** Medium. Users cannot unlink a bank from its GL account whenever another bank has no link.
**Status:** Confirmed
**Test Area:** Validation / CRUD (edit)
**Description:** Blank COA is stored as an empty string. On create, the duplicate-COA check is skipped for blanks, but on edit it runs whenever the value changed, including a change to blank. It then finds any other bank with `coa = ""` and rejects the save.
**Steps to Reproduce:**
1. Have Bank X with no Chart of Accounts selected and Bank Y linked to account 1010.
2. Edit Bank Y, choose "Select Chart of Accounts" (blank) and click Update Bank.
3. Observe the toast.
**Expected:** Bank Y is saved without a COA link (the field is optional).
**Actual:** 400 "COA already exists".
**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Masters/BankMasterSlideout.tsx` lines 724-737 (blank option value `""`).
* Backend: `Cimmple_API/CimmpleAPI/Controllers/BankController.cs` lines 238-248 (create skips blank), 282-292 (edit does not skip blank), 311 (blank stored as `""`).
* Database: `BankMaster.coa`.
**Root Cause:** The edit-path uniqueness check lacks the `!IsNullOrWhiteSpace` guard used on create.
**Business Impact:** Incorrect GL links cannot be removed; users may pick a wrong account just to save other changes.
**Affected Areas:** Bank Master edit.
**Recommended Fix:** Skip the COA uniqueness check when the requested COA is blank, on both paths.

---

### BUG-BANK-007 — The bank COA dropdown offers accounts the server rejects, and inactive accounts
**Severity:** Low. The user gets a validation error after choosing a listed option, or links an account that GL posting ignores.
**Status:** Confirmed
**Test Area:** Validation / Cross-Module (COA)
**Description:** The dropdown lists every Chart of Accounts row for the tenant (active and inactive, any code length) and stores the account **code**. The API requires the COA to be exactly 4 characters, while the COA master accepts codes of any length. Choosing a 3- or 5-character account fails with "COA must be exactly 4 characters". Choosing an inactive account saves, but GL resolution only matches active accounts.
**Steps to Reproduce:**
1. Create a COA account with code "10100" (or mark a 4-character account inactive).
2. Edit a bank and pick that account in "Chart of Accounts".
3. Click Update Bank.
**Expected:** Only valid, active accounts are offered.
**Actual:** 400 for non-4-character codes; inactive accounts accepted.
**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Masters/BankMasterSlideout.tsx` lines 64-79 (all accounts loaded), 724-737.
* Backend: `Cimmple_API/CimmpleAPI/Controllers/BankController.cs` lines 208-212; `Cimmple_API/CimmpleAPI/Controllers/ChartofAccountsController.cs` lines 28-41 (no active filter) and 100-104 (no code-length rule); `Cimmple_API/CimmpleAPI/Services/GlAccountResolutionService.cs` lines 280-284 (active accounts only).
* Database: `BankMaster.coa`, `ChartofAccounts.AccountCode`, `ChartofAccounts.IsActive`.
**Root Cause:** The dropdown is not filtered to the accounts the API and GL logic accept.
**Business Impact:** Confusing errors; banks linked to inactive accounts post to a fallback account.
**Affected Areas:** Bank Master; GL posting of payments.
**Recommended Fix:** Filter the dropdown to active accounts that satisfy the server rule (or relax the 4-character rule to match the COA master).

---

### BUG-BANK-008 — Updating a bank that no longer exists creates a new bank instead of returning 404
**Severity:** Low. Rare condition, but it silently resurrects deleted banks.
**Status:** Confirmed
**Test Area:** CRUD (edit) / API
**Description:** `SaveBankData` looks up the bank by `Id` and tenant; if nothing is found it treats the request as a create even when `Id > 0`. The "Account No is required" rule is only applied when `Id == 0`, so an API call with `Id > 0` and no `AccountNo` either creates a bank with an empty account number or throws a NullReferenceException (500) when `AccountNo` is null.
**Steps to Reproduce:**
1. User A opens a bank in the slideout.
2. User B deletes that bank.
3. User A clicks "Update Bank".
**Expected:** 404 "Bank not found" (as Credit Card and COA saves do).
**Actual:** A new bank row with a new id is created from A's form.
**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Masters/BankMasterSlideout.tsx` lines 255-290.
* Backend: `Cimmple_API/CimmpleAPI/Controllers/BankController.cs` lines 188-191, 214-219 (`isNew = existingBank == null`), 250, 326-337 (`request.AccountNo.Length`); compare `CreditCardController.cs` lines 161-170.
* Database: `BankMaster`.
**Root Cause:** "Not found" is conflated with "new".
**Business Impact:** Deleted banks reappear with new ids; possible 500 errors.
**Affected Areas:** Bank Master save.
**Recommended Fix:** When `request.Id > 0` and no row is found, return 404.

---

### BUG-BANK-009 — "Delete All" and the per-dependency delete buttons do nothing but report "Deleting…"
**Severity:** Low. Misleading controls; no data is changed.
**Status:** Confirmed
**Test Area:** CRUD (delete) / Error handling
**Description:** When a bank is blocked, the impact dialog shows × buttons next to each dependency and a "Delete All (Dependencies + Order)" button (the label says "Order" on a bank). The slideout's `handleDeleteDependency` is a stub that only shows "Deleting Transactions…" and refreshes the impact; "Delete All" then reports "Some dependencies could not be deleted. Please try again."
**Steps to Reproduce:**
1. Open a bank that has transactions and click Delete.
2. Click × next to a transaction, then "Delete All (Dependencies + Order)".
3. Observe the toasts and the dialog.
**Expected:** Either working dependency actions or no such buttons for financial records.
**Actual:** Info toast "Deleting Transactions…", nothing deleted, then an error toast.
**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Masters/BankMasterSlideout.tsx` lines 337-390 (stub, comment "This would need to be implemented"), 964-966; `Cimmple_UI/src/Common/Components/DeletionImpactDialog.tsx` lines 114-128 and 155-169.
* Backend: n/a.
* Database: n/a.
**Root Cause:** Unfinished feature wired to the generic dialog.
**Business Impact:** Users are told something is being deleted when it is not.
**Affected Areas:** Bank Master delete dialog.
**Recommended Fix:** Do not pass `onDeleteDependency`/`onDeleteAll` for banks (deleting posted transactions from a master screen should not be offered).

---

### BUG-BANK-010 — Several banks can be flagged "Default Payroll Bank"; payroll silently uses the lowest id
**Severity:** Low. Configuration ambiguity with a deterministic but hidden outcome.
**Status:** Confirmed
**Test Area:** Business Logic (default bank)
**Description:** "Default Payroll Bank" and "Set as Primary" are plain checkboxes saved per bank with no uniqueness enforcement. When Accounting Setup has no explicit payroll bank, payroll GL resolution picks the flagged bank with the lowest id, regardless of which one the user flagged last. "Primary" is stored but not used anywhere in the API.
**Steps to Reproduce:**
1. Flag Bank A (older) and Bank B (newer) as "Default Payroll Bank".
2. Leave Accounting Setup's payroll bank empty.
3. Post a payroll payment and check which bank/GL account is used.
**Expected:** Only one default payroll bank (setting it on B clears A), or a validation message.
**Actual:** Both flagged; Bank A is used.
**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Masters/BankMasterSlideout.tsx` lines 450-477.
* Backend: `Cimmple_API/CimmpleAPI/Controllers/BankController.cs` lines 313-314; `Cimmple_API/CimmpleAPI/Services/GlAccountResolutionService.cs` lines 314-319 (`OrderBy(b => b.Id)`).
* Database: `BankMaster.ispayrollDefault`, `BankMaster.isprimary`.
**Root Cause:** No single-default rule.
**Business Impact:** Payroll cash may be drawn from an unexpected bank account.
**Affected Areas:** Bank Master, Payroll, Accounting Setup.
**Recommended Fix:** When a bank is flagged as payroll default (or primary), clear the flag on the tenant's other banks in the same save.

---

## Potential Bugs

### BUG-BANK-011 — Bank GL resolution treats the 4-digit COA code as an account id first
**Severity:** High. Customer and vendor payments can post to the wrong GL account.
**Status:** Potential
**Test Area:** Business Logic / Cross-Module (GL)
**Description:** Bank Master stores the selected account's **code** (for example "1010") in `BankMaster.coa`. `GlAccountResolutionService.ResolveBank` first parses that string as an integer and, if an active account with that **AccountID** exists in the tenant, uses it; it only then matches by `AccountCode`. Because `AccountID` is a database identity shared by all tenants, a tenant can easily own an account whose id equals another account's 4-digit code.
**Steps to Reproduce:**
1. In a tenant, find an active account whose `AccountID` is, say, 1010, and a different account whose `AccountCode` is "1010".
2. Link a bank to account code "1010" in Bank Master.
3. Record a customer payment to that bank and inspect the GL lines.
**Expected:** Cash posts to the account with code "1010".
**Actual (per code):** Cash posts to the account with id 1010.
**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Masters/BankMasterSlideout.tsx` lines 733-735 (option value is `accountCode`).
* Backend: `Cimmple_API/CimmpleAPI/Services/GlAccountResolutionService.cs` lines 269-286 (id parse before code match); callers `InvoiceController.cs` line 1101 and `VendorInvoiceController.cs` line 720.
* Database: `BankMaster.coa`; `ChartofAccounts.AccountID` (identity) and `AccountCode`.
**Root Cause:** The same field is interpreted as either an id or a code, with id taking precedence.
**Business Impact:** Misstated cash and another account's balance; bank reconciliation will not tie to the GL.
**Affected Areas:** AR and AP payments, payroll payments, GL, Financial Reports.
**Recommended Fix:** Store the account id in a dedicated column (or `BankCOAMapping`), and resolve `coa` only by `AccountCode`.
**Why further verification is needed:** Requires production-like data where an id/code collision exists; also confirm whether any legacy data stores account ids in `coa` (which may be why the id parse exists).

---

## Needs Manual Verification

1. **Area:** Location — list
   **What to Test:** Restricted user on `/masters/bank` with Site filter = own site, "All sites", and a `?locationId=` deep link to another site.
   **Expected:** Own-site banks only; 403 toast for the other site.
   **Why Manual Testing Is Required:** Depends on JWT `locationIds` and seeded users.
2. **Area:** Period close bank check
   **What to Test:** Close a period while an active bank at a site the user cannot see lacks a completed reconciliation.
   **Expected:** Close blocked; error names the bank and its site (`GlWorkflowService.cs` lines 68-115).
   **Why Manual Testing Is Required:** Needs reconciliation data across sites.
3. **Area:** Balances
   **What to Test:** Opening vs current balance per bank after deposits, withdrawals, customer and vendor payments.
   **Expected:** Current = opening + signed activity, matching Payment Dashboard.
   **Why Manual Testing Is Required:** Sign rules depend on real transaction data (`BankController.cs` lines 69-87).
4. **Area:** Opening balance edits
   **What to Test:** Change "Opening Balance" on a bank with completed reconciliations.
   **Expected:** Product decision: either blocked or reconciliations flagged.
   **Why Manual Testing Is Required:** The code allows the change (line 308); expected behaviour is not documented.
5. **Area:** Responsive
   **What to Test:** Bank list and two-tab slideout at 375 / 390 / 430 px; Show/Hide account number button.
   **Expected:** Usable layout; masked number by default.
   **Why Manual Testing Is Required:** Rendering only.
6. **Area:** Permissions
   **What to Test:** Role without "Bank Master" (`/masters/bank`); admin bypass; direct API call.
   **Expected:** Menu hidden, route blocked; API open (see Cross-Module Concerns).
   **Why Manual Testing Is Required:** Needs seeded roles.

## No Issues Found

- List applies `TryResolveListLocationFilter`: explicit non-allowed site → 403, "All sites" limited to allowed sites for restricted users (`BankController.cs` lines 29-48).
- Account numbers are masked in the list (`lastAccountNo` "XXXX1234", `BankMaster.tsx` line 40 `maskAccountNumber`) and in the edit form until "Show" is clicked (`BankMasterSlideout.tsx` lines 61-62, 570-573).
- Required fields BankName, AccountNo (create), Short Name, Starting Check No and Check Series are enforced in both UI (`BankMasterSlideout.tsx` lines 196-219) and API (`BankController.cs` lines 182-206).
- COA length rule (exactly 4 characters when provided) is enforced in the API (lines 208-212).
- Account No / Routing No uniqueness within tenant and location is enforced on create and edit (lines 222-236, 262-280); COA uniqueness per tenant on create (lines 238-248).
- Saving into a location the user cannot access returns 403 (`TryResolveLocationId`, `ApiBaseController.cs` lines 231-237).
- Impact dialog blocks deletion when transactions or invoices exist, and lists bank-COA mappings as cascaded (lines 381-458); the confirm button is hidden while blocked (`DeletionImpactDialog.tsx` lines 91-171).
- Status filter (All/Active/Inactive) and site filter work client/server side respectively (`BankMaster.tsx` lines 80-108, 127-162).
- Period close requires a completed reconciliation for every active bank tenant-wide and names the bank's site (`GlWorkflowService.cs` lines 68-115).
- All single-record endpoints filter by tenant (lines 127-128, 215-216, 363-364, 473-474).

## QA Coverage

| Test Area | Tested | Result |
| --- | --- | --- |
| Navigation | Yes | Pass |
| CRUD | Yes | Fail (BUG-BANK-002, BUG-BANK-003, BUG-BANK-008, BUG-BANK-009) |
| Search | Yes | Pass (client search on name, masked account, type, email, phone) |
| Filters | Yes | Pass |
| Sorting | Yes | Pass (`MasterListPage` client sort) |
| Pagination | Yes | Pass (`MasterListPage` client paging) |
| Validation | Yes | Fail (BUG-BANK-006, BUG-BANK-007) |
| Permissions | Partial | Manual |
| API | Yes | Fail (BUG-BANK-005, BUG-BANK-008) |
| Database | Yes | Fail (BUG-BANK-002, BUG-BANK-005) |
| Business Logic | Yes | Fail (BUG-BANK-010); Potential (BUG-BANK-011) |
| Location | Yes | Fail (BUG-BANK-001, BUG-BANK-004) |
| Tenant | Yes | Pass (module-specific); generic pattern in Cross-Module Concerns |
| Cross-Module | Yes | Fail (BUG-BANK-003); Potential (BUG-BANK-011) |
| Responsive/PWA | No | Manual |

## Matrix Checklist

| Matrix Row | Result | Notes |
| --- | --- | --- |
| FE — List (`BankMaster.tsx`, `MasterListPage`, masked account numbers, GET `GetBanklist?locationId`) | Pass | Masked numbers; site param passed. |
| FE — Filter (Active/Inactive; site filter) | Pass | Status client-side; site server-side. |
| FE — Add / Edit (`BankMasterSlideout.tsx`, `?open=`, GET `GetBankById`, POST `SaveBankData`) | Fail (BUG-BANK-001, BUG-BANK-004, BUG-BANK-006, BUG-BANK-008) | Location overwritten on save; deep link ignores location access. |
| FE — Delete (`DeletionImpactDialog` with Delete All; `CheckBankDeletionImpact`, `DeleteBank`) | Fail (BUG-BANK-003, BUG-BANK-009) | Impact incomplete; Delete All is a stub. |
| FE — Validation (BankName, AccountNo (create), NickName, startingcheck, checkseries required; COA exactly 4 chars) | Pass / Fail (BUG-BANK-007) | Required fields OK; dropdown offers codes the 4-char rule rejects. |
| FE — Permissions / Responsive (`/masters/bank`) | Manual | Route and permission row exist. |
| BE — List (`TryResolveListLocationFilter`; opening and current balance) | Pass | Lines 29-113. |
| BE — Create/Update (`TryResolveLocationId`; 403 inaccessible location) | Pass / Fail (BUG-BANK-001, BUG-BANK-008) | 403 works; location changes on update; missing row treated as create. |
| BE — Delete (impact, delete) | Fail (BUG-BANK-002, BUG-BANK-003) | No server guard; incomplete dependency list. |
| BE — Validation (AccountNo/RoutingNo unique within location; COA unique) | Pass / Fail (BUG-BANK-006) | Blank COA wrongly treated as duplicate on edit. |
| BE — Authorization (authenticated; location access) | Fail (BUG-BANK-004) | Location access only on list/save. |
| BL — Location-scoped | Fail (BUG-BANK-001, BUG-BANK-004) | |
| BL — Delete blocked by `BankCOAMapping`, `Transactions`, `InvoiceMaster`, `VendorInvoiceMaster` | Fail (BUG-BANK-002, BUG-BANK-003) | Blocked only in the impact check. `BankCOAMapping` is not a blocker in code; mappings are listed as "will be deleted" (lines 441-453). No code writes `BankCOAMapping`. |
| BL — Active banks must have a completed reconciliation before period close (tenant-wide) | Pass | `GlWorkflowService.cs` lines 68-115. |
| Cross-Module — payments, Bank Reconciliation, Period Close, Payment Dashboard, Accounting Setup (payroll bank) | Fail (BUG-BANK-003, BUG-BANK-010); Potential (BUG-BANK-011) | |
| Database — `BankMaster`, `BankCOAMapping` | Fail (BUG-BANK-005) | Plaintext account numbers; no FKs. |
| Section 11.2 — Bank master: restricted user sees only own-site banks; save into other site → 403 | Fail (BUG-BANK-004) / Pass | List and save-into-other-site OK; detail/delete not checked. |

## Cross-Module Concerns

| Concern | Affected endpoints | Owner |
| --- | --- | --- |
| Client-supplied `tenantid`/`TenantID` trusted without comparing to the token tenant | `GET Bank/GetBanklist?tenantid`, `GET GetBankById?tenantId`, `POST SaveBankData` (body `TenantID`), `GET CheckBankDeletionImpact?tenantId`, `DELETE DeleteBank?tenantId` | `QA_TenantLocationFramework.md` |
| No server-side role/permission enforcement | All `BankController` endpoints | `QA_RolesPermissions.md` |
| Global search returns full bank account numbers and ignores location restrictions | `GlobalSearchController.SearchBanks` (lines 501-519) | `QA_GlobalSearch.md` (bank data exposure logged here as BUG-BANK-005) |
| Bank GL resolution id/code ambiguity | `GlAccountResolutionService.ResolveBank` | `QA_Accounting.md` (logged here as BUG-BANK-011 because it is the bank-to-GL link) |
