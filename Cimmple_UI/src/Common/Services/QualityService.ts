import Instense from "./Axios-config";
import { API_ROOT } from "./Api-config";

const getApiErrorMessage = (error: any, fallback: string) =>
  error?.response?.data?.error?.message ||
  error?.response?.data?.error ||
  error?.response?.data?.message ||
  error?.message ||
  fallback;

const toStoredPhotos = (photos?: string[] | string | null): string | null => {
  if (!photos) return null;
  if (typeof photos === "string") {
    if (photos.indexOf("data:") >= 0 || photos.length > 3500) return null;
    return photos;
  }
  const urls = photos.filter((p) => typeof p === "string" && p && !p.startsWith("data:") && !p.startsWith("blob:"));
  return urls.length ? JSON.stringify(urls) : null;
};

export function resolveNcrPhotoUrl(photo: string): string {
  if (!photo) return "";
  if (photo.startsWith("data:") || photo.startsWith("http") || photo.startsWith("blob:")) {
    return photo;
  }
  const host = API_ROOT.backendHost.replace(/\/api\/?$/, "");
  return `${host}${photo.startsWith("/") ? "" : "/"}${photo}`;
}

export interface NonConformanceReport {
  ncrId: number;
  ncrNumber: string;
  title: string;
  description: string;
  category: NCRCategory;
  severity: NCRSeverity;
  status: NCRStatus;

  // Source Information
  source: 'Internal' | 'External' | 'Customer';
  jobOrderId?: number;
  jobOrderNumber?: string;
  routingStepId?: number;
  partNo?: string;
  partName?: string;
  customerId?: number;
  customerName?: string;
  vendorId?: number;
  vendorName?: string;
  vendorOrderId?: number;
  poNumber?: string;
  ncrCodeId?: number;
  ncrCode?: string;

  // Quality Details
  defectLocation: string;
  defectQuantity: number;
  totalQuantity: number;
  defectDescription: string;
  photos?: string[];

  // Root Cause Analysis
  rootCause: string;
  rootCauseCategory: RootCauseCategory;

  // Actions
  immediateAction: string;
  correctiveAction: string;
  preventiveAction: string;

  // Workflow
  reportedBy: number;
  reportedByName?: string;
  reportedDate: string;
  investigatedBy?: number;
  investigatedByName?: string;
  investigatedDate?: string;
  approvedBy?: number;
  approvedByName?: string;
  approvedDate?: string;

  // Tracking
  dueDate?: string;
  closedDate?: string;
  costImpact?: number;
  notes?: string;

  // Additional fields for UI
  tenantId?: number;
}

export type NCRCategory =
  | 'Material_Defect'
  | 'Dimensional_Issue'
  | 'Process_Failure'
  | 'Equipment_Problem'
  | 'Documentation_Error'
  | 'Supplier_Quality'
  | 'Other';

export type NCRSeverity = 'Minor' | 'Major' | 'Critical';

export type NCRStatus =
  | 'Open'
  | 'Under_Investigation'
  | 'Pending_Approval'
  | 'Approved'
  | 'Implemented'
  | 'Closed'
  | 'Rejected';

export type RootCauseCategory = 'Man' | 'Machine' | 'Material' | 'Method' | 'Measurement' | 'Other';

export interface NCRFilters {
  status?: NCRStatus;
  category?: NCRCategory;
  severity?: NCRSeverity;
  source?: 'Internal' | 'External' | 'Customer';
  jobOrderId?: number;
  customerId?: number;
  dateFrom?: string;
  dateTo?: string;
  overdueOnly?: boolean;
  openOnly?: boolean;
  tenantId: number;
}

/** Convert listing date-range presets into inclusive dateFrom / exclusive-friendly dateTo (ISO date). */
export function resolveNcrDateRange(dateRange: string): { dateFrom?: string; dateTo?: string } {
  if (!dateRange || dateRange === 'All' || dateRange === 'All Dates') {
    return {};
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const toIsoDate = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  const end = new Date(today);
  // Inclusive through today
  const dateTo = toIsoDate(end);

  switch (dateRange) {
    case 'Last 7 Days': {
      const start = new Date(today);
      start.setDate(start.getDate() - 6);
      return { dateFrom: toIsoDate(start), dateTo };
    }
    case 'Last 30 Days': {
      const start = new Date(today);
      start.setDate(start.getDate() - 29);
      return { dateFrom: toIsoDate(start), dateTo };
    }
    case 'This Month': {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      return { dateFrom: toIsoDate(start), dateTo };
    }
    case 'Last Month': {
      const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const lastDayPrev = new Date(today.getFullYear(), today.getMonth(), 0);
      return { dateFrom: toIsoDate(start), dateTo: toIsoDate(lastDayPrev) };
    }
    case 'Last 3 Months': {
      const start = new Date(today);
      start.setMonth(start.getMonth() - 3);
      return { dateFrom: toIsoDate(start), dateTo };
    }
    default:
      return {};
  }
}

export class QualityService {
  static async GetNCRs(filters: NCRFilters): Promise<NonConformanceReport[]> {
    try {
      const response = await Instense.get('/Quality/GetNCRs', { params: filters });

      // Deserialize photos from JSON string to array for each NCR
      const ncrs = response.data.result || [];
      ncrs.forEach((ncr: NonConformanceReport) => {
        if (ncr.photos && typeof ncr.photos === 'string') {
          try {
            ncr.photos = JSON.parse(ncr.photos);
          } catch (e) {
            console.warn("Failed to parse photos for NCR:", ncr.ncrId, e);
            ncr.photos = [];
          }
        } else if (!ncr.photos) {
          ncr.photos = [];
        }
      });

      return ncrs;
    } catch (error) {
      console.error("Error fetching NCRs:", error);
      return [];
    }
  }

  static async GetNCRById(ncrId: number): Promise<NonConformanceReport | null> {
    try {
      const storage = JSON.parse(localStorage.getItem("storage") || "{}");
      const tenantID = storage?.tenantID || 0;

      console.log("QualityService.GetNCRById called with ncrId:", ncrId, "tenantId:", tenantID);
      const response = await Instense.get(`/Quality/GetNCR/${ncrId}`, {
        params: { tenantId: tenantID }
      });
      console.log("QualityService.GetNCRById response:", response);
      const ncr = response.data.result;
      console.log("QualityService.GetNCRById extracted ncr:", ncr);

      // Deserialize photos from JSON string to array
      if (ncr && ncr.photos && typeof ncr.photos === 'string') {
        try {
          ncr.photos = JSON.parse(ncr.photos);
          console.log("QualityService.GetNCRById parsed photos:", ncr.photos);
        } catch (e) {
          console.warn("Failed to parse photos for NCR:", ncrId, e);
          ncr.photos = [];
        }
      } else if (ncr && !ncr.photos) {
        ncr.photos = [];
        console.log("QualityService.GetNCRById set empty photos array");
      }

      console.log("QualityService.GetNCRById returning ncr:", ncr);
      return ncr;
    } catch (error) {
      console.error("Error fetching NCR:", error);
      return null;
    }
  }

  static async CreateNCR(ncr: Omit<NonConformanceReport, 'ncrId' | 'ncrNumber'>): Promise<NonConformanceReport | null> {
    try {
      console.log("QualityService.CreateNCR called with data:", ncr);

      const ncrData = {
        ...ncr,
        photos: toStoredPhotos(ncr.photos)
      };

      const response = await Instense.post('/Quality/CreateNCR', ncrData);

      const result = response.data.result;
      if (result && result.photos && typeof result.photos === "string") {
        try {
          result.photos = JSON.parse(result.photos);
        } catch {
          result.photos = [];
        }
      }

      return result;
    } catch (error) {
      console.error("Error creating NCR:", error);
      throw new Error(getApiErrorMessage(error, "Failed to create NCR"));
    }
  }

  static async UpdateNCR(ncrId: number, updates: Partial<NonConformanceReport>): Promise<boolean> {
    try {
      const updateData = {
        ...updates,
        photos: toStoredPhotos(updates.photos as string[] | string | undefined)
      };

      await Instense.put(`/Quality/UpdateNCR/${ncrId}`, updateData);
      return true;
    } catch (error) {
      console.error("Error updating NCR:", error);
      throw new Error(getApiErrorMessage(error, "Failed to update NCR"));
    }
  }

  static async CheckNCRDeletionImpact(ncrId: number, tenantId: number): Promise<any> {
    try {
      const response = await Instense.get('/Quality/CheckNCRDeletionImpact', {
        params: { ncrId, tenantId }
      });
      return response.data;
    } catch (error) {
      console.error("Error checking NCR deletion impact:", error);
      throw error;
    }
  }

  static async DeleteNCR(ncrId: number, tenantId: number): Promise<boolean> {
    try {
      await Instense.delete('/Quality/DeleteNCR', {
        params: { ncrId, tenantId }
      });
      return true;
    } catch (error: any) {
      console.error("Error deleting NCR:", error);
      throw new Error(getApiErrorMessage(error, "Failed to delete NCR"));
    }
  }

  static async UploadNCRPhotos(ncrId: number, files: File[]): Promise<string[]> {
    try {
      const formData = new FormData();
      files.forEach(file => formData.append('files', file));

      const response = await Instense.post(`/Quality/UploadNCRPhotos/${ncrId}`, formData);

      return response.data.result || [];
    } catch (error) {
      console.error("Error uploading NCR photos:", error);
      throw new Error(getApiErrorMessage(error, "Failed to upload NCR photos"));
    }
  }

  static async GetNCRStats(tenantId: number): Promise<{
    totalNCRs: number;
    openNCRs: number;
    criticalNCRs: number;
    overdueNCRs: number;
  }> {
    try {
      const response = await Instense.get('/Quality/GetNCRStats', {
        params: { tenantId }
      });
      return response.data.result || {
        totalNCRs: 0,
        openNCRs: 0,
        criticalNCRs: 0,
        overdueNCRs: 0
      };
    } catch (error) {
      console.error("Error fetching NCR stats:", error);
      return {
        totalNCRs: 0,
        openNCRs: 0,
        criticalNCRs: 0,
        overdueNCRs: 0
      };
    }
  }
}

// Ensure this file is treated as a module
export {};