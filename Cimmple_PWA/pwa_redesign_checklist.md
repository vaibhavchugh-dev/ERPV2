# Cimmple Shop Floor PWA — Redesign Checklist

**Status:** Planning only — do not implement until explicitly approved.  
**Audience:** Shopfloor operators on phone (occasionally tablet).  
**Goals:** Faster act-on-job flow, clearer navigation, less office-UI density on Quality.

Use this as a sequenced backlog. Check items off when designed/implemented and verified on a real phone (~375px) and with thumb reach in mind.

---

## Priority legend

| Priority | Meaning |
|----------|---------|
| **P0** | Highest impact on daily shopfloor work (job start/pause/complete) |
| **P1** | Navigation clarity / reduce friction between Jobs and Quality |
| **P2** | Polish, consistency, glanceability |
| **P3** | Nice-to-have / later phases |

---

## P0 — Job Detail: put actions where the thumb is

- [ ] **Sticky primary action strip** on Job Detail (above bottom tab bar): show only the relevant Start / Pause / Resume / Complete (or Reopen) for the selected step; keep `min-h-tap` (48px+).
- [ ] **Keep running timer visible** in that sticky zone (or immediately above it) while a step is running — no scroll required to see elapsed time.
- [ ] **Selected-step summary** in/near the sticky zone: sequence + process name (+ workstation if space); avoid forcing scroll up after picking a step from the Routing list.
- [ ] **Qty produced** placement: decide sticky vs. only in Complete dialog / compact row; avoid burying Save qty above a long routing list without a clear path.
- [ ] **Modals stay bottom-sheet on phone** (pause reasons, complete qty, reopen confirm); primary confirm buttons remain full-width and ≥48px.
- [ ] **Conflict with bottom nav:** confirm sticky actions + 68px tab bar + safe-area don’t cover content or cause double-tap mistakes; add bottom padding to main scroll so last routing step isn’t hidden.
- [ ] **Verify gloved / one-hand use:** Pause and Complete remain easy to hit without precision tapping.

---

## P0 — Jobs list: keep what works, tighten scan path

- [ ] **Preserve card-tap model** (full card → Job Detail); do not replace with dense tables.
- [ ] **Keep Active / All filter**; bump chip hit area to at least `min-h-tap` (today some chips use only `py-2`).
- [ ] **Keep current-step line on cards** for active jobs (already valuable).
- [ ] **Empty / error / loading** states remain obvious with Retry/Refresh still one tap away.
- [ ] **Optional (if API allows later):** “Mine” / workstation filter — only after assignment data exists; don’t invent UI for unsupported filters.

---

## P1 — Global navigation: fewer duplicate paths

- [ ] **Bottom tabs remain the primary way** to switch Jobs ↔ Quality (do not remove).
- [ ] **Drawer: stop duplicating primary destinations** — hamburger/drawer should focus on Logout (and later Settings / About), not a second Jobs | Quality list.
- [ ] **Header slim-down options (pick one in design):** keep brand + operator; or collapse brand when on Job Detail so more vertical space goes to actions/timer.
- [ ] **Optional tab icons** (Jobs / Quality) for glance recognition without relying on text alone.
- [ ] **Safe-area insets** remain correct on iOS notch / Android gesture bar after any sticky-bar change.

---

## P1 — Cross-flow: Job ↔ Quality

- [ ] **“Report NCR” (or “Quality issue”) CTA on Job Detail** that deep-links to `/quality/new?jobOrderId=…` (API/query already supported).
- [ ] Prefill job / part / customer on New NCR from that link (already partially wired — confirm UX copy and success path back to job or Quality list).
- [ ] Decide return navigation after create: stay on NCR, go to Quality list, or back to Job Detail.

---

## P1 — Quality list: operator-first, not dashboard-first

- [ ] **Elevate “New NCR”** as the primary action in the first viewport (full-width or clearly dominant vs Refresh).
- [ ] **Demote or collapse stats** (Total / Open / Critical / Overdue): hide by default, move below list, or single compact summary — don’t occupy the hero space of the screen.
- [ ] **Preserve card list** for NCRs (number, title, severity, status, date).
- [ ] Keep Refresh available but secondary.

---

## P1 — NCR form: staged “quick report” vs full edit

- [ ] **Define a Quick Report mode** for shopfloor create: minimal required fields (e.g. title + severity + job link + optional photo + defect qty) with one primary Save.
- [ ] **Defer office fields** (full root cause / CAPA / notes / multi-select taxonomy) to “Add more details” or Edit after create — or progressive disclosure sections collapsed by default.
- [ ] **Sticky or always-visible Save** on create (don’t require scrolling past every section).
- [ ] Keep photo capture (`capture="environment"`) prominent in Quick Report.
- [ ] Edit existing NCR can remain fuller; create path should feel floor-speed.
- [ ] Confirm copy: “You can save with a title only…” stays true for Quick Report.

---

## P2 — Glanceability & consistency

- [ ] **Routing step rows:** split dense `·`-joined meta into short lines or chips (status / elapsed / qty / hold) so status reads at arm’s length.
- [ ] **Due date formatting** consistent between Jobs list and Job Detail (list formats; detail currently passes raw string).
- [ ] **Badge language** consistent (job status vs step progress: Idle / Running / Paused / Done).
- [ ] **Filter chips / ghost buttons** all meet minimum tap height.
- [ ] **Focus / disabled / saving** states remain obvious when network is slow on the floor.
- [ ] **Login:** keep simple centered card; no redesign needed unless tenant flow confuses operators.

---

## P2 — Shell chrome budget

- [ ] Measure usable content height with sticky job actions + bottom tabs + header; target maximizing Job Detail work area on ~667–844 CSS px tall phones.
- [ ] Avoid adding a third persistent bar (e.g. extra top toolbar) without removing something else.
- [ ] Confirm landscape / small tablet (`max-w-[540px]`) still feels intentional, not a skinny column with wasted margins for primary actions.

---

## P3 — Later / out of MVP redesign scope

- [ ] Barcode / QR scan entry to job (spec phase 2).
- [ ] Offline queue indicators in layout (sync badge, pending actions).
- [ ] Push / notification entry points.
- [ ] Receiving / shipping confirm screens (if added — same phone-first rules).
- [ ] Workstation home / “My machine” context in header.
- [ ] Accessibility pass: screen reader labels on icon-only controls, contrast on badges, reduced-motion for `active:scale` if needed.

---

## Design principles to uphold (do not regress)

1. **Phone-first (~375px)** — not a responsified ERP.
2. **Few screens, big actions** — no dense data grids on the floor.
3. **One job at a time** — list → detail → act.
4. **Bottom tabs for primary destinations only** — keep the set small.
5. **48px+ tap targets** on anything operators hit under time pressure.
6. **Same API truth** as office Job Orders / NCR — layout changes must not invent new business rules.
7. **Companion app** — never clone `Cimmple_UI` navigation or masters.

---

## Suggested implementation order (when redesign starts)

1. Job Detail sticky actions + timer + scroll padding  
2. Nav drawer slim-down (Logout-focused)  
3. Job → Report NCR deep link  
4. Quality list: New NCR first, stats demoted  
5. NCR Quick Report create path  
6. Routing row / due-date / chip tap-size polish  

---

## Acceptance checks (before calling redesign done)

- [ ] From cold open → login → start a step: primary Start is reachable without hunting.
- [ ] While step is running: Pause and Complete visible without scrolling.
- [ ] Switch Jobs ↔ Quality in one tap from any main screen.
- [ ] From an open job, report an NCR with job prefilled in ≤ a few taps.
- [ ] New NCR quick path completable without filling CAPA-style sections.
- [ ] No critical controls hidden under home indicator / bottom nav.
- [ ] Spot-check on Android Chrome (installed PWA) and iOS Safari Add to Home Screen.

---

## Explicitly out of this checklist

- Implementing the redesign (blocked until approved).
- Backend/API contract changes (only note if a layout item truly needs API support).
- Visual rebrand / new illustration system unrelated to shopfloor usability.
- Porting office ERP screens into the PWA.
