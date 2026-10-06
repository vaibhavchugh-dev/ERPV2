# QA — Manufacturing (Job Orders / Production) -t

| Module | Matrix section | Bug ID prefix | Tested | Confirmed Bugs | Potential Bugs | Manual Verification |
| --- | --- | --- | --- | --- | --- | --- |
| Manufacturing (Job Orders / Production) | 5.2 | BUG-MFG | Yes | 11 | 7 | 6 |

Source of test cases: `QA_TEST_MATRIX.md`. Method: static trace of the actual implementation (React UI → service → Axios → .NET controller → service/repository → EF Core → SQL Server, and back). No application code, configuration or database is changed during QA. Findings that depend on deployed configuration, data or a real browser go under **Needs Manual Verification**.

Severity scale:
- **Critical**: security breach, data corruption, financial corruption, or a blocked core workflow.
- **High**: a major feature is broken or a significant security control is bypassed, with a workaround that is hard or unavailable.
- **Medium**: a feature works incorrectly in specific conditions, or a security control is weaker than configured.
- **Low**: cosmetic, minor UX, or an informational/hardening issue.

---

## Confirmed Bugs

### BUG-MFG-001 — Job order attachments overwrite, serve and delete other job orders' files
**Severity:** Critical. Uploaded documents (drawings, travellers) of one job are silently replaced or deleted by actions on another job — data corruption.
**Status:** Confirmed
**Test Area:** Attachments
**Description:** `JobOrderSaveFile` names each blob `{nextFileUniqueNo}{ext}`, where `nextFileUniqueNo` is a per-job counter starting at 1, and stores it in the tenant-wide folder `data/{tenantId}/JobOrders/`. Every job's first PDF is therefore `1.pdf` in the same folder. Download resolves the blob by that name and deleting an attachment deletes that shared name.
**Steps to Reproduce:**
1. In job A, upload `drawingA.pdf` (stored as `1.pdf`).
2. In job B, upload `drawingB.pdf` (also stored as `1.pdf`, overwriting A's blob).
3. Download the attachment from job A.
4. Delete the attachment in job B, then download from job A again.
**Expected:** Each job keeps its own file.
**Actual:** Step 3 returns drawing B; after step 4, job A's attachment is gone from storage while its metadata remains.
**Evidence:**
- Frontend: `Cimmple_UI/src/Common/Services/JobOrderService.ts` lines 701-744 (upload).
- Backend: `Cimmple_API/CimmpleAPI/Controllers/JobOrderController.cs` lines 805-808 (counter per job), 821-827 (blob name and folder), 936-943 (`JobOrderGetFile` resolves by name), 1009-1020 (`ProcessDeletedJobOrderAttachments` deletes by name).
- Backend: `Cimmple_API/CimmpleAPI/Utilities/ModuleFileStorage.cs` lines 15 and 29-45 (path `data/{tenantId}/{moduleFolder}/{blobName}`).
- Database: `JobOrderMaster.AttachmentsJson` (metadata only).
**Root Cause:** Blob names are not unique across jobs (no job id or GUID in the path).
**Business Impact:** Wrong drawings can be used on the shop floor; documents are lost.
**Affected Areas:** Job order attachments upload, download, delete.
**Recommended Fix:** Include the job id and a GUID in the blob path (for example `JobOrders/{jobOrderId}/{guid}{ext}`) and migrate existing names.

---

### BUG-MFG-002 — Reopening a step on a Partially Shipped/Shipped job loses finished goods and can consume unrelated stock
**Severity:** Critical. Finished-goods inventory is reduced and never restored, and repeated saves issue stock that did not come from this job — inventory corruption.
**Status:** Confirmed
**Test Area:** Business Logic / Steps reopen / FG inventory
**Description:** For a job with status Partially Shipped or Shipped, any save where a step is not Completed sets `stepsReopenedUnderShip`. The reversal issues `net FG − ShippedQty`, and when that is 0 but on-hand stock exists, it issues `min(net, onHand)` instead. Because shipment issues use the CustomerShipment reference, net FG for the job stays at the received quantity, so the second save of the reopened step issues more stock. When the step is completed again, `DeriveJobStatus` keeps the shipping status (it is "authoritative"), so `nowCompleted` is false and no re-receipt is made.
**Steps to Reproduce:**
1. Job for 10 units: complete all steps (FG receipt 10). Ship 4 (status Partially Shipped; on hand 6).
2. Reopen the last step and save (reversal issues 6; on hand 0).
3. Start or pause the reopened step (another save while reopened). With other stock of the same product at that location (for example 5 from another job), the fallback issues `min(4, 5)` = 4.
4. Complete the step again.
**Expected:** Reopen reverses only this job's remaining FG (matrix: "reopen reverses net FG − shipped"), and re-completion restores it.
**Actual:** Step 2 removes 6; step 3 removes 4 units that belong to other work; step 4 receives nothing. Job status stays Partially Shipped.
**Evidence:**
- Frontend: `Cimmple_UI/src/Modules/JobOrders/JobOrderSlideout.tsx` lines 1764-1796 (reopen with no job-status check) and 3471-3480 (Reopen shown for any completed step).
- Backend: `Cimmple_API/CimmpleAPI/Controllers/JobOrderController.cs` lines 473-475 (status derived from client status), 1540-1553 (`stepsReopenedUnderShip`), 1559-1569 (re-receipt only when `nowCompleted`), 1619-1650 (reversal and on-hand fallback), 1373-1387 (`NetFinishedGoodsQtyAsync` ignores shipment issues), 1098-1101 (`IsCompletedStatus` = "Completed" only).
- Backend: `Cimmple_API/CimmpleAPI/Utilities/JobOrderTrackingHelper.cs` lines 74-77 (shipping statuses returned unchanged).
- Database: `InventoryTransaction` (type 2, `ReferenceType = 'JobOrder'`), `InventoryBalance`.
**Root Cause:** The reopen reversal is not idempotent and its fallback is not limited to this job's stock, and the completion path cannot fire for shipping statuses.
**Business Impact:** FG balances and valuation become wrong; other orders can be short-shipped.
**Affected Areas:** Job Orders, FG inventory, Shipments, inventory reports.
**Recommended Fix:** Make the reversal idempotent (reverse only once per reopen, tracked per job), remove the on-hand fallback, and treat "all steps completed" as completion for shipping-status jobs so FG is re-received.

---

### BUG-MFG-003 — Users can set a job to Shipped or Partially Shipped manually, which then locks the status
**Severity:** Medium. Status no longer reflects shipments; reservations are released without shipping.
**Status:** Confirmed
**Test Area:** Edit / Status derivation
**Description:** The slideout's status dropdown offers Partially Shipped and Shipped. `SaveJobOrder` passes the client status to `DeriveJobStatus`, which treats these values as authoritative, so later step progress cannot change it. Saving as Shipped also releases the job's reservations.
**Steps to Reproduce:**
1. Open a Draft or In Progress job; set Status = Shipped; save.
2. Complete or reopen steps.
**Expected:** Shipping statuses come only from shipments (comment in `JobOrderTrackingHelper.cs` 74; matrix: "JO completion → FG Inventory → Shipment (requires Completed)").
**Actual:** The job shows Shipped with nothing shipped, its reservations are released, and the status never changes from step progress.
**Evidence:**
- Frontend: `Cimmple_UI/src/Modules/JobOrders/JobOrderSlideout.tsx` lines 2582-2600.
- Backend: `Cimmple_API/CimmpleAPI/Controllers/JobOrderController.cs` lines 473-475 and 509-516; `Cimmple_API/CimmpleAPI/Utilities/JobOrderTrackingHelper.cs` lines 74-77.
**Root Cause:** Shipping statuses are user-selectable and accepted from the client.
**Business Impact:** Misleading production status; material reserved for the job is freed.
**Affected Areas:** Job Orders list/filters, Dashboard production status, reservations.
**Recommended Fix:** Remove the shipping statuses from the dropdown and ignore them in `SaveJobOrder` unless they already match the stored value.

---

### BUG-MFG-004 — Produced quantity is not capped on the server; FG can be received above the ordered quantity
**Severity:** Medium. Over-receipt of finished goods inflates stock.
**Status:** Confirmed
**Test Area:** Validation / Steps complete
**Description:** The UI limits produced quantity to the order quantity, but `ResolveFinishedQty` takes the last step's `qtyProduced` without a cap, and the completion receipt posts that amount.
**Steps to Reproduce:**
1. Job with `QtyOrdered` = 10.
2. POST `/api/JobOrder/SaveJobOrder` with all steps Completed and the last step `qtyProduced` = 50.
**Expected:** Rejected or capped (matrix validation: "produced qty limits").
**Actual:** FG receipt of 50.
**Evidence:**
- Frontend: `Cimmple_UI/src/Common/Services/JobOrderService.ts` lines 363-397 (cap at 389-394).
- Backend: `Cimmple_API/CimmpleAPI/Controllers/JobOrderController.cs` lines 1111-1120 and 1559-1605.
- Database: `InventoryTransaction` (type 1, `ReferenceType = 'JobOrder'`).
**Root Cause:** Client-only validation.
**Business Impact:** Phantom finished goods available to ship and value.
**Affected Areas:** FG inventory, shipments, valuation.
**Recommended Fix:** Validate `qtyProduced` against `QtyOrdered` in `SaveJobOrder`.

---

### BUG-MFG-005 — SaveJobOrder accepts zero/negative quantity and lets the client rewrite the order link and part
**Severity:** Medium. Jobs can be saved with invalid quantities or re-pointed to another order line.
**Status:** Confirmed
**Test Area:** Validation / Update
**Description:** `SaveJobOrder` copies `QtyOrdered`, `CustomerOrderID`, `CustomerOrderDetailID`, `PartNo` and `PartName` from the request with no checks.
**Steps to Reproduce:**
1. POST `/api/JobOrder/SaveJobOrder` for an existing job with `QtyOrdered: 0` (or −5), or a different `CustomerOrderDetailID`.
**Expected:** 400 for quantity ≤ 0 (matrix: "Qty > 0"); order link immutable after creation.
**Actual:** Saved.
**Evidence:**
- Backend: `Cimmple_API/CimmpleAPI/Controllers/JobOrderController.cs` lines 360-371.
- Database: `JobOrderMaster.QtyOrdered`, `CustomerOrderDetailID` (no unique index or check constraint).
**Root Cause:** No server-side validation.
**Business Impact:** Broken order ↔ job relationships; FG and shipment quantities against the wrong line.
**Affected Areas:** Job Orders, Customer Orders, Shipments.
**Recommended Fix:** Validate quantity > 0 and keep order/detail/part fields read-only after creation.

---

### BUG-MFG-006 — Job order detail has no site (location) check
**Severity:** Medium. Site-restricted users can open any job in the tenant by id.
**Status:** Confirmed
**Test Area:** Location / Edit
**Description:** `GetJobOrders` filters by the customer order's location, but `GetJobOrderById` only filters by tenant. Opening `/job-orders?open={id}` loads any job.
**Steps to Reproduce:**
1. Log in as a user restricted to site A.
2. Navigate to `/job-orders?open={id}` for a job whose customer order is at site B.
**Expected:** 403, as the customer order detail does for other sites.
**Actual:** The job, routing, materials and attachments load.
**Evidence:**
- Frontend: `Cimmple_UI/src/Modules/JobOrders/JobOrders.tsx` lines 41-85 (`?open=` handling).
- Backend: `Cimmple_API/CimmpleAPI/Controllers/JobOrderController.cs` lines 42-143 (list filters by location at 50-74) and 172-279 (detail without location check).
**Root Cause:** The location guard was not applied to the detail endpoint.
**Business Impact:** Site isolation is weaker than configured.
**Affected Areas:** Job order slideout, deep links, PDF/email by id.
**Recommended Fix:** Resolve the job's location via its customer order and call `CanAccessLocation`.

---

### BUG-MFG-007 — Inventory failure message says "Job saved" although the save was rolled back
**Severity:** Low. Misleading message; users may believe changes were kept.
**Status:** Confirmed
**Test Area:** Update / Error handling
**Description:** `ApplyFinishedGoodsInventoryAsync` returns messages starting "Job saved but …", and `SaveJobOrder` then rolls back the whole transaction and returns 400.
**Steps to Reproduce:**
1. Complete all steps on a job whose customer order has no location and no fallback location exists.
**Expected:** A message that the job was not saved.
**Actual:** "Job saved but finished-goods inventory failed: …" while nothing was saved.
**Evidence:**
- Backend: `Cimmple_API/CimmpleAPI/Controllers/JobOrderController.cs` lines 501-507 (rollback), 1607, 1628, 1632, 1667 (messages).
**Root Cause:** Message text predates the transactional rollback.
**Business Impact:** Confusion; lost step updates.
**Affected Areas:** Job order step completion and reopen.
**Recommended Fix:** Change the messages to state that the job was not saved and why.

---

### BUG-MFG-008 — Server errors return stack traces to the client
**Severity:** Low. Information disclosure (hardening).
**Status:** Confirmed
**Test Area:** API
**Description:** Several catch blocks return `stackTrace = ex.StackTrace` in the 500 response body.
**Steps to Reproduce:**
1. Trigger an exception in `SaveJobOrder` (for example malformed dates or a database error).
**Expected:** A generic error message.
**Actual:** The response includes the stack trace.
**Evidence:**
- Backend: `Cimmple_API/CimmpleAPI/Controllers/JobOrderController.cs` lines 549, 635, 709, 882.
**Root Cause:** Debug-style error handling.
**Business Impact:** Leaks internal paths and structure.
**Affected Areas:** SaveJobOrder, CreateJobOrderFromOrderDetail, CheckJobOrderDeletionImpact, JobOrderSaveFile.
**Recommended Fix:** Log the stack trace server-side and return a generic message.

---

### BUG-MFG-009 — Pause reason is optional although the matrix requires it
**Severity:** Low. Requirement mismatch; hold reasons are missing from step history.
**Status:** Confirmed
**Test Area:** Steps / Validation
**Description:** The matrix lists "pause with reason" and "pause reason required". The pause dialog is labelled "Optional hold reason (you can skip)" and has a "Pause without reason" button.
**Steps to Reproduce:**
1. Start a step; click Pause; click "Pause without reason".
**Expected:** A reason is required.
**Actual:** The step pauses with no reason.
**Evidence:**
- Frontend: `Cimmple_UI/src/Modules/JobOrders/JobOrderSlideout.tsx` lines 1652-1676 and 4295-4340.
**Root Cause:** The UI was designed with an optional reason.
**Business Impact:** Downtime analysis lacks reasons.
**Affected Areas:** Step tracking.
**Recommended Fix:** Confirm the requirement with the product owner; if required, make the reason mandatory in the UI and validate it in `SaveJobOrder`.

---

### BUG-MFG-010 — Job order list has no due-date filter
**Severity:** Low. Listed filter missing; workaround is sorting.
**Status:** Confirmed
**Test Area:** Filters
**Description:** The matrix lists "Filter: Status, site, due date". The page offers site, status, priority and material filters only.
**Steps to Reproduce:**
1. Open `/job-orders` and look for a due-date filter.
**Expected:** A due-date filter.
**Actual:** None.
**Evidence:**
- Frontend: `Cimmple_UI/src/Modules/JobOrders/JobOrders.tsx` lines 191-235 and the filter bar.
**Root Cause:** Not implemented.
**Business Impact:** Harder to find late jobs.
**Affected Areas:** Job Orders list.
**Recommended Fix:** Add a due-date range or "overdue" filter.

---

### BUG-MFG-011 — Job order attachment upload has no file type or size validation
**Severity:** Low. Hardening gap; any file type and size can be uploaded.
**Status:** Confirmed
**Test Area:** Attachments / Validation
**Description:** `JobOrderSaveFile` accepts any extension and length; NCR photos, by contrast, validate both.
**Steps to Reproduce:**
1. Upload a large `.exe` or `.html` file to a job order.
**Expected:** Rejected according to an allow-list and size limit (internal consistency with NCR uploads).
**Actual:** Accepted and later served back with an inferred content type.
**Evidence:**
- Backend: `Cimmple_API/CimmpleAPI/Controllers/JobOrderController.cs` lines 717-883 (no checks before upload at 812-829); compare `QualityController.cs` 1804-1882.
**Root Cause:** Missing validation.
**Business Impact:** Storage abuse; potentially harmful files distributed to shop-floor users.
**Affected Areas:** Job order attachments.
**Recommended Fix:** Add an extension allow-list and a maximum size.

---

## Potential Bugs

### BUG-MFG-012 — Concurrent "Create Job Order" on the same order line can create duplicate jobs
**Severity:** Medium. Duplicate jobs double production and FG.
**Status:** Potential
**Test Area:** Create
**Description:** `CreateJobOrderFromOrderDetail` checks for an existing job, then inserts; there is no unique index on `JobOrderMaster.CustomerOrderDetailID`.
**Steps to Reproduce:**
1. Send two simultaneous create requests for the same order line.
**Expected:** One job per line (matrix: "one per line").
**Actual (by code):** Both checks can pass and two jobs are created.
**Evidence:**
- Backend: `Cimmple_API/CimmpleAPI/Controllers/JobOrderController.cs` lines 582-588.
- Database: `CimmpleDbContext.cs` (no unique index on `CustomerOrderDetailID`).
**Root Cause:** Check-then-insert without a constraint.
**Business Impact:** Duplicate production.
**Affected Areas:** Customer Orders → Job Orders.
**Recommended Fix:** Add a filtered unique index on `(Tenantid, CustomerOrderDetailID)` and handle the violation.
**Why further verification is needed:** Requires concurrent requests (double-click or two users).

---

### BUG-MFG-013 — Job order numbers can be duplicated under concurrency
**Severity:** Low. Two jobs can show the same number.
**Status:** Potential
**Test Area:** Create
**Description:** `AllocateNextJobOrderNumber` computes max + 1 with no lock or unique index.
**Steps to Reproduce:**
1. Create two jobs at the same moment.
**Expected:** Unique numbers.
**Actual (by code):** Both can receive the same number.
**Evidence:**
- Backend: `Cimmple_API/CimmpleAPI/Controllers/JobOrderController.cs` lines 1352-1371.
**Root Cause:** Non-atomic number allocation.
**Business Impact:** Confusing references on travellers and reports.
**Affected Areas:** Job Orders.
**Recommended Fix:** Use a sequence or a unique index with retry.
**Why further verification is needed:** Requires concurrent creation.

---

### BUG-MFG-014 — Saves that omit comments or routing steps wipe them
**Severity:** Medium. Data loss for clients that send partial payloads.
**Status:** Potential
**Test Area:** Update
**Description:** Attachments, `EnableJobTracking` and material requirements are explicitly "omit-safe", but `CommentsJson` and `RoutingStepsJson` are set to null when the request omits them.
**Steps to Reproduce:**
1. POST `SaveJobOrder` for an existing job without `Comments` or `RoutingSteps`.
**Expected:** Existing comments and steps are kept (consistent with the other omit-safe fields and the "PWA step saves" comment at line 401).
**Actual (by code):** Both are cleared.
**Evidence:**
- Backend: `Cimmple_API/CimmpleAPI/Controllers/JobOrderController.cs` lines 401-409 and 420-438 (omit-safe), 440-450 and 452-470 (not omit-safe).
- Frontend: `Cimmple_UI/src/Modules/JobOrders/JobOrderSlideout.tsx` lines 711-788 (office UI always sends both).
**Root Cause:** Inconsistent null handling.
**Business Impact:** Lost comments or step history.
**Affected Areas:** Job order save from any non-office client.
**Recommended Fix:** Treat null as "leave unchanged" and an empty list as "clear".
**Why further verification is needed:** The office UI always sends both fields; the PWA client is out of this audit's scope.

---

### BUG-MFG-015 — Concurrent step updates overwrite each other (last write wins)
**Severity:** Medium. Two technicians on different steps can undo each other's progress.
**Status:** Potential
**Test Area:** Steps
**Description:** Each save replaces the full `RoutingStepsJson`. `PreserveStepAnnotations` only preserves notes; there is no concurrency token.
**Steps to Reproduce:**
1. User 1 starts step 1; user 2, with a stale copy, completes step 2.
**Expected:** Both changes are kept.
**Actual (by code):** User 2's save reverts step 1 to its old state.
**Evidence:**
- Backend: `Cimmple_API/CimmpleAPI/Controllers/JobOrderController.cs` lines 452-466; `Cimmple_API/CimmpleAPI/Utilities/JobOrderTrackingHelper.cs` lines 20-65.
**Root Cause:** Whole-document overwrite without optimistic concurrency.
**Business Impact:** Wrong step status, times and produced quantities.
**Affected Areas:** Step tracking, FG completion.
**Recommended Fix:** Add a row version, or update steps individually.
**Why further verification is needed:** Requires two concurrent sessions.

---

### BUG-MFG-016 — Finished goods may be received at an unrelated site when the order has no location
**Severity:** Low. FG lands at the user's default or the tenant's first location.
**Status:** Potential
**Test Area:** Business Logic / FG location
**Description:** `ResolveJobInventoryLocationAsync` falls back from the customer order's location to the current user's default location and then the tenant's first location.
**Steps to Reproduce:**
1. Customer order without a location; complete the job as a user whose default site is B.
**Expected:** FG at the job's site (matrix 10.3: "FG balance increases at correct location").
**Actual (by code):** FG at site B or the first location.
**Evidence:**
- Backend: `Cimmple_API/CimmpleAPI/Controllers/JobOrderController.cs` lines 1122-1153.
**Root Cause:** Implicit fallback.
**Business Impact:** Stock at the wrong site.
**Affected Areas:** FG inventory, shipments.
**Recommended Fix:** Require a location on the order/job before completion.
**Why further verification is needed:** Depends on whether orders without a location exist in production data.

---

### BUG-MFG-017 — Fully shipped jobs can never be deleted because net FG ignores shipments
**Severity:** Low. The block message may be misleading.
**Status:** Potential
**Test Area:** Delete
**Description:** Deletion is blocked while net FG > 0. Net FG counts only JobOrder-referenced issues, and shipment issues use the CustomerShipment reference, so a fully shipped job still has net FG equal to its receipt.
**Steps to Reproduce:**
1. Complete and fully ship a job; attempt delete.
**Expected:** Either a clear "shipped jobs cannot be deleted" message or deletion allowed.
**Actual (by code):** Blocked with a finished-goods-on-hand reason.
**Evidence:**
- Backend: `Cimmple_API/CimmpleAPI/Controllers/JobOrderController.cs` lines 661-667 and 1373-1387.
**Root Cause:** Net FG calculation excludes shipment issues.
**Business Impact:** Confusing message.
**Affected Areas:** Job order delete.
**Recommended Fix:** Compute net FG including shipment issues for the job's order line, or show a specific message.
**Why further verification is needed:** Blocking deletion of shipped jobs may be intended; only the message wording is in question.

---

### BUG-MFG-018 — Deleting a job leaves its attachment blobs in storage
**Severity:** Low. Orphaned files in storage.
**Status:** Potential
**Test Area:** Delete
**Description:** `DeleteJobOrder` removes the row and releases reservations but does not delete blobs listed in `AttachmentsJson`.
**Steps to Reproduce:**
1. Upload attachments; delete the job; inspect storage.
**Expected:** Blobs removed.
**Actual (by code):** Blobs remain (and, because of BUG-MFG-001, may still be served to other jobs).
**Evidence:**
- Backend: `Cimmple_API/CimmpleAPI/Controllers/JobOrderController.cs` lines 1025-1057.
**Root Cause:** No blob cleanup on delete.
**Business Impact:** Storage cost; stale documents.
**Affected Areas:** Job order delete.
**Recommended Fix:** Delete the job's blobs after a successful delete (once paths are job-specific).
**Why further verification is needed:** Retention of attachments after delete might be intentional.

---

## Needs Manual Verification

1. **Area:** Responsive / step menu on phone
   **What to Test:** Open a job slideout at phone width; start, pause, complete and reopen steps.
   **Expected:** Step menu and dialogs usable (matrix "step menu on phone").
   **Why Manual Testing Is Required:** Layout cannot be checked statically.
2. **Area:** Barcode / traveller
   **What to Test:** Generate the job PDF, scan `cimmple://jo/{id}/step/{stepId}`, email the job.
   **Expected:** The PDF renders with routing and barcode; the scan opens the step; the email arrives with the PDF.
   **Why Manual Testing Is Required:** Requires PDF rendering, a scanner and SMTP.
3. **Area:** Template apply / save as template
   **What to Test:** Apply a template, then edit the template; reopen the job.
   **Expected:** The job keeps its copied routing and materials (matrix 10.3).
   **Why Manual Testing Is Required:** Routing is copied into `RoutingStepsJson` on the job, which indicates isolation, but the full apply flow needs runtime confirmation.
4. **Area:** Concurrency (BUG-MFG-012, 013, 015)
   **What to Test:** Double-click Create from an order line; two users updating different steps.
   **Expected:** One job; both step updates kept.
   **Why Manual Testing Is Required:** Requires concurrent sessions.
5. **Area:** FG reopen scenario (BUG-MFG-002)
   **What to Test:** Run the reproduction on a test tenant and compare `InventoryBalance` before/after.
   **Expected:** Confirms the stock loss and over-issue.
   **Why Manual Testing Is Required:** Confirms impact with real data before fixing.
6. **Area:** NCR from step
   **What to Test:** Raise an NCR from a step and open it from the job.
   **Expected:** NCR linked to the job and step.
   **Why Manual Testing Is Required:** Cross-module UI flow (`JobOrderSlideout.tsx` 2077-2115).

## No Issues Found

- Add redirects to `/orders/customer`, so jobs are created from order lines as the matrix states (`JobOrders.tsx` 356-361).
- Create from an order line uses quantity ordered − shipped and blocks an existing job for the same line (`JobOrderController.cs` 582-591), apart from the race in BUG-MFG-012.
- Shortage = max(0, needed − reserved − issued − available) is implemented as specified (`JobOrderController.cs` 1389-1396).
- Completed, Cancelled and Shipped release open reservations (`JobOrderController.cs` 509-516).
- Save, FG receipt and reservation release run in one transaction and roll back on inventory errors (`JobOrderController.cs` 501-507).
- Deletion is blocked while net FG > 0, and impact is shown via `DeletionImpactDialog` (`JobOrderController.cs` 639-711; `JobOrderSlideout.tsx` 1088-1116).
- Inventory references are keyed by `JobOrderID` only in the Job Order controller (`JobMaterialRefIds`, 1344-1350).
- List search covers JO#/CO# formats and pagination is enabled through `MasterListPage` (`JobOrders.tsx` 191-235, 339-344).
- Frontend `deriveJobStatus` mirrors the backend rule (`JobOrderService.ts` 327-352).

## QA Coverage

| Test Area | Tested | Result |
| --- | --- | --- |
| Navigation | Yes | Pass |
| CRUD | Yes | Fail (BUG-MFG-003, BUG-MFG-005); Potential (BUG-MFG-012, BUG-MFG-014, BUG-MFG-017, BUG-MFG-018) |
| Search | Yes | Pass |
| Filters | Yes | Fail (BUG-MFG-010) |
| Sorting | Yes | Pass |
| Pagination | Yes | Pass |
| Validation | Yes | Fail (BUG-MFG-004, BUG-MFG-005, BUG-MFG-009, BUG-MFG-011) |
| Permissions | Partial | Fail (BUG-MFG-006) |
| API | Yes | Fail (BUG-MFG-001, BUG-MFG-007, BUG-MFG-008) |
| Database | Yes | Potential (BUG-MFG-012, BUG-MFG-013, BUG-MFG-015) |
| Business Logic | Yes | Fail (BUG-MFG-002, BUG-MFG-003, BUG-MFG-004) |
| Location | Yes | Fail (BUG-MFG-006); Potential (BUG-MFG-016) |
| Tenant | Yes | Pass (queries filter by tenant; trust of client-supplied tenant id is a cross-module concern) |
| Cross-Module | Yes | Fail (BUG-MFG-002) |
| Responsive/PWA | No | Manual |

## Matrix Checklist

| Matrix Row | Result | Notes |
| --- | --- | --- |
| FE List | Pass | `JobOrders.tsx`, `GetJobOrders` with site filter. |
| FE Search (JO#, part, customer) | Pass | Client search. |
| FE Filter (status incl. shipping, site, due date) | Fail | No due-date filter (BUG-MFG-010). |
| FE Sort / Pagination | Pass | `MasterListPage`. |
| FE Add (redirect to CO) | Pass | Redirect; race in BUG-MFG-012. |
| FE Edit (routing, materials, template, tracking) | Fail | Manual shipping statuses (BUG-MFG-003); detail without site check (BUG-MFG-006). |
| FE Steps (start, pause with reason, complete with qty, reopen) | Fail | BUG-MFG-002, BUG-MFG-004, BUG-MFG-009. |
| FE Materials (reserve, issue, shortage) | Partial | Shortage formula correct; reservation site check missing (BUG-INV-002); job usage mixes jobs (BUG-INV-003). |
| FE Apply / Save template | Manual | Manual 3. |
| FE NCR per step | Manual | Manual 6. |
| FE Barcode / Traveller | Manual | Manual 2. |
| FE Attachments | Fail | BUG-MFG-001, BUG-MFG-011. |
| FE View by CO | Pass | `GetJobOrdersByCustomerOrder` (tenant from client — cross-module). |
| FE Delete (impact dialog) | Pass | Potential BUG-MFG-017, BUG-MFG-018. |
| FE Validation (qty > 0, produced limits, pause reason) | Fail | BUG-MFG-004, BUG-MFG-005, BUG-MFG-009. |
| FE Permissions / Responsive | Manual | No server role checks (cross-module); Manual 1. |
| BE List/Get | Fail | BUG-MFG-006. |
| BE Create (one per line) | Potential | BUG-MFG-012, BUG-MFG-013. |
| BE Update (deriveJobStatus, FG completion, reopen reversal) | Fail | BUG-MFG-002, BUG-MFG-003, BUG-MFG-004, BUG-MFG-005, BUG-MFG-007. |
| BE Files | Fail | BUG-MFG-001, BUG-MFG-011. |
| BE Delete (blocked while net FG > 0) | Pass | Potential BUG-MFG-017, BUG-MFG-018. |
| BE Authorization (authenticated) | Partial | Authenticated via fallback policy; no site check on detail (BUG-MFG-006). |
| BL Shortage formula | Pass | `JobOrderController.cs` 1389-1396. |
| BL Completed/Cancelled/Shipped release reservations | Pass | 509-516 (but manual Shipped triggers it — BUG-MFG-003). |
| BL `RoutingStepsJson` step state; `EnableJobTracking`; `JobTemplateId` | Partial | Stored as described; overwrite risks BUG-MFG-014, BUG-MFG-015. |
| 10.3 Customer Order → Job Order | Partial | Qty = ordered − shipped; duplicates possible under race (BUG-MFG-012); link editable (BUG-MFG-005). |
| 10.3 Job Template → Job Order | Manual | Copied into the job (Manual 3). |
| 10.3 Job Order → Material reservation | Partial | Release on Completed/Cancelled/Shipped works; see BUG-INV-002. |
| 10.3 Job Order → Material Issue | Partial | See BUG-INV-003. |
| 10.3 Job Order → Job Completion | Fail | BUG-MFG-002, BUG-MFG-003, BUG-MFG-009. |
| 10.3 Job Completion → Finished Goods | Fail | BUG-MFG-002, BUG-MFG-004; potential BUG-MFG-016. |
| 10.3 Finished Goods → Shipment | Partial | Shipment issues not counted in job net FG (BUG-MFG-002, BUG-MFG-017); shipment delete reversal is in the Shipments QA. |
| 10.3 All movements → Views / Reports | Potential | See BUG-INV-010. |

## Cross-Module Concerns

| Concern | Where seen in Job Orders | Owner file |
| --- | --- | --- |
| Client-supplied `tenantId` trusted (query, body `Tenantid`, multipart form field; dev fallback to tenant 1 in `JobOrderService.ts`) | `GetJobOrders`, `GetJobOrdersByCustomerOrder`, `GetJobOrderById`, `SaveJobOrder` (331, 345), `CreateJobOrderFromOrderDetail`, `CheckJobOrderDeletionImpact`, `DeleteJobOrder`, `JobOrderSaveFile` (749, 762-765), `JobOrderGetFile`; `PdfController.GenerateJobOrder` and `DocumentEmailController.SendJobOrder` | `QA_TenantLocationFramework.md` |
| No server-side role/permission enforcement | All `JobOrderController` endpoints (create, save, delete, files) | `QA_RolesPermissions.md` |
| Inventory movements triggered from the job slideout | Reservation site access and job usage | `QA_Inventory.md` (BUG-INV-002, BUG-INV-003) |
