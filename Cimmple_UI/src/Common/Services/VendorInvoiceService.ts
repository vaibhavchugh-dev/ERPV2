import Instense from "./Axios-config";

export interface InvoiceableItemForVendor {
  id: number;
  itemNo: number;
  partNo: string;
  partName: string;
  qtyOrdered: number;
  receivedQty: number;
  invoicedQty: number;
  availableQty: number;
  invoiceStatus: string;
  unitPrice: number;
  discount: number;
  discountType?: "Percent" | "Amount" | string;
  minInvoiceDate?: string;
}

export interface VendorInvoiceLineItem {
  orderDetailId: number;
  qtyToInvoice: number;
  unitPrice: number;
  discount: number;
  discountType?: "Percent" | "Amount" | string;
}

export interface CreateVendorInvoiceRequest {
  orderId: number;
  lineItems: VendorInvoiceLineItem[];
  invoiceNo: string;
  invoiceDate?: string;
  dueDate?: string;
  paymentMethod?: string;
  notes?: string;
  /** Input tax rate percent (0–100) */
  taxRate?: number;
  /** Input tax amount; when omitted server computes from taxRate × subtotal */
  taxAmount?: number;
  freightCharge?: number;
}

export interface VendorInvoice {
  id: number;
  invoiceNo: string;
  invoiceDate: string;
  dueDate: string;
  amount: number;
  taxAmount?: number;
  freightCharge?: number;
  totalAmount: number;
  paidAmount?: number;
  balanceDue?: number;
  status: string;
  vendorName?: string;
  vendorCode?: string;
  orderId?: number;
  /** Display order number(s), e.g. "VO#1003" or "VO#1003, VO#1004" when lines span orders. */
  orderNumber?: string;
  paymentMethod?: string;
  isApproved?: boolean;
  items: Array<{
    orderDetailId: number;
    qtyInvoiced: number;
    description: string;
    /** Vendor order line part number, when the invoice line is linked to an order line. */
    partNo?: string;
    /** Vendor order line type: RawMaterial, FinishedProduct, Tool, Service, Subcontract, Other. */
    lineType?: string;
    amount: number;
  }>;
}

export interface VendorInvoiceSummary {
  id: number;
  invoiceNo: string;
  vendorName: string;
  vendorCode: string;
  orderNumber: string;
  invoiceDate: string;
  dueDate: string;
  amount: number;
  taxAmount?: number;
  freightCharge?: number;
  totalAmount: number;
  paidAmount?: number;
  balanceDue?: number;
  status: string;
  paymentMethod?: string;
  daysOverdue?: number;
  orderId?: number;
  isApproved?: boolean;
}

export interface RecordVendorPaymentRequest {
  PaymentMethod: string;
  PaymentDate?: string;
  CheckNo?: string;
  CheckDate?: string;
  PvrNo?: number;
  Series?: string;
  BankId?: number;
  /** Company card from Credit Card Master; required when PaymentMethod is Credit Card. */
  CreditCardId?: number;
  PaymentAmount?: number;
}

export interface PaymentCreditCard {
  id: number;
  nickName: string;
  cardType: string;
  lastFourDigits: string;
  isPrimary: boolean;
}

export class VendorInvoiceService {
  public static GetInvoiceableItems = async (
    orderId: number
  ): Promise<InvoiceableItemForVendor[] | null> => {
    const url = `/Order/GetInvoiceableItemsForVendorOrder/${orderId}`;
    try {
      const response = await Instense.get(url);
      const result = response.data.result as InvoiceableItemForVendor[];
      return result;
    } catch (error) {
      console.error("Error fetching invoiceable items for vendor order:", error);
      return null;
    }
  };

  public static CreateVendorInvoice = async (
    request: CreateVendorInvoiceRequest
  ): Promise<{ id: number; invoiceNumber: string; message: string } | null> => {
    const url = `/Order/CreateVendorInvoice`;
    try {
      const response = await Instense.post(url, request);
      const result = response.data.result;
      if (result && result.invoiceId) {
        return {
          id: result.invoiceId,
          invoiceNumber: result.invoiceNumber,
          message: result.message || "Vendor invoice created successfully"
        };
      }
      return null;
    } catch (error: any) {
      console.error("Error creating vendor invoice:", error);
      throw new Error(error.response?.data?.error || error.message || "Failed to create vendor invoice");
    }
  };

  public static GetVendorInvoices = async (
    orderId: number
  ): Promise<VendorInvoice[] | null> => {
    const url = `/Order/GetVendorInvoices/${orderId}`;
    try {
      const response = await Instense.get(url);
      const result = response.data.result as VendorInvoice[];
      return result;
    } catch (error) {
      console.error("Error fetching vendor invoices:", error);
      return null;
    }
  };

  public static GetAllVendorInvoices = async (
    status: string = "All",
    searchTerm: string = "",
    vendorId?: number,
    dateRange: string = "Last 30 Days",
    locationId?: number,
    startDate?: string,
    endDate?: string
  ): Promise<VendorInvoiceSummary[] | null> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    const tenantID = storage?.tenantID || 0;

    const url = `/Order/GetAllVendorInvoices`;
    try {
      const response = await Instense.get(url, {
        params: {
          tenantId: tenantID,
          status,
          searchTerm,
          vendorId,
          dateRange,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          locationId
        }
      });
      const result = response.data.result as VendorInvoiceSummary[];
      return result;
    } catch (error) {
      console.error("Error fetching all vendor invoices:", error);
      return null;
    }
  };

  public static GetVendorInvoiceDetails = async (
    invoiceId: number
  ): Promise<VendorInvoice | null> => {
    const url = `/Order/GetVendorInvoiceDetails/${invoiceId}`;
    try {
      const response = await Instense.get(url);
      const result = response.data.result as VendorInvoice;
      return result;
    } catch (error) {
      console.error("Error fetching vendor invoice details:", error);
      return null;
    }
  };

  public static ApproveVendorInvoice = async (
    invoiceId: number
  ): Promise<{ message: string } | null> => {
    const url = `/VendorInvoice/ApproveVendorInvoice/${invoiceId}`;
    try {
      const response = await Instense.post(url);
      const result = response.data.result;
      return result;
    } catch (error: any) {
      console.error("Error approving vendor invoice:", error);
      throw new Error(error.response?.data?.error || error.message || "Failed to approve vendor invoice");
    }
  };

  public static RecordVendorPayment = async (
    invoiceId: number,
    paymentData: RecordVendorPaymentRequest
  ): Promise<{ message: string } | null> => {
    const url = `/VendorInvoice/RecordVendorPayment/${invoiceId}`;
    try {
      const response = await Instense.post(url, paymentData);
      const result = response.data.result;
      return result;
    } catch (error: any) {
      console.error("Error recording vendor payment:", error);
      throw new Error(error.response?.data?.error || error.message || "Failed to record vendor payment");
    }
  };

  public static GetPaymentCreditCards = async (): Promise<PaymentCreditCard[]> => {
    const response = await Instense.get(`/VendorInvoice/GetPaymentCreditCards`);
    return (response.data.result as PaymentCreditCard[]) || [];
  };

  public static DeleteVendorInvoice = async (
    invoiceId: number
  ): Promise<{ message: string } | null> => {
    const url = `/VendorInvoice/DeleteVendorInvoice/${invoiceId}`;
    try {
      const response = await Instense.delete(url);
      const result = response.data.result;
      return result;
    } catch (error: any) {
      console.error("Error deleting vendor invoice:", error);
      throw new Error(error.response?.data?.error || error.message || "Failed to delete vendor invoice");
    }
  };

  public static VoidVendorInvoice = async (
    invoiceId: number
  ): Promise<{ message: string } | null> => {
    const url = `/VendorInvoice/VoidVendorInvoice/${invoiceId}`;
    try {
      const response = await Instense.post(url);
      return response.data.result;
    } catch (error: any) {
      console.error("Error voiding vendor invoice:", error);
      throw new Error(error.response?.data?.error || error.message || "Failed to void vendor invoice");
    }
  };

  public static GetVendorInvoicesDirect = async (
    status: string = "All",
    searchTerm: string = "",
    vendorId?: number,
    dateRange: string = "All",
    locationId?: number
  ): Promise<VendorInvoiceSummary[] | null> => {
    const url = `/VendorInvoice/GetVendorInvoices`;
    try {
      const response = await Instense.get(url, {
        params: {
          status,
          searchTerm,
          vendorId,
          dateRange,
          locationId
        }
      });
      const result = response.data.result as VendorInvoiceSummary[];
      return result;
    } catch (error) {
      console.error("Error fetching vendor invoices directly:", error);
      return null;
    }
  };

  public static GetVendorInvoiceByIdDirect = async (
    invoiceId: number
  ): Promise<VendorInvoice | null> => {
    const url = `/VendorInvoice/GetVendorInvoiceById/${invoiceId}`;
    try {
      const response = await Instense.get(url);
      const result = response.data.result as VendorInvoice;
      return result;
    } catch (error) {
      console.error("Error fetching vendor invoice by ID directly:", error);
      return null;
    }
  };
}







