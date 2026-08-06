import React, { useState, useEffect } from "react";
import { useLocation, useHistory } from "react-router-dom";
import { toast } from "react-toastify";
import { faFileInvoiceDollar, faPlus, faSearch, faFilter, faEye, faPrint, faCreditCard, faBan } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import MasterListPage from "../../Common/Components/MasterListPage/MasterListPage";
import { VendorInvoiceService, VendorInvoiceSummary } from "../../Common/Services/VendorInvoiceService";
import VendorInvoiceDetailModal from "./VendorInvoiceDetailModal";
import VendorOrderSlideout from "./VendorOrderSlideout";
import BankAccountSelect from "../../Common/Components/BankAccountSelect";
import { useCompanyBanks } from "../../Common/Hooks/useCompanyBanks";

// Payment Modal Component
interface PaymentModalProps {
  invoice: VendorInvoiceSummary;
  onClose: () => void;
  onPaymentComplete: () => void;
}

const PaymentModal: React.FC<PaymentModalProps> = ({ invoice, onClose, onPaymentComplete }) => {
  const [loading, setLoading] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('Check');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [checkNo, setCheckNo] = useState('');
  const [checkDate, setCheckDate] = useState(new Date().toISOString().split('T')[0]);
  const [pvrNo, setPvrNo] = useState('');
  const [series, setSeries] = useState('AP');
  const { banks, bankId, setBankId, loading: banksLoading } = useCompanyBanks();
  const balanceDue = Math.max(
    0,
    Number(invoice.balanceDue ?? invoice.totalAmount - (invoice.paidAmount ?? 0))
  );
  const [paymentAmount, setPaymentAmount] = useState(
    balanceDue > 0 ? balanceDue.toFixed(2) : invoice.totalAmount.toFixed(2)
  );

  const formatDate = (dateStr: string): string => {
    if (!dateStr) return '';
    try {
      return new Date(dateStr).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch {
      return dateStr;
    }
  };

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

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
        CheckDate: checkDate || undefined,
        PvrNo: pvrNo ? parseInt(pvrNo) : undefined,
        Series: series || undefined,
        BankId: bankId,
        PaymentAmount: amount
      };

      await VendorInvoiceService.RecordVendorPayment(invoice.id, paymentData);

      toast.success(
        amount + 0.009 < balanceDue
          ? `Partial payment of $${amount.toFixed(2)} recorded for invoice ${invoice.invoiceNo}`
          : `Payment recorded for invoice ${invoice.invoiceNo}`
      );
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
            Record Payment - {invoice.invoiceNo}
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
                    {invoice.vendorName}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                    Invoice #{invoice.invoiceNo}
                  </div>
                  {(invoice.paidAmount ?? 0) > 0 && (
                    <div style={{ fontSize: '0.75rem', color: '#059669' }}>
                      Paid: {formatCurrency(invoice.paidAmount ?? 0)}
                    </div>
                  )}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: '600', fontSize: '1rem', color: '#1f2937' }}>
                    Balance: {formatCurrency(balanceDue)}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                    Total: {formatCurrency(invoice.totalAmount)}
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
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '500', marginBottom: '0.25rem' }}>
                    Payment Amount <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={balanceDue}
                    required
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.25rem',
                      fontSize: '0.875rem'
                    }}
                  />
                </div>
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
                    <option value="Wire Transfer">Wire Transfer</option>
                    <option value="ACH">ACH</option>
                    <option value="Cash">Cash</option>
                    <option value="Credit Card">Credit Card</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
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

              {(paymentMethod === 'Check' || paymentMethod === 'Credit Card') && (
                <div style={{ marginTop: '1rem' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '500', marginBottom: '0.25rem' }}>
                        {paymentMethod === 'Check' ? 'Check Number' : 'Reference Number'}
                      </label>
                      <input
                        type="text"
                        value={checkNo}
                        onChange={(e) => setCheckNo(e.target.value)}
                        placeholder={paymentMethod === 'Check' ? 'Enter check number' : 'Enter reference number'}
                        style={{
                          width: '100%',
                          padding: '0.5rem',
                          border: '1px solid #d1d5db',
                          borderRadius: '0.25rem',
                          fontSize: '0.875rem'
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '500', marginBottom: '0.25rem' }}>
                        {paymentMethod === 'Check' ? 'Check Date' : 'Transaction Date'}
                      </label>
                      <input
                        type="date"
                        value={checkDate}
                        onChange={(e) => setCheckDate(e.target.value)}
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
                </div>
              )}

              <div style={{ marginTop: '1rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '500', marginBottom: '0.25rem' }}>
                      PVR Number
                    </label>
                    <input
                      type="text"
                      value={pvrNo}
                      onChange={(e) => setPvrNo(e.target.value)}
                      placeholder="Enter PVR number"
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.25rem',
                        fontSize: '0.875rem'
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '500', marginBottom: '0.25rem' }}>
                      Series
                    </label>
                    <input
                      type="text"
                      value={series}
                      onChange={(e) => setSeries(e.target.value)}
                      placeholder="AP"
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.25rem',
                        fontSize: '0.875rem'
                      }}
                    />
                  </div>
                  <BankAccountSelect
                    banks={banks}
                    value={bankId}
                    onChange={setBankId}
                    loading={banksLoading}
                  />
                </div>
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
  dateRange: string;
  vendorId?: number;
  searchTerm: string;
}

const VendorInvoices: React.FC = () => {
  const location = useLocation();
  const history = useHistory();
  const [invoices, setInvoices] = useState<VendorInvoiceSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState<FilterOptions>({
    status: 'All',
    dateRange: 'Last 30 Days',
    searchTerm: ''
  });
  const [showFilters, setShowFilters] = useState(false);

  // Handle URL parameter to open modal (from global search)
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const openId = params.get('open');
    if (openId) {
      const id = parseInt(openId, 10);
      if (!isNaN(id) && id > 0) {
        setSelectedInvoiceId(id);
        setShowDetailModal(true);
        history.replace(location.pathname);
      }
    }
  }, [location.search, history, location.pathname]);

  // Modal states
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<number>(0);

  // Slideout states
  const [showOrderSlideout, setShowOrderSlideout] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<number>(0);

  useEffect(() => {
    loadInvoices();
  }, [filters]);

  const loadInvoices = async () => {
    setLoading(true);
    try {
      console.log("[VendorInvoices] Loading invoices with filters:", filters);
      const result = await VendorInvoiceService.GetAllVendorInvoices(
        filters.status,
        "",
        undefined,
        filters.dateRange
      );

      console.log("[VendorInvoices] API result:", result);
      if (result) {
        setInvoices(result);
        console.log(`[VendorInvoices] Loaded ${result.length} invoices`);
      } else {
        setInvoices([]);
        console.log("[VendorInvoices] No invoices returned from API");
      }
    } catch (error: any) {
      console.error("[VendorInvoices] Error loading invoices:", error);
      toast.error(`Error loading invoices: ${error.message || "Unknown error"}`);
      setInvoices([]);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const formatDate = (dateStr: string): string => {
    if (!dateStr) return '';
    try {
      return new Date(dateStr).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch {
      return dateStr;
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
      return <span className="badge badge-warning">{status || 'Unpaid'}</span>;
    }
  };

  const handleViewInvoice = (invoice: VendorInvoiceSummary) => {
    setSelectedInvoiceId(invoice.id);
    setShowDetailModal(true);
  };

  const handleCloseDetailModal = () => {
    setShowDetailModal(false);
    setSelectedInvoiceId(0);
  };

  const handleCloseOrderSlideout = () => {
    setShowOrderSlideout(false);
    setSelectedOrderId(0);
  };

  const handleNavigateToOrder = (orderId: number) => {
    if (orderId) {
      setSelectedOrderId(orderId);
      setShowOrderSlideout(true);
    }
  };

  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedInvoiceForPayment, setSelectedInvoiceForPayment] = useState<VendorInvoiceSummary | null>(null);

  const handlePayInvoice = (invoice: VendorInvoiceSummary) => {
    if (!invoice.isApproved && invoice.status !== 'Partially Paid') {
      toast.info('Approve this invoice before recording payment');
      return;
    }
    setSelectedInvoiceForPayment(invoice);
    setShowPaymentModal(true);
  };

  const handlePrintInvoice = (invoice: VendorInvoiceSummary) => {
    // TODO: Open print modal
    toast.info(`Printing invoice ${invoice.invoiceNo}`);
  };

  const handleVoidInvoice = (invoice: VendorInvoiceSummary) => {
    // TODO: Void invoice (only if unpaid)
    toast.info(`Voiding invoice ${invoice.invoiceNo}`);
  };

  const handleNewInvoice = () => {
    // Redirect to vendor orders page with a helpful message
    toast.info("To create a new vendor invoice, go to Vendor Orders and create an invoice from an existing order with received items.", {
      autoClose: 5000
    });
    // Optionally navigate to vendor orders
    // history.push('/purchasing/vendor-orders');
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
      render: (value: any, row: VendorInvoiceSummary) => (
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
      key: "vendorName",
      label: "Vendor",
      sortable: true,
      align: "left" as const,
    },
    {
      key: "orderNumber",
      label: "Order #",
      sortable: true,
      align: "left" as const,
      render: (value: any, row: VendorInvoiceSummary) => {
        if (!value || value === 'Multiple Orders') {
          return <span>{value || '-'}</span>;
        }

        // Extract order ID from VO# format (e.g., "VO#1003" -> 1003)
        const orderId = row.orderId;

        if (orderId) {
          return (
            <button
              className="link-button"
              onClick={() => handleNavigateToOrder(orderId)}
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
        }

        return <span>{value}</span>;
      },
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
      render: (value: any, row: VendorInvoiceSummary) => getStatusBadge(value, row.daysOverdue),
    },
    {
      key: "actions",
      label: "Actions",
      align: "center" as const,
      render: (value: any, row: VendorInvoiceSummary) => (
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
          {row.status !== 'Paid' && row.status !== 'Void' && (row.isApproved || row.status === 'Partially Paid') && (
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
          )}
          {row.status !== 'Paid' && row.status !== 'Void' && !row.isApproved && row.status !== 'Partially Paid' && (
            <button
              type="button"
              disabled
              title="Approve invoice before payment"
              style={{
                padding: "0.25rem 0.5rem",
                backgroundColor: "#d1d5db",
                color: "#6b7280",
                border: "none",
                borderRadius: "0.25rem",
                cursor: "not-allowed",
                fontSize: "0.75rem",
              }}
            >
              <FontAwesomeIcon icon={faCreditCard} />
            </button>
          )}
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
    { value: 'Partially Paid', label: 'Partially Paid' },
    { value: 'Paid', label: 'Paid' },
    { value: 'Overdue', label: 'Overdue' },
    { value: 'Void', label: 'Void' }
  ];

  const dateRangeOptions = [
    { value: 'All', label: 'All Dates' },
    { value: 'Last 7 Days', label: 'Last 7 Days' },
    { value: 'Last 30 Days', label: 'Last 30 Days' },
    { value: 'This Month', label: 'This Month' },
    { value: 'Last Month', label: 'Last Month' },
    { value: 'Custom', label: 'Custom Range' }
  ];

  return (
    <div style={{ padding: "1rem" }}>
      <MasterListPage
        title="Vendor Invoices"
        subtitle="Manage all vendor invoices across orders"
        data={invoices}
        columns={columns}
        loading={loading}
        onAdd={handleNewInvoice}
        addButtonLabel="New Invoice"
        searchPlaceholder="Search by invoice #, vendor, or order #..."
        searchFields={["invoiceNo", "vendorName", "vendorCode", "orderNumber"]}
        filters={[
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
        emptyMessage="No vendor invoices found"
      />

      {/* Invoice Detail Modal */}
      <VendorInvoiceDetailModal
        isOpen={showDetailModal}
        onClose={handleCloseDetailModal}
        invoiceId={selectedInvoiceId}
        onPaymentComplete={loadInvoices}
      />

      {/* Vendor Order Slideout */}
      {showOrderSlideout && (
        <VendorOrderSlideout
          orderId={selectedOrderId}
          onClose={handleCloseOrderSlideout}
        />
      )}

      {/* Payment Modal */}
      {showPaymentModal && selectedInvoiceForPayment && (
        <PaymentModal
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

export default VendorInvoices;
