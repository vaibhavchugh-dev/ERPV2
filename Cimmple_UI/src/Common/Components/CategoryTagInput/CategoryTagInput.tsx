import React, { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-toastify";
import {
  CategoryService,
  CategoryType,
  CategoryValue,
} from "../../Services/CategoryService";
import "./CategoryTagInput.scss";

export interface CategoryTagInputProps {
  /** Category types with their values, loaded once by the parent. */
  categoryTypes: CategoryType[];
  /** Ids of the currently selected category values, across all types. */
  selectedValueIds: number[];
  onChange: (selectedValueIds: number[]) => void;
  /** Called after a value is created so the parent can refresh its type list. */
  onValueCreated?: (created: CategoryValue) => void;
  /** Set false to hide the "create new" affordance regardless of type settings. */
  allowCreate?: boolean;
  disabled?: boolean;
  emptyMessage?: string;
}

interface PickerState {
  categoryTypeId: number;
  search: string;
}

const CategoryTagInput: React.FC<CategoryTagInputProps> = ({
  categoryTypes,
  selectedValueIds,
  onChange,
  onValueCreated,
  allowCreate = true,
  disabled = false,
  emptyMessage = "No category types configured yet.",
}) => {
  const [picker, setPicker] = useState<PickerState | null>(null);
  const [creating, setCreating] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!picker) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setPicker(null);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [picker]);

  useEffect(() => {
    if (picker) {
      searchRef.current?.focus();
    }
  }, [picker?.categoryTypeId]);

  const selectedSet = useMemo(() => new Set(selectedValueIds), [selectedValueIds]);

  const toggleValue = (valueId: number) => {
    if (selectedSet.has(valueId)) {
      onChange(selectedValueIds.filter((id) => id !== valueId));
    } else {
      onChange([...selectedValueIds, valueId]);
    }
  };

  const handleCreate = async (type: CategoryType, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;

    setCreating(true);
    try {
      const saved = await CategoryService.SaveCategoryValue({
        Id: 0,
        Tenantid: 0,
        CategoryTypeId: type.id,
        Name: trimmed,
        Code: "",
        Description: "",
        DisplayOrder: 0,
        IsActive: true,
      });

      if (saved.id > 0) {
        if (onValueCreated) {
          onValueCreated({
            id: saved.id,
            categoryTypeId: type.id,
            categoryTypeName: type.name,
            code: "",
            name: trimmed,
            description: "",
            displayOrder: 0,
            isSystem: false,
            isActive: true,
          });
        }

        if (!selectedSet.has(saved.id)) {
          onChange([...selectedValueIds, saved.id]);
        }

        setPicker({ categoryTypeId: type.id, search: "" });
      }
    } catch (error: any) {
      const message = error?.response?.data?.error || error?.message || "Unknown error";
      toast.error(`Could not create category: ${message}`);
    } finally {
      setCreating(false);
    }
  };

  if (categoryTypes.length === 0) {
    return <p className="category-tag-empty">{emptyMessage}</p>;
  }

  return (
    <div className="category-tag-groups" ref={containerRef}>
      {categoryTypes.map((type) => {
        const activeValues = type.values.filter((v) => v.isActive || selectedSet.has(v.id));
        const selectedValues = activeValues.filter((v) => selectedSet.has(v.id));
        const isOpen = picker?.categoryTypeId === type.id;
        const search = isOpen ? picker!.search : "";
        const term = search.trim().toLowerCase();

        const options = term
          ? activeValues.filter((v) => v.name.toLowerCase().includes(term))
          : activeValues;

        const canCreate =
          allowCreate &&
          type.allowUserValues &&
          term.length > 0 &&
          !activeValues.some((v) => v.name.toLowerCase() === term);

        return (
          <div className="category-tag-group" key={type.id}>
            <div className="category-tag-group-header">
              <p className="category-tag-group-title">{type.name}</p>
              {selectedValues.length > 0 && (
                <span className="category-tag-group-count">
                  {selectedValues.length} selected
                </span>
              )}
            </div>

            <div className="category-tag-row">
              {selectedValues.map((value) => (
                <span className="category-tag" key={value.id} title={value.name}>
                  <span>{value.name}</span>
                  {!disabled && (
                    <button
                      type="button"
                      className="category-tag-remove"
                      onClick={() => toggleValue(value.id)}
                      aria-label={`Remove ${value.name}`}
                    >
                      ×
                    </button>
                  )}
                </span>
              ))}

              <div className="category-tag-picker">
                <button
                  type="button"
                  className="category-tag-add"
                  disabled={disabled}
                  onClick={() =>
                    setPicker(isOpen ? null : { categoryTypeId: type.id, search: "" })
                  }
                >
                  + Add
                </button>

                {isOpen && (
                  <div className="category-tag-dropdown">
                    <input
                      ref={searchRef}
                      type="text"
                      className="category-tag-search"
                      placeholder={`Search ${type.name.toLowerCase()}...`}
                      value={search}
                      onChange={(e) =>
                        setPicker({ categoryTypeId: type.id, search: e.target.value })
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Escape") {
                          setPicker(null);
                        } else if (e.key === "Enter") {
                          e.preventDefault();
                          if (canCreate && !creating) {
                            handleCreate(type, search);
                          } else if (options.length === 1) {
                            toggleValue(options[0].id);
                          }
                        }
                      }}
                    />

                    <div className="category-tag-options">
                      {options.map((value) => {
                        const isSelected = selectedSet.has(value.id);
                        return (
                          <button
                            type="button"
                            key={value.id}
                            className={`category-tag-option ${isSelected ? "is-selected" : ""}`}
                            onClick={() => toggleValue(value.id)}
                          >
                            <span>{value.name}</span>
                            {isSelected && <span className="category-tag-option-check">✓</span>}
                          </button>
                        );
                      })}

                      {canCreate && (
                        <button
                          type="button"
                          className="category-tag-option is-create"
                          disabled={creating}
                          onClick={() => handleCreate(type, search)}
                        >
                          <span>
                            {creating ? "Creating..." : `+ Create "${search.trim()}"`}
                          </span>
                        </button>
                      )}

                      {options.length === 0 && !canCreate && (
                        <div className="category-tag-no-options">
                          {type.allowUserValues
                            ? "Type to search or create a value"
                            : "No matching values"}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export interface CategoryTagListProps {
  tags: { categoryValueId: number; categoryValueName: string; categoryTypeName: string }[];
  /** Chips beyond this count collapse into a "+N" chip. */
  maxVisible?: number;
}

/** Read-only chip rendering, used for the Categories column on listing pages. */
export const CategoryTagList: React.FC<CategoryTagListProps> = ({ tags, maxVisible = 4 }) => {
  if (!tags || tags.length === 0) {
    return <span className="category-tag-empty">—</span>;
  }

  const visible = tags.slice(0, maxVisible);
  const hidden = tags.length - visible.length;

  return (
    <div className="category-tag-list">
      {visible.map((tag) => (
        <span
          className="category-tag-chip"
          key={tag.categoryValueId}
          title={`${tag.categoryTypeName}: ${tag.categoryValueName}`}
        >
          {tag.categoryValueName}
        </span>
      ))}
      {hidden > 0 && (
        <span
          className="category-tag-chip category-tag-chip-more"
          title={tags
            .slice(maxVisible)
            .map((t) => `${t.categoryTypeName}: ${t.categoryValueName}`)
            .join("\n")}
        >
          +{hidden}
        </span>
      )}
    </div>
  );
};

export default CategoryTagInput;
