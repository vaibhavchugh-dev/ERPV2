import Instense from "./Axios-config";
import { defaultLineTypeForOrder } from "../Constants/vendorOrderLineTypes";
import { toDateOnlyApiString, toHtmlDateInputValue } from "../Utils/Formatting";

export interface VendorOrderMaster {
  orderID: number;
  orderNumber: number;
  vendorID: number;
  vendorCode: string;
  vendorName: string;
  orderDate: string;
  totalAmount: number;
  status: string;
  quotationId?: number;
  quotationNo?: string;
  materialType?: string; // Order Type (Material/Service)
  locationId?: number;
  Attachments?: VendorOrderAttachment[];
  Comments?: VendorOrderComment[];
}

export interface VendorOrderAttachment {
  id: number;
  name: string;
  size: number;
  fileUrl?: string;
}

export interface VendorOrderComment {
  id: number;
  text: string;
  createdAt: string;
  createdBy: string;
}

export interface VendorOrderDetail {
  id: number;
  itemNo: number;
  partName: string;
  partNo: string;
  /** RawMaterial | FinishedProduct | Tool | Service | Subcontract | Other */
  lineType?: string;
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

export interface VendorOrderMasterReq {
  OrderID: number;
  Tenantid: number;
  VendorID: number;
  VendorCode: string;
  PONumber: number;
  VendorName: string;
  Address: string;
  VendorPoNumber: string;
  OrderDate: string;
  TotalAmount: number;
  UserId: number;
  UserToken: number;
  Status: string;
  ShippingInstructions: string;
  ExternalVendorPO: string;
  ExternalOrderDate?: string;
  BuyerName: string;
  VendorRefNo: string;
  OrderType: string; // "Vendor" to distinguish from customer orders
  MaterialType?: string; // "Material" or "Service"
  QuotationId: number;
  QuotationNo: string;
  LocationId?: number;
  convertedOrderId?: number;
  ParentQuotationID?: number;
  AdditionalNotes?: string;
  Details: VendorOrderDetailReq[];
  Attachments?: VendorOrderAttachment[];
  Comments?: VendorOrderComment[];
}

export interface VendorOrderDetailReq {
  ID: number;
  ItemNo: number;
  PartName: string;
  PartNo: string;
  LineType?: string;
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
  /** Set when LineType is RawMaterial — books into inventory on stock receive. */
  RawMaterialId?: number;
  LeadTime: string;
  Notes: string;
  ShippedQty: number;
  ShippingStatus: string;
  InvoicedQty: number;
  InvoiceStatus: string;
  /** Expense GL account id (as string) or account code for invoice posting */
  glcode?: string;
}

export class VendorOrderService {
  public static GetVendorOrders = async (
    request: { tenantid: number; locationId?: number }
  ): Promise<VendorOrderMaster[] | null> => {
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

    // Use vendor-specific endpoint (backend has separate VendorOrders table)
    const url = `/Order/GetVendorOrders`;
    const params: Record<string, number> = { tenantId: tenantID };
    if (request.locationId && request.locationId > 0) {
      params.locationId = request.locationId;
    }
    const response = await Instense.get(url, { params });

    const result = response.data.result as VendorOrderMaster[];
    return result;
  };

  public static GetVendorOrderById = async (
    orderId: number
  ): Promise<VendorOrderMasterReq | null> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    let tenantID = storage?.tenantID || 0;
    
    // For development: if tenantID is not set, use a default value
    if (tenantID === 0 && process.env.NODE_ENV === 'development') {
      tenantID = 1; // Default tenant ID for development
    }

    // Use vendor-specific endpoint (backend has separate VendorOrders table)
    const url = `/Order/GetVendorOrderById`;
    const response = await Instense.get(url, {
      params: { orderId, tenantId: tenantID },
    });

    const result = response.data.result as any;

    // Format line DueDate for display (MM/DD/YY) without UTC day-shift
    const formatDate = (dateStr: string | null | undefined | Date): string => {
      if (!dateStr) return "";
      try {
        if (typeof dateStr === "string") {
          const trimmed = dateStr.trim();
          if (!trimmed || trimmed === "null" || trimmed === "undefined") return "";
          const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
          if (isoMatch) {
            return `${isoMatch[2]}/${isoMatch[3]}/${isoMatch[1].slice(-2)}`;
          }
        }
        const date = dateStr instanceof Date ? dateStr : new Date(String(dateStr));
        if (isNaN(date.getTime())) return "";
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
        const year = String(date.getFullYear()).slice(-2);
        return `${month}/${day}/${year}`;
      } catch (e) {
        console.warn("Error formatting date:", dateStr, e);
      }
      return "";
    };

    // Header dates must be yyyy-MM-dd for <input type="date">
    const toDateInput = (raw: string | Date | null | undefined): string => {
      if (!raw) return "";
      if (typeof raw === "string") {
        const isoMatch = raw.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
        const html = toHtmlDateInputValue(raw);
        if (html) return html;
      }
      const display = formatDate(raw);
      return display ? toHtmlDateInputValue(display) : "";
    };

    const orderDateRaw = result.OrderDate || result.orderDate;
    const externalDateRaw = result.ExternalOrderDate || result.externalOrderDate || result.DueDate || result.dueDate;

    return {
      OrderID: result.OrderID || result.orderID || 0,
      Tenantid: result.Tenantid || result.tenantid || tenantID,
      VendorID: result.VendorID || result.vendorID || 0,
      VendorCode: result.VendorCode || result.vendorCode || "",
      PONumber: result.PONumber || result.poNumber || 0,
      VendorName: result.VendorName || result.vendorName || "",
      Address: result.Address || result.address || "",
      VendorPoNumber: result.VendorPoNumber || result.vendorPoNumber || "",
      OrderDate: toDateInput(orderDateRaw),
      TotalAmount: result.TotalAmount || result.totalAmount || 0,
      UserId: result.UserId || result.userId || 0,
      UserToken: result.UserToken || result.userToken || 0,
      Status: result.Status || result.status || "Draft",
      ShippingInstructions: result.ShippingInstructions || result.shippingInstructions || "",
      ExternalVendorPO: result.ExternalVendorPO || result.externalVendorPO || "",
      ExternalOrderDate: externalDateRaw ? toDateInput(externalDateRaw) : undefined,
      BuyerName: result.BuyerName || result.buyerName || "",
      VendorRefNo: result.VendorRefNo || result.vendorRefNo || "",
      OrderType: "Vendor", // Always "Vendor" for vendor orders
      MaterialType: result.MaterialType || result.materialType || "Material",
      LocationId: result.LocationId || result.locationId,
      convertedOrderId: result.convertedOrderId,
      ParentQuotationID: result.ParentQuotationID || result.parentQuotationID,
      QuotationId: result.QuotationId || result.quotationId || 0,
      QuotationNo: result.QuotationNo || result.quotationNo || "",
      AdditionalNotes: result.AdditionalNotes || result.additionalNotes || "",
      Details: (result.Details || result.details || []).map((d: any) => ({
        ID: d.ID || d.id || 0,
        ItemNo: d.ItemNo || d.itemNo || 0,
        PartName: d.PartName || d.partName || "",
        PartNo: d.PartNo || d.partNo || "",
        LineType:
          d.LineType ||
          d.lineType ||
          defaultLineTypeForOrder(result.MaterialType || result.materialType || "Material"),
        DueDate: formatDate(d.DueDate || d.dueDate),
        JobNumber: d.JobNumber || d.jobNumber || "",
        JobDesc: d.JobDesc || d.jobDesc || "",
        QtyOrdered: d.QtyOrdered || d.qtyOrdered || 0,
        Unit: d.Unit || d.unit || "",
        UnitPrice: d.UnitPrice || d.unitPrice || 0,
        JobPriority: d.JobPriority || d.jobPriority || 0,
        Discount: d.Discount || d.discount || 0,
        DiscountType: (d.DiscountType || d.discountType) === "Amount" ? "Amount" : "Percent",
        ProductId: d.ProductId || d.productId,
        RawMaterialId: d.RawMaterialId || d.rawMaterialId,
        LeadTime: d.LeadTime || d.leadTime || "",
        Notes: d.Notes || d.notes || "",
        ShippedQty: d.ShippedQty || d.shippedQty || 0,
        ShippingStatus: d.ShippingStatus || d.shippingStatus || "",
        InvoicedQty: d.InvoicedQty || d.invoicedQty || 0,
        InvoiceStatus: d.InvoiceStatus || d.invoiceStatus || "",
        glcode: d.glcode || d.Glcode || "",
      })),
      Attachments: result.Attachments || result.attachments || [],
      Comments: result.Comments || result.comments || [],
    } as VendorOrderMasterReq;
  };

  public static SaveVendorOrder = async (
    request: VendorOrderMasterReq
  ): Promise<{ id: number; poNumber?: number; message: string }> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    let tenantID = storage?.tenantID || 0;
    
    // For development: if tenantID is not set, use a default value
    if (tenantID === 0 && process.env.NODE_ENV === 'development') {
      tenantID = 1; // Default tenant ID for development
    }

    request.Tenantid = tenantID;
    request.UserId = storage?.userId || 0;
    request.UserToken = storage?.userToken || 0;

    // Ensure OrderType is set to "Vendor"
    request.OrderType = "Vendor";

    // Log quotation information for debugging
    console.log("[VendorOrderService] SaveVendorOrder incoming request:", {
      QuotationId: request.QuotationId,
      QuotationNo: request.QuotationNo,
      hasQuotationId: request.hasOwnProperty('QuotationId'),
      hasQuotationNo: request.hasOwnProperty('QuotationNo'),
      allKeys: Object.keys(request)
    });

    // Date-only strings (yyyy-MM-dd) — avoid toISOString UTC day-shift
    const convertDate = (dateStr: string): string => toDateOnlyApiString(dateStr);

    // Build payload for vendor order endpoint
    const payload: any = {
      OrderID: request.OrderID || 0,
      Tenantid: request.Tenantid || tenantID,
      VendorID: request.VendorID,
      VendorCode: request.VendorCode || "",
      PONumber: request.PONumber || 0,
      VendorName: request.VendorName || "",
      Address: request.Address || "",
      VendorPoNumber: request.VendorPoNumber || "",
      OrderDate: convertDate(request.OrderDate),
      TotalAmount: request.TotalAmount || 0,
      UserId: request.UserId || 0,
      UserToken: request.UserToken || 0,
      Status: request.Status || "Draft",
      ShippingInstructions: request.ShippingInstructions || "",
      ExternalVendorPO: request.ExternalVendorPO || "",
      ExternalOrderDate: request.ExternalOrderDate ? convertDate(request.ExternalOrderDate) : null,
      BuyerName: request.BuyerName || "",
      VendorRefNo: request.VendorRefNo || "",
      OrderType: request.OrderType || "Vendor",
      MaterialType: request.MaterialType || "Material",
      QuotationId: request.QuotationId || 0,
      QuotationNo: request.QuotationNo || "",
      LocationId: request.LocationId || null,
      convertedOrderId: request.convertedOrderId,
      ParentQuotationID: request.ParentQuotationID,
      AdditionalNotes: request.AdditionalNotes || "",
      Details: (request.Details || []).map(d => ({
        ID: d.ID || 0,
        ItemNo: d.ItemNo || 0,
        PartName: d.PartName || "",
        PartNo: d.PartNo || "",
        DueDate: convertDate(d.DueDate || d.LeadTime || ""),
        JobNumber: d.JobNumber || "",
        JobDesc: d.JobDesc || "",
        QtyOrdered: d.QtyOrdered || 0,
        Unit: d.Unit || "EA",
        UnitPrice: d.UnitPrice || 0,
        JobPriority: d.JobPriority || 0,
        Discount: d.Discount || 0,
        DiscountType: d.DiscountType === "Amount" ? "Amount" : "Percent",
        ProductId: d.ProductId || null,
        RawMaterialId: d.RawMaterialId || null,
        LineType: d.LineType || undefined,
        LeadTime: d.LeadTime || "",
        Notes: d.Notes || "",
        ShippedQty: d.ShippedQty || 0,
        ShippingStatus: d.ShippingStatus || "Not Started",
        InvoicedQty: d.InvoicedQty || 0,
        InvoiceStatus: d.InvoiceStatus || "Not Invoiced",
        glcode: (d.glcode || "").trim(),
        Received: "No", // Required field
        JobId: 0, // Required field
      })),
      Attachments: (request.Attachments || []).map(a => ({
        id: Math.floor(a.id || 0),
        name: a.name || "",
        size: a.size || 0,
        fileUrl: a.fileUrl || ""
      })),
      Comments: (request.Comments || []).map(c => ({
        Id: Math.floor(c.id || 0),
        Text: c.text || "",
        CreatedAt: c.createdAt || new Date().toISOString(),
        CreatedBy: c.createdBy || "User"
      })),
    };

    // Use vendor-specific endpoint (backend has separate VendorOrders table)
    const url = `/Order/SaveVendorOrder`;
    console.log("[VendorOrderService] Sending payload to SaveVendorOrder:", {
      QuotationId: payload.QuotationId,
      QuotationNo: payload.QuotationNo,
      VendorID: payload.VendorID,
      OrderID: payload.OrderID,
      Tenantid: payload.Tenantid
    });
    const response = await Instense.post(url, payload);

    const result = response.data.result;
    if (result && result.id) {
      // Extract poNumber - check both camelCase and PascalCase
      const poNumber = result.poNumber ?? result.PONumber ?? null;
      
      console.log("[VendorOrderService] SaveVendorOrder response:", {
        id: result.id,
        poNumber: poNumber,
        poNumberType: typeof poNumber,
        resultKeys: Object.keys(result),
        fullResult: result
      });
      
      // Validate poNumber - must be a positive number
      if (poNumber !== null && poNumber !== undefined && typeof poNumber === 'number' && poNumber > 0) {
        return { 
          id: result.id, 
          poNumber: poNumber,
          message: result.message || "Vendor order saved successfully" 
        };
      } else {
        console.error("[VendorOrderService] Invalid or missing poNumber in response:", poNumber);
        // If poNumber is invalid, we need to query it from the database
        // For now, return null so frontend knows it's missing
        return { 
          id: result.id, 
          poNumber: undefined,
          message: result.message || "Vendor order saved successfully" 
        };
      }
    }
    return { id: request.OrderID || 0, poNumber: undefined, message: "Vendor order saved successfully" };
  };

  public static CheckVendorOrderDeletionImpact = async (
    orderId: number
  ): Promise<any> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    let tenantID = storage?.tenantID || 0;
    
    // For development: if tenantID is not set, use a default value
    if (tenantID === 0 && process.env.NODE_ENV === 'development') {
      tenantID = 1; // Default tenant ID for development
    }

    const url = `/Order/CheckVendorOrderDeletionImpact`;
    const response = await Instense.get(url, {
      params: { orderId, tenantId: tenantID },
    });

    return response.data;
  };

  public static DeleteVendorOrder = async (
    orderId: number
  ): Promise<any> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    let tenantID = storage?.tenantID || 0;
    
    // For development: if tenantID is not set, use a default value
    if (tenantID === 0 && process.env.NODE_ENV === 'development') {
      tenantID = 1; // Default tenant ID for development
    }

    // Use vendor-specific endpoint (backend has separate VendorOrders table)
    const url = `/Order/DeleteVendorOrder`;
    const response = await Instense.delete(url, {
      params: { orderId, tenantId: tenantID },
    });

    const result = response.data.result;
    return result;
  };
}

export {};
