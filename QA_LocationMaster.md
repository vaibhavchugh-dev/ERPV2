# QA — Location Master

| Module | Matrix section | Bug ID prefix | Tested | Confirmed Bugs | Potential Bugs | Manual Verification |
| --- | --- | --- | --- | --- | --- | --- |
| Location Master | 2.4 | BUG-LOC | Yes | 4 | 3 | 5 |

Source of test cases: `QA_TEST_MATRIX.md`. Method: static trace of the actual implementation (React UI → service → Axios → .NET controller → service/repository → EF Core → SQL Server, and back). No application code, configuration or database is changed during QA. Findings that depend on deployed configuration, data or a real browser go under **Needs Manual Verification**.

Severity scale:
- **Critical**: security breach, data corruption, financial corruption, or a blocked core workflow.
- **High**: a major feature is broken or a significant security control is bypassed, with a workaround that is hard or unavailable.
- **Medium**: a feature works incorrectly in specific conditions, or a security control is weaker than configured.
- **Low**: cosmetic, minor UX, or an informational/hardening issue.

---

## Confirmed Bugs

### BUG-LOC-001 — Changing a storage location's type on edit ignores its children, producing an invalid hierarchy

**Severity:** Medium. The hierarchy rule "children must have a strictly greater type than their parent" can be broken through the normal edit form.

**Status:** Confirmed

**Test Area:** Validation / Business Logic

**Description:**
For an existing child location, the edit form shows a Type dropdown with every type greater than the parent's type (for example Warehouse, Zone, Shelf, Bin under a business site). On save, `SaveLocation` checks only `IsValidParentChild(parent.LocType, desired)`, that is, the new type against the parent. It does not check the location's existing children. A Warehouse that contains Zones and Bins can be changed to Bin, leaving Zones under a Bin. The parent picker for new locations excludes Bins (`locType < Bin`), which shows that Bins are not meant to have children.

**Steps to Reproduce:**
1. Create Business site S → Warehouse W → Zone Z.
2. Open W, change Type to "Bin / slot", and press Update.

**Expected:**
The change is rejected (or the type list is limited) because child Z (Zone, type 3) would sit under a Bin (type 5). The matrix requires a "valid parent/child type".

**Actual:**
The save succeeds; W is a Bin with a Zone child.

**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Masters/LocationMasterSlideout.tsx` lines 419–427 (`allowedChildTypes` from the parent only), 584–597 (Type dropdown on edit), 414–417 (Bins excluded as parents for new rows).
* Backend: `Cimmple_API/CimmpleAPI/Controllers/LocationController.cs` lines 189–202 (edit validates only against the parent). `Data/Models/LocationKind.cs` lines 27–34 (rule: child type strictly greater than parent).
* Database: `Locations.LocType`, `ParentLocationId`.

**Root Cause:**
The edit path validates upward but not downward.

**Business Impact:**
Inconsistent storage trees; `displayPath`, inventory put-away and location pickers that assume the type order can show or accept wrong structures.

**Affected Areas:** Location Master, Inventory (locations and transfers), any location picker filtered by type.

**Recommended Fix:**
On edit, also require `desired < min(child.LocType)` for all direct children, and limit the UI dropdown accordingly.

---

### BUG-LOC-002 — Unit/Suite cannot be cleared because it shares the Region column

**Severity:** Low. Minor address data issue visible on letterheads and lists.

**Status:** Confirmed

**Test Area:** CRUD / API

**Description:**
`Locations` has no apartment column; the API stores "Unit/Suite" in `Region` and returns the same value as both `apartment` and `region`. The slideout loads both into form state (it has no Region input) and sends both back. On save, `Region = Apartment` if Apartment is non-blank, otherwise `Region = request.Region`. When the user clears Unit/Suite, Apartment is blank, so the server falls back to `request.Region`, which still holds the old Unit/Suite value. The value can never be removed through the UI.

**Steps to Reproduce:**
1. Edit a location, enter Unit/Suite "Suite 100", save.
2. Reopen it, clear Unit/Suite, save.
3. Reopen it.

**Expected:**
Unit/Suite is empty.

**Actual:**
Unit/Suite is still "Suite 100".

**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Masters/LocationMasterSlideout.tsx` lines 71 and 76 (Apartment and Region loaded), 300–303 (whole form sent), 851–868 (Unit/Suite input; no Region input). `Common/Services/LocationService.ts` lines 115 and 120 (`apartment` and `region` both mapped).
* Backend: `Cimmple_API/CimmpleAPI/Controllers/LocationController.cs` line 179 (edit: `Region = Apartment` or fallback to `request.Region`), 236 (create), 60, 132 and 137 (`apartment` and `region` both read from `Region`).
* Database: `Locations.Region`.

**Root Cause:**
Two UI concepts mapped to one column with a fallback that resurrects the old value.

**Business Impact:**
Wrong address lines cannot be corrected by users.

**Affected Areas:** Location Master.

**Recommended Fix:**
Store Unit/Suite in its own column, or treat `Apartment` as authoritative (including empty) and stop sending `Region` from the form.

---

### BUG-LOC-003 — Location Code and Name are not validated by the API, and duplicate codes are accepted

**Severity:** Low. Data-quality gap; the UI blocks the common case, and the matrix records the missing uniqueness check.

**Status:** Confirmed

**Test Area:** Validation / Database

**Description:**
The slideout marks Code and Name as required. `SaveLocation` accepts empty values (`Code = request.Code ?? ""`). There is no uniqueness check on Code within the tenant (the matrix notes "no code uniqueness check"). Other modules resolve locations by code. For example, `ImportEmployees` maps a Location column with `FirstOrDefault(name == value || code == value)`, so duplicate codes silently pick an arbitrary site.

**Steps to Reproduce:**
1. Create two business sites both with Code "MAIN" (allowed in the UI).
2. Import an employee with Location "MAIN".

**Expected:**
Required fields are enforced server-side, and codes are unambiguous within a tenant.

**Actual:**
Both sites save; the import maps the employee to whichever site is returned first.

**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Masters/LocationMasterSlideout.tsx` lines 191–200 (Code and Name required in UI only).
* Backend: `Cimmple_API/CimmpleAPI/Controllers/LocationController.cs` lines 176–177 and 229–230 (no required/unique checks). `Controllers/EmployeeController.cs` lines 924–926 (lookup by name or code).
* Database: `Locations` has an index on (TenantId, ParentLocationId) only; no unique constraint on code.

**Root Cause:**
Validation exists only in the React form.

**Business Impact:**
Ambiguous site selection in imports, and unnamed locations if the API is called directly.

**Affected Areas:** Location Master, Employee import, any lookup by location code.

**Recommended Fix:**
Require Code and Name in `SaveLocation`, and enforce code uniqueness per tenant (or per parent, if that is the intended scope).

---

### BUG-LOC-004 — Location API error responses expose stack traces

**Severity:** Low. Information disclosure / hardening.

**Status:** Confirmed

**Test Area:** API / Security

**Description:**
`UploadLogo` returns `innerException` and `details = ex.StackTrace`; `CheckLocationDeletionImpact` and `DeleteLocation` return `stackTrace = ex.StackTrace` on 500.

**Steps to Reproduce:**
1. Cause a server error in `UploadLogo` (for example a storage permission problem).
2. Inspect the 500 response.

**Expected:**
A generic message; details only in server logs.

**Actual:**
The stack trace and inner exception are returned.

**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Masters/LocationMasterSlideout.tsx` lines 340–347 (logs `innerException` from the response).
* Backend: `Cimmple_API/CimmpleAPI/Controllers/LocationController.cs` lines 390–403, 537, 606.
* Database: not applicable.

**Root Cause:**
Debug-style error handling.

**Business Impact:**
Exposes file-system paths and implementation details.

**Affected Areas:** Location API.

**Recommended Fix:**
Log server-side and return generic messages.

---

## Potential Bugs

### BUG-LOC-005 — SVG logos (allowed by the UI and API) are unlikely to render in PDF letterheads

**Severity:** Medium. The logo feature is accepted for SVG but would silently show a "LOGO" placeholder on every quotation, order and invoice PDF.

**Status:** Potential

**Test Area:** Business Logic / Cross-Module

**Description:**
UI and API accept `.svg` logos. PDF generation resolves the logo file and renders it with QuestPDF `Image(Image.FromFile(path))`. That API decodes raster formats; SVG requires QuestPDF's separate SVG API. The call is wrapped in `try/catch` that falls back to a grey "LOGO" placeholder, so an SVG logo would fail silently.

**Steps to Reproduce:**
1. Upload an SVG logo to a business site.
2. Generate a quotation or invoice PDF for a document at that site.

**Expected:**
The logo appears in the letterhead (matrix 2.4: "The location logo is used in PDF letterheads").

**Actual (expected from code):**
A "LOGO" placeholder box appears.

**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Masters/LocationMasterSlideout.tsx` lines 696–700 (`image/svg+xml` allowed).
* Backend: `Cimmple_API/CimmpleAPI/Controllers/LocationController.cs` lines 268–274 (`.svg` allowed). `Services/Pdf/DocumentPdfService.cs` lines 1253–1308 (logo path from `LogoAttachment`). `Services/Pdf/Templates/BaseDocumentTemplate.cs` lines 38–59 and 162–170 (`Image.FromFile`, catch → placeholder).
* Database: `LogoAttachment.UploadFile`.

**Root Cause:**
The upload whitelist includes a format that the PDF renderer path does not support.

**Business Impact:**
Customer-facing documents without the company logo.

**Affected Areas:** Location Master logo, all document PDFs.

**Recommended Fix:**
Render SVG with QuestPDF's SVG support (or rasterise on upload), or remove SVG from the whitelist.

**Why further verification is needed:** The QuestPDF version in use and its SVG handling were not confirmed at runtime; generating one PDF with an SVG logo will settle it.

---

### BUG-LOC-006 — Location delete does not check transactional references (orders, invoices, banks, receiving, attendance, employees' starting site)

**Severity:** Medium. Deleting a site that is still referenced leaves documents pointing to a non-existent location, which hides them from site-restricted users.

**Status:** Potential

**Test Area:** Business Logic / Database / Cross-Module

**Description:**
`DeleteLocation` blocks only on child locations, `InventoryBalance`, `InventoryLotBalance` and `InventoryTransaction`, which is exactly the matrix list. However, many other tables store a location id with no FK: `CustomerOrder.locationId`, `InvoiceMaster.locationId`, `BankMaster.locationId`, `VendorOrder.LocationId`, `VendorReceiving.LocationId`, `VendorInvoicing.LocationId`, `JobMaster.locationId`, `InventoryReservation.LocationId`, `FaceAttendanceLog.LocationId`, `PayrollJournalLink.LocationId`, `Document.LocationId`, `ReportSchedule.LocationId` and `UserDetails.DefaultLocationId`. Deleting a business site that has orders, banks or invoices succeeds. Afterwards those records belong to no valid site: restricted users never see them, PDFs fall back to the tenant's `EntityMaster` header, and employees keep a starting location that no longer exists. The impact dialog lists only user mappings and logos.

**Steps to Reproduce:**
1. Create business site S2 with a bank and a customer order assigned to it (no inventory).
2. Delete S2 from Location Master.
3. As a user restricted to the remaining sites, open the bank and order lists.

**Expected:**
Either the delete is blocked while such references exist, or the impact dialog lists them so the user can decide.

**Actual (expected from code):**
The delete succeeds; the bank and order become orphaned.

**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Masters/LocationMasterSlideout.tsx` lines 227–259 (dialog shows server impact only).
* Backend: `Cimmple_API/CimmpleAPI/Controllers/LocationController.cs` lines 473–529 (impact), 554–564 (blockers), 566–570 (only `UserMapping` removed). Location id columns: `Data/Models/CustomerOrder.cs` line 21, `InvoiceMaster.cs` line 64, `BankMaster.cs` line 14, `VendorOrder.cs` line 32, `VendorReceiving.cs` line 26, `InventoryReservation.cs` line 22, `Punch/FaceAttendanceLog.cs` line 13, `UserDetail.cs` line 65.
* Database: only `InventoryBalance`, `InventoryTransaction`, `InventoryLotBalance` and `RawMaterialMaster.DefaultLocation` have FKs to `Locations` (`CimmpleDbContext.cs` lines 593–618, 643–646, 681–684).

**Root Cause:**
The blocker list covers inventory only.

**Business Impact:**
Lost visibility of financial and operational records for restricted users; letterheads revert to the default company header.

**Affected Areas:** Location Master, Bank Master, Orders, Invoices, Purchasing, Attendance, Payroll links.

**Recommended Fix:**
Add blockers (or at least impact warnings) for the tables above, and clear or reassign `UserDetails.DefaultLocationId`.

**Why further verification is needed:** The matrix lists only inventory blockers, so whether deleting a site with orders or banks should be blocked is a product decision.

---

### BUG-LOC-007 — Uploaded logos are served as public static files, including SVG with active content

**Severity:** Low. Hardening; the upload itself requires authentication.

**Status:** Potential

**Test Area:** Security / Documents

**Description:**
Logos are written to `wwwroot/uploads/logos/{tenant}/{location}/logo_<timestamp>.<ext>` and served by `app.UseStaticFiles()` without authentication. Logos are not secret. However, an SVG containing script uploaded by any authenticated user would be served from the API origin as `image/svg+xml` and executed when opened directly.

**Steps to Reproduce:**
1. Upload an SVG logo containing `<script>alert(document.domain)</script>`.
2. Open the returned `logoUrl` directly in the browser.

**Expected:**
Uploaded SVGs are sanitised, or served as attachments.

**Actual (expected from code):**
The script runs in the API origin.

**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Masters/LocationMasterSlideout.tsx` lines 92–93 (preview loads from the backend host).
* Backend: `Cimmple_API/CimmpleAPI/Controllers/LocationController.cs` lines 304–323 (written under `wwwroot`), 268–274 (`.svg` allowed); `Program.cs` line 250 (`UseStaticFiles`).
* Database: `LogoAttachment.UploadFile`.

**Root Cause:**
User-supplied SVG is stored and served unchanged.

**Business Impact:**
Stored XSS on the API origin if tokens or cookies are reachable there.

**Affected Areas:** Location logo, static file hosting.

**Recommended Fix:**
Sanitise or rasterise SVG on upload, or serve logos with `Content-Disposition: attachment` and `X-Content-Type-Options: nosniff`.

**Why further verification is needed:** The impact depends on whether the UI and API share an origin and on the static-file content-type configuration in deployment.

---

## Needs Manual Verification

1. **Area:** Inactive locations
   **What to Test:** Set a business site to Inactive and check the site switcher, Employee location picker, Bank/Order site pickers and login claims.
   **Expected:** Per product decision. Today only `InventoryController` checks `Status` (line 872); claims and pickers do not filter by status.
   **Why Manual Testing Is Required:** The matrix does not define what Inactive should do.

2. **Area:** Logo upload, replace and delete
   **What to Test:** Upload a PNG ≤ 5 MB to a business site, replace it, remove it with the × button, and try a 6 MB file and a `.bmp`.
   **Expected:** Upload, replace and delete work; oversize and wrong type are rejected in the UI and API.
   **Why Manual Testing Is Required:** It depends on file-system permissions under `wwwroot` in the deployed environment.

3. **Area:** PDF letterhead
   **What to Test:** Generate quotation, order and invoice PDFs for documents at a site with a PNG logo and at a site without one.
   **Expected:** Site name, address and logo in the header; fallback to the company header when the site has no data.
   **Why Manual Testing Is Required:** It needs PDF rendering (see BUG-LOC-005).

4. **Area:** Hierarchy display
   **What to Test:** A deep tree (site → warehouse → zone → shelf → bin) in the list Path column and the parent picker.
   **Expected:** Correct `displayPath` and parent options.
   **Why Manual Testing Is Required:** Visual check in a browser.

5. **Area:** Responsive layout
   **What to Test:** List and slideout on phone and tablet widths.
   **Expected:** Usable layout.
   **Why Manual Testing Is Required:** It needs a real browser.

## No Issues Found

- Navigation: `/masters/location`, the sidebar entry, the System Settings link and global-search `?open=<id>` links work (`LocationMaster.tsx` lines 52–63).
- Search covers 11 fields; the All/Active/Inactive filter, sorting on every column and client pagination work.
- Parent rules: the parent is fixed after create; top-level rows are always Business sites; new children default to parent type + 1 and are validated with `LocationKind.IsValidParentChild`. Parent lookups are tenant-filtered.
- Logo: business sites only, jpg/jpeg/png/gif/svg, ≤ 5 MB, enforced in both UI and API; old logo files are removed on replace and delete; logo records are tenant-filtered.
- Delete is blocked by child locations, `InventoryBalance`, `InventoryLotBalance` and `InventoryTransaction` in both the impact check and `DeleteLocation` itself; `UserMapping` rows and logo files are removed with the location.
- `GetLocations` and `GetLocationById` filter by tenant; the self-referencing FK uses `Restrict`.
- The unsaved-changes prompt is implemented on Cancel and overlay click.

## QA Coverage

| Test Area | Tested | Result |
| --- | --- | --- |
| Navigation | Yes | Pass |
| CRUD | Yes | Fail (BUG-LOC-002) |
| Search | Yes | Pass |
| Filters | Yes | Pass |
| Sorting | Yes | Pass |
| Pagination | Yes | Pass |
| Validation | Yes | Fail (BUG-LOC-001, BUG-LOC-003) |
| Permissions | Yes | No module-specific issue; see Cross-Module Concerns |
| API | Yes | Fail (BUG-LOC-004) |
| Database | Yes | Pass with potential issue (BUG-LOC-006) |
| Business Logic | Yes | Fail (BUG-LOC-001; potential BUG-LOC-005, BUG-LOC-006) |
| Location | Yes | Potential issue (BUG-LOC-006); Inactive semantics manual item 1 |
| Tenant | Yes | Module-specific filters present; tenant trust is cross-module |
| Cross-Module | Yes | Potential issues (BUG-LOC-005 PDFs, BUG-LOC-006 references) |
| Responsive/PWA | No | Manual verification required (item 5) |

## Matrix Checklist

| Matrix Row | Result | Notes |
| --- | --- | --- |
| FE List — `LocationMaster.tsx`, GET `/Location/GetLocations` | Pass | |
| FE Search — 11 fields (client) | Pass | Code, name, address, city, state, country, email, phone, path, type, parent. |
| FE Filter — All / active / inactive | Pass | |
| FE Sort / Pagination — client | Pass | All columns sortable. |
| FE Add / Edit — type, parent, address; GetLocationById, SaveLocation; `?open=` | Fail | BUG-LOC-001, BUG-LOC-002. |
| FE Logo — business sites only, jpg/jpeg/png/gif/svg ≤ 5 MB; UploadLogo / DeleteLogo | Pass with potential issues | Rules enforced; BUG-LOC-005, BUG-LOC-007. |
| FE Delete — DeletionImpactDialog; CheckLocationDeletionImpact, DeleteLocation | Pass with potential issue | Inventory blockers enforced; BUG-LOC-006. |
| FE Validation — Code, Name required (UI only); valid parent/child type | Fail | BUG-LOC-001 (type on edit), BUG-LOC-003 (UI-only required). |
| FE Permissions — `/masters/location` | Cross-module | Owned by `QA_RolesPermissions.md`. |
| FE Responsive — list, slideout | Manual | Manual item 5. |
| BE List/Get — GetLocations, GetLocationById | Pass | Tenant filter (from request). |
| BE Create/Update — SaveLocation, `LocationKind.IsValidParentChild` | Fail | Create correct; edit ignores children (BUG-LOC-001). |
| BE Logo — UploadLogo, DeleteLogo; `LogoAttachment` | Pass with issues | BUG-LOC-004 (stack trace); potential BUG-LOC-007. |
| BE Delete — impact, delete (removes `UserMapping`); parent FK Restrict | Pass | Blockers re-checked in `DeleteLocation`. |
| BE Validation — parent fixed after create; top level = BusinessSite; no code uniqueness check | Pass with issue | Behaviour matches the matrix; consequences logged in BUG-LOC-003. |
| BE Authorization — authenticated | Cross-module | See Cross-Module Concerns. |
| BL — Delete blocked by child locations, InventoryBalance, InventoryLotBalance, InventoryTransaction | Pass | `LocationController.cs` lines 503–529 and 554–564. |
| BL — Location logo used in PDF letterheads | Pass with potential issue | PNG/JPG path traced; SVG in BUG-LOC-005. |

## Cross-Module Concerns

| Concern | Owner | Affected endpoints / evidence |
| --- | --- | --- |
| The tenant id comes from the query, form or body and is not compared with the token's tenant. | `QA_TenantLocationFramework.md` | `GET /Location/GetLocations?tenantid` (`LocationController.cs` 29–75), `GET GetLocationById?tenantId` (92–156), `POST SaveLocation` (`TenantId` in body, 158–256), `POST UploadLogo` (`tenantId` form field, 258–405), `DELETE DeleteLogo?tenantId` (407–448), `GET CheckLocationDeletionImpact?tenantId` (450–539), `DELETE DeleteLocation?tenantId` (541–608). |
| No location scope on Location Master: a site-restricted user can list, edit and delete every site in the tenant, including sites they cannot access. | `QA_TenantLocationFramework.md` | All endpoints above; no `CanAccessLocation` call in `LocationController`. The matrix states only Bank and Employee lists filter by site on the server. |
| No server-side role/permission check: any authenticated user can create, change or delete locations and logos. | `QA_RolesPermissions.md` | All endpoints above. |
