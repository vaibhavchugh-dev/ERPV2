import React, { useCallback, useEffect, useState } from "react";
import { toast } from "react-toastify";
import { AccountingService } from "../../Common/Services/AccountingService";
import {
  ChartofAccountsService,
  ChartofAccountMaster,
} from "../../Common/Services/ChartofAccountsService";
import "./GeneralLedger.scss";

const ymdLocal = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const GeneralLedger: React.FC = () => {
  const [accounts, setAccounts] = useState<ChartofAccountMaster[]>([]);
  const [accountId, setAccountId] = useState(0);
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return ymdLocal(d);
  });
  const [endDate, setEndDate] = useState(() => ymdLocal(new Date()));
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const storageTenant = React.useMemo(() => {
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
    const list = (rows || []).filter((a) => a.isActive).sort((a, b) =>
      (a.accountCode || "").localeCompare(b.accountCode || "")
    );
    setAccounts(list);
  }, [storageTenant]);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  useEffect(() => {
    if (accounts.length > 0 && accountId === 0) {
      setAccountId(accounts[0].accountID);
    }
  }, [accounts, accountId]);

  const runQuery = async () => {
    if (!accountId) {
      toast.error("Select an account.");
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const data = await AccountingService.GetGeneralLedgerDetail({
        accountId,
        startDate,
        endDate,
      });
      setResult(data);
      if (!data?.lines?.length) {
        toast.info("No activity for this account in the selected range.");
      }
    } catch (e: any) {
      const msg =
        e?.response?.data?.error || e?.message || "Failed to load GL detail.";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="general-ledger-page">
      <div className="gl-header">
        <h1>GL account activity</h1>
        <p>
          Posted journal lines for one account with a running debit-minus-credit
          balance for the period (useful for tie-out and review).
        </p>
      </div>

      <div className="gl-panel">
        <div className="gl-filters">
          <div>
            <label>Account</label>
            <select
              value={accountId || ""}
              onChange={(e) => setAccountId(Number(e.target.value))}
            >
              <option value="">Select…</option>
              {accounts.map((a) => (
                <option key={a.accountID} value={a.accountID}>
                  {a.accountCode} — {a.accountName}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>From</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div>
            <label>To</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
          <button type="button" onClick={runQuery} disabled={loading}>
            {loading ? "Loading…" : "Run"}
          </button>
        </div>

        {result && (
          <>
            <div className="gl-meta">
              <strong>{result.accountCode}</strong> {result.accountName} ·{" "}
              {result.accountType} · {result.periodStart} to {result.periodEnd}{" "}
              · {result.lineCount} line(s)
            </div>
            <div style={{ overflowX: "auto" }}>
              <table className="gl-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Journal #</th>
                    <th>Reference</th>
                    <th>Description</th>
                    <th className="num">Debit</th>
                    <th className="num">Credit</th>
                    <th className="num">Running balance</th>
                  </tr>
                </thead>
                <tbody>
                  {(result.lines || []).map((ln: any, i: number) => (
                    <tr key={`${ln.journalEntryId}-${i}`}>
                      <td>{ln.entryDate}</td>
                      <td>{ln.journalEntryId}</td>
                      <td>{ln.referenceNumber}</td>
                      <td>{ln.description}</td>
                      <td className="num">
                        {Number(ln.debit) > 0 ? Number(ln.debit).toFixed(2) : "—"}
                      </td>
                      <td className="num">
                        {Number(ln.credit) > 0
                          ? Number(ln.credit).toFixed(2)
                          : "—"}
                      </td>
                      <td className="num">
                        {Number(ln.runningBalance).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default GeneralLedger;
