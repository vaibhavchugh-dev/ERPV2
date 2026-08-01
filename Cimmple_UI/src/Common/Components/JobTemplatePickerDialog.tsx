import React, { useCallback, useEffect, useState } from "react";
import { toast } from "react-toastify";
import { JobTemplateService, JobTemplate } from "../Services/JobTemplateService";
import { CategoryService, CategoryType } from "../Services/CategoryService";
import { CategoryTagList } from "./CategoryTagInput";
import "./JobTemplatePickerDialog.scss";

interface JobTemplatePickerDialogProps {
  isOpen: boolean;
  /** Highlighted when the dialog opens, so reopening shows the current choice. */
  selectedTemplate?: JobTemplate | null;
  onSelect: (template: JobTemplate) => void;
  onCancel: () => void;
}

const PAGE_SIZE = 10;

const JobTemplatePickerDialog: React.FC<JobTemplatePickerDialogProps> = ({
  isOpen,
  selectedTemplate = null,
  onSelect,
  onCancel,
}) => {
  const [templates, setTemplates] = useState<JobTemplate[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(false);

  const [searchTerm, setSearchTerm] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<number[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [categoryTypes, setCategoryTypes] = useState<CategoryType[]>([]);
  const [page, setPage] = useState(1);

  const [highlighted, setHighlighted] = useState<JobTemplate | null>(selectedTemplate);

  useEffect(() => {
    if (isOpen) {
      setHighlighted(selectedTemplate);
    }
  }, [isOpen, selectedTemplate]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCancel();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onCancel]);

  // Category facets are only needed once the filter panel is opened.
  useEffect(() => {
    if (!showFilters || categoryTypes.length > 0) return;

    const loadCategoryTypes = async () => {
      try {
        const result = await CategoryService.GetCategoryTypes(true);
        setCategoryTypes(result.filter((t) => t.isActive));
      } catch (error) {
        console.error("[JobTemplatePicker] Error loading category types:", error);
      }
    };

    loadCategoryTypes();
  }, [showFilters, categoryTypes.length]);

  // Debounce the search box so each keystroke does not hit the API
  useEffect(() => {
    const timer = setTimeout(() => {
      setAppliedSearch((current) => {
        if (current === searchTerm) {
          return current;
        }
        setPage(1);
        return searchTerm;
      });
    }, 350);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const result = await JobTemplateService.GetJobTemplates({
        search: appliedSearch,
        status: statusFilter === "all" ? undefined : statusFilter,
        categoryIds: selectedCategoryIds,
        page,
        pageSize: PAGE_SIZE,
        sortBy: "templateCode",
        sortDir: "asc",
      });

      setTemplates(result.items || []);
      setTotalCount(result.totalCount);
      setTotalPages(result.totalPages);
    } catch (error: any) {
      console.error("[JobTemplatePicker] Error loading job templates:", error);
      toast.error(`Error loading job templates: ${error.message || "Unknown error"}`);
      setTemplates([]);
      setTotalCount(0);
      setTotalPages(0);
    } finally {
      setLoading(false);
    }
  }, [appliedSearch, statusFilter, selectedCategoryIds, page]);

  useEffect(() => {
    if (!isOpen) return;
    loadTemplates();
  }, [isOpen, loadTemplates]);

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
    setStatusFilter("active");
    setSearchTerm("");
    setPage(1);
  };

  const confirmSelection = (template?: JobTemplate) => {
    const chosen = template || highlighted;
    if (!chosen) {
      toast.error("Please select a job template");
      return;
    }
    onSelect(chosen);
  };

  if (!isOpen) return null;

  const activeFilterCount =
    selectedCategoryIds.length + (statusFilter !== "active" ? 1 : 0) + (appliedSearch ? 1 : 0);
  const firstRow = totalCount === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const lastRow = Math.min(page * PAGE_SIZE, totalCount);

  return (
    <div className="jt-picker-overlay" onClick={onCancel}>
      <div className="jt-picker-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="jt-picker-header">
          <div>
            <h2>Select a Job Template</h2>
            <p>Browse, search and filter templates to find the right router for this job.</p>
          </div>
          <button type="button" className="jt-picker-close" onClick={onCancel} title="Close">
            ×
          </button>
        </div>

        <div className="jt-picker-filters">
          <input
            type="text"
            className="jt-picker-search"
            placeholder="Search by code, name or description..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            autoFocus
          />
          <select
            className="jt-picker-select"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="active">Active only</option>
            <option value="all">All templates</option>
            <option value="inactive">Inactive only</option>
          </select>
          <button
            type="button"
            className="jt-picker-btn-secondary"
            onClick={() => setShowFilters(!showFilters)}
          >
            {showFilters ? "Hide Categories" : "Filter by Category"}
            {selectedCategoryIds.length > 0 && (
              <span className="jt-picker-filter-count">{selectedCategoryIds.length}</span>
            )}
          </button>
        </div>

        {showFilters && (
          <div className="jt-picker-facets">
            <div className="jt-picker-facets-header">
              <span className="jt-picker-facets-hint">
                Values within a category are combined with OR, categories with AND.
              </span>
              <button
                type="button"
                className="jt-picker-link"
                onClick={clearFilters}
                disabled={activeFilterCount === 0}
              >
                Clear all
              </button>
            </div>

            {categoryTypes.length === 0 ? (
              <p className="jt-picker-facet-empty">
                No category types configured yet. Set them up in Category Master.
              </p>
            ) : (
              <div className="jt-picker-facet-grid">
                {categoryTypes.map((type) => {
                  const values = type.values.filter((v) => v.isActive);
                  return (
                    <div key={type.id}>
                      <p className="jt-picker-facet-title">{type.name}</p>
                      {values.length === 0 ? (
                        <span className="jt-picker-facet-empty">No values yet</span>
                      ) : (
                        <div className="jt-picker-facet-values">
                          {values.map((value) => (
                            <button
                              type="button"
                              key={value.id}
                              className={`jt-picker-chip ${
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
                  );
                })}
              </div>
            )}
          </div>
        )}

        <div className="jt-picker-table-wrapper">
          <table className="jt-picker-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Template Name</th>
                <th>Primary Process</th>
                <th>Workstation</th>
                <th>Steps</th>
                <th>Rev</th>
                <th>Categories</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="jt-picker-empty">
                    Loading job templates...
                  </td>
                </tr>
              ) : templates.length === 0 ? (
                <tr>
                  <td colSpan={7} className="jt-picker-empty">
                    <p>No job templates found</p>
                    <small>
                      {activeFilterCount > 0
                        ? "Try relaxing your search or filters"
                        : "Create one in Job Template Master first"}
                    </small>
                  </td>
                </tr>
              ) : (
                templates.map((template) => (
                  <tr
                    key={template.id}
                    className={highlighted?.id === template.id ? "is-selected" : ""}
                    onClick={() => setHighlighted(template)}
                    onDoubleClick={() => confirmSelection(template)}
                  >
                    <td className="jt-picker-code">{template.templateCode}</td>
                    <td>{template.templateName}</td>
                    <td>{template.primaryProcessName || "—"}</td>
                    <td>{template.workstationName || "—"}</td>
                    <td>{template.operationCount ?? 0}</td>
                    <td>{template.revision}</td>
                    <td>
                      <CategoryTagList tags={template.categories || []} maxVisible={3} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="jt-picker-footer">
          <span className="jt-picker-summary">
            {totalCount === 0
              ? "No templates"
              : `Showing ${firstRow} to ${lastRow} of ${totalCount}`}
          </span>
          <div className="jt-picker-pagination">
            <button
              type="button"
              className="jt-picker-btn-secondary"
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page <= 1 || loading}
            >
              Previous
            </button>
            <span className="jt-picker-page">
              Page {totalPages === 0 ? 0 : page} of {totalPages}
            </span>
            <button
              type="button"
              className="jt-picker-btn-secondary"
              onClick={() => setPage(page + 1)}
              disabled={page >= totalPages || loading}
            >
              Next
            </button>
          </div>
          <div className="jt-picker-actions">
            <button type="button" className="jt-picker-btn-secondary" onClick={onCancel}>
              Cancel
            </button>
            <button
              type="button"
              className="jt-picker-btn-primary"
              onClick={() => confirmSelection()}
              disabled={!highlighted}
            >
              Use This Template
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default JobTemplatePickerDialog;
