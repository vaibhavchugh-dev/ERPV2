# QA — Inventory -t

| Module | Matrix section | Bug ID prefix | Tested | Confirmed Bugs | Potential Bugs | Manual Verification |
| --- | --- | --- | --- | --- | --- | --- |
| Inventory | 5.1 | BUG-INV | Yes | 9 | 3 | 6 |

Source of test cases: `QA_TEST_MATRIX.md`. Method: static trace of the actual implementation (React UI → service → Axios → .NET controller → service/repository → EF Core → SQL Server, and back). No application code, configuration or database is changed during QA. Findings that depend on deployed configuration, data or a real browser go under **Needs Manual Verification**.

Severity scale:
- **Critical**: security breach, data corruption, financial corruption, or a blocked core workflow.
- **High**: a major feature is broken or a significant security control is bypassed, with a workaround that is hard or unavailable.
- **Medium**: a feature works incorrectly in specific conditions, or a security control is weaker than configured.
- **Low**: cosmetic, minor UX, or an informational/hardening issue.

---

## Confirmed Bugs

### BUG-INV-001 — Stock can be posted or transferred against another tenant's product, raw material or location ids
**Severity:** Medium. A user with all-location access can create balances and transactions that point at another tenant's master data, corrupting their own tenant's stock picture and disclosing the other tenant's names.
**Status:** Confirmed
**Test Area:** Tenant / Movements (Receive, Issue, Transfer, Adjust)
**Description:** Movement endpoints check location access with `CanAccessLocation`, which returns `true` for any id when the user can access all locations, and never checks that the location, product or raw material belongs to the caller's tenant. `GetOrCreateBalanceAsync` creates a balance row for whatever ids it receives; the tenant filter is only used to copy reorder settings.
**Steps to Reproduce:**
1. Log in to tenant A as a user with "can access all locations".
2. POST `/api/Inventory/ReceiveStock` with `LocationId` = a location id of tenant B and `ProductId` = a product id of tenant B.
3. Open `/inventory` in tenant A.
**Expected:** The request is rejected because the location and product do not belong to tenant A (internal consistency: every inventory row carries `Tenantid`, and lists filter by tenant).
**Actual:** The receipt is accepted. An `InventoryBalance` and `InventoryTransaction` are created with `Tenantid` = A but pointing to tenant B's location and product, and tenant A's balance list shows tenant B's location and product names via the navigation properties.
**Evidence:**
- Frontend: `Cimmple_UI/src/Modules/Inventory/StockMovementModal.tsx` lines 943-956 (the UI only offers allowed locations, so this is reachable through the API).
- Backend: `Cimmple_API/CimmpleAPI/Controllers/InventoryController.cs` lines 250-288 (`ReceiveStock`, location check only when `LocationId > 0`), 290-332 (`IssueStock`), 521-554 (`TransferStock`, both locations checked only for access), 556-599 (`AdjustStock`); `Cimmple_API/CimmpleAPI/Controllers/ApiBaseController.cs` `CanAccessLocation` (all-locations users pass for any id).
- Backend: `Cimmple_API/CimmpleAPI/Services/InventoryService.cs` lines 987-1014 (`GetOrCreateBalanceAsync` creates the balance for any product/location id), 219-310 (`TransferStockAsync` has no ownership validation).
- Database: `Cimmple_API/CimmpleAPI/Data/CimmpleDbContext.cs` lines 600-685 (FKs to Location/Product/RawMaterial are `Restrict`, which only proves the row exists, not that it belongs to the tenant).
**Root Cause:** Referenced master ids are never validated against the caller's tenant.
**Business Impact:** Cross-tenant references pollute stock balances, valuation and movement reports and leak another tenant's location/product names.
**Affected Areas:** Receive, Issue, Transfer, Adjust, Reserve; inventory balance list, valuation and movement reports.
**Recommended Fix:** Before any movement, verify that the location, product and raw material each exist with `TenantId == tenantId`, and make `CanAccessLocation` confirm the location belongs to the tenant even for all-location users.

---

### BUG-INV-002 — Reserve and Release do not enforce site (location) access
**Severity:** Medium. A site-restricted user can reserve stock at a site they cannot access and release any reservation in the tenant.
**Status:** Confirmed
**Test Area:** Location / Reservations
**Description:** `ReserveStock` and `ReleaseReservation` never call `CanAccessLocation`, unlike Receive/Issue/Transfer/Adjust. `ReleaseReservation` takes a bare reservation id. The matrix itself flags "location access not checked" against the matrix authorization row "location access on movements".
**Steps to Reproduce:**
1. Log in as a user restricted to site A.
2. POST `/api/Inventory/ReserveStock` with `LocationId` = site B and a job order reference.
3. POST `/api/Inventory/ReleaseReservation` with the id of a reservation at site B.
**Expected:** 403, as for the other movements ("Authorization: authenticated; location access on movements").
**Actual:** Both calls succeed.
**Evidence:**
- Frontend: `Cimmple_UI/src/Modules/Inventory/Inventory.tsx` lines 276-284 (release button, no confirmation).
- Backend: `Cimmple_API/CimmpleAPI/Controllers/InventoryController.cs` lines 334-362 (`ReserveStock`) and 364-382 (`ReleaseReservation`), no location check; compare 255 and 295.
- Backend: `Cimmple_API/CimmpleAPI/Services/InventoryService.cs` lines 394-467 and 469-497.
- Database: `InventoryReservation`.
**Root Cause:** The location guard was not added to the reservation endpoints.
**Business Impact:** Users at one site can tie up or free another site's stock, distorting availability and job shortages.
**Affected Areas:** Inventory reservations, Job Order material reservation, shortage display.
**Recommended Fix:** Check `CanAccessLocation` on the reservation's location in both endpoints and load the reservation with a tenant filter before releasing.

---

### BUG-INV-003 — Job material usage includes other jobs' transactions
**Severity:** Medium. The job usage view and anything built on it can show another job's issues/receipts as if they belonged to this job.
**Status:** Confirmed
**Test Area:** Business Logic / Job usage
**Description:** `GetJobMaterialUsage` matches `InventoryTransaction.ReferenceId` against the job's `JobOrderID`, its `JobOrderNumber`, and `JobOrderNumber + 999` for numbers below 1000. `JobOrderController` explicitly states inventory must be keyed only to `JobOrderID` because including `JobOrderNumber` "attached previous finished-goods / reservations to a new job". Job order numbers are allocated as max(numbers, ids, reference ids) + 1, so they can equal the `JobOrderID` of a later job.
**Steps to Reproduce:**
1. Create job A; note its `JobOrderNumber` (for example 1050).
2. Create jobs until some job B has `JobOrderID` = 1050; issue material to job B.
3. Call `GET /api/Inventory/GetJobMaterialUsage?jobOrderId={A}`.
**Expected:** Only transactions with `ReferenceId == A.JobOrderID` (per the comment at `JobOrderController.cs` 1346-1348).
**Actual:** Job B's transactions are returned for job A.
**Evidence:**
- Backend: `Cimmple_API/CimmpleAPI/Controllers/InventoryController.cs` lines 204-221.
- Backend: `Cimmple_API/CimmpleAPI/Controllers/JobOrderController.cs` lines 1344-1350 (`JobMaterialRefIds` returns only the id) and 1352-1371 (`AllocateNextJobOrderNumber`).
- Database: `InventoryTransaction.ReferenceId` (`ReferenceType = 'JobOrder'`).
**Root Cause:** A legacy fallback that matches by job number was left in one endpoint after the rest of the code moved to id-only keys.
**Business Impact:** Wrong material consumption per job; misleading costing and traceability.
**Affected Areas:** Job Order slideout materials, Inventory job usage.
**Recommended Fix:** Use the same id-only key (`JobMaterialRefIds`) in `GetJobMaterialUsage`.

---

### BUG-INV-004 — Adjustment can push on-hand below the reserved quantity (negative available)
**Severity:** Medium. Reservations end up larger than physical stock, so available goes negative and job shortages are wrong.
**Status:** Confirmed
**Test Area:** Validation / Adjust
**Description:** `AdjustStockAsync` only rejects the adjustment if `QuantityOnHand` would go below 0. It ignores `QuantityReserved`, while the rest of the module defines Available = on hand − reserved.
**Steps to Reproduce:**
1. Product X at site A: on hand 10, reserved 8 for a job.
2. Adjust −6.
**Expected:** Rejected, or reservations reduced, so that available stays ≥ 0 (matrix: "adjust can't go negative"; Available = on hand − reserved).
**Actual:** Accepted; on hand 4, reserved 8, available −4.
**Evidence:**
- Frontend: `Cimmple_UI/src/Modules/Inventory/StockMovementModal.tsx` lines 555-562 (only checks ≠ 0).
- Backend: `Cimmple_API/CimmpleAPI/Services/InventoryService.cs` lines 334-337.
- Database: `InventoryBalance.QuantityOnHand`, `QuantityReserved`.
**Root Cause:** The negative-stock check does not account for reservations.
**Business Impact:** Jobs believe material is reserved that does not exist; issues later fail or short.
**Affected Areas:** Inventory balances, reservations, Job Order shortages.
**Recommended Fix:** Reject adjustments where `QuantityOnHand + quantity < QuantityReserved`, or release/reduce reservations explicitly with a message.

---

### BUG-INV-005 — Adjustment reason is optional
**Severity:** Low. Audit trail gap; stock can be changed without explanation.
**Status:** Confirmed
**Test Area:** Validation / Adjust
**Description:** The matrix specifies "Adjust: +/- with reason". The modal labels the notes field "Optional note of why this quantity moved." and the backend accepts empty notes.
**Steps to Reproduce:**
1. Open `/inventory` → Adjust.
2. Enter a quantity and leave notes blank; submit.
**Expected:** A reason is required.
**Actual:** The adjustment is saved with no reason.
**Evidence:**
- Frontend: `Cimmple_UI/src/Modules/Inventory/StockMovementModal.tsx` lines 1066-1073.
- Backend: `Cimmple_API/CimmpleAPI/Controllers/InventoryController.cs` lines 556-599; `InventoryService.cs` lines 315-329.
- Database: `InventoryTransaction.Notes` (nullable).
**Root Cause:** Notes are not validated for type 5 (Adjustment).
**Business Impact:** Unexplained stock write-offs; weak audit.
**Affected Areas:** Inventory adjustments, movement report.
**Recommended Fix:** Require a non-empty reason for adjustments in both the modal and `AdjustStock`.

---

### BUG-INV-006 — Movement modal shows no parts when a location other than the page filter is chosen
**Severity:** Low. Users must change the page filter first; workaround exists.
**Status:** Confirmed
**Test Area:** Issue / Transfer / Reserve (UI)
**Description:** The page passes its location-filtered `balances` to the modal. The modal builds the Issue/Transfer/Reserve part lists with `availableAtLocation(..., balances)`, so picking a different source location in the modal shows an empty list.
**Steps to Reproduce:**
1. On `/inventory`, set the site filter to site A.
2. Open Issue; change the location to site B, which has stock.
**Expected:** Parts with stock at site B are listed.
**Actual:** No parts are listed.
**Evidence:**
- Frontend: `Cimmple_UI/src/Modules/Inventory/Inventory.tsx` lines 190-193 and 722; `Cimmple_UI/src/Modules/Inventory/StockMovementModal.tsx` lines 308-313 and 376-382.
**Root Cause:** The modal relies on page-filtered data instead of loading balances for its own selected location.
**Business Impact:** Confusing UX; users may think site B has no stock.
**Affected Areas:** Stock movement modal.
**Recommended Fix:** Load balances for the modal's selected location (or pass unfiltered balances).

---

### BUG-INV-007 — Receive/Issue with LocationId 0 skips validation and fails at the database
**Severity:** Low. API-only; produces an unclear error instead of "location required".
**Status:** Confirmed
**Test Area:** Validation / Movements
**Description:** The controller runs the location check only `if (request.LocationId > 0)`, and `ReceiveStockInTransactionAsync` has no `locationId > 0` guard, so a zero location reaches `GetOrCreateBalanceAsync` and the Location FK.
**Steps to Reproduce:**
1. POST `/api/Inventory/ReceiveStock` with `LocationId: 0`.
**Expected:** 400 "Location is required" (matrix validation: "location required").
**Actual:** No validation error; the insert fails on the Location foreign key and a generic error is returned.
**Evidence:**
- Backend: `Cimmple_API/CimmpleAPI/Controllers/InventoryController.cs` lines 255 and 295; `Cimmple_API/CimmpleAPI/Services/InventoryService.cs` lines 29-81 and 987-1014.
- Database: `InventoryBalance.LocationId` FK (`CimmpleDbContext.cs` 600-685).
**Root Cause:** Missing required-field validation.
**Business Impact:** Poor error handling for integrations.
**Affected Areas:** Receive, Issue.
**Recommended Fix:** Reject `LocationId <= 0` in the controller before calling the service.

---

### BUG-INV-008 — Shipment-linked quantity validation reads shipment lines without a tenant filter
**Severity:** Low. The linked-document check can be evaluated against another tenant's shipment lines by id.
**Status:** Confirmed
**Test Area:** Tenant / Validation
**Description:** In `ValidateLinkedDocumentQtyAsync`, the CustomerShipment branch queries `ShippingDetails` by shipment id without `Tenantid`.
**Steps to Reproduce:**
1. Issue stock with `ReferenceType = CustomerShipment` and `ReferenceId` = another tenant's shipment id.
**Expected:** "Linked document not found" for a shipment outside the tenant.
**Actual:** The other tenant's shipment lines are used for the quantity check.
**Evidence:**
- Backend: `Cimmple_API/CimmpleAPI/Controllers/InventoryController.cs` lines 1395-1408.
**Root Cause:** Missing tenant predicate.
**Business Impact:** Validation can pass or fail based on foreign data; minor information leak.
**Affected Areas:** Issue with shipment link.
**Recommended Fix:** Add `Tenantid == tenantId` to the shipment and shipment-detail queries.

---

### BUG-INV-009 — Movement audit user (`CreatedBy`) is taken from the request body
**Severity:** Low. The audit trail can be spoofed.
**Status:** Confirmed
**Test Area:** API / Audit
**Description:** Movement request DTOs carry `CreatedBy`, and the controller passes it to the service instead of using the authenticated user id.
**Steps to Reproduce:**
1. POST `/api/Inventory/ReceiveStock` with `CreatedBy` = another user's id.
**Expected:** The transaction records the authenticated user.
**Actual:** The supplied user id is recorded.
**Evidence:**
- Backend: `Cimmple_API/CimmpleAPI/Controllers/InventoryController.cs` lines 259, 298-299, request DTOs 1579-1656.
**Root Cause:** Trusting client-supplied identity fields.
**Business Impact:** Unreliable audit of who moved stock.
**Affected Areas:** All inventory movements.
**Recommended Fix:** Use `GetUserId()` from the token and ignore `CreatedBy` in the body.

---

## Potential Bugs

### BUG-INV-010 — No concurrency control on balance updates (lost updates, oversell, duplicate balance rows)
**Severity:** High. Concurrent movements can corrupt on-hand quantities.
**Status:** Potential
**Test Area:** Business Logic / Concurrency
**Description:** Balances are read, checked and written in a READ COMMITTED transaction with no row lock, `RowVersion` or concurrency token. `GetOrCreateBalanceAsync` does read-then-insert, and the `InventoryBalance` filtered indexes are non-unique, so two concurrent first receipts can create two balance rows for the same item and location.
**Steps to Reproduce:**
1. Product X at site A: on hand 10.
2. Fire two simultaneous Issue requests of 8 each.
**Expected:** One succeeds and one fails with insufficient stock.
**Actual (by code):** Both can read 10, both pass the check, and the final on-hand is 2 (lost update) or the balance goes negative.
**Evidence:**
- Backend: `Cimmple_API/CimmpleAPI/Services/InventoryService.cs` lines 156-214 (`IssueStockAsync`), 219-310 (`TransferStockAsync`, check at 241-244), 689-773 (`ApplyIssueCoreAsync`), 987-1014 (`GetOrCreateBalanceAsync`).
- Database: `Cimmple_API/CimmpleAPI/Data/CimmpleDbContext.cs` lines 600-685 (non-unique filtered indexes); no `[Timestamp]`/`IsConcurrencyToken` on `InventoryBalance`.
**Root Cause:** Optimistic read-modify-write without locking or concurrency tokens.
**Business Impact:** Stock figures drift from Σ transactions; overselling.
**Affected Areas:** All movements, JO material issue, FG receipt, shipment issue.
**Recommended Fix:** Add a `RowVersion` to `InventoryBalance` with retry, or use `UPDLOCK`/serializable reads; make the balance index unique per tenant/location/item.
**Why further verification is needed:** The race requires truly concurrent requests and could not be executed in a read-only audit.

---

### BUG-INV-011 — Linked-document picker lists documents from all sites
**Severity:** Low. Site-restricted users can see other sites' job, receiving and shipment numbers.
**Status:** Potential
**Test Area:** Location / Movements
**Description:** `GetMovementDocuments` returns the latest 80 jobs, 50 receivings and 50 shipments tenant-wide with no location filter.
**Steps to Reproduce:**
1. Log in as a user restricted to site A; open Issue and the linked document picker.
**Expected:** Only documents for accessible sites (consistent with site filtering elsewhere).
**Actual:** Documents from all sites are listed.
**Evidence:**
- Backend: `Cimmple_API/CimmpleAPI/Controllers/InventoryController.cs` lines 976-1215.
**Root Cause:** No `TryResolveListLocationFilter` on this endpoint.
**Business Impact:** Minor information exposure; users may link to the wrong site's document.
**Affected Areas:** Stock movement modal.
**Recommended Fix:** Apply the site filter used by the list endpoints.
**Why further verification is needed:** The matrix does not state whether the document picker must be site-filtered.

---

### BUG-INV-012 — UI forces whole-number quantities while the API and units support decimals
**Severity:** Low. Fractional units (kg, m, l) cannot be moved from the UI.
**Status:** Potential
**Test Area:** Validation
**Description:** The modal rejects non-integer quantities, while `InventoryBalance`/`InventoryTransaction` quantities are decimal and the backend accepts fractions.
**Steps to Reproduce:**
1. Receive 2.5 of a raw material measured in kg.
**Expected:** Accepted if decimal units are intended.
**Actual:** The modal requires an integer.
**Evidence:**
- Frontend: `Cimmple_UI/src/Modules/Inventory/StockMovementModal.tsx` lines 551-554.
- Backend: `InventoryService.cs` (quantity parameters are `decimal`).
**Root Cause:** UI validation stricter than the data model.
**Business Impact:** Users round quantities, causing stock drift.
**Affected Areas:** All movements in the UI.
**Recommended Fix:** Allow decimals (respecting a unit precision) or document integer-only stock.
**Why further verification is needed:** The intended unit precision is not stated in the matrix.

---

## Needs Manual Verification

1. **Area:** Responsive / movement modal on phone
   **What to Test:** Open `/inventory` on a phone-width viewport; perform Receive, Issue, Transfer and Adjust.
   **Expected:** The modal fits the screen and all fields and pickers are usable (matrix "movement modal on phone").
   **Why Manual Testing Is Required:** Layout cannot be verified statically.
2. **Area:** Concurrency (BUG-INV-010)
   **What to Test:** Run two simultaneous issues of the same item and location, and two simultaneous first receipts of a new item/location.
   **Expected:** No negative stock, no lost update, a single balance row.
   **Why Manual Testing Is Required:** Requires concurrent execution against a database.
3. **Area:** FIFO lot consumption
   **What to Test:** Receive three lots on different dates, issue across lot boundaries, then inspect `GetLots`.
   **Expected:** The oldest lot is consumed first and lot balances sum to the item balance.
   **Why Manual Testing Is Required:** The code path (`AllocateLotsForIssueAsync`, `InventoryService.cs` 837-906) looks correct but depends on data ordering.
4. **Area:** Remnant offcut issue
   **What to Test:** Issue raw material with an offcut; then issue again when only the remnant exists.
   **Expected:** A remnant `{part}-R{n}` is created and is used only when the user expects it.
   **Why Manual Testing Is Required:** `ApplyIssueCoreAsync` (lines 718-727) substitutes remnants silently; whether that is acceptable needs product confirmation.
5. **Area:** Matrix vs UI tabs
   **What to Test:** Confirm whether the Lots, Low stock and Job usage tabs and the item-type filter listed in the matrix are expected on `/inventory`.
   **Expected:** Either the tabs exist or the matrix is updated.
   **Why Manual Testing Is Required:** `Inventory.tsx` has no tabs (balances table, open reservations, recent movements, low-stock checkbox); the requirement source needs confirmation.
6. **Area:** Balance = Σ transactions and valuation
   **What to Test:** After a mix of movements, compare `InventoryBalance` with the sum of `InventoryTransaction` per item/location and with the valuation report.
   **Expected:** They match.
   **Why Manual Testing Is Required:** Needs real data.

## No Issues Found

- Balance list honours the site filter through `TryResolveListLocationFilter` (`InventoryController.cs` 23-106).
- Low stock is computed as on hand ≤ reorder point, falling back from balance to raw material to product reorder point (`InventoryController.cs` 58-63 and 616-621), matching the matrix.
- Transfer is a single database transaction covering TransferOut and TransferIn (`InventoryService.cs` 219-310), with an available-quantity check.
- Issue uses free stock plus the job's own reservation and allocates lots FIFO (`InventoryService.cs` 689-773, 837-906).
- Reserve requires a JobOrder reference and a location (`InventoryService.cs` 394-467); released reservations are zeroed.
- Linked-document quantity validation for VendorReceiving and JobOrder references (`InventoryController.cs` 1284-1459) and job-linked part validation (1221-1282) are enforced server-side.
- The modal enforces quantity > 0 (≠ 0 for adjust), job required for reserve, and linked-document remaining quantity (`StockMovementModal.tsx` 551-606).
- Edit/Delete of movements is not offered, as the matrix states.
- Valuation uses master unit cost, which is consistent with the reports implementation (`InventoryReportsService.cs` 57-120).

## QA Coverage

| Test Area | Tested | Result |
| --- | --- | --- |
| Navigation | Yes | Pass |
| CRUD | Partial | Pass (movements only; edit/delete not offered by design) |
| Search | Yes | Pass |
| Filters | Partial | Fail (BUG-INV-006; item-type filter missing — Manual 5) |
| Sorting | Yes | Pass |
| Pagination | Yes | Manual (no client pagination on balances — Manual 5) |
| Validation | Yes | Fail (BUG-INV-004, BUG-INV-005, BUG-INV-007); Potential (BUG-INV-012) |
| Permissions | Partial | Fail (BUG-INV-002) |
| API | Yes | Fail (BUG-INV-003, BUG-INV-009) |
| Database | Yes | Potential (BUG-INV-010) |
| Business Logic | Yes | Fail (BUG-INV-003, BUG-INV-004); Potential (BUG-INV-010) |
| Location | Yes | Fail (BUG-INV-002); Potential (BUG-INV-011) |
| Tenant | Yes | Fail (BUG-INV-001, BUG-INV-008) |
| Cross-Module | Yes | Fail (BUG-INV-003) |
| Responsive/PWA | No | Manual |

## Matrix Checklist

| Matrix Row | Result | Notes |
| --- | --- | --- |
| FE List (balances, tabs) | Fail | Balances, open reservations and recent movements are shown; no tabs for lots, low stock or job usage (Manual 5). |
| FE Search (part, description) | Pass | Part no, name and location (`Inventory.tsx` 313-323). |
| FE Filter (location, item type) | Partial | Location filter works; no item-type filter (Manual 5); modal parts list tied to page filter (BUG-INV-006). |
| FE Sort (client) | Pass | `Inventory.tsx` 325-359. |
| FE Pagination (client only) | Manual | No pagination rendered (Manual 5). |
| FE Transactions (history) | Partial | Recent movements shown; linked documents site-unfiltered (BUG-INV-011). |
| FE Reservations | Fail | Release has no site check (BUG-INV-002) and no confirmation. |
| FE Lots (FIFO) | Manual | No lots tab; FIFO logic present (Manual 3). |
| FE Low stock | Pass | Banner and "low stock only" checkbox; formula correct. |
| FE Job usage | Fail | No tab; endpoint mixes jobs (BUG-INV-003). |
| FE Receive | Fail | BUG-INV-001, BUG-INV-007. |
| FE Issue (offcut/remnant) | Partial | Works; remnant substitution needs confirmation (Manual 4). |
| FE Reserve / Release | Fail | BUG-INV-002. |
| FE Transfer | Fail | Cross-tenant ids accepted (BUG-INV-001); atomic otherwise. |
| FE Adjust (+/- with reason) | Fail | BUG-INV-004, BUG-INV-005. |
| FE Item pickers | Pass | `GetProducts`, `GetRawMaterials` used; tenant from client (cross-module concern). |
| FE Edit / Delete (not available) | Pass | Not offered. |
| FE Validation (qty > 0, location, negative, linked doc) | Fail | BUG-INV-004, BUG-INV-007; potential BUG-INV-012. |
| FE Permissions / Responsive | Manual | Route ungated server-side (cross-module); phone layout Manual 1. |
| BE List | Partial | Site filter on lists works; movement documents unfiltered (BUG-INV-011); job usage wrong (BUG-INV-003). |
| BE Movements | Fail | BUG-INV-001, BUG-INV-007, BUG-INV-009; potential BUG-INV-010. |
| BE Reservations | Fail | BUG-INV-002. |
| BE Validation (negative stock, linked docs) | Fail | BUG-INV-004, BUG-INV-008. |
| BE Authorization (location access on movements) | Fail | BUG-INV-002; LocationId 0 bypass (BUG-INV-007). |
| BL Available = on hand − reserved; low stock = on hand ≤ reorder point | Fail | Low stock correct; available can go negative (BUG-INV-004). |
| BL FIFO lot consumption; remnant `{part}-R{n}` | Pass | `InventoryService.cs` 523-539, 837-906 (runtime check in Manual 3, 4). |
| BL Transaction types 1-5 | Pass | Receipt, Issue, TransferIn, TransferOut, Adjustment used consistently. |
| BL Released reservation quantity 0 | Pass | `InventoryService.cs` 469-497. |
| 10.3 Customer Order → Job Order | Pass | See `QA_Manufacturing.md`. |
| 10.3 Job Template → Job Order | Pass | See `QA_Manufacturing.md`. |
| 10.3 Job Order → Material reservation | Fail | Release on Completed/Cancelled/Shipped works; reservation site access missing (BUG-INV-002); adjust can break availability (BUG-INV-004). |
| 10.3 Job Order → Material Issue | Partial | Issue, FIFO, remnant and linked-doc validation present; job usage view mixes jobs (BUG-INV-003). |
| 10.3 Job Order → Job Completion | Fail | See `QA_Manufacturing.md` (BUG-MFG-002, BUG-MFG-003). |
| 10.3 Job Completion → Finished Goods | Fail | See `QA_Manufacturing.md` (BUG-MFG-002, BUG-MFG-004). |
| 10.3 Finished Goods → Shipment | Partial | FG issue uses the CustomerShipment reference; shipment delete reversal belongs to the Shipments QA. |
| 10.3 All movements → Views / Reports | Potential | Balance can drift from Σ transactions under concurrency (BUG-INV-010); Manual 6. |

## Cross-Module Concerns

| Concern | Where seen in Inventory | Owner file |
| --- | --- | --- |
| Client-supplied `tenantId` trusted (query string or body, with dev fallback to tenant 1 in `Common/Services/InventoryService.ts` 148-162) | `InventoryController.cs` 41, 129, 258, 298 and every list/movement endpoint (`request.TenantId > 0 ? request.TenantId : GetTenantId()`) | `QA_TenantLocationFramework.md` |
| No server-side role/permission enforcement on `/inventory` APIs | All `InventoryController` endpoints, including `SaveRawMaterial` and `SetRawMaterialStatus` | `QA_RolesPermissions.md` |
| `CanAccessLocation` returns true for any id for all-location users without tenant check | Enables BUG-INV-001 | `QA_TenantLocationFramework.md` |
