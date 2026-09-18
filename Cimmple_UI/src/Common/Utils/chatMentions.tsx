import React from "react";
import { SearchResult, GlobalSearchService } from "../Services/GlobalSearchService";

/** Stored token: @[type:id|Label] — Label may not contain ']' */
export const CHAT_MENTION_RE = /@\[([a-zA-Z]+):(\d+)\|([^\]]+)\]/g;

export type ChatMentionKind = "user" | "document";

export interface ChatMentionOption {
  kind: ChatMentionKind;
  type: string;
  id: number;
  label: string;
  subtitle?: string;
}

export function formatChatMentionToken(type: string, id: number, label: string): string {
  const safeLabel = (label || `${type} ${id}`).replace(/[\[\]]/g, "").trim() || `${type} ${id}`;
  return `@[${type}:${id}|${safeLabel}]`;
}

/** Preview / list text: `@[order:2027|CO#1018]` → `@CO#1018`. */
export function stripMentionTokensForPreview(body: string): string {
  if (!body) return body;
  return body.replace(new RegExp(CHAT_MENTION_RE.source, "g"), "@$3");
}

export function mentionTokenFromUser(userId: number, label: string): string {
  return formatChatMentionToken("user", userId, label);
}

export function mentionTokenFromSearchResult(result: SearchResult): string {
  const label = GlobalSearchService.getResultDisplayName(result) || `${result.type} ${result.id}`;
  return formatChatMentionToken(result.type, result.id, label);
}

export function mentionTokenFromOption(opt: ChatMentionOption): string {
  return formatChatMentionToken(opt.type, opt.id, opt.label);
}

/**
 * Composer shows friendly `@CO#1018`; on send replace with durable `@[order:id|CO#1018]`.
 * Longer labels first to avoid partial overlaps.
 */
export function encodePendingMentionsInBody(body: string, pending: ChatMentionOption[]): string {
  if (!body || pending.length === 0) return body;
  const stillPresent = pending.filter((p) => body.includes(`@${p.label}`));
  const sorted = [...stillPresent].sort((a, b) => b.label.length - a.label.length);
  let next = body;
  for (const p of sorted) {
    const needle = `@${p.label}`;
    const token = mentionTokenFromOption(p);
    // Replace all occurrences of this friendly mention
    next = next.split(needle).join(token);
  }
  return next;
}

export function urlForChatMention(type: string, id: number): string | null {
  if (type === "user" || type === "employee") return null;
  const fake = { id, type } as SearchResult;
  const url = GlobalSearchService.getResultUrl(fake);
  return url && url !== "/home" ? url : null;
}

export function extractMentionedUserIds(body: string): number[] {
  const ids: number[] = [];
  const re = new RegExp(CHAT_MENTION_RE.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    if (m[1].toLowerCase() === "user") {
      const id = Number(m[2]);
      if (id > 0 && !ids.includes(id)) ids.push(id);
    }
  }
  return ids;
}

export function flattenDocumentSearchResults(results: ReturnType<typeof GlobalSearchService.emptyResults>): SearchResult[] {
  // Round-robin across doc types so CO/CQ/VO/VQ aren't crowded out by JO/NCR.
  const buckets: SearchResult[][] = [
    results.orders || [],
    results.quotations || [],
    results.vendorOrders || [],
    results.vendorQuotations || [],
    results.jobOrders || [],
    results.ncrReports || [],
  ];
  const out: SearchResult[] = [];
  const seen = new Set<string>();
  let index = 0;
  let added = true;
  while (out.length < 12 && added) {
    added = false;
    for (const list of buckets) {
      if (index < list.length) {
        const r = list[index];
        const key = `${r.type}:${r.id}`;
        if (!seen.has(key)) {
          seen.add(key);
          out.push(r);
          added = true;
          if (out.length >= 12) break;
        } else {
          added = true; // keep scanning other buckets at this index
        }
      }
    }
    index++;
  }
  return out;
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
    case "shipment": return "SH";
    case "user": return "User";
    case "employee": return "Emp";
    case "customer": return "Cust";
    case "vendor": return "Vend";
    case "product": return "Part";
    case "rawMaterial": return "RM";
    default: return type;
  }
}

/** Renders message body with clickable document mentions. */
export function ChatMessageBody({
  body,
  isMine,
  onOpenDocument,
}: {
  body: string;
  isMine?: boolean;
  onOpenDocument?: (url: string) => void;
}) {
  const parts: React.ReactNode[] = [];
  const re = new RegExp(CHAT_MENTION_RE.source, "g");
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(body)) !== null) {
    if (m.index > last) {
      parts.push(<span key={`t${key++}`}>{body.slice(last, m.index)}</span>);
    }
    const type = m[1];
    const id = Number(m[2]);
    const label = m[3];
    const url = urlForChatMention(type, id);
    if (url && onOpenDocument) {
      parts.push(
        <button
          key={`m${key++}`}
          type="button"
          className={`chat-mention-link ${isMine ? "mine" : "theirs"}`}
          onClick={(e) => {
            e.stopPropagation();
            onOpenDocument(url);
          }}
          title={label}
        >
          @{label}
        </button>
      );
    } else {
      parts.push(
        <span key={`m${key++}`} className={`chat-mention-plain ${isMine ? "mine" : "theirs"}`}>
          @{label}
        </span>
      );
    }
    last = m.index + m[0].length;
  }
  if (last < body.length) {
    parts.push(<span key={`t${key++}`}>{body.slice(last)}</span>);
  }
  if (parts.length === 0) return <>{body}</>;
  return <>{parts}</>;
}
