# QA — Raw Material Master

| Module | Matrix section | Bug ID prefix | Tested | Confirmed Bugs | Potential Bugs | Manual Verification |
| --- | --- | --- | --- | --- | --- | --- |
| Raw Material Master | 2.9 | BUG-RM | Yes | 2 | 2 | 4 |

Source of test cases: `QA_TEST_MATRIX.md`. Method: static trace of the actual implementation (React UI → service → Axios → .NET controller → service/repository → EF Core → SQL Server, and back). No application code, configuration or database is changed during QA. Findings that depend on deployed configuration, data or a real browser go under **Needs Manual Verification**.

Severity scale:
- **Critical**: security breach, data corruption, financial corruption, or a blocked core workflow.
- **High**: a major feature is broken or a significant security control is bypassed, with a workaround that is hard or unavailable.
- **Medium**: a feature works incorrectly in specific conditions, or a security control is weaker than configured.
- **Low**: cosmetic, minor UX, or an informational/hardening issue.

---

## Confirmed Bugs

### BUG-RM-001 — Raw material list cannot be sorted
**Severity:** Low. A listed list capability is missing; search and pagination still work.
**Status:** Confirmed
**Test Area:** Sorting
**Description:** The matrix lists "Search / Sort / Pagination — Client" for this page. The column definitions have no `sortKey`, the header renders plain `<th>{column.label}</th>` with no click handler, and there is no sort state. The list is always shown in API order.
**Steps to Reproduce:**
1. Open `/masters/raw-material`.
2. Click the "Part No", "Unit Cost" or "Status" column header.
**Expected:** List sorts by the clicked column (as in the other master lists).
**Actual:** Nothing happens; no sort indicator.
**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Masters/RawMaterialMaster.tsx` lines 91-107 (columns without `sortKey`), lines 1208-1213 (plain headers), lines 466-501 (filter + pagination only).
* Backend: `Cimmple_API/CimmpleAPI/Controllers/InventoryController.cs` lines 740-806 (fixed order from the API).
* Database: n/a
**Root Cause:** Sorting not implemented on this page.
**Business Impact:** Harder to find items by cost, vendor or status in large catalogues.
**Affected Areas:** Raw Material list.
**Recommended Fix:** Add `sortKey`s and the shared client sort used by other masters.

---

### BUG-RM-002 — API accepts negative unit cost, reorder values and dimensions
**Severity:** Low. Invalid values are possible only via direct API calls; the UI blocks most of them.
**Status:** Confirmed
**Test Area:** Validation / API
**Description:** The inline editor rejects negative unit cost and reorder values, and `ProductMasterController.SaveReorderPolicy` rejects negative reorder values, but `SaveRawMaterial` stores `UnitCost`, `ReorderPoint`, `ReorderQuantity` and dimensions as sent and copies the reorder values onto every `InventoryBalance` row.
**Steps to Reproduce:**
1. POST `/api/Inventory/SaveRawMaterial` with valid required fields and `UnitCost: -5, ReorderPoint: -10, ThicknessMm: -1`.
2. Open the item in Raw Material Master / Inventory.
**Expected:** 400 with a validation message (consistent with the UI and Product reorder policy).
**Actual:** Saved; inventory balances get a negative reorder point.
**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Masters/RawMaterialMaster.tsx` lines 324-423 (UI checks unit cost and reorder ≥ 0; dimensions rely on HTML `min`).
* Backend: `Cimmple_API/CimmpleAPI/Controllers/InventoryController.cs` lines 808-874 (no range checks), lines 898-927 (values stored and copied to `InventoryBalance`); contrast `ProductMasterController.cs` lines 1119-1159.
* Database: `CimmpleFlow.RawMaterialMaster`, `InventoryBalance.ReorderPoint/ReorderQuantity`.
**Root Cause:** Range validation implemented only in the UI.
**Business Impact:** Negative costs affect material costing/valuation; negative reorder points disable low-stock alerts.
**Affected Areas:** Raw material save, inventory reorder alerts, material cost reports.
**Recommended Fix:** Validate non-negative numeric fields in `SaveRawMaterial`.

---

## Potential Bugs

### BUG-RM-003 — Saving any vendor order silently reactivates deactivated raw materials (or re-creates renamed ones)
**Severity:** Medium. A deliberate master-data decision (deactivation/rename) is undone without the user's knowledge.
**Status:** Potential
**Test Area:** Business Logic / Cross-Module
**Description:** Every `SaveVendorOrder` calls `LinkRawMaterialsOnVendorOrderAsync`, which runs `RawMaterialCatalog.EnsureAsync` for every raw-material line, ignoring an existing `RawMaterialId`. `EnsureAsync` matches by part number (case-insensitive) and sets `IsActive = true` on a match; if the part number was renamed in the master, it creates a new raw material with the old part number and relinks the PO line to it. The matrix describes auto-creation on VO receiving; receiving itself only calls `EnsureAsync` when `RawMaterialId` is empty.
**Steps to Reproduce:**
1. Deactivate raw material `STEEL-1` (no stock).
2. Open an existing vendor order with a raw-material line for `STEEL-1`, change any field (e.g. notes) and save.
3. Reopen Raw Material Master with "Show inactive" off.
4. Separately: rename `AL-6061` to `AL-6061-T6`, then re-save a PO containing `AL-6061`.
**Expected:** Deactivated items stay inactive (or the user is warned); renamed items keep their link.
**Actual:** `STEEL-1` is Active again; a new `AL-6061` raw material is created and the PO line is relinked to it.
**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Masters/RawMaterialMaster.tsx` lines 230-251 (deactivate toggle).
* Backend: `Cimmple_API/CimmpleAPI/Controllers/OrderController.cs` lines 2665-2666 (called on every VO save), lines 3171-3200 (ignores existing `RawMaterialId`, overwrites it); `Cimmple_API/CimmpleAPI/Services/RawMaterialCatalog.cs` lines 27-31 (match by part number), lines 57-58 (reactivation), lines 62-75 (creation).
* Database: `CimmpleFlow.RawMaterialMaster.IsActive`, `VendorOrderDetails.RawMaterialId`.
**Root Cause:** Catalogue linking re-runs on every save and treats the part number, not the stored id, as the key.
**Business Impact:** Retired materials reappear in pickers (job templates, job materials); duplicate raw materials and split inventory history after a rename.
**Affected Areas:** Raw Material Master, Vendor Orders, Inventory, Job Template materials.
**Recommended Fix:** Skip lines that already have a valid `RawMaterialId`; do not reactivate inactive items silently (warn or block instead).
**Why further verification is needed:** The reactivation is explicit in code and may be intended for receiving; product owner must confirm whether it should apply to every PO save and to renamed items.

---

### BUG-RM-004 — Part number and SKU uniqueness are not enforced by the database
**Severity:** Low. Duplicates only under concurrent writes.
**Status:** Potential
**Test Area:** Database / Validation
**Description:** `SaveRawMaterial` checks part number and SKU uniqueness in code, and `RawMaterialCatalog.EnsureAsync` does check-then-insert, but the (Tenantid, PartNo) index is non-unique and SKU has no index. Concurrent saves, PO saves or receiving can insert the same part number twice.
**Steps to Reproduce:**
1. Save two vendor orders containing the same new raw-material part number at the same time (or a manual save racing a PO save).
2. Query `RawMaterialMaster` for duplicates.
**Expected:** One row per part number per tenant.
**Actual:** Duplicates possible.
**Evidence:**
* Frontend: n/a
* Backend: `Cimmple_API/CimmpleAPI/Controllers/InventoryController.cs` lines 827-845; `Cimmple_API/CimmpleAPI/Services/RawMaterialCatalog.cs` lines 27-31, 62-75.
* Database: `Cimmple_API/CimmpleAPI/Data/CimmpleDbContext.cs` lines 584-598 (non-unique index).
**Root Cause:** Check-then-insert without a unique constraint.
**Business Impact:** Duplicate items split stock and confuse "first match" lookups.
**Affected Areas:** Raw material save, VO linking, receiving.
**Recommended Fix:** Add unique indexes on (Tenantid, PartNo) and filtered (Tenantid, Sku).
**Why further verification is needed:** Requires concurrent execution; existing data may already contain duplicates.

---

## Needs Manual Verification

1. **Area:** Business rule — deactivation while referenced
   **What to Test:** Deactivate a raw material with zero stock that is used on a job template or open vendor/job order.
   **Expected:** Per product owner (currently allowed; only stock on hand/reserved blocks it).
   **Why Manual Testing Is Required:** The matrix only requires the stock check; whether template/order usage should also block needs confirmation.
2. **Area:** Inline editor position
   **What to Test:** Scroll to page 3 of the list and click Edit on a row.
   **Expected:** The editor is visible (scrolls into view).
   **Why Manual Testing Is Required:** The editor is rendered inline at the top of the page; scroll behaviour must be checked in a browser.
3. **Area:** Default location inactive
   **What to Test:** Edit a raw material whose default location has since been deactivated, change only the description and save.
   **Expected:** Clear guidance; currently the UI and API both reject the save until a new active location is chosen.
   **Why Manual Testing Is Required:** Confirm with the product owner that forcing a location change on unrelated edits is intended.
4. **Area:** Responsive / permissions
   **What to Test:** List and inline editor at 375–430 px; role without `/masters/raw-material` permission.
   **Expected:** Usable layout; UI blocked for unauthorised roles (API not role-checked, cross-cutting).
   **Why Manual Testing Is Required:** Visual and role configuration.

## No Issues Found

- List: loads with `includeInactive=true` and filters client-side via "Show inactive"; client search; client pagination; deep link `?open`/`?search` by id or part number.
- Required fields Part No, Part Name and Unit validated in UI and API (trimmed).
- Part number unique per tenant (case-insensitive); SKU unique if given; vendor must belong to the tenant; parent ≠ self and parent must belong to the tenant; default location must belong to the tenant and be active.
- Parent dropdown excludes the current record; inactive default location stays visible as "(Inactive)".
- Reorder point/quantity copied to all `InventoryBalance` rows of the item on save.
- Deactivation is blocked when the item has stock on hand or reserved, and the server message is shown to the user.
- Get/save/status all filter by tenant and return 404 for foreign ids.
- Remnants: `BookRemnantOffcutAsync` creates `{part}-R{n}` remnants linked to the top-level parent (`InventoryService.cs` lines 523-659).
- VO receiving creates missing raw materials only when the line has no `RawMaterialId` (`OrderController.cs` lines 3942-3965).

## QA Coverage

| Test Area | Tested | Result |
| --- | --- | --- |
| Navigation | Yes | Pass |
| CRUD | Yes | Pass |
| Search | Yes | Pass |
| Filters | Yes | Pass |
| Sorting | Yes | Fail (BUG-RM-001) |
| Pagination | Yes | Pass |
| Validation | Yes | Fail (BUG-RM-002); Potential (BUG-RM-004) |
| Permissions | Partial | Manual (cross-cutting) |
| API | Yes | Fail (BUG-RM-002) |
| Database | Yes | Potential (BUG-RM-004) |
| Business Logic | Yes | Potential (BUG-RM-003); Manual (deactivation rule) |
| Location | Yes | Pass (default location validated for tenant and active status) |
| Tenant | Yes | Pass (module-level filters correct; cross-cutting tenant trust noted below) |
| Cross-Module | Yes | Potential (BUG-RM-003) |
| Responsive/PWA | Partial | Manual |

## Matrix Checklist

| Matrix Row | Result | Notes |
| --- | --- | --- |
| FE List — `RawMaterialMaster.tsx` (inline editor; "Show inactive"), `/masters/raw-material`, GET `/Inventory/GetRawMaterials?includeInactive` | Pass | |
| FE Search / Sort / Pagination — client | Fail | Search and pagination pass; no sorting (BUG-RM-001). |
| FE Add / Edit — inline (vendor, default location, parent remnant, reorder); POST `/Inventory/SaveRawMaterial`; loads Location, Vendor lists | Pass | Editor position: Manual 2. |
| FE Deactivate — toggle, POST `/Inventory/SetRawMaterialStatus` | Pass | Stock block message surfaced. |
| FE Delete — not available | Pass | No delete UI or endpoint. |
| FE Validation — PartNo, PartName, Unit required | Pass | |
| FE Permissions / Responsive — `/masters/raw-material` | Manual | |
| BE List — GET `GetRawMaterials` | Pass | |
| BE Create/Update — POST `SaveRawMaterial` (copies reorder to `InventoryBalance`) | Fail | No range validation (BUG-RM-002). |
| BE Status — POST `SetRawMaterialStatus` (blocked with on-hand or reserved stock) | Pass | Template/order usage not checked (Manual 1). |
| BE Validation — PartNo unique per tenant; SKU unique if given; vendor in tenant; parent ≠ self; default location active; index (Tenantid, PartNo) | Pass / Potential | Code checks correct; index non-unique (BUG-RM-004). |
| BE Authorization — authenticated | Pass | No role checks (cross-cutting). |
| BL — Remnants are created on issue with an offcut (`{part}-R{n}`) | Pass | |
| BL — Raw materials are auto-created by VO receiving (`RawMaterialCatalog.EnsureAsync`) | Potential | Also runs on every VO save and reactivates/re-creates items (BUG-RM-003). |

## Cross-Module Concerns

| Concern | Affected endpoints | Owner / root file |
| --- | --- | --- |
| Client-supplied `tenantid`/`Tenantid` preferred over the token tenant | `GET /Inventory/GetRawMaterials`, `POST /Inventory/SaveRawMaterial`, `POST /Inventory/SetRawMaterialStatus` (`dto.Tenantid > 0 ? dto.Tenantid : GetTenantId()`) | `QA_TenantLocationFramework.md` |
| No server-side role/permission enforcement | All raw-material endpoints in `InventoryController` | `QA_RolesPermissions.md` |
