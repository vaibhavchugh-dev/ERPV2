import Instense from "./Axios-config";

export class PdfService {
  private static getLocationId(): number | null {
    const locationId = localStorage.getItem('locationId');
    return locationId ? parseInt(locationId, 10) : null;
  }

  public static GenerateQuotation = async (
    quotationId: number
  ): Promise<Blob> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    const tenantID = storage?.tenantID || 0;
    const locationId = this.getLocationId();

    const url = `/Pdf/GenerateQuotation?quotationId=${quotationId}&tenantId=${tenantID}${locationId ? `&locationId=${locationId}` : ''}`;
    const response = await Instense.get(url, {
      responseType: "blob",
    });

    return response.data;
  };

  public static GenerateOrder = async (orderId: number): Promise<Blob> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    const tenantID = storage?.tenantID || 0;
    const locationId = this.getLocationId();

    const url = `/Pdf/GenerateOrder?orderId=${orderId}&tenantId=${tenantID}${locationId ? `&locationId=${locationId}` : ''}`;
    const response = await Instense.get(url, {
      responseType: "blob",
    });

    return response.data;
  };

  public static GenerateInvoice = async (invoiceId: number): Promise<Blob> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    const tenantID = storage?.tenantID || 0;
    const locationId = this.getLocationId();

    const url = `/Pdf/GenerateInvoice?invoiceId=${invoiceId}&tenantId=${tenantID}${locationId ? `&locationId=${locationId}` : ''}`;
    const response = await Instense.get(url, {
      responseType: "blob",
    });

    return response.data;
  };

  public static GenerateVendorInvoice = async (invoiceId: number): Promise<Blob> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    const tenantID = storage?.tenantID || 0;
    const locationId = this.getLocationId();

    const url = `/Pdf/GenerateVendorInvoice?invoiceId=${invoiceId}&tenantId=${tenantID}${locationId ? `&locationId=${locationId}` : ''}`;
    const response = await Instense.get(url, {
      responseType: "blob",
    });

    return response.data;
  };

  public static GenerateVendorOrder = async (orderId: number): Promise<Blob> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    const tenantID = storage?.tenantID || 0;
    const locationId = this.getLocationId();

    const url = `/Pdf/GenerateVendorOrder?orderId=${orderId}&tenantId=${tenantID}${locationId ? `&locationId=${locationId}` : ''}`;
    const response = await Instense.get(url, {
      responseType: "blob",
    });

    return response.data;
  };

  public static GenerateVendorQuotation = async (quotationId: number): Promise<Blob> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    const tenantID = storage?.tenantID || 0;
    const locationId = this.getLocationId();

    const url = `/Pdf/GenerateVendorQuotation?quotationId=${quotationId}&tenantId=${tenantID}${locationId ? `&locationId=${locationId}` : ''}`;
    const response = await Instense.get(url, {
      responseType: "blob",
    });

    return response.data;
  };

  public static GenerateShipment = async (shipmentId: number): Promise<Blob> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    const tenantID = storage?.tenantID || 0;
    const locationId = this.getLocationId();

    const url = `/Pdf/GenerateShipment?shipmentId=${shipmentId}&tenantId=${tenantID}${locationId ? `&locationId=${locationId}` : ''}`;
    const response = await Instense.get(url, {
      responseType: "blob",
    });

    return response.data;
  };

  public static GenerateJobOrder = async (jobOrderId: number): Promise<Blob> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    const tenantID = storage?.tenantID || 0;
    const locationId = this.getLocationId();

    const url = `/Pdf/GenerateJobOrder?jobOrderId=${jobOrderId}&tenantId=${tenantID}${locationId ? `&locationId=${locationId}` : ''}`;
    const response = await Instense.get(url, {
      responseType: "blob",
    });

    return response.data;
  };
}

