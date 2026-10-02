# QA — Vendor Master

| Module | Matrix section | Bug ID prefix | Tested | Confirmed Bugs | Potential Bugs | Manual Verification |
| --- | --- | --- | --- | --- | --- | --- |
| Vendor Master | 2.2 | BUG-VENDOR | Yes | 9 | 1 | 5 |

Source of test cases: `QA_TEST_MATRIX.md`. Method: static trace of the actual implementation (React UI → service → Axios → .NET controller → service/repository → EF Core → SQL Server, and back). No application code, configuration or database is changed during QA. Findings that depend on deployed configuration, data or a real browser go under **Needs Manual Verification**.

Severity scale:
- **Critical**: security breach, data corruption, financial corruption, or a blocked core workflow.
- **High**: a major feature is broken or a significant security control is bypassed, with a workaround that is hard or unavailable.
- **Medium**: a feature works incorrectly in specific conditions, or a security control is weaker than configured.
- **Low**: cosmetic, minor UX, or an informational/hardening issue.

---

## Confirmed Bugs

### BUG-VENDOR-001 — DeleteVendor does not re-check the delete blockers, so a vendor with orders, quotations, invoices or receiving can be hard-deleted

**Severity:** High. The documented delete protection exists only in the UI dialog; the API removes a vendor that still owns purchasing and AP documents.

**Status:** Confirmed

**Test Area:** API / Business Logic / Database

**Description:**
The matrix says vendor delete is blocked by vendor orders, vendor quotations, vendor invoices and receiving. Those checks are computed only by `CheckVendorDeletionImpact`. `DeleteVendor` loads the vendor by id and tenant, removes contacts and COA mappings, deactivates portal users and removes the vendor without repeating any blocker query. The UI calls it based on the impact snapshot taken when the dialog opened, so a document created in the meantime is also not detected. There are no EF foreign keys from `VendorOrders`, `VendorQuotations` or `VendorInvoiceMaster` to `VendorMaster`.

**Steps to Reproduce:**
1. Create vendor V and a vendor order (or vendor invoice) for it.
2. As any authenticated user, call `DELETE /api/Vendor/DeleteVendor?vendorId=<V>&tenantId=<tenant>`.

**Expected:**
400 with the blocking reasons while any VO, VQ, vendor invoice or receiving record references the vendor.

**Actual:**
200 "Vendor deleted successfully". The VOs, VQs, vendor invoices and receiving records keep a `VendorID`/`vid` that no longer exists.

**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Masters/VendorMasterSlideout.tsx` lines 345–346 (`confirmDeletion` relies on the cached `deletionImpact.canDelete`); lines 436–442 (Delete All re-checks once in the client, which is still not enforced by the API).
* Backend: `Cimmple_API/CimmpleAPI/Controllers/VendorController.cs` lines 1166–1216 (`DeleteVendor`: no blocker checks). Compare lines 1016–1113 (blockers in `CheckVendorDeletionImpact`).
* Database: `Data/Models/VendorMaster.cs` has no navigation properties; `CimmpleDbContext.cs` configures no FK for vendors.

**Root Cause:**
Blocker logic lives only in the read-only impact endpoint.

**Business Impact:**
Orphaned purchasing and AP records; AP aging, vendor performance reports and PDFs lose the vendor. Cannot be undone.

**Affected Areas:** Vendor Master, Vendor Quotations, Vendor Orders, Receiving, Vendor Invoices/AP, Raw Material (`VendorId`).

**Recommended Fix:**
Repeat the blocker queries inside `DeleteVendor` (in a transaction) and return 400 when any exist.

---

### BUG-VENDOR-002 — Vendor "Delete All" cannot complete once a vendor order has been received or invoiced

**Severity:** Medium. The Delete All feature listed in the matrix fails for any vendor with normal purchasing history.

**Status:** Confirmed

**Test Area:** Business Logic / CRUD

**Description:**
`CheckVendorDeletionImpact` returns blocking dependencies in the order Vendor Orders, Vendor Quotations, Vendor Invoices. Receiving is added only as a text reason, with no items. `handleDeleteAll` deletes the items in that order and stops at the first failure. `DeleteVendorOrder` refuses an order that has a non-voided invoice, any receiving, or any invoicing history. So the very first step fails for any received or invoiced VO. Receiving records cannot be removed from this dialog at all, and `DeleteVendorOrder` refuses orders "with receiving history" permanently. The invoice list in the impact check also does not exclude voided invoices, while `DeleteVendorOrder` ignores voided ones.

**Steps to Reproduce:**
1. Create a vendor with one VO; receive part of it (or create a vendor invoice for it).
2. Open the vendor, press Delete, then "Delete All".

**Expected:**
Dependencies are deleted leaf-first (invoices, then orders, then quotations), or the dialog clearly states which records cannot be deleted and why.

**Actual:**
The first VO delete returns "Cannot delete vendor order: invoice(s) exist…" or "…with receiving history". Delete All stops; the vendor remains.

**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Masters/VendorMasterSlideout.tsx` lines 375–398 (`handleDeleteDependency`: VO, VQ, vendor invoice only), 401–457 (`handleDeleteAll`, sequential, stops on first error).
* Backend: `Cimmple_API/CimmpleAPI/Controllers/VendorController.cs` lines 1016–1040 (orders first), 1042–1066 (quotations), 1068–1092 (invoices, no voided filter), 1094–1113 (receiving: reason only, no items). `Controllers/OrderController.cs` lines 3430–3447 (`DeleteVendorOrder` blocks on invoices, receiving, invoicing).
* Database: `VendorReceiving`, `VendorInvoicing`, `VendorInvoiceDetail`.

**Root Cause:**
The dependency order and contents do not match the rules of the downstream delete endpoints.

**Business Impact:**
Users cannot use the advertised cascade and receive no guidance on the required order.

**Affected Areas:** Vendor delete dialog; Vendor Orders, Receiving, Vendor Invoices.

**Recommended Fix:**
Return dependencies leaf-first, explain non-deletable history (receiving, voided/paid invoices), and hide Delete All when the cascade cannot succeed.

---

### BUG-VENDOR-003 — A new vendor is saved even when the portal-access step fails; the UI reports an error and a retry fails as a duplicate name

**Severity:** Medium. Creating a vendor with portal access can leave a half-configured vendor and a confusing error loop.

**Status:** Confirmed

**Test Area:** API / Validation / CRUD

**Description:**
For a new vendor, `SaveVendorData` commits the vendor, then contacts and COA mapping, and only then calls `ApplyVendorPortalAccessAsync`. If that fails (for example the password fails the tenant's policy or history), it returns 400 although the vendor is already committed. The UI shows "Error saving vendor: <policy message>" and leaves the form open with `vendor_id = 0`. When the user fixes the password and saves again, the duplicate-name check rejects it ("Vendor name '…' already exists"). The policy failure is reachable from the UI because the client validates a different value and rule set than the server: it validates the untrimmed password against cached settings, or `getDefaultSystemSettings(1)` when no cache exists, then sends `portalPassword.trim()`. The server validates the trimmed value against the tenant's live settings and history.

**Steps to Reproduce:**
1. In System Settings, set a minimum password length of 10 (or any rule stricter than the cached/default settings in the browser).
2. Add Vendor → enable portal access → password `Abcdefg1! ` (9 characters plus a trailing space) → Save.
3. Observe the error toast; correct the password and press Save again.

**Expected:**
Either the vendor and portal access are saved together, or nothing is saved and the user can correct the password and retry.

**Actual:**
The vendor exists without portal access. The retry fails with "Vendor name … already exists"; the user must close the form, find the vendor and enable the portal again.

**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Masters/VendorMasterSlideout.tsx` lines 487–513 (validates untrimmed `portalPassword` with `getCachedSettings() || getDefaultSystemSettings(1)`), 570–572 (sends trimmed password), 640–646 (error toast, form stays open).
* Backend: `Cimmple_API/CimmpleAPI/Controllers/VendorController.cs` lines 530–531 (vendor committed), 553 (COA mapping), 556–567 (portal failure returns 400 after commit), 473–482 (duplicate-name check that blocks the retry).
* Database: `VendorMaster`, `VendorContact`, `VendorCOAMapping` rows exist; no `UserDetails` portal row.

**Root Cause:**
No transaction around the create, and client/server password validation are not the same.

**Business Impact:**
Vendor onboarding friction and a risk of duplicate vendors if users rename the second attempt.

**Affected Areas:** Vendor create with portal access, Vendor Portal onboarding.

**Recommended Fix:**
Validate the portal password before creating the vendor and wrap the whole create in a transaction. Validate the same (trimmed) value in the client, using the tenant's settings.

---

### BUG-VENDOR-004 — Setting a vendor to Inactive does not end its portal sessions

**Severity:** Medium. The "portal requires an active vendor" rule is enforced only at login; an inactive vendor keeps portal access through token refresh.

**Status:** Confirmed

**Test Area:** Business Logic / Security

**Description:**
`VendorLoginAsync` refuses inactive vendors. However, changing a vendor's Status to Inactive in `SaveVendorData` only updates `VendorMaster.status`; the portal `UserDetails` rows stay Active and keep their refresh token. `RefreshAsync` checks only `IsUserActive(user)` and lockout, not the vendor's status. A vendor user who is already signed in keeps getting new access tokens. (By contrast, disabling portal access sets the portal users Inactive, and deleting the vendor clears `UserToken`.) This is a module-specific gap, distinct from BUG-AUTH-005 (refresh tokens have no lifetime).

**Steps to Reproduce:**
1. Log in to the Vendor Portal as vendor V.
2. In the ERP, set vendor V's Status to Inactive and save.
3. Continue using the portal past the access-token expiry; the client refreshes successfully.

**Expected:**
Inactivating a vendor blocks portal access immediately (matrix 2.2 Business Logic: "The portal login requires an active vendor").

**Actual:**
The existing portal session continues indefinitely; only a new login is refused.

**Evidence:**
* Frontend: not applicable (Status dropdown in `VendorMasterSlideout.tsx`).
* Backend: `Cimmple_API/CimmpleAPI/Controllers/VendorController.cs` line 601 (`existingVendor.status = request.status`; portal users untouched), lines 256–261 (disable portal sets users Inactive), lines 1194–1203 (delete clears `UserToken`). `Services/Auth/AuthService.cs` lines 103–108 (vendor status checked at login), 151–180 (`RefreshAsync`: no vendor status check).
* Database: `UserDetails.Status` and `UserToken` unchanged for the vendor's portal users.

**Root Cause:**
Vendor status and portal-user status are independent, and refresh does not consult the vendor.

**Business Impact:**
A deactivated supplier (for example after contract termination) can still view and act on quotations and orders in the portal.

**Affected Areas:** Vendor Master, Vendor Portal, Authentication refresh.

**Recommended Fix:**
When a vendor becomes inactive, set its portal users Inactive and clear `UserToken`; additionally check vendor status in `RefreshAsync` for vendor-portal users.

---

### BUG-VENDOR-005 — Auto-generated vendor codes can be duplicated during import and reused after delete

**Severity:** Medium. Vendor codes are used for portal login, so duplicate codes have functional impact.

**Status:** Confirmed

**Test Area:** Business Logic / Database

**Description:**
`ImportVendors` computes `nextCodeSeq` once and assigns `V{nextCodeSeq++}` to rows without a code, with no check against codes given explicitly earlier in the same file. Example: highest existing code V1005; row 1 explicit `V1006`; row 2 blank → also V1006. `MasterCodeGenerator` uses max + 1, so deleting the vendor with the highest code makes the next vendor reuse it, contrary to the generator's comment that "deleted codes are not reused". `VendorLoginAsync` looks vendors up by code and returns "Multiple vendors found. Please specify tenant." when it finds more than one.

**Steps to Reproduce:**
1. Note the highest vendor code (for example V1005).
2. Import two new vendors: row 1 code `V1006`, row 2 code blank.

**Expected:**
Unique vendor codes per tenant.

**Actual:**
Both vendors receive V1006.

**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Masters/VendorMasterImportModal.tsx` lines 145–154 (in-file checks only for explicit codes).
* Backend: `Cimmple_API/CimmpleAPI/Controllers/VendorController.cs` line 717 (`nextCodeSeq` once), 788–800 (conflict check only for explicit codes), 854 (`V{nextCodeSeq++}`), 682–689 (`GenerateVendorCode`). `Services/MasterCodeGenerator.cs` lines 7–30. `Services/Auth/AuthService.cs` lines 97–100 (multiple vendors by code).
* Database: no unique index on `VendorMaster.vendorcode`.

**Root Cause:**
Explicit codes are not reserved in the sequence, and there is no persistent counter.

**Business Impact:**
Ambiguous vendor-portal login and wrong matches in later imports.

**Affected Areas:** Vendor create, import, Vendor Portal login.

**Recommended Fix:**
Advance the sequence past explicit codes, check generated codes against `existing`, and add a filtered unique index on (Tenantid, vendorcode).

---

### BUG-VENDOR-006 — Contact Person and Contact Phone columns cannot be sorted

**Severity:** Low. Minor list gap; the matrix says Vendor sorting follows the Customer pattern (all columns).

**Status:** Confirmed

**Test Area:** Sorting

**Description:**
`contactPerson` and `phone_number` have no `sortKey` in the vendor column definitions.

**Steps to Reproduce:**
1. Open Masters → Vendor Master.
2. Click the Contact Person or Contact Phone header.

**Expected:**
The column sorts.

**Actual:**
The header is not clickable.

**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Masters/VendorMaster.tsx` lines 13–20.
* Backend: not applicable.
* Database: not applicable.

**Root Cause:**
Missing `sortKey`.

**Business Impact:**
Minor usability gap.

**Affected Areas:** Vendor Master list.

**Recommended Fix:**
Add the two `sortKey` values.

---

### BUG-VENDOR-007 — Email, phone and zip formats are validated only in the slideout; import and API accept invalid values

**Severity:** Low. Data-quality issue for purchasing emails and addresses.

**Status:** Confirmed

**Test Area:** Validation / Import

**Description:**
The slideout validates email, phone, zip and contact email/phone. `SaveVendorData` validates only TenantID, required name and name uniqueness. The import preview checks only required name and in-file duplicates; `ImportVendors` applies no format rules.

**Steps to Reproduce:**
1. Import a vendor row with Email `abc@` and Zip `12`.

**Expected:**
The same format rules as the slideout.

**Actual:**
The row is created with invalid data.

**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Masters/VendorMasterSlideout.tsx` lines 459–529 (UI checks); `VendorMasterImportModal.tsx` lines 145–154.
* Backend: `Cimmple_API/CimmpleAPI/Controllers/VendorController.cs` lines 463–482 (save validation), 691–926 (import, no format checks).
* Database: `VendorMaster.email`, `zip`; `VendorContact.email`, `phoneno`.

**Root Cause:**
Validation implemented only in the React form.

**Business Impact:**
VO/VQ emails to the vendor can fail; the portal invite email can go to an invalid address.

**Affected Areas:** Vendor import and API.

**Recommended Fix:**
Apply the same validators server-side for save and import.

---

### BUG-VENDOR-008 — Unsaved vendor edits are discarded without confirmation

**Severity:** Low. Minor UX/data-entry loss.

**Status:** Confirmed

**Test Area:** CRUD / Navigation

**Description:**
`isStateChanged` is tracked, but `handleDismiss` calls `onClose(false)` directly from the overlay, the × button and Cancel. Location Master on the same pattern asks for confirmation.

**Steps to Reproduce:**
1. Open Add Vendor, fill in fields including the portal password.
2. Click Cancel.

**Expected:**
A confirmation prompt when there are unsaved changes.

**Actual:**
The slideout closes and the input is lost.

**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Masters/VendorMasterSlideout.tsx` line 26 (`handleDismiss`), line 54 (`isStateChanged`), lines 666, 670, 1508. Compare `LocationMasterSlideout.tsx` lines 366–374.
* Backend: not applicable.
* Database: not applicable.

**Root Cause:**
The dirty flag is not consulted on close.

**Business Impact:**
Re-entry of vendor data.

**Affected Areas:** Vendor Master slideout.

**Recommended Fix:**
Confirm before closing when `isStateChanged` is true.

---

### BUG-VENDOR-009 — Vendor API 500 responses return the server stack trace

**Severity:** Low. Information disclosure / hardening.

**Status:** Confirmed

**Test Area:** API / Security

**Description:**
`ImportVendors`, `CheckVendorDeletionImpact` and `DeleteVendor` return `stackTrace = ex.StackTrace` in 500 responses.

**Steps to Reproduce:**
1. Trigger a server error in import (for example an over-long field value).
2. Inspect the response body.

**Expected:**
A generic error; details only in server logs.

**Actual:**
The stack trace is returned.

**Evidence:**
* Frontend: not applicable.
* Backend: `Cimmple_API/CimmpleAPI/Controllers/VendorController.cs` lines 924, 1162, 1214.
* Database: not applicable.

**Root Cause:**
Debug-style error handling.

**Business Impact:**
Exposes implementation details.

**Affected Areas:** Vendor API.

**Recommended Fix:**
Log server-side and return a generic message.

---

## Potential Bugs

### BUG-VENDOR-010 — Concurrent saves can create duplicate vendor names or codes

**Severity:** Low. Requires near-simultaneous saves.

**Status:** Potential

**Test Area:** Database / Validation

**Description:**
Vendor name uniqueness and code generation are check-then-insert in application code with no DB unique index. Two simultaneous creates can produce the same name and/or code.

**Steps to Reproduce:**
1. In two sessions, create a vendor with the same name and press Save at the same time.

**Expected:**
One save is rejected.

**Actual (expected from code):**
Both may succeed.

**Evidence:**
* Frontend: not applicable.
* Backend: `Cimmple_API/CimmpleAPI/Controllers/VendorController.cs` lines 473–482 (name check), 509 (`GenerateVendorCode`), 530–531 (insert).
* Database: no unique index on `VendorMaster`.

**Root Cause:**
Uniqueness not enforced by the database.

**Business Impact:**
Duplicate vendors; ambiguous portal login (see BUG-VENDOR-005).

**Affected Areas:** Vendor create, import.

**Recommended Fix:**
Add filtered unique indexes per tenant.

**Why further verification is needed:** Requires a concurrency test against a running system.

---

## Needs Manual Verification

1. **Area:** Portal invite email content
   **What to Test:** Enable portal access with "send invite" and inspect the queued email.
   **Expected:** The organisation's policy on sending initial passwords by email is met (for example a set-password link instead of the plaintext password).
   **Why Manual Testing Is Required:** The invite includes the password supplied by the admin; whether that is acceptable is a product/security decision, and delivery depends on the email outbox configuration.

2. **Area:** Portal login with existing duplicate codes
   **What to Test:** Query `VendorMaster` for duplicate `vendorcode` within a tenant, and try portal login for such a code.
   **Expected:** No duplicates exist.
   **Why Manual Testing Is Required:** It needs database access (see BUG-VENDOR-005).

3. **Area:** Responsive layout
   **What to Test:** Vendor list and slideout (portal section, COA mapping) on phone and tablet widths.
   **Expected:** Usable layout.
   **Why Manual Testing Is Required:** It needs a real browser.

4. **Area:** Delete of voided vendor invoices
   **What to Test:** A vendor whose only blocker is a voided vendor invoice; try Delete and Delete All.
   **Expected:** Either the voided invoice is not a blocker, or the dialog explains that it cannot be deleted.
   **Why Manual Testing Is Required:** `DeleteVendorInvoice` behaviour for voided invoices and its GL reversal were not traced end to end.

5. **Area:** Status filter with legacy data
   **What to Test:** Vendors with status null, empty or "A".
   **Expected:** They appear under a sensible filter (the portal treats "A" and empty as active).
   **Why Manual Testing Is Required:** The list filter compares exactly to "Active"/"Inactive"; whether legacy values exist depends on data.

## No Issues Found

- Navigation: `/masters/vendor`, the sidebar entry and global-search `?open=<id>` links work (`VendorMaster.tsx` lines 50–63).
- Search, Active/Inactive filter and client pagination follow the Customer pattern and reset to page 1 on change.
- Vendor name is required in UI and API; uniqueness is per tenant, trimmed and case-insensitive on save and import.
- New vendors receive a `V…` code from `MasterCodeGenerator` (apart from BUG-VENDOR-005).
- `GetVendorById` filters by tenant and returns portal user and COA information for that vendor only.
- COA mapping: the GL account chosen for a vendor is validated against the tenant when it is resolved (`Services/GlAccountResolutionService.cs` lines 62–110).
- Portal access: `SaveVendorPortalAccess` and the save path validate the password with `IAuthService` (policy and history) on the server; disabling portal access sets portal users Inactive.
- Delete sets the vendor's portal users Inactive, clears their password and refresh token, and unlinks `VendorId`.
- `VendorLoginAsync` refuses inactive vendors at login.
- Import: in-file duplicate checks, `UpdateExisting` and `StopOnError` work in a transaction.

## QA Coverage

| Test Area | Tested | Result |
| --- | --- | --- |
| Navigation | Yes | Pass |
| CRUD | Yes | Fail (BUG-VENDOR-001, BUG-VENDOR-002, BUG-VENDOR-003, BUG-VENDOR-008) |
| Search | Yes | Pass |
| Filters | Yes | Pass (legacy values: manual item 5) |
| Sorting | Yes | Fail (BUG-VENDOR-006) |
| Pagination | Yes | Pass |
| Validation | Yes | Fail (BUG-VENDOR-003, BUG-VENDOR-007) |
| Permissions | Yes | No module-specific issue; see Cross-Module Concerns |
| API | Yes | Fail (BUG-VENDOR-001, BUG-VENDOR-009) |
| Database | Yes | Fail (BUG-VENDOR-005; potential BUG-VENDOR-010) |
| Business Logic | Yes | Fail (BUG-VENDOR-001, BUG-VENDOR-002, BUG-VENDOR-004) |
| Location | Yes | Not applicable (vendors are tenant-wide) |
| Tenant | Yes | Module-specific filters present; tenant trust is cross-module |
| Cross-Module | Yes | Fail (BUG-VENDOR-004 Vendor Portal, BUG-VENDOR-002 purchasing deletes) |
| Responsive/PWA | No | Manual verification required (item 3) |

## Matrix Checklist

| Matrix Row | Result | Notes |
| --- | --- | --- |
| FE List — `VendorMaster.tsx`, GET `/Vendor/GetVendorlist` | Pass | |
| FE Search / Filter / Sort / Pagination — same pattern as Customer | Pass with issues | Sort gap BUG-VENDOR-006. |
| FE Add / Edit / View — contacts, COA mapping, portal access; `?open=` | Pass with issues | BUG-VENDOR-003, BUG-VENDOR-008. |
| FE Portal access — password + confirm, `SaveVendorPortalAccess` | Pass with issues | Confirm match works; client/server validation mismatch in BUG-VENDOR-003. |
| FE Delete — impact dialog with Delete All | Fail | BUG-VENDOR-001, BUG-VENDOR-002. |
| FE Import — `VendorMasterImportModal.tsx` | Pass with issues | BUG-VENDOR-005, BUG-VENDOR-007. |
| FE Validation — name required; portal password policy and confirm match | Pass with issues | Policy check uses cached/default settings on the untrimmed value (BUG-VENDOR-003). |
| FE Permissions — `/masters/vendor` | Cross-module | Owned by `QA_RolesPermissions.md`. |
| FE Responsive — list, slideout | Manual | Manual item 3. |
| BE List/Get — GetVendorlist, GetVendorById | Pass | Tenant filter (from request). |
| BE Create/Update — SaveVendorData, prefix V | Pass with issues | BUG-VENDOR-003, BUG-VENDOR-005. |
| BE Portal — SaveVendorPortalAccess, `IAuthService` policy and history, `UserDetails` | Pass | Server-side policy/history enforced. |
| BE Delete — impact; DeleteVendor (portal user set Inactive) | Fail | Portal handling correct; blockers not enforced (BUG-VENDOR-001). |
| BE Import — ImportVendors | Pass with issues | BUG-VENDOR-005, BUG-VENDOR-007, BUG-VENDOR-009. |
| BE Validation — name unique per tenant | Pass | Race in potential BUG-VENDOR-010. |
| BE Authorization — authenticated; tenant from request | Cross-module | See Cross-Module Concerns. |
| BL — Delete blocked by VO, VQ, vendor invoices and receiving | Fail | BUG-VENDOR-001, BUG-VENDOR-002. |
| BL — Portal login requires an active vendor | Fail | Login checked; existing sessions survive inactivation (BUG-VENDOR-004). |

## Cross-Module Concerns

| Concern | Owner | Affected endpoints / evidence |
| --- | --- | --- |
| The tenant id comes from the query or body and is not compared with the token's tenant. | `QA_TenantLocationFramework.md` | `GET /Vendor/GetVendorlist` (`VendorController.cs` 38–115), `GET GetVendorById` (117–188), `POST SaveVendorPortalAccess` (194–229), `POST SaveVendorData` (`TenantID` in body, 443–680), `POST ImportVendors` (691–926), `GET CheckVendorDeletionImpact` (993–1164), `DELETE DeleteVendor` (1166–1216). |
| No server-side role/permission check: any authenticated user can create vendors, set portal passwords for any vendor and delete vendors. | `QA_RolesPermissions.md` | All endpoints above; in particular `SaveVendorPortalAccess` lets any authenticated user set a vendor's portal password. |
| Vendor-portal tokens are accepted by the Vendor Master endpoints (a portal user could call them directly). | `QA_VendorPortal.md` | Already listed in `QA_Authentication.md` Cross-Module Concerns; Vendor Master endpoints have no `IsVendorPortal()` check. |
