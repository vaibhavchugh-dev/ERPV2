# QA — User Management -t

| Module | Matrix section | Bug ID prefix | Tested | Confirmed Bugs | Potential Bugs | Manual Verification |
| --- | --- | --- | --- | --- | --- | --- |
| User Management | 1.3 | BUG-USER | Yes | 6 | 2 | 5 |

Source of test cases: `QA_TEST_MATRIX.md`. Method: static trace of the actual implementation (React UI → service → Axios → .NET controller → service/repository → EF Core → SQL Server, and back). No application code, configuration or database is changed during QA. Findings that depend on deployed configuration, data or a real browser go under **Needs Manual Verification**.

Severity scale:
- **Critical**: security breach, data corruption, financial corruption, or a blocked core workflow.
- **High**: a major feature is broken or a significant security control is bypassed, with a workaround that is hard or unavailable.
- **Medium**: a feature works incorrectly in specific conditions, or a security control is weaker than configured.
- **Low**: cosmetic, minor UX, or an informational/hardening issue.

---

Matrix section 1.3. Flows traced: `Modules/UserManagement/UserManagement.tsx` (list, search, filters, sort, paging, deactivate) and `UserManagementSlideout.tsx` (edit role/status, permission viewer) → `Common/Services/UserManagementService.ts` → `UserManagementController` (`GetUsers`, `GetUserById`, `UpdateUser`, `DeleteUser`, `GetRoles`, `GetPermissionsByRole`) → `UserDetails`, `UserRole`, `UserMapping`, `PermissionRole`; login effect through `AuthService.IsUserActive` / `BuildAuthUserDtoAsync`.

Related bugs logged elsewhere: server-side permission enforcement is missing for every endpoint in this module (BUG-ROLE-001); legacy `UserController` endpoints are covered by BUG-AUTH-001, 002, 003, 009, 015 and 019; password reset findings are in `QA_PasswordPolicy.md`.

## Confirmed Bugs

### BUG-USER-001 — UpdateUser accepts any Role and any Status without validation, including roles from other tenants and an empty status that re-activates the user

**Severity:** Medium. Data integrity and access-control weakness: an API call can assign a foreign or non-existent role, lock a user out with an unknown status, or silently re-activate a deactivated user.

**Status:** Confirmed

**Test Area:** Validation / API / Business logic

**Description:**
The matrix backend row requires "role exists in tenant" validation, and the slideout marks Role and Status as required. `PUT /UserManagement/UpdateUser` copies `userDto.Status` and `userDto.Role` onto the user with no checks:
- **Role:** any integer (or null) is stored. Login loads the role by `RoleID` with no tenant filter and applies the admin-name heuristic, so assigning the ID of another tenant's "Admin" role gives the user `canAccessAllLocations` and full UI access in their own tenant. A non-existent ID or null leaves the user with no permissions.
- **Status:** any string is stored. `AuthService.IsUserActive` treats a null/blank status as **active**. A request that omits `status` (for example `{ "userUniqueID": 5, "tenantID": 1, "role": 3 }`) sets `Status = NULL`, which re-enables a deactivated user while leaving `Date_of_termination` set. An unknown value such as `"Disabled"` blocks login and hides the user from both status filters (Active/Inactive).

**Steps to Reproduce:**
1. Deactivate user U (status Inactive).
2. Call `PUT /api/UserManagement/UpdateUser` with body `{"userUniqueID":<U>,"tenantID":<tenant>,"role":<U's role>}` (no `status`).
3. Response 200. Log in as U: login succeeds (status is now NULL, treated as active). The list shows "Unknown" status.
4. Call again with `"role": <RoleID of an Admin role belonging to another tenant>`, `"status":"Active"`. Log in as U: the user receives all locations and all routes.

**Expected:**
The API rejects a role that is not available to the tenant and a status outside Active/Inactive/Pending; a missing status does not change the account state.

**Actual:**
All values are stored as sent.

**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/UserManagement/UserManagementSlideout.tsx` lines 141–154 (Role and Status required, UI only), 312–322 (status options).
* Backend: `Cimmple_API/CimmpleAPI/Controllers/UserManagementController.cs` lines 231–265 (`user.Status = userDto.Status; user.Role = userDto.Role;`, no role lookup), 977–983 (`UpdateUserDto.Status` is `string?`, `Role` is `int?`, no validation attributes). `Services/Auth/AuthService.cs` lines 714–719 (`IsNullOrWhiteSpace(Status)` → active), 519 (role lookup by ID only), 530 (`IsAdminRole` → `canAccessAll`).
* Database: `UserDetails.Role`, `UserDetails.Status`, `UserRole.TenantId`.

**Root Cause:**
Server-side validation for the account-management DTO was never implemented; the UI is relied on.

**Business Impact:**
Accounts can be re-activated or escalated through a direct API call (made worse by BUG-ROLE-001, which lets any authenticated user call this endpoint); inconsistent user states appear in the list.

**Affected Areas:** User Management, Authentication (login/permission build), Roles & Permissions.

**Recommended Fix:**
Validate that `Role` exists and is visible to the tenant (tenant role or global role), require `Status` and restrict it to the allowed values, and ignore omitted fields instead of overwriting them with null.

---

### BUG-USER-002 — Changing the Status filter does not reset the page, so the list can show "No users found" with no way back

**Severity:** Medium. The list hides existing users under a specific filter/page combination and hides the pagination controls, so the user believes no matching users exist.

**Status:** Confirmed

**Test Area:** Filters / Pagination

**Description:**
The search box and the site filter both reset `pageNumber` to 1, but the Status filter only calls `setFilterValue`. The next request keeps the current page number. If the filtered result has fewer pages, the API returns an empty page with `totalPages` of 1, the table shows "No users found", and the pagination bar is hidden (`totalPages > 1` is false). The same happens when the last user on the last page is deactivated while the Active filter is applied.

**Steps to Reproduce:**
1. Have more than 30 users and fewer than 10 inactive users.
2. Go to page 4 of the list.
3. Change Status to "Inactive".
4. The table shows "No users found" and there are no paging buttons. Typing in the search box (which resets to page 1) brings the rows back.

**Expected:**
Changing any filter returns to page 1 (matrix standard check "filter + pagination resets to page 1").

**Actual:**
The page number is kept and an empty page is shown.

**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/UserManagement/UserManagement.tsx` lines 266–276 (status select, no page reset) versus lines 250–256 (site filter resets page) and 54–64 (search resets page); lines 107–123 (request uses current `pageNumber`, response pagination stored); lines 372–394 (paging hidden when `totalPages <= 1`).
* Backend: `Controllers/UserManagementController.cs` lines 99–106 and 150–160 (`Skip((pageNumber - 1) * pageSize)` returns an empty page beyond the end).
* Database: n/a.

**Root Cause:**
Missing page reset in the status filter handler.

**Business Impact:**
Administrators may wrongly conclude there are no inactive users and miss accounts that need attention.

**Affected Areas:** User Management list.

**Recommended Fix:**
Reset `pageNumber` to 1 when the status filter changes, and clamp to the last page when the response reports fewer pages than the requested page.

---

### BUG-USER-003 — Editing the Termination Reason of an already-inactive user is silently discarded

**Severity:** Low. A visible, editable field does not save, with a success message shown.

**Status:** Confirmed

**Test Area:** Edit / Business logic

**Description:**
When Status is Inactive, the slideout shows an editable "Termination Reason" field pre-filled with the stored reason, and sends `terminationReason` on save. The API only writes `Termination_Reason` when the status becomes Inactive **and** `Date_of_termination` is empty. For a user who is already inactive (or whose termination date was set elsewhere, for example in Employee Master), the new reason is ignored, yet the UI shows "User account updated successfully".

**Steps to Reproduce:**
1. Open user U in the slideout, set Status to Inactive and save (API stores reason "Deactivated by admin"; the Deactivate button would store "Deleted by admin").
2. Open U in the slideout, change Termination Reason to "Contract ended", click Update Account.
3. Success toast appears. Reopen U: the reason is still "Deactivated by admin".

**Expected:**
The reason entered is saved (or the field is read-only when it cannot be changed).

**Actual:**
The change is dropped silently.

**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/UserManagement/UserManagementSlideout.tsx` lines 326–340 (editable field), 170–176 (`terminationReason` sent), 192 (success toast).
* Backend: `Controllers/UserManagementController.cs` lines 252–257 (reason written only when `Date_of_termination` is empty).
* Database: `UserDetails.Termination_Reason`, `UserDetails.Date_of_termination`.

**Root Cause:**
The reason update is tied to the first-time termination stamp.

**Business Impact:**
Inaccurate HR/audit information on deactivated accounts.

**Affected Areas:** User Management, Employee Master (shares the termination fields).

**Recommended Fix:**
Update `Termination_Reason` whenever the status is Inactive and a reason is supplied; keep the date logic as is.

---

### BUG-USER-004 — Client-side sorting: Role sorts by internal ID, and the sort arrow stays on after the data is reloaded unsorted

**Severity:** Low. Cosmetic/UX: sort order does not match what is displayed.

**Status:** Confirmed

**Test Area:** Sort

**Description:**
- The Role column displays the role **name** but `handleSort('role')` sorts by the numeric role ID, so "Role ↑" is not alphabetical.
- `handleSort` sorts the current `users` array once. Any reload (page change, search, filter, save, deactivate) replaces `users` with the server order (by first name) while `sortColumn`/`sortDirection` and the arrow remain, so the header claims a sort that is not applied.

(The matrix documents that sorting applies to the current page only; that limitation itself is not reported.)

**Steps to Reproduce:**
1. Click the Role header: rows are ordered by role ID, not by role name.
2. Click Email to sort, then go to page 2: the Email arrow is still shown but rows are in first-name order.

**Expected:**
Sort uses the displayed value and is re-applied (or cleared) when data reloads.

**Actual:**
As described.

**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/UserManagement/UserManagement.tsx` lines 178–196 (`handleSort` sorts once by the raw field), 299–301 (Role header sorts `role`), 326 (cell shows `getRoleName`), 121–122 (reload replaces `users`).
* Backend: `Controllers/UserManagementController.cs` line 103 (`OrderBy(u => u.FirstName)`).
* Database: n/a.

**Root Cause:**
Sorting is applied imperatively to state instead of being derived from data plus the sort selection.

**Business Impact:**
Minor confusion when scanning users by role.

**Affected Areas:** User Management list.

**Recommended Fix:**
Derive the displayed rows from `users` + sort state (e.g. `useMemo`), sort Role by `roleName`, or send sort parameters to the API.

---

### BUG-USER-005 — User Management error toasts show the generic Axios message instead of the API message

**Severity:** Low. Error messages such as "User not found" or "Role name already exists" are replaced by "Request failed with status code 404/400".

**Status:** Confirmed

**Test Area:** Error handling

**Description:**
Several handlers build the toast from `error.message` (the Axios text) instead of `error.response.data.message`, although the API always returns a `{ message }` body. The Reset Password modal and Role Manager do this correctly, so behaviour is inconsistent within the same page.

**Steps to Reproduce:**
1. Open a user's slideout, then deactivate/delete that user in another tab.
2. In the first tab change the role and click Update Account (API returns 404 `{ message: "User not found" }`).
3. The toast reads "Error saving user: Request failed with status code 404".

**Expected:**
The server message is surfaced (matrix standard check 8).

**Actual:**
Generic message.

**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/UserManagement/UserManagement.tsx` lines 132 (load) and 164 (deactivate); `UserManagementSlideout.tsx` lines 97 (permissions) and 196 (save); `RolePermissionManager.tsx` lines 59, 104, 162, 197, 248 and 294 (load, save, reseed, seed). Compare `ResetPasswordModal.tsx` line 98 and `RoleManager.tsx` lines 108 and 163, which use `error.response.data.message`.
* Backend: every action in `Controllers/UserManagementController.cs` returns `{ message = ... }` on 4xx/5xx.
* Database: n/a.

**Root Cause:**
Inconsistent error-message extraction.

**Business Impact:**
Administrators cannot tell why an action failed.

**Affected Areas:** User Management list, user slideout, role permission manager.

**Recommended Fix:**
Use `error.response?.data?.message ?? error.message` in all handlers (ideally through a shared helper).

---

### BUG-USER-006 — GetUsers does not validate paging parameters

**Severity:** Low. API robustness: invalid values produce a 500 with an exception message, a meaningless `totalPages`, or an unbounded result set.

**Status:** Confirmed

**Test Area:** API / Pagination

**Description:**
`pageNumber` and `pageSize` are used as received:
- `pageNumber=0` (or negative) → `Skip(-10)` → SQL Server rejects a negative OFFSET → 500 with `error = ex.Message` in the body.
- `pageSize=0` → `Take(0)` and `totalPages = (int)Math.Ceiling(totalCount / 0.0)` (infinity or NaN cast to int).
- `pageSize=100000` → the whole tenant's user list in one response.

The UI always sends valid values, so this affects direct API callers only.

**Steps to Reproduce:**
1. `GET /api/UserManagement/GetUsers?tenantId=<t>&pageNumber=0&pageSize=10` → 500 with an SQL error message.
2. `GET ...&pageNumber=1&pageSize=0` → 200 with an empty list and an invalid `totalPages`.

**Expected:**
400 for invalid paging values, or values clamped to a sensible range.

**Actual:**
As described.

**Evidence:**
* Frontend: `Common/Services/UserManagementService.ts` lines 140–141 (always sends ≥ 1).
* Backend: `Controllers/UserManagementController.cs` lines 41–42, 102–105, 158–159, 164–167.
* Database: n/a.

**Root Cause:**
No input validation on query parameters.

**Business Impact:**
Error noise and minor information disclosure; possible heavy queries.

**Affected Areas:** User Management API.

**Recommended Fix:**
Clamp `pageNumber` to ≥ 1 and `pageSize` to 1–100, and return a generic error message on 500.

---

## Potential Bugs

### BUG-USER-007 — GetUserById returns the user's SSN and date of birth to the User Management slideout, which never displays them

**Severity:** Medium. Unnecessary exposure of highly sensitive personal data to every caller of an account-management endpoint.

**Status:** Potential

**Test Area:** API / Security

**Description:**
`GetUserById` explicitly blanks the password ("Don't return password") but includes `SSN`, `DOB`, address and phone fields. The User Management slideout only shows name, username, email, employee type, role and status. Because there is no server-side permission check (BUG-ROLE-001), any authenticated user can call `GET /api/UserManagement/GetUserById?userId=<n>&tenantId=<t>` for every user ID and harvest SSNs.

**Steps to Reproduce:**
1. Open a user in User Management and inspect the `GetUserById` response in the browser network tab.
2. The JSON contains `ssn` and `dob` values.

**Expected:**
An account-management endpoint returns only the fields the screen needs; SSN/DOB are restricted to authorised HR screens (if at all).

**Actual:**
SSN and DOB are returned.

**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/UserManagement/UserManagementSlideout.tsx` lines 202–253 (fields displayed; SSN/DOB not used). `Common/Services/UserManagementService.ts` lines 41–42 (`dob`, `ssn` typed).
* Backend: `Controllers/UserManagementController.cs` lines 176–205 (`Password = null` but `DOB = u.DOB, SSN = u.SSN`).
* Database: `UserDetails.SSN`, `UserDetails.DOB`.

**Root Cause:**
The detail DTO mirrors the employee record instead of the account-management view.

**Business Impact:**
PII exposure (regulatory risk), amplified by missing authorization.

**Affected Areas:** User Management; Employee Master (owns SSN; review its own endpoints there).

**Recommended Fix:**
Remove SSN/DOB (and other unused profile fields) from `UserDetailDto`, or mask them.

**Why further verification is needed:** Whether SSN is stored in clear text or masked depends on data written by Employee Master, and whether User Management viewers are entitled to see it is a product/HR decision.

---

### BUG-USER-008 — User list paging is ordered only by first name, so users with the same first name can repeat or disappear between pages

**Severity:** Low. Specific data condition; paging can be inconsistent.

**Status:** Potential

**Test Area:** Pagination / Sort

**Description:**
`GetUsers` orders by `FirstName` only before `Skip`/`Take`. SQL Server does not guarantee a stable order for ties, so when several users share a first name across a page boundary, one may appear on two pages and another on none.

**Steps to Reproduce:**
1. Create 12 users all with first name "Alex".
2. View page 1 and page 2 (10 per page) several times.
3. Check whether the same user appears on both pages or a user is missing.

**Expected:**
Deterministic paging (tie-breaker such as `User_UniqueID`).

**Actual:**
Order of ties is undefined.

**Evidence:**
* Frontend: `UserManagement.tsx` lines 107–117 (server paging).
* Backend: `Controllers/UserManagementController.cs` lines 102–105.
* Database: `UserDetails.FirstName` (non-unique).

**Root Cause:**
Non-unique sort key for OFFSET/FETCH paging.

**Business Impact:**
Occasionally a user cannot be found by browsing (search still works).

**Affected Areas:** User Management list.

**Recommended Fix:**
Add `.ThenBy(u => u.LastName).ThenBy(u => u.User_UniqueID)`.

**Why further verification is needed:** The effect depends on the SQL Server query plan and actual data; needs reproduction with duplicate first names.

---

## Needs Manual Verification

1. **Area:** Deactivated user's existing session
   - **What to Test:** User U logged in; an admin deactivates U (Deactivate button or status Inactive). U keeps working.
   - **Expected:** U loses access promptly.
   - **Why Manual Testing Is Required:** Deactivation does not clear `UserToken`; refresh is blocked by `IsUserActive` (`AuthService.cs` lines 164–167), but the current access token stays valid until it expires (Session Timeout, up to 480 minutes from the UI). The acceptable delay is a product decision.

2. **Area:** Self-deactivation and last administrator
   - **What to Test:** As the only admin, deactivate yourself or change your own role to a non-admin role.
   - **Expected:** Business decision (most systems block it).
   - **Why Manual Testing Is Required:** Neither the UI nor the API prevents it (`UserManagementController.cs` lines 231–303); whether a guard is required is not specified in the matrix.

3. **Area:** Location changes after login
   - **What to Test:** Add/remove a site for a user in Employee Master, then check the user list Site filter and the user's own allowed sites before and after re-login.
   - **Expected:** The list reflects `UserMapping` immediately; the user's own access changes after refresh/re-login (matrix 11.1 "User location").
   - **Why Manual Testing Is Required:** Requires two sessions and timing.

4. **Area:** Site filter for restricted users
   - **What to Test:** A location-restricted user opens User Management with "All sites" and with a specific non-allowed site via `?locationId=`.
   - **Expected:** "All sites" shows only users mapped to the user's sites (plus all-location users); a non-allowed site returns 403 and the UI shows an error.
   - **Why Manual Testing Is Required:** Code paths look correct (`UserManagementController.cs` lines 47–81); confirm UI behaviour of the 403.

5. **Area:** Responsive layout
   - **What to Test:** User table, slideout, permission viewer and role modals at 375/390/430 px.
   - **Expected:** Horizontal table scroll, slideout fits, actions reachable.
   - **Why Manual Testing Is Required:** Visual.

## No Issues Found

- `GetUsers` excludes vendor-portal accounts (`VendorId` null or 0) and filters by tenant (`UserManagementController.cs` lines 50–51).
- Search covers full name (first + last), email and username, case-insensitive, trimmed (lines 84–91); the UI debounces by 300 ms and resets to page 1 (`UserManagement.tsx` lines 54–64).
- Site filter: explicit site uses `UserMapping`, `DefaultLocationId` or `CanAccessAllLocations`; "All sites" for restricted users is limited to their allowed sites; a non-allowed site returns 403 (`UserManagementController.cs` lines 47–81; `ApiBaseController.cs` `TryResolveListLocationFilter`, lines 179–189 onward).
- Stale responses are ignored using a request counter (`UserManagement.tsx` lines 95–139).
- Role names are resolved even for legacy roles with a mismatched tenant (`UserManagementController.cs` lines 122–148).
- `?open=<id>` deep link opens the slideout and cleans the URL (`UserManagement.tsx` lines 22–33).
- Setting Inactive stamps `Date_of_termination` and a reason; setting Active clears both (lines 252–263).
- Deactivate is a soft delete with a confirmation dialog (`UserManagement.tsx` lines 150–166; `UserManagementController.cs` lines 290–297).
- Inactive and Pending users cannot log in (403 "Account is inactive") and cannot refresh (`AuthService.cs` lines 347–350, 164–167).
- Editing the logged-in user's own role updates the top bar and re-syncs permissions from `/Auth/Me` (`UserManagementSlideout.tsx` lines 180–190).
- Slideout validation requires a role and status before saving; the permission viewer lists the role's permissions with level info.
- The Add action is intentionally absent; the page explains users are created in Employee Master.
- `GetUserById`, `UpdateUser` and `DeleteUser` filter by both user ID and tenant ID (cross-tenant safety depends on the trusted tenant, see Cross-Module Concerns).

## QA Coverage

| Test Area | Tested | Result |
| --- | --- | --- |
| Navigation | Yes | Pass (`?open=` deep link, route guard). Server-side route permission missing: BUG-ROLE-001 |
| CRUD | Yes | Fail (BUG-USER-001, BUG-USER-003); deactivate OK |
| Search | Yes | Pass |
| Filters | Yes | Fail (BUG-USER-002); site filter OK |
| Sorting | Yes | Fail (BUG-USER-004) |
| Pagination | Yes | Fail (BUG-USER-002, BUG-USER-006); Potential (BUG-USER-008) |
| Validation | Yes | Fail (BUG-USER-001: UI-only validation) |
| Permissions | Yes | Fail via BUG-ROLE-001 (no server-side check on any endpoint) |
| API | Yes | Fail (BUG-USER-001, BUG-USER-006); Potential (BUG-USER-007) |
| Database | Yes | Fail (BUG-USER-001 inconsistent role/status values) |
| Business Logic | Yes | Fail (BUG-USER-003); termination stamping and login block otherwise OK |
| Location | Yes | Pass for list filter; Manual items 3 and 4 |
| Tenant | Yes | Tenant trusted from query/body (Cross-Module Concerns) |
| Cross-Module | Yes | Login effect of role/status verified (BUG-USER-001); Employee Master shares termination fields (BUG-USER-003) |
| Responsive/PWA | No | Manual (item 5) |

## Matrix Checklist

| Matrix Row | Result | Notes |
| --- | --- | --- |
| FE — List (`UserManagement.tsx`, GET `GetUsers`) | Pass | Loading, empty state, role names, status badges OK; error toast BUG-USER-005 |
| FE — Search (full name, email, username; server; 300 ms debounce) | Pass | Resets to page 1 |
| FE — Filter (Status Active/Inactive server; Site via `useSiteListFilter`) | Fail | Status filter keeps the page number (BUG-USER-002); Site filter OK |
| FE — Sort (Username, Full Name, Email, Role, Status, Created; client, current page) | Fail | Role sorts by ID; stale sort arrow after reload (BUG-USER-004) |
| FE — Pagination (server, fixed 10 per page) | Fail | Empty page after status filter (BUG-USER-002) |
| FE — Add (not available; Employee Master) | Pass | Explanatory text shown |
| FE — Edit (`UserManagementSlideout.tsx`, Role, Status Active/Inactive/Pending, PUT `UpdateUser`) | Fail | Termination reason edits dropped (BUG-USER-003); save error message BUG-USER-005 |
| FE — View (slideout and permission viewer, GET `GetUserById`, `GetPermissionsByRole`) | Pass | Response includes unused SSN/DOB (BUG-USER-007, Potential) |
| FE — Delete (deactivate, soft, DELETE `DeleteUser`) | Pass | Confirmation shown; error message BUG-USER-005 |
| FE — Validation (Role and Status required) | Pass | UI only; API does not enforce (BUG-USER-001) |
| FE — Permissions (route `/user-management`) | Pass | UI guard works; server has none (BUG-ROLE-001) |
| FE — Responsive (table and slideout 375–430 px) | Manual | Item 5 |
| BE — List (GET `GetUsers`, excludes vendor-portal users) | Pass | Paging validation BUG-USER-006; tie ordering BUG-USER-008 (Potential) |
| BE — Get (GET `GetUserById`) | Potential | BUG-USER-007 |
| BE — Update (PUT `UpdateUser`) | Fail | BUG-USER-001, BUG-USER-003 |
| BE — Delete (DELETE `DeleteUser`, soft) | Pass | Sets Inactive, date and reason; existing access token not revoked (Manual item 1) |
| BE — Legacy (`UserController`, `UnderMaintenance`) | N/A | Covered by BUG-AUTH-001, 002, 003, 009, 015, 019; `ValidateUserStatusNew` is a stub returning fixed values |
| BE — Search/Filter (`search`, `status`, `locationId`, `page`) | Pass | Parameter names are `searchTerm`/`pageNumber` (UI matches); see BUG-USER-006 for paging values |
| BE — Validation (role exists in tenant) | Fail | Not implemented (BUG-USER-001) |
| BE — Authorization (authenticated only; `tenantId` from query/body) | Fail | BUG-ROLE-001; tenant trust in Cross-Module Concerns |
| BL — Inactive stamps `Date_of_termination` and reason; Active clears them | Fail | Works on first deactivation; later reason edits dropped (BUG-USER-003); omitted status sets NULL (BUG-USER-001) |
| BL — Site filter uses `UserMapping`, `DefaultLocationId` or `CanAccessAllLocations` | Pass | `UserManagementController.cs` lines 53–81 |
| BL — Inactive users cannot log in (403) | Pass | Except a NULL status set through the API counts as active (BUG-USER-001) |

## Cross-Module Concerns

| Concern | Root-cause module/file | Evidence |
| --- | --- | --- |
| Every User Management endpoint takes the tenant from the query string or body (`GetUsers?tenantId`, `GetUserById?tenantId`, `UpdateUser.TenantID`, `DeleteUser?tenantId`, `GetRoles?tenantId`, `GetPermissionsByRole?tenantId`) and never compares it with the token tenant, so users of another tenant can be listed, read, edited and deactivated. | Tenant / Location Framework — `QA_TenantLocationFramework.md` | `Controllers/UserManagementController.cs` lines 37–51, 172–177, 236–238, 277–283, 387–392, 428–433 |
| `GetRoles` defaults to tenant `1` when `tenantId` is not supplied, instead of the token tenant. | Tenant / Location Framework | `Controllers/UserManagementController.cs` line 392 |
| The UI falls back to tenant `1` when `storage.tenantID` is missing (`loadRoles`, delete, slideout, permission manager). | Tenant / Location Framework | `UserManagement.tsx` lines 86, 157, 432; `UserManagementSlideout.tsx` lines 77, 90, 108, 166 |
