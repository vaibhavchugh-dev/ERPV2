import React, { useMemo, useState } from "react";
import { useHistory } from "react-router-dom";
import { toast } from "react-toastify";
import {
  faFileAlt,
  faDownload,
  faCalendar,
  faChartBar,
  faChartLine,
  faTable,
  faPlay,
  faExternalLinkAlt,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { AccountingService } from "../../Common/Services/AccountingService";
import { useSiteListFilter } from "../../Common/Hooks/useSiteListFilter";
import ReportDrillDrawer, { DrillTarget } from "./ReportDrillDrawer";
import "./FinancialReports.scss";

interface ReportType {
  id: string;
  name: string;
  description: string;
  icon: any;
  category: string;
  kind: "report" | "link";
  path?: string;
}

const ymdLocal = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const money = (n: unknown) =>
  `$${(Number(n) || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const REPORT_CATALOG: ReportType[] = [
  {
    id: "balance-sheet",
    name: "Balance Sheet",
    description: "Assets, liabilities, and equity as of a date",
    icon: faTable,
    category: "Statements",
    kind: "report",
  },
  {
    id: "trial-balance",
    name: "Trial Balance",
    description: "Debit and credit balances by account",
    icon: faTable,
    category: "Statements",
    kind: "report",
  },
  {
    id: "profit-loss",
    name: "Profit & Loss",
    description: "Revenue and expenses (accrual GL)",
    icon: faChartLine,
    category: "Statements",
    kind: "report",
  },
  {
    id: "cash-flow",
    name: "Cash Flow",
    description: "Direct-method operating, investing, financing",
    icon: faChartLine,
    category: "Statements",
    kind: "report",
  },
  {
    id: "ar-aging",
    name: "AR Aging",
    description: "Open receivables by age bucket",
    icon: faCalendar,
    category: "Receivables & Payables",
    kind: "report",
  },
  {
    id: "customer-statements",
    name: "Customer Statements",
    description: "Invoices and payments by customer",
    icon: faFileAlt,
    category: "Receivables & Payables",
    kind: "report",
  },
  {
    id: "ap-aging",
    name: "AP Aging",
    description: "Open payables by age bucket",
    icon: faCalendar,
    category: "Receivables & Payables",
    kind: "report",
  },
  {
    id: "vendor-analysis",
    name: "Vendor Payment Analysis",
    description: "Vendor payments and open AP",
    icon: faChartBar,
    category: "Receivables & Payables",
    kind: "report",
  },
  {
    id: "general-ledger",
    name: "General Ledger",
    description: "Account activity and running balance",
    icon: faTable,
    category: "Ledgers",
    kind: "link",
    path: "/accounts/general-ledger",
  },
  {
    id: "journal-entries",
    name: "Journal Entries",
    description: "Post and review journals",
    icon: faFileAlt,
    category: "Ledgers",
    kind: "link",
    path: "/accounts/journal-entries",
  },
];

const FinancialReports: React.FC = () => {
  const history = useHistory();
  const { locationIdParam, masterListFilter } = useSiteListFilter();

  const [selectedReport, setSelectedReport] = useState<string>("profit-loss");
  const [dateRange, setDateRange] = useState("This Month");
  const [customStartDate, setCustomStartDate] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return ymdLocal(d);
  });
  const [customEndDate, setCustomEndDate] = useState(() => ymdLocal(new Date()));
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [reportData, setReportData] = useState<any>(null);
  const [loadedReportId, setLoadedReportId] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [drillTarget, setDrillTarget] = useState<DrillTarget | null>(null);

  const categories = useMemo(
    () => Array.from(new Set(REPORT_CATALOG.map((r) => r.category))),
    []
  );

  const selectedMeta = REPORT_CATALOG.find((r) => r.id === selectedReport);
  const isLink = selectedMeta?.kind === "link";
  const hasPreview = !!reportData && loadedReportId === selectedReport && !isLink;

  const buildReportParams = (format: "pdf" | "excel" | "csv") => {
    const base: Record<string, unknown> = {
      dateRange,
      format,
      locationId: locationIdParam,
    };
    if (dateRange === "Custom") {
      base.customStartDate = customStartDate;
      base.customEndDate = customEndDate;
    }
    return base;
  };

  const validateCustomRange = (): boolean => {
    if (dateRange !== "Custom") return true;
    if (!customStartDate || !customEndDate) {
      toast.error("Please choose a start and end date for the custom range.");
      return false;
    }
    if (new Date(customStartDate) > new Date(customEndDate)) {
      toast.error("Custom start date cannot be after the end date.");
      return false;
    }
    return true;
  };

  const selectReport = (reportId: string) => {
    const item = REPORT_CATALOG.find((r) => r.id === reportId);
    if (!item) return;
    if (item.kind === "link" && item.path) {
      history.push(item.path);
      return;
    }
    setSelectedReport(reportId);
    setErrorMessage("");
    setDrillTarget(null);
    // Clear stale preview when switching reports
    if (loadedReportId !== reportId) {
      setReportData(null);
      setLoadedReportId("");
    }
  };

  const resolveDrillRange = (data: any): { startDate: string; endDate: string } => {
    if (data?.periodStart && data?.periodEnd) {
      return { startDate: data.periodStart, endDate: data.periodEnd };
    }
    if (data?.asOfDate) {
      const asOf = String(data.asOfDate);
      const year = asOf.slice(0, 4) || String(new Date().getFullYear());
      return { startDate: `${year}-01-01`, endDate: asOf };
    }
    if (dateRange === "Custom" && customStartDate && customEndDate) {
      return { startDate: customStartDate, endDate: customEndDate };
    }
    const end = ymdLocal(new Date());
    const start = new Date();
    start.setMonth(start.getMonth() - 1);
    start.setDate(1);
    return { startDate: ymdLocal(start), endDate: end };
  };

  const openAccountDrill = (ln: any, data: any) => {
    const accountId = Number(ln?.accountId);
    if (!accountId) return;
    const { startDate, endDate } = resolveDrillRange(data);
    setDrillTarget({
      kind: "account",
      accountId,
      accountCode: ln.accountCode,
      accountName: ln.accountName,
      startDate,
      endDate,
      locationId: locationIdParam || null,
    });
  };

  /** Explicit reportId avoids React setState race (Quick Action / list click). */
  const runReport = async (reportId: string = selectedReport) => {
    const item = REPORT_CATALOG.find((r) => r.id === reportId);
    if (!item) {
      toast.error("Please select a report");
      return;
    }
    if (item.kind === "link" && item.path) {
      history.push(item.path);
      return;
    }
    if (!validateCustomRange()) return;

    setSelectedReport(reportId);
    setLoading(true);
    setErrorMessage("");
    setReportData(null);
    setLoadedReportId("");
    setDrillTarget(null);

    try {
      const data = await AccountingService.GenerateFinancialReport(
        reportId,
        buildReportParams("csv")
      );
      if (!data) {
        setErrorMessage("No data returned for this report.");
        toast.error("No data returned for this report");
        return;
      }
      setReportData(data);
      setLoadedReportId(reportId);
    } catch (error: any) {
      console.error("Error generating report:", error);
      const msg =
        error?.response?.data?.error ||
        error?.message ||
        "Failed to generate report";
      setErrorMessage(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const exportReport = async (format: "pdf" | "excel" | "csv") => {
    if (!selectedReport || isLink) return;
    if (!validateCustomRange()) return;
    setExporting(true);
    try {
      const { blob, fileName } = await AccountingService.DownloadFinancialReport(
        selectedReport,
        buildReportParams(format)
      );
      if (blob.type && blob.type.includes("application/json")) {
        const text = await blob.text();
        try {
          const err = JSON.parse(text);
          toast.error(err.error || "Failed to export report");
        } catch {
          toast.error("Failed to export report");
        }
        return;
      }
      const url = window.URL.createObjectURL(blob);
      const link = window.document.createElement("a");
      link.href = url;
      link.download = fileName;
      window.document.body.appendChild(link);
      link.click();
      window.document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success(
        format === "pdf"
          ? "Downloaded as PDF"
          : format === "excel"
            ? "Downloaded as CSV (Excel-compatible)"
            : "Downloaded as CSV"
      );
    } catch (error: any) {
      console.error("Export failed:", error);
      if (reportData && format !== "pdf") {
        const name = selectedMeta?.name || "Report";
        const fileName = `${name}_${dateRange.replace(/\s+/g, "_")}_${ymdLocal(new Date())}.csv`;
        const csv = convertToCSV(reportData);
        const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
        const url = window.URL.createObjectURL(blob);
        const link = window.document.createElement("a");
        link.href = url;
        link.download = fileName;
        window.document.body.appendChild(link);
        link.click();
        window.document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
        toast.success(
          format === "excel"
            ? "Downloaded as CSV (Excel-compatible)"
            : "Downloaded as CSV"
        );
        return;
      }
      toast.error(
        error?.response?.data?.error || error?.message || "Failed to export report"
      );
    } finally {
      setExporting(false);
    }
  };

  const periodLabel = () => {
    if (dateRange === "Custom") return `${customStartDate} → ${customEndDate}`;
    return dateRange;
  };

  return (
    <div className="financial-reports">
      <header className="fr-page-header">
        <div>
          <h1>Financial Reports</h1>
          <p>Select a report, set the period, then run to preview. Export when ready.</p>
        </div>
      </header>

      <div className="fr-workspace">
        {/* Catalog */}
        <aside className="fr-catalog" aria-label="Report catalog">
          {categories.map((category) => (
            <div key={category} className="fr-catalog-group">
              <div className="fr-catalog-heading">{category}</div>
              <ul className="fr-catalog-list">
                {REPORT_CATALOG.filter((r) => r.category === category).map((report) => {
                  const active = selectedReport === report.id;
                  return (
                    <li key={report.id}>
                      <button
                        type="button"
                        className={`fr-catalog-item ${active ? "active" : ""} ${report.kind === "link" ? "is-link" : ""}`}
                        onClick={() => selectReport(report.id)}
                      >
                        <FontAwesomeIcon icon={report.icon} className="fr-catalog-icon" />
                        <span className="fr-catalog-text">
                          <span className="fr-catalog-name">
                            {report.name}
                            {report.kind === "link" && (
                              <FontAwesomeIcon
                                icon={faExternalLinkAlt}
                                className="fr-link-glyph"
                              />
                            )}
                          </span>
                          <span className="fr-catalog-desc">{report.description}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </aside>

        {/* Main */}
        <section className="fr-main">
          <div className="fr-criteria">
            <div className="fr-criteria-top">
              <div className="fr-criteria-title">
                <h2>{selectedMeta?.name || "Select a report"}</h2>
                {selectedMeta && <p>{selectedMeta.description}</p>}
              </div>

              {!isLink && (
                <div className="fr-actions">
                  <button
                    type="button"
                    className="fr-btn fr-btn-primary"
                    disabled={loading || !selectedReport}
                    onClick={() => runReport(selectedReport)}
                  >
                    <FontAwesomeIcon icon={faPlay} />
                    {loading ? "Running…" : "Run report"}
                  </button>
                  <div className="fr-export-group" role="group" aria-label="Export">
                    <button
                      type="button"
                      className="fr-btn fr-btn-secondary"
                      disabled={exporting || loading || !selectedReport}
                      onClick={() => exportReport("pdf")}
                      title="Export PDF"
                    >
                      <FontAwesomeIcon icon={faDownload} />
                      PDF
                    </button>
                    <button
                      type="button"
                      className="fr-btn fr-btn-secondary"
                      disabled={exporting || loading || !selectedReport}
                      onClick={() => exportReport("csv")}
                      title="Export CSV"
                    >
                      CSV
                    </button>
                  </div>
                </div>
              )}

              {isLink && selectedMeta?.path && (
                <div className="fr-actions">
                  <button
                    type="button"
                    className="fr-btn fr-btn-primary"
                    onClick={() => history.push(selectedMeta.path!)}
                  >
                    <FontAwesomeIcon icon={faExternalLinkAlt} />
                    Open {selectedMeta.name}
                  </button>
                </div>
              )}
            </div>

            {!isLink && (
              <div className="fr-criteria-filters">
                <div className="fr-field">
                  <label htmlFor="fr-period">Period</label>
                  <select
                    id="fr-period"
                    value={dateRange}
                    onChange={(e) => {
                      setDateRange(e.target.value);
                      setReportData(null);
                      setLoadedReportId("");
                      setDrillTarget(null);
                    }}
                  >
                    <option value="This Month">This Month</option>
                    <option value="Last Month">Last Month</option>
                    <option value="This Quarter">This Quarter</option>
                    <option value="Last Quarter">Last Quarter</option>
                    <option value="This Year">This Year</option>
                    <option value="Last Year">Last Year</option>
                    <option value="Custom">Custom Range</option>
                  </select>
                </div>

                <div className="fr-field">
                  <label htmlFor="fr-site">{masterListFilter.label}</label>
                  <select
                    id="fr-site"
                    value={masterListFilter.value}
                    onChange={(e) => {
                      masterListFilter.onChange(e.target.value);
                      setReportData(null);
                      setLoadedReportId("");
                      setDrillTarget(null);
                    }}
                  >
                    {masterListFilter.options.map((option) => (
                      <option key={option.value || "all"} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                {dateRange === "Custom" && (
                  <>
                    <div className="fr-field">
                      <label htmlFor="fr-start">Start</label>
                      <input
                        id="fr-start"
                        type="date"
                        value={customStartDate}
                        onChange={(e) => {
                          setCustomStartDate(e.target.value);
                          setReportData(null);
                          setLoadedReportId("");
                          setDrillTarget(null);
                        }}
                      />
                    </div>
                    <div className="fr-field">
                      <label htmlFor="fr-end">End</label>
                      <input
                        id="fr-end"
                        type="date"
                        value={customEndDate}
                        onChange={(e) => {
                          setCustomEndDate(e.target.value);
                          setReportData(null);
                          setLoadedReportId("");
                          setDrillTarget(null);
                        }}
                      />
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="fr-preview" aria-live="polite">
            {loading && (
              <div className="fr-state">
                <div className="fr-spinner" aria-hidden />
                <h3>Running {selectedMeta?.name}…</h3>
                <p>This can take a moment for large ledgers.</p>
              </div>
            )}

            {!loading && errorMessage && (
              <div className="fr-state fr-state-error">
                <h3>Could not load report</h3>
                <p>{errorMessage}</p>
                <button
                  type="button"
                  className="fr-btn fr-btn-primary"
                  onClick={() => runReport(selectedReport)}
                >
                  Try again
                </button>
              </div>
            )}

            {!loading && !errorMessage && !hasPreview && !isLink && (
              <div className="fr-state">
                <h3>Ready to run</h3>
                <p>
                  Period: <strong>{periodLabel()}</strong>
                  {masterListFilter.value
                    ? ` · Site filter applied`
                    : " · All sites"}
                </p>
                <button
                  type="button"
                  className="fr-btn fr-btn-primary"
                  onClick={() => runReport(selectedReport)}
                >
                  <FontAwesomeIcon icon={faPlay} />
                  Run {selectedMeta?.name}
                </button>
              </div>
            )}

            {!loading && !errorMessage && isLink && (
              <div className="fr-state">
                <h3>{selectedMeta?.name}</h3>
                <p>{selectedMeta?.description}. This opens a dedicated ledger screen.</p>
              </div>
            )}

            {!loading && !errorMessage && hasPreview && (
              <div className="fr-preview-body">
                <div className="fr-preview-meta">
                  <span>
                    {reportData.asOfDate && `As of ${reportData.asOfDate}`}
                    {reportData.periodStart &&
                      reportData.periodEnd &&
                      `Period ${reportData.periodStart} to ${reportData.periodEnd}`}
                  </span>
                  <span className="fr-muted">
                    Click a row to drill down (accounts, aging, cash flow, statements, vendors).
                  </span>
                </div>
                <ReportBody
                  data={reportData}
                  onAccountClick={(ln) => openAccountDrill(ln, reportData)}
                  onAgingClick={(bucket) =>
                    setDrillTarget({
                      kind: "aging",
                      bucket: bucket.bucket || "",
                      invoices: bucket.invoices || [],
                      isAp: loadedReportId === "ap-aging",
                    })
                  }
                  onCashFlowClick={(line) =>
                    setDrillTarget({ kind: "cashflow", line })
                  }
                  onStatementLineClick={(line, customerName) =>
                    setDrillTarget({
                      kind: "statement-line",
                      customerName,
                      line,
                    })
                  }
                  onVendorClick={(vendor) =>
                    setDrillTarget({ kind: "vendor", vendor })
                  }
                />
              </div>
            )}

            <ReportDrillDrawer
              target={drillTarget}
              onClose={() => setDrillTarget(null)}
            />
          </div>
        </section>
      </div>
    </div>
  );
};

function ReportBody({
  data,
  onAccountClick,
  onAgingClick,
  onCashFlowClick,
  onStatementLineClick,
  onVendorClick,
}: {
  data: any;
  onAccountClick: (ln: any) => void;
  onAgingClick: (bucket: any) => void;
  onCashFlowClick: (line: any) => void;
  onStatementLineClick: (line: any, customerName?: string) => void;
  onVendorClick: (vendor: any) => void;
}) {
  if (!data) return null;

  return (
    <>
      {data.summaryNote && (
        <p className="fr-note">{data.summaryNote}</p>
      )}

      {data.assets && (
        <div className="fr-block">
          <h3>Assets</h3>
          {(
            [
              {
                title: "Current Assets",
                lines: data.assets.currentAssetLines,
                total: data.assets.currentAssets,
              },
              {
                title: "Fixed Assets",
                lines: data.assets.fixedAssetLines,
                total: data.assets.fixedAssets,
              },
            ] as const
          ).map((sec) => (
            <SectionTable
              key={sec.title}
              title={sec.title}
              lines={sec.lines}
              amountKey="balance"
              subtotal={sec.total}
              onAccountClick={onAccountClick}
            />
          ))}
          <TotalsRow label="Total Assets" value={data.assets.totalAssets} strong />
        </div>
      )}

      {data.liabilitiesAndEquity && (
        <div className="fr-block">
          <h3>Liabilities and Equity</h3>
          {(
            [
              {
                title: "Current Liabilities",
                lines: data.liabilitiesAndEquity.currentLiabilityLines,
                total: data.liabilitiesAndEquity.currentLiabilities,
              },
              {
                title: "Long Term Liabilities",
                lines: data.liabilitiesAndEquity.longTermLiabilityLines,
                total: data.liabilitiesAndEquity.longTermLiabilities,
              },
              {
                title: "Equity",
                lines: data.liabilitiesAndEquity.equityLines,
                total: data.liabilitiesAndEquity.equity,
              },
            ] as const
          ).map((sec) => (
            <SectionTable
              key={sec.title}
              title={sec.title}
              lines={sec.lines}
              amountKey="balance"
              subtotal={sec.total}
              onAccountClick={onAccountClick}
            />
          ))}
          <TotalsRow
            label="Total Liabilities and Equity"
            value={data.liabilitiesAndEquity.totalLiabilitiesAndEquity}
            strong
          />
        </div>
      )}

      {data.reportBasis === "accrual-gl" && Array.isArray(data.sections) && (
        <div className="fr-block">
          <h3>Profit &amp; Loss (accrual)</h3>
          <p className="fr-muted">
            Based on posted journal entries.
            {typeof data.journalEntryCount === "number" && (
              <> Journal headers in period: <strong>{data.journalEntryCount}</strong>.</>
            )}
          </p>
          {data.sections.map((sec: any) => {
            const hasLines = Array.isArray(sec.lines) && sec.lines.length > 0;
            const hasAmt = Math.abs(Number(sec.subtotal) || 0) > 0.0001;
            if (!hasLines && !hasAmt) return null;
            return (
              <SectionTable
                key={sec.sectionId || sec.title}
                title={sec.title}
                lines={sec.lines}
                amountKey="amount"
                codeKey="accountCode"
                nameKey="accountName"
                subtotal={sec.subtotal}
                onAccountClick={onAccountClick}
              />
            );
          })}
          <TotalsRow label="Gross profit" value={data.grossProfit} />
          <TotalsRow label="Operating income" value={data.operatingIncome} />
          <TotalsRow label="Income before tax" value={data.incomeBeforeTax} />
          <TotalsRow label="Net income" value={data.netIncome} strong />
        </div>
      )}

      {data.reportBasis === "direct-cash" && Array.isArray(data.sections) && (
        <div className="fr-block">
          <h3>Cash Flow (direct)</h3>
          {data.sections.map((sec: any) => {
            const hasLines = Array.isArray(sec.lines) && sec.lines.length > 0;
            const hasAmt = Math.abs(Number(sec.subtotal) || 0) > 0.0001;
            if (!hasLines && !hasAmt) return null;
            return (
              <div key={sec.sectionId || sec.title} className="fr-section">
                <h4>{sec.title}</h4>
                {hasLines && (
                  <table className="fr-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Description</th>
                        <th className="num">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sec.lines.map((ln: any, i: number) => (
                        <tr
                          key={i}
                          className="fr-row-click"
                          onClick={() => onCashFlowClick(ln)}
                          title="View payment / invoice links"
                        >
                          <td>{ln.date || ""}</td>
                          <td>
                            <span className="fr-drillable">
                              {ln.description || ln.category || ""}
                            </span>
                          </td>
                          <td className="num">{money(ln.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                <TotalsRow label={`Subtotal — ${sec.title}`} value={sec.subtotal} />
              </div>
            );
          })}
          <TotalsRow label="Net Cash Flow" value={data.netCashFlow} strong />
        </div>
      )}

      {data.agingBuckets && (
        <div className="fr-block">
          <h3>Aging</h3>
          <table className="fr-table">
            <thead>
              <tr>
                <th>Bucket</th>
                <th className="num">Amount</th>
                <th className="num">%</th>
              </tr>
            </thead>
            <tbody>
              {Array.isArray(data.agingBuckets) &&
                data.agingBuckets.map((bucket: any, index: number) => (
                  <tr
                    key={index}
                    className="fr-row-click"
                    onClick={() => onAgingClick(bucket)}
                    title="View invoices in this bucket"
                  >
                    <td>
                      <span className="fr-drillable">{bucket.bucket || ""}</span>
                    </td>
                    <td className="num">{money(bucket.amount)}</td>
                    <td className="num">
                      {(Number(bucket.percentage) || 0).toFixed(1)}%
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {data.accounts && (
        <div className="fr-block">
          <h3>Trial Balance</h3>
          {!data.isBalanced && (
            <p className="fr-note fr-note-danger">
              Trial balance is not balanced — total debits and credits differ.
            </p>
          )}
          <table className="fr-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Account</th>
                <th>Type</th>
                <th className="num">Debit</th>
                <th className="num">Credit</th>
              </tr>
            </thead>
            <tbody>
              {Array.isArray(data.accounts) &&
                data.accounts.map((account: any, index: number) => {
                  const clickable = Number(account.accountId) > 0;
                  return (
                    <tr
                      key={index}
                      className={clickable ? "fr-row-click" : undefined}
                      onClick={
                        clickable ? () => onAccountClick(account) : undefined
                      }
                      title={clickable ? "View general ledger activity" : undefined}
                    >
                      <td className="mono">
                        {clickable ? (
                          <span className="fr-drillable">{account.accountCode || ""}</span>
                        ) : (
                          account.accountCode || ""
                        )}
                      </td>
                      <td>{account.accountName || ""}</td>
                      <td>{account.accountType || ""}</td>
                      <td className="num">
                        {money(
                          account.debit ??
                            (account.balance > 0 ? account.balance : 0)
                        )}
                      </td>
                      <td className="num">
                        {money(
                          account.credit ??
                            (account.balance < 0 ? Math.abs(account.balance) : 0)
                        )}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
          <TotalsRow label="Total Debits" value={data.totalDebits} />
          <TotalsRow label="Total Credits" value={data.totalCredits} />
          <TotalsRow
            label="Balanced"
            value={data.isBalanced ? "Yes" : "No"}
            strong
            raw
          />
        </div>
      )}

      {Array.isArray(data.statements) && (
        <div className="fr-block">
          <h3>Customer Statements</h3>
          {data.statements.map((st: any) => (
            <div key={st.customerId} className="fr-section">
              <h4>
                {st.customerName}
                {st.customerCode ? ` (${st.customerCode})` : ""}
              </h4>
              <TotalsRow label="Opening Balance" value={st.openingBalance} />
              {Array.isArray(st.activity) && st.activity.length > 0 && (
                <table className="fr-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Type</th>
                      <th>Ref</th>
                      <th className="num">Charges</th>
                      <th className="num">Payments</th>
                      <th className="num">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {st.activity.map((ln: any, i: number) => (
                      <tr
                        key={i}
                        className="fr-row-click"
                        onClick={() =>
                          onStatementLineClick(ln, st.customerName)
                        }
                        title="View invoice / payment details"
                      >
                        <td>{ln.date}</td>
                        <td>
                          <span className="fr-drillable">{ln.type}</span>
                        </td>
                        <td>{ln.reference}</td>
                        <td className="num">{money(ln.charges)}</td>
                        <td className="num">{money(ln.payments)}</td>
                        <td className="num">{money(ln.balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <TotalsRow label="Closing Balance" value={st.closingBalance} strong />
            </div>
          ))}
        </div>
      )}

      {Array.isArray(data.vendors) && (
        <div className="fr-block">
          <h3>Vendor Payment Analysis</h3>
          <table className="fr-table">
            <thead>
              <tr>
                <th>Vendor</th>
                <th className="num">Payments</th>
                <th className="num">Count</th>
                <th className="num">Open AP</th>
              </tr>
            </thead>
            <tbody>
              {data.vendors.map((v: any, i: number) => (
                <tr
                  key={i}
                  className="fr-row-click"
                  onClick={() => onVendorClick(v)}
                  title="View payments and open AP"
                >
                  <td>
                    <span className="fr-drillable">
                      {v.vendorName}
                      {v.vendorCode ? ` (${v.vendorCode})` : ""}
                    </span>
                  </td>
                  <td className="num">{money(v.paymentsInPeriod)}</td>
                  <td className="num">{v.paymentCount || 0}</td>
                  <td className="num">{money(v.openApBalance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <TotalsRow label="Total Payments" value={data.totalPaymentsInPeriod} strong />
          <TotalsRow label="Total Open AP" value={data.totalOpenAp} strong />
        </div>
      )}
    </>
  );
}

function SectionTable({
  title,
  lines,
  amountKey,
  codeKey = "accountCode",
  nameKey = "accountName",
  subtotal,
  onAccountClick,
}: {
  title: string;
  lines: any;
  amountKey: string;
  codeKey?: string;
  nameKey?: string;
  subtotal: unknown;
  onAccountClick?: (ln: any) => void;
}) {
  const hasLines = Array.isArray(lines) && lines.length > 0;
  return (
    <div className="fr-section">
      <h4>{title}</h4>
      {hasLines && (
        <table className="fr-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Account</th>
              <th className="num">Amount</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((ln: any, i: number) => {
              const clickable =
                !!onAccountClick && Number(ln.accountId) > 0;
              return (
                <tr
                  key={i}
                  className={clickable ? "fr-row-click" : undefined}
                  onClick={clickable ? () => onAccountClick!(ln) : undefined}
                  title={clickable ? "View general ledger activity" : undefined}
                >
                  <td className="mono">
                    {clickable ? (
                      <span className="fr-drillable">{ln[codeKey] || ""}</span>
                    ) : (
                      ln[codeKey] || ""
                    )}
                  </td>
                  <td>{ln[nameKey] || ""}</td>
                  <td className="num">{money(ln[amountKey])}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <TotalsRow label={`Subtotal — ${title}`} value={subtotal} />
    </div>
  );
}

function TotalsRow({
  label,
  value,
  strong,
  raw,
}: {
  label: string;
  value: unknown;
  strong?: boolean;
  raw?: boolean;
}) {
  return (
    <div className={`fr-totals-row ${strong ? "strong" : ""}`}>
      <span>{label}</span>
      <span className="num">{raw ? String(value) : money(value)}</span>
    </div>
  );
}

function convertToCSV(data: any): string {
  if (!data) return "";
  const rows: string[] = [];
  if (data.reportType) rows.push(`Report Type: ${data.reportType}`);
  if (data.asOfDate) rows.push(`As Of Date: ${data.asOfDate}`);
  if (data.periodStart && data.periodEnd) {
    rows.push(`Period: ${data.periodStart} to ${data.periodEnd}`);
  }
  rows.push("");
  if (data.assets) {
    rows.push("Assets");
    rows.push(`Current Assets,${data.assets.currentAssets || 0}`);
    rows.push(`Fixed Assets,${data.assets.fixedAssets || 0}`);
    rows.push(`Total Assets,${data.assets.totalAssets || 0}`);
    rows.push("");
  }
  if (data.liabilitiesAndEquity) {
    rows.push("Liabilities and Equity");
    rows.push(`Equity,${data.liabilitiesAndEquity.equity || 0}`);
    rows.push(
      `Total Liabilities and Equity,${data.liabilitiesAndEquity.totalLiabilitiesAndEquity || 0}`
    );
    rows.push("");
  }
  if (data.reportBasis === "accrual-gl" && Array.isArray(data.sections)) {
    rows.push(`Net income,${data.netIncome ?? 0}`);
  }
  if (data.reportBasis === "direct-cash") {
    rows.push(`Net Cash Flow,${data.netCashFlow ?? 0}`);
  }
  if (data.accounts) {
    rows.push("Account Code,Account Name,Debit,Credit");
    (data.accounts || []).forEach((a: any) => {
      rows.push(
        `${a.accountCode || ""},${a.accountName || ""},${a.debit || 0},${a.credit || 0}`
      );
    });
  }
  if (data.agingBuckets) {
    rows.push("Bucket,Amount,Percentage");
    (data.agingBuckets || []).forEach((b: any) => {
      rows.push(`${b.bucket || ""},${b.amount || 0},${b.percentage || 0}`);
    });
  }
  return rows.join("\n");
}

export default FinancialReports;
