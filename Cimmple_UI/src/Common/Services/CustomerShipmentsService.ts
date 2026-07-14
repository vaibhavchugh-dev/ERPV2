import Instense from "./Axios-config";

export interface CustomerShipmentSummary {
  id: number;
  shipmentNo: string;
  orderId: number;
  orderNumber: string;
  customerName: string;
  customerCode: string;
  courier: string;
  trackingNumber: string;
  shipmentDate: string;
  totalItems: number;
  itemCount: number;
  boxes: number;
  packingType: string;
  status: string;
}

export interface CustomerShipmentDetail {
  id: number;
  shipmentNo: string;
  orderId: number;
  orderNumber: string;
  customerName: string;
  customerCode: string;
  courier: string;
  trackingNumber: string;
  shipmentDate: string;
  boxes: number;
  packingType: string;
  terms: string;
  notes: string;
  items: Array<{
    orderDetailId: number;
    partNo: string;
    partName: string;
    qtyShipped: number;
    unitPrice: number;
    lineTotal: number;
  }>;
  totalAmount: number;
}

export class CustomerShipmentsService {
  public static GetAllShipments = async (
    status: string = "All",
    searchTerm: string = "",
    customerId?: number,
    dateRange: string = "Last 30 Days"
  ): Promise<CustomerShipmentSummary[] | null> => {
    const url = `/Shipping/GetAllShipments`;
    try {
      const response = await Instense.get(url, {
        params: {
          status,
          searchTerm,
          customerId,
          dateRange
        }
      });
      const result = response.data.result as CustomerShipmentSummary[];
      return result;
    } catch (error) {
      console.error("Error fetching shipments:", error);
      return null;
    }
  };

  public static GetShipmentDetails = async (
    shipmentId: number
  ): Promise<CustomerShipmentDetail | null> => {
    const url = `/Shipping/GetShipmentDetails/${shipmentId}`;
    try {
      const response = await Instense.get(url);
      const result = response.data.result as CustomerShipmentDetail;
      return result;
    } catch (error) {
      console.error("Error fetching shipment details:", error);
      return null;
    }
  };

  public static UpdateShipmentTracking = async (
    shipmentId: number,
    trackingNumber: string,
    courier?: string
  ): Promise<boolean> => {
    const url = `/Shipping/UpdateShipmentTracking`;
    try {
      const response = await Instense.put(url, {
        shipmentId,
        trackingNumber,
        courier
      });
      return response.data.success || true;
    } catch (error) {
      console.error("Error updating shipment tracking:", error);
      return false;
    }
  };

  public static DeleteShipment = async (shipmentId: number): Promise<boolean> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    const tenantID = storage?.tenantID || 0;

    const url = `/Shipping/DeleteShipment`;
    try {
      await Instense.delete(url, {
        params: { shipmentId, tenantId: tenantID },
      });
      return true;
    } catch (error) {
      console.error("Error deleting shipment:", error);
      return false;
    }
  };
}

























