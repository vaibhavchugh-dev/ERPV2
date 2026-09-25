/**
 * Shared helpers for list/page free-text search (amounts, dates, JE # prefixes).
 */

/** Strip currency symbols, commas, and whitespace for amount matching. */
export const normalizeAmountQuery = (q: string): string =>
  (q || "").replace(/[$,\s]/g, "").toLowerCase();

/** True if query looks like an amount search (digits with optional decimal). */
export const looksLikeAmountQuery = (q: string): boolean => {
  const n = normalizeAmountQuery(q);
  return n.length > 0 && /^-?\d+(\.\d+)?$/.test(n);
};

/** Match a numeric/currency field against a search query. */
export const matchAmountValue = (query: string, value: unknown): boolean => {
  if (value == null || value === "") return false;
  const q = normalizeAmountQuery(query);
  if (!q) return false;
  const raw = String(value).replace(/[$,\s]/g, "").toLowerCase();
  if (!raw) return false;
  return raw.includes(q) || q.includes(raw);
};

/** Format a date-like value into searchable variants (ISO, locale, MM/DD/YYYY). */
export const dateSearchHaystack = (value: unknown): string => {
  if (value == null || value === "") return "";
  const s = String(value).trim();
  if (!s) return "";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s.toLowerCase();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return [
    s.toLowerCase(),
    `${yyyy}-${mm}-${dd}`,
    `${mm}/${dd}/${yyyy}`,
    `${mm}-${dd}-${yyyy}`,
    d.toLocaleDateString().toLowerCase(),
  ].join(" ");
};

export const matchDateValue = (query: string, value: unknown): boolean => {
  const q = (query || "").trim().toLowerCase();
  if (!q) return false;
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
