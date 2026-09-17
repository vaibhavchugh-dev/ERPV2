import Instense from "./Axios-config";

export type DocumentEmailKind =
  | "quotation"
  | "order"
  | "invoice"
  | "vendorInvoice"
  | "vendorOrder"
  | "vendorQuotation"
  | "shipment"
  | "jobOrder"
  | "ncr";

export interface SendDocumentEmailRequest {
  id: number;
  tenantId?: number;
  locationId?: number;
  toEmail?: string;
  cc?: string;
  subject?: string;
  message?: string;
}

export interface SendDocumentEmailResult {
  message: string;
  toEmail?: string;
  fileName?: string;
}

const ENDPOINTS: Record<DocumentEmailKind, string> = {
  quotation: "/DocumentEmail/SendQuotation",
  order: "/DocumentEmail/SendOrder",
  invoice: "/DocumentEmail/SendInvoice",
  vendorInvoice: "/DocumentEmail/SendVendorInvoice",
  vendorOrder: "/DocumentEmail/SendVendorOrder",
  vendorQuotation: "/DocumentEmail/SendVendorQuotation",
  shipment: "/DocumentEmail/SendShipment",
  jobOrder: "/DocumentEmail/SendJobOrder",
  ncr: "/DocumentEmail/SendNcr",
};

export const DOCUMENT_EMAIL_LABELS: Record<DocumentEmailKind, string> = {
  quotation: "Quotation",
  order: "Order",
  invoice: "Invoice",
  vendorInvoice: "Vendor Invoice",
  vendorOrder: "Vendor Order",
  vendorQuotation: "Vendor Quotation",
  shipment: "Shipment",
  jobOrder: "Job Order",
  ncr: "NCR",
};

export class DocumentEmailService {
  public static async Send(
    kind: DocumentEmailKind,
    payload: SendDocumentEmailRequest
  ): Promise<SendDocumentEmailResult> {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    const tenantId = payload.tenantId || storage?.tenantID || 0;
    const locationRaw = localStorage.getItem("locationId");
    const locationId =
      payload.locationId ||
      (locationRaw ? parseInt(locationRaw, 10) : undefined);

    const response = await Instense.post(
      ENDPOINTS[kind],
      {
        id: payload.id,
        tenantId,
        locationId: locationId && locationId > 0 ? locationId : undefined,
        toEmail: payload.toEmail || undefined,
        cc: payload.cc || undefined,
        subject: payload.subject || undefined,
        message: payload.message || undefined,
      },
      {
        // PDF build + slow SMTP (esp. with CC) can exceed the default browser/axios wait.
        timeout: 135_000,
      }
    );

    return response.data;
  }
}
