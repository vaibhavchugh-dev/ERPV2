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

export interface BankReconciliationPeriod {
  id: number;
  bankId: number;
  beginningBalance: number;
  endingBalance: number;
  statementDate: string;
  status: "Open" | "Completed" | string;
  /** Absolute sum of cleared credit (deposit) amounts this period */
  clearedCredits?: number | null;
  /** Absolute sum of cleared debit (payment/withdrawal) amounts this period */
  clearedDebits?: number | null;
  /** Beginning + credits − debits */
  clearedBalance?: number | null;
  /** Statement ending − cleared balance */
  difference?: number | null;
  completedUtc?: string | null;
  createdUtc?: string;
}

export interface BankReconciliationContext {
  bankId: number;
  bankOpeningBalance: number;
  suggestedBeginningBalance: number;
  lastReconciledDate?: string | null;
  openPeriod: BankReconciliationPeriod | null;
  lastCompletedPeriod: BankReconciliationPeriod | null;
  periods: BankReconciliationPeriod[];
}

export interface ReconciliationFilters {
  reconciled: string;
  dateRange: string;
  amountRange: string;
}

export class AccountingService {
  public static GetPaymentDashboardMetrics = async (
    dateRange: string = "All",
    locationId?: number
  ): Promise<PaymentDashboardMetrics | null> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    const tenantID = storage?.tenantID || 0;

    const url = `/Accounting/GetPaymentDashboardMetrics`;
    return Instense.get(url, {
      params: { tenantId: tenantID, dateRange, locationId },
    }).then((response) => {
      const result = response.data.result as PaymentDashboardMetrics;
      return result;
    });
  };

  public static GetRecentTransactions = async (
    limit: number = 10,
    dateRange: string = "All",
    locationId?: number
  ): Promise<RecentTransaction[] | null> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    const tenantID = storage?.tenantID || 0;

    const url = `/Accounting/GetRecentTransactions`;
    return Instense.get(url, {
      params: { tenantId: tenantID, limit, dateRange, locationId },
    }).then((response) => {
      const result = response.data.result as RecentTransaction[];
      return result;
    });
  };

  public static GetBankTransactions = async (
    bankAccountId: number,
    startDate?: string | null,
    endDate?: string | null
  ): Promise<BankTransaction[] | null> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    const tenantID = storage?.tenantID || 0;

    const url = `/Accounting/GetBankTransactions`;
    const params: Record<string, string | number> = {
      tenantId: tenantID,
      bankAccountId,
    };
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;

    return Instense.get(url, { params }).then((response) => {
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

  public static GetBankReconciliationContext = async (
    bankAccountId: number
  ): Promise<BankReconciliationContext | null> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    const tenantID = storage?.tenantID || 0;
    return Instense.get(`/Accounting/GetBankReconciliationContext`, {
      params: { tenantId: tenantID, bankId: bankAccountId },
    }).then((response) => response.data.result as BankReconciliationContext);
  };

  public static StartBankReconciliationPeriod = async (
    bankId: number,
    statementDate: string,
    endingBalance: number
  ): Promise<BankReconciliationPeriod | null> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    const tenantID = storage?.tenantID || 0;
    return Instense.post(`/Accounting/StartBankReconciliationPeriod`, {
      tenantId: tenantID,
      bankId,
      statementDate,
      endingBalance,
    }).then((response) => response.data.result as BankReconciliationPeriod);
  };

  public static UpdateBankReconciliationPeriod = async (
    periodId: number,
    fields: { statementDate?: string; endingBalance?: number }
  ): Promise<BankReconciliationPeriod | null> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    const tenantID = storage?.tenantID || 0;
    return Instense.post(`/Accounting/UpdateBankReconciliationPeriod`, {
      tenantId: tenantID,
      periodId,
      statementDate: fields.statementDate,
      endingBalance: fields.endingBalance,
    }).then((response) => response.data.result as BankReconciliationPeriod);
  };

  public static CompleteBankReconciliationPeriod = async (
    periodId: number
  ): Promise<BankReconciliationPeriod | null> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    const tenantID = storage?.tenantID || 0;
    return Instense.post(`/Accounting/CompleteBankReconciliationPeriod`, {
      tenantId: tenantID,
      periodId,
    }).then((response) => response.data.result as BankReconciliationPeriod);
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
    // Viewing always requests JSON so the modal can render structured data.
    const payload: Record<string, unknown> = {
      tenantId: tenantID,
      ReportType: reportType,
      DateRange: dr,
      Format: "json",
      LocationId: parameters.locationId ?? parameters.LocationId,
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

  /** Download PDF/CSV/Excel-compatible CSV as a binary file from the API. */
  public static DownloadFinancialReport = async (
    reportType: string,
    parameters: any
  ): Promise<{ blob: Blob; fileName: string; mimeType: string }> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    const tenantID = storage?.tenantID || 0;
    const dr =
      parameters.dateRange || parameters.DateRange || "This Month";
    const format = String(parameters.format || parameters.Format || "csv").toLowerCase();
    const payload: Record<string, unknown> = {
      tenantId: tenantID,
      ReportType: reportType,
      DateRange: dr,
      Format: format === "excel" ? "excel" : format,
      LocationId: parameters.locationId ?? parameters.LocationId,
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

    const response = await Instense.post(`/Accounting/GenerateFinancialReport`, payload, {
      responseType: "blob",
    });

    const disposition = response.headers?.["content-disposition"] as string | undefined;
    let fileName = `${reportType}.${format === "pdf" ? "pdf" : "csv"}`;
    if (disposition) {
      const match = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/.exec(disposition);
      if (match?.[1]) fileName = match[1].replace(/['"]/g, "");
    }
    const mimeType =
      format === "pdf"
        ? "application/pdf"
        : "text/csv;charset=utf-8";
    return { blob: response.data as Blob, fileName, mimeType };
  };

  public static ListJournalEntries = async (params?: {
    startDate?: string;
    endDate?: string;
    skip?: number;
    take?: number;
    tenantId?: number;
    locationId?: number;
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
        locationId: params?.locationId,
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
    locationId?: number | null;
  }): Promise<any | null> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    const tenantID = params.tenantId ?? storage?.tenantID ?? 0;
    return Instense.get(`/JournalEntry/GeneralLedgerDetail`, {
      params: {
        accountId: params.accountId,
        startDate: params.startDate,
        endDate: params.endDate,
        tenantId: tenantID,
        locationId: params.locationId || undefined,
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

  public static ListPayrollJournalLinks = async (params?: {
    startDate?: string;
    endDate?: string;
    source?: string;
    skip?: number;
    take?: number;
    locationId?: number;
  }): Promise<{ total: number; items: any[] } | null> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    const tenantID = storage?.tenantID || 0;
    return Instense.get(`/Payroll/List`, {
      params: {
        tenantId: tenantID,
        startDate: params?.startDate,
        endDate: params?.endDate,
        source: params?.source,
        skip: params?.skip ?? 0,
        take: params?.take ?? 200,
        locationId: params?.locationId,
      },
    }).then((response) => response.data.result);
  };

  public static RegisterPayrollJournal = async (body: {
    journalEntryId: number;
    source?: string;
    externalRunId?: string;
    payPeriodStart?: string;
    payPeriodEnd?: string;
    payDate?: string;
    description?: string;
  }): Promise<any> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    const tenantID = storage?.tenantID || 0;
    return Instense.post(`/Payroll/RegisterExisting`, {
      tenantId: tenantID,
      ...body,
    }).then((response) => response.data.result);
  };

  public static PreviewManualPayrollJournal = async (body: Record<string, unknown>): Promise<any> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    const tenantID = storage?.tenantID || 0;
    return Instense.post(`/Payroll/PreviewManual`, {
      tenantId: tenantID,
      ...body,
    }).then((response) => response.data.result);
  };

  public static PostManualPayrollJournal = async (body: Record<string, unknown>): Promise<any> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    const tenantID = storage?.tenantID || 0;
    return Instense.post(`/Payroll/PostManual`, {
      tenantId: tenantID,
      ...body,
    }).then((response) => response.data.result);
  };

  public static ParsePayrollImportCsv = async (body: {
    csvText: string;
    columnMapping?: Record<string, string>;
  }): Promise<any> => {
    return Instense.post(`/Payroll/ParseImportCsv`, body).then(
      (response) => response.data.result
    );
  };

  public static PreviewImportPayrollJournal = async (
    body: Record<string, unknown>
  ): Promise<any> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    const tenantID = storage?.tenantID || 0;
    return Instense.post(`/Payroll/PreviewImport`, {
      tenantId: tenantID,
      ...body,
    }).then((response) => response.data.result);
  };

  public static PostImportPayrollJournal = async (
    body: Record<string, unknown>
  ): Promise<any> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    const tenantID = storage?.tenantID || 0;
    return Instense.post(`/Payroll/PostImport`, {
      tenantId: tenantID,
      ...body,
    }).then((response) => response.data.result);
  };

  public static DownloadPayrollImportTemplate = async (): Promise<void> => {
    const response = await Instense.get(`/Payroll/ImportTemplate`, {
      responseType: "blob",
    });
    const blob = new Blob([response.data], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "cimmple-payroll-import-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  public static GetPayrollCashPreview = async (linkId: number): Promise<any> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    const tenantID = storage?.tenantID || 0;
    return Instense.get(`/Payroll/CashPreview/${linkId}`, {
      params: { tenantId: tenantID },
    }).then((response) => response.data.result);
  };

  public static PostPayrollNetPayment = async (body: {
    linkId: number;
    amount?: number;
    paymentDate?: string;
    bankId?: number;
    description?: string;
  }): Promise<any> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    const tenantID = storage?.tenantID || 0;
    return Instense.post(`/Payroll/PostPayment`, {
      tenantId: tenantID,
      ...body,
    }).then((response) => response.data.result);
  };

  public static PostPayrollTaxRemittance = async (body: {
    linkId: number;
    paymentDate?: string;
    bankId?: number;
    description?: string;
    lines: { accountId: number; amount: number; description?: string }[];
  }): Promise<any> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    const tenantID = storage?.tenantID || 0;
    return Instense.post(`/Payroll/PostTaxRemittance`, {
      tenantId: tenantID,
      ...body,
    }).then((response) => response.data.result);
  };

  public static SendArReminder = async (invoiceId: number): Promise<any> => {
    return Instense.post(
      `/Accounting/SendArReminder`,
      { invoiceId },
      { timeout: 135_000 }
    ).then((response) => response.data.result);
  };

  public static SendBulkArReminders = async (
    invoiceIds?: number[]
  ): Promise<{ sent: number; failed: number; failures: any[] }> => {
    return Instense.post(
      `/Accounting/SendBulkArReminders`,
      {
        invoiceIds: invoiceIds ?? null,
      },
      { timeout: 300_000 }
    ).then((response) => response.data.result);
  };
}

export {};




