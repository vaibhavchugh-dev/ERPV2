import React, { useState, useEffect } from "react";
import { toast } from "react-toastify";
import { EmployeeService, EmployeeMaster } from "../../Common/Services/EmployeeService";
import ColumnChooser from "../../Common/Components/ColumnChooser";
import { ColumnDefinition, useColumnChooser } from "../../Common/Hooks/useColumnChooser";
import EmployeeMasterSlideout from "./EmployeeMasterSlideout";
import EmployeeMasterImportModal from "./EmployeeMasterImportModal";
import "./CustomerMaster.scss";

const COLUMNS: ColumnDefinition[] = [
  { key: "empCode", label: "Emp. Code", sortKey: "empCode", locked: true },
  { key: "firstName", label: "First Name", sortKey: "firstName", locked: true },
  { key: "lastName", label: "Last Name", sortKey: "lastName" },
  { key: "roleName", label: "Role", sortKey: "roleName" },
  { key: "employeeType", label: "Employee Type", sortKey: "employeeType" },
  { key: "userName", label: "User Name", sortKey: "userName" },
  { key: "email", label: "Email", sortKey: "email" },
  { key: "status", label: "Status", sortKey: "status" },
];

const DEFAULT_HIDDEN_COLUMNS = ["userName"];
const COLUMN_PREFERENCE_KEY = "employeeMaster.hiddenColumns";

const EmployeeMasterComponent: React.FC = () => {
  const [employees, setEmployees] = useState<EmployeeMaster[]>([]);
  const [showSlideout, setShowSlideout] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterValue, setFilterValue] = useState("all");
  const [sortColumn, setSortColumn] = useState<keyof EmployeeMaster | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  const {
    hiddenColumns,
    visibleColumns,
    showColumnChooser,
    setShowColumnChooser,
    columnChooserRef,
    toggleColumn,
  } = useColumnChooser(COLUMN_PREFERENCE_KEY, COLUMNS, DEFAULT_HIDDEN_COLUMNS);

  useEffect(() => {
    loadEmployees();
  }, []);

  const loadEmployees = async () => {
    setLoading(true);
    try {
      const storage = JSON.parse(localStorage.getItem("storage") || "{}");
      let tenantID = storage?.tenantID || 0;
      // For development: if tenantID is not set, use a default value
      if (tenantID === 0 && process.env.NODE_ENV === 'development') {
        tenantID = 1; // Default tenant ID for development
        console.log('[EmployeeMaster] Using default tenantID:', tenantID);
      }

      console.log('[EmployeeMaster] Loading employees with tenantID:', tenantID);
      const result = await EmployeeService.GetEmployees({ tenantid: tenantID });
      console.log('[EmployeeMaster] API response:', result);
      
      if (result && Array.isArray(result)) {
        setEmployees(result);
        console.log('[EmployeeMaster] Loaded', result.length, 'employees');
      } else {
        console.warn('[EmployeeMaster] Invalid response from API:', result);
        setEmployees([]);
      }
    } catch (error: any) {
      console.error('[EmployeeMaster] Error loading employees:', error);
      toast.error(`Error loading employees: ${error.message || 'Unknown error'}`);
      setEmployees([]);
    } finally {
      setLoading(false);
    }
  };

  const handleRowClick = (employee: EmployeeMaster) => {
    setSelectedEmployeeId(employee.user_UniqueID);
    setShowSlideout(true);
  };

  const handleAddEmployee = () => {
    setSelectedEmployeeId(0);
    setShowSlideout(true);
  };

  const handleCloseSlideout = (refreshList = false) => {
    setShowSlideout(false);
    if (refreshList) {
      loadEmployees();
    }
  };

  const handleSort = (column: keyof EmployeeMaster) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  const filteredEmployees = employees.filter((employee) => {
    const matchesSearch =
      employee.empCode?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      employee.firstName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      employee.lastName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      employee.userName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      employee.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      employee.roleName?.toLowerCase().includes(searchTerm.toLowerCase());

    if (filterValue === "all") {
      return matchesSearch;
    }

    if (filterValue === "active") {
      return matchesSearch && employee.status === "Active";
    }

    if (filterValue === "inactive") {
      return matchesSearch && employee.status === "Inactive";
    }

    return matchesSearch;
  });

  const sortedEmployees = [...filteredEmployees].sort((a, b) => {
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

  const getSortIcon = (column: keyof EmployeeMaster) => {
    if (sortColumn !== column) {
      return <span className="sort-icon inactive">⇅</span>;
    }
    return sortDirection === "asc" ? (
      <span className="sort-icon active">↑</span>
    ) : (
      <span className="sort-icon active">↓</span>
    );
  };

  const renderCell = (employee: EmployeeMaster, key: string): React.ReactNode => {
    switch (key) {
      case "empCode":
        return employee.empCode || "";
      case "firstName":
        return employee.firstName || "";
      case "lastName":
        return employee.lastName || "";
      case "roleName":
        return employee.roleName || "";
      case "employeeType":
        return employee.employeeType || "";
      case "userName":
        return employee.userName || "";
      case "email":
        return employee.email || "";
      case "status":
        return (
          <span
            className={`badge ${
              employee.status === "Active" ? "badge-success" : "badge-danger"
            }`}
          >
            {employee.status || ""}
          </span>
        );
      default:
        return "";
    }
  };

  if (loading) {
    return (
      <div className="page-loading">
        <div className="loading-spinner"></div>
        <p>Loading employees...</p>
      </div>
    );
  }

  return (
    <div className="customers-page">
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Employee Master</h1>
          <p className="page-subtitle">Manage your employee database</p>
        </div>
        <div className="page-actions">
          <button
            className="btn-secondary"
            onClick={() => setShowImport(true)}
            type="button"
          >
            <span>Import</span>
          </button>
          <ColumnChooser
            columns={COLUMNS}
            hiddenColumns={hiddenColumns}
            showMenu={showColumnChooser}
            onToggleMenu={() => setShowColumnChooser(!showColumnChooser)}
            onToggleColumn={toggleColumn}
            containerRef={columnChooserRef}
          />
          <button className="btn-primary" onClick={handleAddEmployee}>
            <span>+</span>
            <span>Add Employee</span>
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
            placeholder="Search employees..."
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
            <option value="all">All Employees</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>

      {/* Employees Table */}
      <div className="table-card">
        <div className="table-wrapper">
          <table className="customers-table">
            <thead>
              <tr>
                {visibleColumns.map((column) => (
                  <th
                    key={column.key}
                    className={column.sortKey ? "sortable" : ""}
                    onClick={() =>
                      column.sortKey &&
                      handleSort(column.sortKey as keyof EmployeeMaster)
                    }
                  >
                    <div className="th-content">
                      {column.label}
                      {column.sortKey &&
                        getSortIcon(column.sortKey as keyof EmployeeMaster)}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedEmployees.length === 0 ? (
                <tr>
                  <td colSpan={visibleColumns.length} className="empty-state">
                    <p>No employees found</p>
                    <small>Click "Add Employee" or "Import" to get started</small>
                  </td>
                </tr>
              ) : (
                sortedEmployees.map((employee) => (
                  <tr key={employee.user_UniqueID} onClick={() => handleRowClick(employee)}>
                    {visibleColumns.map((column) => (
                      <td key={column.key}>{renderCell(employee, column.key)}</td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showSlideout && (
        <EmployeeMasterSlideout
          employeeId={selectedEmployeeId}
          onClose={handleCloseSlideout}
        />
      )}

      {showImport && (
        <EmployeeMasterImportModal
          onClose={() => setShowImport(false)}
          onImported={loadEmployees}
        />
      )}
    </div>
  );
};

export default EmployeeMasterComponent;

