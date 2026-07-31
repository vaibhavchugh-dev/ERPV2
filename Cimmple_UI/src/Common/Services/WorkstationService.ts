import Instense from "./Axios-config";

export interface WorkstationMaster {
  id: number;
  workstationName: string;
  isActive: boolean;
  tenantId: number;
  userName?: string; // Concatenated user names for listing
}

export interface UserWorkstationMapping {
  id: number;
  workstationId: number;
  userId: number;
  tenantId: number;
  userName?: string;
}

export interface WorkstationMasterReq {
  Id: number;
  WorkstationName: string;
  IsActive: boolean;
  TenantID: number;
  UserWorkstationMappings?: UserWorkstationMapping[];
}

export interface User {
  user_UniqueID: number;
  userName: string;
  email: string;
}

export interface WorkstationImportRow {
  RowNumber?: number;
  WorkstationName?: string;
  Status?: string;
}

export interface WorkstationImportRowResult {
  rowNumber: number;
  workstationId?: number | null;
  status: string;
  message: string;
}

export interface WorkstationImportResult {
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  rows: WorkstationImportRowResult[];
}

export const WORKSTATION_IMPORT_HEADERS = ["WorkstationName", "Status"] as const;

export class WorkstationService {
  public static GetWorkstations = async (
    request: { tenantid: number }
  ): Promise<WorkstationMaster[] | null> => {
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

    const url = `/Workstation/GetWorkstations`;
    return Instense.get(url, {
      params: { tenantid: tenantID },
    }).then((response) => {
      const result = response.data.result as WorkstationMaster[];
      return result;
    });
  };

  public static GetWorkstationById = async (
    workstationId: number
  ): Promise<WorkstationMasterReq | null> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    const tenantID = storage?.tenantID || 0;

    const url = `/Workstation/GetWorkstationById`;
    return Instense.get(url, {
      params: { workstationId, tenantId: tenantID },
    }).then((response) => {
      const result = response.data.result as any;
      return {
        Id: result.id,
        WorkstationName: result.workstationName,
        IsActive: result.isActive,
        TenantID: result.tenantId,
        UserWorkstationMappings: result.userWorkstationMappings || [],
      } as WorkstationMasterReq;
    });
  };

  public static SaveWorkstation = async (
    request: WorkstationMasterReq
  ): Promise<any> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    const tenantID = storage?.tenantID || 0;

    request.TenantID = tenantID;

    const url = `/Workstation/SaveWorkstation`;
    return Instense.post(url, request).then((response) => {
      const result = response.data.result;
      return result;
    });
  };

  public static ImportWorkstations = async (
    rows: WorkstationImportRow[],
    options?: { updateExisting?: boolean; stopOnError?: boolean }
  ): Promise<WorkstationImportResult> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    let tenantID = storage?.tenantID || 0;
    if (tenantID === 0 && process.env.NODE_ENV === "development") {
      tenantID = 1;
    }

    const url = `/Workstation/ImportWorkstations`;
    return Instense.post(url, {
      TenantID: tenantID,
      UpdateExisting: options?.updateExisting ?? true,
      StopOnError: options?.stopOnError ?? false,
      Rows: rows,
    }).then((response) => {
      const raw = response.data.result || {};
      return {
        created: raw.created ?? raw.Created ?? 0,
        updated: raw.updated ?? raw.Updated ?? 0,
        skipped: raw.skipped ?? raw.Skipped ?? 0,
        failed: raw.failed ?? raw.Failed ?? 0,
        rows: (raw.rows || raw.Rows || []).map((r: any) => ({
          rowNumber: r.rowNumber ?? r.RowNumber,
          workstationId: r.workstationId ?? r.WorkstationId,
          status: r.status ?? r.Status ?? "",
          message: r.message ?? r.Message ?? "",
        })),
      } as WorkstationImportResult;
    });
  };

  public static GetUserWorkstationMapping = async (
    request: { tenantid: number; workstationId: number }
  ): Promise<UserWorkstationMapping[] | null> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    const tenantID = storage?.tenantID || 0;

    const url = `/Workstation/GetUserWorkstationMapping`;
    return Instense.get(url, {
      params: { tenantid: tenantID, workstationId: request.workstationId },
    }).then((response) => {
      const result = response.data.result as UserWorkstationMapping[];
      return result;
    });
  };

  public static GetAllUsers = async (
    request: { tenantid: number }
  ): Promise<User[] | null> => {
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

    const url = `/Workstation/GetAllUsers`;
    return Instense.get(url, {
      params: { tenantid: tenantID },
    }).then((response) => {
      const result = response.data.result as User[];
      return result;
    });
  };

  public static CheckWorkstationDeletionImpact = async (
    workstationId: number
  ): Promise<any> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    const tenantID = storage?.tenantID || 0;

    const url = `/Workstation/CheckWorkstationDeletionImpact`;
    return Instense.get(url, {
      params: { workstationId, tenantId: tenantID },
    }).then((response) => {
      return response.data;
    });
  };

  public static DeleteWorkstation = async (
    workstationId: number
  ): Promise<any> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    const tenantID = storage?.tenantID || 0;

    const url = `/Workstation/DeleteWorkstation`;
    return Instense.delete(url, {
      params: { workstationId, tenantId: tenantID },
    }).then((response) => {
      const result = response.data.result;
      return result;
    });
  };
}

export {};

