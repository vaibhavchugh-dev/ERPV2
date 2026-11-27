import type { JobOrderMaster } from "../../Common/Services/JobOrderService";

/** Case/whitespace-insensitive key used to compare part numbers, names and job refs. */
export const normalizeKey = (value?: string | null): string =>
  (value || "").trim().toLowerCase().replace(/\s+/g, " ");

const splitTokens = (value?: string | null): string[] =>
  (value || "")
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);

/**
 * Find the existing master record for an extracted line.
 * - A part number is matched first (exact, case-insensitive; every comma-separated token is tried).
 * - The description is only used when the document has no part number, and only when it
 *   identifies exactly one record (so a vague name never links the wrong part).
 */
export function findByPart<T>(
  items: T[],
  getPartNo: (item: T) => string | undefined | null,
  getPartName: (item: T) => string | undefined | null,
  partNo: string,
  partName: string
): T | null {
  const tokens = splitTokens(partNo).map(normalizeKey);
  if (tokens.length > 0) {
    for (const token of tokens) {
      const hit = items.find((item) => normalizeKey(getPartNo(item)) === token);
      if (hit) return hit;
    }
    return null;
  }

  const name = normalizeKey(partName);
  if (!name) return null;
  const hits = items.filter((item) => normalizeKey(getPartName(item)) === name);
  return hits.length === 1 ? hits[0] : null;
}

export const jobLabel = (job: JobOrderMaster): string =>
  (job.jobNumber || `JO#${job.jobOrderNumber}`).trim();

export interface JobMatchResult {
  ids: number[];
  labels: string[];
  /** Job references from the document that do not exist as job orders. */
  unmatched: string[];
}

/**
 * Match extracted job references (e.g. "JO#1001, 2044") to existing job orders,
 * using the same rules as the Vendor Quotation / Vendor Order screens.
 */
export function matchJobOrders(jobs: JobOrderMaster[], jobText?: string | null): JobMatchResult {
  const result: JobMatchResult = { ids: [], labels: [], unmatched: [] };
  for (const token of splitTokens(jobText)) {
    const normalized = token.replace(/^JO[#\-_\s]?/i, "").trim();
    const lowered = token.toLowerCase();
    const match = jobs.find((jo) => {
      const label = jobLabel(jo).toLowerCase();
      const joNum = (jo.jobNumber || "").trim().toLowerCase();
      return (
        label === lowered ||
        joNum === lowered ||
        label === `jo#${normalized}`.toLowerCase() ||
        joNum === normalized.toLowerCase() ||
        `jo#${jo.jobOrderNumber}` === lowered ||
        String(jo.jobOrderNumber ?? "") === normalized
      );
    });
    if (match) {
      if (!result.ids.includes(match.jobOrderID)) {
        result.ids.push(match.jobOrderID);
        result.labels.push(jobLabel(match));
      }
    } else if (!result.unmatched.some((u) => u.toLowerCase() === lowered)) {
      result.unmatched.push(token);
    }
  }
  return result;
}
