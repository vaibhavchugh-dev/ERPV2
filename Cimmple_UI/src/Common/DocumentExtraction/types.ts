/** Extensible document kinds for future modules (Customer Quotation, Orders, etc.). */
export type DocumentExtractionKind = "vendorQuotation" | "customerQuotation" | "vendorOrder" | "customerOrder";

export type DocumentExtractionStep = "upload" | "select" | "extracting" | "review";

export interface VendorQuotationExtractionPart {
  partNo?: string | null;
  jobNo?: string | null;
  partName?: string | null;
  description?: string | null;
  material?: string | null;
  quantity?: number | null;
  unit?: string | null;
  remarks?: string | null;
}

export interface VendorQuotationExtractionDetail {
  itemName?: string | null;
  itemDescription?: string | null;
  quantity?: number | null;
  unit?: string | null;
  unitPrice?: number | null;
  amount?: number | null;
  discount?: number | null;
  discountType?: string | null;
  notes?: string | null;
  parts?: VendorQuotationExtractionPart[] | null;
}

export interface VendorQuotationExtractionResult {
  documentType?: string | null;
  drawingNumber?: string | null;
  drawingTitle?: string | null;
  revision?: string | null;
  revisionDate?: string | null;
  sheetNumber?: string | null;
  totalSheets?: string | null;
  drawingDate?: string | null;
  projectName?: string | null;
  clientName?: string | null;
  companyName?: string | null;
  drawnBy?: string | null;
  checkedBy?: string | null;
  approvedBy?: string | null;
  scale?: string | null;
  units?: string | null;
  material?: string | null;
  quotationNumber?: string | null;
  quotationDate?: string | null;
  dueDate?: string | null;
  vendorNames?: string[] | null;
  vendorContactName?: string | null;
  vendorPhone?: string | null;
  vendorEmail?: string | null;
  details?: VendorQuotationExtractionDetail[] | null;
}

/** Editable review model shown before importing into the host form. */
export interface VendorQuotationExtractionReviewLine {
  key: string;
  partNo: string;
  partName: string;
  jobNumber: string;
  qtyOrdered: number;
  unit: string;
  unitPrice: number;
  discount: number;
  discountType: "Amount" | "Percent";
  notes: string;
  included: boolean;
}

export interface VendorQuotationExtractionReview {
  vendorNameHint: string;
  matchedVendorId: number;
  matchedVendorName: string;
  matchedVendorCode: string;
  vendorMatchWarning: string;
  orderDate: string;
  dueDate: string;
  /** Kept for compatibility; not shown or applied on import. */
  vendorPoNumber: string;
  /** Kept for compatibility; contact comes from Vendor Master. */
  buyerName: string;
  lines: VendorQuotationExtractionReviewLine[];
}

export interface VendorCandidate {
  vendor_id: number;
  company_name: string;
  vendorcode: string;
}
