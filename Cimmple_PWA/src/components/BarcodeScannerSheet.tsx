import { useEffect, useRef, useState } from "react";
import { Html5Qrcode, type CameraDevice } from "html5-qrcode";
import { parseStepScanCode } from "../utils/parseStepScanCode";

const SCANNER_ELEMENT_ID = "pwa-barcode-scanner-region";

interface BarcodeScannerSheetProps {
  open: boolean;
  onClose: () => void;
  onScan: (jobOrderId: number, stepId: number) => void;
}

const IR_OR_VIRTUAL =
  /\b(ir|infrared|depth|tof|metaverse|virtual|obs|manycam|snap|ndi|hello)\b/i;
// Prefer "facing back/front" (Android) before generic tokens.
const BACK_CAMERA = /facing[\s_-]*back|\b(back|rear|environment|trás|arrière|world)\b/i;
const FRONT_CAMERA = /facing[\s_-]*front|\b(front|user|selfie)\b/i;

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
      if (aFront !== bFront) return bFront - aFront;
      if (aBack !== bBack) return aBack - bBack;
    }
    return 0;
  });
}

function pickFacingPair(cameras: CameraDevice[]): {
  back?: CameraDevice;
  front?: CameraDevice;
} {
  const back = cameras.find((c) => BACK_CAMERA.test(c.label || ""));
  const front = cameras.find((c) => FRONT_CAMERA.test(c.label || ""));
  if (back || front) return { back, front };
  // Labels missing / generic: treat first two ranked devices as back then front.
  return { back: cameras[0], front: cameras[1] };
}

function cameraFailureMessage(err: unknown): string {
  if (!window.isSecureContext) {
    return "Camera needs a secure page (HTTPS or localhost).";
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
  if (!isTouchDevice()) {
    try {
      const warm = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false,
      });
      warm.getTracks().forEach((t) => t.stop());
      await new Promise((r) => setTimeout(r, 200));
    } catch {
      // ignore — start() will request permission
    }
  }
  try {
    return await Html5Qrcode.getCameras();
  } catch {
    return [];
  }
}

/**
 * Mobile browsers (esp. iOS / some Android WebViews) often paint a black
 * <video> even when the MediaStream is live. Mirroring frames to a <canvas>
 * keeps a visible preview while html5-qrcode continues decoding.
 */
function startPreviewMirror(
  rootId: string,
  preview: HTMLCanvasElement
): () => void {
  const root = document.getElementById(rootId);
  const video = root?.querySelector("video") ?? null;
  if (!video) return () => undefined;

  video.setAttribute("playsinline", "true");
  video.setAttribute("webkit-playsinline", "true");
  video.setAttribute("muted", "true");
  video.muted = true;
  video.playsInline = true;
  video.disablePictureInPicture = true;
  video.controls = false;
  void video.play().catch(() => undefined);

  const ctx = preview.getContext("2d", { alpha: false });
  if (!ctx) return () => undefined;

  let raf = 0;
  let stopped = false;

  const paint = () => {
    if (stopped) return;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (vw > 0 && vh > 0) {
      const cw = preview.clientWidth || 320;
      const ch = preview.clientHeight || 260;
      if (preview.width !== cw || preview.height !== ch) {
        preview.width = cw;
        preview.height = ch;
      }
      // cover-fit
      const scale = Math.max(cw / vw, ch / vh);
      const dw = vw * scale;
      const dh = vh * scale;
      const dx = (cw - dw) / 2;
      const dy = (ch - dh) / 2;
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, cw, ch);
      ctx.drawImage(video, dx, dy, dw, dh);
    }
    raf = window.requestAnimationFrame(paint);
  };

  raf = window.requestAnimationFrame(paint);

  return () => {
    stopped = true;
    window.cancelAnimationFrame(raf);
  };
}

export function BarcodeScannerSheet({ open, onClose, onScan }: BarcodeScannerSheetProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const onScanRef = useRef(onScan);
  const handledRef = useRef(false);
  const startGenRef = useRef(0);
  const stopMirrorRef = useRef<(() => void) | null>(null);
  const previewRef = useRef<HTMLCanvasElement | null>(null);

  const [manualCode, setManualCode] = useState("");
  const [error, setError] = useState("");
  const [cameraError, setCameraError] = useState("");
  const [starting, setStarting] = useState(false);
  const [cameras, setCameras] = useState<CameraDevice[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState("");

  onScanRef.current = onScan;

  const clearMirror = () => {
    stopMirrorRef.current?.();
    stopMirrorRef.current = null;
  };

  useEffect(() => {
    if (!open) return;

    handledRef.current = false;
    setError("");
    setCameraError("");
    setManualCode("");
    setStarting(true);
    clearMirror();

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
          if (scannerRef.current?.isScanning) await scannerRef.current.stop();
        } catch {
          // ignore
        }
        clearMirror();
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

    const attachMirror = () => {
      const preview = previewRef.current;
      if (!preview || cancelled) return;
      clearMirror();
      stopMirrorRef.current = startPreviewMirror(SCANNER_ELEMENT_ID, preview);
    };

    const tryStart = async (camera: string | MediaTrackConstraints) => {
      // No qrbox — shaded overlays often look like a full black screen on mobile
      // when the underlying <video> fails to paint.
      await scanner!.start(
        camera,
        { fps: 10 },
        handleDecoded,
        () => undefined
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

          await stopScanner(scannerRef.current);
          if (cancelled || gen !== startGenRef.current) return;

          scanner = new Html5Qrcode(SCANNER_ELEMENT_ID, { verbose: false });
          scannerRef.current = scanner;

          const devices = rankCameras(await listCameras());
          if (cancelled || gen !== startGenRef.current) return;

          setCameras(devices);
          const preferredId = devices[0]?.id ?? "";
          setSelectedCameraId(preferredId);

          const attempts: Array<string | MediaTrackConstraints> = [];
          if (preferredId) attempts.push(preferredId);
          for (const cam of devices.slice(1, 4)) attempts.push(cam.id);
          if (isTouchDevice()) {
            attempts.push({ facingMode: { ideal: "environment" } });
            attempts.push({ facingMode: "environment" });
            attempts.push({ facingMode: "user" });
          } else {
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
              await tryStart(attempt);
              started = true;
              if (typeof attempt === "string") setSelectedCameraId(attempt);
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

          // Give the library a tick to inject <video>, then mirror to canvas.
          window.setTimeout(() => {
            if (cancelled || gen !== startGenRef.current) return;
            attachMirror();
            window.setTimeout(attachMirror, 250);
          }, 50);

          setStarting(false);
        } catch (err: unknown) {
          if (cancelled || gen !== startGenRef.current) return;
          setStarting(false);
          setCameraError(cameraFailureMessage(err));
        }
      })();
    }, 80);

    return () => {
      cancelled = true;
      window.clearTimeout(startTimer);
      clearMirror();
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
    clearMirror();

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

    if (!open || !document.getElementById(SCANNER_ELEMENT_ID)) {
      setStarting(false);
      return;
    }

    try {
      const scanner = new Html5Qrcode(SCANNER_ELEMENT_ID, { verbose: false });
      scannerRef.current = scanner;
      await scanner.start(
        cameraId,
        { fps: 10 },
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
            clearMirror();
            onScanRef.current(parsed.jobOrderId, parsed.stepId);
          })();
        },
        () => undefined
      );

      const preview = previewRef.current;
      if (preview) {
        window.setTimeout(() => {
          clearMirror();
          stopMirrorRef.current = startPreviewMirror(SCANNER_ELEMENT_ID, preview);
        }, 50);
      }
      setStarting(false);
    } catch {
      setStarting(false);
      setCameraError("Could not switch camera. Try Back or Front again.");
    }
  };

  if (!open) return null;

  const facing = pickFacingPair(cameras);
  const usingFront =
    !!facing.front && selectedCameraId === facing.front.id;
  const canToggleFacing = !!(facing.back && facing.front);

  const flipCamera = () => {
    if (!canToggleFacing || starting) return;
    const next = usingFront ? facing.back!.id : facing.front!.id;
    void switchCamera(next);
  };

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

        <div className="relative mb-3 h-[280px] overflow-hidden rounded-2xl bg-black">
          {/* Library mounts <video> here (often black on mobile). */}
          <div id={SCANNER_ELEMENT_ID} className="pwa-barcode-scanner absolute inset-0" />
          {/* Visible preview painted from the live stream */}
          <canvas
            ref={previewRef}
            className="pointer-events-none absolute inset-0 z-10 h-full w-full"
            aria-hidden
          />
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
            <div className="h-44 w-44 rounded-2xl border-2 border-white/70 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
          </div>

          {canToggleFacing && (
            <button
              type="button"
              onClick={flipCamera}
              disabled={starting}
              className="absolute bottom-3 right-3 z-30 flex h-12 w-12 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-md ring-1 ring-white/25 transition active:scale-95 disabled:opacity-50"
              aria-label={usingFront ? "Switch to back camera" : "Switch to front camera"}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path
                  d="M16 4h2a2 2 0 012 2v2M8 20H6a2 2 0 01-2-2v-2M20 8l2-2-2-2M4 16l-2 2 2 2"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <circle cx="12" cy="12" r="3.25" stroke="currentColor" strokeWidth="2" />
              </svg>
            </button>
          )}
        </div>

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

        {canToggleFacing && (
          <div
            className="mb-3 flex rounded-full bg-slate-100 p-1 dark:bg-slate-800"
            role="group"
            aria-label="Camera"
          >
            <button
              type="button"
              disabled={starting || !facing.back}
              onClick={() => facing.back && void switchCamera(facing.back.id)}
              aria-pressed={!usingFront}
              className={`min-h-11 flex-1 rounded-full text-sm font-bold transition ${
                !usingFront
                  ? "bg-white text-slate-900 shadow-sm dark:bg-slate-600 dark:text-white"
                  : "text-slate-500 dark:text-slate-300"
              }`}
            >
              Back
            </button>
            <button
              type="button"
              disabled={starting || !facing.front}
              onClick={() => facing.front && void switchCamera(facing.front.id)}
              aria-pressed={usingFront}
              className={`min-h-11 flex-1 rounded-full text-sm font-bold transition ${
                usingFront
                  ? "bg-white text-slate-900 shadow-sm dark:bg-slate-600 dark:text-white"
                  : "text-slate-500 dark:text-slate-300"
              }`}
            >
              Front
            </button>
          </div>
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
