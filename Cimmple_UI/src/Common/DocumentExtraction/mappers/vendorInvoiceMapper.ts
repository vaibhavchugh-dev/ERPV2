import type {
  DocumentExtractionReview,
  VendorCandidate,
  VendorQuotationExtractionResult,
  VendorQuotationExtractionReview,
  VendorQuotationExtractionReviewLine,
} from "../types";
import {
  buildVendorQuotationReview,
  type ApplyImportMode,
} from "./vendorQuotationMapper";

function toOptionalNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function computeReviewLineAmount(line: VendorQuotationExtractionReviewLine): number {
  if (typeof line.amount === "number" && Number.isFinite(line.amount) && line.amount > 0) {
    return Math.round(line.amount * 100) / 100;
  }
  const qty = Number(line.qtyOrdered) > 0 ? Number(line.qtyOrdered) : 1;
  const price = Number(line.unitPrice) || 0;
  const subtotal = qty * price;
  const discount =
    line.discountType === "Amount"
      ? Math.min(Math.max(Number(line.discount) || 0, 0), subtotal)
      : subtotal * (Math.min(Math.max(Number(line.discount) || 0, 0), 100) / 100);
  return Math.round(Math.max(0, subtotal - discount) * 100) / 100;
}

/**
 * Build a review model from a vendor invoice PDF extraction + Vendor Master list.
 * Reuses the standard vendor party/address matching (Bill To / Ship To, excluding
 * companyName/letterhead) and adds invoice-specific fields.
 */
export function buildVendorInvoiceReview(
  result: VendorQuotationExtractionResult,
  vendors: VendorCandidate[]
): VendorQuotationExtractionReview {
  const baseReview = buildVendorQuotationReview(result, vendors);
  const anyResult = result as Record<string, unknown>;

  const invoiceNumber = String(
    result.invoiceNumber ||
      anyResult.InvoiceNumber ||
      result.quotationNumber ||
      anyResult.QuotationNumber ||
      ""
  ).trim();

  const poNumber = String(
    result.poNumber || anyResult.PoNumber || ""
  ).trim();

  const taxRate = toOptionalNumber(result.taxRate ?? anyResult.TaxRate);
  const taxAmount = toOptionalNumber(result.taxAmount ?? anyResult.TaxAmount);
  const freightCharge = toOptionalNumber(
    result.freightCharge ?? anyResult.FreightCharge
  );
  const extractedTotal = toOptionalNumber(
    result.totalAmount ?? anyResult.TotalAmount
  );

  return {
    ...baseReview,
    vendorPoNumber: poNumber || baseReview.vendorPoNumber,
    invoiceNumber,
    poNumber,
    taxRate,
    taxAmount,
    freightCharge,
    extractedTotal,
  };
}

export interface DirectVendorInvoiceLineDraft {
  key: string;
  description: string;
  amount: string;
  accountId: number;
}

export function directInvoiceHasMeaningfulLines(
  lines: Array<{ description: string; amount: string }> | undefined
): boolean {
  if (!lines || lines.length === 0) return false;
  return lines.some(
    (l) => Boolean(l.description?.trim()) || (parseFloat(l.amount) || 0) > 0
  );
}

function buildDirectLineDescription(line: VendorQuotationExtractionReviewLine): string {
  const partNo = (line.partNo || "").trim();
  const partName = (line.partName || "").trim();
  const notes = (line.notes || "").trim();

  let desc = partName;
  if (partNo && !desc.toLowerCase().includes(partNo.toLowerCase())) {
    desc = desc ? `${partNo} — ${desc}` : partNo;
  }
  if (!desc && notes) {
    desc = notes;
  }
  return desc;
}

export interface ApplyDirectVendorInvoiceImportResult {
  vendorId?: number;
  invoiceNo?: string;
  invoiceDate?: string;
  dueDate?: string;
  taxRate?: number;
  taxAmount?: number;
  hasExtractedTax: boolean;
  freightCharge?: number;
  extractedTotal: number | null;
  lines: DirectVendorInvoiceLineDraft[];
  warnings: string[];
}

/**
 * Map a reviewed vendor invoice extraction into DirectVendorInvoiceSlideout state.
 */
export function applyDirectVendorInvoiceImport(args: {
  currentLines: DirectVendorInvoiceLineDraft[];
  review: VendorQuotationExtractionReview;
  mode: ApplyImportMode;
  defaultAccountId: number;
  newLineKey: () => string;
}): ApplyDirectVendorInvoiceImportResult {
  const { currentLines, review, mode, defaultAccountId, newLineKey } = args;
  const warnings: string[] = [];

  if (review.vendorMatchWarning) {
    warnings.push(review.vendorMatchWarning);
  }

  const included = (review.lines || []).filter((l) => l.included);
  const mappedLines: DirectVendorInvoiceLineDraft[] = included
    .map((line) => {
      const description = buildDirectLineDescription(line);
      const amount = computeReviewLineAmount(line);
      if (!description && amount <= 0) return null;
      return {
        key: newLineKey(),
        description,
        amount: amount > 0 ? amount.toFixed(2) : "",
        accountId: defaultAccountId,
      };
    })
    .filter((l): l is DirectVendorInvoiceLineDraft => l !== null);

  if (mappedLines.length === 0) {
    warnings.push("No line items were extracted from the PDF.");
  }

  let lines: DirectVendorInvoiceLineDraft[];
  if (mode === "append") {
    const existing = currentLines.filter(
      (l) => Boolean(l.description.trim()) || (parseFloat(l.amount) || 0) > 0
    );
    lines = [...existing, ...mappedLines];
  } else {
    lines = mappedLines;
  }

  if (lines.length === 0) {
    lines = [
      {
        key: newLineKey(),
        description: "",
        amount: "",
        accountId: defaultAccountId,
      },
    ];
  }

  const hasTaxAmount =
    typeof review.taxAmount === "number" &&
    Number.isFinite(review.taxAmount) &&
    review.taxAmount >= 0;
  const hasTaxRate =
    typeof review.taxRate === "number" &&
    Number.isFinite(review.taxRate) &&
    review.taxRate >= 0;
  const hasFreight =
    typeof review.freightCharge === "number" &&
    Number.isFinite(review.freightCharge) &&
    review.freightCharge >= 0;

  return {
    vendorId: review.matchedVendorId > 0 ? review.matchedVendorId : undefined,
    invoiceNo: review.invoiceNumber || undefined,
    invoiceDate: review.orderDate || undefined,
    dueDate: review.dueDate || undefined,
    taxRate: hasTaxRate ? review.taxRate! : undefined,
    taxAmount: hasTaxAmount ? Math.round(review.taxAmount! * 100) / 100 : undefined,
    hasExtractedTax: hasTaxAmount,
    freightCharge: hasFreight
      ? Math.round(review.freightCharge! * 100) / 100
      : undefined,
    extractedTotal:
      typeof review.extractedTotal === "number" &&
      Number.isFinite(review.extractedTotal) &&
      review.extractedTotal > 0
        ? Math.round(review.extractedTotal * 100) / 100
        : null,
    lines,
    warnings,
  };
}

export interface InvoiceModalReconcileItem {
  id: number;
  itemNo: number;
  partNo: string;
  partName: string;
  availableQty: number;
  unitPrice: number;
  discount?: number;
  discountType?: string;
}

export interface InvoiceModalReconcileResult {
  invoiceNo?: string;
  invoiceDate?: string;
  dueDate?: string;
  taxRate?: number;
  taxAmount?: number;
  hasExtractedTax: boolean;
  freightCharge?: number;
  extractedTotal: number | null;
  matchedCount: number;
  totalSelected: number;
  quantities: { [itemId: number]: number };
  unitPrices: { [itemId: number]: number };
  discounts: { [itemId: number]: number };
  warnings: string[];
  unmatchedPdfLines: string[];
}

function normalizeMatchText(value?: string | null): string {
  return (value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Reconcile an extracted invoice PDF review against fixed PO/Order invoiceable items
 * inside VendorInvoiceModal or InvoiceModal. Never adds or removes order lines —
 * only pre-fills header fields and matched item qty/price/discount with warnings.
 */
export function reconcileInvoiceModalImport(args: {
  selectedItems: InvoiceModalReconcileItem[];
  review: DocumentExtractionReview;
  minInvoiceDate?: string;
}): InvoiceModalReconcileResult {
  const { selectedItems, review, minInvoiceDate } = args;
  const warnings: string[] = [];
  const unmatchedPdfLines: string[] = [];
  const quantities: { [itemId: number]: number } = {};
  const unitPrices: { [itemId: number]: number } = {};
  const discounts: { [itemId: number]: number } = {};

  const pdfLines = (review.lines || []).filter((l) => l.included);
  const usedItemIds = new Set<number>();
  const remainingPdfIndices: number[] = [];

  const applyMatchedLine = (
    item: InvoiceModalReconcileItem,
    line: VendorQuotationExtractionReviewLine
  ) => {
    usedItemIds.add(item.id);
    const label = item.partNo || item.partName || `Item #${item.itemNo}`;

    const rawQty = Number(line.qtyOrdered) || 0;
    if (rawQty > 0) {
      if (rawQty > item.availableQty) {
        quantities[item.id] = item.availableQty;
        warnings.push(
          `${label}: PDF qty (${rawQty}) exceeds available qty (${item.availableQty}); clamped to ${item.availableQty}.`
        );
      } else {
        quantities[item.id] = rawQty;
      }
    }

    const pdfUnitPrice =
      Number(line.unitPrice) > 0
        ? Number(line.unitPrice)
        : typeof line.amount === "number" && line.amount > 0 && rawQty > 0
          ? Math.round((line.amount / rawQty) * 100) / 100
          : 0;

    if (pdfUnitPrice > 0) {
      unitPrices[item.id] = pdfUnitPrice;
      if (
        item.unitPrice > 0 &&
        Math.abs(pdfUnitPrice - item.unitPrice) > 0.01
      ) {
        warnings.push(
          `${label}: PDF price ($${pdfUnitPrice.toFixed(2)}) differs from order price ($${item.unitPrice.toFixed(2)}).`
        );
      }
    }

    const pdfDiscount = Number(line.discount) || 0;
    if (pdfDiscount > 0) {
      const itemIsAmount = (item.discountType || "Percent") === "Amount";
      const pdfIsAmount = line.discountType === "Amount";
      if (itemIsAmount === pdfIsAmount) {
        discounts[item.id] = itemIsAmount
          ? Math.max(0, pdfDiscount)
          : Math.min(100, Math.max(0, pdfDiscount));
      }
    }
  };

  // Pass 1: Exact partNo match
  pdfLines.forEach((line, idx) => {
    const pdfPartNo = normalizeMatchText(line.partNo);
    if (!pdfPartNo) {
      remainingPdfIndices.push(idx);
      return;
    }
    const exact = selectedItems.find(
      (item) =>
        !usedItemIds.has(item.id) &&
        normalizeMatchText(item.partNo) === pdfPartNo
    );
    if (exact) {
      applyMatchedLine(exact, line);
    } else {
      remainingPdfIndices.push(idx);
    }
  });

  // Pass 2: Normalized partNo/partName contains match
  const stillUnmatchedPdfIndices: number[] = [];
  remainingPdfIndices.forEach((idx) => {
    const line = pdfLines[idx];
    const pdfPartNo = normalizeMatchText(line.partNo);
    const pdfName = normalizeMatchText(line.partName);
    const match = selectedItems.find((item) => {
      if (usedItemIds.has(item.id)) return false;
      const itemPartNo = normalizeMatchText(item.partNo);
      const itemName = normalizeMatchText(item.partName);
      if (
        pdfPartNo &&
        itemPartNo &&
        (itemPartNo.includes(pdfPartNo) || pdfPartNo.includes(itemPartNo))
      ) {
        return true;
      }
      if (
        pdfName &&
        itemName &&
        (itemName === pdfName ||
          itemName.includes(pdfName) ||
          pdfName.includes(itemName))
      ) {
        return true;
      }
      if (pdfName && itemPartNo && pdfName.includes(itemPartNo)) {
        return true;
      }
      return false;
    });

    if (match) {
      applyMatchedLine(match, line);
    } else {
      stillUnmatchedPdfIndices.push(idx);
    }
  });

  // Pass 3: Single-item positional fallback (1 unmatched order line & 1 unmatched PDF line)
  const unmatchedOrderItems = selectedItems.filter(
    (item) => !usedItemIds.has(item.id)
  );
  if (
    stillUnmatchedPdfIndices.length === 1 &&
    unmatchedOrderItems.length === 1
  ) {
    applyMatchedLine(
      unmatchedOrderItems[0],
      pdfLines[stillUnmatchedPdfIndices[0]]
    );
    stillUnmatchedPdfIndices.length = 0;
  }

  stillUnmatchedPdfIndices.forEach((idx) => {
    const line = pdfLines[idx];
    const desc =
      buildDirectLineDescription(line) || `PDF line #${idx + 1}`;
    const amt = computeReviewLineAmount(line);
    unmatchedPdfLines.push(amt > 0 ? `${desc} ($${amt.toFixed(2)})` : desc);
  });

  let resolvedInvoiceDate = review.orderDate || undefined;
  if (resolvedInvoiceDate && minInvoiceDate && resolvedInvoiceDate < minInvoiceDate) {
    warnings.push(
      `PDF invoice date (${resolvedInvoiceDate}) is earlier than allowed minimum (${minInvoiceDate}); kept existing date.`
    );
    resolvedInvoiceDate = undefined;
  }

  let resolvedDueDate = review.dueDate || undefined;
  if (
    resolvedDueDate &&
    resolvedInvoiceDate &&
    resolvedDueDate < resolvedInvoiceDate
  ) {
    resolvedDueDate = resolvedInvoiceDate;
  }

  const hasTaxAmount =
    typeof review.taxAmount === "number" &&
    Number.isFinite(review.taxAmount) &&
    review.taxAmount >= 0;
  const hasTaxRate =
    typeof review.taxRate === "number" &&
    Number.isFinite(review.taxRate) &&
    review.taxRate >= 0;
  const hasFreight =
    typeof review.freightCharge === "number" &&
    Number.isFinite(review.freightCharge) &&
    review.freightCharge >= 0;

  return {
    invoiceNo: review.invoiceNumber || undefined,
    invoiceDate: resolvedInvoiceDate,
    dueDate: resolvedDueDate,
    taxRate: hasTaxRate ? review.taxRate! : undefined,
    taxAmount: hasTaxAmount ? Math.round(review.taxAmount! * 100) / 100 : undefined,
    hasExtractedTax: hasTaxAmount,
    freightCharge: hasFreight
      ? Math.round(review.freightCharge! * 100) / 100
      : undefined,
    extractedTotal:
      typeof review.extractedTotal === "number" &&
      Number.isFinite(review.extractedTotal) &&
      review.extractedTotal > 0
        ? Math.round(review.extractedTotal * 100) / 100
        : null,
    matchedCount: usedItemIds.size,
    totalSelected: selectedItems.length,
    quantities,
    unitPrices,
    discounts,
    warnings,
    unmatchedPdfLines,
  };
}
