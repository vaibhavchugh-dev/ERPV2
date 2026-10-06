# QA — Credit Card Master

| Module | Matrix section | Bug ID prefix | Tested | Fix Tested | Confirmed Bugs | Potential Bugs | Manual Verification |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Credit Card Master | 2.13 | BUG-CC | Yes | Yes | 5 | 0 | 4 |

Source of test cases: `QA_TEST_MATRIX.md`. Method: static trace of the actual implementation (React UI → service → Axios → .NET controller → service/repository → EF Core → SQL Server, and back). No application code, configuration or database is changed during QA. Findings that depend on deployed configuration, data or a real browser go under **Needs Manual Verification**.

Severity scale:
- **Critical**: security breach, data corruption, financial corruption, or a blocked core workflow.
- **High**: a major feature is broken or a significant security control is bypassed, with a workaround that is hard or unavailable.
- **Medium**: a feature works incorrectly in specific conditions, or a security control is weaker than configured.
- **Low**: cosmetic, minor UX, or an informational/hardening issue.

---

## Confirmed Bugs

### BUG-CC-001 — Full card numbers and CVVs are stored in plaintext and sent to the browser on every edit
**Severity:** Critical. Complete cardholder data (PAN, CVV, expiry, name, billing address) is exposed to any authenticated user; storing CVV after entry is prohibited by PCI DSS.
**Status:** Confirmed
**Test Area:** Security of sensitive data / API / Database
**Description:** `SaveCreditCard` stores `CardNumber` and `CVV` exactly as entered. `GetCreditCardById` returns `cardNumber` (full PAN) and `cvv` in the response. The edit slideout does not display either field, but it loads both into React state and posts them back on every save, so the complete card data travels to and from the browser each time a card is opened. The list masks the number ("****1234"), which gives a false impression that the data is protected.
**Steps to Reproduce:**
1. Create a card with number "4111 1111 1111 1111" and CVV "123".
2. As any authenticated user (no role needed), call `GET /api/CreditCard/GetCreditCardById?creditCardId=<id>&tenantId=<tenant>`, or open the card from the list and inspect the network response.
3. Query `CreditCardMaster` in SQL Server.
**Expected:** PAN tokenised or encrypted at rest, CVV never stored, only last-four digits returned to the UI.
**Actual:** Response contains `"cardNumber":"4111 1111 1111 1111"` and `"cvv":"123"`; both are plaintext in the table.
**Evidence:**
* Frontend: `Cimmple_UI/src/Common/Services/CreditCardService.ts` lines 66-99 (maps `cardNumber` and `cvv` into the form model); `Cimmple_UI/src/Modules/Masters/CreditCardMasterSlideout.tsx` lines 90-116 (full PAN and CVV held in state), 296-297 (posted back on save), 488 and 622 (fields not rendered on edit).
* Backend: `Cimmple_API/CimmpleAPI/Controllers/CreditCardController.cs` lines 103-112 (`cardNumber = creditCard.CardNumber`, `cvv = creditCard.CVV`), 183-185 and 207 (plaintext save); list masking at lines 66-68.
* Database: `CreditCardMaster.CardNumber`, `CreditCardMaster.CVV` (`Cimmple_API/CimmpleAPI/Data/Models/CreditCardMaster.cs`; `create_creditcard_table.sql`).
**Root Cause:** The master stores raw cardholder data and the detail endpoint returns the entity fields directly.
**Business Impact:** A single compromised low-privilege account, browser extension, log or database backup exposes every company card; PCI non-compliance.
**Affected Areas:** Credit Card Master; database backups; any log that captures API responses.
**Recommended Fix:** Stop storing CVV (remove the column and purge existing values), store only last four digits (or a payment-processor token / encrypted PAN with restricted decryption), and remove `cardNumber`/`cvv` from `GetCreditCardById`.

---

### BUG-CC-002 — Expired cards cannot be saved (not even to deactivate them), and renewed expiry/CVV cannot be entered
**Severity:** Medium. A routine workflow (marking an expired card Inactive or updating a renewed card) is blocked with an error the user cannot see or fix.
**Status:** Confirmed
**Test Area:** Validation / CRUD (edit)
**Description:** On edit, the slideout hides the card number, expiry month/year and CVV fields (they only render when `creditCardId === 0`). However `validateForm` still validates the stored expiry on edit and rejects past dates, and it also re-validates the hidden stored card number with the Luhn check. When a card's expiry has passed, any save fails with "Please fix the errors in the form", and the error message is attached to fields that are not on screen. There is also no way to record a renewed card's new expiry or CVV without deleting and recreating the card.
**Steps to Reproduce:**
1. Have a card whose stored expiry is in the past (for example, created with 12/2025 before that date passed).
2. Open the card, change Status to "Inactive" (or edit the billing address).
3. Click Save.
**Expected:** The card is saved (expiry validation applies only to new or changed expiry); expiry and CVV can be updated for renewed cards.
**Actual:** Toast "Please fix the errors in the form"; no visible field error; the card cannot be changed.
**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Masters/CreditCardMasterSlideout.tsx` lines 236-242 (hidden card number re-validated on edit), 252-257 (expiry validated on edit), 289-292 (save aborted), 488-526 and 622-711 (number, expiry and CVV inputs rendered only on create); `Cimmple_UI/src/Common/Utils/validation.ts` lines 75-90 (`validateExpiryDate` rejects past dates).
* Backend: `Cimmple_API/CimmpleAPI/Controllers/CreditCardController.cs` lines 205-207 (API would accept new expiry/CVV values on update).
* Database: `CreditCardMaster.ExpiryMonth`, `ExpiryYear`.
**Root Cause:** Edit-mode rendering and edit-mode validation are inconsistent.
**Business Impact:** Expired cards stay "Active" in the master; users delete and recreate cards, losing history.
**Affected Areas:** Credit Card Master edit.
**Recommended Fix:** Skip number/expiry validation for unchanged stored values on edit, and render editable expiry (and, if CVV is kept at all, a write-only CVV) fields in edit mode.

---

### BUG-CC-003 — Card, CVV, expiry, email, phone and zip rules are enforced only in the browser
**Severity:** Low. The UI enforces the rules; only direct API calls bypass them.
**Status:** Confirmed
**Test Area:** Validation / API
**Description:** The matrix states the validators in `Utils/validation.ts` should accept and reject the same values in UI and API. `SaveCreditCard` only checks that Cardholder Name is present and (on create) Card Number is non-blank. Any string is accepted as card number (no digit count or Luhn), CVV, expiry month/year, email, phone and zip.
**Steps to Reproduce:**
1. POST `/api/CreditCard/SaveCreditCard` with `CardNumber: "abc"`, `CVV: "99999"`, `ExpiryMonth: "13"`, `ExpiryYear: "1999"`, `Email: "x"`.
2. GET the card list.
**Expected:** 400 with the same messages the UI shows.
**Actual:** Card saved; `LastFourDigits` = "abc".
**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Masters/CreditCardMasterSlideout.tsx` lines 218-285; `Cimmple_UI/src/Common/Utils/validation.ts` lines 37-90.
* Backend: `Cimmple_API/CimmpleAPI/Controllers/CreditCardController.cs` lines 147-156 (only two checks), 183-219.
* Database: `CreditCardMaster`.
**Root Cause:** No server-side validation.
**Business Impact:** Invalid card data from imports or scripts.
**Affected Areas:** Credit Card API.
**Recommended Fix:** Mirror the UI validators in `SaveCreditCard`.

---

### BUG-CC-004 — Sorting by "Expiry" orders by month only, ignoring the year
**Severity:** Low. Cosmetic/sorting.
**Status:** Confirmed
**Test Area:** Sorting
**Description:** The Expiry column shows "MM/YYYY" but its sort key is `expiryMonth`, so 01/2030 sorts before 12/2025.
**Steps to Reproduce:**
1. Have cards expiring 12/2025 and 01/2030.
2. Click the "Expiry" column header (ascending).
**Expected:** 12/2025 first.
**Actual:** 01/2030 first.
**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Masters/CreditCardMaster.tsx` line 16 (`sortKey: "expiryMonth"`), 140-158 (sort compares that field only), 192-194 (renders month/year).
* Backend: n/a.
* Database: n/a.
**Root Cause:** Wrong sort key.
**Business Impact:** Users cannot reliably find soon-to-expire cards.
**Affected Areas:** Credit Card list.
**Recommended Fix:** Sort by a composed `YYYYMM` value.

---

### BUG-CC-005 — Save and delete errors show a generic message while the API returns the stack trace
**Severity:** Low. Hardening and UX.
**Status:** Confirmed
**Test Area:** Error handling / API
**Description:** The slideout toasts `error.message` (for example "Request failed with status code 400") instead of the server's `error` text such as "Cardholder Name is required" or "Credit Card not found". On a 500, `SaveCreditCard` returns the exception message, inner exception and `stackTrace`.
**Steps to Reproduce:**
1. Delete a card in another tab, then click Save on it (404), or trigger a 500.
2. Read the toast and the response body.
**Expected:** Toast shows the server message; no stack trace in the response.
**Actual:** Generic toast; stack trace returned.
**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Masters/CreditCardMasterSlideout.tsx` lines 307, 334, 351.
* Backend: `Cimmple_API/CimmpleAPI/Controllers/CreditCardController.cs` lines 225-234.
* Database: n/a.
**Root Cause:** UI ignores `response.data.error`; the catch block serialises internals.
**Business Impact:** Unclear errors; internal details exposed.
**Affected Areas:** Credit Card save/delete.
**Recommended Fix:** Show `error.response?.data?.error`; return a generic 500 message and log details server-side.

---

## Potential Bugs

_None found._

## Needs Manual Verification

1. **Area:** Validators in the browser
   **What to Test:** Card numbers of 13 and 19 digits, Luhn-invalid numbers, CVV of 3/4/5 digits, expiry in the current month, invalid email/phone/zip.
   **Expected:** Same accept/reject results as `validation.ts`.
   **Why Manual Testing Is Required:** Real-time validation and formatting (spaces every 4 digits) need a browser.
2. **Area:** Primary card flag
   **What to Test:** Mark two cards as primary.
   **Expected:** Product decision: single primary or several allowed.
   **Why Manual Testing Is Required:** `IsPrimary` is stored but not used by any other API code; expected behaviour is not documented.
3. **Area:** Responsive
   **What to Test:** List, column chooser and slideout at 375 / 390 / 430 px.
   **Expected:** Usable layout.
   **Why Manual Testing Is Required:** Rendering only.
4. **Area:** Permissions
   **What to Test:** Role without "Credit Card Master" (`/masters/creditcard`); admin bypass.
   **Expected:** Menu hidden and route blocked.
   **Why Manual Testing Is Required:** Needs seeded roles.

## No Issues Found

- List returns only the masked number ("****" + last four) (`CreditCardController.cs` lines 66-68); global search returns only last four digits (`GlobalSearchController.cs` lines 631-647).
- `LastFourDigits` is derived after stripping spaces and dashes (lines 186-195), as the matrix states.
- Status is stored as 1/0 and returned with `statusText` (lines 74-75, 216); the Active/Inactive filter uses it (`CreditCardMaster.tsx` lines 125-135).
- Client search on number, holder, type and nickname; sort and pagination reset on change (`CreditCardMaster.tsx` lines 118-171).
- Update of a non-existent card returns 404 (lines 161-170); all single-record endpoints filter by tenant.
- Impact endpoint always returns `CanDelete = true` and delete is a hard delete, matching the matrix (lines 251-270, 292-294).
- COA column is created if missing and mapped in EF (`CreditCardController.cs` lines 29-53; `CimmpleDbContext.cs` lines 316-320).
- `?open=` deep link opens the slideout and clears the query string (`CreditCardMaster.tsx` lines 45-56).

## QA Coverage

| Test Area | Tested | Result |
| --- | --- | --- |
| Navigation | Yes | Pass |
| CRUD | Yes | Fail (BUG-CC-002) |
| Search | Yes | Pass |
| Filters | Yes | Pass |
| Sorting | Yes | Fail (BUG-CC-004) |
| Pagination | Yes | Pass |
| Validation | Yes | Fail (BUG-CC-002, BUG-CC-003) |
| Permissions | Partial | Manual |
| API | Yes | Fail (BUG-CC-001, BUG-CC-005) |
| Database | Yes | Fail (BUG-CC-001) |
| Business Logic | Yes | Pass |
| Location | N/A | N/A (tenant-wide master) |
| Tenant | Yes | Pass (module-specific); generic pattern in Cross-Module Concerns |
| Cross-Module | Yes | Fail (COA delete not blocked by credit card; logged as BUG-COA-002) |
| Responsive/PWA | No | Manual |

## Matrix Checklist

| Matrix Row | Result | Notes |
| --- | --- | --- |
| FE — List (`CreditCardMaster.tsx`, GET `/CreditCard/GetCreditCards`) | Pass | Masked numbers. |
| FE — Search / Sort (number, holder, type, nickname; client) | Pass / Fail (BUG-CC-004) | Expiry sorts by month only. |
| FE — Add / Edit (`CreditCardMasterSlideout.tsx`, IsPrimary, COA, `?open=`, GET `GetCreditCardById`, POST `SaveCreditCard`) | Fail (BUG-CC-001, BUG-CC-002) | Full PAN/CVV returned; expired cards cannot be saved. |
| FE — Delete (`DeletionImpactDialog`, `CheckCreditCardDeletionImpact`, `DeleteCreditCard`) | Pass | Always deletable, as specified. Delete All / dependency handlers are stubs (lines 368-421) but never shown because there are no blocking dependencies. |
| FE — Validation (CardholderName, CardNumber (create) required; card, CVV, expiry, email/phone/zip validators) | Fail (BUG-CC-002, BUG-CC-003) | Browser-only; edit-mode validation blocks saves. |
| FE — Permissions / Responsive (`/masters/creditcard`) | Manual | Route and permission row exist (`UserManagementController.cs` line 893). |
| BE — CRUD (list, get, save, impact always `CanDelete=true`, hard delete) | Pass / Fail (BUG-CC-001, BUG-CC-005) | Behaviour matches matrix; data exposure and error leakage. |
| BE — Authorization (authenticated) | Pass | No role check (see Cross-Module Concerns). |
| BL — `LastFourDigits` derived after stripping spaces and dashes | Pass | Lines 186-195. |
| BL — Status is 1/0 | Pass | Line 216. |
| Cross-Module — COA link; COA delete blocked by credit card | Fail | COA impact check for credit cards is commented out (`ChartofAccountsController.cs` lines 656-682); logged as BUG-COA-002. |
| Database — `CreditCardMaster` | Fail (BUG-CC-001) | Plaintext PAN and CVV. |
| Shared util — `Utils/validation.ts`: same values accepted/rejected by UI and API | Fail (BUG-CC-003) | |

## Cross-Module Concerns

| Concern | Affected endpoints | Owner |
| --- | --- | --- |
| Client-supplied `tenantid`/`TenantId` trusted without comparing to the token tenant | `GET CreditCard/GetCreditCards?tenantid`, `GET GetCreditCardById?tenantId` (returns full PAN/CVV of any tenant), `POST SaveCreditCard` (body `TenantId`), `GET CheckCreditCardDeletionImpact?tenantId`, `DELETE DeleteCreditCard?tenantId` | `QA_TenantLocationFramework.md` |
| No server-side role/permission enforcement | All `CreditCardController` endpoints | `QA_RolesPermissions.md` |
| COA deletion does not check credit-card links | `ChartofAccountsController.CheckChartofAccountDeletionImpact` | `QA_ChartOfAccountsMaster.md` (BUG-COA-002) |

