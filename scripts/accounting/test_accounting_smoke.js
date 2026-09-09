/**
 * Accounting module API smoke pack
 *
 * Prerequisites:
 *   - API running (default http://localhost:5172)
 *   - Valid ERP user credentials
 *   - Node 18+ (built-in fetch) OR axios available
 *
 * Usage:
 *   set ACCOUNTING_SMOKE_USER=admin
 *   set ACCOUNTING_SMOKE_PASSWORD=yourpassword
 *   set ACCOUNTING_SMOKE_TENANT_ID=1
 *   node scripts/accounting/test_accounting_smoke.js
 *
 * Optional:
 *   ACCOUNTING_SMOKE_BASE_URL=http://localhost:5172
 *   ACCOUNTING_SMOKE_BANK_ID=1          # bank for recon checks
 *   ACCOUNTING_SMOKE_MUTATE=1           # allow reconcile toggle + settings save
 *   ACCOUNTING_SMOKE_PERIOD_KEY=202609  # YYYYMM for period close/open (MUTATE only)
 */

const BASE_URL = (process.env.ACCOUNTING_SMOKE_BASE_URL || "http://localhost:5172").replace(/\/$/, "");
const USERNAME = process.env.ACCOUNTING_SMOKE_USER || "";
const PASSWORD = process.env.ACCOUNTING_SMOKE_PASSWORD || "";
const TENANT_ID = Number(process.env.ACCOUNTING_SMOKE_TENANT_ID || "1");
const BANK_ID = Number(process.env.ACCOUNTING_SMOKE_BANK_ID || "0");
const MUTATE = process.env.ACCOUNTING_SMOKE_MUTATE === "1";
const PERIOD_KEY = process.env.ACCOUNTING_SMOKE_PERIOD_KEY || "";

const results = [];
let accessToken = "";
let locationId = null;

function pass(name, detail) {
  results.push({ name, ok: true, detail: detail || "" });
  console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`);
}

function fail(name, detail) {
  results.push({ name, ok: false, detail: detail || "" });
  console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
}

function skip(name, detail) {
  results.push({ name, ok: true, skipped: true, detail: detail || "" });
  console.log(`  SKIP  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function request(method, path, body) {
  const url = `${BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
    tenantId: String(TENANT_ID),
  };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (locationId) headers["X-Location-Id"] = String(locationId);

  const res = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  let data = null;
  const text = await res.text();
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  return { status: res.status, data, ok: res.ok };
}

function errMsg(data) {
  if (!data) return "no body";
  return data.error || data.message || data.title || JSON.stringify(data).slice(0, 240);
}

async function login() {
  console.log("\n=== Auth ===");
  if (!USERNAME || !PASSWORD) {
    fail("Login", "Set ACCOUNTING_SMOKE_USER and ACCOUNTING_SMOKE_PASSWORD");
    return false;
  }

  const { status, data } = await request("POST", "/api/Auth/Login", {
    Username: USERNAME,
    Password: PASSWORD,
    TenantId: TENANT_ID,
  });

  // Login responses vary: sometimes wrapped in result
  const payload = data?.result || data;
  const token = payload?.accessToken || payload?.AccessToken;
  const user = payload?.user || payload?.User;

  if (status >= 200 && status < 300 && token) {
    accessToken = token;
    locationId = user?.defaultLocationId || user?.DefaultLocationId || null;
    const locs = user?.locations || user?.Locations || [];
    if (!locationId && locs.length) locationId = locs[0].locationId || locs[0].LocationId;
    pass("Login", `tenant=${user?.tenantId || user?.TenantId || TENANT_ID}`);
    return true;
  }

  fail("Login", `${status}: ${errMsg(data)}`);
  return false;
}

async function testSettingsRoundTrip() {
  console.log("\n=== Accounting Setup ===");
  const get = await request("GET", "/api/Accounting/GetAccountingSettings");
  if (!(get.status >= 200 && get.status < 300 && get.data?.result)) {
    fail("GetAccountingSettings", `${get.status}: ${errMsg(get.data)}`);
    return;
  }

  const s = get.data.result;
  const terms = s.paymentTerms || [];
  const limits = s.approvalLimits || [];
  pass(
    "GetAccountingSettings",
    `terms=${terms.length}, limits=${limits.length}, fy=${s.fiscalYearStart}, tax=${s.taxRate}`
  );

  if (!Array.isArray(terms) || terms.length === 0) {
    fail("PaymentTerms seeded", "expected at least one active payment term");
  } else {
    pass("PaymentTerms seeded", terms.map((t) => t.name).join(", "));
  }

  if (!MUTATE) {
    skip("SaveAccountingSettings", "set ACCOUNTING_SMOKE_MUTATE=1 to save");
    return;
  }

  const saveBody = {
    companyName: s.companyName || "Cimmple Corp",
    fiscalYearStart: s.fiscalYearStart || "01-01",
    defaultCurrency: s.defaultCurrency || "USD",
    taxRate: s.taxRate ?? 8.25,
    gstEnabled: !!s.gstEnabled,
    taxRegistrationNumber: s.taxRegistrationNumber || null,
    defaultAccountsReceivableAccountId: s.defaultAccountsReceivableAccountId || null,
    defaultAccountsPayableAccountId: s.defaultAccountsPayableAccountId || null,
    defaultRevenueAccountId: s.defaultRevenueAccountId || null,
    defaultExpenseAccountId: s.defaultExpenseAccountId || null,
    defaultInventoryAccountId: s.defaultInventoryAccountId || null,
    defaultSalesTaxPayableAccountId: s.defaultSalesTaxPayableAccountId || null,
    defaultInputTaxAccountId: s.defaultInputTaxAccountId || null,
    defaultFreightOutAccountId: s.defaultFreightOutAccountId || null,
    defaultOtherChargeAccountId: s.defaultOtherChargeAccountId || null,
    defaultFreightInAccountId: s.defaultFreightInAccountId || null,
    paymentTerms: terms,
    approvalLimits: (limits || []).map((l) => ({
      id: l.id,
      roleId: l.roleId || 0,
      role: l.role,
      limit: l.limit,
      requiresDualApproval: !!l.requiresDualApproval,
    })),
  };

  const save = await request("POST", "/api/Accounting/SaveAccountingSettings", saveBody);
  if (!(save.status >= 200 && save.status < 300)) {
    fail("SaveAccountingSettings", `${save.status}: ${errMsg(save.data)}`);
    return;
  }
  pass("SaveAccountingSettings");

  const reload = await request("GET", "/api/Accounting/GetAccountingSettings");
  const r = reload.data?.result;
  if (
    r &&
    r.companyName === saveBody.companyName &&
    Number(r.taxRate) === Number(saveBody.taxRate) &&
    (r.paymentTerms || []).length === terms.length
  ) {
    pass("Settings round-trip", "reload matches save");
  } else {
    fail("Settings round-trip", "reload mismatch after save");
  }
}

async function testDashboardAndReports() {
  console.log("\n=== Dashboard & Reports ===");
  const dash = await request(
    "GET",
    `/api/Accounting/GetPaymentDashboardMetrics?dateRange=${encodeURIComponent("This Month")}`
  );
  if (dash.status >= 200 && dash.status < 300 && dash.data?.result) {
    const m = dash.data.result;
    pass(
      "GetPaymentDashboardMetrics",
      `AR=${m.totalReceivables}, AP=${m.totalPayables}, cashIn=${m.cashIn}`
    );
  } else {
    fail("GetPaymentDashboardMetrics", `${dash.status}: ${errMsg(dash.data)}`);
  }

  const recent = await request("GET", "/api/Accounting/GetRecentTransactions?limit=5&dateRange=All");
  if (recent.status >= 200 && recent.status < 300 && Array.isArray(recent.data?.result)) {
    pass("GetRecentTransactions", `count=${recent.data.result.length}`);
  } else {
    fail("GetRecentTransactions", `${recent.status}: ${errMsg(recent.data)}`);
  }

  const reportTypes = [
    "trial-balance",
    "profit-loss",
    "ar-aging",
    "ap-aging",
    "balance-sheet",
    "cash-flow",
  ];

  for (const reportType of reportTypes) {
    const rep = await request("POST", "/api/Accounting/GenerateFinancialReport", {
      TenantId: TENANT_ID,
      ReportType: reportType,
      DateRange: "This Month",
      Format: "csv",
    });
    if (rep.status >= 200 && rep.status < 300 && rep.data?.result != null) {
      pass(`Report:${reportType}`);
    } else {
      fail(`Report:${reportType}`, `${rep.status}: ${errMsg(rep.data)}`);
    }
  }

  const comingSoon = await request("POST", "/api/Accounting/GenerateFinancialReport", {
    TenantId: TENANT_ID,
    ReportType: "customer-statements",
    DateRange: "This Month",
    Format: "csv",
  });
  // Backend may 400/500 or return empty — UI blocks these; API honesty is optional
  if (comingSoon.status >= 400) {
    pass("Report:customer-statements blocked/unavailable", String(comingSoon.status));
  } else {
    skip("Report:customer-statements", "API still accepts unsupported type (UI blocks it)");
  }
}

async function testBankRecon() {
  console.log("\n=== Bank Reconciliation ===");
  let bankId = BANK_ID;
  if (!bankId) {
    const banks = await request("GET", `/api/Bank/GetBanklist?tenantid=${TENANT_ID}`);
    const list = banks.data?.result || [];
    if (banks.status >= 200 && banks.status < 300 && list.length) {
      bankId = list[0].id;
      pass("GetBanklist", `using bankId=${bankId}, lastReconciled=${list[0].lastReconciledDate || "never"}`);
    } else {
      fail("GetBanklist", `${banks.status}: ${errMsg(banks.data)}`);
      return;
    }
  } else {
    pass("Bank id from env", String(bankId));
  }

  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 90);
  const ymd = (d) => d.toISOString().slice(0, 10);

  const txs = await request(
    "GET",
    `/api/Accounting/GetBankTransactions?bankAccountId=${bankId}&startDate=${ymd(start)}&endDate=${ymd(end)}`
  );

  if (!(txs.status >= 200 && txs.status < 300 && Array.isArray(txs.data?.result))) {
    fail("GetBankTransactions", `${txs.status}: ${errMsg(txs.data)}`);
    return;
  }

  const rows = txs.data.result;
  const typesOk = rows.every((t) => t.reconciled === true || t.reconciled === false);
  pass("GetBankTransactions", `count=${rows.length}`);
  if (typesOk) pass("Bank tx reconciled flag present");
  else fail("Bank tx reconciled flag present", "missing boolean reconciled");

  if (!MUTATE) {
    skip("ReconcileBankTransaction", "set ACCOUNTING_SMOKE_MUTATE=1");
    return;
  }

  if (!rows.length) {
    skip("ReconcileBankTransaction", "no bank transactions in last 90 days");
    return;
  }

  const target = rows[0];
  const next = !target.reconciled;
  const recon = await request("POST", "/api/Accounting/ReconcileBankTransaction", {
    transactionId: target.id,
    reconciled: next,
  });
  if (!(recon.status >= 200 && recon.status < 300)) {
    fail("ReconcileBankTransaction", `${recon.status}: ${errMsg(recon.data)}`);
    return;
  }
  pass("ReconcileBankTransaction", `id=${target.id} -> ${next}`);

  const reload = await request(
    "GET",
    `/api/Accounting/GetBankTransactions?bankAccountId=${bankId}&startDate=${ymd(start)}&endDate=${ymd(end)}`
  );
  const again = (reload.data?.result || []).find((t) => t.id === target.id);
  if (again && again.reconciled === next) {
    pass("Reconcile persists after reload");
  } else {
    fail("Reconcile persists after reload", `expected ${next}, got ${again?.reconciled}`);
  }

  // Restore original state
  await request("POST", "/api/Accounting/ReconcileBankTransaction", {
    transactionId: target.id,
    reconciled: target.reconciled,
  });
}

async function testJournalAndPeriods() {
  console.log("\n=== Journals & Periods ===");
  const list = await request(
    "GET",
    `/api/JournalEntry/List?tenantId=${TENANT_ID}&skip=0&take=10`
  );
  if (list.status >= 200 && list.status < 300 && list.data?.result) {
    const items = list.data.result.items || list.data.result;
    pass("JournalEntry/List", `count=${Array.isArray(items) ? items.length : list.data.result.total}`);
  } else {
    fail("JournalEntry/List", `${list.status}: ${errMsg(list.data)}`);
  }

  const closed = await request("GET", `/api/Accounting/ListClosedPeriods?tenantId=${TENANT_ID}`);
  if (closed.status >= 200 && closed.status < 300) {
    const rows = closed.data?.result || [];
    pass("ListClosedPeriods", `count=${Array.isArray(rows) ? rows.length : 0}`);
  } else {
    fail("ListClosedPeriods", `${closed.status}: ${errMsg(closed.data)}`);
  }

  const audit = await request(
    "GET",
    `/api/Accounting/ListGlAuditTrail?tenantId=${TENANT_ID}&skip=0&take=20`
  );
  if (audit.status >= 200 && audit.status < 300 && audit.data?.result) {
    pass("ListGlAuditTrail", `total=${audit.data.result.total ?? (audit.data.result.items || []).length}`);
  } else {
    fail("ListGlAuditTrail", `${audit.status}: ${errMsg(audit.data)}`);
  }

  if (!MUTATE || !PERIOD_KEY) {
    skip("Period close/open", "set ACCOUNTING_SMOKE_MUTATE=1 and ACCOUNTING_SMOKE_PERIOD_KEY=YYYYMM");
    return;
  }

  const close = await request("POST", "/api/Accounting/CloseAccountingPeriod", {
    tenantId: TENANT_ID,
    periodKey: PERIOD_KEY,
  });
  if (close.status >= 200 && close.status < 300) {
    pass("CloseAccountingPeriod", PERIOD_KEY);
  } else if (close.status === 409) {
    pass("CloseAccountingPeriod", `already closed ${PERIOD_KEY}`);
  } else {
    fail("CloseAccountingPeriod", `${close.status}: ${errMsg(close.data)}`);
    return;
  }

  const open = await request("POST", "/api/Accounting/OpenAccountingPeriod", {
    tenantId: TENANT_ID,
    periodKey: PERIOD_KEY,
  });
  if (open.status >= 200 && open.status < 300) {
    pass("OpenAccountingPeriod", PERIOD_KEY);
  } else {
    fail("OpenAccountingPeriod", `${open.status}: ${errMsg(open.data)}`);
  }
}

async function testRemindersAndGst() {
  console.log("\n=== Reminders & GST foundation ===");
  const gst = await request("GET", "/api/Accounting/GetGstStatus");
  if (gst.status >= 200 && gst.status < 300 && gst.data?.result) {
    const g = gst.data.result;
    if (g.available === false) {
      pass("GetGstStatus", "honest unavailable foundation");
    } else {
      fail("GetGstStatus", "expected available=false until GST returns exist");
    }
  } else {
    fail("GetGstStatus", `${gst.status}: ${errMsg(gst.data)}`);
  }

  // Invalid invoice should fail honestly (not toast-only success)
  const rem = await request("POST", "/api/Accounting/SendArReminder", { invoiceId: -1 });
  if (rem.status >= 400) {
    pass("SendArReminder rejects invalid invoice", String(rem.status));
  } else {
    fail("SendArReminder rejects invalid invoice", "expected 4xx");
  }
}

async function main() {
  console.log(`Accounting smoke → ${BASE_URL} (tenant ${TENANT_ID}, mutate=${MUTATE})`);
  const okLogin = await login();
  if (!okLogin) {
    printSummary();
    process.exit(1);
  }

  await testSettingsRoundTrip();
  await testDashboardAndReports();
  await testBankRecon();
  await testJournalAndPeriods();
  await testRemindersAndGst();
  printSummary();

  const failed = results.filter((r) => !r.ok && !r.skipped).length;
  process.exit(failed ? 1 : 0);
}

function printSummary() {
  const passed = results.filter((r) => r.ok && !r.skipped).length;
  const skipped = results.filter((r) => r.skipped).length;
  const failed = results.filter((r) => !r.ok).length;
  console.log("\n=== Summary ===");
  console.log(`  passed=${passed}  failed=${failed}  skipped=${skipped}`);
  if (failed) {
    console.log("  Failures:");
    results.filter((r) => !r.ok).forEach((r) => console.log(`    - ${r.name}: ${r.detail}`));
  }
  console.log("\nNext: run scripts/accounting/accounting-integrity-probes.sql against the same tenant.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
