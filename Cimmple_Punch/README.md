# Cimmple Punch (Time Clock)

Kiosk app for face / password attendance. Phase 1 is **password punch** against `CimmpleFlow` employees; punches are stored in `CimmplePunch.FaceAttendanceLog`.

Companion to desktop ERP (`Cimmple_UI`). Backend is `Cimmple_API`.

## Run

```bash
cd Cimmple_Punch
cp .env.example .env
npm install
npm run dev
```

Default: [http://localhost:5175](http://localhost:5175)

Requires `Cimmple_API` at `http://localhost:5172`.

## Env

| Variable | Example |
|---|---|
| `VITE_API_ROOT` | Local: `http://localhost:5172/api`. Production: `https://api.v2.cimmple.net/api`. If omitted, the app picks local vs production from the page hostname. |

## Phase 1

- Kiosk operator logs in with an ERP (Flow) username/password
- Board lists active Flow employees
- Employee punches with **password** (camera UI is visible; face verify is not enabled yet)
