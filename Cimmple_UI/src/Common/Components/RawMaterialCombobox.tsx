import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  InventoryService,
  RawMaterial,
} from "../Services/InventoryService";

export interface RawMaterialComboboxProps {
  value: string;
  rawMaterialId?: number | null;
  hasError?: boolean;
  placeholder?: string;
  disabled?: boolean;
  onChange: (partNo: string) => void;
  onSelect: (material: RawMaterial) => void;
  scrollContainerSelector?: string;
}

/**
 * Part No combobox backed by Raw Material Master (for vendor PO RawMaterial lines).
 */
const RawMaterialCombobox: React.FC<RawMaterialComboboxProps> = ({
  value,
  rawMaterialId,
  hasError,
  placeholder = "Select raw material…",
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
  const [materials, setMaterials] = useState<RawMaterial[]>([]);
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
      width: Math.max(rect.width, 320),
    });
  };

  const loadMaterials = async () => {
    if (loadedRef.current) return;
    setLoading(true);
    try {
      const result = await InventoryService.GetRawMaterials();
      setMaterials(Array.isArray(result) ? result : []);
      loadedRef.current = true;
    } catch (err) {
      console.error("Error loading raw materials:", err);
      setMaterials([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    loadMaterials();
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
    if (!q) return materials;
    return materials.filter(
      (m) =>
        (m.partNo || "").toLowerCase().includes(q) ||
        (m.partName || "").toLowerCase().includes(q) ||
        (m.sku || "").toLowerCase().includes(q)
    );
  }, [materials, filter, value]);

  const selectedLabel = useMemo(() => {
    if (rawMaterialId && rawMaterialId > 0) {
      const match = materials.find((m) => m.id === rawMaterialId);
      if (match) {
        return `${match.partNo || ""}${match.partName ? ` — ${match.partName}` : ""}`.trim();
      }
    }
    return value || "";
  }, [materials, rawMaterialId, value]);

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
                Loading raw materials…
              </div>
            )}
            {!loading && filtered.length === 0 && (
              <div style={{ padding: "0.75rem", color: "#6b7280", fontSize: 13 }}>
                No raw materials found. Add them in Raw Material Master.
              </div>
            )}
            {!loading &&
              filtered.slice(0, 80).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "0.5rem 0.75rem",
                    border: "none",
                    borderBottom: "1px solid #f3f4f6",
                    background:
                      rawMaterialId === m.id ? "#e0e7ff" : "transparent",
                    cursor: "pointer",
                  }}
                  onClick={() => {
                    onSelect(m);
                    setFilter(m.partNo || "");
                    setOpen(false);
                  }}
                >
                  <div style={{ fontWeight: 500, fontSize: 13 }}>
                    {m.partNo || `RM #${m.id}`}
                    {m.sku ? (
                      <span style={{ color: "#6b7280", fontWeight: 400 }}>
                        {" "}
                        · {m.sku}
                      </span>
                    ) : null}
                  </div>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>
                    {m.partName || "—"}
                    {m.unit ? ` · ${m.unit}` : ""}
                  </div>
                </button>
              ))}
          </div>,
          document.body
        )}
    </>
  );
};

export default RawMaterialCombobox;
