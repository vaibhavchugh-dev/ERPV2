import React, { useState, useEffect } from "react";
import { toast } from "react-toastify";
import { faCheckCircle, faTimesCircle, faDollarSign, faBuilding, faCalendar, faFilter, faEye, faCreditCard, faExclamationTriangle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { VendorInvoiceService, VendorInvoiceSummary } from "../../Common/Services/VendorInvoiceService";
import VendorInvoiceDetailModal from "../Purchasing/VendorInvoiceDetailModal";

interface APFilterOptions {
  status: string;
  vendorId?: number;
  dateRange: string;
  amountRange: string;
  approvalStatus: string;
}

const AccountsPayable: React.FC = () => {
  const [invoices, setInvoices] = useState<VendorInvoiceSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState<APFilterOptions>({
    status: 'All',
    dateRange: 'This Month',
    amountRange: 'All',
    approvalStatus: 'All'
  });
  const [selectedInvoiceId, setSelectedInvoiceId] = useState(0);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [openPaymentOnLoad, setOpenPaymentOnLoad] = useState(false);

  useEffect(() => {
    loadInvoices();
  }, [filters]);

  const loadInvoices = async () => {
    setLoading(true);
    try {
      const result = await VendorInvoiceService.GetVendorInvoicesDirect(
        filters.status === 'All' ? 'All' : filters.status.toLowerCase(),
        "",
        filters.vendorId,
        filters.dateRange
      );

      if (result) {
        // Filter by approval status and amount range
        let filteredInvoices = result;

        if (filters.approvalStatus !== 'All') {
          // Note: This would need backend support for approval status filtering
          // For now, we'll filter based on available statuses
          filteredInvoices = filteredInvoices.filter(invoice => {
            switch (filters.approvalStatus) {
              case 'Approved':
                return invoice.status === 'Paid'; // Assuming paid means approved
              case 'Pending':
                return invoice.status === 'Unpaid'; // Assuming unpaid means pending approval
              case 'Rejected':
                return invoice.status === 'Void'; // Assuming void means rejected
              default:
                return true;
            }
          });
        }

        if (filters.amountRange !== 'All') {
          filteredInvoices = filteredInvoices.filter(invoice => {
            switch (filters.amountRange) {
              case 'Under $1,000': return invoice.totalAmount < 1000;
              case '$1,000 - $10,000': return invoice.totalAmount >= 1000 && invoice.totalAmount < 10000;
              case '$10,000 - $50,000': return invoice.totalAmount >= 10000 && invoice.totalAmount < 50000;
              case 'Over $50,000': return invoice.totalAmount >= 50000;
              default: return true;
            }
          });
        }

        setInvoices(filteredInvoices);
      }
    } catch (error) {
      console.error('Error loading AP invoices:', error);
      toast.error('Failed to load accounts payable data');
    } finally {
      setLoading(false);
    }
  };

  const handleApproveInvoice = async (invoice: VendorInvoiceSummary) => {
    try {
      await VendorInvoiceService.ApproveVendorInvoice(invoice.id);
      toast.success(`Invoice ${invoice.invoiceNo} approved successfully`);
      loadInvoices(); // Refresh the list
    } catch (error: any) {
      console.error('Error approving invoice:', error);
      toast.error(error.message || 'Failed to approve invoice');
    }
  };

  const handleRejectInvoice = (invoice: VendorInvoiceSummary) => {
    // For now, just show a message. In a real app, this would open a rejection modal
    toast.info('Invoice rejection functionality coming soon');
  };

  const openInvoiceDetail = (invoice: VendorInvoiceSummary, showPayment = false) => {
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

  const handleCloseDetailModal = () => {
    setShowDetailModal(false);
    setSelectedInvoiceId(0);
    setOpenPaymentOnLoad(false);
  };

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { color: string; bgColor: string; icon: any }> = {
      'Paid': { color: '#065f46', bgColor: '#dcfce7', icon: faCheckCircle },
      'Partially Paid': { color: '#1d4ed8', bgColor: '#dbeafe', icon: faDollarSign },
      'Approved': { color: '#059669', bgColor: '#d1fae5', icon: faCheckCircle },
      'Pending Approval': { color: '#d97706', bgColor: '#fef3c7', icon: faExclamationTriangle },
      'Overdue': { color: '#dc2626', bgColor: '#fef2f2', icon: faTimesCircle },
      'Rejected': { color: '#dc2626', bgColor: '#fef2f2', icon: faTimesCircle }
    };

    const config = statusConfig[status] || { color: '#6b7280', bgColor: '#f3f4f6', icon: faExclamationTriangle };

    return (
      <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.25rem',
        padding: '0.25rem 0.75rem',
        borderRadius: '0.375rem',
        fontSize: '0.75rem',
        fontWeight: '500',
        color: config.color,
        backgroundColor: config.bgColor
      }}>
        <FontAwesomeIcon icon={config.icon} style={{ fontSize: '0.625rem' }} />
        {status}
      </span>
    );
  };

  const calculateTotals = () => {
    const totalAmount = invoices.reduce((sum, invoice) => sum + invoice.totalAmount, 0);
    const approvedAmount = invoices
      .filter(invoice => invoice.status === 'Paid') // Assuming Paid means approved
      .reduce((sum, invoice) => sum + invoice.totalAmount, 0);
    const pendingAmount = invoices
      .filter(invoice => invoice.status === 'Unpaid') // Assuming Unpaid means pending approval
      .reduce((sum, invoice) => sum + invoice.totalAmount, 0);
    const overdueAmount = invoices
      .filter(invoice => invoice.status === 'Overdue')
      .reduce((sum, invoice) => sum + invoice.totalAmount, 0);

    return { totalAmount, approvedAmount, pendingAmount, overdueAmount };
  };

  const totals = calculateTotals();

  return (
    <div style={{ padding: '1.5rem', width: '100%' }}>
      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '2rem', fontWeight: 'bold', color: '#111827' }}>
              Accounts Payable (AP)
            </h1>
            <p style={{ margin: '0.5rem 0 0 0', color: '#6b7280' }}>
              Manage vendor invoices and payment approvals
            </p>
          </div>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <button
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
              Bulk Pay Approved
            </button>
          </div>
        </div>

        {/* Summary Cards */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '1rem',
          marginBottom: '2rem'
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '0.5rem',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
            padding: '1rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <FontAwesomeIcon icon={faDollarSign} style={{ color: '#6b7280', fontSize: '1.25rem' }} />
              <div>
                <p style={{ margin: 0, fontSize: '0.875rem', color: '#6b7280' }}>Total AP</p>
                <p style={{ margin: '0.25rem 0 0 0', fontSize: '1.25rem', fontWeight: 'bold', color: '#111827' }}>
                  {formatCurrency(totals.totalAmount)}
                </p>
              </div>
            </div>
          </div>

          <div style={{
            backgroundColor: 'white',
            borderRadius: '0.5rem',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
            padding: '1rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <FontAwesomeIcon icon={faCheckCircle} style={{ color: '#10b981', fontSize: '1.25rem' }} />
              <div>
                <p style={{ margin: 0, fontSize: '0.875rem', color: '#6b7280' }}>Approved</p>
                <p style={{ margin: '0.25rem 0 0 0', fontSize: '1.25rem', fontWeight: 'bold', color: '#111827' }}>
                  {formatCurrency(totals.approvedAmount)}
                </p>
              </div>
            </div>
          </div>

          <div style={{
            backgroundColor: 'white',
            borderRadius: '0.5rem',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
            padding: '1rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <FontAwesomeIcon icon={faExclamationTriangle} style={{ color: '#f59e0b', fontSize: '1.25rem' }} />
              <div>
                <p style={{ margin: 0, fontSize: '0.875rem', color: '#6b7280' }}>Pending</p>
                <p style={{ margin: '0.25rem 0 0 0', fontSize: '1.25rem', fontWeight: 'bold', color: '#111827' }}>
                  {formatCurrency(totals.pendingAmount)}
                </p>
              </div>
            </div>
          </div>

          <div style={{
            backgroundColor: 'white',
            borderRadius: '0.5rem',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
            padding: '1rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <FontAwesomeIcon icon={faTimesCircle} style={{ color: '#ef4444', fontSize: '1.25rem' }} />
              <div>
                <p style={{ margin: 0, fontSize: '0.875rem', color: '#6b7280' }}>Overdue</p>
                <p style={{ margin: '0.25rem 0 0 0', fontSize: '1.25rem', fontWeight: 'bold', color: '#111827' }}>
                  {formatCurrency(totals.overdueAmount)}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div style={{
        backgroundColor: 'white',
        borderRadius: '0.5rem',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
        padding: '1.5rem',
        marginBottom: '1.5rem'
      }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <FontAwesomeIcon icon={faFilter} style={{ color: '#6b7280' }} />
            <span style={{ fontWeight: '500', color: '#374151' }}>Filters:</span>
          </div>

          <select
            value={filters.status}
            onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
            style={{
              padding: '0.5rem 1rem',
              border: '1px solid #d1d5db',
              borderRadius: '0.375rem',
              fontSize: '0.875rem'
            }}
          >
            <option value="All">All Status</option>
            <option value="Pending Approval">Pending Approval</option>
            <option value="Approved">Approved</option>
            <option value="Partially Paid">Partially Paid</option>
            <option value="Paid">Paid</option>
            <option value="Overdue">Overdue</option>
          </select>

          <select
            value={filters.approvalStatus}
            onChange={(e) => setFilters(prev => ({ ...prev, approvalStatus: e.target.value }))}
            style={{
              padding: '0.5rem 1rem',
              border: '1px solid #d1d5db',
              borderRadius: '0.375rem',
              fontSize: '0.875rem'
            }}
          >
            <option value="All">All Approvals</option>
            <option value="Approved">Approved</option>
            <option value="Pending">Pending</option>
            <option value="Rejected">Rejected</option>
          </select>

          <select
            value={filters.amountRange}
            onChange={(e) => setFilters(prev => ({ ...prev, amountRange: e.target.value }))}
            style={{
              padding: '0.5rem 1rem',
              border: '1px solid #d1d5db',
              borderRadius: '0.375rem',
              fontSize: '0.875rem'
            }}
          >
            <option value="All">All Amounts</option>
            <option value="Under $1,000">Under $1,000</option>
            <option value="$1,000 - $10,000">$1,000 - $10,000</option>
            <option value="$10,000 - $50,000">$10,000 - $50,000</option>
            <option value="Over $50,000">Over $50,000</option>
          </select>

          <select
            value={filters.dateRange}
            onChange={(e) => setFilters(prev => ({ ...prev, dateRange: e.target.value }))}
            style={{
              padding: '0.5rem 1rem',
              border: '1px solid #d1d5db',
              borderRadius: '0.375rem',
              fontSize: '0.875rem'
            }}
          >
            <option value="This Week">This Week</option>
            <option value="This Month">This Month</option>
            <option value="Last 30 Days">Last 30 Days</option>
            <option value="Last 90 Days">Last 90 Days</option>
          </select>
        </div>
      </div>

      {/* Invoice Table */}
      <div style={{
        backgroundColor: 'white',
        borderRadius: '0.5rem',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
        overflow: 'hidden'
      }}>
        <div style={{
          padding: '1.5rem',
          borderBottom: '1px solid #e5e7eb',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '600', color: '#111827' }}>
            Vendor Invoices ({invoices.length})
          </h2>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '2rem' }}>
            <div>Loading accounts payable data...</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ backgroundColor: '#f9fafb' }}>
                <tr>
                  <th style={{ padding: '0.75rem 1.5rem', textAlign: 'left', fontSize: '0.875rem', fontWeight: '600', color: '#374151', borderBottom: '1px solid #e5e7eb' }}>
                    Invoice
                  </th>
                  <th style={{ padding: '0.75rem 1.5rem', textAlign: 'left', fontSize: '0.875rem', fontWeight: '600', color: '#374151', borderBottom: '1px solid #e5e7eb' }}>
                    Vendor
                  </th>
                  <th style={{ padding: '0.75rem 1.5rem', textAlign: 'left', fontSize: '0.875rem', fontWeight: '600', color: '#374151', borderBottom: '1px solid #e5e7eb' }}>
                    Amount
                  </th>
                  <th style={{ padding: '0.75rem 1.5rem', textAlign: 'left', fontSize: '0.875rem', fontWeight: '600', color: '#374151', borderBottom: '1px solid #e5e7eb' }}>
                    Due Date
                  </th>
                  <th style={{ padding: '0.75rem 1.5rem', textAlign: 'center', fontSize: '0.875rem', fontWeight: '600', color: '#374151', borderBottom: '1px solid #e5e7eb' }}>
                    Status
                  </th>
                  <th style={{ padding: '0.75rem 1.5rem', textAlign: 'center', fontSize: '0.875rem', fontWeight: '600', color: '#374151', borderBottom: '1px solid #e5e7eb' }}>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => (
                  <tr key={invoice.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '1rem 1.5rem' }}>
                      <div>
                        <div style={{ fontWeight: '500', color: '#111827', fontSize: '0.875rem' }}>
                          {invoice.invoiceNo}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                          {formatDate(invoice.invoiceDate)}
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '1rem 1.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <FontAwesomeIcon icon={faBuilding} style={{ color: '#6b7280' }} />
                        <div>
                          <div style={{ fontWeight: '500', color: '#111827', fontSize: '0.875rem' }}>
                            {invoice.vendorName}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                            {invoice.vendorCode}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '1rem 1.5rem' }}>
                      <div style={{ fontWeight: '600', color: '#111827', fontSize: '0.875rem' }}>
                        {formatCurrency(invoice.totalAmount)}
                      </div>
                    </td>
                    <td style={{ padding: '1rem 1.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <FontAwesomeIcon icon={faCalendar} style={{ color: '#6b7280', fontSize: '0.875rem' }} />
                        <span style={{ fontSize: '0.875rem', color: '#111827' }}>
                          {formatDate(invoice.dueDate)}
                        </span>
                      </div>
                      {invoice.daysOverdue && invoice.daysOverdue > 0 && (
                        <div style={{ fontSize: '0.75rem', color: '#ef4444', marginTop: '0.25rem' }}>
                          {invoice.daysOverdue} days overdue
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '1rem 1.5rem', textAlign: 'center' }}>
                      {getStatusBadge(invoice.status)}
                    </td>
                    <td style={{ padding: '1rem 1.5rem', textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
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

                        {invoice.status !== 'Paid' &&
                          invoice.status !== 'Void' &&
                          invoice.status !== 'Approved' &&
                          !invoice.isApproved && (
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

                        {(invoice.status === 'Approved' ||
                          invoice.status === 'Partially Paid' ||
                          invoice.isApproved) &&
                          invoice.status !== 'Paid' &&
                          invoice.status !== 'Void' && (
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
          <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
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
      />
    </div>
  );
};

export default AccountsPayable;
