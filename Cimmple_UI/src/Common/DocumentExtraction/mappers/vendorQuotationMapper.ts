import {
  QuotationDetailReq,
  VendorQuotationMasterReq,
} from "../../Services/QuotationService";
import { DEFAULT_VENDOR_ORDER_LINE_TYPE } from "../../Constants/vendorOrderLineTypes";
import type {
  ExtractedVendorDraft,
  VendorCandidate,
  VendorQuotationExtractionDetail,
  VendorQuotationExtractionResult,
  VendorQuotationExtractionReview,
  VendorQuotationExtractionReviewLine,
} from "../types";

function normalizeName(value?: string | null): string {
  return (value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Normalize many PDF/API date formats to yyyy-MM-dd for <input type="date">. */
function toDateInput(value?: string | null): string {
  if (value == null) return "";
  const trimmed = String(value).trim();
  if (!trimmed) return "";

  // Already yyyy-MM-dd (optionally with time) — avoid UTC timezone shift.
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  // MM/DD/YYYY or M/D/YYYY
  const mdY = trimmed.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (mdY) {
    const a = Number(mdY[1]);
    const b = Number(mdY[2]);
    const y = mdY[3];
    // Prefer US MM/DD when first > 12 would be invalid as month; if both <= 12 assume MM/DD.
    if (a > 12 && b <= 12) return `${y}-${pad2(b)}-${pad2(a)}`; // DD/MM/YYYY
    return `${y}-${pad2(a)}-${pad2(b)}`; // MM/DD/YYYY
  }

  // DD-MMM-YYYY / DD MMM YYYY (e.g. 29-Sep-2026)
  const dMonY = trimmed.match(
    /^(\d{1,2})[\s\-\/.]+([A-Za-z]{3,9})[\s\-\/.]+(\d{4})$/
  );
  if (dMonY) {
    const parsed = Date.parse(`${dMonY[1]} ${dMonY[2]} ${dMonY[3]}`);
    if (!Number.isNaN(parsed)) {
      const d = new Date(parsed);
      return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    }
  }

  // "Sep 29, 2026" / "September 29, 2026"
  const parsed = Date.parse(trimmed);
  if (!Number.isNaN(parsed)) {
    const d = new Date(parsed);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }
  return "";
}

function firstDateFromResult(result: VendorQuotationExtractionResult): string {
  const any = result as Record<string, unknown>;
  const candidates = [
    result.quotationDate,
    any.QuotationDate,
    any.invoiceDate,
    any.InvoiceDate,
    any.quoteDate,
    any.QuoteDate,
    any.orderDate,
    any.documentDate,
    any.DocumentDate,
    result.drawingDate,
    any.DrawingDate,
    any.date,
    any.Date,
  ];
  for (const c of candidates) {
    const normalized = toDateInput(c == null ? null : String(c));
    if (normalized) return normalized;
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

/** Normalize JO-style tokens to JO#N when possible. */
function normalizeJobToken(raw: string): string {
  const t = (raw || "").trim();
  if (!t) return "";
  const jo =
    t.match(/^JO[#\-_\s]?(\d+)$/i) ||
    t.match(/^#JO(\d+)$/i) ||
    t.match(/^JO(\d+)$/i);
  if (jo) return `JO#${jo[1]}`;
  return t;
}

function isJobLikeToken(value?: string | null): boolean {
  const t = (value || "").trim();
  if (!t) return false;
  return (
    /JO#/i.test(t) ||
    /#JO/i.test(t) ||
    /^JO\d/i.test(t) ||
    /^JO[-_\s]/i.test(t) ||
    /^JOB[#\-_\s]?\w/i.test(t)
  );
}

/**
 * Pull job/JO references out of free text (notes/remarks) so they go to Job No, not Notes.
 */
function extractJobsFromText(text: string): { jobs: string[]; cleaned: string } {
  if (!(text || "").trim()) return { jobs: [], cleaned: "" };

  const jobs: string[] = [];
  let cleaned = text;

  cleaned = cleaned.replace(
    /\b(?:job\s*(?:no\.?|number|#)?|jo\s*(?:no\.?|#)?)\s*[:\-–]?\s*([A-Za-z0-9][\w\-\/]*)/gi,
    (_m, job: string) => {
      const n = normalizeJobToken(job);
      if (n) jobs.push(n);
      return " ";
    }
  );

  cleaned = cleaned.replace(/\b(?:JO[#\-_\s]?\d+|#JO\d+|JOB[#\-_\s][A-Za-z0-9][\w\-]*)\b/gi, (m) => {
    const n = normalizeJobToken(m);
    if (n) jobs.push(n);
    return " ";
  });

  // Whole fragment that is only a job token (e.g. notes = "JO#1001")
  const fragments = cleaned
    .split(/\s*\|\s*|\r?\n+|,/)
    .map((f) => f.replace(/^[\s,;:\-–]+|[\s,;:\-–]+$/g, "").trim())
    .filter(Boolean);

  const kept: string[] = [];
  for (const frag of fragments) {
    if (isJobLikeToken(frag)) {
      jobs.push(normalizeJobToken(frag));
      continue;
    }
    kept.push(frag);
  }

  const uniqueJobs: string[] = [];
  for (const j of jobs) {
    if (!uniqueJobs.some((x) => x.toLowerCase() === j.toLowerCase())) {
      uniqueJobs.push(j);
    }
  }

  return { jobs: uniqueJobs, cleaned: kept.join(" | ") };
}

/** Drop note fragments that duplicate part/description (case/whitespace-insensitive). */
function cleanNotesField(
  rawNotes: string,
  ...excludeTexts: Array<string | null | undefined>
): string {
  const excludes = excludeTexts
    .map((t) => normalizeName(t))
    .filter(Boolean);
  if (!rawNotes.trim()) return "";

  const fragments = rawNotes
    .split(/\s*\|\s*|\r?\n+/)
    .map((f) => f.trim())
    .filter(Boolean);

  const kept: string[] = [];
  const seen = new Set<string>();
  for (const frag of fragments) {
    const key = normalizeName(frag);
    if (!key || seen.has(key)) continue;
    if (isJobLikeToken(frag)) continue;
    // Exact match only — avoid stripping real remarks that merely contain part text.
    if (excludes.some((ex) => ex === key)) {
      continue;
    }
    seen.add(key);
    kept.push(frag);
  }
  return kept.join(" | ");
}

function matchVendor(
  vendorNames: string[] | null | undefined,
  vendors: VendorCandidate[],
  excludeNames?: Array<string | null | undefined>
): {
  matchedVendorId: number;
  matchedVendorName: string;
  matchedVendorCode: string;
  vendorNameHint: string;
  vendorMatchWarning: string;
} {
  const excluded = new Set(
    (excludeNames || [])
      .map((n) => normalizeName(n))
      .filter(Boolean)
  );
  const names = (vendorNames || [])
    .map((n) => (n || "").trim())
    .filter(Boolean)
    .filter((n) => !excluded.has(normalizeName(n)));
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
      vendorMatchWarning: `Multiple vendors matched (${matches.map((m) => m.company_name).join(", ")}). Select the vendor on the quotation form, or create a new one.`,
    };
  }

  return {
    matchedVendorId: 0,
    matchedVendorName: "",
    matchedVendorCode: "",
    vendorNameHint: hint,
    vendorMatchWarning: `Vendor "${hint}" was not found in Vendor Master. You can create it from the extracted details.`,
  };
}

function splitContactName(fullName?: string | null): {
  firstName: string;
  lastName: string;
} {
  let trimmed = (fullName || "").trim();
  if (!trimmed) return { firstName: "", lastName: "" };
  trimmed = trimmed.replace(/^(attn|attention|contact)\s*[:\-]\s*/i, "").trim();
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

/** Best-effort parse of a single-line US-style address into street/city/state/zip. */
function enrichAddressFields(input: {
  address: string;
  apartment: string;
  City: string;
  states: string;
  zipcode: string;
  country: string;
}): {
  address: string;
  apartment: string;
  City: string;
  states: string;
  zipcode: string;
  country: string;
} {
  let { address, apartment, City, states, zipcode, country } = input;
  country = country || "US";

  if ((!City || !states || !zipcode) && address) {
    // "123 Main St, Suite 2, Springfield, IL 62701" or "123 Main St, Springfield IL 62701"
    const parts = address.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      const last = parts[parts.length - 1];
      const stateZip = last.match(/^([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/);
      const cityStateZip = last.match(/^(.+?)\s+([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/);

      if (stateZip && parts.length >= 2) {
        if (!states) states = stateZip[1].toUpperCase();
        if (!zipcode) zipcode = stateZip[2];
        if (!City && parts.length >= 2) City = parts[parts.length - 2];
        const streetParts = parts.slice(0, Math.max(0, parts.length - 2));
        if (streetParts.length > 0 && !apartment && streetParts.length > 1) {
          address = streetParts[0];
          apartment = streetParts.slice(1).join(", ");
        } else if (streetParts.length > 0) {
          address = streetParts.join(", ");
        }
      } else if (cityStateZip) {
        if (!City) City = cityStateZip[1].trim();
        if (!states) states = cityStateZip[2].toUpperCase();
        if (!zipcode) zipcode = cityStateZip[3];
        const streetParts = parts.slice(0, -1);
        if (streetParts.length > 1 && !apartment) {
          address = streetParts[0];
          apartment = streetParts.slice(1).join(", ");
        } else if (streetParts.length > 0) {
          address = streetParts.join(", ");
        }
      }
    }
  }

  return { address, apartment, City, states, zipcode, country };
}

function buildExtractedVendorDraft(
  result: VendorQuotationExtractionResult,
  vendorNameHint: string
): ExtractedVendorDraft | null {
  const company =
    vendorNameHint.split(",")[0]?.trim() ||
    (result.vendorNames || []).map((n) => (n || "").trim()).find(Boolean) ||
    "";
  const { firstName, lastName } = splitContactName(result.vendorContactName);
  const email = (result.vendorEmail || "").trim();
  const phone = (result.vendorPhone || "").trim();
  const billing = enrichAddressFields({
    address: (result.vendorAddress || "").trim(),
    apartment: (result.vendorApartment || "").trim(),
    City: (result.vendorCity || "").trim(),
    states: (result.vendorState || "").trim(),
    zipcode: (result.vendorZip || "").trim(),
    country: (result.vendorCountry || "").trim() || "US",
  });
  const shippingRaw = {
    address: (result.vendorShippingAddress || "").trim(),
    apartment: (result.vendorShippingApartment || "").trim(),
    City: (result.vendorShippingCity || "").trim(),
    states: (result.vendorShippingState || "").trim(),
    zipcode: (result.vendorShippingZip || "").trim(),
    country: (result.vendorShippingCountry || "").trim(),
  };
  const hasShipping =
    !!(
      shippingRaw.address ||
      shippingRaw.City ||
      shippingRaw.states ||
      shippingRaw.zipcode
    );
  const shipping = hasShipping
    ? enrichAddressFields({
        ...shippingRaw,
        country: shippingRaw.country || "US",
      })
    : {
        address: "",
        apartment: "",
        City: "",
        states: "",
        zipcode: "",
        country: "",
      };

  if (
    !company &&
    !email &&
    !phone &&
    !billing.address &&
    !billing.City &&
    !shipping.address &&
    !firstName &&
    !lastName
  ) {
    return null;
  }

  return {
    company_name: company,
    email,
    phone_number: phone,
    address: billing.address,
    apartment: billing.apartment,
    City: billing.City,
    states: billing.states,
    zipcode: billing.zipcode,
    country: billing.country,
    shippingaddress: shipping.address,
    shippingApartment: shipping.apartment,
    shippingCity: shipping.City,
    shippingStates: shipping.states,
    shippingZipCode: shipping.zipcode,
    shippingCountry: shipping.country,
    contactFirstName: firstName,
    contactLastName: lastName,
    contactEmail: email,
    contactPhone: phone,
  };
}

/**
 * Exactly one quotation line per extracted details[] row (1 PDF table row → 1 line).
 * Keep part / description / notes in separate fields — never duplicate across them.
 */
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
  const { discount, discountType } = resolveDiscount(detail);

  const partNos: string[] = [];
  const jobNos: string[] = [];
  let partName = "";
  let description = itemDesc;
  let partQty = qty;
  let partUnit = unit;
  const remarkBits: string[] = [];

  if (itemName) partName = itemName;

  const pushJob = (raw: string) => {
    raw.split(",").forEach((token) => {
      const t = normalizeJobToken(token.trim());
      if (t && !jobNos.some((j) => j.toLowerCase() === t.toLowerCase())) {
        jobNos.push(t);
      }
    });
  };

  parts.forEach((part) => {
    const pNo = (part.partNo || "").trim();
    // Job refs misplaced in partNo → Job No field, not Part No.
    if (pNo && isJobLikeToken(pNo)) {
      pushJob(pNo);
    } else if (pNo && !partNos.some((x) => x.toLowerCase() === pNo.toLowerCase())) {
      partNos.push(pNo);
    }
    const pName = (part.partName || "").trim();
    const pDesc = (part.description || "").trim();
    if (!partName && pName && !isJobLikeToken(pName)) partName = pName;
    if (!description && pDesc && !isJobLikeToken(pDesc)) description = pDesc;
    else if (!description && pName && pName !== partName && !isJobLikeToken(pName)) {
      description = pName;
    }
    const jobNumber = (part.jobNo || "").trim();
    if (jobNumber) pushJob(jobNumber);

    // Job refs misplaced in remarks → Job No.
    const remark = (part.remarks || "").trim();
    if (remark) {
      const fromRemark = extractJobsFromText(remark);
      fromRemark.jobs.forEach(pushJob);
      if (fromRemark.cleaned) remarkBits.push(fromRemark.cleaned);
    }

    const pq = Number(part.quantity ?? 0) || 0;
    if (pq > 0 && partQty <= 0) partQty = pq;
    const pu = ((part.unit || "") as string).trim();
    if (pu && partUnit === "EA") partUnit = pu;
  });

  // Job refs misplaced in detail.notes → Job No.
  const notesExtract = extractJobsFromText((detail.notes || "").trim());
  notesExtract.jobs.forEach(pushJob);

  // Description field on the line uses partName slot in UI (Part Name / Description).
  const lineDescription = partName || description || "";
  const rawNotes = uniqueJoinNotes(notesExtract.cleaned, ...remarkBits);
  const notes = cleanNotesField(
    rawNotes,
    lineDescription,
    description,
    partName,
    itemName,
    itemDesc,
    partNos.join(", "),
    ...partNos,
    jobNos.join(", "),
    ...jobNos
  );

  if (
    !lineDescription &&
    partNos.length === 0 &&
    partQty <= 0 &&
    unitPrice <= 0 &&
    !notes &&
    discount <= 0
  ) {
    return [];
  }

  const qtyOrdered = qty > 0 ? qty : partQty > 0 ? partQty : 1;

  return [
    {
      key: `d${detailIndex}`,
      partNo: partNos.join(", "),
      partName: lineDescription || partNos[0] || "",
      jobNumber: jobNos.join(", "),
      qtyOrdered,
      unit: partUnit || "EA",
      unitPrice,
      discount,
      discountType,
      notes,
      included: true,
    },
  ];
}

/** Shared line builder used by all document kinds. */
export function buildExtractionLinesFromResult(
  result: VendorQuotationExtractionResult
): VendorQuotationExtractionReviewLine[] {
  const lines: VendorQuotationExtractionReviewLine[] = [];
  (result.details || []).forEach((detail, index) => {
    lines.push(...detailToLines(detail || {}, index));
  });
  return lines;
}

export function resolveExtractionDates(result: VendorQuotationExtractionResult): {
  orderDate: string;
  dueDate: string;
} {
  return {
    orderDate: firstDateFromResult(result),
    dueDate:
      toDateInput(result.dueDate) ||
      toDateInput((result as Record<string, unknown>).DueDate as string) ||
      "",
  };
}

/**
 * Build an editable review model from extraction + vendor master list.
 */
export function buildVendorQuotationReview(
  result: VendorQuotationExtractionResult,
  vendors: VendorCandidate[]
): VendorQuotationExtractionReview {
  const anyResult = result as Record<string, unknown>;
  const vendorMatch = matchVendor(result.vendorNames, vendors, [
    result.companyName,
    result.clientName,
    anyResult.CompanyName as string,
    anyResult.issuerName as string,
    anyResult.IssuerName as string,
    anyResult.preparedBy as string,
    anyResult.fromCompany as string,
  ]);
  const { orderDate, dueDate } = resolveExtractionDates(result);
  const lines = buildExtractionLinesFromResult(result);

  const extractedVendorDraft =
    vendorMatch.matchedVendorId > 0
      ? null
      : buildExtractedVendorDraft(result, vendorMatch.vendorNameHint);

  return {
    ...vendorMatch,
    extractedVendorDraft,
    orderDate,
    dueDate,
    vendorPoNumber: (result.quotationNumber || "").trim(),
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

  // Prefer extracted quotation date; fall back to current form date, then today.
  const today = new Date().toISOString().split("T")[0];
  formPatch.OrderDate =
    review.orderDate ||
    toDateInput(currentForm.OrderDate) ||
    today;

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
