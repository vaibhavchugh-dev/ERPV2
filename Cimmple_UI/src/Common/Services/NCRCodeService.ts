import Instense from "./Axios-config";

export interface NCRCodeMaster {
  id: number;
  ncrCode: string;
  description: string;
  tenantId: number;
  createdDate?: string;
}

export interface NCRCodeMasterReq {
  Id: number;
  NCRCode: string;
  Description: string;
  TenantId: number;
  CreatedBy: number;
}

export class NCRCodeService {
  public static GetNCRCodes = async (tenantId: number): Promise<NCRCodeMaster[]> => {
    const response = await Instense.get(`/NCRCode/GetNCRCodes?tenantId=${tenantId}`);
    return response.data?.result ?? [];
  };

  public static GetNCRCodeById = async (id: number, tenantId: number): Promise<NCRCodeMaster | null> => {
    const response = await Instense.get(`/NCRCode/GetNCRCodeById?id=${id}&tenantId=${tenantId}`);
    return response.data?.result ?? null;
  };

  public static SaveNCRCode = async (request: NCRCodeMasterReq): Promise<NCRCodeMaster> => {
    const response = await Instense.post("/NCRCode/SaveNCRCode", request);
    return response.data?.result;
  };

  public static CheckNCRCodeDeletionImpact = async (id: number, tenantId: number) => {
    const response = await Instense.get(`/NCRCode/CheckNCRCodeDeletionImpact?id=${id}&tenantId=${tenantId}`);
    return response.data;
  };

  public static DeleteNCRCode = async (id: number, tenantId: number) => {
    const response = await Instense.delete(`/NCRCode/DeleteNCRCode?id=${id}&tenantId=${tenantId}`);
    return response.data;
  };
};
