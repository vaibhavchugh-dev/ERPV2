import { useCallback, useState } from "react";

const PAGE_SIZE_STORAGE_KEY = "listPageSizePref";
/** Pre-fix key: a bare number that overrode System Settings forever. */
const LEGACY_PAGE_SIZE_STORAGE_KEY = "listPageSize";

export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

type StoredPageSize = { size: number; settingsDefault: number };

const readStoredPageSize = (): StoredPageSize | null => {
  try {
    localStorage.removeItem(LEGACY_PAGE_SIZE_STORAGE_KEY);
    const parsed = JSON.parse(localStorage.getItem(PAGE_SIZE_STORAGE_KEY) || "null");
    const size = Number(parsed?.size);
    const settingsDefault = Number(parsed?.settingsDefault);
    if (!Number.isFinite(size) || size <= 0 || !Number.isFinite(settingsDefault)) return null;
    return { size, settingsDefault };
  } catch {
    return null;
  }
};

/**
 * Rows-per-page for list footers. System Settings defaultPageSize applies until the user picks a
 * size in a footer; that choice is shared across list pages (per browser) and is dropped as soon
 * as an admin changes the System Settings default, so the new default takes effect everywhere.
 */
export function useListPageSize(defaultSize: number) {
  const effectiveDefault = defaultSize > 0 ? defaultSize : 10;
  const [stored, setStored] = useState<StoredPageSize | null>(readStoredPageSize);

  const setPageSize = useCallback(
    (size: number) => {
      if (!Number.isFinite(size) || size <= 0) return;
      const next = { size, settingsDefault: effectiveDefault };
      try {
        localStorage.setItem(PAGE_SIZE_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore storage failures; state still updates for this page
      }
      setStored(next);
    },
    [effectiveDefault]
  );

  const userSize = stored && stored.settingsDefault === effectiveDefault ? stored.size : null;
  return [userSize ?? effectiveDefault, setPageSize] as const;
}
