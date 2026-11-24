/** Extensible document kinds for future modules (Customer Quotation, Orders, Invoices, etc.). */
export type DocumentExtractionKind =
  | "vendorQuotation"
  | "customerQuotation"
  | "vendorOrder"
  | "customerOrder"
  | "vendorInvoice"
  | "customerInvoice";

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
  invoiceNumber?: string | null;
  invoiceDate?: string | null;
  poNumber?: string | null;
  subtotal?: number | null;
  taxRate?: number | null;
  taxAmount?: number | null;
  freightCharge?: number | null;
  totalAmount?: number | null;
  vendorNames?: string[] | null;
  vendorContactName?: string | null;
  vendorPhone?: string | null;
  vendorEmail?: string | null;
  vendorAddress?: string | null;
  vendorApartment?: string | null;
  vendorCity?: string | null;
  vendorState?: string | null;
  vendorZip?: string | null;
  vendorCountry?: string | null;
  vendorShippingAddress?: string | null;
  vendorShippingApartment?: string | null;
  vendorShippingCity?: string | null;
  vendorShippingState?: string | null;
  vendorShippingZip?: string | null;
  vendorShippingCountry?: string | null;
  details?: VendorQuotationExtractionDetail[] | null;
}

/** Prefill for creating a vendor when extraction finds no Vendor Master match. */
export interface ExtractedVendorDraft {
  company_name: string;
  email: string;
  phone_number: string;
  address: string;
  apartment: string;
  City: string;
  states: string;
  zipcode: string;
  country: string;
  shippingaddress: string;
  shippingApartment: string;
  shippingCity: string;
  shippingStates: string;
  shippingZipCode: string;
  shippingCountry: string;
  contactFirstName: string;
  contactLastName: string;
  contactEmail: string;
  contactPhone: string;
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
  amount?: number;
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
  /** Populated when no single Vendor Master match — used to prefill Create Vendor. */
  extractedVendorDraft: ExtractedVendorDraft | null;
  orderDate: string;
  dueDate: string;
  /** Kept for compatibility; not shown or applied on import. */
  vendorPoNumber: string;
  /** Kept for compatibility; contact comes from Vendor Master. */
  buyerName: string;
  /** Invoice-specific fields populated for vendorInvoice extraction. */
  invoiceNumber?: string;
  poNumber?: string;
  taxRate?: number | null;
  taxAmount?: number | null;
  freightCharge?: number | null;
  extractedTotal?: number | null;
  lines: VendorQuotationExtractionReviewLine[];
}

export interface VendorCandidate {
  vendor_id: number;
  company_name: string;
  vendorcode: string;
}

export interface CustomerCandidate {
  customer_id: number;
  company_name: string;
  customercode?: string;
  CustomerCode?: string;
}

/** Prefill for creating a customer when extraction finds no Customer Master match. */
export interface ExtractedCustomerDraft {
  company_name: string;
  email: string;
  phone_number: string;
  address: string;
  apartment: string;
  City: string;
  states: string;
  zip: string;
  country: string;
  shippingAddress: string;
  shippingApartment: string;
  shippingCity: string;
  shippingStates: string;
  shippingZipCode: string;
  shippingCountry: string;
  contactFirstName: string;
  contactLastName: string;
  contactEmail: string;
  contactPhone: string;
}

export interface CustomerDocumentExtractionReview {
  customerNameHint: string;
  matchedCustomerId: number;
  matchedCustomerName: string;
  matchedCustomerCode: string;
  customerMatchWarning: string;
  extractedCustomerDraft: ExtractedCustomerDraft | null;
  orderDate: string;
  dueDate: string;
  customerPoNumber: string;
  /** Invoice-specific fields populated for customerInvoice extraction. */
  invoiceNumber?: string;
  poNumber?: string;
  taxRate?: number | null;
  taxAmount?: number | null;
  freightCharge?: number | null;
  extractedTotal?: number | null;
  lines: VendorQuotationExtractionReviewLine[];
}

export type DocumentExtractionReview =
  | VendorQuotationExtractionReview
  | CustomerDocumentExtractionReview;

export function isVendorExtractionReview(
  review: DocumentExtractionReview
): review is VendorQuotationExtractionReview {
  return "matchedVendorId" in review;
}

export function isCustomerExtractionReview(
  review: DocumentExtractionReview
): review is CustomerDocumentExtractionReview {
  return "matchedCustomerId" in review;
}

export function isVendorExtractionKind(kind: DocumentExtractionKind): boolean {
  return (
    kind === "vendorQuotation" ||
    kind === "vendorOrder" ||
    kind === "vendorInvoice"
  );
}

export function isCustomerExtractionKind(kind: DocumentExtractionKind): boolean {
  return (
    kind === "customerQuotation" ||
    kind === "customerOrder" ||
    kind === "customerInvoice"
  );
}
