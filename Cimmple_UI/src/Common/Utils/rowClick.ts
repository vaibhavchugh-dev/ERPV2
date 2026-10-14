import type { MouseEvent } from "react";

/** Clicks starting on these elements belong to the control, not the row. */
const INTERACTIVE_SELECTOR = "button, a, input, select, textarea, label, [role='button']";

/**
 * Wraps a table-row click handler so clicks on buttons, links, checkboxes etc. inside
 * the row don't also open the record.
 */
export function rowClickHandler(onOpen: () => void) {
  return (e: MouseEvent<HTMLElement>) => {
    if ((e.target as HTMLElement).closest(INTERACTIVE_SELECTOR)) return;
    onOpen();
  };
}
