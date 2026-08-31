import React, { useMemo, useState, useEffect } from "react";
import { toast } from "react-toastify";
import { faCheckCircle, faEnvelope, faDollarSign, faUser, faCalendar, faFilter, faEye, faCreditCard, faFileInvoice, faClock, faBan } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { InvoiceService, InvoiceSummary } from "../../Common/Services/InvoiceService";
import { useFormatting } from "../../Common/Hooks/useFormatting";
import { isEmailNotificationsEnabled } from "../../Common/Utils/settingsRuntime";
import CustomerInvoiceDetailModal from "../Orders/CustomerInvoiceDetailModal";
import BankAccountSelect from "../../Common/Components/BankAccountSelect";
import { useCompanyBanks } from "../../Common/Hooks/useCompanyBanks";

interface ARFilterOptions {
  status: string;
  customerId?: number;
  dateRange: string;
  amountRange: string;
  overdueStatus: string;
}

const canRecordPayment = (invoice: InvoiceSummary) => {
  const status = (invoice.status || "").toLowerCase();
  const isVoided = status.includes("void") || status === "cancelled";
  const isPaid = status === "paid" || (invoice.balanceDue !== undefined && invoice.balanceDue <= 0);
  return !isVoided && !isPaid;
};

const getOpenBalance = (invoice: InvoiceSummary) =>
  Math.max(0, Number(invoice.balanceDue ?? invoice.totalAmount - (invoice.paidAmount ?? 0)));

const isPaidInvoice = (invoice: InvoiceSummary) =>
  invoice.status === "Paid" || getOpenBalance(invoice) <= 0.009;

const isVoidInvoice = (invoice: InvoiceSummary) =>
  invoice.status === "Void" || (invoice.status || "").toLowerCase().includes("void");

interface BulkARPaymentModalProps {
  invoices: InvoiceSummary[];
  onClose: () => void;
  onComplete: () => void;
}

const BulkARPaymentModal: React.FC<BulkARPaymentModalProps> = ({ invoices, onClose, onComplete }) => {
  const { formatCurrency } = useFormatting();
  const [loading, setLoading] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("Check");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split("T")[0]);
  const [checkNo, setCheckNo] = useState("");
  const [notes, setNotes] = useState("");
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
          await InvoiceService.RecordCustomerPayment(invoice.id, {
            PaymentMethod: paymentMethod,
            PaymentDate: paymentDate,
            CheckNo: checkNo || undefined,
            PaymentAmount: balanceDue,
            Notes: notes || undefined,
            BankId: bankId,
          });
          success += 1;
        } catch (err: any) {
          errors.push(`${invoice.invoiceNo}: ${err.message || "failed"}`);
        }
      }

      if (success > 0) {
        toast.success(`Recorded payments for ${success} invoice${success === 1 ? "" : "s"}`);
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
          <h3 style={{ margin: 0 }}>Record Payments ({invoices.length})</h3>
          <p style={{ margin: "0.5rem 0 0", color: "#6b7280", fontSize: "0.875rem" }}>
            Total balance due: {formatCurrency(totalDue)}
          </p>
        </div>
        <form onSubmit={handleSubmit} style={{ padding: "1.5rem" }}>
          <div style={{ marginBottom: "1rem", maxHeight: "140px", overflowY: "auto", fontSize: "0.875rem" }}>
            {invoices.map((inv) => (
              <div key={inv.id} style={{ display: "flex", justifyContent: "space-between", padding: "0.25rem 0" }}>
                <span>{inv.invoiceNo} — {inv.customerName}</span>
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
            <option value="Credit Card">Credit Card</option>
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
            </>
          )}
          <div style={{ marginBottom: "1rem" }}>
            <BankAccountSelect banks={banks} value={bankId} onChange={setBankId} loading={banksLoading} />
          </div>
          <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 500, marginBottom: "0.25rem" }}>
            Notes
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            style={{ width: "100%", padding: "0.5rem", marginBottom: "1rem", border: "1px solid #d1d5db", borderRadius: "0.25rem" }}
          />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
            <button type="button" onClick={onClose} disabled={loading} style={{ padding: "0.5rem 1rem", border: "1px solid #d1d5db", borderRadius: "0.375rem", background: "white" }}>
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              style={{ padding: "0.5rem 1rem", border: "none", borderRadius: "0.375rem", background: "#10b981", color: "white", fontWeight: 500 }}
            >
              {loading ? "Recording…" : `Pay ${formatCurrency(totalDue)}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const AccountsReceivable: React.FC = () => {
  const { formatCurrency, formatDate } = useFormatting();
  const [invoices, setInvoices] = useState<InvoiceSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState<ARFilterOptions>({
    status: "All",
    dateRange: "This Month",
    amountRange: "All",
    overdueStatus: "All",
  });
  const [selectedInvoiceId, setSelectedInvoiceId] = useState(0);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [openPaymentOnLoad, setOpenPaymentOnLoad] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [showBulkPayment, setShowBulkPayment] = useState(false);

  useEffect(() => {
    loadInvoices();
  }, [filters]);

  useEffect(() => {
    setSelectedIds((prev) => prev.filter((id) => invoices.some((inv) => inv.id === id && canRecordPayment(inv))));
  }, [invoices]);

  const loadInvoices = async () => {
    setLoading(true);
    try {
      const result = await InvoiceService.GetAllInvoices(
        filters.status === "All" ? "All" : filters.status.toLowerCase(),
        "",
        filters.customerId,
        filters.dateRange
      );

      if (result) {
        let filteredInvoices = result;

        if (filters.overdueStatus !== "All") {
          filteredInvoices = filteredInvoices.filter((invoice) => {
            const isOverdue = invoice.daysOverdue && invoice.daysOverdue > 0;
            return (
              (filters.overdueStatus === "Overdue" && isOverdue) ||
              (filters.overdueStatus === "Current" && !isOverdue)
            );
          });
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
      console.error("Error loading AR invoices:", error);
      toast.error("Failed to load accounts receivable data");
    } finally {
      setLoading(false);
    }
  };

  const payableInvoices = useMemo(() => invoices.filter(canRecordPayment), [invoices]);
  const selectedPayable = useMemo(
    () => invoices.filter((inv) => selectedIds.includes(inv.id) && canRecordPayment(inv)),
    [invoices, selectedIds]
  );

  const handleSendReminder = (invoice: InvoiceSummary) => {
    if (!canRecordPayment(invoice)) {
      toast.info("Cannot send reminders for voided or paid invoices");
      return;
    }
    if (!isEmailNotificationsEnabled()) {
      toast.error("Email notifications are disabled in System Settings (General).");
      return;
    }
    toast.success(`Payment reminder sent to ${invoice.customerName} for invoice ${invoice.invoiceNo}`);
  };

  const openInvoiceDetail = (invoice: InvoiceSummary, showPayment = false) => {
    if (showPayment && !canRecordPayment(invoice)) {
      toast.info("Cannot record payment on a voided or paid invoice");
      return;
    }
    setSelectedInvoiceId(invoice.id);
    setOpenPaymentOnLoad(showPayment);
    setShowDetailModal(true);
  };

  const handleRecordPayment = (invoice: InvoiceSummary) => {
    const isVoided = !!(invoice.status && (invoice.status.toLowerCase().includes("void") || invoice.status.toLowerCase() === "cancelled"));
    if (isVoided) {
      toast.error("Cannot record payment for a voided invoice");
      return;
    }
    openInvoiceDetail(invoice, true);
  };

  const handleViewInvoice = (invoice: InvoiceSummary) => {
    openInvoiceDetail(invoice, false);
  };

  const handleCloseDetailModal = (refresh?: boolean) => {
    setShowDetailModal(false);
    setSelectedInvoiceId(0);
    setOpenPaymentOnLoad(false);
    if (refresh) loadInvoices();
  };

  const handleBulkReminders = () => {
    if (!isEmailNotificationsEnabled()) {
      toast.error("Email notifications are disabled in System Settings (General).");
      return;
    }
    const overdueInvoices = invoices.filter(
      (inv) => canRecordPayment(inv) && inv.daysOverdue && inv.daysOverdue > 0
    );
    if (overdueInvoices.length === 0) {
      toast.info("No overdue invoices to send reminders for");
      return;
    }

    toast.success(`Payment reminders sent to ${overdueInvoices.length} customers`);
  };

  const handleRecordPaymentsClick = () => {
    const targets = selectedPayable.length > 0 ? selectedPayable : payableInvoices;
    if (targets.length === 0) {
      toast.info("No unpaid invoices available to record payments");
      return;
    }
    if (selectedPayable.length === 0) {
      const ok = window.confirm(
        `No rows selected. Record payments for all ${targets.length} unpaid invoice${targets.length === 1 ? "" : "s"} in the current list?`
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

  const toggleSelectAllPayable = () => {
    if (selectedPayable.length === payableInvoices.length && payableInvoices.length > 0) {
      setSelectedIds([]);
    } else {
      setSelectedIds(payableInvoices.map((inv) => inv.id));
    }
  };

  const getStatusBadge = (status: string, daysOverdue?: number) => {
    let displayStatus = status;
    let color = "#6b7280";
    let bgColor = "#f3f4f6";
    let icon = faFileInvoice;

    if (status === "Void") {
      color = "#6b7280";
      bgColor = "#e5e7eb";
      icon = faBan;
    } else if (status === "Paid") {
      color = "#065f46";
      bgColor = "#dcfce7";
      icon = faCheckCircle;
    } else if (status === "Partially Paid") {
      color = "#1d4ed8";
      bgColor = "#dbeafe";
      icon = faClock;
      if (daysOverdue && daysOverdue > 0) {
        displayStatus = `Partial (${daysOverdue}d overdue)`;
      }
    } else if (daysOverdue && daysOverdue > 0) {
      displayStatus = `Overdue (${daysOverdue}d)`;
      color = "#dc2626";
      bgColor = "#fef2f2";
      icon = faCalendar;
    } else if (status === "Unpaid") {
      color = "#d97706";
      bgColor = "#fef3c7";
      icon = faClock;
    }

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
          color: color,
          backgroundColor: bgColor,
        }}
      >
        <FontAwesomeIcon icon={icon} style={{ fontSize: "0.625rem" }} />
        {displayStatus}
      </span>
    );
  };

  const calculateTotals = () => {
    const openInvoices = invoices.filter((invoice) => !isVoidInvoice(invoice) && !isPaidInvoice(invoice));

    const totalAmount = openInvoices.reduce((sum, invoice) => sum + getOpenBalance(invoice), 0);
    const paidAmount = invoices
      .filter(isPaidInvoice)
      .reduce((sum, invoice) => sum + invoice.totalAmount, 0);
    const unpaidAmount = totalAmount;
    const overdueAmount = openInvoices
      .filter((invoice) => (invoice.daysOverdue ?? 0) > 0)
      .reduce((sum, invoice) => sum + getOpenBalance(invoice), 0);

    return { totalAmount, paidAmount, unpaidAmount, overdueAmount };
  };

  const totals = calculateTotals();
  const bulkTargets = selectedPayable.length > 0 ? selectedPayable : payableInvoices;

  return (
    <div style={{ padding: "1.5rem", width: "100%" }}>
      <div style={{ marginBottom: "2rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: "2rem", fontWeight: "bold", color: "#111827" }}>
              Accounts Receivable (AR)
            </h1>
            <p style={{ margin: "0.5rem 0 0 0", color: "#6b7280" }}>
              Manage customer invoices and collections
            </p>
          </div>
          <div style={{ display: "flex", gap: "1rem" }}>
            <button
              onClick={handleBulkReminders}
              style={{
                padding: "0.5rem 1rem",
                backgroundColor: "#f59e0b",
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
              <FontAwesomeIcon icon={faEnvelope} />
              Send Bulk Reminders
            </button>
            <button
              onClick={handleRecordPaymentsClick}
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
              Record Payments
              {selectedPayable.length > 0 ? ` (${selectedPayable.length})` : ""}
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
                <p style={{ margin: 0, fontSize: "0.875rem", color: "#6b7280" }}>Total AR</p>
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
                <p style={{ margin: 0, fontSize: "0.875rem", color: "#6b7280" }}>Collected</p>
                <p style={{ margin: "0.25rem 0 0 0", fontSize: "1.25rem", fontWeight: "bold", color: "#111827" }}>
                  {formatCurrency(totals.paidAmount)}
                </p>
              </div>
            </div>
          </div>

          <div style={{ backgroundColor: "white", borderRadius: "0.5rem", boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)", padding: "1rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <FontAwesomeIcon icon={faClock} style={{ color: "#f59e0b", fontSize: "1.25rem" }} />
              <div>
                <p style={{ margin: 0, fontSize: "0.875rem", color: "#6b7280" }}>Outstanding</p>
                <p style={{ margin: "0.25rem 0 0 0", fontSize: "1.25rem", fontWeight: "bold", color: "#111827" }}>
                  {formatCurrency(totals.unpaidAmount)}
                </p>
              </div>
            </div>
          </div>

          <div style={{ backgroundColor: "white", borderRadius: "0.5rem", boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)", padding: "1rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <FontAwesomeIcon icon={faCalendar} style={{ color: "#ef4444", fontSize: "1.25rem" }} />
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
            <option value="Paid">Paid</option>
            <option value="Unpaid">Unpaid</option>
            <option value="Partially Paid">Partially Paid</option>
            <option value="Overdue">Overdue</option>
            <option value="Void">Void</option>
          </select>

          <select
            value={filters.overdueStatus}
            onChange={(e) => setFilters((prev) => ({ ...prev, overdueStatus: e.target.value }))}
            style={{ padding: "0.5rem 1rem", border: "1px solid #d1d5db", borderRadius: "0.375rem", fontSize: "0.875rem" }}
          >
            <option value="All">All Aging</option>
            <option value="Current">Current</option>
            <option value="Overdue">Overdue</option>
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
            Customer Invoices ({invoices.length})
            {selectedPayable.length > 0 && (
              <span style={{ marginLeft: "0.75rem", fontSize: "0.875rem", fontWeight: 500, color: "#6b7280" }}>
                {selectedPayable.length} selected
              </span>
            )}
          </h2>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: "2rem" }}>
            <div>Loading accounts receivable data...</div>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead style={{ backgroundColor: "#f9fafb" }}>
                <tr>
                  <th style={{ padding: "0.75rem 1rem", textAlign: "center", borderBottom: "1px solid #e5e7eb", width: 40 }}>
                    <input
                      type="checkbox"
                      checked={payableInvoices.length > 0 && selectedPayable.length === payableInvoices.length}
                      onChange={toggleSelectAllPayable}
                      disabled={payableInvoices.length === 0}
                      title="Select all unpaid"
                    />
                  </th>
                  <th style={{ padding: "0.75rem 1.5rem", textAlign: "left", fontSize: "0.875rem", fontWeight: "600", color: "#374151", borderBottom: "1px solid #e5e7eb" }}>
                    Invoice
                  </th>
                  <th style={{ padding: "0.75rem 1.5rem", textAlign: "left", fontSize: "0.875rem", fontWeight: "600", color: "#374151", borderBottom: "1px solid #e5e7eb" }}>
                    Customer
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
                      {canRecordPayment(invoice) ? (
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
                        <FontAwesomeIcon icon={faUser} style={{ color: "#6b7280" }} />
                        <div>
                          <div style={{ fontWeight: "500", color: "#111827", fontSize: "0.875rem" }}>{invoice.customerName}</div>
                          <div style={{ fontSize: "0.75rem", color: "#6b7280" }}>{invoice.customerCode}</div>
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
                      {invoice.daysOverdue && invoice.daysOverdue > 0 && invoice.status !== "Void" && (
                        <div style={{ fontSize: "0.75rem", color: "#ef4444", marginTop: "0.25rem" }}>
                          {invoice.daysOverdue} days overdue
                        </div>
                      )}
                    </td>
                    <td style={{ padding: "1rem 1.5rem", textAlign: "center" }}>
                      {getStatusBadge(invoice.status, invoice.daysOverdue)}
                    </td>
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

                        {canRecordPayment(invoice) && (
                          <>
                            <button
                              onClick={() => handleSendReminder(invoice)}
                              style={{
                                padding: "0.25rem 0.5rem",
                                backgroundColor: "#f59e0b",
                                color: "white",
                                border: "none",
                                borderRadius: "0.25rem",
                                cursor: "pointer",
                                fontSize: "0.75rem",
                              }}
                              title="Send Reminder"
                            >
                              <FontAwesomeIcon icon={faEnvelope} />
                            </button>
                            <button
                              onClick={() => handleRecordPayment(invoice)}
                              style={{
                                padding: "0.25rem 0.5rem",
                                backgroundColor: "#10b981",
                                color: "white",
                                border: "none",
                                borderRadius: "0.25rem",
                                cursor: "pointer",
                                fontSize: "0.75rem",
                              }}
                              title="Record Payment"
                            >
                              <FontAwesomeIcon icon={faCreditCard} />
                            </button>
                          </>
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
            No customer invoices found matching the current filters.
          </div>
        )}
      </div>

      <CustomerInvoiceDetailModal
        isOpen={showDetailModal}
        onClose={handleCloseDetailModal}
        invoiceId={selectedInvoiceId}
        initialShowPayment={openPaymentOnLoad}
        onPaymentComplete={loadInvoices}
        onInvoiceDeleted={loadInvoices}
      />

      {showBulkPayment && bulkTargets.length > 1 && (
        <BulkARPaymentModal
          invoices={bulkTargets}
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

export default AccountsReceivable;
