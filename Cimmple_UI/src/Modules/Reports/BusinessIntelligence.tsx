import React, { useMemo, useState } from "react";
import { useHistory } from "react-router-dom";
import { toast } from "react-toastify";
import {
  faChartLine,
  faChartBar,
  faChartPie,
  faUsers,
  faBox,
  faTruck,
  faShieldAlt,
  faFileInvoice,
  faDollarSign,
  faWarehouse,
  faBriefcase,
  faCalendar,
  faTable,
  faDownload,
  faPlay,
  faExternalLinkAlt,
  faChartArea,
  faDesktop,
  faCog,
  faMapMarkerAlt,
  faClock,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useSiteListFilter } from "../../Common/Hooks/useSiteListFilter";
import { ReportsService } from "../../Common/Services/ReportsService";
import ScheduleReportDialog from "../../Common/Components/ScheduleReportDialog";
import OperationalReportDrillDrawer, {
  OperationalDrillMeta,
} from "./OperationalReportDrillDrawer";
import "./BusinessIntelligence.scss";

interface ReportType {
  id: string;
  name: string;
  description: string;
  icon: any;
  category: string;
  kind: "report" | "link";
  path?: string;
}

interface ReportSummaryItem {
  label: string;
  value: string | number;
  warn?: boolean;
}

interface ReportSection {
  title: string;
  columns: string[];
  numericFlags?: boolean[];
  rows: string[][];
  rowMeta?: Array<OperationalDrillMeta | null | undefined>;
}

const ymdLocal = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const REPORT_CATALOG: ReportType[] = [
  {
    id: "sales-performance",
    name: "Sales Performance by Customer",
    description: "Analyze sales trends and performance metrics by customer",
    icon: faUsers,
    category: "Sales & Revenue",
    kind: "report",
  },
  {
    id: "sales-trends",
    name: "Sales Trends Over Time",
    description: "View sales trends and patterns across different time periods",
    icon: faChartLine,
    category: "Sales & Revenue",
    kind: "report",
  },
  {
    id: "product-revenue",
    name: "Product/Service Revenue Analysis",
    description: "Breakdown of revenue by product or service category",
    icon: faBox,
    category: "Sales & Revenue",
    kind: "report",
  },
  {
    id: "quotation-conversion",
    name: "Quotation-to-Order Conversion",
    description: "Track conversion rates from quotations to actual orders",
    icon: faChartBar,
    category: "Sales & Revenue",
    kind: "report",
  },
  {
    id: "revenue-by-location",
    name: "Revenue by Location/Region",
    description: "Geographic analysis of revenue distribution",
    icon: faMapMarkerAlt,
    category: "Sales & Revenue",
    kind: "report",
  },
  {
    id: "job-status-dashboard",
    name: "Job Order Status Dashboard",
    description: "Real-time view of all job orders and their current status",
    icon: faBriefcase,
    category: "Operations",
    kind: "report",
  },
  {
    id: "job-completion-time",
    name: "Job Completion Time Analysis",
    description: "Analyze average completion times and identify bottlenecks",
    icon: faCalendar,
    category: "Operations",
    kind: "report",
  },
  {
    id: "on-time-delivery",
    name: "On-Time Delivery Performance",
    description: "Track delivery performance and identify improvement areas",
    icon: faTruck,
    category: "Operations",
    kind: "report",
  },
  {
    id: "production-efficiency",
    name: "Production Efficiency Metrics",
    description: "Measure production efficiency and throughput",
    icon: faChartArea,
    category: "Operations",
    kind: "report",
  },
  {
    id: "workstation-utilization",
    name: "Workstation Utilization",
    description: "Monitor workstation usage and capacity planning",
    icon: faDesktop,
    category: "Operations",
    kind: "report",
  },
  {
    id: "process-performance",
    name: "Process Performance Analysis",
    description: "Analyze performance metrics across different processes",
    icon: faCog,
    category: "Operations",
    kind: "report",
  },
  {
    id: "vendor-performance",
    name: "Vendor Performance Scorecard",
    description: "Comprehensive vendor performance metrics and ratings",
    icon: faChartBar,
    category: "Purchasing & Vendors",
    kind: "report",
  },
  {
    id: "purchase-trends",
    name: "Purchase Order Trends",
    description: "Track purchasing patterns and trends over time",
    icon: faChartLine,
    category: "Purchasing & Vendors",
    kind: "report",
  },
  {
    id: "vendor-cost-analysis",
    name: "Vendor Cost Analysis",
    description: "Compare costs across vendors and identify savings opportunities",
    icon: faDollarSign,
    category: "Purchasing & Vendors",
    kind: "report",
  },
  {
    id: "material-cost-trends",
    name: "Material Cost Trends",
    description: "Monitor material cost changes and inflation impact",
    icon: faChartPie,
    category: "Purchasing & Vendors",
    kind: "report",
  },
  {
    id: "vendor-delivery",
    name: "Vendor Delivery Performance",
    description: "Track vendor on-time delivery rates and reliability",
    icon: faTruck,
    category: "Purchasing & Vendors",
    kind: "report",
  },
  {
    id: "inventory-valuation",
    name: "Inventory Valuation Report",
    description: "Current inventory value and valuation methods",
    icon: faWarehouse,
    category: "Inventory & Materials",
    kind: "report",
  },
  {
    id: "stock-movement",
    name: "Stock Movement Analysis",
    description: "Track inventory movements and turnover rates",
    icon: faBox,
    category: "Inventory & Materials",
    kind: "report",
  },
  {
    id: "material-usage",
    name: "Material Usage Trends",
    description: "Analyze material consumption patterns",
    icon: faChartLine,
    category: "Inventory & Materials",
    kind: "report",
  },
  {
    id: "inventory-turnover",
    name: "Inventory Turnover Analysis",
    description: "Measure how quickly inventory is sold and replaced",
    icon: faChartBar,
    category: "Inventory & Materials",
    kind: "report",
  },
  {
    id: "ncr-trends",
    name: "NCR Trends Over Time",
    description: "Track non-conformance reports and quality issues",
    icon: faShieldAlt,
    category: "Quality Metrics",
    kind: "report",
  },
  {
    id: "defect-rate",
    name: "Defect Rate by Process",
    description: "Identify processes with highest defect rates",
    icon: faChartPie,
    category: "Quality Metrics",
    kind: "report",
  },
  {
    id: "quality-cost",
    name: "Quality Cost Analysis",
    description: "Measure cost of quality including prevention and failure costs",
    icon: faDollarSign,
    category: "Quality Metrics",
    kind: "report",
  },
  {
    id: "root-cause-analysis",
    name: "Root Cause Analysis Summary",
    description: "Summary of root causes identified in quality issues",
    icon: faTable,
    category: "Quality Metrics",
    kind: "report",
  },
  {
    id: "customer-profitability",
    name: "Customer Profitability Analysis",
    description: "Identify most and least profitable customers",
    icon: faUsers,
    category: "Customer Analytics",
    kind: "report",
  },
  {
    id: "customer-lifetime-value",
    name: "Customer Lifetime Value",
    description: "Calculate and track customer lifetime value metrics",
    icon: faChartLine,
    category: "Customer Analytics",
    kind: "report",
  },
  {
    id: "customer-order-history",
    name: "Customer Order History Trends",
    description: "Analyze customer ordering patterns and frequency",
    icon: faFileInvoice,
    category: "Customer Analytics",
    kind: "report",
  },
  {
    id: "top-customers",
    name: "Top Customers by Revenue",
    description: "Rank customers by total revenue contribution",
    icon: faChartBar,
    category: "Customer Analytics",
    kind: "report",
  },
  {
    id: "customer-payment-behavior",
    name: "Customer Payment Behavior",
    description: "Analyze payment patterns and credit risk",
    icon: faDollarSign,
    category: "Customer Analytics",
    kind: "report",
  },
  {
    id: "financial-reports",
    name: "Financial Reports",
    description: "Balance sheet, P&L, cash flow, AR/AP aging, and more",
    icon: faFileInvoice,
    category: "Financial",
    kind: "link",
    path: "/accounts/reports",
  },
];

const convertReportToCsv = (data: any): string => {
  const lines: string[] = [];
  const esc = (v: unknown) => {
    const s = String(v ?? "");
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  lines.push(`Report Type,${esc(data?.reportType || "Report")}`);
  if (data?.periodStart) {
    lines.push(`Period,${esc(data.periodStart)} to ${esc(data.periodEnd || "")}`);
  }
  if (data?.locationId != null && data.locationId !== "") {
    lines.push(`Location,${esc(data.locationId)}`);
  }
  lines.push("");

  const summary: ReportSummaryItem[] = Array.isArray(data?.summary) ? data.summary : [];
  if (summary.length > 0) {
    lines.push("Summary");
    lines.push("Label,Value");
    summary.forEach((item) => {
      lines.push(`${esc(item.label)},${esc(item.value)}`);
    });
    lines.push("");
  }

  if (data?.summaryNote) {
    lines.push(`Note,${esc(data.summaryNote)}`);
    lines.push("");
  }

  const sections: ReportSection[] = Array.isArray(data?.sections) ? data.sections : [];
  sections.forEach((section) => {
    if (section.title) {
      lines.push(esc(section.title));
    }
    const columns = Array.isArray(section.columns) ? section.columns : [];
    if (columns.length > 0) {
      lines.push(columns.map(esc).join(","));
    }
    const rows = Array.isArray(section.rows) ? section.rows : [];
    rows.forEach((row) => {
      lines.push((row || []).map(esc).join(","));
    });
    lines.push("");
  });

  return lines.join("\n");
};

const DRILLABLE_REPORTS = new Set([
  "job-status-dashboard",
  "sales-performance",
  "sales-trends",
  "revenue-by-location",
  "top-customers",
  "customer-profitability",
  "customer-lifetime-value",
  "customer-payment-behavior",
  "job-completion-time",
  "vendor-performance",
  "ncr-trends",
  "defect-rate",
  "on-time-delivery",
  "customer-order-history",
  "purchase-trends",
  "vendor-delivery",
  "vendor-cost-analysis",
  "inventory-valuation",
  "stock-movement",
  "quotation-conversion",
]);

const GenericReportBody: React.FC<{
  data: any;
  reportId?: string;
  siteScopeLabel?: string;
  onRowDrill?: (meta: OperationalDrillMeta) => void;
}> = ({ data, reportId, siteScopeLabel, onRowDrill }) => {
  const summary: ReportSummaryItem[] = Array.isArray(data?.summary) ? data.summary : [];
  const sections: ReportSection[] = Array.isArray(data?.sections) ? data.sections : [];
  const canDrill = !!reportId && DRILLABLE_REPORTS.has(reportId) && !!onRowDrill;
  const siteLabel =
    siteScopeLabel ||
    (data?.locationId ? `Site #${data.locationId}` : "All sites");

  return (
    <div className="rpt-preview-body">
      <div className="rpt-preview-meta">
        <span>
          Period: {data?.periodStart} → {data?.periodEnd}
          {` · ${siteLabel}`}
        </span>
        {canDrill && (
          <span className="rpt-muted">
            Click a highlighted row to drill down.
          </span>
        )}
      </div>

      {summary.length > 0 && (
        <div className="rpt-summary-strip">
          {summary.map((item, idx) => (
            <div className="rpt-summary-stat" key={`${item.label}-${idx}`}>
              <span className="rpt-summary-label">{item.label}</span>
              <span
                className={`rpt-summary-value${item.warn ? " rpt-summary-warn" : ""}`}
              >
                {item.value}
              </span>
            </div>
          ))}
        </div>
      )}

      {data?.summaryNote && <p className="rpt-muted">{data.summaryNote}</p>}

      {sections.map((section, sIdx) => {
        const columns = Array.isArray(section.columns) ? section.columns : [];
        const rows = Array.isArray(section.rows) ? section.rows : [];
        const numericFlags = Array.isArray(section.numericFlags)
          ? section.numericFlags
          : [];
        const rowMeta = Array.isArray(section.rowMeta) ? section.rowMeta : [];

        return (
          <div className="rpt-block" key={`${section.title || "section"}-${sIdx}`}>
            {section.title && <h3>{section.title}</h3>}
            <div className="rpt-table-scroll">
              <table className="rpt-table">
                <thead>
                  <tr>
                    {columns.map((col, cIdx) => (
                      <th
                        key={`${col}-${cIdx}`}
                        className={numericFlags[cIdx] ? "num" : undefined}
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, rIdx) => {
                    const meta = rowMeta[rIdx] || null;
                    const clickable = canDrill && !!meta;
                    return (
                      <tr
                        key={rIdx}
                        className={clickable ? "rpt-row-click" : undefined}
                        onClick={
                          clickable
                            ? () => onRowDrill!(meta as OperationalDrillMeta)
                            : undefined
                        }
                        title={clickable ? "View details" : undefined}
                      >
                        {(row || []).map((cell, cIdx) => (
                          <td
                            key={cIdx}
                            className={numericFlags[cIdx] ? "num" : undefined}
                          >
                            {clickable && cIdx === 0 ? (
                              <span className="rpt-drillable">{cell}</span>
                            ) : (
                              cell
                            )}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
};

const Reports: React.FC = () => {
  const history = useHistory();
  const { locationIdParam, masterListFilter, siteScopeLabel } =
    useSiteListFilter();

  const defaultReportId =
    REPORT_CATALOG.find((r) => r.id === "job-status-dashboard")?.id ||
    REPORT_CATALOG.find((r) => r.kind === "report")?.id ||
    "";

  const [selectedReport, setSelectedReport] = useState<string>(() => {
    try {
      const saved = localStorage.getItem("reports.selectedReportId");
      if (saved && REPORT_CATALOG.some((r) => r.id === saved && r.kind === "report")) {
        return saved;
      }
    } catch {
      /* ignore */
    }
    return defaultReportId;
  });
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
  const [drillMeta, setDrillMeta] = useState<OperationalDrillMeta | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);

  const categories = useMemo(
    () => Array.from(new Set(REPORT_CATALOG.map((r) => r.category))),
    []
  );

  const selectedMeta = REPORT_CATALOG.find((r) => r.id === selectedReport);
  const isLink = selectedMeta?.kind === "link";
  const hasPreview =
    !!reportData && loadedReportId === selectedReport && !isLink;

  const buildReportParams = (format: "pdf" | "csv" | "json") => {
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

  const clearPreview = () => {
    setReportData(null);
    setLoadedReportId("");
    setErrorMessage("");
    setDrillMeta(null);
  };

  const selectReport = (reportId: string) => {
    const item = REPORT_CATALOG.find((r) => r.id === reportId);
    if (!item) return;
    if (item.kind === "link" && item.path) {
      history.push(item.path);
      return;
    }
    setSelectedReport(reportId);
    try {
      localStorage.setItem("reports.selectedReportId", reportId);
    } catch {
      /* ignore */
    }
    setErrorMessage("");
    setDrillMeta(null);
    if (loadedReportId !== reportId) {
      setReportData(null);
      setLoadedReportId("");
    }
  };

  const runReport = async (reportId: string = selectedReport) => {
    const item = REPORT_CATALOG.find((r) => r.id === reportId);
    if (!item || item.kind === "link") {
      toast.error("Please select a report");
      return;
    }
    if (!validateCustomRange()) return;

    setSelectedReport(reportId);
    try {
      localStorage.setItem("reports.selectedReportId", reportId);
    } catch {
      /* ignore */
    }
    setLoading(true);
    setErrorMessage("");
    setDrillMeta(null);
    try {
      const data = await ReportsService.GenerateReport(
        reportId,
        buildReportParams("json")
      );
      setReportData(data);
      setLoadedReportId(reportId);
    } catch (error: any) {
      console.error("Run report failed:", error);
      const msg =
        error?.response?.data?.error ||
        error?.message ||
        "Failed to run report";
      setErrorMessage(msg);
      setReportData(null);
      setLoadedReportId("");
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const exportReport = async (format: "pdf" | "csv") => {
    if (!selectedMeta || isLink) {
      toast.error("Please select a report");
      return;
    }
    if (!validateCustomRange()) return;

    setExporting(true);
    try {
      const { blob, fileName } = await ReportsService.DownloadReport(
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
      toast.success(format === "pdf" ? "Downloaded as PDF" : "Downloaded as CSV");
    } catch (error: any) {
      console.error("Export failed:", error);
      if (reportData && format === "csv" && loadedReportId === selectedReport) {
        const name = selectedMeta?.name || "Report";
        const fileName = `${name}_${dateRange.replace(/\s+/g, "_")}_${ymdLocal(new Date())}.csv`;
        const csv = convertReportToCsv(reportData);
        const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
        const url = window.URL.createObjectURL(blob);
        const link = window.document.createElement("a");
        link.href = url;
        link.download = fileName;
        window.document.body.appendChild(link);
        link.click();
        window.document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
        toast.success("Downloaded as CSV");
        return;
      }
      toast.error(
        error?.response?.data?.error || error?.message || "Failed to export report"
      );
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="reports-page">
      <header className="rpt-page-header">
        <div>
          <h1>Reports</h1>
          <p>Select a report, set the period, then run to preview. Export when ready.</p>
        </div>
        <button
          type="button"
          className="rpt-btn rpt-btn-secondary"
          onClick={() => history.push("/reports/schedules")}
        >
          <FontAwesomeIcon icon={faClock} />
          Scheduled emails
        </button>
      </header>

      <div className="rpt-workspace">
        <aside className="rpt-catalog" aria-label="Report catalog">
          {categories.map((category) => (
            <div key={category} className="rpt-catalog-group">
              <div className="rpt-catalog-heading">{category}</div>
              <ul className="rpt-catalog-list">
                {REPORT_CATALOG.filter((r) => r.category === category).map((report) => {
                  const active = selectedReport === report.id;
                  return (
                    <li key={report.id}>
                      <button
                        type="button"
                        className={`rpt-catalog-item ${active ? "active" : ""} ${
                          report.kind === "link" ? "is-link" : ""
                        }`}
                        onClick={() => selectReport(report.id)}
                      >
                        <FontAwesomeIcon icon={report.icon} className="rpt-catalog-icon" />
                        <span className="rpt-catalog-text">
                          <span className="rpt-catalog-name">
                            {report.name}
                            {report.kind === "link" && (
                              <FontAwesomeIcon
                                icon={faExternalLinkAlt}
                                className="rpt-link-glyph"
                              />
                            )}
                          </span>
                          <span className="rpt-catalog-desc">{report.description}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </aside>

        <section className="rpt-main">
          <div className="rpt-criteria">
            <div className="rpt-criteria-top">
              <div className="rpt-criteria-title">
                <h2>{selectedMeta?.name || "Select a report"}</h2>
                {selectedMeta && <p>{selectedMeta.description}</p>}
              </div>

              {!isLink && (
                <div className="rpt-actions">
                  <button
                    type="button"
                    className="rpt-btn rpt-btn-primary"
                    disabled={loading || !selectedReport}
                    onClick={() => runReport(selectedReport)}
                    title="Run report"
                  >
                    <FontAwesomeIcon icon={faPlay} />
                    {loading ? "Running…" : "Run report"}
                  </button>
                  <div className="rpt-export-group" role="group" aria-label="Export">
                    <button
                      type="button"
                      className="rpt-btn rpt-btn-secondary"
                      disabled={exporting || loading || !selectedReport}
                      onClick={() => exportReport("pdf")}
                      title="Export PDF"
                    >
                      <FontAwesomeIcon icon={faDownload} />
                      PDF
                    </button>
                    <button
                      type="button"
                      className="rpt-btn rpt-btn-secondary"
                      disabled={exporting || loading || !selectedReport}
                      onClick={() => exportReport("csv")}
                      title="Export CSV"
                    >
                      CSV
                    </button>
                    <button
                      type="button"
                      className="rpt-btn rpt-btn-secondary"
                      disabled={loading || !selectedReport}
                      onClick={() => {
                        if (!validateCustomRange()) return;
                        setScheduleOpen(true);
                      }}
                      title="Schedule email"
                    >
                      <FontAwesomeIcon icon={faClock} />
                      Schedule
                    </button>
                  </div>
                </div>
              )}

              {isLink && selectedMeta?.path && (
                <div className="rpt-actions">
                  <button
                    type="button"
                    className="rpt-btn rpt-btn-primary"
                    onClick={() => history.push(selectedMeta.path!)}
                  >
                    <FontAwesomeIcon icon={faExternalLinkAlt} />
                    Open {selectedMeta.name}
                  </button>
                </div>
              )}
            </div>

            {!isLink && (
              <div className="rpt-criteria-filters">
                <div className="rpt-field">
                  <label htmlFor="rpt-period">Period</label>
                  <select
                    id="rpt-period"
                    value={dateRange}
                    onChange={(e) => {
                      setDateRange(e.target.value);
                      clearPreview();
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

                <div className="rpt-field rpt-field-site">
                  <label htmlFor="rpt-site">{masterListFilter.label}</label>
                  <select
                    id="rpt-site"
                    value={masterListFilter.value}
                    onChange={(e) => {
                      masterListFilter.onChange(e.target.value);
                      clearPreview();
                    }}
                  >
                    {masterListFilter.options.map((option) => (
                      <option key={option.value || "all"} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <p className="rpt-field-hint">
                    Defaults to your working site. Choose <strong>All sites</strong> for
                    tenant-wide results. Records with no site (or NCR without a job at this
                    site) appear only under All sites.
                  </p>
                </div>

                {dateRange === "Custom" && (
                  <>
                    <div className="rpt-field">
                      <label htmlFor="rpt-start">Start</label>
                      <input
                        id="rpt-start"
                        type="date"
                        value={customStartDate}
                        onChange={(e) => {
                          setCustomStartDate(e.target.value);
                          clearPreview();
                        }}
                      />
                    </div>
                    <div className="rpt-field">
                      <label htmlFor="rpt-end">End</label>
                      <input
                        id="rpt-end"
                        type="date"
                        value={customEndDate}
                        onChange={(e) => {
                          setCustomEndDate(e.target.value);
                          clearPreview();
                        }}
                      />
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="rpt-preview" aria-live="polite">
            {loading && (
              <div className="rpt-state">
                <div className="rpt-spinner" aria-hidden />
                <h3>Running {selectedMeta?.name}…</h3>
                <p>This can take a moment for large result sets.</p>
              </div>
            )}

            {!loading && errorMessage && (
              <div className="rpt-state rpt-state-error">
                <h3>Could not run report</h3>
                <p>{errorMessage}</p>
                <button
                  type="button"
                  className="rpt-btn rpt-btn-primary"
                  onClick={() => runReport(selectedReport)}
                >
                  Retry
                </button>
              </div>
            )}

            {!loading && !errorMessage && !hasPreview && (
              <div className="rpt-state">
                <h3>Ready to run</h3>
                <p>
                  Period defaults to This Month; Site defaults to your working site.
                  Use <strong>All sites</strong> for a tenant-wide view, then click{" "}
                  <strong>Run report</strong>.
                </p>
              </div>
            )}

            {!loading && !errorMessage && hasPreview && (
              <GenericReportBody
                data={reportData}
                reportId={loadedReportId}
                siteScopeLabel={siteScopeLabel}
                onRowDrill={setDrillMeta}
              />
            )}

            <OperationalReportDrillDrawer
              meta={drillMeta}
              onClose={() => setDrillMeta(null)}
              locationId={
                locationIdParam === undefined ? null : locationIdParam
              }
              periodStart={reportData?.periodStart || null}
              periodEnd={reportData?.periodEnd || null}
              amountColumnLabel={
                loadedReportId === "defect-rate" ||
                drillMeta?.entityType === "ncr"
                  ? "Rate"
                  : "Amount"
              }
            />
          </div>
        </section>
      </div>

      <ScheduleReportDialog
        open={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
        reportCategory="operational"
        reportType={selectedReport}
        reportName={selectedMeta?.name || selectedReport}
        dateRange={dateRange}
        customStartDate={customStartDate}
        customEndDate={customEndDate}
        locationId={locationIdParam}
        parameters={buildReportParams("pdf")}
      />
    </div>
  );
};

export default Reports;
