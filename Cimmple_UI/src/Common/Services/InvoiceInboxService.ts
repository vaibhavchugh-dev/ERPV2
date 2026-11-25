import Instense from "./Axios-config";

export type InvoiceInboxStatus =
  | "New"
  | "Extracting"
  | "Extracted"
  | "Failed"
  | "NoAttachment"
  | "Converted"
  | "Discarded";

export interface InvoiceInboxItem {
  id: number;
  locationId: number;
  fromName?: string | null;
  fromEmail?: string | null;
  subject?: string | null;
  fileName?: string | null;
  fileSize: number;
  hasFile: boolean;
  status: InvoiceInboxStatus;
  extractedVendorName?: string | null;
  extractedInvoiceNo?: string | null;
  extractedTotal?: number | null;
  failureReason?: string | null;
  receivedUtc: string;
  vendorInvoiceId?: number | null;
}

export interface InvoiceInboxItemDetail extends InvoiceInboxItem {
  bodyText?: string | null;
  bodyHtml?: string | null;
  /** Serialized extraction result (same shape as /DocumentExtraction). */
  extractionJson?: string | null;
  extractionProvider?: string | null;
}

export interface InvoiceInboxCounts {
  open: number;
  ready: number;
  processing: number;
  failed: number;
  converted: number;
  discarded: number;
}

export interface InvoiceInboxList {
  items: InvoiceInboxItem[];
  total: number;
  page: number;
  pageSize: number;
  counts: InvoiceInboxCounts;
}

export interface InvoiceInboxAddress {
  locationId: number;
  /** Null until InboundMail:Domain is configured on the server. */
  address: string | null;
  configured: boolean;
}

const errorMessage = (error: any, fallback: string): string => {
  const data = error?.response?.data;
  return (
    data?.message ||
    data?.error ||
    (typeof data === "string" && data ? data : null) ||
    error?.message ||
    fallback
  );
};

export class InvoiceInboxService {
  public static GetList = async (params: {
    status?: string;
    searchTerm?: string;
    locationId?: number;
    page?: number;
    pageSize?: number;
  }): Promise<InvoiceInboxList> => {
    try {
      const response = await Instense.get("/InvoiceInbox/List", { params });
      return response.data.result as InvoiceInboxList;
    } catch (error: any) {
      throw new Error(errorMessage(error, "Failed to load the invoice inbox"));
    }
  };

  public static GetItem = async (id: number): Promise<InvoiceInboxItemDetail> => {
    try {
      const response = await Instense.get(`/InvoiceInbox/Get/${id}`);
      return response.data.result as InvoiceInboxItemDetail;
    } catch (error: any) {
      throw new Error(errorMessage(error, "Failed to load the inbox item"));
    }
  };

  /** The emailed PDF as a blob (auth header required, so it cannot be a plain URL). */
  public static GetFile = async (id: number): Promise<Blob> => {
    try {
      const response = await Instense.get(`/InvoiceInbox/File/${id}`, {
        responseType: "blob",
      });
      return new Blob([response.data], { type: "application/pdf" });
    } catch (error: any) {
      throw new Error(errorMessage(error, "Failed to load the attachment"));
    }
  };

  public static MarkConverted = async (id: number, vendorInvoiceId: number): Promise<void> => {
    try {
      await Instense.post(`/InvoiceInbox/MarkConverted/${id}`, { vendorInvoiceId });
    } catch (error: any) {
      throw new Error(errorMessage(error, "Failed to link the vendor invoice"));
    }
  };

  public static Retry = async (id: number): Promise<void> => {
    try {
      await Instense.post(`/InvoiceInbox/Retry/${id}`);
    } catch (error: any) {
      throw new Error(errorMessage(error, "Failed to retry extraction"));
    }
  };

  public static Discard = async (id: number): Promise<void> => {
    try {
      await Instense.post(`/InvoiceInbox/Discard/${id}`);
    } catch (error: any) {
      throw new Error(errorMessage(error, "Failed to discard the item"));
    }
  };

  public static GetAddress = async (locationId?: number): Promise<InvoiceInboxAddress> => {
    try {
      const response = await Instense.get("/InvoiceInbox/Address", {
        params: locationId && locationId > 0 ? { locationId } : undefined,
      });
      return response.data.result as InvoiceInboxAddress;
    } catch (error: any) {
      throw new Error(errorMessage(error, "Failed to load the inbox address"));
    }
  };
}
