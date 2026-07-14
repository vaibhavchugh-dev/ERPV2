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

