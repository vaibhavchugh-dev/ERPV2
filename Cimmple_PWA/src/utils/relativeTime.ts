/**
 * Parse API timestamps that are often UTC ISO without a trailing Z.
 * Without this, browsers treat them as local and relative times skew (e.g. ~5h in IST).
 */
export function parseApiUtcDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const raw = String(iso).trim();
  if (!raw) return null;
  try {
    let d: Date;
    if (/^\d{4}-\d{2}-\d{2}T/.test(raw) && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(raw)) {
      d = new Date(raw.endsWith("Z") ? raw : `${raw}Z`);
    } else {
      d = new Date(raw);
    }
    return Number.isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

/** Relative time label for notifications/messages (do not uppercase in CSS). */
export function formatRelativeTime(iso: string | null | undefined): string {
  const d = parseApiUtcDate(iso);
  if (!d) return "";
  const diffSec = Math.round((Date.now() - d.getTime()) / 1000);
  if (diffSec < 60) return "just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Shared classes for header dropdown panels — fixed + viewport-clamped. */
export const HEADER_DROPDOWN_PANEL_CLASS =
  "fixed right-4 left-4 z-50 mt-0 max-h-[min(24rem,70vh)] w-auto overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900 sm:left-auto sm:right-4 sm:w-[min(22rem,calc(100vw-2rem))]";
