import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  JobOrderListItem,
  JobOrderService,
  getCurrentStep,
} from "../services/jobOrderService";
import { formatJobNumber } from "../utils/formatJobNumber";

function formatDue(dueDate: string): string {
  if (!dueDate) return "—";
  try {
    const d = new Date(dueDate);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    }
  } catch {
    // fall through
  }
  return dueDate;
}

function statusBadge(status: string): string {
  const s = (status || "").toLowerCase();
  if (s.includes("complete")) return "badge badge-done";
  if (s.includes("progress") || s.includes("ship")) return "badge badge-active";
  if (s.includes("cancel")) return "badge badge-warn";
  return "badge badge-idle";
}

export function JobsPage() {
  const [jobs, setJobs] = useState<JobOrderListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"active" | "all">("active");
  const [stepLabels, setStepLabels] = useState<Record<number, string>>({});

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
        const step = getCurrentStep(detail?.RoutingSteps);
        if (step) {
          const label = `${step.sequence}. ${step.processName}`;
          setStepLabels((prev) => ({ ...prev, [j.jobOrderID]: label }));
        }
      } catch {
        // ignore per-job enrichment failures
      }
    }
  }, []);

  const loadJobs = useCallback(async () => {
    setLoading(true);
    setError("");
    setStepLabels({});
    try {
      const list = await JobOrderService.getJobOrders();
      setJobs(list);
      setLoading(false);
      void enrichSteps(list);
    } catch (err: unknown) {
      const ax = err as {
        response?: { data?: { message?: string; error?: string } };
        message?: string;
      };
      setError(
        ax?.response?.data?.message ||
          ax?.response?.data?.error ||
          ax?.message ||
          "Failed to load jobs"
      );
      setLoading(false);
    }
  }, [enrichSteps]);

  useEffect(() => {
    void loadJobs();
  }, [loadJobs]);

  const visible = jobs.filter((j) => {
    if (filter === "all") return true;
    const s = (j.status || "").toLowerCase();
    return !s.includes("complete") && !s.includes("cancel");
  });

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">My Jobs</h1>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => void loadJobs()}
          disabled={loading}
        >
          Refresh
        </button>
      </div>

      <div className="mb-4 flex gap-2" role="tablist" aria-label="Job filter">
        <button
          type="button"
          role="tab"
          aria-selected={filter === "active"}
          className={`rounded-full border px-4 py-2 text-sm font-semibold ${
            filter === "active"
              ? "border-brand bg-brand text-white"
              : "border-slate-200 bg-white text-slate-600"
          }`}
          onClick={() => setFilter("active")}
        >
          Active
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={filter === "all"}
          className={`rounded-full border px-4 py-2 text-sm font-semibold ${
            filter === "all"
              ? "border-brand bg-brand text-white"
              : "border-slate-200 bg-white text-slate-600"
          }`}
          onClick={() => setFilter("all")}
        >
          All
        </button>
      </div>

      {loading && <div className="py-10 text-center text-slate-500">Loading jobs…</div>}
      {error && (
        <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-700" role="alert">
          {error}
        </div>
      )}
      {!loading && !error && visible.length === 0 && (
        <div className="py-10 text-center text-slate-500">No jobs for this location.</div>
      )}

      <ul className="space-y-3">
        {visible.map((job) => (
          <li key={job.jobOrderID}>
            <Link
              to={`/jobs/${job.jobOrderID}`}
              className="card block p-4 active:scale-[0.995]"
            >
              <div className="mb-2 flex items-start justify-between gap-2">
                <span className="text-[1.05rem] font-bold tracking-tight text-slate-900">
                  {formatJobNumber(
                    job.jobOrderNumber || job.jobNumber || job.jobOrderID
                  )}
                </span>
                <span className={statusBadge(job.status)}>{job.status || "—"}</span>
              </div>
              <div className="mb-2 flex flex-col gap-0.5">
                <strong className="text-slate-900">{job.partNo || "—"}</strong>
                {job.partName ? (
                  <span className="text-sm text-slate-500">{job.partName}</span>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
                <span>
                  Qty {job.qtyOrdered}
                  {job.unit ? ` ${job.unit}` : ""}
                </span>
                <span>Due {formatDue(job.dueDate)}</span>
              </div>
              {stepLabels[job.jobOrderID] && (
                <div className="mt-3 border-t border-slate-100 pt-2.5 text-sm font-semibold text-slate-700">
                  Step: {stepLabels[job.jobOrderID]}
                </div>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
