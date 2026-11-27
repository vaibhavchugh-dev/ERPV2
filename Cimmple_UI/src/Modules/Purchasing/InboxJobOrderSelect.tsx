import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { JobOrderMaster } from "../../Common/Services/JobOrderService";
import { jobLabel } from "./inboxLineLinking";

interface InboxJobOrderSelectProps {
  jobOrders: JobOrderMaster[];
  selectedIds: number[];
  disabled?: boolean;
  placeholder?: string;
  onChange: (ids: number[]) => void;
}

/** Multi-select Job No dropdown (same behaviour as the Vendor Quotation / Order line Job No). */
const InboxJobOrderSelect: React.FC<InboxJobOrderSelectProps> = ({
  jobOrders,
  selectedIds,
  disabled,
  placeholder = "Select job orders",
  onChange,
}) => {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [position, setPosition] = useState<{ top: number; left: number; width: number } | null>(
    null
  );
  const inputRef = useRef<HTMLInputElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const displayText = useMemo(
    () =>
      selectedIds
        .map((id) => jobOrders.find((jo) => jo.jobOrderID === id))
        .filter((jo): jo is JobOrderMaster => !!jo)
        .map(jobLabel)
        .join(", "),
    [jobOrders, selectedIds]
  );

  const updatePosition = () => {
    const el = inputRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPosition({ top: rect.bottom + 4, left: rect.left, width: Math.max(rect.width, 260) });
  };

  useEffect(() => {
    if (!open) return;
    updatePosition();
    const onOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (inputRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    document.addEventListener("mousedown", onOutside);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      document.removeEventListener("mousedown", onOutside);
    };
  }, [open]);

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const list = q
      ? jobOrders.filter(
          (jo) =>
            jobLabel(jo).toLowerCase().includes(q) ||
            (jo.partName || "").toLowerCase().includes(q) ||
            (jo.partNo || "").toLowerCase().includes(q)
        )
      : jobOrders;
    return [...list].sort(
      (a, b) => (selectedSet.has(a.jobOrderID) ? 0 : 1) - (selectedSet.has(b.jobOrderID) ? 0 : 1)
    );
  }, [jobOrders, filter, selectedSet]);

  const toggle = (id: number) => {
    const next = new Set(selectedSet);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(Array.from(next));
  };

  return (
    <>
      <input
        ref={inputRef}
        type="text"
        className="form-input"
        style={{ cursor: disabled ? "not-allowed" : "pointer" }}
        value={displayText}
        title={displayText}
        placeholder={placeholder}
        disabled={disabled}
        readOnly
        onClick={() => {
          if (disabled) return;
          setFilter("");
          updatePosition();
          setOpen((prev) => !prev);
        }}
      />
      {open &&
        position &&
        createPortal(
          <div
            ref={panelRef}
            style={{
              position: "fixed",
              top: position.top,
              left: position.left,
              width: position.width,
              maxHeight: 300,
              overflowY: "auto",
              background: "#fff",
              border: "1px solid #e5e7eb",
              borderRadius: 6,
              boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
              zIndex: 10000,
            }}
          >
            <div style={{ padding: "0.4rem", borderBottom: "1px solid #f3f4f6" }}>
              <input
                type="text"
                className="form-input"
                placeholder="Search job orders…"
                value={filter}
                autoFocus
                onChange={(e) => setFilter(e.target.value)}
              />
            </div>
            {visible.length === 0 && (
              <div style={{ padding: "0.75rem", textAlign: "center", color: "#6b7280", fontSize: 13 }}>
                No job orders found
              </div>
            )}
            {visible.map((jo) => {
              const isSelected = selectedSet.has(jo.jobOrderID);
              return (
                <div
                  key={jo.jobOrderID}
                  onClick={() => toggle(jo.jobOrderID)}
                  style={{
                    padding: "0.5rem 0.75rem",
                    cursor: "pointer",
                    background: isSelected ? "#e0e7ff" : "#fff",
                    borderBottom: "1px solid #f3f4f6",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                  }}
                >
                  <input type="checkbox" checked={isSelected} readOnly style={{ cursor: "pointer" }} />
                  <div>
                    <div style={{ fontWeight: 500, fontSize: 13 }}>{jobLabel(jo)}</div>
                    {jo.partName && (
                      <div style={{ fontSize: 12, color: "#6b7280" }}>{jo.partName}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>,
          document.body
        )}
    </>
  );
};

export default InboxJobOrderSelect;
