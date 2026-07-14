import React, { useState, useEffect } from "react";
import { toast } from "react-toastify";
import { faCheckCircle, faEnvelope, faPhone, faDollarSign, faUser, faCalendar, faFilter, faEye, faCreditCard, faFileInvoice, faClock } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { InvoiceService, InvoiceSummary } from "../../Common/Services/InvoiceService";

interface ARFilterOptions {
  status: string;
  customerId?: number;
  dateRange: string;
  amountRange: string;
  overdueStatus: string;
}

const AccountsReceivable: React.FC = () => {
  const [invoices, setInvoices] = useState<InvoiceSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState<ARFilterOptions>({
    status: 'All',
    dateRange: 'This Month',
    amountRange: 'All',
    overdueStatus: 'All'
  });
  const [showCollectionModal, setShowCollectionModal] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceSummary | null>(null);

  useEffect(() => {
    loadInvoices();
  }, [filters]);

  const loadInvoices = async () => {
    setLoading(true);
    try {
      const result = await InvoiceService.GetAllInvoices(
        filters.status === 'All' ? 'All' : filters.status.toLowerCase(),
        "",
        filters.customerId,
        filters.dateRange
      );

      if (result) {
        // Filter by overdue status and amount range
        let filteredInvoices = result;

        if (filters.overdueStatus !== 'All') {
          filteredInvoices = filteredInvoices.filter(invoice => {
            const isOverdue = invoice.daysOverdue && invoice.daysOverdue > 0;
            return (filters.overdueStatus === 'Overdue' && isOverdue) ||
                   (filters.overdueStatus === 'Current' && !isOverdue);
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
      console.error('Error loading AR invoices:', error);
      toast.error('Failed to load accounts receivable data');
    } finally {
      setLoading(false);
    }
  };

  const handleSendReminder = (invoice: InvoiceSummary) => {
    // In a real app, this would send an email reminder
    toast.success(`Payment reminder sent to ${invoice.customerName} for invoice ${invoice.invoiceNo}`);
  };

  const handleRecordPayment = (invoice: InvoiceSummary) => {
    setSelectedInvoice(invoice);
    setShowCollectionModal(true);
  };

  const handleViewInvoice = (invoice: InvoiceSummary) => {
    // Navigate to customer invoice detail
    toast.info(`Viewing invoice ${invoice.invoiceNo}`);
  };

  const handleBulkReminders = () => {
    const overdueInvoices = invoices.filter(inv => inv.daysOverdue && inv.daysOverdue > 0);
    if (overdueInvoices.length === 0) {
      toast.info('No overdue invoices to send reminders for');
      return;
    }

    toast.success(`Payment reminders sent to ${overdueInvoices.length} customers`);
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

  const getStatusBadge = (status: string, daysOverdue?: number) => {
    let displayStatus = status;
    let color = '#6b7280';
    let bgColor = '#f3f4f6';
    let icon = faFileInvoice;

    if (status === 'Paid') {
      color = '#065f46';
      bgColor = '#dcfce7';
      icon = faCheckCircle;
    } else if (daysOverdue && daysOverdue > 0) {
      displayStatus = `Overdue (${daysOverdue}d)`;
      color = '#dc2626';
      bgColor = '#fef2f2';
      icon = faCalendar;
    } else if (status === 'Unpaid') {
      color = '#d97706';
      bgColor = '#fef3c7';
      icon = faClock;
    }

    return (
      <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.25rem',
        padding: '0.25rem 0.75rem',
        borderRadius: '0.375rem',
        fontSize: '0.75rem',
        fontWeight: '500',
        color: color,
        backgroundColor: bgColor
      }}>
        <FontAwesomeIcon icon={icon} style={{ fontSize: '0.625rem' }} />
        {displayStatus}
      </span>
    );
  };

  const calculateTotals = () => {
    const totalAmount = invoices.reduce((sum, invoice) => sum + invoice.totalAmount, 0);
    const paidAmount = invoices
      .filter(invoice => invoice.status === 'Paid')
      .reduce((sum, invoice) => sum + invoice.totalAmount, 0);
    const unpaidAmount = invoices
      .filter(invoice => invoice.status === 'Unpaid')
      .reduce((sum, invoice) => sum + invoice.totalAmount, 0);
    const overdueAmount = invoices
      .filter(invoice => invoice.daysOverdue && invoice.daysOverdue > 0)
      .reduce((sum, invoice) => sum + invoice.totalAmount, 0);

    return { totalAmount, paidAmount, unpaidAmount, overdueAmount };
  };

  const totals = calculateTotals();

  return (
    <div style={{ padding: '1.5rem', width: '100%' }}>
      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '2rem', fontWeight: 'bold', color: '#111827' }}>
              Accounts Receivable (AR)
            </h1>
            <p style={{ margin: '0.5rem 0 0 0', color: '#6b7280' }}>
              Manage customer invoices and collections
            </p>
          </div>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <button
              onClick={handleBulkReminders}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: '#f59e0b',
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
              <FontAwesomeIcon icon={faEnvelope} />
              Send Bulk Reminders
            </button>
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
              Record Payments
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
                <p style={{ margin: 0, fontSize: '0.875rem', color: '#6b7280' }}>Total AR</p>
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
                <p style={{ margin: 0, fontSize: '0.875rem', color: '#6b7280' }}>Collected</p>
                <p style={{ margin: '0.25rem 0 0 0', fontSize: '1.25rem', fontWeight: 'bold', color: '#111827' }}>
                  {formatCurrency(totals.paidAmount)}
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
              <FontAwesomeIcon icon={faClock} style={{ color: '#f59e0b', fontSize: '1.25rem' }} />
              <div>
                <p style={{ margin: 0, fontSize: '0.875rem', color: '#6b7280' }}>Outstanding</p>
                <p style={{ margin: '0.25rem 0 0 0', fontSize: '1.25rem', fontWeight: 'bold', color: '#111827' }}>
                  {formatCurrency(totals.unpaidAmount)}
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
              <FontAwesomeIcon icon={faCalendar} style={{ color: '#ef4444', fontSize: '1.25rem' }} />
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
            <option value="Paid">Paid</option>
            <option value="Unpaid">Unpaid</option>
            <option value="Overdue">Overdue</option>
          </select>

          <select
            value={filters.overdueStatus}
            onChange={(e) => setFilters(prev => ({ ...prev, overdueStatus: e.target.value }))}
            style={{
              padding: '0.5rem 1rem',
              border: '1px solid #d1d5db',
              borderRadius: '0.375rem',
              fontSize: '0.875rem'
            }}
          >
            <option value="All">All Aging</option>
            <option value="Current">Current</option>
            <option value="Overdue">Overdue</option>
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
            Customer Invoices ({invoices.length})
          </h2>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '2rem' }}>
            <div>Loading accounts receivable data...</div>
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
                    Customer
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
                        <FontAwesomeIcon icon={faUser} style={{ color: '#6b7280' }} />
                        <div>
                          <div style={{ fontWeight: '500', color: '#111827', fontSize: '0.875rem' }}>
                            {invoice.customerName}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                            {invoice.customerCode}
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
                      {getStatusBadge(invoice.status, invoice.daysOverdue)}
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

                        {invoice.status !== 'Paid' && (
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
          <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
            No customer invoices found matching the current filters.
          </div>
        )}
      </div>
    </div>
  );
};

export default AccountsReceivable;
