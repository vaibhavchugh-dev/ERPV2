import { postMultipart } from "../Services/FileUploadHelper";
import type {
  DocumentExtractionKind,
  VendorQuotationExtractionResult,
} from "./types";

type ExtractionApiResponse = {
  success?: boolean;
  message?: string;
  /** "CimmpleApi" (hosted swagger API) or "Claude" (fallback) */
  provider?: string;
  documentKind?: string;
  result?: VendorQuotationExtractionResult;
};

export type DocumentExtractionCallResult = {
  result: VendorQuotationExtractionResult;
  provider: string;
  message?: string;
  documentKind: DocumentExtractionKind;
};

export class DocumentExtractionService {
  /**
   * Extract document fields from a PDF for the given kind.
   * Backend tries api.extraction.cimmple.net first, then Claude Haiku with kind-specific prompt.
   */
  public static Extract = async (
    kind: DocumentExtractionKind,
    pdfFile: File
  ): Promise<DocumentExtractionCallResult | null> => {
    if (!pdfFile) return null;

    const formData = new FormData();
    formData.append("file", pdfFile, pdfFile.name || `${kind}.pdf`);
    formData.append("documentKind", kind);

    const response = await postMultipart<ExtractionApiResponse>(
      "/DocumentExtraction/Extract",
      formData
    );

    if (!response?.success && !response?.result) {
      throw new Error(response?.message || "Document extraction failed.");
    }

    if (!response.result) return null;

    return {
      result: response.result,
      provider: response.provider || "unknown",
      message: response.message,
      documentKind: kind,
    };
  };

  /** @deprecated Use Extract("vendorQuotation", file) */
  public static ExtractVendorQuotation = async (
    pdfFile: File
  ): Promise<DocumentExtractionCallResult | null> =>
    DocumentExtractionService.Extract("vendorQuotation", pdfFile);
}
