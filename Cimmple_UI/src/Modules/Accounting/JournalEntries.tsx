import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "react-toastify";
import { AccountingService } from "../../Common/Services/AccountingService";
import {
  ChartofAccountsService,
  ChartofAccountMaster,
} from "../../Common/Services/ChartofAccountsService";
import "./JournalEntries.scss";

type LineDraft = {
  key: string;
  accountId: number;
  debit: string;
  credit: string;
  description: string;
};

const ymdLocal = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const newLine = (): LineDraft => ({
  key: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
  accountId: 0,
  debit: "",
  credit: "",
  description: "",
});

const getPaymentKind = (row: {
  referenceNumber?: string;
  description?: string;
}): "received" | "paid" | null => {
  const ref = (row.referenceNumber || "").toUpperCase();
  const desc = (row.description || "").toLowerCase();

  if (ref.startsWith("ARPMT-") || desc.includes("customer payment")) {
    return "received";
  }
  if (ref.startsWith("APPMT-") || desc.includes("vendor payment")) {
    return "paid";
  }
  return null;
};

const JournalEntries: React.FC = () => {
  const [accounts, setAccounts] = useState<ChartofAccountMaster[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [items, setItems] = useState<
    Array<{
      id: number;
      entryDate: string;
      referenceNumber: string;
      description: string;
      totalAmount: number;
      reversesJournalEntryId?: number | null;
      reversedByJournalEntryId?: number | null;
    }>
  >([]);
  const [total, setTotal] = useState(0);

  const [filterStart, setFilterStart] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return ymdLocal(d);
  });
  const [filterEnd, setFilterEnd] = useState(() => ymdLocal(new Date()));

  const [entryDate, setEntryDate] = useState(() => ymdLocal(new Date()));
  const [referenceNumber, setReferenceNumber] = useState("");
  const [headerDescription, setHeaderDescription] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([newLine(), newLine()]);
  const [posting, setPosting] = useState(false);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState<any>(null);
  const [reversing, setReversing] = useState(false);

  const storageTenant = useMemo(() => {
    try {
      const s = JSON.parse(localStorage.getItem("storage") || "{}");
      return Number(s?.tenantID) || 0;
    } catch {
      return 0;
    }
  }, []);

  const loadAccounts = useCallback(async () => {
    const rows = await ChartofAccountsService.GetChartofAccounts({
      tenantid: storageTenant,
    });
    setAccounts((rows || []).filter((a) => a.isActive));
  }, [storageTenant]);

  const loadList = useCallback(async () => {
    setListLoading(true);
    try {
      const res = await AccountingService.ListJournalEntries({
        startDate: filterStart,
        endDate: filterEnd,
        skip: 0,
        take: 200,
      });
      if (res) {
        setItems(res.items || []);
        setTotal(res.total);
      }
    } catch (e) {
      console.error(e);
      toast.error("Failed to load journal entries.");
    } finally {
      setListLoading(false);
    }
  }, [filterStart, filterEnd]);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  const parseAmt = (s: string) => {
    const n = parseFloat(String(s).replace(/,/g, ""));
    return Number.isFinite(n) ? n : 0;
  };

  const { totalDebit, totalCredit, balanced } = useMemo(() => {
    let d = 0,
      c = 0;
    for (const ln of lines) {
      d += parseAmt(ln.debit);
      c += parseAmt(ln.credit);
    }
    const td = Math.round(d * 100) / 100;
    const tc = Math.round(c * 100) / 100;
    return {
      totalDebit: td,
      totalCredit: tc,
      balanced: Math.abs(td - tc) < 0.02,
    };
  }, [lines]);

  const openDetail = async (id: number) => {
    setDetailOpen(true);
    setDetail(null);
    setDetailLoading(true);
    try {
      const row = await AccountingService.GetJournalEntry(id);
      setDetail(row);
    } catch (e) {
      console.error(e);
      toast.error("Failed to load entry detail.");
      setDetailOpen(false);
    } finally {
      setDetailLoading(false);
    }
  };

  const postReversal = async () => {
    if (!detail?.id) return;
    if (
      !window.confirm(
        "Post a reversing journal entry (swap debits and credits) dated today?"
      )
    ) {
      return;
    }
    setReversing(true);
    try {
      await AccountingService.ReverseJournalEntry({
        sourceJournalEntryId: detail.id,
      });
      toast.success("Reversal posted.");
      setDetailOpen(false);
      await loadList();
    } catch (e: any) {
      const msg =
        e?.response?.data?.error || e?.message || "Reversal failed.";
      toast.error(msg);
    } finally {
      setReversing(false);
    }
  };

  const submitEntry = async () => {
    if (!balanced || totalDebit < 0.01) {
      toast.error("Debits must equal credits and be non-zero.");
      return;
    }
    const payloadLines: Array<{
      accountId: number;
      debit: number;
      credit: number;
      description?: string;
    }> = [];
    for (const ln of lines) {
      const d = Math.round(parseAmt(ln.debit) * 100) / 100;
      const c = Math.round(parseAmt(ln.credit) * 100) / 100;
      if (d === 0 && c === 0) continue;
      if (!ln.accountId) {
        toast.error("Each line needs an account.");
        return;
      }
      if (d > 0 && c > 0) {
        toast.error("Each line must be either debit or credit, not both.");
        return;
      }
      payloadLines.push({
        accountId: ln.accountId,
        debit: d,
        credit: c,
        description: ln.description.trim() || undefined,
      });
    }
    if (payloadLines.length < 2) {
      toast.error("At least two non-zero lines are required.");
      return;
    }

    setPosting(true);
    try {
      await AccountingService.CreateJournalEntry({
        entryDate: entryDate,
        referenceNumber: referenceNumber.trim() || undefined,
        description: headerDescription.trim() || undefined,
        lines: payloadLines,
      });
      toast.success("Journal entry posted.");
      setReferenceNumber("");
      setHeaderDescription("");
      setLines([newLine(), newLine()]);
      await loadList();
    } catch (e: any) {
      const msg =
        e?.response?.data?.error || e?.message || "Failed to post entry.";
      toast.error(msg);
    } finally {
      setPosting(false);
    }
  };

  const accountOptions = accounts
    .slice()
    .sort((a, b) =>
      (a.accountCode || "").localeCompare(b.accountCode || "")
    );

  return (
    <div className="journal-entries-page">
      <div className="je-header">
        <h1>Journal entries</h1>
        <p>
          Post balanced debits and credits to the general ledger. Amounts flow
          into financial reports that use posted journals. Closed periods block
          new posts — manage under{" "}
          <Link to="/accounts/periods">Period close &amp; audit</Link>.
        </p>
      </div>

      <div className="je-panel">
        <h2>Posted entries</h2>
        <div className="je-filters">
          <div>
            <label>From</label>
            <input
              type="date"
              value={filterStart}
              onChange={(e) => setFilterStart(e.target.value)}
            />
          </div>
          <div>
            <label>To</label>
            <input
              type="date"
              value={filterEnd}
              onChange={(e) => setFilterEnd(e.target.value)}
            />
          </div>
          <button type="button" onClick={loadList} disabled={listLoading}>
            {listLoading ? "Loading…" : "Refresh"}
          </button>
        </div>
        <p style={{ fontSize: "0.8rem", color: "#6b7280", marginTop: "0.75rem" }}>
          Showing {items.length} of {total} in range.
        </p>
        <div className="je-table-wrap" style={{ marginTop: "0.5rem" }}>
          <table className="je-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Reference</th>
                <th>Description</th>
                <th>Status</th>
                <th style={{ textAlign: "right" }}>Balanced amount</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && !listLoading ? (
                <tr>
                  <td colSpan={5} style={{ color: "#6b7280" }}>
                    No journal headers in this period.
                  </td>
                </tr>
              ) : (
                items.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => openDetail(r.id)}
                    className={
                      getPaymentKind(r) === "received"
                        ? "je-row-received"
                        : getPaymentKind(r) === "paid"
                          ? "je-row-paid"
                          : ""
                    }
                  >
                    <td>{r.entryDate}</td>
                    <td>{r.referenceNumber}</td>
                    <td>{r.description}</td>
                    <td style={{ fontSize: "0.8rem", color: "#6b7280" }}>
                      {getPaymentKind(r) === "received" ? (
                        <span className="je-entry-badge je-entry-badge--received">
                          Received
                        </span>
                      ) : getPaymentKind(r) === "paid" ? (
                        <span className="je-entry-badge je-entry-badge--paid">
                          Paid
                        </span>
                      ) : r.reversedByJournalEntryId ? (
                        `Reversed (#${r.reversedByJournalEntryId})`
                      ) : r.reversesJournalEntryId ? (
                        `Reversal of #${r.reversesJournalEntryId}`
                      ) : (
                        "—"
                      )}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      {r.totalAmount != null
                        ? r.totalAmount.toLocaleString("en-US", {
                            style: "currency",
                            currency: "USD",
                          })
                        : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="je-panel">
        <h2>New journal entry</h2>
        <div className="je-form-grid">
          <div>
            <label>Entry date</label>
            <input
              type="date"
              value={entryDate}
              onChange={(e) => setEntryDate(e.target.value)}
            />
          </div>
          <div>
            <label>Reference (optional)</label>
            <input
              value={referenceNumber}
              onChange={(e) => setReferenceNumber(e.target.value)}
              placeholder="Auto-generated if blank"
            />
          </div>
          <div>
            <label>Header memo (optional)</label>
            <input
              value={headerDescription}
              onChange={(e) => setHeaderDescription(e.target.value)}
            />
          </div>
        </div>

        <div className="je-lines">
          {lines.map((ln, idx) => (
            <div className="je-line-row" key={ln.key}>
              <div>
                <label>Account</label>
                <select
                  value={ln.accountId || ""}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    const next = [...lines];
                    next[idx] = { ...ln, accountId: v };
                    setLines(next);
                  }}
                >
                  <option value="">Select…</option>
                  {accountOptions.map((a) => (
                    <option key={a.accountID} value={a.accountID}>
                      {a.accountCode} — {a.accountName}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label>Debit</label>
                <input
                  inputMode="decimal"
                  value={ln.debit}
                  onChange={(e) => {
                    const next = [...lines];
                    next[idx] = { ...ln, debit: e.target.value, credit: "" };
                    setLines(next);
                  }}
                  placeholder="0.00"
                />
              </div>
              <div>
                <label>Credit</label>
                <input
                  inputMode="decimal"
                  value={ln.credit}
                  onChange={(e) => {
                    const next = [...lines];
                    next[idx] = { ...ln, credit: e.target.value, debit: "" };
                    setLines(next);
                  }}
                  placeholder="0.00"
                />
              </div>
              <button
                type="button"
                className="je-remove"
                onClick={() => {
                  if (lines.length <= 2) {
                    toast.info("Keep at least two lines.");
                    return;
                  }
                  setLines(lines.filter((_, i) => i !== idx));
                }}
              >
                Remove
              </button>
            </div>
          ))}
        </div>

        <div
          className={`je-balance ${balanced && totalDebit > 0 ? "" : "je-unbalanced"}`}
        >
          Debits: <strong>{totalDebit.toFixed(2)}</strong> · Credits:{" "}
          <strong>{totalCredit.toFixed(2)}</strong>
          {balanced && totalDebit > 0
            ? " · Balanced"
            : " · Must balance before posting"}
        </div>

        <div className="je-line-actions">
          <button
            type="button"
            className="je-add-line"
            onClick={() => setLines([...lines, newLine()])}
          >
            Add line
          </button>
          <button
            type="button"
            className="je-submit"
            disabled={posting || !balanced || totalDebit < 0.01}
            onClick={submitEntry}
          >
            {posting ? "Posting…" : "Post entry"}
          </button>
        </div>
      </div>

      {detailOpen && (
        <div
          className="je-modal-backdrop"
          role="presentation"
          onClick={() => setDetailOpen(false)}
        >
          <div
            className="je-modal"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="je-modal-head">
              <h3>Journal detail</h3>
              <button type="button" onClick={() => setDetailOpen(false)}>
                ×
              </button>
            </div>
            <div className="je-modal-body">
              {detailLoading && <p>Loading…</p>}
              {!detailLoading && detail && (
                <>
                  <p style={{ marginTop: 0 }}>
                    <strong>Date:</strong> {detail.entryDate} ·{" "}
                    <strong>Ref:</strong> {detail.referenceNumber}
                  </p>
                  <p>
                    <strong>Description:</strong> {detail.description}
                  </p>
                  {detail.reversesJournalEntryId ? (
                    <p style={{ fontSize: "0.85rem", color: "#6b7280" }}>
                      Reverses journal #{detail.reversesJournalEntryId}
                    </p>
                  ) : null}
                  {detail.reversedByJournalEntryId ? (
                    <p style={{ fontSize: "0.85rem", color: "#b45309" }}>
                      Reversed by journal #{detail.reversedByJournalEntryId}
                    </p>
                  ) : null}
                  <table className="je-table">
                    <thead>
                      <tr>
                        <th>Account</th>
                        <th style={{ textAlign: "right" }}>Debit</th>
                        <th style={{ textAlign: "right" }}>Credit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(detail.lines || []).map((ln: any, i: number) => (
                        <tr key={i}>
                          <td>
                            {ln.accountCode} {ln.accountName}
                            {ln.description ? (
                              <div
                                style={{
                                  fontSize: "0.75rem",
                                  color: "#6b7280",
                                }}
                              >
                                {ln.description}
                              </div>
                            ) : null}
                          </td>
                          <td style={{ textAlign: "right" }}>
                            {Number(ln.debit) > 0
                              ? Number(ln.debit).toFixed(2)
                              : "—"}
                          </td>
                          <td style={{ textAlign: "right" }}>
                            {Number(ln.credit) > 0
                              ? Number(ln.credit).toFixed(2)
                              : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="je-balance">
                    Totals — Debit:{" "}
                    <strong>{Number(detail.totalDebit).toFixed(2)}</strong> ·
                    Credit:{" "}
                    <strong>{Number(detail.totalCredit).toFixed(2)}</strong>
                  </p>
                  <div style={{ marginTop: "1rem" }}>
                    <button
                      type="button"
                      className="je-submit"
                      style={{ background: "#7c2d12" }}
                      disabled={
                        reversing || !!detail.reversedByJournalEntryId
                      }
                      onClick={(e) => {
                        e.stopPropagation();
                        postReversal();
                      }}
                    >
                      {reversing ? "Posting…" : "Post reversal"}
                    </button>
                    {detail.reversedByJournalEntryId ? (
                      <span
                        style={{
                          marginLeft: "0.75rem",
                          fontSize: "0.85rem",
                          color: "#6b7280",
                        }}
                      >
                        Remove the reversal entry first if you need to adjust
                        again.
                      </span>
                    ) : null}
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

export default JournalEntries;
