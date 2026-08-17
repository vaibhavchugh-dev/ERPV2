import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ProductMaster,
  ProductMasterService,
} from "../Services/ProductMasterService";

export interface ProductMasterComboboxProps {
  value: string;
  productId?: number | null;
  hasError?: boolean;
  placeholder?: string;
  disabled?: boolean;
  onChange: (partNo: string) => void;
  onSelect: (product: ProductMaster) => void;
  scrollContainerSelector?: string;
}

function sourcingLabel(type?: string | null): string {
  const t = (type || "").trim();
  if (t === "Buy") return "Buy";
  if (t === "Both") return "Both";
  return "Make";
}

/**
 * Part No combobox backed by Product Master (for vendor PO Finished Product lines).
 */
const ProductMasterCombobox: React.FC<ProductMasterComboboxProps> = ({
  value,
  productId,
  hasError,
  placeholder = "Select finished product…",
  disabled,
  onChange,
  onSelect,
  scrollContainerSelector,
}) => {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const [products, setProducts] = useState<ProductMaster[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const loadedRef = useRef(false);

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

  const loadProducts = async () => {
    if (loadedRef.current) return;
    setLoading(true);
    try {
      const result = await ProductMasterService.GetProductMasterList();
      setProducts(Array.isArray(result) ? result : []);
      loadedRef.current = true;
    } catch (err) {
      console.error("Error loading product master:", err);
      setProducts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    loadProducts();
    updatePosition();
    const onScrollOrResize = () => updatePosition();
    window.addEventListener("resize", onScrollOrResize);
    const scrollEl = scrollContainerSelector
      ? document.querySelector(scrollContainerSelector)
      : null;
    scrollEl?.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("scroll", onScrollOrResize, true);
    return () => {
      window.removeEventListener("resize", onScrollOrResize);
      scrollEl?.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("scroll", onScrollOrResize, true);
    };
  }, [open, scrollContainerSelector]);

  const filtered = useMemo(() => {
    const q = (filter || value || "").trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        (p.partNo || "").toLowerCase().includes(q) ||
        (p.partName || "").toLowerCase().includes(q)
    );
  }, [products, filter, value]);

  const selectedLabel = useMemo(() => {
    if (productId && productId > 0) {
      const match = products.find((p) => p.productId === productId);
      if (match) {
        return `${match.partNo || ""}${match.partName ? ` — ${match.partName}` : ""}`.trim();
      }
    }
    return value || "";
  }, [products, productId, value]);

  return (
    <>
      <input
        ref={inputRef}
        type="text"
        className={`form-input${hasError ? " is-invalid" : ""}`}
        style={{ width: "100%", minWidth: "140px" }}
        value={open ? filter || value : selectedLabel || value}
        disabled={disabled}
        placeholder={placeholder}
        onFocus={() => {
          setFilter(value || "");
          setOpen(true);
          updatePosition();
        }}
        onChange={(e) => {
          const next = e.target.value;
          setFilter(next);
          onChange(next);
          if (!open) setOpen(true);
        }}
        onBlur={() => {
          setTimeout(() => setOpen(false), 180);
        }}
        autoComplete="off"
      />
      {open &&
        position &&
        createPortal(
          <div
            style={{
              position: "fixed",
              top: position.top,
              left: position.left,
              width: position.width,
              maxHeight: 260,
              overflowY: "auto",
              background: "#fff",
              border: "1px solid #e5e7eb",
              borderRadius: 6,
              boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
              zIndex: 10000,
            }}
            onMouseDown={(e) => e.preventDefault()}
          >
            {loading && (
              <div style={{ padding: "0.75rem", color: "#6b7280", fontSize: 13 }}>
                Loading products…
              </div>
            )}
            {!loading && filtered.length === 0 && (
              <div style={{ padding: "0.75rem", color: "#6b7280", fontSize: 13 }}>
                No products in Product Master. Use Sync from orders, or type a
                part number — saving this PO will add it as Buy.
              </div>
            )}
            {!loading &&
              filtered.slice(0, 80).map((p) => (
                <button
                  key={p.productId || p.partNo}
                  type="button"
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "0.5rem 0.75rem",
                    border: "none",
                    borderBottom: "1px solid #f3f4f6",
                    background:
                      productId && p.productId === productId
                        ? "#e0e7ff"
                        : "transparent",
                    cursor: "pointer",
                  }}
                  onClick={() => {
                    onSelect(p);
                    setFilter(p.partNo || "");
                    setOpen(false);
                  }}
                >
                  <div style={{ fontWeight: 500, fontSize: 13 }}>
                    {p.partNo || `Product #${p.productId}`}
                    <span
                      style={{
                        marginLeft: 8,
                        fontWeight: 400,
                        fontSize: 11,
                        color: "#6b7280",
                      }}
                    >
                      {sourcingLabel(p.sourcingType)}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>
                    {p.partName || "—"}
                    {p.unit ? ` · ${p.unit}` : ""}
                  </div>
                </button>
              ))}
          </div>,
          document.body
        )}
    </>
  );
};

export default ProductMasterCombobox;
