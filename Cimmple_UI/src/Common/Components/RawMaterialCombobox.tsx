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
  /** When false, list stays empty until a vendor is chosen (VQ/VO). */
  vendorSelected?: boolean;
}

/**
 * Part No combobox backed by Raw Material Master (for vendor PO/VQ RawMaterial lines).
 * When vendorSelected, lists materials for that default vendor plus unassigned.
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
  vendorSelected = false,
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
  const loadedForVendorRef = useRef<number | null>(null);

  const vendorReady =
    vendorSelected && !!vendorId && vendorId > 0;

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

  const loadMaterials = async (force = false) => {
    if (!vendorReady || !vendorId) {
      setMaterials([]);
      loadedForVendorRef.current = null;
      return;
    }
    if (!force && loadedForVendorRef.current === vendorId) return;
    setLoading(true);
    try {
      const result = await InventoryService.GetRawMaterials({
        includeInactive: true,
        vendorId,
        includeId:
          rawMaterialId && rawMaterialId > 0 ? rawMaterialId : undefined,
      });
      setMaterials(Array.isArray(result) ? result : []);
      loadedForVendorRef.current = vendorId;
    } catch (err) {
      console.error("Error loading raw materials:", err);
      setMaterials([]);
      loadedForVendorRef.current = null;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadedForVendorRef.current = null;
    setMaterials([]);
  }, [vendorId, vendorSelected]);

  useEffect(() => {
    if (!open) return;
    if (vendorReady) {
      loadMaterials();
    } else {
      setMaterials([]);
    }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when open/vendor; loadMaterials uses current vendorId
  }, [open, scrollContainerSelector, vendorId, vendorSelected, vendorReady]);

  const typedPartNo = (filter || value || "").trim();
  const canCreate =
    vendorReady &&
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
    if (!canCreate || creating || !vendorReady || !vendorId) return;
    setCreating(true);
    try {
      const enteredName = (suggestedPartName || "").trim();
      const partName = enteredName || typedPartNo;
      const unit = (suggestedUnit || "").trim() || "EA";
      const unitCost =
        suggestedUnitCost && suggestedUnitCost > 0 ? suggestedUnitCost : 0;

      const saved = await InventoryService.EnsureRawMaterial({
        partNo: typedPartNo,
        partName,
        unit,
        unitCost,
        vendorId,
      });
      if (!saved?.id) {
        toast.error("Could not add raw material");
        return;
      }
      const material: RawMaterial = {
        id: saved.id,
        partNo: saved.partNo || typedPartNo,
        partName: saved.partName || partName,
        unit: saved.unit || unit,
        unitCost: saved.unitCost ?? unitCost,
        vendorId: saved.vendorId,
        vendorName: saved.vendorName,
        isActive: saved.isActive !== false,
      };
      setMaterials((prev) => [material, ...prev.filter((m) => m.id !== material.id)]);
      onSelect(material);
      setFilter(material.partNo || typedPartNo);
      setOpen(false);

      if (saved.created) {
        const extras: string[] = [];
        if (!enteredName) extras.push("name set to part no");
        if (unitCost > 0) extras.push(`cost ${unitCost}`);
        if (material.vendorId) extras.push("default vendor set");
        toast.success(
          extras.length > 0
            ? `Added ${material.partNo} to Raw Material Master (${extras.join(", ")})`
            : `Added ${material.partNo} to Raw Material Master`
        );
      } else {
        toast.success(
          `Linked existing raw material ${material.partNo}` +
            (material.vendorId && material.vendorId !== vendorId
              ? " (kept existing default vendor)"
              : "")
        );
      }
    } catch (err: any) {
      const message =
        err?.response?.data?.error || err.message || "Failed to add raw material";
      toast.error(message);
    } finally {
      setCreating(false);
    }
  };

  const effectivePlaceholder = !vendorReady
    ? "Select a vendor first…"
    : placeholder;
  const inputDisabled = disabled || !vendorReady;

  return (
    <>
      <input
        ref={inputRef}
        type="text"
        className={`form-input${hasError ? " is-invalid" : ""}`}
        style={{ width: "100%", minWidth: "140px" }}
        value={open ? filter || value : selectedLabel || value}
        disabled={inputDisabled}
        placeholder={effectivePlaceholder}
        onFocus={() => {
          if (!vendorReady) return;
          setFilter(value || "");
          setOpen(true);
          updatePosition();
        }}
        onChange={(e) => {
          if (!vendorReady) return;
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
        vendorReady &&
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
                No raw materials for this vendor (or unassigned). Type a part
                number to add or link one.
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
                    {m.vendorName
                      ? ` · ${m.vendorName}`
                      : !m.vendorId
                        ? " · Any vendor"
                        : ""}
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
                  : `Add / link “${typedPartNo}” in Raw Material Master`}
              </button>
            )}
          </div>,
          document.body
        )}
    </>
  );
};

export default RawMaterialCombobox;
