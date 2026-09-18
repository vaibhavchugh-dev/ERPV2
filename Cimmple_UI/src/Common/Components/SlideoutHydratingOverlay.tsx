import React from "react";

/** Semi-transparent overlay while an existing document loads into a slideout. */
const SlideoutHydratingOverlay: React.FC<{
  show: boolean;
  label?: string;
}> = ({ show, label = "Loading…" }) => {
  if (!show) return null;

  return (
    <div
      aria-busy="true"
      aria-live="polite"
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 30,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(255, 255, 255, 0.72)",
        borderRadius: "inherit",
        pointerEvents: "all",
      }}
    >
      <div
        style={{
          width: "2.5rem",
          height: "2.5rem",
          border: "4px solid #e5e7eb",
          borderTopColor: "#6366f1",
          borderRadius: "50%",
          animation: "slideout-hydrate-spin 0.8s linear infinite",
          marginBottom: "0.75rem",
        }}
      />
      <p style={{ margin: 0, fontSize: "0.875rem", color: "#6b7280" }}>{label}</p>
      <style>{`@keyframes slideout-hydrate-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

export default SlideoutHydratingOverlay;
