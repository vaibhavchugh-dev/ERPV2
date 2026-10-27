import React, { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useHistory, useLocation } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSearch, faTimes } from "@fortawesome/free-solid-svg-icons";
import ClientPagination from "../../Common/Components/ClientPagination";
import SortIndicator from "../../Common/Components/SortIndicator";
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

const CustomerQuotationSlideout = React.lazy(() => import("../Quotations/CustomerQuotationSlideout"));
const CustomerOrderSlideout = React.lazy(() => import("../Orders/CustomerOrderSlideout"));

type NestedDocument = { kind: "quotation" | "order"; id: number };

const nestedDocument = (path?: string | null): NestedDocument | null => {
  const match = /^\/(quotations\/customer|orders\/customer)\?([^#]*)/.exec(path || "");
  if (!match) return null;
  const id = Number(new URLSearchParams(match[2]).get("open"));
  if (!Number.isFinite(id) || id <= 0) return null;
  return { kind: match[1] === "quotations/customer" ? "quotation" : "order", id };
};

type WorkflowSortKey = "reference" | "customer" | "stage" | "status" | "owner" | "age" | "next";

const compareWorkflows = (a: WorkflowRow, b: WorkflowRow, key: WorkflowSortKey, dir: "asc" | "desc") => {
  const sign = dir === "asc" ? 1 : -1;
  const text = (left: string, right: string) => left.localeCompare(right, undefined, { sensitivity: "base" }) * sign;
  switch (key) {
    case "reference":
      return text(a.reference || "", b.reference || "");
    case "customer":
      return text(a.customerName || "", b.customerName || "");
    case "stage":
      return text(a.principalStageLabel || "", b.principalStageLabel || "");
    case "status":
      return text(a.indicator || "", b.indicator || "");
    case "owner":
      return text(a.ownerLabel || "", b.ownerLabel || "");
    case "next":
      return text(a.nextAction || "", b.nextAction || "");
    default: {
      const byAge = (a.ageDays - b.ageDays) * sign;
      if (byAge) return byAge;
      return (b.documentDate || "").localeCompare(a.documentDate || "");
    }
  }
};

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

const ownerMatches = (row: WorkflowRow | undefined, ownerFilter: string) => {
  if (!ownerFilter) return true;
  if (ownerFilter === "unassigned") return !row?.ownerUserId;
  return String(row?.ownerUserId || "") === ownerFilter;
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

const CHORE_STATUS_OPTIONS = [
  { value: "", label: "All priorities" },
  { value: "blocked", label: "Blocked" },
  { value: "overdue", label: "Overdue" },
  { value: "needsAction", label: "Needs action" },
];

const includesText = (haystack: string, query: string) =>
  haystack.toLowerCase().includes(query.trim().toLowerCase());

const isChoreStatus = (status: string) => !status || status === "needsAction" || status === "blocked" || status === "overdue";

const priorityLabel = (priority: string) => {
  if (priority === "Blocked" || priority === "Overdue" || priority === "High") return priority;
  return "Needs action";
};

const priorityClass = (priority: string) =>
  priority === "Blocked" || priority === "Overdue" ? "badge-danger" : "badge-warning";

const actionStatusBadges = (action: WorkflowAction) => {
  const badges: { label: string; className: string }[] = [];
  const seen = new Set<string>();
  const add = (label: string, className: string) => {
    if (seen.has(label)) return;
    seen.add(label);
    badges.push({ label, className });
  };
  if (action.priorityLabel === "Blocked" || action.blockerReason) add("Blocked", "badge-danger");
  const pastDue = Boolean(action.dueDate && calendarDaysAfter(action.dueDate) != null);
  if (action.priorityLabel === "Overdue" || pastDue) add("Overdue", "badge-danger");
  if (!seen.has("Blocked") && !seen.has("Overdue")) {
    add(priorityLabel(action.priorityLabel), priorityClass(action.priorityLabel));
  }
  return badges;
};

const matchesChoreStatus = (action: WorkflowAction, status: string) => {
  if (status === "blocked") return action.priorityLabel === "Blocked";
  if (status === "overdue") return action.priorityLabel === "Overdue";
  if (status === "needsAction") return action.priorityLabel !== "Blocked" && action.priorityLabel !== "Overdue";
  return true;
};

const compareChores = (a: WorkflowAction, b: WorkflowAction) => {
  const group = (priority: string) => (priority === "Blocked" ? 0 : priority === "Overdue" ? 1 : 2);
  const byGroup = group(a.priorityLabel) - group(b.priorityLabel);
  if (byGroup) return byGroup;
  const aDue = a.dueDate || "9999-12-31";
  const bDue = b.dueDate || "9999-12-31";
  if (aDue !== bDue) return aDue < bDue ? -1 : 1;
  return a.reference.localeCompare(b.reference) || a.title.localeCompare(b.title);
};

type WorkflowSnapshot = {
  q: string;
  stage: string;
  status: string;
  selected: string | null;
  view: "orders" | "chores";
};

const returnedWorkflowView = (): WorkflowSnapshot => {
  const params = new URLSearchParams(window.location.search);
  return {
    q: params.get("q") ?? "",
    stage: params.get("stage") ?? "",
    status: params.get("status") ?? "",
    selected: params.get("selected"),
    view: params.get("view") === "chores" ? "chores" : "orders",
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

const readReturnSnapshot = (): WorkflowSnapshot => {
  const fromUrl = returnedWorkflowView();
  const params = new URLSearchParams(window.location.search);
  if (params.has("view") || fromUrl.selected || fromUrl.q || fromUrl.stage || fromUrl.status) return fromUrl;
  try {
    const raw = sessionStorage.getItem(RETURN_KEY);
    if (!raw) return fromUrl;
    const saved = JSON.parse(raw) as Partial<WorkflowSnapshot>;
    return {
      q: saved.q || "",
      stage: saved.stage || "",
      status: saved.status || "",
      selected: saved.selected || null,
      view: saved.view === "chores" ? "chores" : "orders",
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
  const [status, setStatus] = useState(
    returned.view === "chores" && !isChoreStatus(returned.status) ? "" : returned.status
  );
  const [view, setView] = useState<"orders" | "chores">(returned.view);
  const [ownerFilter, setOwnerFilter] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(returned.selected);
  const [nested, setNested] = useState<NestedDocument | null>(null);
  const [sortKey, setSortKey] = useState<WorkflowSortKey>("age");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const closedSelection = useRef<string | null>(null);
  const heldRow = useRef<WorkflowRow | null>(null);
  const seenSearch = useRef(location.search);
  const loadSeq = useRef(0);
  const selectedIdRef = useRef(selectedId);
  const awaitingSelection = useRef<string | null>(null);
  selectedIdRef.current = selectedId;

  const closeDrawer = () => {
    if (nested) return;
    closedSelection.current = selectedId;
    heldRow.current = null;
    setSelectedId(null);
  };

  const toggleSort = (column: WorkflowSortKey) => {
    if (sortKey === column) setSortDir((current) => (current === "asc" ? "desc" : "asc"));
    else {
      setSortKey(column);
      setSortDir("asc");
    }
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
    const seq = ++loadSeq.current;
    const cached = overviewCache?.key === key ? overviewCache.data : null;
    if (!cached) setLoading(true);
    setError(null);
    return WorkflowService.GetOverview(locationIdParam)
      .then((data) => {
        if (seq !== loadSeq.current) return false;
        const pendingId = awaitingSelection.current;
        if (pendingId) awaitingSelection.current = null;
        const openId = pendingId ?? selectedIdRef.current;
        const stillThere = !!openId && data.workflows.some((row) => row.id === openId);
        // A deleted quotation or order is no longer in this payload. Drop the snapshot
        // the drawer was holding. If deleting the order restored its quotation, follow that.
        if (openId && !stillThere && !pendingId) {
          const previous = heldRow.current;
          const replacement = previous?.quotationId
            ? data.workflows.find((row) => row.kind === "Quotation" && row.quotationId === previous.quotationId)
            : undefined;
          heldRow.current = null;
          closedSelection.current = null;
          setSelectedId(replacement?.id ?? null);
        }
        overviewCache = { key, data };
        setOverview(data);
        setLoading(false);
        return true;
      })
      .catch((err: { response?: { data?: { error?: string } } }) => {
        if (seq !== loadSeq.current) return false;
        if (!cached) {
          setOverview(null);
          setError(err?.response?.data?.error || "Workflow Center could not be loaded.");
        }
        setLoading(false);
        return false;
      });
  };

  useEffect(() => {
    const key = locationKey(locationIdParam);
    const cached = overviewCache?.key === key ? overviewCache.data : null;
    if (cached) setOverview(cached);
    else setOverview(null);
    load();
    // locationIdParam is the site scope. load() reads the latest value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationIdParam]);

  useEffect(() => {
    sessionStorage.removeItem(RETURN_KEY);
  }, []);

  useEffect(() => {
    // Selection is written with replaceState, so this router search stays stale.
    // Reading it whenever selectedId changes would put the drawer back on the quotation
    // after a convert, and the timeline would keep the old snapshot.
    if (location.search === seenSearch.current) return;
    seenSearch.current = location.search;
    const selected = new URLSearchParams(location.search).get("selected");
    if (closedSelection.current && selected !== closedSelection.current)
      closedSelection.current = null;
    if (closedSelection.current === selected) return;
    setSelectedId(selected);
  }, [location.search]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (search.trim()) params.set("q", search.trim());
    if (stage) params.set("stage", stage);
    if (status) params.set("status", status);
    if (view === "chores") params.set("view", "chores");
    if (selectedId) params.set("selected", selectedId);
    const next = params.toString();
    const current = window.location.search.startsWith("?") ? window.location.search.slice(1) : window.location.search;
    if (next === current) return;
    const url = next ? `${location.pathname}?${next}` : location.pathname;
    window.history.replaceState(window.history.state, "", url);
  }, [search, stage, status, view, selectedId, location.pathname]);

  useEffect(() => {
    setPage(1);
  }, [search, stage, status, view, ownerFilter, pageSize, sortKey, sortDir]);

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
    () => scoped.filter((row) => matchesStatus(row, status) && ownerMatches(row, ownerFilter)),
    [scoped, status, ownerFilter]
  );
  const chores = useMemo(() => {
    const byId = new Map(workflows.map((row) => [row.id, row]));
    return (overview?.actions || [])
      .filter((action) => {
        const row = byId.get(action.workflowId);
        const text = [action.title, action.detail, action.reference, action.customerName, action.linkText, action.stageLabel, row?.searchText]
          .filter(Boolean)
          .join(" ");
        if (search.trim() && !includesText(text, search)) return false;
        if (stage && action.stageCode !== stage) return false;
        if (!matchesChoreStatus(action, status)) return false;
        return ownerMatches(row, ownerFilter);
      })
      .filter((action) => action.kind !== "JobInProgress")
      .sort(compareChores);
  }, [overview?.actions, workflows, search, stage, status, ownerFilter]);
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

  const sorted = useMemo(
    () => listed.slice().sort((a, b) => compareWorkflows(a, b, sortKey, sortDir)),
    [listed, sortKey, sortDir]
  );
  const rowsForPage = view === "chores" ? chores : sorted;
  const total = rowsForPage.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * pageSize;
  const pagedRows = sorted.slice(start, start + pageSize);
  const pagedChores = chores.slice(start, start + pageSize);
  const selected = workflows.find((row) => row.id === selectedId) || null;
  if (selected) heldRow.current = selected;
  const shown = selected || (selectedId ? heldRow.current : null);

  const openPath = (event: React.MouseEvent, path?: string | null, workflowId?: string) => {
    event.stopPropagation();
    if (!path) return;
    const document = nestedDocument(path);
    if (document) {
      setNested(document);
      return;
    }
    const returnSelection = workflowId || selectedId;
    const params = new URLSearchParams();
    if (search.trim()) params.set("q", search.trim());
    if (stage) params.set("stage", stage);
    if (status) params.set("status", status);
    if (view === "chores") params.set("view", "chores");
    if (returnSelection) params.set("selected", returnSelection);
    const qs = params.toString();
    const returnTo = qs ? `/workflow?${qs}` : "/workflow";
    sessionStorage.setItem(RETURN_KEY, JSON.stringify({
      q: search.trim(),
      stage,
      status,
      view,
      selected: returnSelection,
    }));
    history.push(path, { returnTo });
  };

  const showOrders = (nextStatus?: string) => {
    setView("orders");
    if (nextStatus !== undefined) setStatus(nextStatus);
  };
  const showChores = () => {
    setView("chores");
    if (!isChoreStatus(status)) setStatus("");
  };

  return (
    <div className="workflow-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Workflow Center</h1>
          <p className="page-subtitle">
            {view === "chores"
              ? "One row for each piece of work. An order can have more than one."
              : "Customer orders and open quotations for the current site."}
          </p>
        </div>
        <div className="view-toggle" role="group" aria-label="List">
          <button type="button" className={view === "orders" ? "active" : ""} onClick={() => showOrders()}>Orders</button>
          <button type="button" className={view === "chores" ? "active" : ""} onClick={showChores}>Chores</button>
        </div>
      </div>

      <div className="workflow-metrics">
        <button type="button" className={view === "orders" && status === "active" ? "active" : ""} onClick={() => showOrders(view === "orders" && status === "active" ? "" : "active")}>
          <strong>{summary.active}</strong>
          <span>Active workflows</span>
        </button>
        <button type="button" className={view === "orders" && status === "needsAction" ? "active" : ""} onClick={() => showOrders(view === "orders" && status === "needsAction" ? "" : "needsAction")}>
          <strong>{summary.needsAction}</strong>
          <span>Needs action</span>
        </button>
        <button type="button" className={view === "orders" && status === "blocked" ? "active" : ""} onClick={() => showOrders(view === "orders" && status === "blocked" ? "" : "blocked")}>
          <strong>{summary.blocked}</strong>
          <span>Blocked</span>
        </button>
        <button type="button" className={view === "orders" && status === "overdue" ? "active" : ""} onClick={() => showOrders(view === "orders" && status === "overdue" ? "" : "overdue")}>
          <strong>{summary.overdue}</strong>
          <span>Overdue</span>
        </button>
      </div>
      <p className="workflow-note">These counts are orders. They follow the site, search, and stage filters. An order can be counted in more than one total.</p>
      {view === "orders" && <ul className="stage-legend" aria-label="Stage colors">
        <li><span className="stage-pill complete">Completed</span></li>
        <li><span className="stage-pill current">Current</span></li>
        <li><span className="stage-pill attention">Needs attention</span></li>
        <li><span className="stage-pill blocked">Blocked</span></li>
        <li><span className="stage-pill upcoming">Upcoming</span></li>
        <li><span className="stage-pill cancelled">Cancelled</span></li>
      </ul>}

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
        <select className="filter-select" value={isChoreStatus(status) || view === "orders" ? status : ""} onChange={(event) => setStatus(event.target.value)} aria-label={view === "chores" ? "Priority" : "Status"}>
          {(view === "chores" ? CHORE_STATUS_OPTIONS : STATUS_OPTIONS).map((option) => (
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
      ) : rowsForPage.length === 0 ? (
        <div className="empty-state">
          <p>
            {view === "chores"
              ? (overview?.actions || []).length === 0
                ? "No chores for this site."
                : search.trim()
                  ? "No chores match that search."
                  : "No chores match the current filters."
              : workflows.length === 0
                ? "No customer orders or open quotations for this site."
                : search.trim()
                  ? "No workflows match that search."
                  : "No workflows match the current filters."}
          </p>
        </div>
      ) : view === "chores" ? (
        <ChoreTable
          rows={pagedChores}
          workflows={workflows}
          onOpen={setSelectedId}
          onOpenPath={openPath}
          formatDate={formatDateOnlyFromApi}
          start={start}
          end={Math.min(start + pageSize, chores.length)}
          total={chores.length}
          currentPage={currentPage}
          totalPages={totalPages}
          pageSize={pageSize}
          onPage={setPage}
          onPageSize={setPageSize}
        />
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
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={toggleSort}
        />
      )}

      {shown && (
        <WorkflowDetail
          key={shown.id}
          row={shown}
          actions={(overview?.actions || []).filter((action) => action.workflowId === shown.id)}
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

      {nested && (
        <div className="workflow-nested-document">
          <Suspense fallback={null}>
            {nested.kind === "quotation" ? (
              <CustomerQuotationSlideout
                quotationId={nested.id}
                onClose={() => {
                  setNested(null);
                  load();
                }}
                onConverted={(orderId) => {
                  setNested(null);
                  const nextId = `order-${orderId}`;
                  closedSelection.current = null;
                  heldRow.current = shown;
                  awaitingSelection.current = nextId;
                  selectedIdRef.current = nextId;
                  setSelectedId(nextId);
                  load();
                }}
              />
            ) : (
              <CustomerOrderSlideout
                orderId={nested.id}
                onClose={() => {
                  setNested(null);
                  load();
                }}
              />
            )}
          </Suspense>
        </div>
      )}
    </div>
  );
};

const SortHeader: React.FC<{
  label: string;
  column: WorkflowSortKey;
  sortKey: WorkflowSortKey;
  sortDir: "asc" | "desc";
  onSort: (column: WorkflowSortKey) => void;
  title?: string;
}> = ({ label, column, sortKey, sortDir, onSort, title }) => {
  const active = sortKey === column;
  return (
    <th
      className="sortable"
      title={title}
      aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
      onClick={() => onSort(column)}
    >
      <div className="th-content">
        <span>{label}</span>
        <SortIndicator active={active} direction={sortDir} />
      </div>
    </th>
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
  sortKey: WorkflowSortKey;
  sortDir: "asc" | "desc";
  onSort: (column: WorkflowSortKey) => void;
}> = (props) => (
  <div className="table-card">
    <div className="table-wrapper">
      <table className="customers-table">
        <thead>
          <tr>
            <SortHeader label="Reference" column="reference" sortKey={props.sortKey} sortDir={props.sortDir} onSort={props.onSort} />
            <SortHeader label="Customer" column="customer" sortKey={props.sortKey} sortDir={props.sortDir} onSort={props.onSort} />
            <SortHeader label="Stage" column="stage" sortKey={props.sortKey} sortDir={props.sortDir} onSort={props.onSort} />
            <SortHeader label="Status" column="status" sortKey={props.sortKey} sortDir={props.sortDir} onSort={props.onSort} />
            <SortHeader label="Owner" column="owner" sortKey={props.sortKey} sortDir={props.sortDir} onSort={props.onSort} />
            <SortHeader label="Age" column="age" sortKey={props.sortKey} sortDir={props.sortDir} onSort={props.onSort} title={AGE_TITLE} />
            <SortHeader label="Next action" column="next" sortKey={props.sortKey} sortDir={props.sortDir} onSort={props.onSort} />
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

const purchaseTotals = (lines: WorkflowRow["purchases"]) => {
  const seen = new Set<string>();
  let ordered = 0;
  let received = 0;
  lines.forEach((item) => {
    const key = item.detailKey || `${item.vendorOrderId}-${item.jobOrderId || 0}`;
    if (seen.has(key)) return;
    seen.add(key);
    ordered += item.qtyOrdered || 0;
    received += item.qtyReceived || 0;
  });
  return { ordered, received };
};

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

const vendorOrderCanBeReceived = (status?: string | null) => {
  const value = (status || "").trim().toLowerCase();
  return value === "sent" || value === "partially received" || value === "receiving" || value === "completed";
};

const collectedAmount = (row: WorkflowRow) =>
  row.invoices
    .filter((invoice) => invoice.substage !== "Void" && invoice.status !== "Void")
    .reduce((sum, invoice) => sum + (invoice.paidAmount || 0), 0);

const partLabel = (partNo?: string | null, partName?: string | null) =>
  [partNo, partName].filter((value) => value && value.trim()).join(" — ");

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

const ChoreTable: React.FC<{
  rows: WorkflowAction[];
  workflows: WorkflowRow[];
  onOpen: (id: string) => void;
  onOpenPath: (event: React.MouseEvent, path?: string | null, workflowId?: string) => void;
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
            <th>Chore</th>
            <th>Order</th>
            <th>Customer</th>
            <th>Stage</th>
            <th>Priority</th>
            <th>Due</th>
            <th>Owner</th>
          </tr>
        </thead>
        <tbody>
          {props.rows.map((action) => {
            const order = props.workflows.find((row) => row.id === action.workflowId);
            const due = action.dueDate
              ? dueLabel(action.dueDate, action.priorityLabel === "Overdue", props.formatDate)
              : null;
            return (
              <tr key={action.id} onClick={() => props.onOpen(action.workflowId)}>
                <td>
                  <button
                    type="button"
                    className="entity-number chore-title"
                    title={action.detail || action.title}
                    onClick={(event) => {
                      if (action.linkPath) props.onOpenPath(event, action.linkPath, action.workflowId);
                      else {
                        event.stopPropagation();
                        props.onOpen(action.workflowId);
                      }
                    }}
                  >
                    {action.title}
                  </button>
                </td>
                <td>
                  <button type="button" className="entity-number" onClick={(event) => { event.stopPropagation(); props.onOpen(action.workflowId); }}>
                    {action.reference}
                  </button>
                </td>
                <td className="name-cell" title={action.customerName}>{action.customerName || "—"}</td>
                <td>{action.stageLabel}</td>
                <td><span className={`badge ${priorityClass(action.priorityLabel)}`}>{priorityLabel(action.priorityLabel)}</span></td>
                <td>{due || "—"}</td>
                <td>{order?.ownerLabel || "Unassigned"}</td>
              </tr>
            );
          })}
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
    const opensJob = (action.linkPath || "").includes("/job-orders");
    add("Planning", {
      key: action.id,
      type: opensJob ? "Job order" : "Customer order",
      identifier: action.linkText || row.reference,
      status: action.title || "No job order linked",
      path: action.linkPath || row.orderPath,
      affordance: action.linkLabel || (opensJob ? "Open job order" : "Open customer order"),
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
    const part = partLabel(job.partNo, job.partName);
    add(isDraftJob(job.status) ? "Planning" : "Production", {
      key: `job-${job.jobOrderId}`,
      type: "Job order",
      identifier: job.number,
      status: [part, job.status].filter(Boolean).join(" · ") || undefined,
      path: job.path,
      affordance: "Open job order",
    });
  });

  const seenOrders = new Set<number>();
  row.purchases.forEach((purchase) => {
    if (seenOrders.has(purchase.vendorOrderId)) return;
    seenOrders.add(purchase.vendorOrderId);
    const lines = row.purchases.filter((item) => item.vendorOrderId === purchase.vendorOrderId);
    const totals = purchaseTotals(lines);
    const qtyOrdered = totals.ordered;
    const qtyReceived = totals.received;
    add("Materials", {
      key: `po-${purchase.vendorOrderId}`,
      type: "Vendor order",
      identifier: purchase.number,
      status: [purchase.vendorName, purchase.status].filter(Boolean).join(" · ") || undefined,
      path: purchase.orderPath,
      affordance: "Open record",
    });
    if (vendorOrderCanBeReceived(purchase.status) && qtyReceived < qtyOrdered) {
      add("Materials", {
        key: `recv-${purchase.vendorOrderId}`,
        type: "Receipt",
        identifier: purchase.number,
        status: `Received ${qtyReceived} of ${qtyOrdered}`,
        path: purchase.receivingPath,
        affordance: "Open receiving",
      });
    }
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
    openInvoices.forEach((invoice) => {
      add("Collection", {
        key: `collect-${invoice.invoiceId}`,
        type: "Invoice",
        identifier: invoice.number,
        status: `${formatCurrency(invoice.balance)} outstanding`,
        path: invoice.path,
        affordance: "Open invoice",
      });
    });
  } else {
    const collected = collectedAmount(row);
    if (collected > 0) {
      add("Collection", {
        key: "collected",
        type: "Collected",
        identifier: formatCurrency(collected),
        status: "Collected",
        affordance: "",
      });
    }
  }

  return buckets;
};

const WorkPicture: React.FC<{
  row: WorkflowRow;
  actions: WorkflowAction[];
  formatCurrency: (value: number) => string;
  formatDate: (value?: string | null) => string;
  onOpenPath: (event: React.MouseEvent, path?: string | null) => void;
}> = ({ row, actions, formatCurrency, formatDate, onOpenPath }) => {
  const gaps = actions.filter((action) => action.kind === "PlanningGap");
  const openInvoices = row.invoices.filter((invoice) => isOpenInvoice(invoice.substage));
  const lanes = row.jobs.map((job) => {
    const purchases = row.purchases.filter((item) => item.jobOrderId === job.jobOrderId);
    const seen = new Set<number>();
    return {
      key: `job-${job.jobOrderId}`,
      title: job.number,
      path: job.path,
      part: [job.partNo, job.partName].filter(Boolean).join(" · "),
      status: job.status || "",
      cards: [
        ...row.shortages
          .filter((item) => item.jobOrderId === job.jobOrderId)
          .map((item) => ({
            key: `short-${job.jobOrderId}-${item.partNo || item.partName || "part"}`,
            type: "Material",
            identifier: item.partNo || item.partName || item.jobNumber,
            status: [`Short ${item.shortQty}`, item.requiredBy ? `Required by ${formatDate(item.requiredBy)}` : ""].filter(Boolean).join(" · "),
            path: job.path,
            affordance: "Open job order",
          })),
        ...purchases.filter((item) => {
          if (seen.has(item.vendorOrderId)) return false;
          seen.add(item.vendorOrderId);
          return true;
        }).map((item) => {
          const lines = purchases.filter((line) => line.vendorOrderId === item.vendorOrderId);
          const ordered = lines.reduce((sum, line) => sum + (line.qtyOrdered || 0), 0);
          const received = lines.reduce((sum, line) => sum + (line.qtyReceived || 0), 0);
          return {
            key: `po-${job.jobOrderId}-${item.vendorOrderId}`,
            type: "Vendor order",
            identifier: item.number,
            status: [item.vendorName, `Received ${received} of ${ordered}`].filter(Boolean).join(" · "),
            path: item.orderPath,
            affordance: "Open record",
          };
        }),
        ...row.ncrs
          .filter((item) => item.jobOrderId === job.jobOrderId)
          .map((item) => ({
            key: `ncr-${item.ncrId}`,
            type: "NCR",
            identifier: item.number,
            status: [item.status, item.title].filter(Boolean).join(" · "),
            path: item.path,
            affordance: isOpenNcrStatus(item.status) ? "Open NCR" : "Open record",
          })),
      ],
    };
  });
  if (gaps.length) {
    lanes.unshift({
      key: "no-job",
      title: "No job",
      path: row.orderPath || "",
      part: "These parts have no job yet.",
      status: "",
      cards: gaps.map((action) => ({
        key: action.id,
        type: "Planning",
        identifier: action.title,
        status: action.detail || "",
        path: action.linkPath || row.orderPath || "",
        affordance: action.linkLabel || "Open customer order",
      })),
    });
  }

  return (
    <div className="work-picture">
      {lanes.length === 0 ? (
        <p className="lane-empty">No jobs on this record.</p>
      ) : (
        <div className="work-lanes">
          {lanes.map((lane) => (
            <section key={lane.key} className="work-lane">
              <button type="button" className="entity-number" disabled={!lane.path} onClick={(event) => onOpenPath(event, lane.path)}>
                {lane.title}
              </button>
              {lane.part && <p className="lane-part">{lane.part}</p>}
              {lane.status && <p className="lane-status">{lane.status}</p>}
              {lane.cards.length === 0 ? (
                <p className="lane-empty">Nothing else is linked to this job.</p>
              ) : (
                <ul className="stage-records">
                  {lane.cards.map((card) => (
                    <li key={card.key}>
                      <button type="button" className="record-link" disabled={!card.path} onClick={(event) => onOpenPath(event, card.path)}>
                        <span className="record-type">{card.type}</span>
                        <span className="record-id">{card.identifier}</span>
                        {card.status && <span className="record-status">{card.status}</span>}
                        <span className="record-go">{card.affordance}<span aria-hidden="true"> →</span></span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}
      {row.orderPath && (
        <div className="order-band">
          <h4 className="order-band-title">For the whole order</h4>
          <section>
            <h4>Shipment</h4>
            {row.shipments.length === 0 ? <p className="lane-empty">None yet.</p> : (
              <ul className="stage-records">
                {row.shipments.map((item) => (
                  <li key={item.shipmentId}>
                    <button type="button" className="record-link" onClick={(event) => onOpenPath(event, item.path)}>
                      <span className="record-id">{item.number}</span>
                      {item.shipmentDate && <span className="record-status">{formatDate(item.shipmentDate)}</span>}
                      <span className="record-go">Open shipment<span aria-hidden="true"> →</span></span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section>
            <h4>Invoice</h4>
            {row.invoices.length === 0 ? <p className="lane-empty">None yet.</p> : (
              <ul className="stage-records">
                {row.invoices.map((item) => (
                  <li key={item.invoiceId}>
                    <button type="button" className="record-link" onClick={(event) => onOpenPath(event, item.path)}>
                      <span className="record-id">{item.number}</span>
                      <span className="record-status">{item.balance > 0 ? `${item.status} · ${formatCurrency(item.balance)} outstanding` : item.status}</span>
                      <span className="record-go">Open invoice<span aria-hidden="true"> →</span></span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section>
            <h4>Collection</h4>
            {openInvoices.length > 0 ? (
              <ul className="stage-records">
                {openInvoices.map((invoice) => (
                  <li key={invoice.invoiceId}>
                    <button type="button" className="record-link" onClick={(event) => onOpenPath(event, invoice.path)}>
                      <span className="record-id">{invoice.number}</span>
                      <span className="record-status">{formatCurrency(invoice.balance)} outstanding</span>
                      <span className="record-go">Open invoice<span aria-hidden="true"> →</span></span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : collectedAmount(row) > 0 ? (
              <p className="lane-empty">Collected {formatCurrency(collectedAmount(row))}.</p>
            ) : (
              <p className="lane-empty">Nothing to collect.</p>
            )}
          </section>
        </div>
      )}
    </div>
  );
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
  const [journeyView, setJourneyView] = useState<"list" | "lanes">("list");
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
      let node = event.target instanceof Element ? event.target : null;
      let scroller: HTMLElement | null = null;
      while (node && node !== overlay) {
        if (node instanceof HTMLElement) {
          const overflowY = window.getComputedStyle(node).overflowY;
          if ((overflowY === "auto" || overflowY === "scroll") && node.scrollHeight > node.clientHeight + 1) {
            scroller = node;
            break;
          }
        }
        node = node.parentElement;
      }
      if (!scroller) {
        event.preventDefault();
        return;
      }
      const delta = event.deltaY;
      const atTop = scroller.scrollTop <= 0;
      const atBottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1;
      if ((delta < 0 && atTop) || (delta > 0 && atBottom)) event.preventDefault();
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
  const waitingForMe = row.isActive
    && canAcknowledge
    && row.handoffStatus === "Pending"
    && row.ownerUserId === currentUserId;
  const shownOwner = pendingAction === "assign" && pendingOwner ? pendingOwner : owner;
  const actionQueue = useMemo(() => {
    const linked = actions
      .filter((action) => action.linkPath && (action.kind !== "JobInProgress" || action.id === primary?.id))
      .slice()
      .sort((a, b) => a.rank - b.rank || a.title.localeCompare(b.title));
    if (!primary) return linked;
    return [primary, ...linked.filter((action) => action.id !== primary.id)];
  }, [actions, primary]);
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
            <div className="action-row">
              {(actionQueue.length > 0 ? actionQueue : [null]).map((action, index) => {
                const current = index === 0;
                return (
                  <article key={action?.id || "current"} className={current ? "action-card current" : "action-card"}>
                    {!current && action && (
                      <div className="badge-row">
                        {actionStatusBadges(action).map((badge) => (
                          <span key={badge.label} className={`badge ${badge.className}`}>{badge.label}</span>
                        ))}
                      </div>
                    )}
                    <h3>{current ? (showAction ? "Action required" : "Next action") : action?.stageLabel}</h3>
                    <p className="next-action">{current ? (row.nextAction || action?.title || "None") : action?.title}</p>
                    {action?.detail && action.detail !== reason && action.detail !== action.title && (
                      <p className="action-reason">{action.detail}</p>
                    )}
                    {current && reason && <p className="action-reason">{reason}</p>}
                    {current && row.manualBlocker && row.manualBlocker !== reason && (
                      <p className="action-reason">Note: {row.manualBlocker}</p>
                    )}
                    {current && row.rejectionNote && <p className="rejection-note">{row.rejectionNote}</p>}
                    {current && row.isActive && (
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
                    {current && row.isActive && canAssign && (
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
                    {current && waitingForMe && (
                      <div className="coordination">
                        <button type="button" className="btn-secondary" disabled={busy} onClick={() => saveAssignment("acknowledge", () => WorkflowService.Acknowledge(row.id, row.coordinationTaskId))}>
                          {pendingAction === "acknowledge" ? "Saving…" : "Acknowledge"}
                        </button>
                        <button type="button" className="link-button" disabled={busy} onClick={() => saveAssignment("reject", () => WorkflowService.Reject(row.id, row.coordinationTaskId))}>
                          {pendingAction === "reject" ? "Saving…" : "Reject"}
                        </button>
                      </div>
                    )}
                    {current && busy && pendingAction === "acknowledge" && (
                      <p className="saving-note"><span className="saving-spinner" aria-hidden="true" /> Saving acknowledgement…</p>
                    )}
                    {current && showAction && row.isBlocked && canAssign && (
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
                    {current && formError && <p className="rejection-note">{formError}</p>}
                    {action?.linkPath && (
                      <button type="button" className={current ? "btn-primary" : "btn-secondary"} onClick={(event) => onOpenPath(event, action.linkPath)}>
                        {action.linkLabel || "Open record"}
                      </button>
                    )}
                  </article>
                );
              })}
            </div>
          </section>

          <section className="drawer-section">
            <div className="section-head">
              <h3>Workflow journey</h3>
              <div className="view-toggle journey-switch" role="group" aria-label="Journey view">
                <button type="button" className={journeyView === "list" ? "active" : ""} onClick={() => setJourneyView("list")}>List</button>
                <button type="button" className={journeyView === "lanes" ? "active" : ""} onClick={() => setJourneyView("lanes")}>Side by side</button>
              </div>
            </div>
            {journeyView === "lanes" ? (
              <WorkPicture row={row} actions={actions} formatCurrency={formatCurrency} formatDate={formatDate} onOpenPath={onOpenPath} />
            ) : (
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
                              {item.affordance && (
                                <span className="record-go">
                                  {item.affordance}
                                  <span aria-hidden="true"> →</span>
                                </span>
                              )}
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
            )}
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
