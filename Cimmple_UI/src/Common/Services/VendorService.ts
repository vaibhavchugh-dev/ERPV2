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



