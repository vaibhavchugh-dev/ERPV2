import React, { useEffect, useState } from "react";
import { toast } from "react-toastify";
import {
  CategoryService,
  CategoryType,
  CategoryTypeReq,
} from "../../Common/Services/CategoryService";
import CategoryTypeSlideout from "./CategoryTypeSlideout";
import "./CustomerMaster.scss";
import "./CategoryMaster.scss";

const CategoryMasterComponent: React.FC = () => {
  const [categoryTypes, setCategoryTypes] = useState<CategoryType[]>([]);
  const [selectedTypeId, setSelectedTypeId] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [newValueName, setNewValueName] = useState("");
  const [savingValue, setSavingValue] = useState(false);
  const [editingType, setEditingType] = useState<CategoryTypeReq | null>(null);

  useEffect(() => {
    loadCategoryTypes();
  }, []);

  const loadCategoryTypes = async (preferredTypeId?: number) => {
    setLoading(true);
    try {
      const result = await CategoryService.GetCategoryTypes(true, true);
      setCategoryTypes(result);

      const target = preferredTypeId ?? selectedTypeId;
      const stillExists = result.some((t) => t.id === target);
      setSelectedTypeId(stillExists ? target : result.length > 0 ? result[0].id : 0);
    } catch (error: any) {
      console.error("[CategoryMaster] Error loading category types:", error);
      toast.error(`Error loading category types: ${error.message || "Unknown error"}`);
      setCategoryTypes([]);
    } finally {
      setLoading(false);
    }
  };

  const handleLoadDefaults = async () => {
    setSeeding(true);
    try {
      const result = await CategoryService.EnsureDefaultCategoryTypes();
      if (result.typesCreated === 0) {
        toast.info("All default category types already exist");
      } else {
        toast.success(
          `Added ${result.typesCreated} category type(s) and ${result.valuesCreated} value(s)`
        );
      }
      await loadCategoryTypes();
    } catch (error: any) {
      const message = error?.response?.data?.error || error?.message || "Unknown error";
      toast.error(`Error loading defaults: ${message}`);
    } finally {
      setSeeding(false);
    }
  };

  const handleAddType = () => {
    setEditingType({
      Id: 0,
      Tenantid: 0,
      Name: "",
      Code: "",
      Description: "",
      DisplayOrder: 0,
      AllowUserValues: true,
      IsActive: true,
    });
  };

  const handleEditType = (type: CategoryType) => {
    setEditingType({
      Id: type.id,
      Tenantid: 0,
      Name: type.name,
      Code: type.code,
      Description: type.description,
      DisplayOrder: type.displayOrder,
      AllowUserValues: type.allowUserValues,
      IsActive: type.isActive,
    });
  };

  const handleDeleteType = async (type: CategoryType) => {
    if (
      !window.confirm(
        `Delete category type "${type.name}" and its ${type.values.length} value(s)?`
      )
    ) {
      return;
    }

    try {
      await CategoryService.DeleteCategoryType(type.id);
      toast.success("Category type deleted");
      await loadCategoryTypes();
    } catch (error: any) {
      const message = error?.response?.data?.error || error?.message || "Unknown error";
      toast.error(message);
    }
  };

  const handleAddValue = async () => {
    const name = newValueName.trim();
    if (!name || selectedTypeId === 0) return;

    setSavingValue(true);
    try {
      const saved = await CategoryService.SaveCategoryValue({
        Id: 0,
        Tenantid: 0,
        CategoryTypeId: selectedTypeId,
        Name: name,
        Code: "",
        Description: "",
        DisplayOrder: 0,
        IsActive: true,
      });

      if (saved.existed) {
        toast.info(`"${name}" already exists in this category`);
      } else {
        toast.success(`Added "${name}"`);
      }
      setNewValueName("");
      await loadCategoryTypes(selectedTypeId);
    } catch (error: any) {
      const message = error?.response?.data?.error || error?.message || "Unknown error";
      toast.error(message);
    } finally {
      setSavingValue(false);
    }
  };

  const handleRenameValue = async (valueId: number, currentName: string, nextName: string) => {
    const trimmed = nextName.trim();
    if (!trimmed || trimmed === currentName) return;

    try {
      await CategoryService.SaveCategoryValue({
        Id: valueId,
        Tenantid: 0,
        CategoryTypeId: selectedTypeId,
        Name: trimmed,
        Code: "",
        Description: "",
        DisplayOrder: 0,
        IsActive: true,
      });
      toast.success("Category renamed");
      await loadCategoryTypes(selectedTypeId);
    } catch (error: any) {
      const message = error?.response?.data?.error || error?.message || "Unknown error";
      toast.error(message);
      await loadCategoryTypes(selectedTypeId);
    }
  };

  const handleDeleteValue = async (valueId: number, name: string) => {
    if (!window.confirm(`Delete category "${name}"?`)) return;

    try {
      await CategoryService.DeleteCategoryValue(valueId);
      toast.success("Category deleted");
      await loadCategoryTypes(selectedTypeId);
    } catch (error: any) {
      const message = error?.response?.data?.error || error?.message || "Unknown error";
      toast.error(message);
    }
  };

  const selectedType = categoryTypes.find((t) => t.id === selectedTypeId) || null;

  if (loading && categoryTypes.length === 0) {
    return (
      <div className="page-loading">
        <div className="loading-spinner"></div>
        <p>Loading category types...</p>
      </div>
    );
  }

  return (
    <div className="customers-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Category Master</h1>
          <p className="page-subtitle">
            Define the classification axes used to tag and filter job templates
          </p>
        </div>
        <div className="page-actions">
          <button
            className="btn-secondary"
            onClick={handleLoadDefaults}
            type="button"
            disabled={seeding}
          >
            <span>{seeding ? "Loading..." : "Load Default Types"}</span>
          </button>
          <button className="btn-primary" onClick={handleAddType} type="button">
            <span>+</span>
            <span>Add Category Type</span>
          </button>
        </div>
      </div>

      {categoryTypes.length === 0 ? (
        <div className="table-card">
          <div className="category-empty">
            <p>No category types yet</p>
            <small>
              Start with the standard manufacturing set, or add your own from scratch.
            </small>
          </div>
        </div>
      ) : (
        <div className="category-master-layout">
          <div className="category-panel">
            <div className="category-panel-header">
              <p className="category-panel-title">Category Types</p>
              <span className="category-value-usage">{categoryTypes.length}</span>
            </div>
            <div className="category-panel-body">
              {categoryTypes.map((type) => (
                <div
                  key={type.id}
                  className={`category-type-item ${
                    type.id === selectedTypeId ? "is-active" : ""
                  }`}
                  onClick={() => setSelectedTypeId(type.id)}
                >
                  <div className="category-type-body">
                    <span className="category-type-name">{type.name}</span>
                    <span className="category-type-meta">
                      {type.values.length} value{type.values.length === 1 ? "" : "s"}
                      {type.isSystem ? " · system" : ""}
                      {!type.isActive ? " · inactive" : ""}
                      {!type.allowUserValues ? " · locked list" : ""}
                    </span>
                  </div>
                  <div className="category-type-actions">
                    <button
                      type="button"
                      className="category-icon-button"
                      title="Edit category type"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEditType(type);
                      }}
                    >
                      ✎
                    </button>
                    <button
                      type="button"
                      className="category-icon-button is-danger"
                      title={
                        type.isSystem
                          ? "System category types cannot be deleted"
                          : "Delete category type"
                      }
                      disabled={type.isSystem}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteType(type);
                      }}
                    >
                      🗑
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="category-panel">
            <div className="category-panel-header">
              <p className="category-panel-title">
                {selectedType ? `${selectedType.name} values` : "Values"}
              </p>
              <span className="category-value-usage">
                {selectedType ? selectedType.values.length : 0}
              </span>
            </div>

            {selectedType && (
              <div className="category-add-row">
                <input
                  type="text"
                  className="category-add-input"
                  placeholder={`Add a ${selectedType.name.toLowerCase()} value...`}
                  value={newValueName}
                  onChange={(e) => setNewValueName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddValue();
                    }
                  }}
                />
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleAddValue}
                  disabled={savingValue || newValueName.trim() === ""}
                >
                  <span>Add</span>
                </button>
              </div>
            )}

            <div className="category-panel-body">
              {!selectedType || selectedType.values.length === 0 ? (
                <div className="category-empty">
                  <p>No values yet</p>
                  <small>Add the values users will be able to tag templates with</small>
                </div>
              ) : (
                selectedType.values.map((value) => (
                  <div className="category-value-row" key={value.id}>
                    <input
                      type="text"
                      className="category-value-input"
                      defaultValue={value.name}
                      onBlur={(e) => handleRenameValue(value.id, value.name, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.currentTarget.blur();
                        }
                      }}
                    />
                    <span className="category-value-usage">
                      {value.usageCount ? `${value.usageCount} in use` : "unused"}
                    </span>
                    <button
                      type="button"
                      className="category-icon-button is-danger"
                      title={
                        value.usageCount
                          ? "In use by one or more templates"
                          : "Delete category value"
                      }
                      disabled={!!value.usageCount}
                      onClick={() => handleDeleteValue(value.id, value.name)}
                    >
                      🗑
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {editingType && (
        <CategoryTypeSlideout
          categoryType={editingType}
          onClose={() => setEditingType(null)}
          onSaved={(savedId) => {
            setEditingType(null);
            loadCategoryTypes(savedId);
          }}
        />
      )}
    </div>
  );
};

export default CategoryMasterComponent;
