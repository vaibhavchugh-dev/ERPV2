import React, { useState, useEffect } from "react";
import { useLocation, useHistory } from "react-router-dom";
import { toast } from "react-toastify";
import { ProcessService, ProcessMaster } from "../../Common/Services/ProcessService";
import ProcessMasterSlideout from "./ProcessMasterSlideout";
import ProcessMasterImportModal from "./ProcessMasterImportModal";
import "./CustomerMaster.scss";

const ProcessMasterComponent: React.FC = () => {
  const location = useLocation();
  const history = useHistory();
  const [processes, setProcesses] = useState<ProcessMaster[]>([]);
  const [showSlideout, setShowSlideout] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [selectedProcessId, setSelectedProcessId] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterValue, setFilterValue] = useState("all");
  const [sortColumn, setSortColumn] = useState<keyof ProcessMaster | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const openId = params.get("open");
    if (openId) {
      const id = parseInt(openId, 10);
      if (!isNaN(id) && id > 0) {
        setSelectedProcessId(id);
        setShowSlideout(true);
        history.replace(location.pathname);
      }
    }
  }, [location.search, history, location.pathname]);

  useEffect(() => {
    loadProcesses();
  }, []);

  const loadProcesses = async () => {
    setLoading(true);
    try {
      const storage = JSON.parse(localStorage.getItem("storage") || "{}");
      let tenantID = storage?.tenantID || 0;
      if (tenantID === 0 && process.env.NODE_ENV === "development") {
        tenantID = 1;
      }

      const result = await ProcessService.GetProcesses({ tenantid: tenantID });

      if (result && Array.isArray(result)) {
        setProcesses(result);
      } else {
        setProcesses([]);
      }
    } catch (error: any) {
      console.error("[ProcessMaster] Error loading processes:", error);
      toast.error(`Error loading processes: ${error.message || "Unknown error"}`);
      setProcesses([]);
    } finally {
      setLoading(false);
    }
  };

  const handleRowClick = (process: ProcessMaster) => {
    setSelectedProcessId(process.id);
    setShowSlideout(true);
  };

  const handleAddProcess = () => {
    setSelectedProcessId(0);
    setShowSlideout(true);
  };

  const handleCloseSlideout = () => {
    setShowSlideout(false);
    loadProcesses();
  };

  const handleSort = (column: keyof ProcessMaster) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  const filteredProcesses = processes.filter((process) => {
    const term = searchTerm.toLowerCase();
    const matchesSearch =
      process.processName?.toLowerCase().includes(term) ||
      process.processCode?.toLowerCase().includes(term) ||
      process.pDescription?.toLowerCase().includes(term) ||
      process.ledgercode?.toLowerCase().includes(term) ||
      process.processCategory?.toLowerCase().includes(term) ||
      process.defaultWorkstationName?.toLowerCase().includes(term);

    if (filterValue === "all") return matchesSearch;
    if (filterValue === "active") return matchesSearch && process.status === 1;
    if (filterValue === "inactive") return matchesSearch && process.status === 0;
    if (filterValue === "outside") return matchesSearch && process.isFixed === 1;
    return matchesSearch;
  });

  const sortedProcesses = [...filteredProcesses].sort((a, b) => {
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

  const getSortIcon = (column: keyof ProcessMaster) => {
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
        <p>Loading processes...</p>
      </div>
    );
  }

  return (
    <div className="customers-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Process Master</h1>
          <p className="page-subtitle">Manage manufacturing processes and routing defaults</p>
        </div>
        <div className="page-actions">
          <button
            className="btn-secondary"
            onClick={() => setShowImport(true)}
            type="button"
          >
            <span>Import</span>
          </button>
          <button className="btn-primary" onClick={handleAddProcess} type="button">
            <span>+</span>
            <span>Add Process</span>
          </button>
        </div>
      </div>

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
            placeholder="Search processes..."
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
            <option value="all">All Processes</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="outside">Outside Services</option>
          </select>
        </div>
      </div>

      <div className="table-card">
        <div className="table-wrapper">
          <table className="customers-table">
            <thead>
              <tr>
                <th className="sortable" onClick={() => handleSort("srno")}>
                  <div className="th-content">Sr. No.{getSortIcon("srno")}</div>
                </th>
                <th className="sortable" onClick={() => handleSort("processCode")}>
                  <div className="th-content">Code{getSortIcon("processCode")}</div>
                </th>
                <th className="sortable" onClick={() => handleSort("processName")}>
                  <div className="th-content">Process Name{getSortIcon("processName")}</div>
                </th>
                <th className="sortable" onClick={() => handleSort("processCategory")}>
                  <div className="th-content">Category{getSortIcon("processCategory")}</div>
                </th>
                <th className="sortable" onClick={() => handleSort("defaultEstimatedTimeMinutes")}>
                  <div className="th-content">Est. Time{getSortIcon("defaultEstimatedTimeMinutes")}</div>
                </th>
                <th className="sortable" onClick={() => handleSort("defaultWorkstationName")}>
                  <div className="th-content">Workstation{getSortIcon("defaultWorkstationName")}</div>
                </th>
                <th className="sortable" onClick={() => handleSort("isFixed")}>
                  <div className="th-content">Outside{getSortIcon("isFixed")}</div>
                </th>
                <th className="sortable" onClick={() => handleSort("status")}>
                  <div className="th-content">Status{getSortIcon("status")}</div>
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedProcesses.length === 0 ? (
                <tr>
                  <td colSpan={8} className="empty-state">
                    <p>No processes found</p>
                    <small>Click "Add Process" or "Import" to get started</small>
                  </td>
                </tr>
              ) : (
                sortedProcesses.map((process) => (
                  <tr key={process.id} onClick={() => handleRowClick(process)}>
                    <td>{process.srno || ""}</td>
                    <td>{process.processCode || ""}</td>
                    <td>{process.processName || ""}</td>
                    <td>{process.processCategory || ""}</td>
                    <td>
                      {process.defaultEstimatedTimeMinutes != null
                        ? `${process.defaultEstimatedTimeMinutes} min`
                        : ""}
                    </td>
                    <td>{process.defaultWorkstationName || ""}</td>
                    <td>
                      <span
                        className={`badge ${
                          process.isFixed === 1 ? "badge-info" : "badge-secondary"
                        }`}
                      >
                        {process.isFixed === 1 ? "Yes" : "No"}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`badge ${
                          process.status === 1 ? "badge-success" : "badge-danger"
                        }`}
                      >
                        {process.statusText ||
                          (process.status === 1 ? "Active" : "Inactive")}
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
        <ProcessMasterSlideout
          processId={selectedProcessId}
          onClose={handleCloseSlideout}
        />
      )}

      {showImport && (
        <ProcessMasterImportModal
          onClose={() => setShowImport(false)}
          onImported={loadProcesses}
        />
      )}
    </div>
  );
};

export default ProcessMasterComponent;
