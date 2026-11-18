import { postMultipart } from "../Services/FileUploadHelper";
import type { VendorQuotationExtractionResult } from "./types";

type ExtractionApiResponse = {
  success?: boolean;
  message?: string;
  /** "CimmpleApi" (hosted swagger API) or "Claude" (fallback) */
  provider?: string;
  result?: VendorQuotationExtractionResult;
};

export type VendorQuotationExtractionCallResult = {
  result: VendorQuotationExtractionResult;
  provider: string;
  message?: string;
};

export class DocumentExtractionService {
  /**
   * Extract Vendor Quotation fields from a PDF (optionally page-trimmed client-side).
   * Backend tries api.extraction.cimmple.net first, then Claude Haiku fallback.
   */
  public static ExtractVendorQuotation = async (
    pdfFile: File
  ): Promise<VendorQuotationExtractionCallResult | null> => {
    if (!pdfFile) return null;

    const formData = new FormData();
    formData.append("file", pdfFile, pdfFile.name || "vendor-quotation.pdf");

    const response = await postMultipart<ExtractionApiResponse>(
      "/DocumentExtraction/ExtractVendorQuotation",
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
    };
  };
}
