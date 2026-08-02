import Instense from "./Axios-config";

export interface CustomerMaster {
  customer_id: number;
  customercode: string;
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
  Tenantid?: number;
  fullAddress?: string;
  contactPerson?: string;
  // Contacts - note: backend JSON is camelCased as `customerContact`
  CustomerContact?: CustomerContact[];
  customerContact?: CustomerContact[];
  CustomerBillingAddress?: CustomerBillingAddress[];
  ShippingAddresses?: CustomerShippingAddress[];
}

export interface CustomerContact {
  id: number;
  customer_id: number;
  title: string;
  firstname: string;
  lastname: string;
  phoneno: string;
  email: string;
  isDefault: boolean;
}

export interface CustomerBillingAddress {
  id: number;
  customer_id: number;
  billing_address_line1: string;
  billing_address_line2: string;
  billing_city: string;
  billing_state: string;
  billing_country: string;
  billing_postal_code: string;
  IsDefault: number;
  TenantId: number;
}

export interface CustomerShippingAddress {
  id: number;
  customer_id: number;
  shippingAddress: string;
  shippingCity: string;
  shippingStates: string;
  shippingCountry: string;
  shippingZipCode: string;
  shippingApartment: string;
  IsDefault: number;
  firstname: string;
}

export interface CustomerMasterReq {
  customer_id: number;
  company_name: string;
  companyAlias: string;
  email: string;
  phone_number: string;
  address: string;
  apartment: string;
  City: string;
  states: string;
  zip: string;
  country: string;
  shippingAddress: string;
  shippingCity: string;
  shippingStates: string;
  shippingCountry: string;
  shippingZipCode: string;
  shippingApartment: string;
  status: string;
  TenantID: number;
  CustomerContact?: CustomerContact[];
}

export interface CustomerImportRow {
  RowNumber?: number;
  CustomerCode?: string;
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
  Status?: string;
  ContactTitle?: string;
  ContactFirstName?: string;
  ContactLastName?: string;
  ContactPhone?: string;
  ContactEmail?: string;
}

export interface CustomerImportRowResult {
  rowNumber: number;
  customerId?: number | null;
  status: string;
  message: string;
  warning?: string | null;
}

export interface CustomerImportResult {
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  rows: CustomerImportRowResult[];
}

export const CUSTOMER_IMPORT_HEADERS = [
  "CustomerCode",
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
  "Status",
  "ContactTitle",
  "ContactFirstName",
  "ContactLastName",
  "ContactPhone",
  "ContactEmail",
] as const;

export class CustomerService {
  public static GetCustomerlist = async (
    request: { tenantid: number }
  ): Promise<CustomerMaster[] | null> => {
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

    const url = `/Customer/GetCustomerlist`;
    return Instense.get(url, {
      params: { tenantid: tenantID },
    }).then((response) => {
      const result = response.data.result as CustomerMaster[];
      return result;
    });
  };

  public static GetCustomerById = async (
    customerId: number
  ): Promise<CustomerMaster | null> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    let tenantID = storage?.tenantID || 0;
    
    // For development: if tenantID is not set, use a default value
    if (tenantID === 0 && process.env.NODE_ENV === 'development') {
      tenantID = 1; // Default tenant ID for development
    }

    const url = `/Customer/GetCustomerById`;
    return Instense.get(url, {
      params: { customerId, tenantId: tenantID },
    }).then((response) => {
      const result = response.data.result as any;

      // Normalize contact collection naming from backend:
      // backend JSON is camelCased as `customerContact`, but some consumers expect `CustomerContact`.
      if (Array.isArray(result?.customerContact) && !Array.isArray(result?.CustomerContact)) {
        result.CustomerContact = result.customerContact;
      }

      return result as CustomerMaster;
    });
  };

  public static ImportCustomers = async (
    rows: CustomerImportRow[],
    options?: { updateExisting?: boolean; stopOnError?: boolean }
  ): Promise<CustomerImportResult> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    let tenantID = storage?.tenantID || 0;
    if (tenantID === 0 && process.env.NODE_ENV === "development") {
      tenantID = 1;
    }

    const url = `/Customer/ImportCustomers`;
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
          customerId: r.customerId ?? r.CustomerId,
          status: r.status ?? r.Status ?? "",
          message: r.message ?? r.Message ?? "",
          warning: r.warning ?? r.Warning ?? null,
        })),
      } as CustomerImportResult;
    });
  };

  public static SaveCustomerData = async (
    request: CustomerMasterReq
  ): Promise<any> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    let tenantID = storage?.tenantID || 0;
    
    // For development: if tenantID is not set, use a default value
    if (tenantID === 0 && process.env.NODE_ENV === 'development') {
      tenantID = 1; // Default tenant ID for development
      console.warn('TenantID not found in localStorage, using default value 1 for development');
    }
    
    const userName = storage?.userName || "";

    request.TenantID = tenantID;

    const url = `/Customer/SaveCustomerData`;
    return Instense.post(url, request).then((response) => {
      const result = response.data.result;
      return result;
    });
  };

  public static CheckCustomerDeletionImpact = async (
    customerId: number
  ): Promise<any> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    let tenantID = storage?.tenantID || 0;
    
    // For development: if tenantID is not set, use a default value
    if (tenantID === 0 && process.env.NODE_ENV === 'development') {
      tenantID = 1; // Default tenant ID for development
    }

    const url = `/Customer/CheckCustomerDeletionImpact`;
    return Instense.get(url, {
      params: { customerId, tenantId: tenantID },
    }).then((response) => {
      return response.data;
    });
  };

  public static DeleteCustomer = async (
    customerId: number
  ): Promise<any> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    let tenantID = storage?.tenantID || 0;
    
    // For development: if tenantID is not set, use a default value
    if (tenantID === 0 && process.env.NODE_ENV === 'development') {
      tenantID = 1; // Default tenant ID for development
    }

    const url = `/Customer/DeleteCustomer`;
    return Instense.delete(url, {
      params: { customerId, tenantId: tenantID },
    }).then((response) => {
      const result = response.data.result;
      return result;
    });
  };
}

