import { useEffect } from "react";
import { IconCheck } from "./Icons";

export function TopToast({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const t = window.setTimeout(onDismiss, 3500);
    return () => window.clearTimeout(t);
  }, [message, onDismiss]);

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-50 flex justify-center px-4"
      style={{ top: "max(0.75rem, env(safe-area-inset-top))" }}
      role="status"
      aria-live="polite"
    >
      <div className="pointer-events-auto flex max-w-[min(92vw,32rem)] items-center gap-2 rounded-full border border-emerald-200 bg-white px-3.5 py-2 text-sm font-bold text-emerald-800 shadow-[0_8px_24px_rgba(15,23,42,0.12)] dark:border-emerald-700 dark:bg-slate-800 dark:text-emerald-300">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300">
          <IconCheck size={14} />
        </span>
        <span className="leading-snug">{message}</span>
      </div>
    </div>
  );
}
