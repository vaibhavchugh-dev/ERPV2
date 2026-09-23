/**
 * Build deep-link paths for report drill-down Open actions.
 * Prefer ?open=<id> where list screens already support it.
 * Aggregate rows (customer/vendor) use ?search= so we never open the wrong document.
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

/** Entity types whose EntityId is an aggregate (customer/vendor), not a document PK. */
const AGGREGATE_ENTITY_TYPES = new Set([
  "customer",
  "vendor",
  "vendor-part",
  "invoice-period",
  "process",
  "location",
]);

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

/** Strip "partNo — partName" down to a search needle Inventory can match. */
export function inventorySearchNeedle(value?: string | null): string | null {
  if (!value || !value.trim()) return null;
  const raw = value.trim();
  const sep = raw.indexOf(" — ");
  if (sep > 0) {
    const partNo = raw.slice(0, sep).trim();
    if (partNo) return partNo;
  }
  return raw;
}

export type DrillLinkOptions = {
  path?: string | null;
  entityId?: number | null;
  /** For inventory search / job status filter */
  entityKey?: string | null;
  entityType?: string | null;
  search?: string | null;
  /** Display title used as search fallback for aggregate rows */
  title?: string | null;
  accountId?: number | null;
  startDate?: string | null;
  endDate?: string | null;
  /**
   * Report site scope for the related list.
   * - number > 0: that site
   * - null: All sites (locationId=0 in the URL)
   * - undefined: omit (list uses its own default)
   */
  locationId?: number | null;
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

/** Append report site scope so related screens match the report filter. */
function withLocationId(
  path: string,
  locationId?: number | null
): string {
  if (locationId === undefined) return path;
  if (locationId === null || locationId <= 0) {
    return withQuery(path, { locationId: 0 });
  }
  return withQuery(path, { locationId });
}

/**
 * Resolve the best navigation URL for a report row / primary action.
 */
export function buildDrillLink(opts: DrillLinkOptions): string {
  const rawPath = (opts.path || "").trim() || "/reports";
  const { base } = splitPathQuery(rawPath);
  const entityType = (opts.entityType || "").trim().toLowerCase();
  const isAggregate = AGGREGATE_ENTITY_TYPES.has(entityType);
  const id =
    !isAggregate && opts.entityId != null && Number(opts.entityId) > 0
      ? Number(opts.entityId)
      : null;

  let path: string;

  // Location aggregate: open list scoped to that site (never ?open=<locationId>).
  if (entityType === "location") {
    return withLocationId(rawPath, opts.locationId);
  }

  // General Ledger: seed account + dates and auto-run
  if (base.startsWith("/accounts/general-ledger")) {
    path = withQuery(rawPath, {
      accountId: opts.accountId ?? id,
      startDate: opts.startDate,
      endDate: opts.endDate,
      run: opts.accountId || id ? 1 : undefined,
    });
    return withLocationId(path, opts.locationId);
  }

  // Journal entries: open specific JE when supported later; still pass open
  if (base.startsWith("/accounts/journal-entries") && id) {
    path = withQuery(rawPath, { open: id });
    return withLocationId(path, opts.locationId);
  }

  // Inventory: seed search from part number (never the combined "no — name" label)
  if (base.startsWith("/inventory")) {
    const search =
      inventorySearchNeedle(opts.search) ||
      inventorySearchNeedle(
        opts.entityType === "inventory-item" ? opts.entityKey : null
      ) ||
      inventorySearchNeedle(opts.entityKey) ||
      inventorySearchNeedle(opts.title);
    path = withQuery(rawPath, { search: search || undefined });
    return withLocationId(path, opts.locationId);
  }

  // Job status bucket → filter by status name (only when not opening a specific JO)
  if (
    base.startsWith("/job-orders") &&
    opts.entityType === "job-status" &&
    opts.entityKey &&
    !id
  ) {
    path = withQuery(rawPath, { status: opts.entityKey });
    return withLocationId(path, opts.locationId);
  }

  // NCR status/severity/month buckets
  if (base.startsWith("/quality") && opts.entityType === "ncr-bucket") {
    const key = (opts.entityKey || "").trim();
    // Month keys look like 2024-01 — don't set status
    if (key && !/^\d{4}-\d{2}$/.test(key)) {
      // Severity vs status: heuristic — Minor/Major/Critical → severity
      if (/^(minor|major|critical)$/i.test(key)) {
        path = withQuery(rawPath, { severity: key });
        return withLocationId(path, opts.locationId);
      }
      path = withQuery(rawPath, { status: key });
      return withLocationId(path, opts.locationId);
    }
  }

  // Aggregate customer/vendor/period/process rows → list filtered by name when available
  if (isAggregate) {
    const search =
      (opts.search && opts.search.trim()) ||
      (opts.title && opts.title.trim()) ||
      (opts.entityKey && opts.entityKey.trim()) ||
      null;
    if (search && entityType !== "invoice-period" && entityType !== "process") {
      // vendor-part title is "Vendor — Part"; search by vendor portion for VO list
      const needle =
        entityType === "vendor-part" && search.includes(" — ")
          ? search.split(" — ")[0].trim()
          : search;
      // Skip period keys like 2024-01 as search (not useful on invoices list)
      if (entityType === "customer" || entityType === "vendor" || entityType === "vendor-part") {
        path = withQuery(rawPath, { search: needle || undefined });
        return withLocationId(path, opts.locationId);
      }
    }
    return withLocationId(rawPath, opts.locationId);
  }

  if (supportsOpen(base) && id) {
    path = withQuery(rawPath, { open: id });
    return withLocationId(path, opts.locationId);
  }

  // Customer/vendor order paths also accept orderId
  if (
    (base.startsWith("/orders/customer") ||
      base.startsWith("/purchasing/vendor-orders")) &&
    id
  ) {
    path = withQuery(rawPath, { open: id });
    return withLocationId(path, opts.locationId);
  }

  if (opts.search) {
    path = withQuery(rawPath, { search: opts.search });
    return withLocationId(path, opts.locationId);
  }

  return withLocationId(rawPath, opts.locationId);
}

export const DRILL_DETAIL_PAGE_SIZE = 25;
