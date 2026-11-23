import { DEFAULT_VENDOR_ORDER_LINE_TYPE } from "../../Constants/vendorOrderLineTypes";
import type {
  VendorOrderDetailReq,
  VendorOrderMasterReq,
} from "../../Services/VendorOrderService";
import type {
  VendorCandidate,
  VendorQuotationExtractionResult,
  VendorQuotationExtractionReview,
  VendorQuotationExtractionReviewLine,
} from "../types";
import {
  applyVendorQuotationImport,
  buildVendorQuotationReview,
  formHasMeaningfulLines,
  type ApplyImportMode,
} from "./vendorQuotationMapper";

export function buildVendorOrderReview(
  result: VendorQuotationExtractionResult,
  vendors: VendorCandidate[]
): VendorQuotationExtractionReview {
  return buildVendorQuotationReview(result, vendors);
}

function toVendorOrderDetail(
  line: VendorQuotationExtractionReviewLine,
  itemNo: number,
  dueDateFallback: string,
  defaultGlcode: string
): VendorOrderDetailReq {
  return {
    ID: 0,
    ItemNo: itemNo,
    PartName: line.partName || "",
    PartNo: line.partNo || "",
    LineType: DEFAULT_VENDOR_ORDER_LINE_TYPE,
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
    LeadTime: "",
    Notes: line.notes || "",
    ShippedQty: 0,
    ShippingStatus: "",
    InvoicedQty: 0,
    InvoiceStatus: "",
    glcode: defaultGlcode || "",
  };
}

export function applyVendorOrderImport(args: {
  currentForm: VendorOrderMasterReq;
  review: VendorQuotationExtractionReview;
  mode: ApplyImportMode;
  defaultGlcode?: string;
}): {
  formPatch: Partial<VendorOrderMasterReq>;
  details: VendorOrderDetailReq[];
  warnings: string[];
} {
  const { currentForm, review, mode, defaultGlcode = "" } = args;

  // Reuse VQ party/date/total logic via a compatible shape, then map lines to VO details.
  const vqCompatible = {
    ...currentForm,
    Details: (currentForm.Details || []).map((d) => ({
      ID: d.ID,
      ItemNo: d.ItemNo,
      PartName: d.PartName,
      PartNo: d.PartNo,
      DueDate: d.DueDate,
      JobNumber: d.JobNumber,
      JobDesc: d.JobDesc,
      QtyOrdered: d.QtyOrdered,
      Unit: d.Unit,
      UnitPrice: d.UnitPrice,
      JobPriority: d.JobPriority,
      Discount: d.Discount,
      DiscountType: d.DiscountType,
      ProductId: d.ProductId,
      RawMaterialId: d.RawMaterialId,
      LineType: d.LineType,
      LeadTime: d.LeadTime,
      Notes: d.Notes,
      glcode: d.glcode,
    })),
  };

  const { formPatch: vqPatch, warnings } = applyVendorQuotationImport({
    currentForm: vqCompatible as any,
    review,
    mode,
    defaultGlcode,
  });

  const today = new Date().toISOString().split("T")[0];
  const dueFallback =
    review.dueDate || review.orderDate || currentForm.OrderDate || today;
  const included = (review.lines || []).filter((l) => l.included);

  const blank = (): VendorOrderDetailReq =>
    toVendorOrderDetail(
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
      dueFallback,
      defaultGlcode
    );

  const newDetails = included.map((line, i) =>
    toVendorOrderDetail(line, i + 1, dueFallback, defaultGlcode)
  );

  let details: VendorOrderDetailReq[];
  if (mode === "append") {
    const existing = (currentForm.Details || []).filter(
      (d) =>
        (d.PartNo && d.PartNo.trim()) ||
        (d.PartName && d.PartName.trim()) ||
        (d.Notes && d.Notes.trim()) ||
        Number(d.UnitPrice) > 0
    );
    const start = existing.length + 1;
    const appended = newDetails.map((d, i) => ({ ...d, ItemNo: start + i }));
    details = [...existing, ...appended];
    if (details.length === 0) details = [blank()];
  } else {
    details = newDetails.length > 0 ? newDetails : [blank()];
  }

  const totalAmount = details.reduce((sum, d) => {
    const subtotal = (Number(d.QtyOrdered) || 0) * (Number(d.UnitPrice) || 0);
    const discount =
      d.DiscountType === "Amount"
        ? Math.min(Number(d.Discount) || 0, subtotal)
        : subtotal * ((Number(d.Discount) || 0) / 100);
    return sum + Math.max(0, subtotal - discount);
  }, 0);

  const formPatch: Partial<VendorOrderMasterReq> = {
    TotalAmount: totalAmount,
    OrderDate: (vqPatch.OrderDate as string) || review.orderDate || currentForm.OrderDate || today,
  };
  if (vqPatch.VendorID) {
    formPatch.VendorID = vqPatch.VendorID as number;
    formPatch.VendorName = (vqPatch.VendorName as string) || "";
    formPatch.VendorCode = (vqPatch.VendorCode as string) || "";
  }
  if (review.dueDate) {
    formPatch.ExternalOrderDate = review.dueDate;
  }
  if (review.vendorPoNumber) {
    formPatch.VendorPoNumber = review.vendorPoNumber;
  }

  return { formPatch, details, warnings };
}

export { formHasMeaningfulLines };
