import React, { useState, useEffect, useMemo, useCallback } from "react";
import { toast } from "react-toastify";
import {
  faCheckCircle,
  faExclamationTriangle,
  faDownload,
  faUpload,
  faFilter,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  AccountingService,
  BankTransaction,
  BankAccount,
  BankReconciliationContext,
  BankReconciliationPeriod,
} from "../../Common/Services/AccountingService";
import { BankService } from "../../Common/Services/BankService";
import { useFormatting } from "../../Common/Hooks/useFormatting";
import { useSiteListFilter } from "../../Common/Hooks/useSiteListFilter";
import BankStatementImportModal from "./BankStatementImportModal";
import type { BankStatementImportResult } from "./BankStatementImportModal";

type ReconSortColumn = "date" | "description" | "amount" | "type" | "status";

const BankReconciliation: React.FC = () => {
  const { formatCurrency: formatCurrencyRaw, formatDate } = useFormatting();
  const formatCurrency = (amount: number) => formatCurrencyRaw(amount);
  const { locationIdParam, masterListFilter } = useSiteListFilter();
  const [selectedAccount, setSelectedAccount] = useState<number>(0);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [openingBalances, setOpeningBalances] = useState<Record<number, number>>({});
  const [transactions, setTransactions] = useState<BankTransaction[]>([]);
  const [periodActivity, setPeriodActivity] = useState(0);
  const [loading, setLoading] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [starting, setStarting] = useState(false);
  const [reconContext, setReconContext] = useState<BankReconciliationContext | null>(null);
  const [statementDate, setStatementDate] = useState("");
  const [statementBalance, setStatementBalance] = useState("");
  const [startDateInput, setStartDateInput] = useState("");
  const [startBalanceInput, setStartBalanceInput] = useState("");
  const [differences, setDifferences] = useState<BankTransaction[]>([]);
  const [filters, setFilters] = useState({
    reconciled: "all",
    dateRange: "All Dates",
    amountRange: "All",
  });
  const [sortColumn, setSortColumn] = useState<ReconSortColumn>("date");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [showImport, setShowImport] = useState(false);

  const openPeriod = reconContext?.openPeriod ?? null;
  const hasOpenPeriod = !!openPeriod;
  const beginningBalance = openPeriod?.beginningBalance ?? reconContext?.suggestedBeginningBalance ?? 0;

  const handleSort = (column: ReconSortColumn) => {
    if (sortColumn === column) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(column);
      setSortDirection(column === "date" ? "desc" : "asc");
    }
  };

  const sortedTransactions = useMemo(() => {
    const rows = [...transactions];
    const dir = sortDirection === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      let cmp = 0;
      switch (sortColumn) {
        case "date": {
          cmp = (a.date || "").localeCompare(b.date || "");
          if (cmp === 0) cmp = a.id - b.id;
          break;
        }
        case "description":
          cmp = (a.description || "").localeCompare(b.description || "", undefined, {
            sensitivity: "base",
          });
          break;
        case "amount":
          cmp = a.amount - b.amount;
          break;
        case "type":
          cmp = (a.type || "").localeCompare(b.type || "");
          break;
        case "status":
          cmp = Number(a.reconciled) - Number(b.reconciled);
          break;
        default:
          cmp = 0;
      }
      return cmp * dir;
    });
    return rows;
  }, [transactions, sortColumn, sortDirection]);

  const clearedCredits = Number(openPeriod?.clearedCredits ?? 0);
  const clearedDebits = Number(openPeriod?.clearedDebits ?? 0);

  const clearedBalance = useMemo(() => {
    if (openPeriod?.clearedBalance != null && Number.isFinite(Number(openPeriod.clearedBalance))) {
      return Number(openPeriod.clearedBalance);
    }
    // Beginning + credits − debits
    return beginningBalance + clearedCredits - clearedDebits;
  }, [openPeriod, beginningBalance, clearedCredits, clearedDebits]);

  const differenceAmount = useMemo(() => {
    const ending = parseFloat(statementBalance || "0");
    if (!Number.isFinite(ending)) return 0;
    // Statement ending − cleared balance (0 when reconciled)
    return ending - clearedBalance;
  }, [statementBalance, clearedBalance]);

  const canComplete = hasOpenPeriod && Math.abs(differenceAmount) < 0.01;

  const sortIcon = (column: ReconSortColumn) => {
    if (sortColumn !== column) return "⇅";
    return sortDirection === "asc" ? "↑" : "↓";
  };

  const thSortable = (
    column: ReconSortColumn,
    label: string,
    align: "left" | "right" | "center" = "left"
  ) => (
    <th
      onClick={() => handleSort(column)}
      style={{
        padding: "0.75rem 1.5rem",
        textAlign: align,
        fontSize: "0.875rem",
        fontWeight: 600,
        color: "#374151",
        borderBottom: "1px solid #e5e7eb",
        cursor: "pointer",
        userSelect: "none",
        whiteSpace: "nowrap",
      }}
      title={`Sort by ${label}`}
    >
      {label}{" "}
      <span style={{ color: sortColumn === column ? "#2563eb" : "#9ca3af", fontSize: "0.75rem" }}>
        {sortIcon(column)}
      </span>
    </th>
  );

  const toLocalYmd = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  const txnDateYmd = (dateStr: string) => (dateStr || "").slice(0, 10);

  const loadReconContext = useCallback(async (bankId: number) => {
    if (bankId <= 0) {
      setReconContext(null);
      return null;
    }
    try {
      const ctx = await AccountingService.GetBankReconciliationContext(bankId);
      setReconContext(ctx);
      if (ctx?.openPeriod) {
        setStatementDate(ctx.openPeriod.statementDate || "");
        setStatementBalance(String(ctx.openPeriod.endingBalance ?? ""));
      } else {
        setStatementDate("");
        setStatementBalance("");
        setStartDateInput(toLocalYmd(new Date()));
        setStartBalanceInput("");
      }
      if (ctx?.lastReconciledDate) {
        setAccounts((prev) =>
          prev.map((a) =>
            a.id === bankId ? { ...a, lastReconciled: ctx.lastReconciledDate || "" } : a
          )
        );
      }
      return ctx;
    } catch (error) {
      console.error("Error loading reconciliation context:", error);
      toast.error("Failed to load reconciliation period");
      return null;
    }
  }, []);

  useEffect(() => {
    loadBankAccounts();
  }, [locationIdParam]);

  useEffect(() => {
    if (selectedAccount > 0) {
      loadReconContext(selectedAccount).then(() => {
        // transactions load after context so statement date clamp is available
      });
    } else {
      setReconContext(null);
      setTransactions([]);
    }
  }, [selectedAccount, loadReconContext]);

  useEffect(() => {
    if (selectedAccount > 0) {
      loadTransactions();
    }
  }, [selectedAccount, filters, statementDate, hasOpenPeriod]);

  const loadBankAccounts = async () => {
    try {
      const storage = JSON.parse(localStorage.getItem("storage") || "{}");
      const tenantID = storage?.tenantID || 0;
      const bankData = await BankService.GetBanklist({
        tenantid: tenantID,
        locationId: locationIdParam,
      });
      if (bankData && bankData.length > 0) {
        const openings: Record<number, number> = {};
        const transformedAccounts: BankAccount[] = bankData.map((bank) => {
          openings[bank.id] = Number(bank.openingBalance ?? bank.balance ?? 0);
          return {
            id: bank.id,
            name: bank.nickName || bank.bankName,
            accountNumber: bank.lastAccountNo || bank.accountNo,
            balance: Number(bank.currentBalance ?? bank.balance ?? 0),
            lastReconciled: bank.lastReconciledDate
              ? String(bank.lastReconciledDate).slice(0, 10)
              : "",
          };
        });
        setOpeningBalances(openings);
        setAccounts(transformedAccounts);
        setSelectedAccount((prev) =>
          prev > 0 && transformedAccounts.some((a) => a.id === prev)
            ? prev
            : transformedAccounts[0].id
        );
      } else {
        setOpeningBalances({});
        setAccounts([]);
        setSelectedAccount(0);
        setTransactions([]);
        setPeriodActivity(0);
        setDifferences([]);
        setReconContext(null);
      }
    } catch (error) {
      console.error("Error loading bank accounts:", error);
      toast.error("Failed to load bank accounts");
    }
  };

  const loadTransactions = async () => {
    setLoading(true);
    try {
      const endDate = new Date();
      const startDate = new Date();
      let startYmd: string | undefined;
      let endYmd: string | undefined;

      switch (filters.dateRange) {
        case "Last 7 Days":
          startDate.setDate(endDate.getDate() - 7);
          startYmd = toLocalYmd(startDate);
          endYmd = toLocalYmd(endDate);
          break;
        case "Last 30 Days":
          startDate.setDate(endDate.getDate() - 30);
          startYmd = toLocalYmd(startDate);
          endYmd = toLocalYmd(endDate);
          break;
        case "Last 90 Days":
          startDate.setDate(endDate.getDate() - 90);
          startYmd = toLocalYmd(startDate);
          endYmd = toLocalYmd(endDate);
          break;
        case "This Year":
          startDate.setMonth(0, 1);
          startYmd = toLocalYmd(startDate);
          endYmd = toLocalYmd(endDate);
          break;
        case "All Dates":
          startYmd = "1900-01-01";
          endYmd = "2099-12-31";
          break;
        default:
          startYmd = "1900-01-01";
          endYmd = "2099-12-31";
      }

      if (statementDate && endYmd && statementDate < endYmd) {
        endYmd = statementDate;
      }

      const rows = await AccountingService.GetBankTransactions(
        selectedAccount,
        startYmd,
        endYmd
      );

      if (rows) {
        let filteredTransactions = rows;
        if (statementDate) {
          filteredTransactions = filteredTransactions.filter(
            (t) => txnDateYmd(t.date) <= statementDate
          );
        }
        if (filters.reconciled !== "all") {
          const isReconciled = filters.reconciled === "reconciled";
          filteredTransactions = filteredTransactions.filter(
            (t) => t.reconciled === isReconciled
          );
        }
        if (filters.amountRange !== "All") {
          filteredTransactions = filteredTransactions.filter((transaction) => {
            const absAmount = Math.abs(transaction.amount);
            switch (filters.amountRange) {
              case "Under $100":
                return absAmount < 100;
              case "$100 - $500":
                return absAmount >= 100 && absAmount < 500;
              case "$500 - $1,000":
                return absAmount >= 500 && absAmount < 1000;
              case "Over $1,000":
                return absAmount >= 1000;
              default:
                return true;
            }
          });
        }

        setTransactions(filteredTransactions);
        setPeriodActivity(filteredTransactions.reduce((sum, t) => sum + t.amount, 0));
        setDifferences(filteredTransactions.filter((t) => !t.reconciled));
      }
    } catch (error) {
      console.error("Error loading bank transactions:", error);
      toast.error("Failed to load bank transactions");
    } finally {
      setLoading(false);
    }
  };

  const refreshAfterClear = async () => {
    await loadTransactions();
    await loadReconContext(selectedAccount);
  };

  const handleReconcile = async (transactionId: number) => {
    if (reconciling) return;
    if (!hasOpenPeriod) {
      toast.info("Start a reconciliation period before clearing transactions");
      return;
    }
    const transaction = transactions.find((t) => t.id === transactionId);
    if (!transaction) return;

    setReconciling(true);
    const toastId = toast.info("Updating…", { autoClose: false });
    try {
      await AccountingService.ReconcileBankTransaction(transactionId, !transaction.reconciled);
      await refreshAfterClear();
      toast.dismiss(toastId);
      toast.success("Transaction updated");
    } catch (error: any) {
      console.error("Error reconciling transaction:", error);
      toast.dismiss(toastId);
      toast.error(error?.response?.data?.error || "Failed to update reconciliation status");
    } finally {
      setReconciling(false);
    }
  };

  const handleBulkReconcile = async () => {
    if (reconciling) return;
    if (!hasOpenPeriod) {
      toast.info("Start a reconciliation period before clearing transactions");
      return;
    }
    const unreconciled = transactions.filter((t) => !t.reconciled);
    if (unreconciled.length === 0) {
      toast.info("No unreconciled transactions to process");
      return;
    }

    setReconciling(true);
    const toastId = toast.info("Reconciling…", { autoClose: false });
    try {
      await AccountingService.BulkReconcileTransactions(unreconciled.map((t) => t.id));
      await refreshAfterClear();
      toast.dismiss(toastId);
      toast.success(`${unreconciled.length} transactions reconciled`);
    } catch (error: any) {
      console.error("Error bulk reconciling transactions:", error);
      toast.dismiss(toastId);
      toast.error(error?.response?.data?.error || "Failed to reconcile transactions");
    } finally {
      setReconciling(false);
    }
  };

  const handleStartPeriod = async () => {
    if (!selectedAccount || starting) return;
    if (!startDateInput) {
      toast.error("Enter the statement ending date");
      return;
    }
    const ending = parseFloat(startBalanceInput);
    if (!Number.isFinite(ending)) {
      toast.error("Enter the statement ending balance");
      return;
    }
    setStarting(true);
    try {
      await AccountingService.StartBankReconciliationPeriod(
        selectedAccount,
        startDateInput,
        ending
      );
      toast.success("Reconciliation period started");
      await loadReconContext(selectedAccount);
      await loadTransactions();
    } catch (error: any) {
      toast.error(error?.response?.data?.error || "Failed to start reconciliation period");
    } finally {
      setStarting(false);
    }
  };

  const persistStatementFields = async (date: string, balanceStr: string) => {
    if (!openPeriod) return;
    const ending = parseFloat(balanceStr);
    if (!date || !Number.isFinite(ending)) return;
    try {
      const updated = await AccountingService.UpdateBankReconciliationPeriod(openPeriod.id, {
        statementDate: date,
        endingBalance: ending,
      });
      if (updated) {
        setReconContext((prev) =>
          prev
            ? {
                ...prev,
                openPeriod: updated,
                periods: prev.periods.map((p) => (p.id === updated.id ? updated : p)),
              }
            : prev
        );
      }
    } catch (error: any) {
      toast.error(error?.response?.data?.error || "Failed to update statement details");
    }
  };

  const handleStatementDateBlur = () => {
    if (hasOpenPeriod && statementDate) {
      persistStatementFields(statementDate, statementBalance);
    }
  };

  const handleStatementBalanceBlur = () => {
    if (hasOpenPeriod && statementDate) {
      persistStatementFields(statementDate, statementBalance);
    }
  };

  const handleCompletePeriod = async () => {
    if (!openPeriod || completing) return;
    if (!canComplete) {
      toast.error("Difference must be zero before completing the period");
      return;
    }
    setCompleting(true);
    try {
      await AccountingService.CompleteBankReconciliationPeriod(openPeriod.id);
      toast.success("Reconciliation period completed");
      await loadReconContext(selectedAccount);
      await loadTransactions();
    } catch (error: any) {
      toast.error(error?.response?.data?.error || "Failed to complete reconciliation");
    } finally {
      setCompleting(false);
    }
  };

  const handleImportStatement = () => {
    if (!selectedAccount || selectedAccount <= 0) {
      toast.info("Select a bank account before importing a statement");
      return;
    }
    if (!hasOpenPeriod) {
      toast.info("Start a reconciliation period before importing a statement");
      return;
    }
    setShowImport(true);
  };

  const handleStatementImported = async (result: BankStatementImportResult) => {
    if (openPeriod) {
      const nextDate = result.statementDate || statementDate || openPeriod.statementDate;
      const nextBal =
        result.statementBalance != null && result.statementBalance !== ""
          ? result.statementBalance
          : statementBalance || String(openPeriod.endingBalance);
      setStatementDate(nextDate);
      setStatementBalance(nextBal);
      try {
        await AccountingService.UpdateBankReconciliationPeriod(openPeriod.id, {
          statementDate: nextDate,
          endingBalance: parseFloat(nextBal),
        });
      } catch (error: any) {
        toast.error(error?.response?.data?.error || "Failed to update period from import");
      }
    }
    await refreshAfterClear();
  };

  const handleExportReport = () => {
    if (transactions.length === 0) {
      toast.info("No transactions to export");
      return;
    }
    const header = "Date,Description,Reference,Amount,Type,Reconciled\n";
    const rows = transactions
      .map((t) =>
        [
          t.date,
          `"${(t.description || "").replace(/"/g, '""')}"`,
          t.reference || "",
          t.amount,
          t.type,
          t.reconciled ? "Yes" : "No",
        ].join(",")
      )
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bank-reconciliation_${selectedAccount}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Reconciliation list exported as CSV");
  };

  const selectedAccountData = accounts.find((acc) => acc.id === selectedAccount);
  const completedHistory = (reconContext?.periods || []).filter(
    (p) => String(p.status).toLowerCase() === "completed"
  );

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "0.5rem",
    border: "1px solid #d1d5db",
    borderRadius: "0.375rem",
    fontSize: "0.875rem",
  };

  return (
    <div style={{ padding: "1.5rem", width: "100%" }}>
      {showImport && selectedAccountData && (
        <BankStatementImportModal
          bankAccountId={selectedAccount}
          bankName={selectedAccountData.name}
          accountNumber={selectedAccountData.accountNumber}
          onClose={() => setShowImport(false)}
          onApplied={handleStatementImported}
        />
      )}
      <div style={{ marginBottom: "2rem" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "1rem",
            marginBottom: "0.5rem",
          }}
        >
          <h1 style={{ margin: 0, fontSize: "2rem", fontWeight: "bold", color: "#111827" }}>
            Bank Reconciliation
          </h1>
          <div style={{ display: "flex", gap: "1rem", flexShrink: 0 }}>
            <button
              onClick={handleImportStatement}
              style={{
                padding: "0.5rem 1rem",
                backgroundColor: "#6b7280",
                color: "white",
                border: "none",
                borderRadius: "0.375rem",
                cursor: selectedAccount > 0 && hasOpenPeriod ? "pointer" : "not-allowed",
                opacity: selectedAccount > 0 && hasOpenPeriod ? 1 : 0.6,
                fontSize: "0.875rem",
                fontWeight: "500",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                whiteSpace: "nowrap",
              }}
            >
              <FontAwesomeIcon icon={faUpload} />
              Import Statement
            </button>
            <button
              onClick={handleExportReport}
              style={{
                padding: "0.5rem 1rem",
                backgroundColor: "#10b981",
                color: "white",
                border: "none",
                borderRadius: "0.375rem",
                cursor: "pointer",
                fontSize: "0.875rem",
                fontWeight: "500",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                whiteSpace: "nowrap",
              }}
            >
              <FontAwesomeIcon icon={faDownload} />
              Export Report
            </button>
          </div>
        </div>
        <p style={{ margin: 0, color: "#6b7280", fontSize: "0.875rem" }}>
          Finish bank statement periods here, then close the GL month on Period Close &amp; Audit.
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "2rem",
          marginBottom: "2rem",
        }}
      >
        <div
          style={{
            backgroundColor: "white",
            borderRadius: "0.5rem",
            boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
            padding: "1.5rem",
          }}
        >
          <h3 style={{ margin: "0 0 1rem 0", fontSize: "1.125rem", fontWeight: "600", color: "#111827" }}>
            Select Bank Account
          </h3>
          <select
            value={selectedAccount}
            onChange={(e) => setSelectedAccount(parseInt(e.target.value))}
            style={{
              width: "100%",
              padding: "0.75rem",
              border: "1px solid #d1d5db",
              borderRadius: "0.375rem",
              fontSize: "0.875rem",
              marginBottom: "1rem",
            }}
          >
            {accounts.length === 0 && <option value={0}>No bank accounts for this site</option>}
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name} - {account.accountNumber}
              </option>
            ))}
          </select>

          {selectedAccountData && (
            <div style={{ padding: "1rem", backgroundColor: "#f9fafb", borderRadius: "0.375rem" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "0.5rem",
                }}
              >
                <span style={{ fontSize: "0.875rem", color: "#6b7280" }}>Book Balance (all-time)</span>
                <span style={{ fontSize: "1.125rem", fontWeight: "600", color: "#111827" }}>
                  {formatCurrencyRaw(selectedAccountData.balance)}
                </span>
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "0.5rem",
                }}
              >
                <span style={{ fontSize: "0.875rem", color: "#6b7280" }}>Bank opening balance</span>
                <span style={{ fontSize: "0.875rem", color: "#111827" }}>
                  {formatCurrencyRaw(openingBalances[selectedAccount] ?? 0)}
                </span>
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "0.5rem",
                }}
              >
                <span style={{ fontSize: "0.875rem", color: "#6b7280" }}>Net activity (filtered)</span>
                <span style={{ fontSize: "0.875rem", color: "#111827" }}>
                  {formatCurrencyRaw(periodActivity)}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "0.875rem", color: "#6b7280" }}>Last completed statement</span>
                <span style={{ fontSize: "0.875rem", color: "#111827" }}>
                  {selectedAccountData.lastReconciled
                    ? formatDate(selectedAccountData.lastReconciled)
                    : "Never"}
                </span>
              </div>
            </div>
          )}

          {completedHistory.length > 0 && (
            <div style={{ marginTop: "1rem" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "0.875rem",
                  fontWeight: 500,
                  marginBottom: "0.5rem",
                  color: "#374151",
                }}
              >
                Completed periods
              </label>
              <select
                defaultValue=""
                style={inputStyle}
                aria-label="Completed reconciliation periods"
              >
                <option value="" disabled>
                  View history…
                </option>
                {completedHistory.map((p: BankReconciliationPeriod) => (
                  <option key={p.id} value={p.id}>
                    {formatDate(p.statementDate)} · Ending {formatCurrency(p.endingBalance)} · Beg{" "}
                    {formatCurrency(p.beginningBalance)}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div
          style={{
            backgroundColor: "white",
            borderRadius: "0.5rem",
            boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
            padding: "1.5rem",
          }}
        >
          <h3 style={{ margin: "0 0 1rem 0", fontSize: "1.125rem", fontWeight: "600", color: "#111827" }}>
            Reconciliation Summary
          </h3>

          {!hasOpenPeriod ? (
            <div>
              <p style={{ margin: "0 0 1rem 0", fontSize: "0.875rem", color: "#6b7280" }}>
                Start a period using the bank statement ending date and ending balance. Beginning
                balance is carried from the prior completed period (
                {formatCurrency(reconContext?.suggestedBeginningBalance ?? 0)}).
              </p>
              <div style={{ marginBottom: "1rem" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.875rem",
                    fontWeight: 500,
                    marginBottom: "0.5rem",
                    color: "#374151",
                  }}
                >
                  Statement ending date
                </label>
                <input
                  type="date"
                  value={startDateInput}
                  onChange={(e) => setStartDateInput(e.target.value)}
                  style={inputStyle}
                />
              </div>
              <div style={{ marginBottom: "1rem" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.875rem",
                    fontWeight: 500,
                    marginBottom: "0.5rem",
                    color: "#374151",
                  }}
                >
                  Statement ending balance
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={startBalanceInput}
                  onChange={(e) => setStartBalanceInput(e.target.value)}
                  placeholder="0.00"
                  style={inputStyle}
                />
              </div>
              <button
                type="button"
                onClick={handleStartPeriod}
                disabled={starting || selectedAccount <= 0}
                style={{
                  padding: "0.5rem 1rem",
                  backgroundColor: "#2563eb",
                  color: "white",
                  border: "none",
                  borderRadius: "0.375rem",
                  cursor: starting ? "not-allowed" : "pointer",
                  fontSize: "0.875rem",
                  fontWeight: 500,
                  opacity: starting ? 0.7 : 1,
                }}
              >
                {starting ? "Starting…" : "Start reconciliation"}
              </button>
            </div>
          ) : (
            <>
              <div
                style={{
                  marginBottom: "0.75rem",
                  padding: "0.5rem 0.75rem",
                  background: "#eff6ff",
                  borderRadius: "0.375rem",
                  fontSize: "0.8125rem",
                  color: "#1e40af",
                }}
              >
                Open period through {formatDate(openPeriod!.statementDate)}
              </div>

              <div style={{ marginBottom: "1rem" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.875rem",
                    fontWeight: 500,
                    marginBottom: "0.5rem",
                    color: "#374151",
                  }}
                >
                  Beginning balance
                </label>
                <div
                  style={{
                    ...inputStyle,
                    background: "#f9fafb",
                    fontWeight: 600,
                    color: "#111827",
                  }}
                >
                  {formatCurrency(beginningBalance)}
                </div>
              </div>

              <div style={{ marginBottom: "1rem" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.875rem",
                    fontWeight: 500,
                    marginBottom: "0.5rem",
                    color: "#374151",
                  }}
                >
                  Statement Date
                </label>
                <input
                  type="date"
                  value={statementDate}
                  onChange={(e) => setStatementDate(e.target.value)}
                  onBlur={handleStatementDateBlur}
                  style={inputStyle}
                />
              </div>

              <div style={{ marginBottom: "1rem" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.875rem",
                    fontWeight: 500,
                    marginBottom: "0.5rem",
                    color: "#374151",
                  }}
                >
                  Statement ending balance
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={statementBalance}
                  onChange={(e) => setStatementBalance(e.target.value)}
                  onBlur={handleStatementBalanceBlur}
                  style={inputStyle}
                />
              </div>

              <div style={{ padding: "1rem", backgroundColor: "#f9fafb", borderRadius: "0.375rem" }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "0.35rem",
                    fontSize: "0.875rem",
                  }}
                >
                  <span style={{ color: "#6b7280" }}>Beginning balance</span>
                  <span style={{ fontWeight: 500, color: "#111827" }}>{formatCurrency(beginningBalance)}</span>
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "0.35rem",
                    fontSize: "0.875rem",
                  }}
                >
                  <span style={{ color: "#6b7280" }}>＋ Cleared deposits (credits)</span>
                  <span style={{ fontWeight: 500, color: "#059669" }}>
                    {formatCurrency(clearedCredits)}
                  </span>
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "0.35rem",
                    fontSize: "0.875rem",
                  }}
                >
                  <span style={{ color: "#6b7280" }}>− Cleared payments (debits)</span>
                  <span style={{ fontWeight: 500, color: "#dc2626" }}>
                    {formatCurrency(clearedDebits)}
                  </span>
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "0.5rem",
                    paddingTop: "0.35rem",
                    borderTop: "1px solid #e5e7eb",
                  }}
                >
                  <span style={{ fontSize: "0.875rem", color: "#374151", fontWeight: 600 }}>
                    Cleared balance
                  </span>
                  <span style={{ fontSize: "1rem", fontWeight: 600, color: "#111827" }}>
                    {formatCurrency(clearedBalance)}
                  </span>
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "0.5rem",
                  }}
                >
                  <span style={{ fontSize: "0.875rem", color: "#6b7280" }}>Unreconciled items</span>
                  <span
                    style={{
                      fontSize: "1rem",
                      fontWeight: 600,
                      color: differences.length > 0 ? "#ef4444" : "#10b981",
                    }}
                  >
                    {differences.length}
                  </span>
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "0.75rem",
                  }}
                >
                  <span
                    style={{ fontSize: "0.875rem", color: "#6b7280" }}
                    title="Statement ending balance − cleared balance"
                  >
                    Difference
                  </span>
                  <span
                    style={{
                      fontSize: "1rem",
                      fontWeight: 600,
                      color: Math.abs(differenceAmount) < 0.01 ? "#10b981" : "#ef4444",
                    }}
                  >
                    {differenceAmount > 0 ? "+" : ""}
                    {formatCurrency(differenceAmount)}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleCompletePeriod}
                  disabled={!canComplete || completing}
                  style={{
                    width: "100%",
                    padding: "0.5rem 1rem",
                    backgroundColor: canComplete ? "#059669" : "#9ca3af",
                    color: "white",
                    border: "none",
                    borderRadius: "0.375rem",
                    cursor: canComplete && !completing ? "pointer" : "not-allowed",
                    fontSize: "0.875rem",
                    fontWeight: 500,
                  }}
                >
                  {completing
                    ? "Completing…"
                    : canComplete
                      ? "Complete reconciliation"
                      : "Balance to zero to complete"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <div
        style={{
          backgroundColor: "white",
          borderRadius: "0.5rem",
          boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
          padding: "1.5rem",
          marginBottom: "1.5rem",
        }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <FontAwesomeIcon icon={faFilter} style={{ color: "#6b7280" }} />
            <span style={{ fontWeight: 500, color: "#374151" }}>Filters:</span>
          </div>

          <select
            value={masterListFilter.value}
            onChange={(e) => masterListFilter.onChange(e.target.value)}
            style={{
              padding: "0.5rem 1rem",
              border: "1px solid #d1d5db",
              borderRadius: "0.375rem",
              fontSize: "0.875rem",
            }}
            title="Site"
          >
            {masterListFilter.options.map((opt) => (
              <option key={opt.value || "all"} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          <select
            value={filters.reconciled}
            onChange={(e) => setFilters((prev) => ({ ...prev, reconciled: e.target.value }))}
            style={{
              padding: "0.5rem 1rem",
              border: "1px solid #d1d5db",
              borderRadius: "0.375rem",
              fontSize: "0.875rem",
            }}
          >
            <option value="all">All Transactions</option>
            <option value="reconciled">Reconciled Only</option>
            <option value="unreconciled">Unreconciled Only</option>
          </select>

          <select
            value={filters.amountRange}
            onChange={(e) => setFilters((prev) => ({ ...prev, amountRange: e.target.value }))}
            style={{
              padding: "0.5rem 1rem",
              border: "1px solid #d1d5db",
              borderRadius: "0.375rem",
              fontSize: "0.875rem",
            }}
          >
            <option value="All">All Amounts</option>
            <option value="Under $100">Under $100</option>
            <option value="$100 - $500">$100 - $500</option>
            <option value="$500 - $1,000">$500 - $1,000</option>
            <option value="Over $1,000">Over $1,000</option>
          </select>

          <select
            value={filters.dateRange}
            onChange={(e) => setFilters((prev) => ({ ...prev, dateRange: e.target.value }))}
            style={{
              padding: "0.5rem 1rem",
              border: "1px solid #d1d5db",
              borderRadius: "0.375rem",
              fontSize: "0.875rem",
            }}
          >
            <option value="Last 7 Days">Last 7 Days</option>
            <option value="Last 30 Days">Last 30 Days</option>
            <option value="Last 90 Days">Last 90 Days</option>
            <option value="This Year">This Year</option>
            <option value="All Dates">All Dates</option>
          </select>

          <button
            onClick={handleBulkReconcile}
            disabled={reconciling || loading || !hasOpenPeriod}
            style={{
              padding: "0.5rem 1rem",
              backgroundColor: reconciling || !hasOpenPeriod ? "#6b7280" : "#10b981",
              color: "white",
              border: "none",
              borderRadius: "0.375rem",
              cursor: reconciling || loading || !hasOpenPeriod ? "not-allowed" : "pointer",
              fontSize: "0.875rem",
              fontWeight: 500,
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              opacity: reconciling || loading || !hasOpenPeriod ? 0.7 : 1,
            }}
          >
            <FontAwesomeIcon icon={faCheckCircle} />
            {reconciling ? "Reconciling…" : "Reconcile All"}
          </button>
        </div>
      </div>

      <div
        style={{
          backgroundColor: "white",
          borderRadius: "0.5rem",
          boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "1.5rem",
            borderBottom: "1px solid #e5e7eb",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <h2 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 600, color: "#111827" }}>
            Bank Transactions ({transactions.length})
          </h2>
          {!hasOpenPeriod && (
            <span style={{ fontSize: "0.8125rem", color: "#92400e" }}>
              Start a period to clear transactions
            </span>
          )}
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: "2rem" }}>
            <div>Loading bank transactions...</div>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead style={{ backgroundColor: "#f9fafb" }}>
                <tr>
                  {thSortable("date", "Date", "left")}
                  {thSortable("description", "Description", "left")}
                  {thSortable("amount", "Amount", "right")}
                  {thSortable("type", "Type", "center")}
                  {thSortable("status", "Status", "center")}
                  <th
                    style={{
                      padding: "0.75rem 1.5rem",
                      textAlign: "center",
                      fontSize: "0.875rem",
                      fontWeight: 600,
                      color: "#374151",
                      borderBottom: "1px solid #e5e7eb",
                    }}
                  >
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedTransactions.map((transaction) => (
                  <tr key={transaction.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                    <td style={{ padding: "1rem 1.5rem" }}>
                      <div style={{ fontSize: "0.875rem", color: "#111827" }}>
                        {formatDate(transaction.date)}
                      </div>
                    </td>
                    <td style={{ padding: "1rem 1.5rem" }}>
                      <div>
                        <div style={{ fontSize: "0.875rem", color: "#111827", fontWeight: 500 }}>
                          {transaction.description}
                        </div>
                        {transaction.reference && (
                          <div style={{ fontSize: "0.75rem", color: "#6b7280" }}>
                            Ref: {transaction.reference}
                          </div>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: "1rem 1.5rem", textAlign: "right" }}>
                      <span
                        style={{
                          fontSize: "0.875rem",
                          fontWeight: 600,
                          color: transaction.amount >= 0 ? "#10b981" : "#ef4444",
                        }}
                      >
                        {transaction.amount >= 0 ? "+" : ""}
                        {formatCurrency(transaction.amount)}
                      </span>
                    </td>
                    <td style={{ padding: "1rem 1.5rem", textAlign: "center" }}>
                      <span
                        style={{
                          padding: "0.25rem 0.75rem",
                          borderRadius: "9999px",
                          fontSize: "0.75rem",
                          fontWeight: 500,
                          backgroundColor: transaction.type === "credit" ? "#dcfce7" : "#fef2f2",
                          color: transaction.type === "credit" ? "#065f46" : "#991b1b",
                        }}
                      >
                        {transaction.type.toUpperCase()}
                      </span>
                    </td>
                    <td style={{ padding: "1rem 1.5rem", textAlign: "center" }}>
                      {transaction.reconciled ? (
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.25rem",
                            padding: "0.25rem 0.75rem",
                            borderRadius: "0.375rem",
                            fontSize: "0.75rem",
                            fontWeight: 500,
                            color: "#065f46",
                            backgroundColor: "#dcfce7",
                          }}
                        >
                          <FontAwesomeIcon icon={faCheckCircle} style={{ fontSize: "0.625rem" }} />
                          Reconciled
                        </span>
                      ) : (
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.25rem",
                            padding: "0.25rem 0.75rem",
                            borderRadius: "0.375rem",
                            fontSize: "0.75rem",
                            fontWeight: 500,
                            color: "#d97706",
                            backgroundColor: "#fef3c7",
                          }}
                        >
                          <FontAwesomeIcon
                            icon={faExclamationTriangle}
                            style={{ fontSize: "0.625rem" }}
                          />
                          Pending
                        </span>
                      )}
                    </td>
                    <td style={{ padding: "1rem 1.5rem", textAlign: "center" }}>
                      <button
                        onClick={() => handleReconcile(transaction.id)}
                        disabled={reconciling || !hasOpenPeriod}
                        style={{
                          padding: "0.25rem 0.75rem",
                          backgroundColor:
                            reconciling || !hasOpenPeriod
                              ? "#9ca3af"
                              : transaction.reconciled
                                ? "#ef4444"
                                : "#10b981",
                          color: "white",
                          border: "none",
                          borderRadius: "0.25rem",
                          cursor: reconciling || !hasOpenPeriod ? "not-allowed" : "pointer",
                          fontSize: "0.75rem",
                          fontWeight: 500,
                          opacity: reconciling || !hasOpenPeriod ? 0.7 : 1,
                        }}
                      >
                        <FontAwesomeIcon
                          icon={transaction.reconciled ? faExclamationTriangle : faCheckCircle}
                          style={{ marginRight: "0.25rem" }}
                        />
                        {reconciling
                          ? "Updating…"
                          : transaction.reconciled
                            ? "Unreconcile"
                            : "Reconcile"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {transactions.length === 0 && !loading && (
          <div style={{ textAlign: "center", padding: "2rem", color: "#6b7280" }}>
            No bank transactions found matching the current filters.
          </div>
        )}
      </div>
    </div>
  );
};

export default BankReconciliation;
