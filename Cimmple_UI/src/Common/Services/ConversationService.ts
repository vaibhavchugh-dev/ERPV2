import Instense from "./Axios-config";

export interface ConversationListItem {
  id: number;
  subject?: string | null;
  lastMessageAt?: string | null;
  lastMessagePreview?: string | null;
  otherUserId: number;
  otherUserName: string;
  unreadCount: number;
}

export interface ConversationMessage {
  id: number;
  senderUserId: number;
  senderName: string;
  body: string;
  parentMessageId?: number | null;
  createdAt: string;
  isMine: boolean;
}

export interface ConversationThread {
  id: number;
  subject?: string | null;
  otherUserName: string;
  lastMessageAt?: string | null;
  messages: ConversationMessage[];
}

export class ConversationService {
  public static async ListMine(
    take = 50
  ): Promise<{ items: ConversationListItem[]; unreadCount: number }> {
    const response = await Instense.get("/Conversations/ListMine", { params: { take } });
    const items: ConversationListItem[] = Array.isArray(response.data?.result)
      ? response.data.result
      : [];
    const unreadCount =
      typeof response.data?.unreadCount === "number"
        ? response.data.unreadCount
        : items.reduce((sum, i) => sum + (i.unreadCount || 0), 0);
    return { items, unreadCount };
  }

  public static async GetUnreadCount(): Promise<number> {
    const response = await Instense.get("/Conversations/GetUnreadCount");
    return typeof response.data?.result === "number" ? response.data.result : 0;
  }

  public static async Get(id: number, take = 100): Promise<ConversationThread | null> {
    const response = await Instense.get(`/Conversations/Get/${id}`, { params: { take } });
    return (response.data?.result as ConversationThread) ?? null;
  }

  public static async Reply(
    conversationId: number,
    body: string,
    sendEmail = false
  ): Promise<{ messageId: number; conversationId: number }> {
    const response = await Instense.post("/Conversations/Reply", {
      conversationId,
      body,
      sendEmail,
    });
    return {
      messageId: response.data?.result?.messageId ?? 0,
      conversationId: response.data?.result?.conversationId ?? conversationId,
    };
  }

  public static async MarkRead(conversationId: number): Promise<void> {
    await Instense.post("/Conversations/MarkRead", { conversationId });
  }
}
