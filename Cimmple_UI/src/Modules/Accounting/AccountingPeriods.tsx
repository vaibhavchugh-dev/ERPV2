import React, { useCallback, useEffect, useState } from "react";
import { toast } from "react-toastify";
import { AccountingService } from "../../Common/Services/AccountingService";
import "./AccountingPeriods.scss";

const AccountingPeriods: React.FC = () => {
  const [periodKey, setPeriodKey] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [closed, setClosed] = useState<
    Array<{
      periodKey: string;
      closedUtc: string;
      closedByUserId: number | null;
    }>
  >([]);
  const [audit, setAudit] = useState<
    Array<{
      id: number;
      action: string;
      occurredUtc: string;
      actorUserId: number | null;
      journalEntryId: number | null;
      relatedJournalEntryId: number | null;
      periodKey: string | null;
      notes: string | null;
    }>
  >([]);
  const [loading, setLoading] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{
    type: "close" | "open";
    periodKey: string;
  } | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [c, a] = await Promise.all([
        AccountingService.ListClosedPeriods(),
        AccountingService.ListGlAuditTrail({ take: 150 }),
      ]);
      setClosed(Array.isArray(c) ? c : []);
      setAudit(a?.items || []);
    } catch (e) {
      console.error(e);
      toast.error("Failed to load period or audit data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const requestAction = (type: "close" | "open") => {
    const pk = periodKey.trim();
    if (!/^\d{6}$/.test(pk)) {
      toast.error("Use six digits YYYYMM (e.g. 202604).");
      return;
    }
    setConfirmAction({ type, periodKey: pk });
  };

  const cancelConfirm = () => {
    if (actionBusy) return;
    setConfirmAction(null);
  };

  const runConfirmedAction = async () => {
    if (!confirmAction || actionBusy) return;
    setActionBusy(true);
    try {
      if (confirmAction.type === "close") {
        await closePeriod(confirmAction.periodKey);
      } else {
        await openPeriod(confirmAction.periodKey);
      }
    } finally {
      setActionBusy(false);
      setConfirmAction(null);
    }
  };

  const closePeriod = async (pk: string) => {
    try {
      await AccountingService.CloseAccountingPeriod(pk);
      toast.success(`Period ${pk} closed.`);
      await loadAll();
    } catch (e: any) {
      const status = e?.response?.status;
      const body = e?.response?.data?.error || e?.response?.data?.message;
      const msg =
        status === 409 && body
          ? body
          : body || e?.message || "Close failed.";
      toast.error(msg);
    }
  };

  const openPeriod = async (pk: string) => {
    try {
      await AccountingService.OpenAccountingPeriod(pk);
      toast.success(`Period ${pk} reopened.`);
      await loadAll();
    } catch (e: any) {
      const msg =
        e?.response?.data?.error || e?.message || "Open period failed.";
      toast.error(msg);
    }
  };

  return (
    <div className="accounting-periods-page">
      <div className="ap-header">
        <h1>Period close &amp; GL audit</h1>
        <p>
          Standard month-end order: complete bank reconciliation for each account
          (statement date in that month), then close the GL period (YYYYMM). Closing
          blocks journal posts and further bank recon for dates in that month.
          Reopen only when corrections are required. Control actions appear in the
          audit log (including bank recon completions).
        </p>
      </div>

      <div className="ap-panel">
        <h2>Close or reopen a period</h2>
        <div className="ap-row">
          <div>
            <label>Period (YYYYMM)</label>
            <input
              value={periodKey}
              onChange={(e) =>
                setPeriodKey(e.target.value.replace(/\D/g, "").slice(0, 6))
              }
              placeholder="202604"
              maxLength={6}
            />
          </div>
          <button
            type="button"
            className="ap-close"
            onClick={() => requestAction("close")}
            disabled={actionBusy}
          >
            Close period
          </button>
          <button
            type="button"
            className="ap-open"
            onClick={() => requestAction("open")}
            disabled={actionBusy}
          >
            Reopen period
          </button>
          <button
            type="button"
            className="ap-refresh"
            onClick={loadAll}
            disabled={loading}
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>

        <h2>Closed periods</h2>
        <table className="ap-table">
          <thead>
            <tr>
              <th>Period</th>
              <th>Closed (UTC)</th>
              <th>User id</th>
            </tr>
          </thead>
          <tbody>
            {closed.length === 0 ? (
              <tr>
                <td colSpan={3} style={{ color: "#6b7280" }}>
                  No periods closed yet.
                </td>
              </tr>
            ) : (
              closed.map((r) => (
                <tr key={r.periodKey}>
                  <td>{r.periodKey}</td>
                  <td>{new Date(r.closedUtc).toISOString()}</td>
                  <td>{r.closedByUserId ?? "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="ap-panel">
        <h2>GL audit trail</h2>
        <table className="ap-table">
          <thead>
            <tr>
              <th>Time (UTC)</th>
              <th>Action</th>
              <th>Journal</th>
              <th>Related</th>
              <th>Period</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {audit.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ color: "#6b7280" }}>
                  No audit events yet.
                </td>
              </tr>
            ) : (
              audit.map((r) => (
                <tr key={r.id}>
                  <td>{new Date(r.occurredUtc).toISOString()}</td>
                  <td>{r.action}</td>
                  <td>{r.journalEntryId ?? "—"}</td>
                  <td>{r.relatedJournalEntryId ?? "—"}</td>
                  <td>{r.periodKey ?? "—"}</td>
                  <td style={{ maxWidth: "280px", wordBreak: "break-word" }}>
                    {r.notes ?? "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {confirmAction && (
        <div
          className="ap-confirm-overlay"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) cancelConfirm();
          }}
        >
          <div
            className="ap-confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ap-confirm-title"
          >
            <h3 id="ap-confirm-title">
              {confirmAction.type === "close"
                ? `Close period ${formatPeriodLabel(confirmAction.periodKey)}?`
                : `Reopen period ${formatPeriodLabel(confirmAction.periodKey)}?`}
            </h3>
            {confirmAction.type === "close" ? (
              <p>
                Closing locks the books for this month. Journal posts, edits and
                bank reconciliation dated in this period will be blocked until it
                is reopened.
              </p>
            ) : (
              <p>
                Reopening allows journal posts, edits and bank reconciliation dated
                in this period again. Reopen only when corrections are required.
              </p>
            )}
            <div className="ap-confirm-actions">
              <button
                type="button"
                className="ap-confirm-cancel"
                onClick={cancelConfirm}
                disabled={actionBusy}
                data-esc-close
                autoFocus
              >
                Cancel
              </button>
              <button
                type="button"
                className={
                  confirmAction.type === "close"
                    ? "ap-confirm-ok ap-confirm-ok--close"
                    : "ap-confirm-ok ap-confirm-ok--open"
                }
                onClick={() => void runConfirmedAction()}
                disabled={actionBusy}
              >
                {actionBusy
                  ? confirmAction.type === "close"
                    ? "Closing…"
                    : "Reopening…"
                  : confirmAction.type === "close"
                  ? "Close period"
                  : "Reopen period"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

function formatPeriodLabel(pk: string): string {
  const year = Number(pk.slice(0, 4));
  const month = Number(pk.slice(4, 6));
  if (!year || month < 1 || month > 12) return pk;
  const name = new Date(year, month - 1, 1).toLocaleString(undefined, {
    month: "long",
    year: "numeric",
  });
  return `${name} (${pk})`;
}

export default AccountingPeriods;
