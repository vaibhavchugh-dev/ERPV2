# QA — Password Change / Reset / Policy -t

| Module | Matrix section | Bug ID prefix | Tested | Confirmed Bugs | Potential Bugs | Manual Verification |
| --- | --- | --- | --- | --- | --- | --- |
| Password Change / Reset / Policy | 1.2 | BUG-PWD | Yes | 2 | 1 | 5 |

Source of test cases: `QA_TEST_MATRIX.md`. Method: static trace of the actual implementation (React UI → service → Axios → .NET controller → service/repository → EF Core → SQL Server, and back). No application code, configuration or database is changed during QA. Findings that depend on deployed configuration, data or a real browser go under **Needs Manual Verification**.

Severity scale:
- **Critical**: security breach, data corruption, financial corruption, or a blocked core workflow.
- **High**: a major feature is broken or a significant security control is bypassed, with a workaround that is hard or unavailable.
- **Medium**: a feature works incorrectly in specific conditions, or a security control is weaker than configured.
- **Low**: cosmetic, minor UX, or an informational/hardening issue.

---

Matrix section 1.2. Flows traced: `Login/ChangePassword.tsx` → `AuthService.changePassword` → `POST /api/Auth/ChangePassword` → `AuthService.ChangePasswordAsync` / `ValidateAndApplyPasswordAsync` / `TrimPasswordHistoryAsync` → `UserDetails`, `UserPasswordHistory`; and `Modules/UserManagement/ResetPasswordModal.tsx` → `UserManagementService.ResetPassword` → `POST /api/UserManagement/ResetPassword` → same policy/history path → `IdentityEmailService.TryQueuePasswordResetNoticeAsync` → `EmailOutbox`.

Related bugs already logged elsewhere and not repeated here:
- BUG-AUTH-004: role "Reset Password Required" forces a password change on every login and refresh (the matrix Business Logic row for role `ResetPwd` fails because of it).
- BUG-AUTH-005: password expiry is evaluated only at login, not on token refresh.
- BUG-AUTH-008: "must change password" is enforced only in the browser.
- BUG-AUTH-001 / BUG-AUTH-019: anonymous legacy `User/ChangePassword` and `User/ChangePasswordNew` skip the policy.
- BUG-AUTH-020: plaintext fallback in `PasswordHasher`.
- BUG-ROLE-001: `UserManagement/ResetPassword` is callable by any authenticated user (no server-side permission check).

## Confirmed Bugs

### BUG-PWD-001 — New password may equal the current password when Password History Count is 0, so forced changes can be satisfied without changing anything

**Severity:** Medium. Admin-forced resets and password expiry become ineffective: a user can keep the administrator-issued (and possibly emailed) temporary password, or keep an expired password, indefinitely.

**Status:** Confirmed

**Test Area:** Validation / Business logic

**Description:**
The matrix lists "not equal to current" as a password validation rule for both change and reset. In `AuthService.ValidateAndApplyPasswordAsync`, the "Cannot reuse your current password" check sits inside the `if (user.User_UniqueID > 0 && settings.PasswordHistoryCount > 0)` block. System Settings allows `PasswordHistoryCount = 0` ("0 = disabled"). With that value, the current-password comparison is skipped entirely. `ChangePasswordAsync` then sets `ChangePassword = "N"` and `PwdResetDate = now`, clearing the forced-change flag and restarting the expiry clock. The frontend does not compare the new password with the current one either.

**Steps to Reproduce:**
1. System Settings → Security → Password History Count = 0 → Save.
2. User Management → Reset Password for user U, set temporary password `Temp#2026a` (optionally emailed).
3. Log in as U; you are redirected to Change Password. Enter current password `Temp#2026a`, new password `Temp#2026a`, confirm `Temp#2026a`.
4. Observe "Password updated". U is no longer forced to change the password; the administrator-known temporary password stays active. The same works for an expired password (`PasswordExpirationDays` exceeded).

**Expected:**
The new password is rejected when it equals the current password, regardless of the history setting (history only controls how many *previous* passwords are blocked).

**Actual:**
With history disabled, the same password is accepted and the forced-change / expiry state is cleared.

**Evidence:**
* Frontend: `Cimmple_UI/src/Login/ChangePassword.tsx` lines 25–35 (only policy and confirm-match checks; no new ≠ current check). `Cimmple_UI/src/Modules/Settings/SystemSettings.tsx` lines 830–852 (history count 0–10, "0 = disabled").
* Backend: `Cimmple_API/CimmpleAPI/Services/Auth/AuthService.cs` lines 237–243 (current-password check only inside `PasswordHistoryCount > 0`), lines 224–226 (`ChangePassword = "N"`, `PwdChangeStatus = "Changed"`), line 271 (`PwdResetDate = DateTime.UtcNow`). `Controllers/UserManagementController.cs` lines 334–339 (admin reset uses the same method, so an admin can also "reset" to the existing password).
* Database: `UserDetails.ChangePassword`, `UserDetails.PwdResetDate`, `UserDetails.Password` (unchanged hash value semantics).

**Root Cause:**
The "not equal to current" rule was implemented as part of the history feature instead of as an independent rule.

**Business Impact:**
Password expiry and admin resets (the main recovery action after a suspected compromise) can be bypassed by re-entering the same password.

**Affected Areas:** Change Password (1.2), Admin Reset (1.2), System Settings Security tab (1.5), Authentication expiry logic (1.1).

**Recommended Fix:**
Move the current-password comparison out of the history block so it always runs on user-initiated changes (and optionally on admin resets), and add the same check to the Change Password form for immediate feedback.

---

### BUG-PWD-002 — Frontend and backend password rules disagree for non-ASCII characters and whitespace-only passwords

**Severity:** Low. The server remains the final check and its message is shown, but the UI can approve passwords the server rejects (and vice versa), and an API caller can set a whitespace-only password.

**Status:** Confirmed

**Test Area:** Validation

**Description:**
The two policy implementations use different character classes:
- Uppercase/lowercase/number: the frontend uses ASCII regexes (`/[A-Z]/`, `/[a-z]/`, `/[0-9]/`); the backend uses Unicode `char.IsUpper`, `char.IsLower`, `char.IsDigit`. A password whose only uppercase letter is `É` fails in the UI but passes on the server.
- Special character: the frontend treats anything outside `[A-Za-z0-9]` as special (so `ö`, `é` count); the backend requires a character that is not `char.IsLetterOrDigit` (so `ö`, `é` do not count). `Passwörd12` passes the UI check and is then rejected by the server with "Password must contain a special character".
- Empty check: the frontend rejects whitespace-only input (`!password.trim()`); the backend only checks `string.IsNullOrEmpty`, so `"        "` (8 spaces) is accepted by `POST /Auth/ChangePassword` when complexity flags are off (space also satisfies "special character" on the server).

**Steps to Reproduce:**
1. Enable "Require special characters" in System Settings.
2. Change Password with new password `Passwörd12`. The UI accepts it; the server returns 400 "Password must contain a special character".
3. Disable all complexity flags, then call `POST /api/Auth/ChangePassword` directly with `{"currentPassword":"<current>","newPassword":"        "}`. Response 200.

**Expected:**
One rule set, applied identically in the UI and API (matrix: same rule enforced in FE and BE).

**Actual:**
The rule sets differ for non-ASCII letters and whitespace.

**Evidence:**
* Frontend: `Cimmple_UI/src/Common/Utils/passwordPolicy.ts` lines 28–41.
* Backend: `Cimmple_API/CimmpleAPI/Services/Auth/AuthService.cs` lines 296–333 (`IsNullOrEmpty`, `char.IsUpper/IsLower/IsDigit`, `password.All(char.IsLetterOrDigit)`).
* Database: n/a.

**Root Cause:**
Two independent implementations of the policy with different character definitions.

**Business Impact:**
Confusing feedback for users with non-English keyboards; whitespace-only passwords possible through the API.

**Affected Areas:** Change Password, Admin Reset, Employee Master and Vendor Master portal passwords (they call the same backend policy).

**Recommended Fix:**
Align the definitions (for example ASCII-only classes on both sides, or Unicode classes on both sides), and reject whitespace-only passwords on the server.

---

## Potential Bugs

### BUG-PWD-003 — Emailed temporary passwords are stored in plaintext in the email outbox table indefinitely

**Severity:** Low. Hardening issue: anyone with read access to the database (or its backups) can read recent temporary passwords.

**Status:** Potential

**Test Area:** Database / Security

**Description:**
When "Email temporary password to user" is checked, `IdentityEmailService.TryQueuePasswordResetNoticeAsync` builds an HTML body containing the plaintext temporary password and `EmailOutboxService.EnqueueAsync` saves it in `EmailOutbox.Body`. After sending, the row is only marked `Sent`; no code clears the body or deletes old rows.

**Steps to Reproduce:**
1. Reset a user's password with the email option checked.
2. Query `SELECT Body FROM EmailOutbox ORDER BY CreatedUtc DESC`.
3. The temporary password is visible in plaintext, including after the email was sent.

**Expected:**
Secrets are not retained after delivery (body cleared or row purged once sent).

**Actual:**
The plaintext body is kept.

**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/UserManagement/ResetPasswordModal.tsx` lines 31, 168–181 (email option, default on when an email exists).
* Backend: `Controllers/UserManagementController.cs` lines 347–360; `Services/IdentityEmailService.cs` lines 137–147 (password in body); `Services/EmailOutboxService.cs` lines 78–97 (body persisted), 160–180 (sent rows kept). A repository search finds no delete or body-clearing logic for `EmailOutbox`.
* Database: `EmailOutbox.Body`.

**Root Cause:**
The outbox is a generic durable queue with no retention policy for sensitive content.

**Business Impact:**
Temporary passwords remain readable; combined with BUG-PWD-001 they may remain the user's actual password.

**Affected Areas:** Password reset, Employee welcome email and vendor portal invite (same pattern).

**Recommended Fix:**
Clear or redact `Body` after a successful send (or after N days), or send a one-time reset link instead of the password.

**Why further verification is needed:** Retention may be handled outside the application (database job or policy); confirm with operations.

---

## Needs Manual Verification

1. **Area:** Policy hints right after login
   - **What to Test:** Configure a non-default policy (for example minimum length 12 and special characters required). Log in as a user with `ChangePassword = 'Y'` in a fresh browser and look at the hint text on `/change-password` before typing.
   - **Expected:** The hint shows the tenant policy (12 characters, special character).
   - **Why Manual Testing Is Required:** The hint is computed at render from `getCachedSettings()`, which is filled asynchronously by `refreshSettings()` after login (`Login/Login.tsx` line 57). The first render may show defaults until the next re-render; timing depends on the network.

2. **Area:** Reset email delivery and content
   - **What to Test:** Reset with the email box checked in Hosted and in Custom mode; with email notifications disabled; for a user without email.
   - **Expected:** Email received with username and temporary password; with notifications disabled the UI shows "Password was reset, but email failed: Email notifications are disabled…"; checkbox disabled without email.
   - **Why Manual Testing Is Required:** Requires a real SMTP server and the background outbox worker.

3. **Area:** Expiry for users without `PwdResetDate`
   - **What to Test:** As in `QA_Authentication.md` Manual Verification item 3, but also check that after an admin reset the expiry clock starts (the reset sets `PwdResetDate`).
   - **Expected:** Business decision for null dates; reset users get a fresh expiry window.
   - **Why Manual Testing Is Required:** Depends on existing data.

4. **Area:** Lockout cleared by admin reset
   - **What to Test:** Lock a user (exceed Failed Login Attempts), then reset their password from User Management and log in with the temporary password immediately.
   - **Expected:** Login succeeds (reset clears `FailedLoginCount` and `LockoutEndUtc`) and the user is sent to Change Password.
   - **Why Manual Testing Is Required:** Code looks correct (`UserManagementController.cs` lines 339–342); confirm end to end.

5. **Area:** Responsive change-password page and reset modal
   - **What to Test:** `/change-password` and the Reset Password modal at 375, 390, 430 and 768 px; keyboard overlap; show/hide toggles; Esc and backdrop close of the modal while saving.
   - **Expected:** Usable without horizontal scroll; Esc/backdrop ignored while saving.
   - **Why Manual Testing Is Required:** Visual.

## No Issues Found

- `POST /Auth/ChangePassword` requires a bearer token, identifies the user from the token (not the body), and verifies the current password before applying the new one (`AuthController.cs` lines 200–217; `AuthService.cs` lines 209–217).
- Change password sets `ChangePassword = "N"` and `PwdChangeStatus = "Changed"`, stores the previous hash in `UserPasswordHistory` and trims history to `PasswordHistoryCount` (`AuthService.cs` lines 224–228, 258–267, 275–291).
- History check compares the new password against the most recent `PasswordHistoryCount` entries plus the current hash when history is enabled (`AuthService.cs` lines 237–255).
- Admin reset validates the tenant policy, applies history, sets `ChangePassword = "Y"`, resets `FailedLoginCount`, clears `LockoutEndUtc` and `UserToken` (`UserManagementController.cs` lines 311–345).
- Reset rejects an empty password server-side (`IsNullOrWhiteSpace`, line 311) and returns the policy message as a 400 that the modal displays (`ResetPasswordModal.tsx` lines 96–101).
- The email checkbox is disabled and unchecked when the user has no email (`ResetPasswordModal.tsx` lines 39, 171); the API also reports "user has no email on file" if called directly (lines 368–371).
- Email-disabled tenants: the reset still succeeds and the response explains why no email was sent (outbox gate in `EmailOutboxService.cs` lines 54–60).
- Password expiry: login sets `ChangePassword = "Y"` when `PwdResetDate + PasswordExpirationDays` is in the past; `0` disables expiry (`AuthService.cs` lines 380–386).
- Change Password page error toast surfaces the server message (`ChangePassword.tsx` line 47); confirm-password mismatch is caught client-side.
- New and changed passwords are hashed with PBKDF2-SHA256 (100k iterations, random salt) via `EnsurePasswordHashedAsync`.
- Vendor portal password set from Vendor Master uses the same backend policy and history (`VendorController.cs` lines 344–353).
- `/change-password` redirects to `/login` when there is no session (`ChangePassword.tsx` lines 53–56).

## QA Coverage

| Test Area | Tested | Result |
| --- | --- | --- |
| Navigation | Yes | Pass (forced redirect to `/change-password`; landing after change). Role-flag loop is BUG-AUTH-004 |
| CRUD | Partial | Pass. Only password update (change/reset) applies |
| Search | N/A | No search in this module |
| Filters | N/A | No filters in this module |
| Sorting | N/A | No sorting in this module |
| Pagination | N/A | No pagination in this module |
| Validation | Yes | Fail (BUG-PWD-001, BUG-PWD-002) |
| Permissions | Yes | Fail via BUG-ROLE-001 (reset callable by any authenticated user); forced-change enforcement is BUG-AUTH-008 |
| API | Yes | Pass (verbs, payloads, 400 messages) |
| Database | Yes | Pass for history/flags; Potential (BUG-PWD-003) |
| Business Logic | Yes | Fail (BUG-PWD-001; role flag BUG-AUTH-004) |
| Location | N/A | Passwords are not location-scoped |
| Tenant | Yes | Reset trusts a body `tenantId` (see Cross-Module Concerns) |
| Cross-Module | Yes | System Settings policy is read correctly; Role `ResetPwd` is BUG-AUTH-004; Vendor Master uses the same policy |
| Responsive/PWA | No | Manual (item 5) |

## Matrix Checklist

| Matrix Row | Result | Notes |
| --- | --- | --- |
| FE — Change password (`ChangePassword.tsx`, `/change-password`, POST `/Auth/ChangePassword`) | Fail | Works end to end; new = current accepted when history is 0 (BUG-PWD-001) |
| FE — Forced change redirect (`ProtectedLayout.tsx`, any → `/change-password`, GET `/Auth/Me`) | Pass | Redirect reads `storage.mustChangePassword` (`ProtectedLayout.tsx` lines 31–35); it does not call `/Auth/Me`. Client-only enforcement is BUG-AUTH-008 |
| FE — Admin reset (`ResetPasswordModal.tsx`, POST `/UserManagement/ResetPassword`) | Pass | Policy, confirm match and server message handled. Server-side permission missing (BUG-ROLE-001) |
| FE — Email temp password (checkbox disabled without email) | Pass | Default on when email exists; disabled otherwise. Plaintext retention is BUG-PWD-003 (Potential) |
| FE — Validation (`passwordPolicy.ts`: min length, upper, lower, number, special; confirm match; settings cached) | Fail | FE/BE character classes differ (BUG-PWD-002); hint timing after login is Manual item 1 |
| FE — Permissions (page reachable only when logged in) | Pass | Redirects to `/login` without a session |
| FE — Responsive (page and modal) | Manual | Item 5 |
| BE — Change (`AuthController` POST `Auth/ChangePassword`, `ChangePasswordAsync`, `ValidatePasswordAgainstPolicy`) | Fail | BUG-PWD-001 |
| BE — Reset (`UserManagementController` POST `ResetPassword`, policy, email outbox) | Pass | Policy, history, flags and email OK; permission gap BUG-ROLE-001; tenant from body (Cross-Module) |
| BE — Validation (policy, current password required, not equal to current, not in last `PasswordHistoryCount`) | Fail | "Not equal to current" skipped when history is 0 (BUG-PWD-001); whitespace-only accepted (BUG-PWD-002) |
| BE — Authorization (authenticated only) | Pass | Matches matrix; but authenticated-only is itself the issue logged as BUG-ROLE-001 for the reset endpoint |
| BL — Change sets `ChangePassword="N"`, `PwdChangeStatus="Changed"`, records history, trims | Pass | History recorded only when `PasswordHistoryCount > 0` (by design per settings label) |
| BL — Admin reset sets `ChangePassword="Y"`, resets `FailedLoginCount`, clears `LockoutEndUtc` and `UserToken` | Pass | `UserManagementController.cs` lines 339–342 |
| BL — Role `ResetPwd = Y` forces change at every login; does changing clear it? | Fail | Not cleared: BUG-AUTH-004 |
| BL — Password expiry sets `ChangePassword="Y"` when `PwdResetDate + PasswordExpirationDays` is past | Pass | Not re-evaluated on refresh (BUG-AUTH-005); null dates are Manual item 3 |

## Cross-Module Concerns

| Concern | Root-cause module/file | Evidence |
| --- | --- | --- |
| `POST /UserManagement/ResetPassword` uses `resetDto.TenantId` from the body whenever it is greater than 0, and only falls back to the token tenant otherwise. Any authenticated user can reset a password of a user in another tenant by sending that tenant's id. | Tenant / Location Framework — `QA_TenantLocationFramework.md` | `Controllers/UserManagementController.cs` lines 316–319 |
| `ResetPasswordModal` falls back to tenant `1` when `storage.tenantID` is missing. | Tenant / Location Framework | `Modules/UserManagement/ResetPasswordModal.tsx` lines 75–76 |
