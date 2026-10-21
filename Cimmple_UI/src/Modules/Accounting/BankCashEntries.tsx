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
import { usePagePermissions } from "../../Common/Hooks/usePagePermissions";
import BankCashEntrySlideout from "./BankCashEntrySlideout";
import "./BankCashEntries.scss";

const PAGE_PATH = "/accounts/banks";

const currentMonthRange = () => {
  const now = new Date();
  const ymd = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };
  return {
    start: ymd(new Date(now.getFullYear(), now.getMonth(), 1)),
    end: ymd(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
  };
};

const BankCashEntries: React.FC = () => {
  const history = useHistory();
  const { formatCurrency, formatDate } = useFormatting();
  const { locationIdParam, masterListFilter } = useSiteListFilter();
  const { canAdd } = usePagePermissions(PAGE_PATH);

  const [entries, setEntries] = useState<BankCashEntrySummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [entryTypeFilter, setEntryTypeFilter] = useState("All");
  const [startDate, setStartDate] = useState(() => currentMonthRange().start);
  const [endDate, setEndDate] = useState(() => currentMonthRange().end);
  const [showSlideout, setShowSlideout] = useState(false);
  const [detailEntry, setDetailEntry] = useState<BankCashEntrySummary | null>(null);
  const [slideoutType, setSlideoutType] = useState<"Deposit" | "Withdrawal">(
    "Deposit"
  );

  const hasCompleteDateRange = Boolean(startDate && endDate);
  const appliedStartDate = hasCompleteDateRange ? startDate : "";
  const appliedEndDate = hasCompleteDateRange ? endDate : "";

  const loadEntries = useCallback(async () => {
    setLoading(true);
    try {
      const result = await AccountingService.ListBankCashEntries({
        entryType: entryTypeFilter,
        startDate: appliedStartDate || undefined,
        endDate: appliedEndDate || undefined,
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
  }, [entryTypeFilter, appliedStartDate, appliedEndDate, locationIdParam]);

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
    <div className="bank-cash-entries-page" style={{ padding: "1rem" }}>
      <MasterListPage
        title="Deposits & Withdrawals"
        subtitle="Record bank cash in or out with no customer or vendor invoice. Posts to GL and Bank Reconciliation."
        data={entries}
        columns={columns}
        loading={loading}
        enablePagination
        permissionPath={PAGE_PATH}
        searchPlaceholder="Search description, bank, reference, amount, date…"
        searchFields={["description", "bankName", "reference", "entryType", "checkNo", "amount", "entryDate"]}
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
        trailingActionButtons={
          canAdd
            ? [
                {
                  label: "+ New Withdrawal",
                  onClick: () => openNew("Withdrawal"),
                  className: "btn-secondary btn-cash-withdrawal",
                },
                {
                  label: "+ New Deposit",
                  onClick: () => openNew("Deposit"),
                  className: "btn-secondary btn-cash-deposit",
                },
              ]
            : []
        }
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
        onRowClick={(row) => setDetailEntry(row)}
      />

      {detailEntry && (
        <div
          className="bank-cash-detail-overlay"
          role="presentation"
          onClick={() => setDetailEntry(null)}
        >
          <div
            className="bank-cash-detail"
            role="dialog"
            aria-modal="true"
            aria-labelledby="bank-cash-detail-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bank-cash-detail__head">
              <h2 id="bank-cash-detail-title">
                {detailEntry.entryType || "Entry"} detail
              </h2>
              <button type="button" onClick={() => setDetailEntry(null)} aria-label="Close">
                ×
              </button>
            </div>
            <dl className="bank-cash-detail__grid">
              <div>
                <dt>Type</dt>
                <dd>{detailEntry.entryType || "—"}</dd>
              </div>
              <div>
                <dt>Date</dt>
                <dd>{formatDate(detailEntry.entryDate) || "—"}</dd>
              </div>
              <div>
                <dt>Bank</dt>
                <dd>{detailEntry.bankName || "—"}</dd>
              </div>
              <div>
                <dt>Amount</dt>
                <dd>
                  {(detailEntry.entryType || "").toLowerCase() === "deposit" ? "+" : "−"}
                  {formatCurrency(Math.abs(Number(detailEntry.amount) || 0))}
                </dd>
              </div>
              <div>
                <dt>Debit account</dt>
                <dd>{detailEntry.debitAccount || "—"}</dd>
              </div>
              <div>
                <dt>Credit account</dt>
                <dd>{detailEntry.creditAccount || "—"}</dd>
              </div>
              <div>
                <dt>Description</dt>
                <dd>{detailEntry.description || "—"}</dd>
              </div>
              <div>
                <dt>Reference</dt>
                <dd>
                  {detailEntry.journalEntryId ? (
                    <button
                      type="button"
                      className="link-button"
                      onClick={() =>
                        history.push(
                          `/accounts/journal-entries?id=${detailEntry.journalEntryId}`
                        )
                      }
                    >
                      {detailEntry.reference || `JE#${detailEntry.journalEntryId}`}
                    </button>
                  ) : (
                    detailEntry.reference || "—"
                  )}
                </dd>
              </div>
              <div>
                <dt>Check no.</dt>
                <dd>{detailEntry.checkNo || "—"}</dd>
              </div>
              <div>
                <dt>Reconciled</dt>
                <dd>{detailEntry.isReconciled ? "Yes" : "No"}</dd>
              </div>
            </dl>
          </div>
        </div>
      )}

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
