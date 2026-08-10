import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import {
  commitLiveElapsed,
  computeElapsedSeconds,
  deriveJobStatus,
  formatElapsedDuration,
  getCommittedSeconds,
  getCurrentStep,
  isStepCompleted,
  JobOrderDetail,
  JobOrderRoutingStep,
  JobOrderService,
  JOB_STEP_PAUSE_REASONS,
  ProgressState,
  toElapsedFields,
} from "../services/jobOrderService";
import { formatJobNumber } from "../utils/formatJobNumber";

type TrackingDialog =
  | { type: "pause"; stepId: number }
  | { type: "complete"; stepId: number }
  | { type: "reopen"; stepId: number }
  | null;

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

function statusBadge(status: string): string {
  const s = (status || "").toLowerCase();
  if (s.includes("complete")) return "badge badge-done";
  if (s.includes("progress") || s.includes("ship")) return "badge badge-active";
  if (s.includes("cancel")) return "badge badge-warn";
  return "badge badge-idle";
}

export function JobDetailPage() {
  const { jobOrderId } = useParams<{ jobOrderId: string }>();
  const { userName } = useAuth();
  const [job, setJob] = useState<JobOrderDetail | null>(null);
  const jobRef = useRef<JobOrderDetail | null>(null);
  const stepsRef = useRef<JobOrderRoutingStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionOk, setActionOk] = useState("");
  const [selectedStepId, setSelectedStepId] = useState<number | null>(null);
  const [elapsedTick, setElapsedTick] = useState(0);
  const [trackingDialog, setTrackingDialog] = useState<TrackingDialog>(null);
  const [completeQtyInput, setCompleteQtyInput] = useState("");
  const [completeQtyError, setCompleteQtyError] = useState("");
  const [qtyDraft, setQtyDraft] = useState("");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearDisplayTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startDisplayTimer = useCallback(() => {
    clearDisplayTimer();
    timerRef.current = setInterval(() => {
      setElapsedTick((t) => t + 1);
    }, 1000);
  }, [clearDisplayTimer]);

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
        jobRef.current = null;
        stepsRef.current = [];
        return;
      }
      setJob(detail);
      jobRef.current = detail;
      stepsRef.current = detail.RoutingSteps || [];
      syncSelectedStep(detail.RoutingSteps);

      clearDisplayTimer();
      const anyRunning = detail.RoutingSteps?.some(
        (s) => s.progressState === "running"
      );
      if (anyRunning) startDisplayTimer();
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
  }, [jobOrderId, clearDisplayTimer, startDisplayTimer, syncSelectedStep]);

  useEffect(() => {
    void loadJob();
    return () => clearDisplayTimer();
  }, [loadJob, clearDisplayTimer]);

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

  useEffect(() => {
    if (selectedStep) {
      setQtyDraft(String(selectedStep.qtyProduced ?? 0));
    }
  }, [selectedStep?.id, selectedStep?.qtyProduced]);

  // Keep tick dependency so running clocks re-render.
  void elapsedTick;

  const persistTrackingSteps = async (
    updatedSteps: JobOrderRoutingStep[],
    successMessage?: string
  ): Promise<boolean> => {
    const current = jobRef.current;
    if (!current?.JobOrderID) return false;

    setSaving(true);
    setActionError("");
    setActionOk("");

    const stepsToSave = commitLiveElapsed(updatedSteps);
    const statusToSave = deriveJobStatus(current.Status, stepsToSave);
    const payload: JobOrderDetail = {
      ...current,
      Status: statusToSave,
      RoutingSteps: stepsToSave,
    };

    setJob(payload);
    jobRef.current = payload;
    stepsRef.current = stepsToSave;

    try {
      await JobOrderService.saveJobOrder(payload);
      if (successMessage) setActionOk(successMessage);

      // Soft refresh to stay aligned, but keep live startTime for running steps
      const refreshed = await JobOrderService.getJobOrderById(current.JobOrderID);
      if (refreshed) {
        setJob(refreshed);
        jobRef.current = refreshed;
        stepsRef.current = refreshed.RoutingSteps || [];
        syncSelectedStep(refreshed.RoutingSteps);
        clearDisplayTimer();
        if (refreshed.RoutingSteps?.some((s) => s.progressState === "running")) {
          startDisplayTimer();
        }
      }
      return true;
    } catch (err: unknown) {
      const ax = err as {
        response?: { data?: { message?: string; error?: string } };
        message?: string;
      };
      setActionError(
        `Could not save step progress: ${
          ax?.response?.data?.error ||
          ax?.response?.data?.message ||
          ax?.message ||
          "Unknown error"
        }`
      );
      await loadJob();
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleStartStep = async (stepId: number) => {
    const step = stepsRef.current.find((s) => s.id === stepId);
    if (!step || isStepCompleted(step) || saving) return;

    const updatedSteps = stepsRef.current.map((s) =>
      s.id === stepId
        ? {
            ...s,
            progressState: "running" as const,
            startTime: new Date().toISOString(),
            elapsedSeconds: getCommittedSeconds(s),
            elapsedTime: Math.floor(getCommittedSeconds(s) / 60),
            status: "In Progress",
            pauseReason: undefined,
            technicianName: userName || s.technicianName,
          }
        : s
    );

    startDisplayTimer();
    await persistTrackingSteps(updatedSteps, "Step started");
  };

  const requestPauseStep = (stepId: number) => {
    setTrackingDialog({ type: "pause", stepId });
  };

  const confirmPauseStep = async (reason: string) => {
    const stepId =
      trackingDialog?.type === "pause" ? trackingDialog.stepId : undefined;
    setTrackingDialog(null);
    if (stepId == null || saving) return;

    const nowMs = Date.now();
    const updatedSteps = stepsRef.current.map((s) => {
      if (s.id !== stepId) return s;
      return {
        ...s,
        progressState: "paused" as const,
        ...toElapsedFields(computeElapsedSeconds(s, nowMs)),
        startTime: undefined,
        pauseReason: reason || undefined,
      };
    });

    const stillRunning = updatedSteps.some((s) => s.progressState === "running");
    if (!stillRunning) clearDisplayTimer();

    await persistTrackingSteps(updatedSteps, "Step paused");
  };

  const requestCompleteStep = (stepId: number) => {
    const step = stepsRef.current.find((s) => s.id === stepId);
    if (!step || isStepCompleted(step)) return;
    const initialQty =
      step.qtyProduced && step.qtyProduced > 0
        ? step.qtyProduced
        : jobRef.current?.QtyOrdered || 0;
    setCompleteQtyInput(String(initialQty));
    setCompleteQtyError("");
    setTrackingDialog({ type: "complete", stepId });
  };

  const confirmCompleteStep = async (forceComplete = false) => {
    const stepId =
      trackingDialog?.type === "complete" ? trackingDialog.stepId : undefined;
    if (stepId == null) return;

    const step = stepsRef.current.find((s) => s.id === stepId);
    if (!step || isStepCompleted(step)) {
      setTrackingDialog(null);
      return;
    }

    const qty = parseInt(completeQtyInput, 10);
    if (Number.isNaN(qty) || qty < 0) {
      setCompleteQtyError("Enter a valid quantity (0 or greater).");
      return;
    }

    const orderQty = jobRef.current?.QtyOrdered || 0;
    const meetsOrderQty = orderQty <= 0 || qty >= orderQty;
    const shouldComplete = forceComplete || meetsOrderQty;

    setTrackingDialog(null);
    setCompleteQtyError("");
    const nowMs = Date.now();

    if (!shouldComplete) {
      const updatedSteps = stepsRef.current.map((s) => {
        if (s.id !== stepId) return s;
        return {
          ...s,
          qtyProduced: qty,
          progressState: "paused" as const,
          status: "In Progress",
          ...toElapsedFields(computeElapsedSeconds(s, nowMs)),
          startTime: undefined,
          pauseReason: s.pauseReason || "Partial quantity",
        };
      });
      const stillRunning = updatedSteps.some((s) => s.progressState === "running");
      if (!stillRunning) clearDisplayTimer();
      await persistTrackingSteps(
        updatedSteps,
        `Qty saved (${qty} of ${orderQty}). Operation stays open until order qty is met.`
      );
      return;
    }

    const updatedSteps = stepsRef.current.map((s) => {
      if (s.id !== stepId) return s;
      return {
        ...s,
        qtyProduced: qty,
        progressState: "stopped" as const,
        status: "Completed",
        ...toElapsedFields(computeElapsedSeconds(s, nowMs)),
        startTime: undefined,
      };
    });
    const stillRunning = updatedSteps.some((s) => s.progressState === "running");
    if (!stillRunning) clearDisplayTimer();
    await persistTrackingSteps(updatedSteps, "Operation completed");

    const next = getCurrentStep(updatedSteps);
    if (next && !isStepCompleted(next)) {
      setSelectedStepId(next.id);
    }
  };

  const confirmReopenStep = async () => {
    const stepId =
      trackingDialog?.type === "reopen" ? trackingDialog.stepId : undefined;
    setTrackingDialog(null);
    if (stepId == null || saving) return;

    const updatedSteps = stepsRef.current.map((s) =>
      s.id === stepId
        ? {
            ...s,
            progressState: "idle" as const,
            status: "Pending",
            startTime: undefined,
          }
        : s
    );
    await persistTrackingSteps(
      updatedSteps,
      "Operation reopened — job set to In Progress if it was Completed"
    );
  };

  const handleSaveQty = async () => {
    if (!selectedStep || saving) return;
    const qty = parseInt(qtyDraft, 10);
    if (Number.isNaN(qty) || qty < 0) {
      setActionError("Enter a valid quantity (0 or greater).");
      return;
    }
    const updatedSteps = stepsRef.current.map((s) =>
      s.id === selectedStep.id ? { ...s, qtyProduced: qty } : s
    );
    await persistTrackingSteps(updatedSteps, "Quantity saved");
  };

  if (loading) {
    return <div className="py-10 text-center text-slate-500">Loading job…</div>;
  }

  if (error || !job) {
    return (
      <div>
        <Link to="/jobs" className="mb-3 inline-flex min-h-10 items-center font-semibold text-accent">
          ← Jobs
        </Link>
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-700" role="alert">
          {error || "Job not found"}
        </div>
      </div>
    );
  }

  const orderQty = job.QtyOrdered || 0;
  const completeParsed = parseInt(completeQtyInput, 10);
  const completeQtyNum = Number.isNaN(completeParsed) ? null : completeParsed;
  const underOrder =
    completeQtyNum != null && orderQty > 0 && completeQtyNum < orderQty;
  const meetsOrder =
    completeQtyNum != null && (orderQty <= 0 || completeQtyNum >= orderQty);
  const zeroWarn = completeQtyNum === 0;
  const overWarn =
    completeQtyNum != null && orderQty > 0 && completeQtyNum > orderQty;

  return (
    <div>
      <Link to="/jobs" className="mb-3 inline-flex min-h-10 items-center font-semibold text-accent">
        ← Jobs
      </Link>

      <header className="card mb-4 p-4">
        <div className="mb-2 flex items-start justify-between gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {formatJobNumber(job.JobOrderNumber || job.JobNumber || job.JobOrderID)}
          </h1>
          <span className={statusBadge(job.Status)}>{job.Status}</span>
        </div>
        <div className="mb-3 flex flex-col gap-0.5">
          <strong className="text-slate-900">{job.PartNo || "—"}</strong>
          {job.PartName ? <span className="text-sm text-slate-500">{job.PartName}</span> : null}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-slate-200 bg-canvas px-3 py-2.5">
            <div className="text-[0.7rem] font-bold uppercase tracking-wide text-slate-500">Qty</div>
            <div className="font-semibold text-slate-900">
              {job.QtyOrdered}
              {job.Unit ? ` ${job.Unit}` : ""}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-canvas px-3 py-2.5">
            <div className="text-[0.7rem] font-bold uppercase tracking-wide text-slate-500">Due</div>
            <div className="font-semibold text-slate-900">{formatDue(job.DueDate)}</div>
          </div>
          {job.CustomerName ? (
            <div className="col-span-2 rounded-xl border border-slate-200 bg-canvas px-3 py-2.5">
              <div className="text-[0.7rem] font-bold uppercase tracking-wide text-slate-500">
                Customer
              </div>
              <div className="font-semibold text-slate-900">{job.CustomerName}</div>
            </div>
          ) : null}
        </div>
      </header>

      {actionError && (
        <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-700" role="alert">
          {actionError}
        </div>
      )}
      {actionOk && !actionError && (
        <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-700" role="status">
          {actionOk}
        </div>
      )}

      {selectedStep && (
        <section className="card mb-5 p-4" aria-label="Selected step">
          <div className="mb-1 text-[0.72rem] font-bold uppercase tracking-wide text-slate-500">
            Selected step
          </div>
          <h2 className="mb-2 text-xl font-bold tracking-tight text-slate-900">
            {selectedStep.sequence}. {selectedStep.processName}
          </h2>
          <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
            {selectedStep.workstationName && <span>{selectedStep.workstationName}</span>}
            <span>{progressLabel(selectedStep.progressState)}</span>
            <span className="font-semibold tabular-nums text-slate-800">
              {formatElapsedDuration(computeElapsedSeconds(selectedStep))}
            </span>
          </div>
          {selectedStep.progressState === "paused" && selectedStep.pauseReason && (
            <div className="mb-3 rounded-lg bg-orange-50 px-3 py-2 text-sm font-semibold text-orange-800">
              Hold: {selectedStep.pauseReason}
            </div>
          )}

          {!isStepCompleted(selectedStep) && (
            <div className="mb-4 grid grid-cols-[1fr_auto] gap-2">
              <label className="field">
                <span>Qty produced</span>
                <input
                  className="field-input"
                  type="number"
                  min={0}
                  value={qtyDraft}
                  onChange={(e) => setQtyDraft(e.target.value)}
                  disabled={saving}
                />
              </label>
              <button
                type="button"
                className="btn btn-secondary self-end"
                disabled={saving}
                onClick={() => void handleSaveQty()}
              >
                Save qty
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 gap-2.5 min-[380px]:grid-cols-2">
            {(selectedStep.progressState === "idle" ||
              !selectedStep.progressState) &&
              !isStepCompleted(selectedStep) && (
                <button
                  type="button"
                  className="btn btn-primary text-[1.05rem]"
                  disabled={saving}
                  onClick={() => void handleStartStep(selectedStep.id)}
                >
                  Start
                </button>
              )}

            {selectedStep.progressState === "running" && (
              <>
                <button
                  type="button"
                  className="btn btn-secondary text-[1.05rem]"
                  disabled={saving}
                  onClick={() => requestPauseStep(selectedStep.id)}
                >
                  Pause
                </button>
                <button
                  type="button"
                  className="btn btn-success text-[1.05rem]"
                  disabled={saving}
                  onClick={() => requestCompleteStep(selectedStep.id)}
                >
                  Complete
                </button>
              </>
            )}

            {selectedStep.progressState === "paused" && (
              <>
                <button
                  type="button"
                  className="btn btn-primary text-[1.05rem]"
                  disabled={saving}
                  onClick={() => void handleStartStep(selectedStep.id)}
                >
                  Resume
                </button>
                <button
                  type="button"
                  className="btn btn-success text-[1.05rem]"
                  disabled={saving}
                  onClick={() => requestCompleteStep(selectedStep.id)}
                >
                  Complete
                </button>
              </>
            )}

            {isStepCompleted(selectedStep) && (
              <button
                type="button"
                className="btn btn-secondary text-[1.05rem] min-[380px]:col-span-2"
                disabled={saving}
                onClick={() =>
                  setTrackingDialog({ type: "reopen", stepId: selectedStep.id })
                }
              >
                Reopen
              </button>
            )}
          </div>
        </section>
      )}

      <section aria-label="Routing steps">
        <h3 className="mb-1 text-base font-bold tracking-tight text-slate-900">Routing</h3>
        <p className="mb-3 text-sm text-slate-500">
          Tap a step to select it, then use Start / Pause / Resume / Complete.
        </p>
        {sortedSteps.length === 0 && (
          <div className="py-8 text-center text-slate-500">No routing steps on this job.</div>
        )}
        <ol className="space-y-2.5">
          {sortedSteps.map((step) => {
            const isSelected = selectedStep?.id === step.id;
            const elapsed = formatElapsedDuration(computeElapsedSeconds(step));
            return (
              <li key={step.id}>
                <button
                  type="button"
                  className={`grid w-full grid-cols-[2.35rem_1fr] gap-3 rounded-xl border p-3.5 text-left shadow-sm transition ${
                    isSelected
                      ? "border-blue-300 bg-accent-soft shadow-[inset_0_0_0_1px_#93c5fd]"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  } ${isStepCompleted(step) ? "opacity-75" : ""}`}
                  onClick={() => setSelectedStepId(step.id)}
                  aria-pressed={isSelected}
                >
                  <div
                    className={`grid h-9 w-9 place-items-center rounded-full text-sm font-bold text-white ${
                      isSelected ? "bg-accent" : "bg-brand"
                    }`}
                  >
                    {step.sequence}
                  </div>
                  <div>
                    <div className="mb-0.5 font-bold text-slate-900">{step.processName}</div>
                    <div className="text-sm text-slate-500">
                      {step.workstationName || "Unassigned"}
                      {" · "}
                      {step.status || "Pending"}
                      {" · "}
                      {progressLabel(step.progressState)}
                      {" · "}
                      <span className="tabular-nums">{elapsed}</span>
                      {typeof step.qtyProduced === "number"
                        ? ` · Qty ${step.qtyProduced}`
                        : ""}
                      {step.progressState === "paused" && step.pauseReason
                        ? ` · Hold: ${step.pauseReason}`
                        : ""}
                    </div>
                  </div>
                </button>
              </li>
            );
          })}
        </ol>
      </section>

      {trackingDialog && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center"
          role="presentation"
          onClick={() => {
            if (!saving) setTrackingDialog(null);
          }}
        >
          <div
            className="card w-full max-w-md p-4"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            {trackingDialog.type === "pause" && (
              <>
                <h4 className="mb-1 text-lg font-bold text-slate-900">Pause operation</h4>
                <p className="mb-3 text-sm text-slate-500">
                  Optional hold reason (you can skip):
                </p>
                <div className="mb-3 space-y-2">
                  {JOB_STEP_PAUSE_REASONS.map((reason) => (
                    <button
                      key={reason}
                      type="button"
                      className="btn btn-secondary w-full justify-start"
                      disabled={saving}
                      onClick={() => void confirmPauseStep(reason)}
                    >
                      {reason}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={saving}
                    onClick={() => setTrackingDialog(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={saving}
                    onClick={() => void confirmPauseStep("")}
                  >
                    Pause without reason
                  </button>
                </div>
              </>
            )}

            {trackingDialog.type === "complete" && (() => {
              const dialogStep = stepsRef.current.find(
                (s) => s.id === trackingDialog.stepId
              );
              return (
              <>
                <h4 className="mb-1 text-lg font-bold text-slate-900">Complete operation</h4>
                <p className="mb-3 text-sm text-slate-500">
                  {dialogStep
                    ? `Step ${dialogStep.sequence}: ${dialogStep.processName}`
                    : "Enter quantity produced for this operation."}
                </p>
                <div className="mb-3 grid grid-cols-2 gap-2">
                  <div className="rounded-xl border border-slate-200 bg-canvas px-3 py-2.5">
                    <div className="text-[0.7rem] font-bold uppercase tracking-wide text-slate-500">
                      Order qty
                    </div>
                    <div className="font-semibold">
                      {orderQty} {job.Unit || ""}
                    </div>
                  </div>
                  <label className="field">
                    <span>Qty produced</span>
                    <input
                      className="field-input"
                      type="number"
                      min={0}
                      autoFocus
                      value={completeQtyInput}
                      onChange={(e) => {
                        setCompleteQtyInput(e.target.value);
                        setCompleteQtyError("");
                      }}
                      disabled={saving}
                    />
                  </label>
                </div>
                {completeQtyError && (
                  <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {completeQtyError}
                  </div>
                )}
                {!completeQtyError && underOrder && (
                  <div className="mb-3 rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-800">
                    Qty produced is less than order qty. Saving keeps this operation open.
                    Use Complete anyway only if the operation is finished short.
                  </div>
                )}
                {!completeQtyError && zeroWarn && meetsOrder && (
                  <div className="mb-3 rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-800">
                    Qty produced is 0. You can still complete if this operation had no output.
                  </div>
                )}
                {!completeQtyError && overWarn && (
                  <div className="mb-3 rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-800">
                    Qty produced exceeds order qty. Confirm only if overbuild is intended.
                  </div>
                )}
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={saving}
                    onClick={() => setTrackingDialog(null)}
                  >
                    Cancel
                  </button>
                  {underOrder ? (
                    <>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={saving}
                        onClick={() => void confirmCompleteStep(false)}
                      >
                        {saving ? "Saving…" : "Save qty (keep open)"}
                      </button>
                      <button
                        type="button"
                        className="btn btn-success"
                        disabled={saving}
                        onClick={() => void confirmCompleteStep(true)}
                      >
                        Complete anyway
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-success"
                      disabled={saving}
                      onClick={() => void confirmCompleteStep(true)}
                    >
                      {saving ? "Saving…" : "Complete"}
                    </button>
                  )}
                </div>
              </>
              );
            })()}

            {trackingDialog.type === "reopen" && (
              <>
                <h4 className="mb-1 text-lg font-bold text-slate-900">Reopen operation</h4>
                <p className="mb-4 text-sm text-slate-500">
                  This will mark the operation as pending again and set the job to In Progress if
                  it was Completed. Elapsed time is kept; the clock stays stopped until you Start.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={saving}
                    onClick={() => setTrackingDialog(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={saving}
                    onClick={() => void confirmReopenStep()}
                  >
                    Reopen
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
