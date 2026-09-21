import api from "./apiClient";

export type SupportCategory =
  | "Bug"
  | "HowTo"
  | "Billing"
  | "Access"
  | "DataIssue"
  | "Other";

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

export async function createSupportTicket(input: {
  category: SupportCategory | string;
  subject: string;
  description: string;
  appSource?: string;
  appVersion?: string;
  attachment?: File | null;
}): Promise<SupportTicketCreateResult> {
  const form = new FormData();
  form.append("category", input.category || "Other");
  form.append("subject", input.subject.trim());
  form.append("description", input.description.trim());
  form.append("appSource", input.appSource || "PWA");
  form.append("product", "CimmpleFlow");
  if (input.appVersion) form.append("appVersion", input.appVersion);
  form.append("linkPath", window.location.pathname + window.location.search);
  form.append("userAgent", navigator.userAgent);
  if (input.attachment) form.append("attachment", input.attachment);

  const { data } = await api.post("/SupportTickets/Create", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });

  return {
    ticketId: data?.result?.ticketId ?? 0,
    emailQueued: !!data?.result?.emailQueued,
    emailError: data?.result?.emailError ?? null,
  };
}
