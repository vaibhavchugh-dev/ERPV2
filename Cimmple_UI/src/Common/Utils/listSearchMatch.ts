/**
 * Shared helpers for list/page free-text search (amounts, dates, JE # prefixes).
 */
import moment from "moment-timezone";
import { formatDateOnlyFromApi, parseDateOnlyLocal, toMomentDateFormat } from "./Formatting";
import { getCachedSettings } from "./settingsRuntime";

/** Strip currency symbols, commas, and whitespace for amount matching. */
export const normalizeAmountQuery = (q: string): string =>
  (q || "").replace(/[$€£¥₹,\s]/g, "").toLowerCase();

/** True if query looks like an amount search (digits with optional decimal). */
export const looksLikeAmountQuery = (q: string): boolean => {
  const n = normalizeAmountQuery(q);
  return n.length > 0 && /^-?\d+(\.\d*)?$/.test(n);
};

/**
 * Match a numeric/currency field against an amount-shaped query.
 * Prefix match only (typing "12" finds 12.00, 125.50, 1200) — never the reverse,
 * so "CQ#1005" or "Sep 3, 2026" cannot match amounts like 100 or 3.
 */
export const matchAmountValue = (query: string, value: unknown): boolean => {
  if (value == null || value === "") return false;
  if (!looksLikeAmountQuery(query)) return false;
  const q = normalizeAmountQuery(query);
  const num = Number(String(value).replace(/[$€£¥₹,\s]/g, ""));
  if (!Number.isFinite(num)) return false;
  if (q.includes(".")) {
    return num.toFixed(2).startsWith(q) || String(num).startsWith(q);
  }
  return String(Math.trunc(num)).startsWith(q);
};

const tenantMomentDateFormat = (): string => {
  let configured = getCachedSettings()?.dateFormat;
  if (!configured) {
    try {
      configured = JSON.parse(localStorage.getItem("storage") || "{}")?.dateFormat;
    } catch {
      configured = undefined;
    }
  }
  return toMomentDateFormat(configured);
};

const isDayFirstFormat = (momentFormat: string): boolean => /^D/i.test(momentFormat);

/** Parse a fully typed/pasted date query (needs a year); null for partial input. */
const parseQueryDate = (query: string): moment.Moment | null => {
  // Strict single-letter tokens reject leading zeros, so normalize "09/03" → "9/3".
  const text = query.trim().replace(/\s+/g, " ").replace(/(^|\D)0(\d)/g, "$1$2");
  if (!/\d{4}/.test(text) && !/\d{1,2}[/.-]\d{1,2}[/.-]\d{2}$/.test(text)) return null;
  const tenantFormat = tenantMomentDateFormat()
    .replace(/(^|[^M])MM(?!M)/g, "$1M")
    .replace(/DD/g, "D");
  const numeric = isDayFirstFormat(tenantFormat)
    ? ["D/M/YYYY", "D-M-YYYY", "D.M.YYYY", "D/M/YY", "D-M-YY"]
    : ["M/D/YYYY", "M-D-YYYY", "M.D.YYYY", "M/D/YY", "M-D-YY"];
  const formats = [
    tenantFormat,
    "YYYY-M-D",
    "YYYY/M/D",
    ...numeric,
    "MMM D, YYYY",
    "MMM D,YYYY",
    "MMM D YYYY",
    "MMMM D, YYYY",
    "MMMM D YYYY",
    "D MMM YYYY",
    "D MMMM YYYY",
    "D-MMM-YYYY",
  ];
  const parsed = moment(text, formats, true);
  return parsed.isValid() ? parsed : null;
};

/** Searchable variants of a date-only value (tenant display format, ISO, US, month names). */
export const dateSearchHaystack = (value: unknown): string => {
  if (value == null || value === "") return "";
  const s = String(value).trim();
  if (!s) return "";
  const d = parseDateOnlyLocal(s);
  if (!d) return s.toLowerCase();
  const m = moment(d);
  const numeric = isDayFirstFormat(tenantMomentDateFormat())
    ? ["DD/MM/YYYY", "D/M/YYYY", "DD-MM-YYYY"]
    : ["MM/DD/YYYY", "M/D/YYYY", "MM-DD-YYYY"];
  return [
    s,
    formatDateOnlyFromApi(s, true),
    formatDateOnlyFromApi(s, false),
    m.format("YYYY-MM-DD"),
    ...numeric.map((f) => m.format(f)),
    m.format("MMM D, YYYY"),
    m.format("MMM DD, YYYY"),
    m.format("MMMM D, YYYY"),
    m.format("MMM YYYY"),
    m.format("MMMM YYYY"),
    m.format("MM/YYYY"),
    m.format("M/YYYY"),
    m.format("MM-YYYY"),
  ]
    .join(" | ")
    .toLowerCase();
};

/**
 * A complete date query (e.g. "9/3/2026", "Sep 3, 2026", "2026-09-03") must hit the same
 * calendar day; partial input ("9/3", "sep 3") falls back to substring match on display variants.
 */
export const matchDateValue = (query: string, value: unknown): boolean => {
  const q = (query || "").trim().toLowerCase();
  if (!q || value == null || value === "") return false;
  const queried = parseQueryDate(q);
  if (queried) {
    const target = parseDateOnlyLocal(String(value));
    return (
      !!target &&
      target.getFullYear() === queried.year() &&
      target.getMonth() === queried.month() &&
      target.getDate() === queried.date()
    );
  }
  return dateSearchHaystack(value).includes(q);
};

/** Strip JE/# prefixes so "je #123", "je#123", "#123" match id 123. */
export const stripJeNumberQuery = (query: string): string => {
  let q = (query || "").trim().toLowerCase();
  q = q.replace(/^je[\s#-]*/i, "").replace(/^#/, "").trim();
  return q;
};

export const matchJeNumber = (query: string, ...ids: Array<number | string | null | undefined>): boolean => {
  const q = (query || "").trim().toLowerCase();
  if (!q) return false;
  const stripped = stripJeNumberQuery(q);
  return ids.some((id) => {
    if (id == null || id === "") return false;
    const s = String(id).toLowerCase();
    return (
      s.includes(q) ||
      s.includes(stripped) ||
      `je#${s}`.includes(q) ||
      `je #${s}`.includes(q) ||
      `#${s}`.includes(q)
    );
  });
};

/** Match a single field value with amount/date-aware comparison. */
export const matchFieldValue = (query: string, value: unknown): boolean => {
  if (value == null) return false;
  const q = (query || "").trim().toLowerCase();
  if (!q) return true;
  const text = String(value).toLowerCase();
  if (text.includes(q)) return true;
  if (matchAmountValue(q, value)) return true;
  if (matchDateValue(q, value)) return true;
  return false;
};
