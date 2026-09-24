import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import { toast } from "react-toastify";
import { DocumentService, Document, DocumentCategory } from "../../Common/Services/DocumentService";
import { useSiteListFilter } from "../../Common/Hooks/useSiteListFilter";
import DocumentViewerWorkspace, { DocumentViewerFile } from "../../Common/Components/DocumentViewerWorkspace";
import DocumentUploadModal from "./DocumentUploadModal";
import DocumentDetailModal from "./DocumentDetailModal";
import "./Documents.scss";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faUpload,
  faSearch,
  faFilter,
  faFile,
  faDownload,
  faTrash,
  faEye,
  faHistory,
  faTags,
} from "@fortawesome/free-solid-svg-icons";

const parseTags = (tags?: string): string[] =>
  (tags || "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

const Documents: React.FC = () => {
  const location = useLocation();
  const { locationIdParam, masterListFilter } = useSiteListFilter();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [categories, setCategories] = useState<DocumentCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | undefined>(undefined);
  const [selectedTag, setSelectedTag] = useState("");
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [viewMode, setViewMode] = useState<"grid" | "list">("list");

  const [documentViewerOpen, setDocumentViewerOpen] = useState(false);
  const [viewerDocuments, setViewerDocuments] = useState<DocumentViewerFile[]>([]);
  const [activeViewerIndex, setActiveViewerIndex] = useState(0);
  const viewerUrlRef = useRef<string | null>(null);

  useEffect(() => {
    const trimmed = searchTerm.trim();
    const delay = trimmed === "" ? 0 : 300;
    const timer = window.setTimeout(() => {
      setDebouncedSearch(trimmed);
      setPage(1);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    loadCategories();
    loadDocuments();
  }, [page, selectedCategoryId, debouncedSearch, locationIdParam]);

  // Handle URL parameter to open document detail modal
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const documentId = params.get("open");
    if (documentId) {
      const id = parseInt(documentId, 10);
      if (!isNaN(id)) {
        handleDocumentClickById(id);
      }
    }
  }, [location.search]);

  const handleDocumentClickById = async (id: number) => {
    try {
      const document = await DocumentService.GetDocument(id);
      setSelectedDocument(document);
      setShowDetailModal(true);
    } catch (error: any) {
      console.error("Error loading document:", error);
      toast.error("Document not found");
    }
  };

  const loadCategories = async () => {
    try {
      const result = await DocumentService.GetCategories();
      setCategories(result);
    } catch (error: any) {
      console.error("Error loading categories:", error);
    }
  };

  const loadDocuments = async () => {
    setLoading(true);
    try {
      const result = await DocumentService.GetDocuments(
        selectedCategoryId,
        undefined,
        undefined,
        debouncedSearch || undefined,
        page,
        pageSize,
        locationIdParam
      );
      setDocuments(result.documents);
      setTotalCount(result.totalCount);
      setTotalPages(result.totalPages);
    } catch (error: any) {
      console.error("Error loading documents:", error);
      toast.error(`Error loading documents: ${error.message || "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  };

  const handleUploadSuccess = () => {
    setShowUploadModal(false);
    loadDocuments();
    toast.success("Document uploaded successfully");
  };

  const handleDocumentClick = (document: Document) => {
    setSelectedDocument(document);
    setShowDetailModal(true);
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm("Are you sure you want to delete this document?")) {
      return;
    }

    try {
      await DocumentService.DeleteDocument(id);
      toast.success("Document deleted successfully");
      loadDocuments();
    } catch (error: any) {
      console.error("Error deleting document:", error);
      toast.error(`Error deleting document: ${error.message || "Unknown error"}`);
    }
  };

  const handleDownload = async (document: Document, versionId?: number) => {
    const toastId = toast.info("Downloading document...", { autoClose: false });
    try {
      const blob = await DocumentService.DownloadDocument(document.id, versionId);
      const url = window.URL.createObjectURL(blob);
      const a = window.document.createElement("a");
      a.href = url;
      a.download = document.fileName || document.documentName;
      window.document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      window.document.body.removeChild(a);
      toast.dismiss(toastId);
      toast.success("Download started");
    } catch (error: any) {
      console.error("Error downloading document:", error);
      toast.dismiss(toastId);
      toast.error(`Error downloading document: ${error.message || "Unknown error"}`);
    }
  };

  const revokeViewerUrl = () => {
    if (viewerUrlRef.current) {
      URL.revokeObjectURL(viewerUrlRef.current);
      viewerUrlRef.current = null;
    }
  };

  const closeDocumentViewer = useCallback(() => {
    setDocumentViewerOpen(false);
    setViewerDocuments([]);
    setActiveViewerIndex(0);
    revokeViewerUrl();
  }, []);

  const handlePreview = async (doc: Document, versionId?: number) => {
    try {
      revokeViewerUrl();
      const versionName =
        versionId != null
          ? undefined
          : doc.fileName || doc.documentName;
      setViewerDocuments([
        {
          id: doc.id,
          name: versionName || doc.fileName || doc.documentName,
          contentType: doc.mimeType,
          size: doc.fileSize,
          versionId,
        },
      ]);
      setActiveViewerIndex(0);
      setDocumentViewerOpen(true);
    } catch (error: any) {
      console.error("Error opening preview:", error);
      toast.error(`Error opening preview: ${error.message || "Unknown error"}`);
    }
  };

  const handleNeedDocument = useCallback(
    async (file: DocumentViewerFile, _index: number, _signal: AbortSignal) => {
      try {
        const blob = await DocumentService.DownloadDocument(
          Number(file.id),
          file.versionId
        );
        const url = URL.createObjectURL(blob);
        revokeViewerUrl();
        viewerUrlRef.current = url;
        return { url, contentType: blob.type || file.contentType };
      } catch (error: any) {
        console.error("Error loading document for preview:", error);
        toast.error(`Error loading preview: ${error.message || "Unknown error"}`);
        return null;
      }
    },
    []
  );

  const handleViewerDownload = async (file: DocumentViewerFile) => {
    const match = documents.find((d) => d.id === Number(file.id)) || selectedDocument;
    if (match) {
      await handleDownload(match, file.versionId);
      return;
    }
    try {
      const blob = await DocumentService.DownloadDocument(Number(file.id));
      const url = window.URL.createObjectURL(blob);
      const a = window.document.createElement("a");
      a.href = url;
      a.download = file.name;
      window.document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      window.document.body.removeChild(a);
      toast.success("Download started");
    } catch (error: any) {
      toast.error(error?.message || "Failed to download document");
    }
  };

  const getFileIcon = (document: Document) => {
    return DocumentService.getFileIcon(document.fileExtension, document.mimeType);
  };

  const pageTags = useMemo(() => {
    const set = new Set<string>();
    documents.forEach((d) => parseTags(d.tags).forEach((t) => set.add(t)));
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  }, [documents]);

  const filteredDocuments = useMemo(() => {
    if (!selectedTag) return documents;
    const tagLower = selectedTag.toLowerCase();
    return documents.filter((d) =>
      parseTags(d.tags).some((t) => t.toLowerCase() === tagLower)
    );
  }, [documents, selectedTag]);

  const renderTagChips = (tags?: string) => {
    const list = parseTags(tags);
    if (list.length === 0) return null;
    return (
      <div className="document-tags">
        {list.slice(0, 4).map((tag) => (
          <span key={tag} className="tag-chip" title={tag}>
            <FontAwesomeIcon icon={faTags} />
            {tag}
          </span>
        ))}
        {list.length > 4 && <span className="tag-chip more">+{list.length - 4}</span>}
      </div>
    );
  };

  return (
    <div className="documents-page">
      <div className="documents-header">
        <h2>Documents</h2>
        <button className="btn btn-primary" onClick={() => setShowUploadModal(true)}>
          <FontAwesomeIcon icon={faUpload} /> Upload Document
        </button>
      </div>

      <div className="documents-filters">
        <div className="search-box">
          <FontAwesomeIcon icon={faSearch} />
          <input
            type="text"
            placeholder="Search by name, number, or tags…"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setPage(1);
            }}
          />
        </div>

        <div className="filter-group">
          <FontAwesomeIcon icon={faFilter} />
          <select
            className="filter-select"
            value={masterListFilter.value}
            onChange={(e) => {
              masterListFilter.onChange(e.target.value);
              setPage(1);
            }}
          >
            {masterListFilter.options.map((opt) => (
              <option key={opt.value || "all"} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <FontAwesomeIcon icon={faFilter} />
          <select
            className="filter-select"
            value={selectedCategoryId || ""}
            onChange={(e) => {
              setSelectedCategoryId(e.target.value ? parseInt(e.target.value) : undefined);
              setPage(1);
            }}
          >
            <option value="">All Categories</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.categoryName}
              </option>
            ))}
          </select>
        </div>

        {pageTags.length > 0 && (
          <div className="filter-group">
            <FontAwesomeIcon icon={faTags} />
            <select
              className="filter-select"
              value={selectedTag}
              onChange={(e) => setSelectedTag(e.target.value)}
              title="Filter by tag on this page"
            >
              <option value="">All Tags</option>
              {pageTags.map((tag) => (
                <option key={tag} value={tag}>
                  {tag}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="view-toggle">
          <button
            className={viewMode === "grid" ? "active" : ""}
            onClick={() => setViewMode("grid")}
          >
            Grid
          </button>
          <button
            className={viewMode === "list" ? "active" : ""}
            onClick={() => setViewMode("list")}
          >
            List
          </button>
        </div>
      </div>

      {loading ? (
        <div className="loading">Loading documents...</div>
      ) : documents.length === 0 ? (
        <div className="empty-state">
          <FontAwesomeIcon icon={faFile} size="3x" />
          <p>No documents found</p>
          <button className="btn btn-primary" onClick={() => setShowUploadModal(true)}>
            Upload Your First Document
          </button>
        </div>
      ) : filteredDocuments.length === 0 ? (
        <div className="empty-state">
          <FontAwesomeIcon icon={faTags} size="3x" />
          <p>No documents match the selected tag</p>
          <button className="btn btn-primary" onClick={() => setSelectedTag("")}>
            Clear Tag Filter
          </button>
        </div>
      ) : viewMode === "grid" ? (
        <div className="documents-grid">
          {filteredDocuments.map((document) => (
            <div key={document.id} className="document-card">
              <div className="document-icon">
                <FontAwesomeIcon icon={getFileIcon(document) as any} size="3x" />
              </div>
              <div className="document-info">
                <h3 onClick={() => handleDocumentClick(document)}>{document.documentName}</h3>
                {document.documentNumber && (
                  <p className="document-number">
                    <span className="number-label">Doc #:</span>
                    <span className="number-value">{document.documentNumber}</span>
                    {document.isDocumentNumberAutoGenerated && (
                      <span className="auto-badge" title="Auto-generated">Auto</span>
                    )}
                  </p>
                )}
                <p className="document-meta">
                  {document.categoryName && (
                    <span className="category">{document.categoryName}</span>
                  )}
                  {document.fileSize > 0 && (
                    <span>{DocumentService.formatFileSize(document.fileSize)}</span>
                  )}
                  {document.requiresVersionControl && document.currentVersionNumber && (
                    <span className="version-badge">v{document.currentVersionNumber}</span>
                  )}
                </p>
                {renderTagChips(document.tags)}
                <p className="document-date">
                  {new Date(document.createdDate).toLocaleDateString()}
                </p>
              </div>
              <div className="document-actions">
                <button
                  className="btn-icon"
                  onClick={() => handlePreview(document)}
                  title="Preview"
                >
                  <FontAwesomeIcon icon={faEye} />
                </button>
                <button
                  className="btn-icon"
                  onClick={() => handleDownload(document)}
                  title="Download"
                >
                  <FontAwesomeIcon icon={faDownload} />
                </button>
                {document.requiresVersionControl && (
                  <button
                    className="btn-icon"
                    onClick={() => handleDocumentClick(document)}
                    title="Version History"
                  >
                    <FontAwesomeIcon icon={faHistory} />
                  </button>
                )}
                <button
                  className="btn-icon btn-danger"
                  onClick={() => handleDelete(document.id)}
                  title="Delete"
                >
                  <FontAwesomeIcon icon={faTrash} />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="documents-list">
          <table>
            <thead>
              <tr>
                <th>Document #</th>
                <th>Name</th>
                <th>Category</th>
                <th>Tags</th>
                <th>Size</th>
                <th>Version</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredDocuments.map((document) => (
                <tr key={document.id}>
                  <td>
                    {document.documentNumber ? (
                      <span>
                        {document.documentNumber}
                        {document.isDocumentNumberAutoGenerated && (
                          <span className="auto-badge" title="Auto-generated">Auto</span>
                        )}
                      </span>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td>
                    <div className="document-name-cell">
                      <FontAwesomeIcon icon={getFileIcon(document) as any} />
                      <span onClick={() => handleDocumentClick(document)}>
                        {document.documentName}
                      </span>
                    </div>
                  </td>
                  <td>{document.categoryName || "-"}</td>
                  <td>{renderTagChips(document.tags) || "-"}</td>
                  <td>{DocumentService.formatFileSize(document.fileSize)}</td>
                  <td>
                    {document.requiresVersionControl && document.currentVersionNumber
                      ? `v${document.currentVersionNumber}`
                      : "-"}
                  </td>
                  <td>{new Date(document.createdDate).toLocaleDateString()}</td>
                  <td>
                    <div className="action-buttons">
                      <button
                        className="btn-icon"
                        onClick={() => handlePreview(document)}
                        title="Preview"
                      >
                        <FontAwesomeIcon icon={faEye} />
                      </button>
                      <button
                        className="btn-icon"
                        onClick={() => handleDownload(document)}
                        title="Download"
                      >
                        <FontAwesomeIcon icon={faDownload} />
                      </button>
                      <button
                        className="btn-icon btn-danger"
                        onClick={() => handleDelete(document.id)}
                        title="Delete"
                      >
                        <FontAwesomeIcon icon={faTrash} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="pagination">
          <button
            disabled={page === 1}
            onClick={() => setPage(page - 1)}
          >
            Previous
          </button>
          <span>
            Page {page} of {totalPages}
            {totalCount > 0 && ` (${totalCount})`}
          </span>
          <button
            disabled={page === totalPages}
            onClick={() => setPage(page + 1)}
          >
            Next
          </button>
        </div>
      )}

      {showUploadModal && (
        <DocumentUploadModal
          categories={categories}
          onClose={() => setShowUploadModal(false)}
          onSuccess={handleUploadSuccess}
          onCategoryCreated={loadCategories}
        />
      )}

      {showDetailModal && selectedDocument && (
        <DocumentDetailModal
          document={selectedDocument}
          onClose={() => {
            setShowDetailModal(false);
            setSelectedDocument(null);
          }}
          onChanged={loadDocuments}
          onPreview={handlePreview}
        />
      )}

      {documentViewerOpen &&
        createPortal(
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 10050,
              background: "rgba(15, 23, 42, 0.55)",
              display: "flex",
              alignItems: "stretch",
              justifyContent: "center",
              padding: "1.5rem",
            }}
            onClick={(e) => {
              e.stopPropagation();
              closeDocumentViewer();
            }}
          >
            <div
              style={{
                flex: 1,
                maxWidth: "1100px",
                background: "#fff",
                borderRadius: "0.5rem",
                overflow: "hidden",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <DocumentViewerWorkspace
                documents={viewerDocuments}
                activeIndex={activeViewerIndex}
                onActiveIndexChange={setActiveViewerIndex}
                onClose={closeDocumentViewer}
                onNeedDocument={handleNeedDocument}
                onDownload={(file) => {
                  handleViewerDownload(file).catch((error: any) => {
                    toast.error(error?.message || "Failed to download document");
                  });
                }}
                mode="view"
              />
            </div>
          </div>,
          window.document.body
        )}
    </div>
  );
};

export default Documents;
