import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AuthService } from "../../services/authService";
import {
  formatNcrStatus,
  NonConformanceReport,
  QualityService,
  severityBadgeClass,
  statusBadgeClass,
} from "../../services/qualityService";

export function QualityListPage() {
  const [ncrs, setNcrs] = useState<NonConformanceReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [stats, setStats] = useState({
    totalNCRs: 0,
    openNCRs: 0,
    criticalNCRs: 0,
    overdueNCRs: 0,
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const tenantId = AuthService.getTenantId();
      const [list, statsResult] = await Promise.all([
        QualityService.getNCRs({ tenantId }),
        QualityService.getNCRStats(tenantId),
      ]);
      setNcrs(list);
      setStats(statsResult);
    } catch (err: unknown) {
      const ax = err as {
        response?: { data?: { error?: { message?: string }; message?: string } };
        message?: string;
      };
      setError(
        ax?.response?.data?.error?.message ||
          ax?.response?.data?.message ||
          ax?.message ||
          "Failed to load NCRs"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Quality</h1>
        <div className="flex gap-2">
          <button type="button" className="btn btn-ghost" onClick={() => void load()} disabled={loading}>
            Refresh
          </button>
          <Link to="/quality/new" className="btn btn-primary px-3 text-sm">
            New NCR
          </Link>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: "Total", value: stats.totalNCRs },
          { label: "Open", value: stats.openNCRs },
          { label: "Critical", value: stats.criticalNCRs },
          { label: "Overdue", value: stats.overdueNCRs },
        ].map((s) => (
          <div key={s.label} className="card px-3 py-2.5">
            <div className="text-[0.7rem] font-bold uppercase tracking-wide text-slate-500">
              {s.label}
            </div>
            <div className="text-xl font-bold text-slate-900">{s.value}</div>
          </div>
        ))}
      </div>

      {loading && <div className="py-10 text-center text-slate-500">Loading NCRs…</div>}
      {error && (
        <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-700" role="alert">
          {error}
        </div>
      )}
      {!loading && !error && ncrs.length === 0 && (
        <div className="py-10 text-center text-slate-500">No NCRs found.</div>
      )}

      <ul className="space-y-3">
        {ncrs.map((ncr) => (
          <li key={ncr.ncrId}>
            <Link to={`/quality/${ncr.ncrId}`} className="card block p-4 active:scale-[0.995]">
              <div className="mb-2 flex items-start justify-between gap-2">
                <span className="font-bold text-slate-900">
                  {ncr.ncrNumber || `NCR-${ncr.ncrId}`}
                </span>
                <span className={severityBadgeClass(ncr.severity)}>{ncr.severity}</span>
              </div>
              <div className="mb-2 font-semibold text-slate-800">{ncr.title || "Untitled"}</div>
              <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
                <span className={statusBadgeClass(ncr.status)}>
                  {formatNcrStatus(ncr.status)}
                </span>
                <span>
                  {ncr.reportedDate
                    ? new Date(ncr.reportedDate).toLocaleDateString()
                    : "—"}
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
