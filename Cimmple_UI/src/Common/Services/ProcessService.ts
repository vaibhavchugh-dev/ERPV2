import Instense from "./Axios-config";

export interface ProcessMaster {
  id: number;
  processCode: string;
  processName: string;
  srno: number;
  pDescription: string;
  isFixed: number;
  isSystem: boolean;
  status: number;
  ledgercode: string;
  processCategory: string;
  defaultEstimatedTimeMinutes?: number | null;
  defaultWorkstationId?: number | null;
  defaultWorkstationName?: string;
  standardCostPerHour?: number | null;
  statusText: string;
}

export interface ProcessMasterReq {
  Id: number;
  ProcessCode: string;
  ProcessName: string;
  Srno: number;
  PDescription: string;
  IsFixed?: number;
  /** Read-only: set by the system, never sent back from the form. */
  IsSystem?: boolean;
  Status: string;
  Ledgercode: string;
  ProcessCategory: string;
  DefaultEstimatedTimeMinutes?: number | null;
  DefaultWorkstationId?: number | null;
  StandardCostPerHour?: number | null;
  Tenantid: number;
}

export interface ProcessImportRow {
  RowNumber?: number;
  ProcessCode?: string;
  ProcessName?: string;
  Description?: string;
  LedgerCode?: string;
  ProcessCategory?: string;
  OutsideServices?: string;
  Status?: string;
  DefaultEstimatedTimeMinutes?: string;
  DefaultWorkstationName?: string;
  StandardCostPerHour?: string;
}

export interface ProcessImportRowResult {
  rowNumber: number;
  processId?: number | null;
  status: string;
  message: string;
  warning?: string | null;
}

export interface ProcessImportResult {
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  rows: ProcessImportRowResult[];
}

export const PROCESS_CATEGORIES = [
  "Machining",
  "Assembly",
  "Inspection",
  "Finishing",
  "Outside",
  "Other",
] as const;

export const PROCESS_IMPORT_HEADERS = [
  "ProcessCode",
  "ProcessName",
  "Description",
  "LedgerCode",
  "ProcessCategory",
  "OutsideServices",
  "Status",
  "DefaultEstimatedTimeMinutes",
  "DefaultWorkstationName",
  "StandardCostPerHour",
] as const;

export class ProcessService {
  public static GetProcesses = async (
    request: { tenantid: number }
  ): Promise<ProcessMaster[] | null> => {
    let tenantID = request.tenantid || 0;

    if (tenantID === 0) {
      const storage = JSON.parse(localStorage.getItem("storage") || "{}");
      tenantID = storage?.tenantID || 0;
    }

    if (tenantID === 0 && process.env.NODE_ENV === "development") {
      tenantID = 1;
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
        ProcessCode: result.processCode || "",
        ProcessName: result.processName || "",
        Srno: result.srno || 0,
        PDescription: result.pDescription || "",
        IsFixed: result.isFixed ?? 0,
        IsSystem: result.isSystem ?? false,
        Status: result.statusText || (result.status === 1 ? "Active" : "Inactive"),
        Ledgercode: result.ledgercode || "",
        ProcessCategory: result.processCategory || "",
        DefaultEstimatedTimeMinutes: result.defaultEstimatedTimeMinutes ?? null,
        DefaultWorkstationId: result.defaultWorkstationId ?? null,
        StandardCostPerHour: result.standardCostPerHour ?? null,
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

  public static ImportProcesses = async (
    rows: ProcessImportRow[],
    options?: { updateExisting?: boolean; stopOnError?: boolean }
  ): Promise<ProcessImportResult> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    let tenantID = storage?.tenantID || 0;
    if (tenantID === 0 && process.env.NODE_ENV === "development") {
      tenantID = 1;
    }

    const url = `/Process/ImportProcesses`;
    return Instense.post(url, {
      Tenantid: tenantID,
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
          processId: r.processId ?? r.ProcessId,
          status: r.status ?? r.Status ?? "",
          message: r.message ?? r.Message ?? "",
          warning: r.warning ?? r.Warning ?? null,
        })),
      } as ProcessImportResult;
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
