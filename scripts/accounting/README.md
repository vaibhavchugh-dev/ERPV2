# Accounting verification — step-by-step (beginner)

You will run **two kinds of checks**:

1. **API smoke** — a small program that logs in and calls Accounting APIs  
2. **SQL probes** — queries that look for bad data in the database  

You already have Node.js and `sqlcmd` on this PC. You only need your **ERP login** and the **API running**.

---

## Part A — Run the API smoke test

### Step 1: Start the API

The UI talks to the API at `http://localhost:5172`.

1. Open the API project in Visual Studio (or your usual way).
2. Start / debug **CimmpleAPI** so it is listening.
3. In a browser, open: `http://localhost:5172/swagger`  
   - If Swagger opens, the API is up.  
   - If the page fails, start the API and try again.

Leave the API running while you do the next steps.

### Step 2: Open PowerShell in the project folder

1. Press `Win`, type **PowerShell**, open it.
2. Go to the ERP repo:

```powershell
cd C:\Narinder\Cimmple\ERPV2
```

### Step 3: Set your login (same user you use in the ERP UI)

Replace with **your real** username and password:

```powershell
$env:ACCOUNTING_SMOKE_USER = "YOUR_USERNAME"
$env:ACCOUNTING_SMOKE_PASSWORD = "YOUR_PASSWORD"
$env:ACCOUNTING_SMOKE_TENANT_ID = "1"
```

Notes:

- `TENANT_ID` is usually `1` for local/dev. If your login uses another tenant, use that number.
- These values apply only to **this** PowerShell window.

### Step 4: Run the safe (read-only) smoke

```powershell
node scripts\accounting\test_accounting_smoke.js
```

Watch the output. You should see lines like:

```text
  PASS  Login — tenant=1
  PASS  GetAccountingSettings — ...
  PASS  GetPaymentDashboardMetrics — ...
  ...
=== Summary ===
  passed=...  failed=0  skipped=...
```

**What success looks like**

- Many `PASS` lines  
- `failed=0` at the bottom  
- PowerShell prompt returns with no red error stack  

**If Login FAIL**

- Wrong username/password  
- Wrong tenant id  
- API not running  

Fix those and run Step 4 again.

**If other FAIL lines appear**

- Copy the `FAIL` lines (name + message). Those point to a broken Accounting API path.

### Step 5 (optional): Run the mutate smoke

This also **saves Accounting Settings** and briefly toggles one bank recon flag (then puts it back).

Only do this on a tenant you are allowed to change (local/dev is fine).

```powershell
$env:ACCOUNTING_SMOKE_MUTATE = "1"
node scripts\accounting\test_accounting_smoke.js
```

Optional — force a specific bank:

```powershell
$env:ACCOUNTING_SMOKE_BANK_ID = "1"
node scripts\accounting\test_accounting_smoke.js
```

(Use a real bank id from **Masters → Bank** / Accounting Bank list.)

---

## Part B — Run the SQL integrity probes

This checks the **database** for integrity problems (unbalanced journals, bad paid amounts, etc.).

### Step 6: Get connection details

Use the same SQL server your local API uses. In this project that is typically in:

`Cimmple_API\CimmpleAPI\appsettings.Development.json`

Look for:

- Server (Data Source)  
- Database (`CimmpleERPDB`)  
- User Id / Password  

You need those three for `sqlcmd`.

### Step 7: Run the SQL file with sqlcmd

Still in PowerShell, from `C:\Narinder\Cimmple\ERPV2`:

```powershell
sqlcmd -S YOUR_SERVER -d CimmpleERPDB -U YOUR_SQL_USER -P "YOUR_SQL_PASSWORD" -C -v TenantId=1 -i scripts\accounting\accounting-integrity-probes.sql
```

Replace:

- `YOUR_SERVER` — e.g. the Data Source value from appsettings  
- `YOUR_SQL_USER` / `YOUR_SQL_PASSWORD` — SQL login  
- `TenantId=1` — same tenant you used in the smoke test  

Example shape (do **not** commit real passwords into chat/docs if sharing):

```powershell
sqlcmd -S 108.181.155.217 -d CimmpleERPDB -U ERPV2_User -P "********" -C -v TenantId=1 -i scripts\accounting\accounting-integrity-probes.sql
```

### Step 8: How to read the SQL results

The script prints sections:

| Section | Meaning |
|---------|---------|
| `0) Schema presence` | Tables/columns should say `OK` |
| `1) Summary snapshot` | Counts only (informational) |
| `2)` … `6)`, `8)` … `10)`, `12)` labeled **FAIL** | **No rows = good**. Rows listed = problems to investigate |
| `7)` Open AR/AP | Informational balances |
| `11)` Journals after close | Review manually if rows appear |

So for FAIL sections: **empty result = pass**.

---

## Part C — Easier alternative for SQL (SSMS)

If you prefer a GUI:

1. Open **SQL Server Management Studio**.  
2. Connect to the same server/database.  
3. Open file:  
   `C:\Narinder\Cimmple\ERPV2\scripts\accounting\accounting-integrity-probes.sql`  
4. Near the top, change:

```sql
DECLARE @TenantId INT = $(TenantId);
```

to:

```sql
DECLARE @TenantId INT = 1;
```

5. Press **Execute (F5)**.  
6. Read the Messages / Results the same way as Step 8.

---

## Quick checklist (first time)

- [ ] API running (`http://localhost:5172/swagger` opens)  
- [ ] PowerShell `cd` to `C:\Narinder\Cimmple\ERPV2`  
- [ ] Set `ACCOUNTING_SMOKE_USER` / `PASSWORD` / `TENANT_ID`  
- [ ] Run `node scripts\accounting\test_accounting_smoke.js` → `failed=0`  
- [ ] Run `sqlcmd ... -i scripts\accounting\accounting-integrity-probes.sql` → FAIL sections empty  
- [ ] (Optional) Short UI pass: Setup save, bank recon refresh, period lock  

---

## Common problems

| Problem | Fix |
|---------|-----|
| `Login` FAIL / 401 | Check username, password, tenant; confirm you can log into the UI with the same values |
| `ECONNREFUSED` / fetch failed | API not running on port 5172 |
| `node` not found | Install Node.js LTS, reopen PowerShell |
| `sqlcmd` login failed | Wrong SQL user/password/server; confirm with SSMS first |
| `Invalid object name` in SQL | Wrong database, or schema ensure never ran — open Accounting Setup once in the UI, then retry |

---

## What this does *not* replace

Still do a short **manual UI** pass when you change Accounting:

1. Accounting Setup → Save → refresh  
2. Bank Reconciliation → mark one payment reconciled → refresh  
3. Period Close → try a journal in a closed period (should block)  

Smoke + SQL catch API/data integrity; the UI pass catches UX issues.
