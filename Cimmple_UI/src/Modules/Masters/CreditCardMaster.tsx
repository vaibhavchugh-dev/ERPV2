import React, { useState, useEffect } from "react";
import { useLocation, useHistory } from "react-router-dom";
import { toast } from "react-toastify";
import { CreditCardService, CreditCardMaster } from "../../Common/Services/CreditCardService";
import ColumnChooser from "../../Common/Components/ColumnChooser";
import { ColumnDefinition, useColumnChooser } from "../../Common/Hooks/useColumnChooser";
import CreditCardMasterSlideout from "./CreditCardMasterSlideout";
import "./CustomerMaster.scss";

const COLUMNS: ColumnDefinition[] = [
  { key: "cardNumber", label: "Card Number", sortKey: "cardNumber", locked: true },
  { key: "cardholderName", label: "Cardholder Name", sortKey: "cardholderName", locked: true },
  { key: "cardType", label: "Card Type", sortKey: "cardType" },
  { key: "expiry", label: "Expiry", sortKey: "expiryMonth" },
  { key: "nickName", label: "Nick Name", sortKey: "nickName" },
  { key: "status", label: "Status", sortKey: "status" },
];
const DEFAULT_HIDDEN_COLUMNS = ["nickName"];
const COLUMN_PREFERENCE_KEY = "creditCardMaster.hiddenColumns";

const CreditCardMasterComponent: React.FC = () => {
  const location = useLocation();
  const history = useHistory();
  const [creditCards, setCreditCards] = useState<CreditCardMaster[]>([]);
  const [showSlideout, setShowSlideout] = useState(false);
  const [selectedCreditCardId, setSelectedCreditCardId] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterValue, setFilterValue] = useState("all");
  const [sortColumn, setSortColumn] = useState<keyof CreditCardMaster | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  const {
    hiddenColumns,
    visibleColumns,
    showColumnChooser,
    setShowColumnChooser,
    columnChooserRef,
    toggleColumn,
  } = useColumnChooser(COLUMN_PREFERENCE_KEY, COLUMNS, DEFAULT_HIDDEN_COLUMNS);

  // Handle URL parameter to open slideout (from global search)
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const openId = params.get('open');
    if (openId) {
      const id = parseInt(openId, 10);
      if (!isNaN(id) && id > 0) {
        setSelectedCreditCardId(id);
        setShowSlideout(true);
        history.replace(location.pathname);
      }
    }
  }, [location.search, history, location.pathname]);

  useEffect(() => {
    loadCreditCards();
  }, []);

  const loadCreditCards = async () => {
    setLoading(true);
    try {
      const storage = JSON.parse(localStorage.getItem("storage") || "{}");
      let tenantID = storage?.tenantID || 0;
      if (tenantID === 0 && process.env.NODE_ENV === 'development') {
        tenantID = 1;
        console.log('[CreditCardMaster] Using default tenantID:', tenantID);
      }

      console.log('[CreditCardMaster] Loading credit cards with tenantID:', tenantID);
      const result = await CreditCardService.GetCreditCards({ tenantid: tenantID });
      console.log('[CreditCardMaster] API response:', result);
      
      if (result && Array.isArray(result)) {
        setCreditCards(result);
        console.log('[CreditCardMaster] Loaded', result.length, 'credit cards');
      } else {
        console.warn('[CreditCardMaster] Invalid response from API:', result);
        setCreditCards([]);
      }
    } catch (error: any) {
      console.error('[CreditCardMaster] Error loading credit cards:', error);
      toast.error(`Error loading credit cards: ${error.message || 'Unknown error'}`);
      setCreditCards([]);
    } finally {
      setLoading(false);
    }
  };

  const handleRowClick = (creditCard: CreditCardMaster) => {
    setSelectedCreditCardId(creditCard.id);
    setShowSlideout(true);
  };

  const handleAddCreditCard = () => {
    setSelectedCreditCardId(0);
    setShowSlideout(true);
  };

  const handleCloseSlideout = (refreshList = false) => {
    setShowSlideout(false);
    if (refreshList) {
      loadCreditCards();
    }
  };

  const handleSort = (column: keyof CreditCardMaster) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  const filteredCreditCards = creditCards.filter((creditCard) => {
    const matchesSearch =
      creditCard.cardNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      creditCard.cardholderName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      creditCard.cardType?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      creditCard.nickName?.toLowerCase().includes(searchTerm.toLowerCase());

    if (filterValue === "all") {
      return matchesSearch;
    }

    if (filterValue === "active") {
      return matchesSearch && creditCard.status === 1;
    }

    if (filterValue === "inactive") {
      return matchesSearch && creditCard.status === 0;
    }

    return matchesSearch;
  });

  const sortedCreditCards = [...filteredCreditCards].sort((a, b) => {
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

  const getSortIcon = (column: keyof CreditCardMaster) => {
    if (sortColumn !== column) {
      return <span className="sort-icon inactive">⇅</span>;
    }
    return sortDirection === "asc" ? (
      <span className="sort-icon active">↑</span>
    ) : (
      <span className="sort-icon active">↓</span>
    );
  };

  const renderCell = (creditCard: CreditCardMaster, key: string): React.ReactNode => {
    switch (key) {
      case "cardNumber":
        return creditCard.cardNumber || "";
      case "cardholderName":
        return creditCard.cardholderName || "";
      case "cardType":
        return creditCard.cardType || "";
      case "expiry":
        return creditCard.expiryMonth && creditCard.expiryYear
          ? `${creditCard.expiryMonth}/${creditCard.expiryYear}`
          : "";
      case "nickName":
        return creditCard.nickName || "";
      case "status":
        return (
          <span
            className={`badge ${
              creditCard.status === 1 ? "badge-success" : "badge-danger"
            }`}
          >
            {creditCard.statusText || (creditCard.status === 1 ? "Active" : "Inactive")}
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
        <p>Loading credit cards...</p>
      </div>
    );
  }

  return (
    <div className="customers-page">
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Credit Card Master</h1>
          <p className="page-subtitle">Manage your credit cards</p>
        </div>
        <div className="page-actions">
          <ColumnChooser
            columns={COLUMNS}
            hiddenColumns={hiddenColumns}
            showMenu={showColumnChooser}
            onToggleMenu={() => setShowColumnChooser(!showColumnChooser)}
            onToggleColumn={toggleColumn}
            containerRef={columnChooserRef}
          />
          <button className="btn-primary" onClick={handleAddCreditCard}>
            <span>+</span>
            <span>Add Credit Card</span>
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
            placeholder="Search credit cards..."
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
            <option value="all">All Cards</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>

      {/* Credit Cards Table */}
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
                      handleSort(column.sortKey as keyof CreditCardMaster)
                    }
                  >
                    <div className="th-content">
                      {column.label}
                      {column.sortKey &&
                        getSortIcon(column.sortKey as keyof CreditCardMaster)}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedCreditCards.length === 0 ? (
                <tr>
                  <td colSpan={visibleColumns.length} className="empty-state">
                    <p>No credit cards found</p>
                    <small>Click "Add Credit Card" to get started</small>
                  </td>
                </tr>
              ) : (
                sortedCreditCards.map((creditCard) => (
                  <tr key={creditCard.id} onClick={() => handleRowClick(creditCard)}>
                    {visibleColumns.map((column) => (
                      <td key={column.key}>{renderCell(creditCard, column.key)}</td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showSlideout && (
        <CreditCardMasterSlideout
          creditCardId={selectedCreditCardId}
          onClose={handleCloseSlideout}
        />
      )}
    </div>
  );
};

export default CreditCardMasterComponent;

