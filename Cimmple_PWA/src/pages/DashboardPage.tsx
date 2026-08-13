import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BarcodeScannerSheet } from "../components/BarcodeScannerSheet";
import {
  DashboardAlert,
  DashboardService,
} from "../services/dashboardService";
import {
  JobOrderListItem,
  JobOrderService,
} from "../services/jobOrderService";
import { formatJobNumber } from "../utils/formatJobNumber";

function isActiveJob(status: string | undefined): boolean {
  const s = (status || "").toLowerCase();
  return !s.includes("complete") && !s.includes("cancel");
}

/** Job-related alerts only — same API payload as Cimmple_UI, filtered client-side. */
function isJobAlert(alert: DashboardAlert): boolean {
  return alert.entityType === "JobOrder" || alert.type === "overdue_job";
}

function alertTone(priority: string): {
  rail: string;
  glow: string;
  badge: string;
  iconWrap: string;
  icon: string;
} {
  switch ((priority || "").toLowerCase()) {
    case "high":
      return {
        rail: "from-red-500 to-rose-400",
        glow: "bg-red-500/10 dark:bg-red-500/15",
        badge: "bg-red-500 text-white",
        iconWrap: "bg-red-500/15 ring-1 ring-red-500/25",
        icon: "text-red-600 dark:text-red-400",
      };
    case "medium":
      return {
        rail: "from-amber-500 to-orange-400",
        glow: "bg-amber-500/10 dark:bg-amber-500/15",
        badge: "bg-amber-500 text-white",
        iconWrap: "bg-amber-500/15 ring-1 ring-amber-500/25",
        icon: "text-amber-600 dark:text-amber-400",
      };
    default:
      return {
        rail: "from-slate-400 to-slate-300",
        glow: "bg-slate-500/5 dark:bg-slate-500/10",
        badge: "bg-slate-500 text-white",
        iconWrap: "bg-slate-500/10 ring-1 ring-slate-400/20",
        icon: "text-slate-500",
      };
  }
}

function ScanIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M3 7V5a2 2 0 012-2h2M17 3h2a2 2 0 012 2v2M21 17v2a2 2 0 01-2 2h-2M7 21H5a2 2 0 01-2-2v-2" />
      <rect x="7" y="7" width="10" height="10" rx="1" />
      <path d="M7 12h10" />
    </svg>
  );
}

function ChevronRight({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden
    >
      <path
        d="M9 6l6 6-6 6"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function DashboardPage() {
  const navigate = useNavigate();
  const [scannerOpen, setScannerOpen] = useState(false);
  const [jobs, setJobs] = useState<JobOrderListItem[]>([]);
  const [alerts, setAlerts] = useState<DashboardAlert[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [loadingAlerts, setLoadingAlerts] = useState(true);
  const [jobsError, setJobsError] = useState("");
  const [alertsError, setAlertsError] = useState("");

  const loadJobs = useCallback(async () => {
    setLoadingJobs(true);
    setJobsError("");
    try {
      const list = await JobOrderService.getJobOrders();
      setJobs(list);
    } catch {
      setJobsError("Could not load jobs");
      setJobs([]);
    } finally {
      setLoadingJobs(false);
    }
  }, []);

  const loadAlerts = useCallback(async () => {
    setLoadingAlerts(true);
    setAlertsError("");
    try {
      const list = await DashboardService.getAlerts();
      setAlerts(list.filter(isJobAlert));
    } catch {
      setAlertsError("Could not load alerts");
      setAlerts([]);
    } finally {
      setLoadingAlerts(false);
    }
  }, []);

  useEffect(() => {
    void loadJobs();
    void loadAlerts();
  }, [loadJobs, loadAlerts]);

  const activeJobs = useMemo(
    () => jobs.filter((j) => isActiveJob(j.status)),
    [jobs]
  );

  const handleScan = useCallback(
    (jobOrderId: number, stepId: number) => {
      setScannerOpen(false);
      navigate(`/jobs/${jobOrderId}?stepId=${stepId}&focus=timer`);
    },
    [navigate]
  );

  return (
    <div className="relative">
      {/* Soft page atmosphere — stays within Cimmple slate/blue language */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-x-4 -top-6 h-56 overflow-hidden"
      >
        <div className="absolute inset-0 bg-[radial-gradient(80%_70%_at_10%_0%,rgba(37,99,235,0.14),transparent_55%),radial-gradient(60%_50%_at_90%_10%,rgba(15,23,42,0.08),transparent_50%)] dark:bg-[radial-gradient(80%_70%_at_10%_0%,rgba(59,130,246,0.18),transparent_55%),radial-gradient(60%_50%_at_95%_0%,rgba(148,163,184,0.08),transparent_45%)]" />
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-canvas dark:to-slate-950" />
      </div>

      <div className="relative">
        {/* Header */}
        <header className="mb-5 flex items-center gap-3">
          <button
            type="button"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-slate-700 shadow-sm dark:bg-slate-800 dark:text-slate-200"
            onClick={() => {
              window.dispatchEvent(new CustomEvent("open-drawer"));
            }}
            aria-label="Open menu"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path
                d="M4 7h16M4 12h16M4 17h16"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
          <div className="min-w-0">
            <h1 className="text-xl font-extrabold tracking-tight leading-tight text-slate-900 dark:text-white">
              Dashboard
            </h1>
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
              Shop floor
            </p>
          </div>
        </header>

        {/* Scanner — top of dashboard */}
        <button
          type="button"
          onClick={() => setScannerOpen(true)}
          className="group relative mb-5 w-full overflow-hidden rounded-[1.75rem] bg-slate-950 p-[1px] text-left shadow-[0_16px_40px_rgba(15,23,42,0.22)] transition active:scale-[0.985] dark:shadow-[0_16px_40px_rgba(0,0,0,0.45)]"
        >
          <span
            aria-hidden
            className="absolute inset-0 bg-[conic-gradient(from_210deg_at_50%_50%,#2563eb_0deg,#0f172a_90deg,#38bdf8_180deg,#0f172a_270deg,#2563eb_360deg)] opacity-80"
          />
          <span className="relative flex items-center gap-4 rounded-[1.7rem] bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 px-4 py-4 dark:from-slate-900 dark:via-slate-950 dark:to-slate-900">
            <span className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white/10 ring-1 ring-white/20">
              <span className="absolute inset-x-2 top-1/2 h-px -translate-y-1/2 bg-sky-400/80 shadow-[0_0_12px_rgba(56,189,248,0.8)] animate-pulse" />
              <ScanIcon className="relative h-7 w-7 text-white" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[0.65rem] font-extrabold uppercase tracking-[0.2em] text-sky-300/90">
                Quick scan
              </span>
              <span className="mt-0.5 block text-lg font-black tracking-tight text-white">
                Scan QR / Barcode
              </span>
              <span className="mt-0.5 block text-xs font-semibold text-slate-400">
                Jump straight to the step timer
              </span>
            </span>
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white ring-1 ring-white/15 transition group-hover:bg-white/15">
              <ChevronRight className="h-5 w-5" />
            </span>
          </span>
        </button>

       

        {/* Active Jobs — 3-column tiles */}
        <section className="mb-7">
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-black tracking-tight text-slate-900 dark:text-white">
                Active Jobs
              </h2>
              <p className="text-[0.7rem] font-bold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-300">
                {loadingJobs ? "Loading…" : `${activeJobs.length} on the floor`}
              </p>
            </div>
            <Link
              to="/jobs"
              className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-extrabold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              View all
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {jobsError ? (
            <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
              {jobsError}
            </p>
          ) : loadingJobs ? (
            <div className="grid grid-cols-3 gap-2.5">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className="h-[3.75rem] animate-pulse rounded-2xl bg-slate-200/70 dark:bg-slate-800"
                />
              ))}
            </div>
          ) : activeJobs.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-6 text-center dark:border-slate-600 dark:bg-slate-800">
              <p className="text-sm font-bold text-slate-500 dark:text-slate-300">
                No active jobs
              </p>
            </div>
          ) : (
            <ul className="grid grid-cols-3 gap-2.5">
              {activeJobs.map((job) => {
                const jobNo = formatJobNumber(
                  job.jobOrderNumber || job.jobNumber || job.jobOrderID
                );
                return (
                  <li key={job.jobOrderID}>
                    <Link
                      to={`/jobs/${job.jobOrderID}`}
                      className="flex min-h-[3.75rem] items-center justify-center rounded-2xl border border-slate-200 bg-white px-2 py-3 text-center shadow-sm transition active:scale-[0.98] dark:border-slate-600 dark:bg-slate-800"
                    >
                      <span className="text-sm font-black leading-tight tracking-tight text-slate-900 dark:text-white">
                        {jobNo}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Job Alerts */}
        <section className="mb-1">
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-black tracking-tight text-slate-900 dark:text-white">
                Job Alerts
              </h2>
              <p className="text-[0.7rem] font-bold uppercase tracking-[0.14em] text-slate-400">
                {loadingAlerts
                  ? "Loading…"
                  : alerts.length
                  ? `${alerts.length} need attention`
                  : "All clear"}
              </p>
            </div>
            {!loadingAlerts && alerts.length > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500 px-2.5 py-1 text-[0.65rem] font-extrabold uppercase tracking-wide text-white shadow-[0_6px_16px_rgba(239,68,68,0.35)]">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
                {alerts.length}
              </span>
            )}
          </div>

          {alertsError ? (
            <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
              {alertsError}
            </p>
          ) : loadingAlerts ? (
            <div className="space-y-2.5">
              {[0, 1].map((i) => (
                <div
                  key={i}
                  className="h-[4.5rem] animate-pulse rounded-2xl bg-white shadow-card dark:bg-slate-800"
                />
              ))}
            </div>
          ) : alerts.length === 0 ? (
            <div className="rounded-[1.5rem] border border-emerald-200/70 bg-gradient-to-br from-emerald-50/90 to-white px-5 py-8 text-center dark:border-emerald-900/40 dark:from-emerald-950/30 dark:to-slate-800">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <p className="text-sm font-extrabold text-emerald-800 dark:text-emerald-300">
                No job alerts
              </p>
              <p className="mt-1 text-xs font-semibold text-emerald-700/70 dark:text-emerald-400/70">
                Overdue jobs will show here
              </p>
            </div>
          ) : (
            <ul className="space-y-2.5">
              {alerts.slice(0, 10).map((alert, index) => {
                const tone = alertTone(alert.priority);
                return (
                  <li key={`${alert.type}-${alert.entityId}-${index}`}>
                    <button
                      type="button"
                      onClick={() => navigate(`/jobs/${alert.entityId}`)}
                      className={`group relative flex w-full overflow-hidden rounded-2xl border border-slate-200/80 bg-white text-left shadow-card transition hover:-translate-y-0.5 hover:shadow-[0_12px_28px_rgba(15,23,42,0.1)] active:translate-y-0 dark:border-slate-700 dark:bg-slate-800 dark:hover:shadow-[0_12px_28px_rgba(0,0,0,0.35)]`}
                    >
                      <span
                        aria-hidden
                        className={`absolute inset-y-0 left-0 w-1.5 bg-gradient-to-b ${tone.rail}`}
                      />
                      <span
                        aria-hidden
                        className={`absolute -right-6 -top-6 h-20 w-20 rounded-full blur-2xl ${tone.glow}`}
                      />
                      <span className="relative flex w-full items-start gap-3 px-4 py-3.5 pl-5">
                        <span
                          className={`mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${tone.iconWrap}`}
                        >
                          <svg
                            viewBox="0 0 24 24"
                            className={`h-4.5 w-4.5 ${tone.icon}`}
                            fill="currentColor"
                          >
                            <path d="M12 2L1 21h22L12 2zm0 4.5l7.2 12.5H4.8L12 6.5zM11 10v4h2v-4h-2zm0 5v2h2v-2h-2z" />
                          </svg>
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="mb-1 flex flex-wrap items-center gap-2">
                            <span className="text-sm font-extrabold leading-snug text-slate-900 dark:text-white">
                              {alert.title}
                            </span>
                            <span
                              className={`rounded-md px-1.5 py-0.5 text-[0.58rem] font-extrabold uppercase tracking-wider ${tone.badge}`}
                            >
                              {alert.priority}
                            </span>
                          </span>
                          <span className="block text-xs font-semibold leading-relaxed text-slate-500 dark:text-slate-400">
                            {alert.description}
                          </span>
                        </span>
                        <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-300 transition group-hover:text-slate-500 dark:text-slate-600 dark:group-hover:text-slate-400" />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <BarcodeScannerSheet
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={handleScan}
      />
    </div>
  );
}
