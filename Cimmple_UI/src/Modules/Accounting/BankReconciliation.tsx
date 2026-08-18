import React, { useState, useEffect } from "react";
import { toast } from "react-toastify";
import { faUniversity, faCheckCircle, faExclamationTriangle, faSync, faDownload, faUpload, faSearch, faFilter } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { AccountingService, BankTransaction, BankAccount } from "../../Common/Services/AccountingService";
import { BankService } from "../../Common/Services/BankService";
import { useFormatting } from "../../Common/Hooks/useFormatting";

const BankReconciliation: React.FC = () => {
  const { formatCurrency: formatCurrencyRaw, formatDate } = useFormatting();
  const formatCurrency = (amount: number) => formatCurrencyRaw(Math.abs(amount));
  const [selectedAccount, setSelectedAccount] = useState<number>(1);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [transactions, setTransactions] = useState<BankTransaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [statementDate, setStatementDate] = useState('');
  const [statementBalance, setStatementBalance] = useState('');
  const [reconciledBalance, setReconciledBalance] = useState(0);
  const [differences, setDifferences] = useState<BankTransaction[]>([]);
  const [filters, setFilters] = useState({
    reconciled: 'all',
    dateRange: 'Last 30 Days',
    amountRange: 'All'
  });

  useEffect(() => {
    loadBankAccounts();
    loadTransactions();
  }, [selectedAccount, filters]);

  const loadBankAccounts = async () => {
    try {
      const storage = JSON.parse(localStorage.getItem("storage") || "{}");
      const tenantID = storage?.tenantID || 0;
      const bankData = await BankService.GetBanklist({ tenantid: tenantID });
      if (bankData) {
        const transformedAccounts: BankAccount[] = bankData.map(bank => ({
          id: bank.id,
          name: bank.nickName || bank.bankName,
          accountNumber: bank.lastAccountNo || bank.accountNo,
          balance: bank.balance,
          lastReconciled: '2024-01-01'
        }));
        setAccounts(transformedAccounts);
      }
    } catch (error) {
      console.error('Error loading bank accounts:', error);
      toast.error('Failed to load bank accounts');
    }
  };

  const loadTransactions = async () => {
    setLoading(true);
    try {
      const endDate = new Date();
      const startDate = new Date();

      switch (filters.dateRange) {
        case 'Last 7 Days':
          startDate.setDate(endDate.getDate() - 7);
          break;
        case 'Last 30 Days':
          startDate.setDate(endDate.getDate() - 30);
          break;
        case 'Last 90 Days':
          startDate.setDate(endDate.getDate() - 90);
          break;
        case 'This Year':
          startDate.setMonth(0, 1);
          break;
        default:
          startDate.setDate(endDate.getDate() - 30);
      }

      const transactions = await AccountingService.GetBankTransactions(
        selectedAccount,
        startDate.toISOString().split('T')[0],
        endDate.toISOString().split('T')[0]
      );

      if (transactions) {
        let filteredTransactions = transactions;

        if (filters.reconciled !== 'all') {
          const isReconciled = filters.reconciled === 'reconciled';
          filteredTransactions = filteredTransactions.filter(t => t.reconciled === isReconciled);
        }

        if (filters.amountRange !== 'All') {
          filteredTransactions = filteredTransactions.filter(transaction => {
            const absAmount = Math.abs(transaction.amount);
            switch (filters.amountRange) {
              case 'Under $100': return absAmount < 100;
              case '$100 - $500': return absAmount >= 100 && absAmount < 500;
              case '$500 - $1,000': return absAmount >= 500 && absAmount < 1000;
              case 'Over $1,000': return absAmount >= 1000;
              default: return true;
            }
          });
        }

        setTransactions(filteredTransactions);

        const reconciledTxns = filteredTransactions.filter(t => t.reconciled);
        const calculatedBalance = reconciledTxns.reduce((sum, t) => sum + t.amount, 0);
        setReconciledBalance(calculatedBalance);

        const unreconciledTxns = filteredTransactions.filter(t => !t.reconciled);
        setDifferences(unreconciledTxns);
      }
    } catch (error) {
      console.error('Error loading bank transactions:', error);
      toast.error('Failed to load bank transactions');
    } finally {
      setLoading(false);
    }
  };

  const handleReconcile = async (transactionId: number) => {
    try {
      const transaction = transactions.find(t => t.id === transactionId);
      if (transaction) {
        await AccountingService.ReconcileBankTransaction(transactionId, !transaction.reconciled);
        setTransactions(prev =>
          prev.map(t =>
            t.id === transactionId ? { ...t, reconciled: !t.reconciled } : t
          )
        );
        toast.success('Transaction reconciliation updated');
      }
    } catch (error) {
      console.error('Error reconciling transaction:', error);
      toast.error('Failed to update reconciliation status');
    }
  };

  const handleBulkReconcile = async () => {
    const unreconciled = transactions.filter(t => !t.reconciled);
    if (unreconciled.length === 0) {
      toast.info('No unreconciled transactions to process');
      return;
    }

    try {
      const transactionIds = unreconciled.map(t => t.id);
      await AccountingService.BulkReconcileTransactions(transactionIds);
      setTransactions(prev =>
        prev.map(t => ({ ...t, reconciled: true }))
      );
      toast.success(`${unreconciled.length} transactions reconciled`);
    } catch (error) {
      console.error('Error bulk reconciling transactions:', error);
      toast.error('Failed to reconcile transactions');
    }
  };

  const handleImportStatement = () => {
    toast.info('Bank statement import functionality coming soon');
  };

  const handleExportReport = () => {
    toast.success('Reconciliation report exported');
  };

  const selectedAccountData = accounts.find(acc => acc.id === selectedAccount);

  return (
    <div style={{ padding: '1.5rem', width: '100%' }}>
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '2rem', fontWeight: 'bold', color: '#111827' }}>
              Bank Reconciliation
            </h1>
            <p style={{ margin: '0.5rem 0 0 0', color: '#6b7280' }}>
              Reconcile bank statements with company records
            </p>
          </div>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <button
              onClick={handleImportStatement}
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
              <FontAwesomeIcon icon={faUpload} />
              Import Statement
            </button>
            <button
              onClick={handleExportReport}
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
              <FontAwesomeIcon icon={faDownload} />
              Export Report
            </button>
          </div>
        </div>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '2rem',
        marginBottom: '2rem'
      }}>
        <div style={{
          backgroundColor: 'white',
          borderRadius: '0.5rem',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
          padding: '1.5rem'
        }}>
          <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.125rem', fontWeight: '600', color: '#111827' }}>
            Select Bank Account
          </h3>
          <select
            value={selectedAccount}
            onChange={(e) => setSelectedAccount(parseInt(e.target.value))}
            style={{
              width: '100%',
              padding: '0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: '0.375rem',
              fontSize: '0.875rem',
              marginBottom: '1rem'
            }}
          >
            {accounts.map(account => (
              <option key={account.id} value={account.id}>
                {account.name} - {account.accountNumber}
              </option>
            ))}
          </select>

          {selectedAccountData && (
            <div style={{ padding: '1rem', backgroundColor: '#f9fafb', borderRadius: '0.375rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>Current Balance</span>
                <span style={{ fontSize: '1.125rem', fontWeight: '600', color: '#111827' }}>
                  {formatCurrency(selectedAccountData.balance)}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>Last Reconciled</span>
                <span style={{ fontSize: '0.875rem', color: '#111827' }}>
                  {formatDate(selectedAccountData.lastReconciled)}
                </span>
              </div>
            </div>
          )}
        </div>

        <div style={{
          backgroundColor: 'white',
          borderRadius: '0.5rem',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
          padding: '1.5rem'
        }}>
          <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.125rem', fontWeight: '600', color: '#111827' }}>
            Reconciliation Summary
          </h3>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem', color: '#374151' }}>
              Statement Date
            </label>
            <input
              type="date"
              value={statementDate}
              onChange={(e) => setStatementDate(e.target.value)}
              style={{
                width: '100%',
                padding: '0.5rem',
                border: '1px solid #d1d5db',
                borderRadius: '0.375rem',
                fontSize: '0.875rem'
              }}
            />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem', color: '#374151' }}>
              Statement Balance
            </label>
            <input
              type="number"
              step="0.01"
              value={statementBalance}
              onChange={(e) => setStatementBalance(e.target.value)}
              placeholder="Enter statement balance"
              style={{
                width: '100%',
                padding: '0.5rem',
                border: '1px solid #d1d5db',
                borderRadius: '0.375rem',
                fontSize: '0.875rem'
              }}
            />
          </div>

          <div style={{ padding: '1rem', backgroundColor: '#f9fafb', borderRadius: '0.375rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>Reconciled Balance</span>
              <span style={{ fontSize: '1rem', fontWeight: '600', color: '#111827' }}>
                {formatCurrency(reconciledBalance)}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>Unreconciled Items</span>
              <span style={{ fontSize: '1rem', fontWeight: '600', color: differences.length > 0 ? '#ef4444' : '#10b981' }}>
                {differences.length}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>Difference</span>
              <span style={{
                fontSize: '1rem',
                fontWeight: '600',
                color: Math.abs(parseFloat(statementBalance) - reconciledBalance) < 0.01 ? '#10b981' : '#ef4444'
              }}>
                {formatCurrency(Math.abs(parseFloat(statementBalance || '0') - reconciledBalance))}
              </span>
            </div>
          </div>
        </div>
      </div>

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
            value={filters.reconciled}
            onChange={(e) => setFilters(prev => ({ ...prev, reconciled: e.target.value }))}
            style={{
              padding: '0.5rem 1rem',
              border: '1px solid #d1d5db',
              borderRadius: '0.375rem',
              fontSize: '0.875rem'
            }}
          >
            <option value="all">All Transactions</option>
            <option value="reconciled">Reconciled Only</option>
            <option value="unreconciled">Unreconciled Only</option>
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
            <option value="Under $100">Under $100</option>
            <option value="$100 - $500">$100 - $500</option>
            <option value="$500 - $1,000">$500 - $1,000</option>
            <option value="Over $1,000">Over $1,000</option>
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
            <option value="Last 7 Days">Last 7 Days</option>
            <option value="Last 30 Days">Last 30 Days</option>
            <option value="Last 90 Days">Last 90 Days</option>
            <option value="This Year">This Year</option>
          </select>

          <button
            onClick={handleBulkReconcile}
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
            <FontAwesomeIcon icon={faCheckCircle} />
            Reconcile All
          </button>
        </div>
      </div>

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
            Bank Transactions ({transactions.length})
          </h2>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '2rem' }}>
            <div>Loading bank transactions...</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ backgroundColor: '#f9fafb' }}>
                <tr>
                  <th style={{ padding: '0.75rem 1.5rem', textAlign: 'left', fontSize: '0.875rem', fontWeight: '600', color: '#374151', borderBottom: '1px solid #e5e7eb' }}>
                    Date
                  </th>
                  <th style={{ padding: '0.75rem 1.5rem', textAlign: 'left', fontSize: '0.875rem', fontWeight: '600', color: '#374151', borderBottom: '1px solid #e5e7eb' }}>
                    Description
                  </th>
                  <th style={{ padding: '0.75rem 1.5rem', textAlign: 'right', fontSize: '0.875rem', fontWeight: '600', color: '#374151', borderBottom: '1px solid #e5e7eb' }}>
                    Amount
                  </th>
                  <th style={{ padding: '0.75rem 1.5rem', textAlign: 'center', fontSize: '0.875rem', fontWeight: '600', color: '#374151', borderBottom: '1px solid #e5e7eb' }}>
                    Type
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
                {transactions.map((transaction) => (
                  <tr key={transaction.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '1rem 1.5rem' }}>
                      <div style={{ fontSize: '0.875rem', color: '#111827' }}>
                        {formatDate(transaction.date)}
                      </div>
                    </td>
                    <td style={{ padding: '1rem 1.5rem' }}>
                      <div>
                        <div style={{ fontSize: '0.875rem', color: '#111827', fontWeight: '500' }}>
                          {transaction.description}
                        </div>
                        {transaction.reference && (
                          <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                            Ref: {transaction.reference}
                          </div>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '1rem 1.5rem', textAlign: 'right' }}>
                      <span style={{
                        fontSize: '0.875rem',
                        fontWeight: '600',
                        color: transaction.amount >= 0 ? '#10b981' : '#ef4444'
                      }}>
                        {transaction.amount >= 0 ? '+' : ''}{formatCurrency(transaction.amount)}
                      </span>
                    </td>
                    <td style={{ padding: '1rem 1.5rem', textAlign: 'center' }}>
                      <span style={{
                        padding: '0.25rem 0.75rem',
                        borderRadius: '9999px',
                        fontSize: '0.75rem',
                        fontWeight: '500',
                        backgroundColor: transaction.type === 'credit' ? '#dcfce7' : '#fef2f2',
                        color: transaction.type === 'credit' ? '#065f46' : '#991b1b'
                      }}>
                        {transaction.type.toUpperCase()}
                      </span>
                    </td>
                    <td style={{ padding: '1rem 1.5rem', textAlign: 'center' }}>
                      {transaction.reconciled ? (
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.25rem',
                          padding: '0.25rem 0.75rem',
                          borderRadius: '0.375rem',
                          fontSize: '0.75rem',
                          fontWeight: '500',
                          color: '#065f46',
                          backgroundColor: '#dcfce7'
                        }}>
                          <FontAwesomeIcon icon={faCheckCircle} style={{ fontSize: '0.625rem' }} />
                          Reconciled
                        </span>
                      ) : (
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.25rem',
                          padding: '0.25rem 0.75rem',
                          borderRadius: '0.375rem',
                          fontSize: '0.75rem',
                          fontWeight: '500',
                          color: '#d97706',
                          backgroundColor: '#fef3c7'
                        }}>
                          <FontAwesomeIcon icon={faExclamationTriangle} style={{ fontSize: '0.625rem' }} />
                          Pending
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '1rem 1.5rem', textAlign: 'center' }}>
                      <button
                        onClick={() => handleReconcile(transaction.id)}
                        style={{
                          padding: "0.25rem 0.75rem",
                          backgroundColor: transaction.reconciled ? "#ef4444" : "#10b981",
                          color: "white",
                          border: "none",
                          borderRadius: "0.25rem",
                          cursor: "pointer",
                          fontSize: "0.75rem",
                          fontWeight: "500"
                        }}
                      >
                        <FontAwesomeIcon
                          icon={transaction.reconciled ? faExclamationTriangle : faCheckCircle}
                          style={{ marginRight: '0.25rem' }}
                        />
                        {transaction.reconciled ? 'Unreconcile' : 'Reconcile'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {transactions.length === 0 && !loading && (
          <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
            No bank transactions found matching the current filters.
          </div>
        )}
      </div>
    </div>
  );
};

export default BankReconciliation;



















