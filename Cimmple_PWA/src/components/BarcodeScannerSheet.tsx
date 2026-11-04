import { useEffect, useRef, useState } from "react";
import { Html5Qrcode, type CameraDevice } from "html5-qrcode";
import { parseStepScanCode } from "../utils/parseStepScanCode";

const SCANNER_ELEMENT_ID = "pwa-barcode-scanner-region";

interface BarcodeScannerSheetProps {
  open: boolean;
  onClose: () => void;
  onScan: (jobOrderId: number, stepId: number) => void;
}

type CameraChoice = string | MediaTrackConstraints;

const IR_OR_VIRTUAL =
  /\b(ir|infrared|depth|tof|metaverse|virtual|obs|manycam|snap|ndi|hello)\b/i;
const BACK_CAMERA = /\b(back|rear|environment|trás|arrière|world)\b/i;
const FRONT_CAMERA = /\b(front|user|face|facing)\b/i;

function isTouchDevice() {
  return (
    typeof window !== "undefined" &&
    (window.matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0)
  );
}

function rankCameras(cameras: CameraDevice[]): CameraDevice[] {
  const usable = cameras.filter((c) => !IR_OR_VIRTUAL.test(c.label || ""));
  const pool = usable.length ? usable : cameras;
  const preferBack = isTouchDevice();

  return [...pool].sort((a, b) => {
    const aBack = BACK_CAMERA.test(a.label) ? 1 : 0;
    const bBack = BACK_CAMERA.test(b.label) ? 1 : 0;
    const aFront = FRONT_CAMERA.test(a.label) ? 1 : 0;
    const bFront = FRONT_CAMERA.test(b.label) ? 1 : 0;
    if (preferBack) {
      if (aBack !== bBack) return bBack - aBack;
      if (aFront !== bFront) return aFront - bFront;
    } else {
      // Laptop: prefer first RGB / front webcam, never IR (already filtered).
      if (aFront !== bFront) return bFront - aFront;
      if (aBack !== bBack) return aBack - bBack;
    }
    return 0;
  });
}

function cameraFailureMessage(err: unknown): string {
  if (!window.isSecureContext) {
    return "Camera needs a secure page (HTTPS or localhost). On a phone use the hosted app https://erp.cimmple.net/shop — LAN http://IP cannot use the camera.";
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    return "This browser cannot access the camera. Paste the barcode code below instead.";
  }
  const message = err instanceof Error ? err.message : String(err ?? "");
  if (/NotAllowedError|Permission|denied|secure origins|Only secure/i.test(message)) {
    return "Camera permission denied or blocked. Allow camera access, or paste the code below.";
  }
  if (/NotFoundError|Requested device not found|no camera/i.test(message)) {
    return "No camera found on this device. Paste the barcode code below instead.";
  }
  if (/NotReadableError|could not start video|TrackStartError|in use/i.test(message)) {
    return "Camera is busy or failed to start. Close other apps using the camera and try again.";
  }
  return "Camera unavailable. Paste the barcode code below instead.";
}

async function listCameras(): Promise<CameraDevice[]> {
  // On phones, warming getUserMedia then immediately restarting often fails
  // (camera still releasing). Desktop needs the warm-up so IR cams get labels.
  if (!isTouchDevice()) {
    try {
      const warm = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false,
      });
      warm.getTracks().forEach((t) => t.stop());
      await new Promise((r) => setTimeout(r, 200));
    } catch {
      // Permission may already be granted or will be requested by start().
    }
  }

  try {
    return await Html5Qrcode.getCameras();
  } catch {
    return [];
  }
}

/** Keep the live <video> inline (avoids black fullscreen player on mobile). */
function prepareScannerVideo(rootId: string) {
  const root = document.getElementById(rootId);
  if (!root) return;
  const video = root.querySelector("video");
  if (!video) return;

  video.setAttribute("playsinline", "true");
  video.setAttribute("webkit-playsinline", "true");
  video.setAttribute("muted", "true");
  video.muted = true;
  video.playsInline = true;
  video.disablePictureInPicture = true;
  video.controls = false;

  void video.play().catch(() => {
    // Autoplay may be blocked briefly; stream can still decode frames.
  });
}

export function BarcodeScannerSheet({ open, onClose, onScan }: BarcodeScannerSheetProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const onScanRef = useRef(onScan);
  const handledRef = useRef(false);
  const startGenRef = useRef(0);
  const [manualCode, setManualCode] = useState("");
  const [error, setError] = useState("");
  const [cameraError, setCameraError] = useState("");
  const [starting, setStarting] = useState(false);
  const [cameras, setCameras] = useState<CameraDevice[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>("");

  onScanRef.current = onScan;

  useEffect(() => {
    if (!open) return;

    handledRef.current = false;
    setError("");
    setCameraError("");
    setManualCode("");
    setStarting(true);

    const gen = ++startGenRef.current;
    let cancelled = false;
    let scanner: Html5Qrcode | null = null;

    const handleDecoded = (decodedText: string) => {
      if (handledRef.current || cancelled || gen !== startGenRef.current) return;
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
        onScanRef.current(parsed.jobOrderId, parsed.stepId);
      })();
    };

    const stopScanner = async (active: Html5Qrcode | null) => {
      if (!active) return;
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
    };

    const tryStart = async (camera: CameraChoice, region: HTMLElement) => {
      const boxSize = Math.min(240, Math.max(160, Math.floor(region.clientWidth * 0.7)));
      await scanner!.start(
        camera,
        {
          fps: 10,
          qrbox: { width: boxSize, height: boxSize },
        },
        handleDecoded,
        () => {
          // ignore per-frame "not found" noise
        }
      );
    };

    const startTimer = window.setTimeout(() => {
      void (async () => {
        try {
          const region = document.getElementById(SCANNER_ELEMENT_ID);
          if (!region || cancelled || gen !== startGenRef.current) return;

          if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
            throw new Error("Only secure origins are allowed");
          }

          // Ensure any previous instance fully released the device (Strict Mode).
          await stopScanner(scannerRef.current);
          if (cancelled || gen !== startGenRef.current) return;

          scanner = new Html5Qrcode(SCANNER_ELEMENT_ID, { verbose: false });
          scannerRef.current = scanner;

          const devices = rankCameras(await listCameras());
          if (cancelled || gen !== startGenRef.current) return;

          setCameras(devices);
          const preferredId = devices[0]?.id ?? "";
          setSelectedCameraId(preferredId);

          const attempts: CameraChoice[] = [];
          // Mobile: facingMode first — more reliable than deviceId after enumerate.
          if (isTouchDevice()) {
            attempts.push({ facingMode: { ideal: "environment" } });
            attempts.push({ facingMode: "environment" });
            attempts.push({ facingMode: "user" });
          }
          if (preferredId) attempts.push(preferredId);
          for (const cam of devices.slice(1, 4)) {
            attempts.push(cam.id);
          }
          if (!isTouchDevice()) {
            attempts.push({ facingMode: "user" });
            attempts.push({ facingMode: "environment" });
          }

          const seen = new Set<string>();
          let started = false;
          let lastError: unknown;

          for (const attempt of attempts) {
            const key =
              typeof attempt === "string" ? `id:${attempt}` : JSON.stringify(attempt);
            if (seen.has(key)) continue;
            seen.add(key);

            try {
              await tryStart(attempt, region);
              started = true;
              if (typeof attempt === "string") {
                setSelectedCameraId(attempt);
              }
              break;
            } catch (err) {
              lastError = err;
              await stopScanner(scanner);
              if (cancelled || gen !== startGenRef.current) return;
              scanner = new Html5Qrcode(SCANNER_ELEMENT_ID, { verbose: false });
              scannerRef.current = scanner;
            }
          }

          if (!started) throw lastError ?? new Error("Could not start camera");
          if (cancelled || gen !== startGenRef.current) {
            await stopScanner(scanner);
            return;
          }

          prepareScannerVideo(SCANNER_ELEMENT_ID);
          window.setTimeout(() => prepareScannerVideo(SCANNER_ELEMENT_ID), 150);
          setStarting(false);
        } catch (err: unknown) {
          if (cancelled || gen !== startGenRef.current) return;
          setStarting(false);
          setCameraError(cameraFailureMessage(err));
        }
      })();
    }, 50);

    return () => {
      cancelled = true;
      window.clearTimeout(startTimer);
      const active = scannerRef.current ?? scanner;
      scannerRef.current = null;
      void stopScanner(active);
    };
  }, [open]);

  const switchCamera = async (cameraId: string) => {
    if (!cameraId || cameraId === selectedCameraId) return;
    setSelectedCameraId(cameraId);
    setCameraError("");
    setStarting(true);
    handledRef.current = false;

    const region = document.getElementById(SCANNER_ELEMENT_ID);
    const active = scannerRef.current;
    try {
      if (active?.isScanning) await active.stop();
    } catch {
      // ignore
    }
    try {
      active?.clear();
    } catch {
      // ignore
    }

    if (!region || !open) {
      setStarting(false);
      return;
    }

    try {
      const scanner = new Html5Qrcode(SCANNER_ELEMENT_ID, { verbose: false });
      scannerRef.current = scanner;
      const boxSize = Math.min(240, Math.max(160, Math.floor(region.clientWidth * 0.7)));
      await scanner.start(
        cameraId,
        { fps: 10, qrbox: { width: boxSize, height: boxSize } },
        (decodedText) => {
          if (handledRef.current) return;
          const parsed = parseStepScanCode(decodedText);
          if (!parsed) {
            setError("Unrecognized Cimmple barcode");
            return;
          }
          handledRef.current = true;
          setError("");
          void (async () => {
            try {
              if (scannerRef.current?.isScanning) await scannerRef.current.stop();
            } catch {
              // ignore
            }
            onScanRef.current(parsed.jobOrderId, parsed.stepId);
          })();
        },
        () => undefined
      );
      prepareScannerVideo(SCANNER_ELEMENT_ID);
      setStarting(false);
    } catch {
      setStarting(false);
      setCameraError("Could not switch camera. Try another device from the list.");
    }
  };

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
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative mx-auto w-full max-w-[600px] rounded-t-3xl bg-white px-5 pt-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-2xl dark:bg-slate-900">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-slate-300 dark:bg-slate-600" />
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">Scan QR / Barcode</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300"
            aria-label="Close scanner"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div
          id={SCANNER_ELEMENT_ID}
          className="pwa-barcode-scanner mb-3 h-[260px] overflow-hidden rounded-2xl bg-black"
        />
        {starting && !cameraError && (
          <p className="mb-2 text-center text-xs font-semibold text-slate-500 dark:text-slate-300">
            Starting camera…
          </p>
        )}
        {cameraError && (
          <p className="mb-2 text-xs font-semibold text-amber-700 dark:text-amber-300">{cameraError}</p>
        )}
        {error && (
          <p className="mb-2 text-xs font-semibold text-red-600 dark:text-red-400" role="alert">
            {error}
          </p>
        )}

        {cameras.length > 1 && (
          <label className="mb-3 block text-[0.65rem] font-extrabold uppercase tracking-wide text-slate-500">
            Camera
            <select
              value={selectedCameraId}
              onChange={(e) => void switchCamera(e.target.value)}
              className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-400"
            >
              {cameras.map((cam, i) => (
                <option key={cam.id} value={cam.id}>
                  {cam.label?.trim() || `Camera ${i + 1}`}
                </option>
              ))}
            </select>
          </label>
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
