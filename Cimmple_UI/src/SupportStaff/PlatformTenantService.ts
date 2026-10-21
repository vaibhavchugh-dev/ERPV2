import Instense from "../Common/Services/Axios-config";

export type TenantStatus = "Provisioning" | "Active" | "Suspended" | "Cancelled";

export interface TenantSummary {
  tenantId: number;
  name: string;
  code?: string | null;
  status: TenantStatus;
  plan?: string | null;
  industry?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  notes?: string | null;
  seedVersion: number;
  currentSeedVersion: number;
  lastProvisioningError?: string | null;
  createdBy?: string | null;
  createdUtc: string;
  provisionedUtc?: string | null;
  statusChangedUtc?: string | null;
  userCount: number;
}

export interface ProvisionTenantRequest {
  companyName: string;
  code?: string;
  plan?: string;
  adminFirstName: string;
  adminLastName: string;
  adminEmail: string;
  adminUserName?: string;
  phone?: string;
  country?: string;
  timeZone?: string;
  currency?: string;
  currencySymbol?: string;
  notes?: string;
  industry?: string;
  includeSampleData: boolean;
  sendInviteEmail: boolean;
}

export interface SeedStepResult {
  name: string;
  inserted: number;
}

export interface ProvisionTenantResult {
  success: boolean;
  error?: string | null;
  tenant?: TenantSummary | null;
  adminUserName?: string | null;
  temporaryPassword?: string | null;
  inviteQueued: boolean;
  inviteError?: string | null;
  sampleError?: string | null;
  steps: SeedStepResult[];
}

export interface ResendInviteResult {
  success: boolean;
  error?: string | null;
  adminUserName?: string | null;
  adminEmail?: string | null;
  temporaryPassword?: string | null;
  inviteQueued: boolean;
  inviteError?: string | null;
}

export const apiError = (err: any, fallback: string): string =>
  err?.response?.data?.error || err?.response?.data?.message || fallback;

export class PlatformTenantService {
  static async list(): Promise<TenantSummary[]> {
    const response = await Instense.get("/PlatformTenants/List");
    return Array.isArray(response.data?.result) ? response.data.result : [];
  }

  static async get(tenantId: number): Promise<TenantSummary | null> {
    const response = await Instense.get(`/PlatformTenants/Get/${tenantId}`);
    return response.data?.result ?? null;
  }

  static async create(request: ProvisionTenantRequest): Promise<ProvisionTenantResult> {
    const response = await Instense.post("/PlatformTenants/Create", request);
    return response.data?.result;
  }

  static async resume(tenantId: number): Promise<ProvisionTenantResult> {
    const response = await Instense.post(`/PlatformTenants/Resume/${tenantId}`);
    return response.data?.result;
  }

  static async applyDefaults(tenantId: number): Promise<ProvisionTenantResult> {
    const response = await Instense.post(`/PlatformTenants/ApplyDefaults/${tenantId}`);
    return response.data?.result;
  }

  static async setStatus(tenantId: number, status: TenantStatus): Promise<TenantSummary | null> {
    const response = await Instense.post(`/PlatformTenants/SetStatus/${tenantId}`, { status });
    return response.data?.result ?? null;
  }

  static async resendInvite(tenantId: number): Promise<ResendInviteResult> {
    const response = await Instense.post(`/PlatformTenants/ResendInvite/${tenantId}`);
    return response.data?.result;
  }

  static async industries(): Promise<{ code: string; label: string }[]> {
    const response = await Instense.get("/PlatformTenants/Industries");
    return Array.isArray(response.data?.result) ? response.data.result : [];
  }

  static async masterSetup(tenantId: number): Promise<MasterSetupOverview | null> {
    const response = await Instense.get(`/PlatformTenants/MasterSetup/${tenantId}`);
    return response.data?.result ?? null;
  }

  static async setIndustry(tenantId: number, industry: string): Promise<TenantSummary | null> {
    const response = await Instense.post(`/PlatformTenants/SetIndustry/${tenantId}`, { industry });
    return response.data?.result ?? null;
  }

  static async applySamples(tenantId: number, industry: string, masters: string[]): Promise<MasterApplyBatch> {
    const response = await Instense.post(`/PlatformTenants/ApplySamples/${tenantId}`, { industry, masters });
    return response.data?.result;
  }

  static async previewMasterFile(tenantId: number, master: string, file: File): Promise<MasterImportResult> {
    const response = await Instense.post(`/PlatformTenants/PreviewMasterFile/${tenantId}`, form(master, file));
    return response.data?.result;
  }

  static async importMasterFile(tenantId: number, master: string, file: File): Promise<MasterImportResult> {
    const response = await Instense.post(`/PlatformTenants/ImportMasterFile/${tenantId}`, form(master, file));
    return response.data?.result;
  }

  static async previewWorkbook(tenantId: number, file: File): Promise<MasterApplyBatch> {
    const body = new FormData();
    body.append("file", file);
    const response = await Instense.post(`/PlatformTenants/PreviewWorkbook/${tenantId}`, body);
    return response.data?.result;
  }

  static async importWorkbook(tenantId: number, file: File): Promise<MasterApplyBatch> {
    const body = new FormData();
    body.append("file", file);
    const response = await Instense.post(`/PlatformTenants/ImportWorkbook/${tenantId}`, body);
    return response.data?.result;
  }

  static templateUrl(master: string): string {
    return `/PlatformTenants/MasterTemplate/${master}`;
  }

  static async downloadTemplate(master: string): Promise<void> {
    const response = await Instense.get(PlatformTenantService.templateUrl(master), { responseType: "blob" });
    const url = window.URL.createObjectURL(response.data as Blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${master}-import-template.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  }
}

function form(master: string, file: File): FormData {
  const body = new FormData();
  body.append("master", master);
  body.append("file", file);
  return body;
}

export interface MasterSetupCount {
  master: string;
  count: number;
  lastSource?: string | null;
  lastFileName?: string | null;
  lastCreatedUtc?: string | null;
  lastCreated: number;
  lastUpdated: number;
  lastSkipped: number;
  lastFailed: number;
}

export interface MasterSetupOverview {
  industry?: string | null;
  workstations: MasterSetupCount;
  processes: MasterSetupCount;
  jobTemplates: MasterSetupCount;
}

export interface MasterRowIssue {
  rowNumber: number;
  status: string;
  message: string;
}

export interface MasterImportResult {
  master: string;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  issues: MasterRowIssue[];
}

export interface MasterApplyBatch {
  success: boolean;
  error?: string | null;
  results: MasterImportResult[];
}
