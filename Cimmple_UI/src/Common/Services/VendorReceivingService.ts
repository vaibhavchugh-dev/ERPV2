import Instense from "./Axios-config";

export interface OrderForReceiving {
  orderID: number;
  orderNumber: number;
  vendorID: number;
  vendorCode: string;
  vendorName: string;
  orderDate: string;
  status: string;
  locationId?: number;
  totalItems: number;
  totalOrdered: number;
  totalReceived: number;
  totalPending: number;
}

export interface OrderDetailForReceiving {
  id: number;
  itemNo: number;
  partName: string;
  partNo: string;
  lineType?: string;
  dueDate: string;
  jobNumber: string;
  jobDesc: string;
  jobId?: number;
  productId?: number;
  rawMaterialId?: number;
  qtyOrdered: number;
  receivedQty: number;
  pendingQty: number;
  unit: string;
  unitPrice: number;
  receivedStatus: "Pending" | "Partial" | "Complete";
}

export interface OrderForReceivingDetail {
  orderID: number;
  orderNumber: number;
  vendorID: number;
  vendorCode: string;
  vendorName: string;
  orderDate: string;
  status: string;
  locationId?: number;
  details: OrderDetailForReceiving[];
}

export interface ReceivingTransaction {
  id: number;
  receivedQty: number;
  receivedDate: string;
  receivedBy: number;
  locationId?: number;
  notes: string;
}

export interface ReceiveLineItemRequest {
  orderDetailId: number;
  receivedQty: number;
  receivedDate: string;
  locationId?: number;
  notes?: string;
  lotNumber?: string;
  tenantid: number;
}

export class VendorReceivingService {
  public static GetOrdersForReceiving = async (): Promise<OrderForReceiving[] | null> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    const tenantID = storage?.tenantID || 0;

    const url = `/Order/GetOrdersForReceiving`;
    const response = await Instense.get(url, {
      params: { tenantId: tenantID },
    });

    const result = response.data.result as OrderForReceiving[];
    return result;
  };

  public static GetOrderForReceiving = async (
    orderId: number
  ): Promise<OrderForReceivingDetail | null> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    const tenantID = storage?.tenantID || 0;

    const url = `/Order/GetOrderForReceiving`;
    const response = await Instense.get(url, {
      params: { orderId, tenantId: tenantID },
    });

    const result = response.data.result as OrderForReceivingDetail;
    return result;
  };

  public static ReceiveLineItem = async (
    request: ReceiveLineItemRequest
  ): Promise<{ success: boolean; receivingId?: number; newTotalReceived?: number; message: string }> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    const tenantID = storage?.tenantID || 0;

    const payload = {
      orderDetailId: request.orderDetailId,
      receivedQty: request.receivedQty,
      receivedDate: request.receivedDate || new Date().toISOString(),
      locationId: request.locationId || null,
      notes: request.notes || "",
      lotNumber: request.lotNumber || null,
      tenantid: tenantID,
    };

    const url = `/Order/ReceiveLineItem`;
    const response = await Instense.post(url, payload);

    const result = response.data.result;
    return {
      success: result.success || false,
      receivingId: result.receivingId,
      newTotalReceived: result.newTotalReceived,
      message: result.message || "Items received successfully",
    };
  };

  public static GetReceivingHistory = async (
    orderDetailId: number
  ): Promise<ReceivingTransaction[] | null> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    const tenantID = storage?.tenantID || 0;

    const url = `/Order/GetReceivingHistory`;
    const response = await Instense.get(url, {
      params: { orderDetailId, tenantId: tenantID },
    });

    const result = response.data.result as ReceivingTransaction[];
    return result;
  };

  public static RecalculateVendorOrderStatuses = async (): Promise<{ success: boolean; message: string; updatedCount: number }> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    const tenantID = storage?.tenantID || 0;

    const url = `/Order/RecalculateVendorOrderStatuses`;
    const response = await Instense.post(url, null, {
      params: { tenantId: tenantID },
    });

    const result = response.data;
    return {
      success: result.success || false,
      message: result.message || "Status recalculation completed",
      updatedCount: result.updatedCount || 0,
    };
  };
}







