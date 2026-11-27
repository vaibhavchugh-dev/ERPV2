import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-toastify";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleInfo } from "@fortawesome/free-solid-svg-icons";
import MasterListPage, { ColumnConfig } from "../../Common/Components/MasterListPage/MasterListPage";
import {
  InboxDocumentType,
  InvoiceInboxAddress,
  InvoiceInboxCounts,
  InvoiceInboxItem,
  InvoiceInboxService,
} from "../../Common/Services/InvoiceInboxService";
import { useActiveLocation } from "../../Common/Hooks/useActiveLocation";
import { useFormatting } from "../../Common/Hooks/useFormatting";
import { useSiteListFilter } from "../../Common/Hooks/useSiteListFilter";
import { onBackdropClick } from "../../Common/Utils/dismissGuard";
import InvoiceInboxReviewSlideout from "./InvoiceInboxReviewSlideout";
import "./InvoiceInbox.scss";

const PAGE_PATH = "/purchasing/invoice-inbox";
const POLL_MS = 15000;
const PAGE_SIZE = 200;

const STATUS_OPTIONS = [
  { value: "Open", label: "To review" },
  { value: "Extracted", label: "Ready to review" },
  { value: "Failed", label: "Failed" },
  { value: "NoAttachment", label: "No attachment" },
  { value: "Converted", label: "Converted" },
  { value: "Discarded", label: "Discarded" },
  { value: "All", label: "All" },
];

const DOC_TYPE_OPTIONS = [
  { value: "All", label: "All types" },
  { value: "customerQuotation", label: "Cust CQ — Customer Quotation" },
  { value: "customerOrder", label: "Cust CO — Customer Order" },
  // Customer Invoice hidden for now:
  // { value: "customerInvoice", label: "Cust INV — Customer Invoice" },
  { value: "vendorQuotation", label: "Vendor VQ — Vendor Quotation" },
  { value: "vendorOrder", label: "Vendor PO — Vendor Order" },
  { value: "vendorInvoice", label: "Vendor INV — Vendor Invoice" },
];

export const DOC_TYPE_META: Record<
  InboxDocumentType,
  { short: string; label: string; group: "Customer" | "Vendor"; tone: string }
> = {
  customerQuotation: { short: "Cust CQ", label: "Customer Quotation", group: "Customer", tone: "cust-cq" },
  customerOrder: { short: "Cust CO", label: "Customer Order", group: "Customer", tone: "cust-co" },
  customerInvoice: { short: "Cust INV", label: "Customer Invoice", group: "Customer", tone: "cust-ci" },
  vendorQuotation: { short: "Vendor VQ", label: "Vendor Quotation", group: "Vendor", tone: "vend-vq" },
  vendorOrder: { short: "Vendor PO", label: "Vendor Order", group: "Vendor", tone: "vend-po" },
  vendorInvoice: { short: "Vendor INV", label: "Vendor Invoice", group: "Vendor", tone: "vend-inv" },
};

const EMPTY_COUNTS: InvoiceInboxCounts = {
  open: 0,
  ready: 0,
  processing: 0,
  failed: 0,
  converted: 0,
  discarded: 0,
};

const DEFAULT_HIDDEN_COLUMNS = [
  "extractedVendorName",
  "extractedInvoiceNo",
  "extractedTotal",
  "fileName",
];

const statusBadge = (status: string) => {
  switch (status) {
    case "Extracted":
      return <span className="badge badge-info">Ready to review</span>;
    case "New":
    case "Extracting":
      return <span className="badge badge-warning">Reading PDF…</span>;
    case "Failed":
      return <span className="badge badge-danger">Failed</span>;
    case "NoAttachment":
      return <span className="badge badge-secondary">No attachment</span>;
    case "Converted":
      return <span className="badge badge-success">Converted</span>;
    case "Discarded":
      return <span className="badge badge-secondary">Discarded</span>;
    default:
      return <span className="badge badge-secondary">{status}</span>;
  }
};

const docTypeBadge = (docType?: string) => {
  const meta =
    DOC_TYPE_META[(docType as InboxDocumentType) || "vendorInvoice"] || DOC_TYPE_META.vendorInvoice;
  return (
    <span className={`inbox-type-badge ${meta.tone}`} title={meta.label}>
      {meta.short}
    </span>
  );
};

const formatSize = (bytes: number) => {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const InvoiceInbox: React.FC = () => {
  const { formatCurrency, formatUtcToTimezone } = useFormatting();
  const { locationId: workingSiteId } = useActiveLocation();
  const { locationIdParam, masterListFilter } = useSiteListFilter();

  const [items, setItems] = useState<InvoiceInboxItem[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<InvoiceInboxCounts>(EMPTY_COUNTS);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("Open");
  const [documentType, setDocumentType] = useState("All");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(0);

  const [showEmailInfo, setShowEmailInfo] = useState(false);
  const [address, setAddress] = useState<InvoiceInboxAddress | null>(null);
  const [addressError, setAddressError] = useState("");

  const requestSeq = useRef(0);

  const load = useCallback(
    async (silent = false) => {
      const seq = ++requestSeq.current;
      if (!silent) setLoading(true);
      try {
        const result = await InvoiceInboxService.GetList({
          status,
          documentType: documentType !== "All" ? documentType : undefined,
          searchTerm: search || undefined,
          locationId: locationIdParam,
          page: 1,
          pageSize: PAGE_SIZE,
        });
        if (seq !== requestSeq.current) return;
        setItems(result.items || []);
        setTotal(result.total || 0);
        setCounts(result.counts || EMPTY_COUNTS);
      } catch (error: any) {
        if (seq !== requestSeq.current) return;
        if (!silent) toast.error(error.message || "Failed to load the inbox");
      } finally {
        if (seq === requestSeq.current && !silent) setLoading(false);
      }
    },
    [status, documentType, search, locationIdParam]
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  // Keep the list moving while PDFs are being read in the background.
  useEffect(() => {
    if (counts.processing <= 0) return;
    const timer = window.setInterval(() => {
      if (!document.hidden) void load(true);
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [counts.processing, load]);

  // Load inbox email addresses for the working site (shown in the info modal).
  useEffect(() => {
    let cancelled = false;
    if (workingSiteId <= 0) {
      setAddress(null);
      setAddressError("Select a working site to see its inbox email addresses.");
      return;
    }
    setAddressError("");
    InvoiceInboxService.GetAddress(workingSiteId)
      .then((result) => {
        if (!cancelled) setAddress(result);
      })
      .catch((error: any) => {
        if (cancelled) return;
        setAddress(null);
        setAddressError(error.message || "Could not load the inbox email addresses");
      });
    return () => {
      cancelled = true;
    };
  }, [workingSiteId]);

  const copyText = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`Copied ${value}`);
    } catch {
      toast.info(value);
    }
  };

  const handleRowClick = (row: InvoiceInboxItem) => setSelectedId(row.id);

  const handleSlideoutClose = (refresh?: boolean) => {
    setSelectedId(0);
    if (refresh) void load(true);
  };

  const columns: ColumnConfig<InvoiceInboxItem>[] = useMemo(
    () => [
      {
        key: "receivedUtc",
        label: "Received",
        locked: true,
        render: (value: string) => formatUtcToTimezone(value),
      },
      {
        key: "fromEmail",
        label: "From",
        render: (_: any, row: InvoiceInboxItem) => (
          <div className="inbox-cell-stack">
            <span>{row.fromName || row.fromEmail || "—"}</span>
            {row.fromName && row.fromEmail && <small>{row.fromEmail}</small>}
          </div>
        ),
      },
      {
        key: "subject",
        label: "Subject",
        render: (value: string) => <span className="inbox-cell-clip">{value || "(no subject)"}</span>,
      },
      {
        key: "documentType",
        label: "Type",
        render: (value: string) => docTypeBadge(value),
      },
      {
        key: "fileName",
        label: "Attachment",
        render: (value: string, row: InvoiceInboxItem) =>
          row.hasFile ? (
            <div className="inbox-cell-stack">
              <span className="inbox-cell-clip">{value || "document.pdf"}</span>
              <small>{formatSize(row.fileSize)}</small>
            </div>
          ) : (
            "—"
          ),
      },
      {
        key: "extractedVendorName",
        label: "Party",
        render: (value: string) => value || "—",
      },
      {
        key: "extractedInvoiceNo",
        label: "Document #",
        render: (value: string) => value || "—",
      },
      {
        key: "extractedTotal",
        label: "Total",
        align: "right",
        render: (value: number | null) =>
          value === null || value === undefined ? "—" : formatCurrency(value),
      },
      {
        key: "status",
        label: "Status",
        render: (value: string, row: InvoiceInboxItem) => (
          <span title={row.failureReason || undefined}>{statusBadge(value)}</span>
        ),
      },
    ],
    [formatCurrency, formatUtcToTimezone]
  );

  const subtitle =
    counts.open > 0
      ? `${counts.open} to review${counts.ready ? ` · ${counts.ready} ready` : ""}${
          counts.processing ? ` · ${counts.processing} being read` : ""
        }${counts.failed ? ` · ${counts.failed} need attention` : ""}`
      : "Customer and vendor documents received by email";

  // Customer Invoice is hidden for now, so it is not listed even if the API still returns it.
  const visibleAddresses = (address?.addresses || []).filter(
    (a) => a.documentType !== "customerInvoice"
  );
  const customerAddresses = visibleAddresses.filter((a) => a.partyGroup === "Customer");
  const vendorAddresses = visibleAddresses.filter((a) => a.partyGroup === "Vendor");

  return (
    <div style={{ padding: "1rem" }}>
      <MasterListPage
        permissionPath={PAGE_PATH}
        title="Inbox"
        subtitle={subtitle}
        data={items}
        columns={columns}
        defaultHiddenColumns={DEFAULT_HIDDEN_COLUMNS}
        columnPreferenceKey="inbox.hiddenColumns.v2"
        loading={loading}
        enablePagination
        getRowId={(row) => row.id}
        onRowClick={handleRowClick}
        onSearchChange={setSearch}
        searchPlaceholder="Search by sender, subject, party, or document #..."
        filters={[
          masterListFilter,
          {
            label: "Type",
            options: DOC_TYPE_OPTIONS,
            value: documentType,
            onChange: setDocumentType,
          },
          {
            label: "Status",
            options: STATUS_OPTIONS,
            value: status,
            onChange: setStatus,
          },
        ]}
        customActionButtons={[{ label: "Refresh", onClick: () => void load(false) }]}
        trailingActionButtons={[
          {
            label: <FontAwesomeIcon icon={faCircleInfo} />,
            title: "Inbox email addresses",
            onClick: () => setShowEmailInfo(true),
            className: "inbox-info-icon-btn",
          },
        ]}
        emptyMessage={
          status === "Open"
            ? "Nothing waiting. Documents emailed to your site's inbox addresses will appear here."
            : "No items found"
        }
      />

      {total > items.length && (
        <p className="invoice-inbox-truncated">
          Showing the latest {items.length} of {total}. Narrow the search or filters to see older items.
        </p>
      )}

      {showEmailInfo && (
        <div
          className="inbox-email-info-overlay"
          onClick={onBackdropClick(() => setShowEmailInfo(false))}
        >
          <div
            className="inbox-email-info-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="inboxEmailInfoTitle"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="inbox-email-info-header">
              <div>
                <h3 id="inboxEmailInfoTitle">Inbox Email Addresses</h3>
                <p>
                  Send or ask customers and vendors to email PDF documents to the address for each
                  document type.
                </p>
              </div>
              <button
                type="button"
                className="btn-close"
                aria-label="Close"
                onClick={() => setShowEmailInfo(false)}
              >
                ×
              </button>
            </div>

            <div className="inbox-email-info-body">
              {addressError ? (
                <div className="inbox-email-info-note">{addressError}</div>
              ) : !address ? (
                <div className="inbox-email-info-note">Loading addresses…</div>
              ) : !address.configured ? (
                <div className="inbox-email-info-note">
                  Email intake is not set up yet. Ask your administrator to configure{" "}
                  <code>InboundMail:Domain</code>.
                </div>
              ) : (
                <>
                  <div className="inbox-email-info-pattern">
                    Format: <code>{address.locationId}-&lt;type&gt;@{address.domain}</code>
                  </div>

                  {customerAddresses.length > 0 && (
                    <div className="inbox-email-info-group">
                      <h4>Customer Documents</h4>
                      <div className="inbox-email-info-list">
                        {customerAddresses.map((entry) => (
                          <div key={entry.documentType} className="inbox-email-info-row">
                            <div className="inbox-email-info-row-left">
                              <div className="inbox-email-info-row-title">
                                {docTypeBadge(entry.documentType)}
                                <span>{entry.label}</span>
                              </div>
                              <small>{entry.description}</small>
                            </div>
                            <div className="inbox-email-info-row-right">
                              <code>{entry.address || "—"}</code>
                              {entry.address && (
                                <button
                                  type="button"
                                  className="inbox-copy-btn"
                                  onClick={() => void copyText(entry.address!)}
                                >
                                  Copy
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {vendorAddresses.length > 0 && (
                    <div className="inbox-email-info-group">
                      <h4>Vendor Documents</h4>
                      <div className="inbox-email-info-list">
                        {vendorAddresses.map((entry) => (
                          <div key={entry.documentType} className="inbox-email-info-row">
                            <div className="inbox-email-info-row-left">
                              <div className="inbox-email-info-row-title">
                                {docTypeBadge(entry.documentType)}
                                <span>{entry.label}</span>
                              </div>
                              <small>{entry.description}</small>
                            </div>
                            <div className="inbox-email-info-row-right">
                              <code>{entry.address || "—"}</code>
                              {entry.address && (
                                <button
                                  type="button"
                                  className="inbox-copy-btn"
                                  onClick={() => void copyText(entry.address!)}
                                >
                                  Copy
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="inbox-email-info-footer">
              <button
                type="button"
                className="btn-cancel"
                onClick={() => setShowEmailInfo(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedId > 0 && (
        <InvoiceInboxReviewSlideout itemId={selectedId} onClose={handleSlideoutClose} />
      )}
    </div>
  );
};

export default InvoiceInbox;
