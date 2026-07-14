import React, { useState, useEffect } from "react";
import { toast } from "react-toastify";
import {
  DocumentService,
  Document,
  DocumentVersion,
} from "../../Common/Services/DocumentService";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faTimes,
  faDownload,
  faUpload,
  faHistory,
  faFile,
  faEdit,
  faTrash,
} from "@fortawesome/free-solid-svg-icons";
import "./DocumentDetailModal.scss";

interface DocumentDetailModalProps {
  document: Document;
  onClose: () => void;
}

const DocumentDetailModal: React.FC<DocumentDetailModalProps> = ({
  document,
  onClose,
}) => {
  const [versions, setVersions] = useState<DocumentVersion[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [showVersionUpload, setShowVersionUpload] = useState(false);
  const [versionNotes, setVersionNotes] = useState("");
  const [uploadingVersion, setUploadingVersion] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [editing, setEditing] = useState(false);
  const [documentName, setDocumentName] = useState(document.documentName);
  const [description, setDescription] = useState(document.description || "");
  const [categoryId, setCategoryId] = useState(document.categoryId);
  const [tags, setTags] = useState(document.tags || "");
  const [documentNumber, setDocumentNumber] = useState(document.documentNumber || "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (document.requiresVersionControl) {
      loadVersions();
    }
  }, [document.id]);

  const loadVersions = async () => {
    setLoadingVersions(true);
    try {
      const result = await DocumentService.GetVersions(document.id);
      setVersions(result);
    } catch (error: any) {
      console.error("Error loading versions:", error);
      toast.error(`Error loading versions: ${error.message || "Unknown error"}`);
    } finally {
      setLoadingVersions(false);
    }
  };

  const handleDownload = async (versionId?: number) => {
    try {
      const blob = await DocumentService.DownloadDocument(document.id, versionId);
      const url = window.URL.createObjectURL(blob);
      const a = window.document.createElement("a");
      a.href = url;
      const version = versionId
        ? versions.find((v) => v.id === versionId)
        : versions.find((v) => v.isCurrentVersion);
      a.download = version?.fileName || document.fileName || document.documentName;
      window.document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      window.document.body.removeChild(a);
      toast.success("Download started");
    } catch (error: any) {
      console.error("Error downloading:", error);
      toast.error(`Error downloading: ${error.message || "Unknown error"}`);
    }
  };

  const handleVersionUpload = async () => {
    if (!selectedFile) {
      toast.error("Please select a file");
      return;
    }

    setUploadingVersion(true);
    try {
      await DocumentService.UploadVersion(
        document.id,
        selectedFile,
        versionNotes || undefined
      );
      toast.success("Version uploaded successfully");
      setShowVersionUpload(false);
      setSelectedFile(null);
      setVersionNotes("");
      loadVersions();
      onClose(); // Refresh parent
    } catch (error: any) {
      console.error("Error uploading version:", error);
      toast.error(`Error uploading version: ${error.message || "Unknown error"}`);
    } finally {
      setUploadingVersion(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await DocumentService.UpdateDocument(
        document.id,
        documentName,
        description,
        categoryId,
        tags,
        documentNumber || undefined
      );
      toast.success("Document updated successfully");
      setEditing(false);
      onClose(); // Refresh parent
    } catch (error: any) {
      console.error("Error updating document:", error);
      toast.error(`Error updating document: ${error.message || "Unknown error"}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm("Are you sure you want to delete this document?")) {
      return;
    }

    try {
      await DocumentService.DeleteDocument(document.id);
      toast.success("Document deleted successfully");
      onClose();
    } catch (error: any) {
      console.error("Error deleting document:", error);
      toast.error(`Error deleting document: ${error.message || "Unknown error"}`);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="document-detail-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{document.documentName}</h3>
          <button className="btn-close" onClick={onClose}>
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>

        <div className="modal-content">
          <div className="document-info">
            <div className="info-section">
              {document.documentNumber && (
                <div className="info-row">
                  <label>Document Number:</label>
                  <span>
                    {document.documentNumber}
                    {document.isDocumentNumberAutoGenerated && (
                      <span className="auto-badge" title="Auto-generated">Auto</span>
                    )}
                  </span>
                </div>
              )}
              <div className="info-row">
                <label>File Name:</label>
                <span>{document.fileName || document.documentName}</span>
              </div>
              <div className="info-row">
                <label>Size:</label>
                <span>{DocumentService.formatFileSize(document.fileSize)}</span>
              </div>
              <div className="info-row">
                <label>Type:</label>
                <span>{document.mimeType || document.fileExtension || "Unknown"}</span>
              </div>
              <div className="info-row">
                <label>Category:</label>
                <span>{document.categoryName || "Uncategorized"}</span>
              </div>
              {document.requiresVersionControl && document.currentVersionNumber && (
                <div className="info-row">
                  <label>Current Version:</label>
                  <span className="version-badge">v{document.currentVersionNumber}</span>
                </div>
              )}
              <div className="info-row">
                <label>Created:</label>
                <span>{new Date(document.createdDate).toLocaleString()}</span>
              </div>
              {document.description && (
                <div className="info-row full-width">
                  <label>Description:</label>
                  <span>{document.description}</span>
                </div>
              )}
              {document.tags && (
                <div className="info-row full-width">
                  <label>Tags:</label>
                  <span>{document.tags}</span>
                </div>
              )}
            </div>

            <div className="action-buttons">
              <button className="btn btn-primary" onClick={() => handleDownload()}>
                <FontAwesomeIcon icon={faDownload} /> Download
              </button>
              {document.requiresVersionControl && (
                <button
                  className="btn btn-secondary"
                  onClick={() => setShowVersionUpload(true)}
                >
                  <FontAwesomeIcon icon={faUpload} /> Upload New Version
                </button>
              )}
              <button className="btn btn-secondary" onClick={() => setEditing(!editing)}>
                <FontAwesomeIcon icon={faEdit} /> Edit
              </button>
              <button className="btn btn-danger" onClick={handleDelete}>
                <FontAwesomeIcon icon={faTrash} /> Delete
              </button>
            </div>

            {editing && (
              <div className="edit-form">
                <div className="form-group">
                  <label>Document Name:</label>
                  <input
                    type="text"
                    value={documentName}
                    onChange={(e) => setDocumentName(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>Description:</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                  />
                </div>
                <div className="form-group">
                  <label>Tags:</label>
                  <input
                    type="text"
                    value={tags}
                    onChange={(e) => setTags(e.target.value)}
                    placeholder="Comma-separated tags"
                  />
                </div>
                <div className="form-actions">
                  <button
                    className="btn btn-secondary"
                    onClick={() => {
                      setEditing(false);
                      setDocumentName(document.documentName);
                      setDescription(document.description || "");
                      setTags(document.tags || "");
                      setDocumentNumber(document.documentNumber || "");
                    }}
                  >
                    Cancel
                  </button>
                  <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                    {saving ? "Saving..." : "Save"}
                  </button>
                </div>
              </div>
            )}
          </div>

          {document.requiresVersionControl && (
            <div className="versions-section">
              <h4>
                <FontAwesomeIcon icon={faHistory} /> Version History
              </h4>
              {loadingVersions ? (
                <div className="loading">Loading versions...</div>
              ) : versions.length === 0 ? (
                <div className="empty">No versions found</div>
              ) : (
                <div className="versions-list">
                  {versions.map((version) => (
                    <div
                      key={version.id}
                      className={`version-item ${version.isCurrentVersion ? "current" : ""}`}
                    >
                      <div className="version-header">
                        <span className="version-number">v{version.versionNumber}</span>
                        {version.isCurrentVersion && (
                          <span className="current-badge">Current</span>
                        )}
                        <span className="version-date">
                          {new Date(version.uploadedDate).toLocaleString()}
                        </span>
                      </div>
                      <div className="version-details">
                        <div className="version-file">
                          <FontAwesomeIcon icon={faFile} />
                          <span>{version.fileName}</span>
                          <span className="file-size">
                            {DocumentService.formatFileSize(version.fileSize)}
                          </span>
                        </div>
                        {version.versionNotes && (
                          <div className="version-notes">
                            <strong>Notes:</strong> {version.versionNotes}
                          </div>
                        )}
                        <button
                          className="btn-download-version"
                          onClick={() => handleDownload(version.id)}
                        >
                          <FontAwesomeIcon icon={faDownload} /> Download
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {showVersionUpload && (
            <div className="version-upload-overlay">
              <div className="version-upload-form">
                <h4>Upload New Version</h4>
                <div className="form-group">
                  <label>File:</label>
                  <input
                    type="file"
                    onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                  />
                  {selectedFile && (
                    <p className="file-info">
                      {selectedFile.name} ({DocumentService.formatFileSize(selectedFile.size)})
                    </p>
                  )}
                </div>
                <div className="form-group">
                  <label>Version Notes:</label>
                  <textarea
                    value={versionNotes}
                    onChange={(e) => setVersionNotes(e.target.value)}
                    rows={3}
                    placeholder="Describe changes in this version (optional)"
                  />
                </div>
                <div className="form-actions">
                  <button
                    className="btn btn-secondary"
                    onClick={() => {
                      setShowVersionUpload(false);
                      setSelectedFile(null);
                      setVersionNotes("");
                    }}
                    disabled={uploadingVersion}
                  >
                    Cancel
                  </button>
                  <button
                    className="btn btn-primary"
                    onClick={handleVersionUpload}
                    disabled={uploadingVersion || !selectedFile}
                  >
                    {uploadingVersion ? "Uploading..." : "Upload Version"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DocumentDetailModal;

