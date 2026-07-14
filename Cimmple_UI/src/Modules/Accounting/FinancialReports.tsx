import React, { useState } from "react";
import { useHistory } from "react-router-dom";
import { toast } from "react-toastify";
import { faFileAlt, faDownload, faEye, faCalendar, faFilter, faChartBar, faChartLine, faTable, faTimes } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { AccountingService } from "../../Common/Services/AccountingService";
import "./FinancialReports.scss";

interface ReportType {
  id: string;
  name: string;
  description: string;
  icon: any;
  category: string;
}

const ymdLocal = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const FinancialReports: React.FC = () => {
  const history = useHistory();
  const [selectedReport, setSelectedReport] = useState<string>('');
  const [dateRange, setDateRange] = useState('This Month');
  const [reportFormat, setReportFormat] = useState<'pdf' | 'excel' | 'csv'>('pdf');
  const [loading, setLoading] = useState(false);
  const [generatedReportData, setGeneratedReportData] = useState<any>(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportToView, setReportToView] = useState<string>('');
  const [customStartDate, setCustomStartDate] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return ymdLocal(d);
  });
  const [customEndDate, setCustomEndDate] = useState(() => ymdLocal(new Date()));

  const reportTypes: ReportType[] = [
    // Financial Position Reports
    {
      id: 'balance-sheet',
      name: 'Balance Sheet',
      description: 'Assets, liabilities, and equity statement',
      icon: faTable,
      category: 'Financial Position'
    },
    {
      id: 'trial-balance',
      name: 'Trial Balance',
      description: 'List of all general ledger account balances',
      icon: faTable,
      category: 'Financial Position'
    },

    // Income Statement Reports
    {
      id: 'profit-loss',
      name: 'Profit & Loss Statement',
      description: 'Revenue, expenses, and net income',
      icon: faChartLine,
      category: 'Income Statement'
    },
    {
      id: 'income-statement',
      name: 'Income Statement',
      description: 'Detailed revenue and expense breakdown',
      icon: faChartBar,
      category: 'Income Statement'
    },

    // Cash Flow Reports
    {
      id: 'cash-flow',
      name: 'Cash Flow Statement',
      description: 'Operating, investing, and financing activities',
      icon: faChartLine,
      category: 'Cash Flow'
    },

    // Accounts Receivable Reports
    {
      id: 'ar-aging',
      name: 'AR Aging Report',
      description: 'Customer accounts receivable by age',
      icon: faCalendar,
      category: 'Accounts Receivable'
    },
    {
      id: 'customer-statements',
      name: 'Customer Statements',
      description: 'Individual customer account statements (Coming Soon)',
      icon: faFileAlt,
      category: 'Accounts Receivable'
    },

    // Accounts Payable Reports
    {
      id: 'ap-aging',
      name: 'AP Aging Report',
      description: 'Vendor accounts payable by age',
      icon: faCalendar,
      category: 'Accounts Payable'
    },
    {
      id: 'vendor-analysis',
      name: 'Vendor Payment Analysis',
      description: 'Vendor payment history and trends (Coming Soon)',
      icon: faChartBar,
      category: 'Accounts Payable'
    },

    // General Ledger Reports
    {
      id: 'general-ledger',
      name: 'General Ledger',
      description: 'Posted lines and running balance by account (GL activity)',
      icon: faTable,
      category: 'General Ledger'
    },
    {
      id: 'journal-entries',
      name: 'Journal Entries',
      description: 'Post and review general-ledger journal entries',
      icon: faFileAlt,
      category: 'General Ledger'
    }
  ];

  // Supported report types (implemented in backend)
  const supportedReportTypes = [
    'balance-sheet',
    'trial-balance',
    'profit-loss',
    'income-statement',
    'cash-flow',
    'ar-aging',
    'ap-aging'
  ];

  const isReportSupported = (reportId: string): boolean => {
    return supportedReportTypes.includes(reportId);
  };

  const getAccountingNavPath = (reportId: string): string | null => {
    if (reportId === 'journal-entries') return '/accounts/journal-entries';
    if (reportId === 'general-ledger') return '/accounts/general-ledger';
    return null;
  };

  const buildReportParams = (format: 'pdf' | 'excel' | 'csv') => {
    const base: Record<string, unknown> = { dateRange, format };
    if (dateRange === 'Custom') {
      base.customStartDate = customStartDate;
      base.customEndDate = customEndDate;
    }
    return base;
  };

  const validateCustomRange = (): boolean => {
    if (dateRange !== 'Custom') return true;
    if (!customStartDate || !customEndDate) {
      toast.error('Please choose a start and end date for the custom range.');
      return false;
    }
    if (new Date(customStartDate) > new Date(customEndDate)) {
      toast.error('Custom start date cannot be after the end date.');
      return false;
    }
    return true;
  };

  const categories = Array.from(new Set(reportTypes.map(report => report.category)));

  const handleGenerateReport = async () => {
    if (!selectedReport) {
      toast.error('Please select a report type');
      return;
    }
    const navPath = getAccountingNavPath(selectedReport);
    if (navPath) {
      history.push(navPath);
      return;
    }
    if (!validateCustomRange()) return;

    setLoading(true);
    try {
      const reportData = await AccountingService.GenerateFinancialReport(
        selectedReport,
        buildReportParams(reportFormat)
      );

      if (reportData) {
        setGeneratedReportData(reportData);
        setReportToView(selectedReport);
        toast.success(`${reportTypes.find(r => r.id === selectedReport)?.name} generated successfully`);
        
        // Auto-open modal to show the report
        setShowReportModal(true);
        
        // Auto-download if format is not pdf (for viewing)
        if (reportFormat !== 'pdf') {
          // Small delay to let modal open first
          setTimeout(() => {
            handleDownloadReport(reportData, selectedReport);
          }, 500);
        }
      }

    } catch (error) {
      console.error('Error generating report:', error);
      toast.error('Failed to generate report');
    } finally {
      setLoading(false);
    }
  };

  const handleViewReport = async (reportId: string) => {
    const nav = getAccountingNavPath(reportId);
    if (nav) {
      history.push(nav);
      return;
    }
    if (!isReportSupported(reportId)) {
      toast.info('This report type is not yet available. Coming soon!');
      return;
    }
    if (!validateCustomRange()) return;

    try {
      setLoading(true);
      setReportToView(reportId);
      setSelectedReport(reportId);
      
      // Generate the report if not already generated
      if (!generatedReportData || selectedReport !== reportId) {
        const reportData = await AccountingService.GenerateFinancialReport(
          reportId,
          buildReportParams('pdf')
        );
        
        if (reportData) {
          setGeneratedReportData(reportData);
        } else {
          toast.error('No data returned for this report');
          return;
        }
      }
      
      setShowReportModal(true);
    } catch (error: any) {
      console.error('Error viewing report:', error);
      const errorMessage = error?.response?.data?.error || error?.message || 'Failed to load report';
      toast.error(`Failed to load report: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadReport = (reportData: any, reportId: string, format?: 'pdf' | 'excel' | 'csv') => {
    if (!reportData) {
      toast.error('No report data available. Please generate the report first.');
      return;
    }

    const reportName = reportTypes.find(r => r.id === reportId)?.name || 'Report';
    const fileName = `${reportName}_${dateRange.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}`;
    const downloadFormat = format || reportFormat;

    try {
      if (downloadFormat === 'csv') {
        // Convert report data to CSV
        const csvContent = convertToCSV(reportData);
        downloadFile(csvContent, `${fileName}.csv`, 'text/csv;charset=utf-8;');
        toast.success('Report downloaded as CSV');
      } else if (downloadFormat === 'excel') {
        // For Excel, use CSV format with Excel MIME type (Excel can open CSV files)
        const csvContent = convertToCSV(reportData);
        // Add BOM for UTF-8 to ensure Excel opens it correctly
        const BOM = '\uFEFF';
        downloadFile(BOM + csvContent, `${fileName}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        toast.success('Report downloaded as Excel (CSV format)');
      } else {
        // PDF format - generate CSV that can be opened in Excel and saved as PDF
        const csvContent = convertToCSV(reportData);
        const BOM = '\uFEFF';
        downloadFile(BOM + csvContent, `${fileName}.csv`, 'text/csv;charset=utf-8;');
        toast.info('Report downloaded as CSV. Open in Excel and save as PDF if needed.');
      }
    } catch (error) {
      console.error('Error downloading report:', error);
      toast.error('Failed to download report');
    }
  };

  const convertToCSV = (data: any): string => {
    if (!data) return '';
    
    const rows: string[] = [];
    
    // Add report header
    if (data.reportType) {
      rows.push(`Report Type: ${data.reportType}`);
    }
    if (data.asOfDate) {
      rows.push(`As Of Date: ${data.asOfDate}`);
    }
    if (data.periodStart && data.periodEnd) {
      rows.push(`Period: ${data.periodStart} to ${data.periodEnd}`);
    }
    rows.push(''); // Empty row
    
    // Convert data to CSV rows
    if (data.assets) {
      rows.push('Assets');
      rows.push(`Current Assets,${data.assets.currentAssets || 0}`);
      rows.push(`Fixed Assets,${data.assets.fixedAssets || 0}`);
      rows.push(`Total Assets,${data.assets.totalAssets || 0}`);
      rows.push('');
    }
    
    if (data.liabilitiesAndEquity) {
      rows.push('Liabilities and Equity');
      rows.push(`Current Liabilities,${data.liabilitiesAndEquity.currentLiabilities || 0}`);
      rows.push(`Long Term Liabilities,${data.liabilitiesAndEquity.longTermLiabilities || 0}`);
      rows.push(`Total Liabilities,${data.liabilitiesAndEquity.totalLiabilities || 0}`);
      rows.push(`Equity,${data.liabilitiesAndEquity.equity || 0}`);
      rows.push(`Total Liabilities and Equity,${data.liabilitiesAndEquity.totalLiabilitiesAndEquity || 0}`);
      rows.push('');
    }
    
    if (data.reportBasis === 'accrual-gl' && Array.isArray(data.sections)) {
      rows.push('Profit & Loss (accrual — general ledger)');
      rows.push(`Net revenue,${data.netRevenue ?? 0}`);
      data.sections.forEach((sec: any) => {
        const st = Math.abs(Number(sec?.subtotal) || 0);
        if (!(Array.isArray(sec?.lines) && sec.lines.length > 0) && st < 0.0001) return;
        rows.push(`"${sec.title}"`);
        (sec.lines || []).forEach((ln: any) => {
          rows.push(`${ln.accountCode || ''},"${(ln.accountName || '').replace(/"/g, '""')}",${ln.amount ?? 0}`);
        });
        rows.push(`Subtotal - ${sec.title},${sec.subtotal ?? 0}`);
        rows.push('');
      });
      rows.push(`Gross profit,${data.grossProfit ?? 0}`);
      rows.push(`Operating income,${data.operatingIncome ?? 0}`);
      rows.push(`Income before tax,${data.incomeBeforeTax ?? 0}`);
      rows.push(`Net income,${data.netIncome ?? 0}`);
      rows.push('');
    } else if (data.revenue !== undefined) {
      rows.push('Income Statement');
      rows.push(`Revenue,${data.revenue || 0}`);
      rows.push(`Cost of Goods Sold,${data.costOfGoodsSold || 0}`);
      rows.push(`Gross Profit,${data.grossProfit || 0}`);
      rows.push(`Operating Expenses,${data.operatingExpenses || 0}`);
      rows.push(`Operating Income,${data.operatingIncome || 0}`);
      rows.push(`Net Income,${data.netIncome || 0}`);
      rows.push('');
    }
    
    if (data.operatingActivities !== undefined) {
      rows.push('Cash Flow Statement');
      rows.push(`Operating Activities,${data.operatingActivities || 0}`);
      rows.push(`Investing Activities,${data.investingActivities || 0}`);
      rows.push(`Financing Activities,${data.financingActivities || 0}`);
      rows.push(`Net Cash Flow,${data.netCashFlow || 0}`);
      rows.push('');
    }
    
    if (data.agingBuckets) {
      rows.push('Aging Report');
      rows.push('Bucket,Amount,Percentage');
      if (Array.isArray(data.agingBuckets)) {
        data.agingBuckets.forEach((bucket: any) => {
          rows.push(`${bucket.bucket || ''},${bucket.amount || 0},${bucket.percentage || 0}%`);
        });
      }
      rows.push('');
    }
    
    if (data.accounts) {
      rows.push('Trial Balance');
      rows.push('Account Code,Account Name,Account Type,Balance');
      if (Array.isArray(data.accounts)) {
        data.accounts.forEach((account: any) => {
          rows.push(`${account.accountCode || ''},${account.accountName || ''},${account.accountType || ''},${account.balance || 0}`);
        });
      }
      rows.push('');
      rows.push(`Total Debits,${data.totalDebits || 0}`);
      rows.push(`Total Credits,${data.totalCredits || 0}`);
      rows.push(`Is Balanced,${data.isBalanced ? 'Yes' : 'No'}`);
    }
    
    return rows.join('\n');
  };

  const downloadFile = (content: string, fileName: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = window.URL.createObjectURL(blob);
    const link = window.document.createElement('a');
    link.href = url;
    link.download = fileName;
    window.document.body.appendChild(link);
    link.click();
    window.document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  const getReportByCategory = (category: string) => {
    return reportTypes.filter(report => report.category === category);
  };

  return (
    <div className="financial-reports">
      {/* Header */}
      <div className="fr-header">
        <div>
          <h1>Financial Reports</h1>
          <p>Generate and view comprehensive financial statements and reports</p>
        </div>
      </div>

      {/* Report Generation Controls */}
      <div className="fr-generation-section">
        <h3>Generate Report</h3>

        <div className="fr-controls-grid">
          <div className="fr-control-group">
            <label>Report Type</label>
            <select
              value={selectedReport}
              onChange={(e) => setSelectedReport(e.target.value)}
            >
              <option value="">Select a report...</option>
              {categories.map(category => (
                <optgroup key={category} label={category}>
                  {getReportByCategory(category).map(report => (
                    <option key={report.id} value={report.id}>
                      {report.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          <div className="fr-control-group">
            <label>Date Range</label>
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
            >
              <option value="This Month">This Month</option>
              <option value="Last Month">Last Month</option>
              <option value="This Quarter">This Quarter</option>
              <option value="Last Quarter">Last Quarter</option>
              <option value="This Year">This Year</option>
              <option value="Last Year">Last Year</option>
              <option value="Custom">Custom Range</option>
            </select>
          </div>

          <div className="fr-control-group">
            <label>Format</label>
            <select
              value={reportFormat}
              onChange={(e) => setReportFormat(e.target.value as 'pdf' | 'excel' | 'csv')}
            >
              <option value="pdf">PDF</option>
              <option value="excel">Excel</option>
              <option value="csv">CSV</option>
            </select>
          </div>

          <button
            onClick={handleGenerateReport}
            disabled={loading || !selectedReport}
            className="fr-generate-btn"
          >
            <FontAwesomeIcon icon={loading ? faDownload : faEye} />
            {loading ? 'Generating...' : 'Generate & View Report'}
          </button>
        </div>

        {dateRange === 'Custom' && (
          <div className="fr-custom-range-row">
            <div className="fr-control-group">
              <label>Start date</label>
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
              />
            </div>
            <div className="fr-control-group">
              <label>End date</label>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
              />
            </div>
          </div>
        )}

        {selectedReport && (
          <div className={`fr-selected-report-info ${generatedReportData && reportToView === selectedReport ? 'generated' : ''}`}>
            <div className="fr-info-content">
              <div className={`fr-info-left ${generatedReportData && reportToView === selectedReport ? 'generated' : ''}`}>
                <FontAwesomeIcon
                  icon={reportTypes.find(r => r.id === selectedReport)?.icon || faFileAlt}
                />
                <div className="fr-info-text">
                  <h4>{reportTypes.find(r => r.id === selectedReport)?.name}</h4>
                  <p>{reportTypes.find(r => r.id === selectedReport)?.description}</p>
                </div>
              </div>
              {generatedReportData && reportToView === selectedReport && (
                <div className="fr-generated-badge">
                  <FontAwesomeIcon icon={faEye} />
                  Report Generated - View in Modal
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Report Categories */}
      {categories.map(category => (
        <div key={category} className="fr-category-section">
          <h3>{category}</h3>

          <div className="fr-reports-grid">
            {getReportByCategory(category).map(report => {
              const isSupported = isReportSupported(report.id);
              const navPath = getAccountingNavPath(report.id);
              const isInteractive = isSupported || !!navPath;
              return (
              <div
                key={report.id}
                className={`fr-report-card ${!isInteractive ? 'unsupported' : ''} ${selectedReport === report.id ? 'selected' : ''}`}
                onClick={() => {
                  if (navPath) {
                    history.push(navPath);
                    return;
                  }
                  if (isSupported) {
                    setSelectedReport(report.id);
                    // Auto-generate and view when clicking tile
                    handleViewReport(report.id);
                  }
                }}
              >
                <div className="fr-report-header">
                  <div className="fr-report-icon">
                    <FontAwesomeIcon icon={report.icon} />
                  </div>
                  <div className="fr-report-info">
                    <h4>{report.name}</h4>
                    <p>{report.description}</p>
                  </div>
                </div>

                <div className="fr-report-actions">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleViewReport(report.id);
                    }}
                    disabled={!isInteractive}
                    className="fr-action-btn fr-view-btn"
                  >
                    <FontAwesomeIcon icon={faEye} />
                    View
                  </button>
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (navPath) {
                        history.push(navPath);
                        return;
                      }
                      if (!isSupported) {
                        toast.info('This report type is not yet available. Coming soon!');
                        return;
                      }
                      if (!validateCustomRange()) return;
                      try {
                        setLoading(true);
                        const reportData = await AccountingService.GenerateFinancialReport(
                          report.id,
                          buildReportParams(reportFormat)
                        );
                        if (reportData) {
                          handleDownloadReport(reportData, report.id, reportFormat);
                        } else {
                          toast.error('No data returned for this report');
                        }
                      } catch (error: any) {
                        console.error('Error downloading report:', error);
                        const errorMessage = error?.response?.data?.error || error?.message || 'Failed to download report';
                        toast.error(`Failed to download report: ${errorMessage}`);
                      } finally {
                        setLoading(false);
                      }
                    }}
                    disabled={!isSupported}
                    className="fr-action-btn fr-download-btn"
                  >
                    <FontAwesomeIcon icon={faDownload} />
                    Download
                  </button>
                </div>
              </div>
            );
            })}
          </div>
        </div>
      ))}

      {/* Quick Actions */}
      <div className="fr-quick-actions">
        <h3>Quick Actions</h3>

        <div className="fr-quick-buttons">
          <button
            onClick={() => {
              setSelectedReport('profit-loss');
              setDateRange('This Month');
              handleGenerateReport();
            }}
            style={{ backgroundColor: '#10b981', color: 'white' }}
          >
            <FontAwesomeIcon icon={faChartLine} />
            Monthly P&L
          </button>

          <button
            onClick={() => {
              setSelectedReport('balance-sheet');
              setDateRange('This Month');
              handleGenerateReport();
            }}
            style={{ backgroundColor: '#8b5cf6', color: 'white' }}
          >
            <FontAwesomeIcon icon={faTable} />
            Balance Sheet
          </button>

          <button
            onClick={() => {
              setSelectedReport('ar-aging');
              setDateRange('This Month');
              handleGenerateReport();
            }}
            style={{ backgroundColor: '#f59e0b', color: 'white' }}
          >
            <FontAwesomeIcon icon={faCalendar} />
            AR Aging
          </button>

          <button
            onClick={() => {
              setSelectedReport('cash-flow');
              setDateRange('This Month');
              handleGenerateReport();
            }}
            style={{ backgroundColor: '#06b6d4', color: 'white' }}
          >
            <FontAwesomeIcon icon={faChartBar} />
            Cash Flow
          </button>
        </div>
      </div>

      {/* Report View Modal */}
      {showReportModal && generatedReportData && (
        <div
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
            zIndex: 1000,
            padding: '2rem'
          }}
          onClick={() => setShowReportModal(false)}
        >
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: '0.5rem',
              maxWidth: '900px',
              width: '100%',
              maxHeight: '90vh',
              overflow: 'auto',
              boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '1.5rem',
              borderBottom: '1px solid #e5e7eb'
            }}>
              <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: '600', color: '#111827' }}>
                {reportTypes.find(r => r.id === reportToView)?.name || 'Report'}
              </h2>
              <button
                onClick={() => setShowReportModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '1.5rem',
                  color: '#6b7280',
                  cursor: 'pointer',
                  padding: '0.25rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <FontAwesomeIcon icon={faTimes} />
              </button>
            </div>

            {/* Modal Content */}
            <div style={{ padding: '1.5rem' }}>
              <div style={{ marginBottom: '1rem', color: '#6b7280', fontSize: '0.875rem' }}>
                {generatedReportData.asOfDate && `As of: ${generatedReportData.asOfDate}`}
                {generatedReportData.periodStart && generatedReportData.periodEnd && 
                  `Period: ${generatedReportData.periodStart} to ${generatedReportData.periodEnd}`}
              </div>

              {/* Balance Sheet */}
              {generatedReportData.assets && (
                <div style={{ marginBottom: '2rem' }}>
                  <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '1rem', color: '#111827' }}>Assets</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <div>Current Assets</div>
                    <div style={{ textAlign: 'right', fontWeight: '500' }}>
                      ${(generatedReportData.assets.currentAssets || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <div>Fixed Assets</div>
                    <div style={{ textAlign: 'right', fontWeight: '500' }}>
                      ${(generatedReportData.assets.fixedAssets || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <div style={{ borderTop: '2px solid #111827', paddingTop: '0.5rem', fontWeight: '600' }}>Total Assets</div>
                    <div style={{ textAlign: 'right', fontWeight: '600', borderTop: '2px solid #111827', paddingTop: '0.5rem' }}>
                      ${(generatedReportData.assets.totalAssets || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                  </div>
                </div>
              )}

              {/* Liabilities and Equity */}
              {generatedReportData.liabilitiesAndEquity && (
                <div style={{ marginBottom: '2rem' }}>
                  <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '1rem', color: '#111827' }}>Liabilities and Equity</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <div>Current Liabilities</div>
                    <div style={{ textAlign: 'right', fontWeight: '500' }}>
                      ${(generatedReportData.liabilitiesAndEquity.currentLiabilities || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <div>Long Term Liabilities</div>
                    <div style={{ textAlign: 'right', fontWeight: '500' }}>
                      ${(generatedReportData.liabilitiesAndEquity.longTermLiabilities || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <div>Total Liabilities</div>
                    <div style={{ textAlign: 'right', fontWeight: '500' }}>
                      ${(generatedReportData.liabilitiesAndEquity.totalLiabilities || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <div>Equity</div>
                    <div style={{ textAlign: 'right', fontWeight: '500' }}>
                      ${(generatedReportData.liabilitiesAndEquity.equity || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <div style={{ borderTop: '2px solid #111827', paddingTop: '0.5rem', fontWeight: '600' }}>Total Liabilities and Equity</div>
                    <div style={{ textAlign: 'right', fontWeight: '600', borderTop: '2px solid #111827', paddingTop: '0.5rem' }}>
                      ${(generatedReportData.liabilitiesAndEquity.totalLiabilitiesAndEquity || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                  </div>
                </div>
              )}

              {/* Profit & Loss — multi-step (GL) or legacy flat */}
              {generatedReportData.reportBasis === 'accrual-gl' && Array.isArray(generatedReportData.sections) ? (
                <div style={{ marginBottom: '2rem' }}>
                  <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '0.5rem', color: '#111827' }}>
                    Profit &amp; Loss (accrual)
                  </h3>
                  <p style={{ fontSize: '0.8125rem', color: '#6b7280', marginBottom: '1rem' }}>
                    Based on posted journal entries for the period. COA <strong>MainGroup</strong> drives section placement.
                    {typeof generatedReportData.journalEntryCount === 'number' && (
                      <span> Journal headers in period: <strong>{generatedReportData.journalEntryCount}</strong>.</span>
                    )}
                    {!generatedReportData.hasJournalActivity && (
                      <span> No journal line activity in this range — amounts are zero.</span>
                    )}
                  </p>
                  {generatedReportData.summaryNote && (
                    <p style={{ fontSize: '0.8125rem', color: '#92400e', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: '6px', padding: '0.75rem', marginBottom: '1rem' }}>
                      {generatedReportData.summaryNote}
                    </p>
                  )}
                  {generatedReportData.sections.map((sec: any) => {
                    const hasLines = Array.isArray(sec.lines) && sec.lines.length > 0;
                    const hasAmt = Math.abs(Number(sec.subtotal) || 0) > 0.0001;
                    if (!hasLines && !hasAmt) return null;
                    return (
                      <div key={sec.sectionId || sec.title} style={{ marginBottom: '1.25rem' }}>
                        <h4 style={{ fontSize: '0.9375rem', fontWeight: '600', color: '#374151', marginBottom: '0.5rem' }}>{sec.title}</h4>
                        {hasLines && (
                          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '0.5rem', fontSize: '0.875rem' }}>
                            <thead>
                              <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                                <th style={{ textAlign: 'left', padding: '0.35rem 0.5rem', fontWeight: '600', color: '#6b7280' }}>Code</th>
                                <th style={{ textAlign: 'left', padding: '0.35rem 0.5rem', fontWeight: '600', color: '#6b7280' }}>Account</th>
                                <th style={{ textAlign: 'right', padding: '0.35rem 0.5rem', fontWeight: '600', color: '#6b7280' }}>Amount</th>
                              </tr>
                            </thead>
                            <tbody>
                              {sec.lines.map((ln: any, i: number) => (
                                <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                  <td style={{ padding: '0.35rem 0.5rem', fontFamily: 'monospace' }}>{ln.accountCode || ''}</td>
                                  <td style={{ padding: '0.35rem 0.5rem' }}>{ln.accountName || ''}</td>
                                  <td style={{ textAlign: 'right', padding: '0.35rem 0.5rem' }}>
                                    ${(Number(ln.amount) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '0.25rem', paddingTop: '0.25rem', borderTop: '1px solid #e5e7eb' }}>
                          <span style={{ fontWeight: '600', color: '#111827' }}>Subtotal — {sec.title}</span>
                          <span style={{ textAlign: 'right', fontWeight: '600' }}>
                            ${(Number(sec.subtotal) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '0.5rem', marginTop: '1rem', paddingTop: '1rem', borderTop: '2px solid #111827', fontSize: '0.9375rem' }}>
                    <div style={{ fontWeight: '600' }}>Gross profit</div>
                    <div style={{ textAlign: 'right', fontWeight: '600' }}>
                      ${(Number(generatedReportData.grossProfit) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <div style={{ fontWeight: '600' }}>Operating income</div>
                    <div style={{ textAlign: 'right', fontWeight: '600' }}>
                      ${(Number(generatedReportData.operatingIncome) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <div style={{ fontWeight: '600' }}>Income before tax</div>
                    <div style={{ textAlign: 'right', fontWeight: '600' }}>
                      ${(Number(generatedReportData.incomeBeforeTax) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <div style={{ fontWeight: '700', paddingTop: '0.35rem' }}>Net income</div>
                    <div style={{ textAlign: 'right', fontWeight: '700', paddingTop: '0.35rem' }}>
                      ${(Number(generatedReportData.netIncome) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                  </div>
                </div>
              ) : generatedReportData.revenue !== undefined ? (
                <div style={{ marginBottom: '2rem' }}>
                  <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '1rem', color: '#111827' }}>Income Statement</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <div>Revenue</div>
                    <div style={{ textAlign: 'right', fontWeight: '500' }}>
                      ${(generatedReportData.revenue || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <div>Cost of Goods Sold</div>
                    <div style={{ textAlign: 'right', fontWeight: '500' }}>
                      ${(generatedReportData.costOfGoodsSold || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <div style={{ borderTop: '1px solid #d1d5db', paddingTop: '0.5rem', fontWeight: '600' }}>Gross Profit</div>
                    <div style={{ textAlign: 'right', fontWeight: '600', borderTop: '1px solid #d1d5db', paddingTop: '0.5rem' }}>
                      ${(generatedReportData.grossProfit || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <div>Operating Expenses</div>
                    <div style={{ textAlign: 'right', fontWeight: '500' }}>
                      ${(generatedReportData.operatingExpenses || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <div style={{ borderTop: '1px solid #d1d5db', paddingTop: '0.5rem', fontWeight: '600' }}>Operating Income</div>
                    <div style={{ textAlign: 'right', fontWeight: '600', borderTop: '1px solid #d1d5db', paddingTop: '0.5rem' }}>
                      ${(generatedReportData.operatingIncome || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <div style={{ borderTop: '2px solid #111827', paddingTop: '0.5rem', fontWeight: '600' }}>Net Income</div>
                    <div style={{ textAlign: 'right', fontWeight: '600', borderTop: '2px solid #111827', paddingTop: '0.5rem' }}>
                      ${(generatedReportData.netIncome || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                  </div>
                </div>
              ) : null}

              {/* Cash Flow Statement */}
              {generatedReportData.operatingActivities !== undefined && (
                <div style={{ marginBottom: '2rem' }}>
                  <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '1rem', color: '#111827' }}>Cash Flow Statement</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <div>Operating Activities</div>
                    <div style={{ textAlign: 'right', fontWeight: '500' }}>
                      ${(generatedReportData.operatingActivities || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <div>Investing Activities</div>
                    <div style={{ textAlign: 'right', fontWeight: '500' }}>
                      ${(generatedReportData.investingActivities || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <div>Financing Activities</div>
                    <div style={{ textAlign: 'right', fontWeight: '500' }}>
                      ${(generatedReportData.financingActivities || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <div style={{ borderTop: '2px solid #111827', paddingTop: '0.5rem', fontWeight: '600' }}>Net Cash Flow</div>
                    <div style={{ textAlign: 'right', fontWeight: '600', borderTop: '2px solid #111827', paddingTop: '0.5rem' }}>
                      ${(generatedReportData.netCashFlow || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                  </div>
                </div>
              )}

              {/* Aging Report */}
              {generatedReportData.agingBuckets && (
                <div style={{ marginBottom: '2rem' }}>
                  <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '1rem', color: '#111827' }}>Aging Report</h3>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                        <th style={{ textAlign: 'left', padding: '0.75rem', fontWeight: '600' }}>Bucket</th>
                        <th style={{ textAlign: 'right', padding: '0.75rem', fontWeight: '600' }}>Amount</th>
                        <th style={{ textAlign: 'right', padding: '0.75rem', fontWeight: '600' }}>Percentage</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Array.isArray(generatedReportData.agingBuckets) && generatedReportData.agingBuckets.map((bucket: any, index: number) => (
                        <tr key={index} style={{ borderBottom: '1px solid #e5e7eb' }}>
                          <td style={{ padding: '0.75rem' }}>{bucket.bucket || ''}</td>
                          <td style={{ textAlign: 'right', padding: '0.75rem' }}>
                            ${(bucket.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td style={{ textAlign: 'right', padding: '0.75rem' }}>{(bucket.percentage || 0).toFixed(1)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Trial Balance */}
              {generatedReportData.accounts && (
                <div style={{ marginBottom: '2rem' }}>
                  <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '1rem', color: '#111827' }}>Trial Balance</h3>
                  <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '1rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                        <th style={{ textAlign: 'left', padding: '0.75rem', fontWeight: '600' }}>Account Code</th>
                        <th style={{ textAlign: 'left', padding: '0.75rem', fontWeight: '600' }}>Account Name</th>
                        <th style={{ textAlign: 'left', padding: '0.75rem', fontWeight: '600' }}>Type</th>
                        <th style={{ textAlign: 'right', padding: '0.75rem', fontWeight: '600' }}>Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Array.isArray(generatedReportData.accounts) && generatedReportData.accounts.map((account: any, index: number) => (
                        <tr key={index} style={{ borderBottom: '1px solid #e5e7eb' }}>
                          <td style={{ padding: '0.75rem' }}>{account.accountCode || ''}</td>
                          <td style={{ padding: '0.75rem' }}>{account.accountName || ''}</td>
                          <td style={{ padding: '0.75rem' }}>{account.accountType || ''}</td>
                          <td style={{ textAlign: 'right', padding: '0.75rem' }}>
                            ${(account.balance || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '0.5rem', marginTop: '1rem', paddingTop: '1rem', borderTop: '2px solid #111827' }}>
                    <div>Total Debits</div>
                    <div style={{ textAlign: 'right', fontWeight: '600' }}>
                      ${(generatedReportData.totalDebits || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <div>Total Credits</div>
                    <div style={{ textAlign: 'right', fontWeight: '600' }}>
                      ${(generatedReportData.totalCredits || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <div>Is Balanced</div>
                    <div style={{ textAlign: 'right', fontWeight: '600', color: generatedReportData.isBalanced ? '#10b981' : '#ef4444' }}>
                      {generatedReportData.isBalanced ? 'Yes' : 'No'}
                    </div>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid #e5e7eb' }}>
                <button
                  onClick={() => {
                    handleDownloadReport(generatedReportData, reportToView, reportFormat);
                  }}
                  style={{
                    flex: 1,
                    padding: '0.75rem 1.5rem',
                    backgroundColor: '#3b82f6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.375rem',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    fontWeight: '500',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem'
                  }}
                >
                  <FontAwesomeIcon icon={faDownload} />
                  Download Report
                </button>
                <button
                  onClick={() => setShowReportModal(false)}
                  style={{
                    padding: '0.75rem 1.5rem',
                    backgroundColor: '#f3f4f6',
                    color: '#374151',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.375rem',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    fontWeight: '500'
                  }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FinancialReports;
