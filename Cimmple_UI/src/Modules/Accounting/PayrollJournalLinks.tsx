import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "react-toastify";
import { AccountingService } from "../../Common/Services/AccountingService";
import PayrollJournalsHelp from "./PayrollJournalsHelp";
import "../Masters/CustomerMaster.scss";
import "../../Common/Components/Table.scss";
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

  const [cashLink, setCashLink] = useState<PayrollLinkRow | null>(null);
  const [cashMode, setCashMode] = useState<"payment" | "tax" | null>(null);
  const [cashLoading, setCashLoading] = useState(false);
  const [cashPosting, setCashPosting] = useState(false);
  const [suggestedNet, setSuggestedNet] = useState(0);
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
      });
      setItems(res?.items || []);
      setTotal(res?.total || 0);
    } catch (e) {
      console.error(e);
      toast.error("Failed to load payroll journals.");
    } finally {
      setLoading(false);
    }
  }, [filterStart, filterEnd, source]);

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
      setSuggestedNet(net);
      setPaymentAmount(net > 0 ? net.toFixed(2) : "");
      const lines: TaxLine[] = (preview?.taxPayableLines || []).map((l: any) => ({
        bucketKey: l.bucketKey,
        label: l.label,
        accountId: l.accountId,
        amount: Number(l.amount || 0),
        selected: true,
      }));
      setTaxLines(lines);
      if (mode === "payment" && preview?.paymentAlreadyPosted) {
        toast.info("Net-pay payment already posted for this period.");
      }
      if (mode === "tax" && preview?.taxRemittanceAlreadyPosted) {
        toast.info("Tax remittance already posted for this period.");
      }
    } catch (e: any) {
      toast.error(e?.response?.data?.error || e?.message || "Failed to load cash preview.");
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
    setCashPosting(true);
    try {
      const result = await AccountingService.PostPayrollNetPayment({
        linkId: cashLink.id,
        amount,
        paymentDate,
      });
      toast.success(
        result?.alreadyExists
          ? "Payment journal already existed."
          : `Posted net-pay payment JE #${result?.journalEntryId}.`
      );
      closeCashModal();
      await loadList();
    } catch (e: any) {
      toast.error(e?.response?.data?.error || e?.message || "Payment post failed.");
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
      toast.error(e?.response?.data?.error || e?.message || "Remittance post failed.");
    } finally {
      setCashPosting(false);
    }
  };

  return (
    <div className="journal-entries-page payroll-journals-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Payroll Journals</h1>
          <p className="page-subtitle">
            Accrual journals from CimmplePay, manual entry, or import. After accrual, post net pay
            and tax remittance when cash leaves the bank.
          </p>
        </div>
        <div className="page-actions">
          <Link to="/accounts/journal-entries" className="btn-secondary">
            Journal Entries
          </Link>
          <Link to="/accounts/payroll/import" className="btn-secondary">
            Import CSV
          </Link>
          <Link to="/accounts/payroll/manual" className="btn-primary">
            <span>+</span>
            <span>Manual payroll</span>
          </Link>
          <PayrollJournalsHelp />
        </div>
      </div>

      <div className="page-filters">
        <div className="filter-group payroll-date-filter">
          <span>From</span>
          <input
            type="date"
            className="filter-date-input"
            value={filterStart}
            onChange={(e) => setFilterStart(e.target.value)}
          />
        </div>
        <div className="filter-group payroll-date-filter">
          <span>To</span>
          <input
            type="date"
            className="filter-date-input"
            value={filterEnd}
            onChange={(e) => setFilterEnd(e.target.value)}
          />
        </div>
        <div className="filter-group">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
          </svg>
          <select
            className="filter-select"
            value={source}
            onChange={(e) => setSource(e.target.value)}
          >
            <option value="">All sources</option>
            <option value="CimmplePay">CimmplePay</option>
            <option value="Manual">Manual</option>
            <option value="Import">Import</option>
          </select>
        </div>
        <button type="button" className="btn-secondary" onClick={loadList} disabled={loading}>
          Refresh
        </button>
      </div>

      <div className="table-card">
        <div className="table-wrapper">
          {loading ? (
            <p className="payroll-list-status">Loading…</p>
          ) : items.length === 0 ? (
            <p className="payroll-list-status">
              No payroll journals in this range. Post from CimmplePay, use Manual payroll or Import
              CSV, or widen the dates.
            </p>
          ) : (
            <>
              <p className="payroll-list-count">{total} payroll period(s)</p>
              <table className="customers-table">
                <thead>
                  <tr>
                    <th>Pay date</th>
                    <th>Period</th>
                    <th>Reference</th>
                    <th>Source</th>
                    <th>Accrual</th>
                    <th>Net pay</th>
                    <th>Tax remittance</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((row) => (
                    <tr key={row.id}>
                      <td>{fmtDate(row.payDate)}</td>
                      <td>
                        {fmtDate(row.payPeriodStart)} – {fmtDate(row.payPeriodEnd)}
                      </td>
                      <td>
                        <strong>{row.referenceNumber}</strong>
                        {row.description ? (
                          <div className="je-muted">{row.description}</div>
                        ) : null}
                      </td>
                      <td>
                        {row.source}
                        {row.externalRunId ? (
                          <div className="je-muted">Run #{row.externalRunId}</div>
                        ) : null}
                      </td>
                      <td>
                        <Link to={`/accounts/journal-entries?id=${row.journalEntryId}`}>
                          JE #{row.journalEntryId}
                        </Link>
                        <div className="je-muted">{fmtMoney(row.totalDebits)}</div>
                      </td>
                      <td>
                        {row.paymentJournalEntryId ? (
                          <>
                            <Link to={`/accounts/journal-entries?id=${row.paymentJournalEntryId}`}>
                              JE #{row.paymentJournalEntryId}
                            </Link>
                            <div className="je-muted">{fmtMoney(row.paymentAmount)}</div>
                          </>
                        ) : (
                          <span className="je-muted">Not paid</span>
                        )}
                      </td>
                      <td>
                        {row.taxRemittanceJournalEntryId ? (
                          <>
                            <Link to={`/accounts/journal-entries?id=${row.taxRemittanceJournalEntryId}`}>
                              JE #{row.taxRemittanceJournalEntryId}
                            </Link>
                            <div className="je-muted">{fmtMoney(row.taxRemittanceAmount)}</div>
                          </>
                        ) : (
                          <span className="je-muted">Not remitted</span>
                        )}
                      </td>
                      <td>
                        <div className="action-buttons">
                          {!row.paymentJournalEntryId && row.status === "Posted" ? (
                            <button
                              type="button"
                              className="btn btn-sm btn-secondary"
                              onClick={() => void openCashModal(row, "payment")}
                            >
                              Post net pay
                            </button>
                          ) : null}
                          {!row.taxRemittanceJournalEntryId && row.status === "Posted" ? (
                            <button
                              type="button"
                              className="btn btn-sm btn-warning"
                              onClick={() => void openCashModal(row, "tax")}
                            >
                              Post tax remittance
                            </button>
                          ) : null}
                          {row.paymentJournalEntryId && row.taxRemittanceJournalEntryId ? (
                            <span className="je-muted">—</span>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>

      {cashLink && cashMode && (
        <div className="je-modal-backdrop" onClick={closeCashModal}>
          <div className="je-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <div className="je-modal-head">
              <h3>
                {cashMode === "payment" ? "Post net-pay payment" : "Post tax remittance"} —{" "}
                {cashLink.referenceNumber}
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
                    Creates: <strong>Dr Accrued Payroll</strong> / <strong>Cr payroll bank</strong>.
                    Suggested from accrual JE credit to Net Pay account: {fmtMoney(suggestedNet)}.
                  </p>
                  <label style={{ display: "block", marginTop: "0.75rem", fontSize: "0.8rem", fontWeight: 500 }}>
                    Payment date
                    <input
                      type="date"
                      value={paymentDate}
                      onChange={(e) => setPaymentDate(e.target.value)}
                      style={{ display: "block", marginTop: "0.35rem", padding: "0.5rem", width: "100%" }}
                    />
                  </label>
                  <label style={{ display: "block", marginTop: "0.75rem", fontSize: "0.8rem", fontWeight: 500 }}>
                    Amount
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={paymentAmount}
                      onChange={(e) => setPaymentAmount(e.target.value)}
                      style={{ display: "block", marginTop: "0.35rem", padding: "0.5rem", width: "100%" }}
                    />
                  </label>
                  <div className="je-line-actions">
                    <button type="button" className="je-submit" disabled={cashPosting} onClick={() => void submitPayment()}>
                      {cashPosting ? "Posting…" : "Post payment journal"}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p style={{ fontSize: "0.875rem", color: "#6b7280" }}>
                    Creates: <strong>Dr tax/deduction payables</strong> / <strong>Cr payroll bank</strong> for
                    selected lines from the accrual journal.
                  </p>
                  <label style={{ display: "block", marginTop: "0.75rem", fontSize: "0.8rem", fontWeight: 500 }}>
                    Remittance date
                    <input
                      type="date"
                      value={paymentDate}
                      onChange={(e) => setPaymentDate(e.target.value)}
                      style={{ display: "block", marginTop: "0.35rem", padding: "0.5rem", width: "100%" }}
                    />
                  </label>
                  {taxLines.length === 0 ? (
                    <p style={{ color: "#b91c1c", fontSize: "0.875rem" }}>
                      No tax payable credits found on the accrual JE. Confirm Payroll GL defaults are set and
                      the accrual used those accounts.
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
                                      i === idx ? { ...l, selected: e.target.checked } : l
                                    )
                                  )
                                }
                              />
                            </td>
                            <td>
                              {line.label}
                              <div className="je-muted">Acct #{line.accountId}</div>
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
                                        ? { ...l, amount: Number(e.target.value) || 0 }
                                        : l
                                    )
                                  )
                                }
                                style={{ width: "7rem", textAlign: "right", padding: "0.35rem" }}
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
                      className="je-submit"
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
