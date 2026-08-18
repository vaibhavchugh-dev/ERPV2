import React from "react";
import { BankMaster } from "../Services/BankService";
import { getBankDisplayName } from "../Hooks/useCompanyBanks";

interface BankAccountSelectProps {
  banks: BankMaster[];
  value: number;
  onChange: (bankId: number) => void;
  loading?: boolean;
  required?: boolean;
  label?: string;
  disabled?: boolean;
  style?: React.CSSProperties;
}

const selectStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.5rem",
  border: "1px solid #d1d5db",
  borderRadius: "0.25rem",
  fontSize: "0.875rem",
};

/**
 * Company bank account dropdown for AP/AR payment forms.
 */
const BankAccountSelect: React.FC<BankAccountSelectProps> = ({
  banks,
  value,
  onChange,
  loading = false,
  required = true,
  label = "Bank",
  disabled = false,
  style,
}) => {
  return (
    <div>
      <label
        style={{
          display: "block",
          fontSize: "0.75rem",
          fontWeight: "500",
          marginBottom: "0.25rem",
        }}
      >
        {label}
        {required && <span style={{ color: "#ef4444" }}> *</span>}
      </label>
      <select
        required={required}
        disabled={disabled || loading || banks.length === 0}
        value={value || ""}
        onChange={(e) => onChange(parseInt(e.target.value, 10) || 0)}
        style={{ ...selectStyle, ...style }}
      >
        {loading ? (
          <option value="">Loading banks...</option>
        ) : banks.length === 0 ? (
          <option value="">No bank accounts found</option>
        ) : (
          <>
            {!value && <option value="">Select bank account</option>}
            {banks.map((bank) => (
              <option key={bank.id} value={bank.id}>
                {getBankDisplayName(bank)}
                {bank.isprimary ? " (Primary)" : ""}
              </option>
            ))}
          </>
        )}
      </select>
    </div>
  );
};

export default BankAccountSelect;
