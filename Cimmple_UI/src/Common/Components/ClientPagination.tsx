import React from "react";
import { PAGE_SIZE_OPTIONS } from "../Hooks/useListPageSize";
import "./ClientPagination.scss";

interface ClientPaginationProps {
  startIndex: number;
  endIndex: number;
  total: number;
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  showControls?: boolean;
  pageSize?: number;
  onPageSizeChange?: (pageSize: number) => void;
  disabled?: boolean;
}

/** Shared list footer (masters, orders, quotations) — keep all list pages on this one. */
const ClientPagination: React.FC<ClientPaginationProps> = ({
  startIndex,
  endIndex,
  total,
  currentPage,
  totalPages,
  onPageChange,
  showControls = true,
  pageSize,
  onPageSizeChange,
  disabled = false,
}) => {
  if (!showControls || total <= 0) return null;

  const sizeOptions =
    pageSize && !PAGE_SIZE_OPTIONS.includes(pageSize)
      ? [...PAGE_SIZE_OPTIONS, pageSize].sort((a, b) => a - b)
      : PAGE_SIZE_OPTIONS;

  return (
    <div className="client-pagination-controls">
      <div className="pagination-info">
        Showing {startIndex + 1} to {endIndex} of {total} entries
      </div>
      <div className="pagination-buttons">
        {pageSize && onPageSizeChange && (
          <label className="pagination-size-label">
            Rows per page
            <select
              className="pagination-size"
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              disabled={disabled}
            >
              {sizeOptions.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
        )}
        <button
          type="button"
          className="pagination-btn"
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          disabled={disabled || currentPage <= 1}
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
          disabled={disabled || currentPage >= totalPages}
        >
          Next
        </button>
      </div>
    </div>
  );
};

export default ClientPagination;
