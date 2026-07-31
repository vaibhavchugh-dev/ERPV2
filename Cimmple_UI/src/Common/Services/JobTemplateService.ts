import Instense from "./Axios-config";

export interface JobTemplateCategoryTag {
  categoryValueId: number;
  categoryValueName: string;
  categoryTypeId: number;
  categoryTypeName: string;
}

export interface JobTemplate {
  id: number;
  templateCode: string;
  templateName: string;
  description: string;
  revision: number;
  status: number;
  statusText: string;
  isSystem: boolean;
  primaryProcessId?: number | null;
  primaryProcessName: string;
  workstationId?: number | null;
  workstationName: string;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  defaultMaterial: string;
  operationCount: number;
  attachmentCount: number;
  categories: JobTemplateCategoryTag[];
  lastUpdated?: string | null;
}

export interface JobTemplatePage {
  items: JobTemplate[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface JobTemplateOperation {
  Id: number;
  SequenceNumber: number;
  ProcessId?: number | null;
  ProcessName?: string;
  WorkstationId?: number | null;
  WorkstationName?: string;
  SetupTimeMinutes?: number | null;
  CycleTimeMinutes?: number | null;
  Instructions: string;
  IsMandatory: boolean;
  QualityCheckRequired: boolean;
}

export interface JobTemplateAttachment {
  id: number;
  attachmentType: string;
  fileName: string;
  fileUrl: string;
  contentType: string;
  fileSize: number;
  uploadedDate?: string | null;
}

export interface JobTemplateReq {
  Id: number;
  Tenantid: number;

  TemplateCode: string;
  TemplateName: string;
  Description: string;
  Status: string;
  Revision: number;
  EffectiveFrom?: string | null;
  EffectiveTo?: string | null;

  PrimaryProcessId?: number | null;
  WorkstationId?: number | null;
  EstimatedSetupTimeMinutes?: number | null;
  EstimatedCycleTimeMinutes?: number | null;
  EstimatedLabourTimeMinutes?: number | null;
  EstimatedMachineTimeMinutes?: number | null;

  DefaultMaterial: string;
  MaterialGrade: string;
  RawMaterialSize: string;
  MaterialNotes: string;

  Tool: string;
  Fixture: string;
  Workholding: string;
  Gauge: string;
  ToolingNotes: string;

  InspectionType: string;
  FirstArticleRequired: boolean;
  InProcessInspection: boolean;
  FinalInspection: boolean;
  CmmRequired: boolean;
  InspectionNotes: string;

  Operations: JobTemplateOperation[];
  CategoryValueIds: number[];

  /** Read-only: set by the system, never sent back from the form. */
  IsSystem?: boolean;
  Attachments?: JobTemplateAttachment[];
}

export interface JobTemplateQuery {
  search?: string;
  status?: string;
  categoryIds?: number[];
  matchMode?: "all" | "any";
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortDir?: "asc" | "desc";
}

export const JOB_TEMPLATE_ATTACHMENT_TYPES = [
  "Drawing",
  "SOP",
  "Setup Sheet",
  "Image",
  "PDF",
  "Other",
] as const;

export const JOB_TEMPLATE_INSPECTION_TYPES = [
  "None",
  "Visual",
  "Dimensional",
  "First Article",
  "In-Process",
  "Final",
  "CMM",
  "Functional",
] as const;

const resolveTenantId = (): number => {
  const storage = JSON.parse(localStorage.getItem("storage") || "{}");
  let tenantID = storage?.tenantID || 0;
  if (tenantID === 0 && process.env.NODE_ENV === "development") {
    tenantID = 1;
  }
  return tenantID;
};

/** Trims a yyyy-MM-ddTHH:mm:ss payload down to what a native date input accepts. */
const toDateInputValue = (value: any): string | null => {
  if (!value) return null;
  const text = String(value);
  return text.length >= 10 ? text.substring(0, 10) : null;
};

export class JobTemplateService {
  public static GetJobTemplates = async (
    query: JobTemplateQuery = {}
  ): Promise<JobTemplatePage> => {
    const tenantID = resolveTenantId();

    const url = `/JobTemplate/GetJobTemplates`;
    return Instense.get(url, {
      params: {
        tenantid: tenantID,
        search: query.search || undefined,
        status: query.status || undefined,
        categoryIds:
          query.categoryIds && query.categoryIds.length > 0
            ? query.categoryIds.join(",")
            : undefined,
        matchMode: query.matchMode || undefined,
        page: query.page ?? 1,
        pageSize: query.pageSize ?? 25,
        sortBy: query.sortBy || undefined,
        sortDir: query.sortDir || undefined,
      },
    }).then((response) => {
      const raw = response.data.result || {};
      return {
        items: (raw.items || []) as JobTemplate[],
        totalCount: raw.totalCount ?? 0,
        page: raw.page ?? 1,
        pageSize: raw.pageSize ?? 25,
        totalPages: raw.totalPages ?? 0,
      };
    });
  };

  public static GetJobTemplateById = async (
    jobTemplateId: number
  ): Promise<JobTemplateReq | null> => {
    const tenantID = resolveTenantId();

    const url = `/JobTemplate/GetJobTemplateById`;
    return Instense.get(url, {
      params: { jobTemplateId, tenantId: tenantID },
    }).then((response) => {
      const result = response.data.result as any;

      return {
        Id: result.id,
        Tenantid: tenantID,
        TemplateCode: result.templateCode || "",
        TemplateName: result.templateName || "",
        Description: result.description || "",
        Status: result.statusText || (result.status === 1 ? "Active" : "Inactive"),
        Revision: result.revision ?? 1,
        EffectiveFrom: toDateInputValue(result.effectiveFrom),
        EffectiveTo: toDateInputValue(result.effectiveTo),

        PrimaryProcessId: result.primaryProcessId ?? null,
        WorkstationId: result.workstationId ?? null,
        EstimatedSetupTimeMinutes: result.estimatedSetupTimeMinutes ?? null,
        EstimatedCycleTimeMinutes: result.estimatedCycleTimeMinutes ?? null,
        EstimatedLabourTimeMinutes: result.estimatedLabourTimeMinutes ?? null,
        EstimatedMachineTimeMinutes: result.estimatedMachineTimeMinutes ?? null,

        DefaultMaterial: result.defaultMaterial || "",
        MaterialGrade: result.materialGrade || "",
        RawMaterialSize: result.rawMaterialSize || "",
        MaterialNotes: result.materialNotes || "",

        Tool: result.tool || "",
        Fixture: result.fixture || "",
        Workholding: result.workholding || "",
        Gauge: result.gauge || "",
        ToolingNotes: result.toolingNotes || "",

        InspectionType: result.inspectionType || "",
        FirstArticleRequired: result.firstArticleRequired ?? false,
        InProcessInspection: result.inProcessInspection ?? false,
        FinalInspection: result.finalInspection ?? false,
        CmmRequired: result.cmmRequired ?? false,
        InspectionNotes: result.inspectionNotes || "",

        Operations: (result.operations || []).map((o: any) => ({
          Id: o.id,
          SequenceNumber: o.sequenceNumber,
          ProcessId: o.processId ?? null,
          ProcessName: o.processName || "",
          WorkstationId: o.workstationId ?? null,
          WorkstationName: o.workstationName || "",
          SetupTimeMinutes: o.setupTimeMinutes ?? null,
          CycleTimeMinutes: o.cycleTimeMinutes ?? null,
          Instructions: o.instructions || "",
          IsMandatory: o.isMandatory ?? true,
          QualityCheckRequired: o.qualityCheckRequired ?? false,
        })) as JobTemplateOperation[],

        CategoryValueIds: (result.categories || []).map(
          (c: any) => c.categoryValueId as number
        ),

        IsSystem: result.isSystem ?? false,
        Attachments: (result.attachments || []) as JobTemplateAttachment[],
      } as JobTemplateReq;
    });
  };

  public static SaveJobTemplate = async (
    request: JobTemplateReq
  ): Promise<any> => {
    request.Tenantid = resolveTenantId();

    const url = `/JobTemplate/SaveJobTemplate`;
    return Instense.post(url, request).then((response) => response.data.result);
  };

  public static CloneJobTemplate = async (
    jobTemplateId: number,
    newTemplateCode: string,
    newTemplateName: string
  ): Promise<any> => {
    const tenantID = resolveTenantId();

    const url = `/JobTemplate/CloneJobTemplate`;
    return Instense.post(url, {
      JobTemplateId: jobTemplateId,
      Tenantid: tenantID,
      NewTemplateCode: newTemplateCode,
      NewTemplateName: newTemplateName,
    }).then((response) => response.data.result);
  };

  public static CheckJobTemplateDeletionImpact = async (
    jobTemplateId: number
  ): Promise<any> => {
    const tenantID = resolveTenantId();

    const url = `/JobTemplate/CheckJobTemplateDeletionImpact`;
    return Instense.get(url, {
      params: { jobTemplateId, tenantId: tenantID },
    }).then((response) => response.data);
  };

  public static DeleteJobTemplate = async (
    jobTemplateId: number
  ): Promise<any> => {
    const tenantID = resolveTenantId();

    const url = `/JobTemplate/DeleteJobTemplate`;
    return Instense.delete(url, {
      params: { jobTemplateId, tenantId: tenantID },
    }).then((response) => response.data.result);
  };

  public static UploadAttachment = async (
    jobTemplateId: number,
    attachmentType: string,
    file: File
  ): Promise<JobTemplateAttachment> => {
    const tenantID = resolveTenantId();

    const formData = new FormData();
    formData.append("jobTemplateId", jobTemplateId.toString());
    formData.append("tenantId", tenantID.toString());
    formData.append("attachmentType", attachmentType);
    formData.append("file", file);

    const url = `/JobTemplate/UploadJobTemplateAttachment`;
    return Instense.post(url, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }).then((response) => response.data.result as JobTemplateAttachment);
  };

  public static DeleteAttachment = async (
    attachmentId: number
  ): Promise<any> => {
    const tenantID = resolveTenantId();

    const url = `/JobTemplate/DeleteJobTemplateAttachment`;
    return Instense.delete(url, {
      params: { attachmentId, tenantId: tenantID },
    }).then((response) => response.data.result);
  };
}

export {};
