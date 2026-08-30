import React, { useState, useEffect, useMemo, useRef } from "react";
import { useLocation, useHistory } from "react-router-dom";
import { toast } from "react-toastify";
import { faShieldAlt, faExclamationTriangle, faClock } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import MasterListPage from "../../Common/Components/MasterListPage/MasterListPage";
import {
  QualityService,
  NonConformanceReport,
  NCRStatus,
  NCRCategory,
  NCRSeverity,
  resolveNcrDateRange,
} from "../../Common/Services/QualityService";
import { CustomerService, CustomerMaster } from "../../Common/Services/CustomerService";
import NonConformanceReportSlideout from "./NonConformanceReportSlideout";
import "./Quality.scss";

const DEFAULT_FILTERS = {
  status: "all",
  category: "all",
  severity: "all",
  source: "all",
  customerId: "all",
  due: "all",
  dateRange: "Last 30 Days",
  openOnly: false,
};

const Quality: React.FC = () => {
  const location = useLocation();
  const history = useHistory();
  const returnToRef = useRef<string | null>(null);
  const [ncrs, setNcrs] = useState<NonConformanceReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [showSlideout, setShowSlideout] = useState(false);
  const [selectedNCRId, setSelectedNCRId] = useState<number>(0);
  const [customers, setCustomers] = useState<CustomerMaster[]>([]);

  // Handle URL parameter to open slideout (from global search / dashboard)
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const openId = params.get("open");
    if (openId) {
      const id = parseInt(openId, 10);
      if (!isNaN(id) && id > 0) {
        const returnTo = (location.state as { returnTo?: string } | null)?.returnTo;
        returnToRef.current = returnTo || null;
        setSelectedNCRId(id);
        setShowSlideout(true);
        history.replace(location.pathname, returnTo ? { returnTo } : undefined);
      }
    }
  }, [location.search, history, location.pathname, location.state]);

  const [stats, setStats] = useState({
    totalNCRs: 0,
    openNCRs: 0,
    criticalNCRs: 0,
    overdueNCRs: 0,
  });

  const [filters, setFilters] = useState({ ...DEFAULT_FILTERS });

  useEffect(() => {
    loadCustomers();
  }, []);

  useEffect(() => {
    loadNCRs();
    loadStats();
  }, [filters]);

  const loadCustomers = async () => {
    try {
      const storage = JSON.parse(localStorage.getItem("storage") || "{}");
      const tenantID = storage?.tenantID || 0;
      const result = await CustomerService.GetCustomerlist({ tenantid: tenantID });
      setCustomers(result || []);
    } catch (error) {
      console.error("Error loading customers for NCR filters:", error);
    }
  };

  const loadNCRs = async () => {
    setLoading(true);
    try {
      const storage = JSON.parse(localStorage.getItem("storage") || "{}");
      const tenantID = storage?.tenantID || 0;
      const { dateFrom, dateTo } = resolveNcrDateRange(filters.dateRange);

      const filterParams = {
        tenantId: tenantID,
        ...(filters.openOnly
          ? { openOnly: true }
          : filters.status !== "all" && { status: filters.status as NCRStatus }),
        ...(filters.category !== "all" && { category: filters.category as NCRCategory }),
        ...(filters.severity !== "all" && { severity: filters.severity as NCRSeverity }),
        ...(filters.source !== "all" && {
          source: filters.source as "Internal" | "External" | "Customer",
        }),
        ...(filters.customerId !== "all" && {
          customerId: parseInt(filters.customerId, 10),
        }),
        ...(filters.due === "overdue" && { overdueOnly: true }),
        ...(dateFrom && { dateFrom }),
        ...(dateTo && { dateTo }),
      };

      const result = await QualityService.GetNCRs(filterParams);
      setNcrs(result || []);
    } catch (error: any) {
      console.error("Error loading NCRs:", error);
      toast.error(`Error loading NCRs: ${error.message || "Unknown error"}`);
      setNcrs([]);
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const storage = JSON.parse(localStorage.getItem("storage") || "{}");
      const tenantID = storage?.tenantID || 0;
      const statsResult = await QualityService.GetNCRStats(tenantID);
      setStats(statsResult);
    } catch (error) {
      console.error("Error loading NCR stats:", error);
    }
  };

  const handleCreateNCR = () => {
    setSelectedNCRId(0);
    setShowSlideout(true);
  };

  const handleRowClick = (row: Record<string, any>) => {
    const ncr = row as NonConformanceReport;
    setSelectedNCRId(ncr.ncrId);
    setShowSlideout(true);
  };

  const handleCloseSlideout = (refreshList = false) => {
    setShowSlideout(false);
    setSelectedNCRId(0);
    if (refreshList) {
      loadNCRs();
      loadStats();
    }
    const returnTo = returnToRef.current || (location.state as { returnTo?: string } | null)?.returnTo;
    if (returnTo) {
      returnToRef.current = null;
      history.push(returnTo);
    }
  };

  const handleFilterChange = (filterType: keyof typeof filters, value: string | boolean) => {
    setFilters((prev) => {
      const next = { ...prev, [filterType]: value };
      // Status dropdown overrides the Open-stats quick filter
      if (filterType === "status") {
        next.openOnly = false;
      }
      return next;
    });
  };

  const clearFilters = () => {
    setFilters({ ...DEFAULT_FILTERS, dateRange: "All" });
  };

  const hasActiveFilters =
    filters.status !== "all" ||
    filters.category !== "all" ||
    filters.severity !== "all" ||
    filters.source !== "all" ||
    filters.customerId !== "all" ||
    filters.due !== "all" ||
    filters.openOnly ||
    filters.dateRange !== "All";

  const applyStatFilter = (stat: "total" | "open" | "critical" | "overdue") => {
    if (stat === "total") {
      clearFilters();
      return;
    }

    setFilters({
      ...DEFAULT_FILTERS,
      dateRange: "All",
      ...(stat === "open" && { openOnly: true, status: "all" }),
      ...(stat === "critical" && { severity: "Critical" }),
      ...(stat === "overdue" && { due: "overdue" }),
    });
  };

  const formatDate = (dateStr: string): string => {
    if (!dateStr) return "";
    try {
      return new Date(dateStr).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return dateStr;
    }
  };

  const getStatusBadge = (status: NCRStatus) => {
    const statusConfig: Record<string, { class: string; text: string }> = {
      Open: { class: "badge-warning", text: "Open" },
      Under_Investigation: { class: "badge-info", text: "Under Investigation" },
      Pending_Approval: { class: "badge-secondary", text: "Pending Approval" },
      Approved: { class: "badge-primary", text: "Approved" },
      Implemented: { class: "badge-success", text: "Implemented" },
      Closed: { class: "badge-success", text: "Closed" },
      Rejected: { class: "badge-danger", text: "Rejected" },
    };

    const config = statusConfig[status] || statusConfig["Open"];
    return <span className={`badge ${config.class}`}>{config.text}</span>;
  };

  const getSeverityBadge = (severity: NCRSeverity) => {
    const severityConfig: Record<string, { class: string; text: string }> = {
      Minor: { class: "badge-success", text: "Minor" },
      Major: { class: "badge-warning", text: "Major" },
      Critical: { class: "badge-danger", text: "Critical" },
    };

    const config = severityConfig[severity] || severityConfig["Minor"];
    return <span className={`badge ${config.class}`}>{config.text}</span>;
  };

  const formatCategory = (category: NCRCategory): string => {
    return category.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
  };

  const columns = [
    {
      key: "ncrNumber",
      label: "NCR #",
      sortable: true,
      locked: true,
      align: "left" as const,
      render: (value: string) => <strong style={{ color: "#2563eb" }}>{value}</strong>,
    },
    {
      key: "title",
      label: "Title",
      sortable: true,
      align: "left" as const,
    },
    {
      key: "ncrCode",
      label: "NCR Code",
      sortable: true,
      align: "left" as const,
      render: (value: string) => value || "-",
    },
    {
      key: "category",
      label: "Category",
      sortable: true,
      align: "left" as const,
      render: (value: NCRCategory) => formatCategory(value),
    },
    {
      key: "severity",
      label: "Severity",
      sortable: true,
      align: "center" as const,
      render: (value: NCRSeverity) => getSeverityBadge(value),
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      align: "center" as const,
      render: (value: NCRStatus) => getStatusBadge(value),
    },
    {
      key: "source",
      label: "Source",
      sortable: true,
      align: "center" as const,
    },
    {
      key: "customerName",
      label: "Customer",
      sortable: true,
      align: "left" as const,
      render: (value: string) => value || "-",
    },
    {
      key: "jobOrderNumber",
      label: "Job Order",
      sortable: true,
      align: "left" as const,
      render: (value: string) =>
        value ? <span style={{ fontFamily: "monospace", fontSize: "0.875rem" }}>{value}</span> : "-",
    },
    {
      key: "dueDate",
      label: "Due",
      sortable: true,
      align: "left" as const,
      render: (value: string, row: NonConformanceReport) => {
        if (!value) return "-";
        const due = new Date(value);
        const isOverdue =
          !isNaN(due.getTime()) &&
          due < new Date() &&
          row.status !== "Closed";
        return (
          <span className={isOverdue ? "ncr-due-overdue" : undefined}>{formatDate(value)}</span>
        );
      },
    },
    {
      key: "reportedDate",
      label: "Reported",
      sortable: true,
      align: "left" as const,
      render: (value: string) => formatDate(value),
    },
    {
      key: "reportedByName",
      label: "Reported By",
      sortable: true,
      align: "left" as const,
    },
  ];

  const statusOptions = [
    { value: "all", label: "All Statuses" },
    { value: "Open", label: "Open" },
    { value: "Under_Investigation", label: "Under Investigation" },
    { value: "Pending_Approval", label: "Pending Approval" },
    { value: "Approved", label: "Approved" },
    { value: "Implemented", label: "Implemented" },
    { value: "Closed", label: "Closed" },
    { value: "Rejected", label: "Rejected" },
  ];

  const categoryOptions = [
    { value: "all", label: "All Categories" },
    { value: "Material_Defect", label: "Material Defect" },
    { value: "Dimensional_Issue", label: "Dimensional Issue" },
    { value: "Process_Failure", label: "Process Failure" },
    { value: "Equipment_Problem", label: "Equipment Problem" },
    { value: "Documentation_Error", label: "Documentation Error" },
    { value: "Supplier_Quality", label: "Supplier Quality" },
    { value: "Other", label: "Other" },
  ];

  const severityOptions = [
    { value: "all", label: "All Severities" },
    { value: "Minor", label: "Minor" },
    { value: "Major", label: "Major" },
    { value: "Critical", label: "Critical" },
  ];

  const sourceOptions = [
    { value: "all", label: "All Sources" },
    { value: "Internal", label: "Internal" },
    { value: "External", label: "External" },
    { value: "Customer", label: "Customer" },
  ];

  const dueOptions = [
    { value: "all", label: "All Due Dates" },
    { value: "overdue", label: "Overdue Only" },
  ];

  const dateRangeOptions = [
    { value: "All", label: "All Dates" },
    { value: "Last 7 Days", label: "Last 7 Days" },
    { value: "Last 30 Days", label: "Last 30 Days" },
    { value: "This Month", label: "This Month" },
    { value: "Last Month", label: "Last Month" },
    { value: "Last 3 Months", label: "Last 3 Months" },
  ];

  const customerOptions = useMemo(() => {
    const options = [
      { value: "all", label: "All Customers" },
      ...customers
        .filter((c) => c.customer_id > 0)
        .map((c) => ({
          value: String(c.customer_id),
          label: c.company_name || c.customercode || `Customer #${c.customer_id}`,
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    ];
    return options;
  }, [customers]);

  // When openOnly is active, show a synthetic status label in the dropdown
  const statusFilterValue = filters.openOnly ? "all" : filters.status;

  return (
    <div className="quality-page">
      <div className="stats-grid">
        <button
          type="button"
          className={`stat-card ${!hasActiveFilters ? "active" : ""}`}
          onClick={() => applyStatFilter("total")}
          title="Show all NCRs"
        >
          <div className="stat-icon">
            <FontAwesomeIcon icon={faShieldAlt} />
          </div>
          <div className="stat-content">
            <div className="stat-value">{stats.totalNCRs}</div>
            <div className="stat-label">Total NCRs</div>
          </div>
        </button>

        <button
          type="button"
          className={`stat-card warning ${filters.openOnly ? "active" : ""}`}
          onClick={() => applyStatFilter("open")}
          title="Filter open NCRs"
        >
          <div className="stat-icon">
            <FontAwesomeIcon icon={faExclamationTriangle} />
          </div>
          <div className="stat-content">
            <div className="stat-value">{stats.openNCRs}</div>
            <div className="stat-label">Open NCRs</div>
          </div>
        </button>

        <button
          type="button"
          className={`stat-card danger ${filters.severity === "Critical" ? "active" : ""}`}
          onClick={() => applyStatFilter("critical")}
          title="Filter critical NCRs"
        >
          <div className="stat-icon">
            <FontAwesomeIcon icon={faExclamationTriangle} />
          </div>
          <div className="stat-content">
            <div className="stat-value">{stats.criticalNCRs}</div>
            <div className="stat-label">Critical NCRs</div>
          </div>
        </button>

        <button
          type="button"
          className={`stat-card info ${filters.due === "overdue" ? "active" : ""}`}
          onClick={() => applyStatFilter("overdue")}
          title="Filter overdue NCRs"
        >
          <div className="stat-icon">
            <FontAwesomeIcon icon={faClock} />
          </div>
          <div className="stat-content">
            <div className="stat-value">{stats.overdueNCRs}</div>
            <div className="stat-label">Overdue NCRs</div>
          </div>
        </button>
      </div>

      {filters.openOnly && (
        <div className="ncr-quick-filter-banner">
          Showing open NCRs (Open + Under Investigation).{" "}
          <button type="button" className="link-button" onClick={clearFilters}>
            Clear
          </button>
        </div>
      )}

      <MasterListPage
        title="Quality - Non Conformance Reports"
        subtitle="Track and resolve manufacturing quality issues"
        data={ncrs}
        columns={columns}
        loading={loading}
        enablePagination
        onAdd={handleCreateNCR}
        onRowClick={handleRowClick}
        addButtonLabel="Create NCR"
        searchPlaceholder="Search NCRs by number, title, job order, part, or customer..."
        searchFields={[
          "ncrNumber",
          "title",
          "jobOrderNumber",
          "partNo",
          "partName",
          "customerName",
        ]}
        customActionButtons={[
          {
            label: "Clear filters",
            onClick: clearFilters,
            className: "btn-secondary",
            disabled: !hasActiveFilters,
          },
        ]}
        filters={[
          {
            label: "Status",
            options: statusOptions,
            value: statusFilterValue,
            onChange: (value) => handleFilterChange("status", value),
          },
          {
            label: "Category",
            options: categoryOptions,
            value: filters.category,
            onChange: (value) => handleFilterChange("category", value),
          },
          {
            label: "Severity",
            options: severityOptions,
            value: filters.severity,
            onChange: (value) => handleFilterChange("severity", value),
          },
          {
            label: "Source",
            options: sourceOptions,
            value: filters.source,
            onChange: (value) => handleFilterChange("source", value),
          },
          {
            label: "Customer",
            options: customerOptions,
            value: filters.customerId,
            onChange: (value) => handleFilterChange("customerId", value),
          },
          {
            label: "Due",
            options: dueOptions,
            value: filters.due,
            onChange: (value) => handleFilterChange("due", value),
          },
          {
            label: "Date Range",
            options: dateRangeOptions,
            value: filters.dateRange,
            onChange: (value) => handleFilterChange("dateRange", value),
          },
        ]}
        emptyMessage="No non conformance reports found"
        columnPreferenceKey="masterList.QualityNCR.hiddenColumns"
        defaultHiddenColumns={["customerName", "dueDate"]}
      />

      {showSlideout && (
        <NonConformanceReportSlideout
          ncrId={selectedNCRId}
          onClose={handleCloseSlideout}
          onDeleted={() => {
            loadNCRs();
            loadStats();
          }}
        />
      )}
    </div>
  );
};

export default Quality;

export {};
