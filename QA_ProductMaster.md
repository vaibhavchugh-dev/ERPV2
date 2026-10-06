# QA — Product Master

| Module | Matrix section | Bug ID prefix | Tested | Fix Tested | Confirmed Bugs | Potential Bugs | Manual Verification |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Product Master | 2.8 | BUG-PROD | Yes | No | 4 | 1 | 4 |

Source of test cases: `QA_TEST_MATRIX.md`. Method: static trace of the actual implementation (React UI → service → Axios → .NET controller → service/repository → EF Core → SQL Server, and back). No application code, configuration or database is changed during QA. Findings that depend on deployed configuration, data or a real browser go under **Needs Manual Verification**.

Severity scale:
- **Critical**: security breach, data corruption, financial corruption, or a blocked core workflow.
- **High**: a major feature is broken or a significant security control is bypassed, with a workaround that is hard or unavailable.
- **Medium**: a feature works incorrectly in specific conditions, or a security control is weaker than configured.
- **Low**: cosmetic, minor UX, or an informational/hardening issue.

---

## Confirmed Bugs

### BUG-PROD-001 — One part number is split into several list rows when its name or unit differs between order lines
**Severity:** Medium. Aggregated quantities, prices and order counts in the list are wrong for affected parts.
**Status:** Confirmed
**Test Area:** List / Business Logic
**Description:** `GetProductsFromOrders` groups order and quotation lines by (PartNo, partname, Unit), and the merge key also includes name and unit. Any spelling difference in the part name (e.g. "Bracket" vs "Bracket, steel") or unit ("EA" vs "PCS") on order lines produces separate rows for the same part number, each with partial totals. Clicking either row opens the same detail view, which aggregates by part number only, so list and detail disagree.
**Steps to Reproduce:**
1. Create two customer order lines for part `P-100`: one with name "Bracket" qty 10, one with name "Bracket steel" qty 5.
2. Open Product Master and search `P-100`.
3. Open either row.
**Expected:** One row for `P-100` with Total Qty 15 (the matrix describes the list as aggregated per part).
**Actual:** Two rows (qty 10 and qty 5); the detail view for either shows qty 15.
**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Masters/ProductMaster.tsx` lines 89-112 (merges with master list case-insensitively but keeps both order rows).
* Backend: `Cimmple_API/CimmpleAPI/Controllers/ProductMasterController.cs` lines 38-43, 73-78 (group key), lines 104, 128 (merge key includes name/unit), lines 267-276 (detail filters by part number only).
* Database: `CimmpleFlow.CustomerOrderDetails`, `QuotationOrderDetails`.
**Root Cause:** Aggregation key includes descriptive fields instead of the part number alone.
**Business Impact:** Sales history and pricing per part are understated; users see apparent duplicates.
**Affected Areas:** Product list, sorting by totals, CSV/report consumers of this endpoint.
**Recommended Fix:** Group by normalised part number only and pick the latest name/unit for display.

---

### BUG-PROD-002 — Detail view for parts in Product Master loses customer history and min/max price
**Severity:** Medium. A major part of the product detail (customers, price range, live average price) is missing for exactly the parts that have been synced.
**Status:** Confirmed
**Test Area:** View / Cross-Module
**Description:** `GetProductById` checks `ProductMaster` first and, when found, returns only master fields (`unitPrice` snapshot, reorder fields) with `source = "ProductMaster"`. It skips the order/quotation aggregation, so the slideout shows Min/Max price as "N/A", hides the Customers section, and shows the stored snapshot price instead of current order averages. After "Sync from orders" every ordered part takes this path.
**Steps to Reproduce:**
1. Open a part that exists only in orders: customers, min/max price are shown.
2. Click "Sync from orders" in Product Master.
3. Open the same part again.
**Expected:** Same history and prices as before, plus reorder settings.
**Actual:** Min/Max show "N/A", the Customers section disappears, and the average price is the stored snapshot.
**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Masters/ProductMasterSlideout.tsx` lines 300, 319 ("N/A" fallback), lines 392-538 (customers section only when `customers` present); `Cimmple_UI/src/Common/Services/ProductMasterService.ts` lines 172-232.
* Backend: `Cimmple_API/CimmpleAPI/Controllers/ProductMasterController.cs` lines 246-264 (early return), lines 267-442 (aggregation only for non-master parts), lines 880-1117 (sync creates master rows).
* Database: `CimmpleFlow.ProductMaster`, `CustomerOrderDetails`, `QuotationOrderDetails`.
**Root Cause:** Mutually exclusive branches instead of master data enriched with order statistics.
**Business Impact:** Users lose customer and pricing insight for catalogued parts, which is the main purpose of the detail view.
**Affected Areas:** Product detail slideout, global search deep links to products.
**Recommended Fix:** When a master row exists, still compute the order/quotation aggregates and customers and merge them into the response.

---

### BUG-PROD-003 — Case-variant part numbers cannot open the master record (reorder policy not editable)
**Severity:** Low. Affects only parts whose order lines use different letter case from the master row.
**Status:** Confirmed
**Test Area:** View / Data matching
**Description:** The list merges order rows with master rows case-insensitively, and `ProductSourcing.EnsureFinishedProductAsync` / sync match case-insensitively. `GetProductById` compares the trimmed part number ordinally (case-sensitive), so for `p-100` in orders and `P-100` in Product Master, opening `p-100` falls through to the order aggregation, `source` is not "ProductMaster", and the reorder fields are read-only.
**Steps to Reproduce:**
1. Have Product Master row `P-100` and order lines with part number `p-100` (only the order row appears in the list).
2. Open it.
**Expected:** Master record opens with editable reorder point/quantity.
**Actual:** Order-based view; reorder section not editable.
**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Masters/ProductMaster.tsx` lines 89-112 (case-insensitive merge); `Cimmple_UI/src/Modules/Masters/ProductMasterSlideout.tsx` lines 85-88 (`canEditReorder` requires `source === "ProductMaster"`).
* Backend: `Cimmple_API/CimmpleAPI/Controllers/ProductMasterController.cs` lines 241-244 (ordinal compare); `Cimmple_API/CimmpleAPI/Services/ProductSourcing.cs` lines 47-98 (case-insensitive).
* Database: `CimmpleFlow.ProductMaster.partno`.
**Root Cause:** Inconsistent case sensitivity across lookups.
**Business Impact:** Reorder policy cannot be set from the UI for these parts.
**Affected Areas:** Product detail, reorder policy.
**Recommended Fix:** Use `StringComparison.OrdinalIgnoreCase` (and the same rule for the order fallback).

---

### BUG-PROD-004 — "Last Ordered" shows the latest due date, including quotation due dates
**Severity:** Low. Misleading date column.
**Status:** Confirmed
**Test Area:** List / Data accuracy
**Description:** The column labelled "Last Ordered" is `lastOrderDate`, computed as the maximum `DueDate` of order lines and then merged with the maximum quotation `DueDate`. A future-dated delivery or a quotation that was never ordered makes the column show a date on which nothing was ordered.
**Steps to Reproduce:**
1. Create a quotation for part `P-200` with due date next month (no order).
2. Open Product Master and check "Last Ordered" for `P-200`.
**Expected:** Date of the most recent customer order (or blank if never ordered).
**Actual:** Next month's quotation due date.
**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Masters/ProductMaster.tsx` lines 13-24 ("Last Ordered" → `lastOrderDate`).
* Backend: `Cimmple_API/CimmpleAPI/Controllers/ProductMasterController.cs` lines 57-58, 89-90, 145, 170-171.
* Database: `CimmpleFlow.CustomerOrderDetails.DueDate`, `QuotationOrderDetails.DueDate`.
**Root Cause:** Due date used as order date; quotation dates merged into the order date.
**Business Impact:** Users misjudge how recently a part sold.
**Affected Areas:** Product list column and sort.
**Recommended Fix:** Use the order header date for orders only and expose quotation dates separately.

---

## Potential Bugs

### BUG-PROD-005 — Product Master has no unique part number constraint, so concurrent syncs can create duplicates
**Severity:** Low. Duplicates only under concurrent sync/order saves.
**Status:** Potential
**Test Area:** Database / Concurrency
**Description:** `SyncFromOrders` and `ProductSourcing.EnsureFinishedProductAsync` load all tenant products into memory, look for a case-insensitive match, and insert if none is found. There is no unique index on (tenantid, partno), so two simultaneous operations (e.g. two vendor orders saved at once, or sync while an order is saved) can insert the same part twice. Loading the whole catalogue on each call also scales poorly.
**Steps to Reproduce:**
1. Trigger "Sync from orders" while another user saves a vendor order containing a new make/buy part.
2. Query `ProductMaster` for duplicates.
**Expected:** One row per part number per tenant.
**Actual:** Duplicate rows are possible.
**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Masters/ProductMaster.tsx` (Sync button).
* Backend: `Cimmple_API/CimmpleAPI/Controllers/ProductMasterController.cs` lines 880-1117; `Cimmple_API/CimmpleAPI/Services/ProductSourcing.cs` lines 47-98; `Cimmple_API/CimmpleAPI/Data/CimmpleDbContext.cs` (no `ProductMaster` index configuration).
* Database: `CimmpleFlow.ProductMaster`.
**Root Cause:** Check-then-insert without a DB constraint.
**Business Impact:** Duplicate products break the "first match" lookups used by orders and inventory.
**Affected Areas:** Sync, vendor order product linking, reorder policy.
**Recommended Fix:** Add a unique index on (tenantid, normalised partno) and handle violations by re-reading.
**Why further verification is needed:** Requires concurrent execution; existing data may already contain duplicates.

---

## Needs Manual Verification

1. **Area:** Navigation / deep links
   **What to Test:** `/masters/product?open=<partNo>` with spaces/special characters, and opening a product from global search.
   **Expected:** The correct product slideout opens.
   **Why Manual Testing Is Required:** URL encoding of part numbers depends on the browser and the data.
2. **Area:** Reorder policy
   **What to Test:** Save reorder point/quantity for a master product, then check Inventory reorder alerts.
   **Expected:** Values persisted on `ProductMaster` and copied to inventory balances.
   **Why Manual Testing Is Required:** Requires inventory data and alert jobs.
3. **Area:** Performance
   **What to Test:** Product list and sync on a tenant with many thousand order lines.
   **Expected:** List loads in acceptable time.
   **Why Manual Testing Is Required:** Full in-memory aggregation; depends on data volume.
4. **Area:** Responsive / permissions
   **What to Test:** Product list and slideout at 375–430 px; role without `/masters/product` permission.
   **Expected:** Usable layout; UI blocked for unauthorised roles (API is not role-checked, cross-cutting).
   **Why Manual Testing Is Required:** Visual and role configuration.

## No Issues Found

- List data is tenant-filtered and excludes job-number-like part numbers (`#JO`, `JO#`).
- Client search on part number, name and unit; sort on all aggregate columns; client pagination; column chooser.
- Merge with `GetProductMasterList` adds master-only products to the list.
- Sync from orders de-duplicates case-insensitively, sets sourcing type (Make + Buy → Both) and links vendor order lines.
- Reorder policy: only editable for master records; negative values rejected in UI and API; values copied to inventory balances.
- `GetPartsByCustomer` / `GetPartsByVendor` filter by tenant and the given customer/vendor.

## QA Coverage

| Test Area | Tested | Result |
| --- | --- | --- |
| Navigation | Yes | Pass (deep links: Manual) |
| CRUD | Yes | Fail (BUG-PROD-002, BUG-PROD-003) |
| Search | Yes | Pass |
| Filters | Yes | N/A (no filters in matrix beyond search) |
| Sorting | Yes | Fail (BUG-PROD-004 affects date sort) |
| Pagination | Yes | Pass |
| Validation | Yes | Pass |
| Permissions | Partial | Manual (cross-cutting) |
| API | Yes | Fail (BUG-PROD-001, BUG-PROD-002) |
| Database | Yes | Potential (BUG-PROD-005) |
| Business Logic | Yes | Fail (BUG-PROD-001, BUG-PROD-004) |
| Location | Yes | N/A (tenant-wide master) |
| Tenant | Yes | Pass (module-level filters correct; cross-cutting tenant trust noted below) |
| Cross-Module | Yes | Fail (BUG-PROD-002) |
| Responsive/PWA | Partial | Manual |

## Matrix Checklist

| Matrix Row | Result | Notes |
| --- | --- | --- |
| FE List — `ProductMaster.tsx`, `/masters/product`, GET `GetProductMasterList`, `GetProductsFromOrders` | Fail | BUG-PROD-001, BUG-PROD-004. |
| FE Search — partNo, partName, unit (client) | Pass | `ProductMaster.tsx` lines 162-168. |
| FE Sort — aggregate columns: quantities, avg price, counts, last ordered | Fail | Sort works, but "Last Ordered" values are due dates (BUG-PROD-004); split rows distort totals (BUG-PROD-001). |
| FE Pagination — client | Pass | |
| FE Sync — "Sync from orders", POST `SyncFromOrders` | Pass | Error toast uses `error.message` only (minor, not logged separately). |
| FE View / Edit — `ProductMasterSlideout.tsx` (reorder policy only when `source === "ProductMaster"`); GET `GetProductById?partNo`; POST `SaveReorderPolicy` | Fail | BUG-PROD-002, BUG-PROD-003. |
| FE Add / Delete — not available (derived from orders/quotes) | Pass | No add/delete UI or endpoints. |
| FE Validation — reorder point/qty numeric | Pass | Numeric and ≥ 0 in UI (`ProductMasterSlideout.tsx` lines 97-130) and API. |
| FE Permissions / Responsive — `/masters/product` | Manual | |
| BE List/Get — list, from orders, by part, `GetPartsByCustomer`, `GetPartsByVendor` | Fail | BUG-PROD-001, BUG-PROD-002, BUG-PROD-003. |
| BE Sync — POST `SyncFromOrders` (Make+Buy → Both), `ProductSourcing` | Pass / Potential | Logic correct; no DB unique constraint (BUG-PROD-005). |
| BE Update — POST `SaveReorderPolicy` (`ProductMaster`, `InventoryBalance`) | Pass | `ProductMasterController.cs` lines 1119-1159. |
| BE Authorization — authenticated | Pass | No role checks (cross-cutting). |
| BL — Sync never duplicates part numbers | Pass / Potential | Case-insensitive in-memory dedupe; concurrent runs not protected (BUG-PROD-005). |
| BL — FG products auto-created by job completion, shipments and VO receiving (`ProductSourcing.EnsureFinishedProductAsync`) | Pass / Potential | Case-insensitive match before insert (`ProductSourcing.cs` lines 47-98); same race (BUG-PROD-005). |

## Cross-Module Concerns

| Concern | Affected endpoints | Owner / root file |
| --- | --- | --- |
| Client-supplied `tenantid`/`tenantId` trusted without comparison to the token tenant | `GET /ProductMaster/GetProductsFromOrders`, `GetProductMasterList`, `GetProductById`, `GetPartsByCustomer`, `GetPartsByVendor`; `POST SyncFromOrders`; `POST SaveReorderPolicy` (prefers `dto.Tenantid` over the token) | `QA_TenantLocationFramework.md` |
| No server-side role/permission enforcement | All `/api/ProductMaster/*` endpoints | `QA_RolesPermissions.md` |

