# QA — Authentication

| Module | Matrix section | Bug ID prefix | Tested | Confirmed Bugs | Potential Bugs | Manual Verification |
| --- | --- | --- | --- | --- | --- | --- |
| Authentication & Session | 1.1 | BUG-AUTH | Yes | 8 | 11 | 9 |

Source of test cases: `QA_TEST_MATRIX.md`. Method: static trace of the actual implementation (React UI → service → Axios → .NET controller → service/repository → EF Core → SQL Server, and back). No application code, configuration or database was changed. Findings that depend on deployed configuration, data or a real browser are listed under **Needs Manual Verification**.

Severity scale:
- **Critical**: security breach, data corruption, financial corruption, or a blocked core workflow.
- **High**: a major feature is broken or a significant security control is bypassed, with a workaround that is hard or unavailable.
- **Medium**: a feature works incorrectly in specific conditions, or a security control is weaker than configured.
- **Low**: cosmetic, minor UX, or an informational/hardening issue.

---

Matrix section 1.1 (Login / Logout / Refresh / Idle / Maintenance). Includes the legacy anonymous `UserController` auth endpoints, which are still routable even though the React app no longer calls them (only `GET /User/UnderMaintenance` is still used).

## Confirmed Bugs

### BUG-AUTH-001 — Anonymous legacy ChangePassword lets anyone reset any user's password and returns the user's secrets

**Severity:** Critical. Account takeover of any user in any tenant without authentication, plus exposure of password hash, refresh token, SSN and DOB.

**Status:** Confirmed

**Test Area:** Permissions / API / Security

**Description:**
`POST /api/User/ChangePassword` is `[AllowAnonymous]`. It looks up a user only by `userName` (first match across all tenants) and overwrites the password with the value supplied in the body. It does not ask for the current password, applies no password policy or history, and does not filter by tenant. The response body returns the full tracked `UserDetail` entity. `UserDetail` has no `[JsonIgnore]` attributes, so the response includes `password`, `passwordSalt`, `userToken` (the active refresh token), `ssn`, `searchSSN`, `dob` and the other personal fields.

**Steps to Reproduce:**
1. Without any Authorization header, send `POST /api/User/ChangePassword` with body `{"userName":"<victim username>","password":"Attacker#123"}`.
2. Observe a 200 response, `{ statusCode:200, success:true, message:"Success", result:{ ...full user row... } }`.
3. Use `result.userToken` with `POST /api/Auth/Refresh` `{ "refreshToken": "<userToken>" }`. You receive a full ERP access token for the victim. Alternatively, log in through `POST /api/User/Login` with the new password.

**Expected:**
Changing a password requires an authenticated caller who either is the account owner (and supplies the current password) or is an authorized administrator. Responses never contain password hashes, refresh tokens or SSNs.

**Actual:**
Anonymous password overwrite for any username. The response leaks credentials and PII.

**Evidence:**
* Frontend: not called by the UI (no reference to `/User/ChangePassword` in `Cimmple_UI/src`); the endpoint is reachable directly.
* Backend: `Cimmple_API/CimmpleAPI/Controllers/UserController.cs` lines 146–152 (`[HttpPost("ChangePassword")] [AllowAnonymous]`, returns `new JsonResponse(200, true, "Success", response)`). `Cimmple_API/CimmpleAPI/Data/Repositories/UserRepository.cs` lines 170–185 (`FirstOrDefault(x => x.UserName == changePassword.userName)`, `PasswordHelper.GenerateHashedPassword`, returns `user`).
* Database: `UserDetails.Password`, `PwdResetDate` and `PwdChangeStatus` are overwritten. `Cimmple_API/CimmpleAPI/Data/Models/UserDetail.cs` lines 16, 23, 24, 33, 59 (`Password`, `UserToken`, `PasswordSalt`, `SSN`, `SearchSSN`) have no serialization exclusion.

**Root Cause:**
A legacy endpoint was left anonymous and returns the EF entity directly instead of a DTO.

**Business Impact:**
Full account takeover, including administrators (who get every permission and every location), in every tenant. Employee SSN/DOB disclosure is a regulatory issue. Separately, the new hash is written in the legacy `hash|salt` format. `/Auth/Login` (`PasswordHasher`) does not recognise that format and treats it as plaintext, so the victim can no longer sign in with their password (see BUG-AUTH-020).

**Affected Areas:** Authentication, Password Change (1.2), Employee Master (2.3, user PII), every module reachable with a stolen session.

**Recommended Fix:**
Remove the legacy endpoint, or require authentication plus current-password verification and the tenant-scoped policy path (`AuthService.ChangePasswordAsync`). Never return entities; return a minimal DTO.

---

### BUG-AUTH-002 — Anonymous legacy AutoLogin issues a JWT for any username without a password

**Severity:** Critical. Authentication bypass: an attacker who knows a username gets an API token valid for 100 hours.

**Status:** Confirmed. This is code-level confirmation under the documented configuration; the deployed `TokenConfig` must be checked (see Manual Verification, item 1).

**Test Area:** Permissions / API / Security

**Description:**
`POST /api/User/AutoLogin` is `[AllowAnonymous]`. Its only gate is that the body field `token` is non-empty; the value itself is never validated. It then calls `UserRepository.AutoAuthenticate`, which delegates to `Authenticate(...)`. That method only checks that the username exists with status `Active` or `Incomplete` and has a role row; it never verifies the password. The controller then signs a JWT (`CreateToken`) valid for 6000 minutes.

The legacy token is signed with `Encoding.ASCII.GetBytes(TokenConfig:Key)` and the configured `Issuer`/`Audience`. `Program.cs` validates bearer tokens with the same key bytes (UTF-8 of the same ASCII key) and the same issuer/audience whenever `TokenConfig:Key` is at least 32 characters and `Issuer`/`Audience` are set. The shipped `appsettings.example.json` key is 47 characters and sets both. The token carries `tenantid` and `sub` claims, which `ApiBaseController.GetTenantId()` / `GetUserId()` resolve (claim-type lookup is case-insensitive, and `sub` is checked explicitly).

**Steps to Reproduce:**
1. Send `POST /api/User/AutoLogin` with body `{"userName":"<any active username>","token":"x"}` (no password).
2. Observe `{ success:true, token:"<jwt>", expirationTime:<now+100h>, user:{...} }`.
3. Call any `[Authorize]` ERP endpoint (for example `GET /api/Customer/GetCustomerById?customerId=1&tenantId=<tenant>`) with `Authorization: Bearer <jwt>`. It is accepted.

**Expected:**
No token is issued without valid credentials.

**Actual:**
A token is issued for any active username without a password.

**Evidence:**
* Frontend: not used by the UI (no `/User/AutoLogin` reference in `Cimmple_UI/src`).
* Backend: `Controllers/UserController.cs` lines 90–128 (AutoLogin), 32 (`LoginTokenDurationMinutes = "6000"`), 224–255 (`CreateToken`: ASCII key, `tokenConfig["Issuer"]`, `tokenConfig["Audience"]`). `Data/Repositories/UserRepository.cs` lines 46–146 (`Authenticate` never checks the password), 148–151 (`AutoAuthenticate` → `Authenticate`), 209–214 (`VerifyUser`: Active/Incomplete). `Program.cs` lines 114–139 (validation key/issuer/audience), 142–147 (fallback policy = any authenticated user). `appsettings.example.json` lines 5–8.
* Database: a `UserInfo` row with `LogInStatus=1` is inserted (UserRepository lines 113–121).

**Root Cause:**
The legacy auto-login path was kept and shares the signing key, issuer and audience with the new JWT pipeline, but has no credential check.

**Business Impact:**
Any user can be impersonated by anyone who knows or guesses a username. The token has no `canAccessAllLocations`/`locationIds` claims, so location-scoped endpoints may refuse it. Tenant-scoped endpoints (most of the API) accept it.

**Affected Areas:** All API modules.

**Recommended Fix:**
Remove the legacy AutoLogin/Login endpoints, or give them a separate signing key/audience that the main bearer scheme rejects. Never issue tokens without verified credentials.

---

### BUG-AUTH-003 — Legacy User/Login bypasses lockout, vendor-account block, session limits and password expiry

**Severity:** High. Brute-force protection and several login policies can be bypassed through a second, still-active login endpoint.

**Status:** Confirmed (same configuration dependency as BUG-AUTH-002).

**Test Area:** Permissions / Business logic / API

**Description:**
`POST /api/User/Login` (anonymous) authenticates with `UserRepository.AuthenticateUser` (legacy PBKDF2-SHA512 `hash|salt` format) and issues the same 100-hour legacy JWT. Compared with `POST /api/Auth/Login`, it:
- never increments `FailedLoginCount` and never checks `LockoutEndUtc`, so password guessing is unlimited;
- does not block vendor-portal accounts (`VendorId > 0`) from getting an ERP token;
- ignores `MaxConcurrentSessions`;
- ignores the tenant `PasswordExpirationDays` and `ChangePassword` flag (it only applies a hard-coded "role ResetPwd + 90 days" rule);
- uses `SingleOrDefault` across all tenants, so the same username in two tenants throws a 500;
- reveals the username in the failure message ("Incorrect password entered for {userName}").

**Steps to Reproduce:**
1. Configure `FailedLoginAttempts = 3` in System Settings.
2. Send ten wrong-password requests to `POST /api/User/Login` for an active user. None are locked out, and `/Auth/Login` still accepts the user afterwards.
3. With a vendor-portal user's credentials (legacy-hash users only), call `/api/User/Login`. An ERP JWT is returned, whereas `/Auth/Login` returns 403.

**Expected:**
Every credential-accepting endpoint applies the same lockout, account-type and expiry rules as `/Auth/Login`.

**Actual:**
The legacy endpoint applies none of them.

**Evidence:**
* Frontend: not used by the UI.
* Backend: `Controllers/UserController.cs` lines 43–88. `Data/Repositories/UserRepository.cs` lines 32–44 (`AuthenticateUser`, `SingleOrDefault(UserName == ... && Status == "Active")`, no lockout), 72–82 (legacy expiry). Compare `Services/Auth/AuthService.cs` lines 61–70 (tenant and vendor checks) and 346–393 (lockout, expiry, sessions).
* Database: `UserDetails.FailedLoginCount` / `LockoutEndUtc` are never touched by this path.

**Root Cause:**
The parallel legacy login implementation was not removed after the new `AuthController` flow was introduced.

**Business Impact:**
Brute-force attacks against legacy-hashed accounts; vendor users obtaining internal ERP access; password-expiry policy not enforced.

**Affected Areas:** Authentication, System Settings (security policies), Vendor Portal.

**Recommended Fix:**
Remove or disable the legacy endpoint, or route it through `AuthService.LoginAsync`.

---

### BUG-AUTH-005 — Refresh tokens never expire, and password expiry is not re-evaluated on refresh

**Severity:** Medium. A session can be extended indefinitely, contrary to configuration, and an exfiltrated refresh token stays valid until the user's next login or logout.

**Status:** Confirmed

**Test Area:** API / Business logic / Security

**Description:**
`TokenConfig:RefreshTokenDays` (default 7, present in `appsettings.example.json`) is never read anywhere. The refresh token is a random string stored in `UserDetails.UserToken` with no issue or expiry timestamp. `RefreshAsync` accepts it as long as the user is active and not locked. Idle logout (`SessionKeepAlive`) clears only the browser's copy; it does not call `/Auth/Logout`, so the server-side token stays valid. Password expiry (`PwdResetDate + PasswordExpirationDays`) is evaluated only in `AuthenticateUserAsync` (login), not in `RefreshAsync`. A user who keeps a tab active is never prompted when the password expires.

**Steps to Reproduce:**
1. Log in and copy `refreshToken` from localStorage.
2. Let the UI idle out (the session timeout clears localStorage; no server call is made).
3. Days later, `POST /api/Auth/Refresh {"refreshToken":"<copied>"}` returns a new access token (assuming the user has not logged in since).

**Expected:**
Refresh tokens honour a maximum lifetime (`RefreshTokenDays`), are revoked on idle logout, and refresh re-checks password expiry.

**Actual:**
The token has no lifetime and no revocation on idle; expiry is checked only at login.

**Evidence:**
* Frontend: `Common/Components/SessionKeepAlive.tsx` lines 55–74 (idle → `clearSession` only), 115–118.
* Backend: `Services/Auth/TokenConfigOptions.cs` line 11 (`RefreshTokenDays = 7` defined; a repo-wide search finds no use). `Services/Auth/AuthService.cs` lines 151–180 (`RefreshAsync`: no expiry check), 380–386 (expiry only at login), 493–494 (token stored without a timestamp).
* Database: `UserDetails.UserToken` has no companion expiry column.

**Root Cause:**
The refresh-token lifetime option was never implemented; idle logout is client-only.

**Business Impact:**
Weaker session security than the System Settings / configuration imply; password-expiry policy can be sidestepped by staying active.

**Affected Areas:** Authentication, System Settings (Password Expiration), Password policy (1.2).

**Recommended Fix:**
Store a refresh-token expiry (and ideally a hash of the token), enforce `RefreshTokenDays`, call `/Auth/Logout` on idle logout, and re-evaluate expiry in `RefreshAsync`.

---

### BUG-AUTH-006 — Max Concurrent Sessions setting is ineffective, and logout on one device ends refresh on all devices

**Severity:** Medium. A System Settings security option does not behave as configured, and multi-device users are logged out unexpectedly.

**Status:** Confirmed

**Test Area:** Business logic / Database / Cross-module (System Settings)

**Description:**
`EnforceConcurrentSessionsAsync` only marks older `UserInfo` rows `LogInStatus = 0`. Nothing in the API checks `LogInStatus` when validating access or refresh tokens, so "terminated" sessions keep working until their access token expires.

Conversely, the refresh token lives in a single column, `UserDetails.UserToken`, and every login overwrites it. Whatever the setting (1–10, default 3), only the most recent login can refresh. Every other device is logged out when its access token expires (`SessionKeepAlive` → `redirectToLogin("session")`).

`LogoutAsync` clears `UserToken` and all sessions, so logging out on one device also kills refresh on every other device.

**Steps to Reproduce:**
1. System Settings → Max Concurrent Sessions = 3; Session Timeout = 5 minutes.
2. Log in on browser A, then on browser B as the same user.
3. Keep browser A active. When its token nears expiry, its refresh fails with "Invalid refresh token" and A is sent to the login page, although only 2 of 3 sessions are in use.
4. Alternatively, set the limit to 1, log in on A, then on B. A continues to work until its access token expires.

**Expected:**
Up to N sessions can stay signed in. Once the limit is exceeded, the oldest session ends; logout ends only the current session.

**Actual:**
Effectively one refreshable session. Older sessions are not cut off immediately, and logout affects all devices.

**Evidence:**
* Frontend: `Modules/Settings/SystemSettings.tsx` lines 885–890 (Max Concurrent Sessions 1–10). `Common/Components/SessionKeepAlive.tsx` lines 128–137.
* Backend: `Services/Auth/AuthService.cs` lines 427–444 (marks `LogInStatus = 0` only), 493–494 (single `UserToken` overwritten), 158 (refresh lookup by `UserToken`), 182–197 (logout clears token and all sessions). No `LogInStatus` check exists in the JWT pipeline (`Program.cs` lines 122–147).
* Database: `UserInfo.LogInStatus`; `UserDetails.UserToken` (one value per user). `Data/Models/SystemSettings.cs` line 36 (`MaxConcurrentSessions = 3`).

**Root Cause:**
Session tracking (`UserInfo`) is not linked to the tokens, and the refresh token is stored per user rather than per session.

**Business Impact:**
Users who work on a desktop and the mobile PWA get logged out repeatedly; administrators cannot actually restrict sessions.

**Affected Areas:** Authentication, System Settings (1.5), PWA (multi-device use).

**Recommended Fix:**
Store refresh tokens per session (a session table keyed by session id, embedded in the JWT), validate the session on refresh (optionally on each request), and make logout revoke only the current session.

---

### BUG-AUTH-007 — An idle background tab logs out the tab the user is actively using

**Severity:** Medium. The user loses their session (and possibly unsaved form data) while actively working.

**Status:** Confirmed

**Test Area:** Business logic / Navigation / Responsive-PWA (multi-tab)

**Description:**
`SessionKeepAlive` tracks activity in a per-tab `useRef` (`lastActivityRef`) with listeners on that tab's `window` only. Each tab runs its own 30-second idle check. When a background tab's own idle time exceeds the Session Timeout, it calls `AuthService.clearSession("erp")`. That clears the shared localStorage token and refresh token, so the active tab's next request gets a 401, cannot refresh, and is redirected to `/login`.

**Steps to Reproduce:**
1. System Settings → Session Timeout = 5 minutes.
2. Open the ERP in tab A and tab B. Work continuously in tab A only, for more than 5 minutes.
3. When tab B's idle check fires, tab A's next action redirects to the login page (tab B shows "You have been logged out due to inactivity").

**Expected:**
Activity in any tab keeps the session alive (activity shared across tabs).

**Actual:**
Any idle tab ends the session for all tabs.

**Evidence:**
* Frontend: `Common/Components/SessionKeepAlive.tsx` lines 30–52 (per-tab activity listeners), 110–118 (idle check), 55–74 (`clearSession("erp")` clears shared localStorage). `Common/Services/Axios-config.ts` lines 143–158 (401 → refresh fails → `forceRedirectToLogin`).
* Backend: none.
* Database: none.

**Root Cause:**
The last-activity timestamp is not shared across tabs (for example via localStorage or a BroadcastChannel).

**Business Impact:**
Unexpected logouts for users who keep several ERP tabs open, which is common for ERP work; possible loss of unsaved entries.

**Affected Areas:** All modules (session layer).

**Recommended Fix:**
Store the last-activity time in localStorage (or broadcast it) and have each tab use the most recent value before logging out.

---

### BUG-AUTH-008 — "Must change password" is enforced only in the browser; the API remains fully usable

**Severity:** Medium. Expired-password and admin-forced reset policies can be bypassed.

**Status:** Confirmed

**Test Area:** Permissions / API

**Description:**
When `mustChangePassword` is true, `/Auth/Login` still returns a full access token and refresh token with all permissions and locations. The only enforcement is `ProtectedLayout` reading `storage.mustChangePassword` from localStorage. Editing localStorage, or calling the API directly with the issued token, gives full access without changing the password.

**Steps to Reproduce:**
1. Set a user's `ChangePassword = 'Y'` (or let the password expire) and log in. You are redirected to `/change-password`.
2. In DevTools, edit localStorage `storage.mustChangePassword` to `false` and reload. The app opens normally.
3. Alternatively, call any API with the returned `accessToken`. The request succeeds.

**Expected:**
Until the password is changed, the token only allows the change-password (and logout) operations.

**Actual:**
The token has full privileges.

**Evidence:**
* Frontend: `Common/Components/ProtectedLayout.tsx` lines 31–35; `Common/Services/AuthService.ts` line 68.
* Backend: `Services/Auth/AuthService.cs` lines 380–386 and 396–399 (normal token issued even when `ChangePassword = "Y"`), 667–700 (no claim restricting scope). `Program.cs` lines 142–147 (no policy uses it).
* Database: `UserDetails.ChangePassword`.

**Root Cause:**
No server-side "password change pending" claim or policy.

**Business Impact:**
Password expiry and forced-reset controls are cosmetic.

**Affected Areas:** Authentication, Password policy (1.2).

**Recommended Fix:**
Issue a restricted token (for example a `pwdChangeRequired` claim) and add an authorization policy that only allows `/Auth/ChangePassword`, `/Auth/Logout` and `/Auth/Me` while it is set.

---

### BUG-AUTH-009 — Maintenance mode can never activate, and the redirect target route does not exist

**Severity:** Low. The feature is non-functional; there is no data or security impact today.

**Status:** Confirmed

**Test Area:** Navigation / Error handling

**Description:**
`GET /User/UnderMaintenance` always returns `0` (`UserRepository.IsUnderMaintenance()` is hard-coded), and no backend code returns `message: "under maintenance"`, which the Axios interceptor checks for. Even if either path triggered, the UI navigates to `/Under-Maintenance`, which is not defined in `App.tsx` or `protectedRoutes`. It would fall through to `ProtectedLayout`, redirect an unauthenticated user to `/login`, and `Login` would run the maintenance check again: a redirect loop.

**Steps to Reproduce:**
1. Open `/login`; the network tab shows `GET /User/UnderMaintenance` → `result: 0`. There is no way to turn maintenance on.
2. Navigate manually to `/Under-Maintenance`. You are redirected to `/login` (no maintenance page exists).

**Expected:**
Administrators can enable maintenance mode and users see a maintenance page.

**Actual:**
Maintenance is permanently off and the page does not exist.

**Evidence:**
* Frontend: `Login/Login.tsx` lines 22–27; `Common/Services/Axios-config.ts` lines 127–130; `App.tsx` lines 50–55 (no `/Under-Maintenance` route).
* Backend: `Controllers/UserController.cs` lines 138–144; `Data/Repositories/UserRepository.cs` lines 204–207 (`return 0;`).
* Database: no maintenance flag exists.

**Root Cause:**
A legacy feature was stubbed out during migration.

**Business Impact:**
No way to stop users from working during deployments or data fixes.

**Affected Areas:** Authentication, System Settings.

**Recommended Fix:**
Either remove the maintenance check, or implement a persisted flag plus a public `/Under-Maintenance` route outside `ProtectedLayout`.

---

## Potential Bugs

### BUG-AUTH-010 — Login 500 responses expose internal exception messages

**Severity:** Low. Information disclosure to anonymous callers.

**Status:** Potential

**Test Area:** Error handling / Security

**Description:** `Auth/Login` and `Auth/VendorLogin` return `{ message: "Login failed.", detail: ex.GetBaseException().Message }` on any unhandled exception. SQL or EF messages can include table, column or server names.

**Steps to Reproduce:**
1. Cause a DB failure during login (for example, stop SQL Server).
2. `POST /api/Auth/Login`.
3. Inspect the `detail` field.

**Expected:** A generic error; details only in server logs.

**Actual:** The base exception message is returned to the client.

**Evidence:**
* Frontend: `Login/Login.tsx` lines 70–78 (shows `message` only).
* Backend: `Controllers/AuthController.cs` lines 54–55 and 77–78.
* Database: n/a.

**Root Cause:** Debug detail included in the production response.

**Business Impact:** Helps attackers fingerprint the backend.

**Affected Areas:** Authentication.

**Recommended Fix:** Log the exception; return only a generic message.

**Why further verification is needed:** The exact content depends on which exceptions occur at runtime.

---

### BUG-AUTH-011 — Login reveals account state before the password is checked (username enumeration)

**Severity:** Low

**Status:** Potential

**Test Area:** Validation / Security

**Description:** `/Auth/Login` returns distinct responses before verifying the password:
- "Multiple accounts found. Please specify tenant." (400): the username exists in more than one tenant;
- vendor-portal message (403);
- "Account is inactive" (403);
- "Account is locked. Try again in N minute(s)." (403).

An unknown username returns "Invalid username or password" (401). Any caller can therefore distinguish existing, inactive, locked and vendor accounts without knowing the password.

**Steps to Reproduce:**
1. Send `/Auth/Login` with an existing inactive username and a random password, then with a non-existent username.
2. Compare the responses.

**Expected:** The same generic response for every failure before the password is verified (account-state messages only after a correct password).

**Actual:** Different status codes and messages.

**Evidence:**
* Frontend: `Login/Login.tsx` lines 70–78 (shows the tenant prompt when the message mentions "tenant").
* Backend: `Services/Auth/AuthService.cs` lines 55–70 and 346–358.
* Database: n/a.

**Root Cause:** State checks are ordered before credential verification.

**Business Impact:** Lets attackers build a target list, and makes BUG-AUTH-003 brute force easier.

**Affected Areas:** Authentication, Vendor Portal login.

**Recommended Fix:** Verify the password first (or return a generic message), then report account state.

**Why further verification is needed:** The tenant-prompt UX intentionally relies on the "tenant" message, so product owners must decide the acceptable disclosure level.

---

### BUG-AUTH-012 — If saving the session fails during login, the returned refresh token is never stored

**Severity:** Medium

**Status:** Potential

**Test Area:** Error handling / Database

**Description:** In `AuthenticateUserAsync`, if `SaveChangesAsync` fails, the catch block clears the ChangeTracker and calls `BuildLoginResponseAsync` again. That generates a new refresh token, but it is never saved. The user signs in, but the first refresh returns 401 "Invalid refresh token" and the user is sent to the login page when the access token expires. Lockout counter resets and the session row are also lost.

**Steps to Reproduce:**
1. Cause the login save to fail (for example, a `UserToken` column shorter than 44 characters, or a missing `UserInfo` table, as noted in the code comment).
2. Log in. It succeeds.
3. Wait for refresh. You are forced to the login page.

**Expected:** Either login fails clearly or the refresh token is persisted.

**Actual:** A silent partial login with a non-refreshable session.

**Evidence:**
* Frontend: `Common/Components/SessionKeepAlive.tsx` lines 130–137.
* Backend: `Services/Auth/AuthService.cs` lines 395–407.
* Database: `UserDetails.UserToken` not updated.

**Root Cause:** A fallback designed to keep login working ignores persistence of the token.

**Business Impact:** Confusing periodic logouts on mis-migrated databases.

**Affected Areas:** Authentication.

**Recommended Fix:** Retry persisting only the token, or surface the failure.

**Why further verification is needed:** Only happens when the DB save fails; whether any tenant DB has such schema drift must be checked.

---

### BUG-AUTH-013 — Two tabs refreshing at nearly the same moment can log the user out

**Severity:** Low

**Status:** Potential

**Test Area:** Business logic / Responsive-PWA

**Description:** The single-flight guard (`AuthService.refreshInFlight`) is per tab. The refresh token rotates on every use. If two tabs refresh within the request round-trip window, the second sends the already-rotated token, gets 401, and runs `redirectToLogin("session")`, which clears the shared session for both tabs.

**Steps to Reproduce:**
1. Open 2+ tabs.
2. Let them approach token expiry. Each tab checks every 30 seconds, so collisions are possible.
3. Occasionally both are logged out.

**Expected:** Refresh is coordinated across tabs (or the old token is accepted for a short grace period).

**Actual:** A race is possible.

**Evidence:**
* Frontend: `Common/Services/AuthService.ts` lines 296–321; `Common/Components/SessionKeepAlive.tsx` lines 120–141.
* Backend: `Services/Auth/AuthService.cs` lines 158 and 493–494.
* Database: `UserDetails.UserToken`.

**Root Cause:** Rotation without a cross-tab lock or grace window.

**Business Impact:** Intermittent logouts that are hard to reproduce.

**Affected Areas:** All modules (session).

**Recommended Fix:** Use a cross-tab lock (`navigator.locks` / BroadcastChannel), or allow the previous token for a few seconds.

**Why further verification is needed:** Timing-dependent; it needs a multi-tab runtime test.

---

### BUG-AUTH-014 — Integration token has userId 0, so the API falls back to the client-supplied `userId` header

**Severity:** Medium

**Status:** Potential

**Test Area:** API / Permissions

**Description:** `/Auth/IntegrationToken` mints a JWT with `userId = "0"`. `ApiBaseController.GetUserId()` only accepts claim values greater than 0 and otherwise reads the `userId` request header. A holder of the integration token can therefore act as any user ID on endpoints that use `GetUserId()`. For example, `GET /Auth/Me` returns any user's profile (the lookup is by ID only, with no tenant filter), and `POST /Auth/Logout` revokes any user's refresh token. The same applies to audit fields in other modules.

**Steps to Reproduce:**
1. Obtain an integration token (requires the integration client ID and secret).
2. Call `GET /api/Auth/Me` with header `userId: <other user id>`.

**Expected:** The integration identity cannot impersonate users.

**Actual:** The header controls the user identity.

**Evidence:**
* Frontend: n/a (server-to-server).
* Backend: `Controllers/AuthController.cs` lines 98–153 (claims `userId "0"`), 181–198 (Me), 168–179 (Logout). `Controllers/ApiBaseController.cs` lines 34–46. `Services/Auth/AuthService.cs` lines 199–207 (lookup by ID only).
* Database: `UserDetails`.

**Root Cause:** The transitional header fallback is applied to every token type.

**Business Impact:** Limited to whoever holds the integration secret (CimmplePay), but audit trails become spoofable.

**Affected Areas:** Authentication, CimmplePay integration, any module that records `GetUserId()`.

**Recommended Fix:** Disable header fallbacks whenever an authenticated principal is present.

**Why further verification is needed:** Requires the integration secret; the exploitability depends on how CimmplePay uses the token.

---

### BUG-AUTH-015 — Anonymous `GET /api/User/GetProfilePic` serves any user's photo

**Severity:** Low

**Status:** Potential

**Test Area:** Permissions / Tenant / Documents

**Description:** `GetProfilePic` is `[AllowAnonymous]`. It accepts any `userId` and returns the user's profile image from blob storage. When `tenantId` is 0 it derives the tenant from the user. On failure it returns `ex.Message`.

**Steps to Reproduce:**
1. Without a token, call `GET /api/User/GetProfilePic?tenantId=0&userId=<n>` for sequential IDs.

**Expected:** Authenticated, same-tenant access only (unless public avatars are an intended product decision).

**Actual:** Anonymous access across tenants.

**Evidence:**
* Frontend: no reference to `/User/GetProfilePic` in `Cimmple_UI/src`.
* Backend: `Controllers/UserController.cs` lines 257–300.
* Database: `UserDetails.ProfilePic`; blob `ProfilePic/{tenant}/{user}`.

**Root Cause:** The legacy endpoint was left anonymous (most likely so that `<img>` tags can load without a header).

**Business Impact:** Employee photo exposure (personal data).

**Affected Areas:** Authentication (legacy UserController), Employee Master (2.3), which has its own `GetProfilePic` to be reviewed in that module.

**Recommended Fix:** Require auth, or use signed short-lived URLs.

**Why further verification is needed:** Whether avatars are intentionally public is a product decision.

---

### BUG-AUTH-016 — Swagger UI and the full API description are exposed in production

**Severity:** Low

**Status:** Potential

**Test Area:** API / Security

**Description:** `UseSwagger()` / `UseSwaggerUI()` are enabled in the non-Development branch too, so `/swagger` publishes every endpoint, including the anonymous legacy ones above.

**Steps to Reproduce:**
1. Browse to `https://<api-host>/swagger` on the production API.

**Expected:** Swagger is disabled or protected outside Development.

**Actual:** Enabled in all environments.

**Evidence:**
* Frontend: n/a.
* Backend: `Program.cs` lines 235–241.
* Database: n/a.

**Root Cause:** The configuration choice was applied to both branches.

**Business Impact:** Makes discovery of BUG-AUTH-001/002 trivial.

**Affected Areas:** All APIs.

**Recommended Fix:** Limit to Development or protect with auth or IP restriction.

**Why further verification is needed:** A reverse proxy may already block `/swagger` in the deployed environment.

---

### BUG-AUTH-017 — Any role whose name or tag contains "admin" gets every permission and every location

**Severity:** Medium

**Status:** Potential

**Test Area:** Permissions / Location / Cross-module (Roles)

**Description:** `IsAdminRole` uses `Contains("admin")` on the role name and on the role tag. Matching roles get `canAccessAllLocations = true` and an empty permission list. The frontend treats that combination as an administrator with access to all routes. Role names such as "Admin Assistant", "Sales Admin" or "Administrative Clerk" silently receive full access, regardless of their configured permissions.

**Steps to Reproduce:**
1. Create a role named "Sales Admin" with only the Sales permissions.
2. Assign it to a user and log in. The user sees every module and every location.

**Expected:** Admin status comes from an explicit flag or tag, not a substring of a display name.

**Actual:** A substring match grants admin.

**Evidence:**
* Frontend: `Common/Services/AuthService.ts` lines 226–242 (`isAdminSession`: `canAccessAllLocations` or `/admin/i` on the role name, so `hasPermissionForPath` allows every route).
* Backend: `Services/Auth/AuthService.cs` lines 530, 601–602 (no permissions loaded for admins), 703–712.
* Database: `UserRole.RoleName`, `UserRole.RoleTag`.

**Root Cause:** Heuristic admin detection.

**Business Impact:** Unintended privilege escalation through role naming.

**Affected Areas:** Authentication, Roles & Permissions (1.4), Tenant/Location framework (1.12).

**Recommended Fix:** Use an explicit `RoleTag = "ADMIN"` (exact match) or a boolean flag.

**Why further verification is needed:** The business may intend every "*admin*" role to be a super-admin; confirm with the product owner.

---

### BUG-AUTH-018 — The `locationIds` claim is capped at 50 while the UI receives the full location list

**Severity:** Low

**Status:** Potential

**Test Area:** Location

**Description:** `BuildClaims` embeds only the first 50 location IDs (ordered by name) in the JWT, but the login response lists all allowed locations. For a non-admin user mapped to more than 50 locations, the UI offers locations (possibly including the default) that the API rejects with 403 through `CanAccessLocation`.

**Steps to Reproduce:**
1. Map a non-admin user to 51+ locations.
2. Log in.
3. Switch to the alphabetically last location. List and create calls return 403.

**Expected:** The UI and API agree on the allowed locations.

**Actual:** The API allows only the first 50.

**Evidence:**
* Frontend: `Common/Services/AuthService.ts` lines 87–88 (stores all locations).
* Backend: `Services/Auth/AuthService.cs` lines 545–563 and 696–698.
* Database: `UserMapping`, `Locations`.

**Root Cause:** A token-size cap without a server-side fallback lookup.

**Business Impact:** Affects only very large location mappings.

**Affected Areas:** Authentication, Tenant/Location framework (1.12), all location-scoped modules.

**Recommended Fix:** Resolve the location server-side from `UserMapping` when the claim is truncated, or omit the claim for large lists.

**Why further verification is needed:** Depends on whether any tenant actually maps more than 50 locations to a non-admin user.

---

### BUG-AUTH-019 — Legacy `ChangePasswordNew` skips password policy and history and resolves usernames across tenants

**Severity:** Medium

**Status:** Potential

**Test Area:** Validation / API / Tenant

**Description:** `POST /api/User/ChangePasswordNew` (anonymous) requires the old password, but then sets the new password:
- with no `MinPasswordLength`/complexity/history check;
- by `FirstOrDefault(UserName == ...)` across all tenants, so with duplicate usernames the wrong tenant's user can be updated;
- in the legacy hash format.

It also returns the full entity (hash, refresh token, PII) to the caller.

**Steps to Reproduce:**
1. `POST /api/User/ChangePasswordNew {"userName":"u","oldpassword":"<correct>","password":"1"}`.
2. The password is set to "1".

**Expected:** The same policy as `/Auth/ChangePassword`.

**Actual:** No policy is applied.

**Evidence:**
* Frontend: not used by the UI.
* Backend: `Controllers/UserController.cs` lines 154–172; `Data/Repositories/UserRepository.cs` lines 187–202.
* Database: `UserDetails.Password`.

**Root Cause:** The legacy endpoint was not retired.

**Business Impact:** Weak passwords; possible cross-tenant update when usernames collide.

**Affected Areas:** Authentication, Password policy (1.2).

**Recommended Fix:** Remove the endpoint, or delegate to `AuthService.ChangePasswordAsync`.

**Why further verification is needed:** `AuthenticateUser` (`SingleOrDefault` + legacy hash) only succeeds for users who still have legacy-format hashes, so real exposure depends on data.

---

### BUG-AUTH-020 — A stored password value that isn't in PBKDF2 format works as a literal password

**Severity:** Medium

**Status:** Potential

**Test Area:** Database / Security

**Description:** `PasswordHasher.Verify` treats any stored value that is not in `iterations.salt.hash` format as legacy plaintext and compares it directly. Legacy hashes (`base64hash|base64salt`, written by `PasswordHelper` via BUG-AUTH-001 and BUG-AUTH-019) contain no '.', so for those users the correct password fails at `/Auth/Login`, while the literal stored hash string succeeds and is then "upgraded". Anyone who obtains the stored value (for example, from the BUG-AUTH-001 response) can log in.

**Steps to Reproduce:**
1. Set a user's password through `POST /api/User/ChangePassword`; note `result.password` in the response.
2. `/Auth/Login` with the real new password: 401.
3. `/Auth/Login` with the `result.password` string: 200.

**Expected:** Legacy hashes are verified with `PasswordHelper`; plaintext fallback only for truly plaintext rows (or none).

**Actual:** The hash string itself acts as the password.

**Evidence:**
* Frontend: n/a.
* Backend: `Services/Auth/PasswordHasher.cs` lines 40–46 and 61–66; `Utilities/PasswordHelper.cs` lines 30–35 (format `hash|salt`).
* Database: `UserDetails.Password`.

**Root Cause:** The two hash formats are not reconciled.

**Business Impact:** Lockout of legitimate users; leaked hashes become directly usable credentials.

**Affected Areas:** Authentication, Password policy (1.2), User Management (1.3).

**Recommended Fix:** Detect the `|` format and verify it with `PasswordHelper`, then upgrade; remove the plaintext fallback after migration.

**Why further verification is needed:** Depends on how many rows in `UserDetails.Password` are in legacy or plaintext format (see Manual Verification, item 8).

---

## Needs Manual Verification

1. **Area:** Deployed JWT configuration
   - **What to Test:** On each environment, confirm `TokenConfig:Key` is present, at least 32 characters, not the sample value `ChangeThisToALongSecureSecretKeyAtLeast32Chars!`, and that `Issuer`/`Audience` are set. Then call `/api/User/AutoLogin` (test user) and use the token on an `[Authorize]` endpoint.
   - **Expected:** A unique secret key; legacy tokens are rejected.
   - **Why Manual Testing Is Required:** `appsettings.json` is not in the repo. If the key is missing, `Program.cs` falls back to a key published in source (anyone can forge tokens). If it is present and at least 32 characters, legacy tokens are accepted (BUG-AUTH-002/003).

2. **Area:** Hosting environment
   - **What to Test:** Confirm `ASPNETCORE_ENVIRONMENT` is not `Development` on any internet-facing server; call `POST /api/Auth/BootstrapPassword`.
   - **Expected:** 404.
   - **Why Manual Testing Is Required:** In Development, that endpoint resets any user's password anonymously, and the developer exception page is enabled.

3. **Area:** Password expiry for users without `PwdResetDate`
   - **What to Test:** `SELECT COUNT(*) FROM UserDetails WHERE PwdResetDate IS NULL`; log in as such a user with `PasswordExpirationDays = 1`.
   - **Expected:** The business decides whether these users should be forced to change.
   - **Why Manual Testing Is Required:** The code skips expiry when `PwdResetDate` is null (`AuthService.cs` lines 380–386); impact depends on data.

4. **Area:** Account lockout end to end
   - **What to Test:** Enter the wrong password `FailedLoginAttempts` times. Check the lock message and countdown, unlock after `AccountLockoutMinutes`, and that the counter resets after a successful login.
   - **Expected:** Behaviour matches System Settings.
   - **Why Manual Testing Is Required:** Code looks correct; confirm the UI messages and timing at runtime.

5. **Area:** Session timeout and keep-alive
   - **What to Test:** Session Timeout = 5. (a) Stay active for 15 minutes; the session continues (silent refreshes). (b) Stay idle for 5 minutes; you are redirected to login with "You have been logged out due to inactivity". (c) A browser with throttled background timers or a sleeping laptop.
   - **Expected:** As described.
   - **Why Manual Testing Is Required:** Timer behaviour depends on the browser.

6. **Area:** Responsive login
   - **What to Test:** `/login`, `/change-password` and `/vendor/login` at 375, 390, 430, 768, 1024 and 1440 px, plus the installed PWA. Check the brand panel collapse at 991.98 px, keyboard overlap and the password-visibility toggle.
   - **Expected:** Usable layouts without horizontal scroll.
   - **Why Manual Testing Is Required:** Visual.

7. **Area:** Duplicate usernames within one tenant
   - **What to Test:** `SELECT TenantID, UserName, COUNT(*) FROM UserDetails GROUP BY TenantID, UserName HAVING COUNT(*) > 1`.
   - **Expected:** No rows.
   - **Why Manual Testing Is Required:** `/Auth/Login` silently picks `matches[0]` when a tenant is supplied (`AuthService.cs` line 66); the legacy endpoints throw. Whether a unique index exists in the deployed DB must be confirmed.

8. **Area:** Password storage formats
   - **What to Test:** Count `UserDetails.Password` values by format: PBKDF2 `n.salt.hash`, legacy `hash|salt`, plaintext.
   - **Expected:** All PBKDF2.
   - **Why Manual Testing Is Required:** Determines the real exposure of BUG-AUTH-019/020 and whether legacy-format users can log in at all.

9. **Area:** Swagger and anonymous legacy endpoints on production
   - **What to Test:** From outside the network: `/swagger`, `POST /api/User/AutoLogin`, `POST /api/User/ChangePassword` (with a test account only).
   - **Expected:** Blocked.
   - **Why Manual Testing Is Required:** A reverse proxy or WAF may block them even though the code allows them.

## No Issues Found

- Password hashing for new and changed passwords: PBKDF2-SHA256, 100k iterations, random 16-byte salt, constant-time compare (`PasswordHasher.cs`).
- Lockout counter logic: increments per failure, locks at the configured threshold, resets on success; lockout failures never block the 401 response.
- Login form validation: trimmed username and password required. The tenant field appears when the server asks for it, and a parsed tenant ID is sent.
- After a successful login, the app goes to the change-password page when required, otherwise to the first permitted landing route.
- `/Auth/ChangePassword` requires a token and the current password, and applies the tenant policy and history (`ValidateAndApplyPasswordAsync`).
- `/Auth/SetDefaultLocation` rejects locations the token does not allow (`CanAccessLocation`).
- `/Auth/IntegrationToken`: client ID and secret compared in constant time; short TTL (default 10 minutes); location restricted.
- `/Auth/BootstrapPassword` returns 404 outside Development.
- Axios 401 handling: one refresh attempt per request, then redirect. Auth endpoints are excluded, so a wrong password shows an error instead of looping.
- `User.isAuthenticated` is restored from localStorage on reload; `ProtectedLayout` redirects to `/login` without a token and shows "No access" instead of looping when the landing page is denied.
- Idle-logout message is shown once on the login page and then cleared.
- The JWT has 1-minute clock skew; issuer, audience, signature and lifetime are all validated.
- Role lookup without a tenant filter (`AuthService.cs` line 519) is safe because `UserRole.RoleID` is a global identity key.

## QA Coverage

| Test Area | Tested | Result |
| --- | --- | --- |
| Navigation | Yes | Fail (BUG-AUTH-009; redirects otherwise OK) |
| CRUD | Partial | Pass. Only SetDefaultLocation/ChangePassword updates apply to this module |
| Search | N/A | No search in this module |
| Filters | N/A | No filters in this module |
| Sorting | N/A | No sorting in this module |
| Pagination | N/A | No pagination in this module |
| Validation | Yes | Pass (UI/API required-field checks); potential enumeration BUG-AUTH-011 |
| Permissions | Yes | Fail (BUG-AUTH-001, 002, 003, 008) |
| API | Yes | Fail (BUG-AUTH-001, 002, 003, 005) |
| Database | Yes | Fail (BUG-AUTH-006; potential 012, 020) |
| Business Logic | Yes | Fail (BUG-AUTH-005, 006, 007) |
| Location | Yes | Pass with potential issues (BUG-AUTH-017, 018) |
| Tenant | Yes | Potential issues (BUG-AUTH-014, 015, 019); see cross-module concerns |
| Cross-Module | Yes | Concerns logged below for their root-cause modules |
| Responsive/PWA | Partial | Manual verification required (item 6); multi-tab issue BUG-AUTH-007 |

## Cross-Module Concerns (found while testing Authentication; to be logged under the root-cause module)

These were observed while tracing auth and session data, but their root cause belongs to other matrix modules. They are **not** counted as Authentication bugs and will be formally logged (and verified) when those modules are tested.

| Concern | Root-cause module | Evidence |
| --- | --- | --- |
| Many controllers take `tenantId` from the query or body and filter by it, without comparing it to the token's tenant. There is no global tenant filter, action filter or EF query filter. Example: `CustomerController.GetCustomerById` / `DeleteCustomer` use `[FromQuery] int tenantId` directly. Any authenticated user may read or modify another tenant's data. Likely **Critical**. | Tenant / Location Framework (1.12), matrix section 11.3. To be logged in `QA_TenantLocationFramework.md` | `Controllers/CustomerController.cs` lines 100–106, 926–931. A repo search finds no `IActionFilter`, `UseMiddleware` or `HasQueryFilter`. |
| Role permissions are enforced only in the UI. The API's only policy is "authenticated user", so any logged-in user can call any module's API. | Roles & Permissions (1.4). To be logged in `QA_RolesPermissions.md` | `Program.cs` lines 142–147; no `[Authorize(Roles/Policy)]` anywhere. |
| Vendor-portal tokens are accepted by all ERP endpoints; only `QuotationController` checks `IsVendorPortal()`. | Vendor Portal (1.11). To be logged in `QA_VendorPortal.md` | Search for `IsVendorPortal()`: `QuotationController.cs` only. |
| The support-staff token has `tenantId = "0"` and a negative `userId`. `GetTenantId()`/`GetUserId()` ignore values ≤ 0 and fall back to the client-supplied `tenantId`/`userId` headers, so support staff could act in any tenant as any user. | Support Tickets & Support Portal (1.10). To be logged in `QA_SupportPortal.md` | `Controllers/SupportStaffController.cs` lines 50–60, 181–188; `Controllers/ApiBaseController.cs` lines 13–46. |
| ERP and Vendor Portal sessions share the localStorage keys `permissions` and `allowedLocations`, and a forced logout on either clears both (`clearSession("all")`). | Vendor Portal (1.11). To be logged in `QA_VendorPortal.md` | `Common/Services/AuthService.ts` lines 77–88; `Common/Services/Axios-config.ts` line 36. |
| Employee Master `GetProfilePic` is also anonymous (matrix section 11.3). | Employee Master (2.3). To be logged in `QA_EmployeeMaster.md` | Matrix section 11.3. |
| `QA_TEST_MATRIX.md` section 0.2 lists anonymous endpoints but omits the legacy `UserController` ones (Login, AutoLogin, ValidateUserStatusNew, UnderMaintenance, ChangePassword, ChangePasswordNew, GetProfilePic). This is a gap in the matrix document only; the matrix was not edited. | QA documentation | `Controllers/UserController.cs` lines 43–258. |

