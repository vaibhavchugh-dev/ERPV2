import React, { useCallback, useEffect, useState } from "react";
import { Link, useHistory } from "react-router-dom";
import { toast } from "react-toastify";
import { AccountingService } from "../../Common/Services/AccountingService";
import MasterListPage, {
  ColumnConfig,
} from "../../Common/Components/MasterListPage/MasterListPage";
import { useSiteListFilter } from "../../Common/Hooks/useSiteListFilter";
import PayrollJournalsHelp from "./PayrollJournalsHelp";
import "./JournalEntries.scss";

type PayrollLinkRow = {
  id: number;
  source: string;
  externalRunId?: string | null;
  providerName?: string | null;
  referenceNumber: string;
  payPeriodStart?: string | null;
  payPeriodEnd?: string | null;
  payDate?: string | null;
  journalEntryId: number;
  status: string;
  description?: string | null;
  totalDebits?: number | null;
  locationId: number;
  createdUtc: string;
  paymentJournalEntryId?: number | null;
  paymentAmount?: number | null;
  taxRemittanceJournalEntryId?: number | null;
  taxRemittanceAmount?: number | null;
  suggestedNetPay?: number | null;
  remainingNetPay?: number | null;
};

type TaxLine = {
  bucketKey: string;
  label: string;
  accountId: number;
  amount: number;
  selected: boolean;
};

const ymd = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const fmtDate = (v?: string | null) => {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleDateString();
};

const fmtMoney = (n?: number | null) =>
  n != null
    ? n.toLocaleString(undefined, { style: "currency", currency: "USD" })
    : "—";

const PayrollJournalLinks: React.FC = () => {
  const history = useHistory();
  const { locationIdParam, masterListFilter } = useSiteListFilter();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<PayrollLinkRow[]>([]);
  const [total, setTotal] = useState(0);
  const [filterStart, setFilterStart] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 6);
    return ymd(d);
  });
  const [filterEnd, setFilterEnd] = useState(() => ymd(new Date()));
  const [source, setSource] = useState("");
  const [helpOpen, setHelpOpen] = useState(false);

  const [cashLink, setCashLink] = useState<PayrollLinkRow | null>(null);
  const [cashMode, setCashMode] = useState<"payment" | "tax" | null>(null);
  const [cashLoading, setCashLoading] = useState(false);
  const [cashPosting, setCashPosting] = useState(false);
  const [suggestedNet, setSuggestedNet] = useState(0);
  const [remainingNet, setRemainingNet] = useState(0);
  const [paidAmount, setPaidAmount] = useState(0);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(() => ymd(new Date()));
  const [taxLines, setTaxLines] = useState<TaxLine[]>([]);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await AccountingService.ListPayrollJournalLinks({
        startDate: filterStart,
        endDate: filterEnd,
        source: source || undefined,
        take: 200,
        locationId: locationIdParam,
      });
      setItems(res?.items || []);
      setTotal(res?.total || 0);
    } catch (e) {
      console.error(e);
      toast.error("Failed to load payroll journals.");
    } finally {
      setLoading(false);
    }
  }, [filterStart, filterEnd, source, locationIdParam]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  const openCashModal = async (row: PayrollLinkRow, mode: "payment" | "tax") => {
    setCashLink(row);
    setCashMode(mode);
    setCashLoading(true);
    setPaymentDate(row.payDate ? String(row.payDate).slice(0, 10) : ymd(new Date()));
    try {
      const preview = await AccountingService.GetPayrollCashPreview(row.id);
      const net = Number(preview?.suggestedNetPay || 0);
      const paid = Number(preview?.paidAmount || 0);
      const remaining = Number(
        preview?.remainingNetPay != null
          ? preview.remainingNetPay
          : Math.max(0, net - paid)
      );
      setSuggestedNet(net);
      setPaidAmount(paid);
      setRemainingNet(remaining);
      setPaymentAmount(remaining > 0 ? remaining.toFixed(2) : "");
      const lines: TaxLine[] = (preview?.taxPayableLines || []).map((l: any) => ({
        bucketKey: l.bucketKey,
        label: l.label,
        accountId: l.accountId,
        amount: Number(l.amount || 0),
        selected: true,
      }));
      setTaxLines(lines);
      if (mode === "payment" && remaining <= 0) {
        toast.info("Net pay is already fully paid for this period.");
      }
      if (mode === "tax" && preview?.taxRemittanceAlreadyPosted) {
        toast.info("Tax remittance already posted for this period.");
      }
    } catch (e: any) {
      toast.error(
        e?.response?.data?.error || e?.message || "Failed to load cash preview."
      );
      setCashLink(null);
      setCashMode(null);
    } finally {
      setCashLoading(false);
    }
  };

  const closeCashModal = () => {
    setCashLink(null);
    setCashMode(null);
    setTaxLines([]);
  };

  const submitPayment = async () => {
    if (!cashLink) return;
    const amount = Number(paymentAmount);
    if (!(amount > 0)) {
      toast.error("Enter a payment amount greater than zero.");
      return;
    }
    if (remainingNet > 0 && amount > remainingNet + 0.009) {
      toast.error(
        `Amount cannot exceed remaining net pay (${fmtMoney(remainingNet)}).`
      );
      return;
    }
    setCashPosting(true);
    try {
      const result = await AccountingService.PostPayrollNetPayment({
        linkId: cashLink.id,
        amount,
        paymentDate,
      });
      toast.success(
        result?.message ||
          (result?.alreadyExists
            ? "Payment journal already existed."
            : `Posted net-pay payment JE #${result?.journalEntryId}.`)
      );
      closeCashModal();
      await loadList();
    } catch (e: any) {
      toast.error(
        e?.response?.data?.error || e?.message || "Payment post failed."
      );
    } finally {
      setCashPosting(false);
    }
  };

  const submitTaxRemittance = async () => {
    if (!cashLink) return;
    const lines = taxLines
      .filter((l) => l.selected && l.amount > 0)
      .map((l) => ({
        accountId: l.accountId,
        amount: l.amount,
        description: l.label,
      }));
    if (lines.length === 0) {
      toast.error("Select at least one tax/deduction payable line.");
      return;
    }
    setCashPosting(true);
    try {
      const result = await AccountingService.PostPayrollTaxRemittance({
        linkId: cashLink.id,
        paymentDate,
        lines,
      });
      toast.success(
        result?.alreadyExists
          ? "Tax remittance already existed."
          : `Posted tax remittance JE #${result?.journalEntryId}.`
      );
      closeCashModal();
      await loadList();
    } catch (e: any) {
      toast.error(
        e?.response?.data?.error || e?.message || "Remittance post failed."
      );
    } finally {
      setCashPosting(false);
    }
  };

  const columns: ColumnConfig<PayrollLinkRow>[] = [
    {
      key: "payDate",
      label: "Pay date",
      sortable: true,
      render: (value) => fmtDate(value),
    },
    {
      key: "payPeriodStart",
      label: "Period",
      sortable: true,
      render: (_value, row) =>
        `${fmtDate(row.payPeriodStart)} – ${fmtDate(row.payPeriodEnd)}`,
    },
    {
      key: "referenceNumber",
      label: "Reference",
      sortable: true,
      locked: true,
      render: (_value, row) => (
        <>
          <strong>{row.referenceNumber}</strong>
          {row.description ? (
            <div className="je-muted">{row.description}</div>
          ) : null}
        </>
      ),
    },
    {
      key: "source",
      label: "Source",
      sortable: true,
      render: (_value, row) => (
        <>
          {row.source}
          {row.externalRunId ? (
            <div className="je-muted">Run #{row.externalRunId}</div>
          ) : null}
        </>
      ),
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      render: (value) => value || "—",
    },
    {
      key: "journalEntryId",
      label: "Accrual",
      sortable: true,
      render: (_value, row) => (
        <>
          <Link
            to={`/accounts/journal-entries?id=${row.journalEntryId}`}
            onClick={(e) => e.stopPropagation()}
          >
            JE #{row.journalEntryId}
          </Link>
          <div className="je-muted">{fmtMoney(row.totalDebits)}</div>
        </>
      ),
    },
    {
      key: "paymentAmount",
      label: "Net pay",
      sortable: true,
      render: (_value, row) => {
        const remaining = Number(row.remainingNetPay ?? 0);
        if (row.paymentJournalEntryId || Number(row.paymentAmount || 0) > 0) {
          return (
            <>
              {row.paymentJournalEntryId ? (
                <Link
                  to={`/accounts/journal-entries?id=${row.paymentJournalEntryId}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  JE #{row.paymentJournalEntryId}
                </Link>
              ) : (
                <span>Partial</span>
              )}
              <div className="je-muted">
                Paid {fmtMoney(row.paymentAmount)}
                {remaining > 0.009
                  ? ` · Remaining ${fmtMoney(remaining)}`
                  : " · Paid in full"}
              </div>
            </>
          );
        }
        return <span className="je-muted">Not paid</span>;
      },
    },
    {
      key: "taxRemittanceJournalEntryId",
      label: "Tax remittance",
      sortable: true,
      render: (_value, row) =>
        row.taxRemittanceJournalEntryId ? (
          <>
            <Link
              to={`/accounts/journal-entries?id=${row.taxRemittanceJournalEntryId}`}
              onClick={(e) => e.stopPropagation()}
            >
              JE #{row.taxRemittanceJournalEntryId}
            </Link>
            <div className="je-muted">{fmtMoney(row.taxRemittanceAmount)}</div>
          </>
        ) : (
          <span className="je-muted">Not remitted</span>
        ),
    },
    {
      key: "actions",
      label: "Actions",
      locked: true,
      align: "center",
      render: (_value, row) => {
        const remaining = Number(row.remainingNetPay ?? 0);
        const showPay = row.status === "Posted" && remaining > 0.009;
        const showTax =
          !row.taxRemittanceJournalEntryId && row.status === "Posted";
        if (!showPay && !showTax) {
          return <span className="je-muted">—</span>;
        }
        return (
          <div
            className="action-buttons"
            onClick={(e) => e.stopPropagation()}
          >
            {showPay ? (
              <button
                type="button"
                className="btn btn-sm btn-secondary"
                onClick={() => void openCashModal(row, "payment")}
              >
                {Number(row.paymentAmount || 0) > 0
                  ? "Pay remaining"
                  : "Post net pay"}
              </button>
            ) : null}
            {showTax ? (
              <button
                type="button"
                className="btn btn-sm btn-warning"
                onClick={() => void openCashModal(row, "tax")}
              >
                Post tax remittance
              </button>
            ) : null}
          </div>
        );
      },
    },
  ];

  return (
    <div className="journal-entries-page payroll-journals-page">
      <MasterListPage
        title="Payroll Journals"
        subtitle="Accrual journals from CimmplePay, manual entry, or import. After accrual, post net pay and tax remittance when cash leaves the bank."
        columns={columns}
        data={items}
        loading={loading && items.length === 0}
        enablePagination
        onAdd={() => history.push("/accounts/payroll/manual")}
        addButtonLabel="Manual payroll"
        searchPlaceholder="Search reference, JE #, description…"
        searchFields={[
          "id",
          "journalEntryId",
          "paymentJournalEntryId",
          "referenceNumber",
          "description",
          "source",
          "externalRunId",
          "status",
        ]}
        matchRowSearch={(row, q) =>
          String(row.id).includes(q) ||
          String(row.journalEntryId).includes(q) ||
          String(row.paymentJournalEntryId || "").includes(q) ||
          (row.referenceNumber || "").toLowerCase().includes(q) ||
          (row.description || "").toLowerCase().includes(q) ||
          (row.source || "").toLowerCase().includes(q) ||
          (row.externalRunId || "").toLowerCase().includes(q) ||
          (row.status || "").toLowerCase().includes(q)
        }
        getRowId={(row) => row.id}
        columnPreferenceKey="payrollJournalLinks.hiddenColumns"
        emptyMessage={
          total === 0
            ? "No payroll journals in this range. Post from CimmplePay, use Manual payroll or Import CSV, or widen the dates."
            : "No payroll journals match your search."
        }
        customActionButtons={[
          {
            label: loading ? "Loading…" : "Refresh",
            onClick: () => void loadList(),
            disabled: loading,
            className: "btn-secondary",
          },
          {
            label: "Journal Entries",
            onClick: () => history.push("/accounts/journal-entries"),
            className: "btn-secondary",
          },
          {
            label: "Import CSV",
            onClick: () => history.push("/accounts/payroll/import"),
            className: "btn-secondary",
          },
          {
            label: "Help",
            onClick: () => setHelpOpen(true),
            className: "btn-secondary",
          },
        ]}
        filters={[
          masterListFilter,
          {
            label: "Source",
            options: [
              { value: "", label: "All sources" },
              { value: "CimmplePay", label: "CimmplePay" },
              { value: "Manual", label: "Manual" },
              { value: "Import", label: "Import" },
            ],
            value: source,
            onChange: setSource,
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
            <div
              style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}
            >
              <label
                htmlFor="payroll-from"
                style={{
                  fontSize: "0.8125rem",
                  color: "#4b5563",
                  fontWeight: 500,
                }}
              >
                From
              </label>
              <input
                id="payroll-from"
                type="date"
                className="filter-select"
                style={{ paddingRight: "0.75rem", backgroundImage: "none" }}
                value={filterStart}
                onChange={(e) => setFilterStart(e.target.value)}
              />
            </div>
            <div
              style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}
            >
              <label
                htmlFor="payroll-to"
                style={{
                  fontSize: "0.8125rem",
                  color: "#4b5563",
                  fontWeight: 500,
                }}
              >
                To
              </label>
              <input
                id="payroll-to"
                type="date"
                className="filter-select"
                style={{ paddingRight: "0.75rem", backgroundImage: "none" }}
                value={filterEnd}
                onChange={(e) => setFilterEnd(e.target.value)}
              />
            </div>
          </div>
        }
      />

      <PayrollJournalsHelp
        open={helpOpen}
        onOpenChange={setHelpOpen}
        hideTrigger
      />

      {cashLink && cashMode && (
        <div className="je-modal-backdrop" onClick={closeCashModal}>
          <div
            className="je-modal"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 560 }}
          >
            <div className="je-modal-head">
              <h3>
                {cashMode === "payment"
                  ? "Post net-pay payment"
                  : "Post tax remittance"}{" "}
                — {cashLink.referenceNumber}
              </h3>
              <button type="button" onClick={closeCashModal} aria-label="Close">
                ×
              </button>
            </div>
            <div style={{ padding: "1rem 1.25rem" }}>
              {cashLoading ? (
                <p>Loading preview…</p>
              ) : cashMode === "payment" ? (
                <>
                  <p style={{ fontSize: "0.875rem", color: "#6b7280" }}>
                    Creates: <strong>Dr Accrued Payroll</strong> /{" "}
                    <strong>Cr payroll bank</strong>. Suggested net{" "}
                    {fmtMoney(suggestedNet)}
                    {paidAmount > 0
                      ? ` · Already paid ${fmtMoney(paidAmount)}`
                      : ""}
                    {" · "}Remaining {fmtMoney(remainingNet)}. Partial payments
                    are allowed.
                  </p>
                  <label
                    style={{
                      display: "block",
                      marginTop: "0.75rem",
                      fontSize: "0.8rem",
                      fontWeight: 500,
                    }}
                  >
                    Payment date
                    <input
                      type="date"
                      value={paymentDate}
                      onChange={(e) => setPaymentDate(e.target.value)}
                      style={{
                        display: "block",
                        marginTop: "0.35rem",
                        padding: "0.5rem",
                        width: "100%",
                      }}
                    />
                  </label>
                  <label
                    style={{
                      display: "block",
                      marginTop: "0.75rem",
                      fontSize: "0.8rem",
                      fontWeight: 500,
                    }}
                  >
                    Amount (max {fmtMoney(remainingNet)})
                    <input
                      type="number"
                      min={0}
                      max={remainingNet > 0 ? remainingNet : undefined}
                      step="0.01"
                      value={paymentAmount}
                      onChange={(e) => setPaymentAmount(e.target.value)}
                      style={{
                        display: "block",
                        marginTop: "0.35rem",
                        padding: "0.5rem",
                        width: "100%",
                      }}
                    />
                  </label>
                  <div className="je-line-actions">
                    <button
                      type="button"
                      className="btn-primary"
                      disabled={cashPosting}
                      onClick={() => void submitPayment()}
                    >
                      {cashPosting ? "Posting…" : "Post payment journal"}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p style={{ fontSize: "0.875rem", color: "#6b7280" }}>
                    Creates: <strong>Dr tax/deduction payables</strong> /{" "}
                    <strong>Cr payroll bank</strong> for selected lines from the
                    accrual journal.
                  </p>
                  <label
                    style={{
                      display: "block",
                      marginTop: "0.75rem",
                      fontSize: "0.8rem",
                      fontWeight: 500,
                    }}
                  >
                    Remittance date
                    <input
                      type="date"
                      value={paymentDate}
                      onChange={(e) => setPaymentDate(e.target.value)}
                      style={{
                        display: "block",
                        marginTop: "0.35rem",
                        padding: "0.5rem",
                        width: "100%",
                      }}
                    />
                  </label>
                  {taxLines.length === 0 ? (
                    <p style={{ color: "#b91c1c", fontSize: "0.875rem" }}>
                      No tax payable credits found on the accrual JE. Confirm
                      Payroll GL defaults are set and the accrual used those
                      accounts.
                    </p>
                  ) : (
                    <table className="je-table" style={{ marginTop: "0.75rem" }}>
                      <thead>
                        <tr>
                          <th></th>
                          <th>Payable</th>
                          <th style={{ textAlign: "right" }}>Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {taxLines.map((line, idx) => (
                          <tr key={line.accountId}>
                            <td>
                              <input
                                type="checkbox"
                                checked={line.selected}
                                onChange={(e) =>
                                  setTaxLines((prev) =>
                                    prev.map((l, i) =>
                                      i === idx
                                        ? { ...l, selected: e.target.checked }
                                        : l
                                    )
                                  )
                                }
                              />
                            </td>
                            <td>
                              {line.label}
                              <div className="je-muted">
                                Acct #{line.accountId}
                              </div>
                            </td>
                            <td style={{ textAlign: "right" }}>
                              <input
                                type="number"
                                min={0}
                                step="0.01"
                                value={line.amount}
                                disabled={!line.selected}
                                onChange={(e) =>
                                  setTaxLines((prev) =>
                                    prev.map((l, i) =>
                                      i === idx
                                        ? {
                                            ...l,
                                            amount: Number(e.target.value) || 0,
                                          }
                                        : l
                                    )
                                  )
                                }
                                style={{
                                  width: "7rem",
                                  textAlign: "right",
                                  padding: "0.35rem",
                                }}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  <div className="je-line-actions">
                    <button
                      type="button"
                      className="btn-primary"
                      disabled={cashPosting || taxLines.length === 0}
                      onClick={() => void submitTaxRemittance()}
                    >
                      {cashPosting ? "Posting…" : "Post remittance journal"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PayrollJournalLinks;
