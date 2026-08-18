import api from "./apiClient";
import { AuthService } from "./authService";

export type ProgressState = "idle" | "running" | "paused" | "stopped";

export interface JobOrderListStep {
  id: number;
  sequence: number;
  processName: string;
  status?: string;
  progressState?: ProgressState;
  qtyProduced?: number;
}

export interface JobOrderListItem {
  jobOrderID: number;
  jobOrderNumber: number;
  customerOrderID: number;
  customerOrderDetailID: number;
  customerID: number;
  customerName: string;
  customerCode: string;
  partNo: string;
  partName: string;
  qtyOrdered: number;
  unit: string;
  unitPrice: number;
  dueDate: string;
  jobNumber: string;
  jobDesc: string;
  jobPriority: number;
  status: string;
  orderDate: string;
  routingSteps?: JobOrderListStep[];
  isShortMaterial?: boolean;
}

export interface JobOrderStepNote {
  id: number;
  text: string;
  createdAt: string;
  createdBy: string;
}

export interface JobOrderStepNcrFlag {
  ncrId: number;
  ncrNumber: string;
  status: string;
}

export interface JobOrderRoutingStep {
  id: number;
  sequence: number;
  processName: string;
  processId?: number;
  workstationName?: string;
  workstationId?: number;
  estimatedTime?: number;
  description?: string;
  status?: string;
  qtyProduced?: number;
  technicianName?: string;
  technicianId?: number;
  progressState?: ProgressState;
  startTime?: string;
  /** Legacy committed minutes (kept in sync with elapsedSeconds). */
  elapsedTime?: number;
  /** Committed elapsed seconds (preferred precision). */
  elapsedSeconds?: number;
  /** Reason recorded when the step was last paused. */
  pauseReason?: string;
  /** Inline shop notes for this operation. */
  notes?: JobOrderStepNote[];
  /** Linked NCRs created from this step. */
  ncrFlags?: JobOrderStepNcrFlag[];
}

export interface JobOrderDetail {
  JobOrderID: number;
  JobOrderNumber: number;
  CustomerOrderID: number;
  CustomerOrderDetailID: number;
  CustomerID: number;
  CustomerName: string;
  CustomerCode: string;
  JobNumber: string;
  JobDesc: string;
  PartNo: string;
  PartName: string;
  QtyOrdered: number;
  Unit: string;
  UnitPrice: number;
  DueDate: string;
  JobPriority: number;
  Status: string;
  Tenantid: number;
  UserId: number;
  UserToken: number;
  OrderDate: string;
  Attachments?: { id: number; name: string; size: number; fileUrl?: string }[];
  Comments?: {
    id: number;
    text: string;
    createdAt: string;
    createdBy: string;
  }[];
  RoutingSteps?: JobOrderRoutingStep[];
  DrawingNumber?: string;
  DrawingRevision?: string;
  JobTemplateId?: number | null;
  JobTemplateCode?: string;
  JobTemplateRevision?: number | null;
  EnableJobTracking?: boolean;
  IsShortMaterial?: boolean;
}

const formatDate = (dateStr: string | Date): string => {
  if (!dateStr) return "";
  try {
    const date = typeof dateStr === "string" ? new Date(dateStr) : dateStr;
    if (Number.isNaN(date.getTime())) return String(dateStr);
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const year = String(date.getFullYear()).slice(-2);
    return `${month}/${day}/${year}`;
  } catch {
    return "";
  }
};

export class JobOrderService {
  public static async getJobOrders(): Promise<JobOrderListItem[]> {
    let tenantID = AuthService.getTenantId();
    if (tenantID === 0 && import.meta.env.DEV) {
      tenantID = 1;
    }

    const params: Record<string, number> = { tenantid: tenantID };
    const locationId = AuthService.getLocationId();
    if (locationId > 0) {
      params.locationId = locationId;
    }

    const response = await api.get("/JobOrder/GetJobOrders", { params });
    const rows = (response.data.result as Record<string, unknown>[]) || [];
    return rows.map((row) => {
      const rawSteps = (row.routingSteps ?? row.RoutingSteps) as
        | Record<string, unknown>[]
        | undefined;
      return {
        jobOrderID: Number(row.jobOrderID ?? row.JobOrderID ?? 0),
        jobOrderNumber: Number(row.jobOrderNumber ?? row.JobOrderNumber ?? 0),
        customerOrderID: Number(row.customerOrderID ?? row.CustomerOrderID ?? 0),
        customerOrderDetailID: Number(
          row.customerOrderDetailID ?? row.CustomerOrderDetailID ?? 0
        ),
        customerID: Number(row.customerID ?? row.CustomerID ?? 0),
        customerName: String(row.customerName ?? row.CustomerName ?? ""),
        customerCode: String(row.customerCode ?? row.CustomerCode ?? ""),
        partNo: String(row.partNo ?? row.PartNo ?? ""),
        partName: String(row.partName ?? row.PartName ?? ""),
        qtyOrdered: Number(row.qtyOrdered ?? row.QtyOrdered ?? 0),
        unit: String(row.unit ?? row.Unit ?? ""),
        unitPrice: Number(row.unitPrice ?? row.UnitPrice ?? 0),
        dueDate: String(row.dueDate ?? row.DueDate ?? ""),
        jobNumber: String(row.jobNumber ?? row.JobNumber ?? ""),
        jobDesc: String(row.jobDesc ?? row.JobDesc ?? ""),
        jobPriority: Number(row.jobPriority ?? row.JobPriority ?? 0),
        status: String(row.status ?? row.Status ?? "Draft"),
        orderDate: String(row.orderDate ?? row.OrderDate ?? ""),
        isShortMaterial: !!(row.isShortMaterial ?? row.IsShortMaterial),
        routingSteps: Array.isArray(rawSteps)
          ? rawSteps.map((s) => ({
              id: Number(s.id ?? s.Id ?? 0),
              sequence: Number(s.sequence ?? s.Sequence ?? 0),
              processName: String(s.processName ?? s.ProcessName ?? ""),
              status: String(s.status ?? s.Status ?? ""),
              progressState: (s.progressState ??
                s.ProgressState ??
                "idle") as ProgressState,
              qtyProduced: Number(s.qtyProduced ?? s.QtyProduced ?? 0),
            }))
          : [],
      } as JobOrderListItem;
    });
  }

  public static async getJobOrderById(
    jobOrderId: number
  ): Promise<JobOrderDetail | null> {
    let tenantID = AuthService.getTenantId();
    if (tenantID === 0 && import.meta.env.DEV) {
      tenantID = 1;
    }

    const response = await api.get("/JobOrder/GetJobOrderById", {
      params: { jobOrderId, tenantId: tenantID },
    });
    const result = response.data.result;
    if (!result) return null;

    return {
      JobOrderID: result.jobOrderID,
      JobOrderNumber: result.jobOrderNumber,
      CustomerOrderID: result.customerOrderID,
      CustomerOrderDetailID: result.customerOrderDetailID,
      CustomerID: result.customerID,
      CustomerName: result.customerName || "",
      CustomerCode: result.customerCode || "",
      JobNumber: result.jobNumber || "",
      JobDesc: result.jobDesc || "",
      PartNo: result.partNo || "",
      PartName: result.partName || "",
      QtyOrdered: result.qtyOrdered,
      Unit: result.unit || "",
      UnitPrice: result.unitPrice,
      DueDate: formatDate(result.dueDate),
      JobPriority: result.jobPriority,
      Status: result.status || "Draft",
      Tenantid: tenantID,
      UserId: result.userId || AuthService.getUserId(),
      UserToken: result.userToken || 0,
      OrderDate: formatDate(result.orderDate),
      Attachments: Array.isArray(result.attachments)
        ? result.attachments.map((a: Record<string, unknown>) => ({
            id: Number(a.id ?? a.Id ?? 0),
            name: String(a.name ?? a.Name ?? ""),
            size: Number(a.size ?? a.Size ?? 0),
            fileUrl: String(a.fileUrl ?? a.FileUrl ?? ""),
          }))
        : [],
      Comments: Array.isArray(result.comments)
        ? result.comments.map((c: Record<string, unknown>) => ({
            id: Number(c.id ?? c.Id ?? 0),
            text: String(c.text ?? c.Text ?? ""),
            createdAt: String(
              c.createdAt ?? c.CreatedAt ?? new Date().toISOString()
            ),
            createdBy: String(c.createdBy ?? c.CreatedBy ?? "User"),
          }))
        : [],
      RoutingSteps: Array.isArray(result.routingSteps)
        ? result.routingSteps.map((r: Record<string, unknown>) => ({
            id: Number(r.id ?? r.Id ?? 0),
            sequence: Number(r.sequence ?? r.Sequence ?? 0),
            processName: String(r.processName ?? r.ProcessName ?? ""),
            processId: (r.processId ?? r.ProcessId) as number | undefined,
            workstationName: (r.workstationName ?? r.WorkstationName) as
              | string
              | undefined,
            workstationId: (r.workstationId ?? r.WorkstationId) as
              | number
              | undefined,
            estimatedTime: Number(r.estimatedTime ?? r.EstimatedTime ?? 0),
            description: String(r.description ?? r.Description ?? ""),
            status: String(r.status ?? r.Status ?? "Pending"),
            qtyProduced: Number(r.qtyProduced ?? r.QtyProduced ?? 0),
            technicianName: String(r.technicianName ?? r.TechnicianName ?? ""),
            technicianId: (r.technicianId ?? r.TechnicianId) as
              | number
              | undefined,
            progressState: (r.progressState ??
              r.ProgressState ??
              "idle") as ProgressState,
            startTime: (r.startTime ?? r.StartTime) as string | undefined,
            elapsedTime: Number(r.elapsedTime ?? r.ElapsedTime ?? 0),
            elapsedSeconds: (r.elapsedSeconds ?? r.ElapsedSeconds) as
              | number
              | undefined,
            pauseReason: (r.pauseReason ?? r.PauseReason) as string | undefined,
            notes: (() => {
              const rawNotes = (r.notes ?? r.Notes) as unknown;
              if (!Array.isArray(rawNotes)) return [];
              return rawNotes.map((n: Record<string, unknown>) => ({
                id: Number(n.id ?? n.Id ?? 0),
                text: String(n.text ?? n.Text ?? ""),
                createdAt: String(n.createdAt ?? n.CreatedAt ?? ""),
                createdBy: String(n.createdBy ?? n.CreatedBy ?? "User"),
              }));
            })(),
            ncrFlags: (() => {
              const rawFlags = (r.ncrFlags ?? r.NcrFlags) as unknown;
              if (!Array.isArray(rawFlags)) return [];
              return rawFlags.map((f: Record<string, unknown>) => ({
                ncrId: Number(f.ncrId ?? f.NcrId ?? 0),
                ncrNumber: String(f.ncrNumber ?? f.NcrNumber ?? ""),
                status: String(f.status ?? f.Status ?? "Open"),
              }));
            })(),
          }))
        : [],
      DrawingNumber: result.drawingNumber || result.DrawingNumber || "",
      DrawingRevision: result.drawingRevision || result.DrawingRevision || "",
      JobTemplateId: result.jobTemplateId ?? result.JobTemplateId ?? null,
      JobTemplateCode: result.jobTemplateCode || result.JobTemplateCode || "",
      JobTemplateRevision:
        result.jobTemplateRevision ?? result.JobTemplateRevision ?? null,
      EnableJobTracking: !!(result.enableJobTracking ?? result.EnableJobTracking),
      IsShortMaterial: !!(result.isShortMaterial ?? result.IsShortMaterial),
    };
  }

  public static async saveJobOrder(
    request: JobOrderDetail
  ): Promise<{ id: number; message: string }> {
    const response = await api.post("/JobOrder/SaveJobOrder", request);
    const result = response.data.result;
    if (result?.id) {
      return {
        id: result.id,
        message: result.message || "Job order saved successfully",
      };
    }
    return {
      id: request.JobOrderID || 0,
      message: "Job order saved successfully",
    };
  }
}

/** Common hold reasons (same list as Cimmple_UI). */
export const JOB_STEP_PAUSE_REASONS = [
  "Waiting for material",
  "Setup / changeover",
  "Machine down",
  "Inspection / QA wait",
  "Break",
  "Other",
] as const;

export const WAITING_FOR_MATERIAL_REASON = JOB_STEP_PAUSE_REASONS[0];

/** Committed seconds: prefer elapsedSeconds; legacy elapsedTime was minutes. */
export function getCommittedSeconds(
  step: Pick<JobOrderRoutingStep, "elapsedTime" | "elapsedSeconds">
): number {
  if (typeof step.elapsedSeconds === "number" && step.elapsedSeconds >= 0) {
    return step.elapsedSeconds;
  }
  return (step.elapsedTime || 0) * 60;
}

/** Live elapsed = committed + wall-clock since startTime when running. */
export function computeElapsedSeconds(
  step: Pick<
    JobOrderRoutingStep,
    "elapsedTime" | "elapsedSeconds" | "progressState" | "startTime"
  >,
  nowMs: number = Date.now()
): number {
  let base = getCommittedSeconds(step);
  if (step.progressState === "running" && step.startTime) {
    const started = new Date(step.startTime).getTime();
    if (!Number.isNaN(started)) {
      base += Math.max(0, Math.floor((nowMs - started) / 1000));
    }
  }
  return base;
}

export function formatElapsedDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export function toElapsedFields(totalSeconds: number): {
  elapsedSeconds: number;
  elapsedTime: number;
} {
  const secs = Math.max(0, Math.floor(totalSeconds));
  return {
    elapsedSeconds: secs,
    elapsedTime: Math.floor(secs / 60),
  };
}

/** Fold wall-clock into committed fields and reset startTime (for save while running). */
export function commitLiveElapsed(
  steps: JobOrderRoutingStep[],
  now: Date = new Date()
): JobOrderRoutingStep[] {
  const nowMs = now.getTime();
  const nowIso = now.toISOString();
  return steps.map((s) => {
    if (s.progressState !== "running" || !s.startTime) return s;
    return {
      ...s,
      ...toElapsedFields(computeElapsedSeconds(s, nowMs)),
      startTime: nowIso,
    };
  });
}

export function isStepCompleted(
  step: Pick<JobOrderRoutingStep, "status" | "progressState">
): boolean {
  return step.status === "Completed" || step.progressState === "stopped";
}

/** Derive the "current" step for list cards: first running/paused, else first non-completed. */
export function getCurrentStep<
  T extends Pick<
    JobOrderRoutingStep,
    "id" | "sequence" | "processName" | "status" | "progressState"
  >
>(steps: T[] | undefined): T | null {
  if (!steps?.length) return null;
  const sorted = [...steps].sort((a, b) => a.sequence - b.sequence);
  const active = sorted.find(
    (s) => s.progressState === "running" || s.progressState === "paused"
  );
  if (active) return active;
  const pending = sorted.find((s) => !isStepCompleted(s));
  return pending || sorted[sorted.length - 1] || null;
}

/**
 * Align job Status with routing-step progress (same rules as Cimmple_UI).
 */
export function deriveJobStatus(
  currentStatus: string,
  steps: JobOrderRoutingStep[]
): string {
  const status = (currentStatus || "Draft").trim();
  if (status === "Cancelled") return status;
  if (status === "Partially Shipped" || status === "Shipped") return status;
  if (!steps.length) return status;

  const allCompleted = steps.every((s) => isStepCompleted(s));
  if (allCompleted) return "Completed";

  if (status === "Completed") return "In Progress";

  const anyStarted = steps.some(
    (s) =>
      s.progressState === "running" ||
      s.progressState === "paused" ||
      s.progressState === "stopped" ||
      s.status === "In Progress" ||
      s.status === "Completed"
  );
  if (anyStarted && status === "Draft") return "In Progress";
  return status;
}

export function getMaxProducedQty(orderQty: number): number {
  return Math.max(0, orderQty || 0);
}

export function parseProducedQty(
  raw: string | number,
  orderQty: number,
  mode: "save" | "complete" = "save"
): { ok: true; qty: number } | { ok: false; error: string } {
  const text = String(raw ?? "").trim();
  const max = getMaxProducedQty(orderQty);

  if (text === "") {
    if (mode === "save") return { ok: true, qty: 0 };
    return { ok: false, error: "Enter produced quantity for this operation." };
  }

  const qty = typeof raw === "number" ? raw : parseInt(text, 10);
  if (!Number.isFinite(qty) || Number.isNaN(qty) || !Number.isInteger(qty)) {
    return { ok: false, error: "Enter a whole number." };
  }

  if (mode === "complete" && qty < 1) {
    return { ok: false, error: "Qty produced must be greater than 0." };
  }

  if (qty < 0) {
    return { ok: false, error: "Qty produced cannot be negative." };
  }

  if (qty > max) {
    return {
      ok: false,
      error: "Qty produced cannot exceed order qty.",
    };
  }

  return { ok: true, qty };
}

export function getOverallCompleteQtyError(
  raw: string | number,
  orderQty: number
): string {
  const parsed = parseProducedQty(raw, orderQty, "complete");
  return parsed.ok ? "" : parsed.error;
}

export function isProducedQtyBelowOrderQty(
  raw: string | number,
  orderQty: number
): boolean {
  const parsed = parseProducedQty(raw, orderQty, "complete");
  if (!parsed.ok) return false;
  const max = getMaxProducedQty(orderQty);
  return max > 0 && parsed.qty < max;
}
