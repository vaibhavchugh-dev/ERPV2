import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPaperPlane, faTimes } from "@fortawesome/free-solid-svg-icons";
import { toast } from "react-toastify";
import { useHistory } from "react-router-dom";
import {
  ConversationService,
  ConversationMessage,
  ConversationThread,
} from "../Services/ConversationService";
import { UserManagementService } from "../Services/UserManagementService";
import { GlobalSearchService, SearchResult } from "../Services/GlobalSearchService";
import {
  ChatMentionOption,
  ChatMessageBody,
  encodePendingMentionsInBody,
  flattenDocumentSearchResults,
  navigateToMentionDocument,
  typeBadge,
} from "../Utils/chatMentions";
import { formatDateTime } from "../Utils/Formatting";
import "./ConversationPanel.scss";

interface ConversationPanelProps {
  conversationId: number | null;
  onClose: () => void;
  onChanged?: () => void;
}

const ConversationPanel: React.FC<ConversationPanelProps> = ({
  conversationId,
  onClose,
  onChanged,
}) => {
  const history = useHistory();
  const [thread, setThread] = useState<ConversationThread | null>(null);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [people, setPeople] = useState<ChatMentionOption[]>([]);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionStart, setMentionStart] = useState<number | null>(null);
  const [mentionQuery, setMentionQuery] = useState("");
  const [docOptions, setDocOptions] = useState<ChatMentionOption[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [pendingMentions, setPendingMentions] = useState<ChatMentionOption[]>([]);
  const listRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const onChangedRef = useRef(onChanged);
  onChangedRef.current = onChanged;

  const load = useCallback(async (id: number, opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    try {
      const data = await ConversationService.Get(id);
      if (!data) {
        if (!opts?.silent) setThread(null);
        return;
      }
      setThread((prev) => {
        if (!opts?.silent || !prev || prev.id !== data.id) return data;
        const prevIds = new Set((prev.messages || []).map((m) => m.id));
        const nextMsgs = data.messages || [];
        const hasNew =
          nextMsgs.length !== (prev.messages || []).length ||
          nextMsgs.some((m) => !prevIds.has(m.id));
        return hasNew ? data : prev;
      });
      onChangedRef.current?.();
    } catch {
      if (!opts?.silent) {
        toast.error("Failed to load conversation.");
        setThread(null);
      }
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!conversationId) {
      setThread(null);
      setDraft("");
      setPendingMentions([]);
      return;
    }
    void load(conversationId);
  }, [conversationId, load]);

  // Poll open thread so replies appear without closing the slideout
  useEffect(() => {
    if (!conversationId) return;
    const POLL_MS = 5000;
    const tick = () => {
      if (document.visibilityState === "visible") {
        void load(conversationId, { silent: true });
      }
    };
    const id = window.setInterval(tick, POLL_MS);
    const onVis = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [conversationId, load]);

  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [thread?.messages?.length]);

  useEffect(() => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    const tenantId = storage?.tenantID || 0;
    const currentUserId = Number(
      storage?.userId || storage?.user_UniqueID || storage?.userUniqueID || 0
    );
    if (!tenantId) return;
    UserManagementService.GetUsers({
      tenantid: tenantId,
      pageNumber: 1,
      pageSize: 200,
      status: "Active",
    })
      .then((res: any) => {
        const raw = res?.users || res?.result?.users || [];
        const opts: ChatMentionOption[] = (Array.isArray(raw) ? raw : [])
          .map((u: any) => {
            const userId = Number(u.userUniqueID ?? u.UserUniqueID ?? u.user_UniqueID ?? 0);
            const name = `${u.firstName ?? u.FirstName ?? ""} ${u.lastName ?? u.LastName ?? ""}`.trim();
            const label = name || u.userName || u.UserName || u.email || `User ${userId}`;
            return {
              kind: "user" as const,
              type: "user",
              id: userId,
              label,
              subtitle: u.email || u.Email || u.userName || u.UserName,
            };
          })
          .filter((o: ChatMentionOption) => o.id > 0 && o.id !== currentUserId);
        setPeople(opts);
      })
      .catch(() => setPeople([]));
  }, []);

  const filteredPeople = useMemo(() => {
    const q = mentionQuery.trim().toLowerCase();
    if (!q) return people.slice(0, 6);
    return people
      .filter(
        (p) =>
          p.label.toLowerCase().includes(q) ||
          (p.subtitle || "").toLowerCase().includes(q)
      )
      .slice(0, 6);
  }, [people, mentionQuery]);

  useEffect(() => {
    if (!mentionOpen) {
      setDocOptions([]);
      return;
    }
    const q = mentionQuery.trim();
    if (q.length < 1) {
      setDocOptions([]);
      return;
    }
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    const tenantId = storage?.tenantID || 0;
    if (!tenantId) return;

    let cancelled = false;
    setDocsLoading(true);
    const timer = window.setTimeout(() => {
      GlobalSearchService.SearchDocuments(q, tenantId, 6)
        .then((res) => {
          if (cancelled) return;
          const docs = flattenDocumentSearchResults(res).map((r: SearchResult) => ({
            kind: "document" as const,
            type: r.type,
            id: r.id,
            label: GlobalSearchService.getResultDisplayName(r) || `${r.type} ${r.id}`,
            subtitle: typeBadge(r.type),
          }));
          setDocOptions(docs);
        })
        .catch(() => {
          if (!cancelled) setDocOptions([]);
        })
        .finally(() => {
          if (!cancelled) setDocsLoading(false);
        });
    }, 150);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [mentionOpen, mentionQuery]);

  const pickerItems = useMemo(() => {
    const items: ChatMentionOption[] = [...filteredPeople, ...docOptions];
    return items;
  }, [filteredPeople, docOptions]);

  useEffect(() => {
    setHighlightIndex(0);
  }, [mentionQuery, filteredPeople.length, docOptions.length]);

  const updateMentionState = useCallback((value: string, caret: number) => {
    const before = value.slice(0, caret);
    const at = before.lastIndexOf("@");
    if (at < 0) {
      setMentionOpen(false);
      setMentionStart(null);
      return;
    }
    const charBefore = at === 0 ? " " : before[at - 1];
    if (charBefore && !/\s/.test(charBefore) && charBefore !== "(") {
      setMentionOpen(false);
      setMentionStart(null);
      return;
    }
    // Don't reopen inside an already-inserted token @[...]
    const afterAt = before.slice(at + 1);
    if (afterAt.startsWith("[")) {
      setMentionOpen(false);
      setMentionStart(null);
      return;
    }
    if (/\s/.test(afterAt)) {
      setMentionOpen(false);
      setMentionStart(null);
      return;
    }
    setMentionStart(at);
    setMentionQuery(afterAt);
    setMentionOpen(true);
  }, []);

  const insertMention = (opt: ChatMentionOption) => {
    if (mentionStart == null || !textareaRef.current) return;
    const caret = textareaRef.current.selectionStart ?? draft.length;
    const before = draft.slice(0, mentionStart);
    const after = draft.slice(caret);
    // Friendly text in the composer; durable token is applied on send.
    const insertion = `@${opt.label} `;
    const next = before + insertion + after;
    setDraft(next);
    setPendingMentions((prev) =>
      prev.some((p) => p.type === opt.type && p.id === opt.id) ? prev : [...prev, opt]
    );
    setMentionOpen(false);
    setMentionStart(null);
    setMentionQuery("");
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      const pos = before.length + insertion.length;
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  };

  if (!conversationId) return null;

  const formatTime = (iso: string) => {
    if (!iso) return "";
    return formatDateTime(iso) || "";
  };

  const handleSend = async () => {
    if (!draft.trim() || !conversationId) return;
    const raw = draft.trim();
    const pendingSnapshot = pendingMentions;
    const text = encodePendingMentionsInBody(raw, pendingSnapshot);
    setSending(true);
    setDraft("");
    setPendingMentions([]);
    setMentionOpen(false);
    try {
      const result = await ConversationService.Reply(conversationId, text, false);
      setThread((prev) => {
        if (!prev) return prev;
        const mine: ConversationMessage = {
          id: result.messageId || Date.now(),
          senderUserId: 0,
          senderName: "You",
          body: text,
          createdAt: new Date().toISOString(),
          isMine: true,
        };
        return { ...prev, messages: [...prev.messages, mine] };
      });
      onChangedRef.current?.();
    } catch (err: any) {
      setDraft(raw);
      setPendingMentions(pendingSnapshot);
      const msg =
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        "Failed to send reply.";
      toast.error(typeof msg === "string" ? msg : "Failed to send reply.");
    } finally {
      setSending(false);
    }
  };

  const title =
    thread?.subject ||
    (thread?.otherUserName ? `Chat with ${thread.otherUserName}` : "Conversation");

  return (
    <div className="conversation-panel-overlay" onClick={onClose}>
      <div
        className="conversation-panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Conversation"
      >
        <div className="conversation-panel-header">
          <div className="conversation-panel-title">
            <div className="conversation-panel-title-main">{title}</div>
            {thread?.otherUserName && thread?.subject && (
              <div className="conversation-panel-title-sub">{thread.otherUserName}</div>
            )}
          </div>
          <button type="button" className="conversation-panel-close" onClick={onClose} aria-label="Close">
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>

        <div className="conversation-panel-messages" ref={listRef}>
          {loading && !thread ? (
            <div className="conversation-panel-empty">Loading…</div>
          ) : !thread || thread.messages.length === 0 ? (
            <div className="conversation-panel-empty">No messages yet</div>
          ) : (
            thread.messages.map((m: ConversationMessage) => (
              <div
                key={m.id}
                className={`conversation-bubble ${m.isMine ? "mine" : "theirs"}`}
              >
                {!m.isMine && (
                  <div className="conversation-bubble-name">{m.senderName}</div>
                )}
                <div className="conversation-bubble-body">
                  <ChatMessageBody
                    body={m.body}
                    isMine={m.isMine}
                    onOpenDocument={(url) => {
                      navigateToMentionDocument(url, history, { onBeforeNavigate: onClose });
                    }}
                  />
                </div>
                <div className="conversation-bubble-time">{formatTime(m.createdAt)}</div>
              </div>
            ))
          )}
        </div>

        <div className="conversation-panel-composer">
          <div className="conversation-mention-wrap">
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={(e) => {
                const value = e.target.value;
                setDraft(value);
                updateMentionState(value, e.target.selectionStart ?? value.length);
              }}
              placeholder="Write a reply… Type @ for people or documents"
              rows={2}
              disabled={sending}
              onKeyDown={(e) => {
                if (mentionOpen && pickerItems.length > 0) {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setHighlightIndex((i) => (i + 1) % pickerItems.length);
                    return;
                  }
                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setHighlightIndex((i) => (i - 1 + pickerItems.length) % pickerItems.length);
                    return;
                  }
                  if (e.key === "Enter" || e.key === "Tab") {
                    e.preventDefault();
                    insertMention(pickerItems[highlightIndex]);
                    return;
                  }
                  if (e.key === "Escape") {
                    setMentionOpen(false);
                    return;
                  }
                }
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void handleSend();
                }
              }}
            />
            {mentionOpen && (
              <div className="conversation-mention-picker">
                {filteredPeople.length > 0 && (
                  <div className="conversation-mention-section">People</div>
                )}
                {filteredPeople.map((opt, idx) => (
                  <button
                    key={`u-${opt.id}`}
                    type="button"
                    className={`conversation-mention-item ${idx === highlightIndex ? "active" : ""}`}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      insertMention(opt);
                    }}
                  >
                    <span className="conversation-mention-badge">User</span>
                    <span className="conversation-mention-label">{opt.label}</span>
                    {opt.subtitle && (
                      <span className="conversation-mention-sub">{opt.subtitle}</span>
                    )}
                  </button>
                ))}
                {(docOptions.length > 0 || docsLoading) && (
                  <div className="conversation-mention-section">Documents</div>
                )}
                {docsLoading && docOptions.length === 0 && (
                  <div className="conversation-mention-empty">Searching…</div>
                )}
                {docOptions.map((opt, i) => {
                  const idx = filteredPeople.length + i;
                  return (
                    <button
                      key={`d-${opt.type}-${opt.id}`}
                      type="button"
                      className={`conversation-mention-item ${idx === highlightIndex ? "active" : ""}`}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        insertMention(opt);
                      }}
                    >
                      <span className="conversation-mention-badge">{opt.subtitle || typeBadge(opt.type)}</span>
                      <span className="conversation-mention-label">{opt.label}</span>
                    </button>
                  );
                })}
                {!docsLoading &&
                  filteredPeople.length === 0 &&
                  docOptions.length === 0 && (
                    <div className="conversation-mention-empty">
                      {mentionQuery.trim()
                        ? "No matches"
                        : "Type a name or document number"}
                    </div>
                  )}
              </div>
            )}
          </div>
          <button
            type="button"
            className="conversation-panel-send"
            disabled={sending || !draft.trim()}
            onClick={() => void handleSend()}
          >
            <FontAwesomeIcon icon={faPaperPlane} />
            {sending ? "Sending…" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConversationPanel;
