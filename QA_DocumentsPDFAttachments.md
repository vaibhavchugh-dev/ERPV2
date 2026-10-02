# QA — Documents, PDF & Attachments

| Module | Matrix section | Bug ID prefix | Tested | Confirmed Bugs | Potential Bugs | Manual Verification |
| --- | --- | --- | --- | --- | --- | --- |
| Documents, PDF & Attachments | 7.4–7.6 | BUG-DOC | Yes | 17 (+4 duplicates: DOC-001, DOC-003, DOC-004, DOC-005) | 4 | 7 |

Source of test cases: `QA_TEST_MATRIX.md`. Method: static trace of the actual implementation (React UI → service → Axios → .NET controller → service/repository → EF Core → SQL Server, and back). No application code, configuration or database is changed during QA. Findings that depend on deployed configuration, data or a real browser go under **Needs Manual Verification**.

Severity scale:
- **Critical**: security breach, data corruption, financial corruption, or a blocked core workflow.
- **High**: a major feature is broken or a significant security control is bypassed, with a workaround that is hard or unavailable.
- **Medium**: a feature works incorrectly in specific conditions, or a security control is weaker than configured.
- **Low**: cosmetic, minor UX, or an informational/hardening issue.

---

## Confirmed Bugs

### BUG-DOC-001 — Job order and vendor quotation attachments overwrite each other across records

> **Duplicate of BUG-MFG-001** (`QA_Manufacturing.md`, job orders) **and BUG-VPORTAL-002** (`QA_VendorPortal.md`, vendor quotations). This entry is kept for traceability and is not counted in this module's totals.

**Severity:** Critical. Data corruption: uploading a file to one job order or vendor quotation silently replaces another record's file, so the shop floor can open the wrong drawing; deleting an attachment can delete another record's file.

**Status:** Confirmed

**Test Area:** Attachments / Database / Business Logic

**Description:** Job order, vendor quotation header and vendor quotation line attachments are numbered per record, starting at 1, from that record's own `AttachmentsJson`. The blob name is built only from that number and the extension, and the blob folder is only `{tenantId}/{module}`. The record id is not part of the path. The first PDF on every job order in a tenant is therefore stored at the same blob, `{tenantId}/JobOrders/1.pdf`.

**Steps to Reproduce:**
1. Open job order JO-A, upload `drawing-A.pdf`, save.
2. Open job order JO-B in the same tenant, upload `drawing-B.pdf`, save.
3. Reopen JO-A and open its attachment.
4. Optionally remove the attachment from JO-B and reopen JO-A's attachment again.

**Expected:** JO-A still shows `drawing-A.pdf`; deleting JO-B's file does not affect JO-A.

**Actual:** JO-A's attachment (listed as `drawing-A.pdf`) now returns the bytes of `drawing-B.pdf`. After removing JO-B's attachment, JO-A's download returns "File not found in Azure Storage".

**Evidence:**
- Frontend: Job order and VQ slideouts upload through `JobOrderSaveFile` / `VendorQuotationSaveFile` / `VendorQuotationDetailSaveFile` and download by `fileUniqueno`.
- Backend: `Controllers/JobOrderController.cs` lines 805–808 (`nextFileUniqueNo` from this job's attachments, starting at 1), line 821 (`blobName = $"{nextFileUniqueNo}{ext}"`), lines 823–827 (folder `ModuleFileStorage.JobOrdersFolder` only), download at lines 936–943, deletion at lines 1008–1021. `Controllers/QuotationController.cs` VQ header lines 3266–3269 and 3282–3288; VQ line lines 3555–3558 and 3571 (`L{itemNo}_{n}{ext}`), deletion at line 2458. `Utilities/UploadFile.cs` lines 57–64 build the path as `{Dirname}/{UploadFileName}` with no extra prefix.
- Database: `JobOrderMaster.AttachmentsJson`, `VendorQuotations.AttachmentsJson`, `VendorQuotationsDetails.AttachmentsJson` store only the short blob name.

**Root Cause:** Per-record sequence numbers are used as tenant-wide blob names.

**Business Impact:** Wrong drawings or specifications used in production and purchasing, and silent loss of files; this cannot be detected from the UI because file names and sizes still show the original metadata.

**Affected Areas:** JO attachments, VQ header files, VQ line files (including vendor-portal uploads). The job order part is also logged as BUG-MFG-001 in `QA_Manufacturing.md`; the vendor quotation part is only logged here.

**Recommended Fix:** Include the record id (and preferably a GUID) in the blob name, for example `{jobOrderId}/{guid}{ext}`, as NCR photos already do; plan a data repair for existing collisions.

---

### BUG-DOC-002 — `GET /api/Pdf/GenerateNCR?tenantId=0` returns any tenant's NCR

**Severity:** Critical. Cross-tenant data breach: any logged-in user of any tenant can download every other tenant's NCRs (customer, vendor, part, defect, root cause, cost impact) by iterating ids.

**Status:** Confirmed

**Test Area:** Tenant isolation / API

**Description:** `PdfController` passes the query `tenantId` straight through, defaulting to 0. `LoadNcrForPdfAsync` only adds `AND TenantId = @tenantId` when `tenantId > 0`, so `tenantId=0` (or omitting it) removes the tenant filter entirely. NCR ids are sequential.

**Steps to Reproduce:**
1. Log in to tenant A.
2. Call `GET /api/Pdf/GenerateNCR?ncrId=1` (no `tenantId`), then `ncrId=2`, and so on.

**Expected:** 404 for NCRs that do not belong to the caller's tenant (matrix 7.5: "PDF for a record in another tenant or location (expected rejection)").

**Actual:** A PDF is returned for NCRs of every tenant.

**Evidence:**
- Frontend: `Cimmple_UI/src/Common/Services/PdfService.ts` lines 102–107 build the URL with `tenantId` from localStorage (easily changed or omitted).
- Backend: `Controllers/PdfController.cs` lines 65–68 (`[FromQuery] int tenantId`, no token fallback); `Services/Pdf/DocumentPdfService.cs` `BuildNcrAsync` lines 893–902 and `LoadNcrForPdfAsync` lines 1077–1121 (tenant predicate only when `tenantId > 0`).
- Database: `CimmpleFlow.NonConformanceReports` queried by `NcrId` only.

**Root Cause:** A "0 means all tenants" shortcut in the NCR loader combined with a controller that never uses the token tenant.

**Business Impact:** Leak of confidential quality and customer/vendor data across companies.

**Affected Areas:** NCR PDF (`GenerateNCR`). The email path (`SendNcr`) replaces 0 with the token tenant and is not affected by the 0 bypass.

**Recommended Fix:** Always take the tenant from the token in `PdfController` and always filter NCRs by tenant in `LoadNcrForPdfAsync`.

---

### BUG-DOC-003 — NCR photo upload has no tenant check

> **Duplicate of BUG-NCR-007** (`QA_QualityNCR.md`). This entry is kept for traceability and is not counted in this module's totals.

**Severity:** High. A user of one tenant can attach arbitrary images to another tenant's NCRs (cross-tenant write), filling the 10-photo limit or planting misleading evidence.

**Status:** Confirmed

**Test Area:** Tenant isolation / Attachments

**Description:** `UploadNCRPhotos/{ncrId}` loads the NCR with `FindAsync(ncrId)` and never compares its tenant with the caller. The photo is stored under the NCR's tenant folder and appended to that NCR. `GetNCRPhoto/{ncrId}` also loads the NCR by id only; it is protected in practice only because the file name contains a GUID.

**Steps to Reproduce:**
1. Log in to tenant A.
2. `POST /api/Quality/UploadNCRPhotos/{id}` with an image, where `{id}` is an NCR of tenant B.

**Expected:** 404 or 403.

**Actual:** 200; the photo is added to tenant B's NCR.

**Evidence:**
- Frontend: NCR slideout uploads through `UploadNCRPhotos`.
- Backend: `Controllers/QualityController.cs` lines 1803–1811 (`FindAsync(ncrId)`, no tenant predicate), lines 1849–1854 (stored under `ncr.TenantId`), lines 1872–1874 (saved); `GetNCRPhoto` lines 1887–1901 (by id only).
- Database: `NonConformanceReports.Photos` JSON updated.

**Root Cause:** Missing tenant predicate on the parent lookup.

**Business Impact:** Integrity of quality records across tenants.

**Affected Areas:** NCR photos. Also logged by the Quality module as BUG-NCR-007 (upload) and BUG-NCR-006 (download) in `QA_QualityNCR.md`; listed here because matrix 7.6 covers NCR photos.

**Recommended Fix:** Load the NCR with `NcrId == ncrId && TenantId == GetTenantId()` (and check location access) in both actions.

---

### BUG-DOC-004 — Job template attachments are stored in public `wwwroot` and can be downloaded without logging in

> **Duplicate of BUG-JT-004** (`QA_JobTemplateMaster.md`). This entry is kept for traceability and is not counted in this module's totals.

**Severity:** High. Engineering drawings and setup sheets bypass authentication entirely; anyone with (or who obtains) the URL can download them, from any tenant, forever.

**Status:** Confirmed

**Test Area:** Permissions / Attachments

**Description:** `UploadJobTemplateAttachment` writes the file to `wwwroot/uploads/jobtemplates/{tenantId}/{templateId}/{timestamp}{ext}` and stores that public path. `Program.cs` calls `app.UseStaticFiles()` before authentication, so the static-file middleware serves everything under `wwwroot` anonymously. File names are a millisecond timestamp, and tenant and template ids are sequential.

**Steps to Reproduce:**
1. Upload a drawing to a job template.
2. Copy its `fileUrl` (for example `/uploads/jobtemplates/5/12/20261002101530123.pdf`).
3. In a private browser window with no session, open `https://<api-host>/uploads/jobtemplates/5/12/20261002101530123.pdf`.

**Expected:** 401; attachments are downloaded only through an authenticated, tenant-checked endpoint (matrix 7.6: "download of files from another tenant (expected rejection)").

**Actual:** The file is served.

**Evidence:**
- Frontend: `Cimmple_UI/src/Modules/Masters/JobTemplateMasterSlideout.tsx` lines 1796–1803 link directly to `attachment.fileUrl`.
- Backend: `Controllers/JobTemplateController.cs` lines 856–871 (writes to `wwwroot/uploads/jobtemplates/...`) and line 879 (`FileUrl = "/uploads/jobtemplates/..."`); `Program.cs` line 250 (`app.UseStaticFiles()`) before lines 252–253 (`UseAuthentication`/`UseAuthorization`).
- Database: `JobTemplateAttachment.FileUrl` holds the public path.

**Root Cause:** Files are kept in the public web root instead of private blob storage behind an authorised endpoint.

**Business Impact:** Leak of customer IP (drawings, CAD files); also lost on redeploy or scale-out because the files live on the web server's disk.

**Affected Areas:** Job template attachments; legacy NCR photos and legacy documents that still resolve to `wwwroot` paths are exposed the same way. Also logged as BUG-JT-004 in `QA_JobTemplateMaster.md` (and, for logos, BUG-LOC-007 in `QA_LocationMaster.md`).

**Recommended Fix:** Store job template files in the tenant blob container (like other modules) and serve them through an authenticated download action that checks tenant and template access.

---

### BUG-DOC-005 — Job template attachment links open the ERP app instead of the file

> **Duplicate of BUG-JT-001** (`QA_JobTemplateMaster.md`). This entry is kept for traceability and is not counted in this module's totals.

**Severity:** Medium. Users cannot open job template attachments from the slideout; the documented purpose ("Attach the drawing and setup sheet so the shop floor has them") fails.

**Status:** Confirmed

**Test Area:** Attachments / Navigation

**Description:** The slideout renders `<a href={attachment.fileUrl}>` where `fileUrl` is a root-relative path such as `/uploads/jobtemplates/…`. The UI is hosted on a different origin from the API (`https://api.v2.cimmple.net` in production, port 5172 locally), so the browser requests the path from the UI host, whose SPA fallback returns the React app rather than the file.

**Steps to Reproduce:**
1. Upload an attachment to a job template.
2. Click the attachment name in the slideout.

**Expected:** The file opens or downloads.

**Actual:** A new tab opens the ERP application at `/uploads/jobtemplates/...` (no file).

**Evidence:**
- Frontend: `JobTemplateMasterSlideout.tsx` lines 1796–1800 (`href={attachment.fileUrl}`, no API host prefix); `Common/Services/JobTemplateService.ts` line 73 (raw `fileUrl`); `Common/Services/Api-config.ts` lines 6–11 (API on a separate host).
- Backend: `JobTemplateController.cs` line 879 (root-relative `FileUrl`).
- Database: `JobTemplateAttachment.FileUrl`.

**Root Cause:** A server-relative URL is used on a different origin.

**Business Impact:** Drawings attached to templates are unreachable from the UI.

**Affected Areas:** Job Template Master attachments. Also logged as BUG-JT-001 in `QA_JobTemplateMaster.md`.

**Recommended Fix:** Download through an authenticated API endpoint (see BUG-DOC-004) and open the blob client-side, as Documents and other attachments do.

---

### BUG-DOC-006 — Attachment, PDF and document-email endpoints do not check the record's site

**Severity:** Medium. A site-restricted user can read, add or delete files, and generate or email PDFs, for records of sites they cannot open.

**Status:** Confirmed

**Test Area:** Location / Permissions

**Description:** The detail endpoints for quotations, orders and vendor quotations call `CanAccessLocation`, but their attachment endpoints and every PDF and document-email endpoint only filter by tenant. The matrix expects a PDF for a record in another location to be rejected.

**Steps to Reproduce:**
1. As a Site A-only user, note that CO 500 (Site B) is not visible in `/orders/customer`.
2. Call `GET /api/Pdf/GenerateOrder?orderId=500&tenantId=<tenant>` or `GET /api/Order/OrderGetFile?...` for that order.

**Expected:** 403/404 for a Site B record.

**Actual:** The PDF or file is returned; uploads and deletes also succeed.

**Evidence:**
- Frontend: Not reachable from lists; reachable by direct API call or id change.
- Backend: `Controllers/QuotationController.cs` `QuotationSaveFile` (3800–3930), `GetQuotationAttachmentFile` (3994–4049), `DownloadQuotationAttachment` (4051–4105), `DeleteQuotationUploadedFile` (4107–4152), VQ file actions (3183, 3350, 3442, 3640), `CopyAttachmentsToOrder` (825–928); `Controllers/OrderController.cs` `OrderSaveFile` (855–943), `OrderGetFile` (948–1002), `VendorOrderSaveFile` (1004–1148), `VendorOrderGetFile` (1150–1210), `UploadNewOrderAttachments` (1384–1443); `Controllers/JobOrderController.cs` `JobOrderSaveFile`/`JobOrderGetFile` (717–960); `Controllers/PdfController.cs` (all actions) and `Services/Pdf/DocumentPdfService.cs` builders (for example lines 30–31, 114–115, 241–242); `Controllers/DocumentEmailController.cs` lines 94–118. Compare `QuotationController.cs` lines 136–137 and 1301–1304 and `OrderController.cs` lines 299 and 2050–2051, which do check `CanAccessLocation`.
- Database: Records carry `locationId` (directly or through the customer order).

**Root Cause:** Site checks were added to detail endpoints only.

**Business Impact:** Site isolation can be bypassed for files and printed documents.

**Affected Areas:** CQ, CO, VQ, VO, JO attachments; all nine PDF and email document types. Related record-level site gaps are logged as BUG-SALES-013 (`QA_Sales.md`), BUG-PROC-009 (`QA_Procurement.md`) and BUG-MFG-006 (`QA_Manufacturing.md`); this entry covers the attachment, PDF and email actions.

**Recommended Fix:** After loading the parent record, call `CanAccessLocation(record.locationId)` in every attachment, PDF and email action.

---

### BUG-DOC-007 — Document get, download, version, edit and delete endpoints do not check the document's site

**Severity:** Medium. The Documents list is site-filtered, but any document id in the tenant can be read, downloaded, edited or deleted by a site-restricted user.

**Status:** Confirmed

**Test Area:** Location / Permissions

**Description:** `GetDocuments` filters by the document's `LocationId` or its related CO/JO/VO site, but the by-id actions only filter by tenant. Document ids are sequential.

**Steps to Reproduce:**
1. As a Site A-only user, confirm a Site B document (id 77) is not listed on `/documents`.
2. Call `GET /api/Documents/77/download` (or `DELETE /api/Documents/77`).

**Expected:** 403/404 (matrix 7.4 backend Authorization: "tenant/location").

**Actual:** The file downloads (or the document is deleted).

**Evidence:**
- Frontend: `Modules/Documents/Documents.tsx` `?open=` deep link (lines 76–102) also opens any id.
- Backend: `Controllers/DocumentsController.cs` list filter lines 100–166; `GetDocument` 224–287, `UploadVersion` 478–588, `GetVersions` 590–638, `DownloadDocument` 640–723, `UpdateDocument` 733–814, `DeleteDocument` 817–876 (tenant only).
- Database: `Documents.LocationId` and related-entity columns exist but are not checked.

**Root Cause:** Location rules applied to the list query only.

**Business Impact:** Cross-site disclosure and tampering of controlled documents.

**Affected Areas:** Documents module.

**Recommended Fix:** Reuse the list's location resolution (direct or related-entity site) as a guard in each by-id action.

---

### BUG-DOC-008 — Most attachment uploads have no server-side size or file-type validation

**Severity:** Medium. The 5 MB limit and extension list exist only in the browser; direct API calls can upload any type and size (for example `.html`, `.exe` or very large files) to customer, vendor and job records.

**Status:** Confirmed

**Test Area:** Validation / Attachments

**Description:** The matrix requires "size and extension limits". Documents, job templates, NCR photos and location logos validate on the server, but the CQ, CO, VQ header/line, VO, JO and employee photo uploads accept any file. The UI component `AttachmentUploadSection` enforces 5 MB and the shared extension list only on the client.

**Steps to Reproduce:**
1. Send `POST /api/Order/OrderSaveFile` (or `JobOrderSaveFile`) with a 40 MB `.exe` file.

**Expected:** 400 with a size or type message.

**Actual:** 200; the file is stored and later served for download.

**Evidence:**
- Frontend: `Common/Components/AttachmentUploadSection.tsx` lines 64 and 95 and `Common/Services/FileUploadHelper.ts` lines 9 and 87–109 (client checks only).
- Backend: `QuotationController.cs` `QuotationSaveFile` 3800–3930, `VendorQuotationSaveFile` 3183+, `VendorQuotationDetailSaveFile` 3442+; `OrderController.cs` `OrderSaveFile` 855–943, `VendorOrderSaveFile` 1004–1148, `UploadNewOrderAttachments` 1384–1443; `JobOrderController.cs` 812–857; `EmployeeController.cs` lines 646–655 and `TrySaveProfilePicAsync` 1257–1291. Contrast `DocumentsController.cs` lines 326 and 338, `JobTemplateController.cs` lines 837–846, `QualityController.cs` lines 1832–1847, `LocationController.cs` line 278.
- Database: Attachment tables accept any name and size.

**Root Cause:** Validation implemented only in the UI.

**Business Impact:** Storage abuse and distribution of unsafe files to other users who download them.

**Affected Areas:** CQ, CO, VQ, VO, JO attachments; employee photo. Per-module duplicates: BUG-SALES-036 (CQ/CO), BUG-MFG-011 (JO), BUG-EMP-014 (employee photo); the VQ and VO uploads are only logged here.

**Recommended Fix:** Apply the shared extension allowlist and size limit on the server for every upload action.

---

### BUG-DOC-009 — Document upload saves the metadata row before the file, leaving broken documents when storage fails

**Severity:** Medium. A failed upload leaves a listed document that cannot be downloaded.

**Status:** Confirmed

**Test Area:** Database / Error handling

**Description:** `Upload` inserts the `Documents` row and calls `SaveChangesAsync` before uploading the blob and creating the version/file row. There is no transaction or cleanup, so a blob or second-save failure returns 500 while the document stays in the list without any file.

**Steps to Reproduce:**
1. Make blob storage unavailable (or upload a file that fails mid-stream).
2. Upload a document on `/documents`.
3. Reload the list and try to download the new entry.

**Expected:** No document is created when the file is not stored.

**Actual:** A document row exists; download fails.

**Evidence:**
- Frontend: `Modules/Documents/DocumentUploadModal.tsx` shows only a generic error (line 141).
- Backend: `DocumentsController.cs` lines 399–400 (insert and save), then blob upload at lines 414–417 or 443–446.
- Database: `Documents` row without a matching `DocumentVersions`/`DocumentFiles` row.

**Root Cause:** Non-atomic multi-step write.

**Business Impact:** Orphaned, unusable documents and consumed document numbers.

**Affected Areas:** Document upload.

**Recommended Fix:** Upload the blob first (or wrap the steps in a transaction and delete the row/blob on failure).

---

### BUG-DOC-010 — A failed or concurrent "upload new version" leaves the document with no current version

**Severity:** Medium. The document can no longer be downloaded as "current" after a failed upload.

**Status:** Confirmed

**Test Area:** Database / Concurrency

**Description:** `UploadVersion` computes `max + 1`, immediately commits `IsCurrentVersion = false` for all versions with `ExecuteUpdateAsync`, and only then uploads the blob and inserts the new version. A blob failure, or a second simultaneous upload hitting the unique index on (DocumentId, VersionNumber), leaves no version marked current.

**Steps to Reproduce:**
1. Open a versioned document and upload a new version while storage is failing (or upload two versions at the same moment from two tabs).
2. Download the current version.

**Expected:** The previous version remains current when the new upload fails.

**Actual:** No version is current; current download fails.

**Evidence:**
- Frontend: `Modules/Documents/DocumentDetailModal.tsx` "Upload New Version" (lines 286 and 408).
- Backend: `DocumentsController.cs` lines 527–531 (next number), 534–536 (immediate `ExecuteUpdateAsync`), 547–550 (blob upload), 553+ (insert).
- Database: Unique index on `DocumentVersions (DocumentId, VersionNumber)` (`Data/CimmpleDbContext.cs` around line 507).

**Root Cause:** The "unset current" step is committed outside the unit of work that creates the new version.

**Business Impact:** Controlled documents become unavailable.

**Affected Areas:** Document versioning.

**Recommended Fix:** Upload first, then update flags and insert the new version in one transaction.

---

### BUG-DOC-011 — Auto-generated document numbers can duplicate manually entered numbers

**Severity:** Low. Two documents can share a `DOC-{year}-{NNNN}` number, which breaks traceability.

**Status:** Confirmed

**Test Area:** Validation / Database

**Description:** `GenerateDocumentNumber` takes the highest number among auto-generated documents only, and there is no unique index on `DocumentNumber`. A manually typed `DOC-2026-0005` is ignored by the generator, which will later produce the same value. Concurrent uploads can also receive the same next number.

**Steps to Reproduce:**
1. Upload a document with custom number `DOC-2026-0002` while the last auto number is `DOC-2026-0001`.
2. Upload another document without a custom number.

**Expected:** The next auto number skips any number already used (matrix 7.4: number format `DOC-{year}-{NNNN}`, implied unique).

**Actual:** The auto number is `DOC-2026-0002`, duplicating the manual one.

**Evidence:**
- Frontend: `DocumentUploadModal.tsx` optional document number field.
- Backend: `DocumentsController.cs` custom-number uniqueness check only when supplied (lines 347–362); `GenerateDocumentNumber` lines 982–1016 (filters `IsDocumentNumberAutoGenerated`).
- Database: `Data/CimmpleDbContext.cs` lines 487–501 (no unique index on `DocumentNumber`).

**Root Cause:** The generator ignores manual numbers and nothing enforces uniqueness.

**Business Impact:** Ambiguous document references.

**Affected Areas:** Document numbering.

**Recommended Fix:** Check all documents when generating, retry on conflict, and add a unique index on (TenantId, DocumentNumber).

---

### BUG-DOC-012 — Deleting a customer order, job order or NCR leaves its files in storage

**Severity:** Low. Orphaned files consume storage and are retained after the business record is deleted.

**Status:** Confirmed

**Test Area:** Database / Attachments

**Description:** The matrix expects "files removed when the parent is deleted". Quotation, vendor order and job template deletion remove their blobs, but customer order deletion removes only the `OrderAttachment` rows, job order deletion removes the row (with `AttachmentsJson`) without touching blobs, and NCR deletion never deletes photos.

**Steps to Reproduce:**
1. Add attachments to a CO, a JO and an NCR.
2. Delete each record.
3. Inspect the tenant's blob container.

**Expected:** The files are deleted.

**Actual:** The blobs remain.

**Evidence:**
- Backend: `OrderController.cs` lines 1628–1635 (DB rows removed, no blob delete); `JobOrderController.cs` `DeleteJobOrder` lines 1025–1050 (no blob delete); `QualityController.cs` (no `DeleteAsync` call for `NcrPhotosFolder`; only upload at line 1853 and read at line 1940). Compare `QuotationController.cs` lines 968–987 and `OrderController.cs` lines 3465–3481 (blobs deleted).
- Database: Rows removed; blobs not.

**Root Cause:** Inconsistent cleanup across modules.

**Business Impact:** Storage cost and retention of data the user believes was deleted.

**Affected Areas:** CO, JO, NCR deletion. The job order part is also logged as BUG-MFG-018 in `QA_Manufacturing.md`.

**Recommended Fix:** Delete the parent's blobs (best effort) in each delete action, as the quotation and vendor order deletes do.

---

### BUG-DOC-013 — Customer invoice PDF loads every tenant's order lines into memory

**Severity:** Medium. Each invoice PDF or email reads the entire `CustomerOrderDetails` table, so generation slows down and memory grows with total platform data; invoice lines without an order line are also dropped from the PDF.

**Status:** Confirmed

**Test Area:** API / Performance / Business Logic

**Description:** `BuildInvoiceAsync` loads the invoice details into a list, then calls `invoiceDetails.Join(_context.CustomerOrderDetails, …)`. Because the outer sequence is an in-memory list, LINQ-to-Objects enumerates the whole `CustomerOrderDetails` DbSet (all tenants) and joins in memory. The vendor invoice builder in the same file correctly queries only the needed ids.

**Steps to Reproduce:**
1. In an environment with a large number of order lines, generate an invoice PDF.
2. Observe the SQL issued (a full `SELECT` from `CustomerOrderDetails` with no WHERE clause) and the response time.

**Expected:** Only the order lines referenced by the invoice are read, scoped to the tenant.

**Actual:** The entire table is read for every invoice PDF and invoice email.

**Evidence:**
- Backend: `Services/Pdf/DocumentPdfService.cs` lines 247–250 (`ToListAsync`), lines 268–291 (`invoiceDetails.Join(_context.CustomerOrderDetails, …)`). Compare lines 360–372 (vendor invoice: `Where(vod => ids.Contains(vod.ID) && vod.Tenantid == tenantId)`).
- Database: `CustomerOrderDetails` full scan.

**Root Cause:** Mixing an in-memory list with a DbSet in a LINQ join.

**Business Impact:** Slow or timed-out invoice printing and emailing as data grows; the email dialog already warns of multi-minute waits.

**Affected Areas:** Invoice PDF and `SendInvoice`.

**Recommended Fix:** Query `CustomerOrderDetails` filtered by the invoice's `OrderDetailID` values and tenant, then join in memory, and use a left join so lines without an order line are still printed.

---

### BUG-DOC-014 — Document email accepts invalid To/CC addresses and reports success

**Severity:** Medium. The user sees "Email queued for delivery" for an address that can never be delivered; the failure is visible only in the outbox.

**Status:** Confirmed

**Test Area:** Validation

**Description:** The matrix lists "invalid email" for `SendDocumentEmailDialog`. The To field has `type="email"` but the dialog has no `<form>` submit, so browser validation never runs; CC is plain text. The API only checks that To is not empty. MailKit rejects the address later in the background sender.

**Steps to Reproduce:**
1. Open Email on any quotation, enter `customer@` in To (or `abc` in CC), and click Send email.

**Expected:** The dialog or API rejects the invalid address.

**Actual:** Toast "Email queued for delivery. (customer@)"; the outbox row later fails after retries.

**Evidence:**
- Frontend: `Common/Components/SendDocumentEmailDialog.tsx` lines 70–95 (no format check), lines 178–195 (inputs outside any form).
- Backend: `Controllers/DocumentEmailController.cs` lines 140–144 (empty check only); `Services/EmailOutboxService.cs` lines 47–50 (empty check only); `Services/EmailService.cs` `SplitAddresses` lines 190–201 and `MailboxAddress.Parse` lines 158 and 160 (throws during delivery).
- Database: `EmailOutbox` row stored with invalid recipients and eventually marked Failed.

**Root Cause:** No email format validation before enqueueing.

**Business Impact:** Customers and vendors do not receive quotations, POs and invoices while staff believe they were sent.

**Affected Areas:** All nine document email types.

**Recommended Fix:** Validate To and CC on the client and with `MailboxAddress.TryParse` in `SendDocumentAsync`, listing invalid entries.

---

### BUG-DOC-015 — A custom email message that contains "<" is sent as raw HTML

**Severity:** Low. Plain-text messages such as "Qty <5 on line 2" lose their line breaks and text after the "<".

**Status:** Confirmed

**Test Area:** Business Logic

**Description:** `SendDocumentAsync` sets `isHtml = request.Message.Contains('<')`. Any plain-text message containing a less-than sign is sent as HTML without encoding, so newlines collapse and text that looks like a tag disappears.

**Steps to Reproduce:**
1. Email a quotation with the message "Hello,\nPlease note qty <5 pcs for line 2.\nThanks".
2. Open the received email.

**Expected:** The message appears exactly as typed.

**Actual:** One run-on line, with "<5 pcs for line 2." partly or fully missing.

**Evidence:**
- Frontend: `SendDocumentEmailDialog.tsx` lines 208–215 (plain textarea).
- Backend: `DocumentEmailController.cs` lines 153–157.
- Database: N/A.

**Root Cause:** HTML detection by a single character.

**Business Impact:** Garbled customer communication.

**Affected Areas:** Document email custom message.

**Recommended Fix:** Treat the textarea as plain text: HTML-encode it and convert newlines to `<br/>`.

---

### BUG-DOC-016 — Documents screens show generic Axios errors instead of the server's message

**Severity:** Low. Users see "Request failed with status code 400" instead of "Document number already exists" or "File type not allowed".

**Status:** Confirmed

**Test Area:** Error handling

**Description:** The Documents list, upload modal and detail modal show `error.message` from Axios. The server returns its reason in `error` (and the shared helper `getApiErrorMessage` exists), so the actionable message is lost.

**Steps to Reproduce:**
1. Upload a document with a custom number that already exists.

**Expected:** A toast with the server text.

**Actual:** "Request failed with status code 400".

**Evidence:**
- Frontend: `Modules/Documents/Documents.tsx` lines 133 and 163; `DocumentUploadModal.tsx` lines 108 and 141; `DocumentDetailModal.tsx` lines 93, 119, 160, 183 and 201. Compare `Common/Services/FileUploadHelper.ts` `getApiErrorMessage` lines 46–60, already used by the deep-link handler in `Documents.tsx`.
- Backend: `DocumentsController.cs` returns `{ error = "…" }` for validation failures (for example lines 326–362).
- Database: N/A.

**Root Cause:** The shared error helper is not used consistently.

**Business Impact:** Users retry blindly or raise support tickets.

**Affected Areas:** Documents list, upload, version upload, edit and delete.

**Recommended Fix:** Use `getApiErrorMessage(error)` in these catch blocks.

---

### BUG-DOC-017 — Category and tag filters only search the current page and show a misleading empty state

**Severity:** Low. With more than 20 documents, choosing a category can show "No documents match the selected filters" while matching documents exist on other pages.

**Status:** Confirmed

**Test Area:** Filters

**Description:** The matrix documents the filter as "client, current page only". The UI applies it to the 20 loaded rows while pagination still shows the server totals, and the empty-state text implies no document matches at all. The API already supports a `categoryId` filter, but the UI passes `undefined`.

**Steps to Reproduce:**
1. Have 30 documents; put the only "Contracts" document on page 2 (by sort order).
2. On page 1, filter by "Contracts".

**Expected:** The matching document is found (or the UI states that only the current page is filtered).

**Actual:** "No documents match the selected filters" with "Page 1 of 2".

**Evidence:**
- Frontend: `Documents.tsx` lines 117–125 (`categoryId: undefined`), lines 277–290 (client filter), lines 409–422 (empty state).
- Backend: `DocumentsController.cs` `GetDocuments` lines 46–221 accepts `categoryId`.
- Database: N/A.

**Root Cause:** Client-side filtering of a server-paged list.

**Business Impact:** Users conclude documents are missing.

**Affected Areas:** Documents list.

**Recommended Fix:** Send `categoryId` (and tags) to the server and reset to page 1 when the filter changes.

---

### BUG-DOC-018 — Document access log is recorded but cannot be viewed

**Severity:** Low. The matrix lists "versions, access log" in the detail view, but only versions are shown.

**Status:** Confirmed

**Test Area:** Business Logic

**Description:** The server writes `DocumentAccessLogs` on view, download and delete, but there is no endpoint to read them and `DocumentDetailModal` has no access-log section.

**Steps to Reproduce:**
1. Download a document, then open its detail modal.

**Expected:** An access log listing who viewed and downloaded the document.

**Actual:** No access log is shown anywhere.

**Evidence:**
- Frontend: `Modules/Documents/DocumentDetailModal.tsx` (versions and metadata only).
- Backend: `DocumentsController.cs` `LogAccessAsync` lines 1019–1050 (write only); no GET for access logs.
- Database: `DocumentAccessLogs` populated.

**Root Cause:** Feature implemented on the write side only.

**Business Impact:** Audit trail not available to users.

**Affected Areas:** Document detail.

**Recommended Fix:** Add a read endpoint (tenant and location checked) and an "Access log" tab.

---

### BUG-DOC-019 — NCR PDF errors always show the generic Axios message

**Severity:** Low. The NCR service tries to surface the server message, but its own catch block swallows it.

**Status:** Confirmed

**Test Area:** Error handling

**Description:** In `GenerateNCR`, the parsed server message is thrown inside a `try` whose `catch {}` immediately discards it, so the original Axios error is rethrown.

**Steps to Reproduce:**
1. Request the PDF of a deleted NCR from its slideout.

**Expected:** "NCR not found".

**Actual:** "Request failed with status code 404".

**Evidence:**
- Frontend: `Common/Services/PdfService.ts` lines 113–127 (`throw new Error(...)` at line 120 inside the `try` that ends with `catch { }` at line 122).
- Backend: `PdfController.cs` lines 71–80 return `{ error }`.
- Database: N/A.

**Root Cause:** Error thrown inside the block whose catch swallows all errors.

**Business Impact:** Minor; unclear error messages.

**Affected Areas:** NCR PDF.

**Recommended Fix:** Parse inside the try, store the message, and throw after the try/catch.

---

### BUG-DOC-020 — Attachment and logo upload errors return the server stack trace

**Severity:** Low. Information disclosure of internal paths and code structure.

**Status:** Confirmed

**Test Area:** API / Error handling

**Description:** Several upload and attachment actions return `stackTrace = ex.StackTrace` (or similar) in their 500 responses.

**Steps to Reproduce:**
1. Trigger an exception in an upload (for example, an invalid `formField` JSON).
2. Inspect the 500 response body.

**Expected:** Generic message; details only in logs.

**Actual:** The .NET stack trace is returned.

**Evidence:**
- Backend: `JobOrderController.cs` line 882; `QuotationController.cs` lines 926 (`CopyAttachmentsToOrder`) and 3928 (`QuotationSaveFile`); `JobTemplateController.cs` lines 905 and 931; `LocationController.cs` lines 399–403 (`UploadLogo`).
- Frontend / Database: N/A.

**Root Cause:** Debug-style error responses.

**Business Impact:** Hardening gap.

**Affected Areas:** Attachment and logo endpoints. Module-level stack-trace findings also exist as BUG-LOC-004 (`QA_LocationMaster.md`) and BUG-MFG-008 (`QA_Manufacturing.md`).

**Recommended Fix:** Log the exception and return a generic message.

---

### BUG-DOC-021 — Document category id is not validated against the tenant

**Severity:** Low. A crafted request can link a document to another tenant's category id.

**Status:** Confirmed

**Test Area:** Validation / Tenant

**Description:** `Upload` and `UpdateDocument` store the posted `categoryId` without checking that the category belongs to the caller's tenant.

**Steps to Reproduce:**
1. `POST /api/Documents/upload` with `categoryId` of a category from another tenant.

**Expected:** 400 "Invalid category".

**Actual:** The document is saved with the foreign category id.

**Evidence:**
- Backend: `DocumentsController.cs` line 382 (upload) and line 767 (update) assign `CategoryId` directly.
- Database: `Documents.CategoryId` references `DocumentCategories` across tenants.

**Root Cause:** Missing ownership check on a foreign key.

**Business Impact:** Data integrity; possible leak of another tenant's category name in listings that join categories.

**Affected Areas:** Document upload and edit.

**Recommended Fix:** Verify `DocumentCategories.Any(c => c.Id == categoryId && c.TenantId == tenantId)` before saving.

---

## Potential Bugs

### BUG-DOC-022 — Global "max + 1" file numbers can collide and overwrite blobs under concurrent uploads

**Severity:** Medium. Two simultaneous uploads can get the same number, and the second blob overwrites the first.

**Status:** Potential

**Test Area:** Concurrency / Attachments

**Description:** Quotation, order and vendor order attachments compute `FileUniqueno = Max(FileUniqueno) + 1` over the whole table (all tenants), then store the blob as `{n}{ext}`. Two uploads in the same moment (same tenant and extension) can read the same max and write the same blob path.

**Steps to Reproduce:**
1. Upload `.pdf` attachments to two different quotations of the same tenant at exactly the same time (scripted).
2. Download both.

**Expected:** Each attachment returns its own file.

**Actual:** Both may return the file written last.

**Evidence:**
- Backend: `QuotationController.cs` lines 3873–3879 and 4213–4219; `OrderController.cs` lines 1074–1082 and 1399–1403; `QuotationController.cs` lines 862–866 (`CopyAttachmentsToOrder`).
- Database: `FileUniqueno` has no unique constraint.

**Root Cause:** Non-atomic sequence generation used as a storage key.

**Business Impact:** Wrong file served for a record.

**Affected Areas:** CQ, CO, VO attachments, CQ → CO copy. BUG-SALES-036 in `QA_Sales.md` mentions the same unlocked global maximum for CQ/CO.

**Recommended Fix:** Use GUID-based blob names or a database sequence/identity.

**Why further verification is needed:** Requires concurrent requests; collision probability depends on load.

---

### BUG-DOC-023 — 50 MB document uploads are likely rejected by the default request size limit

**Severity:** Medium. Files between roughly 28.6 MB and 50 MB may fail although the UI and controller allow 50 MB.

**Status:** Potential

**Test Area:** Validation / API

**Description:** The Documents UI and controller allow 50 MB, but `Program.cs` does not raise Kestrel/IIS `MaxRequestBodySize` or multipart limits, and the upload actions have no `[RequestSizeLimit]` (only support tickets and attendance do). The ASP.NET Core default is about 30,000,000 bytes.

**Steps to Reproduce:**
1. Upload a 40 MB PDF on `/documents`.

**Expected:** Upload succeeds (matrix 7.4: ≤ 50 MB).

**Actual:** Likely 413 Payload Too Large, shown as a generic error.

**Evidence:**
- Frontend: `DocumentUploadModal.tsx` (50 MB client check).
- Backend: `DocumentsController.cs` lines 338 and 521 (`MaxFileSize` 50 MB); `Program.cs` (no request-size configuration).
- Database: N/A.

**Root Cause:** Server limits not aligned with the documented maximum.

**Business Impact:** Large drawings and manuals cannot be stored.

**Affected Areas:** Document upload and new version.

**Recommended Fix:** Add `[RequestSizeLimit]`/`[RequestFormLimits]` for the upload actions and align the hosting limit (`web.config` `maxAllowedContentLength` on IIS).

**Why further verification is needed:** The effective limit depends on the hosting configuration (IIS/Azure App Service settings are not in the repository).

---

### BUG-DOC-024 — Non-ASCII file names may break attachment preview

**Severity:** Low. Attachments named with accented or non-Latin characters may fail to open inline.

**Status:** Potential

**Test Area:** Attachments (filename special characters)

**Description:** `GetQuotationAttachmentFile` and `OrderGetFile` set `Content-Disposition` manually as `inline; filename="{fileName}"`. Kestrel rejects non-ASCII characters in response header values, which would turn the request into a 500. `SanitizeFileName` only removes commas and quotes.

**Steps to Reproduce:**
1. Upload `Zeichnung_Größe.pdf` to a quotation and click to preview it.

**Expected:** The file opens.

**Actual:** Possible 500 error.

**Evidence:**
- Backend: `QuotationController.cs` line 4040; `OrderController.cs` line 993; `Utilities/ModuleFileStorage.cs` `SanitizeFileName` lines 74–82.
- Database: Original names stored.

**Root Cause:** Manual header construction without RFC 5987 encoding.

**Business Impact:** Files with international names cannot be previewed.

**Affected Areas:** CQ and CO attachment preview.

**Recommended Fix:** Use `ContentDispositionHeaderValue` with `FileNameStar`, or `File(bytes, type, fileName)`.

**Why further verification is needed:** Behaviour depends on the hosting server (Kestrel versus IIS in-process).

---

### BUG-DOC-025 — Uploaded SVG and client-declared content types are served as active content from the API origin

**Severity:** Low. A crafted SVG (or a file uploaded with `Content-Type: text/html`) can run script on the API origin when opened directly.

**Status:** Potential

**Test Area:** Security / Attachments

**Description:** Location logos and job template attachments allow `.svg` and are served from public `wwwroot` as `image/svg+xml`. Documents store the client-supplied `ContentType` and return it on download. Opening such a file directly in the browser executes embedded script on the API host.

**Steps to Reproduce:**
1. Upload an SVG containing `<script>alert(document.domain)</script>` as a location logo.
2. Open `https://<api-host>/uploads/logos/{tenant}/{location}/…svg`.

**Expected:** The file is served as a download or sanitised.

**Actual:** The script executes on the API origin.

**Evidence:**
- Backend: `LocationController.cs` line 269 (`.svg` allowed) and lines 306–323 (saved under `wwwroot/uploads/logos`); `JobTemplateController.cs` line 33 (`.svg` allowed); `DocumentsController.cs` line 384 (`MimeType = file.ContentType`) and lines 712–717 (returned on download); `Program.cs` line 250.
- Database: `Documents.MimeType` stores the client value.

**Root Cause:** Active content served inline from the API origin.

**Business Impact:** Limited, because tokens live in the UI origin's storage, but it enables phishing pages on the trusted API domain.

**Affected Areas:** Location logos, job template attachments, documents. The logo and template SVG parts overlap BUG-LOC-007 and BUG-JT-004; the document MIME-type part is only logged here.

**Recommended Fix:** Serve uploads with `Content-Disposition: attachment` and `X-Content-Type-Options: nosniff`, derive MIME types from the extension, and sanitise or reject SVG.

**Why further verification is needed:** Impact depends on browser behaviour and any CSP headers set by the hosting layer.

---

## Needs Manual Verification

1. **Area:** PDF totals versus screen (all nine document types).
   **What to Test:** For each document type, compare the PDF line amounts, discounts, tax, shipping and totals with the screen; for quotations, toggle price-matrix `includeInPrint` flags.
   **Expected:** Values match; only included quantity tiers are printed.
   **Why Manual Testing Is Required:** QuestPDF rendering and rounding must be seen; the code reads `includeInPrint` (`DocumentPdfService.cs` lines 1398–1407).

2. **Area:** Letterhead and logo of the selected location.
   **What to Test:** Switch the working site, then print and email a document.
   **Expected:** The selected site's name, address and logo appear; without a site logo, the EntityMaster details are used.
   **Why Manual Testing Is Required:** The logo is read from the API server's local `wwwroot` (`DocumentPdfService.cs` lines 1269–1292), which depends on deployment (multiple instances or redeploys can lose files).

3. **Area:** Document email delivery.
   **What to Test:** Send each document type with CC, custom subject and message; check the received email and attachment name.
   **Expected:** Email arrives with the PDF; defaults apply when fields are blank.
   **Why Manual Testing Is Required:** Requires SMTP and the outbox hosted service.

4. **Area:** CQ → CO attachment copy.
   **What to Test:** Convert a quotation with attachments into an order and open the copied files.
   **Expected:** All selected files are copied and open correctly.
   **Why Manual Testing Is Required:** `CopyAttachmentsToOrder` skips failed copies silently (`QuotationController.cs` lines 873–877) and overwrites `order.AttachmentsJson` (lines 912–914); the outcome depends on storage behaviour.

5. **Area:** Documents on phone (matrix "`/documents`; upload on phone").
   **What to Test:** Upload from a phone camera or files app at 375/390/430 px; open the viewer.
   **Expected:** Upload modal and viewer fit; file picker works.
   **Why Manual Testing Is Required:** Device behaviour; `Documents.scss` has no breakpoint (see `QA_PWA.md` BUG-PWA-001).

6. **Area:** Attachment filename special characters.
   **What to Test:** Upload files with spaces, `#`, `&`, `%`, quotes and non-ASCII characters across modules; preview and download.
   **Expected:** Names preserved; files open.
   **Why Manual Testing Is Required:** Header encoding behaviour differs by server (see BUG-DOC-024).

7. **Area:** Location logo limits.
   **What to Test:** Upload logos over 5 MB and with disallowed extensions.
   **Expected:** Rejected with a clear message.
   **Why Manual Testing Is Required:** Server checks exist (`LocationController.cs` lines 269–278); the UI message path should be confirmed in the browser.

## No Issues Found

- Document blob names are `{documentId}/{name}_{timestamp}{ext}`, built with `Path.GetFileNameWithoutExtension`, so document uploads are not vulnerable to path traversal.
- Document deletion is a soft delete of metadata with intentional best-effort blob removal, as documented in the code comment.
- Document categories are unique per tenant (existence check plus a unique index on CategoryName + TenantId).
- Document download errors are parsed from Blob responses in `DocumentService.toDownloadError`, so download failures show the server message.
- Document extension and size validation exists on both client and server, and the client extension list matches the server list.
- NCR photos validate extension (with content-type fallback), 8 MB per photo and 10 per NCR on the server, and use GUID-based blob names.
- Job template attachments validate extension and 25 MB on the server, and template deletion removes attachment files.
- Quotation and vendor order deletion remove their attachment blobs.
- Default document email bodies HTML-encode the party, label and company names (`DocumentEmailTemplates.cs` lines 16–22).
- The NCR PDF query is parameterised (`@ncrId`, `@tenantId`), so it is not injectable.
- PDF and email builders filter quotation, order, invoice, vendor documents, shipment and job order by tenant (apart from BUG-DOC-002 for NCR).

## QA Coverage

| Test Area | Tested | Result |
| --- | --- | --- |
| Navigation | Yes | Fail (BUG-DOC-005) |
| CRUD | Yes | Fail (BUG-DOC-009, BUG-DOC-010, BUG-DOC-012) |
| Search | Yes | Pass |
| Filters | Yes | Fail (BUG-DOC-017) |
| Sorting | Yes | Pass |
| Pagination | Yes | Pass |
| Validation | Yes | Fail (BUG-DOC-008, BUG-DOC-011, BUG-DOC-014, BUG-DOC-021); Potential (BUG-DOC-023) |
| Permissions | Yes | Fail (BUG-DOC-004, BUG-DOC-006, BUG-DOC-007) |
| API | Yes | Fail (BUG-DOC-013, BUG-DOC-016, BUG-DOC-019, BUG-DOC-020); Potential (BUG-DOC-024, BUG-DOC-025) |
| Database | Yes | Fail (BUG-DOC-001, BUG-DOC-009, BUG-DOC-010, BUG-DOC-011); Potential (BUG-DOC-022) |
| Business Logic | Yes | Fail (BUG-DOC-015, BUG-DOC-018) |
| Location | Yes | Fail (BUG-DOC-006, BUG-DOC-007) |
| Tenant | Yes | Fail (BUG-DOC-002, BUG-DOC-003, BUG-DOC-021) |
| Cross-Module | Yes | Fail (BUG-DOC-001, BUG-DOC-012) |
| Responsive/PWA | Partial | Manual |

## Matrix Checklist

| Matrix Row | Result | Notes |
| --- | --- | --- |
| 7.4 FE List — 20/page | Pass | Server paging. |
| 7.4 FE Search — server | Pass | `search` sent to `GET /Documents`. |
| 7.4 FE Filter — category and tags, client, current page only | Fail (BUG-DOC-017) | Misleading empty state. |
| 7.4 FE Sort / Pagination — server | Pass | — |
| 7.4 FE Add — ≤ 50 MB, extension list, category | Fail (BUG-DOC-009, BUG-DOC-016); Potential (BUG-DOC-023) | — |
| 7.4 FE View — versions, access log | Fail (BUG-DOC-007, BUG-DOC-018) | — |
| 7.4 FE New version | Fail (BUG-DOC-010) | — |
| 7.4 FE Download — current / specific version | Fail (BUG-DOC-007) | Works for allowed records; no site check. |
| 7.4 FE Edit — metadata | Fail (BUG-DOC-007, BUG-DOC-021) | — |
| 7.4 FE Delete — soft | Fail (BUG-DOC-007) | Soft delete itself works. |
| 7.4 FE Validation — size, extension, title/category | Pass | Client and server checks present. |
| 7.4 FE Permissions / Responsive — upload on phone | Manual | Manual Verification item 5. |
| 7.4 BE CRUD | Fail (BUG-DOC-009, BUG-DOC-010) | — |
| 7.4 BE Validation — 50 MB; extension list; `DOC-{year}-{NNNN}` | Fail (BUG-DOC-011); Potential (BUG-DOC-023) | — |
| 7.4 BE Authorization — tenant/location | Fail (BUG-DOC-007) | Tenant enforced; location only on list. |
| 7.5 Customer Quotation PDF/email | Fail (BUG-DOC-006, BUG-DOC-014) | Totals: Manual item 1. |
| 7.5 Customer Order PDF/email | Fail (BUG-DOC-006, BUG-DOC-014) | — |
| 7.5 Customer Invoice PDF/email | Fail (BUG-DOC-006, BUG-DOC-013, BUG-DOC-014) | — |
| 7.5 Shipment PDF/email | Fail (BUG-DOC-006, BUG-DOC-014) | — |
| 7.5 Vendor Quotation PDF/email | Fail (BUG-DOC-006, BUG-DOC-014) | — |
| 7.5 Vendor Order PDF/email | Fail (BUG-DOC-006, BUG-DOC-014) | — |
| 7.5 Vendor Invoice PDF/email | Fail (BUG-DOC-006, BUG-DOC-014) | — |
| 7.5 Job Order traveller PDF/email | Fail (BUG-DOC-006, BUG-DOC-014) | — |
| 7.5 NCR PDF/email | Fail (BUG-DOC-002, BUG-DOC-006, BUG-DOC-014, BUG-DOC-019) | — |
| 7.5 Bullet — `PdfController` / `DocumentEmailController` via EmailOutbox | Fail (BUG-DOC-002, BUG-DOC-006) | Emails are queued correctly. |
| 7.5 Bullet — `SendDocumentEmailDialog` recipients, CC, subject, body, attachments, invalid email | Fail (BUG-DOC-014, BUG-DOC-015) | Subject/body defaults work; the PDF is attached automatically and there is no extra-attachment option. |
| 7.5 Bullet — letterhead and logo of the selected location | Manual | Manual Verification item 2. |
| 7.5 Bullet — PDF totals match screen; `includeInPrint` | Manual | Manual Verification item 1; invoice lines without an order line are dropped (BUG-DOC-013). |
| 7.5 Bullet — PDF for another tenant/location rejected | Fail (BUG-DOC-002, BUG-DOC-006) | — |
| 7.6 CQ attachments | Fail (BUG-DOC-006, BUG-DOC-008); Potential (BUG-DOC-022, BUG-DOC-024) | — |
| 7.6 CQ → CO copy (`CopyAttachmentsToOrder`) | Fail (BUG-DOC-006); Potential (BUG-DOC-022) | Manual item 4. |
| 7.6 CO attachments (5 MB, deferred) | Fail (BUG-DOC-006, BUG-DOC-008, BUG-DOC-012) | 5 MB is client-only. |
| 7.6 VQ header/line files | Fail (BUG-DOC-001, BUG-DOC-006, BUG-DOC-008) | — |
| 7.6 VO attachments | Fail (BUG-DOC-006, BUG-DOC-008); Potential (BUG-DOC-022) | Deletion cleans blobs. |
| 7.6 JO attachments | Fail (BUG-DOC-001, BUG-DOC-006, BUG-DOC-008, BUG-DOC-012) | — |
| 7.6 Job template files (≤ 25 MB) | Fail (BUG-DOC-004, BUG-DOC-005) | Server limits enforced. |
| 7.6 NCR photos (≤ 10 × 8 MB) | Fail (BUG-DOC-003, BUG-DOC-012) | Limits enforced. |
| 7.6 Location logo (≤ 5 MB) | Potential (BUG-DOC-025) | Limits enforced; Manual item 7. |
| 7.6 Employee photo (`SaveEmployeeData`, `GetProfilePic`) | Fail (BUG-DOC-008) | Anonymous `GetProfilePic` is a cross-module concern. |
| 7.6 Bullet — size and extension limits | Fail (BUG-DOC-008) | — |
| 7.6 Bullet — download from another tenant rejected | Fail (BUG-DOC-003, BUG-DOC-004) | — |
| 7.6 Bullet — files removed when parent deleted | Fail (BUG-DOC-012) | — |
| 7.6 Bullet — filename special characters | Potential (BUG-DOC-024) | Manual item 6. |

## Cross-Module Concerns

| Concern | Owner file | Evidence |
| --- | --- | --- |
| PDF endpoints take `tenantId` only from the query string; document email, attachment upload/download/delete, `CopyAttachmentsToOrder`, job template attachment and location logo actions let a body, form or query `tenantId` override the token tenant. | `QA_TenantLocationFramework.md` (client-supplied `tenantId`) | `PdfController.cs` lines 17–68; `DocumentEmailController.cs` line 102; `QuotationController.cs` lines 826–837, 3207–3226, 3460–3489, 3826–3842; `OrderController.cs` `OrderSaveFile`/`VendorOrderSaveFile`; `JobOrderController.cs` lines 749 and 762–765, 893–903; `JobTemplateController.cs` lines 825 and 910; `LocationController.cs` `UploadLogo`/`DeleteLogo` (258–448). |
| No server-side role check on PDF, email, attachment or document actions. | `QA_RolesPermissions.md` (no server-side role enforcement) | All controllers above rely only on authentication. |
| Employee Master `GetProfilePic` is `[AllowAnonymous]` and serves `.svg` as `image/svg+xml`. | `QA_EmployeeMaster.md` BUG-EMP-002 | `EmployeeController.cs` lines 332–397. |
| `DeleteNCR` falls back to an NCR of any tenant when the tenant-scoped lookup fails. | `QA_QualityNCR.md` BUG-NCR-003 | `QualityController.cs` lines 1646–1657. |
