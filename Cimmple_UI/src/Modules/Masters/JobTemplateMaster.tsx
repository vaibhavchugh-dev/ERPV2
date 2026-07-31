import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useHistory } from "react-router-dom";
import { toast } from "react-toastify";
import {
  JobTemplateService,
  JobTemplate,
} from "../../Common/Services/JobTemplateService";
import { CategoryService, CategoryType } from "../../Common/Services/CategoryService";
import { CategoryTagList } from "../../Common/Components/CategoryTagInput";
import { buildCsv, downloadCsv } from "../../Common/Utils/CsvImport";
import JobTemplateMasterSlideout from "./JobTemplateMasterSlideout";
import "./CustomerMaster.scss";
import "./JobTemplateMaster.scss";

type SortDirection = "asc" | "desc";

interface ColumnDefinition {
  key: string;
  label: string;
  sortKey?: string;
  /** Columns the user cannot hide, so a row is never blank. */
  locked?: boolean;
}

const COLUMNS: ColumnDefinition[] = [
  { key: "templateCode", label: "Code", sortKey: "templateCode", locked: true },
  { key: "templateName", label: "Template Name", sortKey: "templateName", locked: true },
  { key: "primaryProcessName", label: "Primary Process" },
  { key: "workstationName", label: "Workstation" },
  { key: "defaultMaterial", label: "Material" },
  { key: "operationCount", label: "Operations" },
  { key: "revision", label: "Revision", sortKey: "revision" },
  { key: "status", label: "Status", sortKey: "status" },
  { key: "categories", label: "Categories" },
  { key: "effectiveFrom", label: "Effective From", sortKey: "effectiveFrom" },
  { key: "lastUpdated", label: "Last Updated", sortKey: "lastUpdated" },
];

const DEFAULT_HIDDEN_COLUMNS = ["defaultMaterial", "operationCount", "effectiveFrom"];
const COLUMN_PREFERENCE_KEY = "jobTemplateMaster.hiddenColumns";

const formatDate = (value?: string | null): string => {
  if (!value) return "";
  const parsed = new Date(value);
  return isNaN(parsed.getTime()) ? "" : parsed.toLocaleDateString();
};

const JobTemplateMasterComponent: React.FC = () => {
  const location = useLocation();
  const history = useHistory();

  const [templates, setTemplates] = useState<JobTemplate[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [categoryTypes, setCategoryTypes] = useState<CategoryType[]>([]);

  const [showSlideout, setShowSlideout] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  const [searchTerm, setSearchTerm] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<number[]>([]);
  const [showFilters, setShowFilters] = useState(false);

  const [sortColumn, setSortColumn] = useState<string>("templateCode");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const [hiddenColumns, setHiddenColumns] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem(COLUMN_PREFERENCE_KEY);
      return stored ? JSON.parse(stored) : DEFAULT_HIDDEN_COLUMNS;
    } catch {
      return DEFAULT_HIDDEN_COLUMNS;
    }
  });
  const [showColumnChooser, setShowColumnChooser] = useState(false);
  const columnChooserRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const openId = params.get("open");
    if (openId) {
      const id = parseInt(openId, 10);
      if (!isNaN(id) && id > 0) {
        setSelectedTemplateId(id);
        setShowSlideout(true);
        history.replace(location.pathname);
      }
    }
  }, [location.search, history, location.pathname]);

  useEffect(() => {
    loadCategoryTypes();
  }, []);

  // Debounce the search box so each keystroke does not hit the API
  useEffect(() => {
    const timer = setTimeout(() => {
      setAppliedSearch(searchTerm);
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    if (!showColumnChooser) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        columnChooserRef.current &&
        !columnChooserRef.current.contains(event.target as Node)
      ) {
        setShowColumnChooser(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showColumnChooser]);

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const result = await JobTemplateService.GetJobTemplates({
        search: appliedSearch,
        status: statusFilter === "all" ? undefined : statusFilter,
        categoryIds: selectedCategoryIds,
        page,
        pageSize,
        sortBy: sortColumn,
        sortDir: sortDirection,
      });

      setTemplates(result.items || []);
      setTotalCount(result.totalCount);
      setTotalPages(result.totalPages);
    } catch (error: any) {
      console.error("[JobTemplateMaster] Error loading job templates:", error);
      toast.error(`Error loading job templates: ${error.message || "Unknown error"}`);
      setTemplates([]);
      setTotalCount(0);
      setTotalPages(0);
    } finally {
      setLoading(false);
    }
  }, [appliedSearch, statusFilter, selectedCategoryIds, page, pageSize, sortColumn, sortDirection]);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  const loadCategoryTypes = async () => {
    try {
      const result = await CategoryService.GetCategoryTypes(true);
      setCategoryTypes(result.filter((t) => t.isActive));
    } catch (error) {
      console.error("[JobTemplateMaster] Error loading category types:", error);
    }
  };

  const handleRowClick = (template: JobTemplate) => {
    setSelectedTemplateId(template.id);
    setShowSlideout(true);
  };

  const handleAddTemplate = () => {
    setSelectedTemplateId(0);
    setShowSlideout(true);
  };

  const handleCloseSlideout = () => {
    setShowSlideout(false);
    loadTemplates();
    loadCategoryTypes();
  };

  const handleSort = (column?: string) => {
    if (!column) return;

    if (sortColumn === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
    setPage(1);
  };

  const getSortIcon = (column?: string) => {
    if (!column) return null;
    if (sortColumn !== column) {
      return <span className="sort-icon inactive">⇅</span>;
    }
    return sortDirection === "asc" ? (
      <span className="sort-icon active">↑</span>
    ) : (
      <span className="sort-icon active">↓</span>
    );
  };

  const toggleCategoryFilter = (categoryValueId: number) => {
    setSelectedCategoryIds((prev) =>
      prev.includes(categoryValueId)
        ? prev.filter((id) => id !== categoryValueId)
        : [...prev, categoryValueId]
    );
    setPage(1);
  };

  const clearFilters = () => {
    setSelectedCategoryIds([]);
    setStatusFilter("all");
    setPage(1);
  };

  const toggleColumn = (key: string) => {
    setHiddenColumns((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
      try {
        localStorage.setItem(COLUMN_PREFERENCE_KEY, JSON.stringify(next));
      } catch {
        // Preference persistence is best-effort
      }
      return next;
    });
  };

  const visibleColumns = useMemo(
    () => COLUMNS.filter((c) => c.locked || !hiddenColumns.includes(c.key)),
    [hiddenColumns]
  );

  const handleExport = async () => {
    setExporting(true);
    try {
      // pageSize 0 asks the API for every row matching the current filter,
      // so the export reflects what the user filtered rather than one page.
      const result = await JobTemplateService.GetJobTemplates({
        search: appliedSearch,
        status: statusFilter === "all" ? undefined : statusFilter,
        categoryIds: selectedCategoryIds,
        page: 1,
        pageSize: 0,
        sortBy: sortColumn,
        sortDir: sortDirection,
      });

      const headers = visibleColumns.map((c) => c.label);
      const rows = (result.items || []).map((template) =>
        visibleColumns.map((column) => renderCellText(template, column.key))
      );

      downloadCsv(
        `job-templates-${new Date().toISOString().substring(0, 10)}.csv`,
        buildCsv(headers, rows)
      );
      toast.success(`Exported ${rows.length} job template(s)`);
    } catch (error: any) {
      console.error("[JobTemplateMaster] Error exporting job templates:", error);
      toast.error(`Error exporting job templates: ${error.message || "Unknown error"}`);
    } finally {
      setExporting(false);
    }
  };

  const renderCellText = (template: JobTemplate, key: string): string => {
    switch (key) {
      case "templateCode":
        return template.templateCode || "";
      case "templateName":
        return template.templateName || "";
      case "primaryProcessName":
        return template.primaryProcessName || "";
      case "workstationName":
        return template.workstationName || "";
      case "defaultMaterial":
        return template.defaultMaterial || "";
      case "operationCount":
        return String(template.operationCount ?? 0);
      case "revision":
        return String(template.revision ?? "");
      case "status":
        return template.statusText || (template.status === 1 ? "Active" : "Inactive");
      case "categories":
        return (template.categories || [])
          .map((c) => `${c.categoryTypeName}: ${c.categoryValueName}`)
          .join("; ");
      case "effectiveFrom":
        return formatDate(template.effectiveFrom);
      case "lastUpdated":
        return formatDate(template.lastUpdated);
      default:
        return "";
    }
  };

  const renderCell = (template: JobTemplate, key: string): React.ReactNode => {
    if (key === "status") {
      return (
        <span
          className={`badge ${template.status === 1 ? "badge-success" : "badge-danger"}`}
        >
          {template.statusText || (template.status === 1 ? "Active" : "Inactive")}
        </span>
      );
    }

    if (key === "categories") {
      return <CategoryTagList tags={template.categories || []} />;
    }

    if (key === "templateName") {
      return <span className="customer-name">{template.templateName || ""}</span>;
    }

    if (key === "revision") {
      return <span className="badge badge-secondary">Rev {template.revision}</span>;
    }

    return renderCellText(template, key);
  };

  const activeFilterCount = selectedCategoryIds.length + (statusFilter !== "all" ? 1 : 0);
  const firstRow = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastRow = Math.min(page * pageSize, totalCount);

  return (
    <div className="customers-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Job Template Master</h1>
          <p className="page-subtitle">
            Standardised, reusable manufacturing templates for job orders and routings
          </p>
        </div>
        <div className="page-actions">
          <button
            className="btn-secondary"
            onClick={handleExport}
            type="button"
            disabled={exporting || totalCount === 0}
          >
            <span>{exporting ? "Exporting..." : "Export"}</span>
          </button>
          <div className="column-chooser" ref={columnChooserRef}>
            <button
              className="btn-secondary"
              onClick={() => setShowColumnChooser(!showColumnChooser)}
              type="button"
            >
              <span>Columns</span>
            </button>
            {showColumnChooser && (
              <div className="column-chooser-menu">
                {COLUMNS.map((column) => (
                  <label className="column-chooser-option" key={column.key}>
                    <input
                      type="checkbox"
                      checked={column.locked || !hiddenColumns.includes(column.key)}
                      disabled={column.locked}
                      onChange={() => toggleColumn(column.key)}
                    />
                    <span>{column.label}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
          <button className="btn-primary" onClick={handleAddTemplate} type="button">
            <span>+</span>
            <span>Add Template</span>
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
            placeholder="Search by code, name or description..."
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
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="filter-select"
          >
            <option value="all">All Templates</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
        <button
          className="btn-secondary filter-toggle"
          type="button"
          onClick={() => setShowFilters(!showFilters)}
        >
          <span>{showFilters ? "Hide Filters" : "Advanced Filters"}</span>
          {selectedCategoryIds.length > 0 && (
            <span className="filter-toggle-count">{selectedCategoryIds.length}</span>
          )}
        </button>
      </div>

      {showFilters && (
        <div className="advanced-filters">
          <div className="advanced-filters-header">
            <div>
              <p className="advanced-filters-title">Filter by category</p>
              <p className="advanced-filters-hint">
                Values within a category are combined with OR, categories with AND.
              </p>
            </div>
            <div className="advanced-filters-actions">
              <button
                type="button"
                className="link-button"
                onClick={clearFilters}
                disabled={activeFilterCount === 0}
              >
                Clear all
              </button>
            </div>
          </div>

          {categoryTypes.length === 0 ? (
            <p className="filter-facet-empty">
              No category types configured yet. Set them up in Category Master.
            </p>
          ) : (
            <div className="filter-facets">
              {categoryTypes.map((type) => (
                <div key={type.id}>
                  <p className="filter-facet-title">{type.name}</p>
                  {type.values.filter((v) => v.isActive).length === 0 ? (
                    <span className="filter-facet-empty">No values yet</span>
                  ) : (
                    <div className="filter-facet-values">
                      {type.values
                        .filter((v) => v.isActive)
                        .map((value) => (
                          <button
                            type="button"
                            key={value.id}
                            className={`filter-chip ${
                              selectedCategoryIds.includes(value.id) ? "is-active" : ""
                            }`}
                            onClick={() => toggleCategoryFilter(value.id)}
                          >
                            {value.name}
                          </button>
                        ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="table-card">
        <div className="table-wrapper">
          <table className="customers-table">
            <thead>
              <tr>
                {visibleColumns.map((column) => (
                  <th
                    key={column.key}
                    className={column.sortKey ? "sortable" : ""}
                    onClick={() => handleSort(column.sortKey)}
                  >
                    <div className="th-content">
                      {column.label}
                      {getSortIcon(column.sortKey)}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={visibleColumns.length} className="empty-state">
                    <p>Loading job templates...</p>
                  </td>
                </tr>
              ) : templates.length === 0 ? (
                <tr>
                  <td colSpan={visibleColumns.length} className="empty-state">
                    <p>No job templates found</p>
                    <small>
                      {activeFilterCount > 0 || appliedSearch
                        ? "Try relaxing your search or filters"
                        : 'Click "Add Template" to create your first one'}
                    </small>
                  </td>
                </tr>
              ) : (
                templates.map((template) => (
                  <tr key={template.id} onClick={() => handleRowClick(template)}>
                    {visibleColumns.map((column) => (
                      <td key={column.key}>{renderCell(template, column.key)}</td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="table-pagination">
          <span className="pagination-summary">
            {totalCount === 0
              ? "No entries"
              : `Showing ${firstRow} to ${lastRow} of ${totalCount} entries`}
          </span>
          <div className="pagination-controls">
            <select
              className="pagination-size"
              value={pageSize}
              onChange={(e) => {
                setPageSize(parseInt(e.target.value, 10));
                setPage(1);
              }}
            >
              <option value={10}>10 / page</option>
              <option value={25}>25 / page</option>
              <option value={50}>50 / page</option>
              <option value={100}>100 / page</option>
            </select>
            <button
              type="button"
              className="pagination-button"
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page <= 1 || loading}
            >
              Previous
            </button>
            <span className="pagination-page">
              Page {totalPages === 0 ? 0 : page} of {totalPages}
            </span>
            <button
              type="button"
              className="pagination-button"
              onClick={() => setPage(page + 1)}
              disabled={page >= totalPages || loading}
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {showSlideout && (
        <JobTemplateMasterSlideout
          jobTemplateId={selectedTemplateId}
          onClose={handleCloseSlideout}
        />
      )}
    </div>
  );
};

export default JobTemplateMasterComponent;
