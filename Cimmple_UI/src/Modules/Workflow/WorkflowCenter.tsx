import React, { useEffect, useMemo, useState } from "react";
import { useHistory } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faSearch, faTimes } from "@fortawesome/free-solid-svg-icons";
import ClientPagination from "../../Common/Components/ClientPagination";
import { useListPageSize } from "../../Common/Hooks/useListPageSize";
import { useSiteListFilter } from "../../Common/Hooks/useSiteListFilter";
import { useFormatting } from "../../Common/Hooks/useFormatting";
import { useSettingsSafe } from "../../Common/Contexts/SettingsContext";
import {
  WorkflowAction,
  WorkflowCollectionCard,
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

const AGE_TITLE = "Days since the source document date. Time in the current stage is not stored.";

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

const WorkflowCenter: React.FC = () => {
  const history = useHistory();
  const { formatCurrency, formatDateOnlyFromApi } = useFormatting();
  const settings = useSettingsSafe();
  const { locationIdParam, masterListFilter } = useSiteListFilter();
  const [pageSize, setPageSize] = useListPageSize(settings?.defaultPageSize || 10);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [overview, setOverview] = useState<WorkflowOverview | null>(null);
  const [view, setView] = useState<"journey" | "queue" | "board">("journey");
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drillLane, setDrillLane] = useState<"" | "invoicing" | "collection">("");
  const [cardSearch, setCardSearch] = useState("");
  const [cardStatus, setCardStatus] = useState("");
  const [cardSort, setCardSort] = useState<"priority" | "age" | "due" | "balance">("priority");

  const load = () => {
    setLoading(true);
    setError(null);
    WorkflowService.GetOverview(locationIdParam)
      .then((data) => {
        setOverview(data);
        setLoading(false);
      })
      .catch((err: { response?: { data?: { error?: string } } }) => {
        setOverview(null);
        setError(err?.response?.data?.error || "Workflow Center could not be loaded.");
        setLoading(false);
      });
  };

  useEffect(() => {
    load();
    // Reload when the working site changes. load closes over the current site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationIdParam]);

  useEffect(() => {
    setPage(1);
  }, [search, stage, status, view, pageSize, drillLane, cardSearch, cardStatus, cardSort]);

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
    () => scoped.filter((row) => matchesStatus(row, status)),
    [scoped, status]
  );
  const summary = useMemo(() => ({
    active: scoped.filter((row) => row.isActive).length,
    needsAction: scoped.filter((row) => row.needsAction).length,
    blocked: scoped.filter((row) => row.isBlocked).length,
    overdue: scoped.filter((row) => row.isOverdue).length,
  }), [scoped]);
  const stageCounts = useMemo(() => {
    const catalog = overview?.stages?.length
      ? overview.stages
      : [];
    return catalog.map((stageRow) => {
      const rows = listed.filter((row) => row.principalStage === stageRow.code);
      const active = rows.filter((row) => row.isActive);
      return {
        ...stageRow,
        activeCount: active.length,
        blockedCount: rows.filter((row) => row.isBlocked).length,
        overdueCount: rows.filter((row) => row.isOverdue).length,
        oldestAgeDays: active.length ? Math.max(...active.map((row) => row.ageDays)) : null,
      };
    });
  }, [overview, listed]);

  const listedIds = useMemo(() => new Set(listed.map((row) => row.id)), [listed]);
  const laneCards = useMemo(() => {
    const rows = (overview?.collection || []).filter((card) => listedIds.has(card.workflowId));
    return {
      invoicing: rows.filter((card) => card.lane === "invoicing"),
      collection: rows.filter((card) => card.lane === "collection"),
    };
  }, [overview, listedIds]);
  const actions = useMemo(
    () => (overview?.actions || []).filter((action) => listedIds.has(action.workflowId)),
    [overview, listedIds]
  );
  const cards = useMemo(() => {
    const rows = (overview?.collection || []).filter((card) => listedIds.has(card.workflowId));
    return rows
      .filter((card) => !drillLane || card.lane === drillLane)
      .filter((card) => !cardSearch.trim() || includesText(card.searchText || "", cardSearch))
      .filter((card) => {
        if (!cardStatus) return true;
        if (cardStatus === "open") return card.substage !== "Paid" && card.substage !== "Void";
        return card.substage === cardStatus;
      })
      .slice()
      .sort((a, b) => {
        if (cardSort === "age") return b.ageDays - a.ageDays;
        if (cardSort === "due") return (a.dueDate || "9999-99-99").localeCompare(b.dueDate || "9999-99-99");
        if (cardSort === "balance") return (b.outstanding || 0) - (a.outstanding || 0);
        return a.rank - b.rank || (b.outstanding || 0) - (a.outstanding || 0) || b.ageDays - a.ageDays;
      });
  }, [overview, listedIds, drillLane, cardSearch, cardStatus, cardSort]);

  const pageRows = view === "queue" ? actions : listed;
  const total = drillLane ? cards.length : pageRows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * pageSize;
  const pagedJourney = listed.slice(start, start + pageSize);
  const pagedActions = actions.slice(start, start + pageSize);
  const pagedCards = cards.slice(start, start + pageSize);
  const selected = workflows.find((row) => row.id === selectedId) || null;

  const openPath = (event: React.MouseEvent, path?: string | null) => {
    event.stopPropagation();
    if (path) history.push(path);
  };

  const openStage = (code: string) => {
    if (code === "Invoice") {
      setStage("");
      setView("board");
      setDrillLane("invoicing");
      return;
    }
    if (code === "Collection") {
      setStage("");
      setView("board");
      setDrillLane("collection");
      return;
    }
    setDrillLane("");
    setView("journey");
    setStage(code);
  };

  const toggleStatus = (value: string) => setStatus((current) => (current === value ? "" : value));

  return (
    <div className="workflow-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Workflow Center</h1>
          <p className="page-subtitle">
            {overview?.limitation || "Job journey, action queue, and stage board for the current site."}
          </p>
        </div>
        <div className="view-toggle">
          <button type="button" className={view === "journey" ? "active" : ""} onClick={() => { setView("journey"); setDrillLane(""); }}>Job Journey</button>
          <button type="button" className={view === "queue" ? "active" : ""} onClick={() => { setView("queue"); setDrillLane(""); }}>Action Queue</button>
          <button type="button" className={view === "board" ? "active" : ""} onClick={() => setView("board")}>Stage Board</button>
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
      <p className="workflow-note">A workflow can be counted in more than one total. Blocked work can also be overdue.</p>

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
        <select className="filter-select" value={stage} onChange={(event) => { setStage(event.target.value); setDrillLane(""); }} aria-label="Stage">
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
        <select className="filter-select" value="unassigned" disabled title="Tasks are stored. Assignment is not on this page yet." aria-label="Owner">
          <option value="unassigned">Owner: Unassigned</option>
        </select>
      </div>

      {loading ? (
        <div className="page-loading">
          <div className="loading-spinner" />
          <p>Loading workflows...</p>
        </div>
      ) : error ? (
        <div className="empty-state">
          <p>{error}</p>
          <button type="button" className="btn-secondary" onClick={load}>Try again</button>
        </div>
      ) : drillLane ? (
        <CollectionDrill
          cards={pagedCards}
          total={cards.length}
          lane={drillLane}
          cardSearch={cardSearch}
          cardStatus={cardStatus}
          cardSort={cardSort}
          onLane={setDrillLane}
          onSearch={setCardSearch}
          onStatus={setCardStatus}
          onSort={setCardSort}
          onBack={() => setDrillLane("")}
          onOpen={(workflowId) => setSelectedId(workflowId)}
          onOpenPath={(event, path) => openPath(event, path)}
          formatCurrency={formatCurrency}
          formatDate={formatDateOnlyFromApi}
          pageStart={start}
          pageEnd={Math.min(start + pageSize, cards.length)}
          currentPage={currentPage}
          totalPages={totalPages}
          pageSize={pageSize}
          onPage={setPage}
          onPageSize={setPageSize}
        />
      ) : view === "board" ? (
        <div className="stage-board">
          {stageCounts.map((item) => {
            const lane = item.code === "Invoice" ? "invoicing" : item.code === "Collection" ? "collection" : "";
            const columnCards = lane === "invoicing" ? laneCards.invoicing : lane === "collection" ? laneCards.collection : [];
            const activeCount = lane ? columnCards.length : item.activeCount;
            const blockedCount = lane ? columnCards.filter((card) => card.isBlocked).length : item.blockedCount;
            const overdueCount = lane ? columnCards.filter((card) => card.isOverdue).length : item.overdueCount;
            const oldestAgeDays = lane
              ? (columnCards.length ? Math.max(...columnCards.map((card) => card.ageDays)) : null)
              : item.oldestAgeDays;
            return (
              <button
                type="button"
                key={item.code}
                className={`stage-column${stage === item.code ? " active" : ""}${lane ? " opens-cards" : ""}`}
                onClick={() => openStage(item.code)}
              >
                <h3>{item.label}</h3>
                {lane ? <p className="column-hint">Opens cards</p> : null}
                <strong>{activeCount}</strong>
                <p>{blockedCount} blocked</p>
                <p>{overdueCount} overdue</p>
                <p>{oldestAgeDays == null ? "No active age" : `Oldest document age ${oldestAgeDays}d`}</p>
              </button>
            );
          })}
        </div>
      ) : view === "queue" && actions.length === 0 ? (
        <div className="empty-state">
          <p>No actions for the current filters.</p>
          <small>The queue lists derived work from orders, jobs, shortages, NCRs, and invoices. It is not an assignment inbox yet.</small>
        </div>
      ) : view === "journey" && listed.length === 0 ? (
        <div className="empty-state">
          <p>
            {workflows.length === 0
              ? "No customer orders or open quotations for this site."
              : search.trim()
                ? "No workflows match that search."
                : "No workflows match the current filters."}
          </p>
          <small>Counts come from the current site and filters.</small>
        </div>
      ) : view === "queue" ? (
        <QueueTable
          rows={pagedActions}
          onOpen={(workflowId) => setSelectedId(workflowId)}
          onOpenPath={openPath}
          formatDate={formatDateOnlyFromApi}
          start={start}
          end={Math.min(start + pageSize, actions.length)}
          total={actions.length}
          currentPage={currentPage}
          totalPages={totalPages}
          pageSize={pageSize}
          onPage={setPage}
          onPageSize={setPageSize}
        />
      ) : (
        <JourneyTable
          rows={pagedJourney}
          onOpen={setSelectedId}
          onOpenPath={openPath}
          onStage={openStage}
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
          onClose={() => setSelectedId(null)}
          onOpenPath={openPath}
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
  onStage: (code: string) => void;
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
                    <button
                      type="button"
                      key={item.code}
                      className={`stage-pill ${item.state.toLowerCase()}`}
                      title={item.state}
                      onClick={(event) => {
                        event.stopPropagation();
                        props.onStage(item.code);
                      }}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </td>
              <td><StatusBadges row={row} /></td>
              <td title="Assignment is not stored yet.">{row.ownerLabel}</td>
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

const QueueTable: React.FC<{
  rows: WorkflowAction[];
  onOpen: (workflowId: string) => void;
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
            <th>Action</th>
            <th>Reference</th>
            <th>Stage</th>
            <th>Owner</th>
            <th>Due</th>
            <th>Age</th>
            <th>Priority</th>
          </tr>
        </thead>
        <tbody>
          {props.rows.map((row) => (
            <tr key={row.id} onClick={() => props.onOpen(row.workflowId)}>
              <td>
                <div>{row.title}</div>
                {row.detail && <div className="workflow-note" style={{ margin: "0.25rem 0 0" }}>{row.detail}</div>}
                {row.blockerReason && <div>{row.blockerReason}</div>}
                <div>{row.nextAction}</div>
              </td>
              <td>
                <div className="name-cell" title={row.customerName}>{row.customerName}</div>
                <button type="button" className="entity-number" onClick={(event) => props.onOpenPath(event, row.linkPath)}>
                  {row.linkText || row.reference}
                </button>
                {row.linkText && row.reference && row.linkText !== row.reference && (
                  <div>
                    <button type="button" className="entity-number" onClick={(event) => props.onOpenPath(event, row.orderPath)}>
                      {row.reference}
                    </button>
                  </div>
                )}
              </td>
              <td>{row.stageLabel}</td>
              <td>{row.ownerLabel}</td>
              <td>{row.dueDate ? props.formatDate(row.dueDate) : "—"}</td>
              <td title={AGE_TITLE}>{row.ageDays}d</td>
              <td><span className={`badge ${row.priorityLabel === "Blocked" || row.priorityLabel === "Overdue" ? "badge-danger" : row.priorityLabel === "High" ? "badge-warning" : "badge-info"}`}>{row.priorityLabel}</span></td>
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

const CollectionDrill: React.FC<{
  cards: WorkflowCollectionCard[];
  total: number;
  lane: "invoicing" | "collection";
  cardSearch: string;
  cardStatus: string;
  cardSort: "priority" | "age" | "due" | "balance";
  onLane: (lane: "invoicing" | "collection") => void;
  onSearch: (value: string) => void;
  onStatus: (value: string) => void;
  onSort: (value: "priority" | "age" | "due" | "balance") => void;
  onBack: () => void;
  onOpen: (workflowId: string) => void;
  onOpenPath: (event: React.MouseEvent, path?: string | null) => void;
  formatCurrency: (value: number) => string;
  formatDate: (value?: string | null) => string;
  pageStart: number;
  pageEnd: number;
  currentPage: number;
  totalPages: number;
  pageSize: number;
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
}> = (props) => (
  <div>
    <div className="drill-head">
      <div>
        <h2 className="page-title" style={{ fontSize: "1.125rem" }}>Invoicing & Collection</h2>
        <p className="page-subtitle">Balances are the invoice total minus the amount already received. Disputed and reconciliation-pending states are not separate invoice statuses.</p>
      </div>
      <button type="button" className="btn-secondary" onClick={props.onBack}>Back to stage board</button>
    </div>
    <div className="page-filters">
      <div className="search-wrapper">
        <FontAwesomeIcon icon={faSearch} />
        <input className="search-input" value={props.cardSearch} onChange={(event) => props.onSearch(event.target.value)} placeholder="Search customer, job, invoice" />
      </div>
      <select className="filter-select" value={props.lane} onChange={(event) => props.onLane(event.target.value as "invoicing" | "collection")} aria-label="Invoicing or collection">
        <option value="invoicing">Invoicing</option>
        <option value="collection">Collection</option>
      </select>
      <select className="filter-select" value={props.cardStatus} onChange={(event) => props.onStatus(event.target.value)} aria-label="Collection status">
        <option value="">All sub-stages</option>
        <option value="open">Open</option>
        <option value="Ready for invoicing">Ready for invoicing</option>
        <option value="Awaiting payment">Awaiting payment</option>
        <option value="Partially paid">Partially paid</option>
        <option value="Overdue">Overdue</option>
        <option value="Paid">Paid</option>
        <option value="Void">Void</option>
      </select>
      <select className="filter-select" value={props.cardSort} onChange={(event) => props.onSort(event.target.value as "priority" | "age" | "due" | "balance")} aria-label="Sort">
        <option value="priority">Sort by priority</option>
        <option value="age">Oldest document age</option>
        <option value="due">Earliest due date</option>
        <option value="balance">Largest outstanding balance</option>
      </select>
      <select className="filter-select" value="unassigned" disabled title="Assignment is not stored yet. Every card is unassigned.">
        <option value="unassigned">Owner: Unassigned</option>
      </select>
    </div>
    {props.total === 0 ? (
      <div className="empty-state">
        <p>No invoicing or collection records match these filters.</p>
      </div>
    ) : (
      <>
        <div className="collection-grid">
          {props.cards.map((card) => (
            <button type="button" key={card.id} className="job-card" onClick={() => props.onOpen(card.workflowId)}>
              <h3>{card.jobNumbers.length ? card.jobNumbers.join(", ") : card.orderNumber}</h3>
              <p className="name-cell" title={card.customerName}>{card.customerName || "—"}</p>
              <p>
                <span className="entity-number" onClick={(event) => props.onOpenPath(event, card.orderPath)}>{card.orderNumber}</span>
                {card.invoiceNumber && (
                  <>
                    {" · "}
                    <span className="entity-number" onClick={(event) => props.onOpenPath(event, card.invoicePath)}>{card.invoiceNumber}</span>
                  </>
                )}
              </p>
              <p><span className={`badge ${card.substage === "Overdue" ? "badge-danger" : card.substage === "Paid" ? "badge-success" : "badge-warning"}`}>{card.substage}</span></p>
              <p className="muted">Owner {card.ownerLabel} · <span title={AGE_TITLE}>{card.ageDays}d document age</span></p>
              <p>{card.invoiceAmount == null ? "Not invoiced yet" : `Invoice ${props.formatCurrency(card.invoiceAmount)}`}</p>
              <p>{card.paidAmount == null ? "Paid —" : `Paid ${props.formatCurrency(card.paidAmount)}`}</p>
              <p>{card.outstanding == null ? "Outstanding —" : `Outstanding ${props.formatCurrency(card.outstanding)}`}</p>
              <p className="muted">Due {card.dueDate ? props.formatDate(card.dueDate) : "—"}</p>
              {card.blockerReason && <p>{card.blockerReason}</p>}
              <p>{card.nextAction}</p>
            </button>
          ))}
        </div>
        <ClientPagination
          startIndex={props.pageStart}
          endIndex={props.pageEnd}
          total={props.total}
          currentPage={props.currentPage}
          totalPages={props.totalPages}
          onPageChange={props.onPage}
          pageSize={props.pageSize}
          onPageSizeChange={props.onPageSize}
        />
      </>
    )}
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
    default: return "Unavailable";
  }
};

const isOpenNcrStatus = (status?: string | null) => {
  const value = (status || "").trim().toLowerCase();
  return value !== "closed" && value !== "rejected";
};

const isOpenInvoice = (substage?: string | null) => substage !== "Paid" && substage !== "Void";

const statusCounts = (values: Array<string | null | undefined>) => {
  const counts = new Map<string, number>();
  values.forEach((value) => {
    const label = (value || "").trim() || "Unknown";
    counts.set(label, (counts.get(label) || 0) + 1);
  });
  return Array.from(counts.entries()).map(([label, count]) => `${count} ${label.toLowerCase()}`).join(", ");
};

interface DetailLink {
  key: string;
  label: string;
  path?: string | null;
  meta?: string;
}

interface DetailGroup {
  key: string;
  title: string;
  links: DetailLink[];
  note?: string;
}

const detailGroups = (row: WorkflowRow, formatCurrency: (value: number) => string, formatDate: (value?: string | null) => string): DetailGroup[] => {
  const groups: DetailGroup[] = [];
  const commercial: DetailLink[] = [];
  if (row.quotationPath) commercial.push({ key: "quotation", label: "Customer quotation", path: row.quotationPath });
  if (row.orderPath) commercial.push({ key: "order", label: row.reference, path: row.orderPath, meta: "Customer order" });
  if (commercial.length) groups.push({ key: "commercial", title: "Customer order", links: commercial });

  if (row.jobs.length) {
    groups.push({
      key: "jobs",
      title: "Job orders",
      links: row.jobs.map((job) => ({
        key: `job-${job.jobOrderId}`,
        label: job.number,
        path: job.path,
        meta: [job.partNo || job.partName, job.status].filter(Boolean).join(" · "),
      })),
    });
  }

  if (row.purchases.length || row.shortages.length) {
    groups.push({
      key: "purchasing",
      title: "Purchasing and receiving",
      links: row.purchases.flatMap((purchase) => [
        {
          key: `po-${purchase.vendorOrderId}`,
          label: purchase.number,
          path: purchase.orderPath,
          meta: [purchase.vendorName, purchase.status, `ordered ${purchase.qtyOrdered}`, `received ${purchase.qtyReceived}`].filter(Boolean).join(" · "),
        },
        {
          key: `recv-${purchase.vendorOrderId}`,
          label: `${purchase.number} receiving`,
          path: purchase.receivingPath,
          meta: "Receiving",
        },
      ]),
      note: row.shortages.length
        ? `A vendor order does not make the material available. ${row.shortages.map((item) => `${item.jobNumber} ${item.partNo || item.partName || ""}: short ${item.shortQty}${item.requiredBy ? `, required by ${formatDate(item.requiredBy)}` : ""}`).join(" ")}`
        : undefined,
    });
  }

  if (row.ncrs.length) {
    groups.push({
      key: "quality",
      title: "Quality",
      links: row.ncrs.map((ncr) => ({
        key: `ncr-${ncr.ncrId}`,
        label: ncr.number,
        path: ncr.path,
        meta: [ncr.status, ncr.title].filter(Boolean).join(" · "),
      })),
    });
  }

  if (row.shipments.length) {
    groups.push({
      key: "shipments",
      title: "Shipments",
      links: row.shipments.map((shipment) => ({
        key: `ship-${shipment.shipmentId}`,
        label: shipment.number,
        path: shipment.path,
        meta: shipment.shipmentDate ? formatDate(shipment.shipmentDate) : undefined,
      })),
    });
  }

  if (row.invoices.length) {
    groups.push({
      key: "invoices",
      title: "Invoices",
      links: row.invoices.map((invoice) => ({
        key: `inv-${invoice.invoiceId}`,
        label: invoice.number,
        path: invoice.path,
        meta: `${invoice.substage} · outstanding ${formatCurrency(invoice.balance)}`,
      })),
    });
    const open = row.invoices.filter((invoice) => isOpenInvoice(invoice.substage));
    if (open.length) {
      const outstanding = open.reduce((sum, invoice) => sum + (invoice.balance || 0), 0);
      groups.push({
        key: "receivables",
        title: "Receivables",
        links: [{
          key: "ar",
          label: "Accounts receivable",
          path: "/accounts/receivable",
          meta: `Outstanding ${formatCurrency(outstanding)}`,
        }],
      });
    }
  }

  return groups;
};

const stageSummary = (code: string, row: WorkflowRow, formatCurrency: (value: number) => string) => {
  const openNcrs = row.ncrs.filter((ncr) => isOpenNcrStatus(ncr.status));
  const openInvoices = row.invoices.filter((invoice) => isOpenInvoice(invoice.substage));
  switch (code) {
    case "Planning":
      return row.jobs.length ? `${row.jobs.length} job order${row.jobs.length === 1 ? "" : "s"}` : "No job order linked";
    case "Materials":
      return row.shortages.length ? `${row.shortages.length} open shortage${row.shortages.length === 1 ? "" : "s"}` : undefined;
    case "Production":
      return row.jobs.length ? statusCounts(row.jobs.map((job) => job.status)) : "No job order linked";
    case "Quality":
      if (!row.ncrs.length) return undefined;
      return openNcrs.length ? `${openNcrs.length} open non-conformance report${openNcrs.length === 1 ? "" : "s"}` : "No open non-conformance report";
    case "Shipment":
      return row.shipments.length ? `${row.shipments.length} shipment record${row.shipments.length === 1 ? "" : "s"}` : undefined;
    case "Invoice":
      return row.invoices.length ? `${row.invoices.length} invoice${row.invoices.length === 1 ? "" : "s"}` : undefined;
    case "Collection": {
      if (!openInvoices.length) return row.invoices.length ? "No open balance" : undefined;
      const outstanding = openInvoices.reduce((sum, invoice) => sum + (invoice.balance || 0), 0);
      return `Outstanding ${formatCurrency(outstanding)}`;
    }
    default:
      return undefined;
  }
};

const stageLinks = (code: string, row: WorkflowRow): DetailLink[] => {
  switch (code) {
    case "Quotation":
      return row.quotationPath ? [{ key: "quotation", label: "Customer quotation", path: row.quotationPath }] : [];
    case "CustomerOrder":
      return row.orderPath ? [{ key: "order", label: row.reference, path: row.orderPath }] : [];
    case "Planning":
      return row.jobs.map((job) => ({ key: `plan-${job.jobOrderId}`, label: job.number, path: job.path }));
    case "Quality":
      return row.ncrs.filter((ncr) => isOpenNcrStatus(ncr.status)).map((ncr) => ({ key: `ncr-${ncr.ncrId}`, label: ncr.number, path: ncr.path }));
    case "Shipment":
      return row.shipments.map((shipment) => ({ key: `ship-${shipment.shipmentId}`, label: shipment.number, path: shipment.path }));
    case "Invoice":
      return row.invoices.map((invoice) => ({ key: `inv-${invoice.invoiceId}`, label: invoice.number, path: invoice.path }));
    case "Collection":
      return row.invoices.some((invoice) => isOpenInvoice(invoice.substage))
        ? [{ key: "ar", label: "Accounts receivable", path: "/accounts/receivable" }]
        : [];
    default:
      return [];
  }
};

const WorkflowDetail: React.FC<{
  row: WorkflowRow;
  actions: WorkflowAction[];
  onClose: () => void;
  onOpenPath: (event: React.MouseEvent, path?: string | null) => void;
  formatCurrency: (value: number) => string;
  formatDate: (value?: string | null) => string;
}> = ({ row, actions, onClose, onOpenPath, formatCurrency, formatDate }) => {
  const groups = useMemo(
    () => detailGroups(row, formatCurrency, formatDate),
    [row, formatCurrency, formatDate]
  );
  const rankedActions = useMemo(
    () => actions.filter((action) => action.linkPath).slice().sort((a, b) => a.rank - b.rank),
    [actions]
  );
  const primary = rankedActions[0] || null;
  const highlighted = useMemo(
    () => new Set(rankedActions.filter((action) => action.rank === primary?.rank).map((action) => action.linkPath)),
    [rankedActions, primary?.rank]
  );
  const [groupState, setGroupState] = useState<{ id: string; values: Record<string, boolean> }>({ id: "", values: {} });
  if (groupState.id !== row.id) {
    setGroupState({ id: row.id, values: {} });
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const groupIsOpen = (group: DetailGroup) => {
    if (Object.prototype.hasOwnProperty.call(groupState.values, group.key)) return groupState.values[group.key];
    if (group.links.some((link) => link.path && highlighted.has(link.path))) return true;
    if (group.key === "quality" && row.principalStage === "Quality") return true;
    if (group.key === "invoices" && (row.principalStage === "Invoice" || row.principalStage === "Collection")) return true;
    if (group.key === "receivables" && row.principalStage === "Collection") return true;
    if (group.key === "shipments" && row.principalStage === "Shipment") return true;
    if (group.key === "purchasing" && row.principalStage === "Materials") return true;
    return false;
  };

  const showAction = row.isActive && (row.needsAction || row.isBlocked || row.isOverdue || Boolean(row.blockerReason));
  const reason = row.blockerReason || (primary?.detail && primary.detail !== row.nextAction ? primary.detail : "");
  const stages = row.stages.filter((item) => item.state !== "NotApplicable");
  const owner = row.ownerLabel || "Unassigned";

  return (
    <div className="slideout-overlay" onClick={onClose}>
      <div className="slideout-panel workflow-detail" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label={row.reference}>
        <div className="slideout-header workflow-detail-header">
          <div className="workflow-detail-title">
            <h2>{row.reference}</h2>
            <p>{row.customerName || "—"}</p>
          </div>
          <div className="header-actions">
            {row.orderPath && (
              <button type="button" className="entity-number" onClick={(event) => onOpenPath(event, row.orderPath)}>Open order</button>
            )}
            {!row.orderPath && row.quotationPath && (
              <button type="button" className="entity-number" onClick={(event) => onOpenPath(event, row.quotationPath)}>Open quotation</button>
            )}
            <button type="button" className="slideout-close" onClick={onClose} aria-label="Close">
              <FontAwesomeIcon icon={faTimes} />
            </button>
          </div>
        </div>
        <div className="slideout-content">
          <StatusBadges row={row} />

          {showAction && (
            <section className={`action-required${row.isBlocked ? " blocked" : row.isOverdue ? " overdue" : ""}`}>
              <h3>Action required</h3>
              <p className="next-action">{row.nextAction}</p>
              {reason && <p className="action-reason">{reason}</p>}
              <dl className="detail-grid compact">
                <dt>Owner</dt>
                <dd>{owner}</dd>
                {row.dueDate && (
                  <>
                    <dt>Due</dt>
                    <dd>{formatDate(row.dueDate)}</dd>
                  </>
                )}
              </dl>
              {primary?.linkPath && (
                <button type="button" className="btn-primary" onClick={(event) => onOpenPath(event, primary.linkPath)}>
                  {primary.linkLabel || "Open record"}
                </button>
              )}
            </section>
          )}

          <h3 className="section-title">Workflow journey</h3>
          <p className="journey-caption">Derived from the current source records.</p>
          <ol className="journey-timeline">
            {stages.map((stage) => {
              const summary = stageSummary(stage.code, row, formatCurrency);
              const links = stageLinks(stage.code, row);
              return (
                <li key={stage.code} className={stage.state.toLowerCase()}>
                  <span className="marker" aria-hidden="true">
                    {stage.state === "Complete" ? <FontAwesomeIcon icon={faCheck} /> : null}
                  </span>
                  <div>
                    <div className="stage-line">
                      <strong>{stage.label}</strong>
                      <span className="state-label">{stageStateLabel(stage.state)}</span>
                    </div>
                    {summary && <p>{summary}</p>}
                    {links.length > 0 && (
                      <div className="stage-links">
                        {links.map((link) => (
                          <button
                            type="button"
                            key={link.key}
                            className={`entity-number${link.path && highlighted.has(link.path) ? " current-record" : ""}`}
                            onClick={(event) => onOpenPath(event, link.path)}
                          >
                            {link.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>

          <h3 className="section-title">Linked records</h3>
          {groups.length === 0 ? (
            <p>No linked record.</p>
          ) : groups.map((group) => (
            <details
              key={group.key}
              className="record-group"
              open={groupIsOpen(group)}
              onToggle={(event) => {
                const open = event.currentTarget.open;
                setGroupState((current) => (
                  current.values[group.key] === open
                    ? current
                    : { id: row.id, values: { ...current.values, [group.key]: open } }
                ));
              }}
            >
              <summary>
                <span>{group.title}</span>
                <span>{group.links.length}</span>
              </summary>
              {group.note && <p className="group-note">{group.note}</p>}
              {group.links.map((link) => (
                <button
                  type="button"
                  key={link.key}
                  className={`record-row${link.path && highlighted.has(link.path) ? " current" : ""}`}
                  onClick={(event) => onOpenPath(event, link.path)}
                  disabled={!link.path}
                >
                  <span className="entity-number">{link.label}</span>
                  {link.meta && <span className="record-meta">{link.meta}</span>}
                </button>
              ))}
            </details>
          ))}

          <h3 className="section-title">Details</h3>
          <dl className="detail-grid">
            <dt>Created by</dt>
            <dd>{row.createdByName || "—"}</dd>
            <dt>Document date</dt>
            <dd>{row.documentDate ? formatDate(row.documentDate) : "—"}</dd>
            <dt>Due date</dt>
            <dd>{row.dueDate ? formatDate(row.dueDate) : "—"}</dd>
            <dt>Document age</dt>
            <dd title={AGE_TITLE}>{row.ageDays} days</dd>
            <dt>Stage age</dt>
            <dd>Unavailable</dd>
            <dt>Assigned owner</dt>
            <dd>{owner}</dd>
            <dt>Current stage</dt>
            <dd>{row.principalStageLabel}</dd>
          </dl>

          <h3 className="section-title">Coordination</h3>
          {(row.storedTasks || []).length === 0 ? (
            <p>No coordination tasks yet.</p>
          ) : (row.storedTasks || []).map((task) => (
            <p key={task.taskId || `${task.taskType}-${task.label}`}>
              {task.label} · {task.status} · {task.stageLabel} · {task.ownerLabel || "Unassigned"}
              {task.dueDate ? ` · due ${formatDate(task.dueDate)}` : ""}
              {task.nextAction ? ` · ${task.nextAction}` : ""}
            </p>
          ))}

          <h3 className="section-title">History</h3>
          {(row.recentEvents || []).length === 0 ? (
            <p>No history yet.</p>
          ) : (row.recentEvents || []).map((item, index) => (
            <p key={`${item.eventType}-${item.createdAt}-${index}`}>
              {item.createdAt ? formatDate(item.createdAt) : "—"} · {item.summary}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
};

export default WorkflowCenter;
