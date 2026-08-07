import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  CustomerPartOption,
  ProductMasterService,
} from "../Services/ProductMasterService";

export interface CustomerPartComboboxProps {
  value: string;
  customerId: number;
  customerSelected: boolean;
  hasError?: boolean;
  placeholder?: string;
  disabled?: boolean;
  onChange: (partNo: string) => void;
  onSelectPart: (part: CustomerPartOption) => void;
  /** Fired when typed/selected value matches (or stops matching) history */
  onHistoryMatch?: (part: CustomerPartOption | null) => void;
  scrollContainerSelector?: string;
}

const formatMoney = (n?: number | null) => {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return `$${Number(n).toFixed(2)}`;
};

const DEBOUNCE_MS = 300;

/**
 * Part No combobox with debounced server search against customer history.
 */
const CustomerPartCombobox: React.FC<CustomerPartComboboxProps> = ({
  value,
  customerId,
  customerSelected,
  hasError,
  placeholder,
  disabled,
  onChange,
  onSelectPart,
  onHistoryMatch,
  scrollContainerSelector,
}) => {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number; width: number } | null>(null);
  const [parts, setParts] = useState<CustomerPartOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);
  const partsRef = useRef<CustomerPartOption[]>([]);

  const updatePosition = () => {
    const input = inputRef.current;
    if (!input) return;
    const rect = input.getBoundingClientRect();
    setPosition({
      top: rect.bottom + 4,
      left: rect.left,
      width: Math.max(rect.width, 340),
    });
  };

  const emitHistoryMatch = useCallback(
    (partNo: string, list: CustomerPartOption[]) => {
      if (!onHistoryMatch) return;
      const trimmed = (partNo || "").trim().toLowerCase();
      if (!trimmed) {
        onHistoryMatch(null);
        return;
      }
      const match = list.find((p) => p.partNo.toLowerCase() === trimmed) || null;
      onHistoryMatch(match);
    },
    [onHistoryMatch]
  );

  const fetchParts = useCallback(
    async (q: string) => {
      if (!customerSelected || customerId <= 0) {
        setParts([]);
        partsRef.current = [];
        return;
      }
      const reqId = ++requestIdRef.current;
      setLoading(true);
      try {
        const result = await ProductMasterService.GetPartsByCustomer(customerId, {
          q: q || undefined,
          limit: 50,
        });
        if (reqId !== requestIdRef.current) return;
        setParts(result);
        partsRef.current = result;
        emitHistoryMatch(value, result);
      } catch (err) {
        if (reqId !== requestIdRef.current) return;
        console.error("Error searching customer parts:", err);
        setParts([]);
        partsRef.current = [];
      } finally {
        if (reqId === requestIdRef.current) {
          setLoading(false);
        }
      }
    },
    [customerId, customerSelected, emitHistoryMatch, value]
  );

  // Load initial / refresh when customer changes
  useEffect(() => {
    if (!customerSelected || customerId <= 0) {
      setParts([]);
      partsRef.current = [];
      onHistoryMatch?.(null);
      return;
    }
    fetchParts("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId, customerSelected]);

  // Debounced search when typing / opening with a term
  useEffect(() => {
    if (!customerSelected || customerId <= 0) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchParts(searchTerm);
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchTerm, customerId, customerSelected, fetchParts]);

  // Re-resolve hint when value changes against current list (exact match / fetch exact)
  useEffect(() => {
    const trimmed = (value || "").trim();
    if (!trimmed || !customerSelected) {
      onHistoryMatch?.(null);
      return;
    }
    const local = partsRef.current.find(
      (p) => p.partNo.toLowerCase() === trimmed.toLowerCase()
    );
    if (local) {
      onHistoryMatch?.(local);
      return;
    }
    // Exact lookup when not in current page of results
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const result = await ProductMasterService.GetPartsByCustomer(customerId, {
          q: trimmed,
          limit: 20,
        });
        if (cancelled) return;
        const match =
          result.find((p) => p.partNo.toLowerCase() === trimmed.toLowerCase()) || null;
        onHistoryMatch?.(match);
      } catch {
        if (!cancelled) onHistoryMatch?.(null);
      }
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [value, customerId, customerSelected, onHistoryMatch]);

  useEffect(() => {
    if (!open) return;

    const handleScrollOrResize = () => updatePosition();
    window.addEventListener("scroll", handleScrollOrResize, true);
    window.addEventListener("resize", handleScrollOrResize);

    const slideout = scrollContainerSelector
      ? document.querySelector(scrollContainerSelector)
      : null;
    if (slideout) {
      slideout.addEventListener("scroll", handleScrollOrResize, true);
    }

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (inputRef.current?.contains(target) || listRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      window.removeEventListener("scroll", handleScrollOrResize, true);
      window.removeEventListener("resize", handleScrollOrResize);
      if (slideout) {
        slideout.removeEventListener("scroll", handleScrollOrResize, true);
      }
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [open, scrollContainerSelector]);

  const resolvedPlaceholder = !customerSelected
    ? "Select a customer first"
    : placeholder || "Search or select part…";

  return (
    <div style={{ position: "relative", width: "100%", minWidth: "140px" }}>
      <input
        ref={inputRef}
        type="text"
        className="form-input"
        disabled={disabled || !customerSelected}
        style={{
          width: "100%",
          paddingRight: "2rem",
          borderColor: hasError ? "#ef4444" : undefined,
          borderWidth: hasError ? "2px" : "1px",
        }}
        value={value}
        onChange={(e) => {
          const next = e.target.value;
          onChange(next);
          setSearchTerm(next);
          if (!open) {
            updatePosition();
            setOpen(true);
          }
        }}
        onFocus={() => {
          updatePosition();
          setOpen(true);
          setSearchTerm(value || "");
        }}
        placeholder={resolvedPlaceholder}
        autoComplete="off"
        title={
          customerSelected
            ? "Select from this customer's history or type a new part"
            : "Select a customer to load part history"
        }
      />
      <button
        type="button"
        disabled={disabled || !customerSelected}
        onClick={() => {
          if (!customerSelected) return;
          updatePosition();
          setOpen((prev) => !prev);
          setSearchTerm(value || "");
          inputRef.current?.focus();
        }}
        style={{
          position: "absolute",
          right: "0.35rem",
          top: "50%",
          transform: "translateY(-50%)",
          background: "none",
          border: "none",
          cursor: customerSelected ? "pointer" : "not-allowed",
          fontSize: "0.7rem",
          color: "#6b7280",
          padding: "0.25rem",
          opacity: customerSelected ? 1 : 0.5,
        }}
        title="Show customer parts"
        tabIndex={-1}
      >
        ▼
      </button>

      {open && customerSelected && position &&
        createPortal(
          <div
            ref={listRef}
            style={{
              position: "fixed",
              top: `${position.top}px`,
              left: `${position.left}px`,
              width: `${position.width}px`,
              maxHeight: "280px",
              overflowY: "auto",
              backgroundColor: "#ffffff",
              border: "1px solid #e5e7eb",
              borderRadius: "0.375rem",
              boxShadow:
                "0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05)",
              zIndex: 10050,
            }}
            onMouseDown={(e) => e.preventDefault()}
          >
            <div
              style={{
                padding: "0.4rem 0.75rem",
                fontSize: "0.7rem",
                fontWeight: 600,
                color: "#6b7280",
                backgroundColor: "#f9fafb",
                borderBottom: "1px solid #e5e7eb",
                position: "sticky",
                top: 0,
                display: "flex",
                justifyContent: "space-between",
              }}
            >
              <span>Customer part history</span>
              <span>{loading ? "Searching…" : `${parts.length} shown`}</span>
            </div>
            {loading && parts.length === 0 ? (
              <div style={{ padding: "0.75rem", fontSize: "0.8125rem", color: "#6b7280" }}>
                Searching…
              </div>
            ) : parts.length === 0 ? (
              <div style={{ padding: "0.75rem", fontSize: "0.8125rem", color: "#6b7280" }}>
                {searchTerm.trim()
                  ? "No matching parts. Keep typing to use a new part number."
                  : "No prior parts for this customer. Type a new part number."}
              </div>
            ) : (
              parts.map((p) => (
                <button
                  key={p.partNo}
                  type="button"
                  onClick={() => {
                    onSelectPart(p);
                    onHistoryMatch?.(p);
                    setOpen(false);
                  }}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "0.6rem 0.75rem",
                    border: "none",
                    borderBottom: "1px solid #f3f4f6",
                    background: "transparent",
                    cursor: "pointer",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "#f3f4f6";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "transparent";
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
                    <span style={{ fontWeight: 600, fontSize: "0.8125rem", color: "#111827" }}>
                      {p.partNo}
                    </span>
                    <span
                      style={{
                        fontSize: "0.75rem",
                        color: "#059669",
                        fontWeight: 600,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {formatMoney(p.unitPrice)}
                    </span>
                  </div>
                  {p.partName ? (
                    <div
                      style={{
                        fontSize: "0.75rem",
                        color: "#4b5563",
                        marginTop: "0.15rem",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {p.partName}
                    </div>
                  ) : null}
                  <div style={{ fontSize: "0.6875rem", color: "#9ca3af", marginTop: "0.25rem" }}>
                    {p.orderCount ? `${p.orderCount} order(s)` : "Never ordered"}
                    {p.lastOrderedDate ? ` · last ${p.lastOrderedDate}` : ""}
                    {p.lastOrderedQty != null ? ` · qty ${p.lastOrderedQty}` : ""}
                    {p.quotationCount ? ` · ${p.quotationCount} quote(s)` : ""}
                  </div>
                </button>
              ))
            )}
          </div>,
          document.body
        )}
    </div>
  );
};

export default CustomerPartCombobox;

/** Small inline hint for last ordered / last quoted price */
export const formatPartHistoryHint = (part: CustomerPartOption | null | undefined): string => {
  if (!part) return "";
  const bits: string[] = [];
  if (part.lastOrderedPrice != null) {
    bits.push(
      `Last ordered ${formatMoney(part.lastOrderedPrice)}${
        part.lastOrderedDate ? ` on ${part.lastOrderedDate}` : ""
      }`
    );
  }
  if (part.lastQuotedPrice != null) {
    bits.push(
      `Last quoted ${formatMoney(part.lastQuotedPrice)}${
        part.lastQuotedDate ? ` on ${part.lastQuotedDate}` : ""
      }`
    );
  }
  return bits.join(" · ");
};
