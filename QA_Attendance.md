# QA — Attendance -t

| Module | Matrix section | Bug ID prefix | Tested | Confirmed Bugs | Potential Bugs | Manual Verification |
| --- | --- | --- | --- | --- | --- | --- |
| Attendance | 5.4 | BUG-ATT | Yes | 9 | 3 | 5 |

Source of test cases: `QA_TEST_MATRIX.md`. Method: static trace of the actual implementation (React UI → service → Axios → .NET controller → service/repository → EF Core → SQL Server, and back). No application code, configuration or database is changed during QA. Findings that depend on deployed configuration, data or a real browser go under **Needs Manual Verification**.

Severity scale:
- **Critical**: security breach, data corruption, financial corruption, or a blocked core workflow.
- **High**: a major feature is broken or a significant security control is bypassed, with a workaround that is hard or unavailable.
- **Medium**: a feature works incorrectly in specific conditions, or a security control is weaker than configured.
- **Low**: cosmetic, minor UX, or an informational/hardening issue.

---

## Confirmed Bugs

### BUG-ATT-001 — Punch log ignores the site filter and has no date-range limit
**Severity:** Medium. Site-restricted users can read every employee's punch events in the tenant, including failed face matches.
**Status:** Confirmed
**Test Area:** Location / View punch log
**Description:** `GetRegister` applies `TryResolveListLocationFilter`, but `GetPunchLog` filters only by tenant, date and optional employee. It also has no maximum range, unlike the 62-day limit on the register.
**Steps to Reproduce:**
1. Log in as a user restricted to site A.
2. Call `GET /api/Attendance/GetPunchLog?from=2020-01-01&to=2026-12-31&includeFailed=true` with no employee id.
**Expected:** Only punches for accessible sites (matrix: "Authorization: authenticated; location filter"), and a bounded range.
**Actual:** All punches of all employees in the tenant for the whole period, with failure reasons and confidence.
**Evidence:**
- Frontend: `Cimmple_UI/src/Modules/Attendance/AttendanceRegister.tsx` lines 248-266; `Cimmple_UI/src/Common/Services/AttendanceService.ts` lines 56-72 (no `locationId` sent).
- Backend: `Cimmple_API/CimmpleAPI/Controllers/AttendanceController.cs` lines 359-424; compare 162-163 and 173-176 in `GetRegister`.
- Database: `CimmplePunch.FaceAttendanceLog`.
**Root Cause:** The location guard and range limit were not applied to the punch log endpoint.
**Business Impact:** Employee attendance data exposed beyond configured site access; heavy unbounded queries.
**Affected Areas:** Attendance register detail popup; API consumers.
**Recommended Fix:** Apply the same location filter and 62-day limit as `GetRegister`.

---

### BUG-ATT-002 — Shifts that end before 5 PM are recorded as a break and shown as "Missing out"
**Severity:** Medium. Register statuses are wrong every day for any employee who leaves before 5 PM tenant time.
**Status:** Confirmed
**Test Area:** Business Logic / Status
**Description:** The direction rule (documented 5 PM cutoff) turns any punch made while on premises before 5 PM into `BREAK_OUT`. The register then labels a day whose last punch is `BREAK_OUT` as `onBreak` today and `missingOut` for past days, although the employee punched out.
**Steps to Reproduce:**
1. Employee punches at 07:00 (IN) and at 15:30 (recorded as BREAK_OUT) and leaves.
2. Open the register for that day today, and again the next day.
**Expected:** The day is shown as completed (statuses noPunch, completed, onBreak, missingOut, in should reflect what happened; "Missing out" implies the employee did not punch out).
**Actual:** Today "On break"; from the next day "Missing out". Hours are counted correctly up to 15:30.
**Evidence:**
- Backend: `Cimmple_API/CimmpleAPI/Controllers/AttendanceController.cs` lines 761-796 (`ResolveNextDirection`), 316-327 (status), `Cimmple_API/CimmpleAPI/Utilities/TenantTimeZoneHelper.cs` lines 9 and 76-77.
- Frontend: `Cimmple_UI/src/Modules/Attendance/AttendanceRegister.tsx` lines 46-69 ("Missing out" shown as a danger badge).
- Database: `FaceAttendanceLog.Direction`.
**Root Cause:** A fixed 5 PM cutoff decides between break and end-of-day, and the register cannot distinguish an early end of shift from a break.
**Business Impact:** Supervisors chase false "missing out" exceptions; exports to payroll show wrong statuses.
**Affected Areas:** Register, CSV export, any payroll use of statuses.
**Recommended Fix:** Make the cutoff configurable per tenant/shift, let the kiosk choose Out vs Break, or treat a trailing `BREAK_OUT` on a past day as end of day.

---

### BUG-ATT-003 — Overnight shifts are split at local midnight: the morning punch becomes "IN" and hours are lost
**Severity:** Medium. Night-shift hours are reported as zero and statuses are wrong.
**Status:** Confirmed
**Test Area:** Business Logic / Hours
**Description:** `GetNextDirectionAsync` looks only at today's punches (tenant-local day), so the first punch after midnight is always `IN`. The register groups punches per local day and `SumWorkedHours` only counts closed pairs (or "until now" for today), so neither day gets the hours.
**Steps to Reproduce:**
1. Employee punches at 22:00 (IN) and at 06:00 next day.
2. View the register for both days after the second day.
**Expected:** One shift of about 8 hours (matrix: "Hours = sum of the in/out pairs minus breaks").
**Actual:** Day 1: Missing out, no hours. Day 2: the 06:00 punch is IN, status Missing out (or In today), no hours.
**Evidence:**
- Backend: `Cimmple_API/CimmpleAPI/Controllers/AttendanceController.cs` lines 743-759 (`GetNextDirectionAsync`), 286-293 (per-day grouping), 426-466 (`SumWorkedHours`).
**Root Cause:** Day boundaries are calendar days with no shift concept.
**Business Impact:** Under-reported hours for night workers.
**Affected Areas:** Register, punch direction at kiosks, CSV export.
**Recommended Fix:** Determine direction from the last punch within a shift window (for example the last 16 hours), and attribute a shift's hours to its start day.

---

### BUG-ATT-004 — Register runs a database query for every time conversion
**Severity:** Medium. Large ranges can time out or load the database heavily.
**Status:** Confirmed
**Test Area:** API / Performance
**Description:** `ToUtc` and `ToLocal` each call `GetTenantTimeZone`, which queries `SystemSettings` (and possibly `EntityMaster`) every time. `GetRegister` calls `ToUtc` twice per employee per day and `ToLocal` once per punch, so 100 employees × 62 days means well over 12,000 queries per request.
**Steps to Reproduce:**
1. Select a 62-day range with "Include no punch" for a tenant with many employees.
**Expected:** The register loads in reasonable time.
**Actual (by code):** Tens of thousands of synchronous queries.
**Evidence:**
- Backend: `Cimmple_API/CimmpleAPI/Controllers/AttendanceController.cs` lines 286-289, 333, 437, 844-860 (`GetTenantTimeZoneId` queries), 873-892.
**Root Cause:** The timezone is not resolved once per request.
**Business Impact:** Slow or failing register; database load.
**Affected Areas:** Register, punch board.
**Recommended Fix:** Resolve the `TimeZoneInfo` once at the start of each action and pass it down.

---

### BUG-ATT-005 — Password punch endpoint is an unthrottled password-guessing oracle
**Severity:** Medium. Any authenticated user can test unlimited passwords for any employee in the tenant.
**Status:** Confirmed
**Test Area:** API / Security (Punch, out of UI scope)
**Description:** `PunchPasswordVerify` accepts a user name or id plus a password, verifies it and replies "Password verification failed" or success. There is no rate limit or lockout, and the result reveals whether the password is correct (a success also creates a punch).
**Steps to Reproduce:**
1. As any logged-in user, POST `/api/Attendance/PunchPasswordVerify` repeatedly with `userName` of a manager and candidate passwords.
**Expected:** Attempts are throttled or locked out.
**Actual:** Unlimited attempts; the correct password is identified by a success response.
**Evidence:**
- Backend: `Cimmple_API/CimmpleAPI/Controllers/AttendanceController.cs` lines 468-559 (verification at 512-515).
**Root Cause:** No attempt limiting on a credential-checking endpoint.
**Business Impact:** Employee (including admin) passwords can be discovered and used to log in.
**Affected Areas:** Time Clock kiosk, user accounts.
**Recommended Fix:** Add per-user and per-caller rate limiting/lockout, and restrict the endpoint to kiosk devices.

---

### BUG-ATT-006 — No protection against duplicate or rapid repeated punches
**Severity:** Medium. A double scan flips the employee's state and corrupts the day's hours.
**Status:** Confirmed
**Test Area:** Business Logic / Overlapping punches
**Description:** The next direction is computed from the last successful punch with no minimum interval. Two punches seconds apart produce `IN` then `BREAK_OUT` (or `OUT` after 5 PM).
**Steps to Reproduce:**
1. Employee punches IN at 08:00:00 and the kiosk submits again at 08:00:05.
**Expected:** The second punch is rejected or ignored as a duplicate.
**Actual:** The employee is on break from 08:00:05; hours are not counted until the next punch.
**Evidence:**
- Backend: `Cimmple_API/CimmpleAPI/Controllers/AttendanceController.cs` lines 527-547 and 674-693 (direction then insert), 743-759.
**Root Cause:** No debounce window and no concurrency check.
**Business Impact:** Wrong statuses and hours.
**Affected Areas:** Kiosk punches, register.
**Recommended Fix:** Reject punches within a short window (for example 60 seconds) of the previous successful punch for the same employee.

---

### BUG-ATT-007 — Face punch does not validate the location
**Severity:** Low. A punch can be recorded at a site the operator cannot access or a non-existent location.
**Status:** Confirmed
**Test Area:** Location (Punch, out of UI scope)
**Description:** `PunchPasswordVerify` validates the location with `TryResolveLocationId`, but `Punch` uses `request.LocationId ?? employee.DefaultLocationId` without any check.
**Steps to Reproduce:**
1. POST `/api/Attendance/Punch` with `formField` containing a `locationId` of another site.
**Expected:** 403 as for the password punch.
**Actual:** Punch recorded at that location.
**Evidence:**
- Backend: `Cimmple_API/CimmpleAPI/Controllers/AttendanceController.cs` line 674 (face) vs 522-525 (password).
**Root Cause:** Inconsistent guard between the two punch methods.
**Business Impact:** Punches appear in the wrong site's register.
**Affected Areas:** Register site filter.
**Recommended Fix:** Call `TryResolveLocationId` in `Punch` too.

---

### BUG-ATT-008 — Register has no pagination
**Severity:** Low. Large ranges render thousands of rows at once.
**Status:** Confirmed
**Test Area:** Pagination
**Description:** The matrix lists "Pagination: Client". The page maps all sorted rows into a single table.
**Steps to Reproduce:**
1. Select a 62-day range with "Include no punch".
**Expected:** Client-side pagination.
**Actual:** All rows rendered.
**Evidence:**
- Frontend: `Cimmple_UI/src/Modules/Attendance/AttendanceRegister.tsx` lines 380-426.
**Root Cause:** Custom table instead of the paginated list component.
**Business Impact:** Slow page on large ranges.
**Affected Areas:** Attendance register.
**Recommended Fix:** Add client pagination (for example via `MasterListPage`).

---

### BUG-ATT-009 — CSV export does not neutralise spreadsheet formulas
**Severity:** Low. Hardening; a crafted employee name can run a formula when the export is opened in Excel.
**Status:** Confirmed
**Test Area:** Export
**Description:** `escapeCsvValue` only quotes values containing quotes, commas or newlines. Values starting with `=`, `+`, `-` or `@` are written as-is.
**Steps to Reproduce:**
1. Set an employee's first name to `=HYPERLINK("http://example.com","x")`.
2. Export the register and open it in Excel.
**Expected:** The value is shown as text.
**Actual:** It is evaluated as a formula.
**Evidence:**
- Frontend: `Cimmple_UI/src/Common/Utils/CsvImport.ts` lines 81-90; `Cimmple_UI/src/Modules/Attendance/AttendanceRegister.tsx` lines 239-246.
**Root Cause:** No formula-injection escaping.
**Business Impact:** Phishing or data exfiltration via exported files.
**Affected Areas:** Attendance export and any other export using `buildCsv`.
**Recommended Fix:** Prefix values starting with `=`, `+`, `-`, `@`, tab or carriage return with a single quote.

---

## Potential Bugs

### BUG-ATT-010 — Timezone fallback differs between the API and the UI
**Severity:** Medium. Dates and times in the register can disagree when a tenant has no timezone in System Settings.
**Status:** Potential
**Test Area:** Business Logic / Timezone
**Description:** The API uses `SystemSettings.Timezone`, then `EntityMaster.timezone`, then the server's local timezone. The UI formats times with the System Settings timezone or falls back to `America/New_York`. The work date is bucketed by the API and the time is formatted by the UI, so they can use different zones.
**Steps to Reproduce:**
1. Tenant with an empty System Settings timezone and an `EntityMaster` timezone of Asia/Kolkata.
2. Punch at 23:30 IST; view the register.
**Expected:** Date and time shown in the same timezone.
**Actual (by code):** The row is dated by IST and the time is shown in New York time.
**Evidence:**
- Backend: `Cimmple_API/CimmpleAPI/Controllers/AttendanceController.cs` lines 844-860; `Cimmple_API/CimmpleAPI/Utilities/TenantTimeZoneHelper.cs` lines 25-30.
- Frontend: `Cimmple_UI/src/Common/Utils/Formatting.ts` lines 256-285.
**Root Cause:** Different fallback chains.
**Business Impact:** Confusing or wrong times; the end-of-day cutoff follows the server's zone.
**Affected Areas:** Register, punch board, direction rule.
**Recommended Fix:** Use one tenant timezone source and return it with the register so the UI formats with it.
**Why further verification is needed:** Depends on whether tenants exist without a System Settings timezone.

---

### BUG-ATT-011 — Site-filtered register computes hours from a partial set of punches
**Severity:** Low. Hours and status can be wrong for employees who punch at more than one site.
**Status:** Potential
**Test Area:** Location / Hours
**Description:** When a site is selected, punches at other sites are removed before statuses and hours are computed, so an IN at site A and OUT at site B appear as "Missing out" in site A's view.
**Steps to Reproduce:**
1. Employee punches IN at site A and OUT at site B; view the register filtered to site A.
**Expected:** Day status and hours reflect the employee's full day.
**Actual (by code):** Missing out with partial or no hours.
**Evidence:**
- Backend: `Cimmple_API/CimmpleAPI/Controllers/AttendanceController.cs` lines 244-258 and 307-333.
**Root Cause:** The site filter is applied to the punch set rather than the row.
**Business Impact:** Misleading per-site reports.
**Affected Areas:** Register with site filter.
**Recommended Fix:** Compute the day from all punches, then filter rows by site.
**Why further verification is needed:** Depends on whether employees punch at multiple sites in practice.

---

### BUG-ATT-012 — All-location users appear in every site's register
**Severity:** Low. "Include no punch" lists head-office users as absent at every site.
**Status:** Potential
**Test Area:** Location / Filter
**Description:** Employees with `CanAccessAllLocations` match every site filter.
**Steps to Reproduce:**
1. Filter the register to site A with "Include no punch".
**Expected:** Only employees who work at site A.
**Actual (by code):** All-location users are listed as "No punch".
**Evidence:**
- Backend: `Cimmple_API/CimmpleAPI/Controllers/AttendanceController.cs` lines 197-200 and 216-218.
**Root Cause:** Access scope is used as work location.
**Business Impact:** Noise in absence lists.
**Affected Areas:** Register.
**Recommended Fix:** Use the employee's default/mapped work locations only.
**Why further verification is needed:** The intended membership rule for site registers is not stated in the matrix.

---

## Needs Manual Verification

1. **Area:** Responsive / wide table on phone
   **What to Test:** Open `/attendance` at phone width; scroll the table and open the punch log popup.
   **Expected:** Horizontal scroll works and the popup fits (matrix "wide table on phone").
   **Why Manual Testing Is Required:** Layout cannot be checked statically.
2. **Area:** Daylight-saving transitions
   **What to Test:** Punches spanning a DST change in a DST tenant timezone.
   **Expected:** Hours are correct (one hour more/less across the change).
   **Why Manual Testing Is Required:** Depends on server timezone data.
3. **Area:** Range validation messages
   **What to Test:** Choose an end date before the start date, and a range over 62 days.
   **Expected:** Clear messages "End date must be on or after start date" and "Date range cannot exceed 62 days".
   **Why Manual Testing Is Required:** The UI has no client-side check and relies on the server message shown in a toast (`AttendanceRegister.tsx` 124-127; `AttendanceController.cs` 168-176).
4. **Area:** Face punch
   **What to Test:** Punch with an enrolled face, a different face and an unenrolled employee.
   **Expected:** Match succeeds above the threshold; others fail with a logged failure.
   **Why Manual Testing Is Required:** Requires the face recognition service.
5. **Area:** Column chooser persistence
   **What to Test:** Hide/show columns, reload the page, export.
   **Expected:** Preferences persist and the export uses visible columns.
   **Why Manual Testing Is Required:** Browser storage behaviour.

## No Issues Found

- The register validates end ≥ start and a maximum of 62 days on the server (`AttendanceController.cs` 168-176).
- The register applies the site filter, including restricted users with no allowed sites (`AttendanceController.cs` 162-163, 190-258).
- Hours are the sum of IN/BREAK_IN → BREAK_OUT/OUT pairs, so breaks are excluded, and an open segment counts until now only for today (`AttendanceController.cs` 426-466).
- Statuses noPunch, completed, onBreak, missingOut and in are produced as listed in the matrix (`AttendanceController.cs` 311-331).
- Failed punches are excluded from the register and the direction rule (`IsSuccess` filters at 237-242 and 750-754).
- Inactive employees are not listed as "No punch" (`AttendanceController.cs` 300-305).
- The default date is today in the tenant timezone (`AttendanceRegister.tsx` 33; `Formatting.ts` 277-285), and times are formatted from UTC to the tenant timezone (`Formatting.ts` 256-274).
- Search, status filter, sort, column chooser and CSV export of visible columns work client-side (`AttendanceRegister.tsx` 141-246).
- Add/Edit/Delete are not offered, as the matrix states.

## QA Coverage

| Test Area | Tested | Result |
| --- | --- | --- |
| Navigation | Yes | Pass |
| CRUD | N/A | N/A (read-only register) |
| Search | Yes | Pass |
| Filters | Yes | Potential (BUG-ATT-011, BUG-ATT-012) |
| Sorting | Yes | Pass |
| Pagination | Yes | Fail (BUG-ATT-008) |
| Validation | Yes | Pass (server-side range checks; Manual 3) |
| Permissions | Partial | Fail (BUG-ATT-001, BUG-ATT-005) |
| API | Yes | Fail (BUG-ATT-004, BUG-ATT-005) |
| Database | Yes | Pass |
| Business Logic | Yes | Fail (BUG-ATT-002, BUG-ATT-003, BUG-ATT-006); Potential (BUG-ATT-010) |
| Location | Yes | Fail (BUG-ATT-001, BUG-ATT-007); Potential (BUG-ATT-011, BUG-ATT-012) |
| Tenant | Yes | Pass (tenant from token via `GetTenantId()` on every endpoint) |
| Cross-Module | Yes | Pass (employee master data and face enrolment read correctly) |
| Responsive/PWA | No | Manual |

## Matrix Checklist

| Matrix Row | Result | Notes |
| --- | --- | --- |
| FE List (`GetRegister`, ≤62 days) | Fail | Works; slow for large ranges (BUG-ATT-004). |
| FE Search / Sort; column chooser | Pass | `AttendanceRegister.tsx` 141-184, 279-286. |
| FE Filter (date range, site) | Potential | BUG-ATT-011, BUG-ATT-012. |
| FE Pagination (client) | Fail | BUG-ATT-008. |
| FE View (punch log per employee/day) | Fail | Endpoint ignores site filter (BUG-ATT-001). |
| FE Export (CSV) | Fail | BUG-ATT-009. |
| FE Add / Edit / Delete (not available) | Pass | Not offered. |
| FE Validation (range ≤62 days) | Pass | Server-side; Manual 3. |
| FE Permissions / Responsive | Manual | No server role check (cross-module); Manual 1. |
| BE List (`GetRegister`, `GetPunchLog`) | Fail | BUG-ATT-001, BUG-ATT-004. |
| BE Punch (`Punch`, `PunchPasswordVerify`) | Fail | BUG-ATT-005, BUG-ATT-006, BUG-ATT-007. |
| BE Authorization (authenticated; location filter) | Fail | BUG-ATT-001, BUG-ATT-007. |
| BL Direction rule with 5 PM tenant-local cutoff | Fail | Implemented as documented, but produces false "Missing out" (BUG-ATT-002) and breaks overnight shifts (BUG-ATT-003). |
| BL Register statuses | Fail | Produced as listed; misclassified for early leavers (BUG-ATT-002). |
| BL Hours = in/out pairs minus breaks | Fail | Correct within a day; lost for overnight shifts (BUG-ATT-003) and after duplicate punches (BUG-ATT-006). |

## Cross-Module Concerns

| Concern | Where seen in Attendance | Owner file |
| --- | --- | --- |
| No server-side role/permission enforcement; the register is in the Administration menu but any authenticated user can call `GetRegister`/`GetPunchLog` | `AttendanceController` (`[Authorize]` only); `Sidebar.tsx` 141-149 hides it by permission in the UI only | `QA_RolesPermissions.md` |
| Face enrolment, employee status and default location come from the employee master | `AttendanceController.cs` 600-635 (`EmployeeFace`), 181-233 | `QA_EmployeeMaster.md` |
| Use of attendance hours/statuses for pay | Statuses and hours issues above (BUG-ATT-002, BUG-ATT-003) would carry into any payroll use | `QA_Payroll.md` |
