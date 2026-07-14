import React, { useState, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { toast } from "react-toastify";
import { VendorOrderService, VendorOrderMaster } from "../../Common/Services/VendorOrderService";
import VendorOrderSlideout from "./VendorOrderSlideout";
import MasterListPage from "../../Common/Components/MasterListPage/MasterListPage";

const VendorOrders: React.FC = () => {
  const location = useLocation();
  const processedOrderIdRef = useRef<string | null>(null);
  const [orders, setOrders] = useState<VendorOrderMaster[]>([]);
  const [showSlideout, setShowSlideout] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    loadOrders();
  }, []);

  // Check for orderId or open in URL parameters and open slideout
  useEffect(() => {
    const urlParams = new URLSearchParams(location.search);
    const orderIdParam = urlParams.get('orderId') || urlParams.get('open');

    if (orderIdParam && orderIdParam !== processedOrderIdRef.current) {
      const orderId = parseInt(orderIdParam, 10);
      if (orderId > 0) {
        console.log(`[VendorOrders] Opening order ${orderId} from URL parameter`);
        processedOrderIdRef.current = orderIdParam;
        setSelectedOrderId(orderId);
        setShowSlideout(true);
        // Clean up URL
        const history = require('react-router-dom').useHistory();
        history.replace(location.pathname);
      }
    }
  }, [location.search]);

  const loadOrders = async () => {
    setLoading(true);
    try {
      const storage = JSON.parse(localStorage.getItem("storage") || "{}");
      const tenantID = storage?.tenantID || 0;
      const result = await VendorOrderService.GetVendorOrders({ tenantid: tenantID });

      if (result && Array.isArray(result)) {
        // Debug: Log all orders to check data structure, especially quotationNo
        console.log("[VendorOrders] All orders loaded:", result.map(o => ({
          orderID: o.orderID,
          orderNumber: o.orderNumber,
          quotationId: o.quotationId,
          quotationNo: o.quotationNo
        })));
        // Log orders with quotationNo to verify data
        const ordersWithQuotation = result.filter((o: any) => o.quotationNo);
        if (ordersWithQuotation.length > 0) {
          console.log("[VendorOrders] Orders with QuotationNo:", ordersWithQuotation);
        } else {
          console.log("[VendorOrders] No orders have QuotationNo set");
        }
        setOrders(result);
      } else {
        setOrders([]);
      }
    } catch (error: any) {
      console.error("[VendorOrders] Error loading orders:", error);
      toast.error(`Error loading orders: ${error.message || "Unknown error"}`);
      setOrders([]);
    } finally {
      setLoading(false);
    }
  };

  const handleRowClick = (row: Record<string, any>) => {
    const order = row as VendorOrderMaster;
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
    processedOrderIdRef.current = null; // Reset so we can process new orderIds

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
    } else if (statusLower === "sent") {
      return <span className="badge badge-primary">Sent</span>;
    } else if (statusLower === "receiving") {
      return <span className="badge badge-info">Receiving</span>;
    } else if (statusLower === "completed") {
      return <span className="badge badge-success">Completed</span>;
    } else if (statusLower === "cancelled") {
      return <span className="badge badge-danger">Cancelled</span>;
    }

    return <span className="badge badge-secondary">{status}</span>;
  };

  const formatOrderNumber = (number: number): string => {
    const displayNumber = number < 1000 ? number + 999 : number;
    return `VO#${displayNumber}`;
  };

  const getOrderTypeBadge = (type: string) => {
    if (!type || (typeof type === 'string' && type.trim() === "")) {
      return <span style={{ color: "#9ca3af" }}>-</span>;
    }
    const typeLower = typeof type === 'string' ? type.toLowerCase().trim() : String(type).toLowerCase().trim();
    
    if (typeLower === "material") {
      return (
        <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
          <span>📦</span>
          <span>Material</span>
        </span>
      );
    } else if (typeLower === "service") {
      return (
        <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
          <span>🔧</span>
          <span>Service</span>
        </span>
      );
    }
    
    return <span>{type}</span>;
  };

  const columns = [
    {
      key: "orderNumber",
      label: "Order #",
      sortable: true,
      align: "left" as const,
      render: (value: any) => formatOrderNumber(value),
    },
    {
      key: "vendorName",
      label: "Vendor",
      sortable: true,
      align: "left" as const,
    },
    {
      key: "quotationNo",
      label: "Quotation #",
      sortable: true,
      align: "left" as const,
      render: (value: any, row: any) => {
        // Get quotationNo from value (column key) or row object
        const quotationNo = value !== undefined && value !== null ? value : (row?.quotationNo !== undefined && row?.quotationNo !== null ? row.quotationNo : "");
        
        // Debug log for troubleshooting
        if (row?.orderID === 1000 || row?.orderNumber === 1000) {
          console.log("[VendorOrders] Quotation # debug for order:", {
            orderID: row?.orderID,
            orderNumber: row?.orderNumber,
            value,
            rowQuotationNo: row?.quotationNo,
            finalQuotationNo: quotationNo
          });
        }
        
        // Check if quotationNo is a non-empty string
        if (quotationNo && typeof quotationNo === 'string' && quotationNo.trim() !== "") {
          return <span style={{ color: "#6366f1", fontWeight: 500 }}>{quotationNo}</span>;
        }
        return <span style={{ color: "#9ca3af" }}>-</span>;
      },
    },
    {
      key: "materialType",
      label: "Order Type",
      sortable: true,
      align: "center" as const,
      render: (value: any, row: any) => {
        // Try to get materialType from value or row
        const orderType = value || row?.materialType || "";
        return getOrderTypeBadge(orderType);
      },
    },
    {
      key: "orderDate",
      label: "Date",
      sortable: true,
      align: "left" as const,
      render: (value: any) => formatDate(value),
    },
    {
      key: "totalAmount",
      label: "Total Amount",
      sortable: true,
      align: "right" as const,
      render: (value: any) => formatCurrency(value),
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      align: "center" as const,
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
    <div className="vendor-orders">
      <MasterListPage
        title="Vendor Orders"
        columns={columns}
        data={filteredOrders}
        loading={loading}
        onAdd={handleAddOrder}
        onRowClick={handleRowClick}
        filters={[
          {
            label: "Status",
            options: [
              { value: "all", label: "All" },
              { value: "Draft", label: "Draft" },
              { value: "Sent", label: "Sent" },
              { value: "Receiving", label: "Receiving" },
              { value: "Completed", label: "Completed" },
              { value: "Cancelled", label: "Cancelled" },
            ],
            value: statusFilter,
            onChange: setStatusFilter,
          },
        ]}
        searchPlaceholder="Search orders..."
        getRowId={(row) => (row as VendorOrderMaster).orderID}
      />

      {showSlideout && (
        <VendorOrderSlideout
          orderId={selectedOrderId}
          onClose={handleCloseSlideout}
        />
      )}
    </div>
  );
};

export default VendorOrders;
