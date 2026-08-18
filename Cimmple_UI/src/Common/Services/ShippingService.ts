import Instense from "./Axios-config";

export interface ShippableItem {
  id: number;
  itemNo: number;
  partNo: string;
  partName: string;
  qtyOrdered: number;
  shippedQty: number;
  availableQty: number;
  shippingStatus: string;
  hasJobOrder: boolean;
  jobOrderStatus: string;
  quantityOnHand?: number | null;
}

export interface ShipmentLineItem {
  orderDetailId: number;
  qtyToShip: number;
}

export interface CreateShipmentRequest {
  orderId: number;
  lineItems: ShipmentLineItem[];
  courier: string;
  trackingNumber: string;
  boxes?: number;
  packingType?: string;
  terms?: string;
  shipDate?: string;
  notes?: string;
}

export interface Shipment {
  id: number;
  shipmentNo: string;
  courier: string;
  trackingNumber: string;
  boxes: number;
  packingType: string;
  shipmentDate: string;
  items: Array<{
    orderDetailId: number;
    qtyShipped: number;
    partNo: string;
  }>;
}

export class ShippingService {
  public static GetShippableItems = async (
    orderId: number
  ): Promise<ShippableItem[] | null> => {
    const url = `/Shipping/GetShippableItems/${orderId}`;
    try {
      const response = await Instense.get(url);
      return response.data.result as ShippableItem[];
    } catch (error: any) {
      console.error("Error fetching shippable items:", error);
      return null;
    }
  };

  public static CreateShipment = async (
    request: CreateShipmentRequest
  ): Promise<{ id: number; shipmentNumber: string; message: string } | null> => {
    const url = `/Shipping/CreateShipment`;
    try {
      const response = await Instense.post(url, request);
      const result = response.data.result;
      if (result && result.shipmentId) {
        return {
          id: result.shipmentId,
          shipmentNumber: result.shipmentNumber,
          message: result.message || "Shipment created successfully"
        };
      }
      return null;
    } catch (error: any) {
      console.error("Error creating shipment:", error);
      throw new Error(error.response?.data?.error || "Failed to create shipment");
    }
  };

  public static GetShipments = async (
    orderId: number
  ): Promise<Shipment[] | null> => {
    const url = `/Shipping/GetShipments/${orderId}`;
    try {
      const response = await Instense.get(url);
      const result = response.data.result as Shipment[];
      return result;
    } catch (error) {
      console.error("Error fetching shipments:", error);
      return null;
    }
  };

  public static CheckShipmentDeletionImpact = async (
    shipmentId: number
  ): Promise<any> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    let tenantID = storage?.tenantID || 0;
    
    // For development: if tenantID is not set, use a default value
    if (tenantID === 0 && process.env.NODE_ENV === 'development') {
      tenantID = 1; // Default tenant ID for development
    }

    const url = `/Shipping/CheckShipmentDeletionImpact`;
    return Instense.get(url, {
      params: { shipmentId, tenantId: tenantID },
    }).then((response) => {
      return response.data;
    });
  };

  public static DeleteShipment = async (
    shipmentId: number
  ): Promise<void> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    let tenantID = storage?.tenantID || 0;
    
    // For development: if tenantID is not set, use a default value
    if (tenantID === 0 && process.env.NODE_ENV === 'development') {
      tenantID = 1; // Default tenant ID for development
    }

    const url = `/Shipping/DeleteShipment`;
    return Instense.delete(url, {
      params: { shipmentId, tenantId: tenantID },
    }).then(() => {
      return;
    });
  };
}
