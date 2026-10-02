# QA — Process Master

| Module | Matrix section | Bug ID prefix | Tested | Confirmed Bugs | Potential Bugs | Manual Verification |
| --- | --- | --- | --- | --- | --- | --- |
| Process Master | 2.6 | BUG-PROCESS | Yes | 7 | 1 | 4 |

Source of test cases: `QA_TEST_MATRIX.md`. Method: static trace of the actual implementation (React UI → service → Axios → .NET controller → service/repository → EF Core → SQL Server, and back). No application code, configuration or database is changed during QA. Findings that depend on deployed configuration, data or a real browser go under **Needs Manual Verification**.

Severity scale:
- **Critical**: security breach, data corruption, financial corruption, or a blocked core workflow.
- **High**: a major feature is broken or a significant security control is bypassed, with a workaround that is hard or unavailable.
- **Medium**: a feature works incorrectly in specific conditions, or a security control is weaker than configured.
- **Low**: cosmetic, minor UX, or an informational/hardening issue.

---

## Confirmed Bugs

### BUG-PROCESS-001 — CSV import can deactivate system processes and processes still in use
**Severity:** Medium. The matrix rule "system processes can't be deleted or deactivated" and the in-use deactivation guard are bypassed through the standard import UI.
**Status:** Confirmed
**Test Area:** Import / Business Logic
**Description:** `SaveProcess` blocks Active → Inactive when the process is a system process or is referenced by job templates or job-order routing. The import update branch assigns `match.status = status ?? match.status` with no such check.
**Steps to Reproduce:**
1. Identify a system process (Delete button hidden) or a process used on a job template operation, e.g. "Laser Cutting".
2. Process Master → Import, upload `ProcessName,Status` / `Laser Cutting,Inactive`, keep "Update existing processes when matched" checked, click Import.
3. Reload the list with filter "Inactive".
**Expected:** Row error "This is a protected system process…" / "This process is still referenced…"; the process stays Active.
**Actual:** Row reports "Updated" and the process becomes Inactive. Job Template operation dropdowns then hide it (`isActive` filter), so existing operations display "Select…".
**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Masters/ProcessMasterImportModal.tsx` line 77 (`updateExisting` defaults to true); `Cimmple_UI/src/Modules/Masters/JobTemplateMasterSlideout.tsx` lines 165-169 (inactive processes filtered from lookups).
* Backend: `Cimmple_API/CimmpleAPI/Controllers/ProcessController.cs` lines 174-186 (guard in `SaveProcess`), line 372 (import sets status unguarded), lines 514-518 (system-process rule lives only in `BuildProcessDeletionImpact`).
* Database: `CimmpleFlow.ProcessMaster.status`, `IsSystem`.
**Root Cause:** Deactivation guard not applied in the import update path.
**Business Impact:** Seeded system processes required by templates/job orders can be disabled by any user with import access; templates and routings reference inactive processes.
**Affected Areas:** Process import, Job Template operations, Job Order routing.
**Recommended Fix:** When an import row changes status 1 → 0, call `BuildProcessDeletionImpact` (and check `IsSystem`) and fail the row with the blocking reason.

---

### BUG-PROCESS-002 — Import "update existing" wipes Description and Ledger Code when the cells are blank
**Severity:** Medium. Silent loss of accounting mapping (ledger code) on existing processes through the documented import template.
**Status:** Confirmed
**Test Area:** Import / Data integrity
**Description:** `mapCsvRows` sets a value to `""` when the column exists but the cell is empty. In the update branch, `row.LedgerCode?.Trim() ?? match.ledgercode` only falls back for `null`, so `""` overwrites the stored value. The downloadable template deliberately ships with LedgerCode blank, so re-importing it (or any sheet with blank cells) clears ledger codes and descriptions. Other fields (code, time, cost, workstation) correctly keep their existing value when blank, so behaviour is inconsistent.
**Steps to Reproduce:**
1. Set Ledger Code "5100" and a description on process "Welding".
2. Download the import template, keep the "Welding" row (LedgerCode empty), import with "Update existing" checked.
3. Open "Welding".
**Expected:** Blank cells leave existing values unchanged (as for time/cost/workstation).
**Actual:** Ledger Code and/or Description are now empty.
**Evidence:**
* Frontend: `Cimmple_UI/src/Common/Utils/CsvImport.ts` line 75 (empty cell → `""`); `Cimmple_UI/src/Modules/Masters/ProcessMasterImportModal.tsx` lines 139-152 (template writes LedgerCode `""`).
* Backend: `Cimmple_API/CimmpleAPI/Controllers/ProcessController.cs` lines 368-369 (`?.Trim() ??` only handles null), contrasted with lines 366, 373-375.
* Database: `CimmpleFlow.ProcessMaster.ledgercode`, `PDescription`.
**Root Cause:** Null-coalescing used where an empty-string check is needed.
**Business Impact:** Ledger mapping for process costs is lost, affecting accounting postings that rely on the process ledger code.
**Affected Areas:** Process import update.
**Recommended Fix:** Use `string.IsNullOrWhiteSpace(row.X) ? match.X : row.X.Trim()` for Description and LedgerCode.

---

### BUG-PROCESS-003 — Negative or non-numeric time and cost are accepted by the API and import
**Severity:** Medium. Matrix validation "Est. time and cost/hr ≥ 0" is enforced only in the slideout; invalid values reach costing data.
**Status:** Confirmed
**Test Area:** Validation / Import / API
**Description:** `SaveProcess` stores `DefaultEstimatedTimeMinutes` and `StandardCostPerHour` as sent, with no range check. The import parses them with `TryParse` and accepts negatives; unparseable text (e.g. "45 min", "$80") silently becomes null with no warning. The import also does not check length limits (code 50, name 200), so one long value makes `SaveChanges` throw and the whole batch fails with a 500 and stack trace.
**Steps to Reproduce:**
1. Import `ProcessName,DefaultEstimatedTimeMinutes,StandardCostPerHour` / `Deburr,-30,-75`.
2. Open "Deburr" in the slideout.
3. Import `Polish,45 min,$80` and open "Polish".
**Expected:** Rows rejected with "must be ≥ 0" / "not a number" messages (slideout enforces ≥ 0 at `ProcessMasterSlideout.tsx` lines 133-155).
**Actual:** "Deburr" is created with −30 min and −75/hr; "Polish" is created with blank time and cost and status "Created" with no warning.
**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Masters/ProcessMasterImportModal.tsx` lines 53-68 (preview validates only ProcessName).
* Backend: `Cimmple_API/CimmpleAPI/Controllers/ProcessController.cs` lines 131-160 (no range checks in `SaveProcess`), lines 351-352, 373-375, 395-397 (import), lines 675-685 (parse failures → null); `Cimmple_API/CimmpleAPI/Data/CimmpleDbContext.cs` lines 176-187 (max lengths).
* Database: `CimmpleFlow.ProcessMaster.DefaultEstimatedTimeMinutes`, `StandardCostPerHour`.
**Root Cause:** Validation lives only in the React slideout.
**Business Impact:** Negative minutes/costs flow into job template defaults and job costing estimates.
**Affected Areas:** Process save API, import; downstream Job Template and Job Order routing defaults.
**Recommended Fix:** Validate non-negative values and lengths in `SaveProcess` and per import row; report unparseable numeric cells as row errors.

---

### BUG-PROCESS-004 — "Used in job order routing" check matches id prefixes, falsely blocking delete/deactivate
**Severity:** Medium. Valid deletes/deactivations are refused with a misleading reason once process ids share prefixes.
**Status:** Confirmed
**Test Area:** Delete / Business Logic
**Description:** `CountJobOrdersReferencingProcess` looks for the substring `"processId":12` in `RoutingStepsJson`. Routing JSON is compact camelCase, so `"processId":120` or `"processId":1234` also match.
**Steps to Reproduce:**
1. Have process id 12 unused and process id 125 used in any job order routing.
2. Delete process 12 (or set it Inactive and save).
**Expected:** Delete allowed.
**Actual:** "Referenced in routing on N job order(s)" — delete and deactivate blocked.
**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Masters/ProcessMasterSlideout.tsx` lines 158-170 (shows impact).
* Backend: `Cimmple_API/CimmpleAPI/Controllers/ProcessController.cs` lines 557-567, 582-598; `Cimmple_API/CimmpleAPI/Controllers/JobOrderController.cs` lines 460-465 (compact camelCase), 1775-1782 (`processId` int?).
* Database: `CimmpleFlow.JobOrderMaster.RoutingStepsJson`.
**Root Cause:** Substring match without a delimiter after the id.
**Business Impact:** Unused processes cannot be retired; users are told job orders depend on them when they do not.
**Affected Areas:** Process delete and deactivate.
**Recommended Fix:** Parse the JSON and compare ids numerically, or require `,`/`}` after the id.

---

### BUG-PROCESS-005 — Import preview says inactive workstations "will be left blank" but the import links them
**Severity:** Low. The preview misinforms the user; the result differs from what was shown.
**Status:** Confirmed
**Test Area:** Import / Cross-Module
**Description:** The preview builds its workstation list from active workstations only and warns "Workstation X not found, will be left blank". The backend matches against all tenant workstations including inactive ones and sets `DefaultWorkstationId`.
**Steps to Reproduce:**
1. Set workstation "Old Press" to Inactive.
2. Import a process row with `DefaultWorkstationName = Old Press`.
3. Observe the preview warning, import, then open the process.
**Expected:** Preview and import agree (either both reject inactive or both link it).
**Actual:** Preview warns it will be blank; the saved process is linked to the inactive workstation, which the slideout dropdown (active-only) then cannot display.
**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Masters/ProcessMasterImportModal.tsx` line 93 (active filter), lines 110-119 (warning text); `ProcessMasterSlideout.tsx` line 75.
* Backend: `Cimmple_API/CimmpleAPI/Controllers/ProcessController.cs` lines 239-241, 332-346 (no `IsActive` filter).
* Database: `CimmpleFlow.ProcessMaster.DefaultWorkstationId`.
**Root Cause:** UI and API use different workstation sets.
**Business Impact:** Processes default to a retired workstation without the user knowing.
**Affected Areas:** Process import.
**Recommended Fix:** Exclude inactive workstations in the API match (and warn), or include them in the preview.

---

### BUG-PROCESS-006 — Deactivating a system process shows a "cannot be deleted" message
**Severity:** Low. Wrong wording for a correct block.
**Status:** Confirmed
**Test Area:** Validation / Error messages
**Description:** When a system process is set to Inactive and saved, `SaveProcess` returns the first blocking reason, which for system processes is "This is a protected system process and cannot be deleted."
**Steps to Reproduce:**
1. Open a system process (no Delete button), change Status to Inactive, click Update.
**Expected:** "This is a protected system process and cannot be deactivated."
**Actual:** "This is a protected system process and cannot be deleted."
**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Masters/ProcessMasterSlideout.tsx` lines 295-304 (status select available for system processes).
* Backend: `Cimmple_API/CimmpleAPI/Controllers/ProcessController.cs` lines 178-184, 514-518.
* Database: n/a
**Root Cause:** Delete-impact reason text reused for deactivation.
**Business Impact:** Confusing message.
**Affected Areas:** Process edit.
**Recommended Fix:** Return a deactivation-specific message (or disable the status select for system processes).

---

### BUG-PROCESS-007 — Delete failures show a generic Axios message instead of the server reason
**Severity:** Low. The user is not told why a delete failed.
**Status:** Confirmed
**Test Area:** Error Handling
**Description:** Delete and impact error toasts use `error.message`, which for a 400 is "Request failed with status code 400", hiding the backend `{ error }` text (e.g. reference added between impact check and confirm).
**Steps to Reproduce:**
1. Open the delete dialog for an unused process.
2. In another tab, add that process to a job template.
3. Confirm the delete.
**Expected:** Toast shows "This process is still referenced…".
**Actual:** Toast shows "Request failed with status code 400".
**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Masters/ProcessMasterSlideout.tsx` lines 166-169, 183-185.
* Backend: `Cimmple_API/CimmpleAPI/Controllers/ProcessController.cs` `DeleteProcess` (returns 400 with `error`).
* Database: n/a
**Root Cause:** `error.response.data.error` not read.
**Business Impact:** Confusing errors.
**Affected Areas:** Process delete.
**Recommended Fix:** Prefer `error?.response?.data?.error`.

---

## Potential Bugs

### BUG-PROCESS-008 — Process name/code uniqueness is not enforced by the database
**Severity:** Low. Duplicates only under concurrent writes.
**Status:** Potential
**Test Area:** Database / Validation
**Description:** `ValidateUniqueness` checks name and code per tenant in code, but the EF model defines (Tenantid, ProcessName) and (Tenantid, ProcessCode) as non-unique indexes. Concurrent saves/imports can both pass the check.
**Steps to Reproduce:**
1. Submit two `SaveProcess` requests with the same new name simultaneously.
2. Inspect `ProcessMaster`.
**Expected:** One succeeds, the other gets "Process Name … already exists".
**Actual:** Both may be inserted.
**Evidence:**
* Frontend: n/a
* Backend: `Cimmple_API/CimmpleAPI/Controllers/ProcessController.cs` lines 600-629.
* Database: `Cimmple_API/CimmpleAPI/Data/CimmpleDbContext.cs` lines 176-187 (`HasIndex` without `IsUnique`).
**Root Cause:** Check-then-insert without a unique constraint.
**Business Impact:** Duplicate processes make import matching and templates ambiguous.
**Affected Areas:** Save, import.
**Recommended Fix:** Make the indexes unique (filtered for non-empty code) and map violations to 400.
**Why further verification is needed:** Requires a concurrency test; legacy data may already contain duplicates that would block adding the constraint.

---

## Needs Manual Verification

1. **Area:** Responsive / slideout
   **What to Test:** Open the process slideout at 375–430 px; check all fields, category select and the outside-service toggle.
   **Expected:** Single-column layout, reachable buttons, no horizontal overflow.
   **Why Manual Testing Is Required:** Visual layout.
2. **Area:** Permissions
   **What to Test:** Role without `/masters/process` permission: sidebar, direct URL, and direct API calls.
   **Expected:** UI blocked; API currently allows (cross-cutting).
   **Why Manual Testing Is Required:** Depends on configured roles.
3. **Area:** System process seed data
   **What to Test:** Confirm which processes have `IsSystem = 1` in each tenant and that Delete is hidden for them.
   **Expected:** Seeded processes are protected.
   **Why Manual Testing Is Required:** Depends on database seed data.
4. **Area:** Ledger code
   **What to Test:** Confirm whether Ledger Code should be validated against the tenant chart of accounts.
   **Expected:** Per product owner; currently free text.
   **Why Manual Testing Is Required:** No requirement found in the matrix; needs business confirmation.

## No Issues Found

- List: tenant-filtered, client search on name/code/description/category/workstation, filters All/Active/Inactive/Outside service, sortable columns with null-last handling, client pagination and column chooser (`ProcessMaster.tsx` lines 13-22, 117-152).
- Slideout: name required, time and cost ≥ 0, unsaved-changes prompt on cancel, active-only workstation dropdown, Delete hidden for system processes (`ProcessMasterSlideout.tsx` lines 75, 133-155, 257-265, 532).
- API: name required; name and code unique per tenant (case-insensitive) on create and edit; default workstation must belong to the tenant; deactivation blocked for system/in-use processes in `SaveProcess`.
- Delete: blocked for system processes, job template primary/operation references and JO routing; all lookups tenant-filtered.
- Import: in-file duplicate name/code rejected; matching by code then name; `stopOnError` rollback supported; categories normalised to the standard list.
- `GetProcessCategories` returns the fixed category list; the slideout uses the matching `PROCESS_CATEGORIES` constant and keeps a legacy non-standard category visible (`ProcessMasterSlideout.tsx` lines 372-378).
- `StandardCostPerHour` is mapped as decimal(18,2) (`CimmpleDbContext.cs` lines 176-187).

## QA Coverage

| Test Area | Tested | Result |
| --- | --- | --- |
| Navigation | Yes | Pass |
| CRUD | Yes | Fail (BUG-PROCESS-007) |
| Search | Yes | Pass |
| Filters | Yes | Pass |
| Sorting | Yes | Pass |
| Pagination | Yes | Pass |
| Validation | Yes | Fail (BUG-PROCESS-003, BUG-PROCESS-006); Potential (BUG-PROCESS-008) |
| Permissions | Partial | Manual (cross-cutting) |
| API | Yes | Fail (BUG-PROCESS-003) |
| Database | Yes | Potential (BUG-PROCESS-008) |
| Business Logic | Yes | Fail (BUG-PROCESS-001, BUG-PROCESS-002, BUG-PROCESS-004) |
| Location | Yes | N/A (tenant-wide master) |
| Tenant | Yes | Pass (module-level filters correct; cross-cutting tenant trust noted below) |
| Cross-Module | Yes | Fail (BUG-PROCESS-004, BUG-PROCESS-005) |
| Responsive/PWA | Partial | Manual |

## Matrix Checklist

| Matrix Row | Result | Notes |
| --- | --- | --- |
| FE List — `ProcessMaster.tsx`, `/masters/process`, GET `/Process/GetProcesses` | Pass | |
| FE Filter — All / active / inactive / outside (`isFixed`) | Pass | `ProcessMaster.tsx` lines 127-131. |
| FE Search / Sort / Pagination — client | Pass | |
| FE Add / Edit — `ProcessMasterSlideout.tsx` (category from `PROCESS_CATEGORIES`, default workstation, est. time, cost/hr), `?open=`; GET `GetProcessById`; POST `SaveProcess` | Fail | BUG-PROCESS-006 (message); API-side validation gap BUG-PROCESS-003. |
| FE Delete — `DeletionImpactDialog`; GET `CheckProcessDeletionImpact`, DELETE `DeleteProcess` | Fail | BUG-PROCESS-004, BUG-PROCESS-007. |
| FE Import — `ProcessMasterImportModal.tsx`, POST `ImportProcesses` | Fail | BUG-PROCESS-001, BUG-PROCESS-002, BUG-PROCESS-003, BUG-PROCESS-005. |
| FE Validation — name required; est. time and cost/hr ≥ 0 | Fail | Enforced in slideout only; API/import accept negatives (BUG-PROCESS-003). |
| FE Permissions / Responsive — `/masters/process` | Manual | |
| BE CRUD — list, get, save, delete, `GetProcessCategories` (unused by UI); `ProcessMaster` | Pass | Confirmed the UI uses the `PROCESS_CATEGORIES` constant, not the endpoint. |
| BE Import | Fail | BUG-PROCESS-001, BUG-PROCESS-002, BUG-PROCESS-003. |
| BE Validation — name unique per tenant; code unique if given; default workstation must exist; non-unique indexes | Pass / Potential | Code checks correct (`ProcessController.cs` lines 146-160, 600-629); no DB constraint (BUG-PROCESS-008); import links inactive workstations (BUG-PROCESS-005). |
| BE Authorization — authenticated | Pass | No role checks (cross-cutting). |
| BL — `StandardCostPerHour` is decimal(18,2) | Pass | Negative values not rejected by API (BUG-PROCESS-003). |
| BL — System processes (`IsSystem`) can't be deleted or deactivated | Fail | Slideout/API correct; import bypass (BUG-PROCESS-001); wrong message (BUG-PROCESS-006). |
| BL — Also blocked when used by job templates or JO routing JSON | Fail | Import bypass (BUG-PROCESS-001); JO over-match (BUG-PROCESS-004). |

## Cross-Module Concerns

| Concern | Affected endpoints | Owner / root file |
| --- | --- | --- |
| Client-supplied `tenantid` (query/body) trusted without comparison to the token tenant | `GET /Process/GetProcesses`, `GetProcessById`, `CheckProcessDeletionImpact`; `POST SaveProcess`, `ImportProcesses`; `DELETE DeleteProcess` | `QA_TenantLocationFramework.md` |
| No server-side role/permission enforcement | All `/api/Process/*` endpoints | `QA_RolesPermissions.md` |
