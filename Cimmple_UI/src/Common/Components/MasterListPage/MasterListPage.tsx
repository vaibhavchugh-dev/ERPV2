import React, { useState, useEffect } from "react";
import { toast } from "react-toastify";
import { useSettingsSafe } from "../../Contexts/SettingsContext";
import "./MasterListPage.scss";

// Column configuration
export interface ColumnConfig<T = any> {
  key: keyof T | string;
  label: string;
  sortable?: boolean;
  render?: (value: any, row: T) => React.ReactNode;
  width?: string;
  align?: 'left' | 'center' | 'right';
}

// Filter option
export interface FilterOption {
  value: string;
  label: string;
}

// Custom action button
export interface CustomActionButton {
  label: string;
  onClick: () => void;
  className?: string;
  disabled?: boolean;
}

  // Props for MasterListPage
export interface MasterListPageProps<T = any> {
  title: string;
  subtitle?: string;
  addButtonLabel?: string;
  columns: ColumnConfig<T>[];
  data: T[];
  loading?: boolean;
  onAdd?: () => void;
  onRowClick?: (row: T) => void;
  onLoadData?: () => Promise<void>;
  searchPlaceholder?: string;
  searchFields?: (keyof T | string)[]; // Fields to search in
  filters?: {
    label: string;
    options: FilterOption[];
    value: string;
    onChange: (value: string) => void;
  }[];
  emptyMessage?: string;
  getRowId?: (row: T) => number | string; // Function to get unique ID for row
  customActionButtons?: CustomActionButton[]; // Custom action buttons
  enablePagination?: boolean; // Enable pagination (default: false for backward compatibility)
  pageSize?: number; // Override default page size from settings
}

const MasterListPage = <T extends Record<string, any>>({
  title,
  subtitle,
  addButtonLabel = "Add New",
  columns,
  data,
  loading = false,
  onAdd,
  onRowClick,
  onLoadData,
  searchPlaceholder = "Search...",
  searchFields = [],
  filters = [],
  emptyMessage = "No data available",
  getRowId,
  customActionButtons = [],
  enablePagination = false,
  pageSize,
}: MasterListPageProps<T>) => {
  const settings = useSettingsSafe();
  const [searchTerm, setSearchTerm] = useState("");
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [currentPage, setCurrentPage] = useState(1);
  
  // Determine page size: prop override > settings > default (10)
  const effectivePageSize = pageSize || (enablePagination ? settings?.defaultPageSize || 10 : data.length);

  useEffect(() => {
    if (onLoadData) {
      onLoadData();
    }
  }, []);

  const handleSort = (columnKey: string) => {
    if (sortColumn === columnKey) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(columnKey);
      setSortDirection("asc");
    }
  };

  const filteredData = data.filter((row) => {
    if (!searchTerm) return true;
    
    const searchLower = searchTerm.toLowerCase();
    
    // If searchFields specified, only search those
    if (searchFields.length > 0) {
      return searchFields.some((field) => {
        const value = row[field as keyof T];
        return value?.toString().toLowerCase().includes(searchLower);
      });
    }
    
    // Otherwise search all columns
    return columns.some((col) => {
      const value = row[col.key as keyof T];
      return value?.toString().toLowerCase().includes(searchLower);
    });
  });

  const sortedData = [...filteredData].sort((a, b) => {
    if (!sortColumn) return 0;

    let aValue: any = a[sortColumn as keyof T];
    let bValue: any = b[sortColumn as keyof T];

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

  // Pagination logic
  const totalPages = enablePagination ? Math.ceil(sortedData.length / effectivePageSize) : 1;
  const startIndex = enablePagination ? (currentPage - 1) * effectivePageSize : 0;
  const endIndex = enablePagination ? startIndex + effectivePageSize : sortedData.length;
  const paginatedData = sortedData.slice(startIndex, endIndex);

  // Reset to page 1 when search/filter changes
  useEffect(() => {
    if (enablePagination) {
      setCurrentPage(1);
    }
  }, [searchTerm, filters, enablePagination]);

  const getSortIcon = (columnKey: string) => {
    if (sortColumn !== columnKey) {
      return <span className="sort-icon inactive">⇅</span>;
    }
    return sortDirection === "asc" ? (
      <span className="sort-icon active">↑</span>
    ) : (
      <span className="sort-icon active">↓</span>
    );
  };

  const getValue = (row: T, column: ColumnConfig<T>) => {
    const value = row[column.key as keyof T];
    if (column.render) {
      return column.render(value, row);
    }
    return value ?? "";
  };

  if (loading) {
    return (
      <div className="page-loading">
        <div className="loading-spinner"></div>
        <p>Loading {title.toLowerCase()}...</p>
      </div>
    );
  }

  return (
    <div className="master-list-page">
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">{title}</h1>
          {subtitle && <p className="page-subtitle">{subtitle}</p>}
        </div>
        {(onAdd || customActionButtons.length > 0) && (
          <div className="page-actions">
            {customActionButtons.map((button, index) => (
              <button
                key={index}
                className={button.className || "btn-secondary"}
                onClick={button.onClick}
                disabled={button.disabled}
              >
                {button.label}
              </button>
            ))}
            {onAdd && (
              <button className="btn-primary" onClick={onAdd}>
                <span>+</span>
                <span>{addButtonLabel}</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Filters and Search */}
      <div className="page-filters">
        <div className="search-wrapper">
          <svg
            className="search-icon"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="8"></circle>
            <path d="m21 21-4.35-4.35"></path>
          </svg>
          <input
            type="text"
            className="search-input"
            placeholder={searchPlaceholder}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {filters.map((filter, index) => (
          <div key={index} className="filter-group">
            <select
              value={filter.value}
              onChange={(e) => filter.onChange(e.target.value)}
              className="filter-select"
            >
              {filter.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="table-card">
        <div className="table-wrapper">
          <table className="master-table">
            <thead>
              <tr>
                {columns.map((column) => {
                  const align = column.align || "left";
                  return (
                    <th
                      key={String(column.key)}
                      className={column.sortable ? "sortable" : ""}
                      style={{
                        width: column.width,
                        textAlign: align,
                      }}
                      onClick={() => column.sortable && handleSort(String(column.key))}
                    >
                      <div className={`th-content th-content-${align}`}>
                        <span>{column.label}</span>
                        {column.sortable && getSortIcon(String(column.key))}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {paginatedData.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="empty-state">
                    {emptyMessage}
                  </td>
                </tr>
              ) : (
                paginatedData.map((row, index) => {
                  const rowId = getRowId ? getRowId(row) : index;
                  return (
                    <tr
                      key={rowId}
                      onClick={() => onRowClick && onRowClick(row)}
                      className={onRowClick ? "clickable" : ""}
                    >
                      {columns.map((column) => (
                        <td
                          key={String(column.key)}
                          style={{ textAlign: column.align || "left" }}
                        >
                          {getValue(row, column)}
                        </td>
                      ))}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination Controls */}
      {enablePagination && totalPages > 1 && (
        <div className="pagination-controls">
          <div className="pagination-info">
            Showing {startIndex + 1} to {Math.min(endIndex, sortedData.length)} of {sortedData.length} entries
          </div>
          <div className="pagination-buttons">
            <button
              className="pagination-btn"
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
            >
              Previous
            </button>
            <span className="pagination-page-info">
              Page {currentPage} of {totalPages}
            </span>
            <button
              className="pagination-btn"
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default MasterListPage;






