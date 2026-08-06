import React, { useState, useEffect, useRef } from 'react';
import { toast } from 'react-toastify';
import { faTimes, faPrint, faCreditCard, faBan, faFileInvoice, faCalendar, faDollarSign, faHashtag, faUser, faClipboardList, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { CustomerInvoicesService, CustomerInvoiceDetail } from '../../Common/Services/CustomerInvoicesService';
import { InvoiceService } from '../../Common/Services/InvoiceService';
import { PdfService } from '../../Common/Services/PdfService';
import DeletionImpactDialog, { DeletionImpactResult } from '../../Common/Components/DeletionImpactDialog';
import BankAccountSelect from '../../Common/Components/BankAccountSelect';
import { useCompanyBanks } from '../../Common/Hooks/useCompanyBanks';

// Customer Payment Modal Component
interface CustomerPaymentModalProps {
  invoice: CustomerInvoiceDetail;
  onClose: () => void;
  onPaymentComplete: () => void;
}

const CustomerPaymentModal: React.FC<CustomerPaymentModalProps> = ({ invoice, onClose, onPaymentComplete }) => {
  const [loading, setLoading] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('Check');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [checkNo, setCheckNo] = useState('');
  const balanceDue = Math.max(
    0,
    Number(
      invoice.balanceDue ??
        invoice.totalAmount - (invoice.paidAmount ?? 0)
    )
  );
  const [paymentAmount, setPaymentAmount] = useState(
    balanceDue > 0 ? balanceDue.toFixed(2) : invoice.totalAmount.toFixed(2)
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

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const formatDate = (dateString: string): string => {
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch {
      return dateString;
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
                    Invoice #{invoice.invoiceNo}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                    Total: {formatCurrency(invoice.totalAmount)}
                  </div>
                  {(invoice.paidAmount ?? 0) > 0 && (
                    <div style={{ fontSize: '0.75rem', color: '#059669' }}>
                      Paid: {formatCurrency(invoice.paidAmount ?? 0)}
                    </div>
                  )}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: '600', fontSize: '0.875rem', color: '#1f2937' }}>
                    Balance due: {formatCurrency(balanceDue)}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                    Due: {formatDate(invoice.dueDate)}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                    Status: {invoice.status}
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

interface CustomerInvoiceDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoiceId: number;
  /** When true, opens the payment form after the invoice loads */
  initialShowPayment?: boolean;
  onPaymentComplete?: () => void;
}

const CustomerInvoiceDetailModal: React.FC<CustomerInvoiceDetailModalProps> = ({
  isOpen,
  onClose,
  invoiceId,
  initialShowPayment = false,
  onPaymentComplete
}) => {
  const [invoice, setInvoice] = useState<CustomerInvoiceDetail | null>(null);
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
      invoice.status !== 'Paid' &&
      invoice.status !== 'Void'
    ) {
      paymentPromptedRef.current = true;
      setShowPaymentModal(true);
    }
  }, [isOpen, initialShowPayment, invoiceId, invoice?.id, invoice?.status]);

  const loadInvoiceDetails = async () => {
    if (!invoiceId) return;

    setLoading(true);
    try {
      const result = await CustomerInvoicesService.GetInvoiceDetails(invoiceId);

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
        month: 'long',
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
      return <span className="badge badge-warning">Unpaid</span>;
    }
  };

  const handlePayInvoice = () => {
    if (invoice) {
      setShowPaymentModal(true);
    }
  };

  const handlePrintInvoice = async () => {
    if (!invoice?.id) {
      toast.error('Invoice not loaded');
      return;
    }

    try {
      const blob = await PdfService.GenerateInvoice(invoice.id);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Invoice_${invoice.invoiceNo}_${new Date().toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success('Invoice PDF generated successfully');
    } catch (error: any) {
      console.error('Error generating invoice PDF:', error);
      toast.error(error.response?.data?.error || 'Failed to generate invoice PDF');
    }
  };

  const handleVoidInvoice = () => {
    toast.info('Void functionality coming soon...');
  };

  const refreshDeletionImpact = async () => {
    if (!invoice?.id) return;
    try {
      const response = await InvoiceService.CheckInvoiceDeletionImpact(invoice.id);
      const impact = response.result as DeletionImpactResult;
      setDeletionImpact(impact);
    } catch (error: any) {
      console.error("Error refreshing deletion impact:", error);
      toast.error(`Error refreshing deletion impact: ${error.message || "Unknown error"}`);
    }
  };

  const handleDeleteInvoice = async () => {
    if (!invoice?.id) return;
    try {
      const response = await InvoiceService.CheckInvoiceDeletionImpact(invoice.id);
      const impact = response.result as DeletionImpactResult;
      setDeletionImpact(impact);
      setShowDeletionDialog(true);
    } catch (error: any) {
      console.error("Error checking deletion impact:", error);
      toast.error(`Error checking deletion impact: ${error.message || "Unknown error"}`);
    }
  };

  const confirmDeletion = async () => {
    if (!invoice?.id) return;
    setLoading(true);
    try {
      await InvoiceService.DeleteInvoice(invoice.id);
      toast.success("Invoice deleted successfully");
      setShowDeletionDialog(false);
      setDeletionImpact(null);
      onClose();
    } catch (error: any) {
      console.error("Error deleting invoice:", error);
      toast.error(`Error deleting invoice: ${error.message || "Unknown error"}`);
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
                {invoice.invoiceNo} • {invoice.customerName}
                {invoice.status && (
                  <span style={{ marginLeft: '1rem' }}>
                    {getStatusBadge(invoice.status, invoice.daysOverdue)}
                  </span>
                )}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
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

              {/* Customer & Order Information */}
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
                    Customer Information
                  </h4>
                  <div style={{ display: 'grid', gap: '0.5rem' }}>
                    <div>
                      <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>Customer:</span>
                      <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.875rem', fontWeight: '500', color: '#111827' }}>
                        {invoice.customerName}
                      </p>
                    </div>
                    <div>
                      <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>Customer Code:</span>
                      <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.875rem', fontWeight: '500', color: '#111827' }}>
                        {invoice.customerCode}
                      </p>
                    </div>
                    {invoice.customerPoNumber && (
                      <div>
                        <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>Customer PO:</span>
                        <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.875rem', fontWeight: '500', color: '#111827' }}>
                          {invoice.customerPoNumber}
                        </p>
                      </div>
                    )}
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
                      <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>Order Number:</span>
                      <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.875rem', fontWeight: '500', color: '#111827' }}>
                        {invoice.orderNumber}
                      </p>
                    </div>
                    <div>
                      <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>Payment Method:</span>
                      <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.875rem', fontWeight: '500', color: '#111827' }}>
                        {invoice.paymentMethod || 'Not specified'}
                      </p>
                    </div>
                    {invoice.paymentDate && (
                      <div>
                        <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>Payment Date:</span>
                        <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.875rem', fontWeight: '500', color: '#111827' }}>
                          {formatDate(invoice.paymentDate)}
                        </p>
                      </div>
                    )}
                    {invoice.checkNo && (
                      <div>
                        <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>Check Number:</span>
                        <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.875rem', fontWeight: '500', color: '#111827' }}>
                          {invoice.checkNo}
                        </p>
                      </div>
                    )}
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
                          Item
                        </th>
                        <th style={{ padding: '0.75rem', textAlign: 'left', fontSize: '0.875rem', fontWeight: '600', color: '#374151', borderBottom: '1px solid #e5e7eb' }}>
                          Description
                        </th>
                        <th style={{ padding: '0.75rem', textAlign: 'right', fontSize: '0.875rem', fontWeight: '600', color: '#374151', borderBottom: '1px solid #e5e7eb' }}>
                          Qty
                        </th>
                        <th style={{ padding: '0.75rem', textAlign: 'right', fontSize: '0.875rem', fontWeight: '600', color: '#374151', borderBottom: '1px solid #e5e7eb' }}>
                          Unit Price
                        </th>
                        <th style={{ padding: '0.75rem', textAlign: 'right', fontSize: '0.875rem', fontWeight: '600', color: '#374151', borderBottom: '1px solid #e5e7eb' }}>
                          Discount
                        </th>
                        <th style={{ padding: '0.75rem', textAlign: 'right', fontSize: '0.875rem', fontWeight: '600', color: '#374151', borderBottom: '1px solid #e5e7eb' }}>
                          Total
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoice.items.map((item, index) => (
                        <tr key={index} style={{ borderBottom: '1px solid #f3f4f6' }}>
                          <td style={{ padding: '0.75rem', fontSize: '0.875rem', color: '#111827' }}>
                            {item.partNo}
                          </td>
                          <td style={{ padding: '0.75rem', fontSize: '0.875rem', color: '#111827' }}>
                            {item.partName}
                            {item.description && item.description !== item.partName && (
                              <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                                {item.description}
                              </div>
                            )}
                          </td>
                          <td style={{ padding: '0.75rem', textAlign: 'right', fontSize: '0.875rem', color: '#111827' }}>
                            {item.qtyInvoiced}
                          </td>
                          <td style={{ padding: '0.75rem', textAlign: 'right', fontSize: '0.875rem', color: '#111827' }}>
                            {formatCurrency(item.unitPrice)}
                          </td>
                          <td style={{ padding: '0.75rem', textAlign: 'right', fontSize: '0.875rem', color: '#111827' }}>
                            {formatCurrency(item.discount)}
                          </td>
                          <td style={{ padding: '0.75rem', textAlign: 'right', fontSize: '0.875rem', color: '#111827', fontWeight: '500' }}>
                            {formatCurrency(item.lineTotal)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot style={{ backgroundColor: '#f9fafb', borderTop: '2px solid #e5e7eb' }}>
                      <tr>
                        <td colSpan={5} style={{ padding: '0.75rem', textAlign: 'right', fontSize: '0.875rem', fontWeight: '600', color: '#111827' }}>
                          Subtotal:
                        </td>
                        <td style={{ padding: '0.75rem', textAlign: 'right', fontSize: '0.875rem', fontWeight: '600', color: '#111827' }}>
                          {formatCurrency(invoice.amount)}
                        </td>
                      </tr>
                      {(invoice.shippingCharge > 0 || invoice.otherCharge > 0 || invoice.saleTaxAmount > 0) && (
                        <>
                          {invoice.shippingCharge > 0 && (
                            <tr>
                              <td colSpan={5} style={{ padding: '0.75rem', textAlign: 'right', fontSize: '0.875rem', color: '#111827' }}>
                                Shipping:
                              </td>
                              <td style={{ padding: '0.75rem', textAlign: 'right', fontSize: '0.875rem', color: '#111827' }}>
                                {formatCurrency(invoice.shippingCharge)}
                              </td>
                            </tr>
                          )}
                          {invoice.otherCharge > 0 && (
                            <tr>
                              <td colSpan={5} style={{ padding: '0.75rem', textAlign: 'right', fontSize: '0.875rem', color: '#111827' }}>
                                Other Charges:
                              </td>
                              <td style={{ padding: '0.75rem', textAlign: 'right', fontSize: '0.875rem', color: '#111827' }}>
                                {formatCurrency(invoice.otherCharge)}
                              </td>
                            </tr>
                          )}
                          {invoice.saleTaxAmount > 0 && (
                            <tr>
                              <td colSpan={5} style={{ padding: '0.75rem', textAlign: 'right', fontSize: '0.875rem', color: '#111827' }}>
                                Tax ({invoice.saleTax}%):
                              </td>
                              <td style={{ padding: '0.75rem', textAlign: 'right', fontSize: '0.875rem', color: '#111827' }}>
                                {formatCurrency(invoice.saleTaxAmount)}
                              </td>
                            </tr>
                          )}
                        </>
                      )}
                      <tr style={{ borderTop: '1px solid #e5e7eb' }}>
                        <td colSpan={5} style={{ padding: '0.75rem', textAlign: 'right', fontSize: '0.875rem', fontWeight: '700', color: '#111827' }}>
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

              {/* Notes */}
              {invoice.internalNotes && (
                <div>
                  <h4 style={{
                    margin: '0 0 1rem 0',
                    fontSize: '1rem',
                    fontWeight: '600',
                    color: '#111827'
                  }}>
                    Internal Notes
                  </h4>
                  <div style={{
                    padding: '1rem',
                    backgroundColor: '#f9fafb',
                    borderRadius: '0.5rem',
                    border: '1px solid #e5e7eb'
                  }}>
                    <p style={{ margin: 0, fontSize: '0.875rem', color: '#374151', whiteSpace: 'pre-wrap' }}>
                      {invoice.internalNotes}
                    </p>
                  </div>
                </div>
              )}
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
              {invoice.status !== 'Paid' && invoice.status !== 'Void' && (
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
              )}
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

        {/* Customer Payment Modal */}
        {showPaymentModal && invoice && (
          <CustomerPaymentModal
            invoice={invoice}
            onClose={() => setShowPaymentModal(false)}
            onPaymentComplete={handlePaymentComplete}
          />
        )}

        {/* Deletion Impact Dialog */}
        <DeletionImpactDialog
          isOpen={showDeletionDialog}
          entityName={`Invoice #${invoice?.invoiceNo || ''}`}
          impact={deletionImpact}
          onConfirm={confirmDeletion}
          onCancel={() => {
            setShowDeletionDialog(false);
            setDeletionImpact(null);
          }}
          onRefreshImpact={refreshDeletionImpact}
          isLoading={loading}
        />
      </div>
    </div>
  );
};

export default CustomerInvoiceDetailModal;
















