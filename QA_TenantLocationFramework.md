# QA — Tenant / Location Framework

| Module | Matrix section | Bug ID prefix | Tested | Confirmed Bugs | Potential Bugs | Manual Verification |
| --- | --- | --- | --- | --- | --- | --- |
| Tenant / Location Framework | 1.12 and 11 | BUG-TEN | Yes | 4 (+1 duplicate: TEN-003) | 4 | 7 |

Source of test cases: `QA_TEST_MATRIX.md`. Method: static trace of the actual implementation (React UI → service → Axios → .NET controller → service/repository → EF Core → SQL Server, and back). No application code, configuration or database is changed during QA. Findings that depend on deployed configuration, data or a real browser go under **Needs Manual Verification**.

Severity scale:
- **Critical**: security breach, data corruption, financial corruption, or a blocked core workflow.
- **High**: a major feature is broken or a significant security control is bypassed, with a workaround that is hard or unavailable.
- **Medium**: a feature works incorrectly in specific conditions, or a security control is weaker than configured.
- **Low**: cosmetic, minor UX, or an informational/hardening issue.

---

## Carried-Over Concerns (from `QA_Authentication.md`)

Observed while testing Authentication; root cause is in this module. Verify and log formally when this module is tested.

- Many controllers take `tenantId` from the query or body and filter by it without comparing it to the token's tenant; there is no global tenant filter, action filter or EF query filter (for example `CustomerController.GetCustomerById` / `DeleteCustomer`, lines 100–106 and 926–931). Likely **Critical**. Also review BUG-AUTH-018 (`locationIds` claim capped at 50).
  - **Verified → BUG-TEN-001** (client-supplied tenant trusted; 150 `[FromQuery] int tenantId` parameters in 29 controllers plus about 240 body-DTO tenant references in 27 controllers; no global filter of any kind). Related: **BUG-TEN-002** (endpoints with no tenant filter at all). BUG-AUTH-018 re-checked and still applies; it is referenced only and not re-logged here.

## Confirmed Bugs

### BUG-TEN-001 — The API trusts a client-supplied `tenantId` (query or body), allowing cross-tenant read, update, delete and password reset

**Severity:** Critical — any authenticated user (including a vendor-portal user) can read, modify and delete another tenant's data and reset another tenant's user passwords.
**Status:** Confirmed
**Test Area:** Tenant isolation (matrix 1.12 Backend "Tenant", 11.1 "Tenant", 11.3 rows 1, 2 and 4)

**Description:** `ApiBaseController.GetTenantId()` correctly reads the JWT `tenantId` claim, but most endpoints do not use it. They accept `tenantId` from the query string or from the request body and filter on that value directly. No code anywhere compares a client-supplied tenant with `GetTenantId()`, and there is no global safety net: no `IActionFilter`, no `IAuthorizationFilter`, no custom middleware and no EF Core `HasQueryFilter`. The only global policy is the authenticated-user `FallbackPolicy`. A user of tenant A who sends `tenantId=B` therefore works inside tenant B.

**Steps to Reproduce:**
1. Log in as any user of tenant A and capture the Bearer token.
2. Call `GET /api/Customer/GetCustomerById?customerId=<id in B>&tenantId=<B>` (or `GET /api/Customer/GetCustomerlist?tenantid=<B>`).
3. Call `POST /api/Customer/SaveCustomerData` with a body containing `TenantID = B` and an existing customer id of tenant B.
4. Call `DELETE /api/Customer/DeleteCustomer?customerId=<id in B>&tenantId=<B>`.
5. Call `POST /api/UserManagement/ResetPassword` with `TenantId = B` and the id of tenant B's administrator.

**Expected:** Every request is scoped to the tenant in the token. A different tenant id in the query or body is ignored or rejected with 403 (matrix 11.1: "request with another tenant's id in query/body"; 11.3: "`tenantId` override in query/body").

**Actual:** Each call operates on tenant B. Data is returned, updated or deleted, and tenant B's administrator password is replaced, giving account takeover of tenant B.

**Evidence:**
- Frontend: `Cimmple_UI/src/Common/Services/Axios-config.ts` lines 71–121 send `tenantId` as a header and services pass it again as a query/body value; the value comes from browser `localStorage` and is fully user-controlled.
- Backend (framework): `Cimmple_API/CimmpleAPI/Controllers/ApiBaseController.cs` lines 13–25 (`GetTenantId`) exist but are not enforced; `Program.cs` lines 142–147 (only `FallbackPolicy` = authenticated user); repo-wide grep finds no `IActionFilter`, `IAuthorizationFilter`, `UseMiddleware<...>` tenant guard or `HasQueryFilter`.
- Backend (scale): 150 `[FromQuery] int tenantId` parameters across 29 controllers (Quotation 15, Order 14, Inventory 9, Pdf 9, Quality 8, ChartofAccounts 8, Accounting 6, Employee 6, JobOrder 6, ProductMaster 6, Workstation 6, JobTemplate 5, Location 5, NCRCode 5, Bank 4, Customer 4, Vendor 4, Process 4, CreditCard 4, Category 4, JournalEntry 3, Payroll 2, UserManagement 2, Invoice 2, GlobalSearch 2, SystemSettings 2, PriceBreakdown 2, Shipping 2, User 1), plus about 240 body-DTO tenant references (`request.TenantId`, `dto.TenantID`, …) across 27 controllers. `JournalEntryController.ResolveTenantId` (lines 24–30) and `PayrollController.ResolveTenantId` (lines 1147–1151) explicitly prefer the body tenant over the claim.
- Backend (representative read): `CustomerController.GetCustomerlist` lines 25–31 and `GetCustomerById` lines 99–106; `OrderController.GetOrderById` lines 277–302 (query tenant); `JobOrderController.GetJobOrderById` lines 172–178; `EmployeeController.GetEmployeeById` lines 226–233; `UserManagementController.GetUserById` lines 171–220 (returns SSN and date of birth); `AccountingController.ListClosedPeriods` lines 1903–1910; `ReportsController.GenerateReport` line 38 (`request.TenantId`); `PdfController` lines 17–66 (all nine `Generate*` endpoints take query `tenantId` and pass it to `DocumentPdfService`, which filters only by that tenant, e.g. `BuildOrderAsync` lines 110–129); `QuotationController.GetVendorQuotationComparison` lines 3073–3098.
- Backend (representative update): `CustomerController.SaveCustomerData` lines 160–209 (`request.TenantID`); `OrderController.SaveOrder` lines 518–521 and 564–573 (body tenant used for the update lookup); `UserManagementController.UpdateUser` lines 231–273 (`userDto.TenantID`, also sets Role and Status); `VendorController.SaveVendorPortalAccess` line 204 (`request.TenantId > 0 ? request.TenantId : GetTenantId()`); `QuotationController.VendorQuotationDetailSaveFile` lines 3468 and 3485–3488.
- Backend (representative delete): `CustomerController.DeleteCustomer` lines 925–957 (also deletes contacts and addresses); `OrderController.DeleteOrder` lines 1600–1606; `VendorController.DeleteVendor` lines 1166–1177; `QuotationController.DeleteVendorQuotation` lines 2232–2233; `UserManagementController.DeleteUser` lines 276–303.
- Backend (account takeover): `UserManagementController.ResetPassword` lines 306–383, tenant resolved at line 316 as `resetDto.TenantId > 0 ? resetDto.TenantId : GetTenantId()`.
- Database: every business table carries `Tenantid`/`TenantID`; isolation depends entirely on the `WHERE Tenantid = @p` value, which comes from the client.

**Root Cause:** Tenant scoping is implemented per endpoint using request parameters instead of the authenticated claim, and there is no central enforcement (filter, middleware or EF global query filter) to catch endpoints that do this.

**Business Impact:** Complete loss of multi-tenant isolation: confidential customer, pricing, payroll and employee PII (SSN) data of every tenant is readable; records can be altered or deleted; any tenant's administrator account can be taken over. Severe legal/contractual exposure for a SaaS ERP.

**Affected Areas:** Every module whose controller is listed above: masters, CQ/CO, Vendor Quotation/Order, Inventory, Job Orders, Quality, Accounting, Journal Entries, Payroll, User Management, Reports, PDFs, Global Search, System Settings.

**Recommended Fix:** Always derive the tenant from `GetTenantId()` (claim). Remove or ignore `tenantId` parameters in query/body, or reject requests where they differ from the claim. Add a defence-in-depth layer: an EF Core global query filter on `Tenantid` driven by the current claim, and/or an action filter that rejects any `tenantId` argument that differs from the claim.

---

### BUG-TEN-002 — Several GET-by-id and file endpoints apply no tenant filter at all

> **Cross-reference:** each endpoint below is also tracked in its own module:
> - `GetVendorInvoiceDetails` → BUG-PROC-001
> - `GetNCR` → BUG-NCR-005
> - `GetNCRPhoto` → BUG-NCR-006
> - `GetVendorQuotationById`, `GetVendorQuotationsByVendorCode` and `SaveVendorQuotation` → BUG-PROC-008
>
> Fix those module entries. The only part tracked solely here is the tenant-less fallback lookup in `VendorQuotationDetailSaveFile`.

**Severity:** Critical — records and files of any tenant can be read by sequential id, even if the caller sends their own tenant id.
**Status:** Confirmed
**Test Area:** Tenant isolation (matrix 11.3 "GET by id with another tenant's id" and "File download across tenants")

**Description:** Separately from BUG-TEN-001, a set of endpoints look records up by primary key only, or skip the tenant predicate when `tenantId` is 0 or missing. These leak data across tenants even after BUG-TEN-001 is fixed by validating supplied tenant values.

**Steps to Reproduce:**
1. Log in as any user of tenant A.
2. Call `GetVendorInvoiceDetails` with an invoice id that belongs to tenant B.
3. Call `GET /api/Quality/GetNCR?ncrId=<B's id>&tenantId=0` and `GetNCRPhoto` with an NCR id of tenant B.
4. Call `GET /api/Quotation/GetVendorQuotationById?quotationId=<B's id>` without `tenantId` (or `tenantId=0`).
5. Call `GetVendorQuotationsByVendorCode?vendorcode=<code>` with an ERP token.

**Expected:** Each lookup returns 404/403 unless the record belongs to the token's tenant (matrix 11.3 lists `GetVendorInvoiceDetails`, `GetNCR`, `GetNCRPhoto` and attachment endpoints explicitly).

**Actual:** Tenant B's vendor invoice, NCR, NCR photo and vendor quotation are returned. The vendor-code list returns quotations of every tenant that uses the same vendor code.

**Evidence:**
- Frontend: not applicable (direct API calls with an ERP token).
- Backend: `OrderController.GetVendorInvoiceDetails` lines 4657–4671 (no tenant predicate); `QualityController.GetNCR` lines 655–724 (tenant predicate applied only when `tenantId > 0`); `QualityController.GetNCRPhoto` lines 1887–1912 (NCR loaded by id only); `QuotationController.GetVendorQuotationById` lines 1235–1240 and 1327–1331 (no tenant filter when `tenantId` is 0); `QuotationController.GetVendorQuotationsByVendorCode` lines 1176–1179 (ERP path filters by vendor code only); `QuotationController.SaveVendorQuotation` lines 1543–1550 (ERP update adds the tenant predicate only when `tenantid > 0`); `QuotationController.VendorQuotationDetailSaveFile` lines 3524–3526 (falls back to a detail lookup by `OrderID`/`ItemNo` without tenant).
- Database: `VendorInvoice*`, `NCR`, `VendorQuotations`, `VendorQuotationsDetails`.

**Root Cause:** Optional/zero tenant values are treated as "no filter" rather than "use the claim", and some lookups were written without a tenant predicate.

**Business Impact:** Cross-tenant disclosure of AP invoices, quality records with photos, and supplier pricing; cross-tenant modification of vendor quotations via the ERP save path.

**Affected Areas:** Vendor Invoices, Quality/NCR, Vendor Quotation, Vendor Portal (see BUG-VPORTAL cross-module notes).

**Recommended Fix:** Always add `Tenantid == GetTenantId()` to these lookups; never treat 0/missing as "all tenants"; remove the tenant-less fallback lookup in `VendorQuotationDetailSaveFile`.

---

### BUG-TEN-003 — Location access is not enforced on several writes and alternate read paths (receiving, CO update/delete/duplicate, PDFs)

> **Duplicate.** Every endpoint here is tracked in its own module:
> - `ReceiveLineItem` and the other procurement actions → BUG-PROC-009
> - Customer Order and quotation update, delete and duplicate → BUG-SALES-013
> - PDF, attachment and email endpoints → BUG-DOC-006
>
> This entry is kept as the framework-level summary and is not counted in this module's totals.

**Severity:** High — a site-restricted user can post stock into, modify, delete and print records of sites they are not assigned to, bypassing the location control.
**Status:** Confirmed
**Test Area:** Location permissions (matrix 11.1 "Location permissions", 11.2 Customer Quotations/Orders and Vendor Receiving)

**Description:** The framework helpers (`CanAccessLocation`, `TryResolveLocationId`, `TryResolveListLocationFilter`) are correct, but several endpoints do not call them:
- `OrderController.ReceiveLineItem` takes both tenant and `locationId` from the request body and posts the receipt and stock without `CanAccessLocation`.
- Customer Order update, delete and duplicate check only the tenant. They never check the location of the existing record; only `GetOrderById` does (line 299). `SaveOrder` validates only the new location (`TryResolveLocationId`, lines 624–626).
- The CQ/CO detail endpoints return 403 for another site, but `/api/Pdf/Generate*` returns the same document for any site.

**Steps to Reproduce:**
1. Log in as a user restricted to site 1.
2. From Vendor Receiving (or directly), call `ReceiveLineItem` with `locationId = 2`.
3. Call `DeleteOrder` or `DuplicateOrder` for a CO whose location is site 2; call `SaveOrder` to update that CO, keeping or changing the location to site 1.
4. Call `GET /api/Pdf/GenerateOrder?orderId=<site-2 CO>&tenantId=<own>`.

**Expected:** "Receive into a site the user can't access (expected rejection)" and "Cross-site detail access blocked" (matrix 11.2); "save into a non-allowed location → 403" (matrix 11.1).

**Actual:** The receipt is posted to site 2 inventory; the site-2 CO is updated (it can even be moved into site 1), deleted or duplicated; the PDF of the site-2 CO is returned.

**Evidence:**
- Frontend: `Cimmple_UI/src/Modules/Purchasing/VendorReceivingDetail.tsx` lines 243 and 301 call `Common/Services/VendorReceivingService.ts` line 116 (`ReceiveLineItem`) with the selected location.
- Backend: `OrderController.ReceiveLineItem` lines 3802–3930 (no `CanAccessLocation`/`TryResolveLocationId`); `OrderController.SaveOrder` lines 564–573 (existing record fetched by id + tenant, no location check) and 624–626; `OrderController.DeleteOrder` lines 1600–1606; `OrderController.DuplicateOrder` line 1674; `OrderController.GetOrderById` line 299 (the only CO location check); `PdfController` lines 17–66 and `DocumentPdfService.BuildOrderAsync` lines 110–129 (no location check); `ApiBaseController.CanAccessLocation` lines 121–126 (available but not called).
- Database: `InventoryBalance`/lot balances per location, `CustomerOrders.locationId`.

**Root Cause:** Location enforcement is opt-in per endpoint and was applied to list filters and some detail reads but not to writes, deletes or PDF generation.

**Business Impact:** Site segregation (a key multi-site control) is ineffective: stock can be booked into the wrong warehouse, and restricted users can change or remove other sites' orders and print their documents.

**Affected Areas:** Vendor Receiving, Inventory, Customer Orders, Customer Quotations (PDF), Shipping/Invoice PDFs.

**Recommended Fix:** Call `TryResolveLocationId`/`CanAccessLocation` in `ReceiveLineItem`; in update/delete/duplicate load the existing record and check `CanAccessLocation(existing.locationId)`; apply the same check in each `Pdf/Generate*` endpoint before building the document.

---

### BUG-TEN-004 — Shared list page does not clamp the current page when the data shrinks

**Severity:** Low — after deleting the last row of the last page the list shows "No data available" and a wrong range until the user changes page.
**Status:** Confirmed
**Test Area:** Pagination (matrix 1.12 "Client paging")

**Description:** `useClientPagination` clamps its page (`safePage`), but `MasterListPage.tsx` keeps its own `currentPage` and slices data without clamping. It resets the page only when the search term or filter values change, not when the row count shrinks.

**Steps to Reproduce:**
1. Open a master list that uses `MasterListPage` with page size 10 and exactly 11 rows.
2. Go to page 2 and delete the only row on it.

**Expected:** The page falls back to page 1 (as `useClientPagination` does) and shows rows 1–10.

**Actual:** Page 2 stays selected, the table shows "No data available", and the footer range text is inconsistent with the total.

**Evidence:**
- Frontend: `Cimmple_UI/src/Common/Components/MasterListPage/MasterListPage.tsx` lines 244–248 (slice without clamp), 250–256 (reset only on search/filter change), 430–441 (footer); compare `Cimmple_UI/src/Common/Hooks/useClientPagination.ts` (clamped `safePage`).
- Backend: not applicable.
- Database: not applicable.

**Root Cause:** `MasterListPage` duplicates pagination logic instead of reusing the clamped hook.

**Business Impact:** Confusing empty list after deletes; users may think data was lost.

**Affected Areas:** Every list rendered through `MasterListPage`.

**Recommended Fix:** Clamp `currentPage` to `max(1, totalPages)` whenever the data length changes, or reuse `useClientPagination`.

---

### BUG-TEN-005 — CSV import reports wrong row numbers when the file contains blank lines

**Severity:** Low — import error messages point to the wrong line.
**Status:** Confirmed
**Test Area:** CSV import (matrix 1.12 "CSV import")

**Description:** `parseCsv` drops blank lines, and `mapCsvRows` then computes `rowNumber` as `idx + 2`. The comment at the top of the file says `rowNumber` is the source line number, but once a blank line is skipped every following row is reported one line too early.

**Steps to Reproduce:**
1. Create a customer CSV with a header, one valid row, an empty line, then an invalid row (line 4).
2. Import it through the Customer Master import modal.

**Expected:** "Row 4: …" (the source line, as stated in the comment).

**Actual:** "Row 3: …".

**Evidence:**
- Frontend: `Cimmple_UI/src/Common/Utils/CsvImport.ts` lines 1–3 (comment), 38 (blank lines skipped), 77 (`rowNumber: idx + 2`); used in `Modules/Masters/CustomerMasterImportModal.tsx` lines 357–370 ("Row N:" messages).
- Backend: not applicable.
- Database: not applicable.

**Root Cause:** The row index is computed after filtering rather than tracked from the original line position.

**Business Impact:** Users waste time locating errors in large import files.

**Affected Areas:** All CSV import modals using `CsvImport.ts`.

**Recommended Fix:** Record the original line number in `parseCsv` and carry it through to `mapCsvRows`.

---

## Potential Bugs

### BUG-TEN-006 — Hard-coded fallback location `1` used when posting journals, payroll and invoices

**Severity:** Medium — accounting entries could be booked to the wrong (or another tenant's) location when no working site is selected, distorting site-level financials.
**Status:** Potential
**Test Area:** Location (matrix 11.2 Journal Entries / GL, Customer Invoices)

**Description:** `TryResolveLocationId(..., fallback: 1)` is used in 11 places. When neither the request nor the `X-Location-Id` header supplies a location, location id 1 is used, regardless of tenant. In `InvoiceController` the ARINV journal entry location comes from the working-site header rather than from the invoice/CO location, so a journal can be booked to the site that happens to be selected in the TopBar.

**Steps to Reproduce:**
1. As an "all sites" user with no working site selected (or via a client that omits `X-Location-Id`), post a journal entry, run payroll, or create a customer invoice for a CO at site 3 while the working site is site 2.
2. Inspect the generated journal lines' location.

**Expected:** The location comes from the source document (invoice/CO), or the request is rejected when no location can be determined.

**Actual (from code):** Location 1 is used when nothing is supplied; invoice journals use the working site.

**Evidence:**
- Frontend: `Axios-config.ts` lines 111–114 (header is omitted when no `locationId` is stored).
- Backend: `ApiBaseController.TryResolveLocationId` lines 222–250; `InvoiceController` line 312; `VendorInvoiceController` line 257; `JournalEntryController` line 256; `PayrollController` lines 302, 467, 564, 607, 690, 738, 936.
- Database: journal line location columns.

**Root Cause:** A magic default location instead of deriving from the source document or failing.

**Business Impact:** Incorrect site-level P&L/AR reporting.

**Affected Areas:** Customer Invoices, Vendor Invoices, Journal Entries, Payroll, Financial Reports by site.

**Recommended Fix:** Derive the location from the source document; reject when it cannot be resolved; never default to a literal id.

**Why further verification is needed:** Whether location 1 exists for each tenant, and whether the UI always sends a working site for these flows, depends on deployed data and runtime state.

---

### BUG-TEN-007 — `CanAccessLocation` accepts any location id for "all locations" users, including another tenant's location

**Severity:** Low — an admin can stamp a foreign location id on records; impact is limited to wrong labels/letterheads.
**Status:** Potential
**Test Area:** Location permissions (matrix 11.1)

**Description:** For users with `canAccessAllLocations`, `CanAccessLocation` returns `true` for any id without checking that the location belongs to the caller's tenant. `TryResolveLocationId` therefore accepts another tenant's location id on save.

**Steps to Reproduce:**
1. As a tenant-A admin, save a record (for example a CO) with `locationId` set to a location of tenant B.
2. Open the record and generate its PDF.

**Expected:** The save is rejected because the location is not in tenant A.

**Actual (from code):** The save is accepted.

**Evidence:**
- Frontend: not applicable.
- Backend: `ApiBaseController.CanAccessLocation` lines 121–126; `TryResolveLocationId` lines 222–250.
- Database: `Locations.Tenantid`.

**Root Cause:** The "all locations" shortcut does not validate tenant ownership.

**Business Impact:** Records linked to another tenant's site; a PDF letterhead might show another tenant's name/address if the letterhead lookup is not tenant-filtered.

**Affected Areas:** Every save that stores a location.

**Recommended Fix:** In `CanAccessLocation`, verify that the location exists in the caller's tenant before returning `true`.

**Why further verification is needed:** Whether the PDF/letterhead lookup leaks the other tenant's company information depends on how each consumer loads the location row.

---

### BUG-TEN-008 — PDFs do not inherit the logo from the parent location

**Severity:** Low — child sites/warehouses without their own logo print without a logo.
**Status:** Potential
**Test Area:** Location hierarchy (matrix 11.1 "logo inheritance for PDFs")

**Description:** Matrix 11.1 lists "logo inheritance for PDFs" under the location hierarchy. `DocumentPdfService.GetCompanyInfo` uses only the selected location's own logo; `ParentLocationId` is not used anywhere outside display paths in `LocationController`.

**Steps to Reproduce:**
1. Give a business site a logo; create a child warehouse without a logo.
2. Generate a document PDF for the child location.

**Expected:** The parent site's logo is used.

**Actual (from code):** No location logo is applied.

**Evidence:**
- Frontend: not applicable.
- Backend: `Services/Pdf/DocumentPdfService.cs` lines 1253–1332 (`GetCompanyInfo`); `LocationController.cs` lines 77–90 (only use of `ParentLocationId`, for path display).
- Database: `Locations.ParentLocationId`, location logo columns.

**Root Cause:** No parent walk when resolving letterhead data.

**Business Impact:** Unbranded customer-facing documents from child locations.

**Affected Areas:** All `/Pdf/Generate*` documents.

**Recommended Fix:** Walk up `ParentLocationId` until a logo is found, then fall back to the tenant logo.

**Why further verification is needed:** The matrix row is terse; product may intend a tenant-level fallback rather than parent inheritance, which should be confirmed with the product owner.

---

### BUG-TEN-009 — CSV exports do not neutralise spreadsheet formulas

**Severity:** Low — values beginning with `=`, `+`, `-` or `@` can execute as formulas when the exported file is opened in Excel.
**Status:** Potential
**Test Area:** Shared list components (CSV export helper)

**Description:** `buildCsv`/`escapeCsvValue` quote commas and quotes but do not prefix formula-leading characters.

**Steps to Reproduce:**
1. Save a job template name such as `=HYPERLINK("http://example.com","x")`.
2. Export the Job Template list and open it in Excel.

**Expected:** The value is shown as text.

**Actual (from code):** The value is written raw and may be evaluated as a formula.

**Evidence:**
- Frontend: `Cimmple_UI/src/Common/Utils/CsvImport.ts` lines 81–90; used by the Attendance Register export (line 244) and Job Template Master export (line 241).
- Backend: not applicable.
- Database: not applicable.

**Root Cause:** Missing CSV-injection hardening.

**Business Impact:** Social-engineering vector against users who open exports.

**Affected Areas:** Attendance Register, Job Template Master exports.

**Recommended Fix:** Prefix cells starting with `=`, `+`, `-`, `@`, tab or CR with a single quote.

**Why further verification is needed:** The impact depends on the spreadsheet application and its security settings.

---

## Needs Manual Verification

1. **Area:** Per-tenant uniqueness (matrix 11.3 "Unique rules are per tenant")
   **What to Test:** Create two customers/vendors/workstations/NCR codes/usernames with the same name concurrently in one tenant; create the same names in two different tenants.
   **Expected:** Duplicates are rejected within a tenant and allowed across tenants.
   **Why Manual Testing Is Required:** Checks exist in application code and are tenant-scoped (for example `CustomerController` line 184, `VendorController` line 477, `WorkstationController` line 133, `NCRCodeController` line 152, `EmployeeController` line 427), but the database has tenant-scoped unique indexes only for a few tables (CategoryType, JobTemplate, DocumentCategories, GL period locks, AccountingDefaults, EmployeeFace). Race conditions can only be shown at runtime.
2. **Area:** Number sequences per tenant (matrix 11.3)
   **What to Test:** Create CQ, CO, VQ, VO, invoice, shipment, NCR and document records simultaneously from two sessions in the same tenant, and in two tenants.
   **Expected:** Numbers are unique and sequential per tenant.
   **Why Manual Testing Is Required:** Sequence generation is in application code without database uniqueness; collisions need concurrent execution.
3. **Area:** User location changes (matrix 11.1 "User location")
   **What to Test:** Add/remove a site for a restricted user in User Management, then check lists before and after token refresh and after re-login; test a user with no locations.
   **Expected:** Change takes effect after refresh/re-login; a user with no locations sees no site-scoped rows and no switcher.
   **Why Manual Testing Is Required:** The `locationIds` claim is rebuilt only on login/refresh (`AuthService.BuildClaims` lines 667–701); timing depends on token lifetime.
4. **Area:** Working site change refreshes lists (matrix 1.12 Business Logic)
   **What to Test:** Switch the working site on each list page.
   **Expected:** The list reloads for the new site.
   **Why Manual Testing Is Required:** `TopBar.handleLocationChange` (lines 254–269) stores the site and notifies listeners; whether each page re-fetches depends on runtime remounting.
5. **Area:** Responsive layout (matrix 1.12 "Responsive")
   **What to Test:** Layout at ≤1024px and TopBar at ≤640px.
   **Expected:** Sidebar collapses at 1024px; TopBar compacts at 640px.
   **Why Manual Testing Is Required:** Breakpoints exist (`Layout.scss` line 27, `TopBar.scss` line 466); visual behaviour requires a browser.
6. **Area:** Site totals and tenant-wide views (matrix 11.2 Dashboard, Payment Dashboard, Period Close, Quality, Scheduled Reports, Financial Reports)
   **What to Test:** Compare dashboard KPIs per site with module lists; close a period with a bank at an unseen site; compare NCR list vs dashboard count; run a scheduled report for a restricted owner; compare "All sites" vs single-site financial totals.
   **Expected:** As described in each matrix row.
   **Why Manual Testing Is Required:** Requires seeded multi-site data and runtime aggregation.
7. **Area:** Delete impact dialog (matrix 1.12 "Delete impact")
   **What to Test:** Delete a master with blockers and with cascadable children; use "Delete All".
   **Expected:** Blockers prevent deletion; cascade deletes listed children only.
   **Why Manual Testing Is Required:** The dialog logic is correct (`DeletionImpactDialog.tsx`), but each module's `Check*DeletionImpact` result depends on data. Note: `CustomerController.DeleteCustomer` (lines 925–957) does not itself re-check impact server-side (cross-module).

## No Issues Found

- `TryResolveListLocationFilter` (`ApiBaseController.cs` lines 179–216): an explicit non-allowed site returns 403; "All sites" is tenant-wide for `canAccessAllLocations` users and the allowed-site set otherwise; an empty allowed set returns no rows.
- `GetActiveLocationId` (lines 102–119) validates the `X-Location-Id` header against the `locationIds` claim; `TryGetActiveLocationId` (lines 160–171) returns 403 for a non-assigned site.
- `useSiteListFilter.ts` handles the deep link `?locationId=0` as "All sites" (lines 44–55) and validates requested sites against allowed sites (lines 58–68).
- `workingSiteVisibility.ts` hides the switcher on masters, settings, GL, periods and NCR codes as the matrix states; `TopBar.tsx` line 692 applies it.
- `useActiveLocation.ts`/`TopBar.loadLocations` (lines 213–251) offer only sites and warehouses, and `TopBar` (lines 283–318) clears a stale site that is no longer allowed for a restricted user.
- `Axios-config.ts` (lines 71–121) sends Bearer, `Username`, `tenantId`, `userId` and `X-Location-Id` (only on ERP paths).
- `useListPageSize.ts` stores `listPageSizePref`, offers 10/25/50/100 and drops a stale preference when the admin default changes.
- `useColumnChooser.ts` prevents hiding locked columns.
- `DeletionImpactDialog.tsx` shows blockers, disables delete when `canDelete` is false and confirms cascade "Delete All".
- `DocumentsController` (e.g. lines 58, 229, 653) and `InvoiceController.GetInvoiceDetails` (lines 397–406) use the claim tenant, so they are isolated for normal ERP tokens.
- `MasterListPage` server-search debounce (300 ms, clear applies immediately, lines 129–141) and client sorting (lines 224–242) work as designed.
- `Program.cs` lines 142–147 enforce an authenticated user on every endpoint not marked `[AllowAnonymous]`.

## QA Coverage

| Test Area | Tested | Result |
| --- | --- | --- |
| Navigation | Yes | Pass |
| CRUD | Yes | Fail (BUG-TEN-001, BUG-TEN-003) |
| Search | Yes | Pass |
| Filters | Yes | Pass |
| Sorting | Yes | Pass |
| Pagination | Yes | Fail (BUG-TEN-004) |
| Validation | Yes | Fail (BUG-TEN-005) |
| Permissions | Yes | Fail (BUG-TEN-003); Potential (BUG-TEN-007) |
| API | Yes | Fail (BUG-TEN-001, BUG-TEN-002) |
| Database | Partial | Manual |
| Business Logic | Yes | Pass; Manual (working-site refresh) |
| Location | Yes | Fail (BUG-TEN-003); Potential (BUG-TEN-006, BUG-TEN-007, BUG-TEN-008) |
| Tenant | Yes | Fail (BUG-TEN-001, BUG-TEN-002) |
| Cross-Module | Yes | Fail (BUG-TEN-001); see Cross-Module Concerns |
| Responsive/PWA | No | Manual |

## Matrix Checklist

| Matrix Row | Result | Notes |
| --- | --- | --- |
| 1.12 FE — Working site switcher (`TopBar`, `useActiveLocation`) | Pass | Sites and warehouses only; stale site cleared. |
| 1.12 FE — Switcher visibility (`workingSiteVisibility.ts`) | Pass | Matches the matrix list. |
| 1.12 FE — Headers (`Axios-config.ts`) | Pass | All headers sent; header values are client-controlled, which matters because of BUG-TEN-001 and BUG-SUPP-001. |
| 1.12 FE — Site filter (`useSiteListFilter.ts`) | Pass | All sites and `?locationId=` handled. |
| 1.12 FE — Page size (`useListPageSize.ts`) | Pass | — |
| 1.12 FE — Client paging (`useClientPagination.ts`) | Fail (BUG-TEN-004) | Hook clamps; `MasterListPage` does not. |
| 1.12 FE — Column chooser (`useColumnChooser.ts`) | Pass | Locked columns enforced. |
| 1.12 FE — Delete impact (`DeletionImpactDialog.tsx`) | Pass / Manual | Dialog correct; data-dependent results manual. |
| 1.12 FE — CSV import (`CsvImport.ts`) | Fail (BUG-TEN-005) | Row numbers; export hardening Potential (BUG-TEN-009). |
| 1.12 FE — Responsive (1024px / 640px) | Manual | Breakpoints exist. |
| 1.12 BE — Tenant (`GetTenantId`, `GetUserId` claim then header) | Fail (BUG-TEN-001; header fallback logged as BUG-SUPP-001 and BUG-AUTH-014) | Header fallback reachable by support and integration tokens. |
| 1.12 BE — Location (`GetActiveLocationId`, `TryResolveListLocationFilter`, `TryResolveLocationId`, `CanAccessLocation`) | Fail (BUG-TEN-003); Potential (BUG-TEN-006, BUG-TEN-007) | Helpers correct but not called on some writes; magic fallback 1. |
| 1.12 BE — Authorization (`FallbackPolicy`) | Pass | Authenticated-user only; no role checks (QA_RolesPermissions). |
| 1.12 BL — "All sites" for restricted user = allowed sites only | Pass | — |
| 1.12 BL — Explicit disallowed site = 403 | Pass (lists) / Fail (writes, BUG-TEN-003) | — |
| 1.12 BL — Working site change refreshes lists | Manual | — |
| 1.12 BL — Deep-link `?locationId=0` = All sites | Pass | — |
| 11.1 — Tenant | Fail (BUG-TEN-001, BUG-TEN-002) | Query/body override and tenant-less lookups. |
| 11.1 — Location (active) | Pass | Non-assigned header ignored (`GetActiveLocationId(out _)`) or rejected (`TryGetActiveLocationId`). |
| 11.1 — List location filter | Pass | — |
| 11.1 — User location | Manual | Effective on refresh/re-login; BUG-AUTH-018 (50-id cap) applies. |
| 11.1 — Location permissions | Fail (BUG-TEN-003); Potential (BUG-TEN-007) | Also BUG-AUTH-017 ("admin" name grants all locations). |
| 11.1 — Location hierarchy | Potential (BUG-TEN-008) | No logo inheritance. |
| 11.2 — Bank master | Pass | List filter and save check (`BankController` lines 29, 178). |
| 11.2 — Employee master | Pass | Server-side list filter. |
| 11.2 — Location master | Manual | Hierarchy display only; delete-block requires data. |
| 11.2 — Other masters | Pass | Tenant-wide by design. |
| 11.2 — Customer Quotations | Fail (BUG-TEN-003) | Detail 403 bypassed via `/Pdf/Generate*`. |
| 11.2 — Customer Orders | Fail (BUG-TEN-003) | Update/delete/duplicate and PDF skip location. |
| 11.2 — Shipments / Customer Invoices | Potential (BUG-TEN-006) | Invoice journal uses working site; totals manual. |
| 11.2 — Vendor Quotes / Orders | Pass | List filter present. |
| 11.2 — Vendor Receiving | Fail (BUG-TEN-003) | Receive into non-allowed site accepted. |
| 11.2 — Vendor Invoices | Fail (BUG-TEN-002); Potential (BUG-TEN-006) | `GetVendorInvoiceDetails` has no tenant filter. |
| 11.2 — Inventory | Pass | Movements call `CanAccessLocation`. |
| 11.2 — Job Orders | Pass (list) | Detail has no location check; not required by the matrix row. |
| 11.2 — Quality / NCR | Fail (BUG-TEN-002) | List filter OK; `GetNCR`/`GetNCRPhoto` tenant gaps. |
| 11.2 — Attendance | Pass | List filter present. |
| 11.2 — Payment Dashboard | Manual | Uses location param; metrics need data. |
| 11.2 — Bank Reconciliation | Pass | Bank list filter applies. |
| 11.2 — Period Close | Manual | — |
| 11.2 — Journal Entries / GL / Financial Reports | Potential (BUG-TEN-006); Manual | — |
| 11.2 — Payroll | Potential (BUG-TEN-006) | Fallback location 1 in 7 places. |
| 11.2 — Dashboard | Manual | — |
| 11.2 — Reports / BI | Fail (BUG-TEN-001) | `request.TenantId` override (`ReportsController` line 38). |
| 11.2 — Scheduled Reports | Manual | — |
| 11.2 — Documents | Pass (ERP tokens) | Claim tenant; support token see BUG-SUPP-001. |
| 11.2 — PDF | Fail (BUG-TEN-001, BUG-TEN-003); Potential (BUG-TEN-008) | Query tenant; no location check. |
| 11.3 — GET by id with another tenant's id | Fail (BUG-TEN-001, BUG-TEN-002) | `GetInvoiceDetails` and `Documents/{id}` pass for ERP tokens. |
| 11.3 — `tenantId` override in query/body | Fail (BUG-TEN-001) | Customer, Vendor, Quotation, Order, NCRCode, Reports, `ListClosedPeriods` all affected. |
| 11.3 — File download across tenants | Fail (BUG-TEN-002) | `GetNCRPhoto`; anonymous `User/GetProfilePic` is BUG-AUTH-015; Employee `GetProfilePic` (anonymous) belongs to QA_EmployeeMaster; `Documents/{id}/download` passes. |
| 11.3 — PDF across tenants | Fail (BUG-TEN-001) | Query `tenantId` on all `Generate*`. |
| 11.3 — Unique rules are per tenant | Pass (app code) / Manual | DB indexes only for a few tables. |
| 11.3 — Number sequences per tenant | Manual | Concurrency needed. |

## Cross-Module Concerns

| Concern | Owner Module | Evidence |
| --- | --- | --- |
| No server-side role/permission checks on any endpoint. | QA_RolesPermissions.md | `Program.cs` lines 142–147; no `[Authorize(Roles/Policy)]` usage. |
| Support-staff and integration tokens resolve tenant/user from headers. | BUG-SUPP-001, BUG-AUTH-014 | `ApiBaseController.cs` lines 13–46. |
| Vendor-portal tokens accepted by ERP endpoints. | BUG-VPORTAL-001 | Only `QuotationController` checks `IsVendorPortal()`. |
| `UserManagement.ResetPassword` cross-tenant reset (account takeover). | User Management (logged here under BUG-TEN-001) | `UserManagementController.cs` line 316. |
| Employee `GetProfilePic` is anonymous and accepts any user id. | QA_EmployeeMaster.md | `EmployeeController.cs` lines 332–339. |
| `DeleteCustomer` deletes contacts/addresses without re-checking deletion impact server-side. | QA_CustomerMaster.md | `CustomerController.cs` lines 925–957. |
