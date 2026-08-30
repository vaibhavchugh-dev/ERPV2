import React, { useState, useEffect, useRef } from "react";
import { useLocation, useHistory } from "react-router-dom";
import { toast } from "react-toastify";
import { faEye, faPrint, faCreditCard, faBan, faFileInvoice, faCalendar, faDollarSign } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import MasterListPage from "../../Common/Components/MasterListPage/MasterListPage";
import { CustomerInvoicesService, CustomerInvoiceSummary } from "../../Common/Services/CustomerInvoicesService";
import { InvoiceService } from "../../Common/Services/InvoiceService";
import { PdfService } from "../../Common/Services/PdfService";
import CustomerInvoiceDetailModal from "./CustomerInvoiceDetailModal";
import CustomerOrderSlideout from "./CustomerOrderSlideout";
import BankAccountSelect from "../../Common/Components/BankAccountSelect";
import { useCompanyBanks } from "../../Common/Hooks/useCompanyBanks";
import { useFormatting } from "../../Common/Hooks/useFormatting";
import { useSiteListFilter } from "../../Common/Hooks/useSiteListFilter";

// Customer Payment Modal Component
interface CustomerPaymentModalProps {
  invoice: CustomerInvoiceSummary;
  onClose: () => void;
  onPaymentComplete: () => void;
}

const CustomerPaymentModal: React.FC<CustomerPaymentModalProps> = ({ invoice, onClose, onPaymentComplete }) => {
  const { formatCurrency, formatDate } = useFormatting();
  const [loading, setLoading] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('Check');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [checkNo, setCheckNo] = useState('');
  const invoiceTotal = invoice.totalAmount ?? invoice.amount;
  const balanceDue = Math.max(
    0,
    Number(invoice.balanceDue ?? invoiceTotal - (invoice.paidAmount ?? 0))
  );
  const [paymentAmount, setPaymentAmount] = useState(
    balanceDue > 0 ? balanceDue.toFixed(2) : invoiceTotal.toFixed(2)
  );
  const [notes, setNotes] = useState('');
  const { banks, bankId, setBankId, loading: banksLoading } = useCompanyBanks();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!paymentMethod.trim()) {
      toast.error('Payment method is required');
      return;
    }

    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error('Valid payment amount is required');
      return;
    }

    if (amount > balanceDue + 0.009) {
      toast.error(`Payment amount cannot exceed remaining balance of $${balanceDue.toFixed(2)}`);
      return;
    }

    if (!bankId) {
      toast.error('Please select a bank account');
      return;
    }

    setLoading(true);

    try {
      const paymentData = {
        PaymentMethod: paymentMethod,
        PaymentDate: paymentDate,
        CheckNo: checkNo || undefined,
        PaymentAmount: amount,
        Notes: notes || undefined,
        BankId: bankId
      };

      await InvoiceService.RecordCustomerPayment(invoice.id, paymentData);

      toast.success(`Payment of $${amount.toFixed(2)} recorded for invoice ${invoice.invoiceNo}`);
      onPaymentComplete();
    } catch (error: any) {
      console.error('Payment recording failed:', error);
      toast.error(error.message || 'Failed to record payment');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="modal-overlay"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="modal-content"
        style={{
          background: 'white',
          borderRadius: '0.5rem',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
          maxWidth: '500px',
          width: '90%',
          maxHeight: '80vh',
          overflow: 'auto',
          position: 'relative',
          zIndex: 10001
        }}
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <div className="modal-header" style={{
          padding: '1.5rem',
          borderBottom: '1px solid #e5e7eb',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 'bold' }}>
            Record Customer Payment - {invoice.invoiceNo}
          </h3>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '1.5rem',
              cursor: 'pointer',
              color: '#6b7280'
            }}
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body" style={{ padding: '1.5rem' }}>
            {/* Invoice Summary */}
            <div style={{
              backgroundColor: '#f9fafb',
              padding: '1rem',
              borderRadius: '0.375rem',
              marginBottom: '1.5rem'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: '600', fontSize: '0.875rem', color: '#1f2937' }}>
                    {invoice.customerName}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                    Invoice #{invoice.invoiceNo}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: '600', fontSize: '1rem', color: '#1f2937' }}>
                    Balance: {formatCurrency(balanceDue)}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                    Total: {formatCurrency(invoiceTotal)}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                    Due: {formatDate(invoice.dueDate)}
                  </div>
                </div>
              </div>
            </div>

            {/* Payment Details */}
            <div style={{ marginBottom: '1.5rem' }}>
              <h4 style={{ margin: '0 0 1rem 0', fontSize: '1rem', fontWeight: '600' }}>
                Payment Information
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '500', marginBottom: '0.25rem' }}>
                    Payment Method <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <select
                    required
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.25rem',
                      fontSize: '0.875rem'
                    }}
                  >
                    <option value="Check">Check</option>
                    <option value="Cash">Cash</option>
                    <option value="Wire Transfer">Wire Transfer</option>
                    <option value="Credit Card">Credit Card</option>
                    <option value="ACH">ACH</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '500', marginBottom: '0.25rem' }}>
                    Payment Date
                  </label>
                  <input
                    type="date"
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.25rem',
                      fontSize: '0.875rem'
                    }}
                  />
                </div>
              </div>

              <div style={{ marginTop: '1rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '500', marginBottom: '0.25rem' }}>
                      Payment Amount <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max={balanceDue}
                      required
                      value={paymentAmount}
                      onChange={(e) => setPaymentAmount(e.target.value)}
                      placeholder="Enter payment amount"
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.25rem',
                        fontSize: '0.875rem'
                      }}
                    />
                  </div>
                  {paymentMethod === 'Check' && (
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '500', marginBottom: '0.25rem' }}>
                        Check Number
                      </label>
                      <input
                        type="text"
                        value={checkNo}
                        onChange={(e) => setCheckNo(e.target.value)}
                        placeholder="Enter check number"
                        style={{
                          width: '100%',
                          padding: '0.5rem',
                          border: '1px solid #d1d5db',
                          borderRadius: '0.25rem',
                          fontSize: '0.875rem'
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>

              <div style={{ marginTop: '1rem' }}>
                <BankAccountSelect
                  banks={banks}
                  value={bankId}
                  onChange={setBankId}
                  loading={banksLoading}
                />
              </div>

              <div style={{ marginTop: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '500', marginBottom: '0.25rem' }}>
                  Notes
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional payment notes..."
                  rows={2}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.25rem',
                    fontSize: '0.875rem',
                    resize: 'vertical'
                  }}
                />
              </div>
            </div>
          </div>

          <div className="modal-footer" style={{
            padding: '1.5rem',
            borderTop: '1px solid #e5e7eb',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '0.75rem'
          }}>
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: '#ffffff',
                color: '#374151',
                border: '1px solid #d1d5db',
                borderRadius: '0.375rem',
                cursor: loading ? 'not-allowed' : 'pointer',
                fontSize: '0.875rem',
                fontWeight: '500'
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: loading ? '#9ca3af' : '#10b981',
                color: 'white',
                border: 'none',
                borderRadius: '0.375rem',
                cursor: loading ? 'not-allowed' : 'pointer',
                fontSize: '0.875rem',
                fontWeight: '500'
              }}
            >
              {loading ? 'Recording...' : 'Record Payment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

interface FilterOptions {
  status: string;
  customerId?: number;
  dateRange: string;
  searchTerm: string;
}

const CustomerInvoices: React.FC = () => {
  const location = useLocation();
  const history = useHistory();
  const returnToRef = useRef<string | null>(null);
  const { formatCurrency, formatDate } = useFormatting();
  const { locationIdParam, masterListFilter } = useSiteListFilter();
  const [invoices, setInvoices] = useState<CustomerInvoiceSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState<FilterOptions>({
    status: 'All',
    dateRange: 'Last 30 Days',
    searchTerm: ''
  });

  // Modal states
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<number>(0);

  // Slideout states
  const [showOrderSlideout, setShowOrderSlideout] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<number>(0);

  // Payment modal state
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedInvoiceForPayment, setSelectedInvoiceForPayment] = useState<CustomerInvoiceSummary | null>(null);

  useEffect(() => {
    loadInvoices();
  }, [filters, locationIdParam]);

  // Handle URL parameter to open invoice (from global search / dashboard)
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const openId = params.get('open');
    if (openId) {
      const id = parseInt(openId, 10);
      if (!isNaN(id) && id > 0) {
        const returnTo = (location.state as { returnTo?: string } | null)?.returnTo;
        returnToRef.current = returnTo || null;
        setSelectedInvoiceId(id);
        setShowDetailModal(true);
        history.replace(location.pathname, returnTo ? { returnTo } : undefined);
      }
    }
  }, [location.search, history, location.pathname, location.state]);

  // Listen for custom event from global search
  useEffect(() => {
    const handleOpenEntity = (event: CustomEvent) => {
      if (event.detail.type === 'invoice') {
        setSelectedInvoiceId(event.detail.id);
        setShowDetailModal(true);
      }
    };

    window.addEventListener('openEntity', handleOpenEntity as EventListener);
    return () => {
      window.removeEventListener('openEntity', handleOpenEntity as EventListener);
    };
  }, []);

  const loadInvoices = async () => {
    setLoading(true);
    try {
      const result = await CustomerInvoicesService.GetAllInvoices(
        filters.status,
        filters.searchTerm,
        filters.customerId,
        filters.dateRange,
        locationIdParam
      );

      if (result && Array.isArray(result)) {
        setInvoices(result);
      } else {
        setInvoices([]);
      }
    } catch (error: any) {
      console.error("Error loading invoices:", error);
      toast.error(`Error loading invoices: ${error.message || "Unknown error"}`);
      setInvoices([]);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string, daysOverdue?: number) => {
    const statusLower = status.toLowerCase();

    if (statusLower === 'paid') {
      return <span className="badge badge-success">Paid</span>;
    } else if (statusLower === 'partially paid') {
      return (
        <span className="badge badge-info">
          Partially Paid{daysOverdue && daysOverdue > 0 ? ` · ${daysOverdue}d overdue` : ''}
        </span>
      );
    } else if (statusLower === 'overdue' || (daysOverdue && daysOverdue > 0)) {
      return <span className="badge badge-danger">Overdue {daysOverdue ? `(${daysOverdue}d)` : ''}</span>;
    } else if (statusLower === 'void') {
      return <span className="badge badge-secondary">Void</span>;
    } else {
      return <span className="badge badge-warning">Unpaid</span>;
    }
  };

  const handleViewInvoice = (invoice: CustomerInvoiceSummary) => {
    setSelectedInvoiceId(invoice.id);
    setShowDetailModal(true);
  };

  const handleCloseDetailModal = (refresh?: boolean) => {
    setShowDetailModal(false);
    setSelectedInvoiceId(0);
    if (refresh) {
      loadInvoices();
    }
    const returnTo = returnToRef.current || (location.state as { returnTo?: string } | null)?.returnTo;
    if (returnTo) {
      returnToRef.current = null;
      history.push(returnTo);
    }
  };

  const handleNavigateToOrder = (orderId: number) => {
    if (orderId) {
      setSelectedOrderId(orderId);
      setShowOrderSlideout(true);
    }
  };

  const handleCloseOrderSlideout = () => {
    setShowOrderSlideout(false);
    setSelectedOrderId(0);
  };

  const handlePayInvoice = (invoice: CustomerInvoiceSummary) => {
    const isVoided = !!(invoice.status && (invoice.status.toLowerCase().includes("void") || invoice.status.toLowerCase() === "cancelled"));
    if (isVoided) {
      toast.error("Cannot record payment for a voided invoice");
      return;
    }
    setSelectedInvoiceForPayment(invoice);
    setShowPaymentModal(true);
  };

  const handlePrintInvoice = async (invoice: CustomerInvoiceSummary) => {
    if (!invoice?.id) {
      toast.error("Invoice not loaded");
      return;
    }

    try {
      const blob = await PdfService.GenerateInvoice(invoice.id);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `Invoice_${invoice.invoiceNo || invoice.id}_${new Date().toISOString().split("T")[0]}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success("Invoice PDF generated successfully");
    } catch (error: any) {
      console.error("Error generating invoice PDF:", error);
      toast.error(error.response?.data?.error || "Failed to generate invoice PDF");
    }
  };

  const handleVoidInvoice = async (invoice: CustomerInvoiceSummary) => {
    if (!window.confirm(`Void invoice ${invoice.invoiceNo}? This cannot be undone.`)) {
      return;
    }
    try {
      await CustomerInvoicesService.VoidInvoice(invoice.id);
      toast.success(`Invoice ${invoice.invoiceNo} voided`);
      loadInvoices();
    } catch (error: any) {
      toast.error(error.message || "Failed to void invoice");
    }
  };

  const handleFilterChange = (filterType: keyof FilterOptions, value: any) => {
    setFilters(prev => ({
      ...prev,
      [filterType]: value
    }));
  };

  const columns = [
    {
      key: "invoiceNo",
      label: "Invoice #",
      sortable: true,
      align: "left" as const,
      render: (value: any, row: CustomerInvoiceSummary) => (
        <button
          className="link-button"
          onClick={() => handleViewInvoice(row)}
          style={{
            background: 'none',
            border: 'none',
            color: '#2563eb',
            cursor: 'pointer',
            textDecoration: 'underline',
            fontWeight: '500'
          }}
        >
          {value}
        </button>
      ),
    },
    {
      key: "orderNumber",
      label: "Order #",
      sortable: true,
      align: "left" as const,
      render: (value: any, row: CustomerInvoiceSummary) => {
        if (!value) {
          return <span>-</span>;
        }

        return (
          <button
            className="link-button"
            onClick={() => handleNavigateToOrder(row.orderId)}
            style={{
              background: 'none',
              border: 'none',
              color: '#2563eb',
              cursor: 'pointer',
              textDecoration: 'underline',
              fontWeight: '500',
              padding: 0
            }}
          >
            {value}
          </button>
        );
      },
    },
    {
      key: "customerName",
      label: "Customer",
      sortable: true,
      align: "left" as const,
    },
    {
      key: "invoiceDate",
      label: "Invoice Date",
      sortable: true,
      align: "left" as const,
      render: (value: any) => formatDate(value),
    },
    {
      key: "dueDate",
      label: "Due Date",
      sortable: true,
      align: "left" as const,
      render: (value: any) => formatDate(value),
    },
    {
      key: "totalAmount",
      label: "Amount",
      sortable: true,
      align: "right" as const,
      render: (value: any) => formatCurrency(value),
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      align: "center" as const,
      render: (value: any, row: CustomerInvoiceSummary) => getStatusBadge(value, row.daysOverdue),
    },
    {
      key: "actions",
      label: "Actions",
      align: "center" as const,
      render: (value: any, row: CustomerInvoiceSummary) => (
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
          <button
            type="button"
            onClick={() => handleViewInvoice(row)}
            title="View Invoice"
            style={{
              padding: "0.25rem 0.5rem",
              backgroundColor: "#3b82f6",
              color: "white",
              border: "none",
              borderRadius: "0.25rem",
              cursor: "pointer",
              fontSize: "0.75rem",
            }}
          >
            <FontAwesomeIcon icon={faEye} />
          </button>
          {(() => {
            const isVoided = !!(row.status && (row.status.toLowerCase().includes("void") || row.status.toLowerCase() === "cancelled"));
            const isPaid = row.status?.toLowerCase() === 'paid' || (row.balanceDue !== undefined && row.balanceDue <= 0);

            if (isPaid || isVoided) return null;

            return (
              <button
                type="button"
                onClick={() => handlePayInvoice(row)}
                title="Pay Invoice"
                style={{
                  padding: "0.25rem 0.5rem",
                  backgroundColor: "#10b981",
                  color: "white",
                  border: "none",
                  borderRadius: "0.25rem",
                  cursor: "pointer",
                  fontSize: "0.75rem",
                }}
              >
                <FontAwesomeIcon icon={faCreditCard} />
              </button>
            );
          })()}
          <button
            type="button"
            onClick={() => handlePrintInvoice(row)}
            title="Print Invoice"
            style={{
              padding: "0.25rem 0.5rem",
              backgroundColor: "#6b7280",
              color: "white",
              border: "none",
              borderRadius: "0.25rem",
              cursor: "pointer",
              fontSize: "0.75rem",
            }}
          >
            <FontAwesomeIcon icon={faPrint} />
          </button>
          {row.status === 'Unpaid' && (
            <button
              type="button"
              onClick={() => handleVoidInvoice(row)}
              title="Void Invoice"
              style={{
                padding: "0.25rem 0.5rem",
                backgroundColor: "#ef4444",
                color: "white",
                border: "none",
                borderRadius: "0.25rem",
                cursor: "pointer",
                fontSize: "0.75rem",
              }}
            >
              <FontAwesomeIcon icon={faBan} />
            </button>
          )}
        </div>
      ),
    },
  ];

  const statusOptions = [
    { value: 'All', label: 'All Statuses' },
    { value: 'Unpaid', label: 'Unpaid' },
    { value: 'Paid', label: 'Paid' },
    { value: 'Overdue', label: 'Overdue' },
    { value: 'Void', label: 'Void' }
  ];

  const dateRangeOptions = [
    { value: 'All', label: 'All Dates' },
    { value: 'This Week', label: 'This Week' },
    { value: 'Last 7 Days', label: 'Last 7 Days' },
    { value: 'Last 30 Days', label: 'Last 30 Days' },
    { value: 'Last 90 Days', label: 'Last 90 Days' },
    { value: 'This Month', label: 'This Month' },
    { value: 'Last Month', label: 'Last Month' }
  ];

  return (
    <div style={{ padding: "1rem" }}>
      <MasterListPage
        title="Customer Invoices"
        subtitle="Manage all customer invoices across orders"
        data={invoices}
        columns={columns}
        loading={loading}
        enablePagination
        searchPlaceholder="Search by invoice #, order #, customer..."
        searchFields={["invoiceNo", "orderNumber", "customerName", "customerCode"]}
        filters={[
          masterListFilter,
          {
            label: "Status",
            options: statusOptions,
            value: filters.status,
            onChange: (value) => handleFilterChange('status', value)
          },
          {
            label: "Date Range",
            options: dateRangeOptions,
            value: filters.dateRange,
            onChange: (value) => handleFilterChange('dateRange', value)
          }
        ]}
        emptyMessage="No customer invoices found"
      />

      {/* Invoice Detail Modal */}
      <CustomerInvoiceDetailModal
        isOpen={showDetailModal}
        onClose={handleCloseDetailModal}
        invoiceId={selectedInvoiceId}
        onPaymentComplete={loadInvoices}
        onInvoiceDeleted={loadInvoices}
      />

      {/* Order Slideout */}
      {showOrderSlideout && (
        <CustomerOrderSlideout
          orderId={selectedOrderId}
          onClose={handleCloseOrderSlideout}
        />
      )}

      {/* Customer Payment Modal */}
      {showPaymentModal && selectedInvoiceForPayment && (
        <CustomerPaymentModal
          invoice={selectedInvoiceForPayment}
          onClose={() => {
            setShowPaymentModal(false);
            setSelectedInvoiceForPayment(null);
          }}
          onPaymentComplete={() => {
            setShowPaymentModal(false);
            setSelectedInvoiceForPayment(null);
            loadInvoices(); // Refresh the list
          }}
        />
      )}
    </div>
  );
};

export default CustomerInvoices;

// Ensure this file is treated as a module
export {};