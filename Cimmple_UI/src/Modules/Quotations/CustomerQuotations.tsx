import React, { useState, useEffect } from "react";
import { useLocation, useHistory } from "react-router-dom";
import { toast } from "react-toastify";
import { QuotationService, QuotationMaster } from "../../Common/Services/QuotationService";
import CustomerQuotationSlideout from "./CustomerQuotationSlideout";
import CustomerOrderSlideout from "../Orders/CustomerOrderSlideout";
import MasterListPage from "../../Common/Components/MasterListPage/MasterListPage";
import "./CustomerQuotations.scss";

const CustomerQuotations: React.FC = () => {
  const location = useLocation();
  const history = useHistory();
  const [quotations, setQuotations] = useState<QuotationMaster[]>([]);
  const [showSlideout, setShowSlideout] = useState(false);
  const [selectedQuotationId, setSelectedQuotationId] = useState<number>(0);
  const [showOrderSlideout, setShowOrderSlideout] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    loadQuotations();
  }, []);

  // Handle URL parameter to open slideout (from global search)
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const openId = params.get('open');
    if (openId) {
      const id = parseInt(openId, 10);
      if (!isNaN(id) && id > 0) {
        setSelectedQuotationId(id);
        setShowSlideout(true);
        // Clean up URL
        history.replace(location.pathname);
      }
    }
  }, [location.search, history, location.pathname]);

  // Listen for custom event from global search
  useEffect(() => {
    const handleOpenEntity = (event: CustomEvent) => {
      if (event.detail.type === 'quotation') {
        setSelectedQuotationId(event.detail.id);
        setShowSlideout(true);
      }
    };

    window.addEventListener('openEntity', handleOpenEntity as EventListener);
    return () => {
      window.removeEventListener('openEntity', handleOpenEntity as EventListener);
    };
  }, []);

  const loadQuotations = async () => {
    setLoading(true);
    try {
      const storage = JSON.parse(localStorage.getItem("storage") || "{}");
      const tenantID = storage?.tenantID || 0;
      const result = await QuotationService.GetQuotations({ tenantid: tenantID });
      
      if (result && Array.isArray(result)) {
        // Debug: Log status values and convertedOrderId to check what's being received
        console.log("[CustomerQuotations] Loaded quotations:", result.map(q => ({ 
          id: q.orderID, 
          status: q.status, 
          convertedOrderId: q.convertedOrderId 
        })));
        setQuotations(result);
      } else {
        setQuotations([]);
      }
    } catch (error: any) {
      console.error("[CustomerQuotations] Error loading quotations:", error);
      toast.error(`Error loading quotations: ${error.message || "Unknown error"}`);
      setQuotations([]);
    } finally {
      setLoading(false);
    }
  };

  const handleRowClick = (row: Record<string, any>) => {
    const quotation = row as QuotationMaster;
    setSelectedQuotationId(quotation.orderID);
    setShowSlideout(true);
  };

  const handleAddQuotation = () => {
    setSelectedQuotationId(0);
    setShowSlideout(true);
  };

  const handleCloseSlideout = () => {
    setShowSlideout(false);
    setSelectedQuotationId(0);
    loadQuotations();
  };

  const formatDate = (dateStr: string): string => {
    if (!dateStr) return "";
    try {
      const date = new Date(dateStr);
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      const year = String(date.getFullYear());
      return `${month}/${day}/${year}`;
    } catch {
      return dateStr;
    }
  };

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const getStatusBadge = (status: string) => {
    if (!status || status.trim() === "") {
      console.log("[getStatusBadge] Empty status, returning default");
      return <span className="badge badge-secondary">-</span>;
    }
    const statusLower = status.toLowerCase().trim();
    console.log("[getStatusBadge] Processing status:", { original: status, lower: statusLower });
    
    // Handle "Converted" status (including potential typos like "Convrted")
    if (statusLower === "converted" || statusLower === "convrted" || statusLower.includes("convert")) {
      console.log("[getStatusBadge] Matched Converted, returning badge-primary");
      return <span className="badge badge-primary">Converted</span>;
    }
    
    if (statusLower === "draft") {
      return <span className="badge badge-warning">Draft</span>;
    } else if (statusLower === "sent" || statusLower === "active") {
      return <span className="badge badge-success">Sent</span>;
    } else if (statusLower === "accepted") {
      return <span className="badge badge-info">Accepted</span>;
    } else if (statusLower === "rejected" || statusLower === "cancelled") {
      return <span className="badge badge-danger">Rejected</span>;
    }
    
    // Fallback: show the actual status value
    console.log("[getStatusBadge] No match, returning fallback with status:", status);
    return <span className="badge badge-secondary">{status}</span>;
  };

  const formatQuotationNumber = (number: number): string => {
    // If number is less than 1000, add 999 to it (for existing quotations)
    // This ensures existing quotations (1, 2, etc.) display as CQ#1000, CQ#1001, etc.
    const displayNumber = number < 1000 ? number + 999 : number;
    return `CQ#${displayNumber}`;
  };

  const columns = [
    {
      key: "quotationNumber",
      label: "Quotation #",
      sortable: true,
      render: (value: any) => formatQuotationNumber(value),
    },
    {
      key: "customerName",
      label: "Customer",
      sortable: true,
    },
    {
      key: "customerRefNo",
      label: "Customer Ref #",
      sortable: true,
    },
    {
      key: "orderDate",
      label: "Date",
      sortable: true,
      render: (value: any) => formatDate(value),
    },
    {
      key: "totalAmount",
      label: "Total Amount",
      sortable: true,
      render: (value: any) => formatCurrency(value),
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      render: (value: any, row: any) => {
        // Debug: Log the status value being rendered
        if (value && value.toLowerCase().includes("convert")) {
          console.log("[CustomerQuotations] Rendering status:", { value, rowId: row?.orderID, fullRow: row });
        }
        return getStatusBadge(value);
      },
    },
    {
      key: "convertedOrderNumber",
      label: "Order #",
      sortable: false,
      render: (value: any, row: any) => {
        if (row.convertedOrderId) {
          const orderNum = row.convertedOrderId < 1000 ? row.convertedOrderId + 999 : row.convertedOrderId;
          return (
            <span
              style={{
                color: "#10b981",
                fontWeight: 500,
                cursor: "pointer",
                textDecoration: "underline",
              }}
              onClick={(e) => {
                e.stopPropagation(); // Prevent row click
                setSelectedOrderId(row.convertedOrderId);
                setShowOrderSlideout(true);
              }}
              title="Click to view order"
            >
              CO#{orderNum}
            </span>
          );
        }
        return <span style={{ color: "#9ca3af" }}>-</span>;
      },
    },
  ];

  const filteredQuotations = quotations.filter((quotation) => {
    if (statusFilter !== "all" && quotation.status !== statusFilter) {
      return false;
    }
    return true;
  });

  return (
    <div className="customer-quotations">
      <MasterListPage
        title="Customer Quotations"
        columns={columns}
        data={filteredQuotations}
        loading={loading}
        onAdd={handleAddQuotation}
        onRowClick={handleRowClick}
        filters={[
          {
            label: "Status",
            options: [
              { value: "all", label: "All" },
              { value: "Draft", label: "Draft" },
              { value: "Sent", label: "Sent" },
              { value: "Accepted", label: "Accepted" },
              { value: "Rejected", label: "Rejected" },
              { value: "Converted", label: "Converted" },
            ],
            value: statusFilter,
            onChange: setStatusFilter,
          },
        ]}
        searchPlaceholder="Search quotations..."
        getRowId={(row) => (row as QuotationMaster).orderID}
      />

      {showSlideout && (
        <CustomerQuotationSlideout
          quotationId={selectedQuotationId}
          onClose={handleCloseSlideout}
        />
      )}

      {showOrderSlideout && (
        <CustomerOrderSlideout
          orderId={selectedOrderId}
          onClose={() => {
            setShowOrderSlideout(false);
            setSelectedOrderId(0);
          }}
        />
      )}
    </div>
  );
};

export default CustomerQuotations;

