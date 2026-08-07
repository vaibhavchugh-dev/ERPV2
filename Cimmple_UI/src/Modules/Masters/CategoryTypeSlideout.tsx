import React, { useState } from "react";
import { toast } from "react-toastify";
import { CategoryService, CategoryTypeReq } from "../../Common/Services/CategoryService";
import { Icons } from "../../Common/Components/MasterSlideout/SharedFieldConfigs";
import "./CustomerMasterSlideout.scss";

interface CategoryTypeSlideoutProps {
  categoryType: CategoryTypeReq;
  onClose: () => void;
  onSaved: (savedId: number) => void;
}

const CategoryTypeSlideout: React.FC<CategoryTypeSlideoutProps> = ({
  categoryType,
  onClose,
  onSaved,
}) => {
  const [formData, setFormData] = useState<CategoryTypeReq>({ ...categoryType });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  const handleInputChange = (field: keyof CategoryTypeReq, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));

    if (errors[field]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!formData.Name || formData.Name.trim() === "") {
      setErrors({ Name: "Category type name is required" });
      toast.error("Please fix the errors in the form");
      return;
    }

    setSaving(true);
    try {
      const result = await CategoryService.SaveCategoryType(formData);
      toast.success(
        formData.Id > 0 ? "Category type updated" : "Category type created"
      );
      onSaved(result?.id ?? formData.Id);
    } catch (error: any) {
      const message = error?.response?.data?.error || error?.message || "Unknown error";
      toast.error(`Error saving category type: ${message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="slideout-overlay" onClick={onClose}>
      <div
        className="form-card"
        style={{ maxWidth: "560px", height: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="form-header">
          <h2>{formData.Id > 0 ? "Edit Category Type" : "Add Category Type"}</h2>
          <button type="button" className="btn-close" onClick={onClose}>
            ×
          </button>
        </div>

        <form className="airframe-form" onSubmit={handleSubmit}>
          <div className="tab-content">
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="Name">
                  Name <span className="required">*</span>
                </label>
                <div className={`input-group ${errors.Name ? "has-error" : ""}`}>
                  <div className="input-group-prepend">
                    <span className="input-group-icon">{Icons.Document}</span>
                  </div>
                  <input
                    type="text"
                    id="Name"
                    className={`form-input ${errors.Name ? "error" : ""}`}
                    placeholder="e.g. Surface Finish"
                    value={formData.Name}
                    onChange={(e) => handleInputChange("Name", e.target.value)}
                    maxLength={100}
                  />
                </div>
                {errors.Name && <span className="error-message">{errors.Name}</span>}
              </div>
              <div className="form-group">
                <label htmlFor="Code">Code</label>
                <div className="input-group">
                  <div className="input-group-prepend">
                    <span className="input-group-icon">{Icons.Document}</span>
                  </div>
                  <input
                    type="text"
                    id="Code"
                    className="form-input"
                    placeholder="e.g. FINISH"
                    value={formData.Code}
                    onChange={(e) => handleInputChange("Code", e.target.value)}
                    maxLength={50}
                  />
                </div>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="Description">Description</label>
              <div className="input-group">
                <div className="input-group-prepend">
                  <span className="input-group-icon">{Icons.Document}</span>
                </div>
                <input
                  type="text"
                  id="Description"
                  className="form-input"
                  placeholder="What this category classifies"
                  value={formData.Description}
                  onChange={(e) => handleInputChange("Description", e.target.value)}
                  maxLength={500}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="DisplayOrder">Display Order</label>
                <div className="input-group">
                  <div className="input-group-prepend">
                    <span className="input-group-icon">{Icons.Document}</span>
                  </div>
                  <input
                    type="number"
                    id="DisplayOrder"
                    className="form-input no-spinner"
                    min={0}
                    value={formData.DisplayOrder || ""}
                    onChange={(e) =>
                      handleInputChange(
                        "DisplayOrder",
                        e.target.value === "" ? 0 : parseInt(e.target.value, 10)
                      )
                    }
                    onWheel={(e) => e.currentTarget.blur()}
                  />
                </div>
              </div>
              <div className="form-group">
                <label
                  htmlFor="IsActive"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    cursor: "pointer",
                    marginTop: "1.75rem",
                  }}
                >
                  <input
                    type="checkbox"
                    id="IsActive"
                    checked={formData.IsActive}
                    onChange={(e) => handleInputChange("IsActive", e.target.checked)}
                    style={{ width: "18px", height: "18px", cursor: "pointer" }}
                  />
                  <span>Active</span>
                </label>
              </div>
            </div>

            <div className="form-group">
              <label
                htmlFor="AllowUserValues"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  id="AllowUserValues"
                  checked={formData.AllowUserValues}
                  onChange={(e) => handleInputChange("AllowUserValues", e.target.checked)}
                  style={{ width: "18px", height: "18px", cursor: "pointer" }}
                />
                <span>Allow users to create new values</span>
              </label>
              <small style={{ color: "#6b7280", display: "block", marginTop: "0.25rem" }}>
                When off, values can only be added here, not from the template form
              </small>
            </div>
          </div>

          <div className="form-actions" style={{ flexShrink: 0 }}>
            <button type="button" className="btn-cancel" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-submit" disabled={saving}>
              {saving ? "Saving..." : formData.Id > 0 ? "Update" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CategoryTypeSlideout;
