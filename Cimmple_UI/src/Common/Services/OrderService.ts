import Instense from "./Axios-config";

export interface OrderAttachment {
  id: number;
  name: string;
  size: number;
  fileUrl?: string;
}

export interface OrderComment {
  id: number;
  text: string;
  createdAt: string;
  createdBy: string;
}

export interface OrderMaster {
  orderID: number;
  orderNumber: number;
  customerID: number;
  customerCode: string;
  customerName: string;
  orderDate: string;
  totalAmount: number;
  status: string;
  quotationId?: number;
  quotationNo?: string;
  locationId?: number;
  Attachments?: OrderAttachment[];
  Comments?: OrderComment[];
}

export interface OrderDetail {
  id: number;
  itemNo: number;
  partName: string;
  partNo: string;
  dueDate: string;
  jobNumber: string;
  jobDesc: string;
  qtyOrdered: number;
  unit: string;
  unitPrice: number;
  jobPriority: number;
  discount: number;
  productId?: number;
  leadTime: string;
  notes: string;
  shippedQty: number;
  shippingStatus: string;
  invoicedQty: number;
  invoiceStatus: string;
}

export interface OrderMasterReq {
  OrderID: number;
  Tenantid: number;
  CustomerID: number;
  CustomerCode: string;
  PONumber: number;
  CustomerName: string;
  Address: string;
  CustomerPoNumber: string;
  OrderDate: string;
  TotalAmount: number;
  UserId: number;
  UserToken: number;
  Status: string;
  ShippingInstructions: string;
  ExternalCustomerPO: string;
  ExternalOrderDate?: string;
  BuyerName: string;
  QuotationId?: number;
  QuotationNo?: string;
  LocationId?: number;
  Details: OrderDetailReq[];
  Attachments?: OrderAttachment[];
  Comments?: OrderComment[];
}

export interface OrderDetailReq {
  ID: number;
  ItemNo: number;
  PartName: string;
  PartNo: string;
  DueDate: string;
  JobNumber: string;
  JobDesc: string;
  QtyOrdered: number;
  Unit: string;
  UnitPrice: number;
  JobPriority: number;
  Discount: number;
  DiscountType?: "Percent" | "Amount";
  ProductId?: number;
  LeadTime: string;
  Notes: string;
  ShippedQty: number;
  ShippingStatus: string;
  InvoicedQty: number;
  InvoiceStatus: string;
}

export class OrderService {
  public static GetOrders = async (
    request: { tenantid: number; locationId?: number }
  ): Promise<OrderMaster[] | null> => {
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

    const url = `/Order/GetOrders`;
    const params: Record<string, number> = { tenantid: tenantID };
    if (request.locationId && request.locationId > 0) {
      params.locationId = request.locationId;
    }
    return Instense.get(url, { params }).then((response) => {
      const result = response.data.result as OrderMaster[];
      return result;
    });
  };

  public static GetOrderById = async (
    orderId: number
  ): Promise<OrderMasterReq | null> => {
    // Get tenantID from localStorage
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    let tenantID = storage?.tenantID || 0;
    
    // For development: if tenantID is not set, use a default value
    if (tenantID === 0 && process.env.NODE_ENV === 'development') {
      tenantID = 1; // Default tenant ID for development
    }

    const url = `/Order/GetOrderById`;
    return Instense.get(url, {
      params: { orderId, tenantId: tenantID },
    }).then((response) => {
      const result = response.data.result as any;
      
      // Format dates
      const formatDate = (dateStr: string | null | undefined): string => {
        if (!dateStr) return "";
        try {
          const date = new Date(dateStr);
          const month = String(date.getMonth() + 1).padStart(2, '0');
          const day = String(date.getDate()).padStart(2, '0');
          const year = String(date.getFullYear()).slice(-2);
          return `${month}/${day}/${year}`;
        } catch {
          return "";
        }
      };

      return {
        OrderID: result.orderID,
        Tenantid: tenantID,
        CustomerID: result.customerID,
        CustomerCode: result.customerCode || "",
        PONumber: result.poNumber || 0,
        CustomerName: result.customerName || "",
        Address: result.address || "",
        CustomerPoNumber: result.customerPoNumber || "",
        OrderDate: formatDate(result.orderDate),
        TotalAmount: result.totalAmount || 0,
        UserId: result.userId || 0,
        UserToken: result.userToken || 0,
        Status: result.status || "Draft",
        ShippingInstructions: result.shippingInstructions || "",
        ExternalCustomerPO: result.externalCustomerPO || "",
        ExternalOrderDate: result.externalOrderDate ? formatDate(result.externalOrderDate) : undefined,
        BuyerName: result.buyerName || "",
        QuotationId: result.quotationId,
        QuotationNo: result.quotationNo || "",
        LocationId: result.locationId,
        Attachments: (() => {
          if (Array.isArray(result.attachments) && result.attachments.length > 0) {
            return result.attachments.map((a: any) => ({
              id: a.id || a.Id || 0,
              name: a.name || a.Name || "",
              size: a.size || a.Size || 0,
              fileUrl: a.fileUrl || a.FileUrl || a.uploadFile || a.UploadFile || "",
            }));
          } else if (Array.isArray(result.Attachments) && result.Attachments.length > 0) {
            return result.Attachments.map((a: any) => ({
              id: a.id || a.Id || 0,
              name: a.name || a.Name || "",
              size: a.size || a.Size || 0,
              fileUrl: a.fileUrl || a.FileUrl || a.uploadFile || a.UploadFile || "",
            }));
          }
          return [];
        })(),
        Comments: Array.isArray(result.comments) && result.comments.length > 0
          ? result.comments.map((c: any) => ({
              id: c.id || c.Id || 0,
              text: c.text || c.Text || "",
              createdAt: c.createdAt || c.CreatedAt || new Date().toISOString(),
              createdBy: c.createdBy || c.CreatedBy || "User",
            }))
          : (Array.isArray(result.Comments) && result.Comments.length > 0
            ? result.Comments.map((c: any) => ({
                id: c.id || c.Id || 0,
                text: c.text || c.Text || "",
                createdAt: c.createdAt || c.CreatedAt || new Date().toISOString(),
                createdBy: c.createdBy || c.CreatedBy || "User",
              }))
            : []),
        Details: (result.details || []).map((d: any) => ({
          ID: d.id || 0,
          ItemNo: d.itemNo || 0,
          PartName: d.partName || "",
          PartNo: d.partNo || "",
          DueDate: formatDate(d.dueDate),
          JobNumber: d.jobNumber || "",
          JobDesc: d.jobDesc || "",
          QtyOrdered: d.qtyOrdered || 0,
          Unit: d.unit || "",
          UnitPrice: d.unitPrice || 0,
          JobPriority: d.jobPriority || 0,
          Discount: d.discount || 0,
          DiscountType: d.discountType === "Amount" ? "Amount" : "Percent",
          ProductId: d.productId,
          LeadTime: d.leadTime || "",
          Notes: d.notes || "",
          ShippedQty: d.shippedQty || 0,
          ShippingStatus: d.shippingStatus || "Not Started",
          InvoicedQty: d.invoicedQty || 0,
          InvoiceStatus: d.invoiceStatus || "Not Invoiced",
        }))
      } as OrderMasterReq;
    });
  };

  public static SaveOrder = async (
    request: OrderMasterReq
  ): Promise<{ id: number; poNumber?: number; message: string }> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    let tenantID = storage?.tenantID || 0;
    
    // For development: if tenantID is not set, use a default value
    if (tenantID === 0 && process.env.NODE_ENV === 'development') {
      tenantID = 1; // Default tenant ID for development
    }

    request.Tenantid = tenantID;

    // Convert date strings to ISO format
    const convertDate = (dateStr: string): string => {
      if (!dateStr) return new Date().toISOString();
      try {
        const parts = dateStr.split('/');
        if (parts.length === 3) {
          const month = parseInt(parts[0]) - 1;
          const day = parseInt(parts[1]);
          const year = parseInt(parts[2]) + 2000;
          return new Date(year, month, day).toISOString();
        }
        if (dateStr.includes('T') || dateStr.includes('Z')) {
          return new Date(dateStr).toISOString();
        }
        return new Date(dateStr).toISOString();
      } catch {
        return new Date().toISOString();
      }
    };

    const payload: any = {
      OrderID: request.OrderID || 0,
      Tenantid: request.Tenantid || tenantID,
      CustomerID: request.CustomerID || 0,
      CustomerCode: request.CustomerCode || "",
      PONumber: request.PONumber || 0,
      CustomerName: request.CustomerName || "",
      Address: request.Address || "",
      CustomerPoNumber: request.CustomerPoNumber || "",
      OrderDate: convertDate(request.OrderDate),
      TotalAmount: request.TotalAmount || 0,
      UserId: request.UserId || 0,
      UserToken: request.UserToken || 0,
      Status: request.Status || "Draft",
      ShippingInstructions: request.ShippingInstructions || "",
      ExternalCustomerPO: request.ExternalCustomerPO || "",
      ExternalOrderDate: request.ExternalOrderDate ? convertDate(request.ExternalOrderDate) : null,
      BuyerName: request.BuyerName || "",
      QuotationId: request.QuotationId || null,
      QuotationNo: request.QuotationNo || "",
      LocationId: request.LocationId || null,
      Details: (request.Details || []).map(d => ({
        ID: d.ID || 0,
        ItemNo: d.ItemNo || 0,
        PartName: d.PartName || "",
        PartNo: d.PartNo || "",
        DueDate: convertDate(d.DueDate || d.LeadTime || new Date().toISOString()),
        JobNumber: d.JobNumber || "",
        JobDesc: d.JobDesc || "",
        QtyOrdered: d.QtyOrdered || 0,
        Unit: d.Unit || "",
        UnitPrice: d.UnitPrice || 0,
        JobPriority: d.JobPriority || 0,
        Discount: d.Discount || 0,
        DiscountType: d.DiscountType === "Amount" ? "Amount" : "Percent",
        ProductId: d.ProductId || null,
        LeadTime: d.LeadTime || "",
        Notes: d.Notes || "",
      })),
      Attachments: (request.Attachments || []).map(a => ({
        Id: Math.floor(a.id || 0),
        Name: a.name || "",
        Size: a.size || 0,
        FileUrl: a.fileUrl || ""
      })),
      Comments: (request.Comments || []).map(c => ({
        Id: Math.floor(c.id || 0),
        Text: c.text || "",
        CreatedAt: c.createdAt || new Date().toISOString(),
        CreatedBy: c.createdBy || "User"
      }))
    };

    const cleanPayload = JSON.parse(JSON.stringify(payload, (key, value) => {
      if (value === undefined) {
        return null;
      }
      return value;
    }));

    const url = `/Order/SaveOrder`;
    return Instense.post(url, cleanPayload, {
      headers: {
        'Content-Type': 'application/json'
      }
    }).then((response) => {
      const result = response.data.result;
      if (result && result.id) {
        return {
          id: result.id,
          poNumber: result.poNumber,
          message: result.message || "Order saved successfully",
        };
      }
      return { id: request.OrderID || 0, message: "Order saved successfully" };
    });
  };

  public static CheckOrderDeletionImpact = async (
    orderId: number
  ): Promise<any> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    let tenantID = storage?.tenantID || 0;
    
    // For development: if tenantID is not set, use a default value
    if (tenantID === 0 && process.env.NODE_ENV === 'development') {
      tenantID = 1; // Default tenant ID for development
    }

    const url = `/Order/CheckOrderDeletionImpact`;
    return Instense.get(url, {
      params: { orderId, tenantId: tenantID },
    }).then((response) => {
      return response.data;
    });
  };

  public static DuplicateOrder = async (
    orderId: number
  ): Promise<{ id: number; message: string }> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    let tenantID = storage?.tenantID || 0;
    if (tenantID === 0 && process.env.NODE_ENV === "development") {
      tenantID = 1;
    }

    const url = `/Order/DuplicateOrder`;
    return Instense.post(url, null, {
      params: { orderId, tenantId: tenantID },
    }).then((response) => {
      const result = response.data.result;
      return {
        id: result?.id || 0,
        message: result?.message || "Order duplicated successfully",
      };
    });
  };

  public static GetLastOrderLinesByCustomer = async (
    customerId: number
  ): Promise<{
    found: boolean;
    orderId: number;
    orderNumber: number;
    orderDate: string;
    lines: Array<{
      itemNo: number;
      partNo: string;
      partName: string;
      unit: string;
      qtyOrdered: number;
      unitPrice: number;
      discount: number;
      discountType: string;
      productId?: number;
      notes: string;
      leadTime: string;
      dueDate: string;
    }>;
  }> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    let tenantID = storage?.tenantID || 0;
    if (tenantID === 0 && process.env.NODE_ENV === "development") {
      tenantID = 1;
    }

    const url = `/Order/GetLastOrderLinesByCustomer`;
    return Instense.get(url, {
      params: { tenantId: tenantID, customerId },
    }).then((response) => {
      const result = response.data?.result;
      if (!result) {
        return { found: false, orderId: 0, orderNumber: 0, orderDate: "", lines: [] };
      }
      return {
        found: !!result.found,
        orderId: result.orderId || 0,
        orderNumber: result.orderNumber || 0,
        orderDate: result.orderDate || "",
        lines: Array.isArray(result.lines)
          ? result.lines.map((l: any) => ({
              itemNo: l.itemNo || 0,
              partNo: l.partNo || "",
              partName: l.partName || "",
              unit: l.unit || "EA",
              qtyOrdered: l.qtyOrdered || 0,
              unitPrice: l.unitPrice || 0,
              discount: l.discount || 0,
              discountType: l.discountType === "Amount" ? "Amount" : "Percent",
              productId: l.productId,
              notes: l.notes || "",
              leadTime: l.leadTime || "",
              dueDate: l.dueDate || "",
            }))
          : [],
      };
    });
  };

  public static DeleteOrder = async (
    orderId: number
  ): Promise<any> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    let tenantID = storage?.tenantID || 0;
    
    // For development: if tenantID is not set, use a default value
    if (tenantID === 0 && process.env.NODE_ENV === 'development') {
      tenantID = 1; // Default tenant ID for development
    }

    const url = `/Order/DeleteOrder`;
    return Instense.delete(url, {
      params: { orderId, tenantId: tenantID },
    }).then((response) => {
      const result = response.data.result;
      return result;
    });
  };
}

export {};


