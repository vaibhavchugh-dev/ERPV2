/**
 * Lightweight alias for modules that still import AttachmentFileViewer.
 * Prefer DocumentViewerWorkspace for the enterprise React PDF experience.
 */
export type { DocumentViewerFile as AttachmentViewerFile } from "./DocumentViewerWorkspace";
export { default } from "./DocumentViewerWorkspace";
