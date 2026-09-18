import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AppNotification,
  NotificationService,
  mapNotificationLinkToPwa,
} from "../services/notificationService";

const POLL_MS = 45_000;

function formatRelative(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const diffSec = Math.round((Date.now() - d.getTime()) / 1000);
    if (diffSec < 60) return "just now";
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

function BellIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 01-3.46 0" />
    </svg>
  );
}

export function NotificationBell() {
  const navigate = useNavigate();
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const hasItemsRef = useRef(false);
  useEffect(() => {
    hasItemsRef.current = items.length > 0;
  }, [items.length]);

  const refreshCount = useCallback(async () => {
    try {
      const { items: list, unreadCount: count } = await NotificationService.GetMine(20, false);
      setItems(list);
      setUnreadCount(count);
    } catch {
      /* soft-fail */
    }
  }, []);

  const loadList = useCallback(async () => {
    if (!hasItemsRef.current) setLoading(true);
    try {
      const { items: list, unreadCount: count } = await NotificationService.GetMine(20, false);
      setItems(list);
      setUnreadCount(count);
    } catch {
      if (!hasItemsRef.current) setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshCount();
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void refreshCount();
    }, POLL_MS);
    const onVis = () => {
      if (document.visibilityState === "visible") void refreshCount();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [refreshCount]);

  useEffect(() => {
    if (!open) return;
    void loadList();
    const onPointer = (e: MouseEvent | TouchEvent) => {
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
  }, [open, loadList]);

  const handleOpen = () => {
    const next = !open;
    setOpen(next);
    if (next) void loadList();
  };

  const handleMarkAll = async () => {
    try {
      await NotificationService.MarkAllRead();
      setUnreadCount(0);
      setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
    } catch {
      /* soft-fail */
    }
  };

  const handleClickItem = async (item: AppNotification) => {
    if (!item.isRead) {
      try {
        await NotificationService.MarkRead([item.id]);
        setItems((prev) =>
          prev.map((n) => (n.id === item.id ? { ...n, isRead: true } : n))
        );
        setUnreadCount((c) => Math.max(0, c - 1));
      } catch {
        /* soft-fail */
      }
    }

    const target = mapNotificationLinkToPwa(item.linkPath, item.entityType, item.entityId);
    setOpen(false);
    if (target) navigate(target);
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => void handleOpen()}
        className="relative inline-flex h-11 w-11 items-center justify-center rounded-full bg-white text-slate-700 shadow-sm dark:bg-slate-800 dark:text-slate-200"
        aria-label="Notifications"
        title="Notifications"
      >
        <BellIcon className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
            <div className="text-sm font-bold text-slate-900 dark:text-white">Notifications</div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => void handleMarkAll()}
                className="text-xs font-bold text-blue-600 dark:text-blue-400"
              >
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {loading && items.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-slate-500">Loading…</div>
            ) : items.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-slate-500">No notifications yet</div>
            ) : (
              items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => void handleClickItem(item)}
                  className={`block w-full border-b border-slate-50 px-4 py-3 text-left last:border-0 dark:border-slate-800 ${
                    item.isRead ? "bg-white dark:bg-slate-900" : "bg-blue-50/60 dark:bg-blue-950/30"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 text-sm font-bold text-slate-900 dark:text-white">
                      {item.title}
                    </div>
                    <div className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                      {formatRelative(item.createdAt)}
                    </div>
                  </div>
                  {item.body && (
                    <p className="mt-0.5 line-clamp-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                      {item.body}
                    </p>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
