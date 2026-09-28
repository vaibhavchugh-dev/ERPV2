import React, { useState } from "react";
import "./PasswordInput.scss";

type PasswordInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> & {
  /** Use Bootstrap Form.Control styling via className; wrap still applies. */
  inputRef?: React.Ref<HTMLInputElement>;
};

/**
 * Password field with show/hide eye toggle. Works with form-input and Bootstrap form-control.
 */
const PasswordInput: React.FC<PasswordInputProps> = ({
  className,
  inputRef,
  disabled,
  ...rest
}) => {
  const [show, setShow] = useState(false);

  return (
    <div className="password-input-wrap">
      <input
        {...rest}
        ref={inputRef}
        type={show ? "text" : "password"}
        className={className}
        disabled={disabled}
      />
      <button
        type="button"
        className="password-toggle"
        aria-label={show ? "Hide password" : "Show password"}
        tabIndex={-1}
        disabled={disabled}
        onClick={() => setShow((v) => !v)}
      >
        {show ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
            <line x1="1" y1="1" x2="23" y2="23" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </div>
  );
};

export default PasswordInput;
