# Cimmple Shop Floor PWA — Developer Specification

**App folder:** `Cimmple_ShopFloor/` only  
**Backend:** Existing `Cimmple_API` (do not duplicate business logic)  
**Office app:** `Cimmple_UI` — do not modify unless explicitly asked  

---

## 1. Purpose

Build a **mobile-first Progressive Web App** for machine-shop technicians/operators on the shop floor.

They will not use the full desktop ERP. They need a small set of screens and large tap actions on a phone (occasionally tablet), while working at machines.

This is a **companion app**, not a responsive copy of `Cimmple_UI`.

---

## 2. Scope

### In scope (MVP)

1. **Login** — same auth as ERP (JWT / existing login API).
2. **My Jobs list** — job orders relevant to the user’s tenant + location (and later: assigned workstation / user, if API supports it).
3. **Job detail card** — part, qty, due date, status, current routing step.
4. **Step actions** — Start / Pause / Resume / Complete (or Stop) for routing steps, matching existing Job Order step tracking behavior in the office app.
5. **PWA basics** — installable (manifest), mobile viewport, large touch targets.
6. **Role-safe UI** — only shop-floor features; no accounting, order entry, masters, or admin.

### Out of scope (MVP)

- Full ERP modules (Orders, AR/AP, Quotations, masters, etc.)
- Native iOS/Android app (Capacitor/React Native) — PWA only for now
- Offline sync (nice-to-have later)
- Barcode scanning (phase 2)
- Quality/NCR, receiving, shipping (phase 2+)
- Redesigning or responsifying `Cimmple_UI`

### Phase 2+ (later)

- Barcode / QR scan for job or part  
- Quality / NCR quick report  
- Simple receiving confirm  
- Offline queue for My Jobs  
- Push notifications (if needed)

---

## 3. Repository & Git workflow

### Location

All PWA work lives under:
Cimmple_ShopFloor/


Do **not** change `Cimmple_UI/` for shop-floor screens.  
Change `Cimmple_API/` **only** when a new/changed endpoint is required — coordinate with the ERP/API owner first.
### Branching
- Base branch: latest **`main`**
- Recommended: **one long-lived branch** for PWA work, e.g. `shop-pwa`
- Commit and push often
- Periodically pull/rebase **`main`** into your branch so you don’t drift
- Open PRs into `main` when a slice is reviewable (or as agreed with PM)
Scaffold (if not already on `main`): `Cimmple_ShopFloor/README.md` + minimal `package.json`. Real app setup is your first task after scaffold exists.
### Parallel work
- ERP developer continues on their ERP branch (`Cimmple_UI` / related API).
- You stay in `Cimmple_ShopFloor/`.
- Folder separation avoids most merge conflicts.
---
## 4. Product principles
1. **Phone-first** — design for ~375px width first; thumb-friendly controls.
2. **Few screens, big actions** — not dense tables or multi-tab slideouts.
3. **One job at a time** — list → detail → act.
4. **Same API truth** — job status/timers must match what the office Job Orders screen shows.
5. **Permission-limited** — workers only see what their role allows.
---
## 5. UX outline (MVP)
### Screen A — Login
- Company/tenant + credentials as required by existing auth
- Store token same pattern as ERP where practical (coordinate with API/auth owner)
### Screen B — My Jobs
- Scrollable cards (not a wide data grid)
- Show: job number, part, qty, due date, status, current step name
- Filter: active / mine / by location (as API allows)
- Tap card → Job Detail
### Screen C — Job Detail
- Header: job #, part, qty, due, status
- Current routing step highlighted
- Primary buttons (large):
  - **Start**
  - **Pause**
  - **Resume**
  - **Complete** (or equivalent of office “stop/complete step”)
- List other steps as read-only progress (sequence, process, workstation)
- Optional later: comments, attachments view
### Navigation
- Minimal bottom or top nav: Jobs (+ Settings/Logout)
- No desktop sidebar clone
---
## 6. Technical requirements
### Stack (recommended)
- React + TypeScript
- Vite (preferred for a new app; CRA not required)
- Mobile-friendly CSS (your choice; keep it simple)
- Axios (or fetch) against existing API base URL
Align with team prefs if PM/ERP owner specifies otherwise.
### Configuration
- `VITE_API_ROOT` (or equivalent) for API base URL — **no secrets in git**
- Separate deploy/host from office UI when ready (e.g. `shop.…` subdomain)
### PWA
- Web app manifest (name, icons, `display: standalone`)
- Service worker: start simple (install/cache shell); full offline job sync is phase 2
- Test “Add to Home Screen” on Android Chrome; iOS Safari as secondary
### Auth / tenancy
- Reuse existing login + JWT bearer calls
- Respect `tenantId` and `locationId` like the office app
- If a dedicated shop-floor role/permission is added later, hide everything else
### Reference implementation (office app)
Study these for behavior and payloads (do not copy desktop UI):
| Area | Location |
|------|----------|
| Job Orders UI | `Cimmple_UI/src/Modules/JobOrders/` |
| Job Order API client | `Cimmple_UI/src/Common/Services/JobOrderService.ts` |
| Job Order API | `Cimmple_API/CimmpleAPI/Controllers/JobOrderController.cs` |
| Routing step timer fields | `JobOrderRoutingStep` (`progressState`, `startTime`, etc.) |
**Known API surface today (verify in code):**
- `GET` `GetJobOrders`
- `GET` `GetJobOrderById`
- `POST` `SaveJobOrder` (routing step progress is persisted via save — confirm exact payload with ERP owner)
If timer actions need dedicated endpoints, request them from the API owner; do not invent a second backend.
---
## 7. Deliverables (MVP definition of done)
- [ ] App runs locally from `Cimmple_ShopFloor/`
- [ ] Login works against staging/dev API
- [ ] My Jobs list loads for tenant/location
- [ ] Job detail shows routing steps
- [ ] Start / Pause / Resume / Complete updates persist and appear correctly in office Job Orders
- [ ] Usable on a real phone (not only desktop DevTools)
- [ ] Manifest + installable PWA shell
- [ ] README: install, env vars, run, build
- [ ] PRs only touch `Cimmple_ShopFloor/` (plus agreed API changes)
---
## 8. Coordination rules
| Situation | Action |
|-----------|--------|
| Need new/changed API | Ask ERP/API owner; they land it on `main`; you pull `main` |
| Unclear job-timer rules | Match office Job Order slideout behavior; ask before changing meaning |
| Want to edit `Cimmple_UI` | Don’t — raise with PM |
| Blocked on permissions/roles | Ask PM for a shop-floor test user |
---
## 9. Non-goals / explicit don’ts
- Don’t rebuild the MasterListPage / slideout patterns on mobile  
- Don’t put AR, invoices, or full order entry in this app  
- Don’t create a separate business database  
- Don’t block waiting for a perfect offline design before MVP  
---
## 10. First week suggested plan
1. Confirm `Cimmple_ShopFloor/` exists on `main`; branch `shop-pwa`  
2. Scaffold Vite React TS app in that folder  
3. Wire env + login + authenticated API client  
4. My Jobs list from `GetJobOrders`  
5. Job detail from `GetJobOrderById`  
6. Implement step actions via existing save/timer contract  
7. Add manifest / basic PWA install  
8. Demo on a physical phone to PM  
---
## 11. Contacts / ownership
- **PM:** owns `main`, priorities, test users  
- **ERP branch owner:** office UI + API contract for Job Orders  
- **PWA developer:** everything under `Cimmple_ShopFloor/`  
---
**One-line summary:** Build a phone PWA in `Cimmple_ShopFloor/` that lets technicians run Job Order steps via the existing API — not a mobile clone of the full ERP.
