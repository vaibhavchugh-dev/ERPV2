import Instense from "./Axios-config";

export interface InventoryBalance {
  id: number;
  productId?: number;
  rawMaterialId?: number;
  productPartNo?: string;
  rawMaterialPartNo?: string;
  productName?: string;
  rawMaterialName?: string;
  locationId: number;
  locationName?: string;
  quantityOnHand: number;
  quantityReserved: number;
  quantityAvailable: number;
  reorderPoint?: number;
  reorderQuantity?: number;
  unitCost?: number;
}

export interface InventoryTransaction {
  id: number;
  productId?: number;
  rawMaterialId?: number;
  productPartNo?: string;
  rawMaterialPartNo?: string;
  locationId: number;
  locationName?: string;
  transactionType: string;
  quantity: number;
  referenceType?: string;
  referenceId?: number;
  transactionDate: string;
  notes?: string;
}

export interface RawMaterial {
  id: number;
  partNo?: string;
  partName?: string;
  description?: string;
  unit?: string;
  unitCost: number;
  vendorId?: number;
  vendorName?: string;
  reorderPoint?: number;
  reorderQuantity?: number;
  sku?: string;
  warehouseLocation?: string;
  bin?: string;
  box?: string;
  materialGrade?: string;
  specification?: string;
  stockForm?: string;
  thicknessMm?: number;
  widthMm?: number;
  lengthMm?: number;
  isRemnant?: boolean;
  isActive?: boolean;
  parentRawMaterialId?: number;
  parentPartNo?: string;
  defaultLocationId?: number;
  defaultLocationName?: string;
}

export interface LowStockAlert {
  id: number;
  productId?: number;
  rawMaterialId?: number;
  partNo?: string;
  partName?: string;
  locationName?: string;
  quantityOnHand: number;
  reorderPoint?: number;
  reorderQuantity?: number;
}

/** Same rules as Axios-config: honor storage, accept tenantId casing, default tenant 1 on local dev. */
export function getTenantId(): number {
  const storage = JSON.parse(localStorage.getItem("storage") || "{}");
  let tenantID = Number(storage?.tenantID ?? storage?.tenantId ?? 0) || 0;
  const isLocalHost =
    typeof window !== "undefined" &&
    (window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1");
  if (
    tenantID === 0 &&
    (process.env.NODE_ENV === "development" || isLocalHost)
  ) {
    tenantID = 1;
  }
  return tenantID;
}

export class InventoryService {
  public static GetBalanceList = async (params?: {
    locationId?: number;
    productId?: number;
    rawMaterialId?: number;
    lowStockOnly?: boolean;
  }): Promise<InventoryBalance[] | null> => {
    const tenantId = getTenantId();
    const response = await Instense.get("/Inventory/GetBalanceList", {
      params: { tenantId, ...params },
    });
    return response.data.result as InventoryBalance[];
  };

  public static GetTransactionHistory = async (params?: {
    productId?: number;
    rawMaterialId?: number;
    locationId?: number;
    fromDate?: string;
    toDate?: string;
    limit?: number;
  }): Promise<InventoryTransaction[] | null> => {
    const tenantId = getTenantId();
    const response = await Instense.get("/Inventory/GetTransactionHistory", {
      params: { tenantId, ...params },
    });
    return response.data.result as InventoryTransaction[];
  };

  public static ReceiveStock = async (request: {
    productId?: number;
    rawMaterialId?: number;
    locationId: number;
    quantity: number;
    referenceType?: string;
    referenceId?: number;
    lotId?: number;
    notes?: string;
  }): Promise<{ success: boolean; error?: string }> => {
    const tenantId = getTenantId();
    try {
      const response = await Instense.post("/Inventory/ReceiveStock", {
        tenantId,
        ...request,
      });
      return { success: response.data.success !== false };
    } catch (err: any) {
      return {
        success: false,
        error: err.response?.data?.error || err.message || "Unknown error",
      };
    }
  };

  public static IssueStock = async (request: {
    productId?: number;
    rawMaterialId?: number;
    locationId: number;
    quantity: number;
    referenceType?: string;
    referenceId?: number;
    notes?: string;
  }): Promise<{ success: boolean; error?: string }> => {
    const tenantId = getTenantId();
    try {
      const response = await Instense.post("/Inventory/IssueStock", {
        tenantId,
        ...request,
      });
      return { success: response.data.success !== false };
    } catch (err: any) {
      return {
        success: false,
        error: err.response?.data?.error || err.message || "Unknown error",
      };
    }
  };

  public static TransferStock = async (request: {
    productId?: number;
    rawMaterialId?: number;
    fromLocationId: number;
    toLocationId: number;
    quantity: number;
    notes?: string;
  }): Promise<{ success: boolean; error?: string }> => {
    const tenantId = getTenantId();
    try {
      const response = await Instense.post("/Inventory/TransferStock", {
        tenantId,
        ...request,
      });
      return { success: response.data.success !== false };
    } catch (err: any) {
      return {
        success: false,
        error: err.response?.data?.error || err.message || "Unknown error",
      };
    }
  };

  public static AdjustStock = async (request: {
    productId?: number;
    rawMaterialId?: number;
    locationId: number;
    quantity: number;
    notes?: string;
  }): Promise<{ success: boolean; error?: string }> => {
    const tenantId = getTenantId();
    try {
      const response = await Instense.post("/Inventory/AdjustStock", {
        tenantId,
        ...request,
      });
      return { success: response.data.success !== false };
    } catch (err: any) {
      return {
        success: false,
        error: err.response?.data?.error || err.message || "Unknown error",
      };
    }
  };

  public static GetLowStockAlerts = async (): Promise<LowStockAlert[] | null> => {
    const tenantId = getTenantId();
    const response = await Instense.get("/Inventory/GetLowStockAlerts", {
      params: { tenantId },
    });
    return response.data.result as LowStockAlert[];
  };

  public static GetProducts = async (): Promise<{ id: number; partNo?: string; partName?: string; unit?: string }[] | null> => {
    const tenantId = getTenantId();
    const response = await Instense.get("/Inventory/GetProducts", {
      params: { tenantId },
    });
    const result = response.data?.result;
    return Array.isArray(result) ? result : null;
  };

  public static GetRawMaterials = async (params?: {
    includeInactive?: boolean;
  }): Promise<RawMaterial[] | null> => {
    const tenantId = getTenantId();
    const response = await Instense.get("/Inventory/GetRawMaterials", {
      params: { tenantId, ...params },
    });
    return response.data.result as RawMaterial[];
  };

  public static SaveRawMaterial = async (request: {
    id?: number;
    partNo?: string;
    partName?: string;
    description?: string;
    unit?: string;
    unitCost: number;
    vendorId?: number;
    reorderPoint?: number;
    reorderQuantity?: number;
    sku?: string;
    warehouseLocation?: string;
    bin?: string;
    box?: string;
    materialGrade?: string;
    specification?: string;
    stockForm?: string;
    thicknessMm?: number | null;
    widthMm?: number | null;
    lengthMm?: number | null;
    isRemnant?: boolean;
    parentRawMaterialId?: number | null;
    defaultLocationId?: number | null;
  }): Promise<{ id: number } | null> => {
    const tenantId = getTenantId();
    const response = await Instense.post("/Inventory/SaveRawMaterial", {
      tenantid: tenantId,
      id: request.id || 0,
      ...request,
    });
    return response.data.result;
  };

  public static SetRawMaterialStatus = async (request: {
    id: number;
    isActive: boolean;
  }): Promise<{ id: number; isActive: boolean } | null> => {
    const tenantId = getTenantId();
    const response = await Instense.post("/Inventory/SetRawMaterialStatus", {
      tenantid: tenantId,
      id: request.id,
      isActive: request.isActive,
    });
    return response.data?.result ?? null;
  };
}
