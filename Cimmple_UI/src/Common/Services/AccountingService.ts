import Instense from "./Axios-config";

export interface PaymentDashboardMetrics {
  totalReceivables: number;
  overdueReceivables: number;
  receivablesDueThisWeek: number;
  totalPayables: number;
  overduePayables: number;
  payablesDueThisWeek: number;
  cashIn: number;
  cashOut: number;
  netCashFlow: number;
}

export interface RecentTransaction {
  id: number;
  type: 'invoice' | 'payment' | 'bill';
  description: string;
  amount: number;
  date: string;
  status: 'pending' | 'completed' | 'overdue';
  customerVendor: string;
}

export interface BankTransaction {
  id: number;
  date: string;
  description: string;
  amount: number;
  type: 'debit' | 'credit';
  reconciled: boolean;
  reference?: string;
}

export interface BankAccount {
  id: number;
  name: string;
  accountNumber: string;
  balance: number;
  lastReconciled: string;
}

export interface ReconciliationFilters {
  reconciled: string;
  dateRange: string;
  amountRange: string;
}

export class AccountingService {
  public static GetPaymentDashboardMetrics = async (
    dateRange: string = "All"
  ): Promise<PaymentDashboardMetrics | null> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    const tenantID = storage?.tenantID || 0;

    const url = `/Accounting/GetPaymentDashboardMetrics`;
    return Instense.get(url, {
      params: { tenantId: tenantID, dateRange },
    }).then((response) => {
      const result = response.data.result as PaymentDashboardMetrics;
      return result;
    });
  };

  public static GetRecentTransactions = async (
    limit: number = 10,
    dateRange: string = "All"
  ): Promise<RecentTransaction[] | null> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    const tenantID = storage?.tenantID || 0;

    const url = `/Accounting/GetRecentTransactions`;
    return Instense.get(url, {
      params: { tenantId: tenantID, limit, dateRange },
    }).then((response) => {
      const result = response.data.result as RecentTransaction[];
      return result;
    });
  };

  public static GetBankTransactions = async (
    bankAccountId: number,
    startDate: string,
    endDate: string
  ): Promise<BankTransaction[] | null> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    const tenantID = storage?.tenantID || 0;

    const url = `/Accounting/GetBankTransactions`;
    return Instense.get(url, {
      params: { tenantId: tenantID, bankAccountId, startDate, endDate },
    }).then((response) => {
      const result = response.data.result as BankTransaction[];
      return result;
    });
  };

  public static ReconcileBankTransaction = async (
    transactionId: number,
    reconciled: boolean
  ): Promise<any> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    const tenantID = storage?.tenantID || 0;

    const url = `/Accounting/ReconcileBankTransaction`;
    return Instense.post(url, {
      tenantId: tenantID,
      transactionId,
      reconciled,
    }).then((response) => {
      const result = response.data.result;
      return result;
    });
  };

  public static BulkReconcileTransactions = async (
    transactionIds: number[]
  ): Promise<any> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    const tenantID = storage?.tenantID || 0;

    const url = `/Accounting/BulkReconcileTransactions`;
    return Instense.post(url, {
      tenantId: tenantID,
      transactionIds,
    }).then((response) => {
      const result = response.data.result;
      return result;
    });
  };

  public static GenerateFinancialReport = async (
    reportType: string,
    parameters: any
  ): Promise<any> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    const tenantID = storage?.tenantID || 0;

    const url = `/Accounting/GenerateFinancialReport`;
    const dr =
      parameters.dateRange || parameters.DateRange || "This Month";
    const payload: Record<string, unknown> = {
      tenantId: tenantID,
      ReportType: reportType,
      DateRange: dr,
      Format: parameters.format || parameters.Format || "pdf",
      Parameters: parameters,
    };
    if (
      String(dr).toLowerCase() === "custom" &&
      parameters.customStartDate &&
      parameters.customEndDate
    ) {
      payload.CustomStartDate = parameters.customStartDate;
      payload.CustomEndDate = parameters.customEndDate;
    }
    return Instense.post(url, payload).then((response) => {
      const result = response.data.result;
      return result;
    });
  };

  public static ListJournalEntries = async (params?: {
    startDate?: string;
    endDate?: string;
    skip?: number;
    take?: number;
    tenantId?: number;
  }): Promise<{
    items: Array<{
      id: number;
      entryDate: string;
      referenceNumber: string;
      description: string;
      totalAmount: number;
      reversesJournalEntryId?: number | null;
      reversedByJournalEntryId?: number | null;
    }>;
    total: number;
    skip: number;
    take: number;
  } | null> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    const tenantID = params?.tenantId ?? storage?.tenantID ?? 0;
    const url = `/JournalEntry/List`;
    return Instense.get(url, {
      params: {
        tenantId: tenantID,
        skip: params?.skip ?? 0,
        take: params?.take ?? 100,
        startDate: params?.startDate,
        endDate: params?.endDate,
      },
    }).then((response) => {
      return response.data.result as {
        items: Array<{
          id: number;
          entryDate: string;
          referenceNumber: string;
          description: string;
          totalAmount: number;
          reversesJournalEntryId?: number | null;
          reversedByJournalEntryId?: number | null;
        }>;
        total: number;
        skip: number;
        take: number;
      };
    });
  };

  public static GetJournalEntry = async (
    id: number,
    tenantId?: number
  ): Promise<any | null> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    const tid = tenantId ?? storage?.tenantID ?? 0;
    const url = `/JournalEntry/Get`;
    return Instense.get(url, { params: { id, tenantId: tid } }).then(
      (response) => response.data.result
    );
  };

  public static CreateJournalEntry = async (body: {
    tenantId?: number;
    entryDate?: string;
    referenceNumber?: string;
    description?: string;
    accountingPeriod?: string;
    locationId?: number;
    lines: Array<{
      accountId: number;
      debit: number;
      credit: number;
      description?: string;
    }>;
  }): Promise<{ id: number; referenceNumber: string; message: string } | null> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    const tenantID = body.tenantId ?? storage?.tenantID ?? 0;
    const { tenantId: _ignored, ...rest } = body;
    const url = `/JournalEntry/Create`;
    return Instense.post(url, { tenantId: tenantID, ...rest }).then(
      (response) => response.data.result
    );
  };

  public static GetGeneralLedgerDetail = async (params: {
    accountId: number;
    startDate: string;
    endDate: string;
    tenantId?: number;
  }): Promise<any | null> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    const tenantID = params.tenantId ?? storage?.tenantID ?? 0;
    return Instense.get(`/JournalEntry/GeneralLedgerDetail`, {
      params: {
        accountId: params.accountId,
        startDate: params.startDate,
        endDate: params.endDate,
        tenantId: tenantID,
      },
    }).then((response) => response.data.result);
  };

  public static ReverseJournalEntry = async (body: {
    tenantId?: number;
    sourceJournalEntryId: number;
    entryDate?: string;
    referenceNumber?: string;
    description?: string;
  }): Promise<{
    id: number;
    referenceNumber: string;
    reversesJournalEntryId: number;
    message: string;
  } | null> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    const tenantID = body.tenantId ?? storage?.tenantID ?? 0;
    const { tenantId: _ignored, ...rest } = body;
    return Instense.post(`/JournalEntry/Reverse`, {
      tenantId: tenantID,
      ...rest,
    }).then((response) => response.data.result);
  };

  public static ListClosedPeriods = async (
    tenantId?: number
  ): Promise<
    Array<{
      periodKey: string;
      closedUtc: string;
      closedByUserId: number | null;
    }>
  > => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    const tid = tenantId ?? storage?.tenantID ?? 0;
    return Instense
      .get(`/Accounting/ListClosedPeriods`, { params: { tenantId: tid } })
      .then((response) => response.data.result);
  };

  public static CloseAccountingPeriod = async (periodKey: string): Promise<{
    message: string;
    periodKey: string;
  } | null> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    const tenantID = storage?.tenantID ?? 0;
    return Instense
      .post(`/Accounting/CloseAccountingPeriod`, {
        tenantId: tenantID,
        periodKey,
      })
      .then((response) => response.data.result);
  };

  public static OpenAccountingPeriod = async (periodKey: string): Promise<{
    message: string;
    periodKey: string;
  } | null> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    const tenantID = storage?.tenantID ?? 0;
    return Instense
      .post(`/Accounting/OpenAccountingPeriod`, {
        tenantId: tenantID,
        periodKey,
      })
      .then((response) => response.data.result);
  };

  public static ListGlAuditTrail = async (params?: {
    tenantId?: number;
    skip?: number;
    take?: number;
  }): Promise<{
    items: Array<{
      id: number;
      action: string;
      occurredUtc: string;
      actorUserId: number | null;
      journalEntryId: number | null;
      relatedJournalEntryId: number | null;
      periodKey: string | null;
      notes: string | null;
    }>;
    total: number;
    skip: number;
    take: number;
  } | null> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    const tid = params?.tenantId ?? storage?.tenantID ?? 0;
    return Instense
      .get(`/Accounting/ListGlAuditTrail`, {
        params: {
          tenantId: tid,
          skip: params?.skip ?? 0,
          take: params?.take ?? 200,
        },
      })
      .then((response) => response.data.result);
  };

  public static GetAccountingSettings = async (): Promise<any> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    const tenantID = storage?.tenantID || 0;

    const url = `/Accounting/GetAccountingSettings`;
    return Instense.get(url, {
      params: { tenantId: tenantID },
    }).then((response) => {
      const result = response.data.result;
      return result;
    });
  };

  public static SaveAccountingSettings = async (
    settings: any
  ): Promise<any> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    const tenantID = storage?.tenantID || 0;

    const url = `/Accounting/SaveAccountingSettings`;
    return Instense.post(url, {
      tenantId: tenantID,
      ...settings,
    }).then((response) => {
      const result = response.data.result;
      return result;
    });
  };
}

export {};




