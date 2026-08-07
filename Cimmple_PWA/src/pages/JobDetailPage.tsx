import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import {
  applyStepAction,
  deriveJobStatus,
  getCurrentStep,
  JobOrderDetail,
  JobOrderRoutingStep,
  JobOrderService,
  ProgressState,
} from "../services/jobOrderService";
import { formatJobNumber } from "../utils/formatJobNumber";

function formatDue(dueDate: string): string {
  if (!dueDate) return "—";
  return dueDate;
}

function progressLabel(state: ProgressState | undefined): string {
  switch (state) {
    case "running":
      return "Running";
    case "paused":
      return "Paused";
    case "stopped":
      return "Done";
    default:
      return "Idle";
  }
}

function statusClass(status: string): string {
  const s = (status || "").toLowerCase();
  if (s.includes("complete")) return "status-pill status-done";
  if (s.includes("progress") || s.includes("ship")) return "status-pill status-active";
  if (s.includes("cancel")) return "status-pill status-muted";
  return "status-pill status-idle";
}

export function JobDetailPage() {
  const { jobOrderId } = useParams<{ jobOrderId: string }>();
  const { userName } = useAuth();
  const [job, setJob] = useState<JobOrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionOk, setActionOk] = useState("");
  /** Which routing step the action panel targets (user-selectable). */
  const [selectedStepId, setSelectedStepId] = useState<number | null>(null);
  const timersRef = useRef<Map<number, ReturnType<typeof setInterval>>>(new Map());

  const clearTimers = useCallback(() => {
    timersRef.current.forEach((t) => clearInterval(t));
    timersRef.current.clear();
  }, []);

  const startLocalTimer = useCallback((stepId: number) => {
    const existing = timersRef.current.get(stepId);
    if (existing) clearInterval(existing);

    const timer = setInterval(() => {
      setJob((prev) => {
        if (!prev?.RoutingSteps) return prev;
        return {
          ...prev,
          RoutingSteps: prev.RoutingSteps.map((s) =>
            s.id === stepId && s.progressState === "running"
              ? { ...s, elapsedTime: (s.elapsedTime || 0) + 1 }
              : s
          ),
        };
      });
    }, 60_000);

    timersRef.current.set(stepId, timer);
  }, []);

  const stopLocalTimer = useCallback((stepId: number) => {
    const t = timersRef.current.get(stepId);
    if (t) {
      clearInterval(t);
      timersRef.current.delete(stepId);
    }
  }, []);

  const syncSelectedStep = useCallback((steps: JobOrderRoutingStep[] | undefined) => {
    const suggested = getCurrentStep(steps);
    setSelectedStepId((prev) => {
      if (prev != null && steps?.some((s) => s.id === prev)) {
        return prev;
      }
      return suggested?.id ?? null;
    });
  }, []);

  const loadJob = useCallback(async () => {
    const id = Number(jobOrderId);
    if (!id) {
      setError("Invalid job id");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const detail = await JobOrderService.getJobOrderById(id);
      if (!detail) {
        setError("Job not found");
        setJob(null);
        return;
      }
      setJob(detail);
      syncSelectedStep(detail.RoutingSteps);

      clearTimers();
      detail.RoutingSteps?.forEach((s) => {
        if (s.progressState === "running") {
          startLocalTimer(s.id);
        }
      });
    } catch (err: unknown) {
      const ax = err as {
        response?: { data?: { message?: string; error?: string } };
        message?: string;
      };
      setError(
        ax?.response?.data?.message ||
          ax?.response?.data?.error ||
          ax?.message ||
          "Failed to load job"
      );
    } finally {
      setLoading(false);
    }
  }, [jobOrderId, clearTimers, startLocalTimer, syncSelectedStep]);

  useEffect(() => {
    void loadJob();
    return () => clearTimers();
  }, [loadJob, clearTimers]);

  const sortedSteps = useMemo(() => {
    if (!job?.RoutingSteps) return [];
    return [...job.RoutingSteps].sort((a, b) => a.sequence - b.sequence);
  }, [job]);

  const selectedStep = useMemo(() => {
    if (!sortedSteps.length) return null;
    if (selectedStepId != null) {
      const found = sortedSteps.find((s) => s.id === selectedStepId);
      if (found) return found;
    }
    return getCurrentStep(sortedSteps);
  }, [sortedSteps, selectedStepId]);

  const persistSteps = async (
    nextSteps: JobOrderRoutingStep[],
    action: "start" | "pause" | "resume" | "complete"
  ) => {
    if (!job) return;
    setSaving(true);
    setActionError("");
    setActionOk("");

    const nextStatus = deriveJobStatus(job.Status, nextSteps);
    const payload: JobOrderDetail = {
      ...job,
      Status: nextStatus,
      RoutingSteps: nextSteps,
    };

    // Optimistic UI
    setJob(payload);

    try {
      await JobOrderService.saveJobOrder(payload);
      setActionOk(
        action === "complete"
          ? "Step completed"
          : action === "pause"
            ? "Step paused"
            : action === "resume"
              ? "Step resumed"
              : "Step started"
      );
      // Reload to stay aligned with server JSON
      const refreshed = await JobOrderService.getJobOrderById(job.JobOrderID);
      if (refreshed) {
        setJob(refreshed);
        if (action === "complete") {
          const next = getCurrentStep(refreshed.RoutingSteps);
          setSelectedStepId(next?.id ?? null);
        } else {
          syncSelectedStep(refreshed.RoutingSteps);
        }
        clearTimers();
        refreshed.RoutingSteps?.forEach((s) => {
          if (s.progressState === "running") startLocalTimer(s.id);
        });
      }
    } catch (err: unknown) {
      const ax = err as {
        response?: { data?: { message?: string; error?: string } };
        message?: string;
      };
      setActionError(
        ax?.response?.data?.message ||
          ax?.response?.data?.error ||
          ax?.message ||
          "Failed to save step action"
      );
      await loadJob();
    } finally {
      setSaving(false);
    }
  };

  const runAction = async (
    stepId: number,
    action: "start" | "pause" | "resume" | "complete"
  ) => {
    if (!job?.RoutingSteps || saving) return;

    if (action === "pause" || action === "complete") {
      stopLocalTimer(stepId);
    }
    if (action === "start" || action === "resume") {
      startLocalTimer(stepId);
    }

    const nextSteps = applyStepAction(
      job.RoutingSteps,
      stepId,
      action,
      userName
    );
    await persistSteps(nextSteps, action);
  };

  if (loading) {
    return (
      <div className="page">
        <div className="state-msg">Loading job…</div>
      </div>
    );
  }

  if (error || !job) {
    return (
      <div className="page">
        <Link to="/jobs" className="back-link">
          ← Jobs
        </Link>
        <div className="alert alert-error" role="alert">
          {error || "Job not found"}
        </div>
      </div>
    );
  }

  return (
    <div className="page job-detail-page">
      <Link to="/jobs" className="back-link">
        ← Jobs
      </Link>

      <header className="detail-header panel">
        <div className="detail-title-row">
          <h1>
            {formatJobNumber(job.JobOrderNumber || job.JobNumber || job.JobOrderID)}
          </h1>
          <span className={statusClass(job.Status)}>{job.Status}</span>
        </div>
        <div className="detail-part">
          <strong>{job.PartNo || "—"}</strong>
          {job.PartName ? <span>{job.PartName}</span> : null}
        </div>
        <div className="detail-meta-grid">
          <div className="meta-item">
            <span className="meta-label">Qty</span>
            <span className="meta-value">
              {job.QtyOrdered}
              {job.Unit ? ` ${job.Unit}` : ""}
            </span>
          </div>
          <div className="meta-item">
            <span className="meta-label">Due</span>
            <span className="meta-value">{formatDue(job.DueDate)}</span>
          </div>
          {job.CustomerName ? (
            <div className="meta-item meta-item-wide">
              <span className="meta-label">Customer</span>
              <span className="meta-value">{job.CustomerName}</span>
            </div>
          ) : null}
        </div>
      </header>

      {actionError && (
        <div className="alert alert-error" role="alert">
          {actionError}
        </div>
      )}
      {actionOk && !actionError && (
        <div className="alert alert-ok" role="status">
          {actionOk}
        </div>
      )}

      {selectedStep && (
        <section className="current-step-panel panel" aria-label="Selected step">
          <div className="current-step-label">Selected step</div>
          <h2>
            {selectedStep.sequence}. {selectedStep.processName}
          </h2>
          <div className="current-step-meta">
            {selectedStep.workstationName && (
              <span>{selectedStep.workstationName}</span>
            )}
            <span>{progressLabel(selectedStep.progressState)}</span>
            <span>{selectedStep.elapsedTime || 0} min</span>
          </div>

          <div className="action-grid">
            {(selectedStep.progressState === "idle" ||
              selectedStep.progressState === "stopped" ||
              !selectedStep.progressState) &&
              selectedStep.status !== "Completed" && (
                <button
                  type="button"
                  className="btn btn-primary btn-action"
                  disabled={saving}
                  onClick={() => void runAction(selectedStep.id, "start")}
                >
                  Start
                </button>
              )}

            {selectedStep.progressState === "running" && (
              <>
                <button
                  type="button"
                  className="btn btn-secondary btn-action"
                  disabled={saving}
                  onClick={() => void runAction(selectedStep.id, "pause")}
                >
                  Pause
                </button>
                <button
                  type="button"
                  className="btn btn-success btn-action"
                  disabled={saving}
                  onClick={() => void runAction(selectedStep.id, "complete")}
                >
                  Complete
                </button>
              </>
            )}

            {selectedStep.progressState === "paused" && (
              <>
                <button
                  type="button"
                  className="btn btn-primary btn-action"
                  disabled={saving}
                  onClick={() => void runAction(selectedStep.id, "resume")}
                >
                  Resume
                </button>
                <button
                  type="button"
                  className="btn btn-success btn-action"
                  disabled={saving}
                  onClick={() => void runAction(selectedStep.id, "complete")}
                >
                  Complete
                </button>
              </>
            )}
          </div>
        </section>
      )}

      <section className="steps-section" aria-label="Routing steps">
        <h3>Routing</h3>
        <p className="section-hint">Tap a step to select it, then use Start / Pause / Resume / Complete.</p>
        {sortedSteps.length === 0 && (
          <div className="state-msg">No routing steps on this job.</div>
        )}
        <ol className="step-list">
          {sortedSteps.map((step) => {
            const isSelected = selectedStep?.id === step.id;
            return (
              <li key={step.id}>
                <button
                  type="button"
                  className={`step-item${isSelected ? " is-current" : ""}${
                    step.status === "Completed" ? " is-done" : ""
                  }`}
                  onClick={() => setSelectedStepId(step.id)}
                  aria-pressed={isSelected}
                >
                  <div className="step-seq">{step.sequence}</div>
                  <div className="step-body">
                    <div className="step-name">{step.processName}</div>
                    <div className="step-sub">
                      {step.workstationName || "Unassigned"}
                      {" · "}
                      {step.status || "Pending"}
                      {" · "}
                      {progressLabel(step.progressState)}
                      {typeof step.elapsedTime === "number"
                        ? ` · ${step.elapsedTime} min`
                        : ""}
                    </div>
                  </div>
                </button>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}
