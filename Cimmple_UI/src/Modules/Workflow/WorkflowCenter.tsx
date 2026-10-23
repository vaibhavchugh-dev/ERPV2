import React, { useEffect, useMemo, useRef, useState } from "react";
import { useHistory, useLocation } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSearch, faTimes } from "@fortawesome/free-solid-svg-icons";
import ClientPagination from "../../Common/Components/ClientPagination";
import { useListPageSize } from "../../Common/Hooks/useListPageSize";
import { useSiteListFilter } from "../../Common/Hooks/useSiteListFilter";
import { useFormatting } from "../../Common/Hooks/useFormatting";
import { usePagePermissions } from "../../Common/Hooks/usePagePermissions";
import { useSettingsSafe } from "../../Common/Contexts/SettingsContext";
import {
  WorkflowAction,
  WorkflowAssignee,
  WorkflowOverview,
  WorkflowRow,
  WorkflowService,
} from "../../Common/Services/WorkflowService";
import "./WorkflowCenter.scss";

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "active", label: "Active" },
  { value: "needsAction", label: "Needs action" },
  { value: "blocked", label: "Blocked" },
  { value: "overdue", label: "Overdue" },
  { value: "onTrack", label: "On track" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

const AGE_TITLE = "Days since the document date.";

const indicatorLabel = (indicator: string) => {
  switch (indicator) {
    case "OnTrack": return "On track";
    case "NeedsAction": return "Needs action";
    case "Blocked": return "Blocked";
    case "Overdue": return "Overdue";
    case "Completed": return "Completed";
    case "Cancelled": return "Cancelled";
    default: return indicator;
  }
};

const indicatorClass = (indicator: string) => {
  switch (indicator) {
    case "OnTrack":
    case "Completed":
      return "badge-success";
    case "NeedsAction":
      return "badge-warning";
    case "Blocked":
    case "Overdue":
      return "badge-danger";
    default:
      return "badge-info";
  }
};

const matchesStatus = (row: WorkflowRow, status: string) => {
  switch (status) {
    case "active": return row.isActive;
    case "needsAction": return row.needsAction;
    case "blocked": return row.isBlocked;
    case "overdue": return row.isOverdue;
    case "onTrack": return row.indicator === "OnTrack";
    case "completed": return row.isComplete;
    case "cancelled": return row.isCancelled;
    default: return true;
  }
};

const includesText = (haystack: string, query: string) =>
  haystack.toLowerCase().includes(query.trim().toLowerCase());

const returnedWorkflowView = () => {
  const params = new URLSearchParams(window.location.search);
  return {
    q: params.get("q") ?? "",
    stage: params.get("stage") ?? "",
    status: params.get("status") ?? "",
    selected: params.get("selected"),
  };
};

const locationKey = (locationId?: number) => (locationId == null ? "all" : String(locationId));

const RETURN_KEY = "workflow-center-return";

const signedInUserId = () => {
  try {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    const id = Number(storage.userId || storage.user_UniqueID || 0);
    return id > 0 ? id : 0;
  } catch {
    return 0;
  }
};

let overviewCache: { key: string; data: WorkflowOverview } | null = null;

const readReturnSnapshot = () => {
  const fromUrl = returnedWorkflowView();
  if (fromUrl.selected || fromUrl.q || fromUrl.stage || fromUrl.status) return fromUrl;
  try {
    const raw = sessionStorage.getItem(RETURN_KEY);
    if (!raw) return fromUrl;
    const saved = JSON.parse(raw) as { q?: string; stage?: string; status?: string; selected?: string | null };
    return {
      q: saved.q || "",
      stage: saved.stage || "",
      status: saved.status || "",
      selected: saved.selected || null,
    };
  } catch {
    return fromUrl;
  }
};

const WorkflowCenter: React.FC = () => {
  const history = useHistory();
  const location = useLocation();
  const [returned] = useState(readReturnSnapshot);
  const { formatCurrency, formatDateOnlyFromApi } = useFormatting();
  const settings = useSettingsSafe();
  const { locationIdParam, masterListFilter } = useSiteListFilter();
  const { can } = usePagePermissions("/workflow");
  const canAssign = can("Assign");
  const canAcknowledge = can("Acknowledge");
  const siteKey = locationKey(locationIdParam);
  const [pageSize, setPageSize] = useListPageSize(settings?.defaultPageSize || 10);
  const [loading, setLoading] = useState(() => overviewCache?.key !== siteKey);
  const [error, setError] = useState<string | null>(null);
  const [overview, setOverview] = useState<WorkflowOverview | null>(
    () => (overviewCache?.key === siteKey ? overviewCache.data : null)
  );
  const [search, setSearch] = useState(returned.q);
  const [stage, setStage] = useState(returned.stage);
  const [status, setStatus] = useState(returned.status);
  const [ownerFilter, setOwnerFilter] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(returned.selected);
  const closedSelection = useRef<string | null>(null);

  const closeDrawer = () => {
    closedSelection.current = selectedId;
    setSelectedId(null);
  };

  const patchWorkflow = (id: string, patch: Partial<WorkflowRow>) => {
    setOverview((current) => {
      if (!current) return current;
      const next = {
        ...current,
        workflows: current.workflows.map((row) => (row.id === id ? { ...row, ...patch } : row)),
      };
      if (overviewCache?.key === siteKey) overviewCache = { key: siteKey, data: next };
      return next;
    });
  };

  const load = () => {
    const key = locationKey(locationIdParam);
    const cached = overviewCache?.key === key ? overviewCache.data : null;
    if (!cached) setLoading(true);
    setError(null);
    return WorkflowService.GetOverview(locationIdParam)
      .then((data) => {
        overviewCache = { key, data };
        setOverview(data);
        setLoading(false);
        return true;
      })
      .catch((err: { response?: { data?: { error?: string } } }) => {
        if (!cached) {
          setOverview(null);
          setError(err?.response?.data?.error || "Workflow Center could not be loaded.");
        }
        setLoading(false);
        return false;
      });
  };

  useEffect(() => {
    let cancelled = false;
    const key = locationKey(locationIdParam);
    const cached = overviewCache?.key === key ? overviewCache.data : null;
    if (!cached) {
      setLoading(true);
      setOverview(null);
    }
    setError(null);
    WorkflowService.GetOverview(locationIdParam)
      .then((data) => {
        if (cancelled) return;
        overviewCache = { key, data };
        setOverview(data);
        setLoading(false);
      })
      .catch((err: { response?: { data?: { error?: string } } }) => {
        if (cancelled) return;
        if (!cached) {
          setOverview(null);
          setError(err?.response?.data?.error || "Workflow Center could not be loaded.");
        }
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [locationIdParam]);

  useEffect(() => {
    sessionStorage.removeItem(RETURN_KEY);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const selected = params.get("selected");
    if (closedSelection.current && selected !== closedSelection.current)
      closedSelection.current = null;
    if (!selected || selected === selectedId || closedSelection.current === selected) return;
    setSelectedId(selected);
  }, [location.search, selectedId]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (search.trim()) params.set("q", search.trim());
    if (stage) params.set("stage", stage);
    if (status) params.set("status", status);
    if (selectedId) params.set("selected", selectedId);
    const next = params.toString();
    const current = location.search.startsWith("?") ? location.search.slice(1) : location.search;
    if (next === current) return;
    history.replace({ pathname: location.pathname, search: next ? `?${next}` : "" });
  }, [search, stage, status, selectedId, history, location.pathname, location.search]);

  useEffect(() => {
    setPage(1);
  }, [search, stage, status, ownerFilter, pageSize]);

  const workflows = overview?.workflows || [];
  const scoped = useMemo(
    () => workflows.filter((row) => {
      const textOk = !search.trim() || includesText(row.searchText || "", search);
      const stageOk = !stage || row.principalStage === stage;
      return textOk && stageOk;
    }),
    [workflows, search, stage]
  );
  const listed = useMemo(
    () => scoped.filter((row) => {
      if (!matchesStatus(row, status)) return false;
      if (!ownerFilter) return true;
      if (ownerFilter === "unassigned") return !row.ownerUserId;
      return String(row.ownerUserId || "") === ownerFilter;
    }),
    [scoped, status, ownerFilter]
  );
  const ownerOptions = useMemo(() => {
    const names = new Map<number, string>();
    workflows.forEach((row) => {
      if (row.ownerUserId && row.ownerLabel && row.ownerLabel !== "Unassigned")
        names.set(row.ownerUserId, row.ownerLabel);
    });
    return Array.from(names.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [workflows]);
  const summary = useMemo(() => ({
    active: scoped.filter((row) => row.isActive).length,
    needsAction: scoped.filter((row) => row.needsAction).length,
    blocked: scoped.filter((row) => row.isBlocked).length,
    overdue: scoped.filter((row) => row.isOverdue).length,
  }), [scoped]);

  const total = listed.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * pageSize;
  const pagedRows = listed.slice(start, start + pageSize);
  const selected = workflows.find((row) => row.id === selectedId) || null;

  const openPath = (event: React.MouseEvent, path?: string | null) => {
    event.stopPropagation();
    if (!path) return;
    const params = new URLSearchParams();
    if (search.trim()) params.set("q", search.trim());
    if (stage) params.set("stage", stage);
    if (status) params.set("status", status);
    if (selectedId) params.set("selected", selectedId);
    const qs = params.toString();
    const returnTo = qs ? `/workflow?${qs}` : "/workflow";
    sessionStorage.setItem(RETURN_KEY, JSON.stringify({
      q: search.trim(),
      stage,
      status,
      selected: selectedId,
    }));
    history.push(path, { returnTo });
  };

  const toggleStatus = (value: string) => setStatus((current) => (current === value ? "" : value));

  return (
    <div className="workflow-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Workflow Center</h1>
          <p className="page-subtitle">Customer orders and open quotations for the current site.</p>
        </div>
      </div>

      <div className="workflow-metrics">
        <button type="button" className={status === "active" ? "active" : ""} onClick={() => toggleStatus("active")}>
          <strong>{summary.active}</strong>
          <span>Active workflows</span>
        </button>
        <button type="button" className={status === "needsAction" ? "active" : ""} onClick={() => toggleStatus("needsAction")}>
          <strong>{summary.needsAction}</strong>
          <span>Needs action</span>
        </button>
        <button type="button" className={status === "blocked" ? "active" : ""} onClick={() => toggleStatus("blocked")}>
          <strong>{summary.blocked}</strong>
          <span>Blocked</span>
        </button>
        <button type="button" className={status === "overdue" ? "active" : ""} onClick={() => toggleStatus("overdue")}>
          <strong>{summary.overdue}</strong>
          <span>Overdue</span>
        </button>
      </div>
      <p className="workflow-note">Counts follow the site, search, and stage filters. A workflow can be counted in more than one total.</p>
      <ul className="stage-legend" aria-label="Stage colors">
        <li><span className="stage-pill complete">Completed</span></li>
        <li><span className="stage-pill current">Current</span></li>
        <li><span className="stage-pill attention">Needs attention</span></li>
        <li><span className="stage-pill blocked">Blocked</span></li>
        <li><span className="stage-pill upcoming">Upcoming</span></li>
        <li><span className="stage-pill cancelled">Cancelled</span></li>
      </ul>

      <div className="page-filters">
        <div className="search-wrapper">
          <FontAwesomeIcon icon={faSearch} />
          <input
            className="search-input"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search customer, order, job, invoice"
          />
        </div>
        <select className="filter-select" value={masterListFilter.value} onChange={(event) => masterListFilter.onChange(event.target.value)} aria-label="Site">
          {masterListFilter.options.map((option) => (
            <option key={option.value || "all"} value={option.value}>{option.label}</option>
          ))}
        </select>
        <select className="filter-select" value={stage} onChange={(event) => setStage(event.target.value)} aria-label="Stage">
          <option value="">All stages</option>
          {(overview?.stages || []).map((item) => (
            <option key={item.code} value={item.code}>{item.label}</option>
          ))}
        </select>
        <select className="filter-select" value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Status">
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value || "all"} value={option.value}>{option.label}</option>
          ))}
        </select>
        <select className="filter-select" value={ownerFilter} onChange={(event) => setOwnerFilter(event.target.value)} aria-label="Owner">
          <option value="">All owners</option>
          <option value="unassigned">Unassigned</option>
          {ownerOptions.map(([id, name]) => (
            <option key={id} value={String(id)}>{name}</option>
          ))}
        </select>
      </div>

      {loading && !overview ? (
        <div className="page-loading">
          <div className="loading-spinner" />
          <p>Loading workflows...</p>
        </div>
      ) : error && !overview ? (
        <div className="empty-state">
          <p>{error}</p>
          <button type="button" className="btn-secondary" onClick={load}>Try again</button>
        </div>
      ) : listed.length === 0 ? (
        <div className="empty-state">
          <p>
            {workflows.length === 0
              ? "No customer orders or open quotations for this site."
              : search.trim()
                ? "No workflows match that search."
                : "No workflows match the current filters."}
          </p>
        </div>
      ) : (
        <JourneyTable
          rows={pagedRows}
          onOpen={setSelectedId}
          onOpenPath={openPath}
          formatDate={formatDateOnlyFromApi}
          start={start}
          end={Math.min(start + pageSize, listed.length)}
          total={listed.length}
          currentPage={currentPage}
          totalPages={totalPages}
          pageSize={pageSize}
          onPage={setPage}
          onPageSize={setPageSize}
        />
      )}

      {selected && (
        <WorkflowDetail
          row={selected}
          actions={(overview?.actions || []).filter((action) => action.workflowId === selected.id)}
          onClose={closeDrawer}
          onOpenPath={openPath}
          onChanged={load}
          onPatch={patchWorkflow}
          canAssign={canAssign}
          canAcknowledge={canAcknowledge}
          currentUserId={signedInUserId()}
          formatCurrency={formatCurrency}
          formatDate={formatDateOnlyFromApi}
        />
      )}
    </div>
  );
};

const StatusBadges: React.FC<{ row: WorkflowRow }> = ({ row }) => (
  <div className="badge-row">
    <span className={`badge ${indicatorClass(row.indicator)}`}>{indicatorLabel(row.indicator)}</span>
    {row.indicator !== "Blocked" && row.isBlocked && <span className="badge badge-danger">Blocked</span>}
    {row.indicator !== "Overdue" && row.isOverdue && <span className="badge badge-danger">Overdue</span>}
    {row.indicator !== "NeedsAction" && row.needsAction && !row.isComplete && !row.isCancelled && (
      <span className="badge badge-warning">Needs action</span>
    )}
  </div>
);

const JourneyTable: React.FC<{
  rows: WorkflowRow[];
  onOpen: (id: string) => void;
  onOpenPath: (event: React.MouseEvent, path?: string | null) => void;
  formatDate: (value?: string | null) => string;
  start: number;
  end: number;
  total: number;
  currentPage: number;
  totalPages: number;
  pageSize: number;
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
}> = (props) => (
  <div className="table-card">
    <div className="table-wrapper">
      <table className="customers-table">
        <thead>
          <tr>
            <th>Reference</th>
            <th>Customer</th>
            <th>Stage</th>
            <th>Status</th>
            <th>Owner</th>
            <th>Age</th>
            <th>Next action</th>
          </tr>
        </thead>
        <tbody>
          {props.rows.map((row) => (
            <tr key={row.id} onClick={() => props.onOpen(row.id)}>
              <td>
                <button type="button" className="entity-number" onClick={(event) => props.onOpenPath(event, row.orderPath || row.quotationPath)}>
                  {row.reference}
                </button>
              </td>
              <td className="name-cell" title={row.customerName}>{row.customerName || "—"}</td>
              <td>
                <div className="stage-trail">
                  {row.stages.filter((item) => item.state !== "NotApplicable").map((item) => (
                    <span
                      key={item.code}
                      className={`stage-pill ${item.state.toLowerCase()}`}
                      aria-label={`${item.label}: ${stageStateLabel(item.state)}`}
                    >
                      {item.label}
                    </span>
                  ))}
                </div>
              </td>
              <td><StatusBadges row={row} /></td>
              <td>{row.ownerLabel || "Unassigned"}</td>
              <td title={AGE_TITLE}>{row.ageDays}d</td>
              <td>{row.nextAction}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    <ClientPagination
      startIndex={props.start}
      endIndex={props.end}
      total={props.total}
      currentPage={props.currentPage}
      totalPages={props.totalPages}
      onPageChange={props.onPage}
      pageSize={props.pageSize}
      onPageSizeChange={props.onPageSize}
    />
  </div>
);

const stageStateLabel = (state: string) => {
  switch (state) {
    case "Complete": return "Completed";
    case "Current": return "Current";
    case "Upcoming": return "Upcoming";
    case "Blocked": return "Blocked";
    case "Attention": return "Needs attention";
    case "Cancelled": return "Cancelled";
    case "NotApplicable": return "Not applicable";
    default: return "Unavailable";
  }
};

const isOpenNcrStatus = (status?: string | null) => {
  const value = (status || "").trim().toLowerCase();
  return value !== "closed" && value !== "rejected";
};

const isOpenInvoice = (substage?: string | null) => substage !== "Paid" && substage !== "Void";

interface StageLink {
  key: string;
  type: string;
  identifier: string;
  status?: string;
  path?: string | null;
  affordance: string;
}

interface StageBucket {
  rows: StageLink[];
  notes: string[];
}

const STAGE_PREVIEW = 4;

const isDraftJob = (status?: string | null) => {
  const value = (status || "").trim().toLowerCase();
  return value === "" || value === "draft";
};

const calendarDaysAfter = (value?: string | null) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value || "");
  if (!match) return null;
  const due = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((today - due) / 86400000);
  return days > 0 ? days : null;
};

const dueLabel = (
  value: string | null | undefined,
  overdue: boolean,
  formatDate: (value?: string | null) => string
) => {
  if (!value) return null;
  const formatted = formatDate(value);
  if (!formatted) return null;
  const days = overdue ? calendarDaysAfter(value) : null;
  if (days == null) return formatted;
  return `${formatted} · ${days} day${days === 1 ? "" : "s"} overdue`;
};

const chooseAction = (actions: WorkflowAction[], row: WorkflowRow) => {
  const linked = actions.filter((action) => action.linkPath);
  const matched = linked.filter((action) => action.stageCode === row.principalStage);
  const pool = matched.length > 0 ? matched : linked;
  return pool.slice().sort((a, b) => a.rank - b.rank)[0] || null;
};

const stageRecords = (
  row: WorkflowRow,
  actions: WorkflowAction[],
  formatCurrency: (value: number) => string,
  formatDate: (value?: string | null) => string
): Record<string, StageBucket> => {
  const buckets: Record<string, StageBucket> = {};
  const add = (code: string, link: StageLink) => {
    const bucket = buckets[code] || (buckets[code] = { rows: [], notes: [] });
    if (bucket.rows.some((item) => item.key === link.key)) return;
    bucket.rows.push(link);
  };
  const note = (code: string, text?: string | null) => {
    const value = (text || "").trim();
    if (!value) return;
    const bucket = buckets[code] || (buckets[code] = { rows: [], notes: [] });
    if (!bucket.notes.includes(value)) bucket.notes.push(value);
  };

  if (row.quotationPath) {
    add("Quotation", {
      key: `quotation-${row.quotationId || row.quotationPath}`,
      type: "Quotation",
      identifier: row.kind === "Quotation" ? row.reference : "Customer quotation",
      path: row.quotationPath,
      affordance: "Open quotation",
    });
  }
  if (row.orderPath) {
    add("CustomerOrder", {
      key: `order-${row.customerOrderId || row.orderPath}`,
      type: "Customer order",
      identifier: row.reference,
      path: row.orderPath,
      affordance: "Open record",
    });
  }

  const planningState = row.stages.find((stage) => stage.code === "Planning")?.state;
  const planningGaps = actions.filter((action) => action.kind === "PlanningGap" && (action.linkPath || row.orderPath));
  planningGaps.forEach((action) => {
    add("Planning", {
      key: action.id,
      type: "Customer order",
      identifier: row.reference,
      status: action.title || "No job order linked",
      path: action.linkPath || row.orderPath,
      affordance: "Open customer order",
    });
  });
  if (!planningGaps.length && row.jobs.length === 0 && row.orderPath && (planningState === "Current" || planningState === "Attention")) {
    add("Planning", {
      key: "planning-order",
      type: "Customer order",
      identifier: row.reference,
      status: "No job order linked",
      path: row.orderPath,
      affordance: "Open customer order",
    });
  }

  row.jobs.forEach((job) => {
    add(isDraftJob(job.status) ? "Planning" : "Production", {
      key: `job-${job.jobOrderId}`,
      type: "Job order",
      identifier: job.number,
      status: job.status || undefined,
      path: job.path,
      affordance: "Open record",
    });
  });

  const seenOrders = new Set<number>();
  row.purchases.forEach((purchase) => {
    if (seenOrders.has(purchase.vendorOrderId)) return;
    seenOrders.add(purchase.vendorOrderId);
    const lines = row.purchases.filter((item) => item.vendorOrderId === purchase.vendorOrderId);
    const qtyOrdered = lines.reduce((sum, item) => sum + (item.qtyOrdered || 0), 0);
    const qtyReceived = lines.reduce((sum, item) => sum + (item.qtyReceived || 0), 0);
    add("Materials", {
      key: `po-${purchase.vendorOrderId}`,
      type: "Vendor order",
      identifier: purchase.number,
      status: [purchase.vendorName, purchase.status].filter(Boolean).join(" · ") || undefined,
      path: purchase.orderPath,
      affordance: "Open record",
    });
    add("Materials", {
      key: `recv-${purchase.vendorOrderId}`,
      type: "Receipt",
      identifier: purchase.number,
      status: `Received ${qtyReceived} of ${qtyOrdered}`,
      path: purchase.receivingPath,
      affordance: "Open receiving",
    });
  });

  row.shortages.forEach((item) => {
    const job = row.jobs.find((entry) => entry.jobOrderId === item.jobOrderId);
    const requiredBy = item.requiredBy ? formatDate(item.requiredBy) : "";
    add("Materials", {
      key: `short-${item.jobOrderId}-${item.partNo || ""}-${item.partName || ""}`,
      type: "Material requirement",
      identifier: item.partNo || item.partName || item.jobNumber,
      status: [`Short ${item.shortQty}`, item.jobNumber, requiredBy ? `Required by ${requiredBy}` : ""].filter(Boolean).join(" · "),
      path: job?.path || `/job-orders?open=${item.jobOrderId}`,
      affordance: "Open job order",
    });
  });
  if (row.shortages.length) note("Materials", "A vendor order does not make the material available.");

  row.ncrs.forEach((ncr) => {
    add("Quality", {
      key: `ncr-${ncr.ncrId}`,
      type: "NCR",
      identifier: ncr.number,
      status: [ncr.status, ncr.title].filter(Boolean).join(" · ") || undefined,
      path: ncr.path,
      affordance: isOpenNcrStatus(ncr.status) ? "Open NCR" : "Open record",
    });
  });

  row.shipments.forEach((shipment) => {
    add("Shipment", {
      key: `ship-${shipment.shipmentId}`,
      type: "Shipment",
      identifier: shipment.number,
      status: shipment.shipmentDate ? formatDate(shipment.shipmentDate) : undefined,
      path: shipment.path,
      affordance: "Open shipment",
    });
  });

  row.invoices.forEach((invoice) => {
    add("Invoice", {
      key: `inv-${invoice.invoiceId}`,
      type: "Invoice",
      identifier: invoice.number,
      status: invoice.balance > 0
        ? `${invoice.status} · ${formatCurrency(invoice.balance)} outstanding`
        : invoice.status,
      path: invoice.path,
      affordance: "Open invoice",
    });
  });

  const openInvoices = row.invoices.filter((invoice) => isOpenInvoice(invoice.substage));
  if (openInvoices.length) {
    const outstanding = openInvoices.reduce((sum, invoice) => sum + (invoice.balance || 0), 0);
    add("Collection", {
      key: "ar",
      type: "Receivable",
      identifier: "Accounts receivable",
      status: `${formatCurrency(outstanding)} outstanding`,
      path: "/accounts/receivable",
      affordance: "Open record",
    });
  }

  return buckets;
};

const WorkflowDetail: React.FC<{
  row: WorkflowRow;
  actions: WorkflowAction[];
  canAssign: boolean;
  canAcknowledge: boolean;
  currentUserId: number;
  onClose: () => void;
  onOpenPath: (event: React.MouseEvent, path?: string | null) => void;
  onChanged: () => void | Promise<boolean>;
  onPatch: (id: string, patch: Partial<WorkflowRow>) => void;
  formatCurrency: (value: number) => string;
  formatDate: (value?: string | null) => string;
}> = ({ row, actions, canAssign, canAcknowledge, currentUserId, onClose, onOpenPath, onChanged, onPatch, formatCurrency, formatDate }) => {
  const overlayRef = useRef<HTMLDivElement>(null);
  const primary = useMemo(() => chooseAction(actions, row), [actions, row]);
  const records = useMemo(
    () => stageRecords(row, actions, formatCurrency, formatDate),
    [row, actions, formatCurrency, formatDate]
  );
  const [expandedId, setExpandedId] = useState("");
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);
  const [assigneeId, setAssigneeId] = useState("");
  const [assignees, setAssignees] = useState<WorkflowAssignee[]>([]);
  const [blockerNote, setBlockerNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingAction, setPendingAction] = useState("");
  const [pendingOwner, setPendingOwner] = useState("");
  const [formError, setFormError] = useState("");
  if (expandedId !== row.id) {
    setExpandedId(row.id);
    setExpandedKeys([]);
    setAssigneeId("");
    setAssignees([]);
    setPendingAction("");
    setPendingOwner("");
    setBlockerNote(row.manualBlocker || "");
    setFormError("");
  }

  useEffect(() => {
    if (!canAssign || !row.isActive) return undefined;
    let cancelled = false;
    WorkflowService.GetAssignees(row.id)
      .then((people) => {
        if (!cancelled) setAssignees(people);
      })
      .catch(() => {
        if (!cancelled) setAssignees([]);
      });
    return () => {
      cancelled = true;
    };
  }, [canAssign, row.id, row.isActive]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    const page = document.querySelector(".page-content");
    page?.classList.add("workflow-scroll-lock");
    const overlay = overlayRef.current;
    const onWheel = (event: WheelEvent) => {
      const content = overlay?.querySelector(".slideout-content");
      if (content instanceof HTMLElement && event.target instanceof Node && content.contains(event.target)) {
        const delta = event.deltaY;
        const atTop = content.scrollTop <= 0;
        const atBottom = content.scrollTop + content.clientHeight >= content.scrollHeight - 1;
        if ((delta < 0 && atTop) || (delta > 0 && atBottom)) event.preventDefault();
        return;
      }
      event.preventDefault();
    };
    overlay?.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      page?.classList.remove("workflow-scroll-lock");
      overlay?.removeEventListener("wheel", onWheel);
    };
  }, []);

  const showAction = row.isActive && (row.needsAction || row.isBlocked || row.isOverdue || Boolean(row.blockerReason));
  const reason = showAction
    ? (row.blockerReason || (primary?.detail && primary.detail !== row.nextAction ? primary.detail : ""))
    : "";
  const stages = row.stages.filter((item) => item.state !== "NotApplicable" || (records[item.code]?.rows.length || 0) > 0);
  const owner = row.ownerLabel?.trim() || "Unassigned";
  const dueValue = primary?.dueDate || row.dueDate;
  const markOverdue = primary?.kind === "OverdueInvoice"
    || primary?.kind === "OverdueJob"
    || (row.isOverdue && dueValue === row.dueDate);
  const shownDue = showAction ? dueLabel(dueValue, markOverdue, formatDate) : null;
  const actionPath = showAction ? primary?.linkPath : null;
  const actionLabel = primary?.linkLabel || "Open record";
  const waitingForMe = row.isActive
    && canAcknowledge
    && row.handoffStatus === "Pending"
    && row.ownerUserId === currentUserId;
  const shownOwner = pendingAction === "assign" && pendingOwner ? pendingOwner : owner;
  const saveAssignment = async (action: string, work: () => Promise<void>) => {
    setBusy(true);
    setPendingAction(action);
    setFormError("");
    if (action === "assign") {
      const person = assignees.find((item) => item.userId === Number(assigneeId));
      setPendingOwner(person?.name || "");
    }
    try {
      await work();
      if (action === "assign") {
        const person = assignees.find((item) => item.userId === Number(assigneeId));
        onPatch(row.id, {
          ownerUserId: Number(assigneeId),
          ownerLabel: person?.name || "Unassigned",
          handoffStatus: "Pending",
        });
      } else if (action === "acknowledge") {
        onPatch(row.id, { handoffStatus: "Acknowledged" });
      }
      void onChanged();
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setFormError(message || "The assignment could not be saved.");
      setPendingOwner("");
    } finally {
      setBusy(false);
      setPendingAction("");
    }
  };

  return (
    <div className="slideout-overlay" ref={overlayRef} onClick={onClose}>
      <div className="slideout-panel workflow-detail" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label={row.reference}>
        <div className="slideout-header workflow-detail-header">
          <div className="workflow-detail-title">
            <h2>{row.reference}</h2>
            <p>{row.customerName || "—"}</p>
          </div>
          <button type="button" className="slideout-close" onClick={onClose} aria-label="Close">
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>
        <div className="slideout-content">
          <section className={`action-panel${showAction && row.isBlocked ? " blocked" : showAction && row.isOverdue ? " overdue" : ""}`}>
            <StatusBadges row={row} />
            <h3>{showAction ? "Action required" : "Next action"}</h3>
            <p className="next-action">{row.nextAction || "None"}</p>
            {reason && <p className="action-reason">{reason}</p>}
            {row.manualBlocker && row.manualBlocker !== reason && (
              <p className="action-reason">Note: {row.manualBlocker}</p>
            )}
            {row.rejectionNote && <p className="rejection-note">{row.rejectionNote}</p>}
            {row.isActive && (
              <p className="action-meta">
                <span>
                  <span className="meta-label">Owner</span> {shownOwner}
                  {busy && pendingAction === "assign" && (
                    <span className="saving-note"><span className="saving-spinner" aria-hidden="true" /> Saving…</span>
                  )}
                </span>
                {shownDue && <span><span className="meta-label">Due</span> {shownDue}</span>}
              </p>
            )}
            {row.isActive && canAssign && (
              <div className="coordination">
                <select className="filter-select" value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)} aria-label="Assign to" disabled={busy}>
                  <option value="">Choose a person</option>
                  {assignees.map((person) => (
                    <option key={person.userId} value={person.userId}>{person.name}</option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={busy || !assigneeId || Number(assigneeId) === row.ownerUserId}
                  onClick={() => saveAssignment("assign", () => WorkflowService.Assign(row.id, Number(assigneeId), row.coordinationTaskId))}
                >
                  {pendingAction === "assign" ? "Saving…" : row.ownerUserId ? "Reassign" : "Assign"}
                </button>
              </div>
            )}
            {waitingForMe && (
              <div className="coordination">
                <button type="button" className="btn-secondary" disabled={busy} onClick={() => saveAssignment("acknowledge", () => WorkflowService.Acknowledge(row.id, row.coordinationTaskId))}>
                  {pendingAction === "acknowledge" ? "Saving…" : "Acknowledge"}
                </button>
                <button type="button" className="link-button" disabled={busy} onClick={() => saveAssignment("reject", () => WorkflowService.Reject(row.id, row.coordinationTaskId))}>
                  {pendingAction === "reject" ? "Saving…" : "Reject"}
                </button>
              </div>
            )}
            {busy && pendingAction === "acknowledge" && (
              <p className="saving-note"><span className="saving-spinner" aria-hidden="true" /> Saving acknowledgement…</p>
            )}
            {showAction && row.isBlocked && canAssign && (
              <div className="coordination">
                <input
                  className="form-input"
                  value={blockerNote}
                  onChange={(event) => setBlockerNote(event.target.value)}
                  placeholder="Note about the shortage. This does not clear it."
                  disabled={busy}
                  maxLength={500}
                />
                <button type="button" className="btn-secondary" disabled={busy} onClick={() => saveAssignment("note", () => WorkflowService.SaveBlockerNote(row.id, blockerNote, row.coordinationTaskId))}>
                  {pendingAction === "note" ? "Saving…" : "Save note"}
                </button>
              </div>
            )}
            {formError && <p className="rejection-note">{formError}</p>}
            {actionPath && (
              <button type="button" className="btn-primary" onClick={(event) => onOpenPath(event, actionPath)}>
                {actionLabel}
              </button>
            )}
          </section>

          <section className="drawer-section">
            <h3>Workflow journey</h3>
            <ol className="journey">
              {stages.map((stage) => {
                const bucket = records[stage.code];
                const rows = bucket?.rows || [];
                const open = expandedKeys.includes(stage.code);
                const visible = open ? rows : rows.slice(0, STAGE_PREVIEW);
                const hidden = rows.length - visible.length;
                return (
                  <li
                    key={stage.code}
                    className={stage.state.toLowerCase()}
                    aria-current={stage.code === row.principalStage ? "step" : undefined}
                  >
                    <div className="stage-line">
                      <span className="dot" aria-hidden="true" />
                      <span className="name">{stage.label}</span>
                      <span className="status">{stageStateLabel(stage.state)}</span>
                    </div>
                    {bucket?.notes.map((text) => (
                      <p key={text} className="stage-note">{text}</p>
                    ))}
                    {visible.length > 0 && (
                      <ul className="stage-records">
                        {visible.map((item) => (
                          <li key={item.key}>
                            <button
                              type="button"
                              className="record-link"
                              onClick={(event) => onOpenPath(event, item.path)}
                              disabled={!item.path}
                            >
                              <span className="record-type">{item.type}</span>
                              <span className="record-id">{item.identifier}</span>
                              {item.status && <span className="record-status">{item.status}</span>}
                              <span className="record-go">
                                {item.affordance}
                                <span aria-hidden="true"> →</span>
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    {hidden > 0 && (
                      <button
                        type="button"
                        className="link-button view-all"
                        onClick={(event) => {
                          event.stopPropagation();
                          setExpandedKeys((current) => current.concat(stage.code));
                        }}
                      >
                        View all ({rows.length})
                      </button>
                    )}
                  </li>
                );
              })}
            </ol>
            <p className="journey-note">
              Derived from the current source records.
              {row.documentDate ? ` Document age ${row.ageDays} days.` : ""}
            </p>
          </section>
        </div>
      </div>
    </div>
  );
};

export default WorkflowCenter;
