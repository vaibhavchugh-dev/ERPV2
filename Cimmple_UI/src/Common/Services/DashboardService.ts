import Instense from "./Axios-config";

export interface DashboardMetrics {
  production: {
    activeJobOrders: number;
    jobsCompletedToday: number;
    jobsCompletedThisWeek: number;
    onTimeDeliveryRate: number;
  };
  financial: {
    totalReceivables: number;
    totalPayables: number;
    revenueThisMonth: number;
    netCashFlow: number;
  };
  quality: {
    openNCRs: number;
    ncrResolvedThisWeek: number;
    defectRate: number;
  };
  operational: {
    pendingCustomerOrders: number;
    pendingVendorOrders: number;
    overdueShipments: number;
  };
  sales: {
    quotationsThisMonth: number;
    conversionRate: number;
  };
}

export interface ProductionStatus {
  jobOrdersByStatus: Array<{
    status: string;
    count: number;
  }>;
  overdueJobs: number;
}

export interface RevenueTrend {
  date: string;
  revenue: number;
  count?: number;
}

export interface ExpenseTrend {
  date: string;
  expenses: number;
}

export interface RevenueTrends {
  revenue: RevenueTrend[];
  expenses: ExpenseTrend[];
}

export interface RecentActivity {
  type: string;
  action: string;
  description: string;
  timestamp: string;
  entityId: number;
  entityType: string;
}

export interface Alert {
  type: string;
  priority: "high" | "medium" | "low";
  title: string;
  description: string;
  entityId: number;
  entityType: string;
  dueDate?: string;
  createdDate?: string;
  amount?: number;
}

export interface TopCustomer {
  customerId: number;
  customerName: string;
  revenue: number;
  orderCount: number;
}

export interface TopProduct {
  partNo: string;
  partName: string;
  quantity: number;
  revenue: number;
  orderCount: number;
}

export interface QualityStatus {
  status: string;
  count: number;
}

export interface UpcomingDeadline {
  type: string;
  title: string;
  description: string;
  dueDate: string;
  entityId: number;
  entityType: string;
  priority?: number;
  amount?: number;
}

export class DashboardService {
  public static GetMetrics = async (
    dateRange: string = "This Month",
    locationId?: number
  ): Promise<DashboardMetrics | null> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    const tenantID = storage?.tenantID || 0;

    const url = `/Dashboard/GetMetrics`;
    return Instense.get(url, {
      params: {
        tenantId: tenantID,
        dateRange,
        ...(locationId != null ? { locationId } : {}),
      },
    }).then((response) => {
      return response.data.result as DashboardMetrics;
    });
  };

  public static GetProductionStatus = async (
    period: string = "This Week",
    locationId?: number
  ): Promise<ProductionStatus | null> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    const tenantID = storage?.tenantID || 0;

    const url = `/Dashboard/GetProductionStatus`;
    return Instense.get(url, {
      params: {
        tenantId: tenantID,
        period,
        ...(locationId != null ? { locationId } : {}),
      },
    }).then((response) => {
      return response.data.result as ProductionStatus;
    });
  };

  public static GetRevenueTrends = async (
    period: string = "30days",
    locationId?: number
  ): Promise<RevenueTrends | null> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    const tenantID = storage?.tenantID || 0;

    const url = `/Dashboard/GetRevenueTrends`;
    return Instense.get(url, {
      params: {
        tenantId: tenantID,
        period,
        ...(locationId != null ? { locationId } : {}),
      },
    }).then((response) => {
      return response.data.result as RevenueTrends;
    });
  };

  public static GetRecentActivities = async (
    limit: number = 20,
    locationId?: number
  ): Promise<RecentActivity[] | null> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    const tenantID = storage?.tenantID || 0;

    const url = `/Dashboard/GetRecentActivities`;
    return Instense.get(url, {
      params: {
        tenantId: tenantID,
        limit,
        ...(locationId != null ? { locationId } : {}),
      },
    }).then((response) => {
      return response.data.result as RecentActivity[];
    });
  };

  public static GetAlerts = async (
    locationId?: number
  ): Promise<Alert[] | null> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    const tenantID = storage?.tenantID || 0;

    const url = `/Dashboard/GetAlerts`;
    return Instense.get(url, {
      params: {
        tenantId: tenantID,
        ...(locationId != null ? { locationId } : {}),
      },
    }).then((response) => {
      return response.data.result as Alert[];
    });
  };

  public static GetTopCustomers = async (
    limit: number = 5,
    locationId?: number
  ): Promise<TopCustomer[] | null> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    const tenantID = storage?.tenantID || 0;

    const url = `/Dashboard/GetTopCustomers`;
    return Instense.get(url, {
      params: {
        tenantId: tenantID,
        limit,
        ...(locationId != null ? { locationId } : {}),
      },
    }).then((response) => {
      return response.data.result as TopCustomer[];
    });
  };

  public static GetTopProducts = async (
    limit: number = 5,
    locationId?: number
  ): Promise<TopProduct[] | null> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    const tenantID = storage?.tenantID || 0;

    const url = `/Dashboard/GetTopProducts`;
    return Instense.get(url, {
      params: {
        tenantId: tenantID,
        limit,
        ...(locationId != null ? { locationId } : {}),
      },
    }).then((response) => {
      return response.data.result as TopProduct[];
    });
  };

  public static GetQualityStatus = async (
    locationId?: number
  ): Promise<QualityStatus[] | null> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    const tenantID = storage?.tenantID || 0;

    const url = `/Dashboard/GetQualityStatus`;
    return Instense.get(url, {
      params: {
        tenantId: tenantID,
        ...(locationId != null ? { locationId } : {}),
      },
    }).then((response) => {
      return response.data.result as QualityStatus[];
    });
  };

  public static GetUpcomingDeadlines = async (
    days: number = 7,
    locationId?: number
  ): Promise<UpcomingDeadline[] | null> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    const tenantID = storage?.tenantID || 0;

    const url = `/Dashboard/GetUpcomingDeadlines`;
    return Instense.get(url, {
      params: {
        tenantId: tenantID,
        days,
        ...(locationId != null ? { locationId } : {}),
      },
    }).then((response) => {
      return response.data.result as UpcomingDeadline[];
    });
  };
}
