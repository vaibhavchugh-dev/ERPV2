import Instense from "./Axios-config";

export interface CreditCardMaster {
  id: number;
  cardNumber: string;
  cardholderName: string;
  cardType: string;
  expiryMonth: string;
  expiryYear: string;
  nickName: string;
  status: number;
  statusText: string;
  isPrimary: boolean;
}

export interface CreditCardMasterReq {
  Id: number;
  CardNumber: string;
  CardholderName: string;
  CardType: string;
  ExpiryMonth: string;
  ExpiryYear: string;
  CVV: string;
  BillingStreet: string;
  BillingApartment: string;
  BillingCity: string;
  BillingState: string;
  BillingZip: string;
  BillingCountry: string;
  Phone: string;
  Email: string;
  Status: string;
  TenantId: number;
  NickName: string;
  IsPrimary: boolean;
  COA: string;
  // Read-only, returned by GetCreditCardById; the full number and CVV are never returned or stored.
  LastFourDigits?: string;
}

export class CreditCardService {
  public static GetCreditCards = async (
    request: { tenantid: number }
  ): Promise<CreditCardMaster[] | null> => {
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

    const url = `/CreditCard/GetCreditCards`;
    return Instense.get(url, {
      params: { tenantid: tenantID },
    }).then((response) => {
      const result = response.data.result as CreditCardMaster[];
      return result;
    });
  };

  public static GetCreditCardById = async (
    creditCardId: number
  ): Promise<CreditCardMasterReq | null> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    const tenantID = storage?.tenantID || 0;

    const url = `/CreditCard/GetCreditCardById`;
    return Instense.get(url, {
      params: { creditCardId, tenantId: tenantID },
    }).then((response) => {
      const result = response.data.result as any;
      return {
        Id: result.id,
        CardNumber: "",
        LastFourDigits: result.lastFourDigits || "",
        CardholderName: result.cardholderName || "",
        CardType: result.cardType || "",
        ExpiryMonth: result.expiryMonth || "",
        ExpiryYear: result.expiryYear || "",
        CVV: "",
        BillingStreet: result.billingStreet || "",
        BillingApartment: result.billingApartment || "",
        BillingCity: result.billingCity || "",
        BillingState: result.billingState || "",
        BillingZip: result.billingZip || "",
        BillingCountry: result.billingCountry || "US",
        Phone: result.phone || "",
        Email: result.email || "",
        Status: result.statusText || (result.status === 1 ? "Active" : "Inactive"),
        TenantId: tenantID,
        NickName: result.nickName || "",
        IsPrimary: result.isPrimary || false,
        COA: result.coa || "",
      } as CreditCardMasterReq;
    });
  };

  public static SaveCreditCard = async (
    request: CreditCardMasterReq
  ): Promise<any> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    const tenantID = storage?.tenantID || 0;

    const { LastFourDigits, ...payload } = request;
    const body: CreditCardMasterReq = { ...payload, TenantId: tenantID, CVV: "" };

    const url = `/CreditCard/SaveCreditCard`;
    return Instense.post(url, body).then((response) => {
      const result = response.data.result;
      return result;
    });
  };

  public static CheckCreditCardDeletionImpact = async (
    creditCardId: number
  ): Promise<any> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    const tenantID = storage?.tenantID || 0;

    const url = `/CreditCard/CheckCreditCardDeletionImpact`;
    return Instense.get(url, {
      params: { creditCardId, tenantId: tenantID },
    }).then((response) => {
      return response.data;
    });
  };

  public static DeleteCreditCard = async (
    creditCardId: number
  ): Promise<any> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    const tenantID = storage?.tenantID || 0;

    const url = `/CreditCard/DeleteCreditCard`;
    return Instense.delete(url, {
      params: { creditCardId, tenantId: tenantID },
    }).then((response) => {
      const result = response.data.result;
      return result;
    });
  };
}

export {};

