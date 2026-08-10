import api from "./apiClient";
import { AuthService } from "./authService";

export type NCRCategory =
  | "Material_Defect"
  | "Dimensional_Issue"
  | "Process_Failure"
  | "Equipment_Problem"
  | "Documentation_Error"
  | "Supplier_Quality"
  | "Other";

export type NCRSeverity = "Minor" | "Major" | "Critical";

export type NCRStatus =
  | "Open"
  | "Under_Investigation"
  | "Pending_Approval"
  | "Approved"
  | "Implemented"
  | "Closed"
  | "Rejected";

export type RootCauseCategory =
  | "Man"
  | "Machine"
  | "Material"
  | "Method"
  | "Measurement"
  | "Other";

export interface NonConformanceReport {
  ncrId: number;
  ncrNumber: string;
  title: string;
  description: string;
  category: NCRCategory;
  severity: NCRSeverity;
  status: NCRStatus;
  source: "Internal" | "External" | "Customer";
  jobOrderId?: number;
  jobOrderNumber?: string;
  routingStepId?: number;
  partNo?: string;
  partName?: string;
  customerId?: number;
  customerName?: string;
  defectLocation: string;
  defectQuantity: number;
  totalQuantity: number;
  defectDescription: string;
  photos?: string[];
  rootCause: string;
  rootCauseCategory: RootCauseCategory;
  immediateAction: string;
  correctiveAction: string;
  preventiveAction: string;
  reportedBy: number;
  reportedByName?: string;
  reportedDate: string;
  investigatedBy?: number;
  investigatedByName?: string;
  investigatedDate?: string;
  approvedBy?: number;
  approvedByName?: string;
  approvedDate?: string;
  dueDate?: string;
  closedDate?: string;
  costImpact?: number;
  notes?: string;
  tenantId?: number;
}

export interface NCRFilters {
  status?: NCRStatus;
  category?: NCRCategory;
  severity?: NCRSeverity;
  source?: "Internal" | "External" | "Customer";
  jobOrderId?: number;
  dateFrom?: string;
  dateTo?: string;
  tenantId: number;
}

function normalizePhotos(photos: unknown): string[] {
  if (!photos) return [];
  if (Array.isArray(photos)) return photos.map(String);
  if (typeof photos === "string") {
    try {
      const parsed = JSON.parse(photos);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return photos ? [photos] : [];
    }
  }
  return [];
}

function normalizeNcr(raw: Record<string, unknown> | null): NonConformanceReport | null {
  if (!raw) return null;
  return {
    ...(raw as unknown as NonConformanceReport),
    photos: normalizePhotos(raw.photos),
  };
}

export class QualityService {
  static async getNCRs(filters: NCRFilters): Promise<NonConformanceReport[]> {
    const response = await api.get("/Quality/GetNCRs", { params: filters });
    const ncrs = (response.data.result || []) as Record<string, unknown>[];
    return ncrs.map((n) => normalizeNcr(n)!).filter(Boolean);
  }

  static async getNCRById(ncrId: number): Promise<NonConformanceReport | null> {
    const tenantId = AuthService.getTenantId();
    const response = await api.get(`/Quality/GetNCR/${ncrId}`, {
      params: { tenantId },
    });
    return normalizeNcr(response.data.result);
  }

  static async createNCR(
    ncr: Omit<NonConformanceReport, "ncrId" | "ncrNumber">
  ): Promise<NonConformanceReport | null> {
    const ncrData = {
      ...ncr,
      photos: ncr.photos && ncr.photos.length > 0 ? JSON.stringify(ncr.photos) : null,
      jobOrderId: ncr.jobOrderId && ncr.jobOrderId > 0 ? ncr.jobOrderId : null,
      customerId: ncr.customerId && ncr.customerId > 0 ? ncr.customerId : null,
      routingStepId: ncr.routingStepId && ncr.routingStepId > 0 ? ncr.routingStepId : null,
    };
    const response = await api.post("/Quality/CreateNCR", ncrData);
    return normalizeNcr(response.data.result);
  }

  static async updateNCR(
    ncrId: number,
    updates: Partial<NonConformanceReport>
  ): Promise<boolean> {
    const updateData = {
      ...updates,
      photos:
        updates.photos !== undefined
          ? updates.photos && updates.photos.length > 0
            ? JSON.stringify(updates.photos)
            : null
          : undefined,
      jobOrderId:
        updates.jobOrderId !== undefined
          ? updates.jobOrderId && updates.jobOrderId > 0
            ? updates.jobOrderId
            : null
          : undefined,
      customerId:
        updates.customerId !== undefined
          ? updates.customerId && updates.customerId > 0
            ? updates.customerId
            : null
          : undefined,
    };
    await api.put(`/Quality/UpdateNCR/${ncrId}`, updateData);
    return true;
  }

  static async deleteNCR(ncrId: number): Promise<boolean> {
    const tenantId = AuthService.getTenantId();
    await api.delete("/Quality/DeleteNCR", {
      params: { ncrId, tenantId },
    });
    return true;
  }

  static async getNCRStats(tenantId: number): Promise<{
    totalNCRs: number;
    openNCRs: number;
    criticalNCRs: number;
    overdueNCRs: number;
  }> {
    const response = await api.get("/Quality/GetNCRStats", {
      params: { tenantId },
    });
    return (
      response.data.result || {
        totalNCRs: 0,
        openNCRs: 0,
        criticalNCRs: 0,
        overdueNCRs: 0,
      }
    );
  }

  static async uploadNCRPhotos(ncrId: number, files: File[]): Promise<string[]> {
    const formData = new FormData();
    files.forEach((file) => formData.append("files", file));
    const response = await api.post(`/Quality/UploadNCRPhotos/${ncrId}`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return response.data.result || [];
  }
}

export function emptyNcrDraft(): Partial<NonConformanceReport> {
  return {
    title: "",
    description: "",
    category: "Other",
    severity: "Minor",
    status: "Open",
    source: "Internal",
    reportedBy: 0,
    defectLocation: "",
    defectQuantity: 0,
    totalQuantity: 0,
    defectDescription: "",
    photos: [],
    rootCause: "",
    rootCauseCategory: "Other",
    immediateAction: "",
    correctiveAction: "",
    preventiveAction: "",
    dueDate: "",
    costImpact: 0,
    notes: "",
  };
}

export function severityBadgeClass(severity: string): string {
  const s = (severity || "").toLowerCase();
  if (s === "critical") return "badge badge-critical";
  if (s === "major") return "badge badge-warn";
  return "badge badge-idle";
}

export function statusBadgeClass(status: string): string {
  const s = (status || "").toLowerCase();
  if (s.includes("closed") || s.includes("approved") || s.includes("implemented")) {
    return "badge badge-done";
  }
  if (s.includes("reject")) return "badge badge-critical";
  if (s.includes("open") || s.includes("investigation") || s.includes("pending")) {
    return "badge badge-active";
  }
  return "badge badge-idle";
}

export function formatNcrStatus(status: string): string {
  return (status || "—").replace(/_/g, " ");
}
