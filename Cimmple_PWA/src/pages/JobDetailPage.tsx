import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
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
  try {
    const d = new Date(dueDate);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString(undefined, {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    }
  } catch {
    // fall through
  }
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


export function JobDetailPage() {
  const { jobOrderId } = useParams<{ jobOrderId: string }>();
  const [searchParams] = useSearchParams();
  const { userName } = useAuth();
  const [job, setJob] = useState<JobOrderDetail | null>(null);
  const jobRef = useRef<JobOrderDetail | null>(null);
  const stepsRef = useRef<JobOrderRoutingStep[]>([]);
  const timerSectionRef = useRef<HTMLDivElement | null>(null);
  const deepLinkAppliedRef = useRef(false);
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
  const [qtyError, setQtyError] = useState("");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const deepLinkStepId = Number(searchParams.get("stepId") || 0);
  const focusTimer = searchParams.get("focus") === "timer";

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
    deepLinkAppliedRef.current = false;
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

      const queryStepId = Number(
        new URLSearchParams(window.location.search).get("stepId") || 0
      );
      if (queryStepId > 0) {
        const match = detail.RoutingSteps?.find((s) => s.id === queryStepId);
        if (match) {
          setSelectedStepId(match.id);
        } else {
          syncSelectedStep(detail.RoutingSteps);
          setActionError("Job or step not found for this barcode");
        }
      } else {
        syncSelectedStep(detail.RoutingSteps);
      }

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

  // After load + selection: scroll to timer when focus=timer (from Dashboard scan)
  useEffect(() => {
    if (loading || !job || !focusTimer || deepLinkAppliedRef.current) return;
    if (deepLinkStepId > 0 && selectedStepId !== deepLinkStepId) return;

    deepLinkAppliedRef.current = true;
    const t = window.setTimeout(() => {
      timerSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 120);
    return () => window.clearTimeout(t);
  }, [loading, job, focusTimer, deepLinkStepId, selectedStepId]);

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

  // Keep qty draft in sync with selected step (same field as Cimmple_UI Qty Produced column)
  useEffect(() => {
    if (selectedStep) {
      setQtyDraft(String(selectedStep.qtyProduced ?? 0));
      setQtyError("");
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

  /** Local qty update (mirrors Cimmple_UI handleUpdateQtyProduced). */
  const handleUpdateQtyProduced = (stepId: number, qty: number) => {
    const updatedSteps = stepsRef.current.map((s) =>
      s.id === stepId ? { ...s, qtyProduced: qty } : s
    );
    stepsRef.current = updatedSteps;
    setJob((prev) =>
      prev ? { ...prev, RoutingSteps: updatedSteps } : prev
    );
    if (jobRef.current) {
      jobRef.current = { ...jobRef.current, RoutingSteps: updatedSteps };
    }
  };

  /**
   * Persist produced qty for the selected step.
   * PWA has no separate Job Save form — Save Qty persists immediately via the same
   * tracking API path used for Start/Pause/Complete.
   */
  const handleSaveQty = async () => {
    if (!selectedStep || saving) return;
    const qty = parseInt(qtyDraft, 10);
    if (Number.isNaN(qty) || qty < 0) {
      setQtyError("Enter a valid quantity (0 or greater).");
      return;
    }
    setQtyError("");
    const updatedSteps = stepsRef.current.map((s) =>
      s.id === selectedStep.id ? { ...s, qtyProduced: qty } : s
    );
    await persistTrackingSteps(updatedSteps, "Quantity saved");
  };

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-10 w-10 bg-slate-200 rounded-full" />
          <div className="space-y-1">
            <div className="h-5 bg-slate-200 rounded-md w-32" />
            <div className="h-3 bg-slate-100 rounded-md w-24" />
          </div>
        </div>
        <div className="bg-white rounded-3xl border border-slate-200/60 p-5 space-y-4">
          <div className="flex justify-between items-start">
            <div className="space-y-2">
              <div className="h-5 bg-slate-200 rounded-full w-20" />
              <div className="h-7 bg-slate-200 rounded-md w-40" />
            </div>
            <div className="h-16 w-32 bg-slate-800 rounded-2xl" />
          </div>
          <div className="grid grid-cols-3 gap-2 py-3 border-y border-slate-100">
            <div className="h-8 bg-slate-100 rounded-xl" />
            <div className="h-8 bg-slate-100 rounded-xl" />
            <div className="h-8 bg-slate-100 rounded-xl" />
          </div>
        </div>
        <div className="bg-slate-900 rounded-3xl p-6 h-28" />
      </div>
    );
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
    <div className="pb-[calc(7.5rem+env(safe-area-inset-bottom))]">
      {/* Header with Back Button */}
      <header className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            to="/jobs"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white text-slate-700 shadow-sm hover:bg-slate-100 transition-colors"
            aria-label="Back to Jobs"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M15 19l-7-7 7-7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </Link>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 leading-tight">Job Details</h1>
            <p className="text-xs font-semibold text-slate-400">
              {formatJobNumber(job.JobOrderNumber || job.JobNumber || job.JobOrderID)}
            </p>
          </div>
        </div>
      </header>

      {/* Card 1: Job Overview & Metrics */}
      <div className="bg-white rounded-3xl border border-slate-200/60 shadow-[0_2px_12px_rgba(0,0,0,0.03)] p-5 mb-4 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="bg-black text-white text-[0.6rem] font-black px-3 py-1 rounded-full uppercase tracking-wider">
                {job.Status || "IN PROGRESS"}
              </span>
              <span className="text-emerald-500 font-extrabold text-xs">Live</span>
            </div>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className="text-2xl font-black tracking-tight text-slate-900">
                {formatJobNumber(job.JobOrderNumber || job.JobNumber || job.JobOrderID)}
              </span>
              {(job.JobPriority ?? 0) === 2 && (
                <span className="rounded-full bg-red-100 px-2 py-0.5 text-[0.6rem] font-extrabold uppercase tracking-wide text-red-700">
                  Urgent
                </span>
              )}
              {(job.JobPriority ?? 0) === 1 && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[0.6rem] font-extrabold uppercase tracking-wide text-amber-700">
                  High
                </span>
              )}
            </div>
            {job.CustomerName && (
              <div className="text-xs font-semibold text-slate-400 mt-0.5">
                Customer: {job.CustomerName}
              </div>
            )}
          </div>

          <div className="bg-black rounded-2xl p-3 text-white text-center w-32 shadow-md shrink-0">
            <span className="text-[0.55rem] font-extrabold text-slate-400 tracking-widest uppercase block mb-0.5">
              ELAPSED
            </span>
            <span className="font-mono text-lg font-black tracking-wider text-white block">
              {formatElapsedDuration(job.RoutingSteps ? job.RoutingSteps.reduce((acc, s) => acc + computeElapsedSeconds(s), 0) : 0)}
            </span>
          </div>
        </div>

        {/* Part, Target, Remaining Grid */}
        <div className="grid grid-cols-3 gap-2 mt-4">
          <div className="bg-slate-50/80 rounded-2xl p-3 text-center">
            <span className="text-[0.55rem] font-extrabold text-slate-400 uppercase block mb-1">PART</span>
            <span className="text-xs font-extrabold text-slate-900 truncate block">{job.PartNo || "—"}</span>
          </div>
          <div className="bg-slate-50/80 rounded-2xl p-3 text-center">
            <span className="text-[0.55rem] font-extrabold text-slate-400 uppercase block mb-1">TARGET</span>
            <span className="text-xs font-extrabold text-slate-900 truncate block">{job.QtyOrdered} {job.Unit || "pcs"}</span>
          </div>
          <div className="bg-slate-50/80 rounded-2xl p-3 text-center">
            <span className="text-[0.55rem] font-extrabold text-slate-400 uppercase block mb-1">REMAINING</span>
            <span className="text-xs font-extrabold text-slate-900 truncate block">
              {Math.max(0, job.QtyOrdered - (job.RoutingSteps?.[job.RoutingSteps.length - 1]?.qtyProduced || 0))} {job.Unit || "pcs"}
            </span>
          </div>
        </div>

        {/* Progress Bar Section */}
        <div className="pt-2">
          <div className="flex items-center justify-between text-xs font-bold mb-1.5">
            <span className="text-slate-700">Progress</span>
            <span className="text-slate-900 font-black">
              {orderQty > 0 ? Math.min(100, Math.round(((job.RoutingSteps?.[job.RoutingSteps.length - 1]?.qtyProduced || 0) / orderQty) * 100)) : 0}%
            </span>
          </div>
          <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden mb-2">
            <div
              className="h-full bg-black rounded-full transition-all duration-300"
              style={{ width: `${orderQty > 0 ? Math.min(100, ((job.RoutingSteps?.[job.RoutingSteps.length - 1]?.qtyProduced || 0) / orderQty) * 100) : 0}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[0.7rem] font-semibold text-slate-400">
            <span>Produced {job.RoutingSteps?.[job.RoutingSteps.length - 1]?.qtyProduced || 0}</span>
            <span>Due {formatDue(job.DueDate)}</span>
          </div>
        </div>
      </div>

      {actionError && (
        <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm font-semibold text-red-700" role="alert">
          {actionError}
        </div>
      )}
      {actionOk && !actionError && (
        <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm font-semibold text-emerald-700" role="status">
          {actionOk}
        </div>
      )}

      <Link
        to={`/quality/new?jobOrderId=${job.JobOrderID}`}
        className="mb-4 flex min-h-tap w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-800 shadow-sm hover:bg-slate-50"
      >
        Report NCR
      </Link>

      {/* Card 2: Selected Routing Step */}
      {selectedStep && (
        <div className="bg-white rounded-3xl border border-slate-200/60 shadow-[0_2px_12px_rgba(0,0,0,0.03)] p-5 mb-4">
          <div className="text-[0.65rem] font-black uppercase tracking-widest text-slate-400 mb-2">
            SELECTED ROUTING STEP
          </div>
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <h2 className="text-lg font-black tracking-tight text-slate-900">
                {selectedStep.sequence}. {selectedStep.processName}
              </h2>
              <div className="text-xs font-semibold text-slate-400 mt-0.5">
                {selectedStep.workstationName ? `Machine ${selectedStep.workstationName}` : "Unassigned"} · Operator assigned · Queue clear
              </div>
            </div>
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-500 flex items-center justify-center shrink-0">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
              </svg>
            </div>
          </div>

          {/* Live Timer Dark Card */}
          <div
            ref={timerSectionRef}
            className="bg-slate-900 rounded-3xl p-5 text-white my-4 shadow-lg"
          >
            <div className="flex items-center justify-between text-[0.6rem] font-black uppercase tracking-widest text-slate-400 mb-1">
              <span>LIVE TIMER</span>
              {selectedStep.progressState === "running" ? (
                <span className="bg-emerald-500/20 text-emerald-400 text-[0.65rem] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  Running
                </span>
              ) : (
                <span className="bg-slate-800 text-slate-300 text-[0.65rem] font-bold px-2.5 py-0.5 rounded-full">
                  {progressLabel(selectedStep.progressState)}
                </span>
              )}
            </div>
            <div className="font-mono text-3xl font-black tracking-wider text-white my-2">
              {formatElapsedDuration(computeElapsedSeconds(selectedStep))}
            </div>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div className="bg-slate-800/80 rounded-xl p-3">
                <span className="text-[0.55rem] font-bold text-slate-400 uppercase block mb-0.5">STARTED</span>
                <span className="text-xs font-extrabold text-white block">
                  {selectedStep.startTime ? new Date(selectedStep.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "08:12 AM"}
                </span>
              </div>
              <div className="bg-slate-800/80 rounded-xl p-3">
                <span className="text-[0.55rem] font-bold text-slate-400 uppercase block mb-0.5">CYCLE AVG</span>
                <span className="text-xs font-extrabold text-white block">03:24</span>
              </div>
            </div>
          </div>

          {/* Qty Produced — same field/validation as Cimmple_UI JobSlideout */}
          <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5">
            <div className="mb-1.5">
              <label htmlFor="pwa-qty-produced" className="text-[0.65rem] font-extrabold uppercase tracking-wide text-slate-500">
                Qty Produced
              </label>
            </div>
            <div className="flex gap-2">
              <input
                id="pwa-qty-produced"
                type="number"
                min={0}
                inputMode="numeric"
                className="h-9 min-h-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-900 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200"
                value={qtyDraft}
                disabled={saving}
                onChange={(e) => {
                  const raw = e.target.value;
                  setQtyDraft(raw);
                  setQtyError("");
                  const parsed = parseInt(raw, 10);
                  if (!Number.isNaN(parsed) && parsed >= 0) {
                    handleUpdateQtyProduced(selectedStep.id, parsed);
                  }
                }}
              />
              <button
                type="button"
                className="h-9 shrink-0 rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-slate-800 hover:bg-slate-50 disabled:opacity-55"
                disabled={saving}
                onClick={() => void handleSaveQty()}
              >
                {saving ? "Saving…" : "Save qty"}
              </button>
            </div>
            {qtyError && (
              <div className="mt-1.5 text-xs font-semibold text-red-600">{qtyError}</div>
            )}
            <p className="mt-1.5 text-[0.7rem] font-medium text-slate-400">
              Enter quantity produced for this operation.
            </p>
          </div>

          {/* 2x2 Action Buttons Grid */}
          <div className="grid grid-cols-2 gap-3 mt-4">
            <button
              type="button"
              className="min-h-tap bg-[#00a86b] text-white font-extrabold text-sm py-3.5 px-4 rounded-2xl flex items-center justify-center gap-2 shadow-sm hover:bg-emerald-600 transition-colors disabled:opacity-50"
              disabled={saving || selectedStep.progressState === "running"}
              onClick={() => void handleStartStep(selectedStep.id)}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z"/>
              </svg>
              Start
            </button>

            <button
              type="button"
              className="min-h-tap bg-[#f1f5f9] text-slate-800 font-extrabold text-sm py-3.5 px-4 rounded-2xl flex items-center justify-center gap-2 hover:bg-slate-200 transition-colors disabled:opacity-50"
              disabled={saving || selectedStep.progressState !== "running"}
              onClick={() => requestPauseStep(selectedStep.id)}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
              </svg>
              Pause
            </button>

            <button
              type="button"
              className="min-h-tap bg-[#f1f5f9] text-slate-800 font-extrabold text-sm py-3.5 px-4 rounded-2xl flex items-center justify-center gap-2 hover:bg-slate-200 transition-colors disabled:opacity-50"
              disabled={saving || selectedStep.progressState !== "paused"}
              onClick={() => void handleStartStep(selectedStep.id)}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
              </svg>
              Resume
            </button>

            <button
              type="button"
              className="min-h-tap bg-black text-white font-extrabold text-sm py-3.5 px-4 rounded-2xl flex items-center justify-center gap-2 shadow-sm hover:bg-slate-800 transition-colors disabled:opacity-50"
              disabled={saving || isStepCompleted(selectedStep)}
              onClick={() => requestCompleteStep(selectedStep.id)}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="12" cy="12" r="9"/>
                <path d="M9 12l2 2 4-4"/>
              </svg>
              Complete
            </button>
          </div>

          {/* Pause Reason Section */}
          {selectedStep.pauseReason && (
            <div className="bg-[#fffbeb] border border-amber-200/80 rounded-2xl p-4 mt-4">
              <div className="text-xs font-extrabold text-amber-800 flex items-center gap-2 mb-2">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                </svg>
                Pause reason
              </div>
              <div className="bg-white rounded-xl border border-amber-200/60 p-3 text-xs font-semibold text-slate-700">
                {selectedStep.pauseReason}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Card 3: Routing Timeline */}
      <div className="bg-white rounded-3xl border border-slate-200/60 shadow-[0_2px_12px_rgba(0,0,0,0.03)] p-5 mb-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <span className="text-[0.65rem] font-black uppercase tracking-widest text-slate-400 block">
              ROUTING TIMELINE
            </span>
            <span className="text-xs text-slate-400 font-medium block mt-0.5">
              Track completed, current, and pending steps
            </span>
          </div>
          <span className="bg-slate-100 text-slate-700 font-bold text-xs px-3 py-1 rounded-full">
            {sortedSteps.filter(s => isStepCompleted(s)).length} of {sortedSteps.length}
          </span>
        </div>

        {sortedSteps.length === 0 && (
          <div className="py-8 text-center text-slate-400 font-bold text-xs">No routing steps on this job.</div>
        )}

        <div className="relative border-l-2 border-slate-100 ml-3.5 pl-6 space-y-4 py-2">
          {sortedSteps.map((step) => {
            const isSelected = selectedStep?.id === step.id;
            const completed = isStepCompleted(step);
            const current = step.progressState === "running" || step.progressState === "paused" || (isSelected && !completed);
            const elapsed = formatElapsedDuration(computeElapsedSeconds(step));

            return (
              <div key={step.id} className="relative">
                {/* Timeline node */}
                <div className="absolute -left-[2.1rem] top-3.5 flex items-center justify-center">
                  {completed ? (
                    <div className="w-7 h-7 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-sm">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <path d="M5 13l4 4L19 7"/>
                      </svg>
                    </div>
                  ) : current ? (
                    <div className="w-7 h-7 rounded-full bg-slate-900 text-white flex items-center justify-center shadow-sm">
                      <span className="w-2.5 h-2.5 rounded-full bg-white"></span>
                    </div>
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-white border-2 border-slate-300 text-slate-400 flex items-center justify-center">
                      <span className="w-2.5 h-2.5 rounded-full border border-slate-300"></span>
                    </div>
                  )}
                </div>

                {/* Step card button */}
                <button
                  type="button"
                  className={`w-full text-left transition-all ${
                    completed
                      ? "bg-[#ecfdf5] border border-emerald-100 rounded-2xl p-4 block hover:border-emerald-200"
                      : current
                      ? "bg-slate-900 text-white rounded-2xl p-4 block shadow-md"
                      : "bg-white border border-slate-200/80 rounded-2xl p-4 block hover:bg-slate-50"
                  }`}
                  onClick={() => setSelectedStepId(step.id)}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className={`text-sm font-extrabold ${current ? "text-white" : "text-slate-900"}`}>
                      {step.sequence}. {step.processName}
                    </div>
                    {completed && (
                      <span className="bg-[#10b981] text-white text-[0.6rem] font-black px-2.5 py-0.5 rounded-full uppercase">
                        COMPLETED
                      </span>
                    )}
                    {current && !completed && (
                      <span className="bg-slate-700 text-slate-200 text-[0.6rem] font-black px-2.5 py-0.5 rounded-full uppercase">
                        CURRENT
                      </span>
                    )}
                    {!completed && !current && (
                      <span className="bg-slate-100 text-slate-500 text-[0.6rem] font-black px-2.5 py-0.5 rounded-full uppercase">
                        PENDING
                      </span>
                    )}
                  </div>

                  <div className={`text-xs font-semibold mt-1 ${current ? "text-slate-300" : completed ? "text-emerald-700" : "text-slate-400"}`}>
                    {completed
                      ? `Finished · ${step.qtyProduced || 0} pcs accepted`
                      : current
                      ? `Running on Machine ${step.workstationName || "A3"} · ${elapsed}`
                      : `Queued after previous step completes`}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span className={`rounded-full px-2 py-0.5 text-[0.6rem] font-extrabold uppercase ${
                      completed ? "bg-emerald-100 text-emerald-700" : current ? "bg-slate-700 text-slate-200" : "bg-slate-100 text-slate-500"
                    }`}>
                      {completed ? "Done" : progressLabel(step.progressState)}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-[0.6rem] font-bold ${
                      current ? "bg-slate-700 text-slate-200" : "bg-slate-100 text-slate-600"
                    }`}>
                      {elapsed}
                    </span>
                    {(step.qtyProduced ?? 0) > 0 && (
                      <span className={`rounded-full px-2 py-0.5 text-[0.6rem] font-bold ${
                        current ? "bg-slate-700 text-slate-200" : "bg-slate-100 text-slate-600"
                      }`}>
                        Qty {step.qtyProduced}
                      </span>
                    )}
                    {step.pauseReason && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[0.6rem] font-bold text-amber-800">
                        Hold
                      </span>
                    )}
                  </div>
                </button>
              </div>
            );
          })}
        </div>
      </div>

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

      {/* Sticky action strip — above bottom tabs */}
      {selectedStep && (
        <div
          className="fixed bottom-[calc(68px+env(safe-area-inset-bottom))] left-0 right-0 z-30 border-t border-slate-200/80 bg-white/95 backdrop-blur-md shadow-[0_-4px_16px_rgba(0,0,0,0.06)]"
        >
          <div className="mx-auto flex max-w-[540px] flex-col gap-2 px-4 py-2.5">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-extrabold text-slate-900">
                  {selectedStep.sequence}. {selectedStep.processName}
                </div>
                <div className="truncate text-[0.7rem] font-semibold text-slate-400">
                  {selectedStep.workstationName
                    ? selectedStep.workstationName
                    : "No workstation"}
                  {" · "}
                  {progressLabel(selectedStep.progressState)}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="font-mono text-base font-black tabular-nums text-slate-900">
                  {formatElapsedDuration(computeElapsedSeconds(selectedStep))}
                </div>
                {selectedStep.progressState === "running" && (
                  <div className="text-[0.6rem] font-bold uppercase tracking-wide text-emerald-600">
                    Running
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              {isStepCompleted(selectedStep) ? (
                <button
                  type="button"
                  className="btn btn-secondary min-h-tap flex-1 text-sm"
                  disabled={saving}
                  onClick={() => setTrackingDialog({ type: "reopen", stepId: selectedStep.id })}
                >
                  Reopen
                </button>
              ) : (
                <>
                  {selectedStep.progressState !== "running" &&
                    selectedStep.progressState !== "paused" && (
                      <button
                        type="button"
                        className="min-h-tap flex-1 rounded-2xl bg-[#00a86b] px-4 text-sm font-extrabold text-white disabled:opacity-50"
                        disabled={saving}
                        onClick={() => void handleStartStep(selectedStep.id)}
                      >
                        Start
                      </button>
                    )}
                  {selectedStep.progressState === "running" && (
                    <button
                      type="button"
                      className="min-h-tap flex-1 rounded-2xl bg-[#f1f5f9] px-4 text-sm font-extrabold text-slate-800 disabled:opacity-50"
                      disabled={saving}
                      onClick={() => requestPauseStep(selectedStep.id)}
                    >
                      Pause
                    </button>
                  )}
                  {selectedStep.progressState === "paused" && (
                    <button
                      type="button"
                      className="min-h-tap flex-1 rounded-2xl bg-[#00a86b] px-4 text-sm font-extrabold text-white disabled:opacity-50"
                      disabled={saving}
                      onClick={() => void handleStartStep(selectedStep.id)}
                    >
                      Resume
                    </button>
                  )}
                  <button
                    type="button"
                    className="min-h-tap flex-1 rounded-2xl bg-black px-4 text-sm font-extrabold text-white disabled:opacity-50"
                    disabled={saving}
                    onClick={() => requestCompleteStep(selectedStep.id)}
                  >
                    Complete
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
