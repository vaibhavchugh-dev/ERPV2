# QA — Employee Master

| Module | Matrix section | Bug ID prefix | Tested | Fix Tested | Confirmed Bugs | Potential Bugs | Manual Verification |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Employee Master | 2.3 | BUG-EMP | Yes | — | 11 | 4 | 6 |

Source of test cases: `QA_TEST_MATRIX.md`. Method: static trace of the actual implementation (React UI → service → Axios → .NET controller → service/repository → EF Core → SQL Server, and back). No application code, configuration or database is changed during QA. Findings that depend on deployed configuration, data or a real browser go under **Needs Manual Verification**.

Severity scale:
- **Critical**: security breach, data corruption, financial corruption, or a blocked core workflow.
- **High**: a major feature is broken or a significant security control is bypassed, with a workaround that is hard or unavailable.
- **Medium**: a feature works incorrectly in specific conditions, or a security control is weaker than configured.
- **Low**: cosmetic, minor UX, or an informational/hardening issue.

---

## Carried-Over Concerns (from `QA_Authentication.md`)

Observed while testing Authentication; root cause is in this module. Verify and log formally when this module is tested.

- Employee Master `GetProfilePic` is anonymous (matrix section 11.3); compare with BUG-AUTH-015 (legacy `User/GetProfilePic`). User records created here feed login (password hash formats, `PwdResetDate`). **Verified:** the anonymous endpoint is logged as **BUG-EMP-002**. Login feed: passwords set here are stored as PBKDF2 via `AuthService.ValidateAndApplyPasswordAsync` → `EnsurePasswordHashedAsync`, and `PwdResetDate` is set (see No Issues Found). The related session gap (removing login access or resetting the password does not revoke the refresh token) is logged as **BUG-EMP-003**.

## Confirmed Bugs

### BUG-EMP-001 — Employee save accepts any location access grant, so a site-restricted user can give themselves or others access to all sites

**Severity:** High. Location restriction is a key security control (matrix 2.3: "Location mapping controls which sites the user can access"), and it can be bypassed from a screen every user can open.

**Status:** Confirmed

**Test Area:** Location / Permissions / Tenant

**Description:**
`SaveEmployeeInternal` takes `CanAccessAllLocations`, `LocationIds`/`LocationId` and `DefaultLocationId` from the request and stores them as given. The values are not checked against the caller's own location scope, so a user limited to Site A can map an employee (including their own record) to Site B, or tick "Can work at all locations". They are not checked against the tenant's `Locations` either, so ids of another tenant's locations are written to `UserMapping`. `DefaultLocationId` is not required to be one of the mapped locations. `Role` is stored as sent, without checking that the role belongs to the tenant, and `BuildAuthUserDtoAsync` resolves the role by id without a tenant filter. The slideout shows the "Can work at all locations" checkbox, the full tenant location list and the Role list to every user who can open Employee Master. At the next login or refresh, `BuildAuthUserDtoAsync` computes `canAccessAll = IsAdminRole(...) || user.CanAccessAllLocations` and issues claims for all tenant locations.

**Steps to Reproduce:**
1. Sign in as a user mapped only to Site A (not admin, `CanAccessAllLocations = false`).
2. Open Masters → Employee Master, open your own employee record (it is in the list because you are mapped to Site A).
3. Tick "Can work at all locations" (or add Site B to the locations) and save.
4. Sign out and sign in again (or wait for a token refresh).

**Expected:**
A user can only grant location access within their own scope (matrix 11.1: "save into a non-allowed location → 403"), and location and role ids must belong to the tenant.

**Actual:**
The save succeeds. After the next login or refresh, the user's claims include every site in the tenant.

**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Masters/EmployeeMasterSlideout.tsx` line 127 (`LocationService.GetLocations` loads all tenant locations), lines 1005–1027 ("Can work at all locations" checkbox, no gating), 1029–1074 (location multi-select), 1076–1124 (starting location), 1150–1176 (role select).
* Backend: `Cimmple_API/CimmpleAPI/Controllers/EmployeeController.cs` line 506 (`employee.Role = request.Role`), lines 586–640 (location ids, `CanAccessAllLocations`, `DefaultLocationId` applied without validation). `Services/Auth/AuthService.cs` line 519 (role looked up by id only), line 530 (`canAccessAll`), lines 548–552 (claims built from the tenant's locations; other tenants' ids are dropped here, so cross-tenant ids only corrupt data).
* Database: `UserDetails.CanAccessAllLocations`, `DefaultLocationId`, `Role`; `UserMapping(userId, locationId)`.

**Root Cause:**
The save path has no authorization or referential validation for access-control fields.

**Business Impact:**
Site segregation (inventory, banks, orders by site) can be bypassed by any restricted user. Who may edit employees at all is a Roles & Permissions concern (see Cross-Module Concerns), but even with role checks, the location scope of the editor must be enforced here.

**Affected Areas:** Employee Master, Authentication claims, every site-filtered module (Bank, Inventory, Orders, Attendance).

**Recommended Fix:**
On save, reject `CanAccessAllLocations = true` unless the caller can access all locations. Reject location ids outside the caller's allowed set or outside the tenant. Require `DefaultLocationId` to be one of the mapped locations. Verify `Role` belongs to the tenant.

---

### BUG-EMP-002 — Anonymous `GET /api/Employee/GetProfilePic` serves any employee's face-enrolment photo across tenants

**Severity:** Medium. Personal and biometric-source images are exposed without authentication, and the anonymity is not needed by the UI.

**Status:** Confirmed

**Test Area:** Permissions / Tenant / API

**Description:**
`GetProfilePic` is `[AllowAnonymous]`. It loads the user by `userId` only (no tenant filter), derives the tenant from the user when `tenantId` is omitted, and returns the stored image from blob storage. The image is the same photo uploaded for Time Clock face enrolment. User ids are sequential integers, so all employee photos in all tenants can be harvested. Both UI callers (Employee slideout and the account/avatar modal) fetch it through the authenticated Axios instance with `responseType: "blob"`, so the anonymous attribute is not required. On error it returns `ex.Message`. This is the Employee-module counterpart of BUG-AUTH-015 (legacy `User/GetProfilePic`), and is confirmed rather than potential because the UI demonstrably does not depend on anonymous access.

**Steps to Reproduce:**
1. Without an Authorization header, call `GET /api/Employee/GetProfilePic?userId=1`, then `userId=2`, and so on.
2. Observe image responses for users with a photo, regardless of tenant.

**Expected:**
Authenticated, same-tenant access only (matrix 11.3 "File download across tenants … `GetProfilePic` (anonymous)" is listed as a security check).

**Actual:**
Anonymous access to any user's photo in any tenant.

**Evidence:**
* Frontend: `Cimmple_UI/src/Common/Services/EmployeeService.ts` lines 309–325 (authenticated `Instense.get`, `responseType: "blob"`); `Modules/Masters/EmployeeMasterSlideout.tsx` lines 143–154; `Common/Components/UserAccountModals.tsx` lines 68–74.
* Backend: `Cimmple_API/CimmpleAPI/Controllers/EmployeeController.cs` lines 332–397 (`[AllowAnonymous]` at 333, user by id only at 338, tenant fallback at 339, `ex.Message` at 396).
* Database: `UserDetails.ProfilePic`; blob path `ProfilePic/{tenant}/{user}`.

**Root Cause:**
The endpoint was copied from the legacy controller with its anonymous attribute.

**Business Impact:**
Exposure of employee photos (personal data, and the source images for face recognition), which is a privacy and regulatory risk.

**Affected Areas:** Employee Master, Time Clock / Attendance, account avatar.

**Recommended Fix:**
Remove `[AllowAnonymous]`, take the tenant from the token and filter the user by it, and return a generic error message.

---

### BUG-EMP-003 — Removing login access or resetting an employee's password does not end their existing sessions

**Severity:** Medium. An administrator who revokes access believes it is gone, but the user's refresh token keeps working.

**Status:** Confirmed

**Test Area:** Business Logic / Security

**Description:**
When Login Access is turned off, `SaveEmployeeInternal` clears `UserName`, `Password` and `PasswordSalt` but leaves `UserToken` (the refresh token) and `Status` unchanged. When an admin sets a new password, `ValidateAndApplyPasswordAsync` re-hashes it and sets `PwdResetDate` but does not clear `UserToken` either. `RefreshAsync` looks the user up by `UserToken` and checks only `IsUserActive` and lockout, so a signed-in user (or anyone holding the refresh token) keeps receiving new access tokens. This is distinct from BUG-AUTH-005 (no refresh-token lifetime): the issue here is that the revocation actions in this module do not revoke.

**Steps to Reproduce:**
1. Employee E signs in.
2. An admin opens E in Employee Master, turns Login Access off (or sets a new password), and saves.
3. E keeps working past the access-token lifetime; the client refreshes successfully.

**Expected:**
Turning off login access, or an admin password reset, immediately invalidates the employee's refresh token.

**Actual:**
The existing session continues; only new logins are affected.

**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Masters/EmployeeMasterSlideout.tsx` lines 770–790 (Login Access toggle), 600–610 (submit sends empty username when disabled).
* Backend: `Cimmple_API/CimmpleAPI/Controllers/EmployeeController.cs` lines 530–539 (credentials cleared, `UserToken` kept), 540–559 (password reset). `Services/Auth/AuthService.cs` lines 231–273 (`ValidateAndApplyPasswordAsync`, no token reset), 151–180 (`RefreshAsync` by `UserToken`).
* Database: `UserDetails.UserToken` unchanged.

**Root Cause:**
The refresh token is not part of the revoke path.

**Business Impact:**
Departed or compromised users retain access until they sign out themselves.

**Affected Areas:** Employee Master, Authentication.

**Recommended Fix:**
Clear `UserToken` whenever login access is removed, the password is changed by an admin, or the status becomes inactive.

---

### BUG-EMP-004 — Deleting an employee leaves their face-enrolment record, Azure Face data and photo behind

**Severity:** Medium. Biometric data is retained after the person is removed, and the impact dialog does not mention it.

**Status:** Confirmed

**Test Area:** Database / Business Logic / Cross-Module

**Description:**
`DeleteEmployee` removes workstation mappings, location mappings and the `UserDetails` row only. The `CimmplePunch.EmployeeFace` row (with `AzurePersonId` / `AzurePersistedFaceId`), the persisted face in Azure Face and the `ProfilePic/{tenant}/{user}` blob are not removed. No code anywhere deletes `EmployeeFace` rows. `FaceRecognitionService` only deletes a previous persisted face when re-enrolling. `CheckEmployeeDeletionImpact` lists job orders, workstation and location mappings, and customer/vendor orders, but not face enrolment or attendance records.

**Steps to Reproduce:**
1. Create an employee with a photo so that face enrolment succeeds ("Face enrolled for Time Clock").
2. Delete the employee.
3. Query `CimmplePunch.EmployeeFace` for that `UserUniqueId`.

**Expected:**
The employee's biometric enrolment and photo are removed (or the dialog states they are retained and why).

**Actual:**
The `EmployeeFace` row and the Azure persisted face remain; the dialog does not mention them.

**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Masters/EmployeeMasterSlideout.tsx` lines 516–574 (delete flow shows only server-provided items).
* Backend: `Cimmple_API/CimmpleAPI/Controllers/EmployeeController.cs` lines 1110–1219 (impact: no face/attendance), 1221–1255 (delete). `Services/FaceRecognitionService.cs` lines 77–98 (enrol creates/updates `EmployeeFace`; delete only on re-enrol), 222–225 (`DeletePersistedFaceAsync` is private, used only by re-enrol). A repo search finds no `EmployeeFace.Remove`.
* Database: `CimmplePunch.EmployeeFace` (unique TenantId+UserUniqueId).

**Root Cause:**
Face enrolment was added without a matching cleanup path.

**Business Impact:**
Biometric data retention beyond need (privacy regulations such as BIPA/GDPR typically require deletion), and ongoing Azure Face storage.

**Affected Areas:** Employee Master, Attendance / Time Clock, Azure Face.

**Recommended Fix:**
On delete, remove the `EmployeeFace` row, delete the Azure person/persisted face and the photo blob, and list "Face enrolment" in the impact dialog.

---

### BUG-EMP-005 — GetEmployeeById sends SSN and DOB to the browser, and any save that omits them erases them

**Severity:** Medium. Sensitive PII is exposed to every caller of the endpoint although the UI never displays it, and the API silently clears it if a client does not echo it back.

**Status:** Confirmed

**Test Area:** API / Security / Database

**Description:**
`GetEmployeeById` returns `dob` and `ssn` in plain text. The slideout has no SSN or DOB fields; it only carries the values in state so they are re-sent on save. `SaveEmployeeInternal` writes `employee.DOB = request.DOB ?? ""` and `employee.SSN = request.SSN ?? ""`. So any client that does not echo them, such as a direct `SaveEmployee` JSON call or a future form that omits them, wipes SSN and DOB that were loaded by import. The design therefore requires PII to travel to the browser for no visible purpose.

**Steps to Reproduce:**
1. Import an employee with SSN and DOB columns.
2. Open the employee; inspect the `GetEmployeeById` response in the network tab: SSN and DOB are present.
3. Call `POST /api/Employee/SaveEmployee` for that employee without `SSN`/`DOB`; reload: both are empty.

**Expected:**
Fields that the UI does not show are not returned (or are masked), and omitted fields are left unchanged on save.

**Actual:**
Full SSN/DOB are returned; omission clears them.

**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Masters/EmployeeMasterSlideout.tsx` lines 304–356 (`loadEmployee` keeps DOB/SSN in form state; no input fields render them).
* Backend: `Cimmple_API/CimmpleAPI/Controllers/EmployeeController.cs` lines 278–279 (`dob`, `ssn` returned), 522–523 (overwritten with `?? ""`).
* Database: `UserDetails.DOB`, `UserDetails.SSN`.

**Root Cause:**
The DTO mirrors the entity, and the save uses overwrite-with-default semantics.

**Business Impact:**
Unnecessary PII exposure (browser cache, devtools, logs) and silent loss of HR data.

**Affected Areas:** Employee Master, Employee import, any integration using `SaveEmployee`.

**Recommended Fix:**
Remove or mask SSN/DOB in `GetEmployeeById` unless an HR permission is present, and update them only when the request explicitly includes them.

---

### BUG-EMP-006 — Login username is always generated as firstname.lastname, so a second employee with the same name cannot be given login access

**Severity:** Medium. Login enablement is blocked for a common real-world case, and the UI offers no way to resolve it.

**Status:** Confirmed

**Test Area:** CRUD / Validation

**Description:**
When Login Access is enabled for an employee without a username, `handleSubmit` sets `UserName = firstname.lastname` (lower case, spaces removed). The slideout has no username input; it only displays "Username will be generated as firstname.lastname on save". If another user in the tenant already has that username, the API returns "Username already exists", and the user cannot pick an alternative.

**Steps to Reproduce:**
1. Create employee "John Smith" with Login Access and a password (username becomes `john.smith`).
2. Create a second employee "John Smith" (different EmpCode) with Login Access and a password.

**Expected:**
The second employee can be given a unique username (an editable field, or automatic suffixing such as `john.smith2`).

**Actual:**
The save fails with "Username already exists"; the only workarounds are importing with an explicit username or temporarily changing the employee's name.

**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Masters/EmployeeMasterSlideout.tsx` lines 589–599 (auto username), 796–805 (message, no input).
* Backend: `Cimmple_API/CimmpleAPI/Controllers/EmployeeController.cs` lines 424–433 and 467–476 (duplicate username per tenant → 400).
* Database: `UserDetails.UserName`.

**Root Cause:**
The username is derived, not entered, and collisions are not handled.

**Business Impact:**
HR cannot onboard employees who share a name with an existing user (or with a vendor-portal user whose generated username collides).

**Affected Areas:** Employee Master, login.

**Recommended Fix:**
Provide an editable username field pre-filled with the suggestion, or auto-append a numeric suffix until unique.

---

### BUG-EMP-007 — Employee code is required only in the slideout; the API and import create employees without it

**Severity:** Low. Data-consistency gap; such employees must be given a code before they can be edited in the UI.

**Status:** Confirmed

**Test Area:** Validation / Import

**Description:**
The matrix lists "FirstName, LastName, EmpCode required". The slideout enforces EmpCode, but `SaveEmployeeInternal` only checks uniqueness when it is non-empty, the import preview checks only first/last name, and `ImportEmployees` does not require it. Employees imported without a code show an empty Emp. Code (a locked list column, also used by global search and attendance screens). Opening them in the slideout then blocks saving until a code is entered.

**Steps to Reproduce:**
1. Import a row with First Name and Last Name only.
2. Open the created employee and change the phone number; press Save.

**Expected:**
EmpCode is required consistently (UI, API, import).

**Actual:**
The import creates the employee with an empty code; the slideout then refuses to save "Employee code is required".

**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Masters/EmployeeMasterSlideout.tsx` line 469 (required in UI); `EmployeeMasterImportModal.tsx` lines 200–223 (no EmpCode-required check).
* Backend: `Cimmple_API/CimmpleAPI/Controllers/EmployeeController.cs` lines 479–499 (uniqueness only when non-empty), 806–827 (import requires only first/last name).
* Database: `UserDetails.EmpCode`.

**Root Cause:**
The required rule exists only in the React form.

**Business Impact:**
Employees without codes in attendance and search; friction when editing imported records.

**Affected Areas:** Employee import and API, Attendance displays, Global search.

**Recommended Fix:**
Require EmpCode in `SaveEmployeeInternal` and `ImportEmployees` (and the import preview), or drop the UI requirement if codes are optional.

---

### BUG-EMP-008 — The Country selected for an employee is silently discarded

**Severity:** Low. Minor data loss with a visible symptom.

**Status:** Confirmed

**Test Area:** CRUD / API

**Description:**
The slideout has a Country dropdown; choosing a non-US country switches State to a free-text field. The request model has a `Country` property, but `SaveEmployeeInternal` never stores it, and `GetEmployeeById` always returns `country = "US"`. After saving, for example, Canada with province "ON", the record reloads as US with the US state dropdown, which has no "ON" option.

**Steps to Reproduce:**
1. Edit an employee, set Country to Canada and State to "ON", save.
2. Reopen the employee.

**Expected:**
Country is saved and reloaded.

**Actual:**
Country shows US; the State dropdown no longer shows the entered province.

**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Masters/EmployeeMasterSlideout.tsx` lines 1435–1455 (Country field), 1362 (State field switches on Country), 328 (loads `employee.Country`).
* Backend: `Cimmple_API/CimmpleAPI/Controllers/EmployeeController.cs` line 1317 (`Country` in request), 500–523 (not assigned), 272 (`country = "US"` hard-coded).
* Database: `UserDetails` has no country column used here.

**Root Cause:**
The field was added to the UI without storage.

**Business Impact:**
Incorrect addresses for non-US employees.

**Affected Areas:** Employee Master.

**Recommended Fix:**
Persist Country (add a column if needed), or remove the dropdown.

---

### BUG-EMP-009 — Import location assignment overwrites the employee's first location mapping and can leave a stale starting location

**Severity:** Low. Minor access-data inconsistency for multi-site employees updated by import.

**Status:** Confirmed

**Test Area:** Import / Location

**Description:**
For each row with a Location, `ImportEmployees` takes the first existing `UserMapping` of that user and changes its `locationId`, or adds one if none exist. For an employee mapped to Sites A and B, importing "Site C" replaces whichever mapping is first (for example A becomes C), without consulting the employee's other mappings. `DefaultLocationId` is not updated, so it can still point to Site A, which is no longer mapped.

**Steps to Reproduce:**
1. Map an employee to Sites A and B with starting location A.
2. Import the same employee (UpdateExisting) with Location "Site C".
3. Open the employee.

**Expected:**
Import either adds the location or replaces the full set predictably, and keeps the starting location consistent.

**Actual:**
One existing mapping is silently replaced; the starting location may reference an unmapped site.

**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Masters/EmployeeMasterImportModal.tsx` (Location column passed through).
* Backend: `Cimmple_API/CimmpleAPI/Controllers/EmployeeController.cs` lines 1035–1052 (overwrite first mapping), no `DefaultLocationId` update in the import path.
* Database: `UserMapping`, `UserDetails.DefaultLocationId`.

**Root Cause:**
The import treats location as a single value while the model supports several.

**Business Impact:**
Unexpected loss of access to a site and an invalid starting site at login.

**Affected Areas:** Employee import, location access.

**Recommended Fix:**
Add the imported location if missing (or document replace semantics), and fix `DefaultLocationId` when it is no longer mapped.

---

### BUG-EMP-010 — Unsaved employee edits are discarded without confirmation

**Severity:** Low. Minor UX/data-entry loss.

**Status:** Confirmed

**Test Area:** CRUD / Navigation

**Description:**
`isStateChanged` is tracked, but `handleDiscard` calls `onClose()` with no check. Location Master on the same pattern prompts.

**Steps to Reproduce:**
1. Open Add Employee, fill in details and select a photo.
2. Press Cancel.

**Expected:**
A confirmation when there are unsaved changes.

**Actual:**
The form closes and the input is lost.

**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Masters/EmployeeMasterSlideout.tsx` line 58 (`isStateChanged`), lines 653–655 (`handleDiscard`). Compare `LocationMasterSlideout.tsx` lines 366–374.
* Backend: not applicable.
* Database: not applicable.

**Root Cause:**
The dirty flag is not consulted on close.

**Business Impact:**
Re-entry of employee data.

**Affected Areas:** Employee Master slideout.

**Recommended Fix:**
Confirm before closing when `isStateChanged` is true.

---

### BUG-EMP-011 — Employee API error responses expose stack traces and exception messages

**Severity:** Low. Information disclosure / hardening.

**Status:** Confirmed

**Test Area:** API / Security

**Description:**
`ImportEmployees`, `CheckEmployeeDeletionImpact` and `DeleteEmployee` return `stackTrace = ex.StackTrace` on 500. The anonymous `GetProfilePic` returns `ex.Message` to unauthenticated callers.

**Steps to Reproduce:**
1. Trigger a server error during import.
2. Inspect the 500 response.

**Expected:**
A generic message; details only in server logs.

**Actual:**
The stack trace (or exception message) is returned.

**Evidence:**
* Frontend: not applicable.
* Backend: `Cimmple_API/CimmpleAPI/Controllers/EmployeeController.cs` lines 1088, 1217, 1253 (stack traces), 396 (`ex.Message` in anonymous endpoint).
* Database: not applicable.

**Root Cause:**
Debug-style error handling.

**Business Impact:**
Exposes implementation details, including to anonymous callers.

**Affected Areas:** Employee API.

**Recommended Fix:**
Log server-side and return generic messages.

---

## Potential Bugs

### BUG-EMP-012 — Employee detail, edit and delete by id ignore the caller's location scope

**Severity:** Medium. The server-side site filter on the list can be bypassed by id.

**Status:** Potential

**Test Area:** Location / API

**Description:**
`GetEmployees` applies `TryResolveListLocationFilter`, so a site-restricted user only sees employees of their sites. `GetEmployeeById`, `SaveEmployee`/`SaveEmployeeData`, `CheckEmployeeDeletionImpact` and `DeleteEmployee` filter only by id and tenant. A restricted user can open (`?open=<id>` or a direct API call), edit or delete an employee who works only at another site.

**Steps to Reproduce:**
1. As a user restricted to Site A, call `GET /api/Employee/GetEmployeeById?employeeId=<employee only at Site B>&tenantId=<tenant>` (or open `/masters/employee?open=<id>`).
2. Edit and save, or delete.

**Expected:**
403 for employees outside the caller's allowed sites, consistent with the list filter.

**Actual (expected from code):**
The record is returned and can be changed or deleted.

**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Masters/EmployeeMaster.tsx` lines 58–69 (`?open=` opens any id).
* Backend: `Cimmple_API/CimmpleAPI/Controllers/EmployeeController.cs` lines 52–86 (list scope), 226–233 (detail by id + tenant), 459–460 (update), 1115–1116 and 1226–1227 (impact/delete).
* Database: `UserDetails`, `UserMapping`.

**Root Cause:**
Location scope is applied only to the list query.

**Business Impact:**
Restricted HR/site managers can view PII of, and modify or delete, employees at other sites.

**Affected Areas:** Employee Master, location framework.

**Recommended Fix:**
Apply the same location check to detail, save and delete (an employee is in scope if mapped to, defaulting to, or all-sites when the caller is unrestricted).

**Why further verification is needed:** The matrix states only that the Employee list filters by site on the server; whether detail/edit/delete must be site-scoped for Employee Master is a product decision to confirm with `QA_TenantLocationFramework.md`.

---

### BUG-EMP-013 — Employee import can match and update a vendor-portal user

**Severity:** Low. Requires an import row whose username or email equals a vendor portal user's.

**Status:** Potential

**Test Area:** Import / Cross-Module

**Description:**
`ImportEmployees` loads all `UserDetails` of the tenant into `existing`, including vendor-portal users (`VendorId` set), whereas `GetEmployees` excludes them. Rows are matched by EmpCode, then username, then email. A row whose email equals a vendor's portal email (portal users take the vendor email) matches the portal user. With "Update existing", the import overwrites its name, status, type, role and location mapping.

**Steps to Reproduce:**
1. Enable portal access for a vendor whose email is `ap@shared.com`.
2. Import an employee row with Email `ap@shared.com`, with UpdateExisting on.

**Expected:**
Vendor-portal users are not matched by employee import.

**Actual (expected from code):**
The portal user is updated as if it were an employee (for example, Status changes can disable the vendor's portal login).

**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Masters/EmployeeMasterImportModal.tsx` (UpdateExisting option).
* Backend: `Cimmple_API/CimmpleAPI/Controllers/EmployeeController.cs` lines 770–772 (`existing` includes vendor users), 855–870 (matching), compare 55–56 (list excludes `VendorId`).
* Database: `UserDetails.VendorId`.

**Root Cause:**
The import's candidate set is not filtered like the list.

**Business Impact:**
Corrupted vendor portal accounts.

**Affected Areas:** Employee import, Vendor Portal.

**Recommended Fix:**
Exclude `VendorId` users from `existing` (but keep them in the username-conflict check).

**Why further verification is needed:** Whether the exact update fields applied to a portal user change its portal behaviour depends on the update block (lines 946–1000), which was only partly traced.

---

### BUG-EMP-014 — No server-side type or size check for the employee photo; SVG files would be served as active content by the anonymous endpoint

**Severity:** Low. Hardening; the UI already restricts files.

**Status:** Potential

**Test Area:** Validation / Security

**Description:**
The slideout restricts photos to images ≤ 5 MB, but `SaveEmployeeData` accepts any file and `TrySaveProfilePicAsync` stores it under its original name. `GetProfilePic` (anonymous, BUG-EMP-002) returns `.svg` files as `image/svg+xml`. An SVG containing script, uploaded through a direct API call, would execute if opened directly from the API origin.

**Steps to Reproduce:**
1. Call `POST /api/Employee/SaveEmployeeData` with an SVG `file` containing `<script>`.
2. Open `/api/Employee/GetProfilePic?userId=<id>` directly in a browser.

**Expected:**
The server validates image type/size and does not serve active content.

**Actual (expected from code):**
The file is stored and served as `image/svg+xml`.

**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Masters/EmployeeMasterSlideout.tsx` lines 252–286 (client checks).
* Backend: `Cimmple_API/CimmpleAPI/Controllers/EmployeeController.cs` lines 306–330 (`SaveEmployeeData`), 1257–1292 (`TrySaveProfilePicAsync`, no checks), 377–386 (`.svg` → `image/svg+xml`).
* Database: `UserDetails.ProfilePic`.

**Root Cause:**
Validation only in the client.

**Business Impact:**
Stored XSS risk on the API origin; oversized uploads.

**Affected Areas:** Employee photo, Time Clock enrolment.

**Recommended Fix:**
Validate extension, content type and size on the server; serve images with `Content-Disposition: attachment` or re-encode them.

**Why further verification is needed:** Whether the blob storage layer or a reverse proxy rewrites content types was not verified.

---

### BUG-EMP-015 — Employee save is not atomic

**Severity:** Low. Partial saves only on a mid-save database error.

**Status:** Potential

**Test Area:** API / Database

**Description:**
`SaveEmployeeInternal` commits the user row (`SaveChangesAsync` at 574) before location mappings and access flags (642), with no transaction. A failure in the second save leaves a new user without mappings, and the UI retry then fails with "Username already exists".

**Steps to Reproduce:**
1. Force a failure in the second save (for example an invalid location id if an FK exists in the target database).
2. Retry the save.

**Expected:**
All-or-nothing save.

**Actual (expected from code):**
The user exists without location mappings; the retry fails.

**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Masters/EmployeeMasterSlideout.tsx` lines 612–650.
* Backend: `Cimmple_API/CimmpleAPI/Controllers/EmployeeController.cs` lines 574 and 642 (two commits, no transaction).
* Database: `UserDetails`, `UserMapping`.

**Root Cause:**
No transaction around the multi-step save.

**Business Impact:**
Half-created employees.

**Affected Areas:** Employee create/update.

**Recommended Fix:**
Wrap the database steps in a transaction (face enrolment can remain outside it).

**Why further verification is needed:** It depends on an actual database error in the second step.

---

## Needs Manual Verification

1. **Area:** Face enrolment end to end
   **What to Test:** Upload a clear face photo, a photo with no face and a photo with two faces; then punch at the kiosk.
   **Expected:** Success toast "Face enrolled for Time Clock" for the first; a warning toast for the others, with the photo still saved; kiosk verification works only for the enrolled employee.
   **Why Manual Testing Is Required:** It needs Azure Face configuration and a camera.

2. **Area:** Admin-set passwords and forced change
   **What to Test:** Create an employee with a password and sign in as them.
   **Expected:** As per the password policy decision (the code sets `ChangePassword = "N"`, so the user is not forced to change an admin-chosen password).
   **Why Manual Testing Is Required:** Whether the first login must force a change is a policy decision not stated in the matrix.

3. **Area:** Welcome email
   **What to Test:** Create an employee with login access, a password and an email.
   **Expected:** A welcome email is queued and the toast reports it.
   **Why Manual Testing Is Required:** It depends on the email outbox configuration.

4. **Area:** Site filter with "All sites" and explicit sites
   **What to Test:** Admin vs restricted user, list with All sites and with a non-allowed site in the URL/filter.
   **Expected:** Non-allowed site → 403; "All sites" shows allowed sites only for restricted users.
   **Why Manual Testing Is Required:** It depends on real claims and the `useSiteListFilter` UI.

5. **Area:** Responsive layout
   **What to Test:** List and slideout (locations, workstations, photo) on phone and tablet widths.
   **Expected:** Usable layout.
   **Why Manual Testing Is Required:** It needs a real browser.

6. **Area:** Existing duplicate EmpCodes/usernames
   **What to Test:** Query `UserDetails` for duplicate trimmed lower-case `EmpCode` and `UserName` per tenant.
   **Expected:** None.
   **Why Manual Testing Is Required:** It needs database access; uniqueness is not backed by an index.

## No Issues Found

- Navigation: `/masters/employee`, the sidebar entry and global-search `?open=<id>` links work (`EmployeeMaster.tsx` lines 58–69).
- List: "Face Enrolled", "Login Access", role and location columns are filled from `GetEmployees`, which excludes vendor-portal users and applies `TryResolveListLocationFilter` on the server (`EmployeeController.cs` lines 52–86).
- Search (name, code, username, email, role, location), Active/Inactive filter, sorting on all columns and client pagination work.
- Validation: First and Last Name are required in UI and API. Username and EmpCode are unique per tenant, and EmpCode is compared trimmed and case-insensitively (`EmployeeController.cs` lines 424–433, 467–499). The import preview and API detect duplicate emp code, username and email inside the file.
- Login access requires a password that meets the tenant policy. The UI checks a minimum of 8 characters and confirmation, and the API enforces the full policy and history via `IAuthService`.
- Carried-over check: passwords set here are stored as PBKDF2 (`EnsurePasswordHashedAsync`), `PwdResetDate` is set, password history is trimmed, and failed-login counters are reset (`EmployeeController.cs` lines 540–580; `AuthService.cs` lines 231–273). Records created here therefore work with `/Auth/Login`.
- Face enrolment: a failed enrolment still saves the photo and returns a warning that the UI shows as a toast (`EmployeeController.cs` lines 644–676; slideout lines 621–627).
- Delete is never blocked and warns about created-by references on job orders, customer orders and vendor orders.
- `GetEmployeeById` and `GetAllRoles` filter by tenant; location names in the list are filtered by tenant.
- Workstation and location mappings are removed with the employee.

## QA Coverage

| Test Area | Tested | Result |
| --- | --- | --- |
| Navigation | Yes | Pass |
| CRUD | Yes | Fail (BUG-EMP-006, BUG-EMP-008, BUG-EMP-010; potential BUG-EMP-015) |
| Search | Yes | Pass |
| Filters | Yes | Pass (server site filter); manual item 4 |
| Sorting | Yes | Pass |
| Pagination | Yes | Pass |
| Validation | Yes | Fail (BUG-EMP-007; potential BUG-EMP-014) |
| Permissions | Yes | Fail (BUG-EMP-001, BUG-EMP-002); role enforcement is cross-module |
| API | Yes | Fail (BUG-EMP-002, BUG-EMP-005, BUG-EMP-011) |
| Database | Yes | Fail (BUG-EMP-004, BUG-EMP-005) |
| Business Logic | Yes | Fail (BUG-EMP-003, BUG-EMP-004) |
| Location | Yes | Fail (BUG-EMP-001, BUG-EMP-009; potential BUG-EMP-012) |
| Tenant | Yes | Fail (BUG-EMP-002 cross-tenant photos; BUG-EMP-001 unvalidated location/role ids) |
| Cross-Module | Yes | Fail (BUG-EMP-003 Authentication, BUG-EMP-004 Attendance; potential BUG-EMP-013 Vendor Portal) |
| Responsive/PWA | No | Manual verification required (item 5) |

## Matrix Checklist

| Matrix Row | Result | Notes |
| --- | --- | --- |
| FE List — `EmployeeMaster.tsx`, "Face Enrolled" column, GET `GetEmployees?locationId` | Pass | |
| FE Search / Sort / Pagination — client | Pass | All columns sortable. |
| FE Filter — site filter (server) | Pass | `useSiteListFilter` → `locationId`; server applies `TryResolveListLocationFilter`. |
| FE Add / Edit — login access, role, locations, workstations, photo; SaveEmployee / SaveEmployeeData; GetAllRoles | Fail | BUG-EMP-001, BUG-EMP-006, BUG-EMP-008, BUG-EMP-010. |
| FE View — slideout, GetEmployeeById, GetProfilePic | Pass with issues | Works; BUG-EMP-002, BUG-EMP-005. |
| FE Face enrolment — photo upload → faceEnrolled / faceMessage toast | Pass | Manual item 1 for live Azure check. |
| FE Delete — DeletionImpactDialog (warnings only) | Pass with issues | Never blocked as specified; omits face data (BUG-EMP-004). |
| FE Import — duplicate emp code / username / email in file | Pass with issues | In-file checks work; BUG-EMP-007, BUG-EMP-009, potential BUG-EMP-013. |
| FE Validation — FirstName, LastName, EmpCode required; login needs policy password | Pass in UI / Fail elsewhere | EmpCode not enforced by API/import (BUG-EMP-007). |
| FE Permissions — `/masters/employee` | Cross-module | No route/API gate; access-control fields editable by anyone (BUG-EMP-001). |
| FE Responsive — list, slideout | Manual | Manual item 5. |
| BE List — GetEmployees with `TryResolveListLocationFilter` | Pass | |
| BE Get — GetEmployeeById, GetProfilePic (anonymous) | Fail | BUG-EMP-002, BUG-EMP-005; potential BUG-EMP-012. |
| BE Create/Update — FaceRecognitionService, IAuthService; UserDetails, UserMapping, UserWorkstationMapping, EmployeeFace | Fail | BUG-EMP-001, BUG-EMP-003; potential BUG-EMP-014, BUG-EMP-015. |
| BE Delete — impact, delete (removes mappings) | Pass with issues | Mappings removed; face data retained (BUG-EMP-004). |
| BE Import — ImportEmployees | Pass with issues | BUG-EMP-007, BUG-EMP-009, BUG-EMP-011; potential BUG-EMP-013. |
| BE Validation — username and EmpCode unique per tenant (case-insensitive) | Pass | Username comparison relies on SQL collation (case-insensitive by default). |
| BE Authorization — authenticated; GetProfilePic anonymous | Fail | BUG-EMP-002; role checks cross-module. |
| BL — Failed face enrolment still saves the photo and warns | Pass | |
| BL — Delete never blocked; warns that created-by references are lost | Pass | |
| BL — Location mapping controls site access (`locationIds` claim) | Fail | Mapping drives claims correctly, but anyone can change it (BUG-EMP-001); import overwrite (BUG-EMP-009). |

## Cross-Module Concerns

| Concern | Owner | Affected endpoints / evidence |
| --- | --- | --- |
| The tenant id comes from the query or body and is not compared with the token's tenant. | `QA_TenantLocationFramework.md` | `GET /Employee/GetEmployees?tenantid` (`EmployeeController.cs` 47–224), `GET GetEmployeeById?tenantId` (226–298), `POST SaveEmployee` / `SaveEmployeeData` (`TenantID` in body, 300–330 → 400–731), `GET GetAllRoles?tenantid` (733–753), `POST ImportEmployees` (`Tenantid` in body, 755–1090), `GET CheckEmployeeDeletionImpact?tenantId` (1110–1219), `DELETE DeleteEmployee?tenantId` (1221–1255). |
| No server-side role/permission check: any authenticated user can create employees, assign any role (including an admin role, which grants every permission and every location per BUG-AUTH-017), set passwords and delete employees. | `QA_RolesPermissions.md` | All endpoints above; `EmployeeController.cs` line 506 (`Role` stored as sent). |
| Vendor-portal tokens are accepted by Employee Master endpoints. | `QA_VendorPortal.md` | Already listed in `QA_Authentication.md`; no `IsVendorPortal()` check in `EmployeeController`. |

