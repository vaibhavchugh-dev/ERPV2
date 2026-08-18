/** Display helper — does not alter stored job numbers. */
export function formatJobNumber(
  value: string | number | null | undefined
): string {
  if (value === null || value === undefined || value === "") {
    return "JO#—";
  }
  const raw = String(value).trim();
  const withoutPrefix = raw.replace(/^JO#/i, "").replace(/^#/, "").trim();
  return `JO#${withoutPrefix || "—"}`;
}
