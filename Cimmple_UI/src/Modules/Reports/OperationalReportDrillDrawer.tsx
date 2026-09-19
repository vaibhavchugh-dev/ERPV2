import React, { useEffect, useMemo, useState } from "react";
import { useHistory } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faExternalLinkAlt, faTimes } from "@fortawesome/free-solid-svg-icons";
import {
  buildDrillLink,
  DRILL_DETAIL_PAGE_SIZE,
} from "../../Common/Utils/reportDeepLink";

export type OperationalDrillMeta = {
  entityType?: string;
  entityId?: number | null;
  entityKey?: string | null;
  title?: string;
  linkPath?: string;
  details?: Array<{
    label?: string;
    subLabel?: string;
    date?: string;
    status?: string;
    amount?: string;
    entityId?: number | null;
    linkPath?: string;
  }>;
};

type Props = {
  meta: OperationalDrillMeta | null;
  onClose: () => void;
};

function emptyMessage(meta: OperationalDrillMeta): string {
  switch (meta.entityType) {
    case "job-status":
      return `No job orders found for status “${meta.entityKey || "this status"}”.`;
    case "customer":
      return "No orders or invoices found for this customer in the report period.";
    case "vendor":
    case "vendor-part":
    case "vendor-po":
    case "po-month":
      return "No purchase orders found for this selection.";
    case "ncr-bucket":
      return `No NCRs found for “${meta.entityKey || "this bucket"}”.`;
    case "stock-date":
    case "stock-type":
      return "No stock movements in this group.";
    case "inventory-item":
      return "No inventory detail available for this item.";
    case "quotation":
      return "No quotation detail available.";
    case "job":
      return "No job detail available.";
    default:
      return "Nothing to show for this row. Try opening the related screen for the full list.";
  }
}

const OperationalReportDrillDrawer: React.FC<Props> = ({ meta, onClose }) => {
  const history = useHistory();
  const [visibleCount, setVisibleCount] = useState(DRILL_DETAIL_PAGE_SIZE);

  useEffect(() => {
    setVisibleCount(DRILL_DETAIL_PAGE_SIZE);
  }, [meta]);

  useEffect(() => {
    if (!meta) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [meta, onClose]);

  const details = useMemo(
    () => (Array.isArray(meta?.details) ? meta!.details! : []),
    [meta]
  );

  const visibleDetails = details.slice(0, visibleCount);
  const remaining = Math.max(0, details.length - visibleCount);

  if (!meta) return null;

  const primaryPath = buildDrillLink({
    path: meta.linkPath || "/reports",
    entityId: meta.entityId,
    entityKey: meta.entityKey,
    entityType: meta.entityType,
    title: meta.title,
    search: meta.entityType === "inventory-item" ? meta.entityKey : null,
  });

  const go = (path: string, opts?: { newTab?: boolean }) => {
    onClose();
    if (opts?.newTab) {
      window.open(path, "_blank", "noopener,noreferrer");
      return;
    }
    history.push(path);
  };

  return (
    <div className="rpt-drill-overlay" role="presentation">
      <button
        type="button"
        className="rpt-drill-backdrop"
        aria-label="Close drill-down"
        onClick={onClose}
      />
      <aside
        className="rpt-drill"
        aria-label="Report drill-down"
        role="dialog"
        aria-modal="true"
      >
        <div className="rpt-drill-header">
          <div>
            <div className="rpt-drill-kicker">Drill-down</div>
            <h3>{meta.title || "Details"}</h3>
            {meta.entityType && (
              <p className="rpt-drill-meta">
                {meta.entityType}
                {meta.entityId ? ` · #${meta.entityId}` : ""}
                {meta.entityKey ? ` · ${meta.entityKey}` : ""}
              </p>
            )}
          </div>
          <button
            type="button"
            className="rpt-drill-close"
            onClick={onClose}
            aria-label="Close"
          >
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>

        <div className="rpt-drill-body">
          {details.length === 0 ? (
            <div className="rpt-drill-empty">
              <p className="rpt-muted">{emptyMessage(meta)}</p>
            </div>
          ) : (
            <>
              <p className="rpt-muted">
                Showing {visibleDetails.length} of {details.length}
                {details.length > DRILL_DETAIL_PAGE_SIZE
                  ? " (large lists are paged in this drawer)"
                  : ""}
              </p>
              <div className="rpt-drill-scroll">
                <table className="rpt-table">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Date</th>
                      <th>Status</th>
                      <th className="num">Amount</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleDetails.map((d, i) => {
                      // Detail rows open a document by id — do not inherit parent
                      // aggregate/bucket entityType (avoids wrong ?status= / ?open=).
                      const href = buildDrillLink({
                        path: d.linkPath || meta.linkPath || "/reports",
                        entityId: d.entityId,
                        entityKey:
                          meta.entityType === "inventory-item"
                            ? meta.entityKey
                            : null,
                        entityType:
                          meta.entityType === "inventory-item"
                            ? "inventory-item"
                            : null,
                        search:
                          meta.linkPath?.startsWith("/inventory") ||
                          d.linkPath?.startsWith("/inventory")
                            ? d.label
                            : null,
                      });
                      return (
                        <tr key={i}>
                          <td>
                            <div className="rpt-drill-item-label">
                              {d.label || "—"}
                            </div>
                            {d.subLabel ? (
                              <div className="rpt-drill-item-sub">
                                {d.subLabel}
                              </div>
                            ) : null}
                          </td>
                          <td>{d.date || "—"}</td>
                          <td>{d.status || "—"}</td>
                          <td className="num">{d.amount || "—"}</td>
                          <td>
                            <button
                              type="button"
                              className="rpt-link-btn"
                              onClick={() => go(href, { newTab: true })}
                            >
                              Open
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {remaining > 0 && (
                <button
                  type="button"
                  className="rpt-btn rpt-btn-secondary"
                  style={{ marginTop: "0.75rem" }}
                  onClick={() =>
                    setVisibleCount((n) => n + DRILL_DETAIL_PAGE_SIZE)
                  }
                >
                  Show {Math.min(remaining, DRILL_DETAIL_PAGE_SIZE)} more
                  {remaining > DRILL_DETAIL_PAGE_SIZE
                    ? ` (${remaining} remaining)`
                    : ""}
                </button>
              )}
            </>
          )}

          <div className="rpt-drill-actions">
            <button
              type="button"
              className="rpt-btn rpt-btn-secondary"
              onClick={() => go(primaryPath, { newTab: true })}
            >
              <FontAwesomeIcon icon={faExternalLinkAlt} />
              Open related screen
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
};

export default OperationalReportDrillDrawer;
