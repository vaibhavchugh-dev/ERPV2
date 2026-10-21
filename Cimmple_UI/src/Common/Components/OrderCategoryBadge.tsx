import React from "react";

const svgProps = {
  width: 14,
  height: 14,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  "aria-hidden": true as const,
};

const BoxIcon = () => (
  <svg {...svgProps}>
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
    <line x1="12" y1="22.08" x2="12" y2="12" />
  </svg>
);

const WrenchIcon = () => (
  <svg {...svgProps}>
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
  </svg>
);

/** Material / Service / Mixed label with drawn icons (emoji glyphs fail on the live site). */
const OrderCategoryBadge: React.FC<{ type?: string | null }> = ({ type }) => {
  const raw = typeof type === "string" ? type.trim() : "";
  if (!raw) {
    return <span style={{ color: "#9ca3af" }}>-</span>;
  }

  const key = raw.toLowerCase();
  const known = key === "material" || key === "service" || key === "mixed";
  const text = key === "material" ? "Material" : key === "service" ? "Service" : key === "mixed" ? "Mixed" : raw;

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", color: "#374151" }}>
      {key === "service" ? <WrenchIcon /> : known ? <BoxIcon /> : null}
      <span>{text}</span>
    </span>
  );
};

export default OrderCategoryBadge;
