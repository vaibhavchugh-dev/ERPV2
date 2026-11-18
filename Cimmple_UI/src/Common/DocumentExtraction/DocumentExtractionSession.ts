import type {
  DocumentExtractionKind,
  DocumentExtractionStep,
  VendorQuotationExtractionResult,
  VendorQuotationExtractionReview,
} from "./types";

export interface DocumentExtractionSession {
  kind: DocumentExtractionKind;
  step: DocumentExtractionStep;
  /** Original uploaded PDF */
  file: File | null;
  /** Object URL for preview; revoke on clear */
  localUrl: string | null;
  fileName: string;
  /** 1-based page numbers; empty means "all pages" */
  selectedPages: number[];
  pageCount: number;
  rawResult: VendorQuotationExtractionResult | null;
  review: VendorQuotationExtractionReview | null;
  /** True after a successful Import into the host form */
  hasImported: boolean;
  error: string | null;
}

export function createEmptyExtractionSession(
  kind: DocumentExtractionKind = "vendorQuotation"
): DocumentExtractionSession {
  return {
    kind,
    step: "upload",
    file: null,
    localUrl: null,
    fileName: "",
    selectedPages: [],
    pageCount: 0,
    rawResult: null,
    review: null,
    hasImported: false,
    error: null,
  };
}

export function clearExtractionSession(session: DocumentExtractionSession | null): DocumentExtractionSession {
  if (session?.localUrl) {
    try {
      URL.revokeObjectURL(session.localUrl);
    } catch {
      // ignore
    }
  }
  return createEmptyExtractionSession(session?.kind || "vendorQuotation");
}

export function hasExtractionProgress(session: DocumentExtractionSession | null): boolean {
  if (!session) return false;
  return !!(session.file || session.rawResult || session.review);
}
