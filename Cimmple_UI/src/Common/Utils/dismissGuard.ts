import type React from "react";

export const UNSAVED_CHANGES_PROMPT = "You have unsaved changes. Are you sure you want to close?";

/** True when a slideout/modal may close: nothing unsaved, or the user confirmed discarding. */
export const confirmDiscardChanges = (isDirty: boolean): boolean =>
  !isDirty || window.confirm(UNSAVED_CHANGES_PROMPT);

/** Overlay click handler that ignores clicks bubbling up from the dialog content. */
export const onBackdropClick =
  (dismiss: () => void) =>
  (e: React.MouseEvent<HTMLElement>): void => {
    if (e.target === e.currentTarget) dismiss();
  };
