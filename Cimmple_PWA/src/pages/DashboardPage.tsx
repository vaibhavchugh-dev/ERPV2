import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BarcodeScannerSheet } from "../components/BarcodeScannerSheet";

export function DashboardPage() {
  const navigate = useNavigate();
  const [scannerOpen, setScannerOpen] = useState(false);

  const handleScan = useCallback(
    (jobOrderId: number, stepId: number) => {
      setScannerOpen(false);
      navigate(`/jobs/${jobOrderId}?stepId=${stepId}&focus=timer`);
    },
    [navigate]
  );

  return (
    <div>
      <header className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-white text-slate-700 shadow-sm"
            onClick={() => {
              window.dispatchEvent(new CustomEvent("open-drawer"));
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          </button>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight text-slate-900 leading-tight">Dashboard</h1>
            <p className="text-xs font-bold tracking-widest text-slate-400 uppercase">Overview</p>
          </div>
        </div>
      </header>

      <button
        type="button"
        onClick={() => setScannerOpen(true)}
        className="flex min-h-tap w-full items-center justify-center gap-2.5 rounded-2xl bg-slate-900 px-4 text-sm font-extrabold text-white shadow-sm hover:bg-slate-800"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M3 7V5a2 2 0 012-2h2M17 3h2a2 2 0 012 2v2M21 17v2a2 2 0 01-2 2h-2M7 21H5a2 2 0 01-2-2v-2" />
          <rect x="7" y="7" width="10" height="10" rx="1" />
        </svg>
        Scan QR / Barcode
      </button>

      <BarcodeScannerSheet
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={handleScan}
      />
    </div>
  );
}
