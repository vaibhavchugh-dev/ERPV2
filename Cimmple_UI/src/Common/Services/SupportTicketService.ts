import Instense from "./Axios-config";

export type SupportCategory =
  | "Bug"
  | "HowTo"
  | "Billing"
  | "Access"
  | "DataIssue"
  | "Other";

export interface SupportTicketMessage {
  id: number;
  authorType: string;
  authorName: string;
  body: string;
  createdAt: string;
  isMine: boolean;
}

export interface SupportTicketListItem {
  id: number;
  tenantId?: number;
  tenantName?: string | null;
  locationId?: number | null;
  locationName?: string | null;
  product?: string;
  category: string;
  subject: string;
  status: string;
  appSource: string;
  requesterName?: string | null;
  createdAt: string;
  updatedAt?: string;
  lastMessageAt?: string | null;
  hasAttachment: boolean;
  messageCount?: number;
  hasUnread?: boolean;
}

export interface SupportTicketDetail extends SupportTicketListItem {
  description: string;
  appVersion?: string | null;
  entityType?: string | null;
  entityId?: number | null;
  linkPath?: string | null;
  attachmentFileName?: string | null;
  requesterEmail?: string | null;
  emailQueued: boolean;
  emailError?: string | null;
  messages?: SupportTicketMessage[];
}

export interface SupportTicketCreateInput {
  category: SupportCategory | string;
  subject: string;
  description: string;
  appSource?: string;
  appVersion?: string;
  product?: string;
  locationId?: number | null;
  entityType?: string;
  entityId?: number;
  linkPath?: string;
  attachment?: File | null;
}

export interface SupportTicketCreateResult {
  ticketId: number;
  emailQueued: boolean;
  emailError?: string | null;
}

export const SUPPORT_CATEGORIES: { value: SupportCategory; label: string }[] = [
  { value: "Bug", label: "Bug / unexpected behavior" },
  { value: "HowTo", label: "How do I…?" },
  { value: "Access", label: "Login / permissions" },
  { value: "DataIssue", label: "Data looks wrong" },
  { value: "Billing", label: "Billing / account" },
  { value: "Other", label: "Other" },
];

export class SupportTicketService {
  public static async ListMine(take = 50): Promise<SupportTicketListItem[]> {
    const response = await Instense.get("/SupportTickets/ListMine", { params: { take } });
    return Array.isArray(response.data?.result) ? response.data.result : [];
  }

  public static async GetUnreadCount(): Promise<number> {
    const response = await Instense.get("/SupportTickets/GetUnreadCount");
    return typeof response.data?.result === "number" ? response.data.result : 0;
  }

  public static async Get(id: number): Promise<SupportTicketDetail | null> {
    const response = await Instense.get(`/SupportTickets/Get/${id}`);
    return (response.data?.result as SupportTicketDetail) ?? null;
  }

  public static async Create(
    input: SupportTicketCreateInput
  ): Promise<SupportTicketCreateResult> {
    const form = new FormData();
    form.append("category", input.category || "Other");
    form.append("subject", input.subject.trim());
    form.append("description", input.description.trim());
    form.append("appSource", input.appSource || "UI");
    form.append("product", input.product || "CimmpleFlow");
    if (input.appVersion) form.append("appVersion", input.appVersion);
    if (input.locationId && input.locationId > 0) {
      form.append("locationId", String(input.locationId));
    }
    if (input.entityType) form.append("entityType", input.entityType);
    if (input.entityId && input.entityId > 0) {
      form.append("entityId", String(input.entityId));
    }
    if (input.linkPath) form.append("linkPath", input.linkPath);
    form.append("userAgent", typeof navigator !== "undefined" ? navigator.userAgent : "");
    if (input.attachment) {
      form.append("attachment", input.attachment);
    }

    const response = await Instense.post("/SupportTickets/Create", form, {
      headers: { "Content-Type": "multipart/form-data" },
    });

    return {
      ticketId: response.data?.result?.ticketId ?? 0,
      emailQueued: !!response.data?.result?.emailQueued,
      emailError: response.data?.result?.emailError ?? null,
    };
  }

  public static async Reply(
    ticketId: number,
    body: string
  ): Promise<{ messageId: number; emailQueued: boolean; emailError?: string | null }> {
    const response = await Instense.post("/SupportTickets/Reply", { ticketId, body });
    return {
      messageId: response.data?.result?.messageId ?? 0,
      emailQueued: !!response.data?.result?.emailQueued,
      emailError: response.data?.result?.emailError ?? null,
    };
  }

  public static async DownloadAttachment(ticketId: number): Promise<void> {
    const response = await Instense.get(`/SupportTickets/DownloadAttachment/${ticketId}`, {
      responseType: "blob",
    });
    const blob = response.data as Blob;
    const disposition = response.headers?.["content-disposition"] as string | undefined;
    let fileName = `support-ticket-${ticketId}-attachment`;
    if (disposition) {
      const match = /filename\*?=(?:UTF-8''|")?([^\";]+)/i.exec(disposition);
      if (match?.[1]) {
        try {
          fileName = decodeURIComponent(match[1].replace(/"/g, "").trim());
        } catch {
          fileName = match[1].replace(/"/g, "").trim();
        }
      }
    }
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  }
}
