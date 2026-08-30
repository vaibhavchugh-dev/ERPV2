import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import {
  commitLiveElapsed,
  computeElapsedSeconds,
  deriveJobStatus,
  formatElapsedDuration,
  getCommittedSeconds,
  getCurrentStep,
  getMaxProducedQty,
  getOverallCompleteQtyError,
  isProducedQtyBelowOrderQty,
  isStepCompleted,
  JobOrderDetail,
  JobOrderRoutingStep,
  JobOrderService,
  JobOrderStepNote,
  JOB_STEP_PAUSE_REASONS,
  WAITING_FOR_MATERIAL_REASON,
  parseProducedQty,
  ProgressState,
  toElapsedFields,
} from "../services/jobOrderService";
import { formatJobNumber } from "../utils/formatJobNumber";

const JOB_STATUS_OPTIONS = [
  { value: "Draft", label: "Draft" },
  { value: "In Progress", label: "In Progress" },
  { value: "Completed", label: "Complete" },
  { value: "Cancelled", label: "Cancel" },
] as const;

function normalizeJobStatus(status: string | undefined): string {
  const s = (status || "").trim();
  if (s === "Completed" || s === "Complete") return "Completed";
  if (s === "Cancelled" || s === "Cancel") return "Cancelled";
  if (s === "In Progress") return "In Progress";
  if (s === "Draft") return "Draft";
  if (s.toLowerCase().includes("complete")) return "Completed";
  if (s.toLowerCase().includes("cancel")) return "Cancelled";
  if (
    s.toLowerCase().includes("progress") ||
    s.toLowerCase().includes("ship")
  ) {
    return "In Progress";
  }
  return "Draft";
}

function isActiveJobStatus(status: string | undefined): boolean {
  const s = normalizeJobStatus(status);
  return s === "In Progress" || s === "Completed";
}

type TrackingDialog =
  | { type: "pause"; stepId: number }
  | { type: "complete"; stepId: number }
  | { type: "reopen"; stepId: number }
  | { type: "stepNote"; stepId: number }
  | { type: "completeJob" }
  | { type: "disableTrack" }
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
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
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
  const [completeJobQtys, setCompleteJobQtys] = useState<Record<number, string>>({});
  const [completeJobErrors, setCompleteJobErrors] = useState<Record<number, string>>({});
  const [stepNoteInput, setStepNoteInput] = useState("");
  const [enableJobTracking, setEnableJobTracking] = useState(false);
  const enableJobTrackingRef = useRef(false);
  const [stepSheetOpen, setStepSheetOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    enableJobTrackingRef.current = enableJobTracking;
  }, [enableJobTracking]);

  // Auto-dismiss sticky success/error banners
  useEffect(() => {
    if (!actionOk && !actionError) return;
    const t = window.setTimeout(() => {
      setActionOk("");
      setActionError("");
    }, actionError ? 4500 : 2800);
    return () => window.clearTimeout(t);
  }, [actionOk, actionError]);

  const deepLinkStepId = Number(searchParams.get("stepId") || 0);
  const focusTimer = searchParams.get("focus") === "timer";
  const ncrDeleted = searchParams.get("ncrDeleted") === "1";

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
      setEnableJobTracking(!!detail.EnableJobTracking);
      enableJobTrackingRef.current = !!detail.EnableJobTracking;
      setCompleteJobQtys({});
      setCompleteJobErrors({});

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
      const anyRunning =
        !!detail.EnableJobTracking &&
        detail.RoutingSteps?.some((s) => s.progressState === "running");
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

  useEffect(() => {
    if (!ncrDeleted) return;
    void loadJob();
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("ncrDeleted");
        return next;
      },
      { replace: true }
    );
  }, [ncrDeleted, loadJob, setSearchParams]);

  // After load + selection: open step sheet + scroll timer when focus=timer (from Dashboard scan)
  useEffect(() => {
    if (loading || !job || !focusTimer || deepLinkAppliedRef.current) return;
    if (deepLinkStepId > 0 && selectedStepId !== deepLinkStepId) return;

    deepLinkAppliedRef.current = true;
    setStepSheetOpen(true);
    const t = window.setTimeout(() => {
      timerSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 180);
    return () => window.clearTimeout(t);
  }, [loading, job, focusTimer, deepLinkStepId, selectedStepId]);

  const openStepSheet = (stepId: number) => {
    setSelectedStepId(stepId);
    setStepSheetOpen(true);
  };

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

  // Keep tick dependency so running clocks re-render.
  void elapsedTick;

  const persistJobOrder = async (
    overrides: Partial<JobOrderDetail> & { RoutingSteps?: JobOrderRoutingStep[] },
    options?: { successMessage?: string; deriveStatusFromSteps?: boolean }
  ): Promise<boolean> => {
    const current = jobRef.current;
    if (!current?.JobOrderID) return false;

    setSaving(true);
    setActionError("");
    setActionOk("");

    const stepsInput = overrides.RoutingSteps ?? stepsRef.current;
    const committedSteps = options?.deriveStatusFromSteps
      ? commitLiveElapsed(stepsInput)
      : stepsInput;
    const orderQty = current.QtyOrdered || 0;
    const qtyErrors: string[] = [];
    const stepsToSave = committedSteps.map((step) => {
      const parsed = parseProducedQty(step.qtyProduced ?? 0, orderQty, "save");
      if (!parsed.ok) {
        qtyErrors.push(parsed.error);
        return step;
      }
      return { ...step, qtyProduced: parsed.qty };
    });
    if (qtyErrors.length > 0) {
      setSaving(false);
      setActionError(
        `Please fix ${qtyErrors.length} issue${qtyErrors.length === 1 ? "" : "s"} before saving. ${qtyErrors.join(" ")}`
      );
      return false;
    }
    const baseStatus = overrides.Status ?? current.Status;
    const statusToSave = options?.deriveStatusFromSteps
      ? deriveJobStatus(baseStatus, stepsToSave)
      : baseStatus;

    const payload: JobOrderDetail = {
      ...current,
      ...overrides,
      Status: statusToSave,
      RoutingSteps: stepsToSave,
      EnableJobTracking:
        overrides.EnableJobTracking ?? enableJobTrackingRef.current,
    };

    setJob(payload);
    jobRef.current = payload;
    stepsRef.current = stepsToSave;

    try {
      await JobOrderService.saveJobOrder(payload);
      if (options?.successMessage) setActionOk(options.successMessage);

      const refreshed = await JobOrderService.getJobOrderById(current.JobOrderID);
      if (refreshed) {
        const savedById = new Map(stepsToSave.map((s) => [s.id, s]));
        const mergedSteps = (refreshed.RoutingSteps || []).map((s) => {
          const saved = savedById.get(s.id);
          if (!saved) return s;
          let next = s;
          if (saved.pauseReason && !s.pauseReason) {
            next = { ...next, pauseReason: saved.pauseReason };
          }
          if ((saved.notes?.length || 0) > 0 && !(s.notes?.length)) {
            next = { ...next, notes: saved.notes };
          }
          if ((saved.ncrFlags?.length || 0) > 0 && s.ncrFlags == null) {
            next = { ...next, ncrFlags: saved.ncrFlags };
          }
          return next;
        });
        const merged = {
          ...refreshed,
          RoutingSteps: mergedSteps,
          EnableJobTracking: refreshed.EnableJobTracking,
        };
        setJob(merged);
        jobRef.current = merged;
        stepsRef.current = mergedSteps;
        setEnableJobTracking(!!merged.EnableJobTracking);
        enableJobTrackingRef.current = !!merged.EnableJobTracking;
        syncSelectedStep(mergedSteps);
        clearDisplayTimer();
        if (
          merged.EnableJobTracking &&
          refreshed.RoutingSteps?.some((s) => s.progressState === "running")
        ) {
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
        `Could not save job: ${ax?.response?.data?.error ||
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

  const persistTrackingSteps = async (
    updatedSteps: JobOrderRoutingStep[],
    successMessage?: string
  ): Promise<boolean> => {
    return persistJobOrder(
      { RoutingSteps: updatedSteps },
      { successMessage, deriveStatusFromSteps: true }
    );
  };

  const handleStatusChange = async (newStatus: string) => {
    if (saving || !jobRef.current) return;
    if (newStatus === "Completed") {
      requestCompleteJob();
      return;
    }
    await persistJobOrder({ Status: newStatus }, { successMessage: "Job status updated" });
  };

  const pauseAllRunningSteps = (steps: JobOrderRoutingStep[]): JobOrderRoutingStep[] => {
    const nowMs = Date.now();
    let changed = false;
    const next = steps.map((s) => {
      if (s.progressState !== "running") return s;
      changed = true;
      return {
        ...s,
        progressState: "paused" as const,
        ...toElapsedFields(computeElapsedSeconds(s, nowMs)),
        startTime: undefined,
        pauseReason: s.pauseReason || "Tracking disabled",
      };
    });
    return changed ? next : steps;
  };

  const applyTrackChange = async (checked: boolean) => {
    setEnableJobTracking(checked);
    enableJobTrackingRef.current = checked;
    let steps = stepsRef.current;
    if (!checked) {
      steps = pauseAllRunningSteps(steps);
      if (!steps.some((s) => s.progressState === "running")) {
        clearDisplayTimer();
      }
    }
    await persistJobOrder(
      { EnableJobTracking: checked, RoutingSteps: steps },
      {
        successMessage: checked
          ? "Job tracking enabled"
          : "Job tracking disabled",
        deriveStatusFromSteps: true,
      }
    );
  };

  const handleTrackToggle = () => {
    if (saving) return;
    const checked = !enableJobTracking;
    if (!checked) {
      const running = stepsRef.current.filter((s) => s.progressState === "running");
      if (running.length > 0) {
        setTrackingDialog({ type: "disableTrack" });
        return;
      }
    }
    void applyTrackChange(checked);
  };

  const confirmDisableTrack = async () => {
    setTrackingDialog(null);
    await applyTrackChange(false);
  };

  const handleToggleStepCompletion = async (stepId: number) => {
    const step = stepsRef.current.find((s) => s.id === stepId);
    if (!step || saving) return;

    const newStatus = step.status === "Completed" ? "Pending" : "Completed";
    if (newStatus === "Pending") {
      const updatedSteps = stepsRef.current.map((s) =>
        s.id === stepId
          ? { ...s, status: "Pending", progressState: "idle" as const }
          : s
      );
      await persistJobOrder(
        { RoutingSteps: updatedSteps },
        { successMessage: "Step reopened", deriveStatusFromSteps: true }
      );
      return;
    }
    requestCompleteStep(stepId);
  };

  const requestStepNote = (stepId: number) => {
    setStepNoteInput("");
    setTrackingDialog({ type: "stepNote", stepId });
  };

  const confirmAddStepNote = async () => {
    const stepId =
      trackingDialog?.type === "stepNote" ? trackingDialog.stepId : undefined;
    if (stepId == null) return;
    const text = stepNoteInput.trim();
    if (!text) {
      setActionError("Please enter a note");
      return;
    }
    const joId = jobRef.current?.JobOrderID || 0;
    if (!joId || joId <= 0) {
      setActionError("Save the job order first, then add notes");
      return;
    }

    const currentSteps = stepsRef.current;
    const existingNotes =
      currentSteps.find((s) => Number(s.id) === Number(stepId))?.notes || [];
    const nextNoteId =
      existingNotes.reduce((max, n) => Math.max(max, Number(n.id) || 0), 0) + 1;
    const note: JobOrderStepNote = {
      id: nextNoteId,
      text,
      createdAt: new Date().toISOString(),
      createdBy: userName || "User",
    };

    const updatedSteps = currentSteps.map((s) =>
      Number(s.id) === Number(stepId)
        ? { ...s, notes: [...(s.notes || []), note] }
        : s
    );

    setStepNoteInput("");
    const saved = await persistTrackingSteps(updatedSteps, "Note added");
    if (saved) {
      setTrackingDialog({ type: "stepNote", stepId });
    } else {
      setStepNoteInput(text);
      setTrackingDialog({ type: "stepNote", stepId });
    }
  };

  const openNcrForStep = (stepId: number) => {
    if (!job?.JobOrderID) return;
    const step = stepsRef.current.find((s) => s.id === stepId);
    const existing = step?.ncrFlags?.[0];
    if (existing?.ncrId) {
      navigate(`/quality/${existing.ncrId}?returnTo=${encodeURIComponent(`/jobs/${job.JobOrderID}`)}`);
      return;
    }
    const qs = new URLSearchParams({
      jobOrderId: String(job.JobOrderID),
      stepId: String(stepId),
      returnTo: `/jobs/${job.JobOrderID}`,
    });
    setStepSheetOpen(false);
    navigate(`/quality/new?${qs.toString()}`);
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

    const orderQty = jobRef.current?.QtyOrdered || 0;
    const parsed = parseProducedQty(completeQtyInput, orderQty, "complete");
    if (!parsed.ok) {
      setCompleteQtyError(parsed.error);
      return;
    }
    const qty = parsed.qty;
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

  const resolveGridStepQtyRaw = (step: JobOrderRoutingStep): string => {
    return step.qtyProduced != null ? String(step.qtyProduced) : "";
  };

  const defaultOverallCompleteQty = (step: JobOrderRoutingStep, orderQtyVal: number) => {
    const grid = resolveGridStepQtyRaw(step).trim();
    const qty = parseInt(grid, 10);
    if (grid !== "" && Number.isFinite(qty) && qty > 0) return String(qty);
    return String(orderQtyVal);
  };

  const requestCompleteJob = () => {
    const steps = stepsRef.current;
    if (!steps.length) {
      setActionError("Add routing steps and enter produced quantity before completing this job.");
      return;
    }
    const orderQtyVal = jobRef.current?.QtyOrdered || 0;
    const qtys: Record<number, string> = {};
    steps.forEach((s) => {
      qtys[s.id] = defaultOverallCompleteQty(s, orderQtyVal);
    });
    setCompleteJobQtys(qtys);
    setCompleteJobErrors({});
    setTrackingDialog({ type: "completeJob" });
  };

  const buildCompletedJobSteps = (
    steps: JobOrderRoutingStep[],
    qtyById: Map<number, number>
  ): JobOrderRoutingStep[] => {
    const nowMs = Date.now();
    return steps.map((s) => {
      const qty = qtyById.get(s.id) ?? s.qtyProduced ?? 0;
      if (isStepCompleted(s)) {
        return { ...s, qtyProduced: qty };
      }
      return {
        ...s,
        qtyProduced: qty,
        progressState: "stopped" as const,
        status: "Completed",
        ...toElapsedFields(computeElapsedSeconds(s, nowMs)),
        startTime: undefined,
      };
    });
  };

  const confirmCompleteJob = async () => {
    const steps = stepsRef.current;
    const orderQtyVal = jobRef.current?.QtyOrdered || 0;
    const errors: Record<number, string> = {};
    const parsedById = new Map<number, number>();
    steps.forEach((step) => {
      const raw = completeJobQtys[step.id] ?? defaultOverallCompleteQty(step, orderQtyVal);
      const error = getOverallCompleteQtyError(raw, orderQtyVal);
      if (error) {
        errors[step.id] = error;
        return;
      }
      const parsed = parseProducedQty(raw, orderQtyVal, "complete");
      if (parsed.ok) parsedById.set(step.id, parsed.qty);
    });
    setCompleteJobErrors(errors);
    if (Object.keys(errors).length > 0) {
      const first = steps.find((s) => errors[s.id]);
      if (first) {
        window.requestAnimationFrame(() => {
          document.getElementById(`pwa-complete-qty-${first.id}`)?.scrollIntoView({
            block: "nearest",
            behavior: "smooth",
          });
          (document.getElementById(`pwa-complete-qty-${first.id}`) as HTMLInputElement | null)?.focus();
        });
      }
      return;
    }

    const updatedSteps = buildCompletedJobSteps(steps, parsedById);
    const stillRunning = updatedSteps.some((s) => s.progressState === "running");
    if (!stillRunning) clearDisplayTimer();
    const saved = await persistJobOrder(
      { RoutingSteps: updatedSteps, Status: "Completed" },
      { successMessage: "Job marked as completed", deriveStatusFromSteps: true }
    );
    if (saved) {
      setTrackingDialog(null);
      setCompleteJobQtys({});
      setCompleteJobErrors({});
    }
  };

  const closeTrackingDialog = () => {
    if (saving) return;
    setTrackingDialog(null);
    setCompleteJobQtys({});
    setCompleteJobErrors({});
  };

  if (loading) {
    return (
      <div>
        <header className="mb-4 flex items-center gap-3">
          <Link
            to="/jobs"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-slate-700 shadow-sm dark:bg-slate-800 dark:text-slate-200"
            aria-label="Back to Jobs"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M15 19l-7-7 7-7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-tight text-slate-900 leading-tight dark:text-white">
              Job Details
            </h1>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-300">
              {formatJobNumber(jobOrderId)}
            </p>
          </div>
        </header>
        <div className="space-y-3 animate-pulse">
          <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3 dark:bg-slate-800 dark:border-slate-600">
            <div className="flex justify-between items-start">
              <div className="space-y-2">
                <div className="h-5 bg-slate-200 rounded-full w-20 dark:bg-slate-700" />
                <div className="h-7 bg-slate-200 rounded-md w-40 dark:bg-slate-700" />
              </div>
              <div className="h-12 w-24 bg-slate-200 rounded-xl dark:bg-slate-950" />
            </div>
            <div className="h-10 bg-slate-100 rounded-xl dark:bg-slate-900" />
            <div className="grid grid-cols-3 gap-2">
              <div className="h-12 bg-slate-100 rounded-xl dark:bg-slate-900" />
              <div className="h-12 bg-slate-100 rounded-xl dark:bg-slate-900" />
              <div className="h-12 bg-slate-100 rounded-xl dark:bg-slate-900" />
            </div>
          </div>
          <div className="h-16 rounded-2xl bg-slate-200 dark:bg-slate-800" />
          <div className="bg-white rounded-3xl border border-slate-200 p-5 space-y-4 dark:bg-slate-800 dark:border-slate-600">
            <div className="h-4 bg-slate-200 rounded w-28 dark:bg-slate-700" />
            <div className="h-16 bg-slate-100 rounded-2xl dark:bg-slate-900" />
            <div className="h-16 bg-slate-100 rounded-2xl dark:bg-slate-900" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !job) {
    return (
      <div>
        <Link to="/jobs" className="mb-3 inline-flex min-h-10 items-center font-semibold text-accent">
          ← Jobs
        </Link>
        <div
          className="rounded-xl border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/50 dark:text-red-300"
          role="alert"
        >
          {error || "Job not found"}
        </div>
      </div>
    );
  }

  const orderQty = job.QtyOrdered || 0;
  const qtyCapacity = orderQty * sortedSteps.length;
  const producedAcrossSteps = sortedSteps.reduce((acc, step) => {
    const qty = Math.max(0, step.qtyProduced || 0);
    return acc + (orderQty > 0 ? Math.min(qty, orderQty) : qty);
  }, 0);
  const remainingAcrossSteps = Math.max(0, qtyCapacity - producedAcrossSteps);
  const qtyProgressPct =
    qtyCapacity > 0
      ? Math.min(100, Math.round((producedAcrossSteps / qtyCapacity) * 100))
      : 0;
  const completeParsed = parseInt(completeQtyInput, 10);
  const completeQtyNum = Number.isNaN(completeParsed) ? null : completeParsed;
  const underOrder =
    completeQtyNum != null && orderQty > 0 && completeQtyNum < orderQty;

  return (
    <div>
      {/* Header with Back Button + status */}
      <header className="mb-4 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            to="/jobs"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-slate-700 shadow-sm hover:bg-slate-100 transition-colors dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            aria-label="Back to Jobs"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M15 19l-7-7 7-7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 leading-tight dark:text-white">Job Details</h1>
            <p className="text-sm font-semibold text-slate-500 dark:text-slate-300">
              {formatJobNumber(job.JobOrderNumber || job.JobNumber || job.JobOrderID)}
            </p>
          </div>
        </div>

        <div className="relative shrink-0">
          <select
            className={`min-h-tap appearance-none rounded-xl border bg-white py-2 pl-3 pr-8 text-sm font-bold shadow-sm outline-none dark:bg-slate-800 ${isActiveJobStatus(job.Status)
              ? "border-emerald-200 text-emerald-800 dark:border-emerald-700 dark:text-emerald-300"
              : "border-slate-200 text-slate-700 dark:border-slate-600 dark:text-slate-200"
              }`}
            value={normalizeJobStatus(job.Status)}
            disabled={saving}
            onChange={(e) => void handleStatusChange(e.target.value)}
            aria-label="Overall job status"
          >
            {JOB_STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <span
            className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-300"
            aria-hidden
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 9l6-6 6 6" />
              <path d="M6 15l6 6 6-6" />
            </svg>
          </span>
        </div>
      </header>

      {job.IsShortMaterial && (
        <div
          className="mb-3 rounded-2xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
          role="status"
        >
          <strong className="font-extrabold uppercase tracking-wide">Short material</strong>
          <span className="mt-0.5 block text-xs font-semibold">
            Pause with “Waiting for material” if the shop is blocked.
          </span>
        </div>
      )}

      {/* Card 1: Job Overview & Metrics */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-[0_2px_10px_rgba(15,23,42,0.08)] px-3.5 py-3 mb-3 space-y-2 dark:bg-slate-800 dark:border-slate-600">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="bg-black text-white text-[0.55rem] font-black px-2 py-0.5 rounded-full uppercase tracking-wider">
                {job.Status || "IN PROGRESS"}
              </span>
              {(job.JobPriority ?? 0) === 2 && (
                <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[0.55rem] font-extrabold uppercase tracking-wide text-red-700 dark:bg-red-950/60 dark:text-red-300">
                  Urgent
                </span>
              )}
              {(job.JobPriority ?? 0) === 1 && (
                <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[0.55rem] font-extrabold uppercase tracking-wide text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
                  High
                </span>
              )}
            </div>
            <div className="text-xl font-black tracking-tight text-slate-900 mt-1 leading-tight dark:text-white">
              {formatJobNumber(job.JobOrderNumber || job.JobNumber || job.JobOrderID)}
            </div>
            {job.CustomerName && (
              <div className="text-sm font-semibold text-slate-500 truncate dark:text-slate-300">
                {job.CustomerName}
              </div>
            )}
          </div>

          {enableJobTracking && (
            <div className="bg-black rounded-xl px-2.5 py-1.5 text-white text-center shrink-0 dark:bg-slate-950 dark:ring-1 dark:ring-slate-600">
              <span className="text-[0.5rem] font-extrabold text-slate-400 tracking-widest uppercase block dark:text-slate-300">
                ELAPSED
              </span>
              <span className="font-mono text-sm font-black tracking-wider text-white block leading-tight">
                {formatElapsedDuration(
                  job.RoutingSteps
                    ? job.RoutingSteps.reduce(
                      (acc, s) => acc + computeElapsedSeconds(s),
                      0
                    )
                    : 0
                )}
              </span>
            </div>
          )}
        </div>

        {job.PartName && (
          <div className="rounded-xl border border-slate-100 bg-slate-50 px-2.5 py-1 dark:border-slate-600 dark:bg-slate-950">
            <span className="text-[0.55rem] font-extrabold text-slate-500 uppercase block dark:text-slate-300">
              Part Description
            </span>
            <span className="text-sm font-semibold text-slate-700 leading-snug dark:text-slate-100">
              {job.PartName}
            </span>
          </div>
        )}

        {/* Part, Target, Remaining Grid */}
        <div className="grid grid-cols-3 gap-1.5">
          <div className="rounded-xl border border-slate-100 bg-slate-50 px-2 py-1.5 text-center dark:border-slate-600 dark:bg-slate-950">
            <span className="text-[0.55rem] font-extrabold text-slate-500 uppercase block dark:text-slate-300">PART</span>
            <span className="text-sm font-extrabold text-slate-900 truncate block dark:text-white">{job.PartNo || "—"}</span>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 px-2 py-1.5 text-center dark:border-slate-600 dark:bg-slate-950">
            <span className="text-[0.55rem] font-extrabold text-slate-500 uppercase block dark:text-slate-300">TARGET</span>
            <span className="text-sm font-extrabold text-slate-900 truncate block dark:text-white">{job.QtyOrdered} {job.Unit || "pcs"}</span>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 px-2 py-1.5 text-center dark:border-slate-600 dark:bg-slate-950">
            <span className="text-[0.55rem] font-extrabold text-slate-500 uppercase block dark:text-slate-300">REMAINING</span>
            <span className="text-sm font-extrabold text-slate-900 truncate block dark:text-white">
              {remainingAcrossSteps} {job.Unit || "pcs"}
            </span>
          </div>
        </div>

        {/* Progress Bar Section */}
        <div>
          {(() => {
            const fillClass =
              qtyCapacity > 0 && producedAcrossSteps >= qtyCapacity
                ? "bg-emerald-500"
                : producedAcrossSteps > 0
                  ? "bg-orange-500"
                  : "bg-transparent";
            return (
              <>
                <div className="flex items-center justify-between text-sm font-bold mb-1">
                  <span className="text-slate-600 dark:text-slate-300">Progress</span>
                  <span className="text-slate-900 font-black dark:text-white">{qtyProgressPct}%</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden mb-1 dark:bg-slate-700">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${fillClass}`}
                    style={{ width: `${qtyProgressPct}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-sm font-semibold text-slate-500 dark:text-slate-300">
                  <span>
                    Produced {producedAcrossSteps}
                    {qtyCapacity > 0 ? ` / ${qtyCapacity}` : ""}
                  </span>
                  <span>Due {formatDue(job.DueDate)}</span>
                </div>
              </>
            );
          })()}
        </div>
      </div>

      {/* Track ON/OFF — below overview tile, matches Cimmple_UI routing Track toggle */}
      <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-[0_2px_10px_rgba(15,23,42,0.08)] dark:bg-slate-800 dark:border-slate-600">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${enableJobTracking
              ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-300"
              : "bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-300"
              }`}
            aria-hidden
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 2" />
            </svg>
          </span>
          <div className="min-w-0">
            <div className="text-base font-extrabold text-slate-900 leading-tight dark:text-white">Job Tracking</div>
            <div className="text-xs font-semibold text-slate-500 dark:text-slate-300">
              {enableJobTracking ? "Timer and clock controls enabled" : "Simple step completion mode"}
            </div>
          </div>
        </div>
        <button
          type="button"
          className={`shrink-0 inline-flex h-8 items-center rounded-lg border px-2.5 text-[0.7rem] font-bold tracking-wide transition disabled:opacity-55 ${enableJobTracking
            ? "border-emerald-600/20 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-700/40 dark:bg-emerald-950/50 dark:text-emerald-300 dark:hover:bg-emerald-950/70"
            : "border-red-600/20 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-700/40 dark:bg-red-950/50 dark:text-red-300 dark:hover:bg-red-950/70"
            }`}
          title={enableJobTracking ? "Disable job tracking" : "Enable job tracking"}
          aria-pressed={enableJobTracking}
          disabled={saving}
          onClick={() => void handleTrackToggle()}
        >
          {enableJobTracking ? "TRACK ON" : "TRACK OFF"}
        </button>
      </div>

      {/* Sticky toast banners — full-width top strip */}
      {(actionError || actionOk) && (
        <div
          className={`fixed left-0 right-0 top-0 z-50 ${actionError ? "bg-red-50 dark:bg-red-950" : "bg-emerald-50 dark:bg-emerald-950"}`}
          style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
        >
          {actionError ? (
            <div
              className="flex min-h-9 w-full items-center justify-center bg-red-50 px-4 py-2 text-xs font-semibold text-red-700 dark:bg-red-950 dark:text-red-200"
              role="alert"
            >
              {actionError}
            </div>
          ) : (
            <div
              className="flex min-h-9 w-full items-center justify-center bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200"
              role="status"
            >
              {actionOk}
            </div>
          )}
        </div>
      )}

      {/* Card 3: Routing Timeline */}
      <div className="bg-white rounded-3xl border border-slate-200/60 shadow-[0_2px_12px_rgba(0,0,0,0.03)] p-5 mb-4 dark:bg-slate-800 dark:border-slate-600">
        <div className="flex items-center justify-between mb-5">
          <div>
            <span className="text-lg font-black tracking-tight text-slate-900 block dark:text-white">
              Routing Timeline
            </span>
            <span className="text-base text-slate-500 font-medium block mt-0.5 dark:text-slate-300">
              Track completed, current, and pending steps
            </span>
          </div>
          <span className="bg-slate-100 text-slate-700 font-bold text-sm px-3 py-1 rounded-full dark:bg-slate-700 dark:text-slate-100">
            {sortedSteps.filter((s) => isStepCompleted(s)).length}/{sortedSteps.length}
          </span>
        </div>

        {sortedSteps.length === 0 && (
          <div className="py-8 text-center text-slate-500 font-bold text-sm dark:text-slate-300">No routing steps on this job.</div>
        )}

        <div className="relative border-l-2 border-slate-200 ml-3.5 pl-6 space-y-4 py-2 dark:border-slate-600">
          {sortedSteps.map((step) => {
            const completed = isStepCompleted(step);
            const isRunning = step.progressState === "running";
            const isPaused = step.progressState === "paused";
            // Live tracking only — selecting a step must not change card appearance
            const current = !completed && (isRunning || isPaused);
            const elapsed = formatElapsedDuration(computeElapsedSeconds(step));

            return (
              <div key={step.id} className="relative">
                {/* Timeline node */}
                <div className="absolute -left-[2.1rem] top-3.5 flex items-center justify-center">
                  {completed ? (
                    <div className="w-7 h-7 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-sm">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <path d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  ) : current ? (
                    <div className="w-7 h-7 rounded-full bg-slate-900 text-white flex items-center justify-center shadow-sm dark:bg-white dark:text-slate-900">
                      <span className="w-2.5 h-2.5 rounded-full bg-white dark:bg-slate-900" />
                    </div>
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-white border-2 border-slate-300 text-slate-400 flex items-center justify-center dark:bg-slate-800 dark:border-slate-500">
                      <span className="w-2.5 h-2.5 rounded-full border border-slate-300 dark:border-slate-500" />
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  className={`w-full text-left transition-all ${completed
                    ? "bg-[#ecfdf5] border border-emerald-100 rounded-2xl p-4 block hover:border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-800 dark:hover:border-emerald-700"
                    : current
                      ? "bg-slate-900 text-white rounded-2xl p-4 block shadow-md dark:bg-slate-950 dark:ring-1 dark:ring-slate-600"
                      : "bg-white border border-slate-200/80 rounded-2xl p-4 block hover:bg-slate-50 dark:bg-slate-900/60 dark:border-slate-600 dark:hover:bg-slate-900"
                    }`}
                  onClick={() => openStepSheet(step.id)}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div
                      className={`text-lg font-extrabold ${completed
                        ? "text-slate-900 dark:text-white"
                        : current
                          ? "text-white"
                          : "text-slate-900 dark:text-white"
                        }`}
                    >
                      {step.sequence}. {step.processName}
                    </div>
                    {completed && (
                      <span className="bg-[#10b981] text-white text-[0.7rem] font-black px-2.5 py-0.5 rounded-full uppercase">
                        COMPLETED
                      </span>
                    )}
                    {current && !completed && (
                      <span className="bg-slate-700 text-slate-200 text-[0.7rem] font-black px-2.5 py-0.5 rounded-full uppercase dark:bg-slate-700 dark:text-white">
                        CURRENT
                      </span>
                    )}
                    {!completed && !current && (
                      <span className="bg-slate-100 text-slate-600 text-[0.7rem] font-black px-2.5 py-0.5 rounded-full uppercase dark:bg-slate-700 dark:text-slate-200">
                        PENDING
                      </span>
                    )}
                  </div>

                  <div
                    className={`text-base font-semibold mt-1 ${completed
                      ? "text-emerald-700 dark:text-emerald-300"
                      : current
                        ? "text-slate-300"
                        : "text-slate-500 dark:text-slate-300"
                      }`}
                  >
                    {completed
                      ? `Finished · ${step.qtyProduced || 0} pcs accepted`
                      : isRunning
                        ? `Running on ${step.workstationName || "workstation"} · ${elapsed}`
                        : isPaused
                          ? `Paused · ${elapsed}`
                          : `Queued after previous step completes`}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[0.7rem] font-extrabold uppercase ${completed
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300"
                        : current
                          ? "bg-slate-700 text-slate-200"
                          : "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-200"
                        }`}
                    >
                      {completed ? "Done" : progressLabel(step.progressState)}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[0.7rem] font-bold ${current
                        ? "bg-slate-700 text-slate-200"
                        : "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-100"
                        }`}
                    >
                      {elapsed}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[0.7rem] font-bold ${current
                        ? "bg-slate-700 text-slate-200"
                        : "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-100"
                        }`}
                    >
                      Est {step.estimatedTime || 0}m
                    </span>
                    {(step.qtyProduced ?? 0) > 0 && (
                      <span
                        className={`rounded-full px-2 py-0.5 text-[0.7rem] font-bold ${current
                          ? "bg-slate-700 text-slate-200"
                          : "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-100"
                          }`}
                      >
                        Qty {step.qtyProduced}
                      </span>
                    )}
                    {step.pauseReason && !completed && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[0.7rem] font-bold text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
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

      {/* Step detail bottom sheet */}
      {stepSheetOpen && selectedStep && (
        <div
          className="fixed inset-0 z-50 flex flex-col justify-end"
          role="dialog"
          aria-modal="true"
          aria-label="Step details"
        >
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setStepSheetOpen(false)}
          />
          <div className="relative mx-auto w-full max-w-[600px] max-h-[85dvh] overflow-y-auto rounded-t-3xl bg-white px-5 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-2xl dark:bg-slate-900">
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-slate-300 dark:bg-slate-600" />
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-black uppercase tracking-widest text-slate-500 mb-1 dark:text-slate-300">
                  Selected routing step
                </div>
                <h2 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">
                  {selectedStep.sequence}. {selectedStep.processName}
                </h2>
                <div className="text-base font-semibold text-slate-500 mt-0.5 dark:text-slate-300">
                  {selectedStep.workstationName
                    ? `Machine ${selectedStep.workstationName}`
                    : "Unassigned"}
                  <span className="mx-1.5 text-slate-400 dark:text-slate-500">·</span>
                  Est. {selectedStep.estimatedTime || 0} min
                </div>
              </div>
              <button
                type="button"
                onClick={() => setStepSheetOpen(false)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                aria-label="Close"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            {enableJobTracking ? (
              <>
                <div
                  ref={timerSectionRef}
                  className="mb-4 rounded-3xl border border-slate-700 bg-gradient-to-br from-slate-800 via-slate-900 to-black p-5 text-white shadow-lg ring-1 ring-white/10 dark:border-slate-500 dark:from-slate-700 dark:via-slate-800 dark:to-slate-950 dark:ring-white/15"
                >
                  <div className="mb-1 flex items-center justify-between text-xs font-black uppercase tracking-widest text-slate-300">
                    <span>LIVE TIMER</span>
                    {selectedStep.progressState === "running" ? (
                      <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-sm font-bold text-emerald-300">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                        Live
                      </span>
                    ) : (
                      <span className="rounded-full bg-black/40 px-2.5 py-0.5 text-sm font-bold text-slate-200 ring-1 ring-white/10">
                        {progressLabel(selectedStep.progressState)}
                      </span>
                    )}
                  </div>
                  <div className="my-2 font-mono text-4xl font-black tracking-wider text-white">
                    {formatElapsedDuration(computeElapsedSeconds(selectedStep))}
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <div className="rounded-xl bg-black/35 p-3 ring-1 ring-white/10">
                      <span className="mb-0.5 block text-xs font-bold uppercase text-slate-300">
                        STARTED
                      </span>
                      <span className="block text-base font-extrabold text-white">
                        {selectedStep.startTime
                          ? new Date(selectedStep.startTime).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                          : "—"}
                      </span>
                    </div>
                    <div className="rounded-xl bg-black/35 p-3 ring-1 ring-white/10">
                      <span className="mb-0.5 block text-xs font-bold uppercase text-slate-300">
                        CYCLE AVG
                      </span>
                      <span className="block text-base font-extrabold text-white">03:24</span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    className="min-h-tap bg-[#00a86b] text-white font-extrabold text-base py-3.5 px-4 rounded-2xl flex items-center justify-center gap-2 shadow-sm hover:bg-emerald-600 transition-colors disabled:opacity-50"
                    disabled={saving || selectedStep.progressState === "running"}
                    onClick={() => void handleStartStep(selectedStep.id)}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                    Start
                  </button>
                  <button
                    type="button"
                    className="min-h-tap bg-[#f1f5f9] text-slate-800 font-extrabold text-base py-3.5 px-4 rounded-2xl flex items-center justify-center gap-2 hover:bg-slate-200 transition-colors disabled:opacity-50 dark:bg-slate-800 dark:text-slate-100"
                    disabled={saving || selectedStep.progressState !== "running"}
                    onClick={() => requestPauseStep(selectedStep.id)}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                    </svg>
                    Pause
                  </button>
                  <button
                    type="button"
                    className="min-h-tap bg-[#f1f5f9] text-slate-800 font-extrabold text-base py-3.5 px-4 rounded-2xl flex items-center justify-center gap-2 hover:bg-slate-200 transition-colors disabled:opacity-50 dark:bg-slate-800 dark:text-slate-100"
                    disabled={saving || selectedStep.progressState !== "paused"}
                    onClick={() => void handleStartStep(selectedStep.id)}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Resume
                  </button>
                  <button
                    type="button"
                    className="min-h-tap bg-black text-white font-extrabold text-base py-3.5 px-4 rounded-2xl flex items-center justify-center gap-2 shadow-sm hover:bg-slate-800 transition-colors disabled:opacity-50 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
                    disabled={saving || isStepCompleted(selectedStep)}
                    onClick={() => requestCompleteStep(selectedStep.id)}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <circle cx="12" cy="12" r="9" />
                      <path d="M9 12l2 2 4-4" />
                    </svg>
                    Complete
                  </button>
                </div>

                {selectedStep.pauseReason && !isStepCompleted(selectedStep) && (
                  <div className="bg-[#fffbeb] border border-amber-200/80 rounded-2xl p-4 mt-4 dark:bg-amber-950/40 dark:border-amber-800">
                    <div className="text-xs font-extrabold text-amber-800 flex items-center gap-2 mb-2 dark:text-amber-300">
                      Pause reason
                    </div>
                    <div className="bg-white rounded-xl border border-amber-200/60 p-3 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:border-amber-800 dark:text-slate-200">
                      {selectedStep.pauseReason}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="rounded-2xl bg-slate-50 px-4 py-3 dark:bg-slate-800">
                  <span className="text-[0.55rem] font-extrabold uppercase tracking-wide text-slate-500 block mb-1 dark:text-slate-300">
                    Step status
                  </span>
                  <span
                    className={`inline-flex rounded-full px-2.5 py-0.5 text-[0.65rem] font-extrabold uppercase ${selectedStep.status === "Completed"
                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                      : selectedStep.status === "In Progress"
                        ? "bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300"
                        : "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-200"
                      }`}
                  >
                    {selectedStep.status || "Pending"}
                  </span>
                </div>
                <button
                  type="button"
                  className={`min-h-tap inline-flex items-center justify-center gap-2 rounded-2xl px-5 text-base font-extrabold text-white disabled:opacity-50 ${selectedStep.status === "Completed"
                    ? "bg-emerald-500 hover:bg-emerald-600"
                    : "bg-slate-500 hover:bg-slate-600"
                    }`}
                  disabled={saving}
                  onClick={() => void handleToggleStepCompletion(selectedStep.id)}
                >
                  {selectedStep.status === "Completed" ? "Mark incomplete" : "Complete step"}
                </button>
              </div>
            )}

            {/* Shop-floor actions — same as Cimmple_UI step menu */}
            <div className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-100 pt-4 dark:border-slate-700">
              <button
                type="button"
                className="min-h-tap rounded-2xl border border-slate-200 bg-slate-50 px-3 text-base font-extrabold text-slate-800 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
                disabled={saving}
                onClick={() => requestStepNote(selectedStep.id)}
              >
                {(selectedStep.notes?.length || 0) > 0
                  ? `Notes (${selectedStep.notes!.length})`
                  : "Add Notes"}
              </button>
              <button
                type="button"
                className="min-h-tap rounded-2xl border border-slate-200 bg-slate-50 px-3 text-base font-extrabold text-slate-800 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
                disabled={saving}
                onClick={() => openNcrForStep(selectedStep.id)}
              >
                {selectedStep.ncrFlags?.[0]?.ncrId
                  ? selectedStep.ncrFlags[0].ncrNumber ||
                  `NCR-${selectedStep.ncrFlags[0].ncrId}`
                  : "Add NCR"}
              </button>
            </div>
          </div>
        </div>
      )}

      {trackingDialog && (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-900/50 p-4 sm:items-center dark:bg-black/70"
          role="presentation"
          onClick={() => {
            if (!saving) closeTrackingDialog();
          }}
        >
          <div
            className={`card w-full p-4 dark:bg-slate-900 dark:border-slate-600 ${trackingDialog.type === "completeJob" ? "max-w-lg max-h-[85vh] overflow-y-auto" : "max-w-md"
              }`}
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            {trackingDialog.type === "completeJob" && (() => {
              const maxQty = getMaxProducedQty(orderQty);
              const stepsInDialog = sortedSteps;
              const runningSteps = stepsInDialog.filter((s) => s.progressState === "running");
              const belowOrderSteps = stepsInDialog.filter((step) =>
                isProducedQtyBelowOrderQty(completeJobQtys[step.id] ?? "", orderQty)
              );
              const qtyIssueCount = stepsInDialog.filter((step) =>
                !!getOverallCompleteQtyError(completeJobQtys[step.id] ?? "", orderQty)
              ).length;
              const canSubmit = stepsInDialog.length > 0 && qtyIssueCount === 0;
              return (
                <>
                  <h4 className="mb-1 text-lg font-extrabold text-red-700 dark:text-red-300">
                    Set Up Required
                  </h4>
                  <p className="mb-3 text-sm text-slate-500 dark:text-slate-300">
                    Review produced quantity for every routing step (greater than 0 and up to{" "}
                    {maxQty}
                    {job.Unit ? ` ${job.Unit}` : ""}).
                  </p>
                  {(runningSteps.length > 0 || belowOrderSteps.length > 0) && (
                    <div className="mb-3 space-y-2">
                      {runningSteps.length > 0 && (
                        <div className="flex gap-3 rounded-2xl border border-blue-200 bg-blue-50 px-3 py-3 text-blue-900 dark:border-blue-800 dark:bg-blue-950/50 dark:text-blue-100">
                          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <circle cx="12" cy="12" r="10" />
                              <polyline points="12 6 12 12 16 14" />
                            </svg>
                          </span>
                          <div className="min-w-0 text-sm">
                            <div className="font-extrabold">Running timers will be stopped</div>
                            <p className="mt-1 font-semibold leading-snug opacity-90">
                              Completing this job will stop the live clock on Seq{" "}
                              {runningSteps.map((s) => s.sequence).join(", Seq ")}.
                            </p>
                          </div>
                        </div>
                      )}
                      {belowOrderSteps.length > 0 && (
                        <div className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-3 text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-100">
                          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                              <line x1="12" y1="9" x2="12" y2="13" />
                              <line x1="12" y1="17" x2="12.01" y2="17" />
                            </svg>
                          </span>
                          <div className="min-w-0 text-sm">
                            <div className="font-extrabold">Some steps have less qty than order qty</div>

                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  <div className="mb-3 overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-600">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-50 text-[0.7rem] font-extrabold uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                        <tr>
                          <th className="px-3 py-2">Seq</th>
                          <th className="px-3 py-2">Operation</th>
                          <th className="px-3 py-2">Qty produced</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stepsInDialog.map((step) => {
                          const raw = completeJobQtys[step.id] ?? "";
                          const qtyError =
                            completeJobErrors[step.id] ||
                            getOverallCompleteQtyError(raw, orderQty);
                          return (
                            <tr
                              key={step.id}
                              className={
                                qtyError
                                  ? "bg-red-50 dark:bg-red-950/40"
                                  : "border-t border-slate-100 dark:border-slate-700"
                              }
                            >
                              <td className="px-3 py-2 font-bold text-slate-800 dark:text-slate-100">
                                {step.sequence}
                              </td>
                              <td className="px-3 py-2 font-semibold text-slate-800 dark:text-slate-100">
                                {step.processName}
                                {isStepCompleted(step) ? (
                                  <sup className="ml-1 rounded bg-emerald-100 px-1 text-[0.6rem] font-extrabold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                                    Completed
                                  </sup>
                                ) : null}
                              </td>
                              <td className="px-3 py-2 align-top">
                                <input
                                  id={`pwa-complete-qty-${step.id}`}
                                  type="number"
                                  min={0}
                                  step={1}
                                  className={`field-input min-h-10 w-24 ${qtyError
                                    ? "border-red-500 dark:border-red-400"
                                    : ""
                                    }`}
                                  value={raw}
                                  disabled={saving}
                                  onChange={(e) => {
                                    const next = e.target.value;
                                    setCompleteJobQtys((prev) => ({
                                      ...prev,
                                      [step.id]: next,
                                    }));
                                    const error = getOverallCompleteQtyError(next, orderQty);
                                    setCompleteJobErrors((prev) => {
                                      const copy = { ...prev };
                                      if (error) copy[step.id] = error;
                                      else delete copy[step.id];
                                      return copy;
                                    });
                                  }}
                                />
                                {qtyError ? (
                                  <div className="mt-1 text-[0.7rem] font-semibold leading-snug text-red-700 dark:text-red-300">
                                    {qtyError}
                                  </div>
                                ) : null}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {qtyIssueCount > 0 && (
                    <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 dark:border-red-800 dark:bg-red-950/50 dark:text-red-300">
                      Please fix {qtyIssueCount} issue{qtyIssueCount === 1 ? "" : "s"} before
                      completing.
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      className="btn btn-ghost"
                      disabled={saving}
                      onClick={closeTrackingDialog}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="btn btn-success"
                      disabled={saving || !canSubmit}
                      onClick={() => void confirmCompleteJob()}
                    >
                      {saving ? "Saving…" : "Save qty & complete"}
                    </button>
                  </div>
                </>
              );
            })()}

            {trackingDialog.type === "disableTrack" && (() => {
              return (
                <>
                  <h4 className="mb-1 text-lg font-bold text-slate-900 dark:text-white">
                    Turn Track OFF?
                  </h4>
                  <div className="mb-4 flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-3 text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-100">
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                      </svg>
                    </span>
                    <div className="text-sm">
                      <div className="font-extrabold">A step is currently running</div>
                      <p className="mt-1 font-semibold leading-snug opacity-90">
                        Turning Track OFF will pause the live clock. Continue?
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      className="btn btn-ghost"
                      disabled={saving}
                      onClick={closeTrackingDialog}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={saving}
                      onClick={() => void confirmDisableTrack()}
                    >
                      {saving ? "Saving…" : "Turn Track OFF"}
                    </button>
                  </div>
                </>
              );
            })()}

            {trackingDialog.type === "pause" && (
              <>
                <h4 className="mb-1 text-lg font-bold text-slate-900 dark:text-white">Pause operation</h4>
                <p className="mb-3 text-sm text-slate-500 dark:text-slate-300">
                  {job.IsShortMaterial
                    ? "This job is short on material. “Waiting for material” is the usual hold reason:"
                    : "Optional hold reason (you can skip):"}
                </p>
                <div className="mb-3 space-y-2">
                  {JOB_STEP_PAUSE_REASONS.map((reason) => (
                    <button
                      key={reason}
                      type="button"
                      className={`btn w-full justify-start ${
                        job.IsShortMaterial && reason === WAITING_FOR_MATERIAL_REASON
                          ? "btn-primary"
                          : "btn-secondary"
                      }`}
                      disabled={saving}
                      onClick={() => void confirmPauseStep(reason)}
                    >
                      {reason}
                      {job.IsShortMaterial && reason === WAITING_FOR_MATERIAL_REASON
                        ? " (suggested)"
                        : ""}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={saving}
                    onClick={closeTrackingDialog}
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
                  <h4 className="mb-1 text-lg font-bold text-slate-900 dark:text-white">Complete operation</h4>
                  <p className="mb-3 text-sm text-slate-500 dark:text-slate-300">
                    {dialogStep
                      ? `Step ${dialogStep.sequence}: ${dialogStep.processName}`
                      : "Enter quantity produced for this operation."}
                  </p>
                  <div className="mb-3 grid grid-cols-2 gap-2">
                    <div className="rounded-xl border border-slate-200 bg-canvas px-3 py-2.5 dark:border-slate-600 dark:bg-slate-800">
                      <div className="text-[0.7rem] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-300">
                        Order qty
                      </div>
                      <div className="font-semibold text-slate-900 dark:text-white">
                        {orderQty} {job.Unit || ""}
                      </div>
                    </div>
                    <label className="field">
                      <span>Qty produced</span>
                      <input
                        className={`field-input ${completeQtyError ? "border-red-500 dark:border-red-400" : ""
                          }`}
                        type="number"
                        min={0}
                        step={1}
                        autoFocus
                        value={completeQtyInput}
                        onChange={(e) => {
                          const next = e.target.value;
                          setCompleteQtyInput(next);
                          const parsed = parseProducedQty(next, orderQty, "complete");
                          setCompleteQtyError(parsed.ok ? "" : parsed.error);
                        }}
                        disabled={saving}
                      />
                    </label>
                  </div>
                  {completeQtyError && (
                    <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 dark:border-red-800 dark:bg-red-950/50 dark:text-red-300">
                      {completeQtyError}
                    </div>
                  )}
                  {!completeQtyError && underOrder && (
                    <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-100">
                      Qty produced is less than order qty.
                    </div>
                  )}
                  <div className="flex flex-col gap-2">
                    <button
                      type="button"
                      className="btn btn-ghost"
                      disabled={saving}
                      onClick={closeTrackingDialog}
                    >
                      Cancel
                    </button>
                    {underOrder && !completeQtyError ? (
                      <>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          disabled={saving || !!completeQtyError}
                          onClick={() => void confirmCompleteStep(false)}
                        >
                          {saving ? "Saving…" : "Save qty (keep open)"}
                        </button>
                        <button
                          type="button"
                          className="btn btn-success"
                          disabled={saving || !!completeQtyError}
                          onClick={() => void confirmCompleteStep(true)}
                        >
                          Complete anyway
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-success"
                        disabled={saving || !!completeQtyError}
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
                <h4 className="mb-1 text-lg font-bold text-slate-900 dark:text-white">Reopen operation</h4>
                <p className="mb-4 text-sm text-slate-500 dark:text-slate-300">
                  This will mark the operation as pending again and set the job to In Progress if
                  it was Completed. Elapsed time is kept; the clock stays stopped until you Start.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={saving}
                    onClick={closeTrackingDialog}
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

            {trackingDialog.type === "stepNote" && (() => {
              const dialogStep = stepsRef.current.find(
                (s) => s.id === trackingDialog.stepId
              );
              const notes = dialogStep?.notes || [];
              return (
                <>
                  <h4 className="mb-1 text-lg font-bold text-slate-900 dark:text-white">Step notes</h4>
                  <p className="mb-3 text-sm text-slate-500 dark:text-slate-300">
                    {dialogStep
                      ? `Step ${dialogStep.sequence}: ${dialogStep.processName}`
                      : "Add a shop-floor note for this step."}
                  </p>
                  {notes.length > 0 ? (
                    <div className="mb-3 max-h-40 space-y-2 overflow-y-auto">
                      {notes.map((n) => (
                        <div
                          key={n.id}
                          className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
                        >
                          <div className="font-semibold text-slate-800 dark:text-slate-100">{n.text}</div>
                          <div className="mt-1 text-[0.7rem] font-semibold text-slate-400 dark:text-slate-300">
                            {n.createdBy}
                            {n.createdAt
                              ? ` · ${new Date(n.createdAt).toLocaleString()}`
                              : ""}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mb-3 text-sm font-semibold text-slate-400 dark:text-slate-300">
                      No notes on this step yet.
                    </p>
                  )}
                  <label className="field mb-3">
                    <span>New note</span>
                    <textarea
                      className="field-input min-h-[88px] py-3"
                      value={stepNoteInput}
                      onChange={(e) => setStepNoteInput(e.target.value)}
                      placeholder="Enter note…"
                      rows={3}
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      className="btn btn-ghost"
                      disabled={saving}
                      onClick={closeTrackingDialog}
                    >
                      Close
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={saving}
                      onClick={() => void confirmAddStepNote()}
                    >
                      {saving ? "Saving…" : "Add note"}
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
