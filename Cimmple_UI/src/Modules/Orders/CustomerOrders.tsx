import React, { useState, useEffect } from "react";
import { useLocation, useHistory } from "react-router-dom";
import { toast } from "react-toastify";
import { OrderService, OrderMaster } from "../../Common/Services/OrderService";
import { useSiteListFilter } from "../../Common/Hooks/useSiteListFilter";
import CustomerOrderSlideout from "./CustomerOrderSlideout";
import MasterListPage from "../../Common/Components/MasterListPage/MasterListPage";
import "./CustomerOrders.scss";

const CustomerOrders: React.FC = () => {
  const location = useLocation();
  const history = useHistory();
  const { locationIdParam, masterListFilter } = useSiteListFilter();
  const [orders, setOrders] = useState<OrderMaster[]>([]);
  const [showSlideout, setShowSlideout] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    loadOrders();
  }, [locationIdParam]);

  // Handle URL parameter to open slideout (from global search)
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const openId = params.get('open');
    if (openId) {
      const id = parseInt(openId, 10);
      if (!isNaN(id) && id > 0) {
        setSelectedOrderId(id);
        setShowSlideout(true);
        // Clean up URL
        history.replace(location.pathname);
      }
    }
  }, [location.search, history, location.pathname]);

  // Listen for custom event from global search
  useEffect(() => {
    const handleOpenEntity = (event: CustomEvent) => {
      if (event.detail.type === 'order') {
        setSelectedOrderId(event.detail.id);
        setShowSlideout(true);
      }
    };

    window.addEventListener('openEntity', handleOpenEntity as EventListener);
    return () => {
      window.removeEventListener('openEntity', handleOpenEntity as EventListener);
    };
  }, []);

  const loadOrders = async () => {
    setLoading(true);
    try {
      const storage = JSON.parse(localStorage.getItem("storage") || "{}");
      const tenantID = storage?.tenantID || 0;
      const result = await OrderService.GetOrders({
        tenantid: tenantID,
        locationId: locationIdParam,
      });
      
      if (result && Array.isArray(result)) {
        setOrders(result);
      } else {
        setOrders([]);
      }
    } catch (error: any) {
      console.error("[CustomerOrders] Error loading orders:", error);
      toast.error(`Error loading orders: ${error.message || "Unknown error"}`);
      setOrders([]);
    } finally {
      setLoading(false);
    }
  };

  const handleRowClick = (row: Record<string, any>) => {
    const order = row as OrderMaster;
    setSelectedOrderId(order.orderID);
    setShowSlideout(true);
  };

  const handleAddOrder = () => {
    setSelectedOrderId(0);
    setShowSlideout(true);
  };

  const handleCloseSlideout = () => {
    setShowSlideout(false);
    setSelectedOrderId(0);
    loadOrders();
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
      return <span className="badge badge-secondary">-</span>;
    }
    const statusLower = status.toLowerCase().trim();
    
    if (statusLower === "draft") {
      return <span className="badge badge-warning">Draft</span>;
    } else if (statusLower === "in progress" || statusLower === "in-progress") {
      return <span className="badge badge-primary">In Progress</span>;
    } else if (statusLower === "partially shipped" || statusLower === "partially-shipped") {
      return <span className="badge badge-primary">Partially Shipped</span>;
    } else if (statusLower === "shipped") {
      return <span className="badge badge-success">Shipped</span>;
    } else if (statusLower === "completed") {
      return <span className="badge badge-success">Completed</span>;
    } else if (statusLower === "cancelled" || statusLower === "canceled") {
      return <span className="badge badge-danger">Cancelled</span>;
    }
    
    // Fallback for any other status
    return <span className="badge badge-secondary">{status}</span>;
  };

  const formatOrderNumber = (number: number): string => {
    // If number is less than 1000, add 999 to it (for existing orders)
    const displayNumber = number < 1000 ? number + 999 : number;
    return `CO#${displayNumber}`;
  };

  const columns = [
    {
      key: "orderNumber",
      label: "Order #",
      sortable: true,
      render: (value: any) => formatOrderNumber(value),
    },
    {
      key: "customerName",
      label: "Customer",
      sortable: true,
    },
    {
      key: "quotationNo",
      label: "Quotation #",
      sortable: true,
      render: (value: any) => value || "-",
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
      render: (value: any) => getStatusBadge(value),
    },
  ];

  const filteredOrders = orders.filter((order) => {
    if (statusFilter !== "all" && order.status !== statusFilter) {
      return false;
    }
    return true;
  });

  return (
    <div className="customer-orders">
      <MasterListPage
        title="Customer Orders"
        columns={columns}
        data={filteredOrders}
        loading={loading}
        onAdd={handleAddOrder}
        onRowClick={handleRowClick}
        filters={[
          masterListFilter,
          {
            label: "Status",
            options: [
              { value: "all", label: "All" },
              { value: "Draft", label: "Draft" },
              { value: "In Progress", label: "In Progress" },
              { value: "Partially Shipped", label: "Partially Shipped" },
              { value: "Shipped", label: "Shipped" },
              { value: "Partially Invoiced", label: "Partially Invoiced" },
              { value: "Fully Invoiced", label: "Fully Invoiced" },
              { value: "Completed", label: "Completed" },
              { value: "Cancelled", label: "Cancelled" },
            ],
            value: statusFilter,
            onChange: setStatusFilter,
          },
        ]}
        searchPlaceholder="Search orders..."
        getRowId={(row) => (row as OrderMaster).orderID}
      />

      {showSlideout && (
        <CustomerOrderSlideout
          orderId={selectedOrderId}
          onClose={handleCloseSlideout}
        />
      )}
    </div>
  );
};

export default CustomerOrders;

