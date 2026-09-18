/**
 * Build deep-link paths for report drill-down Open actions.
 * Prefer ?open=<id> where list screens already support it.
 */

const OPEN_PATH_PREFIXES = [
  "/job-orders",
  "/orders/customer",
  "/orders/customer-invoices",
  "/purchasing/vendor-orders",
  "/purchasing/vendor-invoices",
  "/quotations/customer",
  "/quality",
];

function splitPathQuery(path: string): { base: string; params: URLSearchParams } {
  const qIndex = path.indexOf("?");
  if (qIndex < 0) {
    return { base: path, params: new URLSearchParams() };
  }
  return {
    base: path.slice(0, qIndex),
    params: new URLSearchParams(path.slice(qIndex + 1)),
  };
}

function supportsOpen(basePath: string): boolean {
  return OPEN_PATH_PREFIXES.some(
    (p) => basePath === p || basePath.startsWith(p + "/")
  );
}

export type DrillLinkOptions = {
  path?: string | null;
  entityId?: number | null;
  /** For inventory search / job status filter */
  entityKey?: string | null;
  entityType?: string | null;
  search?: string | null;
  accountId?: number | null;
  startDate?: string | null;
  endDate?: string | null;
};

/** Append or merge query params onto a path. */
export function withQuery(
  path: string,
  query: Record<string, string | number | null | undefined>
): string {
  const { base, params } = splitPathQuery(path || "/");
  Object.entries(query).forEach(([key, value]) => {
    if (value === null || value === undefined || value === "") return;
    params.set(key, String(value));
  });
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

/**
 * Resolve the best navigation URL for a drill row / primary action.
 */
export function buildDrillLink(opts: DrillLinkOptions): string {
  const rawPath = (opts.path || "").trim() || "/reports";
  const { base } = splitPathQuery(rawPath);
  const id =
    opts.entityId != null && Number(opts.entityId) > 0
      ? Number(opts.entityId)
      : null;

  // General Ledger: seed account + dates and auto-run
  if (base.startsWith("/accounts/general-ledger")) {
    return withQuery(rawPath, {
      accountId: opts.accountId ?? id,
      startDate: opts.startDate,
      endDate: opts.endDate,
      run: opts.accountId || id ? 1 : undefined,
    });
  }

  // Journal entries: open specific JE when supported later; still pass open
  if (base.startsWith("/accounts/journal-entries") && id) {
    return withQuery(rawPath, { open: id });
  }

  // Inventory: seed search from item name / key
  if (base.startsWith("/inventory")) {
    const search =
      opts.search ||
      (opts.entityType === "inventory-item" ? opts.entityKey : null) ||
      opts.entityKey;
    return withQuery(rawPath, { search: search || undefined });
  }

  // Job status bucket → filter by status name
  if (
    base.startsWith("/job-orders") &&
    opts.entityType === "job-status" &&
    opts.entityKey
  ) {
    return withQuery(rawPath, { status: opts.entityKey });
  }

  // NCR status/severity/month buckets
  if (base.startsWith("/quality") && opts.entityType === "ncr-bucket") {
    const key = (opts.entityKey || "").trim();
    // Month keys look like 2024-01 — don't set status
    if (key && !/^\d{4}-\d{2}$/.test(key)) {
      // Severity vs status: heuristic — Minor/Major/Critical → severity
      if (/^(minor|major|critical)$/i.test(key)) {
        return withQuery(rawPath, { severity: key });
      }
      return withQuery(rawPath, { status: key });
    }
  }

  if (supportsOpen(base) && id) {
    return withQuery(rawPath, { open: id });
  }

  // Customer/vendor order paths also accept orderId
  if (
    (base.startsWith("/orders/customer") ||
      base.startsWith("/purchasing/vendor-orders")) &&
    id
  ) {
    return withQuery(rawPath, { open: id });
  }

  if (opts.search) {
    return withQuery(rawPath, { search: opts.search });
  }

  return rawPath;
}

export const DRILL_DETAIL_PAGE_SIZE = 25;
