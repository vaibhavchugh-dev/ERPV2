# QA — Sales (Customer Quotations, Orders, Shipments, Invoices & Payments)

| Module | Matrix section | Bug ID prefix | Tested | Confirmed Bugs | Potential Bugs | Manual Verification |
| --- | --- | --- | --- | --- | --- | --- |
| Sales (Customer Quotations, Orders, Shipments, Invoices & Payments) | 3.1–3.4 | BUG-SALES | Yes | 27 (+2 duplicates: SALES-001, SALES-002) | 7 | 10 |

Source of test cases: `QA_TEST_MATRIX.md`. Method: static trace of the actual implementation (React UI → service → Axios → .NET controller → service/repository → EF Core → SQL Server, and back). No application code, configuration or database is changed during QA. Findings that depend on deployed configuration, data or a real browser go under **Needs Manual Verification**.

Severity scale:
- **Critical**: security breach, data corruption, financial corruption, or a blocked core workflow.
- **High**: a major feature is broken or a significant security control is bypassed, with a workaround that is hard or unavailable.
- **Medium**: a feature works incorrectly in specific conditions, or a security control is weaker than configured.
- **Low**: cosmetic, minor UX, or an informational/hardening issue.

---

## Confirmed Bugs

### BUG-SALES-001 — Invoice accounting period is stamped from the server clock, not the invoice date

> **Duplicate of BUG-ACC-002** (`QA_Accounting.md`). The root cause is the period-control logic, which is tracked in Accounting. This entry is kept for traceability and is not counted in this module's totals.
**Severity:** Critical. A backdated invoice is posted into the current (open) period even when its own month is closed, which bypasses the period lock and misstates period revenue and AR.
**Status:** Confirmed
**Test Area:** 3.4 Customer Invoices / Business logic (accounting period stamped; period lock)
**Description:** `CreateInvoice` sets `InvoiceMaster.AccountingPeriod` to the current server year and month, not the month of `InvoiceDate`. The period-lock check and the journal entry's `AccountingPeriod` both use that value. The journal entry's `EntryDate`, however, is the invoice date. An invoice dated in a closed month is therefore accepted (the lock check runs against the current month), and its GL entry carries an `EntryDate` inside the closed month. The error text "choose a different invoice date" implies the check is meant to be driven by the invoice date. `PrefixInvoiceNo` also takes its year from `DateTime.Now`, so an invoice dated 2025 created in 2026 is numbered `INV-2026-####`.
**Steps to Reproduce:**
1. Close accounting period 2026-08 (Period Close).
2. In September 2026, open a customer order with shipped lines, click Invoice, and set Invoice Date to 2026-08-15.
3. Submit.
**Expected:** The request is rejected with "Accounting period 202608 is closed. Open the period or choose a different invoice date."
**Actual:** The invoice is created with `AccountingPeriod = 202609`, and the `ARINV-` journal entry gets `EntryDate = 2026-08-15` and `AccountingPeriod = 202609`. GL reports that filter by `EntryDate` (P&L, account balances) now show new revenue and AR inside the closed August period.
**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Orders/InvoiceModal.tsx` lines 26-31 (invoice date is user-editable), 135-209 (submits `invoiceDate`).
* Backend: `Cimmple_API/CimmpleAPI/Controllers/InvoiceController.cs` line 220 (`PrefixInvoiceNo = $"INV-{DateTime.Now.Year}-..."`), line 224 (`AccountingPeriod = $"{DateTime.Now.Year}{DateTime.Now.Month:D2}"`), lines 302-308 (lock check uses `invoice.AccountingPeriod`), lines 314-319 (`EntryDate = invoice.InvoiceDate.Date`, `AccountingPeriod = invoicePeriodKey`). `Services/GlWorkflowService.cs` lines 33-35 (`IsPeriodLocked` by period key). `Services/ProfitLossGlReportService.cs` lines 68-69 and `Services/GlAccountBalanceService.cs` line 39 (reports filter by `EntryDate`).
* Database: `InvoiceMaster.AccountingPeriod`, `InvoiceMaster.PrefixInvoiceNo`, `JournalEntries.EntryDate`, `JournalEntries.AccountingPeriod`, `GlAccountingPeriodLocks`.
**Root Cause:** The period key and the number prefix are derived from `DateTime.Now` instead of `invoiceDate`.
**Business Impact:** Closed periods can be changed after close, so financial statements already reported for a closed month no longer tie out. Invoice numbers show the wrong year.
**Affected Areas:** Customer invoice creation, GL period close, P&L / balance sheet / AR aging by period, invoice numbering.
**Recommended Fix:** Derive `AccountingPeriod` (and the prefix year) from the invoice date, for example with `GlWorkflowService.PeriodKeyFromDate(invoiceDate)`, so that the lock check, the stored period and the journal `EntryDate` all refer to the same month.

---

### BUG-SALES-002 — Customer payment period lock and posting use the invoice's period instead of the payment date

> **Duplicate of BUG-ACC-001** (`QA_Accounting.md`), which covers both customer and vendor payments. This entry is kept for traceability and is not counted in this module's totals.
**Severity:** Critical. Payments dated in a closed month are posted into that month, and payments on invoices from a closed month are blocked even when the payment date is in an open period. Both corrupt period financials or block cash application.
**Status:** Confirmed
**Test Area:** 3.4 Customer Invoices / Record payment; 10.4 Period Close → posting modules
**Description:** `RecordCustomerPayment` builds `periodKey` from `invoice.AccountingPeriod` and uses the payment date only when that is empty. The lock check, the payment journal's `AccountingPeriod`, and the error message ("pick another payment date") all rely on this key. The journal `EntryDate` is the payment date. Two consequences follow. (a) An invoice stamped in a now-closed month can never receive a payment, even one dated today; the error tells the user to change the payment date, which does not help. (b) A payment dated inside a closed month, on an invoice whose period is open, is accepted and posted with `EntryDate` in the closed month.
**Steps to Reproduce:**
1. Create an invoice in August 2026 (`AccountingPeriod = 202608`). Close period 202608.
2. In September, record a payment dated 2026-09-10.
3. Separately, on an invoice with `AccountingPeriod = 202609`, record a payment dated 2026-08-20 while 202608 is closed.
**Expected:** Step 2 succeeds, because the payment is in an open period. Step 3 is rejected because August is closed.
**Actual:** Step 2 is rejected with "Accounting period 202608 is closed. Open the period or pick another payment date." Step 3 succeeds. The `ARPMT-` journal (Dr Bank / Cr AR) is dated 2026-08-20 inside the closed period, and the `Transactions` row is dated in August too.
**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Orders/CustomerInvoices.tsx` lines 26-66 (payment modal with editable payment date); `Cimmple_UI/src/Modules/Orders/CustomerInvoiceDetailModal.tsx` lines 25-91; `Cimmple_UI/src/Modules/Accounting/AccountsReceivable.tsx` lines 58-105.
* Backend: `Cimmple_API/CimmpleAPI/Controllers/InvoiceController.cs` lines 1086 (`paymentDate`), 1119-1129 (period key from `invoice.AccountingPeriod`; lock check; message), 1166-1171 (`EntryDate = paymentDate.Date`, `AccountingPeriod = periodKey`), 1197-1214 (`Transactions` row).
* Database: `InvoiceMaster.AccountingPeriod`, `JournalEntries`, `Transactions`, `GlAccountingPeriodLocks`.
**Root Cause:** The payment's period is taken from the invoice document instead of the payment date.
**Business Impact:** Cash application is blocked for invoices from closed months, which hurts AR collection and AR aging. Payments can also be posted into closed months, which breaks bank reconciliation and period close.
**Affected Areas:** Record payment (invoice list, invoice detail, AR bulk payment), GL, Bank Reconciliation, Period Close.
**Recommended Fix:** Always compute the payment period key from the payment date, and use that key for both the lock check and the journal's `AccountingPeriod`.

---

### BUG-SALES-003 — Removing a shipped/invoiced line from an order deletes its shipment records without reversing inventory or checking invoices
**Severity:** Critical. Saving an order edit silently destroys shipment history, leaves finished-goods issues un-reversed, and orphans posted invoice lines, which corrupts both data and financial documents.
**Status:** Confirmed
**Test Area:** 3.2 Customer Orders / Edit; 3.3 Customer Shipments / Delete (reverses FG issue)
**Description:** In `SaveOrder`, any existing order line missing from the request is deleted. Before that, the code hard-deletes all `ShippingDetails` rows for those lines. It does not call the FG reversal that `DeleteShipment` performs, does not check whether the line was invoiced, and does not check for a linked Job Order. The UI only disables the line delete button when a Job Order exists, so a shipped (and invoiced) line with no JO can be removed with a plain confirm. After the save: (a) the `ShippingDetails` rows are gone, but the `InventoryTransaction` FG issue remains, so stock stays reduced with no source document; (b) the `Shipping` header may remain with no lines; (c) `InvoiceDetail` rows still point to the deleted `OrderDetailID`. `GetInvoiceDetails` and the invoice PDF inner-join to `CustomerOrderDetails`, so the line disappears from the invoice view while `InvoiceMaster.TotalAmount` and the `ARINV-` journal still include it. The writes span several `SaveChanges` calls with no transaction.
**Steps to Reproduce:**
1. Create an order with two lines without Job Orders. Ship and invoice line 2.
2. Open the order, delete line 2 (only "Are you sure you want to delete this line item?" is shown), and click Save.
3. Open the shipment and the invoice.
**Expected:** Removing a shipped or invoiced line is blocked (as `DeleteOrder` blocks orders with shipments/invoices), or the shipment is reversed through the normal shipment-delete path.
**Actual:** The line and its shipment lines are deleted. The FG issue is not reversed. The invoice detail no longer lists the line, but the invoice total and GL still include it.
**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Orders/CustomerOrderSlideout.tsx` lines 758-812 (`handleDeleteDetail`, JO-only warning), 2520-2533 (delete button disabled only when a JO exists).
* Backend: `Cimmple_API/CimmpleAPI/Controllers/OrderController.cs` lines 677-705 (lines missing from the request; `ShippingDetails.RemoveRange` + `SaveChanges`; `CustomerOrderDetails.RemoveRange`), lines 641, 791, 816 (separate `SaveChanges`, no transaction). Compare `Controllers/ShippingController.cs` lines 645-673 (`DeleteShipment` reverses the FG issue). `Controllers/InvoiceController.cs` lines 397-488 (`GetInvoiceDetails` joins order details).
* Database: `ShippingDetails`, `Shipping`, `CustomerOrderDetails`, `InvoiceDetail.OrderDetailID`, `InventoryTransaction`, `InventoryBalance`.
**Root Cause:** The line-removal path reimplements shipment deletion as a raw row delete, with none of the guards or inventory reversal used by the shipment and order delete endpoints.
**Business Impact:** FG inventory is permanently understated, shipment history is lost, and invoices sent to customers no longer match their stored line detail.
**Affected Areas:** Customer Orders edit, Shipments, Inventory (FG), Customer Invoices, invoice PDFs, AR.
**Recommended Fix:** Reject removal of order lines that have shipments, invoices or a Job Order, both in the UI and in `SaveOrder`. If removal must be supported, route it through the shipment-delete logic (FG reversal) inside a single transaction.

---

### BUG-SALES-004 — Voided invoices still count as invoiced, so their quantity can never be re-invoiced
**Severity:** High. The matrix explicitly requires that a voided invoice frees its quantity. Today, voiding to correct a mistake leaves the shipped quantity un-billable, and there is no workaround because a voided invoice cannot be deleted.
**Status:** Confirmed
**Test Area:** 3.4 Customer Invoices / Business logic (voided invoices free quantity); 10.1 Shipment → Customer Invoice
**Description:** `VoidInvoiceCore` sets `IsVoided = true` and reduces the `CustomerOrderDetails.InvoicedQty` column, but keeps the `InvoiceDetail` rows. Every place that decides how much is still invoiceable sums `InvoiceDetail.QtyInvoiced` without filtering on `InvoiceMaster.IsVoided`: `GetInvoiceableItems`, the `CreateInvoice` validation (`GetInvoicedQtyForOrderDetail`), `UpdateOrderInvoiceStatus`, `GetOrderById` and the status recomputation in `GetOrders`. Only `DeleteOrder` excludes voided invoices, so the code is internally inconsistent.
**Steps to Reproduce:**
1. Ship 10 units on an order line and invoice all 10.
2. Void the invoice.
3. Open Invoice from the order again.
**Expected:** 10 units are available to invoice, and the order status returns to the shipped state.
**Actual:** The Invoice modal shows 0 available (the line is filtered out). A direct `CreateInvoice` call is rejected with "Only 0 available to invoice (shipped: 10, already invoiced: 10)". The order stays "Fully Invoiced".
**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Orders/InvoiceModal.tsx` lines 135-209 (only lines with available qty can be submitted).
* Backend: `Cimmple_API/CimmpleAPI/Controllers/InvoiceController.cs` lines 37-46 and 68-70 (`GetInvoiceableItems` sums all invoice details), 126-131 (validation), 1005-1018 (`GetInvoicedQtyForOrderDetail`, no `IsVoided` filter), 1031-1059 (`UpdateOrderInvoiceStatus`), 855-877 (void keeps rows). `Controllers/OrderController.cs` lines 118-126 (`GetOrders`), 327-335 (`GetOrderById`), 1614-1618 (`DeleteOrder` excludes voided invoices).
* Database: `InvoiceDetail.QtyInvoiced`, `InvoiceMaster.IsVoided`, `CustomerOrderDetails.InvoicedQty`, `CustomerOrder.Status`.
**Root Cause:** Invoiced-quantity aggregation ignores the void flag.
**Business Impact:** Shipped goods cannot be billed after an invoice is voided (for example to fix a price or tax error), which causes lost revenue. Order statuses and sales reports overstate invoicing.
**Affected Areas:** Invoice modal, CreateInvoice, order list/detail status, Customer Orders, sales reports.
**Recommended Fix:** Exclude voided invoices (`InvoiceMaster.IsVoided = false`) from every invoiced-quantity aggregation, consistent with `DeleteOrder`.

---

### BUG-SALES-005 — Amount-type line discount is applied in full again on every partial invoice
**Severity:** High. With default values, each partial invoice of an amount-discounted line gives the full line discount again, so invoices, revenue and AR are understated.
**Status:** Confirmed
**Test Area:** 3.4 Customer Invoices / Add (shared rule: line net = Qty × UnitPrice − discount)
**Description:** `GetInvoiceableItems` returns the order line's `Discount` as-is. For `DiscountType = "Amount"` this is a fixed currency amount for the whole order line. `InvoiceModal` pre-fills that value for every invoice, and `ComputeLineNet` subtracts it from each partial invoice's quantity × price (capped at that subtotal). Splitting a line across invoices therefore multiplies the discount.
**Steps to Reproduce:**
1. Create an order line: Qty 10, UnitPrice 100, Discount 100 (Amount). The order line net is 900.
2. Ship and invoice 5 units, then ship and invoice the remaining 5 with the default values.
**Expected:** The total invoiced for the line is 900 (the discount is allocated or applied once).
**Actual:** Each invoice is 5 × 100 − 100 = 400, so 800 is invoiced in total. Revenue and AR are 100 lower.
**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Orders/InvoiceModal.tsx` lines 63-82 (discount initialised from `item.discount`), 108-119 (`calculateLineTotal`), 146-147 (submits discount and type).
* Backend: `Cimmple_API/CimmpleAPI/Controllers/InvoiceController.cs` lines 84-86 (returns `d.Discount`), 142-151 and 247-249 (`ComputeLineNet` per invoice), 1317-1328 (`ComputeLineNet`).
* Database: `CustomerOrderDetails.Discount`/`DiscountType`, `InvoiceDetail.discount`/`Amount`, `InvoiceMaster.Amount`/`TotalAmount`.
**Root Cause:** The order-line discount amount is not prorated by the invoiced quantity, and is not reduced by the discount already invoiced.
**Business Impact:** Customers are under-billed on partially invoiced lines, and revenue is understated.
**Affected Areas:** Invoice modal, CreateInvoice, invoice PDF, GL revenue, AR.
**Recommended Fix:** For amount discounts, compute the remaining discount (order discount minus discount already invoiced on non-voided invoices) or prorate by quantity. Return that value from `GetInvoiceableItems`, and enforce it server-side.

---

### BUG-SALES-006 — Duplicate invoice numbers when the invoice date is in a different year; voiding can then reverse the wrong journal
**Severity:** High. Two invoices can share `INV-yyyy-####` and the `ARINV-` journal reference, and void/delete reverses journals by that reference.
**Status:** Confirmed
**Test Area:** 3.4 Customer Invoices / Backend Create (INV-yyyy-####); 11.3 number sequences per tenant
**Description:** `GenerateInvoiceNumber` takes the maximum `InvoiceNo` only among invoices whose `InvoiceDate.Year` equals the current year, while the prefix year always comes from `DateTime.Now` (see BUG-SALES-001). An invoice backdated into the previous year is not seen by the next number calculation, and an invoice dated in a future year resets the sequence. Example: in January 2027 the user creates invoice 1 dated 2026-12-31. It is stored as `INV-2027-0001`, but it is excluded from the 2027 max, so the next invoice is also `INV-2027-0001`. Both get the journal reference `ARINV-INV-2027-0001`. `TryReverseJournalByReference` reverses the latest unreversed journal with that reference, so voiding the first invoice reverses the second invoice's journal.
**Steps to Reproduce:**
1. In a new year, create an invoice with Invoice Date set in the previous year.
2. Create another invoice dated today.
3. Compare `PrefixInvoiceNo`, then void the first invoice and inspect which `ARINV-` journal was reversed.
**Expected:** Invoice numbers are unique per tenant, and void reverses its own journal.
**Actual:** Both invoices are `INV-2027-0001`, and the reversal targets whichever journal is the latest unreversed one with that reference.
**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Orders/InvoiceModal.tsx` lines 26-31 (invoice date editable).
* Backend: `Cimmple_API/CimmpleAPI/Controllers/InvoiceController.cs` lines 978-988 (`GenerateInvoiceNumber` filters `InvoiceDate.Year == currentYear`), 220 (prefix), 310 (`BuildAutoPostingReference("ARINV", ...)`), 848-853 and 918-923 (void/delete reverse by reference). `Services/GlWorkflowService.cs` lines 131-158 (reverses the latest unreversed journal by reference).
* Database: `InvoiceMaster.InvoiceNo`/`PrefixInvoiceNo` (no unique index in `Data/Models/InvoiceMaster.cs` lines 8-37 or `Data/CimmpleDbContext.cs`), `JournalEntries.ReferenceNumber`.
**Root Cause:** The sequence scope (invoice-date year) and the label scope (server year) differ, and there is no uniqueness constraint.
**Business Impact:** Duplicate legal invoice numbers. Voiding one invoice can reverse another invoice's revenue/AR while leaving the voided one posted.
**Affected Areas:** Invoice numbering, void, delete, GL reversal, AR.
**Recommended Fix:** Use a single year source (the invoice date) for both the sequence and the prefix. Add a unique per-tenant constraint on the invoice number, and make journal reversal target the invoice's own journal id rather than a reference string.

---

### BUG-SALES-007 — CreateInvoice accepts duplicate lines, lines from other orders, and empty line lists
**Severity:** High. A single request can over-invoice beyond shipped quantity, or post AR for an invoice with no lines that is invisible in the UI. Both are financial misstatements.
**Status:** Confirmed
**Test Area:** 3.4 Customer Invoices / Validation (0 < qty ≤ shipped − invoiced)
**Description:** The per-line validation loop checks each `LineItems` entry independently against shipped − invoiced from the database. It does not accumulate quantities within the request, so the same `OrderDetailId` repeated twice passes with each copy up to the full available quantity. Lines are only checked for tenant, not that `detail.OrderID == request.OrderId`. Any line of any order in the tenant can be invoiced under another order's `OrderId`, and the `InvoiceDetail.OrderId` is written as `request.OrderId`. An empty `LineItems` list skips validation entirely. The invoice header and an `ARINV-` journal for freight/other charges are still created, but `GetAllInvoices` inner-joins invoice details, so the invoice never appears in the list.
**Steps to Reproduce:**
1. POST `/Invoice/CreateInvoice` with `lineItems: [{orderDetailId: X, qtyToInvoice: 5}, {orderDetailId: X, qtyToInvoice: 5}]` where X has 5 shipped and 0 invoiced.
2. POST with an `orderDetailId` belonging to another order.
3. POST with `lineItems: []` and `shippingCharge: 50`.
**Expected:** Each request is rejected (total per line ≤ available; lines must belong to the order; at least one line).
**Actual:** 10 units are invoiced against 5 shipped; a cross-order invoice is created; a line-less invoice posts Dr AR 50 / Cr Freight 50 and is hidden from the invoice list.
**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Orders/InvoiceModal.tsx` lines 135-209 (the UI filters qty > 0 and checks availability, so this is reachable by direct API call).
* Backend: `Cimmple_API/CimmpleAPI/Controllers/InvoiceController.cs` lines 116-135 (validation per item, no accumulation, no OrderId check), 243-277 (`InvoiceDetail.OrderId = request.OrderId`), 171-189 and 329-375 (freight/other posted regardless of lines), 552-714 (`GetAllInvoices` builds rows from invoice details).
* Database: `InvoiceMaster`, `InvoiceDetail`, `CustomerOrderDetails.InvoicedQty`, `JournalEntries`.
**Root Cause:** The validation does not treat the request as a whole and does not check line ownership.
**Business Impact:** Over-billing customers, AR that cannot be viewed, paid or voided from the UI, and invoice lines attributed to the wrong order.
**Affected Areas:** CreateInvoice, AR, GL, Customer Invoices list, order invoice status.
**Recommended Fix:** Reject empty line lists. Group requested quantities by `OrderDetailId` before checking availability. Require every detail to belong to `request.OrderId`.

---

### BUG-SALES-008 — CreateShipment accepts non-positive quantities, duplicate lines, lines from other orders and a nonexistent order
**Severity:** Medium. Crafted requests can corrupt shipped quantities and shipment records; the UI path is guarded.
**Status:** Confirmed
**Test Area:** 3.3 Customer Shipments / Validation (qty ≤ ordered − shipped)
**Description:** `CreateShipment` validates each line against `detail.QtyOrdered − detail.ShippedQty` independently. There is no `QtyToShip > 0` check, so a negative quantity decreases `ShippedQty` (and the FG issue is skipped because `qty <= 0` returns early). Duplicate `OrderDetailId` entries each pass against the same available quantity, so the line can be over-shipped and FG issued twice. Lines are not checked against `request.OrderId`. If the order does not exist, the shipment is still created with an empty customer.
**Steps to Reproduce:**
1. POST `/Shipping/CreateShipment` with `qtyToShip: -5` for a line.
2. POST with the same `orderDetailId` twice, each equal to the full remaining quantity.
3. POST with an `orderId` that does not exist and a valid detail id from another order.
**Expected:** All three are rejected.
**Actual:** All three are saved. `ShippedQty` becomes negative or exceeds `QtyOrdered`, which in turn lets the invoice step bill more than was ordered.
**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Orders/ShippingModal.tsx` lines 63-66 and 247-273 (UI filters and clamps quantities).
* Backend: `Cimmple_API/CimmpleAPI/Controllers/ShippingController.cs` lines 121-140 (validation), 163-165 (order may be null), 184 (`ShippedQty +=`), 702-703 (`IssueFinishedGoodsForShipmentAsync` returns early for qty ≤ 0).
* Database: `Shipping`, `ShippingDetails`, `CustomerOrderDetails.ShippedQty`, `InventoryTransaction`.
**Root Cause:** Missing request-level validation (positive quantity, accumulated quantity, line ownership, order existence).
**Business Impact:** Incorrect shipped quantities, double FG issues, and over-invoicing that follows from inflated shipped totals.
**Affected Areas:** Shipments, FG inventory, invoiceable quantities, order status.
**Recommended Fix:** Require an existing order, `QtyToShip > 0`, every detail belonging to the order, and the sum per detail ≤ remaining quantity.

---

### BUG-SALES-009 — Shipment numbers are count-based and are reused after a shipment is deleted
**Severity:** Medium. Two different shipments can carry the same SH number, breaking packing-slip traceability.
**Status:** Confirmed
**Test Area:** 3.3 Customer Shipments / Backend Create (SH-yyyyMMdd-###); 11.3 number sequences per tenant
**Description:** `GenerateShipmentNumber` counts the tenant's shipments created today and returns `SH-yyyyMMdd-{count+1:D3}`. Deleting any earlier shipment from today lowers the count, so the next shipment reuses an existing number.
**Steps to Reproduce:**
1. Create shipments SH-…-001, SH-…-002 and SH-…-003 today.
2. Delete SH-…-001.
3. Create another shipment.
**Expected:** SH-…-004.
**Actual:** SH-…-003, the same number as an existing shipment.
**Evidence:**
* Frontend: n/a (number is generated server-side).
* Backend: `Cimmple_API/CimmpleAPI/Controllers/ShippingController.cs` lines 775-782 (`GenerateShipmentNumber`), 606-691 (`DeleteShipment` hard-deletes).
* Database: `Shipping.ShipmentNo` (no unique index in `Data/Models/Shipping.cs` lines 6-21).
**Root Cause:** Sequence derived from a row count rather than the maximum issued number.
**Business Impact:** Duplicate packing slip numbers sent to customers and couriers; ambiguous search and deep links.
**Affected Areas:** Shipments, packing slip PDF/email, shipment search.
**Recommended Fix:** Derive the next number from the maximum existing number for the date (or a sequence table) and add a unique per-tenant constraint.

---

### BUG-SALES-010 — An invoiced shipment can be deleted, leaving invoiced quantity greater than shipped quantity
**Severity:** Medium. The delete restores FG stock for goods that have been billed, and the order ends up with invoiced > shipped.
**Status:** Confirmed
**Test Area:** 3.3 Customer Shipments / Delete
**Description:** `CheckShipmentDeletionImpact` only adds a warning when the shipment's lines are invoiced; `CanDelete` stays true. `DeleteShipment` has no invoice check, reverses the FG issue and removes the shipment. The invoice remains posted.
**Steps to Reproduce:**
1. Ship 5 units and invoice them.
2. In Customer Shipments, delete the shipment and confirm past the warning.
**Expected:** Deletion is blocked while the shipped quantity is invoiced (as `DeleteOrder` blocks on invoices), or the invoice must be voided first.
**Actual:** The shipment is deleted, FG stock is restored by 5, and the line shows shipped 0 / invoiced 5.
**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Orders/CustomerShipments.tsx` lines 156-185 (delete through the impact dialog).
* Backend: `Cimmple_API/CimmpleAPI/Controllers/ShippingController.cs` lines 576-592 (invoiced lines only produce a warning), 606-691 (`DeleteShipment` has no invoice check; FG reversal 645-673).
* Database: `Shipping`, `ShippingDetails`, `InvoiceDetail`, `InventoryTransaction`.
**Root Cause:** Invoiced lines are treated as a warning instead of a blocking dependency.
**Business Impact:** Inventory is overstated for goods already shipped and billed, and shipped/invoiced reconciliation breaks.
**Affected Areas:** Shipments, FG inventory, invoices, order status.
**Recommended Fix:** Make non-voided invoice lines a blocking dependency in both the impact check and `DeleteShipment`.

---

### BUG-SALES-011 — Saving an order overwrites linked Job Order quantity with the full ordered quantity, even for Completed jobs
**Severity:** Medium. Every order save resets JO quantity to `QtyOrdered`, contradicting the matrix rule "Job qty = ordered − shipped" and altering completed production records.
**Status:** Confirmed
**Test Area:** 3.2 Customer Orders / Edit (line edits sync linked JO); Business logic (Job qty = ordered − shipped); 10.1 Customer Order → Job Order
**Description:** `SaveOrder` loops through every existing line with a linked JO and sets `jobOrder.QtyOrdered = detail.QtyOrdered`, plus price, due date, part and description, on every save, regardless of whether the line changed, how much was shipped, or the JO's status. `CreateJobOrderFromOrderDetail` creates the JO with ordered − shipped, so the two paths disagree.
**Steps to Reproduce:**
1. Order line Qty 10; ship 4; create the JO (qty 6). Complete the JO.
2. Edit only the order's shipping instructions and save.
**Expected:** The JO keeps qty 6 (or is recalculated as ordered − shipped), and Completed JOs are not modified.
**Actual:** The JO qty becomes 10 and its `ModifiedDate` changes, even though it is Completed.
**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Orders/CustomerOrderSlideout.tsx` (Save sends all lines).
* Backend: `Cimmple_API/CimmpleAPI/Controllers/OrderController.cs` lines 708-758 (JO sync); `Controllers/JobOrderController.cs` lines 590-609 (`remainingQty = ordered − shipped` on create).
* Database: `JobOrderMaster.QtyOrdered`, `CustomerOrderDetails.ShippedQty`.
**Root Cause:** The sync copies the ordered quantity unconditionally instead of applying the same ordered − shipped rule and skipping closed jobs.
**Business Impact:** Production plans, material requirements and job-cost/yield reporting show the wrong quantity; completed jobs look under-produced.
**Affected Areas:** Job Orders, material reservation, production reports.
**Recommended Fix:** Sync only changed fields, compute JO quantity as ordered − shipped, and do not modify Completed/Cancelled jobs (or require confirmation).

---

### BUG-SALES-012 — Invoice GL entry is posted to the user's working site (or site 1) instead of the order's site
**Severity:** Medium. Revenue and AR are attributed to the wrong location while the related payment is attributed to the order's site, so per-site financials do not tie out.
**Status:** Confirmed
**Test Area:** 3.4 Customer Invoices / Create (GL); 11.2 Shipments / Customer Invoices inherit CO location
**Description:** `CreateInvoice` resolves the journal location with `TryResolveLocationId(null, ..., fallback: 1)`, which uses the caller's `X-Location-Id` working site or the literal location id 1. The matrix says invoices inherit `CustomerOrder.locationId`, and `RecordCustomerPayment` explicitly uses the order's location (comment "A payment belongs to the invoice/order site"). The same invoice's AR debit and its payment's AR credit can therefore land on different sites. The fallback id 1 may not even belong to the tenant.
**Steps to Reproduce:**
1. With working site B selected, invoice an order whose location is A.
2. Record a payment on it.
3. Inspect `JournalEntries.locationId` for the `ARINV-` and `ARPMT-` entries.
**Expected:** Both entries carry location A.
**Actual:** The invoice entry carries B (or 1 when no working site is set); the payment entry carries A.
**Evidence:**
* Frontend: `Cimmple_UI/src/Common/Services/Axios-config.ts` (sends `X-Location-Id` from the working site).
* Backend: `Cimmple_API/CimmpleAPI/Controllers/InvoiceController.cs` lines 312-313 and 321 (invoice journal location), 1153-1164 (payment uses order location). `Controllers/ApiBaseController.cs` lines 222-250 (`TryResolveLocationId`).
* Database: `JournalEntries.locationId`, `CustomerOrder.locationId`.
**Root Cause:** The invoice posting does not look up the order's location.
**Business Impact:** Per-site revenue/AR reports and site-level AR balances are wrong.
**Affected Areas:** GL by location, financial reports per site, dashboard revenue by site.
**Recommended Fix:** Resolve the invoice journal location from the order (as the payment does) and avoid a hard-coded fallback id.

---

### BUG-SALES-013 — Location-restricted users can modify, delete, duplicate, ship and invoice other sites' quotations and orders by id
**Severity:** Medium. The matrix requires cross-site access to CQ/CO to be blocked; only the two GET-by-id endpoints enforce it, so every write path bypasses the location restriction.
**Status:** Confirmed
**Test Area:** 3.1 / 3.2 Location; 11.1 Location permissions; 11.2 Customer Quotations / Customer Orders (cross-site detail access blocked)
**Description:** `GetQuotationById` and `GetOrderById` return 403 when the record's location is not allowed. No other per-record Sales endpoint checks the existing record's location with `CanAccessLocation`. `SaveOrder` and `SaveQuotation` only validate the requested new `LocationId`, so a restricted user can edit another site's record and even move it into their own site. `DeleteOrder`, `DeleteQuotation`, `DuplicateOrder`, `DuplicateQuotation` and the deletion-impact endpoints have no location check. Shipment and invoice actions (`GetShippableItems`, `CreateShipment`, `GetInvoiceableItems`, `CreateInvoice`, `RecordCustomerPayment`, `VoidInvoice`, `DeleteInvoice`, `DeleteShipment`, `GetShipmentDetails`, `GetInvoiceDetails`) act on any order of the tenant regardless of the order's site.
**Steps to Reproduce:**
1. Log in as a user restricted to site A.
2. Call POST `/Order/SaveOrder` with `OrderID` of an order at site B (and `LocationId` = A), or DELETE `/Order/DeleteOrder?orderId=<site B order>`.
3. Call POST `/Shipping/CreateShipment` or `/Invoice/CreateInvoice` for a site B order.
**Expected:** 403 for each request, consistent with `GetOrderById`.
**Actual:** All requests succeed. The order is moved to site A or deleted, and shipments/invoices are created on site B's order.
**Evidence:**
* Frontend: n/a (direct API; the lists hide other sites' rows).
* Backend: `Cimmple_API/CimmpleAPI/Controllers/OrderController.cs` lines 299-302 (403 only in `GetOrderById`), 564-573 and 624-626 (`SaveOrder` edit loads by id/tenant and only validates the new location), 1600-1671 (`DeleteOrder`), 1673-1863 (`DuplicateOrder`). `Controllers/QuotationController.cs` lines 136-140 (403 only in `GetQuotationById`), 355-363 and 407-409 (`SaveQuotation`), 678-815 (`DuplicateQuotation`), 930-1011 (`DeleteQuotation`). `Controllers/ShippingController.cs` lines 33-108, 110-238, 240-330, 606-691. `Controllers/InvoiceController.cs` lines 25-98, 100-395, 397-488, 825-894, 896-977, 1063-1241. `Controllers/ApiBaseController.cs` lines 121-126 (`CanAccessLocation`).
* Database: `QuotationOrder.Locationid`, `CustomerOrder.locationId`.
**Root Cause:** Location enforcement is implemented only for list filters and the two GET-by-id endpoints.
**Business Impact:** Site restrictions configured for users do not protect another site's sales documents from changes, deletion or financial postings.
**Affected Areas:** All Sales write endpoints.
**Recommended Fix:** Load the record (or its parent order) and apply `CanAccessLocation` on every per-record Sales endpoint, including the existing location on edit.

---

### BUG-SALES-014 — Quotation and order lines are not validated server-side (≥1 line, qty > 0, price ≥ 0, qty not below shipped/invoiced)
**Severity:** Medium. The matrix validation rules are enforced only in the browser; any API client can save invalid documents that break downstream shipping and invoicing.
**Status:** Confirmed
**Test Area:** 3.1 / 3.2 Validation (Frontend and Backend "required header, lines")
**Description:** `SaveQuotation` and `SaveOrder` check only the header (customer, date). They accept zero lines, zero or negative quantities and negative unit prices. `SaveOrder` also lets an existing line's `QtyOrdered` be reduced below its shipped or invoiced quantity (neither the slideout nor the API prevents it). After that, `GetShippableItems` returns a negative remaining quantity and the order status logic treats the line as over-shipped/over-invoiced.
**Steps to Reproduce:**
1. POST `/Order/SaveOrder` with `Details: []`, or a line with `QtyOrdered: -3` / `UnitPrice: -10`.
2. In the slideout, edit a line that has 8 shipped and change its quantity to 5; save.
**Expected:** The API rejects missing lines, qty ≤ 0 and price < 0, and quantities below shipped/invoiced.
**Actual:** All are saved.
**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Orders/CustomerOrderSlideout.tsx` lines 979-1057 (`validateForm`, client-only, no shipped/invoiced floor); `Cimmple_UI/src/Modules/Quotations/CustomerQuotationSlideout.tsx` lines 739-807.
* Backend: `Cimmple_API/CimmpleAPI/Controllers/OrderController.cs` lines 528-536 (header-only validation), 718-758 (line update with no quantity floor); `Controllers/QuotationController.cs` lines 337-345 (header-only validation), 457-494 (lines re-inserted as sent).
* Database: `CustomerOrderDetails.QtyOrdered`/`UnitPrice`, `QuotationOrderDetails`.
**Root Cause:** Line rules exist only in the React forms.
**Business Impact:** Negative or empty documents, negative totals, and orders whose shipped/invoiced quantities exceed the ordered quantity.
**Affected Areas:** CQ/CO save, shipping, invoicing, sales reports.
**Recommended Fix:** Enforce the matrix line rules in `SaveQuotation`/`SaveOrder`, and reject reducing quantity below the shipped or invoiced quantity.

---

### BUG-SALES-015 — Quotation and order saves are not atomic
**Severity:** Medium. A failure midway leaves a partially saved document (header without lines, quote marked Converted without a complete order).
**Status:** Confirmed
**Test Area:** 3.1 / 3.2 Create/Update; 10.1 Customer Quotation → Customer Order
**Description:** `SaveOrder` calls `SaveChanges` several times (header first, quotation conversion flag, shipping-detail deletions, line changes, JO sync) with no transaction. `SaveQuotation` likewise saves the header, then deletes and re-inserts all lines in separate `SaveChanges` calls. Any exception after the first save (validation in a later step, constraint violation, timeout) leaves the earlier writes committed, and the API returns 500.
**Steps to Reproduce:**
1. Convert a quotation; force a failure in the line save (for example a string longer than the column).
2. Reload the quotation and the order list.
**Expected:** Nothing is saved.
**Actual:** The order header exists and the quotation shows Converted with `convertedOrderId` set, but the order has no or partial lines. For an edited quotation, the old lines may be deleted without the new ones inserted.
**Evidence:**
* Backend: `Cimmple_API/CimmpleAPI/Controllers/OrderController.cs` lines 641, 660-671, 696, 791, 816 (separate `SaveChanges`, no `BeginTransaction` in `SaveOrder`); `Controllers/QuotationController.cs` lines 423, 457-494, 520.
* Frontend: n/a.
* Database: `CustomerOrder`, `CustomerOrderDetails`, `QuotationOrder`, `QuotationOrderDetails`, `ShippingDetails`.
**Root Cause:** Multi-step writes without a database transaction.
**Business Impact:** Inconsistent documents that need manual database clean-up; a converted quote cannot be converted again because it is already flagged.
**Affected Areas:** CQ/CO save and conversion.
**Recommended Fix:** Wrap each save in a single transaction (as `CreateInvoice` and `CreateShipment` already do).

---

### BUG-SALES-016 — Converted quotations remain editable and "Converted" can be set or removed manually
**Severity:** Medium. The matrix says the edit slideout is read-only when Converted and that Converted is set only by saving the order; neither is enforced, so the quote/order link can be falsified.
**Status:** Confirmed
**Test Area:** 3.1 Customer Quotations / Edit (read-only when Converted); Business logic (Converted set by order save)
**Description:** The quotation slideout keeps all fields and lines editable for a converted quotation, and its Status dropdown includes "Converted", so a user can mark an unconverted quote Converted, or change a converted quote back to Draft or Accepted. `SaveQuotation` writes `request.Status` and the lines as sent, with no check on `isConverted`. The Convert button is disabled by the Status value, so a quote manually set to "Converted" cannot be converted for real, and a converted quote set back to another status still has `isConverted = 1`.
**Steps to Reproduce:**
1. Open a converted quotation; change a price and the status to Draft; save.
2. Open an unconverted quotation; choose Status "Converted"; save.
**Expected:** Step 1 is read-only/rejected. Step 2 is not possible (Converted is not a manual status).
**Actual:** Both saves succeed.
**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Quotations/CustomerQuotationSlideout.tsx` lines 1714-1720 (Convert disabled by Status), 1748-1759 (Status options include Converted), 1397-1543 (conversion flow).
* Backend: `Cimmple_API/CimmpleAPI/Controllers/QuotationController.cs` lines 393-409 (status and fields written from the request, no `isConverted` guard), 457-494 (lines replaced).
* Database: `QuotationOrder.Status`, `isConverted`, `convertedOrderId`, `QuotationOrderDetails`.
**Root Cause:** No read-only state or server-side guard for converted quotations; Converted is offered as a normal status.
**Business Impact:** The quote no longer reflects what was converted, and pipeline/conversion reports become unreliable.
**Affected Areas:** Quotation edit, conversion, quote conversion reports.
**Recommended Fix:** Make converted quotes read-only in the UI, reject edits server-side when `isConverted = 1`, and remove Converted from the manual status list.

---

### BUG-SALES-017 — An order with a voided invoice cannot be deleted from the UI
**Severity:** Medium. Orders whose only invoice was voided are permanently undeletable through the UI, although the backend delete endpoint allows it.
**Status:** Confirmed
**Test Area:** 3.2 Customer Orders / Delete (blocked by invoices; cascade available)
**Description:** `CheckOrderDeletionImpact` lists every invoice, including voided ones, as a blocking dependency, so the dialog shows "Cannot Delete" with no confirm button. `DeleteOrder` itself ignores voided invoices. The dialog's dependency delete / "Delete All" calls `DeleteInvoice`, which refuses voided invoices ("Cannot delete a voided invoice"). The UI has no path to delete such an order. If the order is deleted via API, its voided invoice becomes an orphan that disappears from the invoice list (inner join to the order).
**Steps to Reproduce:**
1. Create an order, ship, invoice, and void the invoice. Delete the shipment.
2. Delete the order from the list.
**Expected:** Deletion is allowed (consistent with `DeleteOrder`) or the voided invoice is handled explicitly.
**Actual:** The dialog blocks deletion, and deleting the voided invoice dependency fails.
**Evidence:**
* Frontend: `Cimmple_UI/src/Common/Components/DeletionImpactDialog.tsx` lines 91-171 (blocked state: only Close / dependency delete / Delete All).
* Backend: `Cimmple_API/CimmpleAPI/Controllers/OrderController.cs` lines 1469-1497 (impact includes voided invoices), 1614-1618 (`DeleteOrder` excludes voided); `Controllers/InvoiceController.cs` lines 911-912 (voided invoices cannot be deleted).
* Database: `InvoiceMaster.IsVoided`.
**Root Cause:** The impact check and the delete endpoint use different invoice filters.
**Business Impact:** Clean-up of cancelled orders is blocked; lists keep dead orders.
**Affected Areas:** Order delete, deletion-impact dialog.
**Recommended Fix:** Use the same voided-invoice rule in `CheckOrderDeletionImpact` and `DeleteOrder`, and decide explicitly how a voided invoice is retained when its order is deleted.

---

### BUG-SALES-018 — Recorded customer payments cannot be reversed, but void/delete errors tell users to "Reverse payments first"
**Severity:** Medium. A mistaken payment permanently locks its invoice: it cannot be corrected, voided or deleted.
**Status:** Confirmed
**Test Area:** 3.4 Customer Invoices / Void, Delete (blocked if paid); 10.1 Customer Invoice → Customer Payment
**Description:** Void and delete correctly block paid/partially paid invoices with "Reverse payments first." However, there is no API endpoint or UI action that reverses or un-applies a customer payment. The only code that writes `InvoiceMaster.PaidAmount` for customer invoices is `RecordCustomerPayment` (and void, which is itself blocked once paid). No service method calls a reversal endpoint. Manually reversing the `ARPMT-` journal in Journal Entries would not reset `PaidAmount`, so the invoice would still show as paid.
**Steps to Reproduce:**
1. Record a payment of the wrong amount on an invoice.
2. Try to void or delete the invoice; look for a payment reversal action in the invoice detail or AR screens.
**Expected:** A way to reverse the payment exists, as the error message instructs.
**Actual:** Void/delete fail with "Reverse payments first", and no reversal function exists.
**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Orders/CustomerInvoiceDetailModal.tsx` lines 518-575 and 1080-1100 (only void/delete/record payment actions); `Cimmple_UI/src/Common/Services/CustomerInvoicesService.ts`, `InvoiceService.ts` (no reversal call).
* Backend: `Cimmple_API/CimmpleAPI/Controllers/InvoiceController.cs` lines 846 and 916 (messages), 1063-1241 (only payment write path); `Controllers/AccountingController.cs` lines 2076-2180 (AR functions without payment reversal).
* Database: `InvoiceMaster.PaidAmount`, `Transactions`, `JournalEntries`.
**Root Cause:** The payment reversal workflow referenced by the validation messages was never implemented for customer invoices.
**Business Impact:** Payment entry mistakes cannot be corrected inside the application, which affects AR, bank reconciliation and customer statements.
**Affected Areas:** Customer Invoices, AR, Bank Reconciliation.
**Recommended Fix:** Add a customer payment reversal that reverses the `ARPMT-` journal and `Transactions` row and reduces `PaidAmount`, subject to the period lock; or change the messages to describe the real correction path.

---

### BUG-SALES-019 — Payment bank account is not validated, and an unmapped bank silently posts to a guessed GL account
**Severity:** Medium. A payment can reference a bank of another tenant/location or a bank without COA mapping, and the debit goes to a fuzzy-matched "bank/cash" account instead of being rejected.
**Status:** Confirmed
**Test Area:** 3.4 Customer Invoices / Record payment (bank); Backend Validation (GL defaults configured)
**Description:** `RecordCustomerPayment` requires a non-zero `BankId` but does not load the bank or check its tenant, location or active state. The GL bank account is then resolved by `GlAccountResolutionService.ResolveBank`, which falls back to name-based guesses when the bank has no mapping. The "Configure bank COA mapping first" error is therefore only returned when no fallback account exists at all. The `Transactions` row stores the unvalidated `BankId`, so bank reconciliation can receive a transaction for a bank that does not belong to the tenant.
**Steps to Reproduce:**
1. POST `/Invoice/RecordCustomerPayment/{id}` with a `bankId` from another tenant, or with a bank that has no COA mapping.
**Expected:** Rejected with a clear error about the bank or its COA mapping.
**Actual:** Accepted. The debit goes to a fallback account and the `Transactions` row references the given bank id.
**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Orders/CustomerInvoices.tsx` lines 43-66 (bank required in the modal only).
* Backend: `Cimmple_API/CimmpleAPI/Controllers/InvoiceController.cs` lines 1093-1108 (bank id check and resolution), 1197-1214 (`Transactions.Bankid`); `Services/GlAccountResolutionService.cs` lines 256-295 (`ResolveBank` fuzzy fallback).
* Database: `Transactions.Bankid`, `InvoiceMaster.Bankid`, `Banks`.
**Root Cause:** No ownership/active check on the bank; the GL resolver falls back to guesses (the fallback behaviour itself is tracked by Accounting, see Cross-Module Concerns).
**Business Impact:** Cash posted to the wrong GL account or bank; reconciliation differences.
**Affected Areas:** Customer payments, Bank Reconciliation, GL cash accounts.
**Recommended Fix:** Validate that the bank belongs to the tenant, is active and is accessible from the order's site, and require an explicit COA mapping for payment posting.

---

### BUG-SALES-020 — Opening a deleted or unknown order id can display a different order
**Severity:** Low. A stale link or deep link opens an unrelated order instead of showing "not found".
**Status:** Confirmed
**Test Area:** 3.2 Customer Orders / Edit (`?open={id}`)
**Description:** When `GetOrderById` does not find `OrderID == id`, it retries by `PONumber == id` and then by `PONumber == id + 999` (a legacy offset). A deep link or bookmark to a deleted order can therefore resolve to whichever order happens to have that CO number, and the user may edit it believing it is the original.
**Steps to Reproduce:**
1. Note an order with `OrderID = 1005`; delete it.
2. Ensure another order has CO# 1005 (or 2004). Open `/orders/customer?open=1005`.
**Expected:** "Order not found".
**Actual:** The other order opens.
**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Orders/CustomerOrders.tsx` (deep link `?open`).
* Backend: `Cimmple_API/CimmpleAPI/Controllers/OrderController.cs` lines 283-292 (fallback lookups).
* Database: `CustomerOrder.OrderID`, `CustomerOrder.PONumber`.
**Root Cause:** Legacy lookup fallbacks mix the internal id with the document number.
**Business Impact:** Edits applied to the wrong order.
**Affected Areas:** Order slideout deep links, notifications/links that use order ids.
**Recommended Fix:** Remove the fallbacks, or use them only for an explicit "lookup by CO#" parameter.

---

### BUG-SALES-021 — Quotation slideout blocks re-saving existing quotations whose dates are now in the past
**Severity:** Low. Old quotations cannot be edited (for example to change status to Accepted) without first changing their line dates.
**Status:** Confirmed
**Test Area:** 3.1 Customer Quotations / Validation (est/due date not past)
**Description:** `CustomerQuotationSlideout.validateForm` rejects any line with an estimated/due date before today, for new and existing lines alike. `CustomerOrderSlideout` applies the same rule only to new lines. A quote created last month with a due date last week cannot be saved at all.
**Steps to Reproduce:**
1. Open a quotation whose line due date is in the past.
2. Change the status to Accepted and save.
**Expected:** Existing lines are exempt, as in the order slideout.
**Actual:** Save is blocked with a past-date validation error.
**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Quotations/CustomerQuotationSlideout.tsx` lines 782-796; compare `Cimmple_UI/src/Modules/Orders/CustomerOrderSlideout.tsx` lines 1022-1046.
* Backend: n/a (no server rule).
* Database: n/a.
**Root Cause:** The rule is not limited to new lines.
**Business Impact:** Users must alter historical dates to change a quote's status.
**Affected Areas:** Quotation edit.
**Recommended Fix:** Apply the past-date check only to new or changed lines, as the order slideout does.

---

### BUG-SALES-022 — Invoices are shown as Overdue on their due date
**Severity:** Low. Status disagrees with AR aging, which treats the due date itself as current.
**Status:** Confirmed
**Test Area:** 3.4 Customer Invoices / Filter (Overdue)
**Description:** `ResolveCustomerInvoiceStatus` and `GetDaysOverdue` compare `DueDate < DateTime.Now`. `DueDate` is stored at midnight, so any time after 00:00 on the due date marks the invoice Overdue. `AccountingRules` aging treats an invoice as current when due ≥ as-of date.
**Steps to Reproduce:**
1. Create an invoice due today and open the invoice list.
**Expected:** Unpaid (current), consistent with aging.
**Actual:** Overdue.
**Evidence:**
* Backend: `Cimmple_API/CimmpleAPI/Controllers/InvoiceController.cs` lines 1278-1284, 1299-1300; `Services/AccountingRules.cs` lines 153 and 174.
* Frontend: `Cimmple_UI/src/Modules/Orders/CustomerInvoices.tsx` lines 801-807 (status filter uses the server status).
* Database: `InvoiceMaster.DueDate`.
**Root Cause:** Date-time comparison instead of date comparison.
**Business Impact:** Premature overdue status and reminders; mismatch with aging reports.
**Affected Areas:** Invoice list/detail status, overdue filter.
**Recommended Fix:** Compare `DueDate.Date < today` (tenant time zone).

---

### BUG-SALES-023 — Invoice status filter has no "Partially Paid" option, and overdue partial payments are not filterable
**Severity:** Low. A matrix filter value is missing.
**Status:** Confirmed
**Test Area:** 3.4 Customer Invoices / Filter (Void/Paid/Partially Paid/Overdue/Unpaid)
**Description:** The status filter offers Void, Paid, Overdue and Unpaid only. The server returns "Partially Paid" for partially paid invoices regardless of due date, so partially paid invoices cannot be filtered, and overdue partially paid invoices do not appear under "Overdue".
**Steps to Reproduce:**
1. Record a partial payment on an overdue invoice.
2. Filter by Overdue, then look for a Partially Paid option.
**Expected:** A Partially Paid filter exists, and overdue balances are discoverable.
**Actual:** No Partially Paid option; the invoice is not in the Overdue filter.
**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Orders/CustomerInvoices.tsx` lines 801-807.
* Backend: `Cimmple_API/CimmpleAPI/Controllers/InvoiceController.cs` lines 1286-1302, 700-706 (status filter).
* Database: n/a.
**Root Cause:** Filter options do not match the server's status values.
**Business Impact:** Collectors cannot list partially paid or overdue partially paid invoices.
**Affected Areas:** Customer Invoices list.
**Recommended Fix:** Add Partially Paid to the filter and decide how overdue partially paid invoices are surfaced.

---

### BUG-SALES-024 — Void action is hidden for overdue unpaid invoices
**Severity:** Low. The backend allows voiding any unpaid invoice, but the UI hides the action once the invoice is Overdue.
**Status:** Confirmed
**Test Area:** 3.4 Customer Invoices / Void
**Description:** Both the list row action and the detail modal show Void only when `status === 'Unpaid'`. An unpaid invoice past its due date has status "Overdue", so it can only be deleted, not voided.
**Steps to Reproduce:**
1. Open an unpaid invoice past its due date.
**Expected:** Void is available (no payments recorded).
**Actual:** Void is not shown.
**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Orders/CustomerInvoices.tsx` lines 778-795; `Cimmple_UI/src/Modules/Orders/CustomerInvoiceDetailModal.tsx` lines 1080-1100.
* Backend: `Cimmple_API/CimmpleAPI/Controllers/InvoiceController.cs` lines 841-846 (void blocked only when voided or paid).
* Database: n/a.
**Root Cause:** The UI condition uses the display status instead of "no payments and not voided".
**Business Impact:** Users delete invoices instead of voiding them, losing the audit trail.
**Affected Areas:** Invoice list and detail.
**Recommended Fix:** Show Void for Unpaid and Overdue invoices with no payments.

---

### BUG-SALES-025 — Quotation and order lists lack the date-range filter and some search fields listed in the matrix
**Severity:** Low. Missing list features.
**Status:** Confirmed
**Test Area:** 3.1 / 3.2 Search and Filter
**Description:** The matrix lists a date-range filter for both lists, contact in quotation search, and customer PO in order search. `CustomerQuotations.tsx` and `CustomerOrders.tsx` offer status and site filters only, the quotation search does not include the contact, and the order search does not include the customer PO number.
**Steps to Reproduce:**
1. Open `/quotations/customer` and `/orders/customer`; look for a date filter; search by contact or customer PO.
**Expected:** Date range filter; search matches contact (CQ) and PO (CO).
**Actual:** No date filter; those searches return nothing.
**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Quotations/CustomerQuotations.tsx` lines 240-275; `Cimmple_UI/src/Modules/Orders/CustomerOrders.tsx` lines 240-272.
* Backend: n/a.
* Database: n/a.
**Root Cause:** Features not implemented in the list pages.
**Business Impact:** Slower lookup on large lists.
**Affected Areas:** CQ and CO list pages.
**Recommended Fix:** Add the date-range filter and include contact / customer PO in the search fields.

---

### BUG-SALES-026 — UI service methods call API endpoints that do not exist; shipment tracking cannot be edited
**Severity:** Low. Dead code that would fail with 404 if wired up; the matrix "Edit tracking" feature is absent.
**Status:** Confirmed
**Test Area:** 3.3 Customer Shipments / Edit tracking; 3.4 Customer Invoices / Legacy service calls
**Description:** `CustomerShipmentsService.UpdateShipmentTracking` (PUT `/Shipping/UpdateShipmentTracking`), `CustomerInvoicesService.UpdateInvoicePayment` and `CustomerInvoicesService.PrintInvoice` target endpoints that are not defined in `ShippingController` or `InvoiceController`, and nothing in the UI calls them. Tracking information therefore cannot be updated after a shipment is created.
**Steps to Reproduce:**
1. Search the API for `UpdateShipmentTracking`, `UpdateInvoicePayment`, `PrintInvoice`.
2. Look for a tracking edit action on the shipment detail modal.
**Expected:** Either working endpoints and UI, or no dead methods.
**Actual:** Dead service methods; no tracking edit.
**Evidence:**
* Frontend: `Cimmple_UI/src/Common/Services/CustomerShipmentsService.ts` lines 89-106; `Cimmple_UI/src/Common/Services/CustomerInvoicesService.ts` lines 111-141.
* Backend: `Cimmple_API/CimmpleAPI/Controllers/ShippingController.cs` and `InvoiceController.cs` (no matching routes).
* Database: n/a.
**Root Cause:** Leftover client code from an older API.
**Business Impact:** Tracking numbers entered wrongly cannot be corrected.
**Affected Areas:** Shipments, invoice services.
**Recommended Fix:** Implement a tracking update endpoint and UI, and remove the unused invoice methods.

---

### BUG-SALES-027 — Default ship, invoice and payment dates are computed in UTC instead of the tenant time zone
**Severity:** Low. Near midnight the default date is a day off, which affects the stored document date and, for invoices, the period.
**Status:** Confirmed
**Test Area:** 3.3 / 3.4 Add and Record payment (default dates)
**Description:** The modals default their dates with `new Date().toISOString().split('T')[0]`, which is the UTC date. The app sets a tenant time zone for display (`moment.tz.setDefault`), but these defaults ignore it. A US user creating an invoice in the evening gets tomorrow's date; a user in India after midnight gets yesterday's date.
**Steps to Reproduce:**
1. Set the machine/tenant to America/New_York; at 9 pm local, open Ship, Invoice, or Record Payment.
**Expected:** Today's local date.
**Actual:** Tomorrow's date.
**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Orders/ShippingModal.tsx` line 28; `InvoiceModal.tsx` lines 26-31; `CustomerInvoices.tsx` line 30; `CustomerInvoiceDetailModal.tsx` line 30; `Cimmple_UI/src/App.tsx` lines 27-30 (tenant time zone).
* Backend: n/a.
* Database: `Shipping.ShipDate`, `InvoiceMaster.InvoiceDate`, payment date.
**Root Cause:** UTC date string used as a local date.
**Business Impact:** Wrong document dates, due dates and aging; invoices or payments may land in the next month at month end.
**Affected Areas:** Shipping, invoice and payment modals.
**Recommended Fix:** Build defaults from the tenant time zone (for example `moment().format('YYYY-MM-DD')`).

---

### BUG-SALES-028 — Shipment and Sales error handling hides or misreports server errors and leaks stack traces
**Severity:** Low. Users get generic or misleading messages; 500 responses expose internal details.
**Status:** Confirmed
**Test Area:** 3.3 Customer Shipments / Delete, Create; API error handling
**Description:** `CustomerShipmentsService.DeleteShipment` catches errors and returns a generic failure, so the server's reason (for example a period or inventory error) is not shown. When the FG issue fails, `CreateShipment` rolls back the whole transaction but returns "Shipment saved but inventory issue failed", although nothing was saved. Several Sales endpoints return `ex.StackTrace` in 500 responses.
**Steps to Reproduce:**
1. Cause a shipment delete to fail server-side; observe the toast.
2. Cause the FG issue to fail during Create Shipment; check whether the shipment exists.
3. Trigger an exception in `CreateInvoice`/`SaveOrder`; inspect the response body.
**Expected:** Server messages shown accurately; no stack traces in responses.
**Actual:** Generic message; "Shipment saved" while nothing is saved; stack trace returned.
**Evidence:**
* Frontend: `Cimmple_UI/src/Common/Services/CustomerShipmentsService.ts` lines 108-122.
* Backend: `Cimmple_API/CimmpleAPI/Controllers/ShippingController.cs` lines 193-205 and 772 (message after rollback), 602 (stack trace); `Controllers/InvoiceController.cs` lines 388-392; `Controllers/OrderController.cs` line 847.
* Database: n/a.
**Root Cause:** Error handling written ad hoc per endpoint.
**Business Impact:** Confusing feedback and minor information disclosure.
**Affected Areas:** Shipments, invoices, orders.
**Recommended Fix:** Propagate server messages, change the shipment message to "Shipment not saved: inventory issue failed", and remove stack traces from responses.

---

### BUG-SALES-029 — Stored order status is computed from stale data and overwrites other statuses
**Severity:** Low. `CustomerOrder.Status` in the database can be wrong (the list recomputes status for display, but reports and other readers use the stored value).
**Status:** Confirmed
**Test Area:** 3.2 Customer Orders / Business logic (statuses)
**Description:** `UpdateOrderInvoiceStatus` queries `InvoiceDetail` from the database, but in `CreateInvoice` it runs before the new invoice details are saved, and in `DeleteInvoice` before the deleted details are removed. The stored status therefore reflects the previous state (for example a first invoice leaves the status unchanged). `UpdateOrderShippingStatusAsync` sets Shipped/Partially Shipped regardless of an existing invoicing or Cancelled status. `SaveOrder` writes `request.Status` from the client on every save.
**Steps to Reproduce:**
1. Ship an order fully; invoice it fully; read `CustomerOrder.Status` in the database.
**Expected:** Fully Invoiced.
**Actual:** Still Shipped until a later recalculation.
**Evidence:**
* Backend: `Cimmple_API/CimmpleAPI/Controllers/InvoiceController.cs` lines 278-292 (status update before `SaveChanges`), 953-966; 1020-1061 (`UpdateOrderInvoiceStatus` queries the database); `Controllers/ShippingController.cs` lines 803-830; `Controllers/OrderController.cs` line 617, lines 133-171 (display-only recomputation in `GetOrders`).
* Frontend: n/a.
* Database: `CustomerOrder.Status`.
**Root Cause:** Status derived from unsaved/stale data; competing writers.
**Business Impact:** Reports or integrations that read the stored status show the wrong stage.
**Affected Areas:** Order status in reports and dashboards.
**Recommended Fix:** Call `SaveChanges` before recomputing, or compute from in-memory changes, and derive status in one place.

---

## Potential Bugs

### BUG-SALES-030 — Document numbers (CQ#, CO#, INV-, SH-) can be duplicated under concurrent saves
**Severity:** Medium. Duplicate legal document numbers if two users save at the same time.
**Status:** Potential
**Test Area:** 3.1–3.4 Create; 11.3 number sequences per tenant
**Description:** All four generators read the current maximum or count and add one, then insert, without a lock, sequence or unique index.
**Steps to Reproduce:**
1. Two users save a new order (or invoice/shipment/quote) for the same tenant at the same moment.
**Expected:** Distinct numbers.
**Actual:** Both may receive the same number.
**Evidence:**
* Frontend: n/a.
* Backend: `Cimmple_API/CimmpleAPI/Controllers/OrderController.cs` lines 577-605; `QuotationController.cs` lines 367-380; `InvoiceController.cs` lines 978-988; `ShippingController.cs` lines 775-782.
* Database: `CustomerOrder.PONumber`, `QuotationOrder.PONumber`, `InvoiceMaster.InvoiceNo`, `Shipping.ShipmentNo` (no unique index in the EF models).
**Root Cause:** Read-then-insert numbering without concurrency control.
**Business Impact:** Duplicate document numbers.
**Affected Areas:** All Sales documents.
**Recommended Fix:** Use a sequence/counter table with locking and a unique per-tenant index.
**Why further verification is needed:** A race needs concurrent requests to reproduce, and a unique index may exist in the live database even though EF does not declare one.

---

### BUG-SALES-031 — Concurrent payments or conversions can overpay an invoice or convert a quote twice
**Severity:** Medium. Overpayment posts excess cash to AR; double conversion creates two orders for one quote.
**Status:** Potential
**Test Area:** 3.4 Record payment (payment ≤ balance); 3.1 second conversion blocked
**Description:** `RecordCustomerPayment` reads the balance and validates without locking the invoice row, so two simultaneous payments can both pass the balance check. `SaveOrder` checks for an existing order with the same `QuotationId` before inserting, also without a lock, so a double-click or two users can create two orders.
**Steps to Reproduce:**
1. Submit two full payments for the same invoice simultaneously (two tabs or the AR bulk screen plus the invoice modal).
2. Click Convert twice quickly on a quote.
**Expected:** One succeeds; the other is rejected.
**Actual:** Both may succeed.
**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Accounting/AccountsReceivable.tsx` lines 58-105; `Cimmple_UI/src/Modules/Quotations/CustomerQuotationSlideout.tsx` lines 1417-1543.
* Backend: `Cimmple_API/CimmpleAPI/Controllers/InvoiceController.cs` lines 1066-1091 (default isolation transaction, no row lock); `Controllers/OrderController.cs` lines 538-560 (conversion check).
* Database: `InvoiceMaster.PaidAmount`, `CustomerOrder.quotationId`.
**Root Cause:** Check-then-act without concurrency control.
**Business Impact:** Overstated cash/understated AR; duplicate orders.
**Affected Areas:** Payments, quote conversion.
**Recommended Fix:** Use row locking or optimistic concurrency, and disable buttons while a request is in flight.
**Why further verification is needed:** Depends on timing and the database isolation level; not reproducible statically.

---

### BUG-SALES-032 — Cancelled or Draft orders can still be shipped and invoiced
**Severity:** Medium. Goods could be shipped and billed against an order marked Cancelled.
**Status:** Potential
**Test Area:** 3.2 / 3.3 / 3.4 Business logic (order statuses)
**Description:** `CreateShipment` and `CreateInvoice` never read `CustomerOrder.Status`. No code was found in the Ship/Invoice actions that blocks them for a Cancelled order.
**Steps to Reproduce:**
1. Set an order to Cancelled; open it and click Ship/Invoice, or call the APIs.
**Expected:** Blocked for Cancelled orders.
**Actual:** Accepted (by code reading).
**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Orders/CustomerOrderSlideout.tsx` lines 882-945 (batch ship/invoice handlers).
* Backend: `Cimmple_API/CimmpleAPI/Controllers/ShippingController.cs` lines 110-238; `InvoiceController.cs` lines 100-395.
* Database: `CustomerOrder.Status`.
**Root Cause:** No status gate in the Sales workflow endpoints.
**Business Impact:** Shipping and billing on cancelled orders.
**Affected Areas:** Shipments, invoices.
**Recommended Fix:** Reject shipments/invoices for Cancelled orders (and define the rule for Draft).
**Why further verification is needed:** The matrix does not state that Cancelled blocks shipping; the business rule must be confirmed, and the UI may hide the buttons in ways not visible statically.

---

### BUG-SALES-033 — Quotation/order TotalAmount is stored from the client instead of being recalculated
**Severity:** Low. A wrong client total is persisted and shown in lists and reports.
**Status:** Potential
**Test Area:** 3.1 Business logic (TotalAmount = sum of line nets); 3.2 Create/Update
**Description:** `SaveQuotation` and `SaveOrder` write `request.TotalAmount` directly; the server never recomputes it from the lines.
**Steps to Reproduce:**
1. POST `SaveOrder` with lines totalling 900 and `TotalAmount: 10`.
**Expected:** Stored total 900.
**Actual:** Stored total 10.
**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Orders/CustomerOrderSlideout.tsx` lines 780-791 (client total).
* Backend: `Cimmple_API/CimmpleAPI/Controllers/QuotationController.cs` line 399; `OrderController.cs` line 616.
* Database: `QuotationOrder.TotalAmount`, `CustomerOrder.TotalAmount`.
**Root Cause:** Trusting a derived value from the client.
**Business Impact:** Incorrect totals in lists, pipeline and sales reports.
**Affected Areas:** CQ/CO lists, reports.
**Recommended Fix:** Recompute the total server-side using the shared line-net rule.
**Why further verification is needed:** The UI computes the total correctly in normal use; impact depends on whether reports read the stored total or recompute it.

---

### BUG-SALES-034 — Voided invoices can be printed and emailed without any VOID marking
**Severity:** Low. A customer could receive a voided invoice that looks valid.
**Status:** Potential
**Test Area:** 3.4 PDF / Email
**Description:** `DocumentPdfService.BuildInvoiceAsync` and the invoice template contain no void or paid indicator, and the PDF/email endpoints do not check `IsVoided`.
**Steps to Reproduce:**
1. Void an invoice, then preview the PDF and send it by email.
**Expected:** Blocked, or clearly marked VOID.
**Actual:** Generated as a normal invoice (by code reading).
**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Orders/CustomerInvoiceDetailModal.tsx` (PDF/email actions).
* Backend: `Cimmple_API/CimmpleAPI/Services/Pdf/DocumentPdfService.cs` lines 237-344; `Controllers/PdfController.cs` lines 17-57; `Controllers/DocumentEmailController.cs` lines 100-112.
* Database: `InvoiceMaster.IsVoided`.
**Root Cause:** The document builder ignores invoice state.
**Business Impact:** Customer confusion; possible duplicate payment.
**Affected Areas:** Invoice PDF and email.
**Recommended Fix:** Watermark voided invoices or block sending them.
**Why further verification is needed:** The UI might hide PDF/email for voided invoices in a way not traced; confirm in the browser.

---

### BUG-SALES-035 — Job Order "Completed" check is case-insensitive in the UI but exact in the API
**Severity:** Low. A JO stored as "completed" or "COMPLETED" passes the UI check but fails the API with a confusing error.
**Status:** Potential
**Test Area:** 3.3 Validation (JO status must be exactly "Completed")
**Description:** `isJobOrderCompleted` in the order slideout compares case-insensitively; `CreateShipment` requires `Status == "Completed"` exactly.
**Steps to Reproduce:**
1. Have a JO whose status is stored with different casing; ship its line.
**Expected:** Consistent behaviour.
**Actual:** UI enables shipping; API rejects with "Job Order ... is not completed. Status: completed".
**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Orders/CustomerOrderSlideout.tsx` lines 861-866.
* Backend: `Cimmple_API/CimmpleAPI/Controllers/ShippingController.cs` lines 135-139.
* Database: `JobOrderMaster.Status`.
**Root Cause:** Inconsistent comparison rules.
**Business Impact:** Blocked shipments with a misleading error.
**Affected Areas:** Shipping.
**Recommended Fix:** Normalise JO status values or compare consistently.
**Why further verification is needed:** Depends on whether any code path stores non-canonical casing.

---

### BUG-SALES-036 — Quotation/order attachment uploads have no server-side size or file-type limits
**Severity:** Low. Hardening: the 5 MB limit and allowed types exist only in the browser component.
**Status:** Potential
**Test Area:** 3.1 / 3.2 Attachments
**Description:** `AttachmentUploadSection` shows "Max {maxSizeMb} MB" and an `accept` list, but `QuotationSaveFile` and the order upload path contain no size or extension checks. `FileUniqueno` is also computed as a global maximum + 1 without locking.
**Steps to Reproduce:**
1. POST a 25 MB `.exe` to `/Quotation/QuotationSaveFile` directly.
**Expected:** Rejected.
**Actual:** Accepted (by code reading), subject only to the web server's request size limit.
**Evidence:**
* Frontend: `Cimmple_UI/src/Common/Components/AttachmentUploadSection.tsx` lines 234, 296.
* Backend: `Cimmple_API/CimmpleAPI/Controllers/QuotationController.cs` lines 3800-3930 (no size/extension checks; `FileUniqueno` max 3873-3877), 862-866.
* Database: `QuotationOrderAttachment`, `OrderAttachment`.
**Root Cause:** Client-only limits.
**Business Impact:** Storage abuse; unsafe file types stored and served.
**Affected Areas:** CQ/CO attachments.
**Recommended Fix:** Enforce size and allowed extensions server-side.
**Why further verification is needed:** Server/Azure upload limits configured outside the controller may reject large files; a shared attachment policy may be owned by another module.

---

## Needs Manual Verification

1. **Area:** Database constraints (`InvoiceMaster`, `Shipping`, `CustomerOrder`, `QuotationOrder`).
   **What to Test:** Inspect the live SQL schema for unique indexes on document numbers and foreign keys between details and headers.
   **Expected:** Unique per-tenant document numbers; FKs prevent orphan detail rows.
   **Why Manual Testing Is Required:** The EF models declare no indexes or relationships, but the database may have been created or altered by scripts not in the repo.

2. **Area:** Period lock end to end (10.1 Customer Payment → Bank Reconciliation; 10.4 Period Close).
   **What to Test:** Close a period, then try invoice create, payment, void and delete with dates inside and outside it; confirm the payment appears unreconciled in Bank Reconciliation and reconciles.
   **Expected:** Postings into closed periods are rejected; payments appear once in the right bank.
   **Why Manual Testing Is Required:** Requires data and the bank reconciliation UI (owned by Accounting); BUG-SALES-001/002 predict specific failures to confirm.

3. **Area:** GL report tie-out after void and partial payments.
   **What to Test:** Create, partially pay and void invoices; compare AR aging, P&L revenue and the AR GL balance.
   **Expected:** Reports agree.
   **Why Manual Testing Is Required:** Needs real postings and report output.

4. **Area:** PDF letterhead per site and email delivery (3.1–3.4 PDF/Email).
   **What to Test:** Generate quote/order/shipment/invoice PDFs for orders at different sites; send by email and check the outbox and delivery.
   **Expected:** Correct site logo/address; email delivered with the attachment.
   **Why Manual Testing Is Required:** Depends on stored logos, SMTP configuration and the hosted outbox service.

5. **Area:** Route permissions and sidebar (`/quotations/customer`, `/orders/customer`, `/orders/customer-shipments`, `/orders/customer-invoices`).
   **What to Test:** Users without each permission open the route directly and via the sidebar.
   **Expected:** Route is hidden and blocked.
   **Why Manual Testing Is Required:** Permission data is configuration-driven; server-side enforcement is tracked by Roles & Permissions.

6. **Area:** Responsive layout (375/390/430 px) and Esc close for lists, wide slideouts, price matrix popup, shipping/invoice/payment modals.
   **What to Test:** Open each screen on phone widths; press Esc on each modal.
   **Expected:** Usable layouts, sticky save bar visible, Esc closes the top modal.
   **Why Manual Testing Is Required:** Visual behaviour; the invoice modal uses fixed four-column inline grids that may be cramped. Esc relies on the global handler installed in `App.tsx`, which cannot be confirmed statically for every modal.

7. **Area:** Client-side sorting, pagination, column chooser and page-size persistence on the four list pages.
   **What to Test:** Sort each column, change page size, hide columns, reload.
   **Expected:** Correct ordering (including dates and amounts) and persisted preferences.
   **Why Manual Testing Is Required:** Behaviour of the shared table component with real data.

8. **Area:** Customer picker in CQ/CO (10.1 Customer → Customer Quotation).
   **What to Test:** Mark a customer inactive; open a new quote/order and the customer dropdown.
   **Expected:** Inactive customers are not selectable; customer delete is blocked by quotes.
   **Why Manual Testing Is Required:** `CustomerService.GetCustomerlist` filtering is owned by the Customer module and depends on data.

9. **Area:** Job Order status values in production data.
   **What to Test:** Query distinct `JobOrderMaster.Status` values.
   **Expected:** Only canonical values (for example exactly "Completed").
   **Why Manual Testing Is Required:** Determines whether BUG-SALES-035 occurs in practice.

10. **Area:** Attachment upload limits in the deployed environment.
    **What to Test:** Upload files above 5 MB and disallowed types directly to the quotation/order upload endpoints.
    **Expected:** Rejected.
    **Why Manual Testing Is Required:** Web server and storage limits are deployment configuration (see BUG-SALES-036).

## No Issues Found

* **List location filters:** `GetQuotations`, `GetOrders`, `GetAllShipments` and `GetAllInvoices` use `TryResolveListLocationFilter`; shipments and invoices filter by the parent order's location (`ShippingController.cs` 421-431; `InvoiceController.cs` 650-659).
* **CQ/CO detail 403:** `GetQuotationById` (136-140) and `GetOrderById` (299-302) return 403 for a non-allowed location, and the slideouts handle 403.
* **Second conversion blocked:** `SaveOrder` rejects a new order for a quotation that already has one (`OrderController.cs` 538-560), and conversion sets `isConverted`/`convertedOrderId` (660-671).
* **Order delete resets the quote:** `DeleteOrder` sets the quotation back to Draft and clears the conversion fields (`OrderController.cs` 1643-1654).
* **Order delete guards:** `DeleteOrder` blocks when shipments, non-voided invoices or Job Orders exist.
* **Quotation delete guards:** impact check and delete block when the quotation is converted or referenced by an order (`QuotationController.cs` 604-637, 945-966).
* **Shipment requires a Completed JO:** `CreateShipment` rejects lines whose JO status is not "Completed" (135-139).
* **FG issue at shipment:** transaction type 2, reference "CustomerShipment", `allowShortage: true`; location chain = JO's last receipt location → order location → first location (`ShippingController.cs` 693-773), as the matrix states.
* **Shipment delete reverses FG issue** inside a transaction (`ShippingController.cs` 645-673).
* **Courier and ship date required** in `ShippingModal.tsx` (297-318); quantity clamped to remaining (247-273).
* **Invoice journal is balanced:** Dr AR = net + tax + freight + other; Cr Revenue, Tax, Freight, Other (`InvoiceController.cs` 329-375); missing default accounts return clear errors (295-301).
* **Due date ≥ invoice date** enforced in UI (`InvoiceModal.tsx` 494-503) and API (`InvoiceController.cs` 111-114); **tax rate 0–100** enforced (153-155).
* **Payment ≤ balance and > 0** enforced (`InvoiceController.cs` 1086-1091); payment posts Dr Bank / Cr AR with an `ARPMT-` reference unique per payment (1182-1195, 1250-1256), writes a `Transactions` row with `isCustomer = 1` (1197-1214) and a GL audit event (1216).
* **Void/delete blocked when paid; void/delete reverse the `ARINV-` journal** (`InvoiceController.cs` 844-853, 914-923).
* **Payments blocked on voided invoices** (1079).
* **Tenant filtering on JWT-based endpoints:** shipment and invoice GET/create/void/payment endpoints filter by `GetTenantId()`.
* **Deep links:** `?search`, `?open`, `?startDate`, `?endDate`, `?dateRange` on Customer Invoices and Customer Shipments (`CustomerInvoices.tsx` 411-451; `CustomerShipments.tsx` 44-57); custom range guards start ≤ end (`CustomerInvoices.tsx` 395-409).
* **Default date preset:** shipments and invoices default to Last 30 Days on the server (`ShippingController.cs` 474-476).

## QA Coverage

| Test Area | Tested | Result |
| --- | --- | --- |
| Navigation | Partial | Pass (deep links); Manual (route permissions, sidebar) |
| CRUD | Yes | Fail (BUG-SALES-003, BUG-SALES-015, BUG-SALES-016, BUG-SALES-017, BUG-SALES-018, BUG-SALES-020) |
| Search | Yes | Fail (BUG-SALES-025) |
| Filters | Yes | Fail (BUG-SALES-022, BUG-SALES-023, BUG-SALES-025) |
| Sorting | Partial | Manual |
| Pagination | Partial | Manual |
| Validation | Yes | Fail (BUG-SALES-007, BUG-SALES-008, BUG-SALES-014, BUG-SALES-019, BUG-SALES-021) |
| Permissions | Partial | Manual; server-side role checks tracked in Cross-Module Concerns |
| API | Yes | Fail (BUG-SALES-026, BUG-SALES-028) |
| Database | Partial | Fail (BUG-SALES-006, BUG-SALES-009, BUG-SALES-029); Potential (BUG-SALES-030); Manual (constraints) |
| Business Logic | Yes | Fail (BUG-SALES-001, BUG-SALES-002, BUG-SALES-004, BUG-SALES-005, BUG-SALES-010, BUG-SALES-011, BUG-SALES-022, BUG-SALES-024); Potential (BUG-SALES-031, BUG-SALES-032, BUG-SALES-033) |
| Location | Yes | Fail (BUG-SALES-012, BUG-SALES-013) |
| Tenant | Yes | Pass for JWT endpoints; client-supplied tenant id tracked in Cross-Module Concerns |
| Cross-Module | Yes | Fail (BUG-SALES-003, BUG-SALES-004, BUG-SALES-011, BUG-SALES-012); Manual (bank reconciliation, period close) |
| Responsive/PWA | No | Manual |

## Matrix Checklist

### 3.1 Customer Quotations

| Matrix Row | Result | Notes |
| --- | --- | --- |
| FE List (`GetQuotations`) | Pass | Loads by tenant with site filter. |
| FE Search (CQ#, customer, contact) | Fail (BUG-SALES-025) | Contact is not searched. |
| FE Filter (status, date range, site) | Fail (BUG-SALES-025) | Status and site present; no date range. |
| FE Sort / Pagination / column chooser | Manual | Client-side table behaviour. |
| FE Add (lines, tiers, attachments, notes) | Partial | Works; server does not validate lines (BUG-SALES-014); attachment limits client-only (BUG-SALES-036). |
| FE Last lines (`GetLastOrderLinesByCustomer`) | Pass | Endpoint returns the customer's latest order lines by tenant. |
| FE Price matrix (`PriceBreakdownMatrixPopup`, `includeInPrint`) | Manual | Component present with `includeInPrint` flags; print output needs a browser. |
| FE Edit (read-only when Converted) | Fail (BUG-SALES-016, BUG-SALES-021) | Converted quotes stay editable; past-date rule blocks old quotes. |
| FE View / PDF | Manual | PDF letterhead per site needs runtime. |
| FE Duplicate | Pass | New CQ#, conversion fields cleared (`QuotationController.cs` 720-721). |
| FE Convert to Order | Partial | Works; second conversion blocked; race (BUG-SALES-031); non-atomic (BUG-SALES-015). |
| FE Attachments | Potential (BUG-SALES-036) | Upload/download/delete present; limits client-only. |
| FE Email | Manual | Outbox delivery. |
| FE Delete (impact dialog) | Pass | Blocks converted/referenced quotes. |
| FE Validation | Fail (BUG-SALES-014, BUG-SALES-021) | Client-only; past-date rule too broad. |
| FE Permissions | Manual | See Cross-Module Concerns. |
| FE Responsive | Manual | — |
| BE List | Pass | `TryResolveListLocationFilter`. |
| BE Get (403 on location) | Pass | 403 in `GetQuotationById`. |
| BE Create/Update (CQ# from 1000) | Fail (BUG-SALES-013, BUG-SALES-014, BUG-SALES-015) | Numbering starts at 1000; race is BUG-SALES-030. |
| BE Duplicate | Fail (BUG-SALES-013) | No location check. |
| BE Attachments / `CopyAttachmentsToOrder` | Potential (BUG-SALES-036) | Copies attachments to the order. |
| BE Delete (blocked if converted/referenced) | Pass | Location gap in BUG-SALES-013. |
| BE Validation (header, lines) | Fail (BUG-SALES-014) | Header only. |
| BE Authorization (tenant from request) | Cross-module | Client tenant id; see Cross-Module Concerns. |
| BL Manual statuses; Converted set by order save; order delete resets to Draft | Fail (BUG-SALES-016) | Reset to Draft passes; Converted can be set manually. |
| BL Second conversion blocked | Pass | Race in BUG-SALES-031. |
| BL `QuantityTiers` per line; TotalAmount = sum of line nets | Potential (BUG-SALES-033) | Total stored from the client. |

### 3.2 Customer Orders

| Matrix Row | Result | Notes |
| --- | --- | --- |
| FE List (`GetOrders`) | Pass | Status recomputed for display. |
| FE Search (CO#, customer, PO) | Fail (BUG-SALES-025) | Customer PO not searched. |
| FE Filter (8 statuses, date range, site) | Fail (BUG-SALES-025) | No date range. |
| FE Sort / Pagination | Manual | — |
| FE Add (deferred attachments, 5 MB) | Partial | Limit client-only (BUG-SALES-036). |
| FE Edit (line edits sync JO) | Fail (BUG-SALES-003, BUG-SALES-011, BUG-SALES-014) | Line removal deletes shipments; JO qty overwritten. |
| FE View tabs (lines, jobs, shipments, invoices) | Pass | Loaded from the three endpoints. |
| FE Create Job | Pass | JO qty = ordered − shipped on create. |
| FE Ship (`ShippingModal`) | Partial | UI guarded; API gaps in BUG-SALES-008. |
| FE Invoice (`InvoiceModal`) | Fail (BUG-SALES-004, BUG-SALES-005) | Voided qty not freed; amount discount repeated. |
| FE Duplicate | Pass | No location check (BUG-SALES-013). |
| FE Attachments | Potential (BUG-SALES-036) | — |
| FE PDF / Email | Manual | — |
| FE Delete (impact dialog, cascade) | Fail (BUG-SALES-017) | Voided invoice blocks deletion. |
| FE Validation | Fail (BUG-SALES-014) | Client-only; no shipped floor. |
| FE Permissions | Manual | — |
| FE Responsive | Manual | — |
| BE List (status recomputed) | Fail (BUG-SALES-004) | Recompute counts voided invoices. |
| BE Get (403 location) | Fail (BUG-SALES-020) | 403 works; PONumber fallback opens other orders. |
| BE Create/Update (marks quote Converted; syncs JO) | Fail (BUG-SALES-003, BUG-SALES-011, BUG-SALES-013, BUG-SALES-015) | — |
| BE Duplicate | Fail (BUG-SALES-013) | No location check. |
| BE Last lines | Pass | — |
| BE Delete (blocked by invoices, shipments, JOs; cascade; resets quote) | Fail (BUG-SALES-017) | Guards and reset pass; impact vs delete inconsistent. |
| BE Authorization (tenant from request) | Cross-module | See Cross-Module Concerns. |
| BL Statuses (8 values) | Fail (BUG-SALES-029) | Stored status stale. |
| BL Per-line `ShippedQty`, `ShippingStatus`, `InvoicedQty`, `InvoiceStatus` | Fail (BUG-SALES-004, BUG-SALES-008) | — |
| BL One JO per line; job qty = ordered − shipped | Fail (BUG-SALES-011) | Sync sets full ordered qty. |

### 3.3 Customer Shipments

| Matrix Row | Result | Notes |
| --- | --- | --- |
| FE List (`GetAllShipments`) | Pass | — |
| FE Search (client) | Pass | Searches shipment no., order and customer fields. |
| FE Filter (site, date range, default Last 30 Days) | Pass | — |
| FE Sort / Pagination | Manual | — |
| FE Add (from CO `ShippingModal`) | Partial | API gaps in BUG-SALES-008. |
| FE View (`CustomerShipmentDetailModal`) | Pass | Tenant-filtered detail. |
| FE Edit tracking (`UpdateShipmentTracking`) | Fail (BUG-SALES-026) | Endpoint does not exist. |
| FE PDF / Email (packing slip) | Manual | — |
| FE Delete (impact dialog) | Fail (BUG-SALES-010, BUG-SALES-028) | Invoiced shipments deletable; error swallowed. |
| FE Validation (courier, ship date; qty ≤ ordered − shipped) | Pass | UI enforced; server gaps in BUG-SALES-008. |
| FE Permissions | Manual | — |
| FE Responsive (Esc close) | Manual | Global Esc handler. |
| BE List (`GetAllShipments`, `GetShipments/{orderId}`) | Pass | — |
| BE Get (`GetShipmentDetails`, `GetShippableItems`) | Pass | Location gap in BUG-SALES-013. |
| BE Create (SH-yyyyMMdd-###, FG issue) | Fail (BUG-SALES-008, BUG-SALES-009) | — |
| BE Delete (reverses FG issue) | Fail (BUG-SALES-010) | FG reversal itself passes. |
| BE Validation (JO exactly Completed; qty limits) | Fail (BUG-SALES-008) | JO gate passes; casing in BUG-SALES-035. |
| BE Authorization (tenant from claim) | Pass | Delete/impact take tenant from query (Cross-Module Concerns). |
| BL FG issue type 2, "CustomerShipment", `allowShortage` | Pass | Negative stock behaviour belongs to Inventory. |
| BL Issue location chain | Pass | — |
| BL Updates line `ShippedQty`/`ShippingStatus` and order status | Fail (BUG-SALES-029) | Order status overwrites invoicing states. |

### 3.4 Customer Invoices (incl. customer payments)

| Matrix Row | Result | Notes |
| --- | --- | --- |
| FE List (`GetAllInvoices`) | Pass | Line-less invoices hidden (BUG-SALES-007). |
| FE Search (client; `?search`) | Pass | — |
| FE Filter (status values, date range, deep-link params) | Fail (BUG-SALES-022, BUG-SALES-023) | No Partially Paid; Overdue a day early. |
| FE Sort / Pagination | Manual | — |
| FE Add (tax %, freight, other, due date, GL defaults) | Fail (BUG-SALES-001, BUG-SALES-005, BUG-SALES-027) | — |
| FE View (detail modal; `?open`) | Pass | Removed order lines vanish from detail (BUG-SALES-003). |
| FE Record payment (bank, amount, date; partial) | Fail (BUG-SALES-002, BUG-SALES-019) | — |
| FE Void | Fail (BUG-SALES-024) | Hidden for Overdue. |
| FE PDF / Email | Potential (BUG-SALES-034) | No VOID marking. |
| FE Legacy service calls (`UpdateInvoicePayment`, `PrintInvoice`) | Fail (BUG-SALES-026) | Endpoints do not exist; unused. |
| FE Delete (impact dialog) | Pass | Blocked when paid or voided. |
| FE Validation (due ≥ invoice date; 0 < qty ≤ shipped − invoiced; tax 0–100; payment ≤ balance) | Fail (BUG-SALES-007) | UI checks pass; API bypass. |
| FE Permissions | Manual | — |
| FE Responsive | Manual | — |
| BE List (`GetAllInvoices`, `GetInvoices/{orderId}`) | Pass | — |
| BE Get (`GetInvoiceDetails`, `GetInvoiceableItems`) | Fail (BUG-SALES-004, BUG-SALES-005) | — |
| BE Create (INV-yyyy-####, AR posting) | Fail (BUG-SALES-001, BUG-SALES-006, BUG-SALES-007, BUG-SALES-012) | Journal balanced. |
| BE Payment (`ARPMT-`, `PaidAmount`, `Transactions`, `GlAuditEvents`) | Fail (BUG-SALES-002, BUG-SALES-019) | Postings and audit present. |
| BE Void (blocked if paid; reverses JE) | Fail (BUG-SALES-004, BUG-SALES-006) | Guard and reversal present. |
| BE Delete (blocked if paid; reverses JE) | Pass | Orphan risk via BUG-SALES-006. |
| BE Validation (period open, GL defaults) | Fail (BUG-SALES-001, BUG-SALES-002) | GL default checks pass. |
| BE Authorization (tenant from claim) | Pass | Delete/impact use query tenant (Cross-Module Concerns). |
| BL Total = net + tax + freight + other; balance = total − paid | Pass | — |
| BL GL on create (Dr AR; Cr Revenue/Tax/Freight/Other, `ARINV-`) | Fail (BUG-SALES-012) | Amounts correct; location wrong. |
| BL Payment Dr Bank / Cr AR | Fail (BUG-SALES-002) | Period wrong. |
| BL Voided invoice frees quantity | Fail (BUG-SALES-004) | — |
| BL Accounting period stamped on invoice | Fail (BUG-SALES-001) | Stamped from server clock. |

### 10.1 Sales workflow

| Matrix Row | Result | Notes |
| --- | --- | --- |
| Customer → Customer Quotation | Manual | Inactive customer filtering and delete block owned by Customer module. |
| Customer Quotation → Customer Order | Fail (BUG-SALES-015, BUG-SALES-016) | Partial lines, attachments, second-conversion block and reset pass; race in BUG-SALES-031. |
| Customer Order → Job Order | Fail (BUG-SALES-011) | One JO per line and delete block pass. |
| Job Order → Finished Goods | N/A | Owned by Job Orders / Inventory. |
| Customer Order / Job Order → Shipment | Fail (BUG-SALES-008, BUG-SALES-010) | JO gate, FG issue and delete reversal pass. |
| Shipment → Customer Invoice | Fail (BUG-SALES-004, BUG-SALES-005, BUG-SALES-007) | `ARINV-` posted. |
| Customer Invoice → Customer Payment | Fail (BUG-SALES-002, BUG-SALES-018) | Partial/full, statuses and `ARPMT-` pass. |
| Customer Payment → Bank Reconciliation | Manual | `Transactions` row written; reconciliation needs runtime. |

## Cross-Module Concerns

| Concern | Owner | Affected Sales endpoints / code |
| --- | --- | --- |
| Client-supplied `tenantId` trusted (query/body/localStorage) | `QA_TenantLocationFramework.md` | `QuotationController`: `GetQuotations` (39), `GetQuotationById` (123), `SaveQuotation` (347-350), `CheckQuotationDeletionImpact` (560), `DuplicateQuotation` (679), `CopyAttachmentsToOrder` (826-830), `DeleteQuotation` (931), attachment endpoints (3828, 3839-3842, 3936-3940, 3998-4008, 4061, 4117). `OrderController`: `GetOrders` (41), `GetLastOrderLinesByCustomer` (201), `GetOrderById` (278), `SaveOrder` (518-521), `CheckOrderDeletionImpact` (1446), `DeleteOrder` (1601), `DuplicateOrder` (1674). `ShippingController`: `CheckShipmentDeletionImpact` (520), `DeleteShipment` (607). `InvoiceController`: `CheckInvoiceDeletionImpact` (717), `DeleteInvoice` (897). `PdfController` `Generate*` (17-57). `DocumentEmailController` (102). |
| No server-side role/permission enforcement | `QA_RolesPermissions.md` | Every endpoint in `QuotationController`, `OrderController` (customer endpoints), `ShippingController`, `InvoiceController` (including `RecordCustomerPayment`, `VoidInvoice`, `DeleteInvoice`) requires authentication only. |
| Vendor-portal token access | `QA_VendorPortal.md` | Not applicable to Sales endpoints. |
| FG issue with `allowShortage: true` can drive FG negative | `QA_Inventory.md` | `ShippingController.IssueFinishedGoodsForShipmentAsync` (771). |
| Fuzzy GL account fallback (bank/cash) | `QA_Accounting.md` | `GlAccountResolutionService.ResolveBank` (256-295), used by `RecordCustomerPayment`; Sales-side validation gap is BUG-SALES-019. |
| Journal reversal uses today's period and the latest unreversed entry by reference | `QA_Accounting.md` | `GlWorkflowService.TryReverseJournalByReference` (131-211), used by `VoidInvoice` / `DeleteInvoice`; Sales-side duplicate reference is BUG-SALES-006. |
