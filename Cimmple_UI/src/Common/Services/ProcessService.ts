import Instense from "./Axios-config";

export interface ProcessMaster {
  id: number;
  processName: string;
  srno: number;
  pDescription: string;
  isFixed: number;
  status: number;
  ledgercode: string;
  statusText: string;
}

export interface ProcessMasterReq {
  Id: number;
  ProcessName: string;
  Srno: number;
  PDescription: string;
  IsFixed?: number;
  Status: string;
  Ledgercode: string;
  Tenantid: number;
}

export class ProcessService {
  public static GetProcesses = async (
    request: { tenantid: number }
  ): Promise<ProcessMaster[] | null> => {
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

    const url = `/Process/GetProcesses`;
    return Instense.get(url, {
      params: { tenantid: tenantID },
    }).then((response) => {
      const result = response.data.result as ProcessMaster[];
      return result;
    });
  };

  public static GetProcessById = async (
    processId: number
  ): Promise<ProcessMasterReq | null> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    const tenantID = storage?.tenantID || 0;

    const url = `/Process/GetProcessById`;
    return Instense.get(url, {
      params: { processId, tenantId: tenantID },
    }).then((response) => {
      const result = response.data.result as any;
      return {
        Id: result.id,
        ProcessName: result.processName || "",
        Srno: result.srno || 0,
        PDescription: result.pDescription || "",
        IsFixed: result.isFixed ?? 0,
        Status: result.statusText || (result.status === 1 ? "Active" : "Inactive"),
        Ledgercode: result.ledgercode || "",
        Tenantid: tenantID,
      } as ProcessMasterReq;
    });
  };

  public static SaveProcess = async (
    request: ProcessMasterReq
  ): Promise<any> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    const tenantID = storage?.tenantID || 0;

    request.Tenantid = tenantID;

    const url = `/Process/SaveProcess`;
    return Instense.post(url, request).then((response) => {
      const result = response.data.result;
      return result;
    });
  };

  public static CheckProcessDeletionImpact = async (
    processId: number
  ): Promise<any> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    const tenantID = storage?.tenantID || 0;

    const url = `/Process/CheckProcessDeletionImpact`;
    return Instense.get(url, {
      params: { processId, tenantId: tenantID },
    }).then((response) => {
      return response.data;
    });
  };

  public static DeleteProcess = async (
    processId: number
  ): Promise<any> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    const tenantID = storage?.tenantID || 0;

    const url = `/Process/DeleteProcess`;
    return Instense.delete(url, {
      params: { processId, tenantId: tenantID },
    }).then((response) => {
      const result = response.data.result;
      return result;
    });
  };
}

export {};

