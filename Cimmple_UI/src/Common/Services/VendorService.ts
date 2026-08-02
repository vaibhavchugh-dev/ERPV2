import Instense from "./Axios-config";

export interface VendorMaster {
  vendor_id: number;
  vendorcode: string;
  company_name: string;
  companyAlias: string;
  email: string;
  phone_number: string;
  address: string;
  apartment: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  shippingAddress: string;
  shippingCity: string;
  shippingStates: string;
  shippingCountry: string;
  shippingZipCode: string;
  shippingApartment: string;
  status: string;
  term?: string;
  ship_via?: string;
  contactPerson?: string;
  Tenantid?: number;
  fullAddress?: string;
  VendorContact?: VendorContact[];
}

export interface VendorContact {
  id: number;
  customer_id: number;
  title: string;
  firstname: string;
  lastname: string;
  phoneno: string;
  email: string;
  isDefault: boolean;
}

export interface VendorMasterReq {
  vendor_id: number;
  company_name: string;
  companyAlias: string;
  email: string;
  phone_number: string;
  address: string;
  apartment: string;
  City: string;
  states: string;
  zipcode: string;
  country: string;
  shippingaddress: string;
  shippingCity: string;
  shippingStates: string;
  shippingCountry: string;
  shippingZipCode: string;
  shippingApartment: string;
  status: string;
  term: string;
  ship_via: string;
  TenantID: number;
  VendorContact?: VendorContact[];
  coaAccountId?: number; // Optional Chart of Accounts ID
}

export interface VendorImportRow {
  RowNumber?: number;
  VendorCode?: string;
  CompanyName?: string;
  CompanyAlias?: string;
  Email?: string;
  Phone?: string;
  Address?: string;
  Apartment?: string;
  City?: string;
  State?: string;
  Zip?: string;
  Country?: string;
  ShippingAddress?: string;
  ShippingApartment?: string;
  ShippingCity?: string;
  ShippingState?: string;
  ShippingZip?: string;
  ShippingCountry?: string;
  Term?: string;
  ShipVia?: string;
  Status?: string;
  ContactTitle?: string;
  ContactFirstName?: string;
  ContactLastName?: string;
  ContactPhone?: string;
  ContactEmail?: string;
}

export interface VendorImportRowResult {
  rowNumber: number;
  vendorId?: number | null;
  status: string;
  message: string;
  warning?: string | null;
}

export interface VendorImportResult {
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  rows: VendorImportRowResult[];
}

export const VENDOR_IMPORT_HEADERS = [
  "VendorCode",
  "CompanyName",
  "CompanyAlias",
  "Email",
  "Phone",
  "Address",
  "Apartment",
  "City",
  "State",
  "Zip",
  "Country",
  "ShippingAddress",
  "ShippingApartment",
  "ShippingCity",
  "ShippingState",
  "ShippingZip",
  "ShippingCountry",
  "Term",
  "ShipVia",
  "Status",
  "ContactTitle",
  "ContactFirstName",
  "ContactLastName",
  "ContactPhone",
  "ContactEmail",
] as const;

export class VendorService {
  public static GetVendorlist = async (
    request: { tenantid: number }
  ): Promise<VendorMaster[] | null> => {
    // Use the tenantid from request if provided, otherwise fall back to localStorage
    let tenantID = request.tenantid || 0;
    
    // If still 0, try localStorage
    if (tenantID === 0) {
      const storage = JSON.parse(localStorage.getItem("storage") || "{}");
      tenantID = storage?.tenantID || 0;
    }
    
    // For development: if tenantID is not set, use a default value
    if (tenantID === 0 && process.env.NODE_ENV === "development") {
      tenantID = 1; // Default tenant ID for development
    }

    const url = `/Vendor/GetVendorlist`;
    return Instense.get(url, {
      params: { tenantid: tenantID },
    }).then((response) => {
      const result = response.data.result as VendorMaster[];
      return result;
    });
  };

  public static GetVendorById = async (
    vendorId: number
  ): Promise<VendorMasterReq | null> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    let tenantID = storage?.tenantID || 0;

    // For development: if tenantID is not set, use a default value
    if (tenantID === 0 && process.env.NODE_ENV === "development") {
      tenantID = 1; // Default tenant ID for development
    }

    const url = `/Vendor/GetVendorById`;
    return Instense.get(url, {
      params: { vendorId, tenantId: tenantID },
    }).then((response) => {
      const result = response.data.result as any;

      // Normalize contact collection naming from backend:
      // backend JSON is camelCased as `vendorContact`, but some consumers expect `VendorContact`.
      if (Array.isArray(result?.vendorContact) && !Array.isArray(result?.VendorContact)) {
        result.VendorContact = result.vendorContact;
      }

      return result as VendorMasterReq;
    });
  };

  public static ImportVendors = async (
    rows: VendorImportRow[],
    options?: { updateExisting?: boolean; stopOnError?: boolean }
  ): Promise<VendorImportResult> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    let tenantID = storage?.tenantID || 0;
    if (tenantID === 0 && process.env.NODE_ENV === "development") {
      tenantID = 1;
    }

    const url = `/Vendor/ImportVendors`;
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
          vendorId: r.vendorId ?? r.VendorId,
          status: r.status ?? r.Status ?? "",
          message: r.message ?? r.Message ?? "",
          warning: r.warning ?? r.Warning ?? null,
        })),
      } as VendorImportResult;
    });
  };

  public static SaveVendorData = async (
    request: VendorMasterReq
  ): Promise<any> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    let tenantID = storage?.tenantID || 0;

    // For development: if tenantID is not set, use a default value
    if (tenantID === 0 && process.env.NODE_ENV === "development") {
      tenantID = 1; // Default tenant ID for development
    }

    request.TenantID = tenantID;

    const url = `/Vendor/SaveVendorData`;
    return Instense.post(url, request).then((response) => {
      const result = response.data.result;
      return result;
    });
  };

  public static CheckVendorDeletionImpact = async (
    vendorId: number
  ): Promise<any> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    let tenantID = storage?.tenantID || 0;
    
    // For development: if tenantID is not set, use a default value
    if (tenantID === 0 && process.env.NODE_ENV === 'development') {
      tenantID = 1; // Default tenant ID for development
    }

    const url = `/Vendor/CheckVendorDeletionImpact`;
    return Instense.get(url, {
      params: { vendorId, tenantId: tenantID },
    }).then((response) => {
      return response.data;
    });
  };

  public static DeleteVendor = async (
    vendorId: number
  ): Promise<any> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    let tenantID = storage?.tenantID || 0;
    
    // For development: if tenantID is not set, use a default value
    if (tenantID === 0 && process.env.NODE_ENV === 'development') {
      tenantID = 1; // Default tenant ID for development
    }

    const url = `/Vendor/DeleteVendor`;
    return Instense.delete(url, {
      params: { vendorId, tenantId: tenantID },
    }).then((response) => {
      const result = response.data.result;
      return result;
    });
  };
}

export {};



