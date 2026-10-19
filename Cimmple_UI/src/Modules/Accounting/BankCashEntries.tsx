import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useHistory } from "react-router-dom";
import { toast } from "react-toastify";
import MasterListPage from "../../Common/Components/MasterListPage/MasterListPage";
import DateFilterInput from "../../Common/Components/DateFilterInput";
import {
  AccountingService,
  BankCashEntrySummary,
} from "../../Common/Services/AccountingService";
import { useFormatting } from "../../Common/Hooks/useFormatting";
import { useSiteListFilter } from "../../Common/Hooks/useSiteListFilter";
import BankCashEntrySlideout from "./BankCashEntrySlideout";

const BankCashEntries: React.FC = () => {
  const history = useHistory();
  const { formatCurrency, formatDate } = useFormatting();
  const { locationIdParam, masterListFilter } = useSiteListFilter();

  const [entries, setEntries] = useState<BankCashEntrySummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [entryTypeFilter, setEntryTypeFilter] = useState("All");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [showSlideout, setShowSlideout] = useState(false);
  const [slideoutType, setSlideoutType] = useState<"Deposit" | "Withdrawal">(
    "Deposit"
  );

  const loadEntries = useCallback(async () => {
    setLoading(true);
    try {
      const result = await AccountingService.ListBankCashEntries({
        entryType: entryTypeFilter,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        locationId: locationIdParam,
      });
      setEntries(result || []);
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || "Failed to load deposits & withdrawals");
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [entryTypeFilter, startDate, endDate, locationIdParam]);

  useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  const openNew = (type: "Deposit" | "Withdrawal" = "Deposit") => {
    setSlideoutType(type);
    setShowSlideout(true);
  };

  const columns = useMemo(
    () => [
      {
        key: "entryDate",
        label: "Date",
        sortable: true,
        align: "left" as const,
        render: (value: any) => formatDate(value),
      },
      {
        key: "entryType",
        label: "Type",
        sortable: true,
        align: "left" as const,
        render: (value: string) => {
          const isDeposit = (value || "").toLowerCase() === "deposit";
          return (
            <span
              style={{
                display: "inline-block",
                padding: "0.125rem 0.5rem",
                borderRadius: "999px",
                fontSize: "0.75rem",
                fontWeight: 600,
                background: isDeposit ? "#ecfdf5" : "#fef2f2",
                color: isDeposit ? "#047857" : "#b91c1c",
              }}
            >
              {value || "—"}
            </span>
          );
        },
      },
      {
        key: "bankName",
        label: "Bank",
        sortable: true,
        align: "left" as const,
      },
      {
        key: "description",
        label: "Description",
        sortable: true,
        align: "left" as const,
      },
      {
        key: "reference",
        label: "Reference",
        sortable: true,
        align: "left" as const,
        render: (value: string, row: BankCashEntrySummary) =>
          row.journalEntryId ? (
            <button
              type="button"
              className="link-button"
              onClick={(e) => {
                e.stopPropagation();
                history.push(`/accounts/journal-entries?id=${row.journalEntryId}`);
              }}
            >
              {value || `JE#${row.journalEntryId}`}
            </button>
          ) : (
            <span>{value || "—"}</span>
          ),
      },
      {
        key: "amount",
        label: "Amount",
        sortable: true,
        align: "right" as const,
        render: (value: number, row: BankCashEntrySummary) => {
          const isDeposit = (row.entryType || "").toLowerCase() === "deposit";
          return (
            <span style={{ color: isDeposit ? "#047857" : "#b91c1c", fontWeight: 600 }}>
              {isDeposit ? "+" : "−"}
              {formatCurrency(Math.abs(Number(value) || 0))}
            </span>
          );
        },
      },
      {
        key: "isReconciled",
        label: "Reconciled",
        sortable: true,
        align: "left" as const,
        render: (value: boolean) => (value ? "Yes" : "No"),
      },
    ],
    [formatCurrency, formatDate, history]
  );

  return (
    <div style={{ padding: "1rem" }}>
      <MasterListPage
        title="Deposits & Withdrawals"
        subtitle="Record bank cash in or out with no customer or vendor invoice. Posts to GL and Bank Reconciliation."
        data={entries}
        columns={columns}
        loading={loading}
        enablePagination
        onAdd={() => openNew("Deposit")}
        addButtonLabel="New Deposit"
        searchPlaceholder="Search description, bank, reference…"
        searchFields={["description", "bankName", "reference", "entryType", "checkNo"]}
        getRowId={(row) => row.id}
        columnPreferenceKey="bankCashEntries.hiddenColumns"
        filters={[
          masterListFilter,
          {
            label: "Type",
            options: [
              { value: "All", label: "All types" },
              { value: "Deposit", label: "Deposits" },
              { value: "Withdrawal", label: "Withdrawals" },
            ],
            value: entryTypeFilter,
            onChange: (value) => setEntryTypeFilter(value),
          },
        ]}
        customActionButtons={[
          {
            label: "New Withdrawal",
            onClick: () => openNew("Withdrawal"),
            className: "btn-secondary",
          },
          {
            label: loading ? "Loading…" : "Refresh",
            onClick: () => void loadEntries(),
            disabled: loading,
            className: "btn-secondary",
          },
          {
            label: "Bank Reconciliation",
            onClick: () => history.push("/accounts/banks"),
            className: "btn-secondary",
          },
        ]}
        extraFilters={
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
              <label style={{ fontSize: "0.8125rem", color: "#4b5563", fontWeight: 500 }}>
                From
              </label>
              <DateFilterInput
                className="filter-select"
                style={{ paddingRight: "0.75rem", backgroundImage: "none" }}
                value={startDate}
                onCommit={setStartDate}
              />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
              <label style={{ fontSize: "0.8125rem", color: "#4b5563", fontWeight: 500 }}>
                To
              </label>
              <DateFilterInput
                className="filter-select"
                style={{ paddingRight: "0.75rem", backgroundImage: "none" }}
                value={endDate}
                onCommit={setEndDate}
              />
            </div>
            {(startDate || endDate) && (
              <button
                type="button"
                onClick={() => {
                  setStartDate("");
                  setEndDate("");
                }}
                style={{
                  padding: "0.5rem 0.75rem",
                  backgroundColor: "#f3f4f6",
                  color: "#374151",
                  border: "1px solid #d1d5db",
                  borderRadius: "0.5rem",
                  fontSize: "0.8125rem",
                  cursor: "pointer",
                  fontWeight: 500,
                }}
              >
                Clear Dates
              </button>
            )}
          </div>
        }
        emptyMessage="No deposits or withdrawals yet. Use New Deposit or New Withdrawal to record bank cash."
        onRowClick={(row) => {
          if (row.journalEntryId) {
            history.push(`/accounts/journal-entries?id=${row.journalEntryId}`);
          }
        }}
      />

      {showSlideout && (
        <BankCashEntrySlideout
          initialType={slideoutType}
          onClose={(refresh) => {
            setShowSlideout(false);
            if (refresh) void loadEntries();
          }}
        />
      )}
    </div>
  );
};

export default BankCashEntries;
