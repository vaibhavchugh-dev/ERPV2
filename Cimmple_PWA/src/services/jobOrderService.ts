import api from "./apiClient";
import { AuthService } from "./authService";

export type ProgressState = "idle" | "running" | "paused" | "stopped";

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
  elapsedTime?: number;
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
    return (response.data.result as JobOrderListItem[]) || [];
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
          }))
        : [],
      DrawingNumber: result.drawingNumber || result.DrawingNumber || "",
      DrawingRevision: result.drawingRevision || result.DrawingRevision || "",
      JobTemplateId: result.jobTemplateId ?? result.JobTemplateId ?? null,
      JobTemplateCode: result.jobTemplateCode || result.JobTemplateCode || "",
      JobTemplateRevision:
        result.jobTemplateRevision ?? result.JobTemplateRevision ?? null,
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

/** Derive the "current" step for list cards: first running/paused, else first non-completed. */
export function getCurrentStep(
  steps: JobOrderRoutingStep[] | undefined
): JobOrderRoutingStep | null {
  if (!steps?.length) return null;
  const sorted = [...steps].sort((a, b) => a.sequence - b.sequence);
  const active = sorted.find(
    (s) => s.progressState === "running" || s.progressState === "paused"
  );
  if (active) return active;
  const pending = sorted.find((s) => s.status !== "Completed");
  return pending || sorted[sorted.length - 1] || null;
}

export function applyStepAction(
  steps: JobOrderRoutingStep[],
  stepId: number,
  action: "start" | "pause" | "resume" | "complete",
  technicianName?: string
): JobOrderRoutingStep[] {
  return steps.map((s) => {
    if (s.id !== stepId) return s;

    switch (action) {
      case "start":
      case "resume":
        return {
          ...s,
          progressState: "running",
          startTime: new Date().toISOString(),
          elapsedTime: s.elapsedTime || 0,
          status: "In Progress",
          technicianName: technicianName || s.technicianName,
        };
      case "pause":
        return {
          ...s,
          progressState: "paused",
        };
      case "complete":
        return {
          ...s,
          progressState: "stopped",
          status: "Completed",
        };
      default:
        return s;
    }
  });
}

export function deriveJobStatus(
  currentStatus: string,
  steps: JobOrderRoutingStep[]
): string {
  if (currentStatus === "Cancelled") return currentStatus;
  if (steps.length === 0) return currentStatus;

  const allCompleted = steps.every((s) => s.status === "Completed");
  if (allCompleted) return "Completed";

  const anyStarted = steps.some(
    (s) =>
      s.progressState === "running" ||
      s.progressState === "paused" ||
      s.progressState === "stopped" ||
      s.status === "In Progress" ||
      s.status === "Completed"
  );
  if (anyStarted && currentStatus === "Draft") return "In Progress";
  if (anyStarted && currentStatus !== "Completed") {
    return currentStatus === "Draft" ? "In Progress" : currentStatus;
  }
  return currentStatus;
}
