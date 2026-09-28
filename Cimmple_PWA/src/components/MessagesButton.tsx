import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ConversationListItem,
  ConversationService,
  ConversationThread,
} from "../services/conversationService";
import { parseMentionParts, stripMentionTokensForPreview } from "../utils/chatMentions";
import { formatRelativeTime, HEADER_DROPDOWN_PANEL_CLASS } from "../utils/relativeTime";

const POLL_MS = 45_000;

function CommentsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
    </svg>
  );
}

export function MessagesButton() {
  const navigate = useNavigate();
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<ConversationListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [chatId, setChatId] = useState<number | null>(null);
  const [thread, setThread] = useState<ConversationThread | null>(null);
  const [chatLoading, setChatLoading] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const chatListRef = useRef<HTMLDivElement>(null);
  const hasItemsRef = useRef(false);
  const [panelTop, setPanelTop] = useState(56);

  useEffect(() => {
    hasItemsRef.current = items.length > 0;
  }, [items.length]);

  const refresh = useCallback(async (opts?: { showLoading?: boolean }) => {
    if (opts?.showLoading && !hasItemsRef.current) setLoading(true);
    try {
      const { items: list, unreadCount: count } = await ConversationService.ListMine(30);
      setItems(list);
      setUnreadCount(count);
    } catch {
      if (opts?.showLoading && !hasItemsRef.current) setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadChat = useCallback(async (id: number, opts?: { silent?: boolean }) => {
    if (!opts?.silent) setChatLoading(true);
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
      void refresh();
    } catch {
      if (!opts?.silent) setThread(null);
    } finally {
      if (!opts?.silent) setChatLoading(false);
    }
  }, [refresh]);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, POLL_MS);
    const onVis = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [refresh]);

  useEffect(() => {
    if (!open) return;
    void refresh({ showLoading: true });
    const btn = panelRef.current?.querySelector("button");
    if (btn) {
      const rect = btn.getBoundingClientRect();
      setPanelTop(Math.round(rect.bottom + 8));
    }
    const onPointer = (e: MouseEvent | TouchEvent) => {
      if (chatId) return;
      const el = panelRef.current;
      if (el && e.target instanceof Node && !el.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("touchstart", onPointer);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("touchstart", onPointer);
    };
  }, [open, refresh, chatId]);

  useEffect(() => {
    if (chatId) void loadChat(chatId);
    else {
      setThread(null);
      setDraft("");
    }
  }, [chatId, loadChat]);

  useEffect(() => {
    if (chatId == null) return;
    const CHAT_POLL_MS = 5000;
    const tick = () => {
      if (document.visibilityState === "visible") {
        void loadChat(chatId, { silent: true });
      }
    };
    const id = window.setInterval(tick, CHAT_POLL_MS);
    const onVis = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [chatId, loadChat]);

  useEffect(() => {
    if (!chatListRef.current) return;
    chatListRef.current.scrollTop = chatListRef.current.scrollHeight;
  }, [thread?.messages?.length]);

  const handleOpen = () => {
    const next = !open;
    setOpen(next);
    if (next) void refresh({ showLoading: true });
  };

  const handleClickItem = (item: ConversationListItem) => {
    setOpen(false);
    setChatId(item.id);
  };

  const handleReply = async () => {
    if (!chatId || !draft.trim()) return;
    const text = draft.trim();
    setSending(true);
    setDraft("");
    try {
      await ConversationService.Reply(chatId, text);
      setThread((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          messages: [
            ...prev.messages,
            {
              id: Date.now(),
              senderUserId: 0,
              senderName: "You",
              body: text,
              createdAt: new Date().toISOString(),
              isMine: true,
            },
          ],
        };
      });
      void refresh();
    } catch {
      setDraft(text);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => void handleOpen()}
        className="relative inline-flex h-11 w-11 items-center justify-center rounded-full bg-white text-slate-700 shadow-sm dark:bg-slate-800 dark:text-slate-200"
        aria-label="Messages"
        title="Messages"
      >
        <CommentsIcon className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className={HEADER_DROPDOWN_PANEL_CLASS} style={{ top: panelTop }}>
          <div className="border-b border-slate-100 px-4 py-3 dark:border-slate-800">
            <div className="text-sm font-bold text-slate-900 dark:text-white">Messages</div>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {loading && items.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-slate-500">Loading…</div>
            ) : items.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-slate-500">No conversations yet</div>
            ) : (
              items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleClickItem(item)}
                  className={`block w-full border-b border-slate-50 px-4 py-3 text-left last:border-0 dark:border-slate-800 ${
                    item.unreadCount > 0 ? "bg-blue-50/60 dark:bg-blue-950/30" : "bg-white dark:bg-slate-900"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 text-sm font-bold text-slate-900 dark:text-white">
                      {item.otherUserName || "Conversation"}
                    </div>
                    <div className="shrink-0 text-[10px] font-semibold tracking-wide text-slate-400">
                      {formatRelativeTime(item.lastMessageAt)}
                    </div>
                  </div>
                  {(item.subject || item.lastMessagePreview) && (
                    <p className="mt-0.5 line-clamp-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                      {item.subject
                        ? `${item.subject}${item.lastMessagePreview ? ` — ${stripMentionTokensForPreview(item.lastMessagePreview)}` : ""}`
                        : stripMentionTokensForPreview(item.lastMessagePreview || "")}
                    </p>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {chatId != null && (
        <div className="fixed inset-0 z-[60] flex flex-col bg-black/40" onClick={() => setChatId(null)}>
          <div
            className="mt-auto flex max-h-[85vh] flex-col rounded-t-3xl bg-white dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800">
              <div className="min-w-0">
                <div className="truncate text-sm font-bold text-slate-900 dark:text-white">
                  {thread?.subject || (thread?.otherUserName ? `Chat with ${thread.otherUserName}` : "Conversation")}
                </div>
                {thread?.otherUserName && thread?.subject && (
                  <div className="text-xs text-slate-500">{thread.otherUserName}</div>
                )}
              </div>
              <button
                type="button"
                className="rounded-xl px-3 py-1 text-xs font-bold text-slate-500"
                onClick={() => {
                  setChatId(null);
                  void refresh();
                }}
              >
                Close
              </button>
            </div>
            <div ref={chatListRef} className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
              {chatLoading && !thread ? (
                <div className="py-8 text-center text-sm text-slate-500">Loading…</div>
              ) : !thread?.messages?.length ? (
                <div className="py-8 text-center text-sm text-slate-500">No messages yet</div>
              ) : (
                thread.messages.map((m) => (
                  <div
                    key={m.id}
                    className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                      m.isMine
                        ? "ml-auto bg-blue-600 text-white"
                        : "bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100"
                    }`}
                  >
                    {!m.isMine && (
                      <div className="mb-0.5 text-[10px] font-bold opacity-70">{m.senderName}</div>
                    )}
                    <div className="whitespace-pre-wrap break-words">
                      {parseMentionParts(m.body).map((part, i) =>
                        part.label != null ? (
                          part.url ? (
                            <button
                              key={i}
                              type="button"
                              className={`font-bold underline ${m.isMine ? "text-blue-100" : "text-blue-700 dark:text-blue-300"}`}
                              onClick={() => {
                                setChatId(null);
                                navigate(part.url!);
                              }}
                            >
                              @{part.label}
                            </button>
                          ) : (
                            <span key={i} className="font-bold">
                              @{part.label}
                            </span>
                          )
                        ) : (
                          <span key={i}>{part.text}</span>
                        )
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="flex gap-2 border-t border-slate-100 p-3 dark:border-slate-800">
              <input
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Write a reply…"
                className="min-h-tap flex-1 rounded-xl border-none bg-slate-100 px-3 text-sm font-medium dark:bg-slate-800 dark:text-white"
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleReply();
                }}
              />
              <button
                type="button"
                disabled={sending || !draft.trim()}
                onClick={() => void handleReply()}
                className="min-h-tap rounded-xl bg-blue-600 px-4 text-sm font-bold text-white disabled:opacity-50"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
