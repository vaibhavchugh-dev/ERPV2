import React, { useCallback, useMemo, useState } from "react";
import { Link, useHistory } from "react-router-dom";
import { toast } from "react-toastify";
import { AccountingService } from "../../Common/Services/AccountingService";
import "./JournalEntries.scss";

type MoneyKey =
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

type Amounts = Record<MoneyKey, number>;

type PreviewLine = {
  bucketKey: string;
  label: string;
  accountId: number;
  accountDisplay?: string | null;
  debit: number;
  credit: number;
};

type PreviewResult = {
  isBalanced: boolean;
  totalDebits: number;
  totalCredits: number;
  missingAccountKeys: string[];
  expectedNetPay: number;
  enteredNetPay: number;
  netPayDifference: number;
  lines: PreviewLine[];
};

const BUCKET_OPTIONS: { value: string; label: string }[] = [
  { value: "ignore", label: "— Ignore —" },
  { value: "grossWages", label: "Gross wages" },
  { value: "federalTax", label: "Federal tax" },
  { value: "stateTax", label: "State tax" },
  { value: "localTax", label: "Local tax" },
  { value: "socialSecurityTax", label: "Social Security" },
  { value: "medicareTax", label: "Medicare" },
  { value: "preTaxDeductions", label: "Pre-tax deductions" },
  { value: "retirementDeductions", label: "Retirement" },
  { value: "postTaxDeductions", label: "Post-tax deductions" },
  { value: "garnishments", label: "Garnishments" },
  { value: "netPay", label: "Net pay" },
  { value: "employerTaxesBenefits", label: "Employer taxes/benefits" },
  { value: "payDate", label: "Pay date" },
  { value: "payPeriodStart", label: "Period start" },
  { value: "payPeriodEnd", label: "Period end" },
  { value: "externalRunId", label: "External run id" },
];

const ymd = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const toYmd = (v?: string | null) => {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v).slice(0, 10);
  return ymd(d);
};

const fmtMoney = (n: number) =>
  (n ?? 0).toLocaleString(undefined, { style: "currency", currency: "USD" });

const emptyAmounts = (): Amounts => ({
  grossWages: 0,
  federalTax: 0,
  stateTax: 0,
  localTax: 0,
  socialSecurityTax: 0,
  medicareTax: 0,
  preTaxDeductions: 0,
  retirementDeductions: 0,
  postTaxDeductions: 0,
  garnishments: 0,
  netPay: 0,
  employerTaxesBenefits: 0,
});

const ImportPayrollWizard: React.FC = () => {
  const history = useHistory();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [csvText, setCsvText] = useState("");
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [amounts, setAmounts] = useState<Amounts>(emptyAmounts());
  const [rowCount, setRowCount] = useState(0);
  const [fileHash, setFileHash] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [providerName, setProviderName] = useState("ADP");
  const [externalRunId, setExternalRunId] = useState("");
  const [payPeriodStart, setPayPeriodStart] = useState("");
  const [payPeriodEnd, setPayPeriodEnd] = useState("");
  const [payDate, setPayDate] = useState(() => ymd(new Date()));
  const [entryDate, setEntryDate] = useState(() => ymd(new Date()));
  const [referenceNumber, setReferenceNumber] = useState("");
  const [description, setDescription] = useState("");
  const [parsing, setParsing] = useState(false);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [posting, setPosting] = useState(false);

  const amountRows = useMemo(
    () => BUCKET_OPTIONS.filter((b) => b.value !== "ignore" && !b.value.startsWith("pay") && b.value !== "externalRunId"),
    []
  );

  const buildBody = useCallback(() => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    return {
      tenantId: storage?.tenantID || 0,
      locationId: storage?.locationID || storage?.defaultLocationId || 0,
      providerName: providerName.trim() || "Import",
      externalRunId: externalRunId.trim() || undefined,
      payPeriodStart: payPeriodStart || undefined,
      payPeriodEnd: payPeriodEnd || undefined,
      payDate: payDate || undefined,
      entryDate: entryDate || payDate || undefined,
      referenceNumber: referenceNumber.trim() || undefined,
      description: description.trim() || undefined,
      ...amounts,
    };
  }, [
    amounts,
    description,
    entryDate,
    externalRunId,
    payDate,
    payPeriodEnd,
    payPeriodStart,
    providerName,
    referenceNumber,
  ]);

  const applyParseResult = (result: any) => {
    setHeaders(result.headers || []);
    setMapping(result.appliedMapping || result.suggestedMapping || {});
    setRowCount(result.rowCount || 0);
    setFileHash(result.fileHash || "");
    setWarnings(result.warnings || []);
    const a = result.amounts || {};
    setAmounts({
      grossWages: a.grossWages || 0,
      federalTax: a.federalTax || 0,
      stateTax: a.stateTax || 0,
      localTax: a.localTax || 0,
      socialSecurityTax: a.socialSecurityTax || 0,
      medicareTax: a.medicareTax || 0,
      preTaxDeductions: a.preTaxDeductions || 0,
      retirementDeductions: a.retirementDeductions || 0,
      postTaxDeductions: a.postTaxDeductions || 0,
      garnishments: a.garnishments || 0,
      netPay: a.netPay || 0,
      employerTaxesBenefits: a.employerTaxesBenefits || 0,
    });
    if (result.payDate) setPayDate(toYmd(result.payDate));
    if (result.payPeriodStart) setPayPeriodStart(toYmd(result.payPeriodStart));
    if (result.payPeriodEnd) setPayPeriodEnd(toYmd(result.payPeriodEnd));
    if (result.entryDate) setEntryDate(toYmd(result.entryDate));
    setExternalRunId(result.defaultExternalRunId || result.externalRunIdFromCsv || "");
    if (!description && fileName) {
      setDescription(`Imported from ${fileName}`);
    }
  };

  const handleFile = async (file: File | null) => {
    if (!file) return;
    setFileName(file.name);
    const text = await file.text();
    setCsvText(text);
    setParsing(true);
    setPreview(null);
    try {
      const result = await AccountingService.ParsePayrollImportCsv({ csvText: text });
      applyParseResult(result);
      setStep(2);
      toast.success(`Parsed ${result.rowCount} row(s) from ${file.name}`);
    } catch (e: any) {
      toast.error(e?.response?.data?.error || e?.message || "Failed to parse CSV.");
    } finally {
      setParsing(false);
    }
  };

  const handleRemap = async () => {
    if (!csvText) return;
    setParsing(true);
    try {
      const result = await AccountingService.ParsePayrollImportCsv({
        csvText,
        columnMapping: mapping,
      });
      applyParseResult(result);
      toast.success("Totals refreshed from mapping.");
    } catch (e: any) {
      toast.error(e?.response?.data?.error || e?.message || "Failed to re-parse CSV.");
    } finally {
      setParsing(false);
    }
  };

  const handlePreview = async () => {
    if (!payDate) {
      toast.error("Pay date is required.");
      return;
    }
    if (!externalRunId.trim()) {
      toast.error("External run id is required (provider id or file hash).");
      return;
    }
    setPreviewing(true);
    setPreview(null);
    try {
      const result = await AccountingService.PreviewImportPayrollJournal(buildBody());
      setPreview(result);
      setStep(3);
      if (result?.missingAccountKeys?.length) {
        toast.warn("Some payroll GL defaults are missing — set them in Accounting Setup.");
      } else if (!result?.isBalanced) {
        toast.warn("Journal is not balanced — adjust amounts or mapping.");
      }
    } catch (e: any) {
      toast.error(e?.response?.data?.error || e?.message || "Preview failed.");
    } finally {
      setPreviewing(false);
    }
  };

  const handlePost = async () => {
    if (!preview?.isBalanced) {
      toast.error("Journal must be balanced before posting.");
      return;
    }
    setPosting(true);
    try {
      const result = await AccountingService.PostImportPayrollJournal(buildBody());
      toast.success(
        result?.alreadyExists
          ? `Already imported (${result?.referenceNumber || "import"}).`
          : `Imported ${result?.referenceNumber || "payroll"}.`
      );
      if (result?.journalEntryId) {
        history.push(`/accounts/journal-entries?id=${result.journalEntryId}`);
      } else {
        history.push("/accounts/payroll");
      }
    } catch (e: any) {
      toast.error(e?.response?.data?.error || e?.message || "Import post failed.");
    } finally {
      setPosting(false);
    }
  };

  const downloadTemplate = () => {
    AccountingService.DownloadPayrollImportTemplate().catch(() => {
      const sample = [
        "Employee,Gross Pay,Federal Tax,State Tax,Local Tax,Social Security,Medicare,Pre-Tax Deductions,Retirement,Post-Tax Deductions,Garnishments,Net Pay,Employer Taxes,Pay Date,Period Start,Period End,Run Id",
        "Jane Doe,5000.00,600.00,200.00,0,310.00,72.50,100.00,250.00,50.00,0,3417.50,450.00,2026-03-20,2026-03-01,2026-03-15,ADP-2026-W12",
      ].join("\r\n");
      const blob = new Blob([sample], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "cimmple-payroll-import-template.csv";
      a.click();
      URL.revokeObjectURL(url);
    });
  };

  return (
    <div className="journal-entries-page">
      <div className="je-header">
        <div>
          <h1>Import payroll journal</h1>
          <p className="je-subtitle">
            Upload a provider CSV (ADP, Gusto, etc.). Map columns → payroll buckets → preview → post
            the same GL journal used by CimmplePay and Manual.
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <button
            type="button"
            className="je-link-btn"
            style={{ background: "#e5e7eb", color: "#111827", border: "none", cursor: "pointer" }}
            onClick={() => void downloadTemplate()}
          >
            Download template
          </button>
          <Link to="/accounts/payroll" className="je-link-btn">
            Payroll Journals
          </Link>
        </div>
      </div>

      {step === 1 && (
        <div className="je-panel">
          <h2>1. Upload CSV</h2>
          <p style={{ color: "#6b7280", fontSize: "0.875rem" }}>
            One header row + employee detail rows (amounts are summed) or a single summary row.
            Recognized headers include Gross Pay, Federal Tax, Net Pay, Employer Taxes, Pay Date, Run Id.
          </p>
          <input
            type="file"
            accept=".csv,text/csv"
            disabled={parsing}
            onChange={(e) => void handleFile(e.target.files?.[0] || null)}
          />
          {parsing ? <p style={{ marginTop: "0.75rem" }}>Parsing…</p> : null}
        </div>
      )}

      {step >= 2 && (
        <>
          <div className="je-panel">
            <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
              <h2 style={{ margin: 0 }}>2. Map columns ({fileName || "CSV"})</h2>
              <button
                type="button"
                onClick={() => {
                  setStep(1);
                  setPreview(null);
                }}
                style={{
                  padding: "0.5rem 0.85rem",
                  borderRadius: "0.375rem",
                  border: "1px solid #d1d5db",
                  background: "#fff",
                  cursor: "pointer",
                }}
              >
                ← New file
              </button>
            </div>
            <p style={{ color: "#6b7280", fontSize: "0.875rem" }}>
              {rowCount} data row(s) · file hash {fileHash ? `${fileHash.slice(0, 12)}…` : "—"}
            </p>
            {warnings.length > 0 && (
              <ul style={{ color: "#92400e", fontSize: "0.875rem" }}>
                {warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            )}
            <div className="je-table-wrap">
              <table className="je-table">
                <thead>
                  <tr>
                    <th>CSV column</th>
                    <th>Maps to</th>
                  </tr>
                </thead>
                <tbody>
                  {headers.map((h) => (
                    <tr key={h}>
                      <td>{h}</td>
                      <td>
                        <select
                          value={mapping[h] || "ignore"}
                          onChange={(e) =>
                            setMapping((prev) => ({ ...prev, [h]: e.target.value }))
                          }
                          style={{
                            padding: "0.4rem 0.5rem",
                            borderRadius: "0.375rem",
                            border: "1px solid #d1d5db",
                            minWidth: "14rem",
                          }}
                        >
                          {BUCKET_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="je-line-actions">
              <button type="button" className="je-add-line" disabled={parsing} onClick={() => void handleRemap()}>
                {parsing ? "Refreshing…" : "Apply mapping & refresh totals"}
              </button>
            </div>
          </div>

          <div className="je-panel">
            <h2>3. Provider &amp; period</h2>
            <div className="je-filters">
              <label>
                Provider
                <input
                  type="text"
                  value={providerName}
                  onChange={(e) => setProviderName(e.target.value)}
                  placeholder="ADP, Gusto, Paychex…"
                  style={{
                    padding: "0.6rem 0.75rem",
                    border: "1px solid #d1d5db",
                    borderRadius: "0.375rem",
                    minWidth: "10rem",
                  }}
                />
              </label>
              <label>
                External run id
                <input
                  type="text"
                  value={externalRunId}
                  onChange={(e) => setExternalRunId(e.target.value)}
                  placeholder="Provider batch id or file hash"
                  style={{
                    padding: "0.6rem 0.75rem",
                    border: "1px solid #d1d5db",
                    borderRadius: "0.375rem",
                    minWidth: "14rem",
                  }}
                />
              </label>
              <label>
                Period start
                <input type="date" value={payPeriodStart} onChange={(e) => setPayPeriodStart(e.target.value)} />
              </label>
              <label>
                Period end
                <input type="date" value={payPeriodEnd} onChange={(e) => setPayPeriodEnd(e.target.value)} />
              </label>
              <label>
                Pay date
                <input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
              </label>
              <label>
                Journal date
                <input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />
              </label>
            </div>
            <label style={{ display: "block", marginTop: "1rem", fontSize: "0.8rem", fontWeight: 500 }}>
              Reference (optional)
              <input
                type="text"
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)}
                style={{
                  display: "block",
                  width: "100%",
                  marginTop: "0.35rem",
                  padding: "0.6rem 0.75rem",
                  border: "1px solid #d1d5db",
                  borderRadius: "0.375rem",
                }}
                placeholder="AUTO: IMPORT-yyyyMMdd"
              />
            </label>
            <label style={{ display: "block", marginTop: "0.75rem", fontSize: "0.8rem", fontWeight: 500 }}>
              Description
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
              />
            </label>
          </div>

          <div className="je-panel">
            <h2>4. Aggregated amounts</h2>
            <p style={{ color: "#6b7280", fontSize: "0.875rem" }}>
              Edit if needed after mapping. Zero amounts are omitted from the journal.
            </p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                gap: "0.85rem",
              }}
            >
              {amountRows.map((f) => (
                <label key={f.value} style={{ fontSize: "0.8rem", fontWeight: 500, color: "#374151" }}>
                  {f.label}
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={amounts[f.value as MoneyKey] || 0}
                    onChange={(e) =>
                      setAmounts((prev) => ({
                        ...prev,
                        [f.value]: Number(e.target.value) || 0,
                      }))
                    }
                    style={{
                      display: "block",
                      width: "100%",
                      marginTop: "0.35rem",
                      padding: "0.55rem 0.65rem",
                      border: "1px solid #d1d5db",
                      borderRadius: "0.375rem",
                    }}
                  />
                </label>
              ))}
            </div>
            <div className="je-line-actions">
              <button type="button" className="je-submit" disabled={previewing} onClick={() => void handlePreview()}>
                {previewing ? "Building preview…" : "Preview journal"}
              </button>
            </div>
          </div>
        </>
      )}

      {step === 3 && preview && (
        <div className="je-panel">
          <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
            <h2 style={{ margin: 0 }}>5. Preview</h2>
            <button
              type="button"
              onClick={() => setStep(2)}
              style={{
                padding: "0.5rem 0.85rem",
                borderRadius: "0.375rem",
                border: "1px solid #d1d5db",
                background: "#fff",
                cursor: "pointer",
              }}
            >
              ← Edit mapping / amounts
            </button>
          </div>
          <p className={`je-balance${preview.isBalanced ? "" : " je-unbalanced"}`}>
            Debits <strong>{fmtMoney(preview.totalDebits)}</strong>
            {" · "}
            Credits <strong>{fmtMoney(preview.totalCredits)}</strong>
            {" · "}
            {preview.isBalanced ? "Balanced" : "Not balanced"}
            {" · "}
            Source Import / {providerName || "Import"}
          </p>
          {preview.missingAccountKeys?.length > 0 && (
            <p style={{ color: "#b91c1c", fontSize: "0.875rem" }}>
              Missing GL defaults: {preview.missingAccountKeys.join(", ")}
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
                      {line.accountDisplay ? <div>{line.accountDisplay}</div> : null}
                    </td>
                    <td style={{ textAlign: "right" }}>{line.debit > 0 ? fmtMoney(line.debit) : "—"}</td>
                    <td style={{ textAlign: "right" }}>{line.credit > 0 ? fmtMoney(line.credit) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="je-line-actions">
            <button
              type="button"
              className="je-submit"
              disabled={!preview.isBalanced || posting || (preview.missingAccountKeys?.length ?? 0) > 0}
              onClick={() => void handlePost()}
            >
              {posting ? "Posting…" : "Post imported journal"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ImportPayrollWizard;
