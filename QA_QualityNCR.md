# QA — Quality / NCR

| Module | Matrix section | Bug ID prefix | Tested | Confirmed Bugs | Potential Bugs | Manual Verification |
| --- | --- | --- | --- | --- | --- | --- |
| Quality / NCR | 5.3 | BUG-NCR | Yes | 15 | 3 | 5 |

Source of test cases: `QA_TEST_MATRIX.md`. Method: static trace of the actual implementation (React UI → service → Axios → .NET controller → service/repository → EF Core → SQL Server, and back). No application code, configuration or database is changed during QA. Findings that depend on deployed configuration, data or a real browser go under **Needs Manual Verification**.

Severity scale:
- **Critical**: security breach, data corruption, financial corruption, or a blocked core workflow.
- **High**: a major feature is broken or a significant security control is bypassed, with a workaround that is hard or unavailable.
- **Medium**: a feature works incorrectly in specific conditions, or a security control is weaker than configured.
- **Low**: cosmetic, minor UX, or an informational/hardening issue.

---

## Confirmed Bugs

### BUG-NCR-001 — Destructive debug endpoints let any authenticated user delete or rewrite NCRs of every tenant
**Severity:** Critical. Any logged-in user of any tenant can wipe or mass-modify all tenants' quality records.
**Status:** Confirmed
**Test Area:** API / Debug endpoints / Tenant
**Description:** `QualityController` exposes debug endpoints with no environment guard and no role check (only the global authenticated-user fallback policy):
- `DELETE /api/Quality/DeleteAllNCRs?tenantId=` deletes all NCRs of the tenant id supplied.
- `DELETE /api/Quality/delete-all-ncrs?confirmation=DELETE_ALL_TEST_DATA` deletes all NCRs of all tenants; the required confirmation string is printed in the error message returned when it is missing.
- `GET /api/Quality/FixDatabase` runs mass `UPDATE` statements across all tenants (for example setting `TenantId = 1` where it is null/0 and `ReportedBy = 1`), as a GET request.
**Steps to Reproduce:**
1. Log in as any user of tenant A.
2. Call `DELETE /api/Quality/delete-all-ncrs` without parameters and read the message.
3. Call it again with `confirmation=DELETE_ALL_TEST_DATA`.
**Expected:** Debug/maintenance endpoints are not reachable in production (the matrix asks to "verify exposure in production"), and no endpoint crosses tenants.
**Actual:** All NCRs of all tenants are deleted.
**Evidence:**
- Backend: `Cimmple_API/CimmpleAPI/Controllers/QualityController.cs` lines 111-166 (`FixDatabase`), 255-275 (`DeleteAllNCRs`), 2018-2065 (`delete-all-ncrs`, confirmation disclosed at 2022-2028).
- Backend: `Cimmple_API/CimmpleAPI/Program.cs` lines 142-147 (fallback policy only requires authentication); no `IsDevelopment` guard around these routes.
- Database: `NonConformanceReports` (all tenants).
**Root Cause:** Development utilities shipped in the production controller.
**Business Impact:** Irrecoverable loss or corruption of quality records for every customer of the platform.
**Affected Areas:** All tenants' NCRs, dashboards and quality reports.
**Recommended Fix:** Remove these endpoints, or restrict them to development builds and a platform-admin role.

---

### BUG-NCR-002 — UpdateNCR overwrites NCRs of any tenant by id
**Severity:** Critical. Cross-tenant data tampering.
**Status:** Confirmed
**Test Area:** Tenant / Edit
**Description:** `UpdateNCR/{id}` preloads and updates with `WHERE NcrId = @Id` only; there is no tenant predicate in either statement.
**Steps to Reproduce:**
1. Log in to tenant A.
2. `PUT /api/Quality/UpdateNCR/{id}` where `id` belongs to tenant B, with any body.
**Expected:** 404 for an NCR outside the caller's tenant.
**Actual:** Tenant B's NCR is overwritten (title, status, root cause, photos list, approver, closed date).
**Evidence:**
- Frontend: `Cimmple_UI/src/Modules/Quality/NonConformanceReportSlideout.tsx` (save flow, update call after 553).
- Backend: `Cimmple_API/CimmpleAPI/Controllers/QualityController.cs` lines 1256-1486; preload at 1277-1300 (`WHERE NcrId = @Id`, line 1281); update at 1302-1348 (`WHERE NcrId = @Id`, line 1348).
- Database: `NonConformanceReports`.
**Root Cause:** Raw SQL statements omit `TenantId`.
**Business Impact:** Any customer can alter another customer's quality records and trigger notifications in their tenant.
**Affected Areas:** NCR edit, notifications, quality dashboards and reports.
**Recommended Fix:** Add `AND TenantId = @TenantId` (from the token) to both statements and return 404 when no row matches.

---

### BUG-NCR-003 — DeleteNCR falls back to deleting by id across tenants
**Severity:** Critical. Cross-tenant deletion of quality records.
**Status:** Confirmed
**Test Area:** Tenant / Delete
**Description:** If the NCR is not found with the tenant filter (or tenant ≤ 0), `DeleteNCR` retries with `NcrId == ncrId` only and then deletes it.
**Steps to Reproduce:**
1. Log in to tenant A.
2. `DELETE /api/Quality/DeleteNCR?ncrId={id of tenant B}`.
**Expected:** 404.
**Actual:** Tenant B's NCR is deleted and tenant B's job order pointers are cleaned up.
**Evidence:**
- Frontend: `Cimmple_UI/src/Modules/Quality/NonConformanceReportSlideout.tsx` lines 652-691 (delete with impact dialog).
- Backend: `Cimmple_API/CimmpleAPI/Controllers/QualityController.cs` lines 1641-1751; fallback at 1651-1657 (line 1654), job pointer cleanup 1664-1738, delete 1740-1743.
- Database: `NonConformanceReports`, `JobOrderMaster`.
**Root Cause:** A "not found" fallback that drops the tenant predicate.
**Business Impact:** Irrecoverable loss of another tenant's NCRs.
**Affected Areas:** NCR delete; job orders linked to NCRs.
**Recommended Fix:** Remove the fallback; return 404 when the tenant-filtered lookup fails.

---

### BUG-NCR-004 — Read-only debug endpoints leak cross-tenant data, including user emails
**Severity:** High. Disclosure of other tenants' personal data and records.
**Status:** Confirmed
**Test Area:** API / Debug endpoints
**Description:** Any authenticated user can call:
- `GET /api/Quality/users`: active users of all tenants with email.
- `GET /api/Quality/DebugNCRs?tenantId=`: NCRs for any tenant id.
- `GET /api/Quality/TestDB`: sample NCRs of tenant 1.
- `GET /api/Quality/CheckDatabase`: global NCR counts.
- `GET /api/Quality/DebugNCRNumbers` and `GET /api/Quality/CheckTable`: internal numbering and schema details.
**Steps to Reproduce:**
1. Log in as any user; call `GET /api/Quality/users`.
**Expected:** Not available in production; never cross-tenant.
**Actual:** Returns users across tenants with their emails.
**Evidence:**
- Backend: `Cimmple_API/CimmpleAPI/Controllers/QualityController.cs` lines 169-215, 218-252, 278-294, 1620-1638, 1999-2012, 2070-2093.
- Database: `UserDetails`, `NonConformanceReports`.
**Root Cause:** Debug endpoints without environment or tenant guard.
**Business Impact:** Privacy breach (PII), competitive data leak.
**Affected Areas:** All tenants.
**Recommended Fix:** Remove the endpoints or limit them to development builds; filter any remaining user lookup by the caller's tenant.

---

### BUG-NCR-005 — GetNCR returns any tenant's NCR when tenantId is omitted, and has no site check
**Severity:** High. Cross-tenant read of full NCRs (including photo file names and approver data).
**Status:** Confirmed
**Test Area:** Tenant / Location / Edit
**Description:** `GetNCR/{id}` adds the tenant condition only `if (tenantId > 0)`. Calling it with no or zero `tenantId` returns any NCR by id. There is also no location check, unlike the list (location via job's CO).
**Steps to Reproduce:**
1. Log in to tenant A.
2. `GET /api/Quality/GetNCR/{id of tenant B}` without a `tenantId` parameter.
**Expected:** 404 (tenant from token); 403 for sites the user cannot access.
**Actual:** Tenant B's NCR is returned.
**Evidence:**
- Frontend: `Cimmple_UI/src/Common/Services/QualityService.ts` lines 240-273.
- Backend: `Cimmple_API/CimmpleAPI/Controllers/QualityController.cs` lines 656-872 (conditional tenant filter at 722 and 732).
- Database: `NonConformanceReports`.
**Root Cause:** Optional tenant filter and missing location guard.
**Business Impact:** Confidential defect, supplier and customer data exposed across tenants and sites.
**Affected Areas:** NCR slideout, deep links (`/quality?open={id}`), photo download (BUG-NCR-006).
**Recommended Fix:** Always filter by the token tenant; apply the same job → CO location rule as the list.

---

### BUG-NCR-006 — NCR photos can be downloaded across tenants
**Severity:** High. Cross-tenant disclosure of defect photos.
**Status:** Confirmed
**Test Area:** Tenant / Photos
**Description:** `GetNCRPhoto` loads the NCR with `NcrId == ncrId` only and serves the file if its name is in the NCR's `Photos` list. The file names can be obtained from `GetNCR` without a tenant (BUG-NCR-005).
**Steps to Reproduce:**
1. Log in to tenant A; read tenant B's NCR via `GetNCR/{id}` without `tenantId` to get a photo name.
2. Call `GET /api/Quality/GetNCRPhoto/{id}?fileName={name}`.
**Expected:** 404 for another tenant's NCR.
**Actual:** The photo is streamed.
**Evidence:**
- Frontend: `Cimmple_UI/src/Common/Services/QualityService.ts` lines 48-63; `Cimmple_UI/src/Modules/Quality/NcrStoredPhotoImg.tsx`.
- Backend: `Cimmple_API/CimmpleAPI/Controllers/QualityController.cs` lines 1887-1955 (lookup at 1897).
- Database: `NonConformanceReports.Photos`; blob storage.
**Root Cause:** Lookup by id only.
**Business Impact:** Leak of product and defect imagery.
**Affected Areas:** NCR photos, NCR PDF.
**Recommended Fix:** Filter the NCR by the token tenant before serving any file.

---

### BUG-NCR-007 — Photos can be uploaded to another tenant's NCR
**Severity:** High. Cross-tenant write to another tenant's record.
**Status:** Confirmed
**Test Area:** Tenant / Photos
**Description:** `UploadNCRPhotos/{id}` uses `FindAsync(ncrId)` with no tenant check and appends the uploaded file names to that NCR's `Photos`.
**Steps to Reproduce:**
1. Log in to tenant A.
2. `POST /api/Quality/UploadNCRPhotos/{id of tenant B}` with an image.
**Expected:** 404.
**Actual:** The photo is attached to tenant B's NCR.
**Evidence:**
- Backend: `Cimmple_API/CimmpleAPI/Controllers/QualityController.cs` lines 1804-1882 (lookup at 1809).
- Database: `NonConformanceReports.Photos`.
**Root Cause:** Missing tenant predicate.
**Business Impact:** Tampering with another tenant's evidence; offensive or misleading content can be injected.
**Affected Areas:** NCR photos.
**Recommended Fix:** Load the NCR with `NcrId == id && TenantId == tokenTenant`.

---

### BUG-NCR-008 — CreateNCR does not enforce the matrix validation rules on the server
**Severity:** Medium. Invalid NCRs can be created through the API.
**Status:** Confirmed
**Test Area:** Validation / Add
**Description:** The UI validates title ≤ 200, defect quantity ≤ total quantity and vendor + PO for External source. `CreateNCR` deserializes the body manually (so model validation does not run) and checks only that Title is present.
**Steps to Reproduce:**
1. `POST /api/Quality/CreateNCR` with `source: "External"`, no vendor/PO, `defectQuantity: 50`, `totalQuantity: 10`.
**Expected:** 400 (matrix: "Title required ≤200; defect qty ≤ total; external requires vendor + PO").
**Actual:** Created. A title over 200 characters fails at the database instead of with a validation message.
**Evidence:**
- Frontend: `Cimmple_UI/src/Modules/Quality/NonConformanceReportSlideout.tsx` lines 531-553.
- Backend: `Cimmple_API/CimmpleAPI/Controllers/QualityController.cs` lines 875-1253 (title check only at 919-922).
- Database: `Cimmple_API/CimmpleAPI/Data/Models/NonConformanceReport.cs` (Title `StringLength(200)`).
**Root Cause:** Client-only validation; manual deserialization bypasses data annotations.
**Business Impact:** Inconsistent quality data; external NCRs without supplier traceability.
**Affected Areas:** NCR create (and update, which only gets annotation-level checks).
**Recommended Fix:** Validate the same rules in `CreateNCR` and `UpdateNCR`.

---

### BUG-NCR-009 — NCRs without a linked job are hidden from site-restricted users and from every specific-site view
**Severity:** Medium. External/customer NCRs disappear for users who must handle them, including their own.
**Status:** Confirmed
**Test Area:** Location / List
**Description:** The location filter joins NCR → job → customer order. NCRs without a job are excluded whenever a specific site is selected, and always for restricted users.
**Steps to Reproduce:**
1. As a user restricted to site A, create an NCR with source Customer and no job.
2. Return to `/quality`.
**Expected:** The user can see the NCR they created (site via job's CO, with a sensible rule for unlinked NCRs).
**Actual:** It is not listed.
**Evidence:**
- Backend: `Cimmple_API/CimmpleAPI/Controllers/QualityController.cs` lines 490-531.
- Frontend: `Cimmple_UI/src/Modules/Quality/Quality.tsx` lines 137 and 140.
**Root Cause:** The site rule has no case for NCRs without a job.
**Business Impact:** Supplier and customer complaints go unhandled.
**Affected Areas:** NCR list, stats mismatch (BUG-NCR-010).
**Recommended Fix:** Store a location on the NCR (or derive from the creating user's site) and filter on it.

---

### BUG-NCR-010 — Stats cards are tenant-wide while the list is site-filtered
**Severity:** Low. Card counts do not match the list, and restricted users see counts for sites they cannot access.
**Status:** Confirmed
**Test Area:** List / Stats
**Description:** `Quality.tsx` passes `locationId` to `GetNCRs` but calls `GetNCRStats(tenantID)` without a location, and the stats endpoint has no location filter.
**Steps to Reproduce:**
1. Select site A on `/quality`; compare the "Open" card with the list after clicking it.
**Expected:** The card count equals the filtered list count.
**Actual:** The card shows the tenant-wide count.
**Evidence:**
- Frontend: `Cimmple_UI/src/Modules/Quality/Quality.tsx` lines 98-101, 121-138 and 151-160.
- Backend: `Cimmple_API/CimmpleAPI/Controllers/QualityController.cs` lines 1754-1801.
**Root Cause:** Stats ignore the site filter.
**Business Impact:** Misleading KPIs.
**Affected Areas:** Quality page cards.
**Recommended Fix:** Pass and apply the same location filter to `GetNCRStats`.

---

### BUG-NCR-011 — Load failures are shown as "no NCRs" or zero stats
**Severity:** Low. Errors are hidden from the user.
**Status:** Confirmed
**Test Area:** List / Error handling
**Description:** `QualityService.GetNCRs` catches errors and returns `[]`, `GetNCRById` returns `null`, and `GetNCRStats` returns zeros. The page's error toast in `loadNCRs` can therefore never fire.
**Steps to Reproduce:**
1. Make `GetNCRs` fail (API down or 500).
**Expected:** An error message (the page has a toast for it).
**Actual:** An empty list and zero cards.
**Evidence:**
- Frontend: `Cimmple_UI/src/Common/Services/QualityService.ts` lines 214-238, 240-273, 368-393; `Cimmple_UI/src/Modules/Quality/Quality.tsx` lines 142-145.
**Root Cause:** Errors swallowed in the service layer.
**Business Impact:** Users assume there are no open NCRs.
**Affected Areas:** Quality list, slideout, stats.
**Recommended Fix:** Re-throw (or return an error flag) so the page can show the failure.

---

### BUG-NCR-012 — "Reported by" is taken from the client and defaults to user 1
**Severity:** Low. Audit attribution can be spoofed or wrong.
**Status:** Confirmed
**Test Area:** API / Audit
**Description:** `CreateNCR` uses `ReportedBy` from the request and falls back to user id 1 when absent.
**Steps to Reproduce:**
1. `POST /api/Quality/CreateNCR` with `reportedBy` = another user, or omit it.
**Expected:** The authenticated user is the reporter.
**Actual:** The supplied user, or user 1.
**Evidence:**
- Backend: `Cimmple_API/CimmpleAPI/Controllers/QualityController.cs` lines 936-955.
**Root Cause:** Trusting client identity fields.
**Business Impact:** Incorrect accountability on quality records.
**Affected Areas:** NCR create, reports by reporter.
**Recommended Fix:** Use `GetUserId()`.

---

### BUG-NCR-013 — CreateNCR writes the raw request body to the console log
**Severity:** Low. Personal and business data in logs (hardening).
**Status:** Confirmed
**Test Area:** API / Logging
**Description:** The raw JSON body is logged on every create.
**Steps to Reproduce:**
1. Create an NCR and inspect the API console/log stream.
**Expected:** No payload logging in production.
**Actual:** Full payload logged.
**Evidence:**
- Backend: `Cimmple_API/CimmpleAPI/Controllers/QualityController.cs` line 888.
**Root Cause:** Debug logging left in.
**Business Impact:** Data exposure through log storage.
**Affected Areas:** NCR create.
**Recommended Fix:** Remove the body log or log only ids at debug level.

---

### BUG-NCR-014 — Deletion-impact check falls back to an id-only lookup
**Severity:** Low. Reveals existence and links of another tenant's NCR.
**Status:** Confirmed
**Test Area:** Tenant / Delete
**Description:** `CheckNCRDeletionImpact` retries without the tenant filter when the NCR is not found.
**Steps to Reproduce:**
1. `GET /api/Quality/CheckNCRDeletionImpact?ncrId={id of tenant B}` from tenant A.
**Expected:** 404.
**Actual:** Impact details for tenant B's NCR.
**Evidence:**
- Backend: `Cimmple_API/CimmpleAPI/Controllers/QualityController.cs` lines 297-365 (fallback at 315-326, line 317).
**Root Cause:** Same fallback pattern as BUG-NCR-003.
**Business Impact:** Minor information disclosure; enables BUG-NCR-003.
**Affected Areas:** NCR delete dialog.
**Recommended Fix:** Remove the fallback.

---

### BUG-NCR-015 — `?open=new` does not open a new NCR, and the Dashboard "Create NCR" shortcut only opens the list
**Severity:** Low. Documented entry point does not work; users must click Create NCR again.
**Status:** Confirmed
**Test Area:** Navigation / Add
**Description:** The matrix lists the Add route as `?open=new`. `Quality.tsx` parses `open` with `parseInt`, so `"new"` becomes `NaN` and is ignored. The Dashboard quick action labelled "Create NCR" navigates to `/quality` without any parameter.
**Steps to Reproduce:**
1. Navigate to `/quality?open=new`.
2. On the Dashboard, click "Create NCR".
**Expected:** The new-NCR slideout opens (matrix Add row: `?open=new`; button label "Create NCR").
**Actual:** Only the list is shown in both cases.
**Evidence:**
- Frontend: `Cimmple_UI/src/Modules/Quality/Quality.tsx` lines 68-78; `Cimmple_UI/src/Modules/Dashboard/Dashboard.tsx` lines 563-566.
**Root Cause:** No handling of the `new` value.
**Business Impact:** Minor friction; broken shortcut.
**Affected Areas:** Quality deep links, Dashboard quick actions.
**Recommended Fix:** Treat `open=new` as "create" (`setSelectedNCRId(0); setShowSlideout(true)`) and link the Dashboard button to `/quality?open=new`.

---

## Potential Bugs

### BUG-NCR-016 — Duplicate NCR numbers under concurrent creation
**Severity:** Medium. Two NCRs can share a number.
**Status:** Potential
**Test Area:** Add
**Description:** The NCR number is computed as max + 1 per tenant (starting at 1000) without a lock or unique index.
**Steps to Reproduce:**
1. Create two NCRs at the same moment in one tenant.
**Expected:** Unique numbers.
**Actual (by code):** Both can get the same number.
**Evidence:**
- Backend: `Cimmple_API/CimmpleAPI/Controllers/QualityController.cs` lines 1004-1047.
- Database: `NonConformanceReports.NcrNumber` (no unique index).
**Root Cause:** Non-atomic numbering.
**Business Impact:** Ambiguous references with customers and suppliers.
**Affected Areas:** NCR create, PDFs, emails.
**Recommended Fix:** Use a sequence or a unique `(TenantId, NcrNumber)` index with retry.
**Why further verification is needed:** Requires concurrent requests.

---

### BUG-NCR-017 — Linked job order is not validated to belong to the tenant
**Severity:** Low. An NCR could reference another tenant's job, affecting site filtering.
**Status:** Potential
**Test Area:** Tenant / Add
**Description:** `CreateNCR` stores `JobOrderId` from the request without checking the job's tenant. The site filter then follows that job's customer order.
**Steps to Reproduce:**
1. `POST /api/Quality/CreateNCR` with `jobOrderId` of another tenant.
**Expected:** 400 "Job order not found".
**Actual (by code):** Stored.
**Evidence:**
- Backend: `Cimmple_API/CimmpleAPI/Controllers/QualityController.cs` lines 875-1253; location join 490-531.
**Root Cause:** Missing ownership validation.
**Business Impact:** Inconsistent links and visibility.
**Affected Areas:** NCR list site filter, job pointers.
**Recommended Fix:** Validate `JobOrderId` against the token tenant.
**Why further verification is needed:** Display joins may filter by tenant and hide the effect; needs runtime confirmation.

---

### BUG-NCR-018 — Schema changes are applied at runtime by the API
**Severity:** Low. Hardening and deployment-drift risk.
**Status:** Potential
**Test Area:** Database
**Description:** `EnsureNcrExternalColumnsAsync` runs `ALTER TABLE` from the controller (a similar helper exists in the PDF service).
**Steps to Reproduce:**
1. Deploy with a database user without DDL rights; call an NCR endpoint.
**Expected:** Schema managed by migrations only.
**Actual (by code):** The API attempts DDL at request time.
**Evidence:**
- Backend: `Cimmple_API/CimmpleAPI/Controllers/QualityController.cs` lines 62-91; `Cimmple_API/CimmpleAPI/Services/Pdf/DocumentPdfService.cs` line 897.
**Root Cause:** Schema patching in application code.
**Business Impact:** Failures or drift between environments; the API needs elevated DB rights.
**Affected Areas:** NCR create/update/PDF.
**Recommended Fix:** Move the columns into an EF migration and remove the runtime DDL.
**Why further verification is needed:** Impact depends on the production database permissions.

---

## Needs Manual Verification

1. **Area:** Debug endpoint exposure in production (BUG-NCR-001, BUG-NCR-004)
   **What to Test:** Against the deployed API (non-destructively), check whether `GET /api/Quality/CheckDatabase` and `GET /api/Quality/users` respond to an ordinary user; check Swagger for the debug routes.
   **Expected:** 404 / not listed.
   **Why Manual Testing Is Required:** The matrix asks to verify production exposure; Swagger is also enabled in production (`Program.cs` 236-241).
2. **Area:** PDF and email
   **What to Test:** Generate the NCR PDF and send it by email.
   **Expected:** The PDF shows the NCR details and photos; the email arrives.
   **Why Manual Testing Is Required:** Requires PDF rendering and SMTP.
3. **Area:** Photo capture on phone
   **What to Test:** Add photos from a phone camera; try 11 photos and an image over 8 MB.
   **Expected:** Camera opens; the 11th photo and the oversized image are rejected (matrix: ≤10, 8 MB).
   **Why Manual Testing Is Required:** Device behaviour.
4. **Area:** Notifications on status change
   **What to Test:** Move an NCR to Pending_Approval, Approved and Closed.
   **Expected:** Notifications reach the right users; closed date is set.
   **Why Manual Testing Is Required:** Depends on users and notification configuration (`QualityController.cs` 1397-1403, 1437-1478).
5. **Area:** Legacy photo paths
   **What to Test:** Open an NCR whose photos use legacy `/uploads/` paths.
   **Expected:** Photos load only for authorised users.
   **Why Manual Testing Is Required:** Legacy files are served from a public path under the API host (`QualityService.ts` 38-43); depends on deployed static-file configuration.

## No Issues Found

- The slideout validates title required and ≤ 200, defect ≤ total (when total > 0), and vendor + PO for External (`NonConformanceReportSlideout.tsx` 531-553).
- Photo upload enforces at most 10 photos, 8 MB each and image types on both the client (`NonConformanceReportSlideout.tsx` 48-49, 329-359) and the server (`QualityController.cs` 1804-1882).
- The slideout shows an unsaved-changes confirmation and handles 403 on load (`NonConformanceReportSlideout.tsx` 281-322).
- Delete uses `DeletionImpactDialog` and cleans job order NCR pointers (`QualityController.cs` 1664-1738).
- List filters (status, severity, category, source, customer, overdue, date range, site) are sent to the server, and `?open={id}`, `?status=` and `?severity=` deep links work (`Quality.tsx` 43-83, 114-149).
- Status values match the matrix; transitions are not enforced, as documented.
- Closed date is set when the status becomes Closed (`QualityController.cs` 1397-1403).
- PDF and email build the NCR with a tenant filter (`DocumentPdfService.cs` 893-902); the tenant is client-supplied (cross-module concern).

## QA Coverage

| Test Area | Tested | Result |
| --- | --- | --- |
| Navigation | Yes | Fail (BUG-NCR-015) |
| CRUD | Yes | Fail (BUG-NCR-002, BUG-NCR-003, BUG-NCR-007) |
| Search | Yes | Pass |
| Filters | Yes | Fail (BUG-NCR-009) |
| Sorting | Yes | Pass |
| Pagination | Yes | Pass |
| Validation | Yes | Fail (BUG-NCR-008) |
| Permissions | Partial | Fail (BUG-NCR-001, BUG-NCR-004) |
| API | Yes | Fail (BUG-NCR-001, BUG-NCR-004, BUG-NCR-011, BUG-NCR-012, BUG-NCR-013) |
| Database | Yes | Potential (BUG-NCR-016, BUG-NCR-018) |
| Business Logic | Yes | Fail (BUG-NCR-010) |
| Location | Yes | Fail (BUG-NCR-005, BUG-NCR-009, BUG-NCR-010) |
| Tenant | Yes | Fail (BUG-NCR-001, BUG-NCR-002, BUG-NCR-003, BUG-NCR-005, BUG-NCR-006, BUG-NCR-007, BUG-NCR-014); Potential (BUG-NCR-017) |
| Cross-Module | Yes | Pass (job link, NCR codes, vendor/customer pickers) |
| Responsive/PWA | No | Manual |

## Matrix Checklist

| Matrix Row | Result | Notes |
| --- | --- | --- |
| FE List (stats cards) | Fail | Cards tenant-wide (BUG-NCR-010); errors hidden (BUG-NCR-011). |
| FE Search / Filter (server) | Fail | Unlinked NCRs hidden for sites (BUG-NCR-009). |
| FE Sort / Pagination (client) | Pass | `MasterListPage`. |
| FE Add (job, step, code, vendor/PO; `?open=new`) | Fail | Server validation missing (BUG-NCR-008); `?open=new` ignored (BUG-NCR-015). |
| FE Edit (status, root cause, corrective action, approver) | Fail | Cross-tenant update (BUG-NCR-002); detail without tenant/site (BUG-NCR-005). |
| FE Photos (≤10, 8 MB) | Fail | Limits enforced; cross-tenant upload/download (BUG-NCR-006, BUG-NCR-007). |
| FE PDF / Email | Manual | Manual 2. |
| FE Delete (impact dialog) | Fail | BUG-NCR-003, BUG-NCR-014. |
| FE Validation (title ≤200, defect ≤ total, external vendor + PO) | Fail | UI enforces; server does not (BUG-NCR-008). |
| FE Permissions / Responsive | Manual | No server role checks (cross-module); Manual 3. |
| BE List/Get | Fail | BUG-NCR-005, BUG-NCR-006, BUG-NCR-009, BUG-NCR-010. |
| BE Create/Update (NCR# from 1000; notifications) | Fail | BUG-NCR-002, BUG-NCR-008, BUG-NCR-012; potential BUG-NCR-016. |
| BE Delete | Fail | BUG-NCR-003, BUG-NCR-014. |
| BE Debug endpoints (verify production exposure) | Fail | BUG-NCR-001, BUG-NCR-004; Manual 1. |
| BE Authorization (authenticated; location via job's CO) | Fail | Detail/stats/photo endpoints skip location (BUG-NCR-005, BUG-NCR-010). |
| BL Status values; transitions not enforced | Pass | As documented. |
| BL Source, severity, category, root cause stored | Pass | Stored on `NonConformanceReports`. |

## Cross-Module Concerns

| Concern | Where seen in Quality | Owner file |
| --- | --- | --- |
| Client-supplied `tenantId` trusted | `GetNCRs`, `GetNCRStats` (query), `CreateNCR` body `TenantId` (line 924), `PdfController.GenerateNCR`, `DocumentEmailController.SendNcr` | `QA_TenantLocationFramework.md` |
| No server-side role/permission enforcement | Every endpoint, including approval status changes by any user and the debug endpoints | `QA_RolesPermissions.md` |
