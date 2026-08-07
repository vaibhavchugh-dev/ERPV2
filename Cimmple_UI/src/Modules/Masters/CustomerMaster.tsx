import React, { useState, useEffect } from "react";
import { useLocation, useHistory } from "react-router-dom";
import { toast } from "react-toastify";
import { CustomerService, CustomerMaster } from "../../Common/Services/CustomerService";
import ColumnChooser from "../../Common/Components/ColumnChooser";
import { ColumnDefinition, useColumnChooser } from "../../Common/Hooks/useColumnChooser";
import CustomerMasterSlideout from "./CustomerMasterSlideout";
import CustomerMasterImportModal from "./CustomerMasterImportModal";
import "./CustomerMaster.scss";

const COLUMNS: ColumnDefinition[] = [
  { key: "customercode", label: "Customer Code", sortKey: "customercode", locked: true },
  { key: "company_name", label: "Customer Name", sortKey: "company_name", locked: true },
  { key: "fullAddress", label: "Address", sortKey: "fullAddress" },
  { key: "contactPerson", label: "Contact Person" },
  { key: "phone_number", label: "Contact Phone" },
  { key: "status", label: "Status", sortKey: "status" },
];
const DEFAULT_HIDDEN_COLUMNS: string[] = [];
const COLUMN_PREFERENCE_KEY = "customerMaster.hiddenColumns";

const CustomerMasterComponent: React.FC = () => {
  const location = useLocation();
  const history = useHistory();
  const [customers, setCustomers] = useState<CustomerMaster[]>([]);
  const [showSlideout, setShowSlideout] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterValue, setFilterValue] = useState("all");
  const [sortColumn, setSortColumn] = useState<keyof CustomerMaster | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  const {
    hiddenColumns,
    visibleColumns,
    showColumnChooser,
    setShowColumnChooser,
    columnChooserRef,
    toggleColumn,
  } = useColumnChooser(COLUMN_PREFERENCE_KEY, COLUMNS, DEFAULT_HIDDEN_COLUMNS);

  useEffect(() => {
    loadCustomers();
  }, []);

  // Handle URL parameter to open slideout (from global search)
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const openId = params.get('open');
    if (openId) {
      const id = parseInt(openId, 10);
      if (!isNaN(id) && id > 0) {
        setSelectedCustomerId(id);
        setShowSlideout(true);
        // Clean up URL
        history.replace(location.pathname);
      }
    }
  }, [location.search, history, location.pathname]);

  // Listen for custom event from global search
  useEffect(() => {
    const handleOpenEntity = (event: CustomEvent) => {
      if (event.detail.type === 'customer') {
        setSelectedCustomerId(event.detail.id);
        setShowSlideout(true);
      }
    };

    window.addEventListener('openEntity', handleOpenEntity as EventListener);
    return () => {
      window.removeEventListener('openEntity', handleOpenEntity as EventListener);
    };
  }, []);

  const loadCustomers = async () => {
    setLoading(true);
    try {
      const storage = JSON.parse(localStorage.getItem("storage") || "{}");
      let tenantID = storage?.tenantID || 0;
      // For development: if tenantID is not set, use a default value (matching the service)
      if (tenantID === 0 && process.env.NODE_ENV === 'development') {
        tenantID = 1; // Default tenant ID for development
        console.log('[CustomerMaster] Using default tenantID:', tenantID);
      }

      console.log('[CustomerMaster] Loading customers with tenantID:', tenantID);
      const result = await CustomerService.GetCustomerlist({ tenantid: tenantID });
      console.log('[CustomerMaster] API response:', result);
      
      if (result && Array.isArray(result)) {
        // API already returns contactPerson and phone_number for each customer.
        // Use the values from the API directly instead of recomputing from CustomerContact
        // (which is not included in the list response).
        setCustomers(result);
        console.log('[CustomerMaster] Loaded', result.length, 'customers');
      } else {
        console.warn('[CustomerMaster] Invalid response from API:', result);
        setCustomers([]);
      }
    } catch (error: any) {
      console.error('[CustomerMaster] Error loading customers:', error);
      toast.error(`Error loading customers: ${error.message || 'Unknown error'}`);
      setCustomers([]);
    } finally {
      setLoading(false);
    }
  };

  const handleRowClick = (customer: CustomerMaster) => {
    setSelectedCustomerId(customer.customer_id);
    setShowSlideout(true);
  };

  const handleAddCustomer = () => {
    setSelectedCustomerId(0);
    setShowSlideout(true);
  };

  const handleCloseSlideout = () => {
    setShowSlideout(false);
    loadCustomers();
  };

  const handleSort = (column: keyof CustomerMaster) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  const filteredCustomers = customers.filter((customer) => {
    const matchesSearch =
      customer.customercode?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.company_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.fullAddress?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.phone_number?.toLowerCase().includes(searchTerm.toLowerCase());

    if (filterValue === "all") {
      return matchesSearch;
    }

    if (filterValue === "active") {
      return matchesSearch && customer.status === "Active";
    }

    if (filterValue === "inactive") {
      return matchesSearch && customer.status === "Inactive";
    }

    return matchesSearch;
  });

  const sortedCustomers = [...filteredCustomers].sort((a, b) => {
    if (!sortColumn) return 0;

    let aValue: any = a[sortColumn];
    let bValue: any = b[sortColumn];

    if (aValue == null && bValue == null) return 0;
    if (aValue == null) return 1;
    if (bValue == null) return -1;

    if (typeof aValue === "string" && typeof bValue === "string") {
      aValue = aValue.toLowerCase();
      bValue = bValue.toLowerCase();
    }

    if (aValue < bValue) return sortDirection === "asc" ? -1 : 1;
    if (aValue > bValue) return sortDirection === "asc" ? 1 : -1;
    return 0;
  });

  const getSortIcon = (column: keyof CustomerMaster) => {
    if (sortColumn !== column) {
      return <span className="sort-icon inactive">⇅</span>;
    }
    return sortDirection === "asc" ? (
      <span className="sort-icon active">↑</span>
    ) : (
      <span className="sort-icon active">↓</span>
    );
  };

  const renderCell = (customer: CustomerMaster, key: string): React.ReactNode => {
    switch (key) {
      case "customercode":
        return customer.customercode || "";
      case "company_name":
        return (
          <div className="customer-name">
            <strong>{customer.company_name}</strong>
          </div>
        );
      case "fullAddress":
        return customer.fullAddress || "";
      case "contactPerson":
        return customer.contactPerson || "";
      case "phone_number":
        return customer.phone_number || "";
      case "status":
        return (
          <span
            className={`badge ${
              customer.status === "Active" ? "badge-success" : "badge-danger"
            }`}
          >
            {customer.status || ""}
          </span>
        );
      default:
        return "";
    }
  };

  if (loading) {
    return (
      <div className="page-loading">
        <div className="loading-spinner"></div>
        <p>Loading customers...</p>
      </div>
    );
  }

  return (
    <div className="customers-page">
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Customer Master</h1>
          <p className="page-subtitle">Manage your customer database</p>
        </div>
        <div className="page-actions">
          <button
            className="btn-secondary"
            onClick={() => setShowImport(true)}
            type="button"
          >
            <span>Import</span>
          </button>
          <ColumnChooser
            columns={COLUMNS}
            hiddenColumns={hiddenColumns}
            showMenu={showColumnChooser}
            onToggleMenu={() => setShowColumnChooser(!showColumnChooser)}
            onToggleColumn={toggleColumn}
            containerRef={columnChooserRef}
          />
          <button className="btn-primary" onClick={handleAddCustomer}>
            <span>+</span>
            <span>Add Customer</span>
          </button>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="page-filters">
        <div className="search-wrapper">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8"></circle>
            <path d="m21 21-4.35-4.35"></path>
          </svg>
          <input
            type="text"
            placeholder="Search customers..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
        </div>
        <div className="filter-group">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
          </svg>
          <select
            value={filterValue}
            onChange={(e) => setFilterValue(e.target.value)}
            className="filter-select"
          >
            <option value="all">All Customers</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>

      {/* Customers Table */}
      <div className="table-card">
        <div className="table-wrapper">
          <table className="customers-table">
            <thead>
              <tr>
                {visibleColumns.map((column) => (
                  <th
                    key={column.key}
                    className={column.sortKey ? "sortable" : ""}
                    onClick={() =>
                      column.sortKey &&
                      handleSort(column.sortKey as keyof CustomerMaster)
                    }
                  >
                    <div className="th-content">
                      {column.label}
                      {column.sortKey &&
                        getSortIcon(column.sortKey as keyof CustomerMaster)}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedCustomers.length === 0 ? (
                <tr>
                  <td colSpan={visibleColumns.length} className="empty-state">
                    <p>No customers found</p>
                    <small>Click "Add Customer" or "Import" to get started</small>
                  </td>
                </tr>
              ) : (
                sortedCustomers.map((customer) => (
                  <tr key={customer.customer_id} onClick={() => handleRowClick(customer)}>
                    {visibleColumns.map((column) => (
                      <td key={column.key}>{renderCell(customer, column.key)}</td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showSlideout && (
        <CustomerMasterSlideout
          customerId={selectedCustomerId}
          onClose={handleCloseSlideout}
        />
      )}

      {showImport && (
        <CustomerMasterImportModal
          onClose={() => setShowImport(false)}
          onImported={loadCustomers}
        />
      )}
    </div>
  );
};

export default CustomerMasterComponent;
