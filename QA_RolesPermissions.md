# QA — Roles & Permissions -t

| Module | Matrix section | Bug ID prefix | Tested | Confirmed Bugs | Potential Bugs | Manual Verification |
| --- | --- | --- | --- | --- | --- | --- |
| Roles & Permissions | 1.4 | BUG-ROLE | Yes | 8 | 1 | 5 |

Source of test cases: `QA_TEST_MATRIX.md`. Method: static trace of the actual implementation (React UI → service → Axios → .NET controller → service/repository → EF Core → SQL Server, and back). No application code, configuration or database is changed during QA. Findings that depend on deployed configuration, data or a real browser go under **Needs Manual Verification**.

Severity scale:
- **Critical**: security breach, data corruption, financial corruption, or a blocked core workflow.
- **High**: a major feature is broken or a significant security control is bypassed, with a workaround that is hard or unavailable.
- **Medium**: a feature works incorrectly in specific conditions, or a security control is weaker than configured.
- **Low**: cosmetic, minor UX, or an informational/hardening issue.

---

## Carried-Over Concerns (from `QA_Authentication.md`)

Observed while testing Authentication; root cause is in this module. Verify and log formally when this module is tested.

- Role permissions are enforced only in the UI; the API's only authorization policy is "authenticated user" (`Program.cs` lines 142–147), so any logged-in user can call any module's API. Also review BUG-AUTH-004 (role "Reset Password Required" loop) and BUG-AUTH-017 ("admin" substring grants full access).

**Resolution (1.4 testing):**
- UI-only permission enforcement: verified and logged as **BUG-ROLE-001** (Critical).
- BUG-AUTH-004: re-verified. The Edit Role form sets `ResetPwd` (`RoleManager.tsx` lines 133, 143; `UserManagementController.cs` lines 748, 805–806) and the loop is caused by `AuthService.BuildAuthUserDtoAsync` (lines 654–657). It stays logged under BUG-AUTH-004 and is not duplicated here.
- BUG-AUTH-017: re-verified (`AuthService.cs` lines 703–712; `UserManagementController.cs` lines 672–681 apply the same rule during seeding). Extended by **BUG-ROLE-003**, because the role "Description" typed in Manage Roles is stored in `RoleTag`, which feeds the same check, and by **BUG-ROLE-006**, which prevents clearing that description.

Matrix section 1.4. Flows traced: `Modules/UserManagement/RoleManager.tsx` (list/create/edit/delete) and `RolePermissionManager.tsx` (assign, seed, clear & reseed) → `Common/Services/UserManagementService.ts` → `UserManagementController` role/permission actions → `UserRole`, `PermissionMaster`, `PermissionRole`; enforcement path `AuthService.BuildAuthUserDtoAsync` (login payload) → `AuthService.ts` `hasPermissionForPath` → `Sidebar.tsx` and `ProtectedLayout.tsx`.

## Confirmed Bugs

### BUG-ROLE-001 — Role permissions are enforced only in the UI; every API endpoint accepts any authenticated user

**Severity:** Critical. Security breach: any logged-in user, including one with only the Dashboard permission, can read and change data in every module and can grant themselves an administrator role.

**Status:** Confirmed

**Test Area:** Permissions / Authorization / API

**Description:**
Permissions (`PermissionRole` → `PermissionMaster.Url`) are delivered to the browser in the login payload and used only to hide menu items and block client-side routes. On the server, the only authorization rule is the fallback policy "authenticated user". No controller or action uses `[Authorize(Roles=…)]` or `[Authorize(Policy=…)]`, no authorization policy other than CORS is registered, no MVC filter is added, and the middleware pipeline contains only authentication and authorization. Role and permission information in the JWT (`roleId`, `ClaimTypes.Role` = role ID) is never checked.

Consequences (examples, all reachable with a normal user token):
- `PUT /api/UserManagement/UpdateUser` with the caller's own user ID and an Admin role ID → next login gives full access (privilege escalation).
- `POST /api/UserManagement/AssignPermissionsToRole` → grant any permission to the caller's own role.
- `POST /api/UserManagement/SeedPermissions?clearExisting=true` → wipes permissions for all tenants (BUG-ROLE-002).
- `POST /api/SystemSettings/SaveSettings`, accounting, payroll and master-data endpoints → callable without the matching permission.

**Steps to Reproduce:**
1. Create role "Viewer" with only the Dashboard permission; assign it to user V.
2. Log in as V. The sidebar shows only Dashboard; opening `/user-management` shows "No access".
3. With V's access token, call `GET /api/UserManagement/GetUsers?tenantId=<t>` → 200 with the user list.
4. Call `PUT /api/UserManagement/UpdateUser` with body `{"userUniqueID":<V>,"tenantID":<t>,"status":"Active","role":<Admin role ID>}` → 200.
5. Log in again as V → full administrator access.

**Expected:**
The API enforces the same permissions as the UI (per endpoint or per controller), returning 403 when the caller's role lacks the permission.

**Actual:**
All endpoints return data or apply changes for any authenticated user.

**Evidence:**
* Frontend: `Cimmple_UI/src/Common/Services/AuthService.ts` lines 226–258 (`isAdminSession`, `hasPermissionForPath`, client-side only); `Common/Components/ProtectedLayout.tsx` lines 46–61 (route guard); `Common/Components/Sidebar.tsx` lines 66–67 (menu filter).
* Backend: `Cimmple_API/CimmpleAPI/Program.cs` lines 142–147 (`FallbackPolicy = RequireAuthenticatedUser()` only), 43–48 (`AddControllers` without filters), 62 (the only `AddPolicy` is the CORS policy). A repository-wide search finds no `[Authorize(Roles` / `[Authorize(Policy`, `IAuthorizationFilter` or `IAsyncActionFilter`. `Services/Auth/AuthService.cs` lines 680–684 (role ID placed in claims but never evaluated).
* Database: `PermissionRole`, `PermissionMaster` (read only at login, `AuthService.cs` lines 601–622).

**Root Cause:**
Role-based access control was implemented only as a navigation feature; no server-side authorization layer maps endpoints to permissions.

**Business Impact:**
Complete bypass of role separation (accounting, payroll, settings, user administration); self-service privilege escalation; audit/compliance failure.

**Affected Areas:** Every API controller; User Management; System Settings; Accounting; Payroll; Masters; Reports.

**Recommended Fix:**
Add a server-side permission check: e.g. an authorization policy or action filter that loads the caller's permission URLs (or permission IDs) from the token/role and maps each controller (or action) to the required permission, with administrator bypass; at minimum protect `UserManagementController`, `SystemSettingsController` and accounting/payroll controllers first. Remove reliance on client-supplied tenant and role data.

---

### BUG-ROLE-002 — "Clear & Reseed" (and the first full seed) wipes and resets role permissions for every tenant

**Severity:** Critical. Data corruption across tenants: one administrator's click removes every custom permission assignment in all tenants and resets all non-admin roles to Dashboard only.

**Status:** Confirmed

**Test Area:** Business logic / Database / Tenant

**Description:**
`PermissionMaster` is a global table (no tenant column), and the seed/clear endpoints do not take a tenant:
- `SeedPermissions?clearExisting=true` (the "Clear & Reseed" buttons) deletes **all** `PermissionRole` rows and **all** `PermissionMaster` rows in the database, re-inserts the 42 definitions, then runs `AssignDefaultRolePermissionsAsync`.
- `AssignDefaultRolePermissionsAsync` loads **every** `UserRole` of every tenant, deletes their assignments, and gives admin-named roles all permissions and every other role Dashboard only. The same happens on a seed without `clearExisting` when `PermissionMaster` is empty (first-time seed).
- `DELETE ClearPermissions` (exposed in `UserManagementService.ts`, not wired to a button) deletes all rows in both tables for all tenants.
- Assignments are written with `TenantId = role.TenantId`. Global roles (`TenantId = 0`) therefore get rows under tenant 0, but login only reads rows where `PermissionRole.TenantId == user.TenantID`, so users of every tenant who hold a global non-admin role end up with no permissions at all (only `/home`).

The confirmation dialog says "ALL role assignments" but gives no indication that other tenants are affected.

**Steps to Reproduce:**
1. Tenant A: give role "Accountant" (tenant A) the Accounts Payable and Journal Entries permissions.
2. Tenant B administrator: User Management → Manage permissions on any role → "🔄 Clear & Reseed" → confirm.
3. Tenant A's "Accountant" now has Dashboard only (and permission IDs have changed). Accountant users in tenant A lose access to AP after their next login/refresh.

**Expected:**
Seeding adds missing permission definitions without touching existing assignments, and any reset is limited to the current tenant.

**Actual:**
All tenants' assignments are deleted and replaced with defaults.

**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/UserManagement/RolePermissionManager.tsx` lines 141–184 and 275–309 (Clear & Reseed buttons, `SeedPermissions(true)`), 145–148 (confirmation text), 186–219 and 237–265 (seed buttons). `Common/Services/UserManagementService.ts` lines 246–258.
* Backend: `Controllers/UserManagementController.cs` lines 486–503 (`ClearPermissions` removes all rows), 533–547 (`clearExisting` removes all rows), 573–576 (full seed then defaults), 606–670 (`AssignDefaultRolePermissionsAsync` over all roles of all tenants; `TenantId = role.TenantId` at 637, 646, 657). `Services/Auth/AuthService.cs` line 609 (permissions read only for `pr.TenantId == user.TenantID`).
* Database: `PermissionMaster` (no `TenantId`, `Data/Models/PermissionMaster.cs`), `PermissionRole(RoleId, PermissionId, TenantId)`.

**Root Cause:**
Maintenance/seed operations written as global database operations and exposed in a tenant-level admin screen without any scoping or authorization (see BUG-ROLE-001).

**Business Impact:**
Users across all customers lose module access simultaneously; admins must rebuild every role's permissions by hand; possible business stoppage.

**Affected Areas:** All tenants; every module's access; login payload.

**Recommended Fix:**
Remove `clearExisting` and `ClearPermissions` from the tenant UI (keep as a protected platform-maintenance operation, if at all); make seeding additive only; when assigning defaults, limit to roles of the current tenant and write `TenantId` as the caller's tenant (also for global roles).

---

### BUG-ROLE-003 — Role "Description" is stored as `RoleTag`, so a description containing "admin" silently makes the role a full administrator

**Severity:** High. A significant security control is bypassed by an innocent edit: typing a description such as "Assists the admin team" or "Administrative clerk" grants all routes, all locations, and all permissions on reseed.

**Status:** Confirmed

**Test Area:** Permissions / Business logic

**Description:**
Manage Roles shows a free-text "Description" field. `CreateRole` saves it into `UserRole.RoleTag` (or copies the role name when null), `UpdateRole` overwrites `RoleTag` with it, and `GetRoles` returns `RoleTag` as `description`. `RoleTag` is also one of the two inputs of the administrator check (`IsAdminRole(roleName, roleTag)` → `Contains("admin")`). A matching role gets `canAccessAllLocations = true` and an empty permission list, which the UI treats as full administrator, and the seeder assigns it every permission.

BUG-AUTH-017 covers the substring rule itself (role names like "Sales Admin"). This bug is about the hidden coupling: the configured permissions on the screen look restricted, and nothing in the UI tells the administrator that the description text controls admin status.

**Steps to Reproduce:**
1. Manage Roles → Create New Role: name "Clerk", description "Helps the admin office".
2. Manage permissions: select Dashboard only; save. Assign the role to user C.
3. Log in as C: every menu item and every location is available.

**Expected:**
Descriptions are informational only; administrator status is an explicit flag (or determined only by assigned permissions).

**Actual:**
The description text grants administrator access.

**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/UserManagement/RoleManager.tsx` lines 292–302 (Description textarea), 131 and 140 (sent as `description`), 227 (shown in list). `Common/Services/AuthService.ts` lines 226–242 (`canAccessAllLocations` → full access).
* Backend: `Controllers/UserManagementController.cs` line 745 (`RoleTag = dto.Description ?? dto.RoleName`), 801–802 (`role.RoleTag = dto.Description`), 411 (`description = r.RoleTag`), 638 and 672–681 (seed admin check on `RoleTag`). `Services/Auth/AuthService.cs` lines 519–530 and 703–712.
* Database: `UserRole.RoleTag`.

**Root Cause:**
A legacy classification column (`RoleTag`) is reused as the user-editable description while still driving authorization.

**Business Impact:**
Unintended full access for ordinary users; difficult to detect because the permission screen shows a restricted set.

**Affected Areas:** Roles, login payload, location access, permission seeding.

**Recommended Fix:**
Store the description in its own column and stop using `RoleTag` (and name substrings) for admin detection; use an explicit `IsAdmin` flag. Until then, at least warn in the UI.

---

### BUG-ROLE-004 — Scheduled Report Emails and the payroll import/manual pages have no permission definition, so non-admin roles can never be granted them

**Severity:** Medium. Feature unavailable to non-admin users in a specific but legitimate configuration; the only workaround is making the user an administrator.

**Status:** Confirmed

**Test Area:** Permissions / Seed / Navigation

**Description:**
Permission matching is by exact URL. `/reports/schedules`, `/accounts/payroll/import` and `/accounts/payroll/manual` are protected routes (and `/reports/schedules` is a sidebar item), but `BuildPermissionsToSeed` contains no entry for them: it seeds 42 URL permissions against 45 routes (the matrix expects 45 and states these sub-routes need their own entries). For a non-admin user:
- "Scheduled Report Emails" never appears in the sidebar, and the buttons in Reports and Financial Reports lead to "No access" or a redirect.
- "Import" and "Add manual journal" on Payroll Journals redirect away, even for a role that has "Payroll Journals".

**Steps to Reproduce:**
1. Give role "Accountant" every permission listed in Manage Permissions.
2. Log in as an Accountant user.
3. The Reports group shows only "Reports". Payroll Journals → Import → redirected to the landing page.

**Expected:**
Every protected route has a grantable permission (45 seeded entries).

**Actual:**
Three routes are only reachable by administrators.

**Evidence:**
* Frontend: `Cimmple_UI/src/Common/Routes.tsx` lines 220–229 and 265–269 (routes); `Common/Components/Sidebar.tsx` line 88 (menu item); `Modules/Accounting/PayrollJournalLinks.tsx` lines 402 and 454; `Modules/Reports/BusinessIntelligence.tsx` line 703; `Modules/Accounting/FinancialReports.tsx` line 360; `Common/Services/AuthService.ts` lines 252–257 (exact match).
* Backend: `Controllers/UserManagementController.cs` lines 863–910 (42 entries, none with these URLs).
* Database: `PermissionMaster.Url`.

**Root Cause:**
The seed list was not updated when the routes were added.

**Business Impact:**
Non-admin finance/report users cannot import payroll journals or manage scheduled reports; pushes customers to over-grant admin roles.

**Affected Areas:** Reports (scheduled emails), Accounting (payroll journals).

**Recommended Fix:**
Add the three permissions to `BuildPermissionsToSeed` (the additive seed path at lines 551–571 will then insert them), or let sub-routes inherit their parent permission.

---

### BUG-ROLE-005 — Global and legacy roles appear with Edit and Delete buttons, but both actions fail with "Role not found"

**Severity:** Low. Minor UX: offered actions always fail for some rows.

**Status:** Confirmed

**Test Area:** CRUD

**Description:**
`GetRoles` returns tenant roles, global roles (`TenantId = 0`) and any role currently assigned to a user in the tenant (legacy roles with another tenant ID). Manage Roles shows Edit and Delete for every row. `UpdateRole` and `DeleteRole` look up the role with `TenantId == dto.TenantId`, so for global/legacy roles they return 404 "Role not found".

**Steps to Reproduce:**
1. Have a role with `TenantId = 0` (e.g. a global "Admin").
2. Manage Roles → Edit it → change Order → Update. Error toast "Role not found". Delete → same.

**Expected:**
Non-editable roles are shown read-only (or the API allows editing according to an explicit rule).

**Actual:**
Buttons shown; actions fail.

**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/UserManagement/RoleManager.tsx` lines 223–253 (Edit/Delete for every role).
* Backend: `Controllers/UserManagementController.cs` lines 402–405 (list includes `TenantId == 0` and assigned roles), 777–783 and 824–831 (lookup requires the same tenant).
* Database: `UserRole.TenantId`.

**Root Cause:**
List scope and edit scope differ, and the API response's `tenantId` is not used by the UI to disable actions.

**Business Impact:**
Confusion; administrators cannot rename or reorder roles they can see.

**Affected Areas:** Manage Roles.

**Recommended Fix:**
Disable/hide Edit and Delete when `role.tenantId !== currentTenant`, or explain why in a tooltip.

---

### BUG-ROLE-006 — Clearing a role's Description is ignored

**Severity:** Low. A visible edit is silently not saved; it also blocks the obvious workaround for BUG-ROLE-003.

**Status:** Confirmed

**Test Area:** CRUD / Edit

**Description:**
`UpdateRole` applies `Description` only when it is non-empty. Emptying the field and saving returns "Role updated successfully" but the old text (and its effect on admin detection) remains.

**Steps to Reproduce:**
1. Edit a role with a description; clear the Description field; click Update.
2. Success toast. Reopen: description unchanged.

**Expected:**
An empty description is saved as empty.

**Actual:**
Old description kept.

**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/UserManagement/RoleManager.tsx` lines 127–136 (`description: formData.description` sent, possibly `""`).
* Backend: `Controllers/UserManagementController.cs` lines 801–802 (`if (!string.IsNullOrEmpty(dto.Description)) role.RoleTag = dto.Description;`).
* Database: `UserRole.RoleTag`.

**Root Cause:**
"Only update non-empty fields" pattern used for an optional field.

**Business Impact:**
Stale descriptions; an "admin" description cannot be removed through the UI (only by editing it to other text).

**Affected Areas:** Manage Roles; admin detection (BUG-ROLE-003).

**Recommended Fix:**
Treat `null` as "not supplied" and `""` as "clear"; send the field explicitly from the UI.

---

### BUG-ROLE-007 — Role and permission endpoints lack server-side validation (blank names, untrimmed duplicates, global-name duplicates, non-existent IDs)

**Severity:** Low. Data quality and integrity issues reachable mainly through direct API calls or whitespace input.

**Status:** Confirmed

**Test Area:** Validation / API / Database

**Description:**
- `CreateRole` does not check for a blank name; `UpdateRole` accepts a whitespace-only name (`IsNullOrEmpty` passes `"   "`). The UI checks `roleName.trim()` but sends the untrimmed value, so " Supervisor " and "Supervisor" are both accepted.
- The duplicate check compares only within `dto.TenantId`, so a tenant can create a role with the same name as a global (`TenantId 0`) role; both appear in the role dropdowns.
- `AssignPermissionsToRole` does not check that the role exists or belongs to the tenant, or that the permission IDs exist. `PermissionRole` has no foreign keys and no unique index, so orphan and duplicate rows are stored (duplicate IDs in `permissionIds` produce duplicate rows).

**Steps to Reproduce:**
1. Create role " Supervisor " (leading/trailing space) and then "Supervisor": both succeed.
2. `POST /api/UserManagement/CreateRole` with `{"roleName":"","tenantId":<t>}` → 200, a role with an empty name.
3. `POST /api/UserManagement/AssignPermissionsToRole` with `{"roleId":999999,"tenantId":<t>,"permissionIds":[1,1,999999]}` → 200; three orphan rows stored.

**Expected:**
Names trimmed and required; unique within the names visible to the tenant; role and permission IDs validated.

**Actual:**
As described.

**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/UserManagement/RoleManager.tsx` lines 116–119 (trim used only for the check), 130 and 139 (untrimmed value sent).
* Backend: `Controllers/UserManagementController.cs` lines 721–729 and 742–749 (create), 786–800 (update), 684–705 (assign).
* Database: `PermissionRole` created without FK or index (`Cimmple_API/CimmpleAPI/Data/Migrations/20251223153944_InitialCreate.cs` lines 823–836); `UserRole` has no unique index on `(TenantId, RoleName)`.

**Root Cause:**
Validation exists only in the UI; schema has no constraints.

**Business Impact:**
Confusing duplicate roles; orphan permission rows; harder auditing.

**Affected Areas:** Roles, permission assignment.

**Recommended Fix:**
Trim and require names server-side; check duplicates against tenant and global roles; validate role/permission IDs and de-duplicate `permissionIds`; add FKs and a unique index `(RoleId, PermissionId, TenantId)`.

---

### BUG-ROLE-008 — Seed help text is out of date ("26 common permissions … Labor Management")

**Severity:** Low. Cosmetic/misleading text.

**Status:** Confirmed

**Test Area:** UI text

**Description:**
The empty-state text in Manage Permissions says the seed creates "26 common permissions including … Labor Management". The seed creates 42 permissions and there is no Labor Management permission.

**Steps to Reproduce:**
1. With an empty `PermissionMaster`, open Manage permissions for any role and read the text under the seed button.

**Expected:**
Accurate text (count and module names).

**Actual:**
"26 … Labor Management".

**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/UserManagement/RolePermissionManager.tsx` lines 312–314.
* Backend: `Controllers/UserManagementController.cs` lines 863–910 (42 entries; no Labor Management).
* Database: n/a.

**Root Cause:**
Text not maintained with the seed list.

**Business Impact:**
Minor confusion.

**Affected Areas:** Manage Permissions.

**Recommended Fix:**
Remove the hard-coded count or derive it from the API response.

---

## Potential Bugs

### BUG-ROLE-009 — Concurrent role creation or permission assignment can create duplicate rows

**Severity:** Low. Requires simultaneous requests; results in duplicates rather than data loss.

**Status:** Potential

**Test Area:** Database / Concurrency

**Description:**
Role-name uniqueness is a read-then-insert check without a unique index, and `AssignPermissionsToRole` deletes then inserts without a unique constraint. Two administrators saving at the same time (or a retried request) can create two roles with the same name, or two sets of permission rows for the same role.

**Steps to Reproduce:**
1. Send two `CreateRole` requests with the same name for the same tenant simultaneously.
2. Check `UserRole` for two rows with that name.

**Expected:**
One request succeeds; the other gets "Role name already exists".

**Actual (expected from code):**
Both may succeed.

**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/UserManagement/RoleManager.tsx` lines 113–168 and 338–345 (buttons disabled while `saving`, which protects one browser tab only, not two administrators).
* Backend: `Controllers/UserManagementController.cs` lines 721–752 and 689–705.
* Database: no unique index on `UserRole(TenantId, RoleName)` or `PermissionRole(RoleId, PermissionId, TenantId)` (`InitialCreate` lines 823–836).

**Root Cause:**
Uniqueness enforced only in application code.

**Business Impact:**
Duplicate roles in dropdowns; duplicate permission rows (harmless for matching but confusing).

**Affected Areas:** Roles, permissions.

**Recommended Fix:**
Add unique indexes and handle the constraint violation as a 400.

**Why further verification is needed:** Race conditions need concurrent requests against a real database to confirm.

---

## Needs Manual Verification

1. **Area:** Permission change propagation
   - **What to Test:** Change a role's permissions while a user with that role is logged in; check sidebar/route access before and after token refresh, and after re-login.
   - **Expected:** Access updates after refresh or re-login (permissions are in the login/refresh payload).
   - **Why Manual Testing Is Required:** Depends on token lifetime and when `persistSession` runs; needs two sessions.

2. **Area:** Menu filtering and route guard per role
   - **What to Test:** For a role with a subset of permissions, compare visible sidebar items with typed URLs (including `/quality` vs `/quality/ncr-codes`, `/accounts/payroll` vs its sub-routes).
   - **Expected:** Exact-URL behaviour as documented; denied routes redirect to the first allowed page or show "No access".
   - **Why Manual Testing Is Required:** Browser behaviour and landing-path logic.

3. **Area:** Zero-permission non-admin role
   - **What to Test:** Assign a role with no permissions; log in.
   - **Expected:** Only Dashboard reachable (`EMPTY_PERM_ALLOWED_PATHS`).
   - **Why Manual Testing Is Required:** Confirm the Dashboard page itself does not error when other module APIs are hidden (APIs still respond because of BUG-ROLE-001).

4. **Area:** Delete role in use
   - **What to Test:** Delete a role assigned to an active user and to an inactive user only.
   - **Expected:** Blocked with "Cannot delete role. N user(s)…" in both cases (count includes inactive users).
   - **Why Manual Testing Is Required:** Confirm intended rule for inactive users.

5. **Area:** Responsive modals
   - **What to Test:** Manage Roles and Manage Permissions panels at 375–430 px.
   - **Expected:** Usable layout, scrollable lists, buttons reachable.
   - **Why Manual Testing Is Required:** Visual.

## No Issues Found

- `GetPermissionsByRole` and login both filter permission rows by role and tenant (`UserManagementController.cs` lines 432–433; `AuthService.cs` lines 606–616).
- `AssignPermissionsToRole` replaces the role's set for the tenant atomically in one `SaveChanges` (lines 689–705).
- `DeleteRole` blocks deletion while users hold the role and removes the role's permission rows (lines 833–853).
- `ResetPwd` is normalised to Y/N, also accepting Yes/true/1 (lines 913–925).
- Additive seed (permissions already present) inserts only missing URLs and does not touch assignments (lines 551–571).
- Role list ordering by `OrderNo`; new roles get the next order number when none is supplied (lines 406, 731–740).
- Exact-path permission matching keeps sibling routes independent (`AuthService.ts` lines 252–257); an empty permission list allows only `/home` (lines 238, 248–250).
- The route guard avoids redirect loops by showing "No access" when the landing page is also denied (`ProtectedLayout.tsx` lines 52–57).
- After creating a role, the UI opens Manage Permissions for it (`RoleManager.tsx` lines 151–153).
- Role create/update/delete error toasts surface the API message (`RoleManager.tsx` lines 108, 163).

## QA Coverage

| Test Area | Tested | Result |
| --- | --- | --- |
| Navigation | Yes | Fail (BUG-ROLE-004 unreachable routes); guard logic otherwise OK |
| CRUD | Yes | Fail (BUG-ROLE-005, BUG-ROLE-006) |
| Search | N/A | No search in role screens |
| Filters | N/A | None |
| Sorting | N/A | Fixed `OrderNo` order |
| Pagination | N/A | None |
| Validation | Yes | Fail (BUG-ROLE-007) |
| Permissions | Yes | Fail (BUG-ROLE-001 Critical, BUG-ROLE-003) |
| API | Yes | Fail (BUG-ROLE-001, BUG-ROLE-002, BUG-ROLE-007) |
| Database | Yes | Fail (BUG-ROLE-002, BUG-ROLE-007); Potential (BUG-ROLE-009) |
| Business Logic | Yes | Fail (BUG-ROLE-002, BUG-ROLE-003, BUG-ROLE-004) |
| Location | Yes | Admin detection grants all locations (BUG-ROLE-003, BUG-AUTH-017) |
| Tenant | Yes | Fail (BUG-ROLE-002 cross-tenant reseed); client-supplied tenant in Cross-Module Concerns |
| Cross-Module | Yes | BUG-ROLE-001 affects every module; BUG-AUTH-004 re-verified |
| Responsive/PWA | No | Manual (item 5) |

## Matrix Checklist

| Matrix Row | Result | Notes |
| --- | --- | --- |
| FE — List roles (`RoleManager.tsx`, GET `GetRoles`) | Pass | Includes global/legacy roles whose actions fail (BUG-ROLE-005) |
| FE — Add role (POST `CreateRole`) | Fail | Description becomes admin switch (BUG-ROLE-003); untrimmed name (BUG-ROLE-007) |
| FE — Edit role (incl. Reset Password Required, PUT `UpdateRole`) | Fail | Clearing description ignored (BUG-ROLE-006); global roles fail (BUG-ROLE-005); Reset Password loop is BUG-AUTH-004 |
| FE — Delete role (DELETE `DeleteRole`) | Pass | In-use check works; global roles fail (BUG-ROLE-005) |
| FE — Assign permissions (`GetAllPermissions`, `GetPermissionsByRole`, POST `AssignPermissionsToRole`) | Fail | Three routes not grantable (BUG-ROLE-004); save error toast generic (BUG-USER-005) |
| FE — Clear & Reseed (`ClearPermissions`, `SeedPermissions?clearExisting`) | Fail | Affects all tenants (BUG-ROLE-002); stale text (BUG-ROLE-008) |
| FE — Menu filtering (`Sidebar.tsx` `filterByPermission`) | Pass | Works as designed; Scheduled Report Emails never shown to non-admins (BUG-ROLE-004) |
| FE — Route guard (`ProtectedLayout.tsx`) | Pass | UI only; server not enforced (BUG-ROLE-001) |
| FE — Validation (role name required) | Pass | UI trim check works; server lacks it (BUG-ROLE-007) |
| FE — Responsive (role and permission modals) | Manual | Item 5 |
| BE — List (`GetRoles`, `GetAllPermissions`, `GetPermissionsByRole`) | Pass | `GetRoles` defaults to tenant 1 (Cross-Module Concerns) |
| BE — Create (`CreateRole`) | Fail | BUG-ROLE-003, BUG-ROLE-007 |
| BE — Update (`UpdateRole`, `AssignPermissionsToRole` replace all) | Fail | BUG-ROLE-006, BUG-ROLE-007 |
| BE — Delete (`DeleteRole`, `ClearPermissions`) | Fail | `DeleteRole` OK; `ClearPermissions` wipes all tenants (BUG-ROLE-002) |
| BE — Seed (`SeedPermissions`, 45 URL permissions) | Fail | Seeds 42, not 45 (BUG-ROLE-004); full seed/clear is global (BUG-ROLE-002) |
| BE — Validation (name unique per tenant, in-use delete blocked, `ResetPwd` Y/N) | Fail | In-use and `ResetPwd` pass; uniqueness weak (BUG-ROLE-007, BUG-ROLE-009) |
| BE — Authorization (no server-side permission enforcement) | Fail | Logged as BUG-ROLE-001 (Critical) |
| BL — Full seed: admin roles all permissions, others Dashboard only | Fail | Behaves as described but for all tenants (BUG-ROLE-002); global roles get tenant-0 rows unreadable by any tenant; admin detection uses description (BUG-ROLE-003) |
| BL — Empty permission list: non-admin reaches only `/home` | Pass | `AuthService.ts` lines 238, 248–250 (UI only, BUG-ROLE-001) |
| BL — Exact path; sub-routes need own entries | Fail | Sub-route entries missing (BUG-ROLE-004) |

## Cross-Module Concerns

| Concern | Root-cause module/file | Evidence |
| --- | --- | --- |
| Role/permission endpoints take the tenant from query or body (`GetRoles?tenantId`, `GetPermissionsByRole?tenantId`, `AssignPermissionsToRole.TenantId`, `CreateRole.TenantId`, `UpdateRole.TenantId`, `DeleteRole?tenantId`) without comparing it with the token tenant, so another tenant's roles can be read and changed. | Tenant / Location Framework — `QA_TenantLocationFramework.md` | `Controllers/UserManagementController.cs` lines 387–392, 428–433, 690–701, 722–746, 777–779, 820–826 |
| `GetRoles` falls back to tenant `1`; the UI falls back to tenant `1` when `storage.tenantID` is missing. | Tenant / Location Framework | `UserManagementController.cs` line 392; `RoleManager.tsx` lines 101, 124; `UserManagement.tsx` line 432 |
| Admin detection by name/tag substring (also grants all locations). | Authentication — BUG-AUTH-017 | `AuthService.cs` lines 703–712 |
