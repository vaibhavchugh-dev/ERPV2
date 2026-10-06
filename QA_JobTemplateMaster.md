# QA — Job Template Master

| Module | Matrix section | Bug ID prefix | Tested | Fix Tested | Confirmed Bugs | Potential Bugs | Manual Verification |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Job Template Master | 2.7 | BUG-JT | Yes | Yes | 8 | 1 | 5 |

Source of test cases: `QA_TEST_MATRIX.md`. Method: static trace of the actual implementation (React UI → service → Axios → .NET controller → service/repository → EF Core → SQL Server, and back). No application code, configuration or database is changed during QA. Findings that depend on deployed configuration, data or a real browser go under **Needs Manual Verification**.

Severity scale:
- **Critical**: security breach, data corruption, financial corruption, or a blocked core workflow.
- **High**: a major feature is broken or a significant security control is bypassed, with a workaround that is hard or unavailable.
- **Medium**: a feature works incorrectly in specific conditions, or a security control is weaker than configured.
- **Low**: cosmetic, minor UX, or an informational/hardening issue.

---

## Confirmed Bugs

### BUG-JT-001 — Attachment links open against the UI host, so drawings cannot be viewed or downloaded
**Severity:** High. The attachments feature (drawings, inspection docs) is unusable from the UI with no in-app workaround.
**Status:** Confirmed
**Test Area:** Attachments / Cross-Module
**Description:** Uploaded files are stored under the API's `wwwroot` and `FileUrl` is saved as a root-relative path (`/uploads/jobtemplates/{tenant}/{id}/{file}`). The slideout renders `<a href={attachment.fileUrl}>` directly. The UI and API are on different origins (`localhost:3000` vs `localhost:5172` in dev; UI host vs `api.v2.cimmple.net` in prod), and the UI has no proxy, so the link resolves to the UI host, which serves the SPA (or 404) instead of the file. Other modules prefix the API host for the same kind of path.
**Steps to Reproduce:**
1. Open a saved job template → Attachments tab, upload a PDF.
2. Click the attachment name.
**Expected:** The PDF opens from the API host.
**Actual:** A new tab opens `https://<ui-host>/uploads/jobtemplates/...`, which returns the SPA shell / not found.
**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Masters/JobTemplateMasterSlideout.tsx` lines 1796-1803 (`href={attachment.fileUrl}`); `Cimmple_UI/src/Common/Services/JobTemplateService.ts` line 73 (no URL rewriting); contrast `Cimmple_UI/src/Modules/Masters/LocationMasterSlideout.tsx` line 92 and `Cimmple_UI/src/Common/Services/QualityService.ts` lines 40-41 (API host prefixed).
* Backend: `Cimmple_API/CimmpleAPI/Controllers/JobTemplateController.cs` lines 856-879 (stored in API `wwwroot`, relative `FileUrl`).
* Database: `CimmpleFlow.JobTemplateAttachment.FileUrl`.
**Root Cause:** Relative URL used across origins.
**Business Impact:** Operators cannot open the drawings attached to templates.
**Affected Areas:** Job Template attachments (upload works; view/download broken).
**Recommended Fix:** Build the link from `API_ROOT.backendHost` (minus `/api`) as other modules do, or return an absolute URL / authenticated download endpoint from the API.

---

### BUG-JT-002 — Template material lines accept product/raw-material IDs from another tenant
**Severity:** High. A tenant-isolation control is missing on child references; another tenant's part numbers/names are disclosed and copied into job orders.
**Status:** Confirmed
**Test Area:** Tenant / Validation / Cross-Module
**Description:** `SaveJobTemplate` validates that process and workstation IDs belong to the tenant, but material lines insert any `ProductId`/`RawMaterialId > 0` without checking existence or tenant. `GetJobTemplateById` then returns `m.Product.partno`/`m.RawMaterial.PartNo` and names via navigation properties, and applying the template to a job order copies those lines. A non-existent id causes an FK violation and a 500 with stack trace.
**Steps to Reproduce:**
1. As tenant A, POST `/api/JobTemplate/SaveJobTemplate` with a valid template and `Materials: [{ "RawMaterialId": <tenant B raw material id>, "Quantity": 1 }]`.
2. GET `/api/JobTemplate/GetJobTemplateById?id=<new id>`.
**Expected:** 400 "Raw material not found" for ids outside the tenant.
**Actual:** Saved; the response includes tenant B's part number and name. Iterating ids enumerates another tenant's catalogue.
**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Masters/JobTemplateMasterSlideout.tsx` lines 157-192 (UI only offers own-tenant items; API is the control).
* Backend: `Cimmple_API/CimmpleAPI/Controllers/JobTemplateController.cs` lines 510-533 (no check), lines 939-1042 (`Validate` checks processes/workstations only), lines 317-335 (material names via navigation); `Cimmple_UI/src/Modules/JobOrders/JobOrderSlideout.tsx` lines 1306-1400 (template materials copied to job).
* Database: `CimmpleFlow.JobTemplateMaterial.ProductId/RawMaterialId` (FK Restrict, no tenant constraint; `CimmpleDbContext.cs` lines 225-312).
**Root Cause:** Missing tenant ownership validation for material references.
**Business Impact:** Cross-tenant data disclosure and cross-tenant references in templates and resulting job material requirements.
**Affected Areas:** Job Template save/get, Job Order apply-template (Job Order material requirements have the same gap; see Cross-Module Concerns).
**Recommended Fix:** In `Validate`, verify every ProductId/RawMaterialId exists with `Tenantid == request.Tenantid`.

---

### BUG-JT-003 — Material lines with quantity 0 (or a cleared quantity) are silently dropped on save
**Severity:** Medium. Data entered by the user disappears without warning.
**Status:** Confirmed
**Test Area:** Forms / Validation
**Description:** The quantity input allows 0 (`min={0}`) and converts an empty field to 0. The UI validation does not check material quantity. The backend `continue`s on `Quantity <= 0`, so the line is not saved and no error is returned.
**Steps to Reproduce:**
1. Open a template → Materials, add a raw-material line, clear the quantity (or type 0).
2. Save, then reopen the template.
**Expected:** Validation error "Quantity must be greater than 0", or the line saved as entered.
**Actual:** "Job template updated successfully", but the material line is gone.
**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Masters/JobTemplateMasterSlideout.tsx` lines 1163-1177 (min 0, empty → 0), lines 485-538 (no material checks).
* Backend: `Cimmple_API/CimmpleAPI/Controllers/JobTemplateController.cs` lines 519-520.
* Database: `CimmpleFlow.JobTemplateMaterial`.
**Root Cause:** Server silently filters instead of validating; UI does not validate.
**Business Impact:** Bill-of-material lines vanish from templates, so jobs created later lack required materials.
**Affected Areas:** Job Template save; Job Orders created from the template.
**Recommended Fix:** Validate quantity > 0 in the UI and return a 400 from the API instead of skipping.

---

### BUG-JT-004 — Job template attachments are served anonymously and SVG uploads are allowed
**Severity:** Medium. Access control on uploaded drawings is weaker than the rest of the API (authenticated fallback policy).
**Status:** Confirmed
**Test Area:** Security / Attachments
**Description:** `app.UseStaticFiles()` runs before `UseAuthentication`/`UseAuthorization`, so anything under `wwwroot/uploads/jobtemplates/...` is downloadable without a token by anyone who has or guesses the URL (tenant id, sequential template id, millisecond timestamp). `.svg` is in the allow-list; an SVG opened directly from the API origin can execute script in that origin.
**Steps to Reproduce:**
1. Upload a file to a template; note its `FileUrl`.
2. In a private window (no login), open `https://<api-host><FileUrl>`.
**Expected:** 401/403 for unauthenticated requests.
**Actual:** File is returned.
**Evidence:**
* Frontend: n/a
* Backend: `Cimmple_API/CimmpleAPI/Program.cs` lines 250-253; `Cimmple_API/CimmpleAPI/Controllers/JobTemplateController.cs` lines 31-36 (`.svg` allowed), lines 856-879 (predictable path).
* Database: `CimmpleFlow.JobTemplateAttachment.FileUrl`.
**Root Cause:** Public static-file middleware used for tenant documents.
**Business Impact:** Customer drawings and inspection documents can leak outside the tenant.
**Affected Areas:** Job Template attachments (root cause is shared with other `wwwroot/uploads` features).
**Recommended Fix:** Serve attachments through an authorized, tenant-checked download endpoint (or move uploads outside `wwwroot`); drop `.svg` or serve it with `Content-Disposition: attachment`.

---

### BUG-JT-005 — API accepts negative setup, cycle and estimated times on operations
**Severity:** Low. Invalid values are possible only via direct API calls or bypassing HTML `min`.
**Status:** Confirmed
**Test Area:** Validation / API
**Description:** `Validate` checks sequence, process and workstation but not time fields. Negative values are saved and summed into template totals.
**Steps to Reproduce:**
1. POST `SaveJobTemplate` with an operation `SetupTimeMinutes: -60`.
2. Open the template; totals show reduced time.
**Expected:** 400 "Times must be ≥ 0".
**Actual:** Saved.
**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Masters/JobTemplateMasterSlideout.tsx` lines 419-429 (totals sum setup + cycle).
* Backend: `Cimmple_API/CimmpleAPI/Controllers/JobTemplateController.cs` lines 939-1042, 493-508.
* Database: `CimmpleFlow.JobTemplateOperation`.
**Root Cause:** No server-side range validation.
**Business Impact:** Wrong planning estimates in templates and derived routings.
**Affected Areas:** Job Template save, Job Order routing derived from templates.
**Recommended Fix:** Reject negative time values in `Validate`.

---

### BUG-JT-006 — Inactive processes, workstations and raw materials still used by a template display as blank
**Severity:** Low. Display issue that hides what the template actually references.
**Status:** Confirmed
**Test Area:** Forms / Cross-Module
**Description:** Lookups drop inactive processes, workstations and raw materials. When an existing template references one of them, the `<select>` has no matching `<option>`, so it shows "Select…"/"None" although the id is still stored and re-saved.
**Steps to Reproduce:**
1. Deactivate a raw material used on a template (Raw Material deactivation is not blocked by template usage).
2. Open the template → Materials.
**Expected:** The line shows the item with an "(Inactive)" marker, as Raw Material Master does for default locations.
**Actual:** The item column shows "Select…".
**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Masters/JobTemplateMasterSlideout.tsx` lines 165-169, 182-192 (filters), lines 1135-1160 (material select), lines 1355-1394 (operation selects).
* Backend: n/a
* Database: n/a
**Root Cause:** No fallback option for the current value when it is inactive.
**Business Impact:** Users cannot see which item is referenced and may re-pick incorrectly.
**Affected Areas:** Job Template operations and materials.
**Recommended Fix:** Append the currently selected inactive item as a labelled option.

---

### BUG-JT-007 — After creating a template the slideout closes, contradicting the "You can now attach…" message
**Severity:** Low. Minor UX contradiction; the user must reopen the record to attach files.
**Status:** Confirmed
**Test Area:** CRUD / Attachments
**Description:** The code comment says the form should stay open on the Attachments tab after creation and a toast says "You can now attach drawings and documents to this template", but `onClose(true)` runs immediately afterwards.
**Steps to Reproduce:**
1. Create a new template and click Save.
**Expected:** Form stays open on the Attachments tab.
**Actual:** Toast appears and the slideout closes.
**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Masters/JobTemplateMasterSlideout.tsx` lines 564-570.
* Backend: n/a
* Database: n/a
**Root Cause:** Unconditional `onClose(true)`.
**Business Impact:** Extra steps to attach drawings.
**Affected Areas:** Job Template create.
**Recommended Fix:** When creating, reload the saved template and switch to the Attachments tab instead of closing.

---

### BUG-JT-008 — Delete failures show a generic Axios message instead of the server reason
**Severity:** Low. The user is not told why a delete failed.
**Status:** Confirmed
**Test Area:** Error Handling
**Description:** Delete and impact error toasts use `error.message` ("Request failed with status code 400") instead of the API `{ error }` (e.g. "Protected system templates cannot be deleted").
**Steps to Reproduce:**
1. Call delete on a system template (e.g. stale UI where the template became system), or cause any 400 from `DeleteJobTemplate`.
**Expected:** Backend reason shown.
**Actual:** Generic Axios text.
**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Masters/JobTemplateMasterSlideout.tsx` lines 616, 633.
* Backend: `Cimmple_API/CimmpleAPI/Controllers/JobTemplateController.cs` lines 778-821.
* Database: n/a
**Root Cause:** `error.response.data.error` not read.
**Business Impact:** Confusing errors.
**Affected Areas:** Job Template delete.
**Recommended Fix:** Prefer `error?.response?.data?.error`, as the save handler does.

---

## Potential Bugs

### BUG-JT-009 — Server-side paging can repeat or skip templates when sorting by non-unique columns
**Severity:** Medium. Records can be missed while paging the list.
**Status:** Potential
**Test Area:** Sorting / Pagination
**Description:** `ApplySort` orders by a single column (status, category, revision, dates, etc.) with no tie-breaker before `Skip/Take`. SQL Server does not guarantee a stable order for ties, so the same template can appear on two pages and another on none.
**Steps to Reproduce:**
1. Have 30+ templates with the same status; sort by Status with page size 10.
2. Page through and compare template codes across pages.
**Expected:** Every template appears exactly once.
**Actual:** Possible duplicates/omissions across pages.
**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Masters/JobTemplateMaster.tsx` lines 118-143, 515-526.
* Backend: `Cimmple_API/CimmpleAPI/Controllers/JobTemplateController.cs` lines 126-130, 1080-1103.
* Database: `CimmpleFlow.JobTemplateMaster`.
**Root Cause:** Non-deterministic ORDER BY with OFFSET/FETCH.
**Business Impact:** Users may not find templates while browsing.
**Affected Areas:** Job Template list.
**Recommended Fix:** Add `.ThenBy(t => t.Id)` to every sort.
**Why further verification is needed:** Depends on the SQL Server execution plan and data volume.

---

## Needs Manual Verification

1. **Area:** Forms / hidden-tab constraint validation
   **What to Test:** Enter an invalid value on the Operations tab (e.g. negative setup time with `min=0`) or Revision 0, switch to the General tab and click Save.
   **Expected:** A visible error that points to the invalid field.
   **Why Manual Testing Is Required:** Inactive tabs are `display:none` (`CustomerMasterSlideout.scss` line 181, imported by the template SCSS); browsers block form submission on hidden invalid controls without a visible message. Browser-specific.
2. **Area:** Attachments — size limit
   **What to Test:** Upload a 20–25 MB file.
   **Expected:** Accepted (limit 25 MB, `JobTemplateController.cs` line 38).
   **Why Manual Testing Is Required:** Kestrel/IIS/reverse-proxy request limits may reject it before the controller.
3. **Area:** Category facet "match any"
   **What to Test:** Call `GetJobTemplates` with `matchMode=any` and two category values.
   **Expected:** Templates with either category.
   **Why Manual Testing Is Required:** The UI never sends `matchMode`, so only "all" is reachable from the list.
4. **Area:** Export
   **What to Test:** Export with filters/search applied on a tenant with many templates.
   **Expected:** CSV contains all matching rows (export uses `pageSize: 0`).
   **Why Manual Testing Is Required:** Volume/time-out behaviour.
5. **Area:** Responsive / slideout
   **What to Test:** Operations and Materials tables, Move up/down, attachments list at 375–430 px.
   **Expected:** Horizontal scroll, reachable controls.
   **Why Manual Testing Is Required:** Visual layout.

## No Issues Found

- List: server-side search (debounced), status filter, category facets, sort keys and paging; `pageSize=0` export; column chooser.
- Validation (UI and API): name and code required; code unique per tenant (also DB unique index `(Tenantid, TemplateCode)`); revision ≥ 1; Effective To ≥ Effective From; at least one operation; each operation needs a process; sequence positive and unique (DB unique index `(JobTemplateId, SequenceNumber)`).
- Process and workstation ids on operations are validated against the tenant; category values validated against the tenant.
- Add operation uses max + 10; move up/down renumbers in steps of 10; totals sum setup + cycle.
- Save runs in a transaction and replaces operations/materials/categories.
- Clone copies operations, materials and categories with a new code; attachments are not copied (files stay with the source).
- Delete: system templates blocked; impact warns that existing job orders are not affected; children cascade-delete; job orders keep `JobTemplateId/Code/Revision` without an FK (by design).
- Attachment upload: extension allow-list and 25 MB size check; "Save the template first" shown for new templates; upload errors surface the server message.
- Template picker in Job Orders defaults to active templates; applying a template copies routing and materials as-is (not multiplied), matching the service comment.

## QA Coverage

| Test Area | Tested | Result |
| --- | --- | --- |
| Navigation | Yes | Pass |
| CRUD | Yes | Fail (BUG-JT-003, BUG-JT-007, BUG-JT-008) |
| Search | Yes | Pass |
| Filters | Yes | Pass (match-any: Manual) |
| Sorting | Yes | Potential (BUG-JT-009) |
| Pagination | Yes | Potential (BUG-JT-009) |
| Validation | Yes | Fail (BUG-JT-003, BUG-JT-005) |
| Permissions | Partial | Manual (cross-cutting) |
| API | Yes | Fail (BUG-JT-002, BUG-JT-005) |
| Database | Yes | Pass |
| Business Logic | Yes | Fail (BUG-JT-003) |
| Location | Yes | N/A (tenant-wide master) |
| Tenant | Yes | Fail (BUG-JT-002) |
| Cross-Module | Yes | Fail (BUG-JT-001, BUG-JT-002, BUG-JT-006) |
| Responsive/PWA | Partial | Manual |

## Matrix Checklist

| Matrix Row | Result | Notes |
| --- | --- | --- |
| FE List — `JobTemplateMaster.tsx`, `/masters/jobtemplate`, GET `GetJobTemplates` | Pass | |
| FE Search — code, name, description (server, `search`) | Pass | Debounced; `JobTemplateController.cs` lines 81-88. |
| FE Filter — status; category facets (OR within type, AND across types, `matchMode=any`) | Pass / Manual | Default "all" logic correct (lines 99-122); UI never sends `matchMode=any` (Manual 3). |
| FE Sort — server `sortBy` / `sortDir` | Potential | BUG-JT-009 (no tie-breaker). |
| FE Pagination — server `page` / `pageSize` | Potential | BUG-JT-009. |
| FE Export — CSV via `pageSize=0` | Pass / Manual | Volume: Manual 4. |
| FE Add / Edit — `JobTemplateMasterSlideout.tsx` (operations, materials, categories, attachments), `?open=`; GET by id; POST `SaveJobTemplate` | Fail | BUG-JT-003, BUG-JT-006, BUG-JT-007. |
| FE Clone — new code required; POST `CloneJobTemplate` | Pass | Attachments intentionally not copied. |
| FE Attachments — ≤ 25 MB, allowed extensions; POST `UploadJobTemplateAttachment`, DELETE `DeleteJobTemplateAttachment` | Fail | BUG-JT-001 (links), BUG-JT-004 (anonymous access, `.svg`); server limits Manual 2. |
| FE Delete — `DeletionImpactDialog`; impact, delete | Fail | BUG-JT-008 (error text). |
| FE Validation — code, name required; revision ≥ 1; Effective To ≥ From; ≥ 1 operation with process; sequence positive and unique | Pass | Hidden-tab browser validation: Manual 1. Material quantity not validated (BUG-JT-003). |
| FE Permissions / Responsive — `/masters/jobtemplate` | Manual | |
| BE List/Get — `GetJobTemplates`, `GetJobTemplateById` | Fail | Material names resolved across tenants (BUG-JT-002). |
| BE Create/Update — `SaveJobTemplate`, `CloneJobTemplate` | Fail | BUG-JT-002, BUG-JT-003, BUG-JT-005. |
| BE Delete — impact, delete (cascades operations, materials, tags, files) | Pass | Children removed and physical files deleted (`JobTemplateController.cs` lines 796-813). |
| BE Files — upload/delete attachment (`wwwroot/uploads/jobtemplates/{tenant}/{id}`) | Fail | BUG-JT-001, BUG-JT-004. |
| BE Validation — code unique; process ids exist; sequence rules; unique (Tenantid, TemplateCode); unique (JobTemplateId, SequenceNumber) | Pass | Materials not validated (BUG-JT-002); times not validated (BUG-JT-005). |
| BE Authorization — authenticated | Fail | API endpoints authenticated; static attachment files are not (BUG-JT-004). |
| BL — Routing total = setup minutes + cycle minutes | Pass | `JobTemplateMasterSlideout.tsx` lines 419-429; negative inputs possible via API (BUG-JT-005). |
| BL — Operations are renumbered in steps of 10 | Pass | Lines 265-286, 400-417. |
| BL — System templates can't be deleted | Pass | UI hides Delete; API returns "Protected system templates cannot be deleted" (line 793). |
| BL — Existing JOs are unaffected by template changes | Pass | Steps/materials are copied into the JO on apply; `JobOrderMaster.JobTemplateId` has no FK. |

## Cross-Module Concerns

| Concern | Affected endpoints | Owner / root file |
| --- | --- | --- |
| Client-supplied `tenantId` (query/body/form) trusted without comparison to the token tenant | All `/api/JobTemplate/*` endpoints | `QA_TenantLocationFramework.md` |
| No server-side role/permission enforcement | All `/api/JobTemplate/*` endpoints | `QA_RolesPermissions.md` |
| `UseStaticFiles` before authentication exposes all `wwwroot/uploads` content | `Program.cs` line 250 (shared by every upload feature) | Shared root cause; module impact logged as BUG-JT-004 |
| Job order material requirements also accept product/raw-material ids without a tenant check | `JobOrderController.cs` lines 1155-1188 | Job Order audit (template lines propagate there, BUG-JT-002) |

