import { useCallback, useState } from "react";

const PAGE_SIZE_STORAGE_KEY = "listPageSize";

export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

const readStoredPageSize = (): number | null => {
  try {
    const n = Number(localStorage.getItem(PAGE_SIZE_STORAGE_KEY));
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
};

/**
 * Rows-per-page for list footers. The user's choice is shared across list pages
 * (per browser); until they pick one, System Settings defaultPageSize applies.
 */
export function useListPageSize(defaultSize: number) {
  const [storedSize, setStoredSize] = useState<number | null>(readStoredPageSize);

  const setPageSize = useCallback((size: number) => {
    if (!Number.isFinite(size) || size <= 0) return;
    try {
      localStorage.setItem(PAGE_SIZE_STORAGE_KEY, String(size));
    } catch {
      // ignore storage failures; state still updates for this page
    }
    setStoredSize(size);
  }, []);

  return [storedSize ?? (defaultSize > 0 ? defaultSize : 10), setPageSize] as const;
}
