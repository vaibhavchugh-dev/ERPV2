import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useHistory, useLocation } from "react-router-dom";
import { toast } from "react-toastify";
import { AccountingService } from "../../Common/Services/AccountingService";
import {
  ChartofAccountsService,
  ChartofAccountMaster,
} from "../../Common/Services/ChartofAccountsService";
import MasterListPage, {
  ColumnConfig,
} from "../../Common/Components/MasterListPage/MasterListPage";
import { useSiteListFilter } from "../../Common/Hooks/useSiteListFilter";
import { matchJeNumber, matchAmountValue, matchDateValue } from "../../Common/Utils/listSearchMatch";
import "./JournalEntries.scss";

type LineDraft = {
  key: string;
  accountId: number;
  debit: string;
  credit: string;
  description: string;
};

type JournalRow = {
  id: number;
  entryDate: string;
  referenceNumber: string;
  description: string;
  totalAmount: number;
  reversesJournalEntryId?: number | null;
  reversedByJournalEntryId?: number | null;
  statusLabel: string;
  paymentKind: "received" | "paid" | null;
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

const statusLabelFor = (row: {
  referenceNumber?: string;
  description?: string;
  reversesJournalEntryId?: number | null;
  reversedByJournalEntryId?: number | null;
}): string => {
  const kind = getPaymentKind(row);
  if (kind === "received") return "Received";
  if (kind === "paid") return "Paid";
  if (row.reversedByJournalEntryId) return `Reversed (#${row.reversedByJournalEntryId})`;
  if (row.reversesJournalEntryId) return `Reversal of #${row.reversesJournalEntryId}`;
  return "—";
};

const JournalEntries: React.FC = () => {
  const location = useLocation();
  const history = useHistory();
  const formRef = useRef<HTMLDivElement>(null);
  const { locationIdParam, masterListFilter } = useSiteListFilter();
  const [accounts, setAccounts] = useState<ChartofAccountMaster[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [items, setItems] = useState<JournalRow[]>([]);
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
  const [showNewEntry, setShowNewEntry] = useState(false);

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
        locationId: locationIdParam,
      });
      if (res) {
        const rows: JournalRow[] = (res.items || []).map((r: any) => ({
          ...r,
          statusLabel: statusLabelFor(r),
          paymentKind: getPaymentKind(r),
        }));
        setItems(rows);
        setTotal(res.total);
      }
    } catch (e) {
      console.error(e);
      toast.error("Failed to load journal entries.");
    } finally {
      setListLoading(false);
    }
  }, [filterStart, filterEnd, locationIdParam]);

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

  const openDetail = useCallback(async (id: number) => {
    setDetailOpen(true);
    setDetail(null);
    setDetailLoading(true);
    try {
      const row = await AccountingService.GetJournalEntry(id);
      setDetail(row);
      if (row?.entryDate) {
        const ed = ymdLocal(new Date(row.entryDate));
        setFilterStart((prev) => (ed < prev ? ed : prev));
        setFilterEnd((prev) => (ed > prev ? ed : prev));
      }
    } catch (e) {
      console.error(e);
      toast.error("Failed to load entry detail.");
      setDetailOpen(false);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search || "");
    const raw = params.get("id") || params.get("highlight");
    const journalId = raw ? Number.parseInt(raw, 10) : 0;
    if (!Number.isFinite(journalId) || journalId <= 0) {
      return;
    }
    void openDetail(journalId);
    params.delete("id");
    params.delete("highlight");
    const qs = params.toString();
    history.replace({
      pathname: location.pathname,
      search: qs ? `?${qs}` : "",
    });
  }, [location.search, location.pathname, history, openDetail]);

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

  const columns: ColumnConfig<JournalRow>[] = [
    {
      key: "id",
      label: "JE Number",
      sortable: true,
      locked: true,
      render: (value) => <strong>#{value}</strong>,
    },
    {
      key: "entryDate",
      label: "Date",
      sortable: true,
    },
    {
      key: "referenceNumber",
      label: "Reference",
      sortable: true,
      render: (value) => value || "—",
    },
    {
      key: "description",
      label: "Description",
      sortable: true,
      render: (value) => value || "—",
    },
    {
      key: "statusLabel",
      label: "Status",
      sortable: true,
      render: (_value, row) => {
        if (row.paymentKind === "received") {
          return (
            <span className="je-entry-badge je-entry-badge--received">Received</span>
          );
        }
        if (row.paymentKind === "paid") {
          return <span className="je-entry-badge je-entry-badge--paid">Paid</span>;
        }
        return row.statusLabel;
      },
    },
    {
      key: "totalAmount",
      label: "Balanced amount",
      sortable: true,
      align: "right",
      render: (value) =>
        value != null
          ? Number(value).toLocaleString("en-US", {
              style: "currency",
              currency: "USD",
            })
          : "—",
    },
  ];

  const openNewEntry = () => {
    setShowNewEntry(true);
  };

  useEffect(() => {
    if (!showNewEntry) return;
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [showNewEntry]);

  return (
    <div className="journal-entries-page">
      <MasterListPage
        title="Journal entries"
        subtitle="Post balanced debits and credits to the general ledger. Closed periods block new posts — manage under Period close & audit."
        columns={columns}
        data={items}
        loading={listLoading && items.length === 0}
        enablePagination
        onAdd={openNewEntry}
        addButtonLabel="New entry"
        onRowClick={(row) => void openDetail(row.id)}
        searchPlaceholder="Search JE #, reference, description…"
        matchRowSearch={(row, q) =>
          matchJeNumber(q, row.id) ||
          matchAmountValue(q, row.totalAmount) ||
          matchDateValue(q, row.entryDate) ||
          (row.referenceNumber || "").toLowerCase().includes(q) ||
          (row.description || "").toLowerCase().includes(q) ||
          (row.statusLabel || "").toLowerCase().includes(q)
        }
        getRowId={(row) => row.id}
        columnPreferenceKey="journalEntries.hiddenColumns"
        filters={[masterListFilter]}
        emptyMessage={
          total === 0
            ? "No journal headers in this period."
            : "No journal entries match your search."
        }
        customActionButtons={[
          {
            label: listLoading ? "Loading…" : "Refresh",
            onClick: () => void loadList(),
            disabled: listLoading,
            className: "btn-secondary",
          },
          {
            label: "Period close",
            onClick: () => history.push("/accounts/periods"),
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
            <div
              style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}
            >
              <label
                htmlFor="je-from"
                style={{ fontSize: "0.8125rem", color: "#4b5563", fontWeight: 500 }}
              >
                From
              </label>
              <input
                id="je-from"
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
                htmlFor="je-to"
                style={{ fontSize: "0.8125rem", color: "#4b5563", fontWeight: 500 }}
              >
                To
              </label>
              <input
                id="je-to"
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

      {showNewEntry && (
      <div className="je-panel" id="je-new-entry" ref={formRef}>
        <div className="je-panel-head">
          <h2>New journal entry</h2>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setShowNewEntry(false)}
          >
            Cancel
          </button>
        </div>
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
      )}

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
              <h3>
                Journal detail
                {detail?.id ? ` #${detail.id}` : ""}
              </h3>
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
                      className="btn-secondary"
                      style={{ marginRight: "0.75rem" }}
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
