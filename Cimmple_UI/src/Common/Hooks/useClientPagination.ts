import { useEffect, useMemo, useState } from "react";
import { useSettingsSafe } from "../Contexts/SettingsContext";
import { PAGE_SIZE_OPTIONS, useListPageSize } from "./useListPageSize";

/**
 * Client-side pagination for custom master tables (Customer/Vendor/Employee, etc.).
 * Page size defaults to System Settings defaultPageSize; users can change it in the footer.
 */
export function useClientPagination<T>(items: T[], resetDeps: unknown[] = []) {
  const settings = useSettingsSafe();
  const [pageSize, setPageSize] = useListPageSize(settings?.defaultPageSize || 10);
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
    setPageSize,
    total,
    // Keep the footer visible after enlarging the page size so users can shrink it again.
    showControls: total > Math.min(pageSize, PAGE_SIZE_OPTIONS[0]),
  };
}
