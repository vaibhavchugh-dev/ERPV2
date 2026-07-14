import Instense from "./Axios-config";

export interface ChartofAccountMaster {
  accountID: number;
  accountCode: string;
  accountName: string;
  accountType: string;
  isActive: boolean;
  status: string;
  mainGroup: string;
}

export interface ChartofAccountMasterReq {
  AccountID: number;
  AccountCode: string;
  AccountName: string;
  AccountType: string;
  Status: string;
  Tenantid: number;
  Groupid?: number;
  Subgroupid?: number;
  Subgroupid2?: number;
  Subgroupid3?: number;
  Linegroupid?: number;
  MainGroup: string;
}

export class ChartofAccountsService {
  public static GetChartofAccounts = async (
    request: { tenantid: number }
  ): Promise<ChartofAccountMaster[] | null> => {
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

    const url = `/ChartofAccounts/GetChartofAccounts`;
    return Instense.get(url, {
      params: { tenantid: tenantID },
    }).then((response) => {
      const result = response.data.result as ChartofAccountMaster[];
      return result;
    });
  };

  public static GetChartofAccountById = async (
    accountId: number
  ): Promise<ChartofAccountMasterReq | null> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    const tenantID = storage?.tenantID || 0;

    const url = `/ChartofAccounts/GetChartofAccountById`;
    return Instense.get(url, {
      params: { accountId, tenantId: tenantID },
    }).then((response) => {
      const result = response.data.result as any;
      return {
        AccountID: result.accountID,
        AccountCode: result.accountCode || "",
        AccountName: result.accountName || "",
        AccountType: result.accountType || "",
        Status: result.status || (result.isActive ? "Active" : "Inactive"),
        Tenantid: tenantID,
        Groupid: result.groupid,
        Subgroupid: result.subgroupid,
        Subgroupid2: result.subgroupid2,
        Subgroupid3: result.subgroupid3,
        Linegroupid: result.linegroupid,
        MainGroup: result.mainGroup || "",
      } as ChartofAccountMasterReq;
    });
  };

  public static SaveChartofAccount = async (
    request: ChartofAccountMasterReq
  ): Promise<any> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    const tenantID = storage?.tenantID || 0;

    request.Tenantid = tenantID;

    const url = `/ChartofAccounts/SaveChartofAccount`;
    return Instense.post(url, request).then((response) => {
      const result = response.data.result;
      return result;
    });
  };

  public static GetMainGroups = async (): Promise<{ mainGroupID: number; mainGroupName: string }[]> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    const tenantID = storage?.tenantID || 0;

    const url = `/ChartofAccounts/GetMainGroups`;
    return Instense.get(url, {
      params: { tenantid: tenantID },
    }).then((response) => {
      return response.data.result || [];
    });
  };

  public static GetSubGroups = async (mainGroupId?: number): Promise<{ subGroupID: number; subGroupName: string; mainGroupID?: number }[]> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    const tenantID = storage?.tenantID || 0;

    const url = `/ChartofAccounts/GetSubGroups`;
    return Instense.get(url, {
      params: { tenantid: tenantID, mainGroupId: mainGroupId || null },
    }).then((response) => {
      return response.data.result || [];
    });
  };

  public static GetSubGroups2 = async (subGroupId?: number): Promise<{ subGroup2ID: number; subGroup2Name: string; subGroupID?: number }[]> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    const tenantID = storage?.tenantID || 0;

    const url = `/ChartofAccounts/GetSubGroups2`;
    return Instense.get(url, {
      params: { tenantid: tenantID, subGroupId: subGroupId || null },
    }).then((response) => {
      return response.data.result || [];
    });
  };

  public static GetSubGroups3 = async (subGroup2Id?: number): Promise<{ subGroup3ID: number; subGroup3Name: string; subGroup2ID?: number }[]> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    const tenantID = storage?.tenantID || 0;

    const url = `/ChartofAccounts/GetSubGroups3`;
    return Instense.get(url, {
      params: { tenantid: tenantID, subGroup2Id: subGroup2Id || null },
    }).then((response) => {
      return response.data.result || [];
    });
  };

  public static SaveMainGroup = async (mainGroupName: string): Promise<{ mainGroupID: number; mainGroupName: string }> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    const tenantID = storage?.tenantID || 0;

    const url = `/ChartofAccounts/SaveMainGroup`;
    return Instense.post(url, {
      Tenantid: tenantID,
      MainGroupName: mainGroupName,
    }).then((response) => {
      return response.data.result;
    });
  };

  public static SaveSubGroup = async (subGroupName: string, mainGroupId: number): Promise<{ subGroupID: number; subGroupName: string }> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    const tenantID = storage?.tenantID || 0;

    const url = `/ChartofAccounts/SaveSubGroup`;
    return Instense.post(url, {
      Tenantid: tenantID,
      MainGroupID: mainGroupId,
      SubGroupName: subGroupName,
    }).then((response) => {
      return response.data.result;
    });
  };

  public static SaveSubGroup2 = async (subGroup2Name: string, subGroupId: number): Promise<{ subGroup2ID: number; subGroup2Name: string }> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    const tenantID = storage?.tenantID || 0;

    const url = `/ChartofAccounts/SaveSubGroup2`;
    return Instense.post(url, {
      Tenantid: tenantID,
      SubGroupID: subGroupId,
      SubGroup2Name: subGroup2Name,
    }).then((response) => {
      return response.data.result;
    });
  };

  public static SaveSubGroup3 = async (subGroup3Name: string, subGroup2Id: number): Promise<{ subGroup3ID: number; subGroup3Name: string }> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    const tenantID = storage?.tenantID || 0;

    const url = `/ChartofAccounts/SaveSubGroup3`;
    return Instense.post(url, {
      Tenantid: tenantID,
      SubGroup2ID: subGroup2Id,
      SubGroup3Name: subGroup3Name,
    }).then((response) => {
      return response.data.result;
    });
  };

  public static CheckChartofAccountDeletionImpact = async (
    accountId: number
  ): Promise<any> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    const tenantID = storage?.tenantID || 0;

    const url = `/ChartofAccounts/CheckChartofAccountDeletionImpact`;
    return Instense.get(url, {
      params: { accountId, tenantId: tenantID },
    }).then((response) => {
      return response.data;
    });
  };

  public static DeleteChartofAccount = async (
    accountId: number
  ): Promise<any> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    const tenantID = storage?.tenantID || 0;

    const url = `/ChartofAccounts/DeleteChartofAccount`;
    return Instense.delete(url, {
      params: { accountId, tenantId: tenantID },
    }).then((response) => {
      const result = response.data.result;
      return result;
    });
  };
}

export {};

