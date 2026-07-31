export interface ParsedCsvRow {
  /** Line number in the source file, counting the header as line 1. */
  rowNumber: number;
  values: Record<string, string>;
}

/** Splits CSV text into rows, honouring quoted fields, escaped quotes, and CRLF line endings. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let current: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      current.push(field.trim());
      field = "";
    } else if (ch === "\n" || (ch === "\r" && next === "\n")) {
      current.push(field.trim());
      field = "";
      if (current.some((c) => c !== "")) rows.push(current);
      current = [];
      if (ch === "\r") i++;
    } else if (ch !== "\r") {
      field += ch;
    }
  }

  current.push(field.trim());
  if (current.some((c) => c !== "")) rows.push(current);
  return rows;
}

/**
 * Maps CSV rows onto canonical field names using an alias lookup keyed by the
 * lowercased header with whitespace removed. Throws when a required column is absent.
 */
export function mapCsvRows(
  csvRows: string[][],
  aliases: Record<string, string>,
  requiredKey: string
): ParsedCsvRow[] {
  if (csvRows.length < 2) return [];

  const headers = csvRows[0].map((h) => h.replace(/^\uFEFF/, "").trim());
  const mappedKeys = headers.map(
    (h) => aliases[h.toLowerCase().replace(/\s+/g, "")] || null
  );

  if (!mappedKeys.includes(requiredKey)) {
    throw new Error(`CSV must include a ${requiredKey} column`);
  }

  return csvRows.slice(1).map((cols, idx) => {
    const values: Record<string, string> = {};
    mappedKeys.forEach((key, colIdx) => {
      if (!key) return;
      values[key] = cols[colIdx] ?? "";
    });
    return { rowNumber: idx + 2, values };
  });
}

export function escapeCsvValue(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function buildCsv(headers: readonly string[], rows: string[][]): string {
  return [
    headers.join(","),
    ...rows.map((row) => row.map(escapeCsvValue).join(",")),
  ].join("\r\n");
}

export function downloadCsv(fileName: string, contents: string): void {
  const blob = new Blob([contents], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}
