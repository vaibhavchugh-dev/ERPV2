import React, { useState, useEffect } from "react";
import { useLocation, useHistory } from "react-router-dom";
import { toast } from "react-toastify";
import { WorkstationService, WorkstationMaster } from "../../Common/Services/WorkstationService";
import WorkstationMasterSlideout from "./WorkstationMasterSlideout";

const WorkstationMasterComponent: React.FC = () => {
  const location = useLocation();
  const history = useHistory();
  const [workstations, setWorkstations] = useState<WorkstationMaster[]>([]);
  const [showSlideout, setShowSlideout] = useState(false);
  const [selectedWorkstationId, setSelectedWorkstationId] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterValue, setFilterValue] = useState("all");
  const [sortColumn, setSortColumn] = useState<keyof WorkstationMaster | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  // Handle URL parameter to open slideout (from global search)
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const openId = params.get('open');
    if (openId) {
      const id = parseInt(openId, 10);
      if (!isNaN(id) && id > 0) {
        setSelectedWorkstationId(id);
        setShowSlideout(true);
        history.replace(location.pathname);
      }
    }
  }, [location.search, history, location.pathname]);

  useEffect(() => {
    loadWorkstations();
  }, []);

  const loadWorkstations = async () => {
    setLoading(true);
    try {
      const storage = JSON.parse(localStorage.getItem("storage") || "{}");
      let tenantID = storage?.tenantID || 0;
      // For development: if tenantID is not set, use a default value
      if (tenantID === 0 && process.env.NODE_ENV === 'development') {
        tenantID = 1; // Default tenant ID for development
        console.log('[WorkstationMaster] Using default tenantID:', tenantID);
      }

      console.log('[WorkstationMaster] Loading workstations with tenantID:', tenantID);
      const result = await WorkstationService.GetWorkstations({ tenantid: tenantID });
      console.log('[WorkstationMaster] API response:', result);
      
      if (result && Array.isArray(result)) {
        setWorkstations(result);
        console.log('[WorkstationMaster] Loaded', result.length, 'workstations');
      } else {
        console.warn('[WorkstationMaster] Invalid response from API:', result);
        setWorkstations([]);
      }
    } catch (error: any) {
      console.error('[WorkstationMaster] Error loading workstations:', error);
      toast.error(`Error loading workstations: ${error.message || 'Unknown error'}`);
      setWorkstations([]);
    } finally {
      setLoading(false);
    }
  };

  const handleRowClick = (workstation: WorkstationMaster) => {
    setSelectedWorkstationId(workstation.id);
    setShowSlideout(true);
  };

  const handleAddWorkstation = () => {
    setSelectedWorkstationId(0);
    setShowSlideout(true);
  };

  const handleCloseSlideout = () => {
    setShowSlideout(false);
    loadWorkstations();
  };

  const handleSort = (column: keyof WorkstationMaster) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  const filteredWorkstations = workstations.filter((workstation) => {
    const matchesSearch =
      workstation.workstationName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      workstation.userName?.toLowerCase().includes(searchTerm.toLowerCase());

    if (filterValue === "all") {
      return matchesSearch;
    }

    if (filterValue === "active") {
      return matchesSearch && workstation.isActive === true;
    }

    if (filterValue === "inactive") {
      return matchesSearch && workstation.isActive === false;
    }

    return matchesSearch;
  });

  const sortedWorkstations = [...filteredWorkstations].sort((a, b) => {
    if (!sortColumn) return 0;

    let aValue: any = a[sortColumn];
    let bValue: any = b[sortColumn];

    if (aValue == null && bValue == null) return 0;
    if (aValue == null) return 1;
    if (bValue == null) return -1;

    if (typeof aValue === "string" && typeof bValue === "string") {
      aValue = aValue.toLowerCase();
      bValue = bValue.toLowerCase();
    }

    if (aValue < bValue) return sortDirection === "asc" ? -1 : 1;
    if (aValue > bValue) return sortDirection === "asc" ? 1 : -1;
    return 0;
  });

  const getSortIcon = (column: keyof WorkstationMaster) => {
    if (sortColumn !== column) {
      return <span className="sort-icon inactive">⇅</span>;
    }
    return sortDirection === "asc" ? (
      <span className="sort-icon active">↑</span>
    ) : (
      <span className="sort-icon active">↓</span>
    );
  };

  if (loading) {
    return (
      <div className="page-loading">
        <div className="loading-spinner"></div>
        <p>Loading workstations...</p>
      </div>
    );
  }

  return (
    <div className="customers-page">
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Workstation Master</h1>
          <p className="page-subtitle">Manage your workstations and user assignments</p>
        </div>
        <div className="page-actions">
          <button className="btn-primary" onClick={handleAddWorkstation}>
            <span>+</span>
            <span>Add Workstation</span>
          </button>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="page-filters">
        <div className="search-wrapper">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8"></circle>
            <path d="m21 21-4.35-4.35"></path>
          </svg>
          <input
            type="text"
            placeholder="Search workstations..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
        </div>
        <div className="filter-group">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
          </svg>
          <select
            value={filterValue}
            onChange={(e) => setFilterValue(e.target.value)}
            className="filter-select"
          >
            <option value="all">All Workstations</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>

      {/* Workstations Table */}
      <div className="table-card">
        <div className="table-wrapper">
          <table className="customers-table">
            <thead>
              <tr>
                <th
                  className="sortable"
                  onClick={() => handleSort("workstationName" as keyof WorkstationMaster)}
                >
                  <div className="th-content">
                    Workstation Name
                    {getSortIcon("workstationName" as keyof WorkstationMaster)}
                  </div>
                </th>
                <th>Assigned Users</th>
                <th
                  className="sortable"
                  onClick={() => handleSort("isActive" as keyof WorkstationMaster)}
                >
                  <div className="th-content">
                    Status
                    {getSortIcon("isActive" as keyof WorkstationMaster)}
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedWorkstations.length === 0 ? (
                <tr>
                  <td colSpan={3} className="empty-state">
                    <p>No workstations found</p>
                    <small>Click "Add Workstation" to get started</small>
                  </td>
                </tr>
              ) : (
                sortedWorkstations.map((workstation) => (
                  <tr key={workstation.id} onClick={() => handleRowClick(workstation)}>
                    <td>
                      <div className="customer-name">
                        <strong>{workstation.workstationName}</strong>
                      </div>
                    </td>
                    <td>{workstation.userName || "No users assigned"}</td>
                    <td>
                      <span
                        className={`badge ${
                          workstation.isActive ? "badge-success" : "badge-danger"
                        }`}
                      >
                        {workstation.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showSlideout && (
        <WorkstationMasterSlideout
          workstationId={selectedWorkstationId}
          onClose={handleCloseSlideout}
        />
      )}
    </div>
  );
};

export default WorkstationMasterComponent;

