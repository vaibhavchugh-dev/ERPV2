# QA — Category Master

| Module | Matrix section | Bug ID prefix | Tested | Fix Tested | Confirmed Bugs | Potential Bugs | Manual Verification |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Category Master | 2.10 | BUG-CAT | Yes | Yes | 4 | 1 | 5 |

Source of test cases: `QA_TEST_MATRIX.md`. Method: static trace of the actual implementation (React UI → service → Axios → .NET controller → service/repository → EF Core → SQL Server, and back). No application code, configuration or database is changed during QA. Findings that depend on deployed configuration, data or a real browser go under **Needs Manual Verification**.

Severity scale:
- **Critical**: security breach, data corruption, financial corruption, or a blocked core workflow.
- **High**: a major feature is broken or a significant security control is bypassed, with a workaround that is hard or unavailable.
- **Medium**: a feature works incorrectly in specific conditions, or a security control is weaker than configured.
- **Low**: cosmetic, minor UX, or an informational/hardening issue.

---

## Confirmed Bugs



### BUG-CAT-002 — Renaming a value to an existing name shows "Category renamed" but nothing changes
**Severity:** Low. Misleading success message; no data is lost.
**Status:** Confirmed
**Test Area:** CRUD (values) / Error handling
**Description:** Values are renamed inline on blur. When the new name already exists in the same type, the API returns 200 with `existed=true` and does not update the row. The page ignores `existed` and shows "Category renamed", then reloads, and the old name reappears. Clearing the name entirely is silently ignored and leaves the input blank until the next reload.
**Steps to Reproduce:**
1. In a type with values "Milling" and "Turning", change "Turning" to "Milling" and press Enter.
2. Observe the toast and the list.
3. Clear another value's text and tab away.
**Expected:** A duplicate-name rename is refused with a clear message; a blank rename is refused or reverted visibly.
**Actual:** Toast "Category renamed" while the value keeps its old name; a blank rename leaves an empty input with no message.
**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Masters/CategoryMaster.tsx` lines 140-162 (`handleRenameValue` ignores `existed`; returns early on blank), 326-336 (uncontrolled `defaultValue` input).
* Backend: `Cimmple_API/CimmpleAPI/Controllers/CategoryController.cs` lines 392-402 (duplicate name returns OK `existed=true` without saving, even when `request.Id > 0`).
* Database: n/a.
**Root Cause:** The "re-use rather than reject" behaviour meant for tag-picker creation is also applied to renames, and the rename handler does not check `existed`.
**Business Impact:** Users believe a rename succeeded when it did not.
**Affected Areas:** Category Master values panel.
**Recommended Fix:** For `Id > 0` return 400 on a duplicate name; in the UI, check `existed`, show an error, and reset the input to the stored name on blank or failed renames.

---

### BUG-CAT-003 — Value names longer than 150 characters fail with a raw database error
**Severity:** Low. Edge case; the error is unfriendly but no data is corrupted.
**Status:** Confirmed
**Test Area:** Validation
**Description:** `CategoryValue.Name` is limited to 150 characters in the database. Neither the Category Master add/rename inputs nor the API check the length, so a long name fails at `SaveChanges` and the raw SQL truncation message is returned and shown in the toast.
**Steps to Reproduce:**
1. In Category Master, paste a 200-character string into the Add box for any type.
2. Click Add.
3. Observe the error toast.
**Expected:** A field-level message such as "Name must be 150 characters or fewer" (front and back end).
**Actual:** HTTP 500 with the EF/SQL exception text.
**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Masters/CategoryMaster.tsx` lines 293-305 and 326-336 (no `maxLength`; compare `CategoryTypeSlideout.tsx` line 90 which has `maxLength={100}` for type names).
* Backend: `Cimmple_API/CimmpleAPI/Controllers/CategoryController.cs` lines 372-375 and 390 (only blank check), 447-451 (500 with `ex.Message`).
* Database: `Cimmple_API/CimmpleAPI/Data/CimmpleDbContext.cs` line 209 (`CategoryValue.Name` max length 150).
**Root Cause:** Missing length validation for value names.
**Business Impact:** Confusing error for users; leaks database details.
**Affected Areas:** Category Master add/rename; Job Template tag picker create.
**Recommended Fix:** Add `maxLength={150}` to the value inputs and return 400 from `SaveCategoryValue` when the trimmed name exceeds 150 characters.

---

### BUG-CAT-004 — Category API returns raw exception messages and stack traces on every 500
**Severity:** Low. Information disclosure / hardening.
**Status:** Confirmed
**Test Area:** API / Error handling
**Description:** Every action in `CategoryController` returns `{ error = ex.Message, stackTrace = ex.StackTrace }` on an unhandled exception, exposing internal method names, file paths and SQL details to any authenticated caller.
**Steps to Reproduce:**
1. Trigger any server error (for example BUG-CAT-003, or a database outage).
2. Inspect the response body in the browser network tab.
3. Note the `stackTrace` field.
**Expected:** A generic error message to the client; details logged on the server.
**Actual:** Full exception text and stack trace in the response.
**Evidence:**
* Frontend: n/a (UI displays `response.data.error`).
* Backend: `Cimmple_API/CimmpleAPI/Controllers/CategoryController.cs` lines 122-125, 192-195, 264-267, 306-309, 356-359, 447-451, 478-481.
* Database: n/a.
**Root Cause:** Catch blocks serialise the exception to the client.
**Business Impact:** Eases reconnaissance of the API and database schema.
**Affected Areas:** All Category endpoints.
**Recommended Fix:** Log the exception server-side and return a generic message (optionally with a correlation id).

---

## Potential Bugs

### BUG-CAT-005 — "Load Default Types" re-creates system types that an admin has renamed
**Severity:** Low. Produces duplicate starter types that are protected from deletion.
**Status:** Potential
**Test Area:** Business Logic (defaults)
**Description:** `EnsureDefaultCategoryTypes` is documented as provisioning starter types "for a tenant that has none" and as "safe to call repeatedly". It actually matches existing types by **name** only. If an admin renames the system type "Process" to "Operation", the next click on "Load Default Types" creates a second "Process" type (code `PROCESS`, `IsSystem = true`). System types cannot be deleted, so the admin is stuck with the duplicate.
**Steps to Reproduce:**
1. Click "Load Default Types" on an empty tenant.
2. Rename the "Process" type to "Operation".
3. Click "Load Default Types" again.
**Expected:** Existing default types are recognised (for example by `Code`), or the button does nothing when the tenant already has types, as the doc comment says.
**Actual (per code):** A new undeletable "Process" type with the same code is created.
**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Masters/CategoryMaster.tsx` lines 43-61 and 198-205.
* Backend: `Cimmple_API/CimmpleAPI/Controllers/CategoryController.cs` lines 128-131 (comment), 142-158 (name-based match), 160-169 (`IsSystem = true`), 283-286 (system types undeletable); 253-258 (system types can be renamed).
* Database: `CategoryType` unique (Tenantid, Name) only; `Code` is not unique.
**Root Cause:** Seed matching uses the editable name instead of the stable code.
**Business Impact:** Duplicate classification axes in the Job Template filter panel.
**Affected Areas:** Category Master; Job Template listing filters and tag picker.
**Recommended Fix:** Match seeds by `Code` (case-insensitive), or skip seeding when the tenant already has any type.
**Why further verification is needed:** Whether renaming system types is a supported workflow is not documented; confirm product intent before fixing.

---

## Needs Manual Verification

1. **Area:** Responsive layout
   **What to Test:** Two-panel Category Master layout and the Category Type slideout at 375 / 390 / 430 px; touch targets of the ✎ and 🗑 icon buttons.
   **Expected:** Panels stack, icons remain tappable, slideout fits the viewport.
   **Why Manual Testing Is Required:** Depends on `CategoryMaster.scss` rendering in a real browser.
2. **Area:** Permissions
   **What to Test:** Role without the "Category Master" permission (`/masters/category`) — sidebar hidden, direct URL blocked; admin bypass.
   **Expected:** Menu hidden and route shows "No access"; API still callable (see Cross-Module Concerns).
   **Why Manual Testing Is Required:** Needs seeded roles and a running app.
3. **Area:** Concurrent tag creation
   **What to Test:** Two users create the same value name from the Job Template tag picker at the same moment.
   **Expected:** One row is created and both templates reference it (the `existed=true` path); no 500 from the unique index (CategoryTypeId, Name).
   **Why Manual Testing Is Required:** Race timing cannot be judged statically; a simultaneous insert may hit the unique index and return 500.
4. **Area:** Inactive types in Job Templates
   **What to Test:** Deactivate a type used by existing templates, then open and save such a template.
   **Expected:** Existing tags of the inactive type are kept on save even though the type is hidden in the picker.
   **Why Manual Testing Is Required:** Depends on how `JobTemplateMasterSlideout` preserves `CategoryValueIds` that are not rendered.
5. **Area:** Default seeding on a fresh tenant
   **What to Test:** Click "Load Default Types" twice on a new tenant.
   **Expected:** First click creates 9 types and the seeded values; second click shows "All default category types already exist".
   **Why Manual Testing Is Required:** Requires a clean tenant.

## No Issues Found

- Types and values are filtered by tenant on every read (`GetCategoryTypes` line 57, `GetCategoryValues` lines 317 and 331) and every single-row lookup checks tenant (`SaveCategoryType` 230-231, `DeleteCategoryType` 275-276, `SaveCategoryValue` 382-383 and 408-409, `DeleteCategoryValue` 459-460).
- Type name uniqueness is enforced per tenant, case-insensitively, in the API (lines 215-224) and by the unique index (Tenantid, Name) (`CimmpleDbContext.cs` line 202).
- System types cannot be deleted: the API returns 400 (lines 283-286) and the UI disables the delete button with a tooltip (`CategoryMaster.tsx` lines 259-275).
- Types and values used by job templates cannot be deleted: API counts `JobTemplateCategory` (lines 288-297, 467-471), the UI disables the value delete button when `usageCount > 0` (lines 340-352), and the FK is Restrict (`CimmpleDbContext.cs` lines 293-297).
- Deleting a type removes its values (explicit `RemoveRange` lines 299-300 plus Cascade FK lines 215-218).
- Duplicate value creation from the tag picker is idempotent (`existed=true`, lines 392-402) and the picker selects the returned id (`CategoryTagInput.tsx` lines 89-106).
- The tag picker only offers "Create" when `allowCreate` and `type.allowUserValues` are both true (`CategoryTagInput.tsx` lines 135-139).
- Job Template save verifies every selected category value belongs to the tenant (`JobTemplateController.cs` lines 432-441).
- Inactive types are hidden from the Job Template slideout and listing filters (`JobTemplateMasterSlideout.tsx` line 171; `JobTemplateMaster.tsx` line 152).
- Category type name is required in the UI (`CategoryTypeSlideout.tsx` lines 37-41) and API (lines 208-211).
- Sidebar entry and route exist (`Sidebar.tsx` line 173; `Routes.tsx` lines 96-98) and the permission row is seeded (`UserManagementController.cs` line 902).

## QA Coverage

| Test Area | Tested | Result |
| --- | --- | --- |
| Navigation | Yes | Pass |
| CRUD | Yes | Fail (BUG-CAT-001, BUG-CAT-002) |
| Search | Partial | Pass (tag-picker client search; master page has no search) |
| Filters | N/A | N/A |
| Sorting | N/A | N/A (server orders by DisplayOrder, Name) |
| Pagination | N/A | N/A |
| Validation | Yes | Fail (BUG-CAT-003) |
| Permissions | Partial | Manual |
| API | Yes | Fail (BUG-CAT-004) |
| Database | Yes | Pass |
| Business Logic | Yes | Fail (BUG-CAT-001); Potential (BUG-CAT-005) |
| Location | N/A | N/A (tenant-wide master) |
| Tenant | Yes | Pass (module-specific); generic pattern in Cross-Module Concerns |
| Cross-Module | Yes | Pass |
| Responsive/PWA | No | Manual |

## Matrix Checklist

| Matrix Row | Result | Notes |
| --- | --- | --- |
| FE — List types (`CategoryMaster.tsx`, GET `GetCategoryTypes`, POST `EnsureDefaultCategoryTypes`) | Pass / Potential (BUG-CAT-005) | Types load with values and usage counts; defaults are seeded only on the "Load Default Types" click, not automatically. |
| FE — Add / Edit type (`CategoryTypeSlideout.tsx`, AllowUserValues, IsActive, DisplayOrder) | Fail (BUG-CAT-001) | Fields save correctly; the AllowUserValues help text does not match server behaviour. |
| FE — Delete type | Pass | Confirm dialog; system types disabled; server blocks in-use types. |
| FE — Values: list, search (server), add, delete | Fail (BUG-CAT-001, BUG-CAT-002, BUG-CAT-003) | List/add/delete/rename present. The page does not call `GetCategoryValues?search`; that endpoint is unused by the UI (tag picker searches client-side). |
| FE — Tag picker (`CategoryTagInput.tsx`, create only if `allowCreate` and `allowUserValues`) | Pass | Lines 135-139. |
| FE — Validation / Permissions / Responsive | Fail (BUG-CAT-003) / Manual | Type name required; value length unchecked; permissions and responsive need a browser. |
| BE — CRUD (`CategoryController`, `CategoryType`, `CategoryValue`) | Pass | All endpoints tenant-filtered. |
| BE — Validation: duplicate value returns existing (`existed=true`) | Pass / Fail (BUG-CAT-002) | Correct for create; wrong for rename. |
| BE — Validation: rejected if type disallows user values | Fail (BUG-CAT-001) | Also blocks admins. |
| BE — Validation: system types undeletable | Pass | Lines 283-286. |
| BE — Validation: used by job templates undeletable | Pass | Lines 293-297, 467-471. |
| BE — DB: unique (Tenantid, Name); unique (CategoryTypeId, Name); values Cascade | Pass | `CimmpleDbContext.cs` lines 202, 213, 215-218. |
| BE — Authorization (authenticated) | Pass | Global fallback policy; no role check (see Cross-Module Concerns). |
| Cross-Module — Category → Job Template tags and filters | Pass | Tenant check on save; inactive types hidden; Restrict FK. |
| Database — `CategoryType`, `CategoryValue`, `JobTemplateCategory`; legacy `Category`, `ProductType` | Pass / N/A | Legacy `Category` and `ProductType` DbSets are not used by Category Master. |

## Cross-Module Concerns

| Concern | Affected endpoints | Owner |
| --- | --- | --- |
| Client-supplied `tenantid`/`Tenantid` trusted without comparing to the token tenant | `GET Category/GetCategoryTypes?tenantid`, `POST EnsureDefaultCategoryTypes` (body `Tenantid`), `POST SaveCategoryType` (body), `DELETE DeleteCategoryType?tenantId`, `GET GetCategoryValues?tenantid`, `POST SaveCategoryValue` (body), `DELETE DeleteCategoryValue?tenantId` | `QA_TenantLocationFramework.md` |
| No server-side role/permission enforcement (any authenticated user can create, rename or delete types and values) | All `CategoryController` endpoints | `QA_RolesPermissions.md` |

