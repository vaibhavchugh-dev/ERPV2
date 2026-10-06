# QA — Customer Master

| Module | Matrix section | Bug ID prefix | Tested | Fix Tested | Confirmed Bugs | Potential Bugs | Manual Verification |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Customer Master | 2.1 | BUG-CUST | Yes | Yes | 8 | 2 | 5 |

Source of test cases: `QA_TEST_MATRIX.md`. Method: static trace of the actual implementation (React UI → service → Axios → .NET controller → service/repository → EF Core → SQL Server, and back). No application code, configuration or database is changed during QA. Findings that depend on deployed configuration, data or a real browser go under **Needs Manual Verification**.

Severity scale:
- **Critical**: security breach, data corruption, financial corruption, or a blocked core workflow.
- **High**: a major feature is broken or a significant security control is bypassed, with a workaround that is hard or unavailable.
- **Medium**: a feature works incorrectly in specific conditions, or a security control is weaker than configured.
- **Low**: cosmetic, minor UX, or an informational/hardening issue.

---

## Confirmed Bugs

### BUG-CUST-001 — DeleteCustomer does not re-check the delete blockers, so a customer with orders, quotations, invoices or shipments can be hard-deleted

**Severity:** High. The documented delete protection is enforced only by the UI dialog; the API removes a customer that still owns sales and AR documents, leaving them orphaned.

**Status:** Confirmed

**Test Area:** API / Business Logic / Database

**Description:**
The matrix says customer delete is blocked by orders, quotations, invoices and shipments. Those checks exist only in `CheckCustomerDeletionImpact`. `DeleteCustomer` loads the customer by id and tenant, removes contacts, billing and shipping addresses, removes the customer and saves. It never repeats the blocker queries. The UI decides whether to call `DeleteCustomer` from the impact snapshot it fetched when the dialog opened (`deletionImpact.canDelete`), so the protection is also lost if a document is created between opening the dialog and confirming. There are no foreign keys from `CustomerOrder`, `QuotationOrder`, `InvoiceMaster` or `Shipping` to `CustomerMaster` in the EF model, so the database does not stop the delete either.

**Steps to Reproduce:**
1. Create customer A and a customer order (or quotation) for it.
2. As any authenticated user, call `DELETE /api/Customer/DeleteCustomer?customerId=<A>&tenantId=<tenant>`.
3. Alternatively: open the Delete dialog for a customer with no documents, then in another tab create a quotation for that customer, then press Delete in the first tab.

**Expected:**
Delete is refused (400 with the blocking reasons) whenever orders, quotations, invoices or shipments reference the customer.

**Actual:**
200 "Customer deleted successfully". The orders, quotations, invoices and shipments remain with a `CustomerID` that no longer exists.

**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Masters/CustomerMasterSlideout.tsx` lines 307–323 (`confirmDeletion` trusts the cached `deletionImpact.canDelete`).
* Backend: `Cimmple_API/CimmpleAPI/Controllers/CustomerController.cs` lines 925–964 (`DeleteCustomer`: no order/quotation/invoice/shipment checks). Compare lines 756–873 (`CheckCustomerDeletionImpact`, where the blockers are computed).
* Database: `Cimmple_API/CimmpleAPI/Data/Models/CustomerMaster.cs` (no navigation properties); `CimmpleDbContext.cs` has no relationship configuration for `CustomerMaster`, so no FK protects the delete.

**Root Cause:**
The blocker logic lives only in the read-only impact endpoint; the mutating endpoint does not enforce it.

**Business Impact:**
Orphaned orders, quotations, invoices and shipments. Customer-based reports, AR aging, statements and document PDFs that join to the customer lose the name and address. This cannot be undone.

**Affected Areas:** Customer Master, Quotations, Customer Orders, Invoices/AR, Shipping, customer reports.

**Recommended Fix:**
Re-run the same blocker queries inside `DeleteCustomer` (ideally in a transaction) and return 400 with the reasons when any exist. Consider adding FKs with `Restrict`.

---

### BUG-CUST-002 — "Delete All (Dependencies + Order)" fails for normal customers because it deletes in the wrong order and does not list job orders

**Severity:** Medium. The Delete All feature listed in the matrix works only for customers whose orders have no invoices, shipments or job orders.

**Status:** Confirmed

**Test Area:** Business Logic / CRUD

**Description:**
`CheckCustomerDeletionImpact` returns blocking dependencies in the order Customer Orders, Quotations, Invoices, Shipments. `handleDeleteAll` deletes them sequentially in that order and stops at the first failure. `DeleteOrder` refuses to delete an order that has a non-voided invoice, any shipment, or any job order. So the first step fails for any customer whose orders have been invoiced, shipped or released to production, and Delete All stops with "Failed to delete CO#…". Job orders are never listed as a dependency, so the user cannot remove them from this dialog. In addition, the invoice list in the impact check does not filter out voided invoices, while `DeleteInvoice` refuses voided invoices. A customer with a voided invoice therefore shows a blocker that neither single delete nor Delete All can clear.

**Steps to Reproduce:**
1. Create a customer with one order, and invoice that order (or create a shipment or job order for it).
2. Open the customer, press Delete, then press "Delete All".

**Expected:**
Delete All removes the dependencies in an order the downstream services accept (for example shipments and invoices before orders, orders before quotations), or clearly lists every blocker, including job orders, that must be handled first.

**Actual:**
The first order delete returns "Cannot delete order: one or more invoices exist…" (or shipments / job orders). The process stops and the customer remains.

**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Masters/CustomerMasterSlideout.tsx` lines 368–424 (`handleDeleteAll` iterates `blockingDependencies` in server order and stops on first error), 338–366 (`handleDeleteDependency`).
* Backend: `Cimmple_API/CimmpleAPI/Controllers/CustomerController.cs` lines 756–780 (orders first), 782–806 (quotations), 808–842 (invoices; no `IsVoided` filter), 844–873 (shipments). `Controllers/OrderController.cs` lines 1613–1626 (`DeleteOrder` blocks on invoices, shipments, job orders). `Controllers/InvoiceController.cs` lines 911–916 (refuses voided and paid invoices).
* Database: `JobOrderMaster.CustomerOrderID` is never queried by the customer impact check.

**Root Cause:**
The impact list order was written without considering the rules of each downstream delete endpoint, and job orders were not included.

**Business Impact:**
Users cannot complete the advertised cascade and must delete documents manually in a specific order that the UI does not explain. Voided-invoice customers are permanently undeletable from the UI.

**Affected Areas:** Customer Master delete dialog; Orders, Invoices, Shipping, Job Orders.

**Recommended Fix:**
Return dependencies leaf-first (shipments, invoices, job orders, orders, quotations), include job orders, and exclude or explain voided/paid invoices that cannot be deleted.

---

### BUG-CUST-003 — Inactive customers can still be selected on new quotations and orders

**Severity:** Medium. Matrix section 10.1 requires that an inactive customer is not selectable; the status flag currently has no effect on sales documents.

**Status:** Confirmed

**Test Area:** Business Logic / Cross-Module

**Description:**
`CustomerQuotationSlideout` and `CustomerOrderSlideout` load the full customer list with `GetCustomerlist` and map only `customer_id`, `company_name` and `customercode`. The status is dropped, so inactive customers appear in the customer picker. The quotation and order save endpoints do not check customer status either.

**Steps to Reproduce:**
1. Set a customer's Status to Inactive and save.
2. Open Sales → New Quotation (or New Customer Order) and open the customer picker.

**Expected:**
Inactive customers are hidden from (or disabled in) the picker for new documents, and the API rejects them.

**Actual:**
The inactive customer is listed and can be used; the document saves.

**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Quotations/CustomerQuotationSlideout.tsx` lines 282–296 and `Cimmple_UI/src/Modules/Orders/CustomerOrderSlideout.tsx` lines 299–314 (no status filter in the mapping).
* Backend: `Cimmple_API/CimmpleAPI/Controllers/CustomerController.cs` lines 25–97 (`GetCustomerlist` returns all statuses; expected for the master list). A search of `QuotationController.cs` finds no customer-status check (only `q.status` at lines 103 and 1124).
* Database: `CustomerMaster.status` ("Active"/"Inactive").

**Root Cause:**
The pickers reuse the master list endpoint without filtering by status, and the save paths do not validate it.

**Business Impact:**
Quotes and orders can be raised for customers the business has deactivated (for example credit hold or closed accounts).

**Affected Areas:** Quotations, Customer Orders, Customer Master.

**Recommended Fix:**
Filter `status === "Active"` in the pickers for new documents (keep the current customer visible on existing documents) and reject inactive customers on create in the API.

---

### BUG-CUST-004 — Auto-generated customer codes can be duplicated during import and reused after delete

**Severity:** Medium. Customer codes are meant to be unique sequential identifiers, but two customers can end up with the same code.

**Status:** Confirmed

**Test Area:** Business Logic / Database

**Description:**
`ImportCustomers` computes `nextCodeSeq` once, before the loop, from the existing codes. Rows without a code get `C{nextCodeSeq++}` without checking whether an earlier row in the same file already used that value explicitly. Example: the highest existing code is C1005. Row 1 has explicit code C1006 (passes the conflict check because it doesn't exist yet). Row 2 has no code and is assigned C1006 too. Separately, `MasterCodeGenerator` documents that "deleted codes are not reused", but it uses the current maximum suffix. If the customer with the highest code is deleted, the next new customer receives that same code. There is no unique index on `customercode`.

**Steps to Reproduce:**
1. Note the highest customer code (for example C1005).
2. Import a file with two new customers: row 1 code `C1006`, row 2 code blank.
3. Alternatively, delete customer C1005, then create a new customer.

**Expected:**
Every customer code is unique within the tenant, and (per the generator comment) codes of deleted customers are not reissued.

**Actual:**
Both imported rows get C1006. In the delete scenario, the new customer receives C1005 again.

**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Masters/CustomerMasterImportModal.tsx` lines 131–153 (only in-file duplicate checks on explicit codes).
* Backend: `Cimmple_API/CimmpleAPI/Controllers/CustomerController.cs` line 406 (`nextCodeSeq` computed once), lines 475–489 (conflict check only for explicit codes), line 541 (`C{nextCodeSeq++}` with no check), lines 200–204 (save path). `Cimmple_API/CimmpleAPI/Services/MasterCodeGenerator.cs` lines 7–10 (comment) and 13–30 (max + 1).
* Database: `CustomerMaster.customercode` has no unique index.

**Root Cause:**
The import does not reserve explicit codes in the sequence, and the generator has no persistent counter.

**Business Impact:**
Duplicate or recycled customer codes cause wrong matches in later imports (code is matched first), global search and reports, and confuse users referencing old documents.

**Affected Areas:** Customer Master create and import; any lookup by customer code.

**Recommended Fix:**
During import, bump `nextCodeSeq` past any explicit code that matches the prefix pattern and check generated codes against `existing`. Use a per-tenant sequence table if codes must never be reused, and add a filtered unique index on (Tenantid, customercode).

---

### BUG-CUST-005 — Contact Person and Contact Phone columns cannot be sorted

**Severity:** Low. A minor list feature gap against the matrix ("Sort: All columns").

**Status:** Confirmed

**Test Area:** Sorting

**Description:**
The column definitions give `sortKey` only to Code, Name, Address and Status. Contact Person and Contact Phone have no `sortKey`, so their headers are not clickable.

**Steps to Reproduce:**
1. Open Masters → Customer Master.
2. Click the Contact Person or Contact Phone header.

**Expected:**
All columns sort (matrix 2.1 Sort row).

**Actual:**
Nothing happens; no sort icon is shown for those two columns.

**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Masters/CustomerMaster.tsx` lines 13–20 (`contactPerson` and `phone_number` have no `sortKey`).
* Backend: not applicable (client-side sort).
* Database: not applicable.

**Root Cause:**
`sortKey` was omitted from two column definitions.

**Business Impact:**
Minor usability gap.

**Affected Areas:** Customer Master list.

**Recommended Fix:**
Add `sortKey: "contactPerson"` and `sortKey: "phone_number"`.

---

### BUG-CUST-006 — Email, phone and zip formats are validated only in the slideout; the API and import accept invalid values, and unknown import Status values are silently ignored

**Severity:** Low. Data-quality issue; invalid contact data can enter through import or direct API calls.

**Status:** Confirmed

**Test Area:** Validation / Import

**Description:**
The slideout validates company email, phone, billing/shipping zip, and contact email/phone. `SaveCustomerData` validates only TenantID, required name and name uniqueness. The import preview checks only required name and in-file duplicates, and `ImportCustomers` performs no format checks. For Status, `ParseCustomerStatus` returns null for any value other than active/inactive/1/0/yes/no/true/false. A new row is then created as Active, and an updated row keeps its old status, with no warning. The preview displays the raw value (for example "Closed"), so the user believes it was accepted.

**Steps to Reproduce:**
1. Import a customer row with Email `not-an-email`, Zip `ABCDE-12`, Status `Closed`.
2. Open the imported customer.

**Expected:**
The same format rules as the slideout apply (matrix 2.1 Validation row), and unrecognised Status values are reported as errors or warnings.

**Actual:**
The row imports as "Created" with the invalid email and zip, and with Status Active.

**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Masters/CustomerMasterSlideout.tsx` lines 426–497 (format checks exist here only); `CustomerMasterImportModal.tsx` lines 131–153 (preview checks), line 327 (`row.Status || "Active"` shows the raw value).
* Backend: `Cimmple_API/CimmpleAPI/Controllers/CustomerController.cs` lines 170–189 (save validation), 421–489 (import validation), 724–731 (`ParseCustomerStatus` returns null for unknown values), 558 (`status ?? "Active"`).
* Database: `CustomerMaster.email`, `zip`, `status`; `CustomerContact.email`, `phoneno`.

**Root Cause:**
Validation was implemented only in the React form.

**Business Impact:**
Quotation, order and invoice emails defaulting to the customer email can fail; status intent from the file is lost.

**Affected Areas:** Customer import, Customer API, document emailing.

**Recommended Fix:**
Share the format validators on the server (save and import) and return a row error or warning for unknown Status values.

---

### BUG-CUST-007 — Unsaved customer edits are discarded without confirmation

**Severity:** Low. Minor UX/data-entry loss.

**Status:** Confirmed

**Test Area:** CRUD / Navigation

**Description:**
The slideout tracks `isStateChanged`, but `handleDismiss` simply calls `onClose(false)`. A click on the overlay, the × button or Cancel closes the form immediately and discards all tabs (company, billing, shipping, contacts). Location Master, built on the same slideout pattern, asks "You have unsaved changes. Are you sure you want to cancel?", so the behaviour is inconsistent across masters.

**Steps to Reproduce:**
1. Open Add Customer and fill in several tabs.
2. Click outside the slideout (on the overlay).

**Expected:**
A confirmation prompt when there are unsaved changes, as in Location Master.

**Actual:**
The slideout closes and the data is lost.

**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Masters/CustomerMasterSlideout.tsx` line 23 (`handleDismiss = () => onClose(false)`), line 49 (`isStateChanged` is tracked), lines 533 and 537 (overlay and × call `handleDismiss`). Compare `LocationMasterSlideout.tsx` lines 366–374.
* Backend: not applicable.
* Database: not applicable.

**Root Cause:**
The dirty flag is never consulted on close.

**Business Impact:**
Re-entry of customer data after an accidental click.

**Affected Areas:** Customer Master slideout.

**Recommended Fix:**
Check `isStateChanged` in `handleDismiss` and confirm before closing.

---

### BUG-CUST-008 — Customer API 500 responses return the server stack trace

**Severity:** Low. Information disclosure / hardening.

**Status:** Confirmed

**Test Area:** API / Security

**Description:**
On unhandled exceptions, `SaveCustomerData`, `ImportCustomers`, `CheckCustomerDeletionImpact` and `DeleteCustomer` return `{ error, stackTrace = ex.StackTrace }`, exposing internal file paths, class names and SQL details to the browser.

**Steps to Reproduce:**
1. Trigger a server error (for example, import a row whose text exceeds a column length).
2. Inspect the 500 response body.

**Expected:**
A generic error message; details logged server-side only.

**Actual:**
The full stack trace is returned.

**Evidence:**
* Frontend: not applicable.
* Backend: `Cimmple_API/CimmpleAPI/Controllers/CustomerController.cs` lines 370, 612, 921, 962.
* Database: not applicable.

**Root Cause:**
Debug-style error handling left in production code.

**Business Impact:**
Helps an attacker map the application internals.

**Affected Areas:** Customer API.

**Recommended Fix:**
Log the exception and return a generic message (or ProblemDetails without the stack trace outside Development).

---

## Potential Bugs

### BUG-CUST-009 — Customer save is not atomic; a failure after the first SaveChanges leaves a partially saved customer

**Severity:** Low. Inconsistent data only occurs on a mid-save database error.

**Status:** Potential

**Test Area:** API / Database

**Description:**
`SaveCustomerData` calls `SaveChanges` three times (customer, contacts, billing address) without a transaction. If the contacts or billing step fails (for example a value too long for a column), the customer row is already committed. On a new customer the UI shows an error and keeps the form open with `customer_id = 0`; pressing Save again then fails with "Customer name '…' already exists".

**Steps to Reproduce:**
1. Create a new customer with a contact whose email exceeds the column length (if the column is length-limited).
2. Save, then press Save again.

**Expected:**
Either everything is saved or nothing is.

**Actual (expected from code):**
The customer header is saved without contacts/billing; the retry fails as a duplicate name.

**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Masters/CustomerMasterSlideout.tsx` lines 499–530.
* Backend: `Cimmple_API/CimmpleAPI/Controllers/CustomerController.cs` lines 257, 283, 318 (three separate `SaveChanges`, no transaction).
* Database: `CustomerMaster`, `CustomerContact`, `CustomerBillingAddress`.

**Root Cause:**
No transaction around the multi-table save.

**Business Impact:**
Half-created customers and confusing duplicate-name errors.

**Affected Areas:** Customer create/update.

**Recommended Fix:**
Wrap the save in `BeginTransaction` (as `ImportCustomers` already does).

**Why further verification is needed:** It depends on a database error actually occurring after the first save; column lengths for contacts were not confirmed from migrations.

---

### BUG-CUST-010 — Concurrent saves can create duplicate customer names or codes

**Severity:** Low. A race condition that needs two near-simultaneous saves.

**Status:** Potential

**Test Area:** Database / Validation

**Description:**
Name uniqueness and code generation are check-then-insert in application code. The matrix notes there is no DB unique index. Two users creating "Acme" at the same moment can both pass the duplicate check, and two new customers can both compute the same next code.

**Steps to Reproduce:**
1. In two browsers, prepare a new customer with the same name.
2. Press Save in both at the same time.

**Expected:**
One save succeeds and the other is rejected.

**Actual (expected from code):**
Both succeed, with the same name and possibly the same code.

**Evidence:**
* Frontend: not applicable.
* Backend: `Cimmple_API/CimmpleAPI/Controllers/CustomerController.cs` lines 180–189 (name check), 200–204 (code generation), 257 (insert).
* Database: no unique index on `CustomerMaster` (matrix 2.1 Validation row: "no DB unique index").

**Root Cause:**
Uniqueness is not enforced by the database.

**Business Impact:**
Duplicate master records.

**Affected Areas:** Customer create, import.

**Recommended Fix:**
Add filtered unique indexes per tenant (normalised name, code), or serialise code allocation.

**Why further verification is needed:** Requires a concurrency test against a running system.

---

## Needs Manual Verification

1. **Area:** Status filter with legacy data
   **What to Test:** Customers whose `status` is null, empty or another legacy value (for example "A").
   **Expected:** They appear under the correct filter, or data is normalised.
   **Why Manual Testing Is Required:** The client filter compares exactly to "Active"/"Inactive" (`CustomerMaster.tsx` lines 151–157). Whether such rows exist depends on the deployed data.

2. **Area:** Responsive layout
   **What to Test:** List, slideout (four tabs) and import modal on phone and tablet widths.
   **Expected:** Usable layout with no clipped controls.
   **Why Manual Testing Is Required:** It needs a real browser.

3. **Area:** Existing duplicate codes and names
   **What to Test:** `SELECT Tenantid, customercode, COUNT(*) FROM CustomerMaster GROUP BY Tenantid, customercode HAVING COUNT(*) > 1` (and the same for trimmed lower-case names).
   **Expected:** No rows.
   **Why Manual Testing Is Required:** It needs database access; see BUG-CUST-004 and BUG-CUST-010.

4. **Area:** Delete All end to end
   **What to Test:** Delete All on a customer that has only quotations, and on one with orders plus shipments, invoices and job orders.
   **Expected:** The first case succeeds; the second is reported clearly (see BUG-CUST-002).
   **Why Manual Testing Is Required:** It depends on downstream GL reversal behaviour in `DeleteInvoice` and real data.

5. **Area:** Other references to a customer
   **What to Test:** Whether NCRs (customer source), products/parts by customer and AR payments reference `customer_id`, and what happens to them after a customer delete.
   **Expected:** Either blocked or clearly listed in the impact dialog.
   **Why Manual Testing Is Required:** The matrix lists only orders, quotations, invoices and shipments as blockers; whether other references should block is a product decision.

## No Issues Found

- Navigation: the route `/masters/customer`, the sidebar entry and global-search links `?open=<id>` work; the `?open` parameter is consumed and removed from the URL (`CustomerMaster.tsx` lines 50–63).
- Search matches code, name, address and phone, case-insensitively (`CustomerMaster.tsx` lines 140–145).
- The Active/Inactive filter and client pagination (`useClientPagination` + `useListPageSize`) reset to page 1 when search, filter or sort change.
- Company name is required in both the UI and the API; name uniqueness is per tenant, trimmed and case-insensitive on save (`CustomerController.cs` lines 175–189) and on import (lines 442–473).
- New customers receive a `C…` code from `MasterCodeGenerator` (apart from the collision cases in BUG-CUST-004).
- `GetCustomerById` filters the customer by tenant; child contacts and addresses are reached only through that verified customer.
- Contacts, billing addresses and shipping addresses are deleted with the customer.
- Status is stored as the string "Active"/"Inactive".
- Import: template, preview and in-file duplicate checks work; `UpdateExisting` and `StopOnError` are honoured in a transaction.
- The UI cannot remove the last contact, so the "contacts only replaced when sent" rule in the API is not reachable as a data-loss path.

## QA Coverage

| Test Area | Tested | Result |
| --- | --- | --- |
| Navigation | Yes | Pass |
| CRUD | Yes | Fail (BUG-CUST-001, BUG-CUST-002, BUG-CUST-007; potential BUG-CUST-009) |
| Search | Yes | Pass |
| Filters | Yes | Pass (legacy status values need manual check) |
| Sorting | Yes | Fail (BUG-CUST-005) |
| Pagination | Yes | Pass |
| Validation | Yes | Fail (BUG-CUST-006) |
| Permissions | Yes | No module-specific issue; see Cross-Module Concerns |
| API | Yes | Fail (BUG-CUST-001, BUG-CUST-008) |
| Database | Yes | Fail (BUG-CUST-004; potential BUG-CUST-010) |
| Business Logic | Yes | Fail (BUG-CUST-001, BUG-CUST-002, BUG-CUST-003, BUG-CUST-004) |
| Location | Yes | Not applicable (customers are tenant-wide; no site filter per matrix) |
| Tenant | Yes | Module-specific filters present; tenant trust is cross-module |
| Cross-Module | Yes | Fail (BUG-CUST-003, BUG-CUST-002) |
| Responsive/PWA | No | Manual verification required (item 2) |

## Matrix Checklist

| Matrix Row | Result | Notes |
| --- | --- | --- |
| FE List — `CustomerMaster.tsx`, GET `/Customer/GetCustomerlist` | Pass | Loads the tenant list; contact person and phone are derived server-side. |
| FE Search — code, name, address, phone | Pass | Client-side, case-insensitive. |
| FE Filter — Status Active/Inactive | Pass | Exact string match; see manual item 1. |
| FE Sort — all columns | Fail | BUG-CUST-005 (Contact Person and Contact Phone not sortable). |
| FE Pagination — client, `useListPageSize` | Pass | Resets to page 1 on changes. |
| FE Add — slideout with contacts, billing, shipping | Pass with issues | Works; BUG-CUST-007 (no unsaved prompt), potential BUG-CUST-009. |
| FE Edit — `?open=`, GetCustomerById, SaveCustomerData | Pass | `?open` handled and cleared. |
| FE View — slideout, GetCustomerById | Pass | |
| FE Delete — impact dialog incl. Delete All | Fail | BUG-CUST-001, BUG-CUST-002. |
| FE Import — template, preview, in-file duplicates | Pass with issues | BUG-CUST-004, BUG-CUST-006. |
| FE Validation — company name required; email/phone/zip format incl. contacts | Pass in UI / Fail elsewhere | Slideout validates; API and import do not (BUG-CUST-006). |
| FE Permissions — `/masters/customer` | Cross-module | No route or API gate; owned by `QA_RolesPermissions.md`. |
| FE Responsive — list, slideout, import modal | Manual | Manual item 2. |
| BE List — GetCustomerlist | Pass | Filters by tenant (from request). |
| BE Get — four tables | Pass | Customer filtered by tenant; children via verified id. |
| BE Create/Update — MasterCodeGenerator prefix C | Pass with issues | BUG-CUST-004, potential BUG-CUST-009/010. |
| BE Delete — impact + hard delete | Fail | BUG-CUST-001. |
| BE Import — UpdateExisting, StopOnError | Pass with issues | Transactional; BUG-CUST-004, BUG-CUST-006. |
| BE Validation — name unique per tenant, case-insensitive, trimmed; no DB index | Pass with issues | Logic correct; race in BUG-CUST-010. |
| BE Authorization — authenticated; tenant from request | Cross-module | See Cross-Module Concerns. |
| BL — Auto code `C…` | Pass with issues | BUG-CUST-004 (collision and reuse). |
| BL — Delete blocked by orders, quotations, invoices, shipments; Delete All cascades | Fail | BUG-CUST-001, BUG-CUST-002. |
| BL — Contacts and addresses deleted with the customer | Pass | `CustomerController.cs` lines 938–952. |
| BL — Status is a string Active/Inactive | Pass | Inactive status not honoured by sales pickers (BUG-CUST-003, matrix 10.1). |

## Cross-Module Concerns

| Concern | Owner | Affected endpoints / evidence |
| --- | --- | --- |
| The tenant id comes from the query or body and is not compared with the token's tenant. | `QA_TenantLocationFramework.md` | `GET /Customer/GetCustomerlist?tenantid` (`CustomerController.cs` 25–97), `GET GetCustomerById?tenantId` (99–158), `POST SaveCustomerData` (`TenantID` in body, 160–372), `POST ImportCustomers` (`Tenantid` in body, 374–614), `GET CheckCustomerDeletionImpact?tenantId` (733–923), `DELETE DeleteCustomer?tenantId` (925–964). The UI sends `tenantID` from localStorage (`Common/Services/CustomerService.ts`). |
| No server-side role/permission check: any authenticated user (including a vendor-portal token) can list, create, import and delete customers. | `QA_RolesPermissions.md` | All six endpoints above. |

