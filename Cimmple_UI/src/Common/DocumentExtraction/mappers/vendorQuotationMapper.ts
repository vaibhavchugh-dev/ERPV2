import {
  QuotationDetailReq,
  VendorQuotationMasterReq,
} from "../../Services/QuotationService";
import { DEFAULT_VENDOR_ORDER_LINE_TYPE } from "../../Constants/vendorOrderLineTypes";
import type {
  VendorCandidate,
  VendorQuotationExtractionDetail,
  VendorQuotationExtractionResult,
  VendorQuotationExtractionReview,
  VendorQuotationExtractionReviewLine,
} from "../types";

function normalizeName(value?: string | null): string {
  return (value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function toDateInput(value?: string | null): string {
  if (!value) return "";
  const trimmed = value.trim();
  // Already yyyy-MM-dd
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    return trimmed.slice(0, 10);
  }
  // Hosted API often returns "Sep 29, 2026"
  const parsed = Date.parse(trimmed);
  if (!Number.isNaN(parsed)) {
    const d = new Date(parsed);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  return "";
}

function resolveDiscount(
  detail: VendorQuotationExtractionDetail
): { discount: number; discountType: "Amount" | "Percent" } {
  const raw = Number(detail.discount ?? 0) || 0;
  if (raw === 0) {
    return { discount: 0, discountType: "Percent" };
  }
  const typeRaw = (detail.discountType || "").trim().toLowerCase();
  if (typeRaw === "amount" || typeRaw === "amt" || typeRaw === "$") {
    return { discount: raw, discountType: "Amount" };
  }
  if (
    typeRaw === "percent" ||
    typeRaw === "percentage" ||
    typeRaw === "%" ||
    typeRaw === "pct"
  ) {
    return { discount: raw, discountType: "Percent" };
  }
  // Heuristic when type missing: values over 100 are amount discounts.
  return {
    discount: raw,
    discountType: raw > 0 && raw <= 100 ? "Percent" : "Amount",
  };
}

function uniqueJoinNotes(...parts: Array<string | null | undefined>): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of parts) {
    const trimmed = (part || "").trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out.join(" | ");
}

function matchVendor(
  vendorNames: string[] | null | undefined,
  vendors: VendorCandidate[]
): {
  matchedVendorId: number;
  matchedVendorName: string;
  matchedVendorCode: string;
  vendorNameHint: string;
  vendorMatchWarning: string;
} {
  const names = (vendorNames || []).map((n) => (n || "").trim()).filter(Boolean);
  const hint = names.join(", ");

  if (names.length === 0) {
    return {
      matchedVendorId: 0,
      matchedVendorName: "",
      matchedVendorCode: "",
      vendorNameHint: "",
      vendorMatchWarning: "No vendor name was found in the document.",
    };
  }

  const matches: VendorCandidate[] = [];
  const pushUnique = (found: VendorCandidate[]) => {
    for (const f of found) {
      if (!matches.some((m) => m.vendor_id === f.vendor_id)) {
        matches.push(f);
      }
    }
  };

  // 1) Exact company name match
  for (const name of names) {
    const needle = normalizeName(name);
    pushUnique(vendors.filter((v) => normalizeName(v.company_name) === needle));
  }

  // 2) Contains / reverse-contains match when exact failed
  if (matches.length === 0) {
    for (const name of names) {
      const needle = normalizeName(name);
      if (!needle) continue;
      pushUnique(
        vendors.filter((v) => {
          const hay = normalizeName(v.company_name);
          return hay.includes(needle) || needle.includes(hay);
        })
      );
    }
  }

  if (matches.length === 1) {
    return {
      matchedVendorId: matches[0].vendor_id,
      matchedVendorName: matches[0].company_name,
      matchedVendorCode: matches[0].vendorcode || "",
      vendorNameHint: hint,
      vendorMatchWarning: "",
    };
  }

  if (matches.length > 1) {
    return {
      matchedVendorId: 0,
      matchedVendorName: "",
      matchedVendorCode: "",
      vendorNameHint: hint,
      vendorMatchWarning: `Multiple vendors matched (${matches.map((m) => m.company_name).join(", ")}). Select the vendor on the quotation form.`,
    };
  }

  return {
    matchedVendorId: 0,
    matchedVendorName: "",
    matchedVendorCode: "",
    vendorNameHint: hint,
    vendorMatchWarning: `Vendor "${hint}" was not found in Vendor Master. Select the vendor manually.`,
  };
}

function detailToLines(
  detail: VendorQuotationExtractionDetail,
  detailIndex: number
): VendorQuotationExtractionReviewLine[] {
  const parts = detail.parts || [];
  const qty = Number(detail.quantity ?? 0) || 0;
  const unit = (detail.unit || "EA").trim() || "EA";
  const unitPrice = Number(detail.unitPrice ?? 0) || 0;
  const itemName = (detail.itemName || "").trim();
  const itemDesc = (detail.itemDescription || "").trim();
  const notes = (detail.notes || "").trim();
  const { discount, discountType } = resolveDiscount(detail);

  if (parts.length === 0) {
    const partName = itemName || itemDesc || "";
    if (!partName && qty <= 0 && unitPrice <= 0 && !notes && discount <= 0) {
      return [];
    }
    return [
      {
        key: `d${detailIndex}`,
        partNo: "",
        partName: partName || itemDesc || itemName,
        jobNumber: "",
        qtyOrdered: qty > 0 ? qty : 1,
        unit,
        unitPrice,
        discount,
        discountType,
        notes,
        included: true,
      },
    ];
  }

  // One review row per part identity. Multiple jobs on the same part/item
  // stay on a single row (comma-joined) for the Job multi-select — do not
  // explode into one row per job.
  type PartGroup = {
    partNo: string;
    partName: string;
    jobNos: string[];
    partQty: number;
    partUnit: string;
    partNotes: string;
    firstIndex: number;
  };

  const groups: PartGroup[] = [];
  const groupIndex = new Map<string, number>();

  parts.forEach((part, partIndex) => {
    const partNo = (part.partNo || "").trim();
    const partName =
      (part.partName || "").trim() ||
      (part.description || "").trim() ||
      itemName ||
      itemDesc ||
      "";
    const jobNumber = (part.jobNo || "").trim();
    const partQty = Number(part.quantity ?? qty) || (qty > 0 ? qty : 1);
    const partUnit = ((part.unit || unit || "EA") as string).trim() || "EA";
    const partNotes = uniqueJoinNotes(part.remarks, notes);
    const key = [
      partNo.toLowerCase(),
      partName.toLowerCase(),
      String(partQty),
      partUnit.toLowerCase(),
    ].join("|");

    const existingIdx = groupIndex.get(key);
    if (existingIdx != null) {
      const group = groups[existingIdx];
      if (jobNumber) {
        jobNumber.split(",").forEach((token) => {
          const t = token.trim();
          if (t && !group.jobNos.some((j) => j.toLowerCase() === t.toLowerCase())) {
            group.jobNos.push(t);
          }
        });
      }
      if (partNotes) {
        group.partNotes = uniqueJoinNotes(group.partNotes, partNotes);
      }
      return;
    }

    const jobNos: string[] = [];
    if (jobNumber) {
      jobNumber.split(",").forEach((token) => {
        const t = token.trim();
        if (t && !jobNos.some((j) => j.toLowerCase() === t.toLowerCase())) {
          jobNos.push(t);
        }
      });
    }

    groupIndex.set(key, groups.length);
    groups.push({
      partNo,
      partName,
      jobNos,
      partQty: partQty > 0 ? partQty : 1,
      partUnit,
      partNotes,
      firstIndex: partIndex,
    });
  });

  return groups.map((group) => ({
    key: `d${detailIndex}-p${group.firstIndex}`,
    partNo: group.partNo,
    partName: group.partName,
    jobNumber: group.jobNos.join(", "),
    qtyOrdered: group.partQty,
    unit: group.partUnit,
    unitPrice,
    discount,
    discountType,
    notes: group.partNotes,
    included: true,
  }));
}

/**
 * Build an editable review model from extraction + vendor master list.
 */
export function buildVendorQuotationReview(
  result: VendorQuotationExtractionResult,
  vendors: VendorCandidate[]
): VendorQuotationExtractionReview {
  const vendorMatch = matchVendor(result.vendorNames, vendors);
  const orderDate =
    toDateInput(result.quotationDate) ||
    toDateInput(result.drawingDate) ||
    "";
  const dueDate = toDateInput(result.dueDate);

  const lines: VendorQuotationExtractionReviewLine[] = [];
  (result.details || []).forEach((detail, index) => {
    lines.push(...detailToLines(detail || {}, index));
  });

  return {
    ...vendorMatch,
    orderDate,
    dueDate,
    vendorPoNumber: "",
    buyerName: "",
    lines,
  };
}

export type ApplyImportMode = "override" | "append";

export interface ApplyVendorQuotationImportArgs {
  currentForm: VendorQuotationMasterReq & { QuotationType?: string };
  review: VendorQuotationExtractionReview;
  mode: ApplyImportMode;
  defaultGlcode?: string;
}

export interface ApplyVendorQuotationImportResult {
  formPatch: Partial<VendorQuotationMasterReq & { QuotationType?: string }>;
  details: QuotationDetailReq[];
  warnings: string[];
}

function createDetailRow(
  line: VendorQuotationExtractionReviewLine,
  itemNo: number,
  defaultGlcode: string,
  dueDateFallback: string
): QuotationDetailReq {
  return {
    ID: 0,
    ItemNo: itemNo,
    PartName: line.partName || "",
    PartNo: line.partNo || "",
    DueDate: dueDateFallback,
    JobNumber: line.jobNumber || "",
    JobDesc: "",
    QtyOrdered: Number(line.qtyOrdered) > 0 ? Number(line.qtyOrdered) : 1,
    Unit: (line.unit || "EA").trim() || "EA",
    UnitPrice: Number(line.unitPrice) || 0,
    JobPriority: 0,
    Discount: Number(line.discount) || 0,
    DiscountType: line.discountType === "Amount" ? "Amount" : "Percent",
    ProductId: undefined,
    RawMaterialId: undefined,
    LineType: DEFAULT_VENDOR_ORDER_LINE_TYPE,
    LeadTime: "",
    Notes: line.notes || "",
    glcode: defaultGlcode || "",
  };
}

/**
 * Map reviewed extraction into Vendor Quotation form fields.
 * Does not invent values; leaves unmatched vendor unset.
 */
export function applyVendorQuotationImport({
  currentForm,
  review,
  mode,
  defaultGlcode = "",
}: ApplyVendorQuotationImportArgs): ApplyVendorQuotationImportResult {
  const warnings: string[] = [];
  if (review.vendorMatchWarning) {
    warnings.push(review.vendorMatchWarning);
  }

  const includedLines = (review.lines || []).filter((l) => l.included);
  if (includedLines.length === 0) {
    warnings.push("No line items were included from the extraction.");
  }

  const dueFallback =
    review.dueDate ||
    review.orderDate ||
    currentForm.OrderDate ||
    new Date().toISOString().split("T")[0];

  const blankLine = (): VendorQuotationExtractionReviewLine => ({
    key: "blank",
    partNo: "",
    partName: "",
    jobNumber: "",
    qtyOrdered: 1,
    unit: "EA",
    unitPrice: 0,
    discount: 0,
    discountType: "Percent",
    notes: "",
    included: true,
  });

  const newDetails = includedLines.map((line, index) =>
    createDetailRow(line, index + 1, defaultGlcode, dueFallback)
  );

  let details: QuotationDetailReq[];
  if (mode === "append") {
    const existing = (currentForm.Details || []).filter(
      (d) =>
        (d.PartNo && d.PartNo.trim()) ||
        (d.PartName && d.PartName.trim()) ||
        (d.Notes && d.Notes.trim()) ||
        Number(d.UnitPrice) > 0
    );
    const startItemNo = existing.length + 1;
    const appended = newDetails.map((d, i) => ({ ...d, ItemNo: startItemNo + i }));
    details = [...existing, ...appended];
    if (details.length === 0) {
      details = [createDetailRow(blankLine(), 1, defaultGlcode, dueFallback)];
    }
  } else {
    details =
      newDetails.length > 0
        ? newDetails
        : [createDetailRow(blankLine(), 1, defaultGlcode, dueFallback)];
  }

  const totalAmount = details.reduce((sum, d) => {
    const subtotal = (Number(d.QtyOrdered) || 0) * (Number(d.UnitPrice) || 0);
    const discount =
      d.DiscountType === "Amount"
        ? Math.min(Number(d.Discount) || 0, subtotal)
        : subtotal * ((Number(d.Discount) || 0) / 100);
    return sum + Math.max(0, subtotal - discount);
  }, 0);

  const formPatch: Partial<VendorQuotationMasterReq & { QuotationType?: string }> = {
    TotalAmount: totalAmount,
  };

  if (review.matchedVendorId > 0) {
    formPatch.VendorID = review.matchedVendorId;
    formPatch.VendorName = review.matchedVendorName;
    formPatch.VendorCode = review.matchedVendorCode;
  }

  if (review.orderDate) {
    formPatch.OrderDate = review.orderDate;
  }

  if (review.dueDate) {
    formPatch.ExternalOrderDate = review.dueDate;
  }

  // Quotation number / contact person are intentionally not applied from extraction.

  return { formPatch, details, warnings };
}

export function formHasMeaningfulLines(details: QuotationDetailReq[] | undefined): boolean {
  if (!details || details.length === 0) return false;
  return details.some(
    (d) =>
      (d.PartNo && d.PartNo.trim()) ||
      (d.PartName && d.PartName.trim()) ||
      (d.Notes && d.Notes.trim()) ||
      Number(d.UnitPrice) > 0 ||
      (Number(d.QtyOrdered) > 0 && Number(d.UnitPrice) > 0)
  );
}
