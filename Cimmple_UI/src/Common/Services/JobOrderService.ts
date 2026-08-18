import Instense from "./Axios-config";
import { formatDateOnlyFromApi, toDateOnlyApiString } from "../Utils/Formatting";

export interface JobOrderMaster {
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
  isShortMaterial?: boolean;
}

export interface JobOrderMasterReq {
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
  Attachments?: JobOrderAttachment[];
  Comments?: JobOrderComment[];
  RoutingSteps?: JobOrderRoutingStep[];
  DrawingNumber?: string;
  DrawingRevision?: string;
  JobTemplateId?: number | null;
  JobTemplateCode?: string;
  JobTemplateRevision?: number | null;
  EnableJobTracking?: boolean;
  /** Planned material. Sent on office save; omit on PWA step saves so lines are not wiped. */
  MaterialRequirements?: JobMaterialRequirement[];
}

export interface JobMaterialRequirement {
  Id: number;
  SequenceNumber: number;
  ProductId?: number | null;
  RawMaterialId?: number | null;
  PartNo?: string;
  PartName?: string;
  QuantityNeeded: number;
  Notes: string;
  LocationId?: number | null;
  LocationName?: string;
  QuantityOnHand?: number;
  QuantityAvailable?: number;
  QuantityReserved?: number;
  QuantityIssued?: number;
  QuantityShort?: number;
  IsShort?: boolean;
  /** UI-only: which picker this row uses. */
  ItemType?: "rm" | "product";
}

export interface JobOrderAttachment {
  id: number;
  name: string;
  size: number;
  fileUrl?: string;
}

export interface JobOrderComment {
  id: number;
  text: string;
  createdAt: string;
  createdBy: string;
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
  // Job tracking fields
  qtyProduced?: number;
  technicianName?: string;
  technicianId?: number;
  progressState?: 'idle' | 'running' | 'paused' | 'stopped';
  startTime?: string;
  /** Legacy committed minutes (kept in sync with elapsedSeconds for older readers). */
  elapsedTime?: number;
  /** Committed elapsed seconds (preferred precision). */
  elapsedSeconds?: number;
  /** Reason recorded when the step was last paused. */
  pauseReason?: string;
  /** Inline shop notes for this operation. */
  notes?: JobOrderStepNote[];
  /** Linked NCRs created from this step (pointers into Quality module). */
  ncrFlags?: JobOrderStepNcrFlag[];
  /**
   * Stable scan payload for shop-floor QR/barcode.
   * Format: cimmple://jo/{jobOrderId}/step/{stepId}
   */
  scanCode?: string;
}

/** Build a stable scan code for a routing step (PWA can parse later). */
export function buildStepScanCode(jobOrderId: number, stepId: number): string {
  return `cimmple://jo/${jobOrderId}/step/${stepId}`;
}

/** Common hold reasons for small machine shops (flexible — not required codes). */
export const JOB_STEP_PAUSE_REASONS = [
  "Waiting for material",
  "Setup / changeover",
  "Machine down",
  "Inspection / QA wait",
  "Break",
  "Other",
] as const;

export const WAITING_FOR_MATERIAL_REASON = JOB_STEP_PAUSE_REASONS[0];

export function jobIgnoresMaterialShortage(status?: string): boolean {
  const s = (status || "").trim().toLowerCase();
  return (
    s === "completed" ||
    s === "cancelled" ||
    s === "canceled" ||
    s === "shipped"
  );
}

/** Needed beyond what this job already reserved, issued, and what is still free on the shelf. */
export function materialShortageQty(
  line: Pick<
    JobMaterialRequirement,
    "Id" | "QuantityNeeded" | "QuantityReserved" | "QuantityIssued" | "QuantityAvailable"
  >
): number {
  if ((line.Id || 0) <= 0) return 0;
  const needed = Number(line.QuantityNeeded) || 0;
  const reserved = Number(line.QuantityReserved) || 0;
  const issued = Number(line.QuantityIssued) || 0;
  const available = Number(line.QuantityAvailable) || 0;
  return Math.max(0, needed - reserved - issued - available);
}

export function isMaterialLineShort(line: JobMaterialRequirement): boolean {
  return materialShortageQty(line) > 0;
}

export function isJobShortMaterial(
  status: string | undefined,
  lines?: JobMaterialRequirement[]
): boolean {
  if (jobIgnoresMaterialShortage(status)) return false;
  return (lines || []).some(isMaterialLineShort);
}

const roundQty = (n: number): number => Math.round(n * 100) / 100;

function lineQty(line: JobMaterialRequirement) {
  return {
    needed: Number(line.QuantityNeeded) || 0,
    reserved: Number(line.QuantityReserved) || 0,
    issued: Number(line.QuantityIssued) || 0,
    available: Number(line.QuantityAvailable) || 0,
  };
}

/** Still planned for this job, ignoring whether the shelf has it. */
export function remainingUncovered(line: JobMaterialRequirement): number {
  if ((line.Id || 0) <= 0) return 0;
  const { needed, reserved, issued } = lineQty(line);
  return roundQty(Math.max(0, needed - reserved - issued));
}

/** Still needed on the shelf for this job, limited to what is free (not held for others). */
export function remainingToReserve(line: JobMaterialRequirement): number {
  if ((line.Id || 0) <= 0) return 0;
  const { available } = lineQty(line);
  return roundQty(Math.min(available, remainingUncovered(line)));
}

/** Still needed to consume, including qty already reserved for this job. */
export function remainingToIssue(line: JobMaterialRequirement): number {
  if ((line.Id || 0) <= 0) return 0;
  const { needed, reserved, issued, available } = lineQty(line);
  const canIssue = available + reserved;
  return roundQty(Math.max(0, Math.min(canIssue, needed - issued)));
}

/** Open the kit UI when nothing is planned, something is still to issue, or a line is short. */
export function jobMaterialNeedsKit(lines?: JobMaterialRequirement[]): boolean {
  const list = lines || [];
  if (list.length === 0) return true;
  return list.some((line) => {
    if ((line.Id || 0) <= 0) return true;
    const { needed, issued } = lineQty(line);
    return roundQty(issued) < roundQty(needed) || isMaterialLineShort(line);
  });
}

/** Committed seconds: prefer elapsedSeconds; legacy elapsedTime was minutes. */
export function getCommittedSeconds(
  step: Pick<JobOrderRoutingStep, "elapsedTime" | "elapsedSeconds">
): number {
  if (typeof step.elapsedSeconds === "number" && step.elapsedSeconds >= 0) {
    return step.elapsedSeconds;
  }
  return (step.elapsedTime || 0) * 60;
}

/** Live elapsed seconds = committed + wall-clock since startTime when running. */
export function computeElapsedSeconds(
  step: Pick<JobOrderRoutingStep, "elapsedTime" | "elapsedSeconds" | "progressState" | "startTime">,
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

/** @deprecated Prefer computeElapsedSeconds + formatElapsedDuration */
export function computeElapsedMinutes(
  step: Pick<JobOrderRoutingStep, "elapsedTime" | "elapsedSeconds" | "progressState" | "startTime">,
  nowMs: number = Date.now()
): number {
  return Math.floor(computeElapsedSeconds(step, nowMs) / 60);
}

/** Format seconds as M:SS or H:MM:SS */
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

/** Fold wall-clock segment into elapsed fields and reset startTime to now (for running steps). */
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

/**
 * Align job Status with routing-step progress.
 * Preserves Cancelled / Partially Shipped / Shipped; bumps Draft→In Progress; all steps Completed→Completed.
 * If job was Completed but a step is reopened, returns In Progress.
 * Does not enforce operation sequence (small shops often run ops out of order).
 */
export function deriveJobStatus(
  currentStatus: string,
  steps: JobOrderRoutingStep[]
): string {
  const status = (currentStatus || "Draft").trim();
  if (status === "Cancelled") return status;
  if (status === "Partially Shipped" || status === "Shipped") return status;
  if (!steps.length) return status;

  const allCompleted = steps.every((s) => s.status === "Completed");
  if (allCompleted) return "Completed";

  // A reopened / incomplete step must move the job out of Completed.
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

export function isStepCompleted(step: Pick<JobOrderRoutingStep, "status" | "progressState">): boolean {
  return step.status === "Completed" || step.progressState === "stopped";
}

/** Hard cap: each step's produced qty cannot exceed the job order qty. */
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

/** Overall job complete: qty must be > 0 and ≤ order qty. Below order qty is a warning only. */
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

export class JobOrderService {
  public static GetJobOrders = async (
    request: { tenantid: number; locationId?: number }
  ): Promise<JobOrderMaster[] | null> => {
    // Use the tenantid from request if provided, otherwise fall back to localStorage
    let tenantID = request.tenantid || 0;
    
    // If still 0, try localStorage
    if (tenantID === 0) {
      const storage = JSON.parse(localStorage.getItem("storage") || "{}");
      tenantID = storage?.tenantID || 0;
    }
    
    // For development: if tenantID is not set, use a default value
    if (tenantID === 0 && process.env.NODE_ENV === 'development') {
      tenantID = 1; // Default tenant ID for development
    }

    const url = `/JobOrder/GetJobOrders`;
    const params: Record<string, number> = { tenantid: tenantID };
    if (request.locationId && request.locationId > 0) {
      params.locationId = request.locationId;
    }
    return Instense.get(url, { params }).then((response) => {
      const result = response.data.result as JobOrderMaster[];
      return result;
    });
  };

  /** Lightweight: job orders linked to one customer order (detail ID → job order ID). */
  public static GetJobOrdersByCustomerOrder = async (
    orderId: number
  ): Promise<{ jobOrderID: number; customerOrderDetailID: number; status: string }[] | null> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    let tenantID = storage?.tenantID || 0;
    if (tenantID === 0 && process.env.NODE_ENV === "development") {
      tenantID = 1;
    }

    const url = `/JobOrder/GetJobOrdersByCustomerOrder`;
    return Instense.get(url, {
      params: { orderId, tenantId: tenantID },
    }).then((response) => {
      return (response.data.result || []) as {
        jobOrderID: number;
        customerOrderDetailID: number;
        status: string;
      }[];
    });
  };

  public static GetJobOrderById = async (
    jobOrderId: number
  ): Promise<JobOrderMasterReq | null> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    let tenantID = storage?.tenantID || 0;
    
    // For development: if tenantID is not set, use a default value
    if (tenantID === 0 && process.env.NODE_ENV === 'development') {
      tenantID = 1; // Default tenant ID for development
    }

    const url = `/JobOrder/GetJobOrderById`;
    return Instense.get(url, {
      params: { jobOrderId, tenantId: tenantID },
    }).then((response) => {
      const result = response.data.result;
      if (!result) return null;

      // Calendar parts only — no timezone shift (same pattern as Orders)
      const formatDate = (dateStr: string | null | undefined): string =>
        formatDateOnlyFromApi(dateStr);

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
        UserId: result.userId || 0,
        UserToken: result.userToken || 0,
        OrderDate: formatDate(result.orderDate),
        Attachments: Array.isArray(result.attachments)
          ? result.attachments.map((a: any) => ({
              id: a.id || a.Id || 0,
              name: a.name || a.Name || "",
              size: a.size || a.Size || 0,
              fileUrl: a.fileUrl || a.FileUrl || "",
            }))
          : [],
        Comments: Array.isArray(result.comments)
          ? result.comments.map((c: any) => ({
              id: c.id || c.Id || 0,
              text: c.text || c.Text || "",
              createdAt: c.createdAt || c.CreatedAt || new Date().toISOString(),
              createdBy: c.createdBy || c.CreatedBy || "User",
            }))
          : [],
        RoutingSteps: Array.isArray(result.routingSteps)
          ? result.routingSteps.map((r: any) => ({
              id: r.id || r.Id || 0,
              sequence: r.sequence || r.Sequence || 0,
              processName: r.processName || r.ProcessName || "",
              processId: r.processId || r.ProcessId,
              workstationName: r.workstationName || r.WorkstationName,
              workstationId: r.workstationId || r.WorkstationId,
              estimatedTime: r.estimatedTime || r.EstimatedTime || 0,
              description: r.description || r.Description || "",
              status: r.status || r.Status || "Pending",
              // Job tracking fields
              qtyProduced: r.qtyProduced || r.QtyProduced || 0,
              technicianName: r.technicianName || r.TechnicianName || "",
              technicianId: r.technicianId || r.TechnicianId,
              progressState: r.progressState || r.ProgressState || "idle",
              startTime: r.startTime || r.StartTime,
              elapsedTime: r.elapsedTime || r.ElapsedTime || 0,
              elapsedSeconds:
                r.elapsedSeconds ?? r.ElapsedSeconds ?? undefined,
              pauseReason: r.pauseReason || r.PauseReason || undefined,
              notes: Array.isArray(r.notes || r.Notes)
                ? (r.notes || r.Notes).map((n: any) => ({
                    id: Number(n.id ?? n.Id ?? 0),
                    text: String(n.text ?? n.Text ?? ""),
                    createdAt: String(n.createdAt ?? n.CreatedAt ?? ""),
                    createdBy: String(n.createdBy ?? n.CreatedBy ?? "User"),
                  }))
                : [],
              ncrFlags: Array.isArray(r.ncrFlags || r.NcrFlags)
                ? (r.ncrFlags || r.NcrFlags).map((f: any) => ({
                    ncrId: Number(f.ncrId ?? f.NcrId ?? 0),
                    ncrNumber: String(f.ncrNumber ?? f.NcrNumber ?? ""),
                    status: String(f.status ?? f.Status ?? "Open"),
                  }))
                : [],
              scanCode: r.scanCode || r.ScanCode || undefined,
            }))
          : [],
        DrawingNumber: result.drawingNumber || result.DrawingNumber || "",
        DrawingRevision: result.drawingRevision || result.DrawingRevision || "",
        JobTemplateId: result.jobTemplateId ?? result.JobTemplateId ?? null,
        JobTemplateCode: result.jobTemplateCode || result.JobTemplateCode || "",
        JobTemplateRevision: result.jobTemplateRevision ?? result.JobTemplateRevision ?? null,
        EnableJobTracking: !!(result.enableJobTracking ?? result.EnableJobTracking),
        MaterialRequirements: Array.isArray(result.materialRequirements)
          ? result.materialRequirements.map((m: any) => ({
              Id: m.id || m.Id || 0,
              SequenceNumber: m.sequenceNumber || m.SequenceNumber || 10,
              ProductId: m.productId ?? m.ProductId ?? null,
              RawMaterialId: m.rawMaterialId ?? m.RawMaterialId ?? null,
              PartNo: m.partNo || m.PartNo || "",
              PartName: m.partName || m.PartName || "",
              QuantityNeeded: Number(m.quantityNeeded ?? m.QuantityNeeded ?? 0),
              Notes: m.notes || m.Notes || "",
              LocationId: m.locationId ?? m.LocationId ?? null,
              LocationName: m.locationName || m.LocationName || "",
              QuantityOnHand: Number(m.quantityOnHand ?? m.QuantityOnHand ?? 0),
              QuantityAvailable: Number(m.quantityAvailable ?? m.QuantityAvailable ?? 0),
              QuantityReserved: Number(m.quantityReserved ?? m.QuantityReserved ?? 0),
              QuantityIssued: Number(m.quantityIssued ?? m.QuantityIssued ?? 0),
              QuantityShort: Number(m.quantityShort ?? m.QuantityShort ?? 0),
              IsShort: !!(m.isShort ?? m.IsShort),
              ItemType: (m.productId ?? m.ProductId) ? "product" : "rm",
            }))
          : [],
      };
    });
  };

  public static SaveJobOrder = async (
    request: JobOrderMasterReq
  ): Promise<{ id: number; message: string }> => {
    const url = `/JobOrder/SaveJobOrder`;
    // Date-only yyyy-MM-dd (no timezone shift) — same pattern as Orders
    const payload = {
      ...request,
      DueDate: toDateOnlyApiString(request.DueDate),
      OrderDate: toDateOnlyApiString(request.OrderDate),
      EnableJobTracking: !!request.EnableJobTracking,
    };
    return Instense.post(url, payload).then((response) => {
      const result = response.data.result;
      if (result && result.id) {
        return { id: result.id, message: result.message || "Job order saved successfully" };
      }
      return { id: request.JobOrderID || 0, message: "Job order saved successfully" };
    });
  };

  public static CheckJobOrderDeletionImpact = async (
    jobOrderId: number
  ): Promise<any> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    let tenantID = storage?.tenantID || 0;
    
    // For development: if tenantID is not set, use a default value
    if (tenantID === 0 && process.env.NODE_ENV === 'development') {
      tenantID = 1; // Default tenant ID for development
    }

    const url = `/JobOrder/CheckJobOrderDeletionImpact`;
    return Instense.get(url, {
      params: { jobOrderId, tenantId: tenantID },
    }).then((response) => {
      return response.data;
    });
  };

  public static DeleteJobOrder = async (
    jobOrderId: number
  ): Promise<void> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    let tenantID = storage?.tenantID || 0;
    
    // For development: if tenantID is not set, use a default value
    if (tenantID === 0 && process.env.NODE_ENV === 'development') {
      tenantID = 1; // Default tenant ID for development
    }

    const url = `/JobOrder/DeleteJobOrder`;
    return Instense.delete(url, {
      params: { jobOrderId, tenantId: tenantID },
    }).then(() => {
      return;
    });
  };

  public static CreateJobOrderFromOrderDetail = async (
    orderID: number,
    orderDetailID: number
  ): Promise<{ id: number; message: string }> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    let tenantID = storage?.tenantID || 0;
    
    // For development: if tenantID is not set, use a default value
    if (tenantID === 0 && process.env.NODE_ENV === 'development') {
      tenantID = 1; // Default tenant ID for development
    }
    const userId = storage?.userId || 0;
    const userToken = storage?.userToken || 0;

    const url = `/JobOrder/CreateJobOrderFromOrderDetail`;
    return Instense.post(url, {
      OrderID: orderID,
      OrderDetailID: orderDetailID,
      Tenantid: tenantID,
      UserId: userId,
      UserToken: userToken,
    }).then((response) => {
      const result = response.data.result;
      if (result && result.id) {
        return { id: result.id, message: result.message || "Job order created successfully" };
      }
      return { id: 0, message: "Job order created successfully" };
    });
  };
}

