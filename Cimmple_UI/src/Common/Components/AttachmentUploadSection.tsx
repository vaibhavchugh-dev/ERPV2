import React, { useCallback, useMemo, useRef, useState } from "react";
import { toast } from "react-toastify";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCloudArrowUp,
  faDownload,
  faEye,
  faPaperclip,
  faPlus,
  faTrash,
} from "@fortawesome/free-solid-svg-icons";
import { DocumentViewerFile } from "./DocumentViewerWorkspace";
import {
  createPendingAttachments,
  DEFAULT_MAX_UPLOAD_BYTES,
  DEFAULT_UPLOAD_EXTENSIONS,
  formatFileSize,
  getApiErrorMessage,
  getFileExtension,
  triggerBrowserDownload,
  validateSelectedFiles,
} from "../Services/FileUploadHelper";
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
  onViewAttachment?: (
    attachment: ModuleAttachment,
    index: number,
    documents: DocumentViewerFile[]
  ) => void;
};

const AttachmentUploadSection: React.FC<Props> = ({
  attachments,
  orderId,
  disabled = false,
  deferUploadUntilSave = false,
  maxFileSizeBytes = DEFAULT_MAX_UPLOAD_BYTES,
  acceptedExtensions = DEFAULT_UPLOAD_EXTENSIONS,
  onAttachmentsChange,
  onUploadFiles,
  onDeleteAttachment,
  onDownloadAttachment,
  onViewAttachment,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [busyAttachmentId, setBusyAttachmentId] = useState<number | null>(null);

  const acceptAttr = useMemo(
    () => acceptedExtensions.map((ext) => `.${ext}`).join(","),
    [acceptedExtensions]
  );

  const showValidationErrors = useCallback((errors: string[]) => {
    if (errors.length === 0) return;
    const preview = errors.slice(0, 3).join(" ");
    const suffix = errors.length > 3 ? ` (+${errors.length - 3} more)` : "";
    toast.error(`${preview}${suffix}`);
  }, []);

  const handleIncomingFiles = async (fileList: FileList | File[] | null) => {
    if (!fileList || disabled) return;

    const { valid, errors } = validateSelectedFiles(Array.from(fileList), {
      acceptedExtensions,
      maxFileSizeBytes,
      existing: attachments.map((a) => ({ name: a.name, size: a.size })),
    });
    showValidationErrors(errors);
    if (valid.length === 0) return;

    if (orderId > 0 && !deferUploadUntilSave && onUploadFiles) {
      setUploading(true);
      setUploadProgress(0);
      try {
        await onUploadFiles(valid);
        setUploadProgress(100);
      } catch (error: unknown) {
        toast.error(getApiErrorMessage(error, "Failed to upload attachment(s)"));
      } finally {
        setUploading(false);
        window.setTimeout(() => setUploadProgress(null), 400);
      }
      return;
    }

    const pending = createPendingAttachments(valid) as ModuleAttachment[];
    onAttachmentsChange([...attachments, ...pending]);
  };

  const buildViewerDocuments = (): DocumentViewerFile[] => {
    return attachments.map((attachment) => ({
      id: attachment.id,
      name: attachment.name,
      size: attachment.size,
      contentType: attachment.contentType,
      fileUniqueno: attachment.fileUniqueno,
      isPending: !!attachment.isPending,
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
    if (!window.confirm(`Delete attachment "${attachment.name}"?`)) {
      return;
    }

    setBusyAttachmentId(attachment.id);
    try {
      if (attachment.isPending || !attachment.fileUniqueno) {
        if (attachment.localUrl) {
          URL.revokeObjectURL(attachment.localUrl);
        }
        onAttachmentsChange(attachments.filter((a) => a.id !== attachment.id));
        return;
      }

      await onDeleteAttachment(attachment);
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, "Failed to delete attachment"));
    } finally {
      setBusyAttachmentId(null);
    }
  };

  const handleDownload = async (attachment: ModuleAttachment) => {
    setBusyAttachmentId(attachment.id);
    try {
      if (attachment.isPending && attachment.localUrl) {
        triggerBrowserDownload(attachment.localUrl, attachment.name);
        return;
      }

      await onDownloadAttachment(attachment);
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, "Failed to download attachment"));
    } finally {
      setBusyAttachmentId(null);
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
  const canDownload = (attachment: ModuleAttachment) =>
    attachment.isPending || orderId > 0 || !!attachment.fileUniqueno;

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
        <h3>
          <FontAwesomeIcon icon={faPaperclip} className="attachment-upload-section__header-icon" />
          Attachments
        </h3>
      </div>

      {uploading && uploadProgress != null && (
        <div className="attachment-upload-section__progress" role="status" aria-live="polite">
          <div
            className="attachment-upload-section__progress-bar"
            style={{ width: `${uploadProgress}%` }}
          />
          <span>Uploading… {uploadProgress}%</span>
        </div>
      )}

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
            <FontAwesomeIcon icon={faCloudArrowUp} />
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
            {attachments.map((attachment, index) => {
              const isBusy = busyAttachmentId === attachment.id;
              return (
                <div
                  key={`${attachment.id}-${attachment.fileUniqueno || "pending"}`}
                  className="attachment-upload-section__item"
                >
                  <div className="attachment-upload-section__item-main">
                    <span className="attachment-upload-section__badge">
                      {getFileExtension(attachment.name).toUpperCase() || "FILE"}
                    </span>
                    <div className="attachment-upload-section__meta">
                      <div className="attachment-upload-section__name" title={attachment.name}>
                        {attachment.name}
                        {attachment.isPending && (
                          <span className="pending-tag">Pending save</span>
                        )}
                      </div>
                      <div className="attachment-upload-section__size">
                        {formatFileSize(attachment.size)}
                      </div>
                    </div>
                  </div>

                  <div className="attachment-upload-section__item-actions">
                    {onViewAttachment && (
                      <button
                        type="button"
                        className="attachment-upload-section__action-btn"
                        title="View"
                        aria-label={`View ${attachment.name}`}
                        disabled={isBusy}
                        onClick={() => openViewer(index)}
                      >
                        <FontAwesomeIcon icon={faEye} />
                      </button>
                    )}
                    {canDownload(attachment) && (
                      <button
                        type="button"
                        className="attachment-upload-section__action-btn"
                        title="Download"
                        aria-label={`Download ${attachment.name}`}
                        disabled={isBusy}
                        onClick={() => void handleDownload(attachment)}
                      >
                        <FontAwesomeIcon icon={faDownload} />
                      </button>
                    )}
                    <button
                      type="button"
                      className="attachment-upload-section__action-btn attachment-upload-section__action-btn--danger"
                      title="Delete"
                      aria-label={`Delete ${attachment.name}`}
                      disabled={isBusy || disabled}
                      onClick={() => void handleDelete(attachment)}
                    >
                      <FontAwesomeIcon icon={faTrash} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="attachment-upload-section__footer">
            <button
              type="button"
              className="add-btn"
              disabled={disabled || uploading}
              onClick={openFilePicker}
            >
              <FontAwesomeIcon icon={faPlus} />
              Add Attachment
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default AttachmentUploadSection;
