import React, { useState, useEffect, useRef } from 'react';
import { toast } from 'react-toastify';
import { faTimes, faPrint, faCreditCard, faBan, faFileInvoice, faCalendar, faDollarSign, faTrash } from "@fortawesome/free-solid-svg-icons";
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
}

const VendorInvoiceDetailModal: React.FC<VendorInvoiceDetailModalProps> = ({
  isOpen,
  onClose,
  invoiceId,
  initialShowPayment = false,
  onPaymentComplete
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
    } else if (statusLower === 'overdue') {
      return <span className="badge badge-danger">Overdue</span>;
    } else if (statusLower === 'void') {
      return <span className="badge badge-secondary">Void</span>;
    } else if (statusLower === 'approved') {
      return <span className="badge badge-success">Approved</span>;
    } else {
      return <span className="badge badge-warning">{status || 'Unpaid'}</span>;
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
      const blob = await PdfService.GenerateVendorInvoice(invoice.id);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `VendorInvoice_${invoice.invoiceNo}_${new Date().toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success('Vendor invoice PDF generated successfully');
    } catch (error: any) {
      console.error('Error generating vendor invoice PDF:', error);
      toast.error(error.response?.data?.error || 'Failed to generate vendor invoice PDF');
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
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1050,
      padding: '2rem'
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '0.5rem',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
        width: '100%',
        maxWidth: '800px',
        maxHeight: '90vh',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '1.5rem',
          borderBottom: '1px solid #e5e7eb',
          backgroundColor: '#f9fafb'
        }}>
          <div>
            <h2 style={{
              margin: 0,
              fontSize: '1.5rem',
              fontWeight: '600',
              color: '#111827'
            }}>
              <FontAwesomeIcon icon={faFileInvoice} style={{ marginRight: '0.5rem' }} />
              Invoice {invoice?.invoiceNo}
            </h2>
            <p style={{ margin: '0.25rem 0 0 0', color: '#6b7280' }}>
              Invoice Details
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {invoice?.status !== 'Paid' && invoice?.status !== 'Void' && invoice?.isApproved && (
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
                  fontWeight: '500'
                }}
              >
                <FontAwesomeIcon icon={faCreditCard} style={{ marginRight: '0.5rem' }} />
                Pay Invoice
              </button>
            )}
            {invoice?.status !== 'Paid' && invoice?.status !== 'Void' && !invoice?.isApproved && (
              <span style={{
                padding: '0.5rem 1rem',
                fontSize: '0.875rem',
                color: '#92400e',
                backgroundColor: '#fef3c7',
                borderRadius: '0.375rem',
                alignSelf: 'center'
              }}>
                Awaiting approval before payment
              </span>
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
                fontWeight: '500'
              }}
            >
              <FontAwesomeIcon icon={faPrint} style={{ marginRight: '0.5rem' }} />
              Print
            </button>
            {invoice?.status === 'Unpaid' && (
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
                  fontWeight: '500'
                }}
              >
                <FontAwesomeIcon icon={faBan} style={{ marginRight: '0.5rem' }} />
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
            <button
              onClick={() => onClose()}
              style={{
                padding: '0.5rem',
                backgroundColor: '#6b7280',
                color: 'white',
                border: 'none',
                borderRadius: '0.375rem',
                cursor: 'pointer',
                fontSize: '1rem'
              }}
            >
              <FontAwesomeIcon icon={faTimes} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '1.5rem'
        }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '2rem' }}>
              <div>Loading invoice details...</div>
            </div>
          ) : invoice ? (
            <>
              {/* Invoice Header Info */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '2rem',
                marginBottom: '2rem'
              }}>
                <div>
                  <h3 style={{
                    margin: '0 0 1rem 0',
                    fontSize: '1.125rem',
                    fontWeight: '600',
                    color: '#374151'
                  }}>
                    Invoice Information
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <FontAwesomeIcon icon={faFileInvoice} style={{ width: '1rem', marginRight: '0.5rem', color: '#6b7280' }} />
                      <span style={{ fontWeight: '500', marginRight: '0.5rem' }}>Invoice #:</span>
                      <span>{invoice.invoiceNo}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <FontAwesomeIcon icon={faCalendar} style={{ width: '1rem', marginRight: '0.5rem', color: '#6b7280' }} />
                      <span style={{ fontWeight: '500', marginRight: '0.5rem' }}>Invoice Date:</span>
                      <span>{formatDate(invoice.invoiceDate)}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <FontAwesomeIcon icon={faCalendar} style={{ width: '1rem', marginRight: '0.5rem', color: '#6b7280' }} />
                      <span style={{ fontWeight: '500', marginRight: '0.5rem' }}>Due Date:</span>
                      <span>{formatDate(invoice.dueDate)}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <span style={{ fontWeight: '500', marginRight: '0.5rem' }}>Status:</span>
                      {getStatusBadge(invoice.status)}
                    </div>
                  </div>
                </div>

                <div>
                  <h3 style={{
                    margin: '0 0 1rem 0',
                    fontSize: '1.125rem',
                    fontWeight: '600',
                    color: '#374151'
                  }}>
                    Amounts
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <FontAwesomeIcon icon={faDollarSign} style={{ width: '1rem', marginRight: '0.5rem', color: '#6b7280' }} />
                      <span style={{ fontWeight: '500', marginRight: '0.5rem' }}>Subtotal:</span>
                      <span>{formatCurrency(invoice.amount)}</span>
                    </div>
                    {(invoice.taxAmount ?? 0) > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center' }}>
                        <FontAwesomeIcon icon={faDollarSign} style={{ width: '1rem', marginRight: '0.5rem', color: '#6b7280' }} />
                        <span style={{ fontWeight: '500', marginRight: '0.5rem' }}>Tax:</span>
                        <span>{formatCurrency(invoice.taxAmount ?? 0)}</span>
                      </div>
                    )}
                    {(invoice.freightCharge ?? 0) > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center' }}>
                        <FontAwesomeIcon icon={faDollarSign} style={{ width: '1rem', marginRight: '0.5rem', color: '#6b7280' }} />
                        <span style={{ fontWeight: '500', marginRight: '0.5rem' }}>Freight:</span>
                        <span>{formatCurrency(invoice.freightCharge ?? 0)}</span>
                      </div>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <FontAwesomeIcon icon={faDollarSign} style={{ width: '1rem', marginRight: '0.5rem', color: '#6b7280' }} />
                      <span style={{ fontWeight: '500', marginRight: '0.5rem' }}>Total Amount:</span>
                      <span style={{ fontWeight: '600', fontSize: '1.125rem' }}>{formatCurrency(invoice.totalAmount)}</span>
                    </div>
                    {(invoice.paidAmount ?? 0) > 0 && (
                      <>
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                          <FontAwesomeIcon icon={faDollarSign} style={{ width: '1rem', marginRight: '0.5rem', color: '#6b7280' }} />
                          <span style={{ fontWeight: '500', marginRight: '0.5rem' }}>Paid:</span>
                          <span>{formatCurrency(invoice.paidAmount ?? 0)}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                          <FontAwesomeIcon icon={faDollarSign} style={{ width: '1rem', marginRight: '0.5rem', color: '#6b7280' }} />
                          <span style={{ fontWeight: '500', marginRight: '0.5rem' }}>Balance Due:</span>
                          <span style={{ fontWeight: '600' }}>
                            {formatCurrency(
                              invoice.balanceDue ??
                                Math.max(0, invoice.totalAmount - (invoice.paidAmount ?? 0))
                            )}
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Line Items */}
              <div>
                <h3 style={{
                  margin: '0 0 1rem 0',
                  fontSize: '1.125rem',
                  fontWeight: '600',
                  color: '#374151'
                }}>
                  Line Items
                </h3>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    border: '1px solid #e5e7eb',
                    borderRadius: '0.375rem'
                  }}>
                    <thead>
                      <tr style={{ backgroundColor: '#f9fafb' }}>
                        <th style={{
                          padding: '0.75rem 1rem',
                          textAlign: 'left',
                          fontWeight: '600',
                          color: '#374151',
                          borderBottom: '1px solid #e5e7eb'
                        }}>Description</th>
                        <th style={{
                          padding: '0.75rem 1rem',
                          textAlign: 'center',
                          fontWeight: '600',
                          color: '#374151',
                          borderBottom: '1px solid #e5e7eb'
                        }}>Quantity</th>
                        <th style={{
                          padding: '0.75rem 1rem',
                          textAlign: 'right',
                          fontWeight: '600',
                          color: '#374151',
                          borderBottom: '1px solid #e5e7eb'
                        }}>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoice.items.map((item, index) => (
                        <tr key={index} style={{
                          backgroundColor: index % 2 === 0 ? 'white' : '#f9fafb',
                          borderBottom: '1px solid #e5e7eb'
                        }}>
                          <td style={{
                            padding: '0.75rem 1rem',
                            borderRight: '1px solid #e5e7eb'
                          }}>{item.description}</td>
                          <td style={{
                            padding: '0.75rem 1rem',
                            textAlign: 'center',
                            borderRight: '1px solid #e5e7eb'
                          }}>{item.qtyInvoiced}</td>
                          <td style={{
                            padding: '0.75rem 1rem',
                            textAlign: 'right'
                          }}>{formatCurrency(item.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ backgroundColor: '#f9fafb', borderTop: '2px solid #d1d5db' }}>
                        <td colSpan={2} style={{
                          padding: '0.75rem 1rem',
                          textAlign: 'right',
                          fontWeight: '600',
                          color: '#374151'
                        }}>Subtotal:</td>
                        <td style={{
                          padding: '0.75rem 1rem',
                          textAlign: 'right'
                        }}>{formatCurrency(invoice.amount)}</td>
                      </tr>
                      {(invoice.taxAmount ?? 0) > 0 && (
                        <tr style={{ backgroundColor: '#f9fafb' }}>
                          <td colSpan={2} style={{
                            padding: '0.5rem 1rem',
                            textAlign: 'right',
                            fontWeight: '500',
                            color: '#374151'
                          }}>Tax:</td>
                          <td style={{
                            padding: '0.5rem 1rem',
                            textAlign: 'right'
                          }}>{formatCurrency(invoice.taxAmount ?? 0)}</td>
                        </tr>
                      )}
                      {(invoice.freightCharge ?? 0) > 0 && (
                        <tr style={{ backgroundColor: '#f9fafb' }}>
                          <td colSpan={2} style={{
                            padding: '0.5rem 1rem',
                            textAlign: 'right',
                            fontWeight: '500',
                            color: '#374151'
                          }}>Freight:</td>
                          <td style={{
                            padding: '0.5rem 1rem',
                            textAlign: 'right'
                          }}>{formatCurrency(invoice.freightCharge ?? 0)}</td>
                        </tr>
                      )}
                      <tr style={{ backgroundColor: '#f9fafb', borderTop: '2px solid #d1d5db' }}>
                        <td colSpan={2} style={{
                          padding: '0.75rem 1rem',
                          textAlign: 'right',
                          fontWeight: '600',
                          color: '#374151'
                        }}>Total Amount:</td>
                        <td style={{
                          padding: '0.75rem 1rem',
                          textAlign: 'right',
                          fontWeight: '600',
                          color: '#111827'
                        }}>{formatCurrency(invoice.totalAmount)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
              Invoice not found or failed to load.
            </div>
          )}
        </div>
      </div>

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
  );
};

export default VendorInvoiceDetailModal;
