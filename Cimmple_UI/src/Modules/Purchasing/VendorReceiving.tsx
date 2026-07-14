import React, { useState, useEffect } from "react";
import { useLocation, useHistory } from "react-router-dom";
import { toast } from "react-toastify";
import { VendorReceivingService, OrderForReceiving } from "../../Common/Services/VendorReceivingService";
import VendorReceivingDetail from "./VendorReceivingDetail";
import MasterListPage from "../../Common/Components/MasterListPage/MasterListPage";

const VendorReceiving: React.FC = () => {
  const location = useLocation();
  const history = useHistory();
  const [orders, setOrders] = useState<OrderForReceiving[]>([]);
  const [showDetail, setShowDetail] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<number>(0);
  const [loading, setLoading] = useState(false);

  // Handle URL parameter to open detail (from global search)
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const openId = params.get('open');
    if (openId) {
      const id = parseInt(openId, 10);
      if (!isNaN(id) && id > 0) {
        setSelectedOrderId(id);
        setShowDetail(true);
        history.replace(location.pathname);
      }
    }
  }, [location.search, history, location.pathname]);

  useEffect(() => {
    loadOrders();
  }, []);

  const loadOrders = async () => {
    setLoading(true);
    try {
      const result = await VendorReceivingService.GetOrdersForReceiving();

      if (result && Array.isArray(result)) {
        setOrders(result);
      } else {
        setOrders([]);
      }
    } catch (error: any) {
      console.error("[VendorReceiving] Error loading orders:", error);
      toast.error(`Error loading orders: ${error.message || "Unknown error"}`);
      setOrders([]);
    } finally {
      setLoading(false);
    }
  };

  const handleRowClick = (row: Record<string, any>) => {
    const order = row as OrderForReceiving;
    setSelectedOrderId(order.orderID);
    setShowDetail(true);
  };

  const handleCloseDetail = () => {
    setShowDetail(false);
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

  const formatOrderNumber = (number: number): string => {
    const displayNumber = number < 1000 ? number + 999 : number;
    return `VO#${displayNumber}`;
  };

  const getStatusBadge = (status: string) => {
    if (!status || status.trim() === "") {
      return <span className="badge badge-secondary">-</span>;
    }
    const statusLower = status.toLowerCase().trim();

    if (statusLower === "sent") {
      return <span className="badge badge-primary">Sent</span>;
    } else if (statusLower === "partially received") {
      return <span className="badge badge-info">Partially Received</span>;
    } else if (statusLower === "fully received") {
      return <span className="badge badge-success">Fully Received</span>;
    }

    return <span className="badge badge-secondary">{status}</span>;
  };

  const columns = [
    {
      key: "orderNumber",
      label: "Vendor Order #",
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
      key: "orderDate",
      label: "Order Date",
      sortable: true,
      align: "left" as const,
      render: (value: any) => formatDate(value),
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      align: "left" as const,
      render: (value: any) => getStatusBadge(value),
    },
    {
      key: "totalItems",
      label: "Total Items",
      sortable: true,
      align: "right" as const,
    },
    {
      key: "totalOrdered",
      label: "Qty Ordered",
      sortable: true,
      align: "right" as const,
    },
    {
      key: "totalReceived",
      label: "Qty Received",
      sortable: true,
      align: "right" as const,
    },
    {
      key: "totalPending",
      label: "Qty Pending",
      sortable: true,
      align: "right" as const,
      render: (value: any) => (
        <span style={{ fontWeight: value > 0 ? "bold" : "normal", color: value > 0 ? "#dc3545" : "inherit" }}>
          {value}
        </span>
      ),
    },
  ];

  return (
    <>
      <MasterListPage
        title="Vendor Receiving"
        data={orders}
        columns={columns}
        onRowClick={handleRowClick}
        loading={loading}
        searchPlaceholder="Search by PO #, vendor..."
        searchFields={["orderNumber", "vendorName", "vendorCode"]}
      />
      {showDetail && (
        <VendorReceivingDetail
          orderId={selectedOrderId}
          onClose={handleCloseDetail}
        />
      )}
    </>
  );
};

export default VendorReceiving;

