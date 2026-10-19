import { parseDateOnlyLocal } from "./Formatting";

/** Shared date-range presets (Customer Invoices parity). */
export const STANDARD_LIST_DATE_RANGE_OPTIONS = [
  { value: "All", label: "All Dates" },
  { value: "This Week", label: "This Week" },
  { value: "Last 7 Days", label: "Last 7 Days" },
  { value: "Last 30 Days", label: "Last 30 Days" },
  { value: "Last 90 Days", label: "Last 90 Days" },
  { value: "This Month", label: "This Month" },
  { value: "Last Month", label: "Last Month" },
  { value: "This Year", label: "This Year" },
  { value: "Custom", label: "Custom" },
] as const;

/** Presets only (no Custom) — Payment Dashboard / AR / AP. */
export const STANDARD_LIST_DATE_RANGE_PRESETS = STANDARD_LIST_DATE_RANGE_OPTIONS.filter(
  (o) => o.value !== "Custom"
);

export type StandardListDateRange = (typeof STANDARD_LIST_DATE_RANGE_OPTIONS)[number]["value"];

const toLocalYmd = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

/** Resolve a preset (or Custom with start/end) into yyyy-MM-dd bounds. */
export function resolveListDateRangeBounds(
  range: string,
  startDate?: string,
  endDate?: string
): { startYmd?: string; endYmd?: string } {
  if (!range || range === "All" || range === "All Dates") {
    return {};
  }

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (range === "Custom") {
    return {
      startYmd: startDate || undefined,
      endYmd: endDate || undefined,
    };
  }

  switch (range) {
    case "This Week": {
      const start = new Date(today);
      start.setDate(today.getDate() - today.getDay());
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      return { startYmd: toLocalYmd(start), endYmd: toLocalYmd(end) };
    }
    case "Last 7 Days": {
      const start = new Date(today);
      start.setDate(today.getDate() - 7);
      return { startYmd: toLocalYmd(start), endYmd: toLocalYmd(today) };
    }
    case "Last 30 Days": {
      const start = new Date(today);
      start.setDate(today.getDate() - 30);
      return { startYmd: toLocalYmd(start), endYmd: toLocalYmd(today) };
    }
    case "Last 90 Days": {
      const start = new Date(today);
      start.setDate(today.getDate() - 90);
      return { startYmd: toLocalYmd(start), endYmd: toLocalYmd(today) };
    }
    case "This Month": {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      return { startYmd: toLocalYmd(start), endYmd: toLocalYmd(today) };
    }
    case "Last Month": {
      const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const end = new Date(today.getFullYear(), today.getMonth(), 0);
      return { startYmd: toLocalYmd(start), endYmd: toLocalYmd(end) };
    }
    case "This Year": {
      const start = new Date(today.getFullYear(), 0, 1);
      return { startYmd: toLocalYmd(start), endYmd: toLocalYmd(today) };
    }
    default:
      return {};
  }
}

/** Client-side date match for list filters (Vendor Invoices / AP pattern). */
export function matchesListDateRange(
  dateStr: string,
  range: string,
  startDate?: string,
  endDate?: string
): boolean {
  if (!range || range === "All" || range === "All Dates") return true;
  const d = parseDateOnlyLocal(dateStr);
  if (!d) return false;

  if (range === "Custom") {
    const invTime = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    if (startDate) {
      const s = parseDateOnlyLocal(startDate);
      if (s && invTime < s.getTime()) return false;
    }
    if (endDate) {
      const e = parseDateOnlyLocal(endDate);
      if (e && invTime > e.getTime()) return false;
    }
    return true;
  }

  const { startYmd, endYmd } = resolveListDateRangeBounds(range);
  if (startYmd) {
    const s = parseDateOnlyLocal(startYmd);
    if (s && d < s) return false;
  }
  if (endYmd) {
    const e = parseDateOnlyLocal(endYmd);
    if (e && d > e) return false;
  }
  return true;
}
