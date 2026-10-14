import { useCallback, useMemo, useState } from "react";
import type { SortDirection } from "../Components/SortIndicator";
import { useLockedColumnWidths } from "./useLockedColumnWidths";

/** Nulls/empties last; numbers numerically; everything else case-insensitive with numeric awareness. */
export const compareSortValues = (a: unknown, b: unknown): number => {
  const aEmpty = a == null || a === "";
  const bEmpty = b == null || b === "";
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;
  if (bEmpty) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "boolean" && typeof b === "boolean") return Number(a) - Number(b);
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
};

/**
 * Client-side column sorting for ad-hoc tables. Attach `tableRef` to the <table> so column
 * widths stay put while the user re-sorts.
 */
export function useTableSort<T>(
  rows: T[],
  getValue: (row: T, key: string) => unknown,
  options: { initialKey?: string | null; initialDirection?: SortDirection; resetKey?: string } = {}
) {
  const [sortKey, setSortKey] = useState<string | null>(options.initialKey ?? null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(options.initialDirection ?? "asc");
  const { tableRef, lockColumnWidths } = useLockedColumnWidths(options.resetKey);

  const toggleSort = useCallback(
    (key: string) => {
      lockColumnWidths();
      if (sortKey === key) {
        setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      } else {
        setSortKey(key);
        setSortDirection("asc");
      }
    },
    [sortKey, lockColumnWidths]
  );

  const sortedRows = useMemo(() => {
    if (!sortKey) return rows;
    const factor = sortDirection === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const aValue = getValue(a, sortKey);
      const bValue = getValue(b, sortKey);
      const aEmpty = aValue == null || aValue === "";
      const bEmpty = bValue == null || bValue === "";
      if (aEmpty || bEmpty) return compareSortValues(aValue, bValue);
      return compareSortValues(aValue, bValue) * factor;
    });
  }, [rows, sortKey, sortDirection, getValue]);

  return { sortedRows, sortKey, sortDirection, toggleSort, tableRef };
}
