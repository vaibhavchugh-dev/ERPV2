import React, { useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import ColumnChooser from "../../Common/Components/ColumnChooser";
import { ColumnDefinition, useColumnChooser } from "../../Common/Hooks/useColumnChooser";
import {
  AttendancePunchLogRow,
  AttendanceRegisterRow,
  AttendanceService,
  AttendanceStatus,
} from "../../Common/Services/AttendanceService";
import { EmployeeMaster, EmployeeService } from "../../Common/Services/EmployeeService";
import { buildCsv, downloadCsv } from "../../Common/Utils/CsvImport";
import "../Masters/CustomerMaster.scss";
import "../Masters/CustomerMasterSlideout.scss";

const COLUMNS: ColumnDefinition[] = [
  { key: "workDate", label: "Date", sortKey: "workDate", locked: true },
  { key: "empCode", label: "Emp. Code", sortKey: "empCode", locked: true },
  { key: "name", label: "Name", sortKey: "firstName", locked: true },
  { key: "punchIn", label: "In", sortKey: "punchIn" },
  { key: "punchOut", label: "Out", sortKey: "punchOut" },
  { key: "hours", label: "Hours", sortKey: "hours" },
  { key: "status", label: "Status", sortKey: "status" },
  { key: "lastMethod", label: "Method", sortKey: "lastMethod" },
  { key: "locationName", label: "Location", sortKey: "locationName" },
];

const DEFAULT_HIDDEN_COLUMNS = ["lastMethod", "locationName"];
const COLUMN_PREFERENCE_KEY = "attendanceRegister.hiddenColumns";

const todayIso = () => new Date().toISOString().substring(0, 10);

const formatTime = (value?: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
};

const formatHours = (hours?: number | null) => {
  if (hours == null || Number.isNaN(hours)) return "—";
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
};

const statusLabel = (status: AttendanceStatus) => {
  switch (status) {
    case "in":
      return "In";
    case "completed":
      return "Completed";
    case "missingOut":
      return "Missing out";
    case "noPunch":
      return "No punch";
    default:
      return status;
  }
};

const statusBadge = (status: AttendanceStatus) => {
  if (status === "completed") return "badge-success";
  if (status === "in") return "badge-success";
  if (status === "missingOut") return "badge-danger";
  return "badge-secondary";
};

const displayName = (row: { firstName?: string; lastName?: string }) =>
  `${row.firstName || ""} ${row.lastName || ""}`.trim() || "—";

const AttendanceRegister: React.FC = () => {
  const [fromDate, setFromDate] = useState(todayIso);
  const [toDate, setToDate] = useState(todayIso);
  const [employeeId, setEmployeeId] = useState(0);
  const [includeNoPunch, setIncludeNoPunch] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [rows, setRows] = useState<AttendanceRegisterRow[]>([]);
  const [employees, setEmployees] = useState<EmployeeMaster[]>([]);
  const [loading, setLoading] = useState(false);
  const [sortColumn, setSortColumn] = useState<string>("workDate");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [selectedRow, setSelectedRow] = useState<AttendanceRegisterRow | null>(null);
  const [punchLog, setPunchLog] = useState<AttendancePunchLogRow[]>([]);
  const [logLoading, setLogLoading] = useState(false);

  const {
    hiddenColumns,
    visibleColumns,
    showColumnChooser,
    setShowColumnChooser,
    columnChooserRef,
    toggleColumn,
  } = useColumnChooser(COLUMN_PREFERENCE_KEY, COLUMNS, DEFAULT_HIDDEN_COLUMNS);

  const loadEmployees = async () => {
    try {
      const storage = JSON.parse(localStorage.getItem("storage") || "{}");
      const result = await EmployeeService.GetEmployees({ tenantid: storage?.tenantID || 0 });
      setEmployees(Array.isArray(result) ? result : []);
    } catch {
      setEmployees([]);
    }
  };

  const loadRegister = async () => {
    setLoading(true);
    try {
      const result = await AttendanceService.GetRegister({
        from: fromDate,
        to: toDate,
        employeeId: employeeId || undefined,
        includeNoPunch,
      });
      setRows(result);
    } catch (error: any) {
      toast.error(error?.response?.data?.message || error?.message || "Unable to load attendance");
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEmployees();
  }, []);

  useEffect(() => {
    loadRegister();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromDate, toDate, employeeId, includeNoPunch]);

  const filteredRows = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return rows.filter((row) => {
      const matchesSearch =
        !term ||
        row.empCode?.toLowerCase().includes(term) ||
        row.firstName?.toLowerCase().includes(term) ||
        row.lastName?.toLowerCase().includes(term) ||
        row.userName?.toLowerCase().includes(term);
      const matchesStatus = statusFilter === "all" || row.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [rows, searchTerm, statusFilter]);

  const sortedRows = useMemo(() => {
    const copy = [...filteredRows];
    copy.sort((a, b) => {
      const aValue: any =
        sortColumn === "name"
          ? displayName(a)
          : a[sortColumn as keyof AttendanceRegisterRow];
      const bValue: any =
        sortColumn === "name"
          ? displayName(b)
          : b[sortColumn as keyof AttendanceRegisterRow];
      if (aValue == null && bValue == null) return 0;
      if (aValue == null) return 1;
      if (bValue == null) return -1;
      if (typeof aValue === "number" && typeof bValue === "number") {
        return sortDirection === "asc" ? aValue - bValue : bValue - aValue;
      }
      const cmp = String(aValue).localeCompare(String(bValue), undefined, { numeric: true });
      return sortDirection === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [filteredRows, sortColumn, sortDirection]);

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  const renderCell = (row: AttendanceRegisterRow, key: string): React.ReactNode => {
    switch (key) {
      case "workDate":
        return row.workDate;
      case "empCode":
        return row.empCode || "";
      case "name":
        return displayName(row);
      case "punchIn":
        return formatTime(row.punchIn);
      case "punchOut":
        return formatTime(row.punchOut);
      case "hours":
        return formatHours(row.hours);
      case "status":
        return (
          <span className={`badge ${statusBadge(row.status)}`}>{statusLabel(row.status)}</span>
        );
      case "lastMethod":
        return row.lastMethod || "—";
      case "locationName":
        return row.locationName || "—";
      default:
        return "";
    }
  };

  const renderCellText = (row: AttendanceRegisterRow, key: string): string => {
    switch (key) {
      case "workDate":
        return row.workDate;
      case "empCode":
        return row.empCode || "";
      case "name":
        return displayName(row);
      case "punchIn":
        return formatTime(row.punchIn);
      case "punchOut":
        return formatTime(row.punchOut);
      case "hours":
        return formatHours(row.hours);
      case "status":
        return statusLabel(row.status);
      case "lastMethod":
        return row.lastMethod || "";
      case "locationName":
        return row.locationName || "";
      default:
        return "";
    }
  };

  const handleExport = () => {
    const headers = visibleColumns.map((c) => c.label);
    const csvRows = sortedRows.map((row) =>
      visibleColumns.map((column) => renderCellText(row, column.key))
    );
    downloadCsv(`attendance-register-${fromDate}-to-${toDate}.csv`, buildCsv(headers, csvRows));
    toast.success(`Exported ${csvRows.length} row(s)`);
  };

  const openLog = async (row: AttendanceRegisterRow) => {
    setSelectedRow(row);
    setPunchLog([]);
    setLogLoading(true);
    try {
      const log = await AttendanceService.GetPunchLog({
        from: row.workDate,
        to: row.workDate,
        employeeId: row.userUniqueId,
        includeFailed: true,
      });
      setPunchLog(log);
    } catch (error: any) {
      toast.error(error?.message || "Unable to load punch log");
      setPunchLog([]);
    } finally {
      setLogLoading(false);
    }
  };

  return (
    <div className="customers-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Attendance Register</h1>
          <p className="page-subtitle">Daily Time Clock punches by employee</p>
        </div>
        <div className="page-actions">
          <button className="btn-secondary" type="button" onClick={handleExport}>
            <span>Export</span>
          </button>
          <ColumnChooser
            columns={COLUMNS}
            hiddenColumns={hiddenColumns}
            showMenu={showColumnChooser}
            onToggleMenu={() => setShowColumnChooser(!showColumnChooser)}
            onToggleColumn={toggleColumn}
            containerRef={columnChooserRef}
          />
        </div>
      </div>

      <div className="page-filters">
        <div className="filter-group">
          <input
            type="date"
            className="filter-select"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
          />
          <input
            type="date"
            className="filter-select"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
          />
        </div>
        <div className="search-wrapper">
          <input
            type="text"
            placeholder="Search employees..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
        </div>
        <div className="filter-group">
          <select
            className="filter-select"
            value={employeeId}
            onChange={(e) => setEmployeeId(Number(e.target.value))}
          >
            <option value={0}>All employees</option>
            {employees.map((employee) => (
              <option key={employee.user_UniqueID} value={employee.user_UniqueID}>
                {employee.empCode ? `${employee.empCode} — ` : ""}
                {employee.firstName} {employee.lastName}
              </option>
            ))}
          </select>
          <select
            className="filter-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All statuses</option>
            <option value="in">In</option>
            <option value="completed">Completed</option>
            <option value="missingOut">Missing out</option>
            <option value="noPunch">No punch</option>
          </select>
          <label className="checkbox-wrapper" style={{ margin: 0, whiteSpace: "nowrap" }}>
            <input
              type="checkbox"
              checked={includeNoPunch}
              onChange={(e) => setIncludeNoPunch(e.target.checked)}
            />
            <span>Include no punch</span>
          </label>
        </div>
      </div>

      <div className="table-card">
        <div className="table-wrapper">
          {loading ? (
            <div className="page-loading">
              <div className="loading-spinner"></div>
              <p>Loading attendance...</p>
            </div>
          ) : (
            <table className="customers-table">
              <thead>
                <tr>
                  {visibleColumns.map((column) => (
                    <th
                      key={column.key}
                      className={column.sortKey ? "sortable" : ""}
                      onClick={() => column.sortKey && handleSort(column.sortKey)}
                    >
                      <div className="th-content">{column.label}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedRows.length === 0 ? (
                  <tr>
                    <td colSpan={visibleColumns.length} className="empty-state">
                      <p>No attendance rows for this range</p>
                      <small>Punches appear after employees use Time Clock</small>
                    </td>
                  </tr>
                ) : (
                  sortedRows.map((row) => (
                    <tr
                      key={`${row.workDate}-${row.userUniqueId}`}
                      onClick={() => openLog(row)}
                    >
                      {visibleColumns.map((column) => (
                        <td key={column.key}>{renderCell(row, column.key)}</td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {selectedRow && (
        <div className="slideout-overlay" onClick={() => setSelectedRow(null)}>
          <div className="form-card" onClick={(e) => e.stopPropagation()}>
            <div className="form-header">
              <h2>
                {displayName(selectedRow)} — {selectedRow.workDate}
              </h2>
              <button className="btn-close" type="button" onClick={() => setSelectedRow(null)}>
                ×
              </button>
            </div>
            {logLoading ? (
              <div className="page-loading">
                <div className="loading-spinner"></div>
                <p>Loading punches...</p>
              </div>
            ) : punchLog.length === 0 ? (
              <p style={{ padding: "1.5rem" }}>No punch events for this day.</p>
            ) : (
              <div className="table-wrapper" style={{ padding: "1rem" }}>
                <table className="customers-table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Direction</th>
                      <th>Method</th>
                      <th>Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {punchLog.map((entry) => (
                      <tr key={entry.id}>
                        <td>{formatTime(entry.punchTime)}</td>
                        <td>{entry.direction || "—"}</td>
                        <td>{entry.verificationType || "—"}</td>
                        <td>
                          {entry.isSuccess ? (
                            <span className="badge badge-success">Success</span>
                          ) : (
                            <span className="badge badge-danger">
                              {entry.failureReason || "Failed"}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AttendanceRegister;
