import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faBuilding,
  faShoppingCart,
  faFileInvoiceDollar,
  faBriefcase,
  faFileInvoice,
  faTruck,
  faSpinner,
  faSearch,
  faUniversity,
  faDesktop,
  faMapMarkerAlt,
  faCog,
  faCreditCard,
  faChartLine,
  faBox,
  faShieldAlt,
  faUser,
  faClipboardList,
  faShoppingBag,
  faFile
} from '@fortawesome/free-solid-svg-icons';
import { SearchResult, GlobalSearchResults, GlobalSearchService } from '../Services/GlobalSearchService';
import './SearchResultsDropdown.scss';

interface SearchResultsDropdownProps {
  results: GlobalSearchResults;
  loading: boolean;
  query: string;
  onResultClick: (result: SearchResult) => void;
  onClose: () => void;
}

const SearchResultsDropdown: React.FC<SearchResultsDropdownProps> = ({
  results,
  loading,
  query,
  onResultClick,
  onClose
}) => {
  const totalResults = 
    results.customers.length +
    results.vendors.length +
    results.orders.length +
    results.invoices.length +
    results.jobOrders.length +
    results.quotations.length +
    results.banks.length +
    results.workstations.length +
    results.locations.length +
    results.processes.length +
    (results.jobTemplates?.length || 0) +
    results.priceBreakdowns.length +
    results.creditCards.length +
    results.chartOfAccounts.length +
    results.vendorOrders.length +
    results.vendorInvoices.length +
    results.vendorReceiving.length +
    results.vendorQuotations.length +
    results.shipments.length +
    results.ncrReports.length +
    results.users.length +
    results.documents.length;

  if (loading) {
    return (
      <div className="search-results-dropdown">
        <div className="search-results-loading">
          <FontAwesomeIcon icon={faSpinner} spin />
          <span>Searching...</span>
        </div>
      </div>
    );
  }

  if (!query || query.trim() === '') {
    return (
      <div className="search-results-dropdown">
        <div className="search-results-empty">
          <FontAwesomeIcon icon={faSearch} />
          <p>Start typing to search...</p>
        </div>
      </div>
    );
  }

  if (totalResults === 0) {
    return (
      <div className="search-results-dropdown">
        <div className="search-results-empty">
          <FontAwesomeIcon icon={faSearch} />
          <p>No results found for "{query}"</p>
        </div>
      </div>
    );
  }

  const renderResultItem = (result: SearchResult, icon: any) => {
    const displayName = getResultDisplayName(result);
    const subtitle = getResultSubtitle(result);

    return (
      <div
        key={`${result.type}-${result.id}`}
        className="search-result-item"
        onClick={() => onResultClick(result)}
      >
        <div className="result-content">
          <div className="result-title">{displayName}</div>
          {subtitle && <div className="result-subtitle">{subtitle}</div>}
        </div>
        <div className="result-meta">
          {result.status && (
            <span className={`result-status status-${String(result.status).toLowerCase().replace(' ', '-')}`}>
              {result.status}
            </span>
          )}
        </div>
      </div>
    );
  };

  const getResultDisplayName = (result: SearchResult): string => {
    return GlobalSearchService.getResultDisplayName(result);
  };

  const getResultSubtitle = (result: SearchResult): string => {
    switch (result.type) {
      case 'customer':
      case 'vendor':
        const parts: string[] = [];
        if (result.code) parts.push(result.code);
        if (result.email) parts.push(result.email);
        return parts.join(' • ');
      case 'order':
        return `${result.customerName || ''}${result.totalAmount ? ` • $${result.totalAmount.toFixed(2)}` : ''}`;
      case 'invoice':
        return `${result.customerName || ''}${result.totalAmount ? ` • $${result.totalAmount.toFixed(2)}` : ''}`;
      case 'jobOrder':
        return `${result.customerName || ''}${result.partNo ? ` • ${result.partNo}` : ''}`;
      case 'quotation':
        return `${result.customerName || ''}${result.totalAmount ? ` • $${result.totalAmount.toFixed(2)}` : ''}`;
      case 'bank':
        return `${result.code || ''}${result.accountNo ? ` • ${result.accountNo}` : ''}`;
      case 'workstation':
        return result.isActive ? 'Active' : 'Inactive';
      case 'location':
        return `${result.city || ''}${result.state ? `, ${result.state}` : ''}`;
      case 'process':
        return result.description || '';
      case 'priceBreakdown':
        // Status is returned as number from backend (1 = Active, 0 = Inactive)
        // JSON serialization converts it to string, so check both
        if (!result.status) return 'Inactive';
        const statusStr = String(result.status);
        return statusStr === '1' ? 'Active' : 'Inactive';
      case 'creditCard':
        return `${result.cardType || ''}${result.lastFourDigits ? ` • ****${result.lastFourDigits}` : ''}`;
      case 'chartOfAccount':
        return `${result.code || ''}${result.accountType ? ` • ${result.accountType}` : ''}`;
      case 'vendorOrder':
        return `${result.vendorName || ''}${result.totalAmount ? ` • $${result.totalAmount.toFixed(2)}` : ''}`;
      case 'vendorInvoice':
        return `${result.vendorName || ''}${result.totalAmount ? ` • $${result.totalAmount.toFixed(2)}` : ''}`;
      case 'vendorReceiving':
        return `${result.vendorName || ''}${result.receivedQty ? ` • Qty: ${result.receivedQty}` : ''}`;
      case 'vendorQuotation':
        return `${result.vendorName || ''}${result.totalAmount ? ` • $${result.totalAmount.toFixed(2)}` : ''}`;
      case 'shipment':
        return `${result.customerName || ''}${result.trackingNo ? ` • ${result.trackingNo}` : ''}`;
      case 'ncrReport':
        return `${result.partNo || ''}${result.customerName ? ` • ${result.customerName}` : ''}`;
      case 'user':
        return `${result.email || ''}${result.userName ? ` • ${result.userName}` : ''}`;
      case 'document':
        const docParts: string[] = [];
        if (result.categoryName) docParts.push(result.categoryName);
        if (result.requiresVersionControl && result.currentVersionNumber) {
          docParts.push(`v${result.currentVersionNumber}`);
        }
        return docParts.join(' • ');
      default:
        return '';
    }
  };

  return (
    <div className="search-results-dropdown">
      {results.customers.length > 0 && (
        <div className="search-results-section" key="customers-section">
          <div className="results-section-header">
            <div className="section-header-icon" key="customers-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '1rem', height: '1rem' }}>
              <FontAwesomeIcon icon={faBuilding} />
            </div>
            <span>Customers ({results.customers.length})</span>
          </div>
          {results.customers.map(result => renderResultItem(result, faBuilding))}
        </div>
      )}

      {results.vendors.length > 0 && (
        <div className="search-results-section" key="vendors-section">
          <div className="results-section-header">
            <div className="section-header-icon" key="vendors-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '1rem', height: '1rem' }}>
              <FontAwesomeIcon icon={faTruck} />
            </div>
            <span>Vendors ({results.vendors.length})</span>
          </div>
          {results.vendors.map(result => renderResultItem(result, faTruck))}
        </div>
      )}

      {results.orders.length > 0 && (
        <div className="search-results-section" key="orders-section">
          <div className="results-section-header">
            <div className="section-header-icon" key="orders-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '1rem', height: '1rem' }}>
              <FontAwesomeIcon icon={faShoppingCart} />
            </div>
            <span>Orders ({results.orders.length})</span>
          </div>
          {results.orders.map(result => renderResultItem(result, faShoppingCart))}
        </div>
      )}

      {results.quotations.length > 0 && (
        <div className="search-results-section" key="quotations-section">
          <div className="results-section-header">
            <div className="section-header-icon" key="quotations-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '1rem', height: '1rem' }}>
              <FontAwesomeIcon icon={faFileInvoice} />
            </div>
            <span>Quotations ({results.quotations.length})</span>
          </div>
          {results.quotations.map(result => renderResultItem(result, faFileInvoice))}
        </div>
      )}

      {results.invoices.length > 0 && (
        <div className="search-results-section" key="invoices-section">
          <div className="results-section-header">
            <div className="section-header-icon" key="invoices-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '1rem', height: '1rem' }}>
              <FontAwesomeIcon icon={faFileInvoiceDollar} />
            </div>
            <span>Invoices ({results.invoices.length})</span>
          </div>
          {results.invoices.map(result => renderResultItem(result, faFileInvoiceDollar))}
        </div>
      )}

      {results.jobOrders.length > 0 && (
        <div className="search-results-section" key="joborders-section">
          <div className="results-section-header">
            <div className="section-header-icon" key="joborders-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '1rem', height: '1rem' }}>
              <FontAwesomeIcon icon={faBriefcase} />
            </div>
            <span>Job Orders ({results.jobOrders.length})</span>
          </div>
          {results.jobOrders.map(result => renderResultItem(result, faBriefcase))}
        </div>
      )}

      {results.banks.length > 0 && (
        <div className="search-results-section" key="banks-section">
          <div className="results-section-header">
            <div className="section-header-icon" key="banks-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '1rem', height: '1rem' }}>
              <FontAwesomeIcon icon={faUniversity} />
            </div>
            <span>Banks ({results.banks.length})</span>
          </div>
          {results.banks.map(result => renderResultItem(result, faUniversity))}
        </div>
      )}

      {results.workstations.length > 0 && (
        <div className="search-results-section" key="workstations-section">
          <div className="results-section-header">
            <div className="section-header-icon" key="workstations-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '1rem', height: '1rem' }}>
              <FontAwesomeIcon icon={faDesktop} />
            </div>
            <span>Workstations ({results.workstations.length})</span>
          </div>
          {results.workstations.map(result => renderResultItem(result, faDesktop))}
        </div>
      )}

      {results.locations.length > 0 && (
        <div className="search-results-section" key="locations-section">
          <div className="results-section-header">
            <div className="section-header-icon" key="locations-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '1rem', height: '1rem' }}>
              <FontAwesomeIcon icon={faMapMarkerAlt} />
            </div>
            <span>Locations ({results.locations.length})</span>
          </div>
          {results.locations.map(result => renderResultItem(result, faMapMarkerAlt))}
        </div>
      )}

      {results.processes.length > 0 && (
        <div className="search-results-section" key="processes-section">
          <div className="results-section-header">
            <div className="section-header-icon" key="processes-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '1rem', height: '1rem' }}>
              <FontAwesomeIcon icon={faCog} />
            </div>
            <span>Processes ({results.processes.length})</span>
          </div>
          {results.processes.map(result => renderResultItem(result, faCog))}
        </div>
      )}

      {(results.jobTemplates?.length || 0) > 0 && (
        <div className="search-results-section" key="jobtemplates-section">
          <div className="results-section-header">
            <div className="section-header-icon" key="jobtemplates-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '1rem', height: '1rem' }}>
              <FontAwesomeIcon icon={faClipboardList} />
            </div>
            <span>Job Templates ({results.jobTemplates.length})</span>
          </div>
          {results.jobTemplates.map(result => renderResultItem(result, faClipboardList))}
        </div>
      )}

      {results.priceBreakdowns.length > 0 && (
        <div className="search-results-section" key="pricebreakdowns-section">
          <div className="results-section-header">
            <div className="section-header-icon" key="pricebreakdowns-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '1rem', height: '1rem' }}>
              <FontAwesomeIcon icon={faChartLine} />
            </div>
            <span>Price Breakdowns ({results.priceBreakdowns.length})</span>
          </div>
          {results.priceBreakdowns.map(result => renderResultItem(result, faChartLine))}
        </div>
      )}

      {results.creditCards.length > 0 && (
        <div className="search-results-section" key="creditcards-section">
          <div className="results-section-header">
            <div className="section-header-icon" key="creditcards-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '1rem', height: '1rem' }}>
              <FontAwesomeIcon icon={faCreditCard} />
            </div>
            <span>Credit Cards ({results.creditCards.length})</span>
          </div>
          {results.creditCards.map(result => renderResultItem(result, faCreditCard))}
        </div>
      )}

      {results.chartOfAccounts.length > 0 && (
        <div className="search-results-section" key="chartofaccounts-section">
          <div className="results-section-header">
            <div className="section-header-icon" key="chartofaccounts-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '1rem', height: '1rem' }}>
              <FontAwesomeIcon icon={faChartLine} />
            </div>
            <span>Chart of Accounts ({results.chartOfAccounts.length})</span>
          </div>
          {results.chartOfAccounts.map(result => renderResultItem(result, faChartLine))}
        </div>
      )}

      {results.vendorOrders.length > 0 && (
        <div className="search-results-section" key="vendororders-section">
          <div className="results-section-header">
            <div className="section-header-icon" key="vendororders-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '1rem', height: '1rem' }}>
              <FontAwesomeIcon icon={faShoppingBag} />
            </div>
            <span>Vendor Orders ({results.vendorOrders.length})</span>
          </div>
          {results.vendorOrders.map(result => renderResultItem(result, faShoppingBag))}
        </div>
      )}

      {results.vendorInvoices.length > 0 && (
        <div className="search-results-section" key="vendorinvoices-section">
          <div className="results-section-header">
            <div className="section-header-icon" key="vendorinvoices-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '1rem', height: '1rem' }}>
              <FontAwesomeIcon icon={faFileInvoiceDollar} />
            </div>
            <span>Vendor Invoices ({results.vendorInvoices.length})</span>
          </div>
          {results.vendorInvoices.map(result => renderResultItem(result, faFileInvoiceDollar))}
        </div>
      )}

      {results.vendorReceiving.length > 0 && (
        <div className="search-results-section" key="vendorreceiving-section">
          <div className="results-section-header">
            <div className="section-header-icon" key="vendorreceiving-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '1rem', height: '1rem' }}>
              <FontAwesomeIcon icon={faClipboardList} />
            </div>
            <span>Vendor Receiving ({results.vendorReceiving.length})</span>
          </div>
          {results.vendorReceiving.map(result => renderResultItem(result, faClipboardList))}
        </div>
      )}

      {results.vendorQuotations.length > 0 && (
        <div className="search-results-section" key="vendorquotations-section">
          <div className="results-section-header">
            <div className="section-header-icon" key="vendorquotations-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '1rem', height: '1rem' }}>
              <FontAwesomeIcon icon={faFileInvoice} />
            </div>
            <span>Vendor Quotations ({results.vendorQuotations.length})</span>
          </div>
          {results.vendorQuotations.map(result => renderResultItem(result, faFileInvoice))}
        </div>
      )}

      {results.shipments.length > 0 && (
        <div className="search-results-section" key="shipments-section">
          <div className="results-section-header">
            <div className="section-header-icon" key="shipments-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '1rem', height: '1rem' }}>
              <FontAwesomeIcon icon={faBox} />
            </div>
            <span>Shipments ({results.shipments.length})</span>
          </div>
          {results.shipments.map(result => renderResultItem(result, faBox))}
        </div>
      )}

      {results.ncrReports.length > 0 && (
        <div className="search-results-section" key="ncrreports-section">
          <div className="results-section-header">
            <div className="section-header-icon" key="ncrreports-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '1rem', height: '1rem' }}>
              <FontAwesomeIcon icon={faShieldAlt} />
            </div>
            <span>NCR Reports ({results.ncrReports.length})</span>
          </div>
          {results.ncrReports.map(result => renderResultItem(result, faShieldAlt))}
        </div>
      )}

      {results.users.length > 0 && (
        <div className="search-results-section" key="users-section">
          <div className="results-section-header">
            <div className="section-header-icon" key="users-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '1rem', height: '1rem' }}>
              <FontAwesomeIcon icon={faUser} />
            </div>
            <span>Users ({results.users.length})</span>
          </div>
          {results.users.map(result => renderResultItem(result, faUser))}
        </div>
      )}

      {results.documents.length > 0 && (
        <div className="search-results-section" key="documents-section">
          <div className="results-section-header">
            <div className="section-header-icon" key="documents-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '1rem', height: '1rem' }}>
              <FontAwesomeIcon icon={faFile} />
            </div>
            <span>Documents ({results.documents.length})</span>
          </div>
          {results.documents.map(result => renderResultItem(result, faFile))}
        </div>
      )}

      <div className="search-results-footer">
        <span>Press Enter to open first result</span>
      </div>
    </div>
  );
};

export default SearchResultsDropdown;

