import Instense from "./Axios-config";

export interface PriceBreakdownMaster {
  id: number;
  itemName: string;
  srno: number;
  status: number;
  statusText: string;
}

export interface PriceBreakdownMasterReq {
  Id: number;
  ItemName: string;
  Srno: number;
  Status: string;
  Tenantid: number;
}

export class PriceBreakdownService {
  public static GetPriceBreakdowns = async (
    request: { tenantid: number }
  ): Promise<PriceBreakdownMaster[] | null> => {
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

    const url = `/PriceBreakdown/GetPriceBreakdowns`;
    return Instense.get(url, {
      params: { tenantid: tenantID },
    }).then((response) => {
      const result = response.data.result as PriceBreakdownMaster[];
      return result;
    });
  };

  public static GetPriceBreakdownById = async (
    priceBreakdownId: number
  ): Promise<PriceBreakdownMasterReq | null> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    let tenantID = storage?.tenantID || 0;
    
    // For development: if tenantID is not set, use a default value
    if (tenantID === 0 && process.env.NODE_ENV === 'development') {
      tenantID = 1; // Default tenant ID for development
    }

    const url = `/PriceBreakdown/GetPriceBreakdownById`;
    return Instense.get(url, {
      params: { priceBreakdownId, tenantId: tenantID },
    }).then((response) => {
      const result = response.data.result as any;
      return {
        Id: result.id,
        ItemName: result.itemName || "",
        Srno: result.srno || 0,
        Status: result.statusText || (result.status === 1 ? "Active" : "Inactive"),
        Tenantid: tenantID,
      } as PriceBreakdownMasterReq;
    });
  };

  public static SavePriceBreakdowns = async (
    request: PriceBreakdownMasterReq[]
  ): Promise<any> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    let tenantID = storage?.tenantID || 0;
    
    // For development: if tenantID is not set, use a default value
    if (tenantID === 0 && process.env.NODE_ENV === 'development') {
      tenantID = 1; // Default tenant ID for development
    }

    // Set tenant ID for all items
    request.forEach(item => {
      item.Tenantid = tenantID;
    });

    const url = `/PriceBreakdown/SavePriceBreakdowns`;
    return Instense.post(url, request).then((response) => {
      const result = response.data.result;
      return result;
    });
  };
}

export {};

