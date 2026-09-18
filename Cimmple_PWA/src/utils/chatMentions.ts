/** Stored token: @[type:id|Label] */
export const CHAT_MENTION_RE = /@\[([a-zA-Z]+):(\d+)\|([^\]]+)\]/g;

export function formatChatMentionToken(type: string, id: number, label: string): string {
  const safeLabel = (label || `${type} ${id}`).replace(/[\[\]]/g, "").trim() || `${type} ${id}`;
  return `@[${type}:${id}|${safeLabel}]`;
}

/** Preview / list text: `@[order:2027|CO#1018]` → `@CO#1018`. */
export function stripMentionTokensForPreview(body: string): string {
  if (!body) return body;
  return body.replace(new RegExp(CHAT_MENTION_RE.source, "g"), "@$3");
}

export function typeBadge(type: string): string {
  switch (type) {
    case "order": return "CO";
    case "quotation": return "CQ";
    case "jobOrder": return "JO";
    case "vendorOrder": return "VO";
    case "vendorQuotation": return "VQ";
    case "invoice": return "CI";
    case "vendorInvoice": return "VI";
    case "ncrReport": return "NCR";
    case "user": return "User";
    default: return type;
  }
}

export function pwaUrlForMention(type: string, id: number): string | null {
  switch (type) {
    case "ncrReport":
      return `/quality/${id}`;
    case "jobOrder":
      return `/jobs/${id}`;
    default:
      return null;
  }
}

export function parseMentionParts(body: string): { text?: string; label?: string; url?: string | null }[] {
  const parts: { text?: string; label?: string; url?: string | null }[] = [];
  const re = new RegExp(CHAT_MENTION_RE.source, "g");
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    if (m.index > last) parts.push({ text: body.slice(last, m.index) });
    parts.push({ label: m[3], url: pwaUrlForMention(m[1], Number(m[2])) });
    last = m.index + m[0].length;
  }
  if (last < body.length) parts.push({ text: body.slice(last) });
  if (parts.length === 0) parts.push({ text: body });
  return parts;
}
