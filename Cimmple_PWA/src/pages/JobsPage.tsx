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

function statusClass(status: string): string {
  const s = (status || "").toLowerCase();
  if (s.includes("complete")) return "status-pill status-done";
  if (s.includes("progress") || s.includes("ship")) return "status-pill status-active";
  if (s.includes("cancel")) return "status-pill status-muted";
  return "status-pill status-idle";
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

    const labels: Record<number, string> = {};
    // Sequential to avoid hammering the API on a phone network
    for (const j of targets) {
      try {
        const detail = await JobOrderService.getJobOrderById(j.jobOrderID);
        const step = getCurrentStep(detail?.RoutingSteps);
        if (step) {
          labels[j.jobOrderID] = `${step.sequence}. ${step.processName}`;
          setStepLabels((prev) => ({ ...prev, [j.jobOrderID]: labels[j.jobOrderID] }));
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
    <div className="page jobs-page">
      <div className="page-header">
        <h1>My Jobs</h1>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => void loadJobs()}
          disabled={loading}
        >
          Refresh
        </button>
      </div>

      <div className="filter-row" role="tablist" aria-label="Job filter">
        <button
          type="button"
          role="tab"
          aria-selected={filter === "active"}
          className={filter === "active" ? "chip active" : "chip"}
          onClick={() => setFilter("active")}
        >
          Active
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={filter === "all"}
          className={filter === "all" ? "chip active" : "chip"}
          onClick={() => setFilter("all")}
        >
          All
        </button>
      </div>

      {loading && <div className="state-msg">Loading jobs…</div>}
      {error && (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      )}
      {!loading && !error && visible.length === 0 && (
        <div className="state-msg">No jobs for this location.</div>
      )}

      <ul className="job-card-list">
        {visible.map((job) => (
          <li key={job.jobOrderID}>
            <Link to={`/jobs/${job.jobOrderID}`} className="job-card">
              <div className="job-card-top">
                <span className="job-number">
                  {formatJobNumber(
                    job.jobOrderNumber || job.jobNumber || job.jobOrderID
                  )}
                </span>
                <span className={statusClass(job.status)}>{job.status || "—"}</span>
              </div>
              <div className="job-part">
                <strong>{job.partNo || "—"}</strong>
                {job.partName ? <span>{job.partName}</span> : null}
              </div>
              <div className="job-meta">
                <span>
                  Qty {job.qtyOrdered}
                  {job.unit ? ` ${job.unit}` : ""}
                </span>
                <span>Due {formatDue(job.dueDate)}</span>
              </div>
              {stepLabels[job.jobOrderID] && (
                <div className="job-step">Step: {stepLabels[job.jobOrderID]}</div>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
