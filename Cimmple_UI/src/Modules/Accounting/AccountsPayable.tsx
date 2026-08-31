import React, { useMemo, useState, useEffect } from "react";
import { toast } from "react-toastify";
import { faCheckCircle, faTimesCircle, faDollarSign, faBuilding, faCalendar, faFilter, faEye, faCreditCard, faExclamationTriangle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { VendorInvoiceService, VendorInvoiceSummary } from "../../Common/Services/VendorInvoiceService";
import { useFormatting } from "../../Common/Hooks/useFormatting";
import VendorInvoiceDetailModal from "../Purchasing/VendorInvoiceDetailModal";
import BankAccountSelect from "../../Common/Components/BankAccountSelect";
import { useCompanyBanks } from "../../Common/Hooks/useCompanyBanks";

interface APFilterOptions {
  status: string;
  vendorId?: number;
  dateRange: string;
  amountRange: string;
  approvalStatus: string;
}

const isVoid = (invoice: VendorInvoiceSummary) => invoice.status === "Void";
const isPaid = (invoice: VendorInvoiceSummary) => invoice.status === "Paid";
const isApprovedForPay = (invoice: VendorInvoiceSummary) =>
  !isVoid(invoice) &&
  !isPaid(invoice) &&
  (invoice.isApproved === true ||
    invoice.status === "Approved" ||
    invoice.status === "Partially Paid");
const isPendingApproval = (invoice: VendorInvoiceSummary) =>
  !isVoid(invoice) &&
  !isPaid(invoice) &&
  !invoice.isApproved &&
  invoice.status !== "Approved" &&
  invoice.status !== "Partially Paid";

const getOpenBalance = (invoice: VendorInvoiceSummary) =>
  Math.max(0, Number(invoice.balanceDue ?? invoice.totalAmount - (invoice.paidAmount ?? 0)));

interface BulkAPPaymentModalProps {
  invoices: VendorInvoiceSummary[];
  onClose: () => void;
  onComplete: () => void;
}

const BulkAPPaymentModal: React.FC<BulkAPPaymentModalProps> = ({ invoices, onClose, onComplete }) => {
  const { formatCurrency } = useFormatting();
  const [loading, setLoading] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("Check");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split("T")[0]);
  const [checkNo, setCheckNo] = useState("");
  const [checkDate, setCheckDate] = useState(new Date().toISOString().split("T")[0]);
  const [series, setSeries] = useState("AP");
  const { banks, bankId, setBankId, loading: banksLoading } = useCompanyBanks();

  const totalDue = invoices.reduce(
    (sum, inv) => sum + Math.max(0, Number(inv.balanceDue ?? inv.totalAmount - (inv.paidAmount ?? 0))),
    0
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentMethod.trim()) {
      toast.error("Payment method is required");
      return;
    }
    if (!bankId) {
      toast.error("Please select a bank account");
      return;
    }

    setLoading(true);
    let success = 0;
    const errors: string[] = [];

    try {
      for (const invoice of invoices) {
        const balanceDue = Math.max(
          0,
          Number(invoice.balanceDue ?? invoice.totalAmount - (invoice.paidAmount ?? 0))
        );
        if (balanceDue <= 0.009) continue;
        try {
          await VendorInvoiceService.RecordVendorPayment(invoice.id, {
            PaymentMethod: paymentMethod,
            PaymentDate: paymentDate,
            CheckNo: checkNo || undefined,
            CheckDate: checkDate || undefined,
            Series: series || undefined,
            BankId: bankId,
            PaymentAmount: balanceDue,
          });
          success += 1;
        } catch (err: any) {
          errors.push(`${invoice.invoiceNo}: ${err.message || "failed"}`);
        }
      }

      if (success > 0) {
        toast.success(`Paid ${success} invoice${success === 1 ? "" : "s"}`);
      }
      if (errors.length > 0) {
        toast.error(`Some payments failed: ${errors.slice(0, 3).join("; ")}${errors.length > 3 ? "…" : ""}`);
      }
      if (success > 0) onComplete();
      else if (errors.length === 0) toast.info("No balances remaining to pay");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 10000,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: "white",
          borderRadius: "0.5rem",
          maxWidth: "520px",
          width: "90%",
          maxHeight: "85vh",
          overflow: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: "1.25rem 1.5rem", borderBottom: "1px solid #e5e7eb" }}>
          <h3 style={{ margin: 0 }}>Bulk Pay Approved ({invoices.length})</h3>
          <p style={{ margin: "0.5rem 0 0", color: "#6b7280", fontSize: "0.875rem" }}>
            Total balance due: {formatCurrency(totalDue)}
          </p>
        </div>
        <form onSubmit={handleSubmit} style={{ padding: "1.5rem" }}>
          <div style={{ marginBottom: "1rem", maxHeight: "140px", overflowY: "auto", fontSize: "0.875rem" }}>
            {invoices.map((inv) => (
              <div key={inv.id} style={{ display: "flex", justifyContent: "space-between", padding: "0.25rem 0" }}>
                <span>{inv.invoiceNo} — {inv.vendorName}</span>
                <span style={{ fontWeight: 600 }}>
                  {formatCurrency(Math.max(0, Number(inv.balanceDue ?? inv.totalAmount - (inv.paidAmount ?? 0))))}
                </span>
              </div>
            ))}
          </div>
          <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 500, marginBottom: "0.25rem" }}>
            Payment Method
          </label>
          <select
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value)}
            style={{ width: "100%", padding: "0.5rem", marginBottom: "1rem", border: "1px solid #d1d5db", borderRadius: "0.25rem" }}
          >
            <option value="Check">Check</option>
            <option value="ACH">ACH</option>
            <option value="Wire">Wire</option>
            <option value="Cash">Cash</option>
          </select>
          <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 500, marginBottom: "0.25rem" }}>
            Payment Date
          </label>
          <input
            type="date"
            value={paymentDate}
            onChange={(e) => setPaymentDate(e.target.value)}
            required
            style={{ width: "100%", padding: "0.5rem", marginBottom: "1rem", border: "1px solid #d1d5db", borderRadius: "0.25rem" }}
          />
          {paymentMethod === "Check" && (
            <>
              <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 500, marginBottom: "0.25rem" }}>
                Check Number
              </label>
              <input
                type="text"
                value={checkNo}
                onChange={(e) => setCheckNo(e.target.value)}
                style={{ width: "100%", padding: "0.5rem", marginBottom: "1rem", border: "1px solid #d1d5db", borderRadius: "0.25rem" }}
              />
              <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 500, marginBottom: "0.25rem" }}>
                Check Date
              </label>
              <input
                type="date"
                value={checkDate}
                onChange={(e) => setCheckDate(e.target.value)}
                style={{ width: "100%", padding: "0.5rem", marginBottom: "1rem", border: "1px solid #d1d5db", borderRadius: "0.25rem" }}
              />
            </>
          )}
          <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 500, marginBottom: "0.25rem" }}>
            Series
          </label>
          <input
            type="text"
            value={series}
            onChange={(e) => setSeries(e.target.value)}
            style={{ width: "100%", padding: "0.5rem", marginBottom: "1rem", border: "1px solid #d1d5db", borderRadius: "0.25rem" }}
          />
          <div style={{ marginBottom: "1rem" }}>
            <BankAccountSelect banks={banks} value={bankId} onChange={setBankId} loading={banksLoading} />
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
            <button type="button" onClick={onClose} disabled={loading} style={{ padding: "0.5rem 1rem", border: "1px solid #d1d5db", borderRadius: "0.375rem", background: "white" }}>
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              style={{ padding: "0.5rem 1rem", border: "none", borderRadius: "0.375rem", background: "#10b981", color: "white", fontWeight: 500 }}
            >
              {loading ? "Paying…" : `Pay ${formatCurrency(totalDue)}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const AccountsPayable: React.FC = () => {
  const { formatCurrency, formatDate } = useFormatting();
  const [invoices, setInvoices] = useState<VendorInvoiceSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState<APFilterOptions>({
    status: "All",
    dateRange: "This Month",
    amountRange: "All",
    approvalStatus: "All",
  });
  const [selectedInvoiceId, setSelectedInvoiceId] = useState(0);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [openPaymentOnLoad, setOpenPaymentOnLoad] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [showBulkPayment, setShowBulkPayment] = useState(false);
  const [bulkPaying, setBulkPaying] = useState(false);

  useEffect(() => {
    loadInvoices();
  }, [filters]);

  const invoiceMatchesDateRange = (dateStr: string, range: string) => {
    if (!dateStr) return true;
    const invDate = new Date(dateStr);
    if (isNaN(invDate.getTime())) return true;

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    switch (range) {
      case "This Week":
      case "Last 7 Days": {
        const sevenDaysAgo = new Date(today);
        sevenDaysAgo.setDate(today.getDate() - 7);
        return invDate >= sevenDaysAgo;
      }
      case "Last 30 Days": {
        const thirtyDaysAgo = new Date(today);
        thirtyDaysAgo.setDate(today.getDate() - 30);
        return invDate >= thirtyDaysAgo;
      }
      case "Last 90 Days": {
        const ninetyDaysAgo = new Date(today);
        ninetyDaysAgo.setDate(today.getDate() - 90);
        return invDate >= ninetyDaysAgo;
      }
      case "This Month": {
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        return invDate >= startOfMonth;
      }
      case "Last Month": {
        const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
        return invDate >= startOfLastMonth && invDate <= endOfLastMonth;
      }
      case "All":
      case "All Dates":
      default:
        return true;
    }
  };

  useEffect(() => {
    setSelectedIds((prev) =>
      prev.filter((id) => invoices.some((inv) => inv.id === id && !isVoid(inv) && !isPaid(inv)))
    );
  }, [invoices]);

  const loadInvoices = async () => {
    setLoading(true);
    try {
      const result = await VendorInvoiceService.GetVendorInvoicesDirect(
        filters.status === "All" ? "All" : filters.status.toLowerCase(),
        "",
        filters.vendorId,
        filters.dateRange
      );

      if (result) {
        let filteredInvoices = result;

        if (filters.approvalStatus !== "All") {
          filteredInvoices = filteredInvoices.filter((invoice) => {
            switch (filters.approvalStatus) {
              case "Approved":
                return isApprovedForPay(invoice) || isPaid(invoice);
              case "Pending":
                return isPendingApproval(invoice);
              case "Rejected":
                return isVoid(invoice);
              default:
                return true;
            }
          });
        }

        if (filters.dateRange && filters.dateRange !== "All") {
          filteredInvoices = filteredInvoices.filter((invoice) =>
            invoiceMatchesDateRange(invoice.invoiceDate, filters.dateRange)
          );
        }

        if (filters.amountRange !== "All") {
          filteredInvoices = filteredInvoices.filter((invoice) => {
            switch (filters.amountRange) {
              case "Under $1,000":
                return invoice.totalAmount < 1000;
              case "$1,000 - $10,000":
                return invoice.totalAmount >= 1000 && invoice.totalAmount < 10000;
              case "$10,000 - $50,000":
                return invoice.totalAmount >= 10000 && invoice.totalAmount < 50000;
              case "Over $50,000":
                return invoice.totalAmount >= 50000;
              default:
                return true;
            }
          });
        }

        setInvoices(filteredInvoices);
      }
    } catch (error) {
      console.error("Error loading AP invoices:", error);
      toast.error("Failed to load accounts payable data");
    } finally {
      setLoading(false);
    }
  };

  const pendingInvoices = useMemo(() => invoices.filter(isPendingApproval), [invoices]);
  const approvedPayable = useMemo(() => invoices.filter(isApprovedForPay), [invoices]);
  const selectedPending = useMemo(
    () => invoices.filter((inv) => selectedIds.includes(inv.id) && isPendingApproval(inv)),
    [invoices, selectedIds]
  );
  const selectedApproved = useMemo(
    () => invoices.filter((inv) => selectedIds.includes(inv.id) && isApprovedForPay(inv)),
    [invoices, selectedIds]
  );
  const selectableInvoices = useMemo(
    () => invoices.filter((inv) => !isVoid(inv) && !isPaid(inv)),
    [invoices]
  );
  const selectedSelectable = useMemo(
    () => invoices.filter((inv) => selectedIds.includes(inv.id) && !isVoid(inv) && !isPaid(inv)),
    [invoices, selectedIds]
  );

  const handleApproveInvoice = async (invoice: VendorInvoiceSummary) => {
    try {
      await VendorInvoiceService.ApproveVendorInvoice(invoice.id);
      toast.success(`Invoice ${invoice.invoiceNo} approved successfully`);
      loadInvoices();
    } catch (error: any) {
      console.error("Error approving invoice:", error);
      toast.error(error.message || "Failed to approve invoice");
    }
  };

  const handleRejectInvoice = async (invoice: VendorInvoiceSummary) => {
    if (!window.confirm(`Reject and void invoice ${invoice.invoiceNo}? This cannot be undone.`)) {
      return;
    }
    try {
      await VendorInvoiceService.VoidVendorInvoice(invoice.id);
      toast.success(`Invoice ${invoice.invoiceNo} rejected`);
      loadInvoices();
    } catch (error: any) {
      toast.error(error.message || "Failed to reject invoice");
    }
  };

  const openInvoiceDetail = (invoice: VendorInvoiceSummary, showPayment = false) => {
    if (showPayment && !isApprovedForPay(invoice)) {
      toast.info("Invoice must be approved before payment");
      return;
    }
    setSelectedInvoiceId(invoice.id);
    setOpenPaymentOnLoad(showPayment);
    setShowDetailModal(true);
  };

  const handlePayInvoice = (invoice: VendorInvoiceSummary) => {
    openInvoiceDetail(invoice, true);
  };

  const handleViewInvoice = (invoice: VendorInvoiceSummary) => {
    openInvoiceDetail(invoice, false);
  };

  const handleCloseDetailModal = (refresh?: boolean) => {
    setShowDetailModal(false);
    setSelectedInvoiceId(0);
    setOpenPaymentOnLoad(false);
    if (refresh) loadInvoices();
  };

  const handleBulkApprove = async () => {
    const targets = selectedPending.length > 0 ? selectedPending : pendingInvoices;
    if (targets.length === 0) {
      toast.info("No pending invoices to approve");
      return;
    }
    if (selectedPending.length === 0) {
      const ok = window.confirm(
        `Approve all ${targets.length} pending invoice${targets.length === 1 ? "" : "s"} in the current list?`
      );
      if (!ok) return;
    } else if (
      !window.confirm(`Approve ${targets.length} selected invoice${targets.length === 1 ? "" : "s"}?`)
    ) {
      return;
    }

    setBulkPaying(true);
    let success = 0;
    const errors: string[] = [];
    try {
      for (const invoice of targets) {
        try {
          await VendorInvoiceService.ApproveVendorInvoice(invoice.id);
          success += 1;
        } catch (err: any) {
          errors.push(`${invoice.invoiceNo}: ${err.message || "failed"}`);
        }
      }
      if (success > 0) toast.success(`Approved ${success} invoice${success === 1 ? "" : "s"}`);
      if (errors.length > 0) {
        toast.error(`Some approvals failed: ${errors.slice(0, 3).join("; ")}${errors.length > 3 ? "…" : ""}`);
      }
      setSelectedIds([]);
      await loadInvoices();
    } finally {
      setBulkPaying(false);
    }
  };

  const handleBulkPayApproved = () => {
    const targets = selectedApproved.length > 0 ? selectedApproved : approvedPayable;
    if (targets.length === 0) {
      toast.info("No approved unpaid invoices available to pay");
      return;
    }
    if (selectedApproved.length === 0) {
      const ok = window.confirm(
        `No rows selected. Pay all ${targets.length} approved invoice${targets.length === 1 ? "" : "s"} in the current list?`
      );
      if (!ok) return;
      setSelectedIds(targets.map((t) => t.id));
    }
    if (targets.length === 1) {
      openInvoiceDetail(targets[0], true);
      return;
    }
    setShowBulkPayment(true);
  };

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleSelectAll = () => {
    if (selectedSelectable.length === selectableInvoices.length && selectableInvoices.length > 0) {
      setSelectedIds([]);
    } else {
      setSelectedIds(selectableInvoices.map((inv) => inv.id));
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { color: string; bgColor: string; icon: any }> = {
      Paid: { color: "#065f46", bgColor: "#dcfce7", icon: faCheckCircle },
      "Partially Paid": { color: "#1d4ed8", bgColor: "#dbeafe", icon: faDollarSign },
      Approved: { color: "#059669", bgColor: "#d1fae5", icon: faCheckCircle },
      "Pending Approval": { color: "#d97706", bgColor: "#fef3c7", icon: faExclamationTriangle },
      Unpaid: { color: "#d97706", bgColor: "#fef3c7", icon: faExclamationTriangle },
      Overdue: { color: "#dc2626", bgColor: "#fef2f2", icon: faTimesCircle },
      Void: { color: "#6b7280", bgColor: "#e5e7eb", icon: faTimesCircle },
      Rejected: { color: "#dc2626", bgColor: "#fef2f2", icon: faTimesCircle },
    };

    const config = statusConfig[status] || { color: "#6b7280", bgColor: "#f3f4f6", icon: faExclamationTriangle };

    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "0.25rem",
          padding: "0.25rem 0.75rem",
          borderRadius: "0.375rem",
          fontSize: "0.75rem",
          fontWeight: "500",
          color: config.color,
          backgroundColor: config.bgColor,
        }}
      >
        <FontAwesomeIcon icon={config.icon} style={{ fontSize: "0.625rem" }} />
        {status}
      </span>
    );
  };

  const calculateTotals = () => {
    const openInvoices = invoices.filter((invoice) => !isVoid(invoice) && !isPaid(invoice));

    const totalAmount = openInvoices.reduce((sum, invoice) => sum + getOpenBalance(invoice), 0);
    const approvedAmount = openInvoices
      .filter(isApprovedForPay)
      .reduce((sum, invoice) => sum + getOpenBalance(invoice), 0);
    const pendingAmount = invoices
      .filter(isPendingApproval)
      .reduce((sum, invoice) => sum + getOpenBalance(invoice), 0);
    const overdueAmount = openInvoices
      .filter((invoice) => (invoice.daysOverdue ?? 0) > 0)
      .reduce((sum, invoice) => sum + getOpenBalance(invoice), 0);

    return { totalAmount, approvedAmount, pendingAmount, overdueAmount };
  };

  const totals = calculateTotals();
  const bulkPayTargets = selectedApproved.length > 0 ? selectedApproved : approvedPayable;

  return (
    <div style={{ padding: "1.5rem", width: "100%" }}>
      <div style={{ marginBottom: "2rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: "2rem", fontWeight: "bold", color: "#111827" }}>
              Accounts Payable (AP)
            </h1>
            <p style={{ margin: "0.5rem 0 0 0", color: "#6b7280" }}>
              Manage vendor invoices and payment approvals
            </p>
          </div>
          <div style={{ display: "flex", gap: "1rem" }}>
            <button
              onClick={handleBulkApprove}
              disabled={bulkPaying}
              style={{
                padding: "0.5rem 1rem",
                backgroundColor: "#059669",
                color: "white",
                border: "none",
                borderRadius: "0.375rem",
                cursor: bulkPaying ? "not-allowed" : "pointer",
                fontSize: "0.875rem",
                fontWeight: "500",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                opacity: bulkPaying ? 0.7 : 1,
              }}
            >
              <FontAwesomeIcon icon={faCheckCircle} />
              Bulk Approve
              {selectedPending.length > 0 ? ` (${selectedPending.length})` : ""}
            </button>
            <button
              onClick={handleBulkPayApproved}
              style={{
                padding: "0.5rem 1rem",
                backgroundColor: "#10b981",
                color: "white",
                border: "none",
                borderRadius: "0.375rem",
                cursor: "pointer",
                fontSize: "0.875rem",
                fontWeight: "500",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
              }}
            >
              <FontAwesomeIcon icon={faCreditCard} />
              Bulk Pay Approved
              {selectedApproved.length > 0 ? ` (${selectedApproved.length})` : ""}
            </button>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "1rem",
            marginBottom: "2rem",
          }}
        >
          <div style={{ backgroundColor: "white", borderRadius: "0.5rem", boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)", padding: "1rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <FontAwesomeIcon icon={faDollarSign} style={{ color: "#6b7280", fontSize: "1.25rem" }} />
              <div>
                <p style={{ margin: 0, fontSize: "0.875rem", color: "#6b7280" }}>Total AP</p>
                <p style={{ margin: "0.25rem 0 0 0", fontSize: "1.25rem", fontWeight: "bold", color: "#111827" }}>
                  {formatCurrency(totals.totalAmount)}
                </p>
              </div>
            </div>
          </div>

          <div style={{ backgroundColor: "white", borderRadius: "0.5rem", boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)", padding: "1rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <FontAwesomeIcon icon={faCheckCircle} style={{ color: "#10b981", fontSize: "1.25rem" }} />
              <div>
                <p style={{ margin: 0, fontSize: "0.875rem", color: "#6b7280" }}>Approved (open)</p>
                <p style={{ margin: "0.25rem 0 0 0", fontSize: "1.25rem", fontWeight: "bold", color: "#111827" }}>
                  {formatCurrency(totals.approvedAmount)}
                </p>
              </div>
            </div>
          </div>

          <div style={{ backgroundColor: "white", borderRadius: "0.5rem", boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)", padding: "1rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <FontAwesomeIcon icon={faExclamationTriangle} style={{ color: "#f59e0b", fontSize: "1.25rem" }} />
              <div>
                <p style={{ margin: 0, fontSize: "0.875rem", color: "#6b7280" }}>Pending</p>
                <p style={{ margin: "0.25rem 0 0 0", fontSize: "1.25rem", fontWeight: "bold", color: "#111827" }}>
                  {formatCurrency(totals.pendingAmount)}
                </p>
              </div>
            </div>
          </div>

          <div style={{ backgroundColor: "white", borderRadius: "0.5rem", boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)", padding: "1rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <FontAwesomeIcon icon={faTimesCircle} style={{ color: "#ef4444", fontSize: "1.25rem" }} />
              <div>
                <p style={{ margin: 0, fontSize: "0.875rem", color: "#6b7280" }}>Overdue</p>
                <p style={{ margin: "0.25rem 0 0 0", fontSize: "1.25rem", fontWeight: "bold", color: "#111827" }}>
                  {formatCurrency(totals.overdueAmount)}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div
        style={{
          backgroundColor: "white",
          borderRadius: "0.5rem",
          boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
          padding: "1.5rem",
          marginBottom: "1.5rem",
        }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <FontAwesomeIcon icon={faFilter} style={{ color: "#6b7280" }} />
            <span style={{ fontWeight: "500", color: "#374151" }}>Filters:</span>
          </div>

          <select
            value={filters.status}
            onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}
            style={{ padding: "0.5rem 1rem", border: "1px solid #d1d5db", borderRadius: "0.375rem", fontSize: "0.875rem" }}
          >
            <option value="All">All Status</option>
            <option value="Pending Approval">Pending Approval</option>
            <option value="Approved">Approved</option>
            <option value="Partially Paid">Partially Paid</option>
            <option value="Paid">Paid</option>
            <option value="Overdue">Overdue</option>
            <option value="Void">Void</option>
          </select>

          <select
            value={filters.approvalStatus}
            onChange={(e) => setFilters((prev) => ({ ...prev, approvalStatus: e.target.value }))}
            style={{ padding: "0.5rem 1rem", border: "1px solid #d1d5db", borderRadius: "0.375rem", fontSize: "0.875rem" }}
          >
            <option value="All">All Approvals</option>
            <option value="Approved">Approved</option>
            <option value="Pending">Pending</option>
            <option value="Rejected">Rejected</option>
          </select>

          <select
            value={filters.amountRange}
            onChange={(e) => setFilters((prev) => ({ ...prev, amountRange: e.target.value }))}
            style={{ padding: "0.5rem 1rem", border: "1px solid #d1d5db", borderRadius: "0.375rem", fontSize: "0.875rem" }}
          >
            <option value="All">All Amounts</option>
            <option value="Under $1,000">Under $1,000</option>
            <option value="$1,000 - $10,000">$1,000 - $10,000</option>
            <option value="$10,000 - $50,000">$10,000 - $50,000</option>
            <option value="Over $50,000">Over $50,000</option>
          </select>

          <select
            value={filters.dateRange}
            onChange={(e) => setFilters((prev) => ({ ...prev, dateRange: e.target.value }))}
            style={{ padding: "0.5rem 1rem", border: "1px solid #d1d5db", borderRadius: "0.375rem", fontSize: "0.875rem" }}
          >
            <option value="All">All Dates</option>
            <option value="This Week">This Week</option>
            <option value="This Month">This Month</option>
            <option value="Last 30 Days">Last 30 Days</option>
            <option value="Last 90 Days">Last 90 Days</option>
          </select>
        </div>
      </div>

      <div style={{ backgroundColor: "white", borderRadius: "0.5rem", boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)", overflow: "hidden" }}>
        <div
          style={{
            padding: "1.5rem",
            borderBottom: "1px solid #e5e7eb",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <h2 style={{ margin: 0, fontSize: "1.25rem", fontWeight: "600", color: "#111827" }}>
            Vendor Invoices ({invoices.length})
            {selectedSelectable.length > 0 && (
              <span style={{ marginLeft: "0.75rem", fontSize: "0.875rem", fontWeight: 500, color: "#6b7280" }}>
                {selectedSelectable.length} selected
              </span>
            )}
          </h2>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: "2rem" }}>
            <div>Loading accounts payable data...</div>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead style={{ backgroundColor: "#f9fafb" }}>
                <tr>
                  <th style={{ padding: "0.75rem 1rem", textAlign: "center", borderBottom: "1px solid #e5e7eb", width: 40 }}>
                    <input
                      type="checkbox"
                      checked={selectableInvoices.length > 0 && selectedSelectable.length === selectableInvoices.length}
                      onChange={toggleSelectAll}
                      disabled={selectableInvoices.length === 0}
                      title="Select all open invoices"
                    />
                  </th>
                  <th style={{ padding: "0.75rem 1.5rem", textAlign: "left", fontSize: "0.875rem", fontWeight: "600", color: "#374151", borderBottom: "1px solid #e5e7eb" }}>
                    Invoice
                  </th>
                  <th style={{ padding: "0.75rem 1.5rem", textAlign: "left", fontSize: "0.875rem", fontWeight: "600", color: "#374151", borderBottom: "1px solid #e5e7eb" }}>
                    Vendor
                  </th>
                  <th style={{ padding: "0.75rem 1.5rem", textAlign: "left", fontSize: "0.875rem", fontWeight: "600", color: "#374151", borderBottom: "1px solid #e5e7eb" }}>
                    Amount
                  </th>
                  <th style={{ padding: "0.75rem 1.5rem", textAlign: "left", fontSize: "0.875rem", fontWeight: "600", color: "#374151", borderBottom: "1px solid #e5e7eb" }}>
                    Due Date
                  </th>
                  <th style={{ padding: "0.75rem 1.5rem", textAlign: "center", fontSize: "0.875rem", fontWeight: "600", color: "#374151", borderBottom: "1px solid #e5e7eb" }}>
                    Status
                  </th>
                  <th style={{ padding: "0.75rem 1.5rem", textAlign: "center", fontSize: "0.875rem", fontWeight: "600", color: "#374151", borderBottom: "1px solid #e5e7eb" }}>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => (
                  <tr key={invoice.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                    <td style={{ padding: "1rem", textAlign: "center" }}>
                      {!isVoid(invoice) && !isPaid(invoice) ? (
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(invoice.id)}
                          onChange={() => toggleSelect(invoice.id)}
                        />
                      ) : null}
                    </td>
                    <td style={{ padding: "1rem 1.5rem" }}>
                      <div>
                        <div style={{ fontWeight: "500", color: "#111827", fontSize: "0.875rem" }}>{invoice.invoiceNo}</div>
                        <div style={{ fontSize: "0.75rem", color: "#6b7280" }}>{formatDate(invoice.invoiceDate)}</div>
                      </div>
                    </td>
                    <td style={{ padding: "1rem 1.5rem" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                        <FontAwesomeIcon icon={faBuilding} style={{ color: "#6b7280" }} />
                        <div>
                          <div style={{ fontWeight: "500", color: "#111827", fontSize: "0.875rem" }}>{invoice.vendorName}</div>
                          <div style={{ fontSize: "0.75rem", color: "#6b7280" }}>{invoice.vendorCode}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: "1rem 1.5rem" }}>
                      <div style={{ fontWeight: "600", color: "#111827", fontSize: "0.875rem" }}>
                        {formatCurrency(invoice.totalAmount)}
                      </div>
                    </td>
                    <td style={{ padding: "1rem 1.5rem" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <FontAwesomeIcon icon={faCalendar} style={{ color: "#6b7280", fontSize: "0.875rem" }} />
                        <span style={{ fontSize: "0.875rem", color: "#111827" }}>{formatDate(invoice.dueDate)}</span>
                      </div>
                      {invoice.daysOverdue && invoice.daysOverdue > 0 && !isVoid(invoice) && (
                        <div style={{ fontSize: "0.75rem", color: "#ef4444", marginTop: "0.25rem" }}>
                          {invoice.daysOverdue} days overdue
                        </div>
                      )}
                    </td>
                    <td style={{ padding: "1rem 1.5rem", textAlign: "center" }}>{getStatusBadge(invoice.status)}</td>
                    <td style={{ padding: "1rem 1.5rem", textAlign: "center" }}>
                      <div style={{ display: "flex", gap: "0.5rem", justifyContent: "center" }}>
                        <button
                          onClick={() => handleViewInvoice(invoice)}
                          style={{
                            padding: "0.25rem 0.5rem",
                            backgroundColor: "#3b82f6",
                            color: "white",
                            border: "none",
                            borderRadius: "0.25rem",
                            cursor: "pointer",
                            fontSize: "0.75rem",
                          }}
                          title="View Invoice"
                        >
                          <FontAwesomeIcon icon={faEye} />
                        </button>

                        {isPendingApproval(invoice) && (
                          <>
                            <button
                              onClick={() => handleApproveInvoice(invoice)}
                              style={{
                                padding: "0.25rem 0.5rem",
                                backgroundColor: "#10b981",
                                color: "white",
                                border: "none",
                                borderRadius: "0.25rem",
                                cursor: "pointer",
                                fontSize: "0.75rem",
                              }}
                              title="Approve Invoice"
                            >
                              <FontAwesomeIcon icon={faCheckCircle} />
                            </button>
                            <button
                              onClick={() => handleRejectInvoice(invoice)}
                              style={{
                                padding: "0.25rem 0.5rem",
                                backgroundColor: "#ef4444",
                                color: "white",
                                border: "none",
                                borderRadius: "0.25rem",
                                cursor: "pointer",
                                fontSize: "0.75rem",
                              }}
                              title="Reject Invoice"
                            >
                              <FontAwesomeIcon icon={faTimesCircle} />
                            </button>
                          </>
                        )}

                        {isApprovedForPay(invoice) && (
                          <button
                            onClick={() => handlePayInvoice(invoice)}
                            style={{
                              padding: "0.25rem 0.5rem",
                              backgroundColor: "#8b5cf6",
                              color: "white",
                              border: "none",
                              borderRadius: "0.25rem",
                              cursor: "pointer",
                              fontSize: "0.75rem",
                            }}
                            title="Pay Invoice"
                          >
                            <FontAwesomeIcon icon={faCreditCard} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {invoices.length === 0 && !loading && (
          <div style={{ textAlign: "center", padding: "2rem", color: "#6b7280" }}>
            No vendor invoices found matching the current filters.
          </div>
        )}
      </div>

      <VendorInvoiceDetailModal
        isOpen={showDetailModal}
        onClose={handleCloseDetailModal}
        invoiceId={selectedInvoiceId}
        initialShowPayment={openPaymentOnLoad}
        onPaymentComplete={loadInvoices}
        onInvoiceDeleted={loadInvoices}
      />

      {showBulkPayment && bulkPayTargets.length > 1 && (
        <BulkAPPaymentModal
          invoices={bulkPayTargets}
          onClose={() => setShowBulkPayment(false)}
          onComplete={() => {
            setShowBulkPayment(false);
            setSelectedIds([]);
            loadInvoices();
          }}
        />
      )}
    </div>
  );
};

export default AccountsPayable;
