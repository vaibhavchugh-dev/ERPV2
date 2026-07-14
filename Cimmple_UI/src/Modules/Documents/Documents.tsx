import React, { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { toast } from "react-toastify";
import { DocumentService, Document, DocumentCategory } from "../../Common/Services/DocumentService";
import DocumentUploadModal from "./DocumentUploadModal";
import DocumentDetailModal from "./DocumentDetailModal";
import "./Documents.scss";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faUpload,
  faSearch,
  faFilter,
  faFile,
  faFilePdf,
  faFileImage,
  faFileWord,
  faFileExcel,
  faFilePowerpoint,
  faFileArchive,
  faFileAlt,
  faDownload,
  faTrash,
  faEye,
  faHistory,
  faTags,
} from "@fortawesome/free-solid-svg-icons";

const Documents: React.FC = () => {
  const location = useLocation();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [categories, setCategories] = useState<DocumentCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | undefined>(undefined);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [viewMode, setViewMode] = useState<"grid" | "list">("list");

  useEffect(() => {
    loadCategories();
    loadDocuments();
  }, [page, selectedCategoryId, searchTerm]);

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
        searchTerm || undefined,
        page,
        pageSize
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
      toast.success("Download started");
    } catch (error: any) {
      console.error("Error downloading document:", error);
      toast.error(`Error downloading document: ${error.message || "Unknown error"}`);
    }
  };

  const getFileIcon = (document: Document) => {
    return DocumentService.getFileIcon(document.fileExtension, document.mimeType);
  };

  const filteredDocuments = documents.filter((doc) => {
    if (selectedCategoryId && doc.categoryId !== selectedCategoryId) return false;
    if (searchTerm && !doc.documentName.toLowerCase().includes(searchTerm.toLowerCase())) {
      return false;
    }
    return true;
  });

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
            placeholder="Search documents..."
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
                <p className="document-date">
                  {new Date(document.createdDate).toLocaleDateString()}
                </p>
              </div>
              <div className="document-actions">
                <button
                  className="btn-icon"
                  onClick={() => handleDocumentClick(document)}
                  title="View"
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
                <th>Name</th>
                <th>Document #</th>
                <th>Category</th>
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
                    <div className="document-name-cell">
                      <FontAwesomeIcon icon={getFileIcon(document) as any} />
                      <span onClick={() => handleDocumentClick(document)}>
                        {document.documentName}
                      </span>
                    </div>
                  </td>
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
                  <td>{document.categoryName || "-"}</td>
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
                        onClick={() => handleDocumentClick(document)}
                        title="View"
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
            loadDocuments();
          }}
        />
      )}
    </div>
  );
};

export default Documents;

