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

