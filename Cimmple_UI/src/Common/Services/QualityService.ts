import Instense from "./Axios-config";

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
  dateFrom?: string;
  dateTo?: string;
  tenantId: number;
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

      // Prepare data for backend - serialize photos to JSON string
      const ncrData = {
        ...ncr,
        photos: ncr.photos ? JSON.stringify(ncr.photos) : null
      };

      console.log("Sending POST request to /Quality/CreateNCR with data:", ncrData);
      const response = await Instense.post('/Quality/CreateNCR', ncrData);
      console.log("QualityService.CreateNCR response:", response);

      // Deserialize photos from response
      const result = response.data.result;
      if (result && result.photos) {
        try {
          result.photos = JSON.parse(result.photos);
        } catch (e) {
          console.warn("Failed to parse photos from response:", e);
          result.photos = [];
        }
      }

      return result;
    } catch (error) {
      console.error("Error creating NCR:", error);
      return null;
    }
  }

  static async UpdateNCR(ncrId: number, updates: Partial<NonConformanceReport>): Promise<boolean> {
    try {
      // Prepare data for backend - serialize photos to JSON string
      const updateData = {
        ...updates,
        photos: updates.photos ? JSON.stringify(updates.photos) : updates.photos
      };

      await Instense.put(`/Quality/UpdateNCR/${ncrId}`, updateData);
      return true;
    } catch (error) {
      console.error("Error updating NCR:", error);
      return false;
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
    } catch (error) {
      console.error("Error deleting NCR:", error);
      return false;
    }
  }

  static async UploadNCRPhotos(ncrId: number, files: File[]): Promise<string[]> {
    try {
      const formData = new FormData();
      files.forEach(file => formData.append('files', file));

      const response = await Instense.post(`/Quality/UploadNCRPhotos/${ncrId}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      return response.data.result || [];
    } catch (error) {
      console.error("Error uploading NCR photos:", error);
      return [];
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