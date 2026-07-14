import Instense from "./Axios-config";

export interface InvoiceableItem {
  id: number;
  itemNo: number;
  partNo: string;
  partName: string;
  qtyOrdered: number;
  shippedQty: number;
  invoicedQty: number;
  availableQty: number;
  invoiceStatus: string;
  unitPrice: number;
  discount: number;
  hasJobOrder: boolean;
  jobOrderStatus: string;
}

export interface InvoiceLineItem {
  orderDetailId: number;
  qtyToInvoice: number;
  unitPrice: number;
  discount: number;
}

export interface CreateInvoiceRequest {
  orderId: number;
  lineItems: InvoiceLineItem[];
  invoiceDate?: string;
  dueDate?: string;
  notes?: string;
}

export interface Invoice {
  id: number;
  invoiceNo: string;
  invoiceDate: string;
  dueDate: string;
  amount: number;
  totalAmount: number;
  status: string;
  items: Array<{
    orderDetailId: number;
    qtyInvoiced: number;
    description: string;
    amount: number;
  }>;
}

export interface InvoiceDetail {
  id: number;
  invoiceNo: string;
  orderId: number;
  orderNumber: string;
  customerName: string;
  customerCode: string;
  customerPoNumber: string;
  invoiceDate: string;
  dueDate: string;
  shippingCharge: number;
  otherCharge: number;
  saleTax: number;
  saleTaxAmount: number;
  amount: number;
  totalAmount: number;
  paymentMethod?: string;
  paymentDate?: string;
  checkNo?: string;
  internalNotes?: string;
  status: string;
  daysOverdue?: number;
  items: Array<{
    orderDetailId: number;
    partNo: string;
    partName: string;
    description: string;
    qtyInvoiced: number;
    unitPrice: number;
    discount: number;
    lineTotal: number;
  }>;
}

export interface InvoiceSummary {
  id: number;
  invoiceNo: string;
  orderId: number;
  orderNumber: string;
  customerName: string;
  customerCode: string;
  invoiceDate: string;
  dueDate: string;
  totalItems: number;
  itemCount: number;
  amount: number;
  totalAmount: number;
  status: string;
  daysOverdue?: number;
}

export interface RecordCustomerPaymentRequest {
  PaymentMethod: string;
  PaymentDate?: string;
  CheckNo?: string;
  PaymentAmount?: number;
  Notes?: string;
}

export class InvoiceService {
  public static GetInvoiceableItems = async (
    orderId: number
  ): Promise<InvoiceableItem[] | null> => {
    const url = `/Invoice/GetInvoiceableItems/${orderId}`;
    try {
      const response = await Instense.get(url);
      const result = response.data.result as InvoiceableItem[];
      return result;
    } catch (error) {
      console.error("Error fetching invoiceable items:", error);
      return null;
    }
  };

  public static CreateInvoice = async (
    request: CreateInvoiceRequest
  ): Promise<{ id: number; invoiceNumber: string; message: string } | null> => {
    const url = `/Invoice/CreateInvoice`;
    try {
      const response = await Instense.post(url, request);
      const result = response.data.result;
      if (result && result.invoiceId) {
        return {
          id: result.invoiceId,
          invoiceNumber: result.invoiceNumber,
          message: result.message || "Invoice created successfully"
        };
      }
      return null;
    } catch (error: any) {
      console.error("Error creating invoice:", error);
      throw new Error(error.response?.data?.error || error.message || "Failed to create invoice");
    }
  };

  public static GetInvoices = async (
    orderId: number
  ): Promise<Invoice[] | null> => {
    const url = `/Invoice/GetInvoices/${orderId}`;
    try {
      const response = await Instense.get(url);
      const result = response.data.result as Invoice[];
      return result;
    } catch (error) {
      console.error("Error fetching invoices:", error);
      return null;
    }
  };

  public static CheckInvoiceDeletionImpact = async (
    invoiceId: number
  ): Promise<any> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    let tenantID = storage?.tenantID || 0;
    
    // For development: if tenantID is not set, use a default value
    if (tenantID === 0 && process.env.NODE_ENV === 'development') {
      tenantID = 1; // Default tenant ID for development
    }

    const url = `/Invoice/CheckInvoiceDeletionImpact`;
    return Instense.get(url, {
      params: { invoiceId, tenantId: tenantID },
    }).then((response) => {
      return response.data;
    });
  };

  public static DeleteInvoice = async (
    invoiceId: number
  ): Promise<void> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    let tenantID = storage?.tenantID || 0;
    
    // For development: if tenantID is not set, use a default value
    if (tenantID === 0 && process.env.NODE_ENV === 'development') {
      tenantID = 1; // Default tenant ID for development
    }

    const url = `/Invoice/DeleteInvoice`;
    return Instense.delete(url, {
      params: { invoiceId, tenantId: tenantID },
    }).then(() => {
      return;
    });
  };

  public static RecordCustomerPayment = async (
    invoiceId: number,
    paymentData: RecordCustomerPaymentRequest
  ): Promise<{ message: string } | null> => {
    const url = `/Invoice/RecordCustomerPayment/${invoiceId}`;
    try {
      const response = await Instense.post(url, paymentData);
      const result = response.data.result;
      return result;
    } catch (error: any) {
      console.error("Error recording customer payment:", error);
      throw new Error(error.response?.data?.error || error.message || "Failed to record customer payment");
    }
  };

  public static GetInvoiceDetails = async (
    invoiceId: number
  ): Promise<InvoiceDetail | null> => {
    const url = `/Invoice/GetInvoiceDetails/${invoiceId}`;
    try {
      const response = await Instense.get(url);
      const result = response.data.result as InvoiceDetail;
      return result;
    } catch (error) {
      console.error("Error fetching invoice details:", error);
      return null;
    }
  };

  public static GetAllInvoices = async (
    status: string = "All",
    searchTerm: string = "",
    customerId?: number,
    dateRange: string = "Last 30 Days"
  ): Promise<InvoiceSummary[] | null> => {
    const url = `/Invoice/GetAllInvoices`;
    try {
      const response = await Instense.get(url, {
        params: {
          status,
          searchTerm,
          customerId,
          dateRange
        }
      });
      const result = response.data.result as InvoiceSummary[];
      return result;
    } catch (error) {
      console.error("Error fetching all invoices:", error);
      return null;
    }
  };
}




































