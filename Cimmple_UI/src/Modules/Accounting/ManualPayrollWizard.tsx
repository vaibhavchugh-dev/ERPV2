import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useHistory } from "react-router-dom";
import { toast } from "react-toastify";
import { AccountingService } from "../../Common/Services/AccountingService";
import "./JournalEntries.scss";

type MoneyFieldKey =
  | "grossWages"
  | "federalTax"
  | "stateTax"
  | "localTax"
  | "socialSecurityTax"
  | "medicareTax"
  | "preTaxDeductions"
  | "retirementDeductions"
  | "postTaxDeductions"
  | "garnishments"
  | "netPay"
  | "employerTaxesBenefits";

type AmountState = Record<MoneyFieldKey, string>;

type PreviewLine = {
  bucketKey: string;
  label: string;
  accountId: number;
  accountDisplay?: string | null;
  debit: number;
  credit: number;
  description: string;
};

type PreviewResult = {
  isBalanced: boolean;
  canPost?: boolean;
  hasMissingAccounts?: boolean;
  totalDebits: number;
  totalCredits: number;
  missingAccountKeys: string[];
  expectedNetPay: number;
  enteredNetPay: number;
  netPayDifference: number;
  lines: PreviewLine[];
};

const MONEY_FIELDS: { key: MoneyFieldKey; label: string; hint?: string }[] = [
  { key: "grossWages", label: "Gross wages", hint: "Total gross pay for the period" },
  { key: "federalTax", label: "Federal tax withheld" },
  { key: "stateTax", label: "State tax withheld" },
  { key: "localTax", label: "Local tax withheld" },
  { key: "socialSecurityTax", label: "Social Security withheld" },
  { key: "medicareTax", label: "Medicare withheld" },
  { key: "preTaxDeductions", label: "Pre-tax deductions", hint: "Exclude retirement (enter that below)" },
  { key: "retirementDeductions", label: "Retirement deductions", hint: "401(k), etc." },
  { key: "postTaxDeductions", label: "Post-tax deductions" },
  { key: "garnishments", label: "Garnishments" },
  { key: "netPay", label: "Net pay", hint: "Use Suggest net from the other amounts" },
  { key: "employerTaxesBenefits", label: "Employer taxes / benefits", hint: "ER FICA, FUTA, SUTA, benefits" },
];

const emptyAmounts = (): AmountState =>
  MONEY_FIELDS.reduce((acc, f) => {
    acc[f.key] = "";
    return acc;
  }, {} as AmountState);

const ymd = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const parseMoney = (v: string) => {
  const n = Number(String(v).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
};

const fmtMoney = (n: number) =>
  n.toLocaleString(undefined, { style: "currency", currency: "USD" });

const ManualPayrollWizard: React.FC = () => {
  const history = useHistory();
  const [step, setStep] = useState<1 | 2>(1);
  const [payPeriodStart, setPayPeriodStart] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return ymd(d);
  });
  const [payPeriodEnd, setPayPeriodEnd] = useState(() => ymd(new Date()));
  const [payDate, setPayDate] = useState(() => ymd(new Date()));
  const [entryDate, setEntryDate] = useState(() => ymd(new Date()));
  const [referenceNumber, setReferenceNumber] = useState("");
  const [description, setDescription] = useState("");
  const [amounts, setAmounts] = useState<AmountState>(emptyAmounts);
  const [defaultsReady, setDefaultsReady] = useState(false);
  const [missingDefaults, setMissingDefaults] = useState<string[]>([]);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const settings = await AccountingService.GetAccountingSettings();
        if (cancelled) return;
        setMissingDefaults(
          [
            !settings?.defaultWageExpenseAccountId ? "Wage Expense" : null,
            !settings?.defaultNetPayPayableAccountId ? "Net Pay / Accrued Payroll" : null,
          ].filter(Boolean) as string[]
        );
        setDefaultsReady(true);
      } catch {
        if (!cancelled) {
          setDefaultsReady(true);
          setMissingDefaults(["Unable to load Accounting Setup defaults"]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const suggestedNet = useMemo(() => {
    const g = parseMoney(amounts.grossWages);
    const withhold =
      parseMoney(amounts.federalTax) +
      parseMoney(amounts.stateTax) +
      parseMoney(amounts.localTax) +
      parseMoney(amounts.socialSecurityTax) +
      parseMoney(amounts.medicareTax) +
      parseMoney(amounts.preTaxDeductions) +
      parseMoney(amounts.retirementDeductions) +
      parseMoney(amounts.postTaxDeductions) +
      parseMoney(amounts.garnishments);
    return Math.round((g - withhold) * 100) / 100;
  }, [amounts]);

  const buildRequestBody = useCallback(() => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    return {
      tenantId: storage?.tenantID || 0,
      locationId: storage?.locationID || storage?.defaultLocationId || 0,
      payPeriodStart: payPeriodStart || undefined,
      payPeriodEnd: payPeriodEnd || undefined,
      payDate: payDate || undefined,
      entryDate: entryDate || payDate || undefined,
      referenceNumber: referenceNumber.trim() || undefined,
      description: description.trim() || undefined,
      grossWages: parseMoney(amounts.grossWages),
      federalTax: parseMoney(amounts.federalTax),
      stateTax: parseMoney(amounts.stateTax),
      localTax: parseMoney(amounts.localTax),
      socialSecurityTax: parseMoney(amounts.socialSecurityTax),
      medicareTax: parseMoney(amounts.medicareTax),
      preTaxDeductions: parseMoney(amounts.preTaxDeductions),
      retirementDeductions: parseMoney(amounts.retirementDeductions),
      postTaxDeductions: parseMoney(amounts.postTaxDeductions),
      garnishments: parseMoney(amounts.garnishments),
      netPay: parseMoney(amounts.netPay),
      employerTaxesBenefits: parseMoney(amounts.employerTaxesBenefits),
    };
  }, [
    amounts,
    description,
    entryDate,
    payDate,
    payPeriodEnd,
    payPeriodStart,
    referenceNumber,
  ]);

  const handleSuggestNet = () => {
    setAmounts((prev) => ({ ...prev, netPay: suggestedNet.toFixed(2) }));
  };

  const handlePreview = async () => {
    if (!payDate) {
      toast.error("Pay date is required.");
      return;
    }
    if (parseMoney(amounts.grossWages) <= 0 && parseMoney(amounts.netPay) <= 0) {
      toast.error("Enter at least gross wages (and usually net pay).");
      return;
    }
    setPreviewing(true);
    setPreview(null);
    try {
      const result = await AccountingService.PreviewManualPayrollJournal(buildRequestBody());
      setPreview(result);
      setStep(2);
      if (result?.missingAccountKeys?.length) {
        toast.warn(
          "Some payroll GL defaults are missing. Amounts may still balance — set accounts under Accounting Setup → Payroll GL Accounts."
        );
      } else if (!result?.isBalanced) {
        toast.warn("Journal amounts are not balanced yet — check amounts or use Suggest net.");
      }
    } catch (e: any) {
      const msg =
        e?.response?.data?.error || e?.message || "Failed to preview manual payroll journal.";
      toast.error(msg);
    } finally {
      setPreviewing(false);
    }
  };

  const handlePost = async () => {
    const canPost =
      preview?.canPost ??
      (preview?.isBalanced && !(preview?.missingAccountKeys?.length > 0));
    if (!canPost) {
      toast.error(
        preview?.hasMissingAccounts || (preview?.missingAccountKeys?.length ?? 0) > 0
          ? "Map missing payroll GL defaults before posting."
          : "Fix the preview so the journal amounts are balanced before posting."
      );
      return;
    }
    setPosting(true);
    try {
      const result = await AccountingService.PostManualPayrollJournal(buildRequestBody());
      const jeId = result?.journalEntryId;
      const already = result?.alreadyExists;
      toast.success(
        already
          ? `Already posted (${result?.referenceNumber || "manual"}).`
          : `Posted ${result?.referenceNumber || "manual payroll"}.`
      );
      if (jeId) {
        history.push(`/accounts/journal-entries?id=${jeId}`);
      } else {
        history.push("/accounts/payroll");
      }
    } catch (e: any) {
      const msg =
        e?.response?.data?.error || e?.message || "Failed to post manual payroll journal.";
      toast.error(msg);
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="journal-entries-page">
      <div className="je-header">
        <div>
          <h1>Manual payroll journal</h1>
          <p className="je-subtitle">
            Enter period totals — Flow builds the balanced journal from Accounting Setup defaults.
            No debit/credit layout required.
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <Link to="/accounts/payroll" className="je-link-btn">
            Payroll Journals
          </Link>
          <Link to="/accounts/setup" className="je-link-btn" style={{ background: "#e5e7eb", color: "#111827" }}>
            Accounting Setup
          </Link>
        </div>
      </div>

      {defaultsReady && missingDefaults.length > 0 && (
        <div className="je-panel" style={{ borderLeft: "4px solid #f59e0b" }}>
          <p style={{ margin: 0, color: "#92400e" }}>
            Set these under <Link to="/accounts/setup">Accounting Setup → Payroll GL Accounts</Link> before
            posting: {missingDefaults.join(", ")}. Other buckets are only required when their amount is
            non-zero.
          </p>
        </div>
      )}

      {step === 1 && (
        <>
          <div className="je-panel">
            <h2>1. Pay period</h2>
            <div className="je-filters" style={{ marginBottom: 0 }}>
              <label>
                Period start
                <input
                  type="date"
                  value={payPeriodStart}
                  onChange={(e) => setPayPeriodStart(e.target.value)}
                />
              </label>
              <label>
                Period end
                <input
                  type="date"
                  value={payPeriodEnd}
                  onChange={(e) => setPayPeriodEnd(e.target.value)}
                />
              </label>
              <label>
                Pay date
                <input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
              </label>
              <label>
                Journal date
                <input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />
              </label>
              <label>
                Reference (optional)
                <input
                  type="text"
                  value={referenceNumber}
                  onChange={(e) => setReferenceNumber(e.target.value)}
                  placeholder="AUTO: MANUAL-yyyyMMdd"
                  style={{
                    padding: "0.6rem 0.75rem",
                    border: "1px solid #d1d5db",
                    borderRadius: "0.375rem",
                    fontSize: "0.875rem",
                    minWidth: "12rem",
                  }}
                />
              </label>
            </div>
            <label style={{ display: "block", marginTop: "1rem", fontSize: "0.8rem", fontWeight: 500 }}>
              Description (optional)
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                style={{
                  display: "block",
                  width: "100%",
                  marginTop: "0.35rem",
                  padding: "0.6rem 0.75rem",
                  border: "1px solid #d1d5db",
                  borderRadius: "0.375rem",
                }}
                placeholder="e.g. Biweekly payroll ending Mar 15"
              />
            </label>
          </div>

          <div className="je-panel">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
              <h2 style={{ margin: 0 }}>2. Amounts</h2>
              <div className="je-line-actions" style={{ marginTop: 0 }}>
                <button type="button" className="je-add-line" onClick={handleSuggestNet}>
                  Suggest net = {fmtMoney(suggestedNet)}
                </button>
              </div>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                gap: "1rem",
                marginTop: "1rem",
              }}
            >
              {MONEY_FIELDS.map((f) => (
                <label key={f.key} style={{ display: "block", fontSize: "0.8rem", fontWeight: 500, color: "#374151" }}>
                  {f.label}
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={amounts[f.key]}
                    onChange={(e) => setAmounts((prev) => ({ ...prev, [f.key]: e.target.value }))}
                    style={{
                      display: "block",
                      width: "100%",
                      marginTop: "0.35rem",
                      padding: "0.55rem 0.65rem",
                      border: "1px solid #d1d5db",
                      borderRadius: "0.375rem",
                      fontSize: "0.875rem",
                    }}
                    placeholder="0.00"
                  />
                  {f.hint ? (
                    <span style={{ display: "block", marginTop: "0.25rem", color: "#6b7280", fontWeight: 400, fontSize: "0.72rem" }}>
                      {f.hint}
                    </span>
                  ) : null}
                </label>
              ))}
            </div>
            <div className="je-line-actions">
              <button type="button" className="je-submit" onClick={() => void handlePreview()} disabled={previewing}>
                {previewing ? "Building preview…" : "Preview journal"}
              </button>
            </div>
          </div>
        </>
      )}

      {step === 2 && preview && (
        <div className="je-panel">
          <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap", marginBottom: "1rem" }}>
            <h2 style={{ margin: 0 }}>3. Preview</h2>
            <button type="button" onClick={() => setStep(1)} style={{ padding: "0.5rem 0.85rem", borderRadius: "0.375rem", border: "1px solid #d1d5db", background: "#fff", cursor: "pointer" }}>
              ← Edit amounts
            </button>
          </div>

          <p
            className={`je-balance${preview.isBalanced ? "" : " je-unbalanced"}`}
            style={{ marginBottom: "0.75rem" }}
          >
            Debits <strong>{fmtMoney(preview.totalDebits)}</strong>
            {" · "}
            Credits <strong>{fmtMoney(preview.totalCredits)}</strong>
            {" · "}
            {preview.isBalanced ? "Amounts balanced" : "Amounts not balanced"}
          </p>

          {Math.abs(preview.netPayDifference) > 0.02 && (
            <p style={{ color: "#92400e", fontSize: "0.875rem" }}>
              Entered net {fmtMoney(preview.enteredNetPay)} differs from calculated{" "}
              {fmtMoney(preview.expectedNetPay)} by {fmtMoney(preview.netPayDifference)}. That can be
              intentional, but it will still need to balance with the other lines.
            </p>
          )}

          {(preview.hasMissingAccounts || preview.missingAccountKeys?.length > 0) && (
            <p style={{ color: "#b91c1c", fontSize: "0.875rem" }}>
              Missing GL defaults for: {(preview.missingAccountKeys || []).join(", ")}. Amounts may
              still balance — map these accounts under Accounting Setup → Payroll GL Accounts before
              posting.
            </p>
          )}

          <div className="je-table-wrap">
            <table className="je-table">
              <thead>
                <tr>
                  <th>Line</th>
                  <th>Account</th>
                  <th style={{ textAlign: "right" }}>Debit</th>
                  <th style={{ textAlign: "right" }}>Credit</th>
                </tr>
              </thead>
              <tbody>
                {preview.lines.map((line, idx) => (
                  <tr key={`${line.bucketKey}-${idx}`}>
                    <td>{line.label}</td>
                    <td>
                      <span className="je-muted">#{line.accountId}</span>
                      {line.accountDisplay ? (
                        <div>{line.accountDisplay}</div>
                      ) : null}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      {line.debit > 0 ? fmtMoney(line.debit) : "—"}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      {line.credit > 0 ? fmtMoney(line.credit) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="je-line-actions">
            <button
              type="button"
              className="je-submit"
              disabled={
                !(preview.canPost ?? (preview.isBalanced && !(preview.missingAccountKeys?.length > 0))) ||
                posting
              }
              onClick={() => void handlePost()}
            >
              {posting ? "Posting…" : "Post to general ledger"}
            </button>
            <Link to="/accounts/journal-entries" className="je-muted" style={{ fontSize: "0.875rem" }}>
              Prefer raw journal entry instead?
            </Link>
          </div>
        </div>
      )}
    </div>
  );
};

export default ManualPayrollWizard;
