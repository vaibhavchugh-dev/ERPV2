# QA — Workstation Master

| Module | Matrix section | Bug ID prefix | Tested | Fix Tested | Confirmed Bugs | Potential Bugs | Manual Verification |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Workstation Master | 2.5 | BUG-WS | Yes | No | 7 | 1 | 4 |

Source of test cases: `QA_TEST_MATRIX.md`. Method: static trace of the actual implementation (React UI → service → Axios → .NET controller → service/repository → EF Core → SQL Server, and back). No application code, configuration or database is changed during QA. Findings that depend on deployed configuration, data or a real browser go under **Needs Manual Verification**.

Severity scale:
- **Critical**: security breach, data corruption, financial corruption, or a blocked core workflow.
- **High**: a major feature is broken or a significant security control is bypassed, with a workaround that is hard or unavailable.
- **Medium**: a feature works incorrectly in specific conditions, or a security control is weaker than configured.
- **Low**: cosmetic, minor UX, or an informational/hardening issue.

---

## Confirmed Bugs

### BUG-WS-001 — CSV import can deactivate a workstation that is still referenced
**Severity:** Medium. A documented business rule (deactivation blocked while referenced) is bypassed through a normal UI path, leaving processes, templates and job routings pointing at an inactive workstation.
**Status:** Confirmed
**Test Area:** Import / Business Logic
**Description:** `SaveWorkstation` refuses to switch a workstation from Active to Inactive when it is used as a process default, in a job template header/operation, or in job-order routing JSON. `ImportWorkstations` with "Update existing workstations when matched" (checked by default) sets `IsActive = false` on a matched row without running the same check.
**Steps to Reproduce:**
1. Create workstation "CNC-1" and set it as the Default Workstation on any process (or use it on a job template operation).
2. Open Workstation Master → Import, upload a CSV with `WorkstationName,Status` / `CNC-1,Inactive`, keep "Update existing" checked, click Import.
3. Reload the list and open the process / job template that uses CNC-1.
**Expected:** The row fails with the same message the slideout gives ("This workstation is still referenced by Process Master, Job Templates, or Job Order routing.") and the workstation stays Active.
**Actual:** The row reports "Updated" and CNC-1 becomes Inactive while still referenced. Process and Job Template forms then filter it out of their dropdowns (`isActive !== false`), so the stored id is shown as blank/"None".
**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Masters/WorkstationMasterImportModal.tsx` lines 42, 120-123 (updateExisting defaults to true, sent to API); `Cimmple_UI/src/Modules/Masters/ProcessMasterSlideout.tsx` line 75 (inactive workstations filtered out).
* Backend: `Cimmple_API/CimmpleAPI/Controllers/WorkstationController.cs` lines 156-167 (guard in `SaveWorkstation`), lines 298-317 (import update path sets `match.IsActive` at line 311 with no guard).
* Database: `CimmpleFlow.WorkstationMaster.IsActive`.
**Root Cause:** The deactivation guard (`BuildWorkstationDeletionImpact`) is only called from `SaveWorkstation` and `DeleteWorkstation`, not from the import update branch.
**Business Impact:** Routings and templates reference an inactive resource; users editing those records lose the visible selection, and utilization reports may show inactive stations in use.
**Affected Areas:** Workstation import, Process Master default workstation, Job Template operations, Job Order routing.
**Recommended Fix:** In the import update branch, when the parsed status changes Active → Inactive, call `BuildWorkstationDeletionImpact` and record the row as `Error` with the blocking reason instead of updating.

---

### BUG-WS-002 — "Used in job order routing" check matches id prefixes, falsely blocking delete/deactivate
**Severity:** Medium. Valid deletes and deactivations are refused in specific id combinations, with a misleading reason.
**Status:** Confirmed
**Test Area:** Delete / Business Logic
**Description:** `CountJobOrdersReferencingField` searches `RoutingStepsJson` for the substring `"workstationId":5`. Routing JSON is serialized camelCase without spaces (`JobOrderController.cs` lines 460-465), so the substring `"workstationId":5` is also found inside `"workstationId":50`, `"workstationId":51`, `"workstationId":512`, etc.
**Steps to Reproduce:**
1. Have workstation id 5 (unused anywhere) and workstation id 52 used on any job order routing step.
2. Open workstation id 5 and click Delete (or change status to Inactive and save).
**Expected:** The impact dialog allows deletion (no references to id 5).
**Actual:** The dialog shows "Referenced in routing on N job order(s)" and blocks deletion/deactivation of id 5.
**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Masters/WorkstationMasterSlideout.tsx` lines 154-169 (impact dialog shows backend result).
* Backend: `Cimmple_API/CimmpleAPI/Controllers/WorkstationController.cs` lines 571-581 (JO dependency), lines 596-612 (substring `IndexOf` patterns with no terminator); `Cimmple_API/CimmpleAPI/Controllers/JobOrderController.cs` lines 460-465 (camelCase compact serialization), lines 1775-1782 (`workstationId` is `int?`).
* Database: `CimmpleFlow.JobOrderMaster.RoutingStepsJson`.
**Root Cause:** Substring matching on serialized JSON without checking that the next character is a delimiter (`,` or `}`).
**Business Impact:** Admins cannot retire unused workstations once the tenant has enough workstations that ids share prefixes; the error claims job orders reference the workstation when they do not.
**Affected Areas:** Workstation delete, workstation deactivate (shares `BuildWorkstationDeletionImpact`).
**Recommended Fix:** Deserialize `RoutingStepsJson` (or use `OPENJSON` server-side) and compare `workstationId` numerically; at minimum require a delimiter after the id in the pattern.

---

### BUG-WS-003 — Workstation user mapping accepts users from other tenants and the list shows their names
**Severity:** Medium. A tenant-isolation gap (cross-tenant reference plus username disclosure) reachable with a direct API call.
**Status:** Confirmed
**Test Area:** Tenant / Validation / API
**Description:** `SaveWorkstation` inserts `UserWorkstationMapping` rows for any `UserId > 0` in the request, without checking that the user exists or belongs to `request.TenantID`. `GetWorkstations`, `GetWorkstationById` and `GetUserWorkstationMapping` join `UserDetails` by `User_UniqueID` only (no tenant filter on `UserDetails`), so the foreign user's `UserName` is returned in tenant A's list.
**Steps to Reproduce:**
1. As a tenant A user, POST `/api/Workstation/SaveWorkstation` with `{ "Id": <own ws>, "WorkstationName": "X", "IsActive": true, "UserWorkstationMappings": [ { "UserId": <user id belonging to tenant B> } ] }`.
2. GET `/api/Workstation/GetWorkstations` (or open Workstation Master).
**Expected:** 400 "User not found" for ids outside the tenant; tenant A never sees tenant B usernames.
**Actual:** The mapping is saved and the "Assigned Users" column shows tenant B's username. Iterating ids enumerates usernames across tenants.
**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Masters/WorkstationMasterSlideout.tsx` lines 220-228 (sends whatever mappings are in state).
* Backend: `Cimmple_API/CimmpleAPI/Controllers/WorkstationController.cs` lines 203-216 (no user validation), lines 31-39, 76-89, 386-399 (`Join(_context.UserDetails, ...)` with no `TenantID` predicate on `UserDetails`). Compare `GetAllUsers` lines 414-417 which does filter by tenant.
* Database: `CimmpleFlow.UserWorkstationMapping.UserId` (no FK to `UserDetails`).
**Root Cause:** Missing server-side ownership check of child references and missing tenant predicate on the joined table.
**Business Impact:** Usernames (login identifiers) of other tenants can be harvested; shop-floor assignment data references foreign users.
**Affected Areas:** Workstation save, list, get-by-id, user-mapping endpoints.
**Recommended Fix:** Before inserting, verify every `UserId` exists in `UserDetails` with `TenantID == tenant` and is not a vendor user; add `ud.TenantID == tenantid` to the joins.

---

### BUG-WS-004 — The same user can be assigned to a workstation more than once
**Severity:** Low. Duplicate rows and duplicate names in the list; no functional impact beyond clutter.
**Status:** Confirmed
**Test Area:** Forms / Validation / Database
**Description:** Each "Add User" row is an independent dropdown that still lists already-selected users; neither the UI nor the API de-duplicates, and the table has no unique index on (WorkstationId, UserId).
**Steps to Reproduce:**
1. Open a workstation, click "+ Add User" twice and pick the same user in both rows.
2. Click Update Workstation and look at the "Assigned Users" column.
**Expected:** Duplicate is rejected or collapsed into one mapping.
**Actual:** Two mapping rows are saved and the list shows e.g. "jsmith, jsmith".
**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Masters/WorkstationMasterSlideout.tsx` lines 105-117 (no duplicate check), lines 366-381 (all users offered in every row), lines 221-222 (only `userId > 0` filter).
* Backend: `Cimmple_API/CimmpleAPI/Controllers/WorkstationController.cs` lines 203-216 (inserts each entry).
* Database: `CimmpleFlow.UserWorkstationMapping` (no unique index; model `Data/Models/WorkstationMaster.cs` lines 14-21).
**Root Cause:** No de-duplication in UI, API or schema.
**Business Impact:** Cosmetic noise; deletion-impact counts ("N user mapping(s) will be deleted") are inflated.
**Affected Areas:** Workstation slideout, list "Assigned Users", deletion impact.
**Recommended Fix:** Hide already-selected users in other rows and `Distinct()` the user ids server-side; optionally add a unique index (WorkstationId, UserId).

---

### BUG-WS-005 — Unrecognised Status values in the import are silently ignored
**Severity:** Low. Data is imported with a status the user did not ask for, without warning.
**Status:** Confirmed
**Test Area:** Import / Validation
**Description:** `ParseStatus` returns `null` for anything other than active/inactive/1/0/yes/no/true/false. A new row with an unrecognised status (e.g. "Disabled", "Inactve") is created Active, and an existing row keeps its old status, but the row is reported as "Created"/"Updated" with no message. The preview shows the raw text, so the user believes it will be honoured.
**Steps to Reproduce:**
1. Import a CSV row `NEW-WS,Disabled`.
2. Check the preview (Status column shows "Disabled") and import.
**Expected:** Row flagged as an error (or warning) "Status must be Active or Inactive".
**Actual:** Row created as Active with message "Created".
**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Masters/WorkstationMasterImportModal.tsx` lines 80-98 (only name validated), line 231 (preview shows raw status).
* Backend: `Cimmple_API/CimmpleAPI/Controllers/WorkstationController.cs` lines 294, 311, 324 (`isActive ?? true`), lines 372-379 (`ParseStatus`).
* Database: `CimmpleFlow.WorkstationMaster.IsActive`.
**Root Cause:** Parse failure treated as "not supplied".
**Business Impact:** Workstations intended to be inactive are offered in process/template dropdowns.
**Affected Areas:** Workstation import.
**Recommended Fix:** Distinguish blank (keep/default) from invalid (row error) in both the preview and the API.

---

### BUG-WS-006 — Workstation slideout discards unsaved edits without a prompt
**Severity:** Low. Minor UX data loss; standard CRUD check "unsaved-change prompt" fails here while Process and Job Template slideouts pass.
**Status:** Confirmed
**Test Area:** CRUD / Forms
**Description:** `isStateChanged` is tracked but never read. Clicking the backdrop, ×, or Cancel calls `onClose()` immediately.
**Steps to Reproduce:**
1. Open a workstation, change the name and add a user.
2. Click outside the slideout (or ×).
**Expected:** "You have unsaved changes…" confirmation, as in `ProcessMasterSlideout.tsx` lines 257-265.
**Actual:** Slideout closes and edits are lost.
**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Masters/WorkstationMasterSlideout.tsx` lines 32, 102, 116 (state set), lines 244-246 (`handleDiscard` ignores it), line 262 (backdrop click), line 290 (×).
* Backend: n/a
* Database: n/a
**Root Cause:** Prompt logic not implemented.
**Business Impact:** Accidental loss of user-assignment edits.
**Affected Areas:** Workstation add/edit slideout.
**Recommended Fix:** Mirror the Process Master `handleCancel` confirmation.

---

### BUG-WS-007 — Delete failures show a generic Axios message instead of the server reason
**Severity:** Low. The user is not told why a delete failed.
**Status:** Confirmed
**Test Area:** Error Handling
**Description:** `confirmDeletion` and the impact checks build the toast from `error.message` only. When `DeleteWorkstation` returns 400 with `{ error: "This workstation is still referenced…" }` (e.g. a reference was added after the impact dialog opened), the toast reads "Error deleting workstation: Request failed with status code 400".
**Steps to Reproduce:**
1. Open workstation A, click Delete (dialog says it can be deleted).
2. In another tab, set A as a process default workstation.
3. Confirm the delete in the first tab.
**Expected:** Toast shows the backend reason.
**Actual:** Toast shows "Request failed with status code 400".
**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Masters/WorkstationMasterSlideout.tsx` lines 163-166, 180-183, 194-197.
* Backend: `Cimmple_API/CimmpleAPI/Controllers/WorkstationController.cs` lines 467-475.
* Database: n/a
**Root Cause:** `error.response.data.error` not read (the save handler at lines 232-238 does read it).
**Business Impact:** Confusing error; users retry or raise support tickets.
**Affected Areas:** Workstation delete and impact refresh.
**Recommended Fix:** Use `error?.response?.data?.error || error.message` as in `handleSubmit`.

---

## Potential Bugs

### BUG-WS-008 — Workstation name uniqueness is not enforced by the database
**Severity:** Low. Duplicate names only under concurrent saves/imports.
**Status:** Potential
**Test Area:** Database / Validation
**Description:** Uniqueness per tenant (case-insensitive) is checked in code (`Any(...)` then insert) but `WorkstationMaster` has no unique index on (TenantId, WorkstationName). Two simultaneous saves or an import running alongside a manual save can both pass the check.
**Steps to Reproduce:**
1. Send two `SaveWorkstation` requests with the same new name at the same time (or import while another user saves the same name).
2. Inspect `WorkstationMaster` for the tenant.
**Expected:** Only one row created; the second request gets "Workstation name already exists".
**Actual:** Both requests may succeed, creating duplicate names.
**Evidence:**
* Frontend: n/a
* Backend: `Cimmple_API/CimmpleAPI/Controllers/WorkstationController.cs` lines 128-144, 257-259, 295-296; `Cimmple_API/CimmpleAPI/Data/CimmpleDbContext.cs` (no `modelBuilder.Entity<WorkstationMaster>` configuration; only the DbSet at line 38).
* Database: `CimmpleFlow.WorkstationMaster` (no unique index).
**Root Cause:** Check-then-insert without a DB constraint or serializable transaction.
**Business Impact:** Duplicate workstations make import matching ("first match wins") and reporting ambiguous.
**Affected Areas:** Save, import.
**Recommended Fix:** Add a unique index on (TenantId, WorkstationName) with a case-insensitive collation and translate the violation into a 400.
**Why further verification is needed:** Requires concurrent requests; the deployed database might already have a manually created unique constraint not present in the EF model.

---

## Needs Manual Verification

1. **Area:** Responsive / slideout
   **What to Test:** Open the workstation slideout at 375/390/430 px with 10+ assigned users; scroll the user table and use the Delete/Cancel/Update buttons.
   **Expected:** Table scrolls horizontally (`overflowX: auto`), buttons remain reachable, Esc closes the slideout.
   **Why Manual Testing Is Required:** Layout and touch-target size cannot be judged from code.
2. **Area:** Navigation / deep link
   **What to Test:** Open `/masters/workstation?open=<id>` for a valid id, an id from another tenant, and a non-existent id.
   **Expected:** Valid id opens the slideout; other ids show "Workstation not found" and do not leave a blank slideout.
   **Why Manual Testing Is Required:** On 404 the slideout keeps the empty form open (`loadWorkstation` only toasts); visual behaviour needs confirming.
3. **Area:** Permissions
   **What to Test:** Role without `/masters/workstation` permission: sidebar hidden, direct URL blocked; same user calling `/api/Workstation/*` directly.
   **Expected:** UI blocks; API currently allows (cross-cutting, see Cross-Module Concerns).
   **Why Manual Testing Is Required:** Depends on configured role permissions.
4. **Area:** Import file handling
   **What to Test:** Import a CSV with a UTF-8 BOM, quoted names containing commas, and 1,000+ rows.
   **Expected:** Names parsed correctly; import completes inside the request timeout.
   **Why Manual Testing Is Required:** Parser behaviour and request timeouts depend on runtime/browser.

## No Issues Found

- List loads `GetWorkstations` filtered by tenant; assigned user names are pre-aggregated in one query (`WorkstationController.cs` lines 31-52).
- Client search covers name and assigned users; status filter All/Active/Inactive works; sort on name and status handles nulls and is case-insensitive (`WorkstationMaster.tsx` lines 118-156).
- Client pagination resets on search/filter/sort change (`WorkstationMaster.tsx` line 169).
- Column chooser: name locked, preferences persisted under `workstationMaster.hiddenColumns`.
- `?open=<id>` deep link is consumed and removed from the URL (`WorkstationMaster.tsx` lines 44-55).
- Name required in UI and API; trimmed; duplicate check is case-insensitive and per tenant on create and edit (`WorkstationController.cs` lines 118-121, 128-138, 169-180).
- Save replaces user mappings wholesale, including clearing all mappings when the list is empty (lines 189-232).
- Deactivation via the slideout is blocked when referenced (lines 156-167); deletion is blocked by process default, template header/operations and JO routing, and removes user mappings (lines 455-491, 493-594).
- Get-by-id, impact and delete all filter by tenant and return 404 for foreign ids.
- Import: name required, in-file duplicates rejected (case-insensitive), existing rows matched case-insensitively, transaction rolls back on exception.

## QA Coverage

| Test Area | Tested | Result |
| --- | --- | --- |
| Navigation | Yes | Pass (deep link: Manual) |
| CRUD | Yes | Fail (BUG-WS-006, BUG-WS-007) |
| Search | Yes | Pass |
| Filters | Yes | Pass |
| Sorting | Yes | Pass |
| Pagination | Yes | Pass |
| Validation | Yes | Fail (BUG-WS-004, BUG-WS-005); Potential (BUG-WS-008) |
| Permissions | Partial | Manual (cross-cutting, see Cross-Module Concerns) |
| API | Yes | Fail (BUG-WS-003) |
| Database | Yes | Fail (BUG-WS-004); Potential (BUG-WS-008) |
| Business Logic | Yes | Fail (BUG-WS-001, BUG-WS-002) |
| Location | Yes | N/A (tenant-wide master; site switcher hidden on `/masters/*`) |
| Tenant | Yes | Fail (BUG-WS-003) |
| Cross-Module | Yes | Fail (BUG-WS-001, BUG-WS-002) |
| Responsive/PWA | Partial | Manual |

## Matrix Checklist

| Matrix Row | Result | Notes |
| --- | --- | --- |
| FE List — `WorkstationMaster.tsx`, `/masters/workstation`, GET `/Workstation/GetWorkstations` | Pass | Route, sidebar entry and API mapping confirmed. |
| FE Search / Filter / Sort / Pagination — client | Pass | All client-side; see No Issues Found. |
| FE Add / Edit — `WorkstationMasterSlideout.tsx` (user mapping), `?open=`, GET `GetWorkstationById`, `GetUserWorkstationMapping`, `GetAllUsers`; POST `SaveWorkstation` | Fail | BUG-WS-003, BUG-WS-004, BUG-WS-006. `GetUserWorkstationMapping` is not called by the slideout (mappings come from `GetWorkstationById`). |
| FE Delete — `DeletionImpactDialog`, GET `CheckWorkstationDeletionImpact`, DELETE `DeleteWorkstation` | Fail | BUG-WS-002 (false block), BUG-WS-007 (error text). |
| FE Import — `WorkstationMasterImportModal.tsx` (WorkstationName, Status), POST `ImportWorkstations` | Fail | BUG-WS-001, BUG-WS-005. |
| FE Validation — Name required | Pass | UI and API. |
| FE Permissions / Responsive — `/masters/workstation` | Manual | Manual items 1 and 3. |
| BE CRUD — list, get, save (replaces user mappings), delete; `WorkstationMaster`, `UserWorkstationMapping` | Fail | BUG-WS-003 (unvalidated user ids). |
| BE Import | Fail | BUG-WS-001, BUG-WS-005. |
| BE Validation — name unique per tenant (case-insensitive) | Pass / Potential | Code check passes; no DB constraint (BUG-WS-008). |
| BE Authorization — authenticated | Pass | Global fallback policy; no role checks (cross-cutting). |
| BL — Deactivating or deleting is blocked if used as process default, in job template header/operations, or in JO `RoutingStepsJson` | Fail | Import bypass (BUG-WS-001); JO check over-matches (BUG-WS-002). Slideout path otherwise correct. |

## Cross-Module Concerns

| Concern | Affected endpoints | Owner / root file |
| --- | --- | --- |
| Client-supplied `tenantId`/`TenantID` trusted without comparison to the token tenant | `GET /Workstation/GetWorkstations`, `GetWorkstationById`, `GetUserWorkstationMapping`, `GetAllUsers`, `CheckWorkstationDeletionImpact`; `POST SaveWorkstation`, `ImportWorkstations`; `DELETE DeleteWorkstation` | `QA_TenantLocationFramework.md` (`ApiBaseController.cs`) |
| No server-side role/permission enforcement | All `/api/Workstation/*` endpoints | `QA_RolesPermissions.md` (`Program.cs` fallback policy) |

