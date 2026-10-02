# QA — NCR Code Master

| Module | Matrix section | Bug ID prefix | Tested | Confirmed Bugs | Potential Bugs | Manual Verification |
| --- | --- | --- | --- | --- | --- | --- |
| NCR Code Master | 2.15 | BUG-NCRCODE | Yes | 1 | 2 | 4 |

Source of test cases: `QA_TEST_MATRIX.md`. Method: static trace of the actual implementation (React UI → service → Axios → .NET controller → service/repository → EF Core → SQL Server, and back). No application code, configuration or database is changed during QA. Findings that depend on deployed configuration, data or a real browser go under **Needs Manual Verification**.

Severity scale:
- **Critical**: security breach, data corruption, financial corruption, or a blocked core workflow.
- **High**: a major feature is broken or a significant security control is bypassed, with a workaround that is hard or unavailable.
- **Medium**: a feature works incorrectly in specific conditions, or a security control is weaker than configured.
- **Low**: cosmetic, minor UX, or an informational/hardening issue.

---

## Confirmed Bugs

### BUG-NCRCODE-001 — `SeedDefaultNCRCodes` defaults to tenant 1 and user 1, and `CreatedBy` is taken from the client
**Severity:** Low. Unused by the UI, but a parameterless call writes into tenant 1 and audit fields are unreliable.
**Status:** Confirmed
**Test Area:** API / Tenant / Audit
**Description:** `POST /api/NCRCode/SeedDefaultNCRCodes` declares `tenantId = 1` and `createdBy = 1` as defaults. Calling it with no query string inserts the default code set into tenant 1, attributed to user 1, regardless of the caller's own tenant. `SaveNCRCode` similarly stores `CreatedBy` from the request body and falls back to user 1 when it is 0. The endpoint is not called anywhere in the UI.
**Steps to Reproduce:**
1. Log in as a user of tenant 5.
2. `POST /api/NCRCode/SeedDefaultNCRCodes` with no query parameters.
3. `GET /api/NCRCode/GetNCRCodes?tenantId=1`.
**Expected:** Seeding (if exposed at all) targets the caller's tenant from the token and records the caller as creator.
**Actual:** Default codes inserted into tenant 1 with `CreatedBy = 1`; response reports `inserted` count.
**Evidence:**
* Frontend: no caller (`SeedDefaultNCRCodes` is referenced only in the controller); `Cimmple_UI/src/Modules/Masters/NCRCodeMasterSlideout.tsx` lines 28-36 (CreatedBy from localStorage).
* Backend: `Cimmple_API/CimmpleAPI/Controllers/NCRCodeController.cs` lines 52-100 (defaults at line 53, `CreatedBy` fallback at line 75), 163 (`CreatedBy = request.CreatedBy > 0 ? request.CreatedBy : 1`).
* Database: `NCRCodeMaster.TenantId`, `CreatedBy`.
**Root Cause:** Development-style defaults left on a production endpoint; audit field accepted from the client.
**Business Impact:** Unexpected codes in tenant 1's master; misleading audit data.
**Affected Areas:** NCR Code Master; tenant 1 data.
**Recommended Fix:** Remove the defaults (derive tenant and user from the token), restrict seeding to admins/onboarding, and set `CreatedBy` server-side.

---

## Potential Bugs

### BUG-NCRCODE-002 — Code uniqueness is enforced only in application code; concurrent saves can create duplicates
**Severity:** Low. Requires near-simultaneous saves of the same code.
**Status:** Potential
**Test Area:** Validation / Database
**Description:** `SaveNCRCode` checks case-insensitive uniqueness per tenant with an `AnyAsync` query before inserting. There is no unique index (the column is `nvarchar(max)`, which cannot be indexed), so two concurrent saves of "DIM-001" both pass the check and both insert.
**Steps to Reproduce:**
1. Two users open "Add NCR Code" and enter "DIM-001".
2. Both click Save at the same moment.
3. Reload the list.
**Expected:** One succeeds, the other gets "NCR Code already exists".
**Actual (per code):** Both rows can be inserted.
**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Masters/NCRCodeMasterSlideout.tsx` lines 93-118.
* Backend: `Cimmple_API/CimmpleAPI/Controllers/NCRCodeController.cs` lines 150-156, 176-183 (check-then-insert).
* Database: `Cimmple_API/CimmpleAPI/Data/Migrations/CimmpleDbContextModelSnapshot.cs` lines 2759-2785 (`NCRCode` nvarchar(max), no index).
**Root Cause:** No database constraint backing the rule.
**Business Impact:** Duplicate codes in the NCR dropdown; ambiguous reporting.
**Affected Areas:** NCR Code Master, NCR form.
**Recommended Fix:** Change `NCRCode` to a bounded length (the UI already limits it to 50) and add a unique index on `(TenantId, NCRCode)` with a case-insensitive collation.
**Why further verification is needed:** Needs concurrent requests to demonstrate.

---

### BUG-NCRCODE-003 — Renaming a code leaves the old code text on existing NCRs, so the NCR list and NCR form disagree
**Severity:** Low. Display inconsistency until each NCR is re-saved.
**Status:** Potential
**Test Area:** Cross-Module / Business Logic
**Description:** NCRs store both `NcrCodeId` and a text snapshot `NcrCode`, refreshed only when the NCR itself is saved. After renaming "DIM-001" to "DIM-01" in the master, the Quality list (which shows the snapshot) still shows "DIM-001", while opening the NCR shows "DIM-01" in the dropdown (which binds by id). Saving the NCR then silently changes the stored text.
**Steps to Reproduce:**
1. Create an NCR with code "DIM-001".
2. Rename the code to "DIM-01" in NCR Code Master.
3. Compare the Quality list column "NCR Code" with the code shown when the NCR is opened.
**Expected:** Consistent code shown (either always current or deliberately historical).
**Actual (per code):** List shows "DIM-001"; form shows "DIM-01".
**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Quality/Quality.tsx` line 286 (list column `ncrCode`); `Cimmple_UI/src/Modules/Quality/NonConformanceReportSlideout.tsx` lines 383-389 and 877-883 (dropdown by id).
* Backend: `Cimmple_API/CimmpleAPI/Controllers/QualityController.cs` lines 93-108 (`ResolveNcrCodeFieldsAsync` copies the text on NCR save); `Cimmple_API/CimmpleAPI/Controllers/NCRCodeController.cs` lines 185-187 (rename does not touch NCRs).
* Database: `CimmpleFlow.NonConformanceReports.NcrCodeId`, `NcrCode`; `NCRCodeMaster.NCRCode`.
**Root Cause:** Denormalised code text with no refresh on master rename.
**Business Impact:** Confusing NCR reports and filters.
**Affected Areas:** Quality / NCR list, NCR reports, global search for NCRs.
**Recommended Fix:** Decide the intended behaviour: either display the master value by id everywhere, or block/warn on renaming codes in use.
**Why further verification is needed:** The snapshot may be intentional (historical record); confirm with the product owner.

---

## Needs Manual Verification

1. **Area:** Permissions
   **What to Test:** Role with `/quality` but not "NCR Code Master" (`/quality/ncr-codes`), and the reverse.
   **Expected:** Each permission controls only its own menu entry and route.
   **Why Manual Testing Is Required:** Needs seeded roles; code uses exact URL matching (`AuthService.ts` line 252) and a separate permission row (`UserManagementController.cs` line 879).
2. **Area:** Delete in use
   **What to Test:** Delete a code used by one NCR.
   **Expected:** Dialog shows "1 NCR(s) reference this code." with no delete button.
   **Why Manual Testing Is Required:** Needs NCR data; the usage query runs as raw SQL against `CimmpleFlow.NonConformanceReports`.
3. **Area:** Responsive
   **What to Test:** List and slideout at 375 / 390 / 430 px.
   **Expected:** Usable layout.
   **Why Manual Testing Is Required:** Rendering only.
4. **Area:** Working site switcher
   **What to Test:** Open `/quality/ncr-codes` with a multi-site user.
   **Expected:** TopBar working-site switcher hidden (tenant-wide master).
   **Why Manual Testing Is Required:** Visual check (`workingSiteVisibility.ts` line 20).

## No Issues Found

- Code required in UI (`NCRCodeMasterSlideout.tsx` lines 84-91) and API (`NCRCodeController.cs` lines 141-142); values trimmed on both sides (slideout lines 102-106; controller lines 144, 161, 186).
- Case-insensitive uniqueness per tenant on create and edit (lines 150-156, 176-183).
- Delete blocked when referenced by `NonConformanceReports.NcrCodeId`, both in the impact check (lines 221-261) and in `DeleteNCRCode` itself (lines 282-304); the UI confirm also requires `canDelete` (slideout line 135).
- Server error text is shown in save and delete toasts (slideout lines 110-114, 143).
- List, detail, save, impact and delete filter by tenant; update of a missing code returns 404 (lines 170-174).
- Separate permission and sidebar entry from `/quality` (`Sidebar.tsx` line 83; `Routes.tsx` line 181; `AuthService.ts` line 252).
- `?open=` deep link and client search on code/description (`NCRCodeMaster.tsx` lines 31-43, 74-75).

## QA Coverage

| Test Area | Tested | Result |
| --- | --- | --- |
| Navigation | Yes | Pass |
| CRUD | Yes | Pass |
| Search | Yes | Pass |
| Filters | N/A | N/A |
| Sorting | Yes | Pass |
| Pagination | Yes | Pass (`MasterListPage`) |
| Validation | Yes | Pass; Potential (BUG-NCRCODE-002) |
| Permissions | Partial | Manual |
| API | Yes | Fail (BUG-NCRCODE-001) |
| Database | Yes | Potential (BUG-NCRCODE-002) |
| Business Logic | Yes | Pass |
| Location | N/A | N/A (tenant-wide master) |
| Tenant | Yes | Fail (BUG-NCRCODE-001); generic pattern in Cross-Module Concerns |
| Cross-Module | Yes | Potential (BUG-NCRCODE-003) |
| Responsive/PWA | No | Manual |

## Matrix Checklist

| Matrix Row | Result | Notes |
| --- | --- | --- |
| FE — List (`NCRCodeMaster.tsx`, `MasterListPage`, GET `GetNCRCodes`) | Pass | |
| FE — Add / Edit (`NCRCodeMasterSlideout.tsx`, `?open=`, GET `GetNCRCodeById`, POST `SaveNCRCode`) | Pass | |
| FE — Delete (`DeletionImpactDialog`, `CheckNCRCodeDeletionImpact`, `DeleteNCRCode`) | Pass | |
| FE — Validation (Code required) | Pass | |
| FE — Permissions (separate permission from `/quality`) | Pass (code) / Manual | Exact-match permission check. |
| FE — Responsive (list, slideout) | Manual | |
| BE — CRUD (list, get, save, impact, hard delete, `SeedDefaultNCRCodes`) | Pass / Fail (BUG-NCRCODE-001) | Seed endpoint defaults to tenant 1. |
| BE — Validation (code unique per tenant, case-insensitive; delete blocked when referenced by `NonConformanceReports.NcrCodeId`) | Pass; Potential (BUG-NCRCODE-002) | No DB constraint. |
| BE — Authorization (authenticated) | Pass | No role check (see Cross-Module Concerns). |
| Cross-Module — NCR Code → Quality / NCR | Potential (BUG-NCRCODE-003) | |
| Database — `NCRCodeMaster` | Potential (BUG-NCRCODE-002) | `NCRCode` is nvarchar(max). |

## Cross-Module Concerns

| Concern | Affected endpoints | Owner |
| --- | --- | --- |
| Client-supplied `tenantId`/`TenantId` trusted without comparing to the token tenant | `GET NCRCode/GetNCRCodes?tenantId`, `GetNCRCodeById?tenantId`, `POST SaveNCRCode` (body `TenantId`), `POST SeedDefaultNCRCodes?tenantId`, `CheckNCRCodeDeletionImpact?tenantId`, `DELETE DeleteNCRCode?tenantId` | `QA_TenantLocationFramework.md` |
| No server-side role/permission enforcement | All `NCRCodeController` endpoints (including seeding) | `QA_RolesPermissions.md` |
| NCR stores a code-text snapshot | `QualityController.ResolveNcrCodeFieldsAsync` | `QA_QualityNCR.md` (see BUG-NCRCODE-003) |
