import { useCallback, useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import {
  JobOrderListItem,
  JobOrderRoutingStep,
  JobOrderService,
  getCurrentStep,
  isStepCompleted,
} from "../services/jobOrderService";
import { formatJobNumber } from "../utils/formatJobNumber";

/* ─── Priority helpers ───────────────────────────────────────── */
const JOB_PRIORITY_OPTIONS = [
  { value: 0, label: "Normal" },
  { value: 1, label: "High" },
  { value: 2, label: "Urgent" },
] as const;

function getPriorityLabel(p: number | undefined | null): string {
  return JOB_PRIORITY_OPTIONS.find((o) => o.value === (p ?? 0))?.label ?? "Normal";
}

function priorityTagStyle(p: number | undefined | null): { bg: string; text: string } | null {
  const v = p ?? 0;
  if (v === 2) return { bg: "bg-red-100 dark:bg-red-950/60", text: "text-red-700 dark:text-red-300" };
  if (v === 1) return { bg: "bg-amber-100 dark:bg-amber-950/50", text: "text-amber-700 dark:text-amber-300" };
  return null; // Normal — hide
}

/* ─── Status options (matching Cimmple_UI) ───────────────────── */
const JOB_STATUS_OPTIONS = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "in progress", label: "In Progress" },
  { value: "partially shipped", label: "Partially Shipped" },
  { value: "shipped", label: "Shipped" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

/* ─── Misc helpers ───────────────────────────────────────────── */
function formatDue(dueDate: string): string {
  if (!dueDate) return "—";
  try {
    const d = new Date(dueDate);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
    }
  } catch { /* fall through */ }
  return dueDate;
}

function statusBadgeStyle(status: string): { bg: string; text: string; label: string } {
  const s = (status || "").toLowerCase();
  if (s.includes("complete") || s.includes("done")) return { bg: "bg-emerald-100 dark:bg-emerald-950/50", text: "text-emerald-700 dark:text-emerald-300", label: "COMPLETED" };
  if (s.includes("hold") || s.includes("cancel")) return { bg: "bg-amber-100 dark:bg-amber-950/50", text: "text-amber-800 dark:text-amber-300", label: "ON HOLD" };
  if (s.includes("ship")) return { bg: "bg-teal-100 dark:bg-teal-950/50", text: "text-teal-700 dark:text-teal-300", label: s.includes("partial") ? "PART. SHIPPED" : "SHIPPED" };
  if (s.includes("draft")) return { bg: "bg-slate-100 dark:bg-slate-700", text: "text-slate-600 dark:text-slate-200", label: "DRAFT" };
  return { bg: "bg-blue-100 dark:bg-blue-950/50", text: "text-blue-700 dark:text-blue-300", label: "IN PROGRESS" };
}

/* ─── Filter bottom-sheet ────────────────────────────────────── */
interface FilterSheetProps {
  open: boolean;
  statusFilter: string;
  priorityFilter: string;
  onApply: (s: string, p: string) => void;
  onClose: () => void;
}

function JobFilterSheet({ open, statusFilter, priorityFilter, onApply, onClose }: FilterSheetProps) {
  const [localStatus, setLocalStatus] = useState(statusFilter);
  const [localPriority, setLocalPriority] = useState(priorityFilter);

  // Sync when re-opening
  useEffect(() => {
    if (open) { setLocalStatus(statusFilter); setLocalPriority(priorityFilter); }
  }, [open, statusFilter, priorityFilter]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* Sheet */}
      <div className="relative mx-auto w-full max-w-[600px] rounded-t-3xl bg-white px-5 pt-5 pb-8 shadow-2xl dark:bg-slate-900">
        {/* Handle */}
        <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-slate-300 dark:bg-slate-600" />

        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">Filter Jobs</h2>
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

        {/* Status */}
        <div className="mb-5">
          <p className="mb-2.5 text-xs font-bold uppercase tracking-widest text-slate-500">Status</p>
          <div className="flex flex-wrap gap-2">
            {JOB_STATUS_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setLocalStatus(opt.value)}
                className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition ${
                  localStatus === opt.value
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Priority */}
        <div className="mb-7">
          <p className="mb-2.5 text-xs font-bold uppercase tracking-widest text-slate-500">Priority</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setLocalPriority("all")}
              className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition ${
                localPriority === "all"
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              All
            </button>
            {JOB_PRIORITY_OPTIONS.map((opt) => {
              const active = localPriority === String(opt.value);
              const colors =
                opt.value === 2
                  ? active ? "bg-red-600 text-white" : "bg-red-50 text-red-700 hover:bg-red-100"
                  : opt.value === 1
                  ? active ? "bg-amber-500 text-white" : "bg-amber-50 text-amber-700 hover:bg-amber-100"
                  : active ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200";
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setLocalPriority(String(opt.value))}
                  className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition ${colors}`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => { setLocalStatus("all"); setLocalPriority("all"); onApply("all", "all"); }}
            className="flex-1 rounded-2xl border border-slate-200 bg-white py-3 text-sm font-bold text-slate-700 hover:bg-slate-50"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={() => onApply(localStatus, localPriority)}
            className="flex-1 rounded-2xl bg-slate-900 py-3 text-sm font-bold text-white hover:bg-slate-800"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Main page ──────────────────────────────────────────────── */
export function JobsPage() {
  const [jobs, setJobs] = useState<JobOrderListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<"active" | "all">("active");
  const [searchQuery, setSearchQuery] = useState("");
  const [stepProgress, setStepProgress] = useState<
    Record<number, { label: string; steps: JobOrderRoutingStep[] }>
  >({});

  // Filters
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [filterOpen, setFilterOpen] = useState(false);

  const activeFilterCount =
    (statusFilter !== "all" ? 1 : 0) + (priorityFilter !== "all" ? 1 : 0);

  const enrichSteps = useCallback(async (list: JobOrderListItem[]) => {
    const targets = list
      .filter((j) => {
        const s = (j.status || "").toLowerCase();
        return !s.includes("complete") && !s.includes("cancel");
      })
      .slice(0, 20);

    for (const j of targets) {
      try {
        const detail = await JobOrderService.getJobOrderById(j.jobOrderID);
        const steps = [...(detail?.RoutingSteps || [])].sort((a, b) => a.sequence - b.sequence);
        const step = getCurrentStep(steps);
        setStepProgress((prev) => ({
          ...prev,
          [j.jobOrderID]: {
            label: step ? `${step.sequence}. ${step.processName}` : "",
            steps,
          },
        }));
      } catch { /* ignore */ }
    }
  }, []);

  const loadJobs = useCallback(async () => {
    setLoading(true);
    setError("");
    setStepProgress({});
    try {
      const list = await JobOrderService.getJobOrders();
      setJobs(list);
      setLoading(false);
      void enrichSteps(list);
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { message?: string; error?: string } }; message?: string };
      setError(ax?.response?.data?.message || ax?.response?.data?.error || ax?.message || "Failed to load jobs");
      setLoading(false);
    }
  }, [enrichSteps]);

  useEffect(() => { void loadJobs(); }, [loadJobs]);

  const { visible, stats } = useMemo(() => {
    let total = jobs.length, inProgress = 0, completed = 0;
    jobs.forEach((j) => {
      const s = (j.status || "").toLowerCase();
      if (s.includes("complete")) completed++;
      else if (!(s.includes("hold") || s.includes("cancel"))) inProgress++;
    });

    const filtered = jobs.filter((j) => {
      const s = (j.status || "").toLowerCase();

      // Active tab excludes complete/cancelled (unless a status filter overrides)
      if (activeTab === "active" && statusFilter === "all") {
        if (s.includes("complete") || s.includes("cancel")) return false;
      }

      // Status filter
      if (statusFilter !== "all") {
        if (!s.includes(statusFilter.toLowerCase())) return false;
      }

      // Priority filter
      if (priorityFilter !== "all") {
        if ((j.jobPriority ?? 0) !== Number(priorityFilter)) return false;
      }

      // Search
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const num = String(j.jobOrderNumber || j.jobNumber || j.jobOrderID).toLowerCase();
        if (!num.includes(q) && !(j.partNo || "").toLowerCase().includes(q) && !(j.customerName || "").toLowerCase().includes(q)) {
          return false;
        }
      }

      return true;
    });

    filtered.sort((a, b) => {
      const pa = a.jobPriority ?? 0;
      const pb = b.jobPriority ?? 0;
      if (pa !== pb) return pb - pa;
      return (a.dueDate || "").localeCompare(b.dueDate || "");
    });

    return { visible: filtered, stats: { total, inProgress, completed } };
  }, [jobs, activeTab, searchQuery, statusFilter, priorityFilter]);

  return (
    <div>
      <header className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white text-slate-700 shadow-sm dark:bg-slate-800 dark:text-slate-200"
            onClick={() => window.dispatchEvent(new CustomEvent("open-drawer"))}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          </button>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 leading-tight dark:text-white">Jobs</h1>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-300">Cimmple Shop Floor</p>
          </div>
        </div>
      </header>

      {/* Search */}
      <div className="mb-4 relative">
        <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-slate-500 dark:text-slate-300">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <input
          type="text"
          placeholder="Search job number, part, customer..."
          className="w-full h-11 rounded-2xl border-none bg-[#f0f3f7] pl-11 pr-4 text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500 dark:bg-slate-800 dark:text-slate-50 dark:placeholder:text-slate-400 dark:focus:ring-blue-600"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Tabs + Filter button */}
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex gap-2 items-center" role="tablist" aria-label="Job filter">
          {(["active", "all"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={activeTab === tab}
              className={`min-h-tap rounded-full px-4 text-sm capitalize transition-colors ${
                activeTab === tab
                  ? "bg-slate-900 font-extrabold text-white dark:bg-white dark:text-slate-900"
                  : "bg-[#f0f3f7] font-semibold text-slate-500 hover:text-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:text-white"
              }`}
              onClick={() => setActiveTab(tab)}
            >
              {tab === "active" ? "Active" : "All"}
            </button>
          ))}
        </div>

        {/* Filter button with active count badge */}
        <button
          type="button"
          onClick={() => setFilterOpen(true)}
          className="relative flex min-h-tap items-center gap-1.5 rounded-xl bg-[#f0f3f7] px-3 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="4" y1="6" x2="20" y2="6" />
            <line x1="4" y1="12" x2="20" y2="12" />
            <line x1="4" y1="18" x2="20" y2="18" />
            <line x1="8" y1="4" x2="8" y2="8" />
            <line x1="16" y1="10" x2="16" y2="14" />
            <line x1="12" y1="16" x2="12" y2="20" />
          </svg>
          <span className="text-xs font-bold">Filters</span>
          {activeFilterCount > 0 && (
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-blue-600 text-[0.6rem] font-extrabold text-white">
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>

      {/* Stats */}
      <div className="mb-4 grid grid-cols-3 gap-2">
        {[
          { label: "Total Jobs", value: stats.total, color: "text-slate-900 dark:text-white" },
          { label: "In Progress", value: stats.inProgress, color: "text-orange-500 dark:text-orange-400" },
          { label: "Completed", value: stats.completed, color: "text-emerald-600 dark:text-emerald-400" },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl border border-slate-200 bg-white shadow-[0_2px_10px_rgba(15,23,42,0.08)] p-3 text-left dark:border-slate-600 dark:bg-slate-800">
            <div className={`text-2xl font-black ${s.color} leading-none`}>{s.value}</div>
            <div className="text-xs font-semibold text-slate-500 mt-1.5 leading-tight dark:text-slate-300">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-3xl border border-slate-200 bg-white shadow-[0_2px_12px_rgba(15,23,42,0.08)] p-5 animate-pulse dark:border-slate-600 dark:bg-slate-800">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <div className="h-5 bg-slate-200 rounded-md w-36 mb-2" />
                  <div className="h-3 bg-slate-100 rounded-md w-28" />
                </div>
                <div className="h-6 bg-slate-200 rounded-full w-20" />
              </div>
              <div className="h-3 bg-slate-100 rounded-full w-full mb-3" />
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
          <button
            type="button"
            className="mt-2 text-xs font-extrabold underline"
            onClick={() => void loadJobs()}
          >
            Retry
          </button>
        </div>
      )}
      {!loading && !error && visible.length === 0 && (
        <div className="py-10 text-center font-bold text-slate-500">No jobs found.</div>
      )}

      {/* Job cards */}
      <ul className="space-y-4">
        {visible.map((job) => {
          const badge = statusBadgeStyle(job.status);
          const priorityTag = priorityTagStyle(job.jobPriority);
          const formattedJobNum = formatJobNumber(
            job.jobOrderNumber || job.jobNumber || job.jobOrderID
          );
          const progress = stepProgress[job.jobOrderID];

          return (
            <li key={job.jobOrderID}>
              <Link
                to={`/jobs/${job.jobOrderID}`}
                className="rounded-3xl border border-slate-200 bg-white shadow-[0_2px_12px_rgba(15,23,42,0.08)] p-5 block transition-transform active:scale-[0.98] dark:border-slate-600 dark:bg-slate-800 dark:shadow-[0_2px_16px_rgba(0,0,0,0.45)]"
              >
                <div className="flex items-start justify-between mb-1 gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-lg font-black tracking-tight text-slate-900 dark:text-white">
                      {formattedJobNum}
                    </span>
                    {priorityTag && (
                      <span className={`rounded-full px-2 py-0.5 text-[0.6rem] font-extrabold uppercase tracking-wide ${priorityTag.bg} ${priorityTag.text}`}>
                        {getPriorityLabel(job.jobPriority)}
                      </span>
                    )}
                  </div>
                  <span className={`shrink-0 px-3 py-1 rounded-full text-[0.65rem] font-extrabold tracking-wider ${badge.bg} ${badge.text}`}>
                    {badge.label}
                  </span>
                </div>

                <div className="text-sm font-extrabold text-slate-800 tracking-tight dark:text-slate-100">
                  {job.partNo || "—"}
                </div>
                {job.customerName && (
                  <div className="text-sm font-semibold text-slate-500 mt-0.5 truncate dark:text-slate-300">{job.customerName}</div>
                )}

                <div className="flex items-center gap-2 mt-3 mb-3">
                  <span className="inline-flex items-center bg-[#f1f5f9] text-slate-700 text-sm font-extrabold px-3 py-1.5 rounded-xl dark:bg-slate-700 dark:text-slate-100">
                    Qty {job.qtyOrdered} {job.unit || "EA"}
                  </span>
                  <span className="inline-flex items-center bg-[#f1f5f9] text-slate-700 text-sm font-extrabold px-3 py-1.5 rounded-xl dark:bg-slate-700 dark:text-slate-100">
                    Due {formatDue(job.dueDate)}
                  </span>
                </div>

                <div className="border-t border-slate-200 my-3 dark:border-slate-700" />

                <div>
                  <div className="flex items-center gap-1 mb-1.5">
                    {(progress?.steps.length
                      ? progress.steps
                      : [{ id: 0, sequence: 1 } as JobOrderRoutingStep]
                    ).map((step) => {
                      const completed = isStepCompleted(step);
                      const started =
                        !completed &&
                        (step.progressState === "running" ||
                          step.progressState === "paused");
                      return (
                        <span
                          key={step.id || step.sequence}
                          className={`h-2 flex-1 rounded-full transition-colors ${
                            completed
                              ? "bg-emerald-500"
                              : started
                              ? `bg-orange-500${
                                  step.progressState === "running"
                                    ? " animate-pulse"
                                    : ""
                                }`
                              : "bg-slate-200/70 dark:bg-slate-700/60"
                          }`}
                        />
                      );
                    })}
                  </div>
                  <div className="text-sm font-extrabold text-slate-900 dark:text-slate-100 truncate">
                    Step: {progress?.label || "1. Processing"}
                  </div>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>

      {/* Filter bottom-sheet */}
      <JobFilterSheet
        open={filterOpen}
        statusFilter={statusFilter}
        priorityFilter={priorityFilter}
        onApply={(s, p) => { setStatusFilter(s); setPriorityFilter(p); setFilterOpen(false); }}
        onClose={() => setFilterOpen(false)}
      />
    </div>
  );
}
