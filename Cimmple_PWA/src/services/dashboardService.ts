import api from "./apiClient";
import { AuthService } from "./authService";

/** Mirrors Cimmple_UI DashboardService.Alert */
export interface DashboardAlert {
  type: string;
  priority: "high" | "medium" | "low" | string;
  title: string;
  description: string;
  entityId: number;
  entityType: string;
  dueDate?: string;
  createdDate?: string;
  amount?: number;
}

export class DashboardService {
  /** Same endpoint/params as Cimmple_UI DashboardService.GetAlerts */
  public static async getAlerts(): Promise<DashboardAlert[]> {
    let tenantID = AuthService.getTenantId();
    if (tenantID === 0 && import.meta.env.DEV) {
      tenantID = 1;
    }

    const response = await api.get("/Dashboard/GetAlerts", {
      params: { tenantId: tenantID },
    });
    return (response.data.result as DashboardAlert[]) || [];
  }
}
