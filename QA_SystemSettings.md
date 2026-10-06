# QA — System Settings

| Module | Matrix section | Bug ID prefix | Tested | Fix Tested | Confirmed Bugs | Potential Bugs | Manual Verification |
| --- | --- | --- | --- | --- | --- | --- | --- |
| System Settings | 1.5 | BUG-SET | Yes | No | 7 | 2 | 5 |

Source of test cases: `QA_TEST_MATRIX.md`. Method: static trace of the actual implementation (React UI → service → Axios → .NET controller → service/repository → EF Core → SQL Server, and back). No application code, configuration or database is changed during QA. Findings that depend on deployed configuration, data or a real browser go under **Needs Manual Verification**.

Severity scale:
- **Critical**: security breach, data corruption, financial corruption, or a blocked core workflow.
- **High**: a major feature is broken or a significant security control is bypassed, with a workaround that is hard or unavailable.
- **Medium**: a feature works incorrectly in specific conditions, or a security control is weaker than configured.
- **Low**: cosmetic, minor UX, or an informational/hardening issue.

---

Matrix section 1.5. Flows traced: `Modules/Settings/SystemSettings.tsx` (all tabs, Save, Test SMTP, Default Location) → `Common/Services/SystemSettingsService.ts`, `LocationService.GetLocations`, `AuthService.setDefaultLocation` → `SystemSettingsController` (`GetSettings`, `SaveSettings`, `TestSmtp`, `GetCompanyInfo`, `SaveCompanyInfo`), `AuthController.SetDefaultLocation` → `SystemSettings`, `UserDetails.DefaultLocationId`; consumers `AuthService` (password policy, lockout, sessions, token lifetime), `EmailService`/`SmtpSettingsResolver`, `NotificationService`, `EmailOutboxService`, `SettingsContext`, `App.tsx` (timezone), `Utils/Formatting.ts`.

Related bugs logged elsewhere: server-side permission enforcement is missing (BUG-ROLE-001), so every endpoint below is callable by any authenticated user; concurrent-session limit behaviour is BUG-AUTH-006; session-timeout behaviour is BUG-AUTH-007; password-policy findings are in `QA_PasswordPolicy.md`.

## Confirmed Bugs

### BUG-SET-001 — SMTP test in Custom mode reuses the saved SMTP password against any server the caller supplies, exposing the password that the API otherwise redacts

**Severity:** High. A significant security control (password redaction) is bypassed: the tenant's SMTP credentials can be sent to an attacker-controlled host, in plain text when SSL is off.

**Status:** Confirmed

**Test Area:** API / Security

**Description:**
`GetSettings` never returns `SmtpPassword` (it returns only `HasSmtpPassword`). `TestSmtp` with `emailDeliveryMode = "Custom"` starts from the saved settings and overrides them with the request; an empty `smtpPassword` means "keep the saved password", while `smtpServer`, `smtpPort`, `smtpUseSsl` and `smtpUsername` are taken from the request. `EmailService.TrySend` then connects to the supplied server and calls `Authenticate(savedUsername, savedPassword)`. With `smtpUseSsl = false`, the connection uses `SecureSocketOptions.None`, so the credentials travel unencrypted; with SSL on, a host with a valid certificate for its own domain receives them over TLS. The recipient (`toEmail`) is also arbitrary.

**Steps to Reproduce:**
1. Tenant has Custom SMTP saved with a password.
2. Call `POST /api/SystemSettings/TestSmtp` with body `{"tenantId":<t>,"toEmail":"x@example.com","emailDeliveryMode":"Custom","smtpServer":"<host you control>","smtpPort":25,"smtpUseSsl":false,"smtpFromEmail":"x@example.com"}` (no `smtpPassword`).
3. The host receives an SMTP AUTH exchange containing the tenant's saved username and password.

**Expected:**
The saved password is only used with the saved server (or the test requires the password to be re-entered whenever the server, port, SSL or username differ from the saved values).

**Actual:**
The saved password is sent to whatever server the request names.

**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Settings/SystemSettings.tsx` lines 190–202 (sends server/port/SSL/username from the form and `smtpPassword: ""` unless retyped, since `loadSettings` blanks it at line 65).
* Backend: `Cimmple_API/CimmpleAPI/Controllers/SystemSettingsController.cs` lines 57–61 (password redacted on read), 344–346 and 369–373 (custom branch), 408–453 (`BuildSmtpSettingsForTest`: saved password kept at 421 and 445–447, server overridden at 437–438). `Services/EmailService.cs` lines 85–87 (connect + authenticate), 138–146 (SSL off → `SecureSocketOptions.None`).
* Database: `SystemSettings.SmtpPassword` (stored as entered).

**Root Cause:**
"Blank password keeps the saved one" convenience is applied without checking that the destination is the saved server.

**Business Impact:**
Credential theft for the tenant's mail account (often a corporate mailbox); spam/phishing sent as the company. Exploitable by any authenticated user because of BUG-ROLE-001, and across tenants because `tenantId` is taken from the body (see Cross-Module Concerns).

**Affected Areas:** System Settings (Email tab), every feature that sends tenant email.

**Recommended Fix:**
Only reuse the saved password when server, port and username equal the saved values; otherwise require the password in the request. Do not allow `SmtpUseSsl = false` with authentication, or warn strongly. Restrict the test endpoint to settings administrators.

---

### BUG-SET-002 — SaveSettings has no server-side validation; security settings can be weakened beyond the UI limits

**Severity:** Medium. Security controls can be made much weaker than the product allows (one-character passwords, effectively no lockout, access tokens valid for months) through a direct API call.

**Status:** Confirmed

**Test Area:** Validation / API / Business logic

**Description:**
The UI clamps the security fields (password length 6–20, session timeout 5–480, failed attempts 3–10, lockout 5–1440, max sessions 1–10, history 0–10, page size from a list). `SaveSettings` copies every field from the body without checks. The consumers use any positive value as is:
- `MinPasswordLength = 1` → password policy accepts 1-character passwords.
- `FailedLoginAttempts = 100000` → lockout is effectively disabled (brute force).
- `SessionTimeoutMinutes = 100000` → access tokens are issued for about 69 days.
- `MaxConcurrentSessions = 0` → the session limit is skipped (the UI minimum is 1).
- `PasswordHistoryCount = 1000`, `DefaultPageSize = 0` or negative, unknown `DateFormat`/`Timezone` strings → stored.

**Steps to Reproduce:**
1. `GET /api/SystemSettings/GetSettings?tenantId=<t>`; copy the JSON.
2. Set `minPasswordLength: 1`, `failedLoginAttempts: 100000`, `sessionTimeoutMinutes: 100000`; `POST /api/SystemSettings/SaveSettings`.
3. Response 200. Log in: `sessionTimeoutMinutes` in the login response is 100000; a password change to "a" (with other rules off) succeeds.

**Expected:**
The API enforces the same ranges as the UI (matrix validation row) and rejects invalid values with 400.

**Actual:**
All values are stored and used.

**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Settings/SystemSettings.tsx` lines 128–139 (UI-only range checks), 790–934 (clamped inputs).
* Backend: `Controllers/SystemSettingsController.cs` lines 136–200 (no validation; fields copied at 160–198). `Services/Auth/AuthService.cs` lines 302 (min length), 416–419 (lockout), 429 (`MaxConcurrentSessions <= 0` → no limit), 497–498 (token lifetime = session timeout).
* Database: `SystemSettings` columns (no check constraints; `Services/SystemSettingsSchemaService.cs`).

**Root Cause:**
Validation exists only in the React form.

**Business Impact:**
Tenant security posture can be silently degraded (also by non-admin users, BUG-ROLE-001); compliance settings unreliable.

**Affected Areas:** Authentication, Password policy, Sessions, every list (page size).

**Recommended Fix:**
Validate ranges and allowed values in `SaveSettings` (shared constants with the UI) and return 400 with field messages.

---

### BUG-SET-003 — Custom SMTP mode can be saved without an SMTP server or From Email

**Severity:** Low. Misconfiguration is accepted; tenant email then fails later instead of at save time.

**Status:** Confirmed

**Test Area:** Validation

**Description:**
The matrix requires "custom SMTP needs server and From". `handleSaveSettings` validates only password length, session timeout and port; the server/From check exists only in `handleTestSmtp`. The API also accepts empty values. After saving Custom mode with a blank server, every tenant email (notifications, documents, reminders) fails to send.

**Steps to Reproduce:**
1. Email Settings → select Custom SMTP; leave SMTP Server and From Email empty.
2. Click Save Settings → "System settings saved successfully".

**Expected:**
Save is blocked with "SMTP server and From Email are required for custom SMTP."

**Actual:**
Saved.

**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Settings/SystemSettings.tsx` lines 124–139 (no Custom checks on save) versus 166–176 (checks only on Test).
* Backend: `Controllers/SystemSettingsController.cs` lines 182–191 (custom fields saved as received). `Services/EmailService.cs` lines 81–87 (uses `SmtpServer`/`SmtpFromEmail` at send time).
* Database: `SystemSettings.SmtpServer`, `SmtpFromEmail`.

**Root Cause:**
Validation placed in the wrong handler.

**Business Impact:**
Silent loss of outgoing tenant email until someone notices.

**Affected Areas:** Email delivery (Notifications, Document Email, Scheduled Reports, AR reminders).

**Recommended Fix:**
Apply the Custom-mode checks in `handleSaveSettings` and in `SaveSettings`.

---

### BUG-SET-004 — Decimal Places cannot be set to 0

**Severity:** Low. A documented option (min 0) is unreachable.

**Status:** Confirmed

**Test Area:** Validation / Edit

**Description:**
The input allows 0–4, but the handler uses `parseInt(value) || 2`. Because `0` is falsy, entering 0 stores 2.

**Steps to Reproduce:**
1. Currency & Numbers → Decimal Places → type 0 (or use the down arrow from 1).
2. The field jumps to 2.

**Expected:**
0 is accepted (whole-number currency).

**Actual:**
Reset to 2.

**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Settings/SystemSettings.tsx` lines 717–725.
* Backend: n/a (value never sent).
* Database: `SystemSettings.DecimalPlaces`.

**Root Cause:**
`|| default` used where `0` is a valid value.

**Business Impact:**
Tenants using currencies without minor units (e.g. JPY) cannot configure them.

**Affected Areas:** Currency/number formatting across the app.

**Recommended Fix:**
Use `Number.isNaN(parsed) ? 2 : parsed`.

---

### BUG-SET-005 — Numeric security fields are clamped on every keystroke, so many valid values cannot be typed

**Severity:** Low. Minor UX: valid values need the spinner arrows.

**Status:** Confirmed

**Test Area:** Validation / Edit

**Description:**
Each keystroke is parsed and clamped to the minimum immediately. Typing a multi-digit value whose first digit is below the minimum replaces it with the minimum:
- Minimum Password Length (min 6): typing "12" → "1" becomes 6 → "62" becomes 20. Values 10–19 cannot be typed.
- Session Timeout (min 5): values 10–49 and 100–499 cannot be typed (e.g. "120" → 5 → 52 → 480).
- Account Lockout (min 5): values 10–49 cannot be typed, including the default 15.
- Clearing a field is impossible (empty → default 8/30/15 immediately).

**Steps to Reproduce:**
1. Security → Minimum Password Length → select all → type "12".
2. Field shows 20.

**Expected:**
Free typing with validation on blur/save (save already validates ranges).

**Actual:**
As described.

**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Settings/SystemSettings.tsx` lines 795–798 (password length), 862–865 (session timeout), 931–934 (lockout); same pattern for max sessions 887–890 and failed attempts 909–912.
* Backend: n/a.
* Database: n/a.

**Root Cause:**
Clamping in `onChange` instead of on blur.

**Business Impact:**
Administrators may save a different value than intended (e.g. 20 instead of 12).

**Affected Areas:** Security tab.

**Recommended Fix:**
Keep the raw string in state, clamp on blur, validate on save.

---

### BUG-SET-006 — Thousands separator "None" is ignored, and currency amounts ignore the configured separators and symbol

**Severity:** Low. Formatting settings partially have no effect.

**Status:** Confirmed

**Test Area:** Business logic / Formatting

**Description:**
- `formatNumber` uses `thousandsSeparator || ','`. The "None" option saves an empty string, which falls back to a comma.
- `formatCurrency` formats with `Intl.NumberFormat(locale, { style: 'currency', currency })`. It uses only locale, currency code and decimal places; the configured Decimal Separator, Thousands Separator and Currency Symbol are used only in the fallback path when `Intl` throws (an unknown currency code).

**Steps to Reproduce:**
1. Currency & Numbers → Thousands Separator = None → Save. View a quantity/amount ≥ 1000 formatted with `formatNumber`: "1,000".
2. Set Decimal Separator = Comma and Thousands Separator = Period with locale en-US and currency USD → currency amounts still show "$1,234.50".

**Expected:**
Number and currency output follow the configured separators and symbol (matrix: settings drive currency formats).

**Actual:**
As described.

**Evidence:**
* Frontend: `Cimmple_UI/src/Common/Utils/Formatting.ts` lines 115–141 (`formatCurrency`, Intl path ignores separators/symbol), 154 (`|| ','`); `Modules/Settings/SystemSettings.tsx` lines 768–773 ("None" = `""`).
* Backend: `Controllers/SystemSettingsController.cs` lines 165–168 (values stored correctly).
* Database: `SystemSettings.ThousandsSeparator`, `DecimalSeparator`, `CurrencySymbol`.

**Root Cause:**
Falsy-fallback for a legitimate empty value; currency formatting delegated entirely to `Intl`.

**Business Impact:**
Tenants outside the default locale cannot get the number format they configured.

**Affected Areas:** All lists, forms and screens using `formatNumber`/`formatCurrency` (PDFs may use their own formatting; see Manual item 3).

**Recommended Fix:**
Use `?? ','` for the thousands separator; build currency output from `formatNumber` plus the configured symbol, or use `Intl.NumberFormat.formatToParts` and replace group/decimal/currency parts.

---

### BUG-SET-007 — Default Location lists every tenant location, so location-restricted users can pick one they are not allowed to use and get a 403

**Severity:** Low. Minor UX: offered options fail with an error.

**Status:** Confirmed

**Test Area:** Location / Default location

**Description:**
The Default Location tab loads all tenant locations with `LocationService.GetLocations`, which returns every location for the tenant without considering the user's allowed locations. `POST /Auth/SetDefaultLocation` correctly rejects locations the user cannot access (403), so restricted users see options that always fail.

**Steps to Reproduce:**
1. User R mapped only to Location A (not all-locations) with access to `/settings`.
2. Settings → Default Location → select Location B → Save Settings.
3. Toast "Failed to save default location: You do not have access to the selected location".

**Expected:**
Only the user's allowed locations are listed (as in the working-site switcher).

**Actual:**
All tenant locations listed.

**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Settings/SystemSettings.tsx` lines 81–96 (loads all tenant locations), 443–461 (select), 222–249 (save).
* Backend: `Controllers/LocationController.cs` lines 29–37 (`GetLocations` filters by tenant only); `Controllers/AuthController.cs` lines 229–232 (`CanAccessLocation` → 403).
* Database: `Locations`, `UserMapping`.

**Root Cause:**
The picker uses the master-data location list instead of the session's allowed locations (`AuthService` stored locations).

**Business Impact:**
Confusing errors for restricted users (security itself is enforced).

**Affected Areas:** System Settings → Default Location.

**Recommended Fix:**
Populate the picker from the session's allowed locations (login payload `locations`).

---

## Potential Bugs

### BUG-SET-008 — If loading settings fails, the page shows defaults and invites the user to save them, overwriting the tenant's real settings and wiping Custom SMTP

**Severity:** Medium. A transient error followed by a natural "Save" silently resets security, formatting and email configuration.

**Status:** Potential

**Test Area:** Error handling / Data integrity

**Description:**
Any `GetSettings` failure (network error, timeout, 500) makes the page load `getDefaultSystemSettings(tid)` and show "Settings could not be loaded from the server. Defaults are shown — click Save Settings to create your tenant configuration." Saving sends the defaults; `SaveSettings` finds the existing row and overwrites every field. Because the default mode is Hosted, `ClearTenantCustomSmtpFields` also erases the tenant's custom SMTP server, username, password and From address.

**Steps to Reproduce:**
1. Tenant has non-default settings (e.g. Custom SMTP, 12-character passwords).
2. Make `GET /SystemSettings/GetSettings` fail once (e.g. block it in browser dev tools) and open `/settings`.
3. Defaults and the yellow banner are shown; click Save Settings.
4. Reload: all settings are defaults and Custom SMTP is gone.

**Expected:**
On load failure, saving is disabled (or the user must confirm overwriting), and the banner does not recommend saving unless the settings row truly does not exist.

**Actual (expected from code):**
Defaults overwrite the stored settings.

**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Settings/SystemSettings.tsx` lines 69–76 (defaults on any error), 306–308 (Save enabled), 327–337 (banner text), 141–146 (save sends defaults).
* Backend: `Controllers/SystemSettingsController.cs` lines 111–115 (500 on general errors), 158–199 (overwrite), 192–195 (`ClearTenantCustomSmtpFields` in Hosted mode).
* Database: `SystemSettings` row for the tenant.

**Root Cause:**
The "first-run" fallback is used for every failure, not only for "no settings yet".

**Business Impact:**
Silent loss of tenant configuration including email credentials.

**Affected Areas:** System Settings, Authentication policy, email delivery, formatting.

**Recommended Fix:**
Distinguish "not found" (API already returns defaults with 200) from errors; on error show a retry state and disable Save.

**Why further verification is needed:** Requires an actual load failure in a running environment to confirm the end-to-end effect (code path is deterministic once the request fails).

---

### BUG-SET-009 — Duplicate settings rows per tenant are possible; reads then pick one arbitrarily

**Severity:** Low. Requires concurrent first saves; leads to inconsistent settings rather than loss.

**Status:** Potential

**Test Area:** Database / Concurrency

**Description:**
"One row per tenant" is enforced only by `FirstOrDefaultAsync` then `Add`. The index `IX_SystemSettings_TenantId` is not unique. Two concurrent first saves (two admins, or a retry) can insert two rows. Later reads use `FirstOrDefaultAsync` without ordering, so login, email and the settings page may use different rows.

**Steps to Reproduce:**
1. For a tenant without a settings row, send two `SaveSettings` requests concurrently.
2. Query `SystemSettings` for that tenant: two rows.

**Expected:**
Unique constraint on `TenantId`; second insert becomes an update.

**Actual (expected from code):**
Two rows possible.

**Evidence:**
* Frontend: n/a.
* Backend: `Controllers/SystemSettingsController.cs` lines 146–157 (check-then-insert), 120–122 (unordered `FirstOrDefaultAsync`).
* Database: `Services/SystemSettingsSchemaService.cs` line 60 (`CREATE INDEX [IX_SystemSettings_TenantId]`, non-unique); same in `create_systemsettings_table.sql` line 58.

**Root Cause:**
Missing unique index.

**Business Impact:**
Settings appear to "revert" or differ between features.

**Affected Areas:** All settings consumers.

**Recommended Fix:**
Make the index unique (after de-duplicating) and handle the conflict as an update.

**Why further verification is needed:** Race condition; needs concurrent requests against a real database.

---

## Needs Manual Verification

1. **Area:** Responsive layout
   - **What to Test:** `/settings` at 375/390/430 px and around the 768 px breakpoint; tab bar, two-column grids, Save button.
   - **Expected:** Tabs scroll/wrap, fields stack, Save reachable.
   - **Why Manual Testing Is Required:** Visual (`SystemSettings.scss` lines 35–72 define the 768 px rules; the security grid uses an inline `1fr 1fr` style at line 785 that the stylesheet may not override).

2. **Area:** SMTP test, both modes
   - **What to Test:** Hosted mode with platform SMTP configured/not configured; Custom mode with correct and incorrect credentials, SSL on 465 and 587, SSL off.
   - **Expected:** Success toast with recipient; clear error message on failure; test works while email notifications are disabled.
   - **Why Manual Testing Is Required:** Needs real SMTP servers and deployed `PlatformSmtp` configuration.

3. **Area:** Settings propagation
   - **What to Test:** Change timezone, date format, currency, default page size and the in-app/email notification toggles; check lists, forms, PDFs, notifications and toasts without and with a hard refresh, and in a second open tab.
   - **Expected:** Current tab updates after save (`refreshSettings`); other tabs/users after reload; PDFs use the tenant formats.
   - **Why Manual Testing Is Required:** Many consumers; `SettingsContext` loads once per page load; PDF formatting is server-side.

4. **Area:** Same decimal and thousands separator
   - **What to Test:** Select Period for both separators (or Comma for both) and save; view formatted numbers.
   - **Expected:** Save blocked or warning.
   - **Why Manual Testing Is Required:** The UI does not prevent it; whether it must be blocked is a product decision.

5. **Area:** Default location after re-login and on the working-site switcher
   - **What to Test:** Save a new default location; log out/in; check the selected site and that the Settings page hides the site switcher.
   - **Expected:** New default used at login; switcher hidden on `/settings` (`workingSiteVisibility.ts` line 12).
   - **Why Manual Testing Is Required:** Session and storage behaviour across logins.

## No Issues Found

- `GetSettings` never returns the SMTP password; Hosted mode also hides leftover tenant SMTP fields (`SystemSettingsController.cs` lines 57–76).
- Saving in Hosted mode clears tenant SMTP fields; saving Custom mode with an empty password keeps the stored password (lines 180–195).
- A missing settings row returns defaults with 200; a missing table/column is created on the fly and retried (lines 89–133, 205–280).
- The SMTP test bypasses the email-notification gate as documented and returns the API error message to the toast (lines 334–399; `SystemSettings.tsx` lines 204–217).
- Default location save is protected server-side by `CanAccessLocation` (`AuthController.cs` lines 229–232).
- Password policy, expiry, history, lockout and session timeout are read from the tenant row at login/change (`AuthService.cs` lines 302, 380–386, 416–421, 497).
- In-app and email notification toggles are honoured by `NotificationService` (lines 94–95), `EmailOutboxService` (line 58) and `EmailService` (line 48).
- Timezone is applied globally via `moment.tz.setDefault` (`App.tsx` lines 28–30).
- The Settings menu item and route are permission-gated in the UI (`TopBar.tsx` lines 101, 936; route `/settings`). Server-side enforcement is missing (BUG-ROLE-001).
- Save errors show the API message (`SystemSettings.tsx` lines 150–157).
- Default page size options 5–100 map to existing list page sizes (lines 1287–1301).

## QA Coverage

| Test Area | Tested | Result |
| --- | --- | --- |
| Navigation | Yes | Pass (TopBar item and route gated in UI) |
| CRUD | Yes | Fail (BUG-SET-004); Potential (BUG-SET-008) |
| Search | N/A | None |
| Filters | N/A | None |
| Sorting | N/A | None |
| Pagination | N/A | Default page size setting covered under Business Logic |
| Validation | Yes | Fail (BUG-SET-002, BUG-SET-003, BUG-SET-005) |
| Permissions | Yes | UI gating OK; server not enforced (BUG-ROLE-001) |
| API | Yes | Fail (BUG-SET-001, BUG-SET-002) |
| Database | Yes | Potential (BUG-SET-009) |
| Business Logic | Yes | Fail (BUG-SET-006); other settings consumers pass |
| Location | Yes | Fail (BUG-SET-007) |
| Tenant | Yes | Tenant taken from query/body (Cross-Module Concerns) |
| Cross-Module | Yes | Auth, notifications, email, formatting consumers traced |
| Responsive/PWA | No | Manual (item 1) |

## Matrix Checklist

| Matrix Row | Result | Notes |
| --- | --- | --- |
| FE — View (tabs: Default Location, Date & Time, Currency, Security, Email, General; GET `GetSettings`) | Potential | Loads correctly; load failure leads to default overwrite risk (BUG-SET-008) |
| FE — Edit (Save all tabs, POST `SaveSettings`) | Fail | Decimal places 0 impossible (BUG-SET-004); keystroke clamping (BUG-SET-005) |
| FE — SMTP test (POST `TestSmtp`) | Fail | Saved password reused against any host (BUG-SET-001); Manual item 2 |
| FE — Default location (POST `/Auth/SetDefaultLocation`) | Fail | Lists locations the user cannot select (BUG-SET-007) |
| FE — Validation (password 6–20, session 5–480, port 1–65535, custom SMTP server and From) | Fail | First three pass on save; custom SMTP checked only on Test (BUG-SET-003) |
| FE — Permissions (TopBar item and route) | Pass | UI only (BUG-ROLE-001) |
| FE — Responsive (768 px) | Manual | Item 1 |
| BE — Get (`GetSettings`, `GetCompanyInfo`) | Pass | Password redacted; `GetCompanyInfo` unused by the page |
| BE — Update (`SaveSettings` upsert, `SaveCompanyInfo`) | Fail | No validation (BUG-SET-002); duplicate rows possible (BUG-SET-009) |
| BE — Test (`TestSmtp`) | Fail | BUG-SET-001 |
| BE — Validation (password never returned; hosted mode clears tenant SMTP) | Pass | Both verified; redaction bypassable via test (BUG-SET-001) |
| BE — Authorization (authenticated only; tenant from query/body) | Fail | BUG-ROLE-001; tenant trust in Cross-Module Concerns |
| BL — Password policy and expiry | Pass | Server can store weaker values (BUG-SET-002); policy findings in `QA_PasswordPolicy.md` |
| BL — Lockout | Pass | Lockout can be disabled via API (BUG-SET-002) |
| BL — Concurrent sessions | Fail | See BUG-AUTH-006; 0 disables the limit (BUG-SET-002) |
| BL — Session timeout | Pass | Token lifetime = timeout (`AuthService.cs` line 497); see BUG-AUTH-007; unbounded via API (BUG-SET-002) |
| BL — `defaultPageSize` | Pass | Options 5–100 |
| BL — In-app and email notification toggles | Pass | `NotificationService.cs` lines 94–95; `EmailOutboxService.cs` line 58; `EmailService.cs` line 48 |
| BL — Timezone (moment default) | Pass | `App.tsx` lines 28–30 |
| BL — Date and currency formats | Fail | Separators/symbol ignored for currency; "None" ignored (BUG-SET-006) |

## Cross-Module Concerns

| Concern | Root-cause module/file | Evidence |
| --- | --- | --- |
| All System Settings endpoints trust the tenant from the client: `GetSettings?tenantId`, `SaveSettings` body `TenantId` (also inserts a row for any ID such as 0), `TestSmtp` body `tenantId` (lets a user test with another tenant's saved SMTP credentials, combining with BUG-SET-001), `GetCompanyInfo?tenantId`, `SaveCompanyInfo`. | Tenant / Location Framework — `QA_TenantLocationFramework.md` | `Controllers/SystemSettingsController.cs` lines 91, 146–147, 344, 290–295, 457–460 |
| The page falls back to tenant `1` when `storage.tenantID` is missing. | Tenant / Location Framework | `Modules/Settings/SystemSettings.tsx` lines 30, 35, 54, 72, 85 |

