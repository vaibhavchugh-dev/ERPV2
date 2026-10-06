# QA — Dashboard -t

| Module | Matrix section | Bug ID prefix | Tested | Confirmed Bugs | Potential Bugs | Manual Verification |
| --- | --- | --- | --- | --- | --- | --- |
| Dashboard | 7.1 | BUG-DASH | Yes | 6 | 3 | 6 |

Source of test cases: `QA_TEST_MATRIX.md`. Method: static trace of the actual implementation (React UI → service → Axios → .NET controller → service/repository → EF Core → SQL Server, and back). No application code, configuration or database is changed during QA. Findings that depend on deployed configuration, data or a real browser go under **Needs Manual Verification**.

Severity scale:
- **Critical**: security breach, data corruption, financial corruption, or a blocked core workflow.
- **High**: a major feature is broken or a significant security control is bypassed, with a workaround that is hard or unavailable.
- **Medium**: a feature works incorrectly in specific conditions, or a security control is weaker than configured.
- **Low**: cosmetic, minor UX, or an informational/hardening issue.

---

## Confirmed Bugs

### BUG-DASH-001 — Top Customers revenue is multiplied by the number of invoice lines

**Severity:** Medium. The headline revenue figure per customer is overstated by a factor equal to the line count, which misleads sales decisions, but no stored data is changed.

**Status:** Confirmed

**Test Area:** Business Logic / Cross-Module (totals must match source lists)

**Description:** `GetTopCustomers` joins `InvoiceMaster` → `InvoiceDetail` → `CustomerOrder` and then sums `InvoiceMaster.TotalAmount` per customer. Because the join produces one row per invoice detail line, an invoice with N lines contributes its full header total N times.

**Steps to Reproduce:**
1. Create a customer order with 3 line items and invoice all 3 lines on one invoice of $1,000 this month.
2. Open `/home` and look at the Top Customers widget.
3. Compare with the invoice list or the Customer Sales report for the same customer and month.

**Expected:** The customer shows $1,000 of revenue, matching the invoice list (matrix 7.1 cross-module rule: "Totals must match the source module lists for the same range and site").

**Actual:** The customer shows $3,000 (the $1,000 header total counted once per detail line).

**Evidence:**
- Frontend: `Cimmple_UI/src/Modules/Dashboard/Dashboard.tsx` lines 111 and 464–487 call `GetTopCustomers(5, locationIdParam)` and render `revenue` as is.
- Backend: `Cimmple_API/CimmpleAPI/Controllers/DashboardController.cs` lines 986–1062; the grouping at lines 1037–1048 uses `revenue = g.Sum(x => x.im.TotalAmount)` over joined detail rows, while `orderCount` (line 1044) is correctly de-duplicated with `Distinct()`. `InvoiceController.cs` line 264 shows one `InvoiceDetail` row is written per invoiced line. By contrast `Services/CustomerReportsService.cs` (`LoadDistinctInvoices`, lines 555–618) de-duplicates invoices before summing.
- Database: `InvoiceDetail` has one row per invoiced order line (1:N with `InvoiceMaster`).

**Root Cause:** Summing a header-level amount after a join to a child table, without de-duplicating by invoice.

**Business Impact:** Management sees inflated revenue and a wrong customer ranking; customers with many small lines are pushed to the top.

**Affected Areas:** Dashboard Top Customers widget.

**Recommended Fix:** Select distinct invoices (or invoice id + customer) before summing `TotalAmount`, the same way the Customer Sales report does, or sum the detail `Amount` instead of the header total.

---

### BUG-DASH-002 — NCR, quality and shipment widgets ignore the working site and the user's site restriction

**Severity:** Medium. Restricted users can see NCR and shipment information for sites they are not assigned to, and dashboard counts disagree with the site-filtered module lists.

**Status:** Confirmed

**Test Area:** Location / Permissions / Cross-Module

**Description:** Most dashboard queries honour `locationId` and the user's allowed sites, but the NCR metrics in `GetMetrics`, the whole `GetQualityStatus` endpoint, the critical-NCR alerts in `GetAlerts`, and the shipment and NCR entries in `GetRecentActivities` are tenant-wide. The Quality and Shipping list pages filter the same data by site. The matrix records this as the current behaviour ("NCRs and shipping tenant-wide"), but it conflicts with the matrix rule that totals must match the source lists for the same site and with the site restriction applied everywhere else.

**Steps to Reproduce:**
1. Create NCRs and shipments for Site A and Site B in one tenant.
2. Log in as a user assigned only to Site A (or select Site A as the working site).
3. Open `/home` and compare Open NCRs, the Quality pie chart, critical NCR alerts and Recent Activity with `/quality` and `/orders/customer-shipments` filtered to Site A.

**Expected:** Dashboard NCR and shipment figures and entries only include Site A, matching the module lists; a Site A-only user never sees Site B records.

**Actual:** Site B NCRs and shipments are counted and listed (titles, customer names and numbers are shown in Recent Activity and Alerts).

**Evidence:**
- Frontend: `Dashboard.tsx` lines 105–114 pass `locationIdParam` to every widget call.
- Backend: `DashboardController.cs` lines 225–249 (NCR metrics query only by tenant); `GetRecentActivities` shipments at lines 690–704 and NCRs at lines 748–762 (no location predicate); `GetAlerts` critical NCRs at lines 935–952 (tenant only); `GetQualityStatus` lines 1143–1191 explicitly discards the filter (`_ = filterLocationId;`). Source modules filter by site: `QualityController.cs` lines 490–520 (NCR via job order → customer order location) and `ShippingController.cs` lines 403–431 (shipment → customer order location).
- Database: NCRs and shipments have no direct location column; the site is reached through `JobOrderMaster` / `CustomerOrder.locationId`, which the source modules already join.

**Root Cause:** The dashboard does not reuse the location join that the Quality and Shipping controllers use.

**Business Impact:** Site isolation is weaker on the home page than in the modules, and site managers see wrong quality KPIs.

**Affected Areas:** Dashboard KPIs (quality block), Quality Status chart, Alerts, Recent Activity.

**Recommended Fix:** Apply the same NCR → job order → customer order and shipment → customer order location filter (including `restrictToLocationIds`) in these four places.

---

### BUG-DASH-003 — Overdue job alerts include jobs that are already Shipped

**Severity:** Low. It produces false "overdue" alerts but no data is changed.

**Status:** Confirmed

**Test Area:** Business Logic

**Description:** The overdue job order alert excludes only Completed, Cancelled and Void jobs. Jobs in the Shipped status with a past due date are reported as overdue, while the production-status and upcoming-deadline widgets on the same page treat Shipped as finished.

**Steps to Reproduce:**
1. Ship a job order whose due date was yesterday so its status becomes Shipped.
2. Open `/home` and look at Alerts.

**Expected:** A Shipped job is not reported as overdue, consistent with the other dashboard widgets.

**Actual:** An "Overdue job order" alert is shown for the shipped job.

**Evidence:**
- Frontend: `Dashboard.tsx` renders the alerts list as returned.
- Backend: `DashboardController.cs` lines 815–822 (`Status != "Completed" && != "Cancelled" && != "Void"`); compare lines 474–475 (`GetProductionStatus`) and 1229–1230 (`GetUpcomingDeadlines`) which also exclude `"Shipped"`.
- Database: `JobOrderMaster.Status` values include "Shipped" and "Partially Shipped" (`Cimmple_UI/src/Common/Services/JobOrderService.ts` line 333).

**Root Cause:** Inconsistent status lists between dashboard queries.

**Business Impact:** Alert fatigue; real overdue jobs are harder to spot.

**Affected Areas:** Dashboard Alerts.

**Recommended Fix:** Use one shared "open job" status definition (exclude Shipped as the other widgets do).

---

### BUG-DASH-004 — "Resolved this week" shows the count for the selected date range

**Severity:** Low. The label is misleading; the number itself is correct for a different period.

**Status:** Confirmed

**Test Area:** Business Logic / UI label

**Description:** `ncrResolvedThisWeek` is computed with the page date selector (`This Month`, `This Quarter`, `This Year`, and so on), but the KPI card always reads "N resolved this week".

**Steps to Reproduce:**
1. Close NCRs on dates spread over the current quarter.
2. Select "This Quarter" on `/home`.

**Expected:** The text reflects the period counted, or the count is limited to this week as the label says.

**Actual:** The quarter's resolved count is shown with the label "resolved this week".

**Evidence:**
- Frontend: `Dashboard.tsx` line 342 (`{metrics?.quality.ncrResolvedThisWeek || 0} resolved this week`); the date options are at lines 250–255.
- Backend: `DashboardController.cs` lines 231–237 filter on the selected `dateFilter` range, returned at line 383.
- Database: N/A.

**Root Cause:** The field name and label were not updated when the metric was tied to the date selector.

**Business Impact:** Quality managers misread weekly throughput.

**Affected Areas:** Dashboard Quality KPI card.

**Recommended Fix:** Either compute the value for the current week or change the label to the selected period (for example "resolved this month").

---

### BUG-DASH-005 — Alert descriptions hard-code the "$" currency symbol

**Severity:** Low. Cosmetic, but wrong for tenants that use another currency.

**Status:** Confirmed

**Test Area:** Business Logic / Settings

**Description:** Overdue AR and AP alerts build their text on the server with a literal `$` sign, ignoring the tenant currency setting that the rest of the dashboard and the PDFs apply.

**Steps to Reproduce:**
1. Set the tenant currency to EUR in System Settings.
2. Leave a customer invoice and a vendor invoice past due.
3. Open `/home` and read the Alerts.

**Expected:** Amounts use the configured currency symbol.

**Actual:** Text reads "Invoice for $1,234.00 was due on …".

**Evidence:**
- Frontend: `Dashboard.tsx` renders `alert.description` verbatim.
- Backend: `DashboardController.cs` line 893 (`$"Invoice for ${im.TotalAmount:N2} …"`) and line 925 (vendor invoice).
- Database: N/A.

**Root Cause:** Currency formatting is done in a server string literal.

**Business Impact:** Confusing amounts for non-USD tenants.

**Affected Areas:** Dashboard Alerts.

**Recommended Fix:** Return the amount as a number and format it on the client with the currency setting, or read the tenant currency on the server.

---

### BUG-DASH-006 — Dashboard 500 responses return the server stack trace

**Severity:** Low. Information disclosure that helps an attacker map the code; no direct data exposure.

**Status:** Confirmed

**Test Area:** API / Error handling

**Description:** Every dashboard endpoint returns `{ error = ex.Message, details = ex.StackTrace }` on an exception.

**Steps to Reproduce:**
1. Cause any dashboard query to fail (for example, a database timeout).
2. Inspect the response body of the failing `/api/Dashboard/*` call.

**Expected:** A generic error message; details only in server logs.

**Actual:** The full .NET stack trace (namespaces, file paths, line numbers) is returned to the browser.

**Evidence:**
- Frontend: `Dashboard.tsx` line 100 shows only a generic toast, so the trace is visible in the network tab.
- Backend: `DashboardController.cs` lines 409, 496, 623, 785, 982, 1060, 1138, 1189 and 1362.
- Database: N/A.

**Root Cause:** Debug-style error responses left in production code.

**Business Impact:** Hardening gap.

**Affected Areas:** All nine dashboard endpoints.

**Recommended Fix:** Log the exception and return a generic message (or rely on a global exception handler).

---

## Potential Bugs

### BUG-DASH-007 — "Active Job Orders" counts statuses that do not exist

**Severity:** Low. The KPI may undercount, but no data changes.

**Status:** Potential

**Test Area:** Business Logic

**Description:** The KPI counts job orders whose status is "In Progress", "Pending" or "Assigned". The job order UI only offers Draft, In Progress, Partially Shipped, Shipped, Completed and Cancelled, so "Pending" and "Assigned" never match and Partially Shipped jobs (still open) are not counted.

**Steps to Reproduce:**
1. Have one job In Progress and one Partially Shipped.
2. Open `/home` and read Active Job Orders.

**Expected:** Both open jobs are counted (if "active" means open production work).

**Actual:** Only the In Progress job is counted.

**Evidence:**
- Frontend: `Dashboard.tsx` line 285 ("Active Job Orders"); status options in `Modules/JobOrders/JobOrderSlideout.tsx` lines 2594–2599 and `Modules/JobOrders/JobOrders.tsx` lines 368–374.
- Backend: `DashboardController.cs` lines 78–81.
- Database: N/A.

**Root Cause:** Legacy status names in the query.

**Business Impact:** Under-reported workload.

**Affected Areas:** Dashboard KPI.

**Recommended Fix:** Define "active" from the real status list (for example, In Progress and Partially Shipped, optionally Draft).

**Why further verification is needed:** The product definition of "active" is not documented; legacy data or imports might still contain "Pending"/"Assigned" values.

---

### BUG-DASH-008 — Top Customers and Top Products ignore the page date selector

**Severity:** Low. The widgets may show a different period from the rest of the page.

**Status:** Potential

**Test Area:** Filters

**Description:** The page date selector drives the KPIs, but `GetTopCustomers` and `GetTopProducts` are called without any period and the server always uses the current month. The widget titles do not say "This Month".

**Steps to Reproduce:**
1. Select "This Year" on `/home`.
2. Compare Top Customers with a Customer Sales report for this year.

**Expected:** Either the widgets follow the selector or their title states the fixed period.

**Actual:** The widgets show the current month only, with no label saying so.

**Evidence:**
- Frontend: `Dashboard.tsx` lines 111–112 (no period argument), titles at lines 467 and 491.
- Backend: `DashboardController.cs` `GetTopCustomers` (986–1062) and `GetTopProducts` use a fixed current-month window.
- Database: N/A.

**Root Cause:** The widgets were not wired to the date selector.

**Business Impact:** Users may compare numbers from different periods.

**Affected Areas:** Top Customers, Top Products.

**Recommended Fix:** Pass the selected range to both endpoints or label the widgets with their period.

**Why further verification is needed:** A fixed monthly ranking may be intentional; there is no specification for these two widgets.

---

### BUG-DASH-009 — Date window ends at 00:00 today, so same-day records with a time can be excluded

**Severity:** Low. Only records stored with a time component on the current day are affected.

**Status:** Potential

**Test Area:** Filters / Business Logic

**Description:** `GetDateRangeFilter` returns `endDate = DateTime.Now.Date` (today at midnight) and queries use `<= endDate`. A record dated today with a time later than 00:00 falls outside the window. The matrix notes this behaviour ("date window ends at midnight today").

**Steps to Reproduce:**
1. Create a job order today without an explicit order date (the server stamps `DateTime.Now`).
2. Open `/home` with "This Month" and compare counts with the job order list.

**Expected:** Today's records are included, matching the module list for the same range.

**Actual:** Records stamped with today's time may be excluded until tomorrow.

**Evidence:**
- Frontend: N/A.
- Backend: `DashboardController.cs` lines 1366–1429 (`GetDateRangeFilter`); `JobOrderController.cs` line 392 falls back to `DateTime.Now` for the order date. Report builders use an exclusive next-day end (`endDate.Date.AddDays(1)`) instead.
- Database: Most order and invoice dates are saved date-only (`InvoiceModal` sends a date-only value; CO/CQ use `.Date`), which limits the impact.

**Root Cause:** Inclusive comparison against midnight instead of an exclusive next-day bound.

**Business Impact:** Today's activity may be missing from KPIs.

**Affected Areas:** All range-based dashboard KPIs.

**Recommended Fix:** Use `< today.AddDays(1)` as the upper bound.

**Why further verification is needed:** Whether same-day records carry a time component depends on the entry path and existing data.

---

## Needs Manual Verification

1. **Area:** Responsive layout (matrix row "Cards and charts at 375/390/430 px").
   **What to Test:** Open `/home` at 375, 390 and 430 px; check KPI cards, charts, tables and the alert list for overflow and readability.
   **Expected:** Cards stack and charts resize without horizontal page scroll.
   **Why Manual Testing Is Required:** `Dashboard.scss` has breakpoints at 1400, 1200 and 768 px, but rendering of Recharts and the app shell (see `QA_PWA.md` BUG-PWA-001, sidebar overlap below 1024 px) must be seen in a browser.

2. **Area:** KPI totals versus source modules.
   **What to Test:** For one site and one month, compare revenue, AR, AP, open orders and job counts with the corresponding module lists and reports.
   **Expected:** Figures match (matrix cross-module rule).
   **Why Manual Testing Is Required:** Requires real data across modules.

3. **Area:** Widget click-through.
   **What to Test:** Click each KPI, activity, alert and deadline entry.
   **Expected:** Each opens the correct module and record (`?open=` deep links).
   **Why Manual Testing Is Required:** Statically every target page supports `open`, but correct record focus needs a browser.

4. **Area:** Revenue trend 7/30/90 days.
   **What to Test:** Switch the revenue period and compare points with invoices and vendor invoices for those days.
   **Expected:** Correct daily totals for the selected site.
   **Why Manual Testing Is Required:** Data-dependent; server uses server-local `DateTime.Now`, so time zone effects need checking on the deployed host.

5. **Area:** Alerts list length.
   **What to Test:** Create more than 10 alerts.
   **Expected:** The badge count and the visible list are consistent or the UI explains that only the first 10 are shown.
   **Why Manual Testing Is Required:** The UI slices to 10 items while the badge shows the full count; the visual treatment must be judged in the browser.

6. **Area:** Refresh and partial failure.
   **What to Test:** Click Refresh while one widget endpoint fails (for example, block one request in dev tools).
   **Expected:** Other widgets still render; the failure is visible to the user.
   **Why Manual Testing Is Required:** Secondary widget failures are only logged to the console (`Dashboard.tsx` lines 117–120).

## No Issues Found

- `/home` is reachable for every authenticated user; all nine endpoints require authentication through the global fallback policy, and no role check is expected by the matrix.
- Changing the working site re-fetches every widget with `locationId`, and restricted users get `restrictToLocationIds` applied for orders, invoices, job orders and deadlines.
- `handleNavigate` routes to `/job-orders`, `/orders/customer`, `/orders/customer-shipments`, `/orders/customer-invoices`, `/purchasing/vendor-invoices` and `/quality` with `?open=`; each target page reads the `open` parameter.
- The AP overdue alert correctly excludes voided vendor invoices (`isPaid = 2`), and AR alerts use `PaymentDate`, which is only set when an invoice is fully paid.
- Upcoming deadlines exclude Completed, Shipped and Cancelled jobs and are limited to the requested number of days.
- Revenue trends group by day and fill both revenue and expense series; the chart merges them correctly by date (`Dashboard.tsx` lines 123–137).

## QA Coverage

| Test Area | Tested | Result |
| --- | --- | --- |
| Navigation | Yes | Pass |
| CRUD | N/A | N/A |
| Search | N/A | N/A |
| Filters | Yes | Potential (BUG-DASH-008, BUG-DASH-009) |
| Sorting | N/A | N/A |
| Pagination | N/A | N/A |
| Validation | N/A | N/A |
| Permissions | Yes | Fail (BUG-DASH-002) |
| API | Yes | Fail (BUG-DASH-006) |
| Database | Yes | Pass |
| Business Logic | Yes | Fail (BUG-DASH-001, BUG-DASH-003, BUG-DASH-004, BUG-DASH-005); Potential (BUG-DASH-007) |
| Location | Yes | Fail (BUG-DASH-002) |
| Tenant | Yes | Pass (see Cross-Module Concerns) |
| Cross-Module | Yes | Fail (BUG-DASH-001, BUG-DASH-002) |
| Responsive/PWA | Partial | Manual |

## Matrix Checklist

| Matrix Row | Result | Notes |
| --- | --- | --- |
| FE View — `Dashboard.tsx`, 9 GET endpoints | Fail (BUG-DASH-001, BUG-DASH-004) | All nine services are wired; Top Customers and the resolved label are wrong. |
| FE Filter — revenue trend 7/30/90 days; working site | Fail (BUG-DASH-002); Potential (BUG-DASH-008) | Revenue period works; site filter is ignored by quality/shipment widgets; top widgets ignore the date selector. |
| FE Navigation — widget click-through | Pass | All `?open=` targets exist; record focus listed under Manual Verification item 3. |
| FE Add / Edit / Delete | N/A | Read-only page. |
| FE Permissions — `/home` always reachable | Pass | No role gate on the route. |
| FE Responsive — 375/390/430 px | Manual | Manual Verification item 1. |
| BE Get — 9 endpoints | Fail (BUG-DASH-001, BUG-DASH-003, BUG-DASH-006) | Logic and error-response issues. |
| BE Filter — date window ends at midnight; NCRs and shipping tenant-wide | Fail (BUG-DASH-002); Potential (BUG-DASH-009) | The documented behaviour conflicts with the cross-module rule and site restriction. |
| BE Authorization — authenticated | Pass | Global fallback policy. |
| Cross-module — totals match source lists for range and site | Fail (BUG-DASH-001, BUG-DASH-002) | Manual Verification item 2 for full reconciliation. |

## Cross-Module Concerns

| Concern | Owner file | Evidence |
| --- | --- | --- |
| Every dashboard endpoint falls back to a client-supplied `tenantId` query parameter when the token tenant is 0, and `DashboardService.ts` always sends `tenantId` from localStorage. | `QA_TenantLocationFramework.md` (client-supplied `tenantId`) | `DashboardController.cs` lines 31–45 (repeated in each endpoint); `Cimmple_UI/src/Common/Services/DashboardService.ts`. |
