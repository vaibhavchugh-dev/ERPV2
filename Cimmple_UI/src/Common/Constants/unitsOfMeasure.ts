/**
 * Canonical units of measure for raw materials and inventory.
 * Stored values should match these codes when chosen from the list (case-insensitive match normalized to this casing).
 */
export const STANDARD_UOM_CODES: readonly string[] = [
  "EA",
  "LB",
  "KG",
  "G",
  "OZ",
  "TON",
  "FT",
  "IN",
  "M",
  "MM",
  "YD",
  "SQF",
  "SQI",
  "SQM",
  "GAL",
  "L",
  "ML",
  "PCS",
  "PKG",
  "ROLL",
  "LOT",
] as const;

export const CUSTOM_UOM_SELECT_VALUE = "__CUSTOM__";

/** Common raw-material stock forms used for reporting/grouping. */
export const STANDARD_STOCK_FORMS: readonly string[] = [
  "Sheet",
  "Plate",
  "Bar",
  "Angle",
  "Rod",
  "Tube",
  "Pipe",
  "Coil",
  "Wire",
  "Block",
  "Hex",
] as const;

/** Common grade families (teams can still enter custom values). */
export const STANDARD_MATERIAL_GRADES: readonly string[] = [
  "ASTM A36",
  "AISI 1018",
  "AISI 1045",
  "AISI 4140",
  "AISI 304",
  "AISI 316",
  "6061-T6",
  "7075-T6",
  "Brass C360",
  "Copper C110",
] as const;

export function canonicalUomCode(unit: string): string | null {
  const t = (unit || "").trim();
  if (!t) return null;
  const found = STANDARD_UOM_CODES.find(
    (c) => c.toUpperCase() === t.toUpperCase()
  );
  return found ?? null;
}

export function isCustomUom(unit: string): boolean {
  return canonicalUomCode(unit) === null;
}

export function normalizeUnitForSave(unit: string): string {
  const t = (unit || "").trim();
  if (!t) return "";
  const canon = canonicalUomCode(t);
  return canon ?? t;
}

export function picklistSelectValue(
  value: string,
  options: readonly string[]
): string {
  const t = (value || "").trim();
  if (!t) return "";
  const found = options.find((o) => o.toLowerCase() === t.toLowerCase());
  return found ?? CUSTOM_UOM_SELECT_VALUE;
}
