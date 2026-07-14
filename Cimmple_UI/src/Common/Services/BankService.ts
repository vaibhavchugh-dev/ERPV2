import Instense from "./Axios-config";

export interface BankMaster {
  id: number;
  bankName: string;
  accountNo: string;
  lastAccountNo: string;
  accountType: string;
  routingNumber: string;
  phone: string;
  email: string;
  street: string;
  apartment: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  balance: number;
  startingcheck: number;
  checkseries: string;
  coa: string;
  nickName: string;
  status: string;
  isprimary: boolean;
  ispayrollDefault: boolean;
  TenantId: number;
  locationId: number;
  sharingid: number;
}

export interface BankMasterReq {
  Id: number;
  BankName: string;
  AccountNo: string;
  AccountType: string;
  RoutingNumber: string;
  Phone: string;
  Email: string;
  street: string;
  apartment: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  Balance: number;
  startingcheck: number;
  checkseries: string;
  coa: string;
  NickName: string;
  status: string;
  isprimary: boolean;
  ispayrollDefault: boolean;
  TenantID: number;
  locationId: number;
}

export class BankService {
  public static GetBanklist = async (
    request: { tenantid: number }
  ): Promise<BankMaster[] | null> => {
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

    const url = `/Bank/GetBanklist`;
    return Instense.get(url, {
      params: { tenantid: tenantID },
    }).then((response) => {
      const result = response.data.result as BankMaster[];
      return result;
    });
  };

  public static GetBankById = async (
    bankId: number
  ): Promise<BankMaster | null> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    let tenantID = storage?.tenantID || 0;
    
    // For development: if tenantID is not set, use a default value
    if (tenantID === 0 && process.env.NODE_ENV === 'development') {
      tenantID = 1; // Default tenant ID for development
    }

    const url = `/Bank/GetBankById`;
    return Instense.get(url, {
      params: { bankId, tenantId: tenantID },
    }).then((response) => {
      const result = response.data.result as BankMaster;
      return result;
    });
  };

  public static SaveBankData = async (
    request: BankMasterReq
  ): Promise<any> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    let tenantID = storage?.tenantID || 0;
    
    // For development: if tenantID is not set, use a default value
    if (tenantID === 0 && process.env.NODE_ENV === 'development') {
      tenantID = 1; // Default tenant ID for development
    }
    
    const locationId = storage?.locationId || 0;

    request.TenantID = tenantID;
    request.locationId = locationId;

    const url = `/Bank/SaveBankData`;
    return Instense.post(url, request).then((response) => {
      const result = response.data.result;
      return result;
    });
  };

  public static CheckBankDeletionImpact = async (
    bankId: number
  ): Promise<any> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    let tenantID = storage?.tenantID || 0;
    
    // For development: if tenantID is not set, use a default value
    if (tenantID === 0 && process.env.NODE_ENV === 'development') {
      tenantID = 1; // Default tenant ID for development
    }

    const url = `/Bank/CheckBankDeletionImpact`;
    return Instense.get(url, {
      params: { bankId, tenantId: tenantID },
    }).then((response) => {
      return response.data;
    });
  };

  public static DeleteBank = async (
    bankId: number
  ): Promise<any> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    let tenantID = storage?.tenantID || 0;
    
    // For development: if tenantID is not set, use a default value
    if (tenantID === 0 && process.env.NODE_ENV === 'development') {
      tenantID = 1; // Default tenant ID for development
    }

    const url = `/Bank/DeleteBank`;
    return Instense.delete(url, {
      params: { bankId, tenantId: tenantID },
    }).then((response) => {
      const result = response.data.result;
      return result;
    });
  };
}

