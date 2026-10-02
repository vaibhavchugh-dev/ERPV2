# QA — Price Breakdown Master

| Module | Matrix section | Bug ID prefix | Tested | Confirmed Bugs | Potential Bugs | Manual Verification |
| --- | --- | --- | --- | --- | --- | --- |
| Price Breakdown Master | 2.11 | BUG-PB | Yes | 5 | 1 | 4 |

Source of test cases: `QA_TEST_MATRIX.md`. Method: static trace of the actual implementation (React UI → service → Axios → .NET controller → service/repository → EF Core → SQL Server, and back). No application code, configuration or database is changed during QA. Findings that depend on deployed configuration, data or a real browser go under **Needs Manual Verification**.

Severity scale:
- **Critical**: security breach, data corruption, financial corruption, or a blocked core workflow.
- **High**: a major feature is broken or a significant security control is bypassed, with a workaround that is hard or unavailable.
- **Medium**: a feature works incorrectly in specific conditions, or a security control is weaker than configured.
- **Low**: cosmetic, minor UX, or an informational/hardening issue.

---

## Confirmed Bugs

### BUG-PB-001 — The last remaining price breakdown item can never be deleted
**Severity:** Medium. A basic delete fails in a specific condition with no workaround in the UI.
**Status:** Confirmed
**Test Area:** CRUD (delete) / Error handling
**Description:** The page saves the full list. When the user deletes every row and clicks "Save Changes", the request body is an empty array. The API rejects an empty list with 400 "Request is null or empty", so the last item can only be deactivated, never removed. The toast also hides the server message (it shows the generic axios text).
**Steps to Reproduce:**
1. Open `/masters/pricebreakdown` with exactly one item (or delete all but one and save).
2. Click × on the remaining row and confirm.
3. Click "Save Changes".
**Expected:** The item is deleted and the list is empty.
**Actual:** Toast "Error saving price breakdowns: Request failed with status code 400"; the item remains.
**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Masters/PriceBreakdownMaster.tsx` lines 91-107 (row removed locally), 127-166 (`handleSave` posts the remaining rows; line 162 shows `error.message`).
* Backend: `Cimmple_API/CimmpleAPI/Controllers/PriceBreakdownController.cs` lines 86-89 (empty list → 400) and 91-95 (tenant taken from the first row, so an empty list cannot carry the tenant).
* Database: `PriceBreakdownMaster`.
**Root Cause:** The bulk-save contract derives the tenant from the first row and treats an empty list as invalid instead of "delete all".
**Business Impact:** Obsolete cost items cannot be fully removed.
**Affected Areas:** Price Breakdown Master save.
**Recommended Fix:** Take the tenant from the token (or a separate field) and allow an empty list to mean "remove all"; show `response.data.error` in the toast.

---

### BUG-PB-002 — Saving a stale list hard-deletes items that another user added in the meantime
**Severity:** Medium. Silent data loss when two admins edit the master concurrently.
**Status:** Confirmed
**Test Area:** CRUD / Database / Business Logic
**Description:** `SavePriceBreakdowns` deletes every tenant row whose id is not in the posted list. The page posts whatever it loaded earlier plus local edits. If user B adds "Anodising" after user A loaded the page, A's next save deletes "Anodising" without warning, and also overwrites B's renames or status changes with A's stale values.
**Steps to Reproduce:**
1. User A opens `/masters/pricebreakdown`.
2. User B opens the same page, adds "Anodising" and saves.
3. User A toggles any row's Active flag and saves.
**Expected:** B's new item survives (or A is warned that the list changed).
**Actual:** "Anodising" is hard-deleted; B's change is lost.
**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Masters/PriceBreakdownMaster.tsx` lines 44-71 (list loaded once), 148-156 (full list posted).
* Backend: `Cimmple_API/CimmpleAPI/Controllers/PriceBreakdownController.cs` lines 97-105 (rows missing from the request are removed), 131-134 (all fields overwritten).
* Database: `PriceBreakdownMaster` (no row version / concurrency token).
**Root Cause:** Full-list replace semantics with no concurrency check.
**Business Impact:** Cost items used in quotation price matrices can disappear unexpectedly.
**Affected Areas:** Price Breakdown Master; Customer Quotation price breakdown popup.
**Recommended Fix:** Send explicit deletes (ids the user removed) instead of inferring them, or add a concurrency token / last-modified check and reject stale saves.

---

### BUG-PB-003 — Item names are not validated on the server (required, duplicate, trimming)
**Severity:** Low. The UI enforces the rules; only direct API calls bypass them.
**Status:** Confirmed
**Test Area:** Validation
**Description:** The matrix says "ItemName required; duplicate names rejected (UI)". The API accepts blank names and duplicates, and neither side trims the stored value, so " Paint" and "Paint" are both stored even though the UI duplicate check compares trimmed, lower-cased names.
**Steps to Reproduce:**
1. POST `/api/PriceBreakdown/SavePriceBreakdowns` with two rows `ItemName: "Paint"` and `ItemName: ""`.
2. GET `GetPriceBreakdowns`.
3. In the UI, add " Paint" (leading space) to a list with no "Paint" and save.
**Expected:** 400 for blank or duplicate names; names stored trimmed.
**Actual:** Both rows saved; leading/trailing spaces persisted.
**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Masters/PriceBreakdownMaster.tsx` lines 128-141 (UI-only checks), 148-150 (`ItemName: p.itemName` not trimmed).
* Backend: `Cimmple_API/CimmpleAPI/Controllers/PriceBreakdownController.cs` lines 131-134 (no validation, no trim).
* Database: `PriceBreakdownMaster.ItemName` nvarchar(max), no unique index (`Cimmple_API/CimmpleAPI/Data/Migrations/CimmpleDbContextModelSnapshot.cs` lines 3180-3204).
**Root Cause:** Validation exists only in the browser.
**Business Impact:** Blank or duplicate rows appear in the quotation price breakdown popup.
**Affected Areas:** Price Breakdown Master; Customer Quotation popup.
**Recommended Fix:** Trim names and reject blanks and case-insensitive duplicates in `SavePriceBreakdowns`.

---

### BUG-PB-004 — A newly added row is appended out of view when the list spans several pages
**Severity:** Low. Cosmetic/UX.
**Status:** Confirmed
**Test Area:** Pagination / CRUD (add)
**Description:** "Add Item" appends a blank row at the end of the array but does not move to the last page. With more items than the page size, the user sees nothing happen, and the Save then fails with "Please fill in all item names" for a row they cannot see.
**Steps to Reproduce:**
1. Have more than 10 items with page size 10, viewing page 1.
2. Click "Add Item".
3. Click "Save Changes" without changing pages.
**Expected:** The view jumps to the new row (or the row is inserted on the current page).
**Actual:** No visible row; Save shows "Please fill in all item names".
**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Masters/PriceBreakdownMaster.tsx` lines 74-89 (`handleAddRow` appends, no page change), 283-294 (`useClientPagination(priceBreakdowns, [])`), 128-133.
* Backend: n/a.
* Database: n/a.
**Root Cause:** Add-row logic does not interact with pagination.
**Business Impact:** Confusing editing experience.
**Affected Areas:** Price Breakdown Master grid.
**Recommended Fix:** After adding, set the current page to the last page and focus the new input.

---

### BUG-PB-005 — Save errors show a generic message while the API returns the raw exception and stack trace
**Severity:** Low. Hardening and UX.
**Status:** Confirmed
**Test Area:** Error handling / API
**Description:** On failure the page shows `error.message` (for example "Request failed with status code 400"), not the server's `error` text. On a 500, `SavePriceBreakdowns` returns `ex.Message` plus `ex.StackTrace` to the client.
**Steps to Reproduce:**
1. Trigger a 400 (BUG-PB-001) or a 500 on save.
2. Read the toast.
3. Inspect the response body.
**Expected:** Toast shows the server message; response body contains no stack trace.
**Actual:** Generic toast; stack trace in the response.
**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Masters/PriceBreakdownMaster.tsx` lines 160-163.
* Backend: `Cimmple_API/CimmpleAPI/Controllers/PriceBreakdownController.cs` lines 141-144.
* Database: n/a.
**Root Cause:** Error handling does not read `response.data.error`; catch block serialises the stack trace.
**Business Impact:** Users cannot tell why a save failed; internal details leak.
**Affected Areas:** Price Breakdown save.
**Recommended Fix:** Display `error.response?.data?.error`; log exceptions server-side and return a generic message.

---

## Potential Bugs

### BUG-PB-006 — Deleting an item has no in-use check, and quotations that used it lose that row when their matrix is reopened
**Severity:** Medium. Can silently change quoted cost totals on existing quotations.
**Status:** Potential
**Test Area:** CRUD (delete) / Cross-Module
**Description:** Quotation lines store their price breakdown matrix as JSON that references `PriceBreakdownId`. The master hard-deletes items with no check against quotations. When an existing quotation's price breakdown popup is opened after the item was deleted (or deactivated), the popup keeps only active master items, drops the missing row and its prices, and saves the pruned matrix back.
**Steps to Reproduce:**
1. Create a quotation line and fill the price breakdown matrix including item "Heat Treat".
2. Delete "Heat Treat" in Price Breakdown Master and save.
3. Reopen the quotation, open the line's price breakdown popup and click Save; save the quotation.
**Expected:** Deletion is blocked or warned while quotations reference the item, or historical matrices keep their rows.
**Actual (per code):** The "Heat Treat" row and its prices are removed from the quotation's matrix and totals.
**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Masters/PriceBreakdownMaster.tsx` lines 100-105 (only a generic confirm); `Cimmple_UI/src/Modules/Quotations/CustomerQuotationSlideout.tsx` lines 3080-3082 (active items only), 3104-3121 (prunes rows not in the active list), 3230-3236 (persists only active rows).
* Backend: `Cimmple_API/CimmpleAPI/Controllers/PriceBreakdownController.cs` lines 102-105 (hard delete, no usage check); `Cimmple_API/CimmpleAPI/Controllers/QuotationController.cs` lines 486-488 and 4443-4448 (`PriceBreakdownId` stored in `QuantityTiers` JSON).
* Database: `PriceBreakdownMaster`; `QuotationOrderDetails.QuantityTiers` (JSON).
**Root Cause:** No referential check between the master and the JSON matrices; the popup treats "not active in master" as "remove".
**Business Impact:** Re-saving an old quotation can change its cost build-up without the user noticing.
**Affected Areas:** Price Breakdown Master; Customer Quotations (price matrix popup, totals, PDF).
**Recommended Fix:** Block or warn on delete when quotations reference the id; in the popup, keep historical rows (read-only) instead of pruning them.
**Why further verification is needed:** The pruning is deliberate for deactivated items ("Persist only active ops"); confirm with the product owner whether historical quotations should keep deleted/inactive rows, and check whether the quote unit price is derived from these totals.

---

## Needs Manual Verification

1. **Area:** Concurrent edits
   **What to Test:** Two browsers editing the master as in BUG-PB-002.
   **Expected:** No silent loss of the other user's rows.
   **Why Manual Testing Is Required:** Requires two live sessions.
2. **Area:** Responsive grid
   **What to Test:** Inline grid, unsaved-changes footer and pagination at 375 / 390 / 430 px.
   **Expected:** Inputs usable, footer buttons reachable, table scrolls horizontally.
   **Why Manual Testing Is Required:** Rendering cannot be judged statically.
3. **Area:** Unsaved changes on navigation
   **What to Test:** Edit rows, then click another sidebar item or press browser back.
   **Expected:** Per the standard CRUD check, a prompt before losing changes.
   **Why Manual Testing Is Required:** The page shows an in-page "You have unsaved changes" footer but has no route-leave guard; confirm whether a prompt is expected.
4. **Area:** Permissions
   **What to Test:** Role without "Price Breakdown Master" (`/masters/pricebreakdown`); admin bypass.
   **Expected:** Menu hidden and route blocked.
   **Why Manual Testing Is Required:** Needs seeded roles.

## No Issues Found

- List and single-row reads are tenant-filtered (`PriceBreakdownController.cs` lines 28-30 and 54-56); bulk save only loads and deletes rows of the posted tenant (lines 97-100) and ignores ids that do not belong to it (lines 113-119).
- Status mapping is consistent: UI sends "Active"/"Inactive" (`PriceBreakdownMaster.tsx` line 152), API stores 1/0 (line 134) and returns `statusText` (line 37).
- List is ordered by `Srno` (line 30); new rows get `max(Srno) + 1` (`PriceBreakdownMaster.tsx` lines 74-84).
- UI rejects blank and case-insensitive duplicate names before saving (lines 128-141).
- Discard restores the loaded list after confirmation (lines 168-173); delete of a saved row asks for confirmation (lines 100-105).
- The quotation popup only offers active items (`CustomerQuotationSlideout.tsx` lines 3080-3082), as the matrix states.
- Global search for price breakdowns is tenant-filtered (`GlobalSearchController.cs` lines 613-618).
- Sidebar entry, route and permission row exist (`Sidebar.tsx` line 172; `Routes.tsx` lines 101-103; `UserManagementController.cs` line 903).

## QA Coverage

| Test Area | Tested | Result |
| --- | --- | --- |
| Navigation | Yes | Pass |
| CRUD | Yes | Fail (BUG-PB-001, BUG-PB-002); Potential (BUG-PB-006) |
| Search | N/A | N/A |
| Filters | N/A | N/A |
| Sorting | N/A | N/A (fixed Srno order) |
| Pagination | Yes | Fail (BUG-PB-004) |
| Validation | Yes | Fail (BUG-PB-003) |
| Permissions | Partial | Manual |
| API | Yes | Fail (BUG-PB-001, BUG-PB-005) |
| Database | Yes | Fail (BUG-PB-002) |
| Business Logic | Yes | Fail (BUG-PB-002) |
| Location | N/A | N/A (tenant-wide master) |
| Tenant | Yes | Pass (module-specific); generic pattern in Cross-Module Concerns |
| Cross-Module | Yes | Potential (BUG-PB-006) |
| Responsive/PWA | No | Manual |

## Matrix Checklist

| Matrix Row | Result | Notes |
| --- | --- | --- |
| FE — List / inline grid (`PriceBreakdownMaster.tsx`, bulk save, GET `GetPriceBreakdowns`) | Pass / Fail (BUG-PB-004) | Grid loads and edits inline; add-row pagination issue. |
| FE — Edit (`PriceBreakdownMasterSlideout.tsx`, GET `GetPriceBreakdownById`) | N/A | The slideout is not imported anywhere (dead code); editing is inline in the grid, so `GetPriceBreakdownById` is unreachable from the UI. |
| FE — Save all (POST `SavePriceBreakdowns`, full list) | Fail (BUG-PB-001, BUG-PB-002, BUG-PB-005) | Empty list rejected; stale list deletes others' rows; generic error toast. |
| FE — Validation (ItemName required; duplicates rejected in UI) | Pass (UI) / Fail (BUG-PB-003) | UI checks work; server has none; values not trimmed. |
| FE — Permissions / Responsive | Manual | Needs a browser and seeded roles. |
| BE — List/Get (`PriceBreakdownController`, list and by id) | Pass | Tenant-filtered. |
| BE — Save (rows missing from list are hard-deleted) | Fail (BUG-PB-001, BUG-PB-002); Potential (BUG-PB-006) | Behaviour matches the matrix description, but causes the listed defects. |
| BE — Authorization (authenticated) | Pass | No role check (see Cross-Module Concerns). |
| Cross-Module — Price Breakdown → Customer Quotation matrix popup (active items only) | Pass / Potential (BUG-PB-006) | Active filter correct; deleted/inactive items pruned from existing quotes. |
| Database — `PriceBreakdownMaster` (ItemName, Srno, Status) | Pass / Fail (BUG-PB-003) | No unique index on ItemName per tenant. |

## Cross-Module Concerns

| Concern | Affected endpoints | Owner |
| --- | --- | --- |
| Client-supplied `tenantid`/`Tenantid` trusted without comparing to the token tenant | `GET PriceBreakdown/GetPriceBreakdowns?tenantid`, `GET GetPriceBreakdownById?tenantId`, `POST SavePriceBreakdowns` (tenant from the first row's `Tenantid`; a forged value deletes and replaces another tenant's whole list) | `QA_TenantLocationFramework.md` |
| No server-side role/permission enforcement | All `PriceBreakdownController` endpoints | `QA_RolesPermissions.md` |
| Quotation matrix prunes deleted/inactive breakdown rows on re-save | `CustomerQuotationSlideout.tsx` price breakdown popup | `QA_Sales.md` (see BUG-PB-006 for the master side) |
