import React from "react";
import { PaymentCreditCard } from "../Services/VendorInvoiceService";
import { getCreditCardDisplayName } from "../Hooks/useCompanyCreditCards";

interface CreditCardAccountSelectProps {
  cards: PaymentCreditCard[];
  value: number;
  onChange: (creditCardId: number) => void;
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
 * Company credit card dropdown for vendor payments made by card.
 */
const CreditCardAccountSelect: React.FC<CreditCardAccountSelectProps> = ({
  cards,
  value,
  onChange,
  loading = false,
  required = true,
  label = "Credit Card",
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
        disabled={disabled || loading || cards.length === 0}
        value={value || ""}
        onChange={(e) => onChange(parseInt(e.target.value, 10) || 0)}
        style={{ ...selectStyle, ...style }}
      >
        {loading ? (
          <option value="">Loading cards...</option>
        ) : cards.length === 0 ? (
          <option value="">No active credit cards found</option>
        ) : (
          <>
            {!value && <option value="">Select credit card</option>}
            {cards.map((card) => (
              <option key={card.id} value={card.id}>
                {getCreditCardDisplayName(card)}
                {card.isPrimary ? " (Primary)" : ""}
              </option>
            ))}
          </>
        )}
      </select>
    </div>
  );
};

export default CreditCardAccountSelect;
