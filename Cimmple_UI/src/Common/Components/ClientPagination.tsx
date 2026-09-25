import React from "react";
import "./ClientPagination.scss";

interface ClientPaginationProps {
  startIndex: number;
  endIndex: number;
  total: number;
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  showControls?: boolean;
}

const ClientPagination: React.FC<ClientPaginationProps> = ({
  startIndex,
  endIndex,
  total,
  currentPage,
  totalPages,
  onPageChange,
  showControls = true,
}) => {
  if (!showControls || total <= 0) return null;

  return (
    <div className="client-pagination-controls">
      <div className="pagination-info">
        Showing {startIndex + 1} to {endIndex} of {total} entries
      </div>
      <div className="pagination-buttons">
        <button
          type="button"
          className="pagination-btn"
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          disabled={currentPage <= 1}
        >
          Previous
        </button>
        <span className="pagination-page-info">
          Page {currentPage} of {totalPages}
        </span>
        <button
          type="button"
          className="pagination-btn"
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage >= totalPages}
        >
          Next
        </button>
      </div>
    </div>
  );
};

export default ClientPagination;
