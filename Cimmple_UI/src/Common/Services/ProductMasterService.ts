import Instense from "./Axios-config";

export interface ProductMaster {
  partNo: string;
  partName: string;
  unit: string;
  totalQtyOrdered: number;
  totalQtyQuoted?: number;
  avgUnitPrice: number;
  minUnitPrice: number;
  maxUnitPrice: number;
  orderCount: number;
  quotationCount: number;
  firstOrderDate: string;
  lastOrderDate: string;
  productId?: number;
  sourcingType?: string;
}

export interface CustomerPartOption {
  partNo: string;
  partName: string;
  unit: string;
  /** Suggested fill price: last ordered, else last quoted */
  unitPrice: number;
  productId?: number;
  lastQuotedPrice?: number | null;
  lastQuotedDate?: string | null;
  lastOrderedPrice?: number | null;
  lastOrderedQty?: number | null;
  lastOrderedDate?: string | null;
  suggestedQty?: number;
  orderCount?: number;
  quotationCount?: number;
  totalQtyOrdered?: number;
  totalQtyQuoted?: number;
}

export interface CustomerOrderInfo {
  orderId: number;
  orderNumber: number;
  orderDate: string;
  qty: number;
  price: number;
}

export interface CustomerInfo {
  customerId: number;
  customerName: string;
  customerCode: string;
  orderCount?: number;
  quotationCount?: number;
  totalQty: number;
  avgPrice: number;
  lastOrderDate?: string;
  lastQuotationDate?: string;
  orders?: CustomerOrderInfo[];
  quotations?: CustomerOrderInfo[];
}

export interface ProductMasterDetail {
  id?: number;
  partNo: string;
  partName: string;
  unit: string;
  unitPrice?: number;
  noOfDays?: number;
  description?: string;
  customerId?: number;
  avgUnitPrice?: number;
  minUnitPrice?: number;
  maxUnitPrice?: number;
  productId?: number;
  sourcingType?: string;
  reorderPoint?: number | null;
  reorderQuantity?: number | null;
  source: string;
  customers?: CustomerInfo[];
}

export class ProductMasterService {
  public static GetProductsFromOrders = async (
    request: { tenantid: number }
  ): Promise<ProductMaster[] | null> => {
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

    const url = `/ProductMaster/GetProductsFromOrders`;
    return Instense.get(url, {
      params: { tenantid: tenantID },
    }).then((response) => {
      const result = response.data?.result;
      return Array.isArray(result) ? result : [];
    });
  };

  /** Returns products from the ProductMaster table (for when order list is empty or to merge). */
  public static GetProductMasterList = async (
    request?: { tenantid?: number }
  ): Promise<ProductMaster[]> => {
    let tenantID = request?.tenantid ?? 0;
    if (tenantID === 0) {
      const storage = JSON.parse(localStorage.getItem("storage") || "{}");
      tenantID = storage?.tenantID || 0;
    }
    if (tenantID === 0 && process.env.NODE_ENV === "development") {
      tenantID = 1;
    }
    const url = `/ProductMaster/GetProductMasterList`;
    const response = await Instense.get(url, { params: { tenantid: tenantID } });
    const result = response.data?.result;
    if (!Array.isArray(result)) return [];
    return result.map((p: any) => ({
      partNo: p.partNo || p.partno || "",
      partName: p.partName || p.partname || "",
      unit: p.unit || p.Unit || "",
      totalQtyOrdered: p.totalQtyOrdered ?? 0,
      totalQtyQuoted: p.totalQtyQuoted ?? 0,
      avgUnitPrice: p.avgUnitPrice ?? p.unitPrice ?? 0,
      minUnitPrice: p.minUnitPrice ?? p.unitPrice ?? 0,
      maxUnitPrice: p.maxUnitPrice ?? p.unitPrice ?? 0,
      orderCount: p.orderCount ?? 0,
      quotationCount: p.quotationCount ?? 0,
      firstOrderDate: p.firstOrderDate || "",
      lastOrderDate: p.lastOrderDate || "",
      productId: p.productId ?? p.id,
      sourcingType: p.sourcingType || p.SourcingType || "Make",
    }));
  };

  /** Sync ProductMaster from customer orders (Make) and vendor finished-product POs (Buy). */
  public static SyncFromOrders = async (): Promise<{
    added: number;
    updated?: number;
    linkedPoLines?: number;
    message: string;
  } | null> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    let tenantID = storage?.tenantID || 0;
    if (tenantID === 0 && process.env.NODE_ENV === "development") {
      tenantID = 1;
    }
    const url = `/ProductMaster/SyncFromOrders`;
    const response = await Instense.post(url, null, { params: { tenantid: tenantID } });
    const data = response.data as {
      added?: number;
      updated?: number;
      linkedPoLines?: number;
      message?: string;
    };
    return data
      ? {
          added: data.added ?? 0,
          updated: data.updated ?? 0,
          linkedPoLines: data.linkedPoLines ?? 0,
          message: data.message ?? "",
        }
      : null;
  };

  public static GetProductById = async (
    partNo: string
  ): Promise<ProductMasterDetail | null> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    let tenantID = storage?.tenantID || 0;
    
    // For development: if tenantID is not set, use a default value
    if (tenantID === 0 && process.env.NODE_ENV === 'development') {
      tenantID = 1; // Default tenant ID for development
    }

    const url = `/ProductMaster/GetProductById`;
    return Instense.get(url, {
      params: { partNo, tenantId: tenantID },
    }).then((response) => {
      const result = response.data.result as any;
      return {
        id: result.id,
        partNo: result.partNo || "",
        partName: result.partName || "",
        unit: result.unit || "",
        unitPrice: result.unitPrice ?? result.avgUnitPrice,
        noOfDays: result.noOfDays,
        description: result.description || "",
        customerId: result.customerId,
        avgUnitPrice: result.avgUnitPrice,
        minUnitPrice: result.minUnitPrice,
        maxUnitPrice: result.maxUnitPrice,
        productId: result.productId,
        sourcingType: result.sourcingType || result.SourcingType,
        reorderPoint: result.reorderPoint ?? result.ReorderPoint ?? null,
        reorderQuantity: result.reorderQuantity ?? result.ReorderQuantity ?? null,
        source: result.source || "CustomerOrders",
        customers: result.customers ? result.customers.map((c: any) => ({
          customerId: c.customerId,
          customerName: c.customerName || "",
          customerCode: c.customerCode || "",
          orderCount: c.orderCount,
          quotationCount: c.quotationCount,
          totalQty: c.totalQty || 0,
          avgPrice: c.avgPrice || 0,
          lastOrderDate: c.lastOrderDate,
          lastQuotationDate: c.lastQuotationDate,
          orders: c.orders ? c.orders.map((o: any) => ({
            orderId: o.orderId,
            orderNumber: o.orderNumber,
            orderDate: o.orderDate,
            qty: o.qty,
            price: o.price
          })) : undefined,
          quotations: c.quotations ? c.quotations.map((q: any) => ({
            orderId: q.quotationId,
            orderNumber: q.quotationNumber,
            orderDate: q.quotationDate,
            qty: q.qty,
            price: q.price
          })) : undefined
        })) : undefined
      } as ProductMasterDetail;
    });
  };

  public static SaveReorderPolicy = async (request: {
    id: number;
    reorderPoint?: number | null;
    reorderQuantity?: number | null;
  }): Promise<{ id: number; reorderPoint?: number | null; reorderQuantity?: number | null }> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    let tenantID = storage?.tenantID || 0;
    if (tenantID === 0 && process.env.NODE_ENV === "development") {
      tenantID = 1;
    }
    const url = `/ProductMaster/SaveReorderPolicy`;
    const response = await Instense.post(url, {
      id: request.id,
      tenantid: tenantID,
      reorderPoint: request.reorderPoint ?? null,
      reorderQuantity: request.reorderQuantity ?? null,
    });
    const result = response.data?.result;
    if (!result) {
      throw new Error(response.data?.error || "Could not save reorder policy.");
    }
    return result;
  };

  public static GetPartsByCustomer = async (
    customerId: number,
    options?: { q?: string; limit?: number }
  ): Promise<CustomerPartOption[]> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    let tenantID = storage?.tenantID || 0;
    if (tenantID === 0 && process.env.NODE_ENV === "development") {
      tenantID = 1;
    }

    const url = `/ProductMaster/GetPartsByCustomer`;
    const params: Record<string, string | number> = {
      tenantId: tenantID,
      customerId,
      limit: options?.limit ?? 50,
    };
    if (options?.q && options.q.trim()) {
      params.q = options.q.trim();
    }

    return Instense.get(url, { params }).then((response) => {
      const result = response.data?.result;
      if (!Array.isArray(result)) return [];
      return result.map((p: any) => ({
        partNo: p.partNo || "",
        partName: p.partName || "",
        unit: p.unit || "EA",
        unitPrice: p.unitPrice ?? 0,
        productId: p.productId,
        lastQuotedPrice: p.lastQuotedPrice ?? null,
        lastQuotedDate: p.lastQuotedDate ?? null,
        lastOrderedPrice: p.lastOrderedPrice ?? null,
        lastOrderedQty: p.lastOrderedQty ?? null,
        lastOrderedDate: p.lastOrderedDate ?? null,
        suggestedQty: p.suggestedQty ?? 1,
        orderCount: p.orderCount ?? 0,
        quotationCount: p.quotationCount ?? 0,
        totalQtyOrdered: p.totalQtyOrdered ?? 0,
        totalQtyQuoted: p.totalQtyQuoted ?? 0,
      }));
    });
  };

  public static GetPartsByVendor = async (
    vendorId: number,
    options?: { q?: string; limit?: number }
  ): Promise<CustomerPartOption[]> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    let tenantID = storage?.tenantID || 0;
    if (tenantID === 0 && process.env.NODE_ENV === "development") {
      tenantID = 1;
    }

    const url = `/ProductMaster/GetPartsByVendor`;
    const params: Record<string, string | number> = {
      tenantId: tenantID,
      vendorId,
      limit: options?.limit ?? 50,
    };
    if (options?.q && options.q.trim()) {
      params.q = options.q.trim();
    }

    return Instense.get(url, { params }).then((response) => {
      const result = response.data?.result;
      if (!Array.isArray(result)) return [];
      return result.map((p: any) => ({
        partNo: p.partNo || "",
        partName: p.partName || "",
        unit: p.unit || "EA",
        unitPrice: p.unitPrice ?? 0,
        productId: p.productId,
        lastQuotedPrice: p.lastQuotedPrice ?? null,
        lastQuotedDate: p.lastQuotedDate ?? null,
        lastOrderedPrice: p.lastOrderedPrice ?? null,
        lastOrderedQty: p.lastOrderedQty ?? null,
        lastOrderedDate: p.lastOrderedDate ?? null,
        suggestedQty: p.suggestedQty ?? 1,
        orderCount: p.orderCount ?? 0,
        quotationCount: p.quotationCount ?? 0,
        totalQtyOrdered: p.totalQtyOrdered ?? 0,
        totalQtyQuoted: p.totalQtyQuoted ?? 0,
      }));
    });
  };
}

export {};

