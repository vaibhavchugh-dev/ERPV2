# Cimmple Shop Floor PWA

Mobile-first Progressive Web App for machine-shop technicians. Companion to the desktop ERP (`Cimmple_UI`) — not a responsive clone.

All shop-floor UI lives in this folder (`Cimmple_PWA/`). It talks to the existing ASP.NET API (`Cimmple_API`) using the same JWT / tenant / location headers as the office app.

## Prerequisites

- Node.js 18+ (20+ recommended)
- Running `Cimmple_API` (default local URL: `http://localhost:5172`)

## Install

```bash
cd Cimmple_PWA
npm install
```

## Environment

Copy the example env file and set the API root (include the `/api` suffix):

```bash
cp .env.example .env
```

| Variable | Description | Example |
|----------|-------------|---------|
| `VITE_API_ROOT` | API base URL including `/api` | `http://localhost:5172/api` |

Do not commit `.env` or secrets.

## Run (dev)

```bash
npm run dev
```

Opens at [http://localhost:5174](http://localhost:5174) by default.

## Build

```bash
npm run build
npm run preview
```

`build` outputs a production bundle (with service worker + web manifest) under `dist/`.

## MVP screens

1. **Login** — `POST /Auth/Login` (same contract as `Cimmple_UI`)
2. **My Jobs** — `GET /JobOrder/GetJobOrders?tenantid=&locationId=`
3. **Job Detail** — `GET /JobOrder/GetJobOrderById` + step actions via `POST /JobOrder/SaveJobOrder`
4. **Quality (NCR)** — list/create/edit via `/Quality/*` (same as office Quality module)
5. **Navigation** — bottom bar (Jobs | Quality) + slide-out drawer (hamburger) with Logout

### Step timer behavior

Matches office Job Order routing-step tracking:

- **Start / Resume** → `progressState: running`, `status: In Progress`, `startTime` set
- **Pause** → `progressState: paused`
- **Complete** → `progressState: stopped`, `status: Completed`

Routing steps (including `progressState`, `startTime`, `elapsedTime`) are persisted as JSON on the job order through `SaveJobOrder` — same as the office slideout.

## PWA

- Web app manifest (`name`, icons, `display: standalone`)
- Service worker via `vite-plugin-pwa` (caches the app shell; full offline job sync is out of scope for MVP)
- Test “Add to Home Screen” on Android Chrome; iOS Safari as secondary

## Auth notes

Session keys mirror the ERP where practical:

- `token`, `refreshToken`, `storage` (tenantId, userId, …)
- `locationId` + `X-Location-Id` request header
- 401 → refresh via `/Auth/Refresh`, else redirect to `/login`

## Out of scope (MVP)

Barcode scanning, offline sync, Quality/NCR, receiving/shipping, accounting/orders/masters, native Capacitor/React Native.

## Spec

See [`pwa_spec.md`](./pwa_spec.md) for product and technical requirements.
