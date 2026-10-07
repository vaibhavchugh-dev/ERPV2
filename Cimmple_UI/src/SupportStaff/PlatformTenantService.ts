import Instense from "../Common/Services/Axios-config";

export type TenantStatus = "Provisioning" | "Active" | "Suspended" | "Cancelled";

export interface TenantSummary {
  tenantId: number;
  name: string;
  code?: string | null;
  status: TenantStatus;
  plan?: string | null;
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
}
