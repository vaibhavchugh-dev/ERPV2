import React, { useEffect, useMemo, useState } from "react";
import { useHistory } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faExternalLinkAlt, faTimes } from "@fortawesome/free-solid-svg-icons";
import { AccountingService } from "../../Common/Services/AccountingService";
import {
  buildDrillLink,
  DRILL_DETAIL_PAGE_SIZE,
  withQuery,
} from "../../Common/Utils/reportDeepLink";

export type DrillTarget =
  | {
      kind: "account";
      accountId: number;
      accountCode?: string;
      accountName?: string;
      startDate: string;
      endDate: string;
      locationId?: number | null;
    }
  | {
      kind: "aging";
      bucket: string;
      invoices: any[];
      isAp?: boolean;
    }
  | {
      kind: "cashflow";
      line: any;
    }
  | {
      kind: "statement-line";
      customerName?: string;
      line: any;
    }
  | {
      kind: "vendor";
      vendor: any;
    };

const money = (n: unknown) =>
  `$${(Number(n) || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

type Props = {
  target: DrillTarget | null;
  onClose: () => void;
};

const ReportDrillDrawer: React.FC<Props> = ({ target, onClose }) => {
  const history = useHistory();
  const [loading, setLoading] = useState(false);
  const [gl, setGl] = useState<any>(null);
  const [error, setError] = useState("");
  const [glVisible, setGlVisible] = useState(DRILL_DETAIL_PAGE_SIZE);
  const [agingVisible, setAgingVisible] = useState(DRILL_DETAIL_PAGE_SIZE);
  const [payVisible, setPayVisible] = useState(DRILL_DETAIL_PAGE_SIZE);
  const [apVisible, setApVisible] = useState(DRILL_DETAIL_PAGE_SIZE);

  useEffect(() => {
    setGlVisible(DRILL_DETAIL_PAGE_SIZE);
    setAgingVisible(DRILL_DETAIL_PAGE_SIZE);
    setPayVisible(DRILL_DETAIL_PAGE_SIZE);
    setApVisible(DRILL_DETAIL_PAGE_SIZE);
  }, [target]);

  useEffect(() => {
    if (!target || target.kind !== "account") {
      setGl(null);
      setError("");
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      setGl(null);
      try {
        const data = await AccountingService.GetGeneralLedgerDetail({
          accountId: target.accountId,
          startDate: target.startDate,
          endDate: target.endDate,
          locationId: target.locationId,
        });
        if (!cancelled) setGl(data);
      } catch (e: any) {
        if (!cancelled) {
          setError(
            e?.response?.data?.error || e?.message || "Failed to load activity"
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [target]);

  useEffect(() => {
    if (!target) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [target, onClose]);

  const go = (path: string) => {
    onClose();
    history.push(path);
  };

  const glLines = useMemo(
    () => (Array.isArray(gl?.lines) ? gl.lines : []),
    [gl]
  );

  if (!target) return null;

  const title =
    target.kind === "account"
      ? `${target.accountCode || ""} ${target.accountName || "Account"}`.trim()
      : target.kind === "aging"
        ? `${target.bucket} — open invoices`
        : target.kind === "statement-line"
          ? `${target.line?.type || "Activity"} — ${target.customerName || "Customer"}`
          : target.kind === "vendor"
            ? `${target.vendor?.vendorName || "Vendor"}`
            : "Cash flow line";

  const glHref =
    target.kind === "account"
      ? buildDrillLink({
          path: "/accounts/general-ledger",
          accountId: target.accountId,
          startDate: target.startDate,
          endDate: target.endDate,
        })
      : "/accounts/general-ledger";

  const agingInvoices =
    target.kind === "aging" && Array.isArray(target.invoices)
      ? target.invoices
      : [];
  const vendorPayments =
    target.kind === "vendor" && Array.isArray(target.vendor?.payments)
      ? target.vendor.payments
      : [];
  const vendorOpen =
    target.kind === "vendor" && Array.isArray(target.vendor?.openInvoices)
      ? target.vendor.openInvoices
      : [];

  return (
    <div className="fr-drill-overlay" role="presentation">
      <button
        type="button"
        className="fr-drill-backdrop"
        aria-label="Close drill-down"
        onClick={onClose}
      />
      <aside
        className="fr-drill"
        aria-label="Report drill-down"
        role="dialog"
        aria-modal="true"
      >
        <div className="fr-drill-header">
          <div>
            <div className="fr-drill-kicker">Drill-down</div>
            <h3>{title}</h3>
            {target.kind === "account" && (
              <p className="fr-drill-meta">
                {target.startDate} → {target.endDate}
                {gl?.includesDepositsWithdrawals
                  ? " · journals + deposits / withdrawals / TransCoa"
                  : ""}
              </p>
            )}
          </div>
          <button
            type="button"
            className="fr-drill-close"
            onClick={onClose}
            aria-label="Close"
          >
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>

        <div className="fr-drill-body">
          {loading && <p className="fr-muted">Loading…</p>}
          {error && <p className="fr-note fr-note-danger">{error}</p>}

          {target.kind === "account" && gl && (
            <>
              {glLines.length === 0 ? (
                <div className="fr-drill-empty">
                  <p className="fr-muted">
                    No posted activity for this account in{" "}
                    {target.startDate} → {target.endDate}. Open the General
                    Ledger to adjust the date range.
                  </p>
                </div>
              ) : (
                <>
                  <p className="fr-muted">
                    Showing {Math.min(glVisible, glLines.length)} of{" "}
                    {glLines.length} line(s)
                    {gl.accountType ? ` · ${gl.accountType}` : ""}
                  </p>
                  <div className="fr-drill-scroll">
                    <table className="fr-table">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Source</th>
                          <th>Ref</th>
                          <th>Description</th>
                          <th className="num">Debit</th>
                          <th className="num">Credit</th>
                          <th className="num">Balance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {glLines.slice(0, glVisible).map((ln: any, i: number) => (
                          <tr key={i}>
                            <td>{ln.entryDate}</td>
                            <td>
                              {ln.sourceType === "journal" &&
                              ln.journalEntryId ? (
                                <button
                                  type="button"
                                  className="fr-link-btn"
                                  onClick={() =>
                                    go(
                                      withQuery("/accounts/journal-entries", {
                                        open: ln.journalEntryId,
                                      })
                                    )
                                  }
                                  title="Open journal entries"
                                >
                                  JE #{ln.journalEntryId}
                                </button>
                              ) : (
                                ln.sourceType || "—"
                              )}
                            </td>
                            <td>{ln.referenceNumber || "—"}</td>
                            <td>{ln.description}</td>
                            <td className="num">
                              {Number(ln.debit) > 0 ? money(ln.debit) : "—"}
                            </td>
                            <td className="num">
                              {Number(ln.credit) > 0 ? money(ln.credit) : "—"}
                            </td>
                            <td className="num">{money(ln.runningBalance)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {glLines.length > glVisible && (
                    <button
                      type="button"
                      className="fr-btn fr-btn-secondary"
                      style={{ marginTop: "0.75rem" }}
                      onClick={() =>
                        setGlVisible((n) => n + DRILL_DETAIL_PAGE_SIZE)
                      }
                    >
                      Show more lines
                    </button>
                  )}
                </>
              )}
              <button
                type="button"
                className="fr-btn fr-btn-secondary"
                style={{ marginTop: "0.75rem" }}
                onClick={() => go(glHref)}
              >
                <FontAwesomeIcon icon={faExternalLinkAlt} />
                Open General Ledger
              </button>
            </>
          )}

          {target.kind === "aging" && (
            <div>
              {agingInvoices.length === 0 ? (
                <div className="fr-drill-empty">
                  <p className="fr-muted">
                    No open invoices in the “{target.bucket}” bucket for this
                    period and site.
                  </p>
                </div>
              ) : (
                <>
                  <p className="fr-muted">
                    Showing {Math.min(agingVisible, agingInvoices.length)} of{" "}
                    {agingInvoices.length}
                  </p>
                  <div className="fr-drill-scroll">
                    <table className="fr-table">
                      <thead>
                        <tr>
                          <th>Invoice</th>
                          <th>Party</th>
                          <th>Due</th>
                          <th className="num">Open</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {agingInvoices
                          .slice(0, agingVisible)
                          .map((inv: any, i: number) => {
                            const base =
                              inv.linkPath ||
                              (target.isAp
                                ? "/purchasing/vendor-invoices"
                                : "/orders/customer-invoices");
                            const href = buildDrillLink({
                              path: base,
                              entityId: inv.invoiceId,
                              search: inv.invoiceNo,
                            });
                            return (
                              <tr key={i}>
                                <td className="mono">{inv.invoiceNo}</td>
                                <td>
                                  {target.isAp
                                    ? inv.vendorName || ""
                                    : inv.customerName || ""}
                                </td>
                                <td>{inv.dueDate}</td>
                                <td className="num">
                                  {money(inv.openBalance)}
                                </td>
                                <td>
                                  <button
                                    type="button"
                                    className="fr-link-btn"
                                    onClick={() => go(href)}
                                  >
                                    Open
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                  {agingInvoices.length > agingVisible && (
                    <button
                      type="button"
                      className="fr-btn fr-btn-secondary"
                      style={{ marginTop: "0.75rem" }}
                      onClick={() =>
                        setAgingVisible((n) => n + DRILL_DETAIL_PAGE_SIZE)
                      }
                    >
                      Show more invoices
                    </button>
                  )}
                </>
              )}
            </div>
          )}

          {target.kind === "cashflow" && (
            <div>
              <dl className="fr-drill-dl">
                <div>
                  <dt>Date</dt>
                  <dd>{target.line.date || "—"}</dd>
                </div>
                <div>
                  <dt>Description</dt>
                  <dd>
                    {target.line.description || target.line.category || "—"}
                  </dd>
                </div>
                <div>
                  <dt>Reference</dt>
                  <dd>{target.line.reference || "—"}</dd>
                </div>
                <div>
                  <dt>Amount</dt>
                  <dd>{money(target.line.amount)}</dd>
                </div>
                <div>
                  <dt>Source</dt>
                  <dd>{target.line.sourceType || "—"}</dd>
                </div>
              </dl>
              <div className="fr-drill-actions">
                {target.line.isCustomer === true && (
                  <button
                    type="button"
                    className="fr-btn fr-btn-secondary"
                    onClick={() =>
                      go(
                        withQuery("/orders/customer-invoices", {
                          search: target.line.reference || undefined,
                        })
                      )
                    }
                  >
                    Customer invoices
                  </button>
                )}
                {target.line.isCustomer === false && (
                  <button
                    type="button"
                    className="fr-btn fr-btn-secondary"
                    onClick={() =>
                      go(
                        withQuery("/purchasing/vendor-invoices", {
                          search: target.line.reference || undefined,
                        })
                      )
                    }
                  >
                    Vendor invoices
                  </button>
                )}
                {target.line.accountId > 0 && (
                  <button
                    type="button"
                    className="fr-btn fr-btn-secondary"
                    onClick={() =>
                      go(
                        buildDrillLink({
                          path: "/accounts/general-ledger",
                          accountId: target.line.accountId,
                        })
                      )
                    }
                  >
                    General Ledger
                  </button>
                )}
                <button
                  type="button"
                  className="fr-btn fr-btn-secondary"
                  onClick={() => go("/accounts/dashboard")}
                >
                  Payment dashboard
                </button>
              </div>
              {target.line.reference && (
                <p className="fr-muted" style={{ marginTop: "0.75rem" }}>
                  Invoice / check ref: <strong>{target.line.reference}</strong>
                  {target.line.transactionId
                    ? ` · Tx #${target.line.transactionId}`
                    : ""}
                </p>
              )}
            </div>
          )}

          {target.kind === "statement-line" && (
            <div>
              <dl className="fr-drill-dl">
                <div>
                  <dt>Date</dt>
                  <dd>{target.line.date || "—"}</dd>
                </div>
                <div>
                  <dt>Type</dt>
                  <dd>{target.line.type || "—"}</dd>
                </div>
                <div>
                  <dt>Reference</dt>
                  <dd>{target.line.reference || "—"}</dd>
                </div>
                <div>
                  <dt>Description</dt>
                  <dd>{target.line.description || "—"}</dd>
                </div>
                <div>
                  <dt>Charges</dt>
                  <dd>{money(target.line.charges)}</dd>
                </div>
                <div>
                  <dt>Payments</dt>
                  <dd>{money(target.line.payments)}</dd>
                </div>
                <div>
                  <dt>Balance</dt>
                  <dd>{money(target.line.balance)}</dd>
                </div>
              </dl>
              <div className="fr-drill-actions">
                <button
                  type="button"
                  className="fr-btn fr-btn-secondary"
                  onClick={() =>
                    go(
                      buildDrillLink({
                        path:
                          target.line.linkPath || "/orders/customer-invoices",
                        entityId: target.line.invoiceId,
                        search: target.line.reference,
                      })
                    )
                  }
                >
                  <FontAwesomeIcon icon={faExternalLinkAlt} />
                  {target.line.type === "Payment"
                    ? "Customer invoices / payments"
                    : "Open customer invoice"}
                </button>
                <button
                  type="button"
                  className="fr-btn fr-btn-secondary"
                  onClick={() => go("/accounts/dashboard")}
                >
                  Payment dashboard
                </button>
              </div>
              {(target.line.invoiceId || target.line.transactionId) && (
                <p className="fr-muted" style={{ marginTop: "0.75rem" }}>
                  {target.line.invoiceId
                    ? `Invoice #${target.line.invoiceId}`
                    : ""}
                  {target.line.invoiceId && target.line.transactionId
                    ? " · "
                    : ""}
                  {target.line.transactionId
                    ? `Tx #${target.line.transactionId}`
                    : ""}
                </p>
              )}
            </div>
          )}

          {target.kind === "vendor" && (
            <div>
              <dl className="fr-drill-dl">
                <div>
                  <dt>Payments</dt>
                  <dd>{money(target.vendor.paymentsInPeriod)}</dd>
                </div>
                <div>
                  <dt>Count</dt>
                  <dd>{target.vendor.paymentCount || 0}</dd>
                </div>
                <div>
                  <dt>Open AP</dt>
                  <dd>{money(target.vendor.openApBalance)}</dd>
                </div>
              </dl>

              <h4 className="fr-drill-section-title">Payments in period</h4>
              {vendorPayments.length === 0 ? (
                <div className="fr-drill-empty">
                  <p className="fr-muted">
                    No vendor payments recorded for this vendor in the selected
                    period.
                  </p>
                </div>
              ) : (
                <>
                  <p className="fr-muted">
                    Showing {Math.min(payVisible, vendorPayments.length)} of{" "}
                    {vendorPayments.length}
                  </p>
                  <div className="fr-drill-scroll">
                    <table className="fr-table">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Ref</th>
                          <th className="num">Amount</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {vendorPayments
                          .slice(0, payVisible)
                          .map((p: any, i: number) => (
                            <tr key={i}>
                              <td>{p.date}</td>
                              <td className="mono">{p.reference || "—"}</td>
                              <td className="num">{money(p.amount)}</td>
                              <td>
                                <button
                                  type="button"
                                  className="fr-link-btn"
                                  onClick={() =>
                                    go(
                                      withQuery(
                                        p.linkPath ||
                                          "/purchasing/vendor-invoices",
                                        { search: p.reference || undefined }
                                      )
                                    )
                                  }
                                >
                                  Open
                                </button>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                  {vendorPayments.length > payVisible && (
                    <button
                      type="button"
                      className="fr-btn fr-btn-secondary"
                      style={{ marginTop: "0.75rem" }}
                      onClick={() =>
                        setPayVisible((n) => n + DRILL_DETAIL_PAGE_SIZE)
                      }
                    >
                      Show more payments
                    </button>
                  )}
                </>
              )}

              <h4 className="fr-drill-section-title">Open AP invoices</h4>
              {vendorOpen.length === 0 ? (
                <div className="fr-drill-empty">
                  <p className="fr-muted">
                    No open AP invoices for this vendor.
                  </p>
                </div>
              ) : (
                <>
                  <p className="fr-muted">
                    Showing {Math.min(apVisible, vendorOpen.length)} of{" "}
                    {vendorOpen.length}
                  </p>
                  <div className="fr-drill-scroll">
                    <table className="fr-table">
                      <thead>
                        <tr>
                          <th>Invoice</th>
                          <th>Due</th>
                          <th className="num">Open</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {vendorOpen.slice(0, apVisible).map((inv: any, i: number) => (
                          <tr key={i}>
                            <td className="mono">{inv.invoiceNo}</td>
                            <td>{inv.dueDate}</td>
                            <td className="num">{money(inv.openBalance)}</td>
                            <td>
                              <button
                                type="button"
                                className="fr-link-btn"
                                onClick={() =>
                                  go(
                                    buildDrillLink({
                                      path:
                                        inv.linkPath ||
                                        "/purchasing/vendor-invoices",
                                      entityId: inv.invoiceId,
                                      search: inv.invoiceNo,
                                    })
                                  )
                                }
                              >
                                Open
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {vendorOpen.length > apVisible && (
                    <button
                      type="button"
                      className="fr-btn fr-btn-secondary"
                      style={{ marginTop: "0.75rem" }}
                      onClick={() =>
                        setApVisible((n) => n + DRILL_DETAIL_PAGE_SIZE)
                      }
                    >
                      Show more invoices
                    </button>
                  )}
                </>
              )}

              <div className="fr-drill-actions">
                <button
                  type="button"
                  className="fr-btn fr-btn-secondary"
                  onClick={() =>
                    go(
                      withQuery("/purchasing/vendor-invoices", {
                        search: target.vendor?.vendorName || undefined,
                      })
                    )
                  }
                >
                  <FontAwesomeIcon icon={faExternalLinkAlt} />
                  Vendor invoices
                </button>
              </div>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
};

export default ReportDrillDrawer;
