import api from "./apiClient";

export interface AppNotification {
  id: number;
  type: string;
  title: string;
  body: string;
  entityType?: string | null;
  entityId?: number | null;
  linkPath?: string | null;
  isRead: boolean;
  readAt?: string | null;
  emailSent?: boolean;
  createdAt: string;
  actorUserId?: number | null;
}

export class NotificationService {
  public static async GetUnreadCount(): Promise<number> {
    const response = await api.get("/Notifications/GetUnreadCount");
    return typeof response.data?.result === "number" ? response.data.result : 0;
  }

  public static async GetMine(
    take = 20,
    unreadOnly = false
  ): Promise<{ items: AppNotification[]; unreadCount: number }> {
    const response = await api.get("/Notifications/GetMine", {
      params: { take, unreadOnly },
    });
    const items = Array.isArray(response.data?.result) ? response.data.result : [];
    const unreadCount =
      typeof response.data?.unreadCount === "number"
        ? response.data.unreadCount
        : items.filter((n: AppNotification) => !n.isRead).length;
    return { items, unreadCount };
  }

  public static async MarkRead(ids: number[]): Promise<number> {
    const response = await api.post("/Notifications/MarkRead", { ids });
    return response.data?.result?.marked ?? 0;
  }

  public static async MarkAllRead(): Promise<number> {
    const response = await api.post("/Notifications/MarkRead", { markAll: true });
    return response.data?.result?.marked ?? 0;
  }
}

/**
 * Map ERP desktop deep links to PWA routes when possible.
 * Unknown paths return null (caller marks read only).
 */
export function mapNotificationLinkToPwa(linkPath?: string | null, entityType?: string | null, entityId?: number | null): string | null {
  if (entityType && entityId && entityId > 0) {
    const et = entityType.toLowerCase();
    if (et === "conversation") return null; // handled by chat sheet
    if (et === "ncr" || et === "nonconformancereport") return `/quality/${entityId}`;
    if (et === "joborder" || et === "job") return `/jobs/${entityId}`;
  }

  if (!linkPath) return null;
  const path = linkPath.trim();
  if (!path) return null;

  if (/^\/messages\?/i.test(path)) return null;

  const qualityOpen = path.match(/^\/quality\?open=(\d+)/i);
  if (qualityOpen) return `/quality/${qualityOpen[1]}`;
  if (/^\/quality\/?\d*$/i.test(path.split("?")[0])) {
    const id = path.match(/\/quality\/(\d+)/i);
    if (id) return `/quality/${id[1]}`;
    return "/quality";
  }

  const jobOpen = path.match(/^\/job-orders\?open=(\d+)/i);
  if (jobOpen) return `/jobs/${jobOpen[1]}`;
  if (/^\/job-orders/i.test(path)) return "/jobs";
  if (/^\/jobs\/(\d+)/i.test(path)) return path.split("?")[0];

  return null;
}
