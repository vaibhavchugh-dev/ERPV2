/** Stored in DB / API as PascalCase values (matches backend NormalizeVendorOrderLineType). */
export const VENDOR_ORDER_LINE_TYPES = [
  { value: "RawMaterial", label: "Raw material" },
  { value: "FinishedProduct", label: "Finished product" },
  { value: "Tool", label: "Tool" },
  { value: "Service", label: "Service" },
  { value: "Subcontract", label: "Subcontract" },
  { value: "Other", label: "Other" },
] as const;

export type VendorOrderLineType = (typeof VENDOR_ORDER_LINE_TYPES)[number]["value"];

export function defaultLineTypeForOrder(materialType: string | undefined): VendorOrderLineType {
  return materialType === "Service" ? "Service" : "RawMaterial";
}
