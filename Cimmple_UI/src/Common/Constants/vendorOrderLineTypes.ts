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

export const DEFAULT_VENDOR_ORDER_LINE_TYPE: VendorOrderLineType = "RawMaterial";

/** Blank LineType on old POs: Service header → Service, otherwise Raw material. */
export function defaultLineTypeForOrder(materialType: string | undefined): VendorOrderLineType {
  return materialType === "Service" ? "Service" : DEFAULT_VENDOR_ORDER_LINE_TYPE;
}

export function lineTypeFromQuotationType(
  quotationType: string | undefined
): VendorOrderLineType {
  return quotationType === "Service" ? "Service" : DEFAULT_VENDOR_ORDER_LINE_TYPE;
}

/** Header classifier derived from lines (listing / stored MaterialType). */
export function deriveOrderMaterialType(
  lineTypes: Array<string | undefined | null>
): "Material" | "Service" | "Mixed" {
  const types = lineTypes
    .map((t) => (t || "").trim())
    .filter((t) => t.length > 0);
  if (types.length === 0) return "Material";

  const serviceLike = (t: string) => t === "Service" || t === "Subcontract";
  const goodsLike = (t: string) =>
    t === "RawMaterial" || t === "FinishedProduct" || t === "Tool";

  const anyService = types.some(serviceLike);
  const anyGoods = types.some(goodsLike);
  if (anyService && anyGoods) return "Mixed";
  if (anyService && !anyGoods) return "Service";
  return "Material";
}

/** CSS modifier for the line-type select (must match VendorOrderSlideout.scss). */
export function lineTypeAccentClass(lineType?: string | null): string {
  const t = (lineType || DEFAULT_VENDOR_ORDER_LINE_TYPE).trim();
  switch (t) {
    case "RawMaterial":
      return "vo-line-type--raw";
    case "FinishedProduct":
      return "vo-line-type--finished";
    case "Tool":
      return "vo-line-type--tool";
    case "Service":
      return "vo-line-type--service";
    case "Subcontract":
      return "vo-line-type--subcontract";
    default:
      return "vo-line-type--other";
  }
}
export function isBlankQuoteOrOrderLine(detail: {
  PartNo?: string | null;
  PartName?: string | null;
  Notes?: string | null;
  UnitPrice?: number | null;
}): boolean {
  return (
    !(detail.PartNo || "").trim() &&
    !(detail.PartName || "").trim() &&
    !(detail.Notes || "").trim() &&
    !(Number(detail.UnitPrice) > 0)
  );
}

/** Line types that can increase warehouse on-hand when received for stock (no job). */
export function isInventoryStockLineType(lineType?: string | null): boolean {
  const t = (lineType || "").trim();
  return t === "RawMaterial" || t === "FinishedProduct";
}
