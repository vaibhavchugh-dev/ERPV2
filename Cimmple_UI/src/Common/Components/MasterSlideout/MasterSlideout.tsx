import React, { useState, useEffect } from "react";
import { toast } from "react-toastify";
import "./MasterSlideout.scss";

// Field types supported
export type FieldType = 'text' | 'email' | 'phone' | 'select' | 'textarea' | 'number' | 'custom';

// Field configuration interface
export interface FormField {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  placeholder?: string;
  options?: { value: string; label: string }[]; // For select fields
  validation?: (value: any) => string | null; // Returns error message or null
  disabled?: boolean | ((formData: any) => boolean); // Can be boolean or function
  icon?: React.ReactNode; // SVG icon for input group
  customRender?: (value: any, onChange: (value: any) => void, formData: any) => React.ReactNode;
  // For conditional rendering
  showWhen?: (formData: any) => boolean;
  // For dependent fields (e.g., state depends on country)
  dependsOn?: string; // Field name this depends on
  getOptions?: (formData: any) => { value: string; label: string }[]; // Dynamic options
}

// Tab configuration
export interface TabConfig {
  id: string;
  label: string;
  fields?: FormField[]; // Standard fields
  customContent?: (formData: any, handleInputChange: (name: string, value: any) => void) => React.ReactNode; // Custom tab content
}

// Props for MasterSlideout
export interface MasterSlideoutProps {
  title: string;
  tabs: TabConfig[];
  initialData: any;
  onSave: (data: any) => Promise<void>;
  onClose: () => void;
  entityId?: number; // For edit mode
  loadData?: (id: number) => Promise<any>; // Optional: load existing data
  validateForm?: (formData: any) => { [key: string]: string }; // Optional: custom validation
  statusField?: {
    name: string;
    value: string;
    onChange: (value: string) => void;
    options?: { value: string; label: string }[];
  }; // Optional: status field to display inline with tabs
}

const MasterSlideout: React.FC<MasterSlideoutProps> = ({
  title,
  tabs,
  initialData,
  onSave,
  onClose,
  entityId = 0,
  loadData,
  validateForm,
  statusField,
}) => {
  const [formData, setFormData] = useState<any>(initialData);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<string>(tabs[0]?.id || '');
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  useEffect(() => {
    if (entityId > 0 && loadData) {
      loadEntityData();
    }
  }, [entityId]);

  const loadEntityData = async () => {
    try {
      setLoading(true);
      const data = await loadData!(entityId);
      setFormData(data);
    } catch (error: any) {
      toast.error(`Error loading data: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (name: string, value: any) => {
    setFormData((prev: any) => {
      const newData = {
        ...prev,
        [name]: value,
      };
      
      // Clear dependent fields when parent changes (e.g., state when country changes)
      if (name === "country" && value !== "US") {
        newData.states = "";
      }
      if (name === "shippingCountry" && value !== "US") {
        newData.shippingStates = "";
      }
      
      return newData;
    });
    
    // Clear error for this field when user types
    if (errors[name]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    // Run validation if provided
    if (validateForm) {
      const validationErrors = validateForm(formData);
      if (Object.keys(validationErrors).length > 0) {
        setErrors(validationErrors);
        toast.error("Please fix validation errors before submitting");
        return;
      }
    }

    // Field-level validation
    const fieldErrors: { [key: string]: string } = {};
    tabs.forEach((tab) => {
      tab.fields?.forEach((field) => {
        if (field.required && !formData[field.name]) {
          fieldErrors[field.name] = `${field.label} is required`;
        } else if (field.validation && formData[field.name]) {
          const error = field.validation(formData[field.name]);
          if (error) {
            fieldErrors[field.name] = error;
          }
        }
      });
    });

    if (Object.keys(fieldErrors).length > 0) {
      setErrors(fieldErrors);
      toast.error("Please fix validation errors before submitting");
      return;
    }

    try {
      setLoading(true);
      await onSave(formData);
      toast.success(`${title} saved successfully`);
      onClose();
    } catch (error: any) {
      toast.error(`Error saving ${title}: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const renderField = (field: FormField) => {
    // Check if field should be shown
    if (field.showWhen && !field.showWhen(formData)) {
      return null;
    }

    // Check if field is disabled
    const isDisabled = typeof field.disabled === 'function' 
      ? field.disabled(formData) 
      : field.disabled || false;

    // Get field value
    const value = formData[field.name] || '';
    const hasError = !!errors[field.name];

    // Custom render
    if (field.customRender) {
      return (
        <div key={field.name} className="form-group">
          <label htmlFor={field.name}>
            {field.label}
            {field.required && <span className="required">*</span>}
          </label>
          {field.customRender(value, (val) => handleInputChange(field.name, val), formData)}
          {hasError && <span className="error-message">{errors[field.name]}</span>}
        </div>
      );
    }

    // Standard field rendering
    const inputGroup = (
      <div className={`input-group ${hasError ? 'has-error' : ''}`}>
        {field.icon && (
          <div className="input-group-prepend">
            <span className="input-group-icon">{field.icon}</span>
          </div>
        )}
        {field.type === 'select' ? (
          // For select fields, check if we have options - if not, render as text input
          (field.getOptions ? field.getOptions(formData) : field.options || []).length > 0 ? (
            <select
              id={field.name}
              name={field.name}
              className={`form-input ${hasError ? 'error' : ''}`}
              value={value}
              onChange={(e) => handleInputChange(field.name, e.target.value)}
              disabled={isDisabled}
            >
              <option value="">Select {field.label}</option>
              {(field.getOptions ? field.getOptions(formData) : field.options || []).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              id={field.name}
              name={field.name}
              className={`form-input ${hasError ? 'error' : ''}`}
              placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}`}
              value={value}
              onChange={(e) => handleInputChange(field.name, e.target.value)}
              disabled={isDisabled}
            />
          )
        ) : field.type === 'textarea' ? (
          <textarea
            id={field.name}
            name={field.name}
            className={`form-input ${hasError ? 'error' : ''}`}
            placeholder={field.placeholder}
            value={value}
            onChange={(e) => handleInputChange(field.name, e.target.value)}
            disabled={isDisabled}
            rows={4}
          />
        ) : (
          <input
            type={field.type === 'number' ? 'number' : field.type === 'email' ? 'email' : 'text'}
            id={field.name}
            name={field.name}
            className={`form-input ${hasError ? 'error' : ''}`}
            placeholder={field.placeholder}
            value={value}
            onChange={(e) => handleInputChange(field.name, e.target.value)}
            disabled={isDisabled}
          />
        )}
      </div>
    );

    return (
      <div key={field.name} className="form-group">
        <label htmlFor={field.name}>
          {field.label}
          {field.required && <span className="required">*</span>}
        </label>
        {inputGroup}
        {hasError && <span className="error-message">{errors[field.name]}</span>}
      </div>
    );
  };

  const renderTabContent = (tab: TabConfig) => {
    if (tab.customContent) {
      return tab.customContent(formData, handleInputChange);
    }

    if (!tab.fields || tab.fields.length === 0) {
      return null;
    }

    // Group fields into rows (every 2-3 fields per row)
    const rows: FormField[][] = [];
    for (let i = 0; i < tab.fields.length; i += 3) {
      rows.push(tab.fields.slice(i, i + 3));
    }

    return (
      <>
        {rows.map((row, rowIndex) => (
          <div key={rowIndex} className="form-row">
            {row.map((field) => renderField(field))}
          </div>
        ))}
      </>
    );
  };

  if (loading && entityId > 0) {
    return (
      <div className="slideout-overlay">
        <div className="form-card">
          <div className="page-loading">
            <div className="loading-spinner"></div>
            <p>Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="slideout-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="form-card" onClick={(e) => e.stopPropagation()}>
        <form className="slideout-form" onSubmit={handleSubmit}>
          {/* Header */}
          <div className="form-header">
            <h2>{title}</h2>
            <button type="button" className="btn-close" onClick={onClose}>
              ×
            </button>
          </div>

          {/* Tabs */}
          {tabs.length > 1 && (
            <div className="form-tabs">
              <div className="form-tabs-left">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    className={`form-tab ${activeTab === tab.id ? 'active' : ''}`}
                    onClick={() => setActiveTab(tab.id)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              {statusField && (
                <div className="form-tabs-right">
                  <div className={`status-field-inline ${statusField.value === 'Active' ? 'status-active-group' : 'status-inactive-group'}`} style={{ maxWidth: '150px' }}>
                    <div className="input-group">
                      <div className="input-group-prepend">
                        <span className="input-group-icon">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
                          </svg>
                        </span>
                      </div>
                      <select
                        id={statusField.name}
                        name={statusField.name}
                        className={`form-input ${statusField.value === 'Active' ? 'status-active' : 'status-inactive'}`}
                        value={statusField.value}
                        onChange={(e) => statusField.onChange(e.target.value)}
                      >
                        {(statusField.options || [
                          { value: "Active", label: "Active" },
                          { value: "Inactive", label: "Inactive" }
                        ]).map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Form Content */}
          <div className="airframe-form">
            {tabs.map((tab) => (
              <div
                key={tab.id}
                className={`tab-content ${activeTab !== tab.id ? 'tab-hidden' : ''}`}
              >
                {renderTabContent(tab)}
              </div>
            ))}

            {/* Form Actions */}
            <div className="form-actions">
              <button type="button" className="btn-cancel" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="btn-submit" disabled={loading}>
                {loading ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default MasterSlideout;

