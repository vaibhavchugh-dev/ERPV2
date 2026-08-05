import React, { useState, useEffect } from "react";
import { useLocation, useHistory } from "react-router-dom";
import { toast } from "react-toastify";
import { ProductMasterService, ProductMaster } from "../../Common/Services/ProductMasterService";
import ColumnChooser from "../../Common/Components/ColumnChooser";
import { ColumnDefinition, useColumnChooser } from "../../Common/Hooks/useColumnChooser";
import ProductMasterSlideout from "./ProductMasterSlideout";
import "./CustomerMaster.scss";

const COLUMNS: ColumnDefinition[] = [
  { key: "partNo", label: "Part Number", sortKey: "partNo", locked: true },
  { key: "partName", label: "Part Name", sortKey: "partName", locked: true },
  { key: "unit", label: "Unit", sortKey: "unit" },
  { key: "totalQtyOrdered", label: "Total Qty Ordered", sortKey: "totalQtyOrdered" },
  { key: "avgUnitPrice", label: "Avg Unit Price", sortKey: "avgUnitPrice" },
  { key: "orderCount", label: "Orders", sortKey: "orderCount" },
  { key: "quotationCount", label: "Quotations", sortKey: "quotationCount" },
  { key: "lastOrderDate", label: "Last Ordered", sortKey: "lastOrderDate" },
];
const DEFAULT_HIDDEN_COLUMNS = ["quotationCount"];
const COLUMN_PREFERENCE_KEY = "productMaster.hiddenColumns";

const ProductMasterComponent: React.FC = () => {
  const location = useLocation();
  const history = useHistory();
  const [products, setProducts] = useState<ProductMaster[]>([]);
  const [showSlideout, setShowSlideout] = useState(false);
  const [selectedPartNo, setSelectedPartNo] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortColumn, setSortColumn] = useState<keyof ProductMaster | null>(null);
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
    loadProducts();
  }, []);

  // Handle URL parameter to open slideout (from global search)
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const openPartNo = params.get('open');
    if (openPartNo) {
      setSelectedPartNo(openPartNo);
      setShowSlideout(true);
      history.replace(location.pathname);
    }
  }, [location.search, history, location.pathname]);

  // Listen for custom event from global search
  useEffect(() => {
    const handleOpenEntity = (event: CustomEvent) => {
      if (event.detail.type === 'product') {
        setSelectedPartNo(event.detail.id);
        setShowSlideout(true);
      }
    };

    window.addEventListener('openEntity', handleOpenEntity as EventListener);
    return () => {
      window.removeEventListener('openEntity', handleOpenEntity as EventListener);
    };
  }, []);

  const loadProducts = async () => {
    setLoading(true);
    try {
      const storage = JSON.parse(localStorage.getItem("storage") || "{}");
      let tenantID = storage?.tenantID || 0;
      if (tenantID === 0 && process.env.NODE_ENV === "development") {
        tenantID = 1;
      }

      const [fromOrders, fromMaster] = await Promise.all([
        ProductMasterService.GetProductsFromOrders({ tenantid: tenantID }),
        ProductMasterService.GetProductMasterList({ tenantid: tenantID }),
      ]);
      const orderList = Array.isArray(fromOrders) ? fromOrders : [];
      const masterList = Array.isArray(fromMaster) ? fromMaster : [];
      const orderPartNos = new Set(
        orderList.map((p) => (p.partNo || "").toLowerCase())
      );
      const masterOnly = masterList.filter(
        (p) => !orderPartNos.has((p.partNo || "").toLowerCase())
      );
      setProducts([...orderList, ...masterOnly]);
    } catch (error: any) {
      console.error("[ProductMaster] Error loading products:", error);
      toast.error(`Error loading products: ${error.message || "Unknown error"}`);
      setProducts([]);
    } finally {
      setLoading(false);
    }
  };

  const handleRowClick = (product: ProductMaster) => {
    setSelectedPartNo(product.partNo);
    setShowSlideout(true);
  };

  const handleCloseSlideout = () => {
    setShowSlideout(false);
    loadProducts();
  };

  const handleSyncFromOrders = async () => {
    setSyncing(true);
    try {
      const result = await ProductMasterService.SyncFromOrders();
      if (result) {
        toast.success(
          result.added > 0
            ? result.message
            : "Product Master is already in sync with orders."
        );
      }
      loadProducts();
    } catch (error: any) {
      toast.error(`Sync failed: ${error.message || "Unknown error"}`);
    } finally {
      setSyncing(false);
    }
  };

  const handleSort = (column: keyof ProductMaster) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  const filteredProducts = products.filter((product) => {
    const matchesSearch =
      product.partNo?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.partName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.unit?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSearch;
  });

  const sortedProducts = [...filteredProducts].sort((a, b) => {
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

  const getSortIcon = (column: keyof ProductMaster) => {
    if (sortColumn !== column) {
      return <span className="sort-icon inactive">⇅</span>;
    }
    return sortDirection === "asc" ? (
      <span className="sort-icon active">↑</span>
    ) : (
      <span className="sort-icon active">↓</span>
    );
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return "";
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
      return dateString;
    }
  };

  const renderCell = (product: ProductMaster, key: string): React.ReactNode => {
    switch (key) {
      case "partNo":
        return product.partNo || "";
      case "partName":
        return product.partName || "";
      case "unit":
        return product.unit || "";
      case "totalQtyOrdered":
        return product.totalQtyOrdered.toLocaleString();
      case "avgUnitPrice":
        return formatCurrency(product.avgUnitPrice);
      case "orderCount":
        return <span className="badge badge-info">{product.orderCount}</span>;
      case "quotationCount":
        return <span className="badge badge-secondary">{product.quotationCount}</span>;
      case "lastOrderDate":
        return formatDate(product.lastOrderDate);
      default:
        return "";
    }
  };

  if (loading) {
    return (
      <div className="page-loading">
        <div className="loading-spinner"></div>
        <p>Loading products...</p>
      </div>
    );
  }

  return (
    <div className="customers-page">
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Product Master</h1>
          <p className="page-subtitle">All parts from customer orders</p>
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
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSyncFromOrders}
            disabled={syncing}
            title="Add distinct parts from orders and quotations into the Product Master table (for Inventory and other modules)"
          >
            {syncing ? "Syncing…" : "Sync from orders"}
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
            placeholder="Search by part number, part name, or unit..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
        </div>
      </div>

      {/* Products Table */}
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
                      column.sortKey && handleSort(column.sortKey as keyof ProductMaster)
                    }
                  >
                    <div className="th-content">
                      {column.label}
                      {column.sortKey &&
                        getSortIcon(column.sortKey as keyof ProductMaster)}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedProducts.length === 0 ? (
                <tr>
                  <td colSpan={visibleColumns.length} className="empty-state">
                    <p>No products found</p>
                    <small>Products will appear here once customer orders are created</small>
                  </td>
                </tr>
              ) : (
                sortedProducts.map((product, index) => (
                  <tr key={`${product.partNo}-${index}`} onClick={() => handleRowClick(product)}>
                    {visibleColumns.map((column) => (
                      <td key={column.key}>{renderCell(product, column.key)}</td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showSlideout && (
        <ProductMasterSlideout
          partNo={selectedPartNo}
          onClose={handleCloseSlideout}
        />
      )}
    </div>
  );
};

export default ProductMasterComponent;

