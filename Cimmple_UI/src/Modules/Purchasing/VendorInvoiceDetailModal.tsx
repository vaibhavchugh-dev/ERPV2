import React, { useState, useEffect, useRef } from 'react';
import { toast } from 'react-toastify';
import { faTimes, faPrint, faCreditCard, faBan, faFileInvoice, faCalendar, faDollarSign, faHashtag, faUser, faClipboardList, faTrash, faExclamationTriangle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { VendorInvoiceService, VendorInvoice, RecordVendorPaymentRequest } from '../../Common/Services/VendorInvoiceService';
import { PdfService } from '../../Common/Services/PdfService';
import DeletionImpactDialog, { DeletionImpactResult } from '../../Common/Components/DeletionImpactDialog';
import BankAccountSelect from '../../Common/Components/BankAccountSelect';
import { useCompanyBanks } from '../../Common/Hooks/useCompanyBanks';
import { useFormatting } from '../../Common/Hooks/useFormatting';

// Payment Modal Component
interface PaymentModalProps {
  invoice: {
    id: number;
    invoiceNo: string;
    vendorName: string;
    vendorCode: string;
    orderNumber: string;
    invoiceDate: string;
    dueDate: string;
    amount: number;
    totalAmount: number;
    paidAmount?: number;
    balanceDue?: number;
    status: string;
    paymentMethod?: string;
  };
  onClose: () => void;
  onPaymentComplete: () => void;
}

const PaymentModal: React.FC<PaymentModalProps> = ({ invoice, onClose, onPaymentComplete }) => {
  const { formatCurrency } = useFormatting();
  const [loading, setLoading] = useState(false);
  const normalizePaymentMethod = (method?: string): string => {
    const raw = (method || '').trim();
    if (!raw) return 'Check';
    const lower = raw.toLowerCase();
    if (lower === 'wire' || lower === 'wire transfer') return 'Wire Transfer';
    if (lower === 'ach') return 'ACH';
    if (lower === 'cash') return 'Cash';
    if (lower === 'credit card' || lower === 'card') return 'Credit Card';
    if (lower === 'check' || lower === 'cheque') return 'Check';
    return raw;
  };
  const [paymentMethod, setPaymentMethod] = useState(normalizePaymentMethod(invoice.paymentMethod));
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
      toast.error(`Payment amount cannot exceed remaining balance of ${formatCurrency(balanceDue)}`);
      return;
    }

    if (!bankId) {
      toast.error('Please select a bank account');
      return;
    }

    setLoading(true);

    try {
      const paymentData: RecordVendorPaymentRequest = {
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
          ? `Partial payment of ${formatCurrency(amount)} recorded for invoice ${invoice.invoiceNo}`
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
            Record Vendor Payment - {invoice.invoiceNo}
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
                    Due: {new Date(invoice.dueDate).toLocaleDateString()}
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

interface VendorInvoiceDetailModalProps {
  isOpen: boolean;
  onClose: (refresh?: boolean) => void;
  invoiceId: number;
  /** When true, opens the payment form after the invoice loads */
  initialShowPayment?: boolean;
  onPaymentComplete?: () => void;
  onInvoiceDeleted?: () => void;
}

const VendorInvoiceDetailModal: React.FC<VendorInvoiceDetailModalProps> = ({
  isOpen,
  onClose,
  invoiceId,
  initialShowPayment = false,
  onPaymentComplete,
  onInvoiceDeleted
}) => {
  const { formatCurrency, formatDate } = useFormatting();
  const [invoice, setInvoice] = useState<VendorInvoice | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showDeletionDialog, setShowDeletionDialog] = useState(false);
  const [deletionImpact, setDeletionImpact] = useState<DeletionImpactResult | null>(null);
  const paymentPromptedRef = useRef(false);

  useEffect(() => {
    if (!isOpen) {
      setInvoice(null);
      setShowPaymentModal(false);
      paymentPromptedRef.current = false;
      return;
    }
    if (invoiceId) {
      setInvoice(null);
      setShowPaymentModal(false);
      paymentPromptedRef.current = false;
      loadInvoiceDetails();
    }
  }, [isOpen, invoiceId]);

  useEffect(() => {
    if (
      isOpen &&
      initialShowPayment &&
      !paymentPromptedRef.current &&
      invoice &&
      invoice.id === invoiceId &&
      invoice.isApproved &&
      invoice.status !== 'Paid' &&
      invoice.status !== 'Void'
    ) {
      paymentPromptedRef.current = true;
      setShowPaymentModal(true);
    }
  }, [isOpen, initialShowPayment, invoiceId, invoice?.id, invoice?.status, invoice?.isApproved]);

  const loadInvoiceDetails = async () => {
    if (!invoiceId) return;

    setLoading(true);
    try {
      const result = await VendorInvoiceService.GetVendorInvoiceDetails(invoiceId);

      if (result) {
        setInvoice(result);
      } else {
        toast.error('Invoice not found or failed to load');
        setInvoice(null);
      }
    } catch (error: any) {
      console.error('Error loading invoice details:', error);
      toast.error(`Error loading invoice details: ${error.message || 'Unknown error'}`);
      setInvoice(null);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusLower = status.toLowerCase();

    if (statusLower === 'paid') {
      return <span className="badge badge-success">Paid</span>;
    } else if (statusLower === 'partially paid') {
      return <span className="badge badge-info">Partially Paid</span>;
    } else if (statusLower === 'void') {
      return (
        <span
          className="badge badge-secondary"
          style={{
            backgroundColor: '#4b5563',
            color: '#ffffff',
            fontWeight: 600,
            padding: '0.25rem 0.625rem',
            borderRadius: '0.25rem'
          }}
        >
          Void
        </span>
      );
    } else if (statusLower === 'overdue') {
      return <span className="badge badge-danger">Overdue</span>;
    } else if (statusLower === 'approved') {
      return <span className="badge badge-success">Approved</span>;
    } else {
      return <span className="badge badge-warning">{status || 'Unpaid'}</span>;
    }
  };

  const handlePayInvoice = () => {
    if (!invoice) return;
    const isVoided = !!(invoice.status && (invoice.status.toLowerCase().includes("void") || invoice.status.toLowerCase() === "cancelled"));
    if (isVoided) {
      toast.error("Cannot record payment for a voided invoice");
      return;
    }
    if (!invoice.isApproved) {
      toast.error("Invoice must be approved before payment can be recorded");
      return;
    }
    setShowPaymentModal(true);
  };

  const handlePrintInvoice = async () => {
    if (!invoice?.id) {
      toast.error('Invoice not loaded');
      return;
    }

    const toastId = toast.info('Generating vendor invoice PDF… this may take a moment.', {
      autoClose: false,
    });
    try {
      const blob = await PdfService.GenerateVendorInvoice(invoice.id);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `VendorInvoice_${invoice.invoiceNo}_${new Date().toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.update(toastId, {
        render: 'Vendor invoice PDF generated successfully',
        type: 'success',
        autoClose: 3000,
      });
    } catch (error: any) {
      console.error('Error generating vendor invoice PDF:', error);
      toast.update(toastId, {
        render: error.response?.data?.error || 'Failed to generate vendor invoice PDF',
        type: 'error',
        autoClose: 5000,
      });
    }
  };

  const handleVoidInvoice = async () => {
    if (!invoice?.id) return;
    if (!window.confirm(`Void invoice ${invoice.invoiceNo}? This cannot be undone.`)) {
      return;
    }
    try {
      await VendorInvoiceService.VoidVendorInvoice(invoice.id);
      toast.success(`Invoice ${invoice.invoiceNo} voided`);
      loadInvoiceDetails();
      onPaymentComplete?.();
    } catch (error: any) {
      toast.error(error.message || 'Failed to void invoice');
    }
  };

  const handleDeleteInvoice = async () => {
    if (!invoice?.id) return;
    // For vendor invoices, we'll use a simple impact result since there's no backend endpoint yet
    const impact: DeletionImpactResult = {
      canDelete: true,
      blockingReasons: [],
      blockingDependencies: [],
      willBeDeleted: [
        {
          entityType: "Invoice",
          count: 1,
          description: "This vendor invoice will be deleted"
        }
      ],
      willBeAffected: [],
      warnings: [
        "This action cannot be undone",
        "Any related AP bill journal entry will be reversed automatically"
      ]
    };
    setDeletionImpact(impact);
    setShowDeletionDialog(true);
  };

  const confirmDeletion = async () => {
    if (!invoice?.id) return;
    setLoading(true);
    try {
      await VendorInvoiceService.DeleteVendorInvoice(invoice.id);
      toast.success("Vendor invoice deleted successfully");
      setShowDeletionDialog(false);
      setDeletionImpact(null);
      onInvoiceDeleted?.();
      onPaymentComplete?.();
      onClose(true);
    } catch (error: any) {
      console.error("Error deleting vendor invoice:", error);
      toast.error(`Error deleting vendor invoice: ${error.message || "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  };

  const handlePaymentComplete = () => {
    setShowPaymentModal(false);
    // Reload invoice details to show updated status
    loadInvoiceDetails();
    onPaymentComplete?.();
  };

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 1050,
      padding: '1rem'
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '0.5rem',
        boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)',
        maxWidth: '900px',
        width: '100%',
        maxHeight: '90vh',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* Header */}
        <div style={{
          padding: '1.5rem',
          borderBottom: '1px solid #e5e7eb',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: '#f9fafb'
        }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 'bold', color: '#111827' }}>
              <FontAwesomeIcon icon={faFileInvoice} style={{ marginRight: '0.5rem', color: '#3b82f6' }} />
              Invoice Details
            </h3>
            {invoice && (
              <p style={{ margin: '0.25rem 0 0 0', color: '#6b7280', fontSize: '0.875rem' }}>
                {invoice.invoiceNo} • {invoice.vendorName || 'Vendor'}
                {invoice.status && (
                  <span style={{ marginLeft: '1rem' }}>
                    {getStatusBadge(invoice.status)}
                  </span>
                )}
                {invoice.isApproved && !['paid', 'void', 'approved'].includes((invoice.status || '').toLowerCase()) && (
                  <span style={{ marginLeft: '0.5rem' }}>
                    <span className="badge badge-success">Approved</span>
                  </span>
                )}
              </p>
            )}
          </div>
          <button
            onClick={() => onClose()}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '1.25rem',
              cursor: 'pointer',
              color: '#6b7280',
              padding: '0.25rem',
              borderRadius: '0.25rem'
            }}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f3f4f6'}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>

        {/* Content */}
        <div style={{
          flex: 1,
          overflow: 'auto',
          padding: '1.5rem'
        }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '2rem' }}>
              <div>Loading invoice details...</div>
            </div>
          ) : !invoice ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
              Invoice not found
            </div>
          ) : (
            <div>
              {/* Unapproved Warning Alert Banner */}
              {invoice.status !== 'Paid' && invoice.status !== 'Void' && !invoice.isApproved && (
                <div style={{
                  backgroundColor: '#fef3c7',
                  border: '1px solid #f59e0b',
                  borderRadius: '0.375rem',
                  padding: '0.75rem 1rem',
                  marginBottom: '1.5rem',
                  display: 'flex',
                  alignItems: 'center',
                  color: '#92400e',
                  fontSize: '0.875rem',
                  fontWeight: 500
                }}>
                  <FontAwesomeIcon icon={faExclamationTriangle} style={{ marginRight: '0.625rem', color: '#d97706', fontSize: '1rem' }} />
                  <span><strong>Awaiting Approval:</strong> This invoice requires approval before payment can be recorded.</span>
                </div>
              )}

              {/* Invoice Header Info */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '1rem',
                marginBottom: '2rem'
              }}>
                <div style={{
                  padding: '1rem',
                  backgroundColor: '#f9fafb',
                  borderRadius: '0.5rem',
                  border: '1px solid #e5e7eb'
                }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    <FontAwesomeIcon icon={faHashtag} style={{ marginRight: '0.25rem' }} />
                    Invoice Number
                  </label>
                  <p style={{ margin: '0.25rem 0 0 0', fontSize: '1rem', fontWeight: '600', color: '#111827' }}>
                    {invoice.invoiceNo}
                  </p>
                </div>

                <div style={{
                  padding: '1rem',
                  backgroundColor: '#f9fafb',
                  borderRadius: '0.5rem',
                  border: '1px solid #e5e7eb'
                }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    <FontAwesomeIcon icon={faCalendar} style={{ marginRight: '0.25rem' }} />
                    Invoice Date
                  </label>
                  <p style={{ margin: '0.25rem 0 0 0', fontSize: '1rem', fontWeight: '600', color: '#111827' }}>
                    {formatDate(invoice.invoiceDate)}
                  </p>
                </div>

                <div style={{
                  padding: '1rem',
                  backgroundColor: '#f9fafb',
                  borderRadius: '0.5rem',
                  border: '1px solid #e5e7eb'
                }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    <FontAwesomeIcon icon={faCalendar} style={{ marginRight: '0.25rem' }} />
                    Due Date
                  </label>
                  <p style={{ margin: '0.25rem 0 0 0', fontSize: '1rem', fontWeight: '600', color: '#111827' }}>
                    {formatDate(invoice.dueDate)}
                  </p>
                </div>

                <div style={{
                  padding: '1rem',
                  backgroundColor: '#f9fafb',
                  borderRadius: '0.5rem',
                  border: '1px solid #e5e7eb'
                }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    <FontAwesomeIcon icon={faDollarSign} style={{ marginRight: '0.25rem' }} />
                    Total Amount
                  </label>
                  <p style={{ margin: '0.25rem 0 0 0', fontSize: '1.25rem', fontWeight: '700', color: '#059669' }}>
                    {formatCurrency(invoice.totalAmount)}
                  </p>
                  {(invoice.paidAmount ?? 0) > 0 && (
                    <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.875rem', color: '#6b7280' }}>
                      Paid {formatCurrency(invoice.paidAmount ?? 0)} · Due{' '}
                      {formatCurrency(
                        invoice.balanceDue ??
                          Math.max(0, invoice.totalAmount - (invoice.paidAmount ?? 0))
                      )}
                    </p>
                  )}
                </div>
              </div>

              {/* Vendor & Order Information */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '2rem',
                marginBottom: '2rem'
              }}>
                <div style={{
                  padding: '1.5rem',
                  backgroundColor: '#f9fafb',
                  borderRadius: '0.5rem',
                  border: '1px solid #e5e7eb'
                }}>
                  <h4 style={{
                    margin: '0 0 1rem 0',
                    fontSize: '1rem',
                    fontWeight: '600',
                    color: '#111827',
                    display: 'flex',
                    alignItems: 'center'
                  }}>
                    <FontAwesomeIcon icon={faUser} style={{ marginRight: '0.5rem', color: '#3b82f6' }} />
                    Vendor Information
                  </h4>
                  <div style={{ display: 'grid', gap: '0.5rem' }}>
                    <div>
                      <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>Vendor:</span>
                      <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.875rem', fontWeight: '500', color: '#111827' }}>
                        {invoice.vendorName || '—'}
                      </p>
                    </div>
                    <div>
                      <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>Vendor Code:</span>
                      <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.875rem', fontWeight: '500', color: '#111827' }}>
                        {invoice.vendorCode || '—'}
                      </p>
                    </div>
                  </div>
                </div>

                <div style={{
                  padding: '1.5rem',
                  backgroundColor: '#f9fafb',
                  borderRadius: '0.5rem',
                  border: '1px solid #e5e7eb'
                }}>
                  <h4 style={{
                    margin: '0 0 1rem 0',
                    fontSize: '1rem',
                    fontWeight: '600',
                    color: '#111827',
                    display: 'flex',
                    alignItems: 'center'
                  }}>
                    <FontAwesomeIcon icon={faClipboardList} style={{ marginRight: '0.5rem', color: '#3b82f6' }} />
                    Order Information
                  </h4>
                  <div style={{ display: 'grid', gap: '0.5rem' }}>
                    <div>
                      <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>Order:</span>
                      <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.875rem', fontWeight: '500', color: '#111827' }}>
                        {invoice.orderId != null ? `Order ${invoice.orderId}` : '—'}
                      </p>
                    </div>
                    <div>
                      <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>Payment Method:</span>
                      <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.875rem', fontWeight: '500', color: '#111827' }}>
                        {invoice.paymentMethod || 'Not specified'}
                      </p>
                    </div>
                    <div>
                      <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>Approval:</span>
                      <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.875rem', fontWeight: '500', color: '#111827' }}>
                        {invoice.isApproved ? 'Approved' : 'Pending approval'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Invoice Items */}
              <div style={{ marginBottom: '2rem' }}>
                <h4 style={{
                  margin: '0 0 1rem 0',
                  fontSize: '1rem',
                  fontWeight: '600',
                  color: '#111827',
                  display: 'flex',
                  alignItems: 'center'
                }}>
                  <FontAwesomeIcon icon={faClipboardList} style={{ marginRight: '0.5rem', color: '#3b82f6' }} />
                  Invoice Items
                </h4>
                <div style={{
                  border: '1px solid #e5e7eb',
                  borderRadius: '0.5rem',
                  overflow: 'hidden'
                }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead style={{ backgroundColor: '#f9fafb' }}>
                      <tr>
                        <th style={{ padding: '0.75rem', textAlign: 'left', fontSize: '0.875rem', fontWeight: '600', color: '#374151', borderBottom: '1px solid #e5e7eb' }}>
                          Description
                        </th>
                        <th style={{ padding: '0.75rem', textAlign: 'right', fontSize: '0.875rem', fontWeight: '600', color: '#374151', borderBottom: '1px solid #e5e7eb' }}>
                          Qty
                        </th>
                        <th style={{ padding: '0.75rem', textAlign: 'right', fontSize: '0.875rem', fontWeight: '600', color: '#374151', borderBottom: '1px solid #e5e7eb' }}>
                          Amount
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoice.items.map((item, index) => (
                        <tr key={index} style={{ borderBottom: '1px solid #f3f4f6' }}>
                          <td style={{ padding: '0.75rem', fontSize: '0.875rem', color: '#111827' }}>
                            {item.description}
                          </td>
                          <td style={{ padding: '0.75rem', textAlign: 'right', fontSize: '0.875rem', color: '#111827' }}>
                            {item.qtyInvoiced}
                          </td>
                          <td style={{ padding: '0.75rem', textAlign: 'right', fontSize: '0.875rem', color: '#111827', fontWeight: '500' }}>
                            {formatCurrency(item.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot style={{ backgroundColor: '#f9fafb', borderTop: '2px solid #e5e7eb' }}>
                      <tr>
                        <td colSpan={2} style={{ padding: '0.75rem', textAlign: 'right', fontSize: '0.875rem', fontWeight: '600', color: '#111827' }}>
                          Subtotal:
                        </td>
                        <td style={{ padding: '0.75rem', textAlign: 'right', fontSize: '0.875rem', fontWeight: '600', color: '#111827' }}>
                          {formatCurrency(invoice.amount)}
                        </td>
                      </tr>
                      {((invoice.taxAmount ?? 0) > 0 || (invoice.freightCharge ?? 0) > 0) && (
                        <>
                          {(invoice.taxAmount ?? 0) > 0 && (
                            <tr>
                              <td colSpan={2} style={{ padding: '0.75rem', textAlign: 'right', fontSize: '0.875rem', color: '#111827' }}>
                                Tax:
                              </td>
                              <td style={{ padding: '0.75rem', textAlign: 'right', fontSize: '0.875rem', color: '#111827' }}>
                                {formatCurrency(invoice.taxAmount ?? 0)}
                              </td>
                            </tr>
                          )}
                          {(invoice.freightCharge ?? 0) > 0 && (
                            <tr>
                              <td colSpan={2} style={{ padding: '0.75rem', textAlign: 'right', fontSize: '0.875rem', color: '#111827' }}>
                                Freight:
                              </td>
                              <td style={{ padding: '0.75rem', textAlign: 'right', fontSize: '0.875rem', color: '#111827' }}>
                                {formatCurrency(invoice.freightCharge ?? 0)}
                              </td>
                            </tr>
                          )}
                        </>
                      )}
                      <tr style={{ borderTop: '1px solid #e5e7eb' }}>
                        <td colSpan={2} style={{ padding: '0.75rem', textAlign: 'right', fontSize: '0.875rem', fontWeight: '700', color: '#111827' }}>
                          Total:
                        </td>
                        <td style={{ padding: '0.75rem', textAlign: 'right', fontSize: '0.875rem', fontWeight: '700', color: '#059669' }}>
                          {formatCurrency(invoice.totalAmount)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {invoice && (
          <div style={{
            padding: '1rem 1.5rem',
            borderTop: '1px solid #e5e7eb',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: '#f9fafb'
          }}>
            <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
              Invoice {invoice.invoiceNo} • {invoice.items.length} item{invoice.items.length !== 1 ? 's' : ''} • {formatCurrency(invoice.totalAmount)}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {(() => {
                const isVoided = !!(invoice.status && (invoice.status.toLowerCase().includes("void") || invoice.status.toLowerCase() === "cancelled"));
                const isPaid = invoice.status?.toLowerCase() === 'paid' || (invoice.balanceDue !== undefined && invoice.balanceDue <= 0);

                if (isPaid || isVoided || !invoice.isApproved) return null;

                return (
                  <button
                    onClick={handlePayInvoice}
                    style={{
                      padding: '0.5rem 1rem',
                      backgroundColor: '#10b981',
                      color: 'white',
                      border: 'none',
                      borderRadius: '0.375rem',
                      cursor: 'pointer',
                      fontSize: '0.875rem',
                      fontWeight: '500',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem'
                    }}
                  >
                    <FontAwesomeIcon icon={faCreditCard} />
                    Record Payment
                  </button>
                );
              })()}
              <button
                onClick={handlePrintInvoice}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: '#6b7280',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.375rem',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: '500',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}
              >
                <FontAwesomeIcon icon={faPrint} />
                Print
              </button>
              {invoice.status === 'Unpaid' && (
                <button
                  onClick={handleVoidInvoice}
                  style={{
                    padding: '0.5rem 1rem',
                    backgroundColor: '#ef4444',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.375rem',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    fontWeight: '500',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem'
                  }}
                >
                  <FontAwesomeIcon icon={faBan} />
                  Void
                </button>
              )}
              <button
                onClick={handleDeleteInvoice}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: '#dc2626',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.375rem',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: '500',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}
              >
                <FontAwesomeIcon icon={faTrash} />
                Delete
              </button>
            </div>
          </div>
        )}

        {/* Payment Modal */}
        {showPaymentModal && invoice && (
          <PaymentModal
            invoice={{
              id: invoice.id,
              invoiceNo: invoice.invoiceNo,
              vendorName: invoice.vendorName || '',
              vendorCode: invoice.vendorCode || '',
              orderNumber: `Order ${invoice.orderId}`,
              invoiceDate: invoice.invoiceDate,
              dueDate: invoice.dueDate,
              amount: invoice.amount,
              totalAmount: invoice.totalAmount,
              paidAmount: invoice.paidAmount,
              balanceDue: invoice.balanceDue,
              status: invoice.status,
              paymentMethod: invoice.paymentMethod
            }}
            onClose={() => setShowPaymentModal(false)}
            onPaymentComplete={handlePaymentComplete}
          />
        )}

        {/* Deletion Impact Dialog */}
        <DeletionImpactDialog
          isOpen={showDeletionDialog}
          entityName={`Vendor Invoice #${invoice?.invoiceNo || ''}`}
          impact={deletionImpact}
          onConfirm={confirmDeletion}
          onCancel={() => {
            setShowDeletionDialog(false);
            setDeletionImpact(null);
          }}
          isLoading={loading}
        />
      </div>
    </div>
  );
};

export default VendorInvoiceDetailModal;
