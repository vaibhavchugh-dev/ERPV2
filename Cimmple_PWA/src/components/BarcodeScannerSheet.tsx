import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { parseStepScanCode } from "../utils/parseStepScanCode";

interface BarcodeScannerSheetProps {
  open: boolean;
  onClose: () => void;
  onScan: (jobOrderId: number, stepId: number) => void;
}

type CamInfo = { id: string; label: string; facing: "back" | "front" | "unknown" };

const IR_OR_VIRTUAL =
  /\b(ir|infrared|depth|tof|metaverse|virtual|obs|manycam|snap|ndi|hello)\b/i;
const BACK_CAMERA = /facing[\s_-]*back|\b(back|rear|environment|trás|arrière|world)\b/i;
const FRONT_CAMERA = /facing[\s_-]*front|\b(front|user|selfie)\b/i;

type BarcodeDetectorLike = {
  detect: (source: HTMLVideoElement | HTMLCanvasElement) => Promise<Array<{ rawValue: string }>>;
};

function getBarcodeDetector(): BarcodeDetectorLike | null {
  const Ctor = (window as unknown as { BarcodeDetector?: new (opts?: { formats?: string[] }) => BarcodeDetectorLike })
    .BarcodeDetector;
  if (!Ctor) return null;
  try {
    return new Ctor({
      formats: ["qr_code", "code_128", "code_39", "ean_13", "ean_8", "upc_a", "upc_e"],
    });
  } catch {
    try {
      return new Ctor();
    } catch {
      return null;
    }
  }
}

function classifyFacing(label: string): CamInfo["facing"] {
  if (BACK_CAMERA.test(label)) return "back";
  if (FRONT_CAMERA.test(label)) return "front";
  return "unknown";
}

async function listVideoCameras(): Promise<CamInfo[]> {
  // Permission + labels
  try {
    const warm = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    warm.getTracks().forEach((t) => t.stop());
  } catch {
    // startCamera will surface errors
  }

  const devices = await navigator.mediaDevices.enumerateDevices();
  const cams = devices
    .filter((d) => d.kind === "videoinput" && !IR_OR_VIRTUAL.test(d.label || ""))
    .map((d) => ({
      id: d.deviceId,
      label: d.label || "",
      facing: classifyFacing(d.label || ""),
    }));

  // Prefer labeled back, then first device as back, second as front when unlabeled.
  const back = cams.find((c) => c.facing === "back");
  const front = cams.find((c) => c.facing === "front");
  if (!back && !front && cams.length >= 1) {
    cams[0].facing = "back";
    if (cams[1]) cams[1].facing = "front";
  } else if (back && !front && cams.length >= 2) {
    const other = cams.find((c) => c.id !== back.id);
    if (other) other.facing = "front";
  } else if (front && !back && cams.length >= 2) {
    const other = cams.find((c) => c.id !== front.id);
    if (other) other.facing = "back";
  }

  return cams.sort((a, b) => {
    const rank = (f: CamInfo["facing"]) => (f === "back" ? 0 : f === "front" ? 1 : 2);
    return rank(a.facing) - rank(b.facing);
  });
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

export function BarcodeScannerSheet({ open, onClose, onScan }: BarcodeScannerSheetProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const onScanRef = useRef(onScan);
  const handledRef = useRef(false);
  const startGenRef = useRef(0);
  const decodeTimerRef = useRef<number | null>(null);

  const [manualCode, setManualCode] = useState("");
  const [error, setError] = useState("");
  const [cameraError, setCameraError] = useState("");
  const [starting, setStarting] = useState(false);
  const [cameras, setCameras] = useState<CamInfo[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState("");

  onScanRef.current = onScan;

  const stopStream = () => {
    if (decodeTimerRef.current != null) {
      window.clearInterval(decodeTimerRef.current);
      decodeTimerRef.current = null;
    }
    const stream = streamRef.current;
    streamRef.current = null;
    if (stream) stream.getTracks().forEach((t) => t.stop());
    const video = videoRef.current;
    if (video) {
      video.srcObject = null;
    }
  };

  const handleDecoded = (decodedText: string) => {
    if (handledRef.current) return;
    const parsed = parseStepScanCode(decodedText);
    if (!parsed) {
      setError("Unrecognized Cimmple barcode");
      return;
    }
    handledRef.current = true;
    setError("");
    stopStream();
    onScanRef.current(parsed.jobOrderId, parsed.stepId);
  };

  const startDecodeLoop = (video: HTMLVideoElement) => {
    if (decodeTimerRef.current != null) {
      window.clearInterval(decodeTimerRef.current);
    }

    const detector = getBarcodeDetector();
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    decodeTimerRef.current = window.setInterval(() => {
      if (handledRef.current || video.readyState < 2 || video.videoWidth < 2) return;

      void (async () => {
        try {
          if (detector) {
            const codes = await detector.detect(video);
            if (codes[0]?.rawValue) {
              handleDecoded(codes[0].rawValue);
              return;
            }
          }
        } catch {
          // fall through to jsQR
        }

        if (!ctx) return;
        const w = video.videoWidth;
        const h = video.videoHeight;
        // Downscale for speed on phones
        const maxW = 480;
        const scale = w > maxW ? maxW / w : 1;
        const cw = Math.max(1, Math.floor(w * scale));
        const ch = Math.max(1, Math.floor(h * scale));
        if (canvas.width !== cw || canvas.height !== ch) {
          canvas.width = cw;
          canvas.height = ch;
        }
        ctx.drawImage(video, 0, 0, cw, ch);
        const image = ctx.getImageData(0, 0, cw, ch);
        const code = jsQR(image.data, cw, ch, { inversionAttempts: "dontInvert" });
        if (code?.data) handleDecoded(code.data);
      })();
    }, 250);
  };

  const startCamera = async (cameraId: string, gen: number) => {
    const video = videoRef.current;
    if (!video) throw new Error("Video element missing");

    stopStream();

    const constraints: MediaStreamConstraints = {
      audio: false,
      video: cameraId
        ? {
            deviceId: { exact: cameraId },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          }
        : {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
    };

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch {
      // Exact deviceId can fail after re-enumeration; retry softer.
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: cameraId
          ? { deviceId: cameraId }
          : { facingMode: "environment" },
      });
    }

    if (gen !== startGenRef.current) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }

    streamRef.current = stream;
    video.setAttribute("playsinline", "true");
    video.setAttribute("webkit-playsinline", "true");
    video.muted = true;
    video.playsInline = true;
    video.controls = false;
    video.srcObject = stream;

    await video.play();
    if (gen !== startGenRef.current) {
      stopStream();
      return;
    }

    startDecodeLoop(video);
  };

  useEffect(() => {
    if (!open) return;

    handledRef.current = false;
    setError("");
    setCameraError("");
    setManualCode("");
    setStarting(true);

    const gen = ++startGenRef.current;
    let cancelled = false;

    const boot = window.setTimeout(() => {
      void (async () => {
        try {
          if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
            throw new Error("Only secure origins are allowed");
          }

          const cams = await listVideoCameras();
          if (cancelled || gen !== startGenRef.current) return;

          setCameras(cams);
          const preferred =
            cams.find((c) => c.facing === "back")?.id ||
            cams[0]?.id ||
            "";
          setSelectedCameraId(preferred);

          await startCamera(preferred, gen);
          if (cancelled || gen !== startGenRef.current) return;
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
      window.clearTimeout(boot);
      stopStream();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open-only lifecycle
  }, [open]);

  const switchCamera = async (cameraId: string) => {
    if (!cameraId || cameraId === selectedCameraId || starting) return;
    setSelectedCameraId(cameraId);
    setCameraError("");
    setStarting(true);
    handledRef.current = false;
    const gen = ++startGenRef.current;
    try {
      await startCamera(cameraId, gen);
      if (gen === startGenRef.current) setStarting(false);
    } catch (err: unknown) {
      if (gen === startGenRef.current) {
        setStarting(false);
        setCameraError(cameraFailureMessage(err));
      }
    }
  };

  if (!open) return null;

  const backCam = cameras.find((c) => c.facing === "back");
  const frontCam = cameras.find((c) => c.facing === "front");
  const canToggleFacing = !!(backCam && frontCam);
  const usingFront = !!frontCam && selectedCameraId === frontCam.id;

  const flipCamera = () => {
    if (!canToggleFacing || starting) return;
    void switchCamera(usingFront ? backCam!.id : frontCam!.id);
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
          <video
            ref={videoRef}
            className="absolute inset-0 z-10 h-full w-full object-cover"
            playsInline
            muted
            autoPlay
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
              disabled={starting || !backCam}
              onClick={() => backCam && void switchCamera(backCam.id)}
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
              disabled={starting || !frontCam}
              onClick={() => frontCam && void switchCamera(frontCam.id)}
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
