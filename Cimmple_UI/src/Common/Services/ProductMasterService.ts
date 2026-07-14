import Instense from "./Axios-config";

export interface ProductMaster {
  partNo: string;
  partName: string;
  unit: string;
  totalQtyOrdered: number;
  avgUnitPrice: number;
  minUnitPrice: number;
  maxUnitPrice: number;
  orderCount: number;
  quotationCount: number;
  firstOrderDate: string;
  lastOrderDate: string;
  productId?: number;
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
    return Array.isArray(result) ? result : [];
  };

  /** Sync ProductMaster table from distinct parts in customer orders and quotations. */
  public static SyncFromOrders = async (): Promise<{ added: number; message: string } | null> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    let tenantID = storage?.tenantID || 0;
    if (tenantID === 0 && process.env.NODE_ENV === "development") {
      tenantID = 1;
    }
    const url = `/ProductMaster/SyncFromOrders`;
    const response = await Instense.post(url, null, { params: { tenantid: tenantID } });
    const data = response.data as { added?: number; message?: string };
    return data ? { added: data.added ?? 0, message: data.message ?? "" } : null;
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
}

export {};

