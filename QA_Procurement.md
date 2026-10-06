# QA — Procurement (Vendor Quotations/RFQ, Orders, Receiving, Invoices & Payments) -t

| Module | Matrix section | Bug ID prefix | Tested | Confirmed Bugs | Potential Bugs | Manual Verification |
| --- | --- | --- | --- | --- | --- | --- |
| Procurement (Vendor Quotations/RFQ, Orders, Receiving, Invoices & Payments) | 4.1–4.4 | BUG-PROC | Yes | 20 (+1 duplicate: PROC-006) | 9 | 9 |

Source of test cases: `QA_TEST_MATRIX.md`. Method: static trace of the actual implementation (React UI → service → Axios → .NET controller → service/repository → EF Core → SQL Server, and back). No application code, configuration or database is changed during QA. Findings that depend on deployed configuration, data or a real browser go under **Needs Manual Verification**.

Severity scale:
- **Critical**: security breach, data corruption, financial corruption, or a blocked core workflow.
- **High**: a major feature is broken or a significant security control is bypassed, with a workaround that is hard or unavailable.
- **Medium**: a feature works incorrectly in specific conditions, or a security control is weaker than configured.
- **Low**: cosmetic, minor UX, or an informational/hardening issue.

---

## Confirmed Bugs

### BUG-PROC-001 — Vendor invoice detail endpoint returns any tenant's invoice (no tenant filter)
**Severity:** Critical. Any authenticated user can read another company's vendor invoices (vendor, amounts, lines, PO references) by iterating numeric IDs, which is a cross-tenant data breach.
**Status:** Confirmed
**Test Area:** 4.4 Vendor Invoices / API, Tenant
**Description:** `GET /Order/GetVendorInvoiceDetails/{invoiceId}` loads `VendorInvoiceMaster` and `VendorInvoiceDetail` by primary key only. Neither query compares `TenantId` with the caller's tenant, and there is no location check. The matrix explicitly asks to "verify tenant filter" for this endpoint. The sibling endpoint `VendorInvoice/GetVendorInvoiceById` does filter by tenant, so this is an inconsistency, not a design choice.
**Steps to Reproduce:**
1. Sign in as a user of tenant A.
2. Call `GET /api/Order/GetVendorInvoiceDetails/{id}` with the ID of a vendor invoice that belongs to tenant B (IDs are sequential identity values).
3. Observe the response.
**Expected:** 404 (or 403) because the invoice does not belong to the caller's tenant.
**Actual:** 200 with the full invoice header and line items of tenant B.
**Evidence:**
- Frontend: `Cimmple_UI/src/Modules/Purchasing/VendorInvoiceDetailModal.tsx` (loads the invoice through `VendorInvoiceService` when a row is opened).
- Backend: `Cimmple_API/CimmpleAPI/Controllers/OrderController.cs` lines 4657–4678 (`.Where(i => i.Id == invoiceId)` at 4665 and `.Where(d => d.InvoiceId == invoiceId)` at 4676, with no tenant predicate). The tenant-filtered contrast is `Cimmple_API/CimmpleAPI/Controllers/VendorInvoiceController.cs` lines 176–242.
- Database: `VendorInvoiceMaster.Id`, `VendorInvoiceMaster.TenantId`, `VendorInvoiceDetail.InvoiceId`.
**Root Cause:** The tenant predicate (and location check) was never added to the by-ID lookup.
**Business Impact:** Leaks supplier pricing, payables and purchasing volumes between customers of the SaaS product.
**Affected Areas:** Vendor Invoices list (view modal), Accounts Payable drill-downs that open the same modal.
**Recommended Fix:** Filter both queries by `GetTenantId()` and return 404 on mismatch; also apply `CanAccessLocation(invoice.locationId)` like the VO and VQ get-by-ID endpoints.

---

### BUG-PROC-002 — Convert Vendor Quotation to Order works on another tenant's quotation
**Severity:** Critical. A user can create a vendor order inside another tenant and mark that tenant's quotation as Converted, which is a cross-tenant write that corrupts their data.
**Status:** Confirmed
**Test Area:** 4.1 Vendor Quotations / Convert, Tenant
**Description:** `POST /Quotation/ConvertVendorQuotationToOrder?quotationId=` looks the quotation up by `OrderID` only. It then creates a `VendorOrder` with `Tenantid = quotation.Tenantid`, copies the lines, and sets the quotation (and its master RFQ) to Converted. The caller's tenant and location are never compared with the quotation's.
**Steps to Reproduce:**
1. Sign in as a user of tenant A.
2. Call `POST /api/Quotation/ConvertVendorQuotationToOrder?quotationId={id}` with the ID of an unconverted tenant B quotation and body `{}`.
3. Check tenant B's Vendor Orders and Vendor Quotations lists.
**Expected:** 404 because the quotation belongs to another tenant.
**Actual:** A new Draft VO appears in tenant B (with tenant A's user ID as owner when present), and tenant B's quotation becomes Converted, so tenant B can no longer convert it.
**Evidence:**
- Frontend: `Cimmple_UI/src/Modules/Quotations/VendorQuotationComparison.tsx` lines 617–620 (UI call); `Cimmple_UI/src/Common/Services/QuotationService.ts` lines 1283–1311.
- Backend: `Cimmple_API/CimmpleAPI/Controllers/QuotationController.cs` lines 2642–2644 (lookup by ID only), 2682–2705 (`Tenantid = quotation.Tenantid`), 2722–2756 (line copy), 2762–2779 (status Converted plus master roll-up).
- Database: `VendorQuotations.Tenantid`, `VendorQuotations.Status`, `VendorQuotations.convertedOrderId`, `VendorOrders`, `VendorOrderDetails`.
**Root Cause:** Missing tenant (and location) predicate on the quotation lookup.
**Business Impact:** Cross-tenant tampering: phantom purchase orders in another company and loss of their RFQ workflow.
**Affected Areas:** VQ Compare "Convert" action, VO list of the victim tenant, VQ list of the victim tenant.
**Recommended Fix:** Filter the lookup by `GetTenantId()` (return 404 otherwise) and check `CanAccessLocation(quotation.locationid)`.

---

### BUG-PROC-003 — Vendor invoice GL reference uses the non-unique vendor invoice number, so void/delete can reverse a different invoice's journal
**Severity:** Critical. Voiding or deleting one vendor invoice can reverse the AP journal of another, still-open invoice, so the GL Accounts Payable balance no longer matches the AP sub-ledger.
**Status:** Confirmed
**Test Area:** 4.4 Vendor Invoices / Business logic, GL
**Description:** On create, the invoice number is whatever the user typed (the vendor's own invoice number), copied into `prefixinvoiceno`. The posting reference is `APBILL-{prefixinvoiceno}`; the invoice ID is only used when the number is blank. Invoice-number uniqueness is not checked (the matrix records "invoice number uniqueness (not checked)"). Two invoices with the same number therefore share one reference. Void and delete call `TryReverseJournalByReference`, which reverses the **newest** unreversed journal with that reference, not the journal of the invoice being voided. The same applies to `APPMT-` payment references.
**Steps to Reproduce:**
1. Create vendor invoice "1001" for vendor X from VO 1 and approve it (do not pay).
2. Create vendor invoice "1001" for vendor Y from VO 2 (the modal accepts it).
3. Void the first invoice (vendor X).
4. Inspect Journal Entries for `APBILL-1001` and `REV-APBILL-1001`.
**Expected:** The reversal targets invoice X's journal; invoice numbers are unique per vendor (or the reference includes the invoice ID).
**Actual:** Invoice Y's (newest) APBILL journal is reversed. Invoice X's liability stays in the GL while X is marked Void; invoice Y is still Unpaid and payable but its liability is gone from the GL.
**Evidence:**
- Frontend: `Cimmple_UI/src/Modules/Purchasing/VendorInvoiceModal.tsx` lines 140–143 (invoice number only required, no uniqueness check).
- Backend: `Cimmple_API/CimmpleAPI/Controllers/OrderController.cs` lines 4336 and 4356 (`InvoiceNo`/`prefixinvoiceno = request.InvoiceNo`), 4424 (posting reference), 4976–4981 (`BuildAutoPostingReference` only falls back to the ID when the number is blank); `Cimmple_API/CimmpleAPI/Controllers/VendorInvoiceController.cs` lines 885–890 (void) and 945–950 (delete); `Cimmple_API/CimmpleAPI/Services/GlWorkflowService.cs` lines 143–148 (newest unreversed entry by reference).
- Database: `VendorInvoiceMaster.InvoiceNo`, `VendorInvoiceMaster.prefixinvoiceno`, `JournalEntries.ReferenceNumber`, `JournalEntries.ReversedByJournalEntryId`.
**Root Cause:** The journal is linked to the invoice through a free-text, non-unique number instead of the invoice primary key, and duplicates are not blocked.
**Business Impact:** Silent AP/GL mismatch, wrong trial balance, and invoices that can be paid without a liability on the books. Vendor invoice numbers repeat across vendors routinely.
**Affected Areas:** Vendor invoice void and delete, vendor payments (`APPMT-`), AP aging versus GL reconciliation, period close.
**Recommended Fix:** Include the invoice ID in the APBILL/APPMT reference (or store the journal ID on the invoice and reverse by ID), and reject a duplicate invoice number for the same vendor within the tenant.

---

### BUG-PROC-004 — Editing a vendor order deletes received lines and their receiving history, while inventory stays booked
**Severity:** Critical. Removing (or renumbering) a received but not-yet-invoiced line deletes its `VendorReceiving` rows by cascade, so receiving history and the invoiceable quantity disappear while the stock receipt remains in inventory, which is data corruption.
**Status:** Confirmed
**Test Area:** 4.2 Vendor Orders / Business logic (Edit), 4.3 Vendor Receiving
**Description:** `SaveVendorOrder` matches incoming lines to existing ones by `JobId` and `ItemNo`. Only lines with `VendorInvoicing` rows are protected. Any existing line missing from the request that has no invoicing is removed with `RemoveRange`. The `VendorReceiving → VendorOrderDetails` foreign key is ON DELETE CASCADE, so all receipts for that line are deleted. The inventory transactions posted at receipt (reference "VendorReceiving") are not reversed. Non-invoiced lines can also have `QtyOrdered` reduced below the quantity already received. The UI enforces the same rule: only invoiced lines are locked, and the trash button works on received lines.
**Steps to Reproduce:**
1. Create and send a VO with two RawMaterial lines and receive line 2 into a location (inventory increases).
2. Reopen the VO, delete line 2 with the row's delete button (or change its quantity to less than received), and click Sent.
3. Open Vendor Receiving history and the Vendor Invoice modal for the VO, and check inventory.
**Expected:** Lines with receipts cannot be deleted, and quantity cannot drop below the received quantity (the same protection invoiced lines have), or the receipt is reversed in inventory.
**Actual:** The line and its receipts are deleted, the VO status recalculates without them, the invoice modal no longer offers the received quantity, and the stock stays on hand with a dangling "VendorReceiving" reference. A reduced quantity produces negative pending quantity.
**Evidence:**
- Frontend: `Cimmple_UI/src/Modules/Purchasing/VendorOrderSlideout.tsx` lines 792–798 (`isDetailInvoiced`), 800–835 and 837–863 (edit/delete blocked only for invoiced lines); `Cimmple_UI/src/Common/Services/VendorOrderService.ts` line 366 (`JobId: 0`, so matching is by `ItemNo`).
- Backend: `Cimmple_API/CimmpleAPI/Controllers/OrderController.cs` lines 2503 (match), 2509–2550 (only invoiced lines protected), 2558–2567 (delete of non-invoiced lines), 3001–3047 (`UpdateVendorOrderDetailFromJson` overwrites `QtyOrdered` with no received check); `Cimmple_API/CimmpleAPI/Data/Migrations/20260112175010_AddVendorReceiving.cs` line 35 (`ReferentialAction.Cascade`); `Cimmple_API/CimmpleAPI/Data/CimmpleDbContext.cs` lines 419–421 (required FK, default cascade). `DeleteVendorOrder` (3437–3442) already blocks deletion when receiving exists, which shows the intended rule.
- Database: `VendorOrderDetails`, `VendorReceiving.VendorOrderDetailID`, `InventoryTransaction` (ReferenceType "VendorReceiving").
**Root Cause:** The line-protection rule only considers invoicing, and the receiving FK cascades.
**Business Impact:** Lost audit trail of goods received, stock that cannot be traced to a PO, and received goods that can never be invoiced through the 3-way match.
**Affected Areas:** VO edit, Vendor Receiving history, invoiceable quantity, inventory valuation.
**Recommended Fix:** Treat lines with receipts like invoiced lines (block delete and block quantity below received) in both UI and API, and change the receiving FK to Restrict.

---

### BUG-PROC-005 — "Create Orders" from the quotation comparison writes the part number into the job field, so received stock is auto-issued to a job
**Severity:** Critical. Every VO created through Compare → Create Orders treats its lines as job-tied; on receipt the stock is immediately issued out to a job order resolved from digits in the part number (or to no job), so purchased stock never stays on hand and unrelated jobs are charged.
**Status:** Confirmed
**Test Area:** 4.1 Vendor Quotations / Compare → Convert; 4.3 Vendor Receiving / Business logic
**Description:** `handleCreateOrders` in the comparison screen builds each VO line with `JobNumber: item.lineItem.partNo` (the code comment says "Use partNo as job number if available"). The backend treats any line with a non-empty `JobNumber` as job-tied. On receipt, `ReceiveLineItem` books the stock and then issues the same quantity to the job returned by `ResolveJobOrderIdForInventoryAsync`. That resolver strips the digits out of the "job number" (here a part number such as `PLT-1018`) and matches `JobOrderNumber == 1018` or `1018 − 999`. If nothing matches, the issue is posted with no job reference. The receiving screen also skips the location requirement for these lines because it considers them job-tied.
**Steps to Reproduce:**
1. Create a multi-vendor RFQ with a RawMaterial line whose part number contains digits (for example `PLT-1018`) and collect vendor responses.
2. Open Compare, select a vendor for the line and click Create Orders.
3. Open the new VO: the Job column shows `PLT-1018`. Send it and receive the line.
4. Check inventory balance and the job order with number 1018 or 19.
**Expected:** Lines created from Compare are stock lines (empty `JobNumber`, `JobId` 0) unless the RFQ line was actually linked to a job; receiving increases on-hand stock.
**Actual:** On-hand stock is unchanged after receipt (receive plus immediate issue), and the issue transaction is linked to an unrelated job order or to none.
**Evidence:**
- Frontend: `Cimmple_UI/src/Modules/Quotations/VendorQuotationComparison.tsx` lines 754–763 (job ID parsed from part number) and 774 (`JobNumber: item.lineItem.partNo || ""`); `Cimmple_UI/src/Modules/Purchasing/VendorReceivingDetail.tsx` lines 29–33 (job-tied lines skip the location requirement).
- Backend: `Cimmple_API/CimmpleAPI/Controllers/OrderController.cs` lines 3203–3206 (`IsVendorOrderLineJobTied` true when `JobNumber` is non-empty), 3225–3248 (digit parsing of `JobNumber`), 4033–4058 (auto-issue on receipt).
- Database: `VendorOrderDetails.JobNumber`, `InventoryTransaction` (ReferenceType "JobOrder"), `InventoryBalance`.
**Root Cause:** The comparison screen populates `JobNumber` with the part number; the single-quote convert path (`VendorQuotationSlideout.tsx` line 981) correctly copies the RFQ line's own `JobNumber`.
**Business Impact:** Inventory understated, job costs overstated on random jobs, and MRP/shortage decisions made on wrong balances.
**Affected Areas:** RFQ comparison, VO lines, receiving, inventory balances, job material cost.
**Recommended Fix:** Copy the RFQ line's `jobNumber`/`jobId` (normally empty) instead of `partNo`, and stop parsing a job ID from the part number.

---

### BUG-PROC-006 — Vendor payment period lock and journal period use the invoice's period instead of the payment date

> **Duplicate of BUG-ACC-001** (`QA_Accounting.md`), which covers both customer and vendor payments. This entry is kept for traceability and is not counted in this module's totals.
**Severity:** High. Payments are blocked whenever the invoice's month is closed (normal for older invoices), and when it is open the payment journal is stamped into the invoice's month even though it is dated on the payment date, which breaks period close and cash reporting.
**Status:** Confirmed
**Test Area:** 4.4 Vendor Invoices / Payment, Business logic
**Description:** `RecordVendorPayment` derives `periodKey` from `invoice.AccountingPeriod` and only uses the payment date when the invoice has no period. It checks the lock on that period, stamps it on the `APPMT-` journal (whose `EntryDate` is the payment date) and on the `Transactions` row. The error text tells the user to "pick another payment date", which cannot help because the payment date is not used.
**Steps to Reproduce:**
1. Create and approve a vendor invoice dated in March.
2. Close the March period (Period Close).
3. In April, record a payment on the invoice with an April payment date.
**Expected:** The payment posts to April (the payment date's period); only a closed April would block it.
**Actual:** 400 "Accounting period YYYY03 is closed. Open the period or pick another payment date." If March is open instead, the payment journal is dated in April but posted to period March.
**Evidence:**
- Frontend: `Cimmple_UI/src/Modules/Purchasing/VendorInvoiceDetailModal.tsx` lines 40–120 (payment modal sends a payment date).
- Backend: `Cimmple_API/CimmpleAPI/Controllers/VendorInvoiceController.cs` lines 738–748 (period from invoice), 771–781 (journal `EntryDate = paymentDate`, `AccountingPeriod = periodKey`), 811 (`Transactions.AccountingPeriod = periodKey`).
- Database: `JournalEntries.AccountingPeriod`, `JournalEntries.EntryDate`, `Transactions.AccountingPeriod`, `GlAccountingPeriodLocks`.
**Root Cause:** The invoice's accrual period is reused for the cash event.
**Business Impact:** AP cannot pay bills from closed months without reopening them; cash and AP movements land in the wrong period; bank reconciliation by period does not tie out.
**Affected Areas:** Vendor payments, Period Close, Bank Reconciliation, cash flow reports.
**Recommended Fix:** Compute the period from the payment date for the lock check, the journal and the `Transactions` row.

---

### BUG-PROC-007 — CreateVendorInvoice allows invoicing more than received (duplicate or foreign order lines)
**Severity:** High. The 3-way-match control (invoice quantity ≤ received − invoiced) can be bypassed in one request, overstating AP and expense.
**Status:** Confirmed
**Test Area:** 4.4 Vendor Invoices / Validation, API
**Description:** The validation loop checks each `LineItems` entry against `received − alreadyInvoiced` read from the database, but it does not accumulate quantities within the same request. Two entries with the same `OrderDetailId` each pass. The lookup also does not require the detail to belong to `request.OrderId`, so a line from another VO (even another vendor's) can be billed under this VO's vendor; the saved detail row then stores `OrderId = request.OrderId` with a foreign `VendorOrderDetailID`.
**Steps to Reproduce:**
1. Receive 10 units on a VO line that has nothing invoiced.
2. Call `POST /api/Order/CreateVendorInvoice` with two line items, both `OrderDetailId` = that line, `QtyToInvoice` 10 each.
3. Inspect the invoice, `VendorInvoicing` and the line's `InvoicedQty`.
**Expected:** 400 because 20 > 10 available.
**Actual:** The invoice is created for 20 units, AP is credited for 20, and `VendorInvoicing` shows 20 invoiced against 10 received.
**Evidence:**
- Frontend: `Cimmple_UI/src/Modules/Purchasing/VendorInvoiceModal.tsx` lines 178–186 and 540–556 (UI sends one entry per line, so this needs a crafted request).
- Backend: `Cimmple_API/CimmpleAPI/Controllers/OrderController.cs` lines 4270–4288 (per-entry check, not cumulative, no `d.OrderID == request.OrderId`), 4366–4422 (each entry inserted), 4381–4382 (`OrderId = request.OrderId`, `VendorOrderDetailID = item.OrderDetailId`).
- Database: `VendorInvoiceDetail`, `VendorInvoicing.InvoicedQty`, `VendorOrderDetails.InvoicedQty`.
**Root Cause:** Validation is per row instead of per order line, and line ownership is not checked.
**Business Impact:** Overpayment risk and incorrect AP/expense; invoiced quantity higher than received breaks receiving/invoicing reports.
**Affected Areas:** Vendor invoice creation, AP, VO invoice status.
**Recommended Fix:** Group line items by `OrderDetailId` and validate the summed quantity, and reject details whose `OrderID` differs from `request.OrderId`.

---

### BUG-PROC-008 — Vendor quotation endpoints drop the tenant filter (lookup by vendor code, or when tenantId is omitted)
**Severity:** High. Another tenant's RFQs can be listed by vendor code and read, and even overwritten, by ID, which is cross-tenant disclosure and tampering of purchasing data.
**Status:** Confirmed
**Test Area:** 4.1 Vendor Quotations / API, Tenant
**Description:** Three code paths do not restrict to the caller's tenant:
1. `GET GetVendorQuotationsByVendorCode` for ERP (non-portal) callers filters only `isSent` and `vendorcode`. Vendor codes such as `V001` are common across tenants.
2. `GET GetVendorQuotationById` applies `Tenantid == tenantId` only when `tenantId > 0`; the comment says "otherwise allow any tenant". The location check only protects users without all-location access.
3. `POST SaveVendorQuotation` for an update (`OrderID > 0`) applies the tenant filter only when the body's `Tenantid > 0`, so omitting it loads and modifies another tenant's quotation.

The portal branch of path 1 is tenant-scoped; the ERP branch is not. Unlike cross-module concern (a), these paths skip the check entirely instead of trusting a supplied value.
**Steps to Reproduce:**
1. As tenant A, call `GET /api/Quotation/GetVendorQuotationsByVendorCode?vendorCode=V001`.
2. Call `GET /api/Quotation/GetVendorQuotationById?quotationId={tenant B id}` without `tenantId`.
3. Call `POST /api/Quotation/SaveVendorQuotation` with `OrderID` = tenant B's ID, `Tenantid` 0, a vendor and one line.
**Expected:** Only tenant A data is returned or modified.
**Actual:** Tenant B quotations are listed and returned; step 3 updates tenant B's quotation and replaces its lines.
**Evidence:**
- Frontend: `Cimmple_UI/src/Common/Services/QuotationService.ts` lines 1362–1372 (by-vendor-code call), 1221–1235 (save sends `Tenantid` from storage, which can be 0).
- Backend: `Cimmple_API/CimmpleAPI/Controllers/QuotationController.cs` lines 1157–1180 (ERP branch without tenant), 1231–1240 (optional tenant filter), 1543–1550 (optional tenant filter on update).
- Database: `VendorQuotations.Tenantid`, `VendorQuotationsDetails`.
**Root Cause:** The tenant filter is conditional on a client-supplied value instead of always using the token tenant.
**Business Impact:** Competitor-sensitive supplier prices exposed; RFQs of other tenants can be altered.
**Affected Areas:** Vendor quotation view, save, comparison and vendor lookups.
**Recommended Fix:** For ERP callers always filter by `GetTenantId()` in all three paths; keep the existing portal-token scoping for vendor callers.

---

### BUG-PROC-009 — Site (location) restrictions are not enforced on procurement record actions
**Severity:** Medium. Users limited to certain sites can receive, invoice, approve, pay, void or delete documents of other sites by ID, so the site restriction is weaker than configured.
**Status:** Confirmed
**Test Area:** 4.3 Vendor Receiving / Validation, Location; 4.4 Vendor Invoices / Location
**Description:** Location checks exist only on list endpoints and on VO/VQ get-by-ID. `GetOrderForReceiving`, `ReceiveLineItem`, `GetInvoiceableItemsForVendorOrder`, `CreateVendorInvoice`, `ApproveVendorInvoice`, `RecordVendorPayment`, `VoidVendorInvoice`, `DeleteVendorInvoice`, `DeleteVendorOrder` and `ConvertVendorQuotationToOrder` never call `CanAccessLocation`. `ReceiveLineItem` also accepts any body `locationId` as the stock location without validating it. The receive form's location dropdown is loaded from `LocationService.GetLocations`, which returns every tenant location regardless of the user's assignment. The matrix itself notes "receiving location not checked with `CanAccessLocation`".
**Steps to Reproduce:**
1. Sign in as a user assigned only to Site A.
2. Open Vendor Receiving on a Site A order and pick Site B in the location dropdown, then receive (or call `ReceiveLineItem` for a Site B order's line).
3. Call `RecordVendorPayment/{id}` for a Site B invoice.
**Expected:** 403 for documents or locations outside the user's sites; the dropdown lists only permitted sites.
**Actual:** Stock is booked into Site B and the Site B invoice is paid.
**Evidence:**
- Frontend: `Cimmple_UI/src/Modules/Purchasing/VendorReceivingDetail.tsx` lines 116–127 (all locations loaded) and 545–552 (dropdown).
- Backend: `Cimmple_API/CimmpleAPI/Controllers/OrderController.cs` only uses `CanAccessLocation` at lines 299 and 2051 and list filters at 1874, 3593 and 4521; `ReceiveLineItem` 3802–4081 (body `locationId` at 3814–3816 used at 4002); `Cimmple_API/CimmpleAPI/Controllers/VendorInvoiceController.cs` (only list filter at line 42); `Cimmple_API/CimmpleAPI/Controllers/LocationController.cs` lines 29–69 (all tenant locations).
- Database: `VendorOrders.LocationId`, `VendorInvoiceMaster.locationId`, `VendorReceiving.LocationId`, `InventoryBalance.LocationId`.
**Root Cause:** Record-level actions do not reuse the `CanAccessLocation` checks applied in list and get endpoints.
**Business Impact:** Site-level segregation (stock per site, AP per site) can be bypassed.
**Affected Areas:** Receiving, inventory by site, vendor invoices, payments.
**Recommended Fix:** Check `CanAccessLocation` on the parent document's location for each action, validate the receiving `locationId` the same way, and load the dropdown from the user's permitted sites.

---

### BUG-PROC-010 — "Save as Draft" on a received vendor order resets it to Draft and hides it from Receiving
**Severity:** Medium. A partially received VO saved with "Save as Draft" disappears from the Vendor Receiving list and its status no longer reflects receipts.
**Status:** Confirmed
**Test Area:** 4.2 Vendor Orders / Status; 4.3 Vendor Receiving / List
**Description:** The "Save as Draft" button is always shown and always sends `Status = "Draft"`. After saving, the backend recomputes the receive status but explicitly keeps a client "Draft" ("Prefer client status for Draft"). The receiving list excludes Draft orders, and the list-level recalculation only touches Sent/Receiving/Partially Received/Fully Received/Completed rows, so it never repairs it.
**Steps to Reproduce:**
1. Send a VO and receive part of a line.
2. Reopen the VO and click "Save as Draft".
3. Open the VO list and Vendor Receiving.
**Expected:** A VO with receipts keeps its derived status (Partially/Fully Received), or Draft is not offered after sending.
**Actual:** The VO shows Draft and is not listed in Vendor Receiving, so the rest cannot be received until someone clicks "Sent" again.
**Evidence:**
- Frontend: `Cimmple_UI/src/Modules/Purchasing/VendorOrderSlideout.tsx` lines 1306–1309 (`draft` → "Draft") and 2700–2707 (button always enabled).
- Backend: `Cimmple_API/CimmpleAPI/Controllers/OrderController.cs` lines 2686–2701 (Draft kept), 1943–1944 (list recalculation skips Draft), 3588–3696 (`GetOrdersForReceiving` excludes Draft).
- Database: `VendorOrders.Status`.
**Root Cause:** Client status wins over the derived receive status for Draft.
**Business Impact:** Receiving staff cannot find open POs; open-PO reports are wrong.
**Affected Areas:** VO status, receiving list, purchasing reports.
**Recommended Fix:** Ignore "Draft" when receipts exist (persist the derived status), or hide/disable "Save as Draft" once the VO is sent or has receipts.

---

### BUG-PROC-011 — SaveVendorOrder saves header changes even when line validation rejects the save
**Severity:** Medium. The user sees an error but vendor, status, dates and totals have already been committed, leaving a VO whose header no longer matches its lines.
**Status:** Confirmed
**Test Area:** 4.2 Vendor Orders / CRUD, Database
**Description:** The header is saved with `SaveChangesAsync` before details are processed, and there is no transaction. Line validation that runs afterwards (for example "Quantity or price for line item #n cannot be edited because it has already been invoiced", or removing an invoiced line) returns 400 without rolling back the header.
**Steps to Reproduce:**
1. Open a VO with an invoiced line.
2. Change the vendor or total and also change the invoiced line's quantity through the API (or a stale UI), then save.
3. Reload the VO.
**Expected:** Nothing is saved when the request is rejected.
**Actual:** The 400 error is shown, but the header changes (vendor, status, `TotalAmount`, `PONumber`) are persisted.
**Evidence:**
- Frontend: `Cimmple_UI/src/Modules/Purchasing/VendorOrderSlideout.tsx` lines 1323–1347 (save path).
- Backend: `Cimmple_API/CimmpleAPI/Controllers/OrderController.cs` lines 2449 (header `SaveChangesAsync`), 2522–2525 and 2546–2550 (later 400 returns), no `BeginTransaction` in `SaveVendorOrder` (2204–2902).
- Database: `VendorOrders`.
**Root Cause:** Multi-step save without a transaction, with validation after the first commit.
**Business Impact:** Inconsistent purchase orders, for example an invoiced VO switched to another vendor.
**Affected Areas:** VO edit, VO PDF/email, invoicing.
**Recommended Fix:** Validate all lines before saving, and wrap the header/detail/quotation updates in one transaction.

---

### BUG-PROC-012 — Batch "Receive All" partial failure leaves the forms filled, so a retry receives the successful lines twice
**Severity:** Medium. A retry after a partial failure double-receives lines that already succeeded (within the ordered quantity), inflating stock and invoiceable quantity.
**Status:** Confirmed
**Test Area:** 4.3 Vendor Receiving / Receive
**Description:** `handleBatchReceive` posts all lines with `Promise.all`. If any request fails (HTTP 400 rejects the promise, for example a missing location or an inventory error on one line), the catch only shows a toast: the receiving forms are not cleared and the order is not reloaded, so `pendingQty` is stale. Successful lines are already committed server-side (each call has its own transaction). Clicking "Receive All" again re-submits them, and the backend accepts them as long as the running total stays ≤ ordered.
**Steps to Reproduce:**
1. On a VO with line 1 (ordered 10) and line 2, enter 4 on line 1 and a value on line 2 that will fail server-side (for example a job-tied line on a VO without a location).
2. Click Receive All: an error appears.
3. Click Receive All again.
**Expected:** After any batch, successful lines are cleared and the order is reloaded, or only failed lines are retried.
**Actual:** Line 1 is received again (8 total) although only 4 arrived.
**Evidence:**
- Frontend: `Cimmple_UI/src/Modules/Purchasing/VendorReceivingDetail.tsx` lines 299–311 (`Promise.all`), 313–322 (forms kept on partial failure), 323–325 (catch without reload).
- Backend: `Cimmple_API/CimmpleAPI/Controllers/OrderController.cs` lines 3850–3854 (only ordered-quantity limit).
- Database: `VendorReceiving`, `InventoryTransaction`.
**Root Cause:** No per-line result handling or reload after a failed batch.
**Business Impact:** Overstated stock and payables for goods never received.
**Affected Areas:** Receiving, inventory, invoiceable quantity.
**Recommended Fix:** Use `Promise.allSettled`, clear the forms of successful lines, and always reload the order after a batch.

---

### BUG-PROC-013 — Vendor order numbers display the same "VO#" for two different orders after 999 orders
**Severity:** Medium. Once a tenant passes 999 vendor orders, each new VO shows the same display number as an older one (VO#1000 for both PONumber 1 and PONumber 1000), so search, references and documents become ambiguous.
**Status:** Confirmed
**Test Area:** 4.2 Vendor Orders / List, Search; 4.3, 4.4 (VO# references)
**Description:** VO `PONumber` is generated as max + 1 starting at 1, unlike VQ, CQ, CO and JO numbers, which start at 1000. Every display formats `PONumber < 1000 ? PONumber + 999 : PONumber`. PONumber 1 shows as VO#1000, and the real PONumber 1000 also shows as VO#1000. Global search maps VO#1000 back to PONumber 1, and `GetVendorOrderById` uses an `orderId - 999` fallback, so the newer order cannot be found by its display number.
**Steps to Reproduce:**
1. In a tenant with VO PONumbers 1…999, create one more VO (PONumber 1000).
2. View the VO list, the receiving list and the invoice list.
3. Search "VO#1000".
**Expected:** Unique display numbers.
**Actual:** Two orders show VO#1000; search returns both or the wrong one.
**Evidence:**
- Frontend: `Cimmple_UI/src/Modules/Purchasing/VendorOrders.tsx` lines 152–155; `Cimmple_UI/src/Modules/Purchasing/VendorReceiving.tsx` lines 77–80.
- Backend: `Cimmple_API/CimmpleAPI/Controllers/OrderController.cs` line 2374 (`(max ?? 0) + 1`), 2040 (`orderId - 999` fallback), 4602 (invoice list offset); `Cimmple_API/CimmpleAPI/Controllers/QuotationController.cs` line 2714 (same in convert); `Cimmple_API/CimmpleAPI/Controllers/GlobalSearchController.cs` lines 261 and 760. Contrast: VQ numbers use `Math.Max(1000, max + 1)` at `QuotationController.cs` line 1644.
- Database: `VendorOrders.PONumber`.
**Root Cause:** The VO sequence does not start at 1000 while the display offset assumes legacy numbers below 1000.
**Business Impact:** Wrong PO referenced on receipts, invoices and vendor communications.
**Affected Areas:** VO list, receiving, invoices, PDFs/emails, global search.
**Recommended Fix:** Generate VO numbers with `Math.Max(1000, max + 1)` like other documents, keeping the offset only for legacy rows below 1000.

---

### BUG-PROC-014 — No way to reverse a vendor payment, so paid invoices cannot be voided or corrected
**Severity:** Medium. Void and delete tell the user to "Reverse payments first", but no payment-reversal function exists, so a wrongly paid or wrongly entered invoice cannot be corrected in the module.
**Status:** Confirmed
**Test Area:** 4.4 Vendor Invoices / Void, Payment
**Description:** `VoidVendorInvoice` and `DeleteVendorInvoice` block any invoice with a paid amount and instruct the user to reverse payments. `PaidAmount` is only ever set by `RecordVendorPayment` and by void (reset to 0). There is no endpoint or UI that reverses an `APPMT-` journal or reduces `PaidAmount`.
**Steps to Reproduce:**
1. Approve and partially pay a vendor invoice.
2. Try to void it: "Cannot void a paid or partially paid invoice. Reverse payments first."
3. Look for a reverse-payment action in the invoice modal, the AP page or the API.
**Expected:** A payment reversal function exists, as the message implies.
**Actual:** None exists; the only path is manual journal entries, which leave `PaidAmount`/`isPaid` unchanged.
**Evidence:**
- Frontend: `Cimmple_UI/src/Modules/Purchasing/VendorInvoiceDetailModal.tsx` lines 1037–1064 (Pay only) and 1103 (Void only when Unpaid).
- Backend: `Cimmple_API/CimmpleAPI/Controllers/VendorInvoiceController.cs` lines 881–883 and 938–940 (messages), 759 and 903 (the only `PaidAmount` assignments).
- Database: `VendorInvoiceMaster.PaidAmount`, `VendorInvoiceMaster.isPaid`, `JournalEntries` (`APPMT-`).
**Root Cause:** The reversal half of the payment workflow was not implemented.
**Business Impact:** Payment errors (wrong amount, wrong bank, bounced cheque) cannot be fixed cleanly; the AP sub-ledger and GL drift apart when fixed manually.
**Affected Areas:** Vendor invoices, AP, bank reconciliation.
**Recommended Fix:** Add a payment-reversal action that posts the `REV-APPMT-` journal, reverses the `Transactions` row and recalculates `PaidAmount`/`isPaid`.

---

### BUG-PROC-015 — Second vendor-invoice implementation (VendorInvoiceController Create/Update) skips the receiving check and posts wrong values
**Severity:** Medium. These endpoints are not used by the UI but are callable by any authenticated user; they create invoices without the 3-way match and with wrong period, links and totals.
**Status:** Confirmed
**Test Area:** 4.4 Vendor Invoices / API (Create, Update)
**Description:**
- `POST VendorInvoice/CreateVendorInvoice` does not check invoice quantity against received − invoiced.
- It stamps `AccountingPeriod` from `DateTime.Now` instead of the invoice date.
- It writes `VendorInvoicing.VendorInvoiceDetailID = invoiceDetail.Id` before the detail is saved, so the link is 0. Void and delete look up invoicing rows by detail ID, so these rows are never reversed.
- The journal location falls back to 1.
- `PUT UpdateVendorInvoice` sets `TotalAmount = Amount`, dropping tax and freight, and recalculates invoiced quantity through the same zero link.
**Steps to Reproduce:**
1. Call `POST /api/VendorInvoice/CreateVendorInvoice` for a VO line that has nothing received.
2. Inspect `VendorInvoicing.VendorInvoiceDetailID` and `VendorInvoiceMaster.AccountingPeriod`.
3. Void the invoice and check the line's `InvoicedQty`.
**Expected:** Same validation and data as `Order/CreateVendorInvoice`.
**Actual:** The invoice is accepted, linked with detail ID 0, and void leaves the invoiced quantity in place.
**Evidence:**
- Frontend: n/a (not called by the UI).
- Backend: `Cimmple_API/CimmpleAPI/Controllers/VendorInvoiceController.cs` lines 244–508 (create; period at 327, detail link at 372, location fallback at 257), 510–610 (update; 580, 595–596).
- Database: `VendorInvoiceMaster`, `VendorInvoiceDetail`, `VendorInvoicing.VendorInvoiceDetailID`.
**Root Cause:** A divergent duplicate implementation that was not kept in sync with the UI path.
**Business Impact:** Over-invoicing and orphaned invoiced quantities through direct API use or integrations.
**Affected Areas:** AP, VO invoice status.
**Recommended Fix:** Remove these endpoints or route them through the `OrderController` implementation and its validation.

---

### BUG-PROC-016 — Vendor Invoices page has no Approve action, and Void is hidden for Overdue unpaid invoices
**Severity:** Low. The workflow works through the Accounts Payable page, but the procurement screen listed in the matrix cannot approve, and overdue unpaid invoices cannot be voided from this screen.
**Status:** Confirmed
**Test Area:** 4.4 Vendor Invoices / Frontend (Approve, Void)
**Description:** The matrix lists "Approve | Action (approval limit) | POST `ApproveVendorInvoice`" for this page. The page and detail modal only show Pay when the invoice is already approved; the only callers of `ApproveVendorInvoice` are in `Modules/Accounting/AccountsPayable.tsx`. Void is rendered only when `status === 'Unpaid'`, but an unpaid invoice past its due date has status "Overdue", although the backend allows voiding it.
**Steps to Reproduce:**
1. Create a vendor invoice from a VO and open Vendor Invoices.
2. Look for an approve action (none); Pay is not available.
3. Let an unpaid invoice pass its due date: the Void button disappears.
**Expected:** Approve is available here (subject to limits), and Void appears for any unpaid, non-void invoice.
**Actual:** No approve; Void hidden for Overdue rows.
**Evidence:**
- Frontend: `Cimmple_UI/src/Modules/Purchasing/VendorInvoices.tsx` line 883; `Cimmple_UI/src/Modules/Purchasing/VendorInvoiceDetailModal.tsx` lines 1037–1064 and 1103; `Cimmple_UI/src/Modules/Accounting/AccountsPayable.tsx` lines 377 and 447 (only approve callers).
- Backend: `Cimmple_API/CimmpleAPI/Controllers/VendorInvoiceController.cs` lines 878–883 (void allowed when unpaid).
- Database: n/a.
**Root Cause:** UI gating keyed on the display status "Unpaid" and approve wired only into the AP module.
**Business Impact:** Extra navigation for buyers; overdue invoices need workarounds to void.
**Affected Areas:** Vendor Invoices page and detail modal.
**Recommended Fix:** Add an Approve action, and show Void when `paidAmount == 0` and the invoice is not void.

---

### BUG-PROC-017 — Vendor Invoices list ignores the `?search=` drill-down and cannot select the Custom date range
**Severity:** Low. Report drill-downs land on an unfiltered list, and the From/To date inputs exist but can never be shown.
**Status:** Confirmed
**Test Area:** 4.4 Vendor Invoices / Search, Filters
**Description:** The page stores `?search=` into `filters.searchTerm`, but `filteredInvoices` never uses it and `MasterListPage` is not given `initialSearchTerm` (the VO list does this correctly). The Custom date logic and the From/To inputs exist, but `dateRangeOptions` has no "Custom" option.
**Steps to Reproduce:**
1. Open `/purchasing/vendor-invoices?search=ACME`.
2. Open the Date Range filter.
**Expected:** The list is pre-filtered to "ACME"; a Custom option shows the From/To inputs.
**Actual:** The full list is shown; no Custom option.
**Evidence:**
- Frontend: `Cimmple_UI/src/Modules/Purchasing/VendorInvoices.tsx` lines 448–451 (search stored), 551–561 (not applied), 915–923 (no Custom), 510 and 954 (Custom handling); contrast `Cimmple_UI/src/Modules/Purchasing/VendorOrders.tsx` line 317 (`initialSearchTerm`).
- Backend: n/a.
- Database: n/a.
**Root Cause:** Incomplete wiring of existing filter state.
**Business Impact:** Slower AP drill-down from reports; no arbitrary date range.
**Affected Areas:** Vendor Invoices list.
**Recommended Fix:** Pass `initialSearchTerm={filters.searchTerm}` and add `{ value: 'Custom', label: 'Custom' }`.

---

### BUG-PROC-018 — Vendor Orders list has no date filter, and the "Cancelled"/"Completed" statuses can never be reached
**Severity:** Low. The status filter offers Cancelled, but no action can set it, and there is no date filter although the matrix lists one.
**Status:** Confirmed
**Test Area:** 4.2 Vendor Orders / Filter, Status
**Description:** The matrix lists "status, date, site" filters and the statuses Draft, Sent, Receiving, Partially Received, Fully Received, Completed and Cancelled. The VO list only has site and status filters. The slideout only saves "Draft" or "Sent" (or the current receive status), and no endpoint sets "Cancelled". "Completed" is never set either: `UpdateVendorOrderInvoiceStatus` has an empty body.
**Steps to Reproduce:**
1. Open Vendor Orders and look for a date filter.
2. Try to cancel a VO.
3. Fully receive and invoice a VO and check its status.
**Expected:** A date filter; a way to cancel; a terminal status after full invoicing, as listed.
**Actual:** No date filter; no cancel action (the Cancelled filter never matches); the VO stays "Fully Received".
**Evidence:**
- Frontend: `Cimmple_UI/src/Modules/Purchasing/VendorOrders.tsx` lines 300–315; `Cimmple_UI/src/Modules/Purchasing/VendorOrderSlideout.tsx` lines 1306–1321.
- Backend: `Cimmple_API/CimmpleAPI/Controllers/OrderController.cs` lines 2930–2959 (`DeriveVendorReceiveStatus` never yields Cancelled/Completed), 4800–4842 (no-op invoice status update).
- Database: `VendorOrders.Status`.
**Root Cause:** Statuses exist in the vocabulary but have no transitions.
**Business Impact:** Cancelled POs stay open on open-PO reports and in Receiving.
**Affected Areas:** VO list, receiving list, purchasing reports.
**Recommended Fix:** Add a Cancel action (blocked when receipts or invoices exist), a date filter, and either implement or remove Completed.

---

### BUG-PROC-019 — Master RFQ converted through a vendor response still shows "Sent" and is excluded from the Converted filter
**Severity:** Low. The list shows a VO# link on the master but the status badge says Sent, and filtering by Converted hides it.
**Status:** Confirmed
**Test Area:** 4.1 Vendor Quotations / List, Filter
**Description:** When a child response is converted, the master gets `convertedOrderId` and `isconverted = 1`, but its `Status` is left unchanged. The list badge and the status filter use `Status` only.
**Steps to Reproduce:**
1. Send an RFQ to two vendors and convert one response from Compare.
2. View the Vendor Quotations list and filter by Converted.
**Expected:** The master shows Converted and appears under the Converted filter.
**Actual:** The master shows Sent with a VO# link and is missing from the Converted filter.
**Evidence:**
- Frontend: `Cimmple_UI/src/Modules/Quotations/VendorQuotations.tsx` lines 103–126 (badge from status), 312–317 (filter on exact status), 207–240 (Order # column).
- Backend: `Cimmple_API/CimmpleAPI/Controllers/QuotationController.cs` lines 2766–2777 (master roll-up without status).
- Database: `VendorQuotations.Status`, `VendorQuotations.isconverted`.
**Root Cause:** The roll-up updates the flags but not `Status`.
**Business Impact:** Buyers may think the RFQ is still open.
**Affected Areas:** VQ list.
**Recommended Fix:** Set the master's status to Converted on roll-up, or base the badge and filter on `isconverted`.

---

### BUG-PROC-020 — Backend accepts zero or negative quantities and prices and a client-supplied total on VO/VQ save
**Severity:** Low. The UI prevents most invalid input, but the API stores negative or zero lines and a header total that need not match the lines.
**Status:** Confirmed
**Test Area:** 4.1 / 4.2 Validation
**Description:** The matrix lists "qty > 0, price ≥ 0" for VO and VQ validation. `SaveVendorOrder` and `SaveVendorQuotation` read `QtyOrdered`, `UnitPrice` and `TotalAmount` from JSON without range checks and do not recompute `TotalAmount` from lines. The UI's quantity input resets 0 or empty to 1 on blur, so only API callers or edge cases are affected.
**Steps to Reproduce:**
1. Call `SaveVendorOrder` with one line `QtyOrdered: -5, UnitPrice: -10` and `TotalAmount: 999`.
2. Reload the VO.
**Expected:** 400 for invalid quantity or price; total derived from lines.
**Actual:** Saved as sent.
**Evidence:**
- Frontend: `Cimmple_UI/src/Modules/Purchasing/VendorOrderSlideout.tsx` lines 2081–2109 (client-side clamp only).
- Backend: `Cimmple_API/CimmpleAPI/Controllers/OrderController.cs` line 2288 (`TotalAmount` from client), 3001–3047 (detail fields from JSON); `Cimmple_API/CimmpleAPI/Controllers/QuotationController.cs` lines 1707 and 1977–1982 (only blank lines skipped).
- Database: `VendorOrderDetails.QtyOrdered`, `VendorOrderDetails.UnitPrice`, `VendorOrders.TotalAmount`.
**Root Cause:** Server-side validation relies on the UI.
**Business Impact:** Bad data in open-PO and purchasing reports; negative pending quantities.
**Affected Areas:** VO/VQ save, reports.
**Recommended Fix:** Validate `QtyOrdered > 0` and `UnitPrice ≥ 0` server-side and compute `TotalAmount` from the lines.

---

### BUG-PROC-021 — Receipts are accepted against Draft (or Cancelled) vendor orders
**Severity:** Low. Only reachable through the API or a stale screen, because the receiving list hides Draft orders, but goods can be booked against an unsent PO.
**Status:** Confirmed
**Test Area:** 4.3 Vendor Receiving / Validation
**Description:** `ReceiveLineItem` validates only the line and the ordered-quantity limit; it never loads or checks the parent order's status. `GetOrdersForReceiving` excludes Draft, which shows the intended rule.
**Steps to Reproduce:**
1. Create a VO and leave it in Draft.
2. Call `POST /api/Order/ReceiveLineItem` for one of its lines.
**Expected:** 400 because the order has not been sent (or is cancelled).
**Actual:** The receipt and inventory movement are posted.
**Evidence:**
- Frontend: `Cimmple_UI/src/Modules/Purchasing/VendorReceiving.tsx` (list only shows non-draft orders).
- Backend: `Cimmple_API/CimmpleAPI/Controllers/OrderController.cs` lines 3828–3854 (no status check), 3588–3696 (list status filter).
- Database: `VendorOrders.Status`, `VendorReceiving`.
**Root Cause:** The status precondition is enforced only by the list query.
**Business Impact:** Receiving against unapproved POs bypasses the purchasing control.
**Affected Areas:** Receiving, inventory.
**Recommended Fix:** Reject receipts unless the VO status is Sent, Receiving or Partially Received.

---

## Potential Bugs

### BUG-PROC-022 — Concurrent receipts, invoices or payments can exceed limits (no row locking)
**Severity:** Medium. Two simultaneous requests can both pass the "≤ pending", "≤ received − invoiced" or "≤ balance due" check, causing over-receipt, over-invoicing or a double payment.
**Status:** Potential
**Test Area:** 4.3 / 4.4 Business logic (concurrency)
**Description:** `ReceiveLineItem`, `CreateVendorInvoice` and `RecordVendorPayment` read current totals and then insert, inside default READ COMMITTED transactions, without `UPDLOCK`, a rowversion or a unique constraint. Double-submit is reduced in the UI (buttons disabled while saving), but two users or two tabs are not covered.
**Steps to Reproduce:**
1. Open the same invoice in two browsers.
2. Submit a full payment in both at the same moment.
3. Check `PaidAmount`, the `APPMT-` journals and `Transactions`.
**Expected:** The second request is rejected.
**Actual:** Code allows both to pass the balance check.
**Evidence:**
- Frontend: `Cimmple_UI/src/Modules/Purchasing/VendorInvoiceDetailModal.tsx` line 410 (button disabled per tab only).
- Backend: `Cimmple_API/CimmpleAPI/Controllers/VendorInvoiceController.cs` lines 700–710 and 750–760; `Cimmple_API/CimmpleAPI/Controllers/OrderController.cs` lines 3838–3854 and 4278–4284.
- Database: `VendorInvoiceMaster.PaidAmount`, `VendorReceiving`, `VendorInvoicing`.
**Root Cause:** Check-then-act without locking.
**Business Impact:** Duplicate payments to vendors; overstated stock or AP.
**Affected Areas:** Receiving, invoicing, payments.
**Recommended Fix:** Lock the parent row (`UPDLOCK`/rowversion) or re-check totals after insert inside the transaction.
**Why further verification is needed:** Race windows depend on timing and database isolation; a concurrent load test is needed to prove it.

---

### BUG-PROC-023 — VO and VQ numbers can be duplicated under concurrent creation
**Severity:** Low. Simultaneous saves can produce two documents with the same number.
**Status:** Potential
**Test Area:** 4.1 / 4.2 Database
**Description:** Numbers are generated as max + 1 per tenant without a lock, and there is no unique index on `(Tenantid, PONumber)` for `VendorOrders` or `VendorQuotations`.
**Steps to Reproduce:**
1. Save two new VOs at the same instant in the same tenant.
2. Compare their `PONumber`.
**Expected:** Distinct numbers.
**Actual:** Both may receive the same max + 1.
**Evidence:**
- Frontend: n/a.
- Backend: `Cimmple_API/CimmpleAPI/Controllers/OrderController.cs` lines 2336–2375; `Cimmple_API/CimmpleAPI/Controllers/QuotationController.cs` lines 1640–1649 and 2709–2714; `Cimmple_API/CimmpleAPI/Data/CimmpleDbContext.cs` lines 328–481 (no unique index).
- Database: `VendorOrders.PONumber`, `VendorQuotations.PONumber`.
**Root Cause:** Non-atomic sequence generation.
**Business Impact:** Ambiguous document references.
**Affected Areas:** VO/VQ numbering.
**Recommended Fix:** Use a sequence or lock, plus a unique index.
**Why further verification is needed:** Requires concurrent execution to reproduce.

---

### BUG-PROC-024 — Payment bank ID is not validated; an invalid bank silently posts to a keyword-matched cash account
**Severity:** Medium. A payment with a bank ID that is not the tenant's (or not mapped) still posts, crediting whichever account matches "bank/cash" while `Transactions.BankId` stores the invalid ID.
**Status:** Potential
**Test Area:** 4.4 Vendor Invoices / Payment, Tenant
**Description:** `RecordVendorPayment` takes `request.BankId` and calls `ResolveBank`. That function reads `BankCOAMapping` by bank ID without a tenant filter (the account is then validated for the tenant), then tries `BankMaster` filtered by tenant, and finally falls back to any active account with "bank" or "cash" in its type, name or group. The bank's location is never compared with the invoice's site. The UI only offers the working site's banks.
**Steps to Reproduce:**
1. Call `RecordVendorPayment/{id}` with a `BankId` that belongs to another tenant or does not exist.
2. Inspect the journal credit account and the `Transactions.BankId`.
**Expected:** 400 for a bank outside the tenant/site.
**Actual:** The payment posts to a fallback cash account with a mismatched `BankId`.
**Evidence:**
- Frontend: `Cimmple_UI/src/Common/Hooks/useCompanyBanks.ts` lines 30–68.
- Backend: `Cimmple_API/CimmpleAPI/Controllers/VendorInvoiceController.cs` lines 712–727 and 816; `Cimmple_API/CimmpleAPI/Services/GlAccountResolutionService.cs` lines 256–295.
- Database: `BankMaster`, `BankCOAMapping`, `Transactions.BankId`.
**Root Cause:** No explicit validation that the bank belongs to the tenant (and site) before posting.
**Business Impact:** Payments missing from the right bank's reconciliation.
**Affected Areas:** Payments, bank reconciliation.
**Recommended Fix:** Require `BankMaster` with matching tenant (and permitted location) and fail instead of keyword fallback when a bank ID is given.
**Why further verification is needed:** The impact on bank reconciliation depends on how reconciliation filters `Transactions`; this needs a data check.

---

### BUG-PROC-025 — Journals fall back to location ID 1 when the VO/invoice has no location
**Severity:** Medium. Bills and payments for VOs without a site post to location 1, which may be a different site or even another tenant's location ID.
**Status:** Potential
**Test Area:** 4.4 Vendor Invoices / GL, Location
**Description:** The invoice stores `locationId = vendorOrder.LocationId ?? 0`; the APBILL journal and the APPMT journal/`Transactions` use `locationId > 0 ? locationId : 1`.
**Steps to Reproduce:**
1. Use a VO with `LocationId` null (legacy, or saved without an active site).
2. Create an invoice and pay it.
3. Inspect `JournalEntries.locationId`.
**Expected:** The tenant's default site, or a validation error.
**Actual:** Location 1.
**Evidence:**
- Frontend: n/a.
- Backend: `Cimmple_API/CimmpleAPI/Controllers/OrderController.cs` lines 4335 and 4433; `Cimmple_API/CimmpleAPI/Controllers/VendorInvoiceController.cs` line 769; `Cimmple_API/CimmpleAPI/Services/GlWorkflowService.cs` line 177 (reversal fallback).
- Database: `JournalEntries.locationId`, `Transactions.locationId`.
**Root Cause:** Hard-coded fallback.
**Business Impact:** Site-level P&L/AP and bank recon by site misstated.
**Affected Areas:** GL by location, period close.
**Recommended Fix:** Resolve the tenant's default location or reject posting without a location.
**Why further verification is needed:** Depends on whether VOs without a location exist in production data.

---

### BUG-PROC-026 — "Credit Card" vendor payments credit the bank GL account
**Severity:** Low. Card payments are posted as bank cash-outs instead of increasing a card liability.
**Status:** Potential
**Test Area:** 4.4 Vendor Invoices / Payment
**Description:** The payment modal offers "Credit Card", but the backend always credits the resolved bank account and requires a bank.
**Steps to Reproduce:**
1. Record a payment with method Credit Card.
2. Inspect the APPMT journal.
**Expected:** Credit the card liability, if the business intends card payments to be separate.
**Actual:** Credit to Bank.
**Evidence:**
- Frontend: `Cimmple_UI/src/Modules/Purchasing/VendorInvoiceDetailModal.tsx` line 269.
- Backend: `Cimmple_API/CimmpleAPI/Controllers/VendorInvoiceController.cs` lines 786–800.
- Database: `JournalEntryTo.AccountId`.
**Root Cause:** The payment method is not used for account resolution.
**Business Impact:** Bank balance understated until the card is paid.
**Affected Areas:** Payments, bank reconciliation.
**Recommended Fix:** Map payment methods to accounts, or require the card to be set up as a "bank".
**Why further verification is needed:** The intended accounting treatment is not documented; tenants may model cards as bank accounts.

---

### BUG-PROC-027 — Vendor invoices without detail lines are missing from the Vendor Invoices list
**Severity:** Low. A header-only invoice exists in AP but is invisible on the procurement list.
**Status:** Potential
**Test Area:** 4.4 Vendor Invoices / List
**Description:** `GetAllVendorInvoices` inner-joins `VendorInvoiceMaster` with `VendorInvoiceDetail`, so masters with no detail rows are dropped.
**Steps to Reproduce:**
1. Find or create (through other modules or imports) a vendor invoice header with no lines.
2. Open Vendor Invoices.
**Expected:** Listed.
**Actual:** Not listed.
**Evidence:**
- Frontend: `Cimmple_UI/src/Modules/Purchasing/VendorInvoices.tsx` lines 480–489.
- Backend: `Cimmple_API/CimmpleAPI/Controllers/OrderController.cs` lines 4539–4551.
- Database: `VendorInvoiceMaster`, `VendorInvoiceDetail`.
**Root Cause:** Inner join.
**Business Impact:** Incomplete AP view for buyers.
**Affected Areas:** Vendor Invoices list.
**Recommended Fix:** Use a left join.
**Why further verification is needed:** The procurement UI always creates lines; header-only rows would come from other paths such as AP entry or imports.

---

### BUG-PROC-028 — Vendor quotation save is not transactional
**Severity:** Low. A failure midway can leave a header without lines or with partially replaced lines.
**Status:** Potential
**Test Area:** 4.1 Vendor Quotations / Database
**Description:** `SaveVendorQuotation` calls `SaveChanges` several times (header, details, accept-sibling updates) without a transaction. `DuplicateVendorQuotationForVendors` likewise creates children one by one.
**Steps to Reproduce:**
1. Force a failure in detail save (for example an invalid line value that throws).
2. Reload the quotation.
**Expected:** All-or-nothing.
**Actual:** The header can persist without lines.
**Evidence:**
- Frontend: `Cimmple_UI/src/Modules/Quotations/VendorQuotationSlideout.tsx` line 1495.
- Backend: `Cimmple_API/CimmpleAPI/Controllers/QuotationController.cs` lines 1821, 2019 and 2033; 2809–3070.
- Database: `VendorQuotations`, `VendorQuotationsDetails`.
**Root Cause:** No transaction.
**Business Impact:** Corrupt RFQs needing manual cleanup.
**Affected Areas:** VQ save, multi-vendor send.
**Recommended Fix:** Wrap each save in a transaction.
**Why further verification is needed:** Requires inducing a mid-save failure.

---

### BUG-PROC-029 — Deleting a VO can un-convert an unrelated quotation whose stored PONumber equals the deleted order's ID
**Severity:** Low. In rare data, a quotation converted to a different VO loses its Converted link.
**Status:** Potential
**Test Area:** 4.2 Vendor Orders / Delete
**Description:** `GetVendorQuotationsLinkedToOrderAsync` matches `convertedOrderId` against the deleted VO's `PONumber` **or** `OrderID`. `convertedOrderId` normally stores a PONumber, so a VQ converted to PONumber 57 matches when VO with OrderID 57 is deleted. It is kept Converted only if a remaining VO references it by `QuotationId`.
**Steps to Reproduce:**
1. Find a VQ with `convertedOrderId = N` whose VO has no `QuotationId`, and another VO with `OrderID = N` and no receipts or invoices.
2. Delete the latter VO.
3. Check the VQ.
**Expected:** The VQ is unchanged.
**Actual:** The VQ reverts to Sent/Responded.
**Evidence:**
- Frontend: n/a.
- Backend: `Cimmple_API/CimmpleAPI/Controllers/OrderController.cs` lines 3519–3531 and 3560–3586.
- Database: `VendorQuotations.convertedOrderId`.
**Root Cause:** A legacy fallback that matches on OrderID.
**Business Impact:** A quotation can be converted twice.
**Affected Areas:** VQ status.
**Recommended Fix:** Match only on `QuotationId`, or on PONumber for legacy rows.
**Why further verification is needed:** Depends on legacy data where the VO lacks `QuotationId`.

---

### BUG-PROC-030 — Job-tied receive lines do not require a location in the UI but fail in the API when the VO has no location
**Severity:** Low. The user gets a server error after submitting instead of an inline prompt.
**Status:** Potential
**Test Area:** 4.3 Vendor Receiving / Validation
**Description:** `willBookInventory` returns false for job-tied lines, so no location is required in the form. The backend still books (and then issues) stock for job-tied RawMaterial/FinishedProduct lines and returns 400 "Location is required to record job material…" when neither the form nor the VO has a location.
**Steps to Reproduce:**
1. Use a VO with no location and a job-linked RawMaterial line.
2. Receive without picking a location.
**Expected:** An inline prompt for a location.
**Actual:** Server error toast.
**Evidence:**
- Frontend: `Cimmple_UI/src/Modules/Purchasing/VendorReceivingDetail.tsx` lines 29–33 and 233–236.
- Backend: `Cimmple_API/CimmpleAPI/Controllers/OrderController.cs` lines 4000–4012.
- Database: `VendorOrders.LocationId`.
**Root Cause:** The UI and the backend disagree on when a location is needed.
**Business Impact:** Minor friction.
**Affected Areas:** Receiving.
**Recommended Fix:** Require a location in the UI for job-tied stock lines when the VO has none.
**Why further verification is needed:** Most VOs get the active site on save, so reachability depends on data.

---

## Needs Manual Verification

1. **Area:** 4.3 Receiving → Inventory valuation
   **What to Test:** Receive a RawMaterial line at a unit price different from the material's current cost; check the inventory transaction's cost and valuation reports.
   **Expected:** The receipt is valued at the PO line's net unit price.
   **Why Manual Testing Is Required:** `InventoryService.ReceiveStockInTransactionAsync` takes no cost parameter (lines 29–60) and `RawMaterialCatalog` sets `UnitCost` only when it is ≤ 0 (lines 53–54); whether valuation uses another cost source needs data in a running system.

2. **Area:** 4.1/4.2/4.4 PDF and email (`/Pdf/GenerateVendorQuotation|Order|Invoice`, `/DocumentEmail/SendVendor*`)
   **What to Test:** Generate and email each document; try an ID from another tenant; check letterhead, totals, tax and freight.
   **Expected:** Correct tenant branding and figures; other tenants' IDs rejected.
   **Why Manual Testing Is Required:** The PDF/email controllers were not traced in this audit; rendering needs a browser and mail server.

3. **Area:** 4.1/4.2 Attachments (header and line files)
   **What to Test:** Upload, download and delete files on VQ/VO, including large files and disallowed types, and download another tenant's file by ID.
   **Expected:** Size/type limits enforced; tenant-scoped downloads; blobs removed on delete.
   **Why Manual Testing Is Required:** The file endpoints depend on Azure storage configuration, and their code was not traced line by line.

4. **Area:** 4.1 Comparison table and 4.3 receive form on a phone
   **What to Test:** Open Compare and the receive form at 375 px width.
   **Expected:** Usable layout with horizontal scroll where needed.
   **Why Manual Testing Is Required:** Responsive behaviour needs a real browser.

5. **Area:** 10.2 Vendor Payment → Bank Reconciliation
   **What to Test:** Pay an invoice, then open bank reconciliation for that bank and period.
   **Expected:** The payment appears once, reconciles, and is blocked in a closed period.
   **Why Manual Testing Is Required:** Depends on reconciliation queries over `Transactions` and on BUG-PROC-006/024 interaction with real data.

6. **Area:** 4.4 Approval limits
   **What to Test:** Configure `ApApprovalLimits` for a role, then approve invoices above and below the limit as that role and as a role with no limit row.
   **Expected:** Above-limit approval is rejected; behaviour without a limit row matches the business rule.
   **Why Manual Testing Is Required:** The code enforces a limit only when a row exists (`VendorInvoiceController.cs` 612–677); the intended default needs product confirmation and a real role setup.

7. **Area:** Global error handling for procurement API failures
   **What to Test:** Trigger 400/403/500 responses on save, receive, invoice and pay.
   **Expected:** One clear toast with the server message, with no duplicates.
   **Why Manual Testing Is Required:** The Axios interceptor behaviour combined with per-screen toasts needs runtime observation.

8. **Area:** 4.3 Lots on receipt
   **What to Test:** Receive with a lot number, then check `InventoryLot` and `InventoryLotBalance`.
   **Expected:** A lot is created or incremented at the receiving location.
   **Why Manual Testing Is Required:** Lot creation is inside `InventoryService` (Inventory module scope) and needs data to observe.

9. **Area:** 4.1 Accept response → sibling rejection
   **What to Test:** Accept one vendor response in a multi-vendor RFQ and check the other children.
   **Expected:** The other responses become Rejected unless already Accepted/Converted.
   **Why Manual Testing Is Required:** The code path is in `SaveVendorQuotation` (2037–2091), but which UI action sends the "Accepted" status for a child needs click-through confirmation.

## No Issues Found

- Receiving quantity limit: the API rejects totals above the ordered quantity (`OrderController.cs` 3850–3854), and the UI blocks quantities above pending (`VendorReceivingDetail.tsx` 228–231).
- `ReceiveLineItem` runs in a database transaction and rolls back the receipt when the inventory receive or job issue fails (`OrderController.cs` 3804, 4026–4031, 4053–4057).
- Single-line invoice validation: quantity must be > 0 and ≤ received − invoiced (`OrderController.cs` 4278–4287), and the modal clamps quantities (`VendorInvoiceModal.tsx` 178–186).
- The APBILL journal is balanced: debit expense per GL code, input tax and freight-in, credit AP for the gross total (`OrderController.cs` 4440–4485).
- Invoice creation checks the period lock, the tax rate range (0–100) and the input-tax and freight-in account configuration before posting (`OrderController.cs` 4263–4267, 4303–4329).
- Payment preconditions: void invoices, unapproved invoices, zero amounts and over-payment are rejected, and a bank is required (`VendorInvoiceController.cs` 694–719).
- Void is blocked once paid; void reverses the APBILL journal and invoiced quantities; delete is blocked for paid or void invoices (`VendorInvoiceController.cs` 878–905, 934–963).
- VO delete is blocked by invoices, receiving or invoicing history, and linked quotations revert (`OrderController.cs` 3430–3450).
- VQ delete is blocked when converted or referenced (`QuotationController.cs` 2232–2300).
- VQ numbers start at 1000 (`QuotationController.cs` 1644). Multi-vendor send skips vendors with an existing copy and zeroes child prices (2893–2901, 3016–3018).
- Both convert paths reject an already-converted quotation (`OrderController.cs` 2317–2332; `QuotationController.cs` 2654–2664).
- Invoiced VO lines are locked in both UI and API (`VendorOrderSlideout.tsx` 792–863; `OrderController.cs` 2509–2550).
- List endpoints apply the site filter (VQ `QuotationController.cs` 1018, VO `OrderController.cs` 1874, receiving 3593, invoices 4521), and VO/VQ get-by-ID check location (`OrderController.cs` 2050–2054; `QuotationController.cs` 1301–1307).
- `VendorInvoice/GetVendorInvoiceById` is tenant-filtered (`VendorInvoiceController.cs` 176–242).
- Form validation: vendor, date, due date not before order/quotation date, and at least one filled line, for VO (`VendorOrderSlideout.tsx` 1323–1347) and VQ (`VendorQuotationSlideout.tsx` 1439–1459).
- Save and pay buttons are disabled while a request is in flight (`VendorOrderSlideout.tsx` 2703 and 2711; `VendorInvoiceModal.tsx` 694; `VendorInvoiceDetailModal.tsx` 410).
- The Pay action is shown only for approved invoices, consistent with the backend rule (`VendorInvoiceDetailModal.tsx` 1037–1064).
- Receiving has no edit or delete endpoint, matching the matrix "Not available (no undo)".

## QA Coverage

| Test Area | Tested | Result |
| --- | --- | --- |
| Navigation | Yes | Fail (BUG-PROC-017) |
| CRUD | Yes | Fail (BUG-PROC-004, BUG-PROC-011, BUG-PROC-018) |
| Search | Yes | Fail (BUG-PROC-013, BUG-PROC-017) |
| Filters | Yes | Fail (BUG-PROC-017, BUG-PROC-018, BUG-PROC-019) |
| Sorting | Yes | Pass |
| Pagination | Yes | Pass |
| Validation | Yes | Fail (BUG-PROC-007, BUG-PROC-020, BUG-PROC-021); Potential (BUG-PROC-030) |
| Permissions | Partial | Manual (role enforcement is a cross-module concern; approval limits in Manual item 6) |
| API | Yes | Fail (BUG-PROC-001, BUG-PROC-002, BUG-PROC-008, BUG-PROC-015) |
| Database | Yes | Fail (BUG-PROC-004, BUG-PROC-011); Potential (BUG-PROC-023, BUG-PROC-028) |
| Business Logic | Yes | Fail (BUG-PROC-003, BUG-PROC-005, BUG-PROC-006, BUG-PROC-010, BUG-PROC-012, BUG-PROC-014); Potential (BUG-PROC-022, BUG-PROC-026) |
| Location | Yes | Fail (BUG-PROC-009); Potential (BUG-PROC-025) |
| Tenant | Yes | Fail (BUG-PROC-001, BUG-PROC-002, BUG-PROC-008); Potential (BUG-PROC-024) |
| Cross-Module | Yes | Fail (BUG-PROC-003, BUG-PROC-005, BUG-PROC-006); Manual (items 1, 5) |
| Responsive/PWA | No | Manual (item 4) |

## Matrix Checklist

### 4.1 Vendor Quotations (VQ / RFQ)

| Matrix Row | Result | Notes |
| --- | --- | --- |
| Frontend — List (`VendorQuotations.tsx`, GET `GetVendorQuotations`) | Pass | Loads by tenant and site filter; masters only. |
| Frontend — Search (VQ#, vendor) | Pass | `matchDisplayDocNumber` for VQ#/VO#, vendor name/code, amount, date (lines 346–360). |
| Frontend — Filter (status, date, site) | Fail (BUG-PROC-019) | Status and site filters exist; no date filter (date matched only through search text); converted masters show Sent. |
| Frontend — Sort / Pagination | Pass | `MasterListPage` client sort and pagination. |
| Frontend — Add (slideout, order type, lines, line files) | Pass | Save validates vendor, date, due date and lines (1439–1459). |
| Frontend — Edit / View (`?open={id}`) | Pass | `?open` handled (lines 31–43); backend location check on get-by-ID. Tenant gap in BUG-PROC-008. |
| Frontend — Multi-vendor RFQ | Pass | Requires a saved quotation and at least one line (1184–1188); backend skips vendors with an existing copy. |
| Frontend — Compare (`GetVendorQuotationComparison`, `GetVendorQuotationsByVendorCode`) | Fail (BUG-PROC-005, BUG-PROC-008) | Compare uses `GetVendorQuotationComparison`; `GetVendorQuotationsByVendorCode` is used by the vendor portal and leaks across tenants for ERP callers. |
| Frontend — Convert to VO (both paths) | Fail (BUG-PROC-002, BUG-PROC-005) | Already-converted guard works on both paths; convert endpoint lacks tenant check; Create Orders corrupts the job field. |
| Frontend — Attachments | Manual | Item 3. |
| Frontend — PDF / Email | Manual | Item 2. |
| Frontend — Delete (`DeletionImpactDialog`) | Pass | Backend blocks converted or referenced quotations. |
| Frontend — Validation (vendor, date, ≥1 line, qty > 0) | Fail (BUG-PROC-020) | UI checks vendor, date and lines; qty > 0 not enforced server-side. |
| Frontend — Permissions / Responsive | Manual | Role enforcement is a cross-module concern (b); responsive is item 4. |
| Backend — List/Get | Fail (BUG-PROC-008) | By-vendor-code and by-ID tenant gaps. |
| Backend — Create/Update (VQ# from 1000) | Fail (BUG-PROC-008, BUG-PROC-020) | Numbering correct; optional tenant filter on update; no qty/price validation. Potential BUG-PROC-028. |
| Backend — Multi-vendor (child prices zeroed; skip existing) | Pass | Lines 2893–2901, 2943–2947, 3016–3018. Potential BUG-PROC-028. |
| Backend — Compare | Pass | Tenant comes from the query (cross-module concern a). |
| Backend — Convert | Fail (BUG-PROC-002) | No tenant or location check. |
| Backend — Delete (blocked if converted/referenced; master deletes children) | Pass | Lines 2232–2300. |
| Backend — Authorization (authenticated) | Pass | Global fallback policy; roles are cross-module concern (b). |
| Business Logic — Accepting one vendor's response rejects its siblings | Manual | Code in `SaveVendorQuotation` 2037–2091 rejects siblings except Accepted/Converted; UI trigger in item 9. |
| Business Logic — Flags `IsResponseOnly`, `isSent`, `VendorOrderType` | Pass | List shows masters only; by-vendor-code uses `isSent`; `VendorOrderType` maps to the category column. |

### 4.2 Vendor Orders (VO / PO)

| Matrix Row | Result | Notes |
| --- | --- | --- |
| Frontend — List (`VendorOrders.tsx`) | Fail (BUG-PROC-013) | Loads with site filter; display number collision after 999. |
| Frontend — Search / Filter (VO#, vendor; status, date, site) | Fail (BUG-PROC-018) | Search and `?search` seed work; no date filter; Cancelled never matches. |
| Frontend — Sort / Pagination | Pass | Client-side. |
| Frontend — Add (line types, job link, GL code) | Pass | Line types normalized server-side; product/raw material linked on save. |
| Frontend — Edit / View (invoiced lines locked; comments) | Fail (BUG-PROC-004, BUG-PROC-010, BUG-PROC-011) | Invoiced lines locked; received lines not protected; Draft resets status; partial save on error. |
| Frontend — Invoice (`VendorInvoiceModal`) | Fail (BUG-PROC-003, BUG-PROC-007) | UI path validates quantity; duplicate invoice numbers accepted; API over-invoicing. |
| Frontend — Attachments | Manual | Item 3. |
| Frontend — PDF / Email | Manual | Item 2. |
| Frontend — Delete (`DeletionImpactDialog`) | Pass | Blocked by invoices and receiving; quote reverts. Potential BUG-PROC-029. |
| Frontend — Validation (vendor, ≥1 line, qty > 0, price ≥ 0) | Fail (BUG-PROC-020) | UI checks vendor/lines and clamps qty; no server-side range checks. |
| Frontend — Permissions / Responsive | Manual | Cross-module concern (b); item 4. |
| Backend — List/Get | Pass | Site filter and get-by-ID location check (2050–2054); tenant from query is cross-module concern (a). OrderID/PONumber fallback relates to BUG-PROC-013. |
| Backend — Create/Update (auto-links product / raw material) | Fail (BUG-PROC-004, BUG-PROC-011, BUG-PROC-020) | Linking works (3139–3200); see bugs. Potential BUG-PROC-023. |
| Backend — Delete (blocked by invoices/receiving; quote reverts) | Pass | 3413–3513. Potential BUG-PROC-029. |
| Backend — Status (`DeriveVendorReceiveStatus`) | Fail (BUG-PROC-010, BUG-PROC-018) | Derivation correct for Sent/Partially/Fully Received; Draft override; Completed/Cancelled unreachable. |
| Backend — Authorization | Pass | Authenticated only; roles are cross-module concern (b). |
| Business Logic — Statuses list | Fail (BUG-PROC-018) | Cancelled and Completed have no transition. |
| Business Logic — No tax or freight on the PO | Pass | VO has no tax/freight fields; they are added in `CreateVendorInvoice` (4303–4329). |
| Business Logic — Per line `ReceivedQty`, `InvoicedQty`, `JobId` | Fail (BUG-PROC-004, BUG-PROC-005) | Received rows can be cascade-deleted; Compare sets a bogus job; UI always sends `JobId` 0. |

### 4.3 Vendor Receiving

| Matrix Row | Result | Notes |
| --- | --- | --- |
| Frontend — List (`VendorReceiving.tsx`, `GetOrdersForReceiving`) | Fail (BUG-PROC-010) | Draft excluded, so Draft-reset VOs disappear. |
| Frontend — Search / Filter / Sort / Pagination | Pass | VO# and vendor search; `?open` handled. |
| Frontend — Receive (per line qty, location) | Fail (BUG-PROC-009, BUG-PROC-012) | Location list unscoped; batch retry double-receives. |
| Frontend — History (`GetReceivingHistory`) | Pass | Tenant from query is cross-module concern (a). |
| Frontend — Recalculate (`RecalculateVendorOrderStatuses`) | Pass | Recomputes non-Draft statuses (4083–4134). |
| Frontend — Edit / Delete (not available) | Pass | No endpoint exists, as documented. |
| Frontend — Validation (qty ≤ pending; location for stock lines) | Pass | Client and server both enforce. Potential BUG-PROC-030 for job-tied lines. |
| Frontend — Permissions / Responsive | Manual | Cross-module concern (b); item 4. |
| Backend — List/Get | Fail (BUG-PROC-009) | `GetOrderForReceiving` has no location check. |
| Backend — Create (`ReceiveLineItem`, transaction) | Fail (BUG-PROC-021) | Transactional; no VO status check. Potential BUG-PROC-022. |
| Backend — Validation (qty limits; location not checked with `CanAccessLocation`) | Fail (BUG-PROC-009) | Qty limit OK; location unchecked, as the matrix notes. |
| Backend — Authorization | Pass | Authenticated only; cross-module concern (b). |
| Business Logic — RawMaterial/FinishedProduct book stock with reference "VendorReceiving" | Pass | 4000–4031. Valuation is Manual item 1. |
| Business Logic — Job-linked lines auto-issued to the JO | Fail (BUG-PROC-005) | Works for real job links; Compare-created lines are falsely job-linked and resolved by digit parsing. |
| Business Logic — `ReceivedQty` is an int | Pass | `GetInt32` on input (3810); fractional input from a crafted request fails parsing. |

### 4.4 Vendor Invoices (incl. vendor payments)

| Matrix Row | Result | Notes |
| --- | --- | --- |
| Frontend — List (`VendorInvoices.tsx`, `GetAllVendorInvoices`) | Pass | Site filter applied. Potential BUG-PROC-027. |
| Frontend — Search / Filter (status, date, vendor) | Fail (BUG-PROC-017) | `?search` ignored; Custom range unreachable. |
| Frontend — Sort / Pagination | Pass | Client-side. |
| Frontend — Add (from VO, tax, freight, invoice no.) | Fail (BUG-PROC-003) | Duplicate invoice numbers accepted. |
| Frontend — View (`GetVendorInvoiceDetails/{id}`) | Fail (BUG-PROC-001) | No tenant filter. |
| Frontend — Approve (approval limit) | Fail (BUG-PROC-016) | Not on this page; available in Accounts Payable. Limits in Manual item 6. |
| Frontend — Pay (requires approval) | Fail (BUG-PROC-006) | Gating correct; period wrong. Potential BUG-PROC-022, 024, 026. |
| Frontend — Void | Fail (BUG-PROC-003, BUG-PROC-016) | Wrong journal can be reversed; hidden for Overdue. |
| Frontend — PDF / Email | Manual | Item 2. |
| Frontend — Delete (confirm) | Fail (BUG-PROC-003) | Same reference collision as void. |
| Frontend — Validation (qty ≤ received − invoiced; amounts ≥ 0) | Fail (BUG-PROC-007) | UI path correct; API bypass through duplicate lines. |
| Frontend — Permissions / Responsive | Manual | Cross-module concern (b); item 4. |
| Backend — List | Pass | Site filter (4521); tenant from query is cross-module concern (a). Potential BUG-PROC-027. |
| Backend — Get (verify tenant filter; `GetVendorInvoiceById`) | Fail (BUG-PROC-001) | `GetVendorInvoiceById` passes; `GetVendorInvoiceDetails` fails. |
| Backend — Create (UI path and second implementation) | Fail (BUG-PROC-003, BUG-PROC-007, BUG-PROC-015) | See bugs. |
| Backend — Update (not used by UI) | Fail (BUG-PROC-015) | Drops tax and freight from the total. |
| Backend — Approve (`ApApprovalLimits`) | Manual | Item 6. |
| Backend — Payment (`APPMT-`, audit `VendorPaymentAutoPost`) | Fail (BUG-PROC-006) | Audit row written (822); period wrong. Potential BUG-PROC-022, 024, 025. |
| Backend — Void/Delete (blocked if paid; GL reversal) | Fail (BUG-PROC-003, BUG-PROC-014) | Reversal by non-unique reference; no payment reversal path. |
| Backend — Validation (period open; invoice number uniqueness not checked) | Fail (BUG-PROC-003) | Period checked on create; uniqueness not checked (as the matrix notes), which causes the reference collision. |
| Backend — Authorization | Pass | Authenticated only; cross-module concern (b). |
| Business Logic — GL on bill: Dr expense/input tax/freight-in, Cr AP | Pass | 4440–4485. |
| Business Logic — Payment: Dr AP, Cr Bank | Fail (BUG-PROC-006) | Accounts correct; period wrong. Potential BUG-PROC-024, 026. |
| Business Logic — `isPaid` 0/1/2, partial payments, `Approved` flag | Fail (BUG-PROC-014) | Values and partial payments handled; no reversal path. Potential BUG-PROC-022. |

### 10.2 Procurement workflow

| Matrix Row | Result | Notes |
| --- | --- | --- |
| Vendor → Vendor Quote (multi-vendor RFQ creates child copies; vendor delete blocked) | Pass | Child copies created with `ParentQuotationID`; vendor-delete blocking belongs to the Vendor master audit. |
| Vendor Quote → Vendor Order (both convert paths; accepted sibling rejection; VO delete reverts quote) | Fail (BUG-PROC-002, BUG-PROC-005) | Both paths guard double conversion; sibling rejection on accept is Manual item 9; delete revert works (Potential BUG-PROC-029). |
| Vendor Order → Receiving (qty ≤ pending; stock lines need location; status derivation; job-linked auto-issue) | Fail (BUG-PROC-005, BUG-PROC-009, BUG-PROC-010, BUG-PROC-021) | Qty limit and location requirement pass. |
| Receiving → Inventory (balance and lot increase; raw material/product auto-created) | Fail (BUG-PROC-004, BUG-PROC-005) | Balance increase correct for stock lines; cost is Manual item 1; lots are Manual item 8. |
| Receiving → Vendor Invoice (qty limit; invoiced lines locked; GL `APBILL-`) | Fail (BUG-PROC-003, BUG-PROC-007) | Single-line limit and locking pass. |
| Vendor Invoice → Vendor Payment (approval gate; limits; partial pay; `APPMT-`; void blocked after payment) | Fail (BUG-PROC-006, BUG-PROC-014) | Approval gate, partial pay and void block pass; limits are Manual item 6. |
| Vendor Payment → Bank Reconciliation (appears in bank; reconciles; closed period rejects) | Manual | Item 5; closed-period logic affected by BUG-PROC-006. |

## Cross-Module Concerns

| Concern | Owner file | Affected procurement endpoints |
| --- | --- | --- |
| (a) Client-supplied `tenantId` trusted without comparing to the token tenant | QA_TenantLocationFramework.md | `Order/GetVendorOrders`, `Order/SaveVendorOrder` (body `Tenantid`), `Order/CheckVendorOrderDeletionImpact`, `Order/DeleteVendorOrder`, `Order/GetOrdersForReceiving`, `Order/GetOrderForReceiving`, `Order/ReceiveLineItem` (body `tenantid`), `Order/RecalculateVendorOrderStatuses`, `Order/GetReceivingHistory`, `Order/GetAllVendorInvoices`, `Quotation/GetVendorQuotations`, `Quotation/SaveVendorQuotation` (body `Tenantid`, when > 0), `Quotation/DuplicateVendorQuotationForVendors`, `Quotation/GetVendorQuotationComparison`, `Quotation/CheckVendorQuotationDeletionImpact`, `Quotation/DeleteVendorQuotation` |
| (b) No server-side role-permission enforcement | QA_RolesPermissions.md | All procurement endpoints, notably `VendorInvoice/ApproveVendorInvoice`, `VendorInvoice/RecordVendorPayment`, `VendorInvoice/VoidVendorInvoice`, `VendorInvoice/DeleteVendorInvoice`, `Order/DeleteVendorOrder`, `Quotation/DeleteVendorQuotation` |
| (c) Vendor-portal token access / portal quotation submission | QA_VendorPortal.md | `Quotation/GetVendorQuotationsByVendorCode` (portal branch), `Quotation/GetVendorQuotationById` (portal branch), `Quotation/SaveVendorQuotation` → `SaveVendorPortalQuotationResponse` |
