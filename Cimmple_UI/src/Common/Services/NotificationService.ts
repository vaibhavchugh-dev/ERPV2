import Instense from "./Axios-config";

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

export interface SendNotificationRequest {
  recipientUserId: number;
  title?: string;
  body: string;
  entityType?: string;
  entityId?: number;
  linkPath?: string;
  sendEmail?: boolean;
}

export interface SendNotificationResult {
  id?: number | null;
  conversationId?: number | null;
  messageId?: number | null;
  inboxCreated: boolean;
  emailSent: boolean;
  emailError?: string | null;
}

export class NotificationService {
  public static async GetUnreadCount(): Promise<number> {
    const response = await Instense.get("/Notifications/GetUnreadCount");
    return typeof response.data?.result === "number" ? response.data.result : 0;
  }

  public static async GetMine(
    take = 20,
    unreadOnly = false
  ): Promise<{ items: AppNotification[]; unreadCount: number }> {
    const response = await Instense.get("/Notifications/GetMine", {
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
    const response = await Instense.post("/Notifications/MarkRead", { ids });
    return response.data?.result?.marked ?? 0;
  }

  public static async MarkAllRead(): Promise<number> {
    const response = await Instense.post("/Notifications/MarkRead", { markAll: true });
    return response.data?.result?.marked ?? 0;
  }

  public static async Send(request: SendNotificationRequest): Promise<SendNotificationResult> {
    const response = await Instense.post("/Notifications/Send", request);
    return response.data?.result as SendNotificationResult;
  }
}
