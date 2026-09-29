/**
 * Match list search against display doc numbers (CQ#/CO#/VQ#/VO#) where
 * stored PONumber < 1000 is shown as PONumber + 999.
 */

export const toDisplayDocNumber = (number: number): number =>
  number > 0 && number < 1000 ? number + 999 : number;

export const formatPrefixedDocNumber = (
  prefix: string,
  number: number
): string => {
  const p = prefix.endsWith("#") ? prefix : `${prefix}#`;
  return `${p}${toDisplayDocNumber(number)}`;
};

/** Strip known prefixes and spaces; returns digits / remainder for matching. */
export const stripDocNumberQuery = (
  searchLower: string,
  prefixes: string[]
): string => {
  let q = (searchLower || "").trim().toLowerCase();
  for (const p of [...prefixes].sort((a, b) => b.length - a.length)) {
    const prefix = p.toLowerCase();
    if (q.startsWith(prefix)) {
      q = q.slice(prefix.length).replace(/^[#\s\-_]+/, "");
      break;
    }
  }
  return q.replace(/^#/, "").replace(/\s/g, "");
};

const hasDocPrefix = (searchLower: string, prefixes: string[]): boolean =>
  prefixes.some((p) => searchLower.startsWith(p.toLowerCase()));

/**
 * True when the search matches raw stored number, display number, or prefixed label.
 * Prefixed queries ("CQ#1005", "cq 10") match the display number from the start only,
 * so "CQ#1005" does not also hit CQ#11005 or CQ#21005.
 */
export const matchDisplayDocNumber = (
  searchLower: string,
  rawNumber: number,
  prefixes: string[]
): boolean => {
  const q = (searchLower || "").trim().toLowerCase();
  if (!q) return true;
  const raw = Number(rawNumber) || 0;
  if (raw <= 0) return false;
  const display = toDisplayDocNumber(raw);
  const stripped = stripDocNumberQuery(q, prefixes);

  if (hasDocPrefix(q, prefixes)) {
    if (!stripped) return true;
    if (!/^\d+$/.test(stripped)) return false;
    return String(display).startsWith(stripped);
  }

  const needle = stripped || q;
  const labels = prefixes.map((p) =>
    formatPrefixedDocNumber(p, raw).toLowerCase()
  );
  return (
    labels.some((f) => f.includes(needle)) ||
    String(raw).includes(needle) ||
    String(display).includes(needle)
  );
};
