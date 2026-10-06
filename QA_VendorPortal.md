# QA — Vendor Portal -t

| Module | Matrix section | Bug ID prefix | Tested | Confirmed Bugs | Potential Bugs | Manual Verification |
| --- | --- | --- | --- | --- | --- | --- |
| Vendor Portal | 1.11 | BUG-VPORTAL | Yes | 6 | 2 | 4 |

Source of test cases: `QA_TEST_MATRIX.md`. Method: static trace of the actual implementation (React UI → service → Axios → .NET controller → service/repository → EF Core → SQL Server, and back). No application code, configuration or database is changed during QA. Findings that depend on deployed configuration, data or a real browser go under **Needs Manual Verification**.

Severity scale:
- **Critical**: security breach, data corruption, financial corruption, or a blocked core workflow.
- **High**: a major feature is broken or a significant security control is bypassed, with a workaround that is hard or unavailable.
- **Medium**: a feature works incorrectly in specific conditions, or a security control is weaker than configured.
- **Low**: cosmetic, minor UX, or an informational/hardening issue.

---

## Carried-Over Concerns (from `QA_Authentication.md`)

Observed while testing Authentication; root cause is in this module. Verify and log formally when this module is tested.

- Vendor-portal tokens are accepted by all ERP endpoints; only `QuotationController` checks `IsVendorPortal()`. ERP and Vendor Portal sessions share the localStorage keys `permissions` and `allowedLocations`, and a forced logout on either clears both (`AuthService.ts` lines 77–88; `Axios-config.ts` line 36).
  - **Verified → BUG-VPORTAL-001** (vendor token accepted by ERP endpoints) and **BUG-VPORTAL-005** (shared localStorage keys; forced logout clears both sessions). Vendor logout not revoking the server session is logged as **BUG-VPORTAL-006**.

## Confirmed Bugs

### BUG-VPORTAL-001 — Vendor-portal tokens are accepted by ERP endpoints, giving an external vendor the ERP API of its customer's tenant

**Severity:** Critical — an external supplier can read competitors' quotes, customer/employee data, and change or delete ERP records of the tenant (including password reset).
**Status:** Confirmed
**Test Area:** Authorization (matrix 1.11 Backend "Authorization")

**Description:** `VendorLogin` issues a token signed with the same key, issuer and audience as ERP tokens, with a positive `tenantId` and `userId` plus `portalType=vendor` and `vendorId`. The only server-side enforcement of the portal type is inside a few `QuotationController` actions (`GetVendorQuotationsByVendorCode`, `GetVendorQuotationById`, `SaveVendorQuotation`, and the vendor file endpoints via `GetVendorId()`). Every other controller, and every other Quotation action, accepts the vendor token as a normal ERP user of that tenant. The vendor knows its tenant id (it is stored in `vendorStorage`), so all endpoints that take `tenantId` in the query or body also work.

**Steps to Reproduce:**
1. Log in at `/vendor/login` and copy `vendorToken`.
2. Call `GET /api/Quotation/GetVendorQuotationComparison?parentQuotationId=<RFQ id>&tenantId=<own tenant>` → returns every vendor's prices for the same RFQ.
3. Call `POST /api/Quotation/ConvertVendorQuotationToOrder?quotationId=<own quote>` or `DELETE /api/Quotation/DeleteVendorQuotation?quotationId=<competitor>&tenantId=<tenant>`.
4. Call `GET /api/Customer/GetCustomerlist?tenantid=<tenant>` or `POST /api/UserManagement/ResetPassword` with the tenant administrator's id.

**Expected:** Vendor tokens are limited to the vendor-scoped quotation endpoints ("scoped by `vendorId` claim + tenant; sent quotations only").

**Actual:** All the calls above succeed for a vendor token.

**Evidence:**
- Frontend: `Cimmple_UI/src/Common/Services/Axios-config.ts` lines 54–63 (vendor paths send `vendorToken`); `Common/Services/AuthService.ts` lines 52–125 (vendor session stores tenant id).
- Backend: `Services/Auth/AuthService.cs` lines 75–149 (`VendorLoginAsync`) and 667–701 (`BuildClaims`, positive `tenantId`, `portalType`, `vendorId`); `Services/Auth/JwtTokenService.cs` lines 45–46 and 67–72 (shared key/issuer/audience); `Controllers/ApiBaseController.cs` lines 60–75 (`IsVendorPortal`/`GetVendorId`, used only in `QuotationController` lines 1147–1311, 1517–1524 and the file endpoints); `QuotationController.GetVendorQuotationComparison` lines 3073–3098, `DeleteVendorQuotation` lines 2232–2233, `ConvertVendorQuotationToOrder` lines 2632–2633 (no portal check); `Program.cs` lines 142–147 (authenticated-user policy only).
- Database: `UserDetails.VendorId` portal users have no role, but no role/portal check is applied server-side.

**Root Cause:** One JWT scheme for all portals and no global restriction on `portalType=vendor`.

**Business Impact:** A supplier can see competitors' pricing, accept/convert its own quote, delete rivals' quotes, read customer and employee data, and take over the tenant administrator account.

**Affected Areas:** All ERP modules; Vendor Quotation comparison/accept; User Management. Related: BUG-TEN-001 (tenant override) and QA_RolesPermissions (no role checks).

**Recommended Fix:** Add a global authorization policy or filter that rejects `portalType=vendor` tokens everywhere except an explicit allow-list of vendor endpoints; mark those endpoints with a dedicated vendor policy.

---

### BUG-VPORTAL-002 — Line-attachment blob names are not unique per quotation, so files of different quotations overwrite and delete each other

**Severity:** High — vendor attachments are silently replaced, shown to the wrong vendor, or deleted; quote prices are unaffected.
**Status:** Confirmed
**Test Area:** Attachments (matrix 1.11 "Attachments")

**Description:** `VendorQuotationDetailSaveFile` names each blob `L{itemNo}_{n}{ext}`, where `n` is the next number within that line's own attachment list. The blob path is `{tenantId}/VendorQuotations/{blobName}`, with no quotation id. All vendor quotations in a tenant share the folder, so line 1's first PDF of every quotation is `L1_1.pdf`. Uploads use `UploadFromStreamAsync`, which overwrites. When one quotation removes the attachment, the shared blob is deleted for all.

**Steps to Reproduce:**
1. Send an RFQ to vendors A and B (two child quotations with line 1).
2. Vendor A uploads `specA.pdf` to line 1; vendor B uploads `specB.pdf` to line 1.
3. Vendor A opens its attachment; then vendor B removes its attachment and saves; vendor A opens again.

**Expected:** Each quotation's files are stored and served independently.

**Actual:** Vendor A downloads vendor B's file (`L1_1.pdf` was overwritten), and after B removes its attachment A gets "File not found in Azure Storage".

**Evidence:**
- Frontend: `Cimmple_UI/src/VendorPortal/VendorQuotationResponse.tsx` lines 207–282 (save, then upload pending files); `Common/Services/QuotationService.ts` lines 717–915 (vendor file calls).
- Backend: `Controllers/QuotationController.cs` lines 3555–3558 (`nextFileUniqueNo` per line) and 3571 (`L{itemNo}_{nextFileUniqueNo}{ext}`), lines 3707–3714 (download by stored name), lines 2454–2471 (delete removed blobs); `Utilities/ModuleFileStorage.cs` lines 20–45 (folder `VendorQuotations`, path without quotation id); `Utilities/UploadFile.cs` lines 57–64 (`BuildBlobPath`) and 149 (`UploadFromStreamAsync` overwrites).
- Database: `VendorQuotationsDetails.AttachmentsJson` stores the colliding names.

**Root Cause:** The blob name omits the quotation id (or a GUID), so it is unique only within one line of one quotation.

**Business Impact:** Loss of vendor-submitted drawings/certificates and disclosure of one vendor's documents to a competitor.

**Affected Areas:** Vendor Portal attachments; ERP Vendor Quotation line attachments that use the same endpoint.

**Recommended Fix:** Include the quotation id (and ideally a GUID) in the blob name or folder, for example `{tenant}/VendorQuotations/{orderId}/L{itemNo}_{n}_{guid}{ext}`; migrate existing names.

---

### BUG-VPORTAL-003 — Portal save trusts client-supplied attachment blob names, letting a vendor read or delete other files in the tenant folder

**Severity:** High — a vendor can attach another vendor's blob name to its own line and then download or delete that file.
**Status:** Confirmed
**Test Area:** Attachments / Authorization (matrix 1.11 "Attachments", "Authorization")

**Description:** `SaveVendorPortalQuotationResponse` replaces a line's `AttachmentsJson` with the attachment list from the request body, keeping any entry that has `uploadFile`/`fileUrl`. It does not check that the name was produced by `VendorQuotationDetailSaveFile` for this quotation. `VendorQuotationDetailGetFile` then serves whatever `uploadFile` is stored, and the next save deletes blobs that are no longer listed. Because names are predictable (BUG-VPORTAL-002), another vendor's `L1_1.pdf` is easy to target.

**Steps to Reproduce:**
1. As vendor A, call `SaveVendorQuotation` for its own quotation with line 1 `attachments: [{ id: 99, fileUniqueno: 99, uploadFile: "L1_1.pdf", name: "x.pdf" }]`.
2. Call `GET /api/Quotation/VendorQuotationDetailGetFile?orderId=<A's quote>&itemNo=1&fileUniqueno=99` → returns the tenant's `L1_1.pdf` (another vendor's file).
3. Save again with an empty attachment list → the server deletes `L1_1.pdf`.

**Expected:** Attachment metadata is server-owned; a vendor can reference only files uploaded to its own quotation.

**Actual:** Any name in the tenant's `VendorQuotations` folder can be read and deleted.

**Evidence:**
- Frontend: `Cimmple_UI/src/Common/Services/QuotationService.ts` lines 1221–1261 (save sends attachments array).
- Backend: `Controllers/QuotationController.cs` lines 2398–2476 (client list accepted; removed entries deleted from blob storage) and 3700–3716 (download by stored `UploadFile`).
- Database: `VendorQuotationsDetails.AttachmentsJson`.

**Root Cause:** Attachment metadata is accepted from the client instead of being merged from server-side records.

**Business Impact:** Cross-vendor document disclosure and destruction.

**Affected Areas:** Vendor Portal; ERP Vendor Quotation attachments.

**Recommended Fix:** On save, only allow removal of existing server-known entries; ignore client-supplied `uploadFile`/`fileUrl` values; validate blob names against a strict pattern that includes the quotation id.

---

### BUG-VPORTAL-004 — "Sent quotations only" is enforced on the list but not on view, respond or upload

**Severity:** Medium — a vendor can open and respond to a draft (unsent) quotation addressed to it by guessing the id.
**Status:** Confirmed
**Test Area:** Authorization (matrix 1.11 Backend "sent quotations only")

**Description:** `GetVendorQuotationsByVendorCode` returns only sent quotations to portal callers, but `GetVendorQuotationById`, `SaveVendorPortalQuotationResponse` and `VendorQuotationDetailSaveFile` check only `VendorID`, tenant and the locked statuses. None of them checks the sent flag.

**Steps to Reproduce:**
1. In ERP, create a vendor quotation for vendor A but do not send it.
2. As vendor A, call `GetVendorQuotationById?quotationId=<id>` and then `SaveVendorQuotation` with prices.

**Expected:** 404/403 for unsent quotations.

**Actual:** The draft is returned and the response is saved with status Responded.

**Evidence:**
- Frontend: not applicable (direct API calls; the dashboard only lists sent quotations).
- Backend: `Controllers/QuotationController.cs` lines 1147–1209 (list filters sent), 1309–1322 (portal Get checks VendorID and tenant only), 2302–2344 and 2484–2486 (portal save checks locked statuses only, sets Responded), 3500–3522 (upload checks VendorID and locked statuses only).
- Database: `VendorQuotations` sent flag/status.

**Root Cause:** The sent-only rule was applied only to the list query.

**Business Impact:** Vendors can see pricing requests before the buyer finalises them and can pre-empt the RFQ.

**Affected Areas:** Vendor Portal, Vendor Quotation workflow.

**Recommended Fix:** Apply the same sent check in every portal-path query (Get, Save, file upload/download).

---

### BUG-VPORTAL-005 — ERP and Vendor Portal share localStorage keys, and a forced logout on either clears both sessions

**Severity:** Medium — using both portals in one browser corrupts the ERP user's permissions and working site, and a 401 in one portal logs out the other.
**Status:** Confirmed
**Test Area:** Session (matrix 1.11 "Separate `vendorToken` / `vendorStorage`")

**Description:** Vendor login calls the shared `persistSession`, which writes the shared keys `permissions` and `allowedLocations` and removes the ERP `locationId`/`defaultLocationId` when the vendor has no locations. Vendor logout removes only the vendor keys, leaving the vendor's empty `permissions`/`allowedLocations` in place for the ERP tab. `forceRedirectToLogin` calls `clearSession("all")` for every non-support path, so a 401 in either portal clears both.

**Steps to Reproduce:**
1. Log in to ERP as a restricted user in tab 1.
2. Log in to the vendor portal in tab 2 of the same browser.
3. Reload ERP in tab 1 → menus/permissions and working site are lost until the next ERP token refresh.
4. Let the vendor token expire and trigger a 401 in tab 2 → the ERP session in tab 1 is also cleared.

**Expected:** The two sessions are fully separate (matrix: "Separate `vendorToken` / `vendorStorage`").

**Actual:** Shared keys are overwritten and forced logout clears both sessions.

**Evidence:**
- Frontend: `Cimmple_UI/src/Common/Services/AuthService.ts` lines 87–88 (shared `permissions`/`allowedLocations`), 116–124 (removes ERP `locationId`/`defaultLocationId`), 190–208 (`clearSession`; vendor-only clear leaves shared keys); `Common/Services/Axios-config.ts` lines 36–37 (`clearSession("all")`); `VendorPortal/VendorDashboard.tsx` lines 61–66 (vendor logout).
- Backend: not applicable.
- Database: not applicable.

**Root Cause:** Portal-specific session data is stored under shared keys, and forced logout is not portal-scoped.

**Business Impact:** Staff who also test or administer the vendor portal lose their ERP context and are logged out unexpectedly.

**Affected Areas:** ERP session, Vendor Portal session, TopBar working site.

**Recommended Fix:** Use vendor-prefixed keys for permissions/locations (or skip them for vendors), never touch ERP `locationId` during vendor login, and clear only the current portal's session on forced logout.

---

### BUG-VPORTAL-006 — Vendor logout does not revoke the server-side refresh token

**Severity:** Low — a copied vendor refresh token stays usable after the vendor clicks Logout.
**Status:** Confirmed
**Test Area:** Session

**Description:** The vendor dashboard Logout only removes local keys and redirects; it does not call `/Auth/Logout`. The refresh token remains valid on the server (refresh tokens do not expire, BUG-AUTH-005).

**Steps to Reproduce:**
1. Log in as a vendor and copy `vendorRefreshToken`.
2. Click Logout.
3. Call `POST /api/Auth/Refresh` with the copied token.

**Expected:** Logout revokes the server session.

**Actual:** A new access token is issued.

**Evidence:**
- Frontend: `Cimmple_UI/src/VendorPortal/VendorDashboard.tsx` lines 61–66; compare ERP logout in `Common/Services/AuthService.ts` lines 324–332.
- Backend: `Services/Auth/AuthService.cs` lines 151–180 (`RefreshAsync`).
- Database: user refresh token column remains set.

**Root Cause:** The vendor logout handler does not call the server logout.

**Business Impact:** A token copied from a shared computer stays valid.

**Affected Areas:** Vendor Portal session.

**Recommended Fix:** Call `/Auth/Logout` with the vendor token before clearing local keys.

---

## Potential Bugs

### BUG-VPORTAL-007 — Server does not validate unit price or discount on portal responses

**Severity:** Low — stored line values can be negative or exceed 100% discount; only the total is clamped.
**Status:** Potential
**Test Area:** Validation (matrix 1.11 "Unit price required; discount % ≤ 100")

**Description:** The client marks unit price required and clamps discount to 0–100, but `SaveVendorPortalQuotationResponse` stores the submitted unit price and discount without validation. `ComputeVendorQuoteLineTotal` clamps when computing the total, so stored line fields and total can disagree.

**Steps to Reproduce:**
1. Call `SaveVendorQuotation` with a vendor token, line `unitPrice = -50`, `discount = 150`.
2. Open the quotation in ERP.

**Expected:** The server rejects missing/negative unit price and discount over 100.

**Actual (from code):** Values are stored as sent.

**Evidence:**
- Frontend: `Cimmple_UI/src/VendorPortal/VendorQuotationResponse.tsx` lines 586 (required) and 626–641 (clamp).
- Backend: `Controllers/QuotationController.cs` lines 2376–2391 (stored without validation) and 2501–2514 (clamped total).
- Database: `VendorQuotationsDetails` price/discount columns.

**Root Cause:** Validation exists only on the client.

**Business Impact:** Misleading quote comparison and conversion data.

**Affected Areas:** Vendor Quotation compare/accept/convert.

**Recommended Fix:** Validate unit price (required, ≥ 0) and discount (0–100) server-side.

**Why further verification is needed:** How ERP comparison and conversion display or use the raw stored values must be checked at runtime.

---

### BUG-VPORTAL-008 — Attachment blob names may allow path traversal into other tenants' folders

**Severity:** Medium — if `..` segments are resolved, a vendor could read or delete files of another tenant.
**Status:** Potential
**Test Area:** Attachments / Tenant

**Description:** Combined with BUG-VPORTAL-003, a client-supplied `uploadFile` such as `../../<otherTenant>/VendorQuotations/L1_1.pdf` is stored and later passed to `BuildBlobPath`, which allows `/` in names. If the storage URI normalises dot segments, the read/delete would target another tenant's blob.

**Steps to Reproduce:**
1. Save a portal response with `uploadFile` containing `../` segments.
2. Call `VendorQuotationDetailGetFile` for that attachment.

**Expected:** Names with path separators or dot segments are rejected.

**Actual (from code):** No name validation.

**Evidence:**
- Frontend: not applicable.
- Backend: `Controllers/QuotationController.cs` lines 2398–2476 and 3707–3716; `Utilities/UploadFile.cs` lines 57–69 (`BuildBlobPath`, `GetBlockBlob`).
- Database: `VendorQuotationsDetails.AttachmentsJson`.

**Root Cause:** Unvalidated blob names.

**Business Impact:** Cross-tenant file disclosure/deletion.

**Affected Areas:** All module files stored in the `data` container.

**Recommended Fix:** Reject names containing `/`, `\` or `..`; generate names server-side only.

**Why further verification is needed:** Whether the Azure SDK/URI normalises `..` in blob names must be confirmed against the deployed storage account.

---

## Needs Manual Verification

1. **Area:** Responsive (matrix 1.11 "Dashboard and response screen")
   **What to Test:** Dashboard and quotation response at 375px and 768px.
   **Expected:** Usable layout; line table scrolls horizontally.
   **Why Manual Testing Is Required:** `VendorPortal.scss` has no `@media` rules (the line table container has `overflow: auto`, line 338); many styles are inline, so the real result needs a browser.
2. **Area:** Vendor session expiry and refresh
   **What to Test:** Let the vendor access token expire while on the response screen, then save.
   **Expected:** Silent refresh with `vendorRefreshToken`, or redirect to `/vendor/login`.
   **Why Manual Testing Is Required:** Timing-dependent interceptor behaviour (`Axios-config.ts` lines 141–159).
3. **Area:** ERP notification on vendor response (Cross-Module)
   **What to Test:** Vendor submits a response; buyer receives a notification and sees status Responded.
   **Expected:** Notification and updated status.
   **Why Manual Testing Is Required:** Depends on notification configuration and runtime.
4. **Area:** Portal access management (Cross-Module: Vendor Master)
   **What to Test:** Enable/disable portal access and reset the password in Vendor Master; try logging in before and after.
   **Expected:** Access follows the setting. Note that `VendorController.SaveVendorPortalAccess` line 204 accepts a body tenant (covered by BUG-TEN-001).
   **Why Manual Testing Is Required:** Requires a configured vendor and portal user.

## No Issues Found

- ERP login with a vendor account returns 403 (`Services/Auth/AuthService.cs` lines 66–70).
- Vendor login rejects inactive vendors and vendors without a portal user (`AuthService.cs` lines 75–149); the optional tenant field is supported (`VendorLogin.tsx` lines 108–116).
- Portal-path list is scoped by `vendorId` claim, tenant and sent quotations (`QuotationController.cs` lines 1147–1209).
- A vendor token is routed to the patch-only save path (`QuotationController.cs` lines 1517–1524); header fields cannot be changed.
- Locked statuses (Converted, Rejected, Cancelled, Accepted) are read-only on the client (`VendorQuotationResponse.tsx` lines 186–188) and rejected on the server (`QuotationController.cs` lines 2340–2344, 2493–2499, 3515–3521).
- Submitting sets status Responded and the server recalculates the total (`QuotationController.cs` lines 2484–2486).
- Vendor file endpoints add a `VendorID` filter for vendor tokens (`QuotationController.cs` lines 3500–3507, 3660–3664).
- The vendor portal does not send `X-Location-Id` (`Axios-config.ts` lines 111–114) and uses separate `vendorToken`/`vendorStorage` keys; `VendorProtectedLayout.tsx` redirects unauthenticated users to `/vendor/login`.
- Dashboard client-side search filters the loaded list (`VendorDashboard.tsx` lines 115–134).

## QA Coverage

| Test Area | Tested | Result |
| --- | --- | --- |
| Navigation | Yes | Pass |
| CRUD | Yes | Fail (BUG-VPORTAL-002, BUG-VPORTAL-003, BUG-VPORTAL-004) |
| Search | Yes | Pass |
| Filters | N/A | N/A |
| Sorting | N/A | N/A |
| Pagination | N/A | N/A |
| Validation | Yes | Potential (BUG-VPORTAL-007) |
| Permissions | Yes | Fail (BUG-VPORTAL-001, BUG-VPORTAL-004) |
| API | Yes | Fail (BUG-VPORTAL-001, BUG-VPORTAL-003) |
| Database | Yes | Fail (BUG-VPORTAL-002) |
| Business Logic | Yes | Pass |
| Location | Yes | Pass |
| Tenant | Yes | Fail (BUG-VPORTAL-001); Potential (BUG-VPORTAL-008) |
| Cross-Module | Partial | Manual |
| Responsive/PWA | No | Manual |

## Matrix Checklist

| Matrix Row | Result | Notes |
| --- | --- | --- |
| FE — Login (`VendorLogin.tsx`, `/Auth/VendorLogin`) | Pass | `vendorCode`, `password`, optional `tenantId`. |
| FE — List (`VendorDashboard.tsx`, client search) | Pass | No filter/sort/pagination controls, consistent with the matrix. |
| FE — View/Respond (`VendorQuotationResponse.tsx`) | Fail (BUG-VPORTAL-004) | Unsent quotations reachable by id. |
| FE — Attachments (`VendorQuotationDetailSaveFile`, `VendorQuotationGetFile`, `VendorQuotationDetailGetFile`) | Fail (BUG-VPORTAL-002, BUG-VPORTAL-003); Potential (BUG-VPORTAL-008) | Name collisions and client-trusted names. |
| FE — Validation (unit price required, discount ≤ 100, locked statuses) | Pass (client) / Potential (BUG-VPORTAL-007) | Locked statuses enforced on both sides. |
| FE — Session (`vendorToken`/`vendorStorage`, `VendorProtectedLayout`) | Fail (BUG-VPORTAL-005, BUG-VPORTAL-006) | Shared keys; forced logout clears both; no server logout. |
| FE — Responsive | Manual | No media queries. |
| BE — Login (`AuthController.VendorLogin`, anonymous) | Pass | — |
| BE — List/Get/Update (vendor-scoped, patch-only) | Pass (scoping) / Fail (BUG-VPORTAL-003, BUG-VPORTAL-004) | Patch-only works; attachment metadata trusted; sent flag missing. |
| BE — Authorization (`vendorId` + tenant; sent only) | Fail (BUG-VPORTAL-001, BUG-VPORTAL-004) | Token valid on all ERP endpoints. |
| BL — Submitting sets Responded; server recalculates total | Pass | — |
| BL — ERP login with a vendor account returns 403 | Pass | — |

## Cross-Module Concerns

| Concern | Owner Module | Evidence |
| --- | --- | --- |
| ERP path of `GetVendorQuotationsByVendorCode` and `GetVendorQuotationById` (tenant 0) has no tenant filter. | BUG-TEN-002 | `QuotationController.cs` lines 1176–1179, 1235–1240, 1327–1331. |
| `SaveVendorPortalAccess` accepts a body tenant, so portal users/passwords can be set in another tenant. | BUG-TEN-001 / Vendor Master | `VendorController.cs` line 204. |
| No server-side role/permission enforcement; vendor portal users have no role but are not blocked. | QA_RolesPermissions.md | `Program.cs` lines 142–147. |
| Refresh tokens never expire. | BUG-AUTH-005 | Affects BUG-VPORTAL-006. |
