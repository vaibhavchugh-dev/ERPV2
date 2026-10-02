# QA — PWA (Responsive / Installable App)

| Module | Matrix section | Bug ID prefix | Tested | Confirmed Bugs | Potential Bugs | Manual Verification |
| --- | --- | --- | --- | --- | --- | --- |
| PWA (Responsive / Installable App) | Responsive/PWA rows across the matrix | BUG-PWA | Yes | 2 | 2 | 8 |

Source of test cases: `QA_TEST_MATRIX.md`. Method: static trace of the actual implementation (React UI → service → Axios → .NET controller → service/repository → EF Core → SQL Server, and back). No application code, configuration or database is changed during QA. Findings that depend on deployed configuration, data or a real browser go under **Needs Manual Verification**.

Severity scale:
- **Critical**: security breach, data corruption, financial corruption, or a blocked core workflow.
- **High**: a major feature is broken or a significant security control is bypassed, with a workaround that is hard or unavailable.
- **Medium**: a feature works incorrectly in specific conditions, or a security control is weaker than configured.
- **Low**: cosmetic, minor UX, or an informational/hardening issue.

Scope note: matrix section 0 states that `Cimmple_PWA` (shop-floor app), `Cimmple_Punch` and `Cimmple_VPA` are out of scope and that "Mobile" means the responsive web UI (`Cimmple_UI`) at 375 / 390 / 430 px. Findings below are therefore about `Cimmple_UI`. The shop-floor app's manifest, service worker, update flow and Refresh button were reviewed statically for context only; observations are listed under No Issues Found and Needs Manual Verification, not as bugs.

---

## Confirmed Bugs

### BUG-PWA-001 — Below 1024 px the fixed sidebar covers the page, with no way to hide it

**Severity:** High. On tablets and phones the 260 px sidebar permanently covers the left side of every page (about 70% of a 375 px screen), so list pages, forms and actions behind it cannot be used; there is no menu toggle as a workaround.

**Status:** Confirmed

**Test Area:** Responsive/PWA

**Description:** `.sidebar` is `position: fixed`, `width: 260px`, `z-index: 40` at every width, and `Sidebar.scss` has no media query. At `max-width: 1024px`, `Layout.scss` removes the content's 260 px left margin (`margin-left: 0; width: 100%`), so the content slides underneath the sidebar. Neither `Sidebar.tsx` nor `TopBar.tsx` renders a hamburger or collapse control, and no other stylesheet hides `.sidebar`. The sticky top bar (`z-index: 30`) is also partly covered. Matrix row 15 and sequence step 12 require "No layout blockers on core flows" at 375 / 390 / 430 px.

**Steps to Reproduce:**
1. Log in and open `/home` (or any page inside the main layout, such as `/orders/customer`).
2. Resize the browser to 1024 px or less, or open the site on a phone (375 px).

**Expected:** The sidebar collapses into an off-canvas menu (or the content keeps its margin), and page content and actions are fully visible.

**Actual:** The sidebar stays visible and overlaps the first 260 px of the page and top bar; at 375 px only about 115 px of content is visible, and there is no control to close the sidebar.

**Evidence:**
- Frontend: `Cimmple_UI/src/Common/Components/Sidebar.scss` lines 7–21 (`position: fixed`, `width: 260px`, `z-index: 40`; no `@media` anywhere in the file); `Cimmple_UI/src/Common/Components/Layout/Layout.scss` lines 10–17 (content offset by 260 px) and lines 27–32 (offset removed at ≤ 1024 px); `Cimmple_UI/src/Common/Components/Layout/index.tsx` lines 15–26 (sidebar always rendered); `Cimmple_UI/src/Common/Components/Sidebar.tsx` lines 308–322 (no collapsed/mobile state); `Cimmple_UI/src/Common/Components/TopBar.scss` lines 13–15 (`sticky`, `z-index: 30`) and lines 466–483 (the 640 px rules hide labels only).
- Backend: N/A.
- Database: N/A.

**Root Cause:** The layout's responsive rule was implemented for the content area only; the sidebar has no small-screen behaviour.

**Business Impact:** The responsive web UI is unusable on phones and most tablets for every module inside the main layout (all 45 protected routes), which blocks the mobile test sequence (matrix step 12).

**Affected Areas:** Every page rendered inside `Layout` (dashboard, masters, sales, procurement, inventory, job orders, quality, attendance, accounting, reports, documents, settings). Login, change password, vendor portal and support portal use their own layouts and are not affected.

**Recommended Fix:** Below 1024 px, hide the sidebar off-canvas (for example `transform: translateX(-100%)`), add a menu button in the top bar that toggles it with a backdrop, and close it on navigation and Esc.

---

### BUG-PWA-002 — The ERP web manifest is not installable and the Apple touch icon is missing

**Severity:** Low. "Add to Home Screen" produces a blurry or generic icon and Chrome's install prompt is not offered; the app still works in the browser.

**Status:** Confirmed

**Test Area:** Responsive/PWA (installability)

**Description:** `public/manifest.json` declares `display: "standalone"`, which signals an installable app, but its only icon is `favicon.ico` (up to 64 × 64). Browsers require at least 192 × 192 and 512 × 512 icons to offer installation. `index.html` links `apple-touch-icon` to `%PUBLIC_URL%/logo192.png`, which does not exist in `public/` (only `favicon.ico`, `logo.svg`, `manifest.json` and `index.html` are present), so iOS requests a missing file. The manifest `theme_color` (`#000000`) also differs from the page `theme-color` meta (`#0d0e10`).

**Steps to Reproduce:**
1. Open the ERP in Chrome on Android or desktop and check the install option (or Lighthouse "Installable").
2. On iOS Safari, use Share → Add to Home Screen.
3. Request `/logo192.png`.

**Expected:** A valid install experience with a proper icon, consistent with the manifest's `standalone` declaration.

**Actual:** No install prompt; Lighthouse reports missing icons; iOS uses a page screenshot; `/logo192.png` returns the SPA shell or 404.

**Evidence:**
- Frontend: `Cimmple_UI/public/manifest.json` lines 4–14; `Cimmple_UI/public/index.html` lines 7 and 13–14; `Cimmple_UI/public/` contents (no `logo192.png`/`logo512.png`).
- Backend: N/A.
- Database: N/A.

**Root Cause:** Create React App template icons were removed but the references were kept.

**Business Impact:** Poor home-screen experience for mobile users of the responsive web UI.

**Affected Areas:** ERP web app installability and home-screen icon.

**Recommended Fix:** Add 192 and 512 px PNG icons (plus a maskable icon) to `public/`, reference them in the manifest and `apple-touch-icon`, and align the theme colours; or remove `display: standalone` if installation is not intended.

---

## Potential Bugs

### BUG-PWA-003 — After a new deployment, open tabs can show a blank screen when navigating

**Severity:** Medium. Users who keep the ERP open across a release can lose the whole UI on their next navigation until they manually reload; there is no update prompt or error screen.

**Status:** Potential

**Test Area:** Responsive/PWA (update flow)

**Description:** All 45 protected routes and the three top-level layouts are loaded with `React.lazy`. The ERP has no service worker (it explicitly unregisters one) and no error boundary or `ChunkLoadError` handling. When a new build replaces the hashed chunk files, an already-open tab asks for old chunk names; the host's SPA fallback returns `index.html` (or 404), the dynamic import rejects, and React unmounts the tree, leaving a blank page. Nothing notifies the user that a new version is available or offers a refresh.

**Steps to Reproduce:**
1. Open the ERP and visit `/home` only.
2. Deploy a new build (chunk hashes change).
3. In the same tab, click a sidebar link to a page not yet visited (for example `/inventory`).

**Expected:** The page loads, or the app shows a "new version available — refresh" message.

**Actual:** Likely a blank white page with a chunk load error in the console.

**Evidence:**
- Frontend: `Cimmple_UI/src/App.tsx` lines 12–16 (`React.lazy` layouts) and 47–57 (`Suspense` without an error boundary); `Cimmple_UI/src/Common/Routes.tsx` (45 lazy routes); `Cimmple_UI/src/index.tsx` line 21 (`serviceWorker.unregister()`); `Cimmple_UI/src/serviceWorker.ts` lines 1–11 (`register` is an empty stub); no `ErrorBoundary`, `componentDidCatch` or `ChunkLoadError` handling anywhere in `src`.
- Backend: N/A.
- Database: N/A.

**Root Cause:** Code-splitting without stale-chunk handling or a version check.

**Business Impact:** Lost work and confusion after each release.

**Affected Areas:** Every lazily loaded page.

**Recommended Fix:** Wrap routes in an error boundary that detects chunk load failures and reloads once (or shows a refresh prompt), and/or poll a version file to prompt users to refresh.

**Why further verification is needed:** Depends on whether the hosting keeps previous build assets after deployment.

---

### BUG-PWA-004 — Global search is not available on phones

**Severity:** Low. Below 640 px the search box is hidden and no alternative entry point is shown, so phone users cannot use global search.

**Status:** Potential

**Test Area:** Responsive/PWA

**Description:** `TopBar.scss` hides `.search-box` at `max-width: 640px`. `TopBar.tsx` renders the search only inside that box; there is no search icon button for small screens, and the Ctrl+K shortcut is not usable on touch devices.

**Steps to Reproduce:**
1. Open the ERP at 375 px.
2. Look for a way to search across records.

**Expected:** A search icon or full-width search overlay remains available (matrix Global Search row "TopBar breakpoint 640px").

**Actual:** No search control is visible.

**Evidence:**
- Frontend: `Cimmple_UI/src/Common/Components/TopBar.scss` lines 466–469; `Cimmple_UI/src/Common/Components/TopBar.tsx` line 668 (the only search container).
- Backend: N/A.
- Database: N/A.

**Root Cause:** Search is hidden rather than collapsed into an icon.

**Business Impact:** Slower navigation on phones.

**Affected Areas:** Global Search on mobile.

**Recommended Fix:** Show a search icon below 640 px that opens the same search in an overlay.

**Why further verification is needed:** The matrix does not state whether search must be available on phones; hiding it may be a deliberate design decision.

---

## Needs Manual Verification

1. **Area:** All list pages inside the main layout at 375 / 390 / 430 px (after BUG-PWA-001 is fixed).
   **What to Test:** Tables scroll horizontally inside their container; filters wrap; pagination fits; touch targets are at least 44 px.
   **Expected:** No page-level horizontal scroll; actions reachable.
   **Why Manual Testing Is Required:** Many module stylesheets (for example `Documents.scss`, `ScheduledReports`, inventory, attendance, accounting lists) have no breakpoint; actual overflow depends on rendered data.

2. **Area:** Slideouts and wide slideouts (customer/vendor/employee/location masters, CQ, CO, VQ, VO, JO, NCR).
   **What to Test:** Open each slideout on a phone; check the sticky save bar, matrix popups, step menus and comparison tables.
   **Expected:** The slideout takes full width (`Slideout.scss` 768 px rule) and its actions remain visible.
   **Why Manual Testing Is Required:** Module-specific breakpoints (for example `CustomerQuotationSlideout.scss` 1200/1024/900/768 px, `CustomerOrderSlideout.scss`, `VendorOrderSlideout.scss`, `JobOrderSlideout.scss` 1024 px only) must be checked visually.

3. **Area:** Modals and dialogs (section 9 Resp column; matrix rows for role modals, account modals, payment modal, movement modal, period dialog, schedule dialog, upload modal, email dialog).
   **What to Test:** Open each modal at 375–430 px; close with Esc and backdrop; check keyboard focus.
   **Expected:** Modal fits the viewport and scrolls internally; Esc and backdrop close it.
   **Why Manual Testing Is Required:** Most dialogs use inline styles or `max-width` without a breakpoint; the global Esc handler (`escapeToClose.ts`) depends on DOM detection.

4. **Area:** Login (`Login.scss` 991.98 px), change password, vendor portal and support portal (900 px).
   **What to Test:** These pages at desktop and 375–430 px.
   **Expected:** Forms fit and are usable.
   **Why Manual Testing Is Required:** They use their own layouts (not affected by BUG-PWA-001); rendering must be seen.

5. **Area:** Camera and file pickers on phones (NCR photo capture, document upload, attachments).
   **What to Test:** Capture a photo and upload a file from iOS and Android browsers.
   **Expected:** Camera and gallery open; uploads complete.
   **Why Manual Testing Is Required:** Device and browser behaviour.

6. **Area:** Offline behaviour of the ERP web UI.
   **What to Test:** Turn the network off and navigate or save.
   **Expected:** A clear error message; no silent data loss.
   **Why Manual Testing Is Required:** The ERP has no service worker or offline cache by design (`serviceWorker.unregister()`), so behaviour relies on per-screen Axios error handling.

7. **Area:** Shop-floor app (`Cimmple_PWA`, out of matrix scope) installation and update.
   **What to Test:** Install from `/shop/` on Android and iOS; deploy a new build while the app is open; use the Refresh button on Jobs, Quality and Dashboard pages.
   **Expected:** The app installs with its 192/512 px icons; the new version is picked up (Workbox `skipWaiting` + `clientsClaim` + `autoUpdate`); Refresh reloads data.
   **Why Manual Testing Is Required:** Statically the configuration is consistent, but the update moment (an open page keeps running old JavaScript until reload; there is no "update available" prompt) and iOS behaviour need a device. The Refresh button (`Cimmple_PWA/src/components/RefreshButton.tsx`) only re-fetches page data and does not update the app.

8. **Area:** Shop-floor app offline behaviour (out of matrix scope).
   **What to Test:** Open the installed app without network.
   **Expected:** The app shell loads from the precache; API calls fail with a visible message.
   **Why Manual Testing Is Required:** Workbox precaches only static assets; there is no runtime caching or `navigator.onLine` handling in `Cimmple_PWA/src`, so the user-facing behaviour must be observed.

## No Issues Found

- `Cimmple_UI/public/index.html` sets `<meta name="viewport" content="width=device-width, initial-scale=1">`, so pages scale correctly on phones.
- The ERP does not register a service worker and calls `unregister()` on start, so no authenticated API responses or stale app shells are cached by the ERP; the `ready`-based unregister only affects a worker whose scope controls the ERP page and therefore does not remove the shop-floor worker scoped to `/shop/`.
- The shop-floor app's `vite.config.ts` scopes its manifest and service worker to `/shop/`, precaches only static assets (`js, css, html, ico, png, svg, woff2, webmanifest`), excludes `/api/` from the navigation fallback, and calls the API on a different origin, so API responses are not cached by its service worker.
- The shop-floor app's `web.config` disables caching of `index.html`, `sw.js`, `registerSW.js` and `manifest.webmanifest`, so new versions are discovered on the next load.
- The shop-floor app's `index.html` and `registerSW.js` only unregister service workers whose scope does not include `/shop`, so they do not interfere with each other.
- The shop-floor app's Refresh button is disabled while loading, has an accessible label, and spins during refresh.
- The ERP top bar collapses location and user labels and keeps the notification dropdown inside the viewport below 640 px (`TopBar.scss` lines 466–483).
- `Slideout.scss` switches slideouts to full width at 768 px, and `Form.scss`, `Button.scss`, `MasterListPage.scss` and `ClientPagination.scss` include 768 px rules.
- The support button (`.support-fab`) is fixed to the bottom-right with a 44 px target and is hidden when printing.

## QA Coverage

| Test Area | Tested | Result |
| --- | --- | --- |
| Navigation | Yes | Fail (BUG-PWA-001); Potential (BUG-PWA-003) |
| CRUD | N/A | N/A |
| Search | Yes | Potential (BUG-PWA-004) |
| Filters | N/A | N/A |
| Sorting | N/A | N/A |
| Pagination | Partial | Manual |
| Validation | N/A | N/A |
| Permissions | N/A | N/A |
| API | N/A | N/A |
| Database | N/A | N/A |
| Business Logic | N/A | N/A |
| Location | N/A | N/A |
| Tenant | N/A | N/A |
| Cross-Module | Yes | Fail (BUG-PWA-001) |
| Responsive/PWA | Yes | Fail (BUG-PWA-001, BUG-PWA-002); Potential (BUG-PWA-003, BUG-PWA-004) |

## Matrix Checklist

Rows marked "Fail (BUG-PWA-001)" are pages inside the main layout, which is blocked below 1024 px; their remaining responsive behaviour is covered by Manual Verification items 1–3.

| Matrix Row | Result | Notes |
| --- | --- | --- |
| **Section 0.3 / sequence** | | |
| Category 15 — Responsive (desktop; 375/390/430; touch; table scroll; modals/slideouts; sticky actions; Esc/backdrop; focus) | Fail (BUG-PWA-001) | Manual items 1–3 for the rest. |
| Sequence step 12 — Responsive / PWA (mobile web), "No layout blockers on core flows" | Fail (BUG-PWA-001) | — |
| **Platform** | | |
| Authentication — `Login.scss` 991.98 px (`/login`) | Manual | Own layout; Manual item 4. |
| Password change/reset — page and modal | Manual | `/change-password` is outside the main layout; the modal is inside it. |
| User Management — table and slideout at 375–430 px | Fail (BUG-PWA-001) | — |
| Roles & Permissions — role and permission modals | Fail (BUG-PWA-001) | Modals: Manual item 3. |
| System Settings — breakpoint 768 px | Fail (BUG-PWA-001) | `SystemSettings.scss` has the 768 px rule. |
| Global Search — TopBar breakpoint 640 px | Fail (BUG-PWA-001); Potential (BUG-PWA-004) | — |
| Help & Shortcuts / account modals at 375–430 px | Fail (BUG-PWA-001) | Modals: Manual item 3. |
| Support Tickets / Staff Portal — breakpoint 900 px | Manual | `ContactSupportDialog.scss` and `SupportInbox.scss` use 900 px; staff portal uses its own layout. |
| Vendor Portal — dashboard and response screen | Manual | Own layout; Manual item 4. |
| Tenant/Location framework — Layout 1024 px; TopBar 640 px (all) | Fail (BUG-PWA-001) | Root cause row. |
| **Masters** | | |
| Customer — list, slideout, import modal | Fail (BUG-PWA-001) | Slideout breakpoints 768/640 px. |
| Vendor — list, slideout | Fail (BUG-PWA-001) | — |
| Employee — list, slideout | Fail (BUG-PWA-001) | — |
| Location — list, slideout | Fail (BUG-PWA-001) | — |
| Workstation — `/masters/workstation` | Fail (BUG-PWA-001) | — |
| Process — `/masters/process` | Fail (BUG-PWA-001) | — |
| Job Template — `/masters/jobtemplate` | Fail (BUG-PWA-001) | Picker dialog 1024 px rule. |
| Product — `/masters/product` | Fail (BUG-PWA-001) | — |
| Raw Material — `/masters/raw-material` | Fail (BUG-PWA-001) | 768/1024 px rules. |
| Category — validation/permissions/responsive | Fail (BUG-PWA-001) | 900 px rule. |
| Price Breakdown — `/masters/pricebreakdown` | Fail (BUG-PWA-001) | — |
| Bank — `/masters/bank` | Fail (BUG-PWA-001) | — |
| Credit Card — `/masters/creditcard` | Fail (BUG-PWA-001) | — |
| Chart of Accounts — `/masters/chartofaccounts` | Fail (BUG-PWA-001) | — |
| NCR Codes — list, slideout | Fail (BUG-PWA-001) | — |
| **Sales** | | |
| Customer Quotations — list, wide slideout, matrix popup, sticky save bar | Fail (BUG-PWA-001) | Slideout has 1200/1024/900/768 px rules; Manual item 2. |
| Customer Orders — list, slideout, modals | Fail (BUG-PWA-001) | — |
| Customer Shipments — list, detail modal (Esc) | Fail (BUG-PWA-001) | — |
| Customer Invoices — list, detail modal, payment modal | Fail (BUG-PWA-001) | — |
| **Procurement and inventory** | | |
| Vendor Quotations — comparison table on mobile | Fail (BUG-PWA-001) | — |
| Vendor Orders — `/purchasing/vendor-orders` | Fail (BUG-PWA-001) | — |
| Vendor Receiving — receive form on phone | Fail (BUG-PWA-001) | — |
| Vendor Invoices — `/purchasing/vendor-invoices` | Fail (BUG-PWA-001) | — |
| Inventory — movement modal on phone | Fail (BUG-PWA-001) | — |
| **Production and quality** | | |
| Job Orders — step menu on phone | Fail (BUG-PWA-001) | — |
| Quality / NCR — photo capture on phone | Fail (BUG-PWA-001) | Manual item 5. |
| Attendance — wide table on phone | Fail (BUG-PWA-001) | — |
| **Accounting** | | |
| Payment Dashboard — cards stack on phone | Fail (BUG-PWA-001) | — |
| Accounts Payable — bulk selection on touch | Fail (BUG-PWA-001) | — |
| Accounts Receivable | Fail (BUG-PWA-001) | — |
| Banks / reconciliation — `/accounts/banks` | Fail (BUG-PWA-001) | — |
| Financial Reports — drawer on phone | Fail (BUG-PWA-001) | 960 px rule. |
| Journal Entries | Fail (BUG-PWA-001) | 640/768 px rules. |
| General Ledger | Fail (BUG-PWA-001) | — |
| Payroll Journals — wizard steps on phone | Fail (BUG-PWA-001) | — |
| Period Close — dialog on phone | Fail (BUG-PWA-001) | — |
| Accounting Setup | Fail (BUG-PWA-001) | — |
| **Insight and documents** | | |
| Dashboard — cards and charts at 375/390/430 px | Fail (BUG-PWA-001) | `Dashboard.scss` 1400/1200/768 px rules. |
| Reports / BI — drawer and tables on phone | Fail (BUG-PWA-001) | 960 px rule. |
| Scheduled Reports — edit dialog (Esc) | Fail (BUG-PWA-001) | Esc wiring present. |
| Documents — upload on phone | Fail (BUG-PWA-001) | Upload modal 640 px rule; Manual item 5. |
| PDF & Document Email (section 9 Resp = Y) | Fail (BUG-PWA-001) | Email dialog `max-width: 480px` with 1 rem padding; Manual item 3. |
| Attachments (section 9 Resp = Y) | Fail (BUG-PWA-001) | Viewer 1100 px rule; Manual item 5. |
| **Installable app** | | |
| ERP manifest / installability | Fail (BUG-PWA-002) | — |
| Service worker caching and update flow (ERP) | Potential (BUG-PWA-003) | No service worker by design; stale chunks unhandled. |
| Shop-floor PWA manifest, service worker, Refresh button (out of matrix scope) | Manual | Manual items 7–8. |

## Cross-Module Concerns

| Concern | Owner file | Evidence |
| --- | --- | --- |
| The sidebar's secondary flyout and backdrop are also fixed at `left: 260px`, so on a 375 px phone the 260 px flyout starts at 260 px and is mostly off-screen. Esc handling for the flyout is covered by the Help & Shortcuts audit. | `QA_HelpShortcutsAccountModals.md` (keyboard/Esc behaviour) | `Sidebar.scss` lines 23–37. |
