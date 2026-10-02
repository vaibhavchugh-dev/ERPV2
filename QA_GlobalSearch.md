# QA — Global Search

| Module | Matrix section | Bug ID prefix | Tested | Confirmed Bugs | Potential Bugs | Manual Verification |
| --- | --- | --- | --- | --- | --- | --- |
| Global Search | 1.6 | BUG-SRCH | Yes | 8 | 2 | 5 |

Source of test cases: `QA_TEST_MATRIX.md`. Method: static trace of the actual implementation (React UI → service → Axios → .NET controller → service/repository → EF Core → SQL Server, and back). No application code, configuration or database is changed during QA. Findings that depend on deployed configuration, data or a real browser go under **Needs Manual Verification**.

Severity scale:
- **Critical**: security breach, data corruption, financial corruption, or a blocked core workflow.
- **High**: a major feature is broken or a significant security control is bypassed, with a workaround that is hard or unavailable.
- **Medium**: a feature works incorrectly in specific conditions, or a security control is weaker than configured.
- **Low**: cosmetic, minor UX, or an informational/hardening issue.

---

Files traced: `Cimmple_UI/src/Common/Components/TopBar.tsx`, `Common/Components/SearchResultsDropdown.tsx`, `Common/Services/GlobalSearchService.ts`, `Common/Utils/chatMentions.tsx`, `Common/Utils/displayDocNumberSearch.ts`, the `?open=` handlers of every destination page, `Cimmple_API/CimmpleAPI/Controllers/GlobalSearchController.cs`, `Controllers/ApiBaseController.cs`.

## Confirmed Bugs

### BUG-SRCH-001 — Search results ignore the user's allowed locations

**Severity:** Medium. A location-restricted user can read summary data for documents at sites they are not assigned to; the location control is weaker than configured.

**Status:** Confirmed

**Test Area:** Location / Permissions / API

**Description:**
`GET /api/GlobalSearch/Search` and `GET /api/GlobalSearch/SearchDocuments` filter every query only by `tenantId`. Neither endpoint reads `X-Location-Id`, the `locationIds` claim, `CanAccessAllLocations()` or `TryResolveListLocationFilter`. Every other location-scoped list (customer orders, quotations, banks, vendor orders) restricts a non-admin user to their allowed sites, and detail endpoints such as `Order/GetOrderById` return 403 for other sites. Global search therefore returns customer orders, customer quotations, job orders, vendor orders, vendor quotations, customer invoices, shipments, NCRs and banks from all sites, with customer/vendor name, total amount, status and dates shown in the dropdown. The chat @-mention picker (`SearchDocuments`) has the same gap. The matrix records "no location filter on server" as the current state; it is reported here because it is inconsistent with the site restriction enforced by every list and detail endpoint for the same records.

**Steps to Reproduce:**
1. Create two sites, A and B. Create a customer order at site B for customer "Zeta Corp" with a total of 50,000.
2. Log in as a non-admin user who is mapped only to site A (`canAccessAllLocations = false`).
3. Type "Zeta" in the TopBar search box.
4. The Orders section lists the site B order with "Zeta Corp • $50,000.00" and its status. Clicking it opens the slideout, which then fails with "You don't have access to this document".

**Expected:**
Search returns only records the user could see in the module lists: records at allowed sites for restricted users, tenant-wide only for `canAccessAllLocations` users.

**Actual:**
All sites are returned; only the detail page enforces the site restriction.

**Evidence:**
* Frontend: `Cimmple_UI/src/Common/Components/TopBar.tsx` lines 120–137 (`GlobalSearchService.Search(query, tenantId, 5)`, no location passed); `Common/Components/SearchResultsDropdown.tsx` lines 151–157 (customer name and amount rendered).
* Backend: `Cimmple_API/CimmpleAPI/Controllers/GlobalSearchController.cs` lines 313–358 (`SearchOrders`: `Where(o => o.Tenantid == tenantId)` only), 457–498 (quotations), 407–455 (job orders), 726–770 (vendor orders), 360–405 (invoices), 888–918 (shipments), 921–971 (NCRs), 501–522 (banks). Compare `Controllers/OrderController.cs` lines 299–301 (`CanAccessLocation` → 403 on the detail) and `Controllers/BankController.cs` lines 29–44 (bank list uses `TryResolveListLocationFilter`). `Controllers/ApiBaseController.cs` lines 189–216 (the shared list filter that search does not use).
* Database: `CustomerOrder.locationId`, `QuotationOrder.Locationid`, `VendorOrders.LocationId`, `BankMaster.locationId` are available but not filtered.

**Root Cause:**
The search controller was written with tenant-only predicates and never adopted the shared location filter.

**Business Impact:**
Multi-site tenants that separate sites (for example, separate business units) leak customer names, order values and quality issues across sites.

**Affected Areas:** Global Search, chat @-mentions (Conversations 1.9), Tenant/Location framework (11.2).

**Recommended Fix:**
Call `TryResolveListLocationFilter(null, …)` in both endpoints and apply the resulting site restriction to each location-bearing query (orders, quotations, job orders through the customer order, invoices and shipments through the order, vendor orders/quotations, NCRs through the job, banks).

---

### BUG-SRCH-002 — The search dropdown shows records from modules the user has no permission to open

**Severity:** Medium. Role permissions hide a module from the menu and block its route, but the same data is displayed in the search dropdown to any user.

**Status:** Confirmed

**Test Area:** Permissions

**Description:**
The matrix says a result is "blocked if no permission". The implementation only blocks the click (`navigateToMentionDocument` → `AuthService.hasPermissionForPath`). The dropdown itself renders every category returned by the API, and the API applies no role or permission filter. A user whose role only has, for example, the Job Orders permission sees journal entries (reference and description), banks (account numbers, see BUG-SRCH-003), credit cards (cardholder, last four digits), chart of accounts, users and employees (email, username, employee code), customer invoices with amounts, and vendor invoices with amounts.

**Steps to Reproduce:**
1. Create a role with only the Job Orders permission and assign it to a user (role name must not contain "admin", see BUG-AUTH-017).
2. Log in as that user. The sidebar shows only Job Orders.
3. Type part of a vendor name or a bank name in the search box.
4. Vendor Invoices (with totals), Banks (with account numbers) and other unpermitted sections are listed. Clicking one shows "You don't have access to this document".

**Expected:**
Categories for modules the user cannot open are not returned (or at least not displayed).

**Actual:**
All 26 categories are displayed; only navigation is blocked.

**Evidence:**
* Frontend: `Common/Components/SearchResultsDropdown.tsx` lines 210–521 (every non-empty category is rendered, no permission check); `Common/Utils/chatMentions.tsx` lines 77–96 (permission is checked only on click); `Common/Components/TopBar.tsx` lines 609–614.
* Backend: `Controllers/GlobalSearchController.cs` lines 60–89 (all categories always queried). There is no permission data in the request.
* Database: n/a.

**Root Cause:**
Permission filtering was implemented as a navigation guard, not as a result filter. (The general absence of server-side permission checks is logged under Roles & Permissions; this bug is about the search UI displaying unpermitted data even within the intended UI-level model.)

**Business Impact:**
Financial and HR summaries are visible to every logged-in user, defeating the purpose of role-restricted menus.

**Affected Areas:** Global Search, Roles & Permissions (1.4).

**Recommended Fix:**
Filter categories in the UI with `AuthService.hasPermissionForPath(getResultUrl(...))` before rendering, and preferably skip the corresponding queries on the server using the token's permissions.

---

### BUG-SRCH-003 — Full bank account numbers are shown and searchable in global search, although Bank Master masks them

**Severity:** Medium. Sensitive financial identifiers are exposed to any user, contrary to the masking used elsewhere.

**Status:** Confirmed

**Test Area:** Permissions / Search

**Description:**
`SearchBanks` matches on `AccountNo` and returns the full value. The dropdown subtitle prints `code • accountNo` unmasked. Bank Master (`BankMaster.tsx`) and the company-bank helpers display the same value through `maskAccountNumber` ("••••1234"). Because the search is a `Contains` match, typing a few digits also confirms whether an account number contains them.

**Steps to Reproduce:**
1. In Bank Master, create a bank with account number 123456789012 (the list shows ••••9012).
2. As any user (any role, any site), type the bank name or "5678" into global search.
3. The Banks section shows "… • 123456789012".

**Expected:**
The account number is masked in search results the same way as in Bank Master, and is not a searchable field for users who cannot open banks.

**Actual:**
The full account number is displayed.

**Evidence:**
* Frontend: `Common/Components/SearchResultsDropdown.tsx` lines 159–160 (`result.accountNo` rendered raw). Compare `Modules/Masters/BankMaster.tsx` lines 36–40 (`render: (value) => maskAccountNumber(value)`) and `Common/Hooks/useCompanyBanks.ts` lines 5–9.
* Backend: `Controllers/GlobalSearchController.cs` lines 503–518 (`AccountNo.ToLower().Contains(searchTerm)`, `accountNo = b.AccountNo`).
* Database: `BankMaster.AccountNo`.

**Root Cause:**
The search projection returns the raw column and the dropdown does not apply the existing masking helper.

**Business Impact:**
Exposure of company bank account numbers to shop-floor or vendor-facing staff increases fraud risk.

**Affected Areas:** Global Search, Bank Master (2.x).

**Recommended Fix:**
Return only the last four digits from the API (or mask in the projection), use `maskAccountNumber` in the dropdown, and remove `AccountNo` from the match fields or restrict it to users with bank permission.

---

### BUG-SRCH-004 — Clicking a Vendor Receiving result opens the wrong vendor order

**Severity:** Medium. The user is shown a different purchase order than the one they searched for and may receive goods against it.

**Status:** Confirmed

**Test Area:** Navigation

**Description:**
`SearchVendorReceiving` returns `id = VendorReceiving.ID` (a receiving transaction row). `GlobalSearchService.getResultUrl` sends it as `/purchasing/vendor-receiving?open=<id>`. The Vendor Receiving page treats `open` as a vendor order ID (`setSelectedOrderId(id)` → `<VendorReceivingDetail orderId={selectedOrderId}>`). The receiving row ID and the vendor order ID are unrelated identity values, so the page opens whichever vendor order happens to have that number, or an empty/failed detail if none exists.

**Steps to Reproduce:**
1. Receive goods on VO#1010 (OrderID 11). The new receiving row gets, for example, ID 57.
2. Search for the vendor name. Under "Vendor Receiving", click "Receiving #57".
3. The Vendor Receiving detail opens for OrderID 57 (a different VO, or nothing) instead of OrderID 11.

**Expected:**
The receiving result opens the vendor order it belongs to.

**Actual:**
The receiving row ID is used as an order ID.

**Evidence:**
* Frontend: `Common/Services/GlobalSearchService.ts` lines 217–218; `Modules/Purchasing/VendorReceiving.tsx` lines 22–34 (`open` → `setSelectedOrderId(id)`) and 181–184 (`orderId={selectedOrderId}`); `Common/Services/GlobalSearchService.ts` lines 275–276 (label "Receiving #id").
* Backend: `Controllers/GlobalSearchController.cs` lines 805–811 and 828–836 (`id = g.Key` where the key is `receivingRec.ID`; the joined `order.OrderID` is not returned).
* Database: `VendorReceiving.ID` vs `VendorOrders.OrderID`.

**Root Cause:**
The search projection returns the receiving row key instead of the parent order key expected by the destination page.

**Business Impact:**
Receiving clerks can open and act on the wrong purchase order.

**Affected Areas:** Global Search, Vendor Receiving (Procurement).

**Recommended Fix:**
Return the parent `OrderID` (for example as `orderId`) and build the URL from it; keep the receiving ID only for the label.

---

### BUG-SRCH-005 — "Press Enter to open first result" opens a different result than the first one shown, and never opens journal entries

**Severity:** Low. Keyboard navigation opens an unexpected record; the user can still click the intended one.

**Status:** Confirmed

**Test Area:** Navigation / Keyboard

**Description:**
The dropdown footer says "Press Enter to open first result". `getFirstResult` walks categories in this order: customers, vendors, products, raw materials, orders, **invoices, job orders, quotations, vendor orders, vendor invoices, vendor receiving, vendor quotations, banks**, workstations, … , documents. The dropdown renders: customers, vendors, products, raw materials, orders, **quotations, invoices, job orders, banks, workstations, locations, processes, job templates, price breakdowns, credit cards, chart of accounts, vendor orders**, … , documents, journal entries. `journalEntries` is not in the `getFirstResult` list at all.

**Steps to Reproduce:**
1. Search a term that matches a customer quotation and a job order but no customer/vendor/product/order (for example a customer name that exists only on quotes and jobs, or a numeric display number shared by a CQ and a JO).
2. The dropdown shows the Quotations section first. Press Enter. The job order opens.
3. Search "JE #12" (only a journal entry matches). Press Enter. Nothing happens.

**Expected:**
Enter opens the first item displayed in the dropdown, including journal entries.

**Actual:**
The opened item follows a different category order; journal entries cannot be opened with Enter.

**Evidence:**
* Frontend: `Common/Components/TopBar.tsx` lines 553–568 (`getFirstResult` category list) and 570–601 (Enter handler); `Common/Components/SearchResultsDropdown.tsx` lines 211–521 (render order) and 523–525 (footer text).
* Backend: n/a.
* Database: n/a.

**Root Cause:**
Two hard-coded category orders that drifted apart.

**Business Impact:**
Minor; users relying on the keyboard open the wrong document.

**Affected Areas:** Global Search.

**Recommended Fix:**
Define the category order once and use it for both rendering and `getFirstResult`; include `journalEntries`.

---

### BUG-SRCH-006 — Invoice and vendor-invoice status in search results ignores Void and partial payments

**Severity:** Low. Results show a status that contradicts the invoice modules.

**Status:** Confirmed

**Test Area:** Search / Business logic

**Description:**
`SearchInvoices` computes status as "Paid" if `PaymentDate` is set, otherwise "Overdue"/"Unpaid". It ignores `IsVoided` and `PaidAmount`. The invoice module (`ResolveCustomerInvoiceStatus`) returns "Void", "Paid", "Partially Paid", "Overdue" or "Unpaid", and `PaymentDate` is only set when the invoice is fully paid. `SearchVendorInvoices` uses `isPaid == 1 ? "Paid" : …`; the vendor invoice module treats `isPaid == 2` as "Void" and also reports "Partially Paid" and "Approved"/"Pending Approval".

**Steps to Reproduce:**
1. Void a past-due customer invoice. Search for its number: the result shows "Overdue".
2. Record a partial payment on an invoice. Search for it: the result shows "Unpaid" or "Overdue"; the Customer Invoices list shows "Partially Paid".
3. Void a vendor invoice. Search for it: the result shows "Unpaid"/"Overdue".

**Expected:**
Search shows the same status as the Customer Invoices and Vendor Invoices modules.

**Actual:**
Voided invoices appear unpaid/overdue and partial payments are not reflected.

**Evidence:**
* Frontend: `Common/Components/SearchResultsDropdown.tsx` lines 125–129 (status badge).
* Backend: `Controllers/GlobalSearchController.cs` lines 397–398 (customer invoice status) and 794 (vendor invoice status). Compare `Controllers/InvoiceController.cs` lines 1287–1302 and 1139 (`PaymentDate` only when fully paid), `Controllers/VendorInvoiceController.cs` lines 1036–1051.
* Database: `InvoiceMaster.IsVoided`, `InvoiceMaster.PaidAmount`, `VendorInvoiceMaster.isPaid`, `VendorInvoiceMaster.PaidAmount`.

**Root Cause:**
Status logic was duplicated in the search controller instead of reusing the module resolvers.

**Business Impact:**
Users may chase payment on voided invoices or misjudge balances from the search dropdown.

**Affected Areas:** Global Search, Customer Invoices, Vendor Invoices.

**Recommended Fix:**
Reuse the module status resolvers (or project the same fields and logic) and consider excluding voided invoices or labelling them.

---

### BUG-SRCH-007 — Partial formatted document numbers don't match the numbers users see

**Severity:** Low. Typing the beginning of a displayed number misses the matching documents.

**Status:** Confirmed

**Test Area:** Search / Business logic

**Description:**
The UI displays CO/CQ/JO/VO/VQ numbers as `PONumber + 999` when `PONumber < 1000` (for example PONumber 1 → "CO#1000"). List pages match against the displayed number (`matchDisplayDocNumber`: a prefixed query matches display numbers that start with the typed digits). Global search instead matches the raw stored number: `PONumber == n`, `PONumber == n − 999` (only when n ≥ 1000), or `PONumber.ToString().Contains(n)`. A partial display number therefore misses the right records and returns unrelated ones. Exact full display numbers do work.

**Steps to Reproduce:**
1. Have customer orders with PONumber 1–10 (displayed CO#1000–CO#1009) and PONumber 100 (displayed CO#1099).
2. In the Customer Orders list search, type "CO#100": CO#1000–CO#1009 are shown.
3. In global search, type "CO#100": CO#1000–CO#1009 are not returned; CO#1099 (PONumber 100) and any PONumber containing "100" are returned instead.

**Expected:**
Formatted numbers resolve to the records whose displayed number matches, consistent with list search ("Formatted numbers must resolve to the right record").

**Actual:**
Partial formatted numbers are matched against the raw stored number.

**Evidence:**
* Frontend: `Common/Utils/displayDocNumberSearch.ts` lines 41–68 (list-page matching on display number, prefix `startsWith` at 53–57).
* Backend: `Controllers/GlobalSearchController.cs` lines 240–263 (`ParseDocNumber`, `poCandidate = n >= 1000 ? n - 999 : n`) and 323–331, 416–425, 466–473, 735–743, 853–860 (raw `PONumber`/`JobOrderNumber` comparisons).
* Database: `CustomerOrder.PONumber`, `QuotationOrder.PONumber`, `JobOrderMaster.JobOrderNumber`, `VendorOrders.PONumber`, `VendorQuotations.PONumber`.

**Root Cause:**
The server-side matcher does not compute the display number before comparing.

**Business Impact:**
Users searching by the number printed on a document get incomplete results.

**Affected Areas:** Global Search, chat document mentions.

**Recommended Fix:**
Match on the computed display number (`CASE WHEN PONumber < 1000 THEN PONumber + 999 ELSE PONumber END`) with the same prefix/startsWith rules as `matchDisplayDocNumber`.

---

### BUG-SRCH-008 — Search endpoint has no upper bound on `limit`, no tenant guard, and returns raw exception text

**Severity:** Low. Hardening gap: bulk extraction and information disclosure are easier than necessary.

**Status:** Confirmed

**Test Area:** API / Error handling

**Description:**
`GET /GlobalSearch/Search` uses the caller's `limit` unchanged for all 26 queries (the chat endpoint `SearchDocuments` caps it at 15). A single request with `limit=100000` and a one-character query returns most of the tenant's customers, vendors, users with emails, banks, invoices and so on. The endpoint also does not reject `tenantId <= 0` (unlike `SearchDocuments`), and on failure returns `error = ex.Message` to the client.

**Steps to Reproduce:**
1. Call `GET /api/GlobalSearch/Search?query=a&tenantId=<own tenant>&limit=100000` with a valid token.
2. Observe very large result arrays for each category.
3. Cause a database error (for example during maintenance) and observe the raw exception message in `error`.

**Expected:**
`limit` is clamped (the UI uses 5), invalid tenant IDs are rejected, and errors return a generic message.

**Actual:**
No clamp, no tenant guard, exception text returned.

**Evidence:**
* Frontend: `Common/Components/TopBar.tsx` line 129 (UI always sends 5).
* Backend: `Controllers/GlobalSearchController.cs` lines 22–23 (signature), 60–89 (limit passed unchanged), 93–97 (`error = ex.Message`); compare 112 and 125–126 (`SearchDocuments` guard and cap).
* Database: n/a.

**Root Cause:**
Input bounds were added only to the newer document-search endpoint.

**Business Impact:**
Makes data scraping trivial (especially combined with the cross-module tenant concern below) and adds load.

**Affected Areas:** Global Search API.

**Recommended Fix:**
Clamp `limit` (for example 1–25), return 400 for `tenantId <= 0`, log exceptions server-side and return a generic message.

---

## Potential Bugs

### BUG-SRCH-009 — A slow earlier search can overwrite the results of a newer query

**Severity:** Low

**Status:** Potential

**Test Area:** Search / Error handling

**Description:** The 300 ms debounce delays sending but does not cancel or sequence in-flight requests. `performSearch` always writes its response into `searchResults`. Each search runs 26 sequential database queries, so response times vary. If the request for "acm" returns after the request for "acme", the dropdown shows results for "acm" while the input shows "acme".

**Steps to Reproduce:**
1. Throttle the network in DevTools.
2. Type "acm", pause about 350 ms, then type "e".
3. Observe which result set remains displayed.

**Expected:** Only the latest query's response is applied.

**Actual:** The last response to arrive wins.

**Evidence:**
* Frontend: `Common/Components/TopBar.tsx` lines 120–137 (no request ID or AbortController), 139–159 (debounce only).
* Backend: `Controllers/GlobalSearchController.cs` lines 60–89 (26 sequential awaits).
* Database: n/a.

**Root Cause:** No stale-response guard.

**Business Impact:** Confusing results; Enter may open a record from the stale set.

**Affected Areas:** Global Search.

**Recommended Fix:** Track a request sequence number (or abort the previous request) and ignore outdated responses.

**Why further verification is needed:** Timing-dependent; needs a throttled browser test to confirm it occurs in practice.

---

### BUG-SRCH-010 — Global search is not available at all on screens up to 640 px wide

**Severity:** Low

**Status:** Potential

**Test Area:** Responsive / Navigation

**Description:** `TopBar.scss` sets `.search-box { display: none }` at `max-width: 640px`, and there is no alternative search entry (icon, menu item) for small screens. The Help modal still advertises Ctrl/Cmd+K; on a tablet or phone with a keyboard, Ctrl+K calls `focus()` on a hidden input and opens a hidden dropdown, so nothing visible happens.

**Steps to Reproduce:**
1. Open the app at 375, 390 or 430 px width.
2. Look for the search box; press Ctrl+K with a hardware keyboard.

**Expected:** Search is reachable on the mobile layouts listed in the matrix (375/390/430 px), or the shortcut/help text reflects that it is desktop-only.

**Actual:** Search is hidden with no alternative.

**Evidence:**
* Frontend: `Common/Components/TopBar.scss` lines 466–469; `Common/Components/TopBar.tsx` lines 167–175 (Ctrl+K focuses the hidden input); `Common/Components/UserAccountModals.tsx` lines 204–211 (help text).
* Backend: n/a.
* Database: n/a.

**Root Cause:** The search box is hidden for space reasons without a replacement entry point.

**Business Impact:** Mobile users cannot use global search or deep links from it.

**Affected Areas:** Global Search, Help & Shortcuts (1.7), Responsive.

**Recommended Fix:** Add a search icon that expands an overlay search on small screens.

**Why further verification is needed:** Hiding search on phones may be an intentional product decision; confirm with the product owner.

---

## Needs Manual Verification

1. **Area:** Search performance
   - **What to Test:** Measure the response time of `GET /GlobalSearch/Search` with a 3–4 character query on the largest tenant, and watch SQL Server for 26 sequential scans.
   - **Expected:** Under about 1 second.
   - **Why Manual Testing Is Required:** Every predicate uses `ToLower().Contains(...)` (non-sargable, leading wildcard) and the 26 queries run sequentially on one DbContext; actual cost depends on data volume and indexes.

2. **Area:** Display-number collisions
   - **What to Test:** In a tenant whose PONumber sequence passed 999, search "CO#1005" (and the CQ/VO/VQ/JO equivalents).
   - **Expected:** Exactly one document has a given displayed number.
   - **Why Manual Testing Is Required:** The display rule `PONumber < 1000 → PONumber + 999` makes PONumber 6 and PONumber 1005 both display as "CO#1005"; search correctly returns both, but users cannot tell them apart. Whether real sequences reach this range depends on data (root cause is in the numbering scheme, see Cross-Module Concerns).

3. **Area:** Deep links from results
   - **What to Test:** For each category, click a result and confirm the correct record opens once (TopBar both pushes `?open=` and dispatches `openEntity` 100 ms later). Check Price Breakdown (page has no detail view, lands on the list), Product (opens by part number) and Journal Entry (`?id=`).
   - **Expected:** The intended record opens; no double slideout or flicker.
   - **Why Manual Testing Is Required:** Double-open behaviour depends on each page's effects and render timing.

4. **Area:** Keyboard behaviour
   - **What to Test:** Ctrl+K and Cmd+K (also with Caps Lock and a non-Latin layout); Ctrl+K while a modal/slideout is open (ignored); Esc with the dropdown open on top of a page with an open slideout (only the dropdown closes); Enter while results are still loading.
   - **Expected:** As described in the matrix.
   - **Why Manual Testing Is Required:** The code handles these cases (`TopBar.tsx` lines 167–191; `escapeToClose.ts` defers to `preventDefault`), but key-event ordering must be confirmed in real browsers.

5. **Area:** Responsive dropdown at 641–1024 px
   - **What to Test:** Dropdown width, scroll (max-height 500 px) and overlap with TopBar menus at tablet widths.
   - **Expected:** Readable and scrollable.
   - **Why Manual Testing Is Required:** Visual.

## No Issues Found

- Empty or whitespace query returns empty categories on both the client (`GlobalSearchService.Search` lines 130–132) and the server (`GlobalSearchController.cs` lines 27–58).
- 300 ms debounce; result limit of 5 per category from the TopBar; "Searching…" loading state; "No results found for …" empty state; "Start typing to search…" for an empty query.
- Ctrl/Cmd+K: case-insensitive `k` or `KeyK` code, Alt excluded, ignored while an overlay is open (`TopBar.tsx` lines 167–175).
- Esc clears the query and blurs only when the search is active, and calls `preventDefault`, so the global Esc handler does not also close an underlying overlay (`TopBar.tsx` lines 176–184; `escapeToClose.ts` lines 156–160).
- Search closes and clears on route change and on outside click.
- Every result type maps to an existing protected route (`Routes.tsx`); destinations other than Vendor Receiving accept the ID that search returns (customer, vendor, product by part number, raw material, CO, CQ, JO, VO, VQ, invoices, vendor invoices, shipments, NCR, user, employee, document, journal entry `?id=`, bank, workstation, location, process, job template, credit card, chart of accounts).
- Click navigation is blocked with a clear toast when the user lacks the module permission (`chatMentions.tsx` lines 86–92).
- Every server query is filtered by tenant (`Tenantid`/`TenantId`/`TenantID`), including the joined invoice, shipment and receiving queries; vendor-portal users are excluded from Users/Employees.
- Search is case-insensitive (term lower-cased; columns lower-cased) and matches the fields listed in the matrix: customer/vendor name, code, email, phone; CO PO number and customer PO; JO number, part, customer, job number; employee code; invoice prefix numbers such as "INV-2026-0001".
- `SearchDocuments` (chat mentions) caps the limit at 15, rejects `tenantId <= 0`, and supports bare prefixes ("@CO", "@VO") returning the most recent documents of that type.
- Network or server failure in the UI falls back to empty results without crashing (`GlobalSearchService.ts` lines 147–150).

## QA Coverage

| Test Area | Tested | Result |
| --- | --- | --- |
| Navigation | Yes | Fail (BUG-SRCH-004, BUG-SRCH-005) |
| CRUD | N/A | Read-only module |
| Search | Yes | Fail (BUG-SRCH-006, BUG-SRCH-007); Potential (BUG-SRCH-009) |
| Filters | N/A | No filters in this module |
| Sorting | N/A | Fixed per-category ordering (most recent first for documents) |
| Pagination | N/A | Fixed 5 results per category |
| Validation | Yes | Pass for empty query; Fail for API bounds (BUG-SRCH-008) |
| Permissions | Yes | Fail (BUG-SRCH-002, BUG-SRCH-003) |
| API | Yes | Fail (BUG-SRCH-008) |
| Database | Yes | Pass (read-only; tenant column filtered in every query) |
| Business Logic | Yes | Fail (BUG-SRCH-006, BUG-SRCH-007) |
| Location | Yes | Fail (BUG-SRCH-001) |
| Tenant | Yes | Pass for query predicates; cross-module concern for client-supplied `tenantId` (see below) |
| Cross-Module | Yes | Fail (BUG-SRCH-004 Vendor Receiving); concerns listed below |
| Responsive/PWA | Partial | Potential (BUG-SRCH-010); Manual (item 5) |

## Matrix Checklist

| Matrix Row | Result | Notes |
| --- | --- | --- |
| FE — Search: `TopBar.tsx`, `SearchResultsDropdown.tsx` (300 ms debounce, 5 per category), GET `/GlobalSearch/Search?query&tenantId&limit` | Fail | Debounce and limit correct. BUG-SRCH-001, 002, 003, 006; potential BUG-SRCH-009. |
| FE — Keyboard: Ctrl/Cmd+K focus (case-insensitive K, ignored while overlay open); Esc clears; Enter opens first result | Fail | Ctrl/Cmd+K and Esc pass. Enter opens the wrong "first" result and ignores journal entries (BUG-SRCH-005). |
| FE — Navigation: result opens module with `?open=` / `openEntity`, blocked if no permission | Fail | Vendor Receiving opens the wrong order (BUG-SRCH-004). Click is blocked without permission, but data is still displayed (BUG-SRCH-002). |
| FE — Mentions: chat @-mention document search, GET `/GlobalSearch/SearchDocuments` (max 15) | Fail | Cap 15 and prefix shortcuts pass; no location filter (BUG-SRCH-001). |
| FE — No results: empty state | Pass | "No results found for …" (`SearchResultsDropdown.tsx` lines 99–108). |
| FE — Responsive: TopBar breakpoint 640 px | Potential | Search hidden ≤640 px (BUG-SRCH-010); Manual item 5. |
| BE — Search: `GlobalSearchController` GET `Search` (26 categories, `Contains`) | Fail | 26 categories confirmed. BUG-SRCH-006, 007, 008; performance Manual item 1. |
| BE — Search docs: GET `SearchDocuments` | Fail | Works as designed except location scope (BUG-SRCH-001). |
| BE — Authorization: tenant from query; no location or permission filter on server | Fail | Location gap BUG-SRCH-001; permission display gap BUG-SRCH-002; tenant-from-query is a cross-module concern. |
| BL — Matches name, code, email, phone, document numbers (CO#, PO number, customer PO), EmpCode | Pass | All listed fields are matched case-insensitively. |
| BL — Formatted numbers must resolve to the right record | Fail | Exact formatted numbers resolve; partial ones do not (BUG-SRCH-007); collision risk Manual item 2. |

## Cross-Module Concerns

| Concern | Root-cause module/file | Evidence |
| --- | --- | --- |
| Both endpoints take `tenantId` from the query string and never compare it with the token tenant (`GetTenantId()` is not called). Any authenticated user can search another tenant by changing `tenantId`. | Tenant/Location framework — `QA_TenantLocationFramework.md` | `Controllers/GlobalSearchController.cs` lines 23 and 106–108. |
| Vendor-portal tokens are accepted by `GlobalSearch/Search`, exposing the whole tenant's customers, users and financial summaries to vendor users. | Vendor Portal — `QA_VendorPortal.md` | No `IsVendorPortal()` check in `GlobalSearchController.cs`. |
| No server-side permission check on search (any authenticated user can call it for any category). | Roles & Permissions — `QA_RolesPermissions.md` | `Program.cs` fallback policy only; see BUG-SRCH-002 for the UI-specific display issue. |
| Display-number scheme `PONumber + 999` (when < 1000) can produce duplicate displayed numbers once sequences pass 999. | Sales / Procurement numbering — `QA_Sales.md`, `QA_Procurement.md` | `GlobalSearchController.cs` lines 348, 444, 489, 760, 876; `displayDocNumberSearch.ts` lines 6–7. |
