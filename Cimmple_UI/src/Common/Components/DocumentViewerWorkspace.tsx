import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import "./DocumentViewerWorkspace.scss";

// CRA-friendly worker; version stays in sync with the installed pdfjs-dist.
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

export type DocumentViewerFile = {
  id: number | string;
  name: string;
  /** @deprecated Prefer localUrl / onNeedDocument over base64 fileCode */
  fileCode?: string | null;
  contentType?: string;
  /** Cached or pending local blob/object URL */
  localUrl?: string;
  fileUniqueno?: number;
  size?: number;
  isPending?: boolean;
};

/** Extensible viewer modes for future OCR / extraction / annotation work. */
export type DocumentViewerMode = "view" | "select-pages" | "extract" | "annotate";

export type DocumentViewerWorkspaceProps = {
  documents: DocumentViewerFile[];
  activeIndex: number;
  onActiveIndexChange: (index: number) => void;
  onClose: () => void;
  onDownload?: (file: DocumentViewerFile, index: number) => void;
  /**
   * Lazy-load document bytes when localUrl/fileCode is missing.
   * Parent should return a blob/object URL (ideally from session cache).
   */
  onNeedDocument?: (
    file: DocumentViewerFile,
    index: number,
    signal: AbortSignal
  ) => Promise<{ url: string; contentType?: string } | null>;
  /** Optional: warm the next document after the active one is ready. */
  onPrefetchDocument?: (file: DocumentViewerFile, index: number) => void;
  /** Reserved for future page-selection / extraction flows. */
  mode?: DocumentViewerMode;
  selectedPages?: number[];
  onSelectedPagesChange?: (pages: number[]) => void;
  className?: string;
};

const IMAGE_EXTS = ["jpg", "jpeg", "png", "gif", "webp", "bmp", "tif", "tiff"];
const TEXT_EXTS = ["txt", "csv", "log", "json", "xml", "md", "rtf"];
const OFFICE_EXTS = ["doc", "docx", "xls", "xlsx", "ppt", "pptx"];

const ZOOM_STEP = 0.15;
const MIN_ZOOM = 0.4;
const MAX_ZOOM = 3;

function getExtension(name?: string): string {
  if (!name) return "";
  const parts = name.split(".");
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : "";
}

function getMimeFromExtension(ext: string): string {
  switch (ext) {
    case "pdf":
      return "application/pdf";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "bmp":
      return "image/bmp";
    case "tif":
    case "tiff":
      return "image/tiff";
    case "txt":
      return "text/plain";
    case "csv":
      return "text/csv";
    default:
      return "application/octet-stream";
  }
}

function toSourceUrl(file: DocumentViewerFile): string | null {
  if (file.localUrl) return file.localUrl;
  if (!file.fileCode) return null;
  if (file.fileCode.startsWith("data:") || file.fileCode.startsWith("blob:")) {
    return file.fileCode;
  }
  const ext = getExtension(file.name);
  const mime = file.contentType || getMimeFromExtension(ext);
  return `data:${mime};base64,${file.fileCode}`;
}

function getPreviewKind(file: DocumentViewerFile): "pdf" | "image" | "text" | "office" | "other" {
  const ext = getExtension(file.name);
  const ct = (file.contentType || "").toLowerCase();
  if (ext === "pdf" || ct.includes("pdf")) return "pdf";
  if (IMAGE_EXTS.includes(ext) || ct.startsWith("image/")) return "image";
  if (TEXT_EXTS.includes(ext) || ct.startsWith("text/")) return "text";
  if (OFFICE_EXTS.includes(ext) || ct.includes("officedocument") || ct.includes("msword") || ct.includes("ms-excel") || ct.includes("ms-powerpoint")) {
    return "office";
  }
  return "other";
}

const IconButton: React.FC<{
  title: string;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
  children: React.ReactNode;
}> = ({ title, onClick, disabled, active, children }) => (
  <button
    type="button"
    className={`doc-viewer__icon-btn ${active ? "is-active" : ""}`}
    title={title}
    aria-label={title}
    onClick={onClick}
    disabled={disabled}
  >
    {children}
  </button>
);

const DocumentViewerWorkspace: React.FC<DocumentViewerWorkspaceProps> = ({
  documents,
  activeIndex,
  onActiveIndexChange,
  onClose,
  onDownload,
  onNeedDocument,
  onPrefetchDocument,
  mode = "view",
  selectedPages,
  onSelectedPagesChange,
  className,
}) => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const [numPages, setNumPages] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [fitMode, setFitMode] = useState<"width" | "page" | "custom">("width");
  const [thumbnailsOpen, setThumbnailsOpen] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [docLoading, setDocLoading] = useState(false);
  const [docError, setDocError] = useState<string | null>(null);
  const [textContent, setTextContent] = useState("");
  const [containerWidth, setContainerWidth] = useState(720);
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const [resolvedContentType, setResolvedContentType] = useState<string | undefined>(undefined);
  const [resolvedForKey, setResolvedForKey] = useState<string | null>(null);

  const safeIndex = Math.min(Math.max(activeIndex, 0), Math.max(documents.length - 1, 0));
  const current = documents[safeIndex];
  const currentKey = current
    ? `${current.id}:${current.fileUniqueno || 0}:${current.localUrl || current.fileCode || ""}`
    : "";
  const immediateUrl = useMemo(() => (current ? toSourceUrl(current) : null), [current]);
  const activeResolvedUrl = resolvedForKey === currentKey ? resolvedUrl : null;
  const activeResolvedContentType =
    resolvedForKey === currentKey ? resolvedContentType : undefined;
  const sourceUrl = activeResolvedUrl || immediateUrl;
  const kind = current
    ? getPreviewKind({ ...current, contentType: activeResolvedContentType || current.contentType })
    : "other";

  // Lazy-load active document when no local/cached URL is present yet.
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    setResolvedUrl(null);
    setResolvedContentType(undefined);
    setResolvedForKey(null);
    setDocError(null);

    if (!current) {
      setDocLoading(false);
      return;
    }

    const existing = toSourceUrl(current);
    if (existing) {
      setResolvedUrl(existing);
      setResolvedContentType(current.contentType);
      setResolvedForKey(currentKey);
      setDocLoading(getPreviewKind(current) === "pdf");
      return;
    }

    const previewKind = getPreviewKind(current);
    // Office/unknown types have no in-app preview — skip download until user hits Download.
    if (previewKind === "office" || previewKind === "other") {
      setDocLoading(false);
      return;
    }

    if (!onNeedDocument) {
      setDocLoading(false);
      setDocError("Document content is not available.");
      return;
    }

    setDocLoading(true);
    (async () => {
      try {
        const result = await onNeedDocument(current, safeIndex, controller.signal);
        if (cancelled) return;
        if (!result?.url) {
          setDocError("Failed to load document.");
          setDocLoading(false);
          return;
        }
        setResolvedUrl(result.url);
        setResolvedContentType(result.contentType || current.contentType);
        setResolvedForKey(currentKey);
        // PDF keeps loading until react-pdf onLoadSuccess; others stop here.
        if (getPreviewKind({ ...current, contentType: result.contentType }) !== "pdf") {
          setDocLoading(false);
        }
      } catch (err: any) {
        if (cancelled || err?.name === "CanceledError" || err?.name === "AbortError") {
          return;
        }
        if (!cancelled) {
          setDocError(err?.message || "Failed to load document.");
          setDocLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [currentKey, safeIndex, onNeedDocument]);

  // Soft-prefetch the next document after the active one is available.
  useEffect(() => {
    if (!sourceUrl || !onPrefetchDocument || !current) return;
    const nextIndex = safeIndex + 1;
    if (nextIndex >= documents.length) return;
    const next = documents[nextIndex];
    if (!next || toSourceUrl(next)) return;
    const nextKind = getPreviewKind(next);
    if (nextKind === "office" || nextKind === "other") return;
    onPrefetchDocument(next, nextIndex);
  }, [sourceUrl, safeIndex, documents, onPrefetchDocument, current]);

  // Track canvas width for Fit Width / Fit Page
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width && width > 0) {
        setContainerWidth(width);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [safeIndex, kind, sourceUrl]);

  // Reset per-document view state when switching attachments
  useEffect(() => {
    setNumPages(0);
    setPageNumber(1);
    setRotation(0);
    setFitMode("width");
    setScale(1);
    setTextContent("");
  }, [current?.id]);

  // Keep page indicator in sync while scrolling through multi-page PDFs
  useEffect(() => {
    if (kind !== "pdf" || numPages <= 0) return;
    const root = canvasRef.current;
    if (!root) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!visible) return;
        const page = Number((visible.target as HTMLElement).dataset.page);
        if (page) {
          setPageNumber((prev) => (prev === page ? prev : page));
        }
      },
      { root, threshold: [0.35, 0.55, 0.75] }
    );

    Object.values(pageRefs.current).forEach((el) => {
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [kind, numPages, safeIndex, sourceUrl]);

  // Load text previews
  useEffect(() => {
    let cancelled = false;
    if (!current || kind !== "text" || !sourceUrl) return;

    (async () => {
      try {
        const response = await fetch(sourceUrl);
        const text = await response.text();
        if (!cancelled) setTextContent(text);
      } catch {
        if (!cancelled) setDocError("Unable to preview this text file.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [current, kind, sourceUrl]);

  const pageWidth = useMemo(() => {
    if (fitMode === "width") {
      return Math.max(240, containerWidth - 48);
    }
    if (fitMode === "page") {
      return Math.max(240, Math.min(containerWidth - 48, 820));
    }
    return Math.max(240, (containerWidth - 48) * scale);
  }, [fitMode, containerWidth, scale]);

  const goToPage = useCallback((page: number) => {
    if (page < 1 || (numPages > 0 && page > numPages)) return;
    setPageNumber(page);
    const target = pageRefs.current[page];
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [numPages]);

  const handleZoomIn = () => {
    setFitMode("custom");
    setScale((s) => Math.min(MAX_ZOOM, +(s + ZOOM_STEP).toFixed(2)));
  };

  const handleZoomOut = () => {
    setFitMode("custom");
    setScale((s) => Math.max(MIN_ZOOM, +(s - ZOOM_STEP).toFixed(2)));
  };

  const handleFitWidth = () => {
    setFitMode("width");
    setScale(1);
  };

  const handleFitPage = () => {
    setFitMode("page");
    setScale(1);
  };

  const handleRotate = () => {
    setRotation((r) => (r + 90) % 360);
  };

  const toggleFullscreen = async () => {
    const root = canvasRef.current?.closest(".doc-viewer") as HTMLElement | null;
    if (!root) return;
    try {
      if (!document.fullscreenElement) {
        await root.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch {
      setIsFullscreen((v) => !v);
    }
  };

  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  const onDocumentLoadSuccess = ({ numPages: next }: { numPages: number }) => {
    setNumPages(next);
    setPageNumber(1);
    setDocLoading(false);
    setDocError(null);
  };

  const onDocumentLoadError = () => {
    setDocLoading(false);
    setDocError("Failed to load this PDF document.");
  };

  const togglePageSelection = (page: number) => {
    if (mode !== "select-pages" || !onSelectedPagesChange) return;
    const currentSelection = selectedPages || [];
    if (currentSelection.includes(page)) {
      onSelectedPagesChange(currentSelection.filter((p) => p !== page));
    } else {
      onSelectedPagesChange([...currentSelection, page].sort((a, b) => a - b));
    }
  };

  if (!current) {
    return (
      <div className={`doc-viewer empty ${className || ""}`}>
        <p>No document selected</p>
        <button type="button" className="doc-viewer__text-btn" onClick={onClose}>
          Close
        </button>
      </div>
    );
  }

  const zoomLabel =
    fitMode === "width" ? "Fit width" : fitMode === "page" ? "Fit page" : `${Math.round(scale * 100)}%`;

  return (
    <div className={`doc-viewer ${isFullscreen ? "is-fullscreen" : ""} ${className || ""}`} data-mode={mode}>
      <div className="doc-viewer__toolbar">
        <div className="doc-viewer__toolbar-left">
          <IconButton
            title={thumbnailsOpen ? "Hide thumbnails" : "Show thumbnails"}
            onClick={() => setThumbnailsOpen((v) => !v)}
            active={thumbnailsOpen}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
              <rect x="14" y="14" width="7" height="7" rx="1" />
            </svg>
          </IconButton>

          <div className="doc-viewer__doc-meta">
            <div className="doc-viewer__doc-name" title={current.name}>
              {current.name}
            </div>
            <div className="doc-viewer__doc-count">
              {safeIndex + 1} of {documents.length}
            </div>
          </div>
        </div>

        <div className="doc-viewer__toolbar-center">
          <IconButton
            title="Previous document"
            disabled={safeIndex <= 0}
            onClick={() => onActiveIndexChange(safeIndex - 1)}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </IconButton>
          <IconButton
            title="Next document"
            disabled={safeIndex >= documents.length - 1}
            onClick={() => onActiveIndexChange(safeIndex + 1)}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </IconButton>

          <div className="doc-viewer__divider" />

          <IconButton
            title="Previous page"
            disabled={kind !== "pdf" || pageNumber <= 1}
            onClick={() => goToPage(pageNumber - 1)}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="18 15 12 9 6 15" />
            </svg>
          </IconButton>
          <div className="doc-viewer__page-indicator">
            {kind === "pdf" ? (
              <>
                <input
                  type="number"
                  min={1}
                  max={numPages || 1}
                  value={pageNumber}
                  onChange={(e) => {
                    const next = parseInt(e.target.value, 10);
                    if (!Number.isNaN(next)) goToPage(next);
                  }}
                  aria-label="Current page"
                />
                <span>/ {numPages || "—"}</span>
              </>
            ) : (
              <span>1 / 1</span>
            )}
          </div>
          <IconButton
            title="Next page"
            disabled={kind !== "pdf" || pageNumber >= numPages}
            onClick={() => goToPage(pageNumber + 1)}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </IconButton>

          <div className="doc-viewer__divider" />

          <IconButton title="Zoom out" onClick={handleZoomOut} disabled={fitMode === "custom" && scale <= MIN_ZOOM}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
              <line x1="8" y1="11" x2="14" y2="11" />
            </svg>
          </IconButton>
          <span className="doc-viewer__zoom-label">{zoomLabel}</span>
          <IconButton title="Zoom in" onClick={handleZoomIn} disabled={fitMode === "custom" && scale >= MAX_ZOOM}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
              <line x1="11" y1="8" x2="11" y2="14" />
              <line x1="8" y1="11" x2="14" y2="11" />
            </svg>
          </IconButton>
          <IconButton title="Fit width" onClick={handleFitWidth} active={fitMode === "width"}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 12h16M8 8l-4 4 4 4M16 8l4 4-4 4" />
            </svg>
          </IconButton>
          <IconButton title="Fit page" onClick={handleFitPage} active={fitMode === "page"}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="5" y="3" width="14" height="18" rx="2" />
            </svg>
          </IconButton>
          <IconButton title="Rotate" onClick={handleRotate}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M23 4v6h-6" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
          </IconButton>
        </div>

        <div className="doc-viewer__toolbar-right">
          {onDownload && (
            <IconButton title="Download" onClick={() => onDownload(current, safeIndex)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </IconButton>
          )}
          <IconButton title={isFullscreen ? "Exit fullscreen" : "Fullscreen"} onClick={toggleFullscreen}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              {isFullscreen ? (
                <>
                  <path d="M8 3v3a2 2 0 0 1-2 2H3" />
                  <path d="M21 8h-3a2 2 0 0 1-2-2V3" />
                  <path d="M3 16h3a2 2 0 0 1 2 2v3" />
                  <path d="M16 21v-3a2 2 0 0 1 2-2h3" />
                </>
              ) : (
                <>
                  <path d="M8 3H5a2 2 0 0 0-2 2v3" />
                  <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
                  <path d="M3 16v3a2 2 0 0 0 2 2h3" />
                  <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
                </>
              )}
            </svg>
          </IconButton>
          <IconButton title="Close viewer" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </IconButton>
        </div>
      </div>

      <div className="doc-viewer__body">
        {!docError && !sourceUrl && (docLoading || kind === "pdf" || kind === "image" || kind === "text") ? (
          <div className="doc-viewer__status">
            <div className="doc-viewer__spinner" />
            <p>Loading document…</p>
          </div>
        ) : !docError && kind === "pdf" && sourceUrl ? (
          <Document
            file={sourceUrl}
            loading={
              <div className="doc-viewer__status">
                <div className="doc-viewer__spinner" />
                <p>Loading document…</p>
              </div>
            }
            onLoadSuccess={onDocumentLoadSuccess}
            onLoadError={onDocumentLoadError}
            className="doc-viewer__document-shell"
          >
            {thumbnailsOpen && numPages > 0 && (
              <aside className="doc-viewer__thumbs" aria-label="Page thumbnails">
                {Array.from({ length: numPages }, (_, i) => i + 1).map((page) => {
                  const selected = (selectedPages || []).includes(page);
                  return (
                    <button
                      type="button"
                      key={`thumb-${current.id}-${page}`}
                      className={`doc-viewer__thumb ${page === pageNumber ? "is-active" : ""} ${selected ? "is-selected" : ""}`}
                      onClick={() => {
                        goToPage(page);
                        togglePageSelection(page);
                      }}
                    >
                      <div className="doc-viewer__thumb-page">
                        <Page
                          pageNumber={page}
                          width={96}
                          renderTextLayer={false}
                          renderAnnotationLayer={false}
                        />
                      </div>
                      <span className="doc-viewer__thumb-label">{page}</span>
                      {mode === "select-pages" && (
                        <span className={`doc-viewer__thumb-check ${selected ? "checked" : ""}`} aria-hidden>
                          {selected ? "✓" : ""}
                        </span>
                      )}
                    </button>
                  );
                })}
              </aside>
            )}

            <div className="doc-viewer__canvas" ref={canvasRef}>
              {docLoading && (
                <div className="doc-viewer__status">
                  <div className="doc-viewer__spinner" />
                  <p>Loading document…</p>
                </div>
              )}

              <div className="doc-viewer__pdf">
                {numPages > 0 &&
                  Array.from({ length: numPages }, (_, i) => i + 1).map((page) => (
                    <div
                      key={`page-${current.id}-${page}`}
                      className={`doc-viewer__page-wrap ${page === pageNumber ? "is-active" : ""}`}
                      ref={(el) => {
                        pageRefs.current[page] = el;
                      }}
                      data-page={page}
                    >
                      <Page
                        pageNumber={page}
                        width={pageWidth}
                        rotate={rotation}
                        renderTextLayer
                        renderAnnotationLayer
                        loading={
                          <div className="doc-viewer__page-loading">Loading page {page}…</div>
                        }
                      />
                      {/* Future: region highlights / OCR overlays rendered in this slot */}
                      <div className="doc-viewer__overlay-slot" data-page={page} />
                    </div>
                  ))}
              </div>
            </div>
          </Document>
        ) : (
          <div className="doc-viewer__canvas" ref={canvasRef}>
            {docError && (
              <div className="doc-viewer__status error">
                <div className="doc-viewer__error-icon">{getExtension(current.name).toUpperCase() || "FILE"}</div>
                <h4>{current.name}</h4>
                <p>{docError}</p>
                {onDownload && (
                  <button type="button" className="doc-viewer__primary-btn" onClick={() => onDownload(current, safeIndex)}>
                    Download file
                  </button>
                )}
              </div>
            )}

            {!docError && kind === "image" && sourceUrl && (
              <div
                className="doc-viewer__image-wrap"
                style={{ transform: `rotate(${rotation}deg) scale(${fitMode === "custom" ? scale : 1})` }}
              >
                <img src={sourceUrl} alt={current.name} />
              </div>
            )}

            {!docError && kind === "text" && (
              <div className="doc-viewer__text-wrap">
                <pre>{textContent || "Loading…"}</pre>
              </div>
            )}

            {!docError && (kind === "office" || kind === "other" || (!sourceUrl && kind !== "pdf")) && (
              <div className="doc-viewer__status">
                <div className="doc-viewer__error-icon">{getExtension(current.name).toUpperCase() || "FILE"}</div>
                <h4>{current.name}</h4>
                <p>
                  {kind === "office"
                    ? "Preview is not available for Office documents. Download to open in the desktop app."
                    : "Preview is not available for this file type."}
                </p>
                {onDownload && (
                  <button type="button" className="doc-viewer__primary-btn" onClick={() => onDownload(current, safeIndex)}>
                    Download file
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default DocumentViewerWorkspace;
