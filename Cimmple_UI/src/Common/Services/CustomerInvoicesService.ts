import Instense from "./Axios-config";

export interface CustomerInvoiceSummary {
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
  totalAmount?: number;
  paidAmount?: number;
  balanceDue?: number;
  status: string;
  daysOverdue?: number;
}

export interface CustomerInvoiceDetail {
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
  paidAmount?: number;
  balanceDue?: number;
  paymentMethod: string;
  paymentDate?: string;
  checkNo: string;
  internalNotes: string;
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

export class CustomerInvoicesService {
  public static GetAllInvoices = async (
    status: string = "All",
    searchTerm: string = "",
    customerId?: number,
    dateRange: string = "Last 30 Days",
    startDate?: string,
    endDate?: string
  ): Promise<CustomerInvoiceSummary[] | null> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    const tenantID = storage?.tenantID || 0;

    console.log("[CustomerInvoicesService] Calling GetAllInvoices with params:", { tenantId: tenantID, status, searchTerm, customerId, dateRange, startDate, endDate });
    const url = `/Invoice/GetAllInvoices`;
    try {
      const response = await Instense.get(url, {
        params: {
          tenantId: tenantID,
          status,
          searchTerm,
          customerId,
          dateRange,
          startDate,
          endDate
        }
      });
      const result = response.data.result as CustomerInvoiceSummary[];
      console.log("[CustomerInvoicesService] API result:", result);
      return result;
    } catch (error) {
      console.error("Error fetching invoices:", error);
      return null;
    }
  };

  public static GetInvoiceDetails = async (
    invoiceId: number
  ): Promise<CustomerInvoiceDetail | null> => {
    const url = `/Invoice/GetInvoiceDetails/${invoiceId}`;
    try {
      const response = await Instense.get(url);
      const result = response.data.result as CustomerInvoiceDetail;
      return result;
    } catch (error) {
      console.error("Error fetching invoice details:", error);
      return null;
    }
  };

  public static UpdateInvoicePayment = async (
    invoiceId: number,
    paymentMethod: string,
    paymentDate: string,
    checkNo?: string
  ): Promise<boolean> => {
    const url = `/Invoice/UpdateInvoicePayment`;
    try {
      const response = await Instense.put(url, {
        invoiceId,
        paymentMethod,
        paymentDate,
        checkNo
      });
      return response.data.success || true;
    } catch (error) {
      console.error("Error updating invoice payment:", error);
      return false;
    }
  };

  public static PrintInvoice = async (invoiceId: number): Promise<boolean> => {
    const url = `/Invoice/PrintInvoice/${invoiceId}`;
    try {
      const response = await Instense.get(url);
      return response.data.success || true;
    } catch (error) {
      console.error("Error printing invoice:", error);
      return false;
    }
  };

  public static VoidInvoice = async (invoiceId: number): Promise<boolean> => {
    const url = `/Invoice/VoidInvoice/${invoiceId}`;
    try {
      await Instense.post(url);
      return true;
    } catch (error: any) {
      console.error("Error voiding invoice:", error);
      throw new Error(error.response?.data?.error || error.message || "Failed to void invoice");
    }
  };
}
