import Instense from "./Axios-config";
import { formatDateOnlyFromApi, toDateOnlyApiString } from "../Utils/Formatting";

export interface PriceBreakdownMatrix {
  quantities: number[]; // Quantity values for column headers (e.g., [1, 5, 10, 25])
  breakdownPrices: Array<{
    priceBreakdownId: number;
    itemName: string;
    prices: number[]; // One price per quantity column
  }>;
  includeInPrint?: boolean[]; // One flag per quantity column (all default off)
}

export type DiscountType = "Percent" | "Amount";

export interface QuotationAttachment {
  id: number;
  name: string;
  size: number;
  fileUrl?: string;
  fileUniqueno?: number;
  uploadFile?: string;
  pageNo?: string;
  createdBy?: number;
  isPending?: boolean;
  localUrl?: string;
  file?: File;
  fileCode?: string;
  contentType?: string;
}

export interface QuotationComment {
  id: number;
  text: string;
  createdAt: string;
  createdBy: string;
}

export interface QuotationMaster {
  orderID: number;
  quotationNumber: number;
  customerID: number;
  customerCode: string;
  customerName: string;
  orderDate: string;
  totalAmount: number;
  status: string;
  customerRefNo: string;
  isConverted: number;
  convertedOrderId?: number;
  /** Display CO# — CustomerOrder.PONumber for convertedOrderId */
  convertedOrderNumber?: number | null;
  locationId?: number;
  Attachments?: QuotationAttachment[];
  Comments?: QuotationComment[];
}

export interface QuotationDetail {
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
}

export interface QuotationMasterReq {
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
  CustomerRefNo: string;
  LocationId?: number;
  convertedOrderId?: number;
  convertedOrderNumber?: number | null;
  Details: QuotationDetailReq[];
  Attachments?: QuotationAttachment[];
  /** Existing attachment DB IDs removed in the UI and pending deletion on save. */
  DeletedAttachmentIds?: number[];
  Comments?: QuotationComment[];
}

export interface VendorQuotationMaster {
  orderID: number;
  quotationNumber: number;
  vendorID: number;
  vendorCode: string;
  vendorName: string;
  orderDate: string;
  totalAmount: number;
  status: string;
  vendorRefNo: string;
  isConverted: number;
  convertedOrderId?: number;
  locationId?: number;
  quotationType?: string;
  parentQuotationID?: number;
  Attachments?: QuotationAttachment[];
  Comments?: QuotationComment[];
}

export interface VendorQuotationDetail {
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
}

export interface VendorQuotationMasterReq {
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
  QuotationType?: string;
  LocationId?: number;
  convertedOrderId?: number;
  ParentQuotationID?: number;
  AdditionalNotes?: string;
  Details: QuotationDetailReq[];
  Attachments?: QuotationAttachment[];
  Comments?: QuotationComment[];
}

export interface QuotationDetailReq {
  ID: number;
  ItemNo: number;
  PartName: string; // Item Name / Part Description - stored in itemname/partname database column
  PartNo: string; // Part/Job No - stored in PartNo database column
  DueDate: string;
  JobNumber: string;
  JobDesc: string;
  QtyOrdered: number;
  Unit: string;
  UnitPrice: number; // Default unit price (used when no tiers defined)
  JobPriority: number;
  Discount: number;
  DiscountType?: DiscountType;
  ProductId?: number;
  RawMaterialId?: number;
  LineType?: string;
  LeadTime: string;
  Notes: string;
  /** Expense GL account id (as string) or account code */
  glcode?: string;
  PriceBreakdownMatrix?: PriceBreakdownMatrix; // Combined quantity tiers and price breakdown grid
  Attachments?: QuotationAttachment[]; // Attachments for this line item
}

export class QuotationService {
  public static GetQuotations = async (
    request: { tenantid: number; locationId?: number }
  ): Promise<QuotationMaster[] | null> => {
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

    const url = `/Quotation/GetQuotations`;
    const params: Record<string, number> = { tenantid: tenantID };
    if (request.locationId && request.locationId > 0) {
      params.locationId = request.locationId;
    }
    return Instense.get(url, { params }).then((response) => {
      const result = response.data.result as QuotationMaster[];
      return result;
    });
  };

  public static GetQuotationById = async (
    quotationId: number
  ): Promise<QuotationMasterReq | null> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    let tenantID = storage?.tenantID || 0;
    
    // For development: if tenantID is not set, use a default value
    if (tenantID === 0 && process.env.NODE_ENV === 'development') {
      tenantID = 1; // Default tenant ID for development
    }

    const url = `/Quotation/GetQuotationById`;
    return Instense.get(url, {
      params: { quotationId, tenantId: tenantID },
    }).then((response) => {
      const result = response.data.result as any;
      
      // Format dates (calendar parts only — no timezone shift)
      const formatDate = (dateStr: string | null | undefined): string =>
        formatDateOnlyFromApi(dateStr);

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
        CustomerRefNo: result.customerRefNo || "",
        LocationId: result.locationId,
        convertedOrderId: result.convertedOrderId,
        convertedOrderNumber: result.convertedOrderNumber ?? null,
        Attachments: (() => {
          console.log("Processing attachments from result:", result.attachments, result.Attachments);
          const mapAttachment = (a: any) => ({
            id: a.id || a.Id || 0,
            name: a.name || a.Name || "",
            size: a.size || a.Size || 0,
            fileUrl: a.fileUrl || a.FileUrl || a.uploadFile || a.UploadFile || "",
            fileUniqueno: a.fileUniqueno || a.FileUniqueno || 0,
            uploadFile: a.uploadFile || a.UploadFile || a.fileUrl || a.FileUrl || "",
            pageNo: a.pageNo || a.PageNo || a.pageno || "0",
            createdBy: a.createdBy || a.CreatedBy || a.createdby || 0,
          });
          if (Array.isArray(result.attachments) && result.attachments.length > 0) {
            const mapped = result.attachments.map(mapAttachment);
            console.log("Mapped attachments from result.attachments:", mapped);
            return mapped;
          } else if (Array.isArray(result.Attachments) && result.Attachments.length > 0) {
            const mapped = result.Attachments.map(mapAttachment);
            console.log("Mapped attachments from result.Attachments:", mapped);
            return mapped;
          }
          console.log("No attachments found in result");
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
          DiscountType: (d.discountType === "Amount" ? "Amount" : "Percent") as DiscountType,
          ProductId: d.productId,
          LeadTime: d.leadTime || "",
          Notes: d.notes || "",
          PriceBreakdownMatrix: d.priceBreakdownMatrix ? {
            quantities: d.priceBreakdownMatrix.quantities || d.priceBreakdownMatrix.Quantities || [],
            breakdownPrices: (d.priceBreakdownMatrix.breakdownPrices || d.priceBreakdownMatrix.BreakdownPrices || []).map((bp: any) => ({
              priceBreakdownId: bp.priceBreakdownId || bp.PriceBreakdownId || 0,
              itemName: bp.itemName || bp.ItemName || "",
              prices: bp.prices || bp.Prices || [],
            })),
            includeInPrint: d.priceBreakdownMatrix.includeInPrint || d.priceBreakdownMatrix.IncludeInPrint || undefined,
          } : undefined
        }))
      } as QuotationMasterReq;
    });
  };

  public static SaveQuotation = async (
    request: QuotationMasterReq,
    newFiles: File[] = []
  ): Promise<{ id: number; poNumber?: number; message: string; attachments?: QuotationAttachment[] }> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    let tenantID = storage?.tenantID || 0;
    
    // For development: if tenantID is not set, use a default value
    if (tenantID === 0 && process.env.NODE_ENV === 'development') {
      tenantID = 1; // Default tenant ID for development
    }

    request.Tenantid = tenantID;

    // Convert date strings to date-only yyyy-MM-dd (no timezone shift)
    const convertDate = (dateStr: string): string => toDateOnlyApiString(dateStr);

    const mapAttachmentId = (raw: any): number => {
      let id = 0;
      if (typeof raw === "number") id = Math.floor(raw);
      else if (typeof raw === "string") id = parseInt(raw, 10);
      if (isNaN(id) || !Number.isInteger(id)) id = 0;
      const MAX_INT32 = 2147483647;
      if (id > MAX_INT32) id = id % MAX_INT32;
      if (id < 0) id = 0;
      return id;
    };

    // Existing attachments only (no pending File blobs in JSON). New files go in multipart.
    const existingAttachments = (request.Attachments || []).filter(
      (a) => !a.isPending && !a.file
    );

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
      CustomerRefNo: request.CustomerRefNo || "",
      LocationId: request.LocationId || null,
      Details: (request.Details || []).map(d => ({
        ID: d.ID || 0,
        ItemNo: d.ItemNo || 0,
        PartName: d.PartName || "",
        PartNo: d.PartNo || "",
        DueDate: convertDate(d.DueDate || d.LeadTime || ""),
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
        PriceBreakdownMatrix: d.PriceBreakdownMatrix ? {
          Quantities: d.PriceBreakdownMatrix.quantities || [],
          BreakdownPrices: (d.PriceBreakdownMatrix.breakdownPrices || []).map((bp: any) => ({
            PriceBreakdownId: bp.priceBreakdownId || 0,
            ItemName: bp.itemName || "",
            Prices: bp.prices || []
          })),
          IncludeInPrint: d.PriceBreakdownMatrix.includeInPrint || []
        } : null
      })),
      Attachments: existingAttachments.map(a => ({
        Id: mapAttachmentId(a.id),
        Name: a.name || "",
        Size: a.size || 0,
        FileUrl: a.fileUrl || a.uploadFile || "",
        FileUniqueno: a.fileUniqueno || 0,
        UploadFile: a.uploadFile || a.fileUrl || "",
        PageNo: a.pageNo || "0",
        CreatedBy: a.createdBy || 0
      })),
      DeletedAttachmentIds: (request.DeletedAttachmentIds || [])
        .map(mapAttachmentId)
        .filter((id) => id > 0),
      Comments: (request.Comments || []).map(c => ({
        Id: mapAttachmentId(c.id),
        Text: c.text || "",
        CreatedAt: c.createdAt || new Date().toISOString(),
        CreatedBy: c.createdBy || "User"
      }))
    };

    const cleanPayload = JSON.parse(JSON.stringify(payload, (key, value) => {
      if (value === undefined) {
        return null;
      }
      if (key === 'Id' && typeof value === 'number' && !Number.isInteger(value)) {
        return Math.floor(value);
      }
      return value;
    }));

    const formData = new FormData();
    formData.append("formField", JSON.stringify(cleanPayload));
    (newFiles || []).forEach((file) => {
      formData.append("file", file);
    });

    const url = `/Quotation/SaveQuotation`;
    return Instense.post(url, formData).then((response) => {
      const result = response.data.result;
      if (result && result.id) {
        const attachments = Array.isArray(result.attachments)
          ? result.attachments.map((a: any) => ({
              id: a.id || a.Id || 0,
              name: a.name || a.Name || "",
              size: a.size || a.Size || 0,
              fileUrl: a.fileUrl || a.FileUrl || a.uploadFile || a.UploadFile || "",
              fileUniqueno: a.fileUniqueno || a.FileUniqueno || 0,
              uploadFile: a.uploadFile || a.UploadFile || "",
              pageNo: a.pageNo || a.PageNo || "0",
              createdBy: a.createdBy || a.CreatedBy || 0,
            }))
          : undefined;
        return {
          id: result.id,
          poNumber: result.poNumber,
          message: result.message || "Quotation saved successfully",
          attachments,
        };
      }
      return { id: request.OrderID || 0, message: "Quotation saved successfully" };
    }).catch((error) => {
      console.error("Error in SaveQuotation:", error);
      console.error("Request payload was:", cleanPayload);
      if (error.response) {
        console.error("Error response data:", error.response.data);
        console.error("Error response status:", error.response.status);
      }
      if (error.response?.data?.error) {
        console.error("Backend error message:", error.response.data.error);
      }
      throw error;
    });
  };

  public static QuotationSaveFile = async (
    orderId: number,
    files: File[]
  ): Promise<QuotationAttachment[]> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    let tenantID = storage?.tenantID || 0;
    if (tenantID === 0 && process.env.NODE_ENV === "development") {
      tenantID = 1;
    }

    const formData = new FormData();
    files.forEach((file) => {
      formData.append("file", file);
    });
    formData.append(
      "formField",
      JSON.stringify({
        OrderId: orderId,
        OrderID: orderId,
        TenantId: tenantID,
        TenantID: tenantID,
        Tenantid: tenantID,
      })
    );
    formData.append("orderId", String(orderId));
    formData.append("tenantId", String(tenantID));

    const url = `/Quotation/QuotationSaveFile`;
    return Instense.post(url, formData).then((response) => {
      const result = response.data.result;
      const attachments = result?.attachments || [];
      return attachments.map((a: any) => ({
        id: a.id || a.Id || 0,
        name: a.name || a.Name || "",
        size: a.size || a.Size || 0,
        fileUrl: a.fileUrl || a.FileUrl || a.uploadFile || a.UploadFile || "",
        fileUniqueno: a.fileUniqueno || a.FileUniqueno || 0,
        uploadFile: a.uploadFile || a.UploadFile || "",
        pageNo: a.pageNo || a.PageNo || "0",
        createdBy: a.createdBy || a.CreatedBy || 0,
      }));
    });
  };

  public static GetQuotationUploadFileWithFileCode = async (
    orderId: number
  ): Promise<Array<QuotationAttachment & { fileCode?: string; contentType?: string }>> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    let tenantID = storage?.tenantID || 0;
    if (tenantID === 0 && process.env.NODE_ENV === "development") {
      tenantID = 1;
    }

    const url = `/Quotation/GetQuotationUploadFileWithFileCode`;
    return Instense.get(url, {
      params: { orderId, tenantId: tenantID },
    }).then((response) => {
      const result = response.data.result || [];
      return result.map((a: any) => ({
        id: a.id || a.Id || 0,
        name: a.name || a.Name || "",
        size: a.size || a.Size || 0,
        fileUrl: a.uploadFile || a.UploadFile || "",
        fileUniqueno: a.fileUniqueno || a.FileUniqueno || 0,
        uploadFile: a.uploadFile || a.UploadFile || "",
        pageNo: a.pageNo || a.PageNo || a.pageno || "0",
        createdBy: a.createdby || a.createdBy || 0,
        fileCode: a.fileCode || a.FileCode || "",
        contentType: a.contentType || a.ContentType || "",
      }));
    });
  };

  /**
   * Single-file binary fetch for the document viewer (no base64).
   * Returns a Blob suitable for createObjectURL / react-pdf.
   */
  public static GetQuotationAttachmentFile = async (request: {
    orderId: number;
    fileUniqueno: number;
    signal?: AbortSignal;
  }): Promise<{ blob: Blob; contentType: string; fileName?: string }> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    let tenantID = storage?.tenantID || 0;
    if (tenantID === 0 && process.env.NODE_ENV === "development") {
      tenantID = 1;
    }

    const url = `/Quotation/GetQuotationAttachmentFile`;
    return Instense.get(url, {
      params: {
        orderId: request.orderId,
        fileUniqueno: request.fileUniqueno,
        tenantId: tenantID,
        download: false,
      },
      responseType: "blob",
      signal: request.signal,
    }).then((response: any) => {
      const blob: Blob = response.data;
      const headerType =
        (response.headers && (response.headers["content-type"] || response.headers["Content-Type"])) ||
        "";
      const contentType =
        (typeof headerType === "string" && headerType.split(";")[0].trim()) ||
        blob.type ||
        "application/octet-stream";
      const fileNameHeader =
        response.headers?.["x-file-name"] || response.headers?.["X-File-Name"] || undefined;
      return { blob, contentType, fileName: fileNameHeader };
    });
  };

  public static DownloadQuotationAttachment = async (request: {
    orderId: number;
    fileUniqueno: number;
    name: string;
    uploadFile?: string;
    /** Optional cached blob URL to avoid a second Azure download. */
    cachedBlobUrl?: string;
  }): Promise<void> => {
    if (request.cachedBlobUrl) {
      const link = document.createElement("a");
      link.href = request.cachedBlobUrl;
      link.setAttribute("download", request.name);
      link.click();
      return;
    }

    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    let tenantID = storage?.tenantID || 0;
    if (tenantID === 0 && process.env.NODE_ENV === "development") {
      tenantID = 1;
    }

    const url = `/Quotation/GetQuotationAttachmentFile`;
    return Instense.get(url, {
      params: {
        orderId: request.orderId,
        fileUniqueno: request.fileUniqueno,
        tenantId: tenantID,
        download: true,
      },
      responseType: "blob",
    }).then((response: any) => {
      const blobUrl = window.URL.createObjectURL(response.data);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.setAttribute("download", request.name);
      link.click();
      window.URL.revokeObjectURL(blobUrl);
    });
  };

  public static DeleteQuotationUploadedFile = async (request: {
    orderId: number;
    fileUniqueno: number;
  }): Promise<void> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    let tenantID = storage?.tenantID || 0;
    if (tenantID === 0 && process.env.NODE_ENV === "development") {
      tenantID = 1;
    }

    const url = `/Quotation/DeleteQuotationUploadedFile`;
    return Instense.post(url, {
      OrderId: request.orderId,
      TenantId: tenantID,
      FileUniqueno: request.fileUniqueno,
    }).then(() => undefined);
  };

  public static CheckQuotationDeletionImpact = async (
    quotationId: number
  ): Promise<any> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    let tenantID = storage?.tenantID || 0;
    
    // For development: if tenantID is not set, use a default value
    if (tenantID === 0 && process.env.NODE_ENV === 'development') {
      tenantID = 1; // Default tenant ID for development
    }

    const url = `/Quotation/CheckQuotationDeletionImpact`;
    return Instense.get(url, {
      params: { quotationId, tenantId: tenantID },
    }).then((response) => {
      return response.data;
    });
  };

  public static DuplicateQuotation = async (
    quotationId: number
  ): Promise<{ id: number; message: string }> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    let tenantID = storage?.tenantID || 0;
    if (tenantID === 0 && process.env.NODE_ENV === "development") {
      tenantID = 1;
    }

    const url = `/Quotation/DuplicateQuotation`;
    return Instense.post(url, null, {
      params: { quotationId, tenantId: tenantID },
    }).then((response) => {
      const result = response.data.result;
      return {
        id: result?.id || 0,
        message: result?.message || "Quotation duplicated successfully",
      };
    });
  };

  public static CopyAttachmentsToOrder = async (
    quotationId: number,
    orderId: number,
    attachmentIds: number[]
  ): Promise<{ count: number }> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    let tenantID = storage?.tenantID || 0;
    if (tenantID === 0 && process.env.NODE_ENV === "development") {
      tenantID = 1;
    }

    const url = `/Quotation/CopyAttachmentsToOrder`;
    return Instense.post(
      url,
      { AttachmentIds: attachmentIds },
      { params: { quotationId, orderId, tenantId: tenantID } }
    ).then((response) => {
      const result = response.data.result;
      return { count: result?.count || 0 };
    });
  };

  public static DeleteQuotation = async (
    quotationId: number
  ): Promise<any> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    let tenantID = storage?.tenantID || 0;
    
    // For development: if tenantID is not set, use a default value
    if (tenantID === 0 && process.env.NODE_ENV === 'development') {
      tenantID = 1; // Default tenant ID for development
    }

    const url = `/Quotation/DeleteQuotation`;
    return Instense.delete(url, {
      params: { quotationId, tenantId: tenantID },
    }).then((response) => {
      const result = response.data.result;
      return result;
    });
  };

  public static CheckVendorQuotationDeletionImpact = async (
    quotationId: number
  ): Promise<any> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    let tenantID = storage?.tenantID || 0;
    
    // For development: if tenantID is not set, use a default value
    if (tenantID === 0 && process.env.NODE_ENV === 'development') {
      tenantID = 1; // Default tenant ID for development
    }

    const url = `/Quotation/CheckVendorQuotationDeletionImpact`;
    return Instense.get(url, {
      params: { quotationId, tenantId: tenantID },
    }).then((response) => {
      return response.data;
    });
  };

  public static GetVendorQuotations = async (
    request: { tenantid: number }
  ): Promise<VendorQuotationMaster[] | null> => {
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

    const url = `/Quotation/GetVendorQuotations`;
    return Instense.get(url, {
      params: { tenantid: tenantID },
    }).then((response) => {
      const result = response.data.result as VendorQuotationMaster[];
      return result;
    });
  };

  public static GetVendorQuotationById = async (
    quotationId: number,
    tenantId?: number
  ): Promise<VendorQuotationMasterReq | null> => {
    // If tenantId is not provided, try to get it from storage (regular or vendor)
    let tenantID = tenantId;
    if (tenantID === undefined) {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
      tenantID = storage?.tenantID || 0;
    }

    const url = `/Quotation/GetVendorQuotationById`;
    return Instense.get(url, {
      params: { quotationId, tenantId: tenantID },
    }).then((response) => {
      const result = response.data.result as any;
      
      // Format dates for display (MM/DD/YY) - used for DueDate in line items
      const formatDate = (dateStr: string | null | undefined | Date): string => {
        if (!dateStr) return "";
        try {
          let date: Date;
          if (dateStr instanceof Date) {
            date = dateStr;
          } else if (typeof dateStr === 'string') {
            // Handle various date string formats
            const dateStrTrimmed = dateStr.trim();
            if (dateStrTrimmed === "" || dateStrTrimmed === "null" || dateStrTrimmed === "undefined") {
              return "";
            }
            date = new Date(dateStrTrimmed);
            // Check if date is valid
            if (isNaN(date.getTime())) {
              return "";
            }
          } else {
            return "";
          }
          const month = String(date.getMonth() + 1).padStart(2, '0');
          const day = String(date.getDate()).padStart(2, '0');
          const year = String(date.getFullYear()).slice(-2);
          return `${month}/${day}/${year}`;
        } catch (e) {
          console.warn("Error formatting date:", dateStr, e);
          return "";
        }
      };

      // Format dates for HTML date inputs (yyyy-MM-dd) - used for OrderDate and ExternalOrderDate
      const formatDateForInput = (dateStr: string | null | undefined | Date): string => {
        if (!dateStr) return "";
        try {
          let date: Date;
          if (dateStr instanceof Date) {
            date = dateStr;
          } else if (typeof dateStr === 'string') {
            // Handle various date string formats
            const dateStrTrimmed = dateStr.trim();
            if (dateStrTrimmed === "" || dateStrTrimmed === "null" || dateStrTrimmed === "undefined") {
              return "";
            }
            // If already in yyyy-MM-dd format, return as is
            if (/^\d{4}-\d{2}-\d{2}$/.test(dateStrTrimmed)) {
              return dateStrTrimmed;
            }
            date = new Date(dateStrTrimmed);
            // Check if date is valid
            if (isNaN(date.getTime())) {
              return "";
            }
          } else {
            return "";
          }
          const year = String(date.getFullYear());
          const month = String(date.getMonth() + 1).padStart(2, '0');
          const day = String(date.getDate()).padStart(2, '0');
          return `${year}-${month}-${day}`;
        } catch (e) {
          console.warn("Error formatting date for input:", dateStr, e);
          return "";
        }
      };

      // Map details array
      const details: QuotationDetailReq[] = (result.Details || result.details || []).map((d: any) => {
        // Parse dueDate - handle various formats
        let dueDateStr = "";
        if (d.dueDate) {
          dueDateStr = formatDate(d.dueDate);
          // If formatting failed, try to get a default date
          if (!dueDateStr) {
            dueDateStr = formatDate(new Date().toISOString());
          }
        } else {
          dueDateStr = formatDate(new Date().toISOString());
        }
        
        return {
          ID: d.id || d.ID || 0,
          ItemNo: d.itemNo || d.ItemNo || 0,
          PartName: d.partName || d.PartName || "",
          PartNo: d.partNo || d.PartNo || "",
          DueDate: dueDateStr,
          JobNumber: d.jobNumber || d.JobNumber || "",
          JobDesc: d.jobDesc || d.JobDesc || "",
          QtyOrdered: d.qtyOrdered || d.QtyOrdered || 0,
          Unit: d.unit || d.Unit || "EA",
          UnitPrice: d.unitPrice || d.UnitPrice || 0,
          JobPriority: d.jobPriority || d.JobPriority || 0,
          Discount: d.discount || d.Discount || 0,
          DiscountType: ((d.discountType || d.DiscountType) === "Amount" ? "Amount" : "Percent") as DiscountType,
          ProductId: d.productId || d.ProductId,
          RawMaterialId: d.rawMaterialId || d.RawMaterialId,
          LineType: d.lineType || d.LineType,
          LeadTime: d.leadTime || d.LeadTime || "",
          Notes: d.notes || d.Notes || "",
          glcode: d.glcode || d.Glcode || "",
          Attachments: d.attachments ? d.attachments.map((a: any) => ({
            id: a.id || a.Id || 0,
            name: a.name || a.Name || "",
            size: a.size || a.Size || 0,
            fileUrl: a.fileUrl || a.FileUrl || ""
          })) : undefined,
        };
      });

      return {
        OrderID: result.OrderID || result.orderID || 0,
        Tenantid: result.Tenantid || result.tenantid || tenantID,
        VendorID: result.VendorID || result.vendorID || 0,
        VendorCode: result.VendorCode || result.vendorCode || "",
        PONumber: result.PONumber || result.poNumber || 0,
        VendorName: result.VendorName || result.vendorName || "",
        Address: result.Address || result.address || "",
        VendorPoNumber: result.VendorPoNumber || result.vendorPoNumber || "",
        OrderDate: result.OrderDate ? formatDateForInput(result.OrderDate) : formatDateForInput(new Date().toISOString()),
        TotalAmount: result.TotalAmount || result.totalAmount || 0,
        UserId: result.UserId || result.userId || 0,
        UserToken: result.UserToken || result.userToken || 0,
        Status: result.Status || result.status || "Draft",
        ShippingInstructions: result.ShippingInstructions || result.shippingInstructions || "",
        ExternalVendorPO: result.ExternalVendorPO || result.externalVendorPO || "",
        ExternalOrderDate: result.ExternalOrderDate ? formatDateForInput(result.ExternalOrderDate) : undefined,
        BuyerName: result.BuyerName || result.buyerName || "",
        VendorRefNo: result.VendorRefNo || result.vendorRefNo || "",
        QuotationType: result.QuotationType || result.quotationType || "Material",
        LocationId: result.LocationId || result.locationId,
        convertedOrderId: result.convertedOrderId,
        ParentQuotationID: result.ParentQuotationID || result.parentQuotationID,
        Details: details,
        Attachments: result.Attachments || result.attachments || [],
        Comments: result.Comments || result.comments || [],
      };
    });
  };

  public static SaveVendorQuotation = async (
    request: VendorQuotationMasterReq
  ): Promise<{ id: number; message: string }> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    let tenantID = storage?.tenantID || 0;
    
    // For development: if tenantID is not set, use a default value
    if (tenantID === 0 && process.env.NODE_ENV === 'development') {
      tenantID = 1; // Default tenant ID for development
    }

    request.Tenantid = tenantID;
    request.UserId = storage?.userId || 0;
    request.UserToken = storage?.userToken || 0;

    const url = `/Quotation/SaveVendorQuotation`;
    return Instense.post(url, request).then((response) => {
      const result = response.data.result;
      // Return the result which contains the id
      if (result && result.id) {
        return { id: result.id, message: result.message || "Vendor quotation saved successfully" };
      }
      // Fallback if response structure is different (backend returns string or different format)
      return { id: request.OrderID || 0, message: typeof result === 'string' ? result : "Vendor quotation saved successfully" };
    });
  };

  public static DeleteVendorQuotation = async (
    quotationId: number
  ): Promise<any> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    let tenantID = storage?.tenantID || 0;
    
    // For development: if tenantID is not set, use a default value
    if (tenantID === 0 && process.env.NODE_ENV === 'development') {
      tenantID = 1; // Default tenant ID for development
    }

    const url = `/Quotation/DeleteVendorQuotation`;
    return Instense.delete(url, {
      params: { quotationId, tenantId: tenantID },
    }).then((response) => {
      const result = response.data.result;
      return result;
    });
  };

  public static ConvertVendorQuotationToOrder = async (
    quotationId: number,
    request: VendorQuotationMasterReq
  ): Promise<any> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    let tenantID = storage?.tenantID || 0;
    
    // For development: if tenantID is not set, use a default value
    if (tenantID === 0 && process.env.NODE_ENV === 'development') {
      tenantID = 1; // Default tenant ID for development
    }

    request.Tenantid = tenantID;
    request.UserId = storage?.userId || 0;
    request.UserToken = storage?.userToken || 0;

    const url = `/Quotation/ConvertVendorQuotationToOrder`;
    return Instense.post(url, { quotationId, ...request }).then((response) => {
      const result = response.data.result;
      return result;
    });
  };

  public static DuplicateVendorQuotationForVendors = async (
    sourceQuotationId: number,
    vendorIDs: number[],
    includeAttachments: boolean = false
  ): Promise<{ quotationIds: number[]; message: string }> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    let tenantID = storage?.tenantID || 0;
    
    // For development: if tenantID is not set, use a default value
    if (tenantID === 0 && process.env.NODE_ENV === 'development') {
      tenantID = 1; // Default tenant ID for development
    }

    const url = `/Quotation/DuplicateVendorQuotationForVendors`;
    return Instense.post(url, {
      SourceQuotationId: sourceQuotationId,
      Tenantid: tenantID,
      VendorIDs: vendorIDs,
      IncludeAttachments: includeAttachments,
    }).then((response) => {
      const result = response.data.result;
      return result;
    });
  };

  public static GetVendorQuotationComparison = async (
    parentQuotationId: number
  ): Promise<{
    parentQuotationId: number;
    quotations: any[];
    details: any[];
  } | null> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    let tenantID = storage?.tenantID || 0;
    
    // For development: if tenantID is not set, use a default value
    if (tenantID === 0 && process.env.NODE_ENV === 'development') {
      tenantID = 1; // Default tenant ID for development
    }

    const url = `/Quotation/GetVendorQuotationComparison`;
    return Instense.get(url, {
      params: { parentQuotationId, tenantId: tenantID },
    }).then((response) => {
      const result = response.data.result;
      return result;
    });
  };

  public static GetVendorQuotationsByVendorCode = async (
    vendorCode: string
  ): Promise<VendorQuotationMaster[] | null> => {
    const url = `/Quotation/GetVendorQuotationsByVendorCode`;
    return Instense.get(url, {
      params: { vendorCode },
    }).then((response) => {
      const result = response.data.result;
      return result;
    });
  };
}

export {};

