import React, { useState, useRef } from "react";
import { toast } from "react-toastify";
import { DocumentService, DocumentCategory } from "../../Common/Services/DocumentService";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTimes, faUpload, faFile, faPlus } from "@fortawesome/free-solid-svg-icons";
import "./DocumentUploadModal.scss";

interface DocumentUploadModalProps {
  categories: DocumentCategory[];
  onClose: () => void;
  onSuccess: () => void;
  onCategoryCreated: () => void;
  relatedEntityType?: string;
  relatedEntityId?: number;
}

const DocumentUploadModal: React.FC<DocumentUploadModalProps> = ({
  categories,
  onClose,
  onSuccess,
  onCategoryCreated,
  relatedEntityType,
  relatedEntityId,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [documentName, setDocumentName] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState<number | undefined>(undefined);
  const [requiresVersionControl, setRequiresVersionControl] = useState(false);
  const [tags, setTags] = useState("");
  const [documentNumber, setDocumentNumber] = useState("");
  const [useCustomNumber, setUseCustomNumber] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryDescription, setNewCategoryDescription] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFileSelect = (selectedFile: File) => {
    if (selectedFile.size > 50 * 1024 * 1024) {
      toast.error("File size exceeds 50MB limit");
      return;
    }
    setFile(selectedFile);
    if (!documentName) {
      setDocumentName(selectedFile.name);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      handleFileSelect(droppedFile);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      handleFileSelect(selectedFile);
    }
  };

  const handleCreateCategory = async () => {
    if (!newCategoryName.trim()) {
      toast.error("Category name is required");
      return;
    }

    try {
      await DocumentService.CreateCategory(newCategoryName, newCategoryDescription || undefined);
      toast.success("Category created successfully");
      setShowNewCategory(false);
      setNewCategoryName("");
      setNewCategoryDescription("");
      onCategoryCreated();
    } catch (error: any) {
      console.error("Error creating category:", error);
      toast.error(`Error creating category: ${error.message || "Unknown error"}`);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!file) {
      toast.error("Please select a file");
      return;
    }

    if (!documentName.trim()) {
      toast.error("Document name is required");
      return;
    }

    setLoading(true);
    try {
      await DocumentService.UploadDocument(
        file,
        documentName,
        description || undefined,
        categoryId,
        requiresVersionControl,
        tags || undefined,
        relatedEntityType,
        relatedEntityId,
        useCustomNumber && documentNumber ? documentNumber : undefined
      );
      onSuccess();
    } catch (error: any) {
      console.error("Error uploading document:", error);
      toast.error(`Error uploading document: ${error.message || "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="document-upload-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Upload Document</h3>
          <button className="btn-close" onClick={onClose}>
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="upload-form">
          <div
            ref={dropZoneRef}
            className={`drop-zone ${isDragging ? "dragging" : ""} ${file ? "has-file" : ""}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              onChange={handleFileInputChange}
              style={{ display: "none" }}
            />
            {file ? (
              <div className="file-selected">
                <FontAwesomeIcon icon={faFile} size="2x" />
                <p>{file.name}</p>
                <p className="file-size">{DocumentService.formatFileSize(file.size)}</p>
                <button
                  type="button"
                  className="btn-change-file"
                  onClick={(e) => {
                    e.stopPropagation();
                    setFile(null);
                    if (fileInputRef.current) {
                      fileInputRef.current.value = "";
                    }
                  }}
                >
                  Change File
                </button>
              </div>
            ) : (
              <div className="drop-zone-content">
                <FontAwesomeIcon icon={faUpload} size="3x" />
                <p>Drag and drop a file here, or click to select</p>
                <p className="hint">Maximum file size: 50MB</p>
              </div>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="documentName">Document Name *</label>
            <input
              id="documentName"
              type="text"
              value={documentName}
              onChange={(e) => setDocumentName(e.target.value)}
              required
              placeholder="Enter document name"
            />
          </div>

          <div className="form-group">
            <label>
              <input
                type="checkbox"
                checked={useCustomNumber}
                onChange={(e) => setUseCustomNumber(e.target.checked)}
              />
              <span>Use custom document number</span>
            </label>
            {useCustomNumber && (
              <>
                <input
                  type="text"
                  value={documentNumber}
                  onChange={(e) => setDocumentNumber(e.target.value)}
                  placeholder="e.g., INV-2024-001, CONTRACT-ABC-123"
                  maxLength={50}
                  style={{ marginTop: "8px" }}
                />
                <p className="hint" style={{ marginTop: "4px", fontSize: "0.875rem", color: "#666" }}>
                  Enter your document number. Leave blank to auto-generate.
                </p>
              </>
            )}
            {!useCustomNumber && (
              <p className="hint" style={{ marginTop: "4px", fontSize: "0.875rem", color: "#666" }}>
                Document number will be auto-generated (e.g., DOC-2024-0001)
              </p>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="description">Description</label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Enter description (optional)"
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="category">Category</label>
              <div className="category-select">
                <select
                  id="category"
                  value={categoryId || ""}
                  onChange={(e) => setCategoryId(e.target.value ? parseInt(e.target.value) : undefined)}
                >
                  <option value="">Select category</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.categoryName}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn-add-category"
                  onClick={() => setShowNewCategory(!showNewCategory)}
                  title="Create new category"
                >
                  <FontAwesomeIcon icon={faPlus} />
                </button>
              </div>
              {showNewCategory && (
                <div className="new-category-form">
                  <input
                    type="text"
                    placeholder="Category name"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                  />
                  <input
                    type="text"
                    placeholder="Description (optional)"
                    value={newCategoryDescription}
                    onChange={(e) => setNewCategoryDescription(e.target.value)}
                  />
                  <div className="category-actions">
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={handleCreateCategory}
                    >
                      Create
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => {
                        setShowNewCategory(false);
                        setNewCategoryName("");
                        setNewCategoryDescription("");
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="tags">Tags</label>
              <input
                id="tags"
                type="text"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="Comma-separated tags"
              />
            </div>
          </div>

          <div className="form-group checkbox-group">
            <label>
              <input
                type="checkbox"
                checked={requiresVersionControl}
                onChange={(e) => setRequiresVersionControl(e.target.checked)}
              />
              <span>Enable version control</span>
            </label>
            <p className="hint">
              When enabled, you can upload multiple versions of this document. Each version will be tracked.
            </p>
          </div>

          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading || !file}>
              {loading ? "Uploading..." : "Upload"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default DocumentUploadModal;

