import { useEffect, useMemo, useRef, useState } from "react";

export interface ColumnDefinition {
  key: string;
  label: string;
  sortKey?: string;
  /** Columns the user cannot hide, so a row is never blank. */
  locked?: boolean;
}

/**
 * Persist which listing columns are hidden (keys only) in localStorage.
 * Locked columns always stay visible.
 */
export function useColumnChooser<T extends ColumnDefinition>(
  preferenceKey: string,
  columns: T[],
  defaultHiddenColumns: string[] = []
) {
  const [hiddenColumns, setHiddenColumns] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem(preferenceKey);
      return stored ? JSON.parse(stored) : defaultHiddenColumns;
    } catch {
      return defaultHiddenColumns;
    }
  });
  const [showColumnChooser, setShowColumnChooser] = useState(false);
  const columnChooserRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showColumnChooser) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        columnChooserRef.current &&
        !columnChooserRef.current.contains(event.target as Node)
      ) {
        setShowColumnChooser(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showColumnChooser]);

  const toggleColumn = (key: string) => {
    setHiddenColumns((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
      try {
        localStorage.setItem(preferenceKey, JSON.stringify(next));
      } catch {
        // Preference persistence is best-effort
      }
      return next;
    });
  };

  const visibleColumns = useMemo(
    () => columns.filter((c) => c.locked || !hiddenColumns.includes(c.key)),
    [columns, hiddenColumns]
  );

  return {
    hiddenColumns,
    visibleColumns,
    showColumnChooser,
    setShowColumnChooser,
    columnChooserRef,
    toggleColumn,
  };
}
