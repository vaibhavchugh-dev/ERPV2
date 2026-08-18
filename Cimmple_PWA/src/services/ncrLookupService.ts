import api from "./apiClient";
import { AuthService } from "./authService";

function tenantId(): number {
  let id = AuthService.getTenantId();
  if (id === 0 && import.meta.env.DEV) id = 1;
  return id;
}

export interface NcrCodeOption {
  id: number;
  ncrCode: string;
  description?: string;
}

export interface EmployeeOption {
  user_UniqueID: number;
  firstName: string;
  lastName: string;
  userName: string;
}

export interface CustomerOption {
  customer_id: number;
  company_name: string;
  customercode?: string;
}

export interface VendorOption {
  vendor_id: number;
  company_name: string;
  vendorcode?: string;
}

export interface VendorOrderOption {
  orderID: number;
  orderNumber?: number | string;
  poNumber?: string;
  vendorID?: number;
  vendorName?: string;
}

/** Lookup helpers used by NCR form — same endpoints as Cimmple_UI. */
export class NcrLookupService {
  static async getNcrCodes(): Promise<NcrCodeOption[]> {
    const response = await api.get("/NCRCode/GetNCRCodes", {
      params: { tenantId: tenantId() },
    });
    return (response.data?.result as NcrCodeOption[]) || [];
  }

  static async getEmployees(): Promise<EmployeeOption[]> {
    const response = await api.get("/Employee/GetEmployees", {
      params: { tenantid: tenantId() },
    });
    return (response.data?.result as EmployeeOption[]) || [];
  }

  static async getCustomers(): Promise<CustomerOption[]> {
    const response = await api.get("/Customer/GetCustomerlist", {
      params: { tenantid: tenantId() },
    });
    return (response.data?.result as CustomerOption[]) || [];
  }

  static async getVendors(): Promise<VendorOption[]> {
    const response = await api.get("/Vendor/GetVendorlist", {
      params: { tenantid: tenantId() },
    });
    return (response.data?.result as VendorOption[]) || [];
  }

  static async getVendorOrders(): Promise<VendorOrderOption[]> {
    const params: Record<string, number> = { tenantid: tenantId() };
    const locationId = AuthService.getLocationId();
    if (locationId > 0) params.locationId = locationId;
    const response = await api.get("/Order/GetVendorOrders", { params });
    return (response.data?.result as VendorOrderOption[]) || [];
  }
}

export function employeeDisplayName(e?: EmployeeOption | null): string {
  if (!e) return "";
  const name = [e.firstName, e.lastName].filter(Boolean).join(" ").trim();
  return name || e.userName || "";
}
