# QA — Help, Shortcuts & Account Modals

| Module | Matrix section | Bug ID prefix | Tested | Confirmed Bugs | Potential Bugs | Manual Verification |
| --- | --- | --- | --- | --- | --- | --- |
| Help, Shortcuts & Account Modals | 1.7 | BUG-HELP | Yes | 0 | 1 | 6 |

Source of test cases: `QA_TEST_MATRIX.md`. Method: static trace of the actual implementation (React UI → service → Axios → .NET controller → service/repository → EF Core → SQL Server, and back). No application code, configuration or database is changed during QA. Findings that depend on deployed configuration, data or a real browser go under **Needs Manual Verification**.

Severity scale:
- **Critical**: security breach, data corruption, financial corruption, or a blocked core workflow.
- **High**: a major feature is broken or a significant security control is bypassed, with a workaround that is hard or unavailable.
- **Medium**: a feature works incorrectly in specific conditions, or a security control is weaker than configured.
- **Low**: cosmetic, minor UX, or an informational/hardening issue.

---

Files traced: `Cimmple_UI/src/Common/Components/UserAccountModals.tsx` (+ `.scss`), `Common/Constants/AppVersion.ts`, `package.json`, `Common/Utils/escapeToClose.ts`, `App.tsx`, `Common/Components/TopBar.tsx`, `Common/Components/Sidebar.tsx` (+ `.scss`), `Modules/Accounting/PayrollJournalsHelp.tsx`, `Modules/Accounting/PayrollJournalLinks.tsx`, `Common/Services/AuthService.ts`, `Common/Services/EmployeeService.ts`, `Cimmple_API/CimmpleAPI/Controllers/AuthController.cs` (`Me`), `Controllers/EmployeeController.cs` (`GetProfilePic`), plus the component-level Esc handlers in `ConversationPanel.tsx`, `CommentsSection.tsx`, `CategoryTagInput.tsx`, `JobOrderSlideout.tsx`, `ContactSupportDialog.tsx`.

## Confirmed Bugs

No confirmed bugs. The keyboard, Esc and account-modal code paths behave as described in the matrix (see **No Issues Found**). The one Esc-layering defect that is reachable in code belongs to the chat mention picker and is logged as **BUG-CONV-005** in `QA_ConversationsComments.md`; mobile Ctrl+K behaviour is covered by **BUG-SRCH-010** in `QA_GlobalSearch.md`.

## Potential Bugs

### BUG-HELP-001 — The sidebar flyout's Esc handler can take the Esc press away from a slideout that is on top of it

**Severity:** Low

**Status:** Potential

**Test Area:** Esc layering / Navigation

**Description:**
The matrix requires Esc to close only the topmost overlay. While the sidebar secondary flyout (`activeSection`) is open, `Sidebar.tsx` listens for Esc on `document`, always calls `preventDefault()` and closes the flyout. The global handler (`escapeToClose.ts`) skips any event that was `preventDefault`-ed, so the flyout always wins, even when a slideout or modal has opened above it.

The flyout is closed when a flyout link or its transparent backdrop is clicked, and when the route becomes `/home` or a single-item section. It is **not** closed when the route changes to a path inside any multi-item section without a click. Global search can do exactly that: with the flyout open, Ctrl+K still works because the flyout backdrop starts at 260 px and covers less than 90% of the viewport on common screen widths, so `isAnyOverlayOpen()` does not treat it as an overlay. Choosing a result with Enter navigates with `?open=` and the target page opens its slideout while the flyout stays open underneath. The first Esc then closes the hidden flyout and the visible slideout stays open.

**Steps to Reproduce:**
1. On a 1920 px wide window, click the "Sales" (or any multi-item) section in the sidebar so the secondary flyout opens.
2. Without clicking anything else, press Ctrl+K, type a customer order number, and press Enter.
3. The Customer Orders page opens the order slideout.
4. Press Esc once.

**Expected:** The slideout (topmost overlay) closes.

**Actual (by code trace):** The flyout under the slideout closes and the slideout stays open; a second Esc is needed.

**Evidence:**
* Frontend: `Cimmple_UI/src/Common/Components/Sidebar.tsx` lines 292–305 (document keydown, unconditional `preventDefault` + `closeSecondary`), 273–290 (route-change effect only closes for `/home`, unknown or single-item sections), 262 and 393–396 (closed only on link/backdrop click); `Common/Components/Sidebar.scss` lines 23–30 (backdrop `left: 260px`, z-index 44); `Common/Utils/escapeToClose.ts` lines 61 (90% viewport rule) and 156–157 (skips `defaultPrevented` events); `Common/Components/TopBar.tsx` lines 167–175 (Ctrl+K is allowed when no overlay is detected) and 570–601 (Enter navigates).
* Backend: n/a.
* Database: n/a.

**Root Cause:** The flyout's Esc handler does not check whether another overlay is above it, and search navigation does not close the flyout.

**Business Impact:** Minor; an extra Esc press and a confusing first press.

**Affected Areas:** Sidebar, Global Search, every slideout opened by `?open=`.

**Recommended Fix:** In the flyout handler, ignore Esc when `findTopmostOverlay()` returns an element other than the flyout backdrop, or close the flyout on any route change triggered outside the sidebar (for example when search navigates).

**Why further verification is needed:** Depends on viewport width (on screens wider than about 2600 px the backdrop crosses the 90% threshold and Ctrl+K is blocked) and on the target slideout's z-index; must be confirmed in a browser.

---

## Needs Manual Verification

1. **Area:** Esc close-control heuristic across modules
   - **What to Test:** Open each slideout/modal listed in matrix section 9 and press Esc, including overlays that contain chips, attachment rows or line items with "×"/"x" remove buttons or an inline "Cancel" button.
   - **Expected:** The overlay's own close control is pressed (unsaved-changes prompts still appear); no row-level remove or inline cancel is triggered.
   - **Why Manual Testing Is Required:** `findCloseControl` picks the first visible button in DOM order matching each priority (`data-esc-close` → close class → aria-label/title "Close" → ×/x glyph or xmark icon → "Close"/"Cancel" text). Overlays without a higher-priority close hook could resolve to a row-level "×" or inline "Cancel"; this depends on each component's markup (`escapeToClose.ts` lines 106–128, 27–31).

2. **Area:** Embedded popups inside slideouts
   - **What to Test:** With a react-select menu, a date picker, the category tag picker, the job order step menu or the comments mention list open inside a slideout, press Esc.
   - **Expected:** Only the popup closes; the slideout stays open.
   - **Why Manual Testing Is Required:** Each library or component must call `preventDefault` (the code does so in `CategoryTagInput.tsx`, `JobOrderSlideout.tsx` lines 2292–2314 and `CommentsSection.tsx` lines 268–288; third-party popups cannot be confirmed statically).

3. **Area:** Esc busy state
   - **What to Test:** Press Esc while a slideout is saving (close button disabled) and while a confirm dialog is open over a slideout.
   - **Expected:** No action while busy; only the confirm dialog closes.
   - **Why Manual Testing Is Required:** The global handler correctly does nothing for a disabled control (`escapeToClose.ts` lines 130–135), but each slideout must actually disable its close button during save.

4. **Area:** Profile modal data
   - **What to Test:** Open Profile for a user with and without an employee record and profile picture, and with `/Auth/Me` failing (network offline).
   - **Expected:** Name, email, role and location show; picture or initials fallback shows; no crash.
   - **Why Manual Testing Is Required:** Depends on data and network; the code falls back to stored values (`UserAccountModals.tsx` lines 54–90).

5. **Area:** Payroll help
   - **What to Test:** At `/accounts/payroll`, open the help, switch tabs, close with Esc, the × button and an overlay click.
   - **Expected:** Help opens and closes; the page behind is unaffected.
   - **Why Manual Testing Is Required:** Visual and interaction behaviour (`PayrollJournalsHelp.tsx` lines 35–45, 62–86).

6. **Area:** Responsive modals at 375–430 px
   - **What to Test:** Profile, Help (shortcut table) and About modals and Payroll help on phone widths.
   - **Expected:** Modals fit with padding, scroll inside at most 90% of the viewport height, the shortcut table does not overflow horizontally.
   - **Why Manual Testing Is Required:** Visual (`UserAccountModals.scss`: overlay padding 1 rem, modal max-width 28 rem, max-height 90 vh with `overflow: auto`).

## No Issues Found

- The global Esc handler is installed once at app start (`App.tsx` line 32) on `window` in the capture phase, snapshots the topmost overlay before other handlers run, and acts in a `setTimeout` only if no component called `preventDefault` and the overlay is still mounted (`escapeToClose.ts` lines 147–165). Repeated and IME-composition key events are ignored.
- The topmost overlay is found by hit-testing four viewport edge points with `elementsFromPoint`, so real paint order (z-index, portals) is respected (`escapeToClose.ts` lines 76–93).
- Close-control priority and the backdrop fallback match the matrix's business-logic description (`escapeToClose.ts` lines 106–144).
- Busy state: a disabled (or `aria-disabled`) close control results in no action rather than a backdrop click (`escapeToClose.ts` lines 130–135).
- Ctrl/Cmd+K: lower/upper-case `k` or `KeyK` code, Alt excluded, ignored while an overlay is open, focuses the search box and shows the dropdown (`TopBar.tsx` lines 167–175).
- Esc in the search box clears it and calls `preventDefault`, so the global handler does not also close an underlying overlay (`TopBar.tsx` lines 176–184).
- `UserAccountModals` handles Esc itself with `preventDefault` (lines 92–102); the overlay closes on backdrop click (line 117) and has a `.user-account-modal-close` button with `aria-label="Close"` (line 130), which is also in the global close-class list.
- `PayrollJournalsHelp` handles Esc with `preventDefault` and supports controlled use from `PayrollJournalLinks` (lines 35–45).
- Help content documents Ctrl+K (Windows), ⌘ Cmd+K (Mac) and Esc, matching the implemented shortcuts (`UserAccountModals.tsx` lines 204–215).
- About shows `APP_VERSION` = "1.0.0" (`Common/Constants/AppVersion.ts`), matching `package.json` version "1.0.0".
- Profile refreshes from `GET /Auth/Me` (`AuthService.syncCurrentUserProfile`) and loads the picture through `GET /Employee/GetProfilePic`, revoking the object URL on close (`UserAccountModals.tsx` lines 54–90).
- Component-level Esc handlers for nested popups call `preventDefault` before closing: conversation mention picker when it has items (`ConversationPanel.tsx` lines 407–411), comments mention list (`CommentsSection.tsx` lines 268–288), job order step menu (`JobOrderSlideout.tsx` lines 2292–2314), sidebar flyout (`Sidebar.tsx` lines 296–300).

## QA Coverage

| Test Area | Tested | Result |
| --- | --- | --- |
| Navigation | Yes | Potential (BUG-HELP-001) |
| CRUD | N/A | Display-only modals |
| Search | N/A | Covered in `QA_GlobalSearch.md` (Ctrl/Cmd+K focus only here: Pass) |
| Filters | N/A | None |
| Sorting | N/A | None |
| Pagination | N/A | None |
| Validation | N/A | No inputs |
| Permissions | Yes | Pass for the modals (own profile only); profile-picture endpoint is anonymous (cross-module concern) |
| API | Yes | Pass (`Auth/Me`, `Employee/GetProfilePic` used as documented) |
| Database | N/A | None |
| Business Logic | Yes | Pass for the Esc rules; Fail in a nested popup (BUG-CONV-005); Potential (BUG-HELP-001) |
| Location | N/A | Not location-scoped |
| Tenant | N/A | Own user only |
| Cross-Module | Yes | Fail (BUG-CONV-005); Potential (BUG-SRCH-010); Manual items 1–3 |
| Responsive/PWA | Partial | Manual (item 6); BUG-SRCH-010 for Ctrl+K on small screens |

## Matrix Checklist

| Matrix Row | Result | Notes |
| --- | --- | --- |
| FE — Profile: `UserAccountModals.tsx` (profile), GET `/Auth/Me`, GET `/Employee/GetProfilePic` | Pass | Data and fallbacks traced; Manual item 4. |
| FE — Help & Shortcuts: Ctrl+K (Windows) / Cmd+K (Mac), Esc | Pass | Help text matches the implemented shortcuts. |
| FE — About: `APP_VERSION` | Pass | "1.0.0", same as `package.json`. |
| FE — Esc to close: `escapeToClose.ts` (installed in `App.tsx`) | Pass | Installed once; capture phase, deferred action. Manual items 1–2 for per-module markup. |
| FE — Esc layering: topmost overlay only; nested popups (mentions, tag picker, step menu, sidebar flyout, search) close first | Fail | Chat mention picker with no items lets Esc close the whole panel (BUG-CONV-005). Sidebar flyout can steal Esc from a slideout above it (BUG-HELP-001, Potential). Tag picker, step menu, search and comments mentions pass. |
| FE — Esc busy state: disabled close control → no action | Pass | `dismissOverlay` returns without clicking; Manual item 3 for each slideout. |
| FE — Ctrl/Cmd+K: `TopBar.tsx` | Pass | Case-insensitive, `KeyK` fallback, overlay check. Small screens: BUG-SRCH-010 (Potential). |
| FE — Payroll help: `PayrollJournalsHelp.tsx` | Pass | Own Esc handler with `preventDefault`; Manual item 5. |
| FE — Responsive: modals at 375–430 px | Manual | Manual item 6. |
| BE — Only `Auth/Me` and `Employee/GetProfilePic` (anonymous) | Pass | Both endpoints used as documented; anonymous picture access is a cross-module concern. |
| BL — Esc presses the overlay's own close control (`data-esc-close`, `.btn-close`, aria-label/title "Close", × glyph, xmark icon, Close/Cancel text), else clicks the backdrop | Pass | Implemented exactly in this priority order; Manual item 1 for DOM-order risk. |
| BL — Overlay detection: fixed + viewport-covering + overlay-like class, role, aria-modal, body portal or dimming background | Pass | `looksLikeOverlay` lines 51–73 (90% of viewport). |
| BL — Components that handle Esc themselves call `preventDefault` | Fail | All traced components do, except the conversation mention picker when it shows "Searching…"/"No matches" (BUG-CONV-005). |

## Cross-Module Concerns

| Concern | Root-cause module/file | Evidence |
| --- | --- | --- |
| `GET /Employee/GetProfilePic` is `[AllowAnonymous]`; any caller can fetch any user's profile picture by `userId` (optional `tenantId`). Used by the Profile modal. (The legacy User endpoint is already BUG-AUTH-015.) | Employee Master — `QA_EmployeeMaster.md` | `Cimmple_API/CimmpleAPI/Controllers/EmployeeController.cs` lines 332–339. |
| Chat mention picker Esc closes the whole conversation panel. | Conversations — `QA_ConversationsComments.md` (BUG-CONV-005) | `ConversationPanel.tsx` lines 390–412. |
| Ctrl/Cmd+K focuses a hidden search box on screens ≤640 px. | Global Search — `QA_GlobalSearch.md` (BUG-SRCH-010) | `TopBar.scss` lines 466–469. |
