import type { OrderDetailReq, OrderMasterReq } from "../../Services/OrderService";
import type { QuotationDetailReq, QuotationMasterReq } from "../../Services/QuotationService";
import type {
  CustomerCandidate,
  CustomerDocumentExtractionReview,
  ExtractedCustomerDraft,
  VendorQuotationExtractionResult,
  VendorQuotationExtractionReviewLine,
} from "../types";
import {
  buildExtractionLinesFromResult,
  formHasMeaningfulLines,
  resolveExtractionDates,
  type ApplyImportMode,
} from "./vendorQuotationMapper";

function normalizeName(value?: string | null): string {
  return (value || "").trim().toLowerCase().replace(/\s+/g, " ");
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
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

function enrichAddressFields(input: {
  address: string;
  apartment: string;
  City: string;
  states: string;
  zipcode: string;
  country: string;
}) {
  let { address, apartment, City, states, zipcode, country } = input;
  country = country || "US";
  if ((!City || !states || !zipcode) && address) {
    const parts = address.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      const last = parts[parts.length - 1];
      const stateZip = last.match(/^([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/);
      const cityStateZip = last.match(/^(.+?)\s+([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/);
      if (stateZip && parts.length >= 2) {
        if (!states) states = stateZip[1].toUpperCase();
        if (!zipcode) zipcode = stateZip[2];
        if (!City) City = parts[parts.length - 2];
        const streetParts = parts.slice(0, Math.max(0, parts.length - 2));
        if (streetParts.length > 1 && !apartment) {
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

function matchCustomer(
  partyNames: string[] | null | undefined,
  customers: CustomerCandidate[],
  excludeNames?: Array<string | null | undefined>
) {
  const excluded = new Set(
    (excludeNames || []).map((n) => normalizeName(n)).filter(Boolean)
  );
  const names = (partyNames || [])
    .map((n) => (n || "").trim())
    .filter(Boolean)
    .filter((n) => !excluded.has(normalizeName(n)));

  const hint = names.join(", ");
  if (names.length === 0) {
    return {
      matchedCustomerId: 0,
      matchedCustomerName: "",
      matchedCustomerCode: "",
      customerNameHint: "",
      customerMatchWarning: "No customer name was found on the document.",
    };
  }

  for (const name of names) {
    const key = normalizeName(name);
    const exact = customers.find((c) => normalizeName(c.company_name) === key);
    if (exact) {
      return {
        matchedCustomerId: exact.customer_id,
        matchedCustomerName: exact.company_name,
        matchedCustomerCode:
          exact.customercode || exact.CustomerCode || "",
        customerNameHint: hint,
        customerMatchWarning: "",
      };
    }
  }

  for (const name of names) {
    const key = normalizeName(name);
    const partial = customers.find((c) => {
      const cn = normalizeName(c.company_name);
      return cn.includes(key) || key.includes(cn);
    });
    if (partial) {
      return {
        matchedCustomerId: partial.customer_id,
        matchedCustomerName: partial.company_name,
        matchedCustomerCode:
          partial.customercode || partial.CustomerCode || "",
        customerNameHint: hint,
        customerMatchWarning: "",
      };
    }
  }

  return {
    matchedCustomerId: 0,
    matchedCustomerName: "",
    matchedCustomerCode: "",
    customerNameHint: hint,
    customerMatchWarning: `Customer "${hint}" was not found in Customer Master. You can create it from the extracted details.`,
  };
}

function buildExtractedCustomerDraft(
  result: VendorQuotationExtractionResult,
  customerNameHint: string
): ExtractedCustomerDraft | null {
  const company =
    customerNameHint.split(",")[0]?.trim() ||
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
  const hasShipping = !!(
    shippingRaw.address ||
    shippingRaw.City ||
    shippingRaw.states ||
    shippingRaw.zipcode
  );
  const shipping = hasShipping
    ? enrichAddressFields({ ...shippingRaw, country: shippingRaw.country || "US" })
    : { address: "", apartment: "", City: "", states: "", zipcode: "", country: "" };

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
    zip: billing.zipcode,
    country: billing.country,
    shippingAddress: shipping.address,
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

export function buildCustomerDocumentReview(
  result: VendorQuotationExtractionResult,
  customers: CustomerCandidate[]
): CustomerDocumentExtractionReview {
  const anyResult = result as Record<string, unknown>;
  const customerMatch = matchCustomer(result.vendorNames, customers, [
    result.companyName,
    anyResult.CompanyName as string,
    anyResult.issuerName as string,
    anyResult.preparedBy as string,
    anyResult.fromCompany as string,
  ]);
  const { orderDate, dueDate } = resolveExtractionDates(result);
  const lines = buildExtractionLinesFromResult(result);

  const toOptionalNumber = (value: unknown): number | null => {
    if (value == null || value === "") return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  };

  const invoiceNumber = String(
    result.invoiceNumber ||
      anyResult.InvoiceNumber ||
      result.quotationNumber ||
      anyResult.QuotationNumber ||
      ""
  ).trim();
  const poNumber = String(result.poNumber || anyResult.PoNumber || "").trim();

  return {
    ...customerMatch,
    extractedCustomerDraft:
      customerMatch.matchedCustomerId > 0
        ? null
        : buildExtractedCustomerDraft(result, customerMatch.customerNameHint),
    orderDate,
    dueDate,
    customerPoNumber: poNumber || (result.quotationNumber || "").trim(),
    invoiceNumber: invoiceNumber || undefined,
    poNumber: poNumber || undefined,
    taxRate: toOptionalNumber(result.taxRate ?? anyResult.TaxRate),
    taxAmount: toOptionalNumber(result.taxAmount ?? anyResult.TaxAmount),
    freightCharge: toOptionalNumber(
      result.freightCharge ?? anyResult.FreightCharge
    ),
    extractedTotal: toOptionalNumber(result.totalAmount ?? anyResult.TotalAmount),
    lines,
  };
}

function createQuotationDetailRow(
  line: VendorQuotationExtractionReviewLine,
  itemNo: number,
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
    LeadTime: "",
    Notes: line.notes || "",
  };
}

function createOrderDetailRow(
  line: VendorQuotationExtractionReviewLine,
  itemNo: number,
  dueDateFallback: string
): OrderDetailReq {
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
    LeadTime: "",
    Notes: line.notes || "",
    ShippedQty: 0,
    ShippingStatus: "",
    InvoicedQty: 0,
    InvoiceStatus: "",
  };
}

function mergeDetails<T extends { ItemNo: number }>(
  mode: ApplyImportMode,
  existing: T[],
  created: T[],
  isMeaningful: (d: T) => boolean,
  blank: T
): T[] {
  if (mode === "append") {
    const kept = existing.filter(isMeaningful);
    const start = kept.length + 1;
    const appended = created.map((d, i) => ({ ...d, ItemNo: start + i }));
    const details = [...kept, ...appended];
    return details.length > 0 ? details : [blank];
  }
  return created.length > 0 ? created : [blank];
}

export function applyCustomerQuotationImport(args: {
  currentForm: QuotationMasterReq;
  review: CustomerDocumentExtractionReview;
  mode: ApplyImportMode;
}): {
  formPatch: Partial<QuotationMasterReq>;
  details: QuotationDetailReq[];
  warnings: string[];
} {
  const { currentForm, review, mode } = args;
  const warnings: string[] = [];
  if (review.customerMatchWarning) warnings.push(review.customerMatchWarning);

  const included = (review.lines || []).filter((l) => l.included);
  if (included.length === 0) {
    warnings.push("No line items were included from the extraction.");
  }

  const today = new Date().toISOString().split("T")[0];
  const dueFallback =
    review.dueDate || review.orderDate || currentForm.OrderDate || today;

  const newDetails = included.map((line, i) =>
    createQuotationDetailRow(line, i + 1, dueFallback)
  );
  const blank = createQuotationDetailRow(
    {
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
    },
    1,
    dueFallback
  );

  const details = mergeDetails(
    mode,
    currentForm.Details || [],
    newDetails,
    (d) =>
      !!(d.PartNo?.trim() || d.PartName?.trim() || d.Notes?.trim() || Number(d.UnitPrice) > 0),
    blank
  );

  const totalAmount = details.reduce((sum, d) => {
    const subtotal = (Number(d.QtyOrdered) || 0) * (Number(d.UnitPrice) || 0);
    const discount =
      d.DiscountType === "Amount"
        ? Math.min(Number(d.Discount) || 0, subtotal)
        : subtotal * ((Number(d.Discount) || 0) / 100);
    return sum + Math.max(0, subtotal - discount);
  }, 0);

  const formPatch: Partial<QuotationMasterReq> = {
    TotalAmount: totalAmount,
    OrderDate: review.orderDate || currentForm.OrderDate || today,
  };
  if (review.matchedCustomerId > 0) {
    formPatch.CustomerID = review.matchedCustomerId;
    formPatch.CustomerName = review.matchedCustomerName;
    formPatch.CustomerCode = review.matchedCustomerCode;
  }
  if (review.customerPoNumber) {
    formPatch.CustomerRefNo = review.customerPoNumber;
  }
  if (review.dueDate) {
    formPatch.ExternalOrderDate = review.dueDate;
  }

  return { formPatch, details, warnings };
}

export function applyCustomerOrderImport(args: {
  currentForm: OrderMasterReq;
  review: CustomerDocumentExtractionReview;
  mode: ApplyImportMode;
}): {
  formPatch: Partial<OrderMasterReq>;
  details: OrderDetailReq[];
  warnings: string[];
} {
  const { currentForm, review, mode } = args;
  const warnings: string[] = [];
  if (review.customerMatchWarning) warnings.push(review.customerMatchWarning);

  const included = (review.lines || []).filter((l) => l.included);
  if (included.length === 0) {
    warnings.push("No line items were included from the extraction.");
  }

  const today = new Date().toISOString().split("T")[0];
  const dueFallback =
    review.dueDate || review.orderDate || currentForm.OrderDate || today;

  const newDetails = included.map((line, i) =>
    createOrderDetailRow(line, i + 1, dueFallback)
  );
  const blank = createOrderDetailRow(
    {
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
    },
    1,
    dueFallback
  );

  const details = mergeDetails(
    mode,
    currentForm.Details || [],
    newDetails,
    (d) =>
      !!(d.PartNo?.trim() || d.PartName?.trim() || d.Notes?.trim() || Number(d.UnitPrice) > 0),
    blank
  );

  const totalAmount = details.reduce((sum, d) => {
    const subtotal = (Number(d.QtyOrdered) || 0) * (Number(d.UnitPrice) || 0);
    const discount =
      d.DiscountType === "Amount"
        ? Math.min(Number(d.Discount) || 0, subtotal)
        : subtotal * ((Number(d.Discount) || 0) / 100);
    return sum + Math.max(0, subtotal - discount);
  }, 0);

  const formPatch: Partial<OrderMasterReq> = {
    TotalAmount: totalAmount,
    OrderDate: review.orderDate || currentForm.OrderDate || today,
  };
  if (review.matchedCustomerId > 0) {
    formPatch.CustomerID = review.matchedCustomerId;
    formPatch.CustomerName = review.matchedCustomerName;
    formPatch.CustomerCode = review.matchedCustomerCode;
  }
  if (review.customerPoNumber) {
    formPatch.CustomerPoNumber = review.customerPoNumber;
  }
  if (review.dueDate) {
    formPatch.ExternalOrderDate = review.dueDate;
  }

  return { formPatch, details, warnings };
}

export { formHasMeaningfulLines };
