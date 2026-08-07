import React, { useCallback, useMemo, useRef, useState } from "react";
import { toast } from "react-toastify";
import { DocumentViewerFile } from "./DocumentViewerWorkspace";
import "./AttachmentUploadSection.scss";

export type ModuleAttachment = {
  id: number;
  name: string;
  size: number;
  fileUrl?: string;
  fileUniqueno?: number;
  uploadFile?: string;
  pageNo?: string;
  createdBy?: number;
  isPending?: boolean;
  localUrl?: string;
  file?: File;
  fileCode?: string;
  contentType?: string;
};

type Props = {
  attachments: ModuleAttachment[];
  orderId: number;
  disabled?: boolean;
  deferUploadUntilSave?: boolean;
  maxFileSizeBytes?: number;
  acceptedExtensions?: string[];
  onAttachmentsChange: (attachments: ModuleAttachment[]) => void;
  onUploadFiles?: (files: File[]) => Promise<void>;
  onDeleteAttachment: (attachment: ModuleAttachment) => Promise<void>;
  onDownloadAttachment: (attachment: ModuleAttachment) => Promise<void>;
  /**
   * Opens the parent-owned document workspace with metadata only.
   * Parent is responsible for lazy-loading/caching document bytes.
   */
  onViewAttachment?: (
    attachment: ModuleAttachment,
    index: number,
    documents: DocumentViewerFile[]
  ) => void;
};

const DEFAULT_EXTENSIONS = [
  "pdf", "doc", "docx", "xls", "xlsx", "csv", "txt", "rtf",
  "ppt", "pptx", "jpg", "jpeg", "png", "gif", "webp", "bmp", "tif", "msg", "eml"
];

const formatSize = (size: number) => {
  if (!size || size <= 0) return "0 KB";
  return `${(size / 1024).toFixed(2)} KB`;
};

const getExtension = (name: string) => {
  const parts = name.split(".");
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : "";
};

const AttachmentUploadSection: React.FC<Props> = ({
  attachments,
  orderId,
  disabled = false,
  deferUploadUntilSave = false,
  maxFileSizeBytes = 5 * 1024 * 1024,
  acceptedExtensions = DEFAULT_EXTENSIONS,
  onAttachmentsChange,
  onUploadFiles,
  onDeleteAttachment,
  onDownloadAttachment,
  onViewAttachment,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [menuOpenId, setMenuOpenId] = useState<number | null>(null);

  const acceptAttr = useMemo(
    () => acceptedExtensions.map((ext) => `.${ext}`).join(","),
    [acceptedExtensions]
  );

  const validateFiles = useCallback(
    (files: File[]) => {
      const valid: File[] = [];
      for (const file of files) {
        const ext = getExtension(file.name);
        if (!acceptedExtensions.includes(ext)) {
          toast.error(`File type .${ext || "unknown"} is not supported: ${file.name}`);
          continue;
        }
        if (file.size > maxFileSizeBytes) {
          toast.error(`File exceeds ${(maxFileSizeBytes / (1024 * 1024)).toFixed(0)} MB limit: ${file.name}`);
          continue;
        }
        valid.push(file);
      }
      return valid;
    },
    [acceptedExtensions, maxFileSizeBytes]
  );

  const handleIncomingFiles = async (fileList: FileList | File[] | null) => {
    if (!fileList || disabled) return;
    const files = validateFiles(Array.from(fileList));
    if (files.length === 0) return;

    if (orderId > 0 && !deferUploadUntilSave && onUploadFiles) {
      setUploading(true);
      try {
        await onUploadFiles(files);
      } catch (error: any) {
        toast.error(error?.message || "Failed to upload attachment(s)");
      } finally {
        setUploading(false);
      }
      return;
    }

    // Keep files locally until save when deferred by the consuming module.
    const pending = files.map((file, idx) => {
      const localUrl = URL.createObjectURL(file);
      return {
        id: Date.now() + idx,
        name: file.name,
        size: file.size,
        isPending: true,
        localUrl,
        file,
        contentType: file.type,
      } as ModuleAttachment;
    });
    onAttachmentsChange([...attachments, ...pending]);
  };

  /** Metadata-only document list. Bytes are loaded lazily by the parent viewer/cache. */
  const buildViewerDocuments = (): DocumentViewerFile[] => {
    return attachments.map((attachment) => ({
      id: attachment.id,
      name: attachment.name,
      size: attachment.size,
      contentType: attachment.contentType,
      fileUniqueno: attachment.fileUniqueno,
      isPending: !!attachment.isPending,
      // Pending unsaved files already have a local object URL.
      localUrl: attachment.isPending ? attachment.localUrl : undefined,
    }));
  };

  const openViewer = (startIndex = 0) => {
    if (attachments.length === 0) {
      toast.info("No attachments to preview");
      return;
    }

    if (!onViewAttachment) {
      toast.info("Document viewer is not available");
      return;
    }

    const documents = buildViewerDocuments();
    if (documents.length === 0) {
      toast.info("Unable to open viewer");
      return;
    }

    const target = attachments[Math.min(startIndex, attachments.length - 1)];
    onViewAttachment(target, Math.min(startIndex, documents.length - 1), documents);
  };

  const handleDelete = async (attachment: ModuleAttachment) => {
    setMenuOpenId(null);

    if (attachment.isPending || !attachment.fileUniqueno) {
      if (attachment.localUrl) {
        URL.revokeObjectURL(attachment.localUrl);
      }
      onAttachmentsChange(attachments.filter((a) => a.id !== attachment.id));
      return;
    }

    try {
      await onDeleteAttachment(attachment);
    } catch (error: any) {
      toast.error(error?.message || "Failed to delete attachment");
    }
  };

  const handleDownload = async (attachment: ModuleAttachment) => {
    setMenuOpenId(null);
    if (attachment.isPending && attachment.localUrl) {
      const link = document.createElement("a");
      link.href = attachment.localUrl;
      link.download = attachment.name;
      link.click();
      return;
    }

    try {
      await onDownloadAttachment(attachment);
    } catch (error: any) {
      toast.error(error?.message || "Failed to download attachment");
    }
  };

  const openFilePicker = () => {
    if (!disabled && !uploading) {
      inputRef.current?.click();
    }
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) setDragActive(true);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) setDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    handleIncomingFiles(e.dataTransfer.files);
  };

  const hasAttachments = attachments.length > 0;
  const maxSizeMb = (maxFileSizeBytes / (1024 * 1024)).toFixed(0);

  return (
    <div className="attachment-upload-section">
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={acceptAttr}
        className="attachment-upload-section__file-input"
        disabled={disabled || uploading}
        onChange={(e) => {
          handleIncomingFiles(e.target.files);
          e.target.value = "";
        }}
      />

      <div className="attachment-upload-section__header">
        <h3>Attachments</h3>
        {/* {hasAttachments && onViewAttachment && (
          <button
            type="button"
            className="attachment-upload-section__viewer-btn"
            onClick={() => openViewer(0)}
          >
            Open Viewer
          </button>
        )} */}
      </div>

      {!hasAttachments ? (
        <div
          className={`attachment-upload-section__dropzone attachment-upload-section__dropzone--empty ${dragActive ? "is-active" : ""} ${disabled ? "is-disabled" : ""} ${uploading ? "is-uploading" : ""}`}
          role="button"
          tabIndex={disabled ? -1 : 0}
          aria-label="Upload attachments"
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={openFilePicker}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              openFilePicker();
            }
          }}
        >
          <div className="attachment-upload-section__dropzone-icon" aria-hidden>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M12 16V4m0 0l-4 4m4-4l4 4" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M4 17v1a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-1" strokeLinecap="round" />
            </svg>
          </div>
          <div className="attachment-upload-section__dropzone-text">
            {uploading ? (
              "Uploading…"
            ) : (
              <>
                <span className="attachment-upload-section__dropzone-primary">
                  Drag and drop files here
                </span>
                <span className="attachment-upload-section__dropzone-secondary">
                  or <span className="attachment-upload-section__browse-link">browse</span> to upload
                </span>
              </>
            )}
          </div>
          <div className="attachment-upload-section__dropzone-hint">
            PDF, Word, Excel, and common documents · Max {maxSizeMb} MB
          </div>
        </div>
      ) : (
        <>
          <div className="attachment-upload-section__list">
            {attachments.map((attachment, index) => (
              <div key={`${attachment.id}-${attachment.fileUniqueno || "pending"}`} className="attachment-upload-section__item">
                <div className="attachment-upload-section__item-main">
                  <span className="attachment-upload-section__badge">
                    {getExtension(attachment.name).toUpperCase() || "FILE"}
                  </span>
                  <div className="attachment-upload-section__meta">
                    <div className="attachment-upload-section__name" title={attachment.name}>
                      {attachment.name}
                      {attachment.isPending && <span className="pending-tag">Pending save</span>}
                    </div>
                    <div className="attachment-upload-section__size">{formatSize(attachment.size)}</div>
                  </div>
                </div>

                <div className="attachment-upload-section__item-actions">
                  <button
                    type="button"
                    className="attachment-action-btn attachment-action-btn--view"
                    title="View document"
                    onClick={() => openViewer(index)}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  </button>
                  {(orderId > 0 || attachment.isPending) && (
                    <button
                      type="button"
                      className="attachment-action-btn attachment-action-btn--download"
                      title="Download"
                      onClick={() => handleDownload(attachment)}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                    </button>
                  )}
                  <button
                    type="button"
                    className="attachment-action-btn attachment-action-btn--delete"
                    title="Delete attachment"
                    onClick={() => handleDelete(attachment)}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      <line x1="10" y1="11" x2="10" y2="17" />
                      <line x1="14" y1="11" x2="14" y2="17" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="attachment-upload-section__footer">
            <button
              type="button"
              className="add-btn"
              disabled={disabled || uploading}
              onClick={openFilePicker}
            >
              + Add Attachment
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default AttachmentUploadSection;
