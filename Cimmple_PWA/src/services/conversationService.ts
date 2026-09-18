import api from "./apiClient";

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
  createdAt: string;
  isMine: boolean;
}

export interface ConversationThread {
  id: number;
  subject?: string | null;
  otherUserName: string;
  messages: ConversationMessage[];
}

export class ConversationService {
  public static async ListMine(
    take = 30
  ): Promise<{ items: ConversationListItem[]; unreadCount: number }> {
    const response = await api.get("/Conversations/ListMine", { params: { take } });
    const items: ConversationListItem[] = Array.isArray(response.data?.result)
      ? response.data.result
      : [];
    const unreadCount =
      typeof response.data?.unreadCount === "number"
        ? response.data.unreadCount
        : items.reduce((sum, i) => sum + (i.unreadCount || 0), 0);
    return { items, unreadCount };
  }

  public static async Get(id: number, take = 100): Promise<ConversationThread | null> {
    const response = await api.get(`/Conversations/Get/${id}`, { params: { take } });
    return (response.data?.result as ConversationThread) ?? null;
  }

  public static async Reply(conversationId: number, body: string): Promise<void> {
    await api.post("/Conversations/Reply", { conversationId, body, sendEmail: false });
  }
}
