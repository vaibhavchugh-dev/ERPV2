import { useCallback, useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { AuthService } from "../../services/authService";
import {
  formatNcrStatus,
  NonConformanceReport,
  QualityService,
} from "../../services/qualityService";

/* ─── Filter options (matching Cimmple_UI Quality.tsx) ──────── */
const NCR_STATUS_OPTIONS = [
  { value: "all", label: "All" },
  { value: "Open", label: "Open" },
  { value: "Under_Investigation", label: "Under Investigation" },
  { value: "Pending_Approval", label: "Pending Approval" },
  { value: "Approved", label: "Approved" },
  { value: "Implemented", label: "Implemented" },
  { value: "Closed", label: "Closed" },
  { value: "Rejected", label: "Rejected" },
];

const NCR_CATEGORY_OPTIONS = [
  { value: "all", label: "All" },
  { value: "Material_Defect", label: "Material Defect" },
  { value: "Dimensional_Issue", label: "Dimensional Issue" },
  { value: "Process_Failure", label: "Process Failure" },
  { value: "Equipment_Problem", label: "Equipment Problem" },
  { value: "Documentation_Error", label: "Documentation Error" },
  { value: "Supplier_Quality", label: "Supplier Quality" },
  { value: "Other", label: "Other" },
];

const NCR_SEVERITY_OPTIONS = [
  { value: "all", label: "All" },
  { value: "Critical", label: "Critical" },
  { value: "Major", label: "Major" },
  { value: "Minor", label: "Minor" },
];

const NCR_SOURCE_OPTIONS = [
  { value: "all", label: "All" },
  { value: "Internal", label: "Internal" },
  { value: "External", label: "External" },
  { value: "Customer", label: "Customer" },
];

interface QualityFilters {
  status: string;
  category: string;
  severity: string;
  source: string;
}

const DEFAULT_FILTERS: QualityFilters = {
  status: "all",
  category: "all",
  severity: "all",
  source: "all",
};

/* ─── Filter bottom-sheet ────────────────────────────────────── */
interface FilterSheetProps {
  open: boolean;
  filters: QualityFilters;
  onApply: (f: QualityFilters) => void;
  onClose: () => void;
}

function PillGroup({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="mb-5">
      <p className="mb-2.5 text-xs font-bold uppercase tracking-widest text-slate-500">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition ${
              value === opt.value
                ? "bg-slate-900 text-white"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function QualityFilterSheet({ open, filters, onApply, onClose }: FilterSheetProps) {
  const [local, setLocal] = useState<QualityFilters>(filters);

  useEffect(() => {
    if (open) setLocal(filters);
  }, [open, filters]);

  if (!open) return null;

  const set = (key: keyof QualityFilters) => (v: string) =>
    setLocal((prev) => ({ ...prev, [key]: v }));

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative mx-auto w-full max-w-[540px] rounded-t-3xl bg-white px-5 pt-5 pb-8 shadow-2xl overflow-y-auto max-h-[80dvh] dark:bg-slate-900">
        <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-slate-300 dark:bg-slate-600" />
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">Filter NCRs</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <PillGroup label="Status" options={NCR_STATUS_OPTIONS} value={local.status} onChange={set("status")} />
        <PillGroup label="Severity" options={NCR_SEVERITY_OPTIONS} value={local.severity} onChange={set("severity")} />
        <PillGroup label="Category" options={NCR_CATEGORY_OPTIONS} value={local.category} onChange={set("category")} />
        <PillGroup label="Source" options={NCR_SOURCE_OPTIONS} value={local.source} onChange={set("source")} />

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={() => { const f = { ...DEFAULT_FILTERS }; setLocal(f); onApply(f); }}
            className="flex-1 rounded-2xl border border-slate-200 bg-white py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={() => onApply(local)}
            className="flex-1 rounded-2xl bg-slate-900 py-3 text-sm font-bold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Badge helpers ──────────────────────────────────────────── */
function formatCategory(cat: string | undefined): string {
  if (!cat) return "Other";
  // "Material_Defect" → "Material Defect"
  return cat.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
}

function formatReportedDate(dateStr: string | undefined): string {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    }
  } catch { /* ignore */ }
  return dateStr;
}

function getSeverityBadgeStyle(sev: string | undefined) {
  const s = (sev || "").toLowerCase();
  if (s.includes("critical")) return "bg-red-100 text-red-600 font-extrabold text-[0.65rem] uppercase px-3 py-1 rounded-full dark:bg-red-950/60 dark:text-red-300";
  if (s.includes("major")) return "bg-amber-100 text-amber-700 font-extrabold text-[0.65rem] uppercase px-3 py-1 rounded-full dark:bg-amber-950/50 dark:text-amber-300";
  return "bg-teal-100 text-teal-700 font-extrabold text-[0.65rem] uppercase px-3 py-1 rounded-full dark:bg-teal-950/50 dark:text-teal-300";
}

function getStatusBadgeStyle(stat: string | undefined) {
  const s = (stat || "").toLowerCase();
  if (s.includes("close") || s.includes("resolve") || s.includes("approve")) {
    return "bg-emerald-100 text-emerald-800 font-extrabold text-[0.65rem] uppercase px-3 py-1 rounded-full dark:bg-emerald-950/50 dark:text-emerald-300";
  }
  return "bg-orange-100/70 text-amber-800 font-extrabold text-[0.65rem] uppercase px-3 py-1 rounded-full dark:bg-orange-950/50 dark:text-amber-300";
}

/* ─── Main page ──────────────────────────────────────────────── */
export function QualityListPage() {
  const [ncrs, setNcrs] = useState<NonConformanceReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [stats, setStats] = useState({ totalNCRs: 0, openNCRs: 0, criticalNCRs: 0, overdueNCRs: 0 });

  const [filters, setFilters] = useState<QualityFilters>(DEFAULT_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);

  const activeFilterCount = Object.values(filters).filter((v) => v !== "all").length;

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const tenantId = AuthService.getTenantId();
      const [list, statsResult] = await Promise.all([
        QualityService.getNCRs({ tenantId }),
        QualityService.getNCRStats(tenantId),
      ]);
      setNcrs(list);
      setStats(statsResult);
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { error?: { message?: string }; message?: string } }; message?: string };
      setError(ax?.response?.data?.error?.message || ax?.response?.data?.message || ax?.message || "Failed to load NCRs");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => {
    return ncrs.filter((ncr) => {
      if (filters.status !== "all" && (ncr.status || "") !== filters.status) return false;
      if (filters.severity !== "all" && (ncr.severity || "") !== filters.severity) return false;
      if (filters.category !== "all" && (ncr.category || "") !== filters.category) return false;
      if (filters.source !== "all" && (ncr.source || "") !== filters.source) return false;

      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (
          !(ncr.ncrNumber || "").toLowerCase().includes(q) &&
          !(ncr.title || "").toLowerCase().includes(q) &&
          !(ncr.partNo || "").toLowerCase().includes(q) &&
          !(ncr.jobOrderNumber || "").toLowerCase().includes(q)
        ) {
          return false;
        }
      }

      return true;
    });
  }, [ncrs, searchQuery, filters]);

  return (
    <div>
      <header className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-white text-slate-700 shadow-sm hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            onClick={() => window.dispatchEvent(new CustomEvent("open-drawer"))}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          </button>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 leading-tight dark:text-white">Quality</h1>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-300">Cimmple Shop Floor</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex min-h-tap items-center rounded-xl px-3 text-xs font-bold text-slate-500 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          Refresh
        </button>
      </header>

      <Link
        to="/quality/new"
        className="mb-4 flex min-h-tap w-full items-center justify-center rounded-2xl bg-black text-sm font-extrabold text-white shadow-sm hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
      >
        + New NCR
      </Link>

      {/* Search + Filter button */}
      <div className="mb-4 flex items-center gap-2">
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-3.5 flex items-center pointer-events-none text-slate-500 dark:text-slate-300">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <input
            type="text"
            placeholder="Search NCR, part, job..."
            className="w-full h-11 rounded-2xl border-none bg-[#f4f6f8] pl-10 pr-4 text-xs font-semibold text-slate-700 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500 dark:bg-slate-800 dark:text-slate-50 dark:placeholder:text-slate-400 dark:focus:ring-blue-600"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <button
          type="button"
          onClick={() => setFilterOpen(true)}
          className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#f4f6f8] text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="4" y1="6" x2="20" y2="6" />
            <line x1="4" y1="12" x2="20" y2="12" />
            <line x1="4" y1="18" x2="20" y2="18" />
            <line x1="8" y1="4" x2="8" y2="8" />
            <line x1="16" y1="10" x2="16" y2="14" />
            <line x1="12" y1="16" x2="12" y2="20" />
          </svg>
          {activeFilterCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-blue-600 text-[0.6rem] font-extrabold text-white">
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>

      {/* Compact stats — collapsed by default */}
      <button
        type="button"
        onClick={() => setStatsOpen((v) => !v)}
        className="mb-3 flex min-h-tap w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 text-left shadow-[0_2px_10px_rgba(15,23,42,0.08)] dark:border-slate-600 dark:bg-slate-800"
      >
        <span className="text-xs font-bold text-slate-600 dark:text-slate-200">
          {stats.openNCRs} open · {stats.criticalNCRs} critical · {stats.totalNCRs} total
        </span>
        <span className="text-xs font-bold text-slate-500 flex items-center gap-1 dark:text-slate-300">
          {statsOpen ? "Hide" : "Stats"}
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            {statsOpen ? (
              <path d="M18 15l-6-6-6 6" />
            ) : (
              <path d="M6 9l6 6 6-6" />
            )}
          </svg>
        </span>
      </button>
      {statsOpen && (
      <div className="mb-4 grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-slate-200 bg-white shadow-[0_2px_10px_rgba(15,23,42,0.08)] p-4 dark:border-slate-600 dark:bg-slate-800">
          <span className="text-[0.55rem] font-bold uppercase tracking-[0.15em] text-slate-500 block mb-2 dark:text-slate-300">T O T A L</span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-black text-slate-900 leading-none dark:text-white">{stats.totalNCRs}</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400">
              <path d="M18 20V10M12 20V4M6 20v-6" />
            </svg>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white shadow-[0_2px_10px_rgba(15,23,42,0.08)] p-4 dark:border-slate-600 dark:bg-slate-800">
          <span className="text-[0.55rem] font-bold uppercase tracking-[0.15em] text-slate-500 block mb-2 dark:text-slate-300">O P E N</span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-black text-slate-900 leading-none dark:text-white">{stats.openNCRs}</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-teal-500">
              <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" />
            </svg>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white shadow-[0_2px_10px_rgba(15,23,42,0.08)] p-4 dark:border-slate-600 dark:bg-slate-800">
          <span className="text-[0.55rem] font-bold uppercase tracking-[0.15em] text-slate-500 block mb-2 dark:text-slate-300">C R I T I C A L</span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-black text-red-600 leading-none dark:text-red-400">{stats.criticalNCRs}</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-red-500">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01" />
            </svg>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white shadow-[0_2px_10px_rgba(15,23,42,0.08)] p-4 dark:border-slate-600 dark:bg-slate-800">
          <span className="text-[0.55rem] font-bold uppercase tracking-[0.15em] text-slate-500 block mb-2 dark:text-slate-300">O V E R D U E</span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-black text-amber-500 leading-none dark:text-amber-400">{stats.overdueNCRs}</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-amber-500">
              <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" />
            </svg>
          </div>
        </div>
      </div>
      )}

      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-3xl border border-slate-200 bg-white shadow-[0_2px_12px_rgba(15,23,42,0.08)] p-4 animate-pulse dark:border-slate-600 dark:bg-slate-800">
              <div className="mb-2">
                <div className="h-5 bg-slate-200 rounded-md w-32 mb-1" />
                <div className="h-3 bg-slate-100 rounded-md w-24" />
              </div>
              <div className="flex gap-2 mb-3">
                <div className="h-5 bg-slate-200 rounded-full w-16" />
                <div className="h-5 bg-slate-200 rounded-full w-14" />
              </div>
              <div className="grid grid-cols-2 gap-2 mb-2">
                <div className="h-3 bg-slate-100 rounded w-20" />
                <div className="h-3 bg-slate-100 rounded w-20" />
              </div>
              <div className="h-px bg-slate-100 my-2" />
              <div className="flex justify-between items-center">
                <div className="h-3 bg-slate-100 rounded w-24" />
                <div className="h-3 bg-slate-200 rounded w-16" />
              </div>
            </div>
          ))}
        </div>
      )}
      {error && (
        <div className="mb-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm font-semibold text-red-700" role="alert">
          <div>{error}</div>
          <button type="button" className="mt-2 text-xs font-extrabold underline" onClick={() => void load()}>
            Retry
          </button>
        </div>
      )}
      {!loading && !error && visible.length === 0 && (
        <div className="py-10 text-center font-bold text-slate-400 text-xs">No NCRs found.</div>
      )}

      <ul className="space-y-2.5">
        {visible.map((ncr) => {
          const ncrNum = ncr.ncrNumber || `NCR#${ncr.ncrId}`;
          return (
            <li key={ncr.ncrId}>
              <Link
                to={`/quality/${ncr.ncrId}`}
                className="rounded-3xl border border-slate-200 bg-white shadow-[0_2px_12px_rgba(15,23,42,0.08)] px-4 py-3.5 block transition-transform active:scale-[0.98] dark:border-slate-600 dark:bg-slate-800 dark:shadow-[0_2px_16px_rgba(0,0,0,0.45)]"
              >
                <div className="mb-2">
                  <div className="text-base font-black text-slate-900 tracking-tight leading-snug dark:text-white">{ncrNum}</div>
                  <div className="text-xs font-semibold text-slate-500 mt-0.5 dark:text-slate-300">{ncr.title || "—"}</div>
                </div>
                <div className="flex items-center gap-2 mb-2.5">
                  <span className={getSeverityBadgeStyle(ncr.severity)}>{ncr.severity || "MINOR"}</span>
                  <span className={getStatusBadgeStyle(ncr.status)}>{formatNcrStatus(ncr.status)}</span>
                </div>
                <div className="grid grid-cols-2 gap-y-1.5 gap-x-4 mb-2">
                  <div>
                    <span className="text-[0.6rem] font-bold text-slate-400 uppercase tracking-wide block mb-0.5 dark:text-slate-400">Category</span>
                    <span className="text-xs font-extrabold text-slate-900 block truncate dark:text-slate-100">{formatCategory(ncr.category)}</span>
                  </div>
                  <div>
                    <span className="text-[0.6rem] font-bold text-slate-400 uppercase tracking-wide block mb-0.5 dark:text-slate-400">Source</span>
                    <span className="text-xs font-extrabold text-slate-900 block truncate dark:text-slate-100">{ncr.source || "—"}</span>
                  </div>
                  <div>
                    <span className="text-[0.6rem] font-bold text-slate-400 uppercase tracking-wide block mb-0.5 dark:text-slate-400">Job Order</span>
                    <span className="text-xs font-extrabold text-slate-900 block truncate dark:text-slate-100">{ncr.jobOrderNumber || ncr.jobOrderId || "—"}</span>
                  </div>
                  <div>
                    <span className="text-[0.6rem] font-bold text-slate-400 uppercase tracking-wide block mb-0.5 dark:text-slate-400">Reported</span>
                    <span className="text-xs font-extrabold text-slate-900 block truncate dark:text-slate-100">{formatReportedDate(ncr.reportedDate)}</span>
                  </div>
                </div>
                <hr className="border-slate-200 my-2 dark:border-slate-700" />
                <div className="flex items-center justify-between">
                  <div className="flex items-center text-xs font-semibold text-slate-500 dark:text-slate-300">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400 mr-1.5 dark:text-slate-400">
                      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                    {ncr.reportedByName || "—"}
                  </div>
                  <div className="flex items-center gap-1 text-xs font-extrabold text-slate-900 dark:text-slate-200">
                    Details
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>

      <QualityFilterSheet
        open={filterOpen}
        filters={filters}
        onApply={(f) => { setFilters(f); setFilterOpen(false); }}
        onClose={() => setFilterOpen(false)}
      />
    </div>
  );
}
