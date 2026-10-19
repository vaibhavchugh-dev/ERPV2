import React, { useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import {
  AccountingService,
  CreateBankCashEntryRequest,
} from "../../Common/Services/AccountingService";
import { ChartofAccountsService } from "../../Common/Services/ChartofAccountsService";
import BankAccountSelect from "../../Common/Components/BankAccountSelect";
import {
  useCompanyBanks,
  bankHasGlAccount,
} from "../../Common/Hooks/useCompanyBanks";
import { useActiveLocation } from "../../Common/Hooks/useActiveLocation";
import { useFormatting } from "../../Common/Hooks/useFormatting";
import { todayIsoInTenantTimezone } from "../../Common/Utils/Formatting";
import { confirmDiscardChanges, onBackdropClick } from "../../Common/Utils/dismissGuard";
import "../../Common/Components/MasterSlideout/MasterSlideout.scss";
import "./BankCashEntrySlideout.scss";

interface CoaOption {
  accountID: number;
  accountCode: string;
  accountName: string;
  accountType: string;
}

interface BankCashEntrySlideoutProps {
  initialType?: "Deposit" | "Withdrawal";
  onClose: (refreshList?: boolean) => void;
}

const BankCashEntrySlideout: React.FC<BankCashEntrySlideoutProps> = ({
  initialType = "Deposit",
  onClose,
}) => {
  const { formatCurrency } = useFormatting();
  const { locationId: activeLocationId } = useActiveLocation();
  const { banks, bankId, setBankId, loading: banksLoading } = useCompanyBanks();

  const [entryType, setEntryType] = useState<"Deposit" | "Withdrawal">(initialType);
  const [entryDate, setEntryDate] = useState(() => todayIsoInTenantTimezone());
  const [amount, setAmount] = useState("");
  const [offsetAccountId, setOffsetAccountId] = useState(0);
  const [description, setDescription] = useState("");
  const [reference, setReference] = useState("");
  const [coaAccounts, setCoaAccounts] = useState<CoaOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(true);
  const [isDirty, setIsDirty] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const markDirty = () => setIsDirty(true);

  const handleDismiss = () => {
    if (loading) return;
    if (confirmDiscardChanges(isDirty)) onClose(false);
  };

  useEffect(() => {
    const load = async () => {
      setBootstrapping(true);
      try {
        const storage = JSON.parse(localStorage.getItem("storage") || "{}");
        const tenantID = storage?.tenantID || 0;
        const accounts = await ChartofAccountsService.GetChartofAccounts({
          tenantid: tenantID,
        });
        setCoaAccounts(
          (accounts || [])
            .filter((a) => a.isActive !== false)
            .map((a) => ({
              accountID: a.accountID,
              accountCode: a.accountCode || "",
              accountName: a.accountName || "",
              accountType: a.accountType || "",
            }))
        );
      } catch (error) {
        console.error(error);
        toast.error("Failed to load chart of accounts");
      } finally {
        setBootstrapping(false);
      }
    };
    void load();
  }, []);

  const preferredOffsetAccounts = useMemo(() => {
    const prefer =
      entryType === "Deposit"
        ? ["revenue", "other income", "income", "liability"]
        : ["expense", "cost of", "cogs", "asset", "overhead"];
    const matched = coaAccounts.filter((a) => {
      const t = (a.accountType || "").toLowerCase();
      return prefer.some((p) => t.includes(p));
    });
    return matched.length > 0 ? matched : coaAccounts;
  }, [coaAccounts, entryType]);

  const parsedAmount = useMemo(() => {
    const n = parseFloat(amount);
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
  }, [amount]);

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    const selectedBank = banks.find((b) => b.id === bankId);
    if (!bankId || !selectedBank || !bankHasGlAccount(selectedBank)) {
      next.bankId = "Select a bank with a GL account";
    }
    if (offsetAccountId <= 0) next.offsetAccountId = "Offset account is required";
    if (parsedAmount <= 0) next.amount = "Amount must be greater than zero";
    if (!entryDate) next.entryDate = "Date is required";
    if (!description.trim()) next.description = "Description is required";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) {
      toast.error("Please fix the highlighted fields");
      return;
    }

    const body: CreateBankCashEntryRequest = {
      entryType,
      bankId,
      offsetAccountId,
      amount: parsedAmount,
      entryDate,
      description: description.trim(),
      reference: reference.trim() || undefined,
      locationId: activeLocationId > 0 ? activeLocationId : undefined,
    };

    setLoading(true);
    try {
      const result = await AccountingService.CreateBankCashEntry(body);
      if (result) {
        toast.success(result.message || `${entryType} recorded`);
        onClose(true);
      } else {
        toast.error(`Failed to record ${entryType.toLowerCase()}`);
      }
    } catch (error: any) {
      toast.error(error.message || `Failed to record ${entryType.toLowerCase()}`);
    } finally {
      setLoading(false);
    }
  };

  const offsetLabel =
    entryType === "Deposit"
      ? "Credit account (income / offset)"
      : "Debit account (expense / petty cash)";

  return (
    <div className="slideout-overlay" onClick={onBackdropClick(handleDismiss)}>
      <div
        className="form-card bank-cash-entry-slideout"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="form-header">
          <div>
            <h2>{entryType === "Deposit" ? "New Deposit" : "New Withdrawal"}</h2>
            <p className="bank-cash-subtitle">
              Standalone bank cash — not tied to a customer or vendor invoice. Posts to
              GL and appears in Bank Reconciliation.
            </p>
          </div>
          <button type="button" className="btn-close" onClick={handleDismiss} aria-label="Close">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {bootstrapping ? (
          <div className="page-loading" style={{ minHeight: 240 }}>
            <div className="loading-spinner" />
            <p>Loading…</p>
          </div>
        ) : (
          <form className="airframe-form" onSubmit={handleSubmit}>
            <div className="tab-content" style={{ display: "block" }}>
              <div className="bank-cash-type-toggle" role="group" aria-label="Entry type">
                <button
                  type="button"
                  className={entryType === "Deposit" ? "active" : ""}
                  onClick={() => {
                    markDirty();
                    setEntryType("Deposit");
                  }}
                >
                  Deposit
                </button>
                <button
                  type="button"
                  className={entryType === "Withdrawal" ? "active" : ""}
                  onClick={() => {
                    markDirty();
                    setEntryType("Withdrawal");
                  }}
                >
                  Withdrawal
                </button>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <BankAccountSelect
                    banks={banks}
                    value={bankId}
                    onChange={(id) => {
                      markDirty();
                      setBankId(id);
                      setErrors((prev) => ({ ...prev, bankId: "" }));
                    }}
                    loading={banksLoading}
                    label="Bank account"
                  />
                  {errors.bankId && (
                    <span className="error-message">{errors.bankId}</span>
                  )}
                </div>
                <div className="form-group">
                  <label htmlFor="bankCashDate">
                    Date <span className="required">*</span>
                  </label>
                  <input
                    id="bankCashDate"
                    type="date"
                    className={`form-input ${errors.entryDate ? "error" : ""}`}
                    value={entryDate}
                    onChange={(e) => {
                      markDirty();
                      setEntryDate(e.target.value);
                    }}
                  />
                  {errors.entryDate && (
                    <span className="error-message">{errors.entryDate}</span>
                  )}
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="bankCashAmount">
                    Amount <span className="required">*</span>
                  </label>
                  <input
                    id="bankCashAmount"
                    type="number"
                    className={`form-input ${errors.amount ? "error" : ""}`}
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => {
                      markDirty();
                      setAmount(e.target.value);
                    }}
                  />
                  {errors.amount && (
                    <span className="error-message">{errors.amount}</span>
                  )}
                </div>
                <div className="form-group">
                  <label htmlFor="bankCashRef">Reference / Check #</label>
                  <input
                    id="bankCashRef"
                    type="text"
                    className="form-input"
                    placeholder="Optional"
                    value={reference}
                    onChange={(e) => {
                      markDirty();
                      setReference(e.target.value);
                    }}
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="bankCashOffset">
                  {offsetLabel} <span className="required">*</span>
                </label>
                <select
                  id="bankCashOffset"
                  className={`form-input ${errors.offsetAccountId ? "error" : ""}`}
                  value={offsetAccountId || ""}
                  onChange={(e) => {
                    markDirty();
                    setOffsetAccountId(Number(e.target.value) || 0);
                  }}
                >
                  <option value="">Select account…</option>
                  {preferredOffsetAccounts.map((a) => (
                    <option key={a.accountID} value={a.accountID}>
                      {a.accountCode} — {a.accountName}
                    </option>
                  ))}
                </select>
                {errors.offsetAccountId && (
                  <span className="error-message">{errors.offsetAccountId}</span>
                )}
                <span className="bank-cash-hint">
                  {entryType === "Deposit"
                    ? "Bank is debited; this account is credited (e.g. Other Income)."
                    : "This account is debited; bank is credited (e.g. Petty Cash or Expense)."}
                </span>
              </div>

              <div className="form-group">
                <label htmlFor="bankCashDesc">
                  Description <span className="required">*</span>
                </label>
                <textarea
                  id="bankCashDesc"
                  className={`form-input ${errors.description ? "error" : ""}`}
                  rows={2}
                  placeholder={
                    entryType === "Deposit"
                      ? "e.g. Interest income — March"
                      : "e.g. Petty cash replenishment"
                  }
                  value={description}
                  onChange={(e) => {
                    markDirty();
                    setDescription(e.target.value);
                  }}
                />
                {errors.description && (
                  <span className="error-message">{errors.description}</span>
                )}
              </div>

              {parsedAmount > 0 && (
                <div className="bank-cash-preview">
                  <span>
                    {entryType === "Deposit" ? "Deposit total" : "Withdrawal total"}
                  </span>
                  <strong>{formatCurrency(parsedAmount)}</strong>
                </div>
              )}
            </div>

            <div className="form-actions">
              <button
                type="button"
                className="btn-cancel"
                onClick={handleDismiss}
                disabled={loading}
              >
                Cancel
              </button>
              <button type="submit" className="btn-submit" disabled={loading}>
                {loading
                  ? "Saving…"
                  : entryType === "Deposit"
                    ? "Record Deposit"
                    : "Record Withdrawal"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default BankCashEntrySlideout;
