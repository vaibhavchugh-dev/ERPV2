import React, { useState, useEffect } from "react";
import { useLocation, useHistory } from "react-router-dom";
import { toast } from "react-toastify";
import { faPlus, faSearch, faFilter, faShieldAlt, faExclamationTriangle, faCheckCircle, faClock } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import MasterListPage from "../../Common/Components/MasterListPage/MasterListPage";
import { QualityService, NonConformanceReport, NCRStatus, NCRCategory, NCRSeverity } from "../../Common/Services/QualityService";
import NonConformanceReportSlideout from "./NonConformanceReportSlideout";
import "./Quality.scss";

const Quality: React.FC = () => {
  const location = useLocation();
  const history = useHistory();
  const [ncrs, setNcrs] = useState<NonConformanceReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [showSlideout, setShowSlideout] = useState(false);
  const [selectedNCRId, setSelectedNCRId] = useState<number>(0);

  // Handle URL parameter to open slideout (from global search)
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const openId = params.get('open');
    if (openId) {
      const id = parseInt(openId, 10);
      if (!isNaN(id) && id > 0) {
        setSelectedNCRId(id);
        setShowSlideout(true);
        history.replace(location.pathname);
      }
    }
  }, [location.search, history, location.pathname]);
  const [stats, setStats] = useState({
    totalNCRs: 0,
    openNCRs: 0,
    criticalNCRs: 0,
    overdueNCRs: 0
  });

  const [filters, setFilters] = useState({
    status: 'all',
    category: 'all',
    severity: 'all',
    source: 'all',
    dateRange: 'Last 30 Days'
  });

  useEffect(() => {
    loadNCRs();
    loadStats();
  }, [filters]);

  const loadNCRs = async () => {
    setLoading(true);
    try {
      const storage = JSON.parse(localStorage.getItem("storage") || "{}");
      const tenantID = storage?.tenantID || 0;

      const filterParams = {
        tenantId: tenantID,
        ...(filters.status !== 'all' && { status: filters.status as NCRStatus }),
        ...(filters.category !== 'all' && { category: filters.category as NCRCategory }),
        ...(filters.severity !== 'all' && { severity: filters.severity as NCRSeverity }),
        ...(filters.source !== 'all' && { source: filters.source as 'Internal' | 'External' | 'Customer' }),
      };

      console.log("Loading NCRs with params:", filterParams);
      const result = await QualityService.GetNCRs(filterParams);
      console.log("NCRs loaded:", result);
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
  };

  const handleFilterChange = (filterType: keyof typeof filters, value: string) => {
    setFilters(prev => ({
      ...prev,
      [filterType]: value
    }));
  };

  const formatDate = (dateStr: string): string => {
    if (!dateStr) return '';
    try {
      return new Date(dateStr).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch {
      return dateStr;
    }
  };

  const getStatusBadge = (status: NCRStatus) => {
    const statusConfig = {
      'Open': { class: 'badge-warning', text: 'Open' },
      'Under_Investigation': { class: 'badge-info', text: 'Under Investigation' },
      'Pending_Approval': { class: 'badge-secondary', text: 'Pending Approval' },
      'Approved': { class: 'badge-primary', text: 'Approved' },
      'Implemented': { class: 'badge-success', text: 'Implemented' },
      'Closed': { class: 'badge-success', text: 'Closed' },
      'Rejected': { class: 'badge-danger', text: 'Rejected' }
    };

    const config = statusConfig[status] || statusConfig['Open'];
    return <span className={`badge ${config.class}`}>{config.text}</span>;
  };

  const getSeverityBadge = (severity: NCRSeverity) => {
    const severityConfig = {
      'Minor': { class: 'badge-success', text: 'Minor' },
      'Major': { class: 'badge-warning', text: 'Major' },
      'Critical': { class: 'badge-danger', text: 'Critical' }
    };

    const config = severityConfig[severity] || severityConfig['Minor'];
    return <span className={`badge ${config.class}`}>{config.text}</span>;
  };

  const formatCategory = (category: NCRCategory): string => {
    return category.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  const columns = [
    {
      key: "ncrNumber",
      label: "NCR #",
      sortable: true,
      align: "left" as const,
      render: (value: string) => <strong style={{ color: '#2563eb' }}>{value}</strong>
    },
    {
      key: "title",
      label: "Title",
      sortable: true,
      align: "left" as const,
    },
    {
      key: "category",
      label: "Category",
      sortable: true,
      align: "left" as const,
      render: (value: NCRCategory) => formatCategory(value)
    },
    {
      key: "severity",
      label: "Severity",
      sortable: true,
      align: "center" as const,
      render: (value: NCRSeverity) => getSeverityBadge(value)
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      align: "center" as const,
      render: (value: NCRStatus) => getStatusBadge(value)
    },
    {
      key: "source",
      label: "Source",
      sortable: true,
      align: "center" as const,
    },
    {
      key: "jobOrderNumber",
      label: "Job Order",
      sortable: true,
      align: "left" as const,
      render: (value: string) => value ? (
        <span style={{ fontFamily: 'monospace', fontSize: '0.875rem' }}>{value}</span>
      ) : '-'
    },
    {
      key: "reportedDate",
      label: "Reported",
      sortable: true,
      align: "left" as const,
      render: (value: string) => formatDate(value)
    },
    {
      key: "reportedByName",
      label: "Reported By",
      sortable: true,
      align: "left" as const,
    }
  ];

  const statusOptions = [
    { value: 'all', label: 'All Statuses' },
    { value: 'Open', label: 'Open' },
    { value: 'Under_Investigation', label: 'Under Investigation' },
    { value: 'Pending_Approval', label: 'Pending Approval' },
    { value: 'Approved', label: 'Approved' },
    { value: 'Implemented', label: 'Implemented' },
    { value: 'Closed', label: 'Closed' },
    { value: 'Rejected', label: 'Rejected' }
  ];

  const categoryOptions = [
    { value: 'all', label: 'All Categories' },
    { value: 'Material_Defect', label: 'Material Defect' },
    { value: 'Dimensional_Issue', label: 'Dimensional Issue' },
    { value: 'Process_Failure', label: 'Process Failure' },
    { value: 'Equipment_Problem', label: 'Equipment Problem' },
    { value: 'Documentation_Error', label: 'Documentation Error' },
    { value: 'Supplier_Quality', label: 'Supplier Quality' },
    { value: 'Other', label: 'Other' }
  ];

  const severityOptions = [
    { value: 'all', label: 'All Severities' },
    { value: 'Minor', label: 'Minor' },
    { value: 'Major', label: 'Major' },
    { value: 'Critical', label: 'Critical' }
  ];

  const sourceOptions = [
    { value: 'all', label: 'All Sources' },
    { value: 'Internal', label: 'Internal' },
    { value: 'External', label: 'External' },
    { value: 'Customer', label: 'Customer' }
  ];

  const dateRangeOptions = [
    { value: 'All', label: 'All Dates' },
    { value: 'Last 7 Days', label: 'Last 7 Days' },
    { value: 'Last 30 Days', label: 'Last 30 Days' },
    { value: 'This Month', label: 'This Month' },
    { value: 'Last Month', label: 'Last Month' },
    { value: 'Last 3 Months', label: 'Last 3 Months' }
  ];

  return (
    <div className="quality-page">
      {/* Stats Cards */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon">
            <FontAwesomeIcon icon={faShieldAlt} />
          </div>
          <div className="stat-content">
            <div className="stat-value">{stats.totalNCRs}</div>
            <div className="stat-label">Total NCRs</div>
          </div>
        </div>

        <div className="stat-card warning">
          <div className="stat-icon">
            <FontAwesomeIcon icon={faExclamationTriangle} />
          </div>
          <div className="stat-content">
            <div className="stat-value">{stats.openNCRs}</div>
            <div className="stat-label">Open NCRs</div>
          </div>
        </div>

        <div className="stat-card danger">
          <div className="stat-icon">
            <FontAwesomeIcon icon={faExclamationTriangle} />
          </div>
          <div className="stat-content">
            <div className="stat-value">{stats.criticalNCRs}</div>
            <div className="stat-label">Critical NCRs</div>
          </div>
        </div>

        <div className="stat-card info">
          <div className="stat-icon">
            <FontAwesomeIcon icon={faClock} />
          </div>
          <div className="stat-content">
            <div className="stat-value">{stats.overdueNCRs}</div>
            <div className="stat-label">Overdue NCRs</div>
          </div>
        </div>
      </div>

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
        searchPlaceholder="Search NCRs by number, title, or job order..."
        searchFields={["ncrNumber", "title", "jobOrderNumber", "partNo", "partName"]}
        filters={[
          {
            label: "Status",
            options: statusOptions,
            value: filters.status,
            onChange: (value) => handleFilterChange('status', value)
          },
          {
            label: "Category",
            options: categoryOptions,
            value: filters.category,
            onChange: (value) => handleFilterChange('category', value)
          },
          {
            label: "Severity",
            options: severityOptions,
            value: filters.severity,
            onChange: (value) => handleFilterChange('severity', value)
          },
          {
            label: "Source",
            options: sourceOptions,
            value: filters.source,
            onChange: (value) => handleFilterChange('source', value)
          },
          {
            label: "Date Range",
            options: dateRangeOptions,
            value: filters.dateRange,
            onChange: (value) => handleFilterChange('dateRange', value)
          }
        ]}
        emptyMessage="No non conformance reports found"
      />

      {/* NCR Slideout */}
      {showSlideout && (
        <NonConformanceReportSlideout
          ncrId={selectedNCRId}
          onClose={handleCloseSlideout}
        />
      )}
    </div>
  );
};

export default Quality;

// Ensure this file is treated as a module
export {};
