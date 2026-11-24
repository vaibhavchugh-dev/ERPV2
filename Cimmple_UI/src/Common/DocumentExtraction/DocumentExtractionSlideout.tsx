import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-toastify";
import DocumentViewerWorkspace, {
  DocumentViewerFile,
} from "../Components/DocumentViewerWorkspace";
import {
  formatFileSize,
  getApiErrorMessage,
} from "../Services/FileUploadHelper";
import {
  buildSelectedPagesPdf,
  formatPageSelectionSummary,
} from "./buildSelectedPagesPdf";
import { DocumentExtractionService } from "./DocumentExtractionService";
import type { DocumentExtractionSession } from "./DocumentExtractionSession";
import { buildCustomerDocumentReview } from "./mappers/customerDocumentMapper";
import { buildVendorInvoiceReview } from "./mappers/vendorInvoiceMapper";
import { buildVendorOrderReview } from "./mappers/vendorOrderMapper";
import { buildVendorQuotationReview } from "./mappers/vendorQuotationMapper";
import type {
  CustomerCandidate,
  DocumentExtractionKind,
  DocumentExtractionReview,
  VendorCandidate,
} from "./types";
import { isCustomerExtractionKind } from "./types";
import "../../Modules/Quotations/VendorQuotationSlideout.scss";
import "./DocumentExtractionSlideout.scss";

export type DocumentExtractionImportMode = "override" | "append";

export interface DocumentExtractionImportPayload {
  kind: DocumentExtractionKind;
  review: DocumentExtractionReview;
  mode: DocumentExtractionImportMode;
  sourceFile: File | null;
  attachSourceFile: boolean;
}

interface DocumentExtractionSlideoutProps {
  kind?: DocumentExtractionKind;
  session: DocumentExtractionSession;
  onSessionChange: (next: DocumentExtractionSession) => void;
  onClose: () => void;
  vendors?: VendorCandidate[];
  customers?: CustomerCandidate[];
  /** Optional; retained for host compatibility (job matching happens on import). */
  jobOrders?: unknown[];
  hostHasExistingLines: boolean;
  /** When true, skip the Replace/Append dialog and apply directly (e.g. PO/Order invoice modals). */
  skipImportModePrompt?: boolean;
  /** Optional z-index override so the slideout can stack above high z-index modals. */
  overlayZIndex?: number;
  onImport: (payload: DocumentExtractionImportPayload) => void;
}

const KIND_LABELS: Record<DocumentExtractionKind, string> = {
  vendorQuotation: "Vendor Quotation",
  vendorOrder: "Vendor Order",
  vendorInvoice: "Vendor Invoice",
  customerQuotation: "Customer Quotation",
  customerOrder: "Customer Order",
  customerInvoice: "Customer Invoice",
};

const STEPS = [
  { id: "upload", label: "Upload" },
  { id: "select", label: "Select pages" },
  { id: "extracting", label: "Processing" },
] as const;

const DocumentExtractionSlideout: React.FC<DocumentExtractionSlideoutProps> = ({
  kind = "vendorQuotation",
  session,
  onSessionChange,
  onClose,
  vendors = [],
  customers = [],
  hostHasExistingLines,
  skipImportModePrompt = false,
  overlayZIndex,
  onImport,
}) => {
  const activeKind = (session.kind || kind) as DocumentExtractionKind;
  const kindLabel = KIND_LABELS[activeKind] || "Document";
  const PROCESSING_STEPS = [
    "Reading PDF document",
    isCustomerExtractionKind(activeKind)
      ? "Extracting customer details"
      : "Extracting vendor details",
    "Identifying line items",
    "Validating prices and quantities",
  ] as const;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingReviewRef = useRef<DocumentExtractionReview | null>(null);
  const [dragging, setDragging] = useState(false);
  const [attachSourceFile] = useState(true);
  const [importModePrompt, setImportModePrompt] = useState(false);
  const [processingIndex, setProcessingIndex] = useState(0);

  const updateSession = useCallback(
    (patch: Partial<DocumentExtractionSession>) => {
      onSessionChange({ ...session, ...patch, kind: session.kind || kind });
    },
    [session, onSessionChange, kind]
  );

  useEffect(() => {
    if (session.step !== "extracting") {
      setProcessingIndex(0);
      return;
    }
    setProcessingIndex(0);
    const timers = [
      window.setTimeout(() => setProcessingIndex(1), 700),
      window.setTimeout(() => setProcessingIndex(2), 1600),
      window.setTimeout(() => setProcessingIndex(3), 2600),
    ];
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [session.step]);

  const acceptPdfFile = useCallback(
    (file: File | null | undefined) => {
      if (!file) return;
      const isPdf =
        file.type === "application/pdf" ||
        file.name.toLowerCase().endsWith(".pdf");
      if (!isPdf) {
        toast.error("Only PDF files are supported for extraction.");
        return;
      }
      if (file.size > 52_428_800) {
        toast.error("File exceeds the 50 MB size limit.");
        return;
      }

      if (session.localUrl) {
        try {
          URL.revokeObjectURL(session.localUrl);
        } catch {
          // ignore
        }
      }

      const localUrl = URL.createObjectURL(file);
      onSessionChange({
        ...session,
        kind: session.kind || kind,
        step: "select",
        file,
        localUrl,
        fileName: file.name,
        selectedPages: [],
        pageCount: 0,
        rawResult: null,
        review: null,
        hasImported: false,
        error: null,
      });
    },
    [session, onSessionChange, kind]
  );

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    acceptPdfFile(e.dataTransfer.files?.[0]);
  };

  const viewerDocuments: DocumentViewerFile[] = useMemo(() => {
    if (!session.file || !session.localUrl) return [];
    return [
      {
        id: "extraction-upload",
        name: session.fileName || session.file.name,
        localUrl: session.localUrl,
        contentType: "application/pdf",
        size: session.file.size,
        isPending: true,
      },
    ];
  }, [session.file, session.localUrl, session.fileName]);

  const applyExtractionToHost = (
    review: DocumentExtractionReview,
    mode: DocumentExtractionImportMode
  ) => {
    onImport({
      kind: activeKind,
      review,
      mode,
      sourceFile: session.file,
      attachSourceFile,
    });
    updateSession({
      hasImported: true,
      step: "select",
      review,
      error: null,
    });
    setImportModePrompt(false);
    onClose();
  };

  const buildReviewForKind = (result: Parameters<typeof buildVendorQuotationReview>[0]) => {
    if (isCustomerExtractionKind(activeKind)) {
      return buildCustomerDocumentReview(result, customers);
    }
    if (activeKind === "vendorInvoice") {
      return buildVendorInvoiceReview(result, vendors);
    }
    if (activeKind === "vendorOrder") {
      return buildVendorOrderReview(result, vendors);
    }
    return buildVendorQuotationReview(result, vendors);
  };

  const handleExtract = async () => {
    if (!session.file) {
      toast.error("Please upload a PDF first.");
      return;
    }

    updateSession({ step: "extracting", error: null });

    try {
      const extractionFile = await buildSelectedPagesPdf(
        session.file,
        session.selectedPages
      );
      const callResult = await DocumentExtractionService.Extract(
        activeKind,
        extractionFile
      );

      if (!callResult?.result) {
        updateSession({
          step: "select",
          error: "No data could be extracted from this document.",
        });
        toast.error("No data could be extracted from this document.");
        return;
      }

      const { result } = callResult;
      const review = buildReviewForKind(result);
      pendingReviewRef.current = review;
      updateSession({
        step: "extracting",
        rawResult: result,
        review,
        error: null,
      });

      // Skip review — apply into the host slideout immediately.
      if (!skipImportModePrompt && (session.hasImported || hostHasExistingLines)) {
        setImportModePrompt(true);
        return;
      }
      applyExtractionToHost(review, "override");
    } catch (err) {
      pendingReviewRef.current = null;
      const message = getApiErrorMessage(err, "Document extraction failed.");
      updateSession({ step: "select", error: message });
      toast.error(message);
    }
  };

  const confirmImport = (mode: DocumentExtractionImportMode) => {
    const review = pendingReviewRef.current || session.review;
    if (!review) return;
    applyExtractionToHost(review, mode);
    pendingReviewRef.current = null;
  };

  const stepIndex = STEPS.findIndex((s) => s.id === session.step);

  const headerTitle =
    session.step === "extracting"
      ? `Extracting ${kindLabel}`
      : `Import ${kindLabel}`;

  const headerSub =
    session.step === "extracting"
      ? `Please keep this ${kindLabel.toLowerCase()} open while extraction is in progress.`
      : `Upload a ${kindLabel.toLowerCase()} PDF. AI will extract details and apply them to the form.`;

  return (
    <div
      className="vendor-quotation-slideout-overlay doc-extraction-overlay"
      style={overlayZIndex ? { zIndex: overlayZIndex } : undefined}
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Import document"
    >
      <div
        className="vendor-quotation-slideout-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="vendor-quotation-slideout-header">
          <div>
            <div className="doc-extraction-title-row">
              <h2>{headerTitle}</h2>
            </div>
            <p className="doc-extraction-header-sub">{headerSub}</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <button type="button" className="btn-close" onClick={onClose}>
              ×
            </button>
          </div>
        </div>

        <div className="doc-extraction-steps">
          {STEPS.map((step, index) => (
            <span
              key={step.id}
              className={`doc-extraction-step ${
                session.step === step.id
                  ? "is-active"
                  : index < stepIndex
                    ? "is-done"
                    : ""
              }`}
            >
              {index + 1}. {step.label}
            </span>
          ))}
        </div>

        <div className="vendor-quotation-slideout-form doc-extraction-form">
          <div className="doc-extraction-body">
            {session.step === "upload" && (
              <div className="doc-extraction-upload">
                <div
                  className={`doc-extraction-dropzone ${dragging ? "is-dragging" : ""}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={onDrop}
                >
                  <div className="doc-extraction-dropzone-icon" aria-hidden>
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                      <path d="M12 18V11" />
                      <path d="M9 14l3-3 3 3" />
                    </svg>
                  </div>
                  <h3>Drag and drop your PDF here</h3>
                  <p>or browse files from your computer</p>
                  <button
                    type="button"
                    className="btn-submit doc-extraction-choose-btn"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Choose PDF
                  </button>
                  <p className="doc-extraction-dropzone-hint">
                    PDF format · Maximum 50 MB
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/pdf,.pdf"
                    onChange={(e) => {
                      acceptPdfFile(e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                </div>
                <p className="doc-extraction-secure-note">
                  Your document is processed securely.
                </p>
              </div>
            )}

            {session.step === "select" && session.localUrl && (
              <div className="doc-extraction-viewer">
                <div className="doc-extraction-file-meta">
                  <div className="file-meta-left">
                    <div className="file-name-row">
                      <span className="doc-extraction-pdf-chip">PDF</span>
                      <div className="file-name">{session.fileName}</div>
                      <span className="doc-extraction-badge is-success">Uploaded</span>
                    </div>
                    <div className="file-hint">
                      {formatFileSize(session.file?.size || 0)}
                      {session.pageCount > 0 ? ` · ${session.pageCount} pages` : ""}
                      {" · "}
                      {formatPageSelectionSummary(
                        session.selectedPages,
                        session.pageCount
                      )}
                      {" · leave none selected to extract all pages"}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Replace file
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/pdf,.pdf"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      acceptPdfFile(e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                </div>
                <div className="doc-extraction-viewer-stage">
                  <DocumentViewerWorkspace
                    documents={viewerDocuments}
                    activeIndex={0}
                    onActiveIndexChange={() => undefined}
                    onClose={onClose}
                    hideCloseButton
                    mode="select-pages"
                    selectedPages={session.selectedPages}
                    onSelectedPagesChange={(pages) =>
                      updateSession({ selectedPages: pages })
                    }
                    onPageCountChange={(count) =>
                      updateSession({ pageCount: count })
                    }
                  />
                </div>
              </div>
            )}

            {session.step === "extracting" && (
              <div className="doc-extraction-processing">
                <div className="doc-extraction-processing-card">
                  <div className="doc-extraction-processing-file">
                    <span className="doc-extraction-pdf-chip">PDF</span>
                    <div>
                      <div className="file-name">
                        {session.fileName || "document.pdf"}
                      </div>
                      <div className="file-hint">
                        {formatFileSize(session.file?.size || 0)}
                        {session.pageCount > 0 ? ` · ${session.pageCount} pages` : ""}
                      </div>
                    </div>
                    <span className="doc-extraction-badge is-success">Uploaded</span>
                  </div>

                  <h3>Extracting {kindLabel.toLowerCase()} details</h3>

                  <ul className="doc-extraction-processing-steps">
                    {PROCESSING_STEPS.map((label, index) => {
                      const done = index < processingIndex;
                      const active = index === processingIndex;
                      return (
                        <li
                          key={label}
                          className={
                            done ? "is-done" : active ? "is-active" : "is-pending"
                          }
                        >
                          <span className="step-icon" aria-hidden>
                            {done ? "✓" : active ? "◌" : "○"}
                          </span>
                          <span className="step-label">{label}</span>
                          <span className="step-status">
                            {done ? "Completed" : active ? "Processing" : ""}
                          </span>
                        </li>
                      );
                    })}
                  </ul>

                  <div className="doc-extraction-progress-track">
                    <div
                      className="doc-extraction-progress-fill"
                      style={{
                        width: `${Math.min(
                          95,
                          ((processingIndex + 1) / PROCESSING_STEPS.length) * 100
                        )}%`,
                      }}
                    />
                  </div>
                  <p className="doc-extraction-processing-note">
                    Please keep this {kindLabel.toLowerCase()} open while extraction is in progress.
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="form-actions">
            {session.error ? (
              <span className="doc-extraction-footer-error">{session.error}</span>
            ) : null}
            <button type="button" className="btn-cancel" onClick={onClose}>
              Cancel
            </button>
            {session.step === "select" && (
              <button
                type="button"
                className="btn-submit"
                disabled={!session.file}
                onClick={handleExtract}
              >
                Extract
              </button>
            )}
          </div>
        </div>

        {importModePrompt && (
          <div
            className="doc-extraction-mode-dialog"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="doc-extraction-mode-card">
              <h3>Import extracted lines</h3>
              <p>
                The {kindLabel.toLowerCase()} already has line items
                {session.hasImported ? " (or was imported earlier)" : ""}. How
                should the extracted lines be applied?
              </p>
              <div className="form-actions">
                <button
                  type="button"
                  className="btn-cancel"
                  onClick={() => {
                    setImportModePrompt(false);
                    updateSession({ step: "select" });
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-draft"
                  onClick={() => confirmImport("append")}
                >
                  Append
                </button>
                <button
                  type="button"
                  className="btn-submit"
                  onClick={() => confirmImport("override")}
                >
                  Replace lines
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DocumentExtractionSlideout;
