import { useEffect, useMemo, useState } from "react";
import { useSettingsSafe } from "../Contexts/SettingsContext";

/**
 * Client-side pagination for custom master tables (Customer/Vendor/Employee, etc.).
 * Page size follows System Settings defaultPageSize.
 */
export function useClientPagination<T>(items: T[], resetDeps: unknown[] = []) {
  const settings = useSettingsSafe();
  const pageSize = settings?.defaultPageSize || 10;
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    setCurrentPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageSize, ...resetDeps]);

  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, total);
  const pageItems = useMemo(
    () => items.slice(startIndex, endIndex),
    [items, startIndex, endIndex]
  );

  return {
    pageItems,
    currentPage: safePage,
    setCurrentPage,
    totalPages,
    startIndex,
    endIndex,
    pageSize,
    total,
    showControls: total > pageSize,
  };
}
