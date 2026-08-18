import api from "./apiClient";
import { AuthService } from "./authService";

export interface QuotationAttachment {
  id: number;
  name: string;
  size: number;
  fileUrl?: string;
}

export interface QuotationDetailReq {
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
  DiscountType?: "Amount" | "Percent";
  ProductId?: number;
  LeadTime: string;
  Notes: string;
  glcode?: string;
  Attachments?: QuotationAttachment[];
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
}

function formatDateMmDdYy(dateStr: string | null | undefined | Date): string {
  if (!dateStr) return "";
  try {
    const date = dateStr instanceof Date ? dateStr : new Date(String(dateStr).trim());
    if (Number.isNaN(date.getTime())) return "";
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const year = String(date.getFullYear()).slice(-2);
    return `${month}/${day}/${year}`;
  } catch {
    return "";
  }
}

function formatDateForInput(dateStr: string | null | undefined | Date): string {
  if (!dateStr) return "";
  try {
    if (typeof dateStr === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateStr.trim())) {
      return dateStr.trim();
    }
    const date = dateStr instanceof Date ? dateStr : new Date(String(dateStr).trim());
    if (Number.isNaN(date.getTime())) return "";
    const year = String(date.getFullYear());
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  } catch {
    return "";
  }
}

export class QuotationService {
  public static async getVendorQuotationsByVendorCode(
    vendorCode: string
  ): Promise<VendorQuotationMaster[]> {
    const { data } = await api.get("/Quotation/GetVendorQuotationsByVendorCode", {
      params: { vendorCode },
    });
    const result = data.result;
    if (!Array.isArray(result)) return [];
    return result.map((q: Record<string, unknown>) => ({
      orderID: Number(q.orderID ?? q.OrderID ?? 0),
      quotationNumber: Number(q.quotationNumber ?? q.QuotationNumber ?? q.poNumber ?? q.PONumber ?? 0),
      vendorID: Number(q.vendorID ?? q.VendorID ?? 0),
      vendorCode: String(q.vendorCode ?? q.VendorCode ?? ""),
      vendorName: String(q.vendorName ?? q.VendorName ?? ""),
      orderDate: String(q.orderDate ?? q.OrderDate ?? ""),
      totalAmount: Number(q.totalAmount ?? q.TotalAmount ?? 0),
      status: String(q.status ?? q.Status ?? ""),
      vendorRefNo: String(q.vendorRefNo ?? q.VendorRefNo ?? ""),
      isConverted: Number(q.isConverted ?? q.IsConverted ?? 0),
      convertedOrderId: (q.convertedOrderId ?? q.ConvertedOrderId) as number | undefined,
      locationId: (q.locationId ?? q.LocationId) as number | undefined,
      quotationType: (q.quotationType ?? q.QuotationType) as string | undefined,
      parentQuotationID: (q.parentQuotationID ?? q.ParentQuotationID) as number | undefined,
    }));
  }

  public static async getVendorQuotationById(
    quotationId: number,
    tenantId?: number
  ): Promise<VendorQuotationMasterReq | null> {
    const tenantID = tenantId ?? AuthService.getTenantId();
    const { data } = await api.get("/Quotation/GetVendorQuotationById", {
      params: { quotationId, tenantId: tenantID },
    });
    const result = data.result as Record<string, unknown> | null;
    if (!result) return null;

    const rawDetails = (result.Details ?? result.details ?? []) as Record<string, unknown>[];
    const details: QuotationDetailReq[] = rawDetails.map((d) => {
      let dueDateStr = "";
      if (d.dueDate || d.DueDate) {
        dueDateStr = formatDateMmDdYy((d.dueDate ?? d.DueDate) as string);
      }
      if (!dueDateStr) {
        dueDateStr = formatDateMmDdYy(new Date().toISOString());
      }
      const attachmentsRaw = (d.attachments ?? d.Attachments) as Record<string, unknown>[] | undefined;
      return {
        ID: Number(d.id ?? d.ID ?? 0),
        ItemNo: Number(d.itemNo ?? d.ItemNo ?? 0),
        PartName: String(d.partName ?? d.PartName ?? ""),
        PartNo: String(d.partNo ?? d.PartNo ?? ""),
        DueDate: dueDateStr,
        JobNumber: String(d.jobNumber ?? d.JobNumber ?? ""),
        JobDesc: String(d.jobDesc ?? d.JobDesc ?? ""),
        QtyOrdered: Number(d.qtyOrdered ?? d.QtyOrdered ?? 0),
        Unit: String(d.unit ?? d.Unit ?? "EA"),
        UnitPrice: Number(d.unitPrice ?? d.UnitPrice ?? 0),
        JobPriority: Number(d.jobPriority ?? d.JobPriority ?? 0),
        Discount: Number(d.discount ?? d.Discount ?? 0),
        DiscountType: ((d.discountType ?? d.DiscountType) === "Amount" ? "Amount" : "Percent") as
          | "Amount"
          | "Percent",
        ProductId: (d.productId ?? d.ProductId) as number | undefined,
        LeadTime: String(d.leadTime ?? d.LeadTime ?? ""),
        Notes: String(d.notes ?? d.Notes ?? ""),
        glcode: String(d.glcode ?? d.Glcode ?? ""),
        Attachments: attachmentsRaw
          ? attachmentsRaw.map((a) => ({
              id: Number(a.id ?? a.Id ?? 0),
              name: String(a.name ?? a.Name ?? ""),
              size: Number(a.size ?? a.Size ?? 0),
              fileUrl: String(a.fileUrl ?? a.FileUrl ?? ""),
            }))
          : undefined,
      };
    });

    const orderDate = (result.OrderDate ?? result.orderDate) as string | undefined;
    const externalOrderDate = (result.ExternalOrderDate ?? result.externalOrderDate) as string | undefined;

    return {
      OrderID: Number(result.OrderID ?? result.orderID ?? 0),
      Tenantid: Number(result.Tenantid ?? result.tenantid ?? tenantID ?? 0),
      VendorID: Number(result.VendorID ?? result.vendorID ?? 0),
      VendorCode: String(result.VendorCode ?? result.vendorCode ?? ""),
      PONumber: Number(result.PONumber ?? result.poNumber ?? 0),
      VendorName: String(result.VendorName ?? result.vendorName ?? ""),
      Address: String(result.Address ?? result.address ?? ""),
      VendorPoNumber: String(result.VendorPoNumber ?? result.vendorPoNumber ?? ""),
      OrderDate: orderDate ? formatDateForInput(orderDate) : formatDateForInput(new Date().toISOString()),
      TotalAmount: Number(result.TotalAmount ?? result.totalAmount ?? 0),
      UserId: Number(result.UserId ?? result.userId ?? 0),
      UserToken: Number(result.UserToken ?? result.userToken ?? 0),
      Status: String(result.Status ?? result.status ?? "Draft"),
      ShippingInstructions: String(result.ShippingInstructions ?? result.shippingInstructions ?? ""),
      ExternalVendorPO: String(result.ExternalVendorPO ?? result.externalVendorPO ?? ""),
      ExternalOrderDate: externalOrderDate ? formatDateForInput(externalOrderDate) : undefined,
      BuyerName: String(result.BuyerName ?? result.buyerName ?? ""),
      VendorRefNo: String(result.VendorRefNo ?? result.vendorRefNo ?? ""),
      QuotationType: String(result.QuotationType ?? result.quotationType ?? "Material"),
      LocationId: (result.LocationId ?? result.locationId) as number | undefined,
      convertedOrderId: result.convertedOrderId as number | undefined,
      ParentQuotationID: (result.ParentQuotationID ?? result.parentQuotationID) as number | undefined,
      Details: details,
      Attachments: ((result.Attachments ?? result.attachments ?? []) as Record<string, unknown>[]).map((a) => ({
        id: Number(a.id ?? a.Id ?? 0),
        name: String(a.name ?? a.Name ?? ""),
        size: Number(a.size ?? a.Size ?? 0),
        fileUrl: String(a.fileUrl ?? a.FileUrl ?? a.uploadFile ?? a.UploadFile ?? ""),
      })),
    };
  }

  public static async saveVendorQuotation(
    request: VendorQuotationMasterReq
  ): Promise<{ id: number; message: string }> {
    const storage = AuthService.getStorage();
    const payload: VendorQuotationMasterReq = {
      ...request,
      Tenantid: storage?.tenantID || request.Tenantid || 0,
      UserId: storage?.userId || request.UserId || 0,
      UserToken: request.UserToken || 0,
    };

    const { data } = await api.post("/Quotation/SaveVendorQuotation", payload);
    const result = data.result;
    if (result && result.id) {
      return { id: result.id, message: result.message || "Vendor quotation saved successfully" };
    }
    return {
      id: request.OrderID || 0,
      message: typeof result === "string" ? result : "Vendor quotation saved successfully",
    };
  }
}
