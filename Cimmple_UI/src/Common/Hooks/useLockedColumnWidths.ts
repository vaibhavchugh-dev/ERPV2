import { useCallback, useEffect, useRef } from "react";

const headerCells = (table: HTMLTableElement) =>
  Array.from(table.querySelectorAll<HTMLTableCellElement>(":scope > thead > tr:first-child > th"));

/**
 * Freezes the current header widths (fixed table layout) so re-sorting rows does not make
 * columns jump. Widths are released when `resetKey` changes (e.g. visible columns) or on resize.
 */
export function useLockedColumnWidths(resetKey: string = "") {
  const tableRef = useRef<HTMLTableElement>(null);

  const unlockColumnWidths = useCallback(() => {
    const table = tableRef.current;
    if (!table || table.dataset.widthsLocked !== "true") return;
    headerCells(table).forEach((th) => {
      th.style.width = th.dataset.unlockedWidth || "";
      delete th.dataset.unlockedWidth;
    });
    table.style.tableLayout = "";
    delete table.dataset.widthsLocked;
  }, []);

  const lockColumnWidths = useCallback(() => {
    const table = tableRef.current;
    if (!table || table.dataset.widthsLocked === "true") return;
    const cells = headerCells(table);
    if (cells.length === 0) return;
    const widths = cells.map((th) => th.getBoundingClientRect().width);
    cells.forEach((th, index) => {
      th.dataset.unlockedWidth = th.style.width;
      th.style.width = `${widths[index]}px`;
    });
    table.style.tableLayout = "fixed";
    table.dataset.widthsLocked = "true";
  }, []);

  useEffect(() => {
    unlockColumnWidths();
  }, [resetKey, unlockColumnWidths]);

  useEffect(() => {
    window.addEventListener("resize", unlockColumnWidths);
    return () => window.removeEventListener("resize", unlockColumnWidths);
  }, [unlockColumnWidths]);

  return { tableRef, lockColumnWidths, unlockColumnWidths };
}
