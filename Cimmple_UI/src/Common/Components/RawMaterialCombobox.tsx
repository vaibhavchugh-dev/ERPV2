import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "react-toastify";
import {
  InventoryService,
  RawMaterial,
} from "../Services/InventoryService";
import { looksLikeJobPartNo } from "./CustomerPartCombobox";

export interface RawMaterialComboboxProps {
  value: string;
  rawMaterialId?: number | null;
  hasError?: boolean;
  placeholder?: string;
  disabled?: boolean;
  onChange: (partNo: string) => void;
  onSelect: (material: RawMaterial) => void;
  scrollContainerSelector?: string;
  suggestedPartName?: string;
  suggestedUnit?: string;
  suggestedUnitCost?: number;
  vendorId?: number;
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
  suggestedPartName,
  suggestedUnit,
  suggestedUnitCost,
  vendorId,
}) => {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const [materials, setMaterials] = useState<RawMaterial[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
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
      const result = await InventoryService.GetRawMaterials({
        includeInactive: true,
      });
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

  const typedPartNo = (filter || value || "").trim();
  const canCreate =
    typedPartNo.length > 0 &&
    !looksLikeJobPartNo(typedPartNo) &&
    !materials.some(
      (m) => (m.partNo || "").trim().toLowerCase() === typedPartNo.toLowerCase()
    );

  const filtered = useMemo(() => {
    const q = typedPartNo.toLowerCase();
    if (!q) return materials;
    return materials.filter(
      (m) =>
        (m.partNo || "").toLowerCase().includes(q) ||
        (m.partName || "").toLowerCase().includes(q) ||
        (m.sku || "").toLowerCase().includes(q)
    );
  }, [materials, typedPartNo]);

  const selectedLabel = useMemo(() => {
    if (rawMaterialId && rawMaterialId > 0) {
      const match = materials.find((m) => m.id === rawMaterialId);
      if (match) {
        return `${match.partNo || ""}${match.partName ? ` — ${match.partName}` : ""}`.trim();
      }
    }
    return value || "";
  }, [materials, rawMaterialId, value]);

  const handleCreate = async () => {
    if (!canCreate || creating) return;
    setCreating(true);
    try {
      const partName = (suggestedPartName || "").trim() || typedPartNo;
      const unit = (suggestedUnit || "").trim() || "EA";
      const unitCost =
        suggestedUnitCost && suggestedUnitCost > 0 ? suggestedUnitCost : 0;
      const payload = {
        partNo: typedPartNo,
        partName,
        unit,
        unitCost,
        vendorId: vendorId && vendorId > 0 ? vendorId : undefined,
      };
      let saved: { id: number } | null = null;
      try {
        saved = await InventoryService.SaveRawMaterial(payload);
      } catch (err: any) {
        const msg = String(err?.response?.data?.error || err?.message || "");
        if (vendorId && /vendor/i.test(msg)) {
          saved = await InventoryService.SaveRawMaterial({
            ...payload,
            vendorId: undefined,
          });
        } else {
          throw err;
        }
      }
      if (!saved?.id) {
        toast.error("Could not add raw material");
        return;
      }
      const created: RawMaterial = {
        id: saved.id,
        partNo: typedPartNo,
        partName,
        unit,
        unitCost,
        vendorId: vendorId && vendorId > 0 ? vendorId : undefined,
        isActive: true,
      };
      setMaterials((prev) => [created, ...prev.filter((m) => m.id !== created.id)]);
      onSelect(created);
      setFilter(typedPartNo);
      setOpen(false);
      toast.success(`Added ${typedPartNo} to Raw Material Master`);
    } catch (err: any) {
      const message =
        err?.response?.data?.error || err.message || "Failed to add raw material";
      toast.error(message);
    } finally {
      setCreating(false);
    }
  };

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
              maxHeight: 280,
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
            {!loading && filtered.length === 0 && !canCreate && (
              <div style={{ padding: "0.75rem", color: "#6b7280", fontSize: 13 }}>
                No raw materials found. Type a part number to add it here.
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
                    {m.isActive === false ? " · Inactive" : ""}
                  </div>
                </button>
              ))}
            {!loading && canCreate && (
              <button
                type="button"
                disabled={creating}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "0.65rem 0.75rem",
                  border: "none",
                  borderTop: filtered.length > 0 ? "1px solid #e5e7eb" : "none",
                  background: "#f8fafc",
                  cursor: creating ? "wait" : "pointer",
                  color: "#1d4ed8",
                  fontSize: 13,
                  fontWeight: 500,
                }}
                onClick={handleCreate}
              >
                {creating
                  ? "Adding…"
                  : `Add “${typedPartNo}” to Raw Material Master`}
              </button>
            )}
          </div>,
          document.body
        )}
    </>
  );
};

export default RawMaterialCombobox;
