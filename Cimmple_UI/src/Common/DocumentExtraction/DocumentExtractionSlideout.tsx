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
import { buildVendorQuotationReview } from "./mappers/vendorQuotationMapper";
import type {
  DocumentExtractionKind,
  VendorCandidate,
  VendorQuotationExtractionReview,
  VendorQuotationExtractionReviewLine,
} from "./types";
import {
  JobOrderService,
  type JobOrderMaster,
} from "../Services/JobOrderService";
import "../../Modules/Quotations/VendorQuotationSlideout.scss";
import "./DocumentExtractionSlideout.scss";

export type DocumentExtractionImportMode = "override" | "append";

export interface DocumentExtractionImportPayload {
  review: VendorQuotationExtractionReview;
  mode: DocumentExtractionImportMode;
  sourceFile: File | null;
  attachSourceFile: boolean;
}

interface DocumentExtractionSlideoutProps {
  kind?: DocumentExtractionKind;
  session: DocumentExtractionSession;
  onSessionChange: (next: DocumentExtractionSession) => void;
  onClose: () => void;
  vendors: VendorCandidate[];
  /** Optional preloaded job orders; loaded internally when omitted. */
  jobOrders?: JobOrderMaster[];
  hostHasExistingLines: boolean;
  onImport: (payload: DocumentExtractionImportPayload) => void;
}

function formatJobOrderLabel(job: JobOrderMaster): string {
  return (job.jobNumber || `JO#${job.jobOrderNumber}`).trim();
}

function matchJobOrderToken(
  token: string,
  jobs: JobOrderMaster[]
): JobOrderMaster | undefined {
  const raw = token.trim();
  if (!raw) return undefined;

  const exact = jobs.find(
    (j) =>
      formatJobOrderLabel(j).toLowerCase() === raw.toLowerCase() ||
      (j.jobNumber || "").trim().toLowerCase() === raw.toLowerCase()
  );
  if (exact) return exact;

  const match = raw.match(/JO#?\s*(\d+)/i) || raw.match(/^(\d+)$/);
  if (!match) return undefined;

  const num = Number(match[1]);
  return jobs.find(
    (j) =>
      j.jobOrderNumber === num ||
      String(j.jobOrderNumber) === match[1] ||
      (j.jobNumber || "").replace(/\D/g, "") === match[1]
  );
}

/** Resolve one or more JobNumber tokens (comma-separated) to jobOrderIDs. */
function resolveJobOrderIds(
  jobNumber: string | null | undefined,
  jobs: JobOrderMaster[]
): number[] {
  const raw = (jobNumber || "").trim();
  if (!raw || jobs.length === 0) return [];

  const ids: number[] = [];
  raw.split(",").forEach((token) => {
    const matched = matchJobOrderToken(token, jobs);
    if (matched && !ids.includes(matched.jobOrderID)) {
      ids.push(matched.jobOrderID);
    }
  });
  return ids;
}

function jobNumbersFromIds(ids: number[], jobs: JobOrderMaster[]): string {
  return ids
    .map((id) => jobs.find((j) => j.jobOrderID === id))
    .filter((j): j is JobOrderMaster => !!j)
    .map((j) => formatJobOrderLabel(j))
    .join(", ");
}

const STEPS = [
  { id: "upload", label: "Upload" },
  { id: "select", label: "Select pages" },
  { id: "extracting", label: "Processing" },
  { id: "review", label: "Review" },
] as const;

const PROCESSING_STEPS = [
  "Reading PDF document",
  "Extracting vendor details",
  "Identifying line items",
  "Validating prices and quantities",
] as const;

const DocumentExtractionSlideout: React.FC<DocumentExtractionSlideoutProps> = ({
  kind = "vendorQuotation",
  session,
  onSessionChange,
  onClose,
  vendors,
  jobOrders: jobOrdersProp,
  hostHasExistingLines,
  onImport,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [attachSourceFile, setAttachSourceFile] = useState(true);
  const [importModePrompt, setImportModePrompt] = useState(false);
  const [processingIndex, setProcessingIndex] = useState(0);
  const [showFullPreview, setShowFullPreview] = useState(false);
  const [jobOrdersLocal, setJobOrdersLocal] = useState<JobOrderMaster[]>([]);
  const [openJobDropdownKey, setOpenJobDropdownKey] = useState<string | null>(
    null
  );

  const jobOrders = jobOrdersProp && jobOrdersProp.length > 0
    ? jobOrdersProp
    : jobOrdersLocal;

  useEffect(() => {
    if (!openJobDropdownKey) return;
    const onDocMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest?.(`[data-job-dropdown="${openJobDropdownKey}"]`)) {
        return;
      }
      setOpenJobDropdownKey(null);
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [openJobDropdownKey]);

  useEffect(() => {
    if (jobOrdersProp && jobOrdersProp.length > 0) return;
    let cancelled = false;
    (async () => {
      try {
        const storage = JSON.parse(localStorage.getItem("storage") || "{}");
        const tenantID = storage?.tenantID || 0;
        const result = await JobOrderService.GetJobOrders({ tenantid: tenantID });
        if (!cancelled && Array.isArray(result)) {
          setJobOrdersLocal(result);
        }
      } catch {
        // Job list is optional for review; leave empty on failure.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [jobOrdersProp]);

  const updateSession = useCallback(
    (patch: Partial<DocumentExtractionSession>) => {
      onSessionChange({ ...session, ...patch, kind: session.kind || kind });
    },
    [session, onSessionChange, kind]
  );

  // Keep only matched job labels on review lines; unmatched jobs stay blank.
  useEffect(() => {
    if (session.step !== "review" || !session.review || jobOrders.length === 0) {
      return;
    }
    const review = session.review;
    let changed = false;
    const nextLines = review.lines.map((line) => {
      const raw = (line.jobNumber || "").trim();
      if (!raw) return line;
      const matchedIds = resolveJobOrderIds(raw, jobOrders);
      const matchedLabel = jobNumbersFromIds(matchedIds, jobOrders);
      if (matchedLabel === raw) return line;
      changed = true;
      return { ...line, jobNumber: matchedLabel };
    });
    if (!changed) return;
    updateSession({ review: { ...review, lines: nextLines } });
  }, [session.step, session.review, jobOrders, updateSession]);

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
      const callResult = await DocumentExtractionService.ExtractVendorQuotation(
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
      const review = buildVendorQuotationReview(result, vendors);
      updateSession({
        step: "review",
        rawResult: result,
        review,
        error: null,
      });
      toast.success("Document details extracted successfully.");
    } catch (err) {
      const message = getApiErrorMessage(err, "Document extraction failed.");
      updateSession({ step: "select", error: message });
      toast.error(message);
    }
  };

  const patchReview = (patch: Partial<VendorQuotationExtractionReview>) => {
    if (!session.review) return;
    updateSession({ review: { ...session.review, ...patch } });
  };

  const patchLine = (
    key: string,
    patch: Partial<VendorQuotationExtractionReviewLine>
  ) => {
    if (!session.review) return;
    updateSession({
      review: {
        ...session.review,
        lines: session.review.lines.map((line) =>
          line.key === key ? { ...line, ...patch } : line
        ),
      },
    });
  };

  const handleVendorSelect = (vendorId: number) => {
    if (!session.review) return;
    if (vendorId <= 0) {
      patchReview({
        matchedVendorId: 0,
        matchedVendorName: "",
        matchedVendorCode: "",
        vendorMatchWarning: session.review.vendorNameHint
          ? `Vendor "${session.review.vendorNameHint}" was not applied. Select a vendor manually.`
          : "Select a vendor on the quotation form.",
      });
      return;
    }
    const vendor = vendors.find((v) => v.vendor_id === vendorId);
    if (!vendor) return;
    patchReview({
      matchedVendorId: vendor.vendor_id,
      matchedVendorName: vendor.company_name,
      matchedVendorCode: vendor.vendorcode || "",
      vendorMatchWarning: "",
    });
  };

  const confirmImport = (mode: DocumentExtractionImportMode) => {
    if (!session.review) return;
    onImport({
      review: session.review,
      mode,
      sourceFile: session.file,
      attachSourceFile,
    });
    updateSession({ hasImported: true });
    setImportModePrompt(false);
    onClose();
  };

  const handleImportClick = () => {
    if (!session.review) return;
    const included = session.review.lines.filter((l) => l.included);
    if (
      included.length === 0 &&
      !session.review.matchedVendorId &&
      !session.review.orderDate
    ) {
      toast.error("Nothing to import. Adjust the review fields or re-extract.");
      return;
    }

    if (session.hasImported || hostHasExistingLines) {
      setImportModePrompt(true);
      return;
    }
    confirmImport("override");
  };

  const stepIndex = STEPS.findIndex((s) => s.id === session.step);
  const includedLines = session.review?.lines.filter((l) => l.included) || [];
  const reviewSubtotal = includedLines.reduce((sum, line) => {
    const subtotal =
      (Number(line.qtyOrdered) || 0) * (Number(line.unitPrice) || 0);
    const discount =
      line.discountType === "Amount"
        ? Math.min(Number(line.discount) || 0, subtotal)
        : subtotal * ((Number(line.discount) || 0) / 100);
    return sum + Math.max(0, subtotal - discount);
  }, 0);
  const linesNeedingReview = includedLines.filter(
    (line) => !line.partName?.trim() || !(Number(line.unitPrice) > 0)
  ).length;

  const headerTitle =
    session.step === "review"
      ? "Review extracted quotation"
      : session.step === "extracting"
        ? "Extracting quotation"
        : "Import Vendor Quotation";

  const headerSub =
    session.step === "review"
      ? "Review the information extracted from your vendor PDF before importing it."
      : session.step === "extracting"
        ? "Please keep this quotation open while extraction is in progress."
        : "Upload a vendor quotation PDF. AI will extract quotation details and line items.";

  return (
    <div
      className="vendor-quotation-slideout-overlay doc-extraction-overlay"
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
              {session.step === "review" ? (
                <span className="doc-extraction-badge is-success">
                  Extraction complete
                </span>
              ) : null}
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

                  <h3>Extracting quotation details</h3>

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
                    Please keep this quotation open while extraction is in progress.
                  </p>
                </div>
              </div>
            )}

            {session.step === "review" && session.review && (
              <div className="doc-extraction-review">
                {session.review.vendorMatchWarning ? (
                  <div className="doc-extraction-warning">
                    {session.review.vendorMatchWarning}
                  </div>
                ) : null}

                <div className="doc-extraction-review-top">
                  <div className="doc-extraction-preview-panel">
                    <div className="panel-title">
                      <span className="doc-extraction-pdf-chip">PDF</span>
                      <span>Source preview</span>
                    </div>
                    <div className="doc-extraction-preview-frame">
                      {session.localUrl ? (
                        <iframe
                          title="PDF preview"
                          src={`${session.localUrl}#page=1`}
                          className="doc-extraction-preview-iframe"
                        />
                      ) : (
                        <div className="doc-extraction-preview-empty">
                          Preview unavailable
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      className="btn-secondary doc-extraction-open-pdf"
                      onClick={() => setShowFullPreview(true)}
                      disabled={!session.localUrl}
                    >
                      Open full PDF
                    </button>
                  </div>

                  <div className="doc-extraction-details-panel">
                    <div className="panel-title">
                      <span>Quotation header</span>
                      {session.review.matchedVendorId > 0 ? (
                        <span className="doc-extraction-inline-badge is-success">
                          Vendor matched
                        </span>
                      ) : (
                        <span className="doc-extraction-inline-badge is-warn">
                          Select vendor
                        </span>
                      )}
                    </div>
                    <div className="doc-extraction-grid">
                      <div className="doc-extraction-field doc-extraction-field-wide">
                        <label>Vendor</label>
                        <select
                          value={session.review.matchedVendorId || 0}
                          onChange={(e) =>
                            handleVendorSelect(Number(e.target.value))
                          }
                        >
                          <option value={0}>
                            {session.review.vendorNameHint
                              ? "Unmatched"
                              : "Select vendor…"}
                          </option>
                          {vendors.map((v) => (
                            <option key={v.vendor_id} value={v.vendor_id}>
                              {v.company_name}
                            </option>
                          ))}
                        </select>
                        {session.review.vendorNameHint ? (
                          <span className="hint">
                            From document: {session.review.vendorNameHint}
                          </span>
                        ) : null}
                      </div>

                      <div className="doc-extraction-field">
                        <label>Quotation date</label>
                        <input
                          type="date"
                          value={session.review.orderDate || ""}
                          onChange={(e) =>
                            patchReview({ orderDate: e.target.value })
                          }
                        />
                      </div>

                      <div className="doc-extraction-field">
                        <label>Due date</label>
                        <input
                          type="date"
                          value={session.review.dueDate || ""}
                          onChange={(e) =>
                            patchReview({ dueDate: e.target.value })
                          }
                        />
                      </div>

                      <div className="doc-extraction-field doc-extraction-field-wide">
                        <label>Source file</label>
                        <label className="doc-extraction-attach-toggle">
                          <input
                            type="checkbox"
                            checked={attachSourceFile}
                            onChange={(e) =>
                              setAttachSourceFile(e.target.checked)
                            }
                          />
                          <span>
                            Attach this PDF to the quotation after import
                          </span>
                        </label>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="doc-extraction-lines-panel">
                  <div className="doc-extraction-lines-header">
                    <div className="lines-header-copy">
                      <h3>Line items</h3>
                      <p>
                        {includedLines.length} of {session.review.lines.length}{" "}
                        selected for import
                      </p>
                    </div>
                    <div className="lines-header-meta">
                      {linesNeedingReview > 0 ? (
                        <span className="doc-extraction-badge is-warn">
                          {linesNeedingReview}{" "}
                          {linesNeedingReview === 1 ? "needs" : "need"} review
                        </span>
                      ) : session.review.lines.length > 0 ? (
                        <span className="doc-extraction-badge is-success">
                          All ready
                        </span>
                      ) : null}
                    </div>
                  </div>

                  {session.review.lines.length === 0 ? (
                    <div className="doc-extraction-empty-lines">
                      No line items were extracted. You can still import header
                      fields, then add lines manually on the quotation form.
                    </div>
                  ) : (
                    <div className="doc-extraction-line-cards">
                      {session.review.lines.map((line, index) => {
                        const needsReview =
                          line.included &&
                          (!line.partName?.trim() ||
                            !(Number(line.unitPrice) > 0));
                        const qty = Number(line.qtyOrdered) || 0;
                        const rate = Number(line.unitPrice) || 0;
                        const gross = qty * rate;
                        const discountValue = Number(line.discount) || 0;
                        const discountAmt =
                          line.discountType === "Amount"
                            ? Math.min(discountValue, gross)
                            : gross * (discountValue / 100);
                        const lineTotal = Math.max(0, gross - discountAmt);

                        return (
                          <div
                            key={line.key}
                            className={`doc-extraction-line-card ${
                              !line.included ? "is-excluded" : ""
                            } ${needsReview ? "needs-review" : ""} ${
                              openJobDropdownKey === line.key
                                ? "is-job-menu-open"
                                : ""
                            }`}
                          >
                            <div className="line-card-rail">
                              <span className="line-index">{index + 1}</span>
                              <label
                                className="doc-extraction-checkbox-label line-include"
                                title="Include this line"
                              >
                                <input
                                  type="checkbox"
                                  checked={line.included}
                                  onChange={(e) =>
                                    patchLine(line.key, {
                                      included: e.target.checked,
                                    })
                                  }
                                />
                              </label>
                            </div>

                            <div className="line-card-body">
                              <div className="line-card-top">
                                <div className="line-card-title">
                                  <span className="line-title-text">
                                    {line.partName?.trim() ||
                                      line.partNo?.trim() ||
                                      `Line ${index + 1}`}
                                  </span>
                                  {line.partNo?.trim() ? (
                                    <span className="line-part-chip">
                                      {line.partNo}
                                    </span>
                                  ) : null}
                                </div>
                                <div className="line-card-top-right">
                                  {needsReview ? (
                                    <span className="doc-extraction-badge is-warn">
                                      Needs review
                                    </span>
                                  ) : line.included ? (
                                    <span className="doc-extraction-badge is-success">
                                      Ready
                                    </span>
                                  ) : (
                                    <span className="doc-extraction-badge is-muted">
                                      Excluded
                                    </span>
                                  )}
                                  <span className="line-amount">
                                    {lineTotal.toLocaleString(undefined, {
                                      minimumFractionDigits: 2,
                                      maximumFractionDigits: 2,
                                    })}
                                  </span>
                                </div>
                              </div>

                              <div className="line-card-grid">
                                <div className="doc-extraction-field">
                                  <label>Part No</label>
                                  <input
                                    type="text"
                                    value={line.partNo}
                                    disabled={!line.included}
                                    onChange={(e) =>
                                      patchLine(line.key, {
                                        partNo: e.target.value,
                                      })
                                    }
                                  />
                                </div>
                                <div className="doc-extraction-field line-desc">
                                  <label>Description</label>
                                  <input
                                    type="text"
                                    value={line.partName}
                                    disabled={!line.included}
                                    className={
                                      needsReview && !line.partName?.trim()
                                        ? "is-warn-input"
                                        : ""
                                    }
                                    onChange={(e) =>
                                      patchLine(line.key, {
                                        partName: e.target.value,
                                      })
                                    }
                                  />
                                </div>
                                <div
                                  className="doc-extraction-field line-job"
                                  data-job-dropdown={line.key}
                                >
                                  <label>Job #</label>
                                  {(() => {
                                    const selectedIds = resolveJobOrderIds(
                                      line.jobNumber,
                                      jobOrders
                                    );
                                    const selectedJobs = selectedIds
                                      .map((id) =>
                                        jobOrders.find((j) => j.jobOrderID === id)
                                      )
                                      .filter(
                                        (j): j is JobOrderMaster => !!j
                                      );
                                    const displayText =
                                      selectedJobs.length > 0
                                        ? selectedJobs
                                            .map((j) => formatJobOrderLabel(j))
                                            .join(", ")
                                        : "";
                                    const isOpen =
                                      openJobDropdownKey === line.key;

                                    return (
                                      <div className="line-job-multiselect">
                                        <button
                                          type="button"
                                          className="line-job-trigger"
                                          disabled={!line.included}
                                          title={
                                            displayText || "Select job orders"
                                          }
                                          onClick={() =>
                                            setOpenJobDropdownKey(
                                              isOpen ? null : line.key
                                            )
                                          }
                                        >
                                          <span
                                            className={
                                              displayText
                                                ? "line-job-value"
                                                : "line-job-placeholder"
                                            }
                                          >
                                            {displayText ||
                                              "Select job orders…"}
                                          </span>
                                          <span className="line-job-caret" aria-hidden>
                                            ▾
                                          </span>
                                        </button>
                                        {isOpen && line.included ? (
                                          <div className="line-job-menu">
                                            {[...jobOrders]
                                              .sort((a, b) => {
                                                const aSel = selectedIds.includes(
                                                  a.jobOrderID
                                                )
                                                  ? 0
                                                  : 1;
                                                const bSel = selectedIds.includes(
                                                  b.jobOrderID
                                                )
                                                  ? 0
                                                  : 1;
                                                return aSel - bSel;
                                              })
                                              .map((job) => {
                                                const checked =
                                                  selectedIds.includes(
                                                    job.jobOrderID
                                                  );
                                                return (
                                                  <label
                                                    key={job.jobOrderID}
                                                    className={`line-job-option ${
                                                      checked ? "is-selected" : ""
                                                    }`}
                                                  >
                                                    <input
                                                      type="checkbox"
                                                      checked={checked}
                                                      onChange={() => {
                                                        const next = checked
                                                          ? selectedIds.filter(
                                                              (id) =>
                                                                id !==
                                                                job.jobOrderID
                                                            )
                                                          : [
                                                              ...selectedIds,
                                                              job.jobOrderID,
                                                            ];
                                                        patchLine(line.key, {
                                                          jobNumber:
                                                            jobNumbersFromIds(
                                                              next,
                                                              jobOrders
                                                            ),
                                                        });
                                                      }}
                                                    />
                                                    <span>
                                                      <span className="line-job-option-title">
                                                        {formatJobOrderLabel(job)}
                                                      </span>
                                                      {job.partName ? (
                                                        <span className="line-job-option-sub">
                                                          {job.partName}
                                                        </span>
                                                      ) : null}
                                                    </span>
                                                  </label>
                                                );
                                              })}
                                            {jobOrders.length === 0 ? (
                                              <div className="line-job-empty">
                                                No job orders available
                                              </div>
                                            ) : null}
                                          </div>
                                        ) : null}
                                      </div>
                                    );
                                  })()}
                                </div>
                                <div className="doc-extraction-field line-qty">
                                  <label>Qty</label>
                                  <input
                                    type="number"
                                    min={0}
                                    step="any"
                                    value={line.qtyOrdered}
                                    disabled={!line.included}
                                    onChange={(e) =>
                                      patchLine(line.key, {
                                        qtyOrdered: Number(e.target.value) || 0,
                                      })
                                    }
                                  />
                                </div>
                                <div className="doc-extraction-field line-unit">
                                  <label>Unit</label>
                                  <input
                                    type="text"
                                    value={line.unit}
                                    disabled={!line.included}
                                    onChange={(e) =>
                                      patchLine(line.key, {
                                        unit: e.target.value,
                                      })
                                    }
                                  />
                                </div>
                                <div className="doc-extraction-field line-rate">
                                  <label>Rate</label>
                                  <input
                                    type="number"
                                    min={0}
                                    step="any"
                                    value={line.unitPrice}
                                    disabled={!line.included}
                                    className={
                                      needsReview && !(Number(line.unitPrice) > 0)
                                        ? "is-warn-input"
                                        : ""
                                    }
                                    onChange={(e) =>
                                      patchLine(line.key, {
                                        unitPrice: Number(e.target.value) || 0,
                                      })
                                    }
                                  />
                                </div>
                                <div className="doc-extraction-field line-discount">
                                  <label>Discount</label>
                                  <div className="line-discount-group">
                                    <input
                                      type="number"
                                      min={0}
                                      step="any"
                                      value={line.discount}
                                      disabled={!line.included}
                                      onChange={(e) =>
                                        patchLine(line.key, {
                                          discount: Number(e.target.value) || 0,
                                        })
                                      }
                                    />
                                    <select
                                      value={line.discountType}
                                      disabled={!line.included}
                                      onChange={(e) =>
                                        patchLine(line.key, {
                                          discountType:
                                            e.target.value === "Amount"
                                              ? "Amount"
                                              : "Percent",
                                        })
                                      }
                                    >
                                      <option value="Percent">%</option>
                                      <option value="Amount">Amt</option>
                                    </select>
                                  </div>
                                </div>
                                <div className="doc-extraction-field line-notes">
                                  <label>Notes</label>
                                  <input
                                    type="text"
                                    value={line.notes}
                                    disabled={!line.included}
                                    onChange={(e) =>
                                      patchLine(line.key, {
                                        notes: e.target.value,
                                      })
                                    }
                                  />
                                </div>
                              </div>

                              {needsReview ? (
                                <p className="line-card-hint">
                                  Verify description and rate against the PDF
                                  before importing.
                                </p>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="doc-extraction-review-summary">
                    <div className="summary-label">
                      Selected lines subtotal
                    </div>
                    <div className="summary-value">
                      {reviewSubtotal.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </div>
                  </div>
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
            {(session.step === "review" || session.step === "extracting") && (
              <button
                type="button"
                className="btn-draft"
                disabled={session.step === "extracting"}
                onClick={() => updateSession({ step: "select" })}
              >
                Back
              </button>
            )}
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
            {session.step === "review" && (
              <button
                type="button"
                className="btn-submit"
                onClick={handleImportClick}
              >
                Import to Quotation
              </button>
            )}
          </div>
        </div>

        {showFullPreview && session.localUrl ? (
          <div
            className="doc-extraction-mode-dialog"
            onClick={(e) => {
              e.stopPropagation();
              setShowFullPreview(false);
            }}
          >
            <div
              className="doc-extraction-full-preview"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="doc-extraction-full-preview-header">
                <h3>{session.fileName || "PDF Preview"}</h3>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => setShowFullPreview(false)}
                >
                  ×
                </button>
              </div>
              <div className="doc-extraction-full-preview-body">
                <DocumentViewerWorkspace
                  documents={viewerDocuments}
                  activeIndex={0}
                  onActiveIndexChange={() => undefined}
                  onClose={() => setShowFullPreview(false)}
                  hideCloseButton
                  mode="view"
                />
              </div>
            </div>
          </div>
        ) : null}

        {importModePrompt && (
          <div
            className="doc-extraction-mode-dialog"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="doc-extraction-mode-card">
              <h3>Import extracted lines</h3>
              <p>
                The quotation already has line items
                {session.hasImported ? " (or was imported earlier)" : ""}. How
                should the extracted lines be applied?
              </p>
              <div className="form-actions">
                <button
                  type="button"
                  className="btn-cancel"
                  onClick={() => setImportModePrompt(false)}
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
