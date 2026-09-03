import React, { useState, useEffect, useMemo } from "react";
import { useHistory } from "react-router-dom";
import { toast } from "react-toastify";
import { faDollarSign, faArrowUp, faArrowDown, faClock, faCheckCircle, faExclamationTriangle, faCalendar, faFilter } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { AccountingService, PaymentDashboardMetrics, RecentTransaction } from "../../Common/Services/AccountingService";
import { useFormatting } from "../../Common/Hooks/useFormatting";

// Using interfaces from AccountingService

const PaymentDashboard: React.FC = () => {
  const history = useHistory();
  const { formatCurrency: formatCurrencySettings, formatDate } = useFormatting();
  const [summary, setSummary] = useState<PaymentDashboardMetrics | null>(null);
  const [recentTransactions, setRecentTransactions] = useState<RecentTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState('All');
  const [showFilters, setShowFilters] = useState(false);
  const [transactionFilter, setTransactionFilter] = useState<'all' | 'money-in' | 'money-out' | 'invoice'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'pending' | 'overdue'>('all');
  const [showAllTransactions, setShowAllTransactions] = useState(false);

  useEffect(() => {
    loadDashboardData();
  }, [dateRange]);

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      // Load dashboard metrics from real API
      const dashboardMetrics = await AccountingService.GetPaymentDashboardMetrics(dateRange);
      if (dashboardMetrics) {
        setSummary(dashboardMetrics);
      }

      // Load recent transactions from real API (same date range as metrics)
      const transactions = await AccountingService.GetRecentTransactions(100, dateRange);
      if (transactions) {
        setRecentTransactions(transactions);
      }
    } catch (error) {
      console.error('Error loading dashboard data:', error);
      toast.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number): string =>
    formatCurrencySettings(Math.abs(amount));

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return '#10b981';
      case 'pending': return '#f59e0b';
      case 'overdue': return '#ef4444';
      default: return '#6b7280';
    }
  };

  const filteredTransactions = useMemo(() => {
    return recentTransactions.filter((transaction) => {
      const matchesStatus = statusFilter === 'all' || transaction.status === statusFilter;
      const matchesType =
        transactionFilter === 'all' ||
        (transactionFilter === 'invoice' && transaction.type === 'invoice') ||
        (transactionFilter === 'money-in' && transaction.amount > 0) ||
        (transactionFilter === 'money-out' && transaction.amount < 0);

      return matchesStatus && matchesType;
    });
  }, [recentTransactions, statusFilter, transactionFilter]);

  const visibleTransactions = showAllTransactions
    ? filteredTransactions
    : filteredTransactions.slice(0, 10);

  if (loading) {
    return (
      <div className="payment-dashboard" style={{ padding: '1.5rem', width: '100%' }}>
        <div style={{ textAlign: 'center', padding: '2rem' }}>
          <div>Loading payment dashboard...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="payment-dashboard" style={{ padding: '1.5rem', width: '100%' }}>
      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '2rem', fontWeight: 'bold', color: '#111827' }}>
              Payment Dashboard
            </h1>
            <p style={{ margin: '0.5rem 0 0 0', color: '#6b7280' }}>
              Overview of accounts receivable and payable
            </p>
          </div>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
              style={{
                padding: '0.5rem 1rem',
                border: '1px solid #d1d5db',
                borderRadius: '0.375rem',
                fontSize: '0.875rem'
              }}
            >
              <option value="All">All Dates</option>
              <option value="This Week">This Week</option>
              <option value="This Month">This Month</option>
              <option value="Last 30 Days">Last 30 Days</option>
              <option value="Last 90 Days">Last 90 Days</option>
            </select>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
          gap: '1.5rem',
          marginBottom: '2rem'
        }}>
          {/* Accounts Receivable */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => history.push('/accounts/receivable')}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') history.push('/accounts/receivable'); }}
            style={{
            backgroundColor: 'white',
            borderRadius: '0.5rem',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
            padding: '1.5rem',
            borderLeft: '4px solid #10b981',
            cursor: 'pointer'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <p style={{ margin: 0, color: '#6b7280', fontSize: '0.875rem', fontWeight: '500' }}>
                  Accounts Receivable
                </p>
                <p style={{ margin: '0.5rem 0 0 0', fontSize: '1.875rem', fontWeight: 'bold', color: '#111827' }}>
                  {formatCurrency(summary.totalReceivables || 0)}
                </p>
              </div>
              <div style={{
                width: '3rem',
                height: '3rem',
                borderRadius: '50%',
                backgroundColor: '#dcfce7',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <FontAwesomeIcon icon={faArrowUp} style={{ color: '#10b981', fontSize: '1.25rem' }} />
              </div>
            </div>
            <div style={{ marginTop: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>Due this week</span>
                <span style={{ fontSize: '0.875rem', fontWeight: '500', color: '#111827' }}>
                  {formatCurrency(summary.receivablesDueThisWeek || 0)}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.875rem', color: '#ef4444' }}>Overdue</span>
                <span style={{ fontSize: '0.875rem', fontWeight: '500', color: '#ef4444' }}>
                  {formatCurrency(summary.overdueReceivables || 0)}
                </span>
              </div>
            </div>
          </div>

          {/* Accounts Payable */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => history.push('/accounts/payable')}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') history.push('/accounts/payable'); }}
            style={{
            backgroundColor: 'white',
            borderRadius: '0.5rem',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
            padding: '1.5rem',
            borderLeft: '4px solid #ef4444',
            cursor: 'pointer'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <p style={{ margin: 0, color: '#6b7280', fontSize: '0.875rem', fontWeight: '500' }}>
                  Accounts Payable
                </p>
                <p style={{ margin: '0.5rem 0 0 0', fontSize: '1.875rem', fontWeight: 'bold', color: '#111827' }}>
                  {formatCurrency(summary.totalPayables || 0)}
                </p>
              </div>
              <div style={{
                width: '3rem',
                height: '3rem',
                borderRadius: '50%',
                backgroundColor: '#fef2f2',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <FontAwesomeIcon icon={faArrowDown} style={{ color: '#ef4444', fontSize: '1.25rem' }} />
              </div>
            </div>
            <div style={{ marginTop: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>Due this week</span>
                <span style={{ fontSize: '0.875rem', fontWeight: '500', color: '#111827' }}>
                  {formatCurrency(summary.payablesDueThisWeek || 0)}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.875rem', color: '#ef4444' }}>Overdue</span>
                <span style={{ fontSize: '0.875rem', fontWeight: '500', color: '#ef4444' }}>
                  {formatCurrency(summary.overduePayables || 0)}
                </span>
              </div>
            </div>
          </div>

          {/* Cash Flow */}
          <div style={{
            backgroundColor: 'white',
            borderRadius: '0.5rem',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
            padding: '1.5rem',
            borderLeft: '4px solid #3b82f6'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <p style={{ margin: 0, color: '#6b7280', fontSize: '0.875rem', fontWeight: '500' }}>
                  Net Cash Flow
                </p>
                <p style={{
                  margin: '0.5rem 0 0 0',
                  fontSize: '1.875rem',
                  fontWeight: 'bold',
                  color: (summary.cashIn || 0) - (summary.cashOut || 0) >= 0 ? '#10b981' : '#ef4444'
                }}>
                  {(summary.cashIn || 0) - (summary.cashOut || 0) >= 0 ? '+' : ''}{formatCurrency((summary.cashIn || 0) - (summary.cashOut || 0))}
                </p>
              </div>
              <div style={{
                width: '3rem',
                height: '3rem',
                borderRadius: '50%',
                backgroundColor: '#eff6ff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <FontAwesomeIcon icon={faDollarSign} style={{ color: '#3b82f6', fontSize: '1.25rem' }} />
              </div>
            </div>
            <div style={{ marginTop: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                <span style={{ fontSize: '0.875rem', color: '#10b981' }}>Cash In</span>
                <span style={{ fontSize: '0.875rem', fontWeight: '500', color: '#10b981' }}>
                  {formatCurrency(summary.cashIn || 0)}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.875rem', color: '#ef4444' }}>Cash Out</span>
                <span style={{ fontSize: '0.875rem', fontWeight: '500', color: '#ef4444' }}>
                  {formatCurrency(summary.cashOut || 0)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Recent Transactions */}
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
            Recent Transactions
          </h2>
          <button
            onClick={() => setShowFilters((prev) => !prev)}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: '#f3f4f6',
              color: '#374151',
              border: '1px solid #d1d5db',
              borderRadius: '0.375rem',
              cursor: 'pointer',
              fontSize: '0.875rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            <FontAwesomeIcon icon={faFilter} />
            Filter
          </button>
        </div>

        {showFilters && (
          <div style={{
            padding: '1rem 1.5rem',
            borderBottom: '1px solid #e5e7eb',
            display: 'flex',
            gap: '0.75rem',
            flexWrap: 'wrap'
          }}>
            <select
              value={transactionFilter}
              onChange={(e) => setTransactionFilter(e.target.value as 'all' | 'money-in' | 'money-out' | 'invoice')}
              style={{
                padding: '0.5rem 0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '0.375rem',
                fontSize: '0.875rem'
              }}
            >
              <option value="all">All transaction types</option>
              <option value="money-in">Money in</option>
              <option value="money-out">Money out</option>
              <option value="invoice">Invoices</option>
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'all' | 'completed' | 'pending' | 'overdue')}
              style={{
                padding: '0.5rem 0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '0.375rem',
                fontSize: '0.875rem'
              }}
            >
              <option value="all">All statuses</option>
              <option value="completed">Completed</option>
              <option value="pending">Pending</option>
              <option value="overdue">Overdue</option>
            </select>
          </div>
        )}

        <div style={{ padding: '0' }}>
          {visibleTransactions.map((transaction) => (
            <div
              key={`${transaction.type}-${transaction.id}-${transaction.date}`}
              style={{
                padding: '1rem 1.5rem',
                borderBottom: '1px solid #f3f4f6',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{
                  width: '2.5rem',
                  height: '2.5rem',
                  borderRadius: '50%',
                  backgroundColor: transaction.amount >= 0 ? '#dcfce7' : '#fef2f2',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <FontAwesomeIcon
                    icon={transaction.amount >= 0 ? faArrowUp : faArrowDown}
                    style={{
                      color: transaction.amount >= 0 ? '#10b981' : '#ef4444',
                      fontSize: '0.875rem'
                    }}
                  />
                </div>
                <div>
                  <p style={{ margin: 0, fontWeight: '500', color: '#111827', fontSize: '0.875rem' }}>
                    {transaction.description}
                  </p>
                  <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.75rem', color: '#6b7280' }}>
                    {transaction.customerVendor} • {formatDate(transaction.date)}
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <span style={{
                  fontSize: '0.875rem',
                  fontWeight: '500',
                  color: transaction.amount >= 0 ? '#10b981' : '#ef4444'
                }}>
                  {transaction.amount >= 0 ? '+' : ''}{formatCurrency(transaction.amount)}
                </span>

                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                  padding: '0.25rem 0.75rem',
                  borderRadius: '9999px',
                  fontSize: '0.75rem',
                  fontWeight: '500',
                  backgroundColor: transaction.status === 'completed' ? '#dcfce7' :
                                   transaction.status === 'pending' ? '#fef3c7' : '#fef2f2',
                  color: transaction.status === 'completed' ? '#065f46' :
                         transaction.status === 'pending' ? '#92400e' : '#991b1b'
                }}>
                  <FontAwesomeIcon
                    icon={transaction.status === 'completed' ? faCheckCircle :
                          transaction.status === 'pending' ? faClock : faExclamationTriangle}
                    style={{ fontSize: '0.625rem' }}
                  />
                  {transaction.status.charAt(0).toUpperCase() + transaction.status.slice(1)}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ padding: '1rem 1.5rem', textAlign: 'center' }}>
          <button
            onClick={() => setShowAllTransactions((prev) => !prev)}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: 'transparent',
              color: '#3b82f6',
              border: '1px solid #3b82f6',
              borderRadius: '0.375rem',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: '500'
            }}
          >
            {showAllTransactions ? 'Show Top 10' : `View All Transactions (${filteredTransactions.length})`}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PaymentDashboard;



















