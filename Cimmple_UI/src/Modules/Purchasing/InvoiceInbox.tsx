import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-toastify";
import MasterListPage, { ColumnConfig } from "../../Common/Components/MasterListPage/MasterListPage";
import {
  InvoiceInboxAddress,
  InvoiceInboxCounts,
  InvoiceInboxItem,
  InvoiceInboxService,
} from "../../Common/Services/InvoiceInboxService";
import { useActiveLocation } from "../../Common/Hooks/useActiveLocation";
import { useFormatting } from "../../Common/Hooks/useFormatting";
import { useSiteListFilter } from "../../Common/Hooks/useSiteListFilter";
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

const EMPTY_COUNTS: InvoiceInboxCounts = {
  open: 0,
  ready: 0,
  processing: 0,
  failed: 0,
  converted: 0,
  discarded: 0,
};

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
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(0);

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
        if (!silent) toast.error(error.message || "Failed to load the invoice inbox");
      } finally {
        if (seq === requestSeq.current && !silent) setLoading(false);
      }
    },
    [status, search, locationIdParam]
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

  // The address belongs to the working site (one address per site).
  useEffect(() => {
    let cancelled = false;
    if (workingSiteId <= 0) {
      setAddress(null);
      setAddressError("Select a working site to see its inbox address.");
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
        setAddressError(error.message || "Could not load the inbox address");
      });
    return () => {
      cancelled = true;
    };
  }, [workingSiteId]);

  const copyAddress = async () => {
    if (!address?.address) return;
    try {
      await navigator.clipboard.writeText(address.address);
      toast.success("Address copied");
    } catch {
      toast.info(address.address);
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
        key: "fileName",
        label: "Attachment",
        render: (value: string, row: InvoiceInboxItem) =>
          row.hasFile ? (
            <div className="inbox-cell-stack">
              <span className="inbox-cell-clip">{value || "invoice.pdf"}</span>
              <small>{formatSize(row.fileSize)}</small>
            </div>
          ) : (
            "—"
          ),
      },
      {
        key: "extractedVendorName",
        label: "Vendor (from PDF)",
        render: (value: string) => value || "—",
      },
      {
        key: "extractedInvoiceNo",
        label: "Invoice #",
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
      : "Vendor invoices emailed to your site's inbox address";

  return (
    <div style={{ padding: "1rem" }}>
      <div className="invoice-inbox-address">
        <div className="invoice-inbox-address-text">
          <span className="invoice-inbox-address-label">Ask vendors to email invoices (PDF) to</span>
          {address?.address ? (
            <strong className="invoice-inbox-address-value">{address.address}</strong>
          ) : addressError ? (
            <span className="invoice-inbox-address-note">{addressError}</span>
          ) : address && !address.address ? (
            <span className="invoice-inbox-address-note">
              Email intake is not set up yet. Ask your administrator to configure the inbound mail domain.
            </span>
          ) : (
            <span className="invoice-inbox-address-note">Loading…</span>
          )}
        </div>
        <div className="invoice-inbox-address-actions">
          {address?.address && (
            <button type="button" className="btn-secondary" onClick={copyAddress}>
              Copy
            </button>
          )}
        </div>
      </div>

      <MasterListPage
        permissionPath={PAGE_PATH}
        title="Invoice Inbox"
        subtitle={subtitle}
        data={items}
        columns={columns}
        loading={loading}
        enablePagination
        getRowId={(row) => row.id}
        onRowClick={handleRowClick}
        onSearchChange={setSearch}
        searchPlaceholder="Search by sender, subject, vendor, or invoice #..."
        filters={[
          masterListFilter,
          {
            label: "Status",
            options: STATUS_OPTIONS,
            value: status,
            onChange: setStatus,
          },
        ]}
        customActionButtons={[{ label: "Refresh", onClick: () => void load(false) }]}
        emptyMessage={
          status === "Open"
            ? "Nothing waiting. Invoices emailed to your inbox address will appear here."
            : "No items found"
        }
      />

      {total > items.length && (
        <p className="invoice-inbox-truncated">
          Showing the latest {items.length} of {total}. Narrow the search or status to see older items.
        </p>
      )}

      {selectedId > 0 && (
        <InvoiceInboxReviewSlideout itemId={selectedId} onClose={handleSlideoutClose} />
      )}
    </div>
  );
};

export default InvoiceInbox;
