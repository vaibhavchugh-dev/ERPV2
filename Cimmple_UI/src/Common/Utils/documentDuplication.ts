export interface DuplicateResult {
  id: number;
  message: string;
  jobLinksRemoved: number;
  attachmentsCopied: number;
  attachmentsTotal: number;
}

export const toDuplicateResult = (result: any, fallbackMessage: string): DuplicateResult => ({
  id: Number(result?.id) || 0,
  message: result?.message || fallbackMessage,
  jobLinksRemoved: Number(result?.jobLinksRemoved) || 0,
  attachmentsCopied: Number(result?.attachmentsCopied) || 0,
  attachmentsTotal: Number(result?.attachmentsTotal) || 0,
});

/** Notes to show alongside the success toast; empty when nothing needs the user's attention. */
export const duplicateResultNotes = (result: DuplicateResult): string[] => {
  const notes: string[] = [];
  if (result.jobLinksRemoved > 0) {
    notes.push(
      `${result.jobLinksRemoved} job link${result.jobLinksRemoved === 1 ? " was" : "s were"} removed from the copied lines.`
    );
  }
  const missing = result.attachmentsTotal - result.attachmentsCopied;
  if (missing > 0) {
    notes.push(`${missing} attachment${missing === 1 ? "" : "s"} could not be copied.`);
  }
  return notes;
};
