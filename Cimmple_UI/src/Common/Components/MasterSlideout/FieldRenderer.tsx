import React from "react";
import { FormField } from "./MasterSlideout";
import { US_STATES, COUNTRIES } from "./SharedFieldConfigs";

interface FieldRendererProps {
  field: FormField;
  value: any;
  onChange: (value: any) => void;
  formData: any;
  error?: string;
  disabled?: boolean;
}

export const FieldRenderer: React.FC<FieldRendererProps> = ({
  field,
  value,
  onChange,
  formData,
  error,
  disabled,
}) => {
  // Check if field should be shown
  if (field.showWhen && !field.showWhen(formData)) {
    return null;
  }

  // Check if field is disabled
  const isDisabled = disabled || (typeof field.disabled === 'function' 
    ? field.disabled(formData) 
    : field.disabled || false);

  const hasError = !!error;

  // Custom render
  if (field.customRender) {
    return (
      <div className="form-group">
        <label htmlFor={field.name}>
          {field.label}
          {field.required && <span className="required">*</span>}
        </label>
        {field.customRender(value, onChange, formData)}
        {hasError && <span className="error-message">{error}</span>}
      </div>
    );
  }

  // Standard field rendering
  const inputGroup = (
    <div className={`input-group ${hasError ? 'has-error' : ''} ${isDisabled ? 'disabled' : ''}`}>
      {field.icon && (
        <div className="input-group-prepend">
          <span className="input-group-icon">{field.icon}</span>
        </div>
      )}
      {field.type === 'select' ? (
        // For select fields, check if we have options
        (field.getOptions ? field.getOptions(formData) : field.options || []).length > 0 ? (
          <select
            id={field.name}
            name={field.name}
            className={`form-input ${hasError ? 'error' : ''}`}
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
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
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            disabled={isDisabled}
          />
        )
      ) : field.type === 'textarea' ? (
        <textarea
          id={field.name}
          name={field.name}
          className={`form-input ${hasError ? 'error' : ''}`}
          placeholder={field.placeholder}
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          disabled={isDisabled}
          rows={4}
        />
      ) : (
        <input
          type={field.type === 'number' ? 'number' : field.type === 'email' ? 'email' : field.type === 'phone' ? 'tel' : 'text'}
          id={field.name}
          name={field.name}
          className={`form-input ${hasError ? 'error' : ''}`}
          placeholder={field.placeholder}
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          disabled={isDisabled}
        />
      )}
    </div>
  );

  return (
    <div className="form-group">
      <label htmlFor={field.name}>
        {field.label}
        {field.required && <span className="required">*</span>}
      </label>
      {inputGroup}
      {hasError && <span className="error-message">{error}</span>}
    </div>
  );
};






