import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { parseStepScanCode } from "../utils/parseStepScanCode";

const SCANNER_ELEMENT_ID = "pwa-barcode-scanner-region";

interface BarcodeScannerSheetProps {
  open: boolean;
  onClose: () => void;
  onScan: (jobOrderId: number, stepId: number) => void;
}

export function BarcodeScannerSheet({ open, onClose, onScan }: BarcodeScannerSheetProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const handledRef = useRef(false);
  const [manualCode, setManualCode] = useState("");
  const [error, setError] = useState("");
  const [cameraError, setCameraError] = useState("");
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (!open) return;

    handledRef.current = false;
    setError("");
    setCameraError("");
    setManualCode("");
    setStarting(true);

    let cancelled = false;
    const scanner = new Html5Qrcode(SCANNER_ELEMENT_ID);
    scannerRef.current = scanner;

    const handleDecoded = (decodedText: string) => {
      if (handledRef.current || cancelled) return;
      const parsed = parseStepScanCode(decodedText);
      if (!parsed) {
        setError("Unrecognized Cimmple barcode");
        return;
      }
      handledRef.current = true;
      setError("");
      void (async () => {
        try {
          if (scannerRef.current?.isScanning) {
            await scannerRef.current.stop();
          }
        } catch {
          // ignore stop errors
        }
        onScan(parsed.jobOrderId, parsed.stepId);
      })();
    };

    (async () => {
      try {
        await scanner.start(
          { facingMode: "environment" },
          { fps: 8, qrbox: { width: 240, height: 240 } },
          handleDecoded,
          () => {
            // ignore per-frame "not found" noise
          }
        );
        if (!cancelled) setStarting(false);
      } catch (err: unknown) {
        if (cancelled) return;
        setStarting(false);
        const message =
          err instanceof Error ? err.message : "Could not start camera";
        if (/NotAllowedError|Permission|denied/i.test(message)) {
          setCameraError(
            "Camera permission denied. Paste the barcode code below instead."
          );
        } else {
          setCameraError(
            "Camera unavailable. Paste the barcode code below instead."
          );
        }
      }
    })();

    return () => {
      cancelled = true;
      const active = scannerRef.current;
      scannerRef.current = null;
      if (active) {
        void (async () => {
          try {
            if (active.isScanning) await active.stop();
          } catch {
            // ignore
          }
          try {
            active.clear();
          } catch {
            // ignore
          }
        })();
      }
    };
  }, [open, onScan]);

  if (!open) return null;

  const submitManual = () => {
    const parsed = parseStepScanCode(manualCode);
    if (!parsed) {
      setError("Unrecognized Cimmple barcode");
      return;
    }
    setError("");
    onScan(parsed.jobOrderId, parsed.stepId);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative mx-auto w-full max-w-[540px] rounded-t-3xl bg-white px-5 pt-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-2xl">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-slate-300" />
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-extrabold text-slate-900">Scan QR / Barcode</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-500"
            aria-label="Close scanner"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div
          id={SCANNER_ELEMENT_ID}
          className="mb-3 overflow-hidden rounded-2xl bg-slate-900 min-h-[220px]"
        />
        {starting && !cameraError && (
          <p className="mb-2 text-center text-xs font-semibold text-slate-500">Starting camera…</p>
        )}
        {cameraError && (
          <p className="mb-2 text-xs font-semibold text-amber-700">{cameraError}</p>
        )}
        {error && (
          <p className="mb-2 text-xs font-semibold text-red-600" role="alert">
            {error}
          </p>
        )}

        <label className="mb-1 block text-[0.65rem] font-extrabold uppercase tracking-wide text-slate-500">
          Or paste code
        </label>
        <div className="mb-4 flex gap-2">
          <input
            type="text"
            value={manualCode}
            onChange={(e) => {
              setManualCode(e.target.value);
              setError("");
            }}
            placeholder="cimmple://jo/123/step/45"
            className="h-10 min-h-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200"
          />
          <button
            type="button"
            onClick={submitManual}
            className="h-10 shrink-0 rounded-lg bg-slate-900 px-4 text-xs font-bold text-white"
          >
            Go
          </button>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="min-h-tap w-full rounded-2xl border border-slate-200 bg-white text-sm font-bold text-slate-700"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
